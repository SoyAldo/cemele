import { ipcMain, BrowserWindow, dialog, shell } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';

import { loadConfig, ServerConfig } from './config/server-config';
import { installJava, isJavaInstalled, getJavaPath } from './java/java-downloader';
import {
  getGameDir,
  getLibrariesDir,
  getAssetsDir,
  installMinecraft,
  installNeoForge,
  downloadMods,
  isMinecraftInstalled,
  getVersionsDir
} from './minecraft/minecraft-installer';

let currentSession: any = null;
let serverConfig: ServerConfig = loadConfig();

export function registerIpcHandlers(mainWindow: BrowserWindow) {
  
  ipcMain.handle('get-server-config', () => serverConfig);
  
  ipcMain.handle('set-server-config', async (_, config: ServerConfig) => {
    serverConfig = config;
    const configDir = path.join(os.homedir(), 'AppData', 'Roaming', '.cemele-launcher');
    await fs.ensureDir(configDir);
    await fs.writeJson(path.join(configDir, 'server-config.json'), config);
    return true;
  });

  ipcMain.handle('check-installation', async () => {
    try {
      const gameDir = getGameDir();
      const hasJava = await isJavaInstalled(gameDir);
      const hasMinecraft = await isMinecraftInstalled(serverConfig);
      const modsDir = path.join(gameDir, 'mods');
      const hasMods = await fs.pathExists(modsDir) && (await fs.readdir(modsDir)).length > 0;
      
      return {
        installed: hasJava && hasMinecraft,
        hasJava,
        hasMinecraft,
        hasMods,
        gameDir
      };
    } catch (error: any) {
      return { installed: false, error: error.message };
    }
  });

  ipcMain.handle('install-modpack', async () => {
    const gameDir = getGameDir();
    
    try {
      // 1. Java
      if (!await isJavaInstalled(gameDir)) {
        await installJava(gameDir, serverConfig, (pct, msg) => {
          mainWindow.webContents.send('install-progress', {
            stage: 'java',
            percentage: Math.round(pct * 0.25),
            message: msg
          });
        });
      }
      
      // 2. Minecraft Vanilla
      await installMinecraft(serverConfig, (pct, msg) => {
        mainWindow.webContents.send('install-progress', {
          stage: 'minecraft',
          percentage: 25 + Math.round((pct - 20) * 0.35),
          message: msg
        });
      });
      
      // 3. NEOFORGE (cambiado de Forge)
      await installNeoForge(serverConfig, (pct, msg) => {
        mainWindow.webContents.send('install-progress', {
          stage: 'neoforge',    // ← Cambiado
          percentage: 60 + Math.round((pct - 60) * 0.25),
          message: msg
        });
      });
      
      // 4. Mods
      await downloadMods(serverConfig, (pct, msg) => {
        mainWindow.webContents.send('install-progress', {
          stage: 'mods',
          percentage: 85 + Math.round((pct - 85) * 0.15),
          message: msg
        });
      });
      
      mainWindow.webContents.send('install-complete', { success: true });
      return { success: true };
    } catch (error: any) {
      mainWindow.webContents.send('install-error', { error: error.message });
      return { success: false, error: error.message };
    }
  });

  // ... resto de handlers (login, launch, etc.) igual ...

  ipcMain.handle('launch-game', async () => {
    if (!currentSession) {
      return { success: false, error: 'No hay sesión activa' };
    }

    try {
      const gameDir = getGameDir();
      const javaPath = getJavaPath(gameDir);
      
      if (!await fs.pathExists(javaPath)) {
        return { success: false, error: 'Java no está instalado' };
      }
      
      // Nombre de versión para NeoForge
      const neoforgeVersionName = `${serverConfig.version}-neoforge-${serverConfig.neoforgeVersion}`;
      const versionJsonPath = path.join(getGameDir(), 'versions', neoforgeVersionName, `${neoforgeVersionName}.json`);
      
      // Si no existe con ese nombre, buscar variantes
      let actualVersionName = neoforgeVersionName;
      if (!await fs.pathExists(versionJsonPath)) {
        const versions = await fs.readdir(getVersionsDir());
        const neoVersion = versions.find(v => 
          v.includes('neoforge') && v.includes(serverConfig.version)
        );
        if (neoVersion) {
          actualVersionName = neoVersion;
        } else {
          return { success: false, error: 'NeoForge no está instalado correctamente' };
        }
      }
      
      const versionJson = await fs.readJson(
        path.join(getVersionsDir(), actualVersionName, `${actualVersionName}.json`)
      );
      
      // Construir classpath
      const librariesDir = getLibrariesDir();
      const classpath: string[] = [];
      
      for (const lib of versionJson.libraries || []) {
        if (lib.downloads?.artifact?.path) {
          const libPath = path.join(librariesDir, lib.downloads.artifact.path);
          if (await fs.pathExists(libPath)) {
            classpath.push(libPath);
          }
        }
      }
      
      const neoForgeJar = path.join(getVersionsDir(), actualVersionName, `${actualVersionName}.jar`);
      classpath.push(neoForgeJar);
      
      const classpathStr = classpath.join(';');
      
      // NeoForge puede usar mainClass diferente
      const mainClass = versionJson.mainClass || 'net.minecraft.client.main.Main';
      // O para NeoForge específico:
      // 'net.neoforged.neoforge.bootstrap.NeoForgeBootstrap'
      // Depende de la versión
      
      const jvmArgs = [
        `-Xms${serverConfig.ramMin}`,
        `-Xmx${serverConfig.ramMax}`,
        '-XX:+UseG1GC',
        '-XX:+ParallelRefProcEnabled',
        '-XX:MaxGCPauseMillis=200',
        `-Djava.library.path=${path.join(gameDir, 'versions', actualVersionName, 'natives')}`,
        '-cp', classpathStr,
        mainClass
      ];
      
      const gameArgs = [
        '--username', currentSession.username,
        '--version', actualVersionName,
        '--gameDir', gameDir,
        '--assetsDir', getAssetsDir(),
        '--assetIndex', serverConfig.version,
        '--uuid', currentSession.uuid,
        '--accessToken', currentSession.accessToken,
        '--userType', 'msa',
        '--versionType', 'release',
        '--width', '1280',
        '--height', '720'
      ];
      
      const mcProcess = spawn(javaPath, [...jvmArgs, ...gameArgs], {
        cwd: gameDir,
        detached: false,
        stdio: 'pipe'
      });
      
      mcProcess.stdout.on('data', (data) => console.log(`[MC] ${data}`));
      mcProcess.stderr.on('data', (data) => console.error(`[MC] ${data}`));
      mcProcess.on('close', (code) => console.log(`Minecraft cerrado: ${code}`));
      
      mainWindow.minimize();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // ========== CONTROL DE VENTANA ==========
  
  ipcMain.handle('minimize-window', () => {
    console.log('Minimizing window');  // Debug
    mainWindow.minimize();
  });

  ipcMain.handle('close-window', () => {
    console.log('Closing window');  // Debug
    mainWindow.close();
  });
}