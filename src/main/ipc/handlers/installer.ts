import { IpcMainInvokeEvent, BrowserWindow } from 'electron';
import fs from 'fs-extra';
import path from 'path';

import { log } from '../../utils/logger';
import { appState } from '../../stateManager';

import { isJavaInstalled, installJava } from '../../java/java-downloader';
import {
  getGameDir,
  isMinecraftInstalled,
  installMinecraft,
  installForge,
  downloadMods,
  downloadConfigs
} from '../../minecraft/minecraft-installer';

/**
 * Verifica si el juego, Java, los mods y las configuraciones ya están instalados.
 */
export async function handleCheckInstallation(_event: IpcMainInvokeEvent) {
  log.info('check', 'Verificando instalación...');
  
  try {
    const serverConfig = appState.get('serverConfig');
    const gameDir = getGameDir();
    
    const hasJava = await isJavaInstalled(gameDir);
    const hasMinecraft = await isMinecraftInstalled(serverConfig);
    
    const modsDir = path.join(gameDir, 'mods');
    const hasMods = await fs.pathExists(modsDir) && (await fs.readdir(modsDir)).length > 0;

    const configDir = path.join(gameDir, 'config');
    const hasConfigs = await fs.pathExists(configDir) && (await fs.readdir(configDir)).length > 0;
    
    log.info('check', `Java: ${hasJava} | Minecraft: ${hasMinecraft} | Mods: ${hasMods} | Configs: ${hasConfigs}`);
    
    return {
      // Requerimos que las configs también existan para dar el OK final
      installed: hasJava && hasMinecraft && hasMods && hasConfigs,
      hasJava,
      hasMinecraft,
      hasMods,
      hasConfigs,
      gameDir
    };
  } catch (error: any) {
    log.error('check', 'Error verificando instalación', error);
    return { installed: false, error: error.message };
  }
}

/**
 * Orquesta toda la instalación del modpack.
 * Nota: Recibe `mainWindow` para poder enviarle los eventos de progreso.
 */
export async function handleInstallModpack(mainWindow: BrowserWindow) {
  const serverConfig = appState.get('serverConfig');
  const gameDir = getGameDir();
  
  log.stage('INSTALACIÓN DEL MODPACK');
  log.info('install', `gameDir: ${gameDir}`);
  
  try {
    // 1. Java (0% al 20%)
    if (!await isJavaInstalled(gameDir)) {
      log.stage('Instalando Java');
      await installJava(gameDir, serverConfig, (pct, msg) => {
        log.info('java', `[${pct}%] ${msg}`);
        mainWindow.webContents.send('install-progress', {
          stage: 'java',
          percentage: Math.round(pct * 0.20),
          message: msg
        });
      });
    } else {
      log.info('java', 'Java ya está instalado, saltando.');
    }
    
    // 2. Minecraft Vanilla (20% al 45%)
    log.stage('Instalando Minecraft vanilla');
    await installMinecraft(serverConfig, (pct, msg) => {
      log.info('minecraft', `[${pct}%] ${msg}`);
      mainWindow.webContents.send('install-progress', {
        stage: 'minecraft',
        percentage: 20 + Math.round(pct * 0.25),
        message: msg
      });
    });
    
    // 3. Forge (45% al 65%)
    if (!await isMinecraftInstalled(serverConfig)) {
      log.stage('Instalando Forge');
      await installForge(serverConfig, (pct, msg) => {
        log.info('forge', `[${pct}%] ${msg}`);
        mainWindow.webContents.send('install-progress', {
          stage: 'forge',
          percentage: 45 + Math.round(pct * 0.20),
          message: msg
        });
      });
    } else {
      log.info('forge', 'Forge ya está instalado, saltando.');
      mainWindow.webContents.send('install-progress', {
        stage: 'forge',
        percentage: 65,
        message: 'Forge comprobado'
      });
    }
    
    // 4. Mods (65% al 85%)
    log.stage('Descargando mods');
    await downloadMods(serverConfig, (pct, msg) => {
      log.info('mods', `[${pct}%] ${msg}`);
      mainWindow.webContents.send('install-progress', {
        stage: 'mods',
        percentage: 65 + Math.round(pct * 0.20),
        message: msg
      });
    });
    
    // 5. Configuraciones (85% al 100%)
    log.stage('Descargando configuraciones');
    await downloadConfigs(serverConfig, (pct, msg) => {
      log.info('configs', `[${pct}%] ${msg}`);
      mainWindow.webContents.send('install-progress', {
        stage: 'configs',
        percentage: 85 + Math.round(pct * 0.15), 
        message: msg
      });
    });

    log.info('install', '✅ Instalación completada exitosamente');
    mainWindow.webContents.send('install-complete', { success: true });
    return { success: true };
    
  } catch (error: any) {
    log.error('install', `❌ Instalación fallida: ${error.message}`, error);
    mainWindow.webContents.send('install-error', { error: error.message });
    return { success: false, error: error.message };
  }
}