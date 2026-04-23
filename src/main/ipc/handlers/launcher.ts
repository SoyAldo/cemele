import { BrowserWindow, shell } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';

import { log } from '../../utils/logger';
import { appState } from '../../stateManager';
import { getJavaPath } from '../../java/java-downloader';
import {
  getGameDir,
  getLibrariesDir,
  getAssetsDir,
  getVersionsDir
} from '../../minecraft/minecraft-installer';

/**
 * Orquesta la preparación de variables, classpath y argumentos para lanzar el proceso de Java.
 */
export async function handleLaunchGame(mainWindow: BrowserWindow) {
  log.stage('Lanzando juego');
  
  const currentSession = appState.get('currentSession');
  const serverConfig = appState.get('serverConfig');

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
            allow = true;
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
}

/**
 * Abre la carpeta de mods en el explorador de archivos.
 */
export async function handleOpenModsFolder() {
  const gameDir = getGameDir();
  const modsDir = path.join(gameDir, 'mods');
  
  if (!await fs.pathExists(modsDir)) {
    await fs.ensureDir(modsDir);
  }
  
  shell.openPath(modsDir);
}