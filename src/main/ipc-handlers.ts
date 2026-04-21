import { ipcMain, BrowserWindow, dialog, shell } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';

import { log, getLogFilePath } from './utils/logger';
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
  
  ipcMain.handle('get-log-path', () => getLogFilePath());

  ipcMain.handle('set-server-config', async (_, config: ServerConfig) => {
    serverConfig = config;
    const configDir = path.join(os.homedir(), 'AppData', 'Roaming', '.cemele-launcher');
    await fs.ensureDir(configDir);
    await fs.writeJson(path.join(configDir, 'server-config.json'), config);
    return true;
  });

  // ========== AUTENTICACIÓN ==========
  
  ipcMain.handle('microsoft-login', async () => {
    log.stage('Autenticación Microsoft');
    try {
      // MOCK temporal para testing
      currentSession = {
        username: 'JugadorTest',
        uuid: '00000000-0000-0000-0000-000000000000',
        accessToken: 'mock_token_' + Date.now()
      };
      log.info('auth', `Login mock exitoso: ${currentSession.username}`);
      return { success: true, session: currentSession };
    } catch (error: any) {
      log.error('auth', 'Login fallido', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-session', async () => {
    return currentSession;
  });
  
  ipcMain.handle('logout', async () => {
    currentSession = null;
    return;
  });

  ipcMain.handle('check-installation', async () => {
    log.info('check', 'Verificando instalación...');
    try {
      const gameDir = getGameDir();
      const hasJava = await isJavaInstalled(gameDir);
      const hasMinecraft = await isMinecraftInstalled(serverConfig);
      const modsDir = path.join(gameDir, 'mods');
      const hasMods = await fs.pathExists(modsDir) && (await fs.readdir(modsDir)).length > 0;
      log.info('check', `Java: ${hasJava} | Minecraft: ${hasMinecraft} | Mods: ${hasMods}`);
      return {
        installed: hasJava && hasMinecraft,
        hasJava,
        hasMinecraft,
        hasMods,
        gameDir
      };
    } catch (error: any) {
      log.error('check', 'Error verificando instalación', error);
      return { installed: false, error: error.message };
    }
  });

  ipcMain.handle('install-modpack', async () => {
    const gameDir = getGameDir();
    log.stage('INSTALACIÓN DEL MODPACK');
    log.info('install', `gameDir: ${gameDir}`);
    log.info('install', `config: ${JSON.stringify(serverConfig)}`);
    
    try {
      // 1. Java
      if (!await isJavaInstalled(gameDir)) {
        log.stage('Instalando Java');
        await installJava(gameDir, serverConfig, (pct, msg) => {
          log.info('java', `[${pct}%] ${msg}`);
          mainWindow.webContents.send('install-progress', {
            stage: 'java',
            percentage: Math.round(pct * 0.25),
            message: msg
          });
        });
      } else {
        log.info('java', 'Java ya está instalado, saltando.');
      }
      
      // 2. Minecraft Vanilla
      log.stage('Instalando Minecraft vanilla');
      await installMinecraft(serverConfig, (pct, msg) => {
        log.info('minecraft', `[${pct}%] ${msg}`);
        mainWindow.webContents.send('install-progress', {
          stage: 'minecraft',
          percentage: 25 + Math.round((pct - 20) * 0.35),
          message: msg
        });
      });
      
      // 3. NeoForge
      log.stage('Instalando NeoForge');
      await installNeoForge(serverConfig, (pct, msg) => {
        log.info('neoforge', `[${pct}%] ${msg}`);
        mainWindow.webContents.send('install-progress', {
          stage: 'neoforge',
          percentage: 60 + Math.round((pct - 60) * 0.25),
          message: msg
        });
      });
      
      // 4. Mods
      log.stage('Descargando mods');
      await downloadMods(serverConfig, (pct, msg) => {
        log.info('mods', `[${pct}%] ${msg}`);
        mainWindow.webContents.send('install-progress', {
          stage: 'mods',
          percentage: 85 + Math.round((pct - 85) * 0.15),
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
  });

  // ... resto de handlers (login, launch, etc.) igual ...

  ipcMain.handle('launch-game', async () => {
    log.stage('Lanzando juego');
    if (!currentSession) {
      log.warn('launch', 'Intento de lanzar sin sesión activa');
      return { success: false, error: 'No hay sesión activa' };
    }
    log.info('launch', `Usuario: ${currentSession.username}`);

    try {
      const gameDir = getGameDir();
      const javaPath = getJavaPath(gameDir);
      
      if (!await fs.pathExists(javaPath)) {
        return { success: false, error: 'Java no está instalado' };
      }
      
      // Nombre de versión para NeoForge
      let actualVersionName: string | undefined;
      const versionsDir = getVersionsDir();
      
      if (await fs.pathExists(versionsDir)) {
          const versions = await fs.readdir(versionsDir);
          actualVersionName = versions.find(v => 
              v.includes('neoforge') && v.includes(serverConfig.neoforgeVersion)
          );
      }
      
      if (!actualVersionName) {
          return { success: false, error: 'NeoForge no está instalado correctamente' };
      }
      
      const versionJsonPath = path.join(versionsDir, actualVersionName, `${actualVersionName}.json`);
      
      const versionJson = await fs.readJson(versionJsonPath);
      
      let baseJson: any = null;
      if (versionJson.inheritsFrom) {
          baseJson = await fs.readJson(
              path.join(getVersionsDir(), versionJson.inheritsFrom, `${versionJson.inheritsFrom}.json`)
          );
      }
      
      const allLibraries = [
          ...(baseJson?.libraries || []),
          ...(versionJson.libraries || [])
      ];

      // Construir classpath
      const librariesDir = getLibrariesDir();
      const uniqueClasspath = new Set<string>();
      const osName = os.platform() === 'win32' ? 'windows' : os.platform() === 'darwin' ? 'osx' : 'linux';

      for (const lib of allLibraries) {
        let allow = true;
        if (lib.rules) {
            const allowRule = lib.rules.find((rule: any) => rule.action === 'allow');
            const disallowRule = lib.rules.find((rule: any) => rule.action === 'disallow');
            
            if (allowRule && allowRule.os && allowRule.os.name !== osName) allow = false;
            if (disallowRule && (!disallowRule.os || disallowRule.os.name === osName)) allow = false;
        }
        
        if (allow && lib.downloads?.artifact?.path) {
          const libPath = path.join(librariesDir, lib.downloads.artifact.path);
          if (await fs.pathExists(libPath)) {
            uniqueClasspath.add(libPath);
          }
        }
      }
      
      // Primero determinamos el mainClass
      const mainClass = versionJson.mainClass || baseJson?.mainClass || 'net.minecraft.client.main.Main';
      
      // Añadir client JAR base al classpath SOLO si no es BootstrapLauncher moderno
      const baseVersion = versionJson.inheritsFrom || actualVersionName;
      const clientJar = path.join(getVersionsDir(), baseVersion, `${baseVersion}.jar`);
      if (await fs.pathExists(clientJar)) {
        // En NeoForge moderno, BootstrapLauncher se encarga de ubicar y cargar el .jar vainilla
        // a través del arg --fml.mcVersion, convirtiéndolo en el módulo "minecraft".
        // Si además lo pasamos en el classpath, Java lo procesará también generando un 
        // segundo módulo (ej. "_1._20._6") causando "ResolutionException: Modules minecraft and _1._20._6 export...".
        if (!mainClass.includes('cpw.mods.bootstraplauncher.BootstrapLauncher')) {
          uniqueClasspath.add(clientJar);
        }
      }
      
      const classpath = Array.from(uniqueClasspath);
      
      // Preparar argumentos
      let jvmArgsRaw: any[] = [];
      let gameArgsRaw: any[] = [];
      
      if (baseJson?.arguments) {
          jvmArgsRaw.push(...(baseJson.arguments.jvm || []));
          gameArgsRaw.push(...(baseJson.arguments.game || []));
      }
      if (versionJson.arguments) {
          jvmArgsRaw.push(...(versionJson.arguments.jvm || []));
          gameArgsRaw.push(...(versionJson.arguments.game || []));
      }
      
      // Si no hay args modernos, usar fallback legacy
      if (jvmArgsRaw.length === 0) {
          jvmArgsRaw = ['-Djava.library.path=${natives_directory}', '-cp', '${classpath}'];
      }
      if (gameArgsRaw.length === 0) {
          gameArgsRaw = ['--username', '${auth_player_name}', '--version', '${version_name}', '--gameDir', '${game_directory}', '--assetsDir', '${assets_root}', '--assetIndex', '${assets_index_name}', '--uuid', '${auth_uuid}', '--accessToken', '${auth_access_token}', '--userType', '${user_type}', '--versionType', '${version_type}'];
      }
      
      function parseArgs(raw: any[]) {
          const res: string[] = [];
          for (const arg of raw) {
              if (typeof arg === 'string') {
                  res.push(arg);
              } else if (arg && arg.value) {
                  let allow = false;
                  if (arg.rules) {
                      for (const rule of arg.rules) {
                          let matchesOs = true;
                          if (rule.os && rule.os.name && rule.os.name !== osName) {
                              matchesOs = false;
                          }
                          
                          let matchesFeatures = true;
                          if (rule.features) {
                              matchesFeatures = true;
                              for (const key of Object.keys(rule.features)) {
                                  // Permitimos únicamente resolución personalizada
                                  if (key === 'has_custom_resolution' && rule.features[key] === true) {
                                      // OK
                                  } else {
                                      matchesFeatures = false;
                                  }
                              }
                          }
                          
                          if (matchesOs && matchesFeatures) {
                              allow = rule.action === 'allow';
                          }
                      }
                  } else {
                      allow = true; // Sin reglas, se autoriza por defecto
                  }
                  
                  if (allow) {
                      if (Array.isArray(arg.value)) res.push(...arg.value);
                      else res.push(arg.value);
                  }
              }
          }
          return res;
      }
      
      const parsedJvm = parseArgs(jvmArgsRaw);
      const parsedGame = parseArgs(gameArgsRaw);
      
      const separator = osName === 'windows' ? ';' : ':';
      const variables: Record<string, string> = {
          '${library_directory}': librariesDir,
          '${version_name}': actualVersionName,
          '${classpath_separator}': separator,
          '${natives_directory}': path.join(gameDir, 'versions', actualVersionName, 'natives'),
          '${launcher_name}': 'cemele',
          '${launcher_version}': '1.0',
          '${classpath}': classpath.join(separator),
          
          '${auth_player_name}': currentSession.username,
          '${game_directory}': gameDir,
          '${assets_root}': getAssetsDir(),
          '${assets_index_name}': versionJson.assetIndex?.id || baseJson?.assetIndex?.id || serverConfig.version,
          '${auth_uuid}': currentSession.uuid,
          '${auth_access_token}': currentSession.accessToken,
          '${clientid}': '0',
          '${auth_xuid}': '0',
          '${user_type}': 'msa',
          '${version_type}': 'release',
          '${resolution_width}': '1280',
          '${resolution_height}': '720'
      };
      
      const replaceVars = (args: string[]) => args.map(a => {
          let str = a;
          for (const [k, v] of Object.entries(variables)) {
              if (str.includes(k)) {
                 str = str.split(k).join(v);
              }
          }
          return str;
      });
      
      const finalJvmArgs = [
          `-Xms${serverConfig.ramMin}`,
          `-Xmx${serverConfig.ramMax}`,
          ...replaceVars(parsedJvm)
      ];
      const finalGameArgs = replaceVars(parsedGame);
      
      const finalArgs = [...finalJvmArgs, mainClass, ...finalGameArgs];
      
      const mcProcess = spawn(javaPath, finalArgs, {
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
    mainWindow.minimize();
  });

  ipcMain.handle('close-window', () => {
    mainWindow.close();
  });
}