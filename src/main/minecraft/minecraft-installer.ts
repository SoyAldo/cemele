import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { spawn } from 'child_process';
import { downloadFile, downloadJson, downloadAndExtract } from '../utils/downloader';
import { ServerConfig } from '../config/server-config';
import { log } from '../utils/logger';

const MOJANG_VERSIONS_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest.json';

// Forge Maven
const FORGE_MAVEN = 'https://maven.minecraftforge.net/net/minecraftforge/forge';

interface VersionManifest {
  latest: { release: string; snapshot: string };
  versions: Array<{ id: string; url: string; type: string }>;
}

interface MojangVersion {
  id: string;
  downloads: {
    client: { url: string; sha1: string };
    server?: { url: string; sha1: string };
  };
  assetIndex?: {
    id: string;
    sha1: string;
    size: number;
    totalSize: number;
    url: string;
  };
  libraries: Array<{
    name: string;
    downloads?: { artifact?: { url: string; path: string } };
    rules?: Array<{ action: string; os?: { name?: string } }>;
  }>;
  mainClass: string;
  arguments?: {
    game?: any[];
    jvm?: any[];
  };
}

export function getGameDir(): string {
  return path.join(os.homedir(), 'AppData', 'Roaming', '.cemele-modpack');
}

export function getAssetsDir(): string {
  return path.join(getGameDir(), 'assets');
}

export function getLibrariesDir(): string {
  return path.join(getGameDir(), 'libraries');
}

export function getVersionsDir(): string {
  return path.join(getGameDir(), 'versions');
}

export async function isMinecraftInstalled(config: ServerConfig): Promise<boolean> {
  const versionsDir = getVersionsDir();
  if (!await fs.pathExists(versionsDir)) return false;

  const versions = await fs.readdir(versionsDir);
  const forgeDir = versions.find(v => v.includes('forge') && v.includes(config.forgeVersion) && !v.includes('neoforge'));
  if (!forgeDir) return false;

  const jsonFile = path.join(versionsDir, forgeDir, `${forgeDir}.json`);
  return fs.pathExists(jsonFile);
}

export async function getMojangVersionJson(versionId: string): Promise<MojangVersion> {
  const manifest = await downloadJson<VersionManifest>(MOJANG_VERSIONS_URL);
  const version = manifest.versions.find(v => v.id === versionId);
  if (!version) throw new Error(`Versión ${versionId} no encontrada`);
  
  return downloadJson<MojangVersion>(version.url);
}

export async function installMinecraft(
  config: ServerConfig,
  onProgress: (percentage: number, message: string) => void
): Promise<void> {
  const gameDir = getGameDir();
  await fs.ensureDir(gameDir);
  
  onProgress(5, 'Obteniendo información de Minecraft...');
  
  const versionJson = await getMojangVersionJson(config.version);
  const versionDir = path.join(getVersionsDir(), config.version);
  await fs.ensureDir(versionDir);
  
  await fs.writeJson(path.join(versionDir, `${config.version}.json`), versionJson);
  
  onProgress(10, 'Descargando cliente de Minecraft...');
  const clientPath = path.join(versionDir, `${config.version}.jar`);
  if (!await fs.pathExists(clientPath)) {
    await downloadFile(versionJson.downloads.client.url, clientPath);
  }
  
  onProgress(20, 'Descargando librerías...');
  const libraries = versionJson.libraries.filter(lib => {
    if (!lib.rules) return true;
    return lib.rules.every(rule => {
      if (rule.os) {
        const osName = os.platform() === 'win32' ? 'windows' : os.platform() === 'darwin' ? 'osx' : 'linux';
        return rule.os.name === osName ? rule.action === 'allow' : rule.action === 'disallow';
      }
      return rule.action === 'allow';
    });
  });
  
  const totalLibs = libraries.length;
  for (let i = 0; i < libraries.length; i++) {
    const lib = libraries[i];
    if (lib.downloads?.artifact) {
      const libPath = path.join(getLibrariesDir(), lib.downloads.artifact.path);
      if (!await fs.pathExists(libPath)) {
        await fs.ensureDir(path.dirname(libPath));
        await downloadFile(lib.downloads.artifact.url, libPath).catch((e: Error) => {
          log.warn('minecraft', `Falló descarga de librería: ${lib.name} — ${e.message}`);
        });
      }
    }
    onProgress(20 + Math.round((i / totalLibs) * 30), `Librerías... ${i}/${totalLibs}`);
  }
  
  onProgress(50, 'Descargando índice de assets...');
  const assetIndex = versionJson.assetIndex;
  if (assetIndex) {
    const assetsDir = getAssetsDir();
    const indexesDir = path.join(assetsDir, 'indexes');
    await fs.ensureDir(indexesDir);
    
    const indexPath = path.join(indexesDir, `${assetIndex.id}.json`);
    if (!await fs.pathExists(indexPath)) {
      await downloadFile(assetIndex.url, indexPath);
    }
  }
  
  onProgress(100, 'Minecraft vanilla instalado');
}

// ========== FORGE ==========

interface ForgeVersionMeta {
  version: string;
  rawVersion: string;
  stable: boolean;
}

async function createMinecraftProfile(gameDir: string, version: string): Promise<void> {
  const profilePath = path.join(gameDir, 'launcher_profiles.json');
  
  const profile = {
    profiles: {
      [version]: {
        name: version,
        type: "custom",
        created: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
        lastVersionId: version,
        gameDir: gameDir
      }
    },
    settings: {
      crashAssistance: true,
      enableAdvanced: false,
      enableAnalytics: true,
      enableHistorical: false,
      enableReleases: true,
      enableSnapshots: false,
      keepLauncherOpen: false,
      profileSorting: "ByLastPlayed",
      showGameLog: false,
      showMenu: false,
      soundOn: false
    },
    version: 3
  };
  
  await fs.writeJson(profilePath, profile, { spaces: 2 });
  log.info('neoforge', `Perfil de Minecraft creado: ${profilePath}`);
}

export async function installForge(
  config: ServerConfig,
  onProgress: (percentage: number, message: string) => void
): Promise<void> {
  const { version, forgeVersion } = config;
  
  const installerUrl = config.forgeInstallerUrl || 
    `${FORGE_MAVEN}/${version}-${forgeVersion}/forge-${version}-${forgeVersion}-installer.jar`;

  const installerPath = path.join(os.tmpdir(), `forge-installer-${Date.now()}.jar`);
    
  onProgress(10, 'Descargando instalador de Forge...');
  
  try {
    log.info('forge', `Descargando installer desde: ${installerUrl}`);
    await downloadFile(installerUrl, installerPath);
    log.info('forge', `Installer descargado: ${installerPath}`);
  } catch (error) {
    log.warn('forge', `Falló descarga principal. Verifica la versión o la URL.`);
    throw error;
  }

  onProgress(20, 'Creando perfil de Minecraft...');
  await createMinecraftProfile(getGameDir(), config.version);

  onProgress(30, 'Ejecutando instalador de Forge...');
  
  const javaPath = path.join(getGameDir(), 'java', 'bin', 'java.exe');
  const gameDir = getGameDir();

  const stderrLines: string[] = [];
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(javaPath, [
      '-Djava.awt.headless=true',
      '-jar', installerPath,
      '--installClient',
      gameDir
    ], {
      cwd: path.dirname(installerPath),
      env: process.env
    });
    
    proc.stdout.on('data', (data) => {
      const output = data.toString().trim();
      log.info('forge-installer', output);
      if (output.includes('Downloading') || output.includes('Extracting') || output.includes('Installing') || output.includes('Building')) {
        onProgress(60, output.substring(0, 80));
      }
    });
    
    proc.stderr.on('data', (data) => {
      const line = data.toString().trim();
      log.warn('forge-installer', `stderr: ${line}`);
      stderrLines.push(line);
    });
    
    proc.on('error', (err) => {
      log.error('forge-installer', 'No se pudo iniciar el proceso', err);
      reject(new Error(`No se pudo iniciar el instalador: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code === 0) {
        log.info('forge-installer', `Instalador terminó con código 0 (OK)`);
        resolve();
      } else {
        const errDetail = stderrLines.slice(-5).join(' | ');
        log.error('forge-installer', `Instalador terminó con código ${code}: ${errDetail}`);
        reject(new Error(`Forge installer falló (código ${code}): ${errDetail}`));
      }
    });
  });
  
  await fs.remove(installerPath);
  log.info('forge', 'Archivos temporales (installer) eliminados');
  
  const versions = await fs.readdir(getVersionsDir()).catch(() => [] as string[]);
  const forgeDir = versions.find(v => v.includes('forge') && v.includes(forgeVersion) && !v.includes('neoforge'));
  
  if (forgeDir) {
    log.info('forge', `Versión detectada exitosamente tras instalación: ${forgeDir}`);
  } else {
    log.warn('forge', `No se encontró carpeta de Forge en ${getVersionsDir()}. Versiones: ${versions.join(', ')}`);
  }
  
  onProgress(100, 'Forge instalado correctamente');
  log.info('forge', '✅ Forge instalado');
}

// ========== MODS Y CONFIGS ==========

interface ModInfo {
  name: string;
  filename: string;
  url: string;
  size: number;
  sha1?: string;
  required: boolean;
}

interface ModsManifest {
  mods: ModInfo[];
  configFiles?: Array<{ path: string; url: string }>;
}

export async function downloadMods(
  config: ServerConfig,
  onProgress: (percentage: number, message: string) => void
): Promise<void> {
  onProgress(5, 'Obteniendo lista de mods...');
  
  let modsManifest: ModsManifest;
  try {
    log.info('mods', `Descargando lista de mods desde: ${config.modsListUrl}`);
    modsManifest = await downloadJson<ModsManifest>(config.modsListUrl);
    log.info('mods', `Lista obtenida: ${modsManifest.mods.length} mod(s)`);
  } catch (e: any) {
    log.warn('mods', `No se pudo obtener mods.json: ${e.message}`);
    modsManifest = { mods: [] };
  }
  
  const modsDir = path.join(getGameDir(), 'mods');
  await fs.ensureDir(modsDir);
  
  const totalMods = modsManifest.mods.length;
  if (totalMods === 0) {
    log.warn('mods', 'La lista de mods está vacía. Verifica SERVER_MODS_LIST_URL en .env');
    onProgress(100, 'Lista de mods vacía');
    return;
  }

  for (let i = 0; i < modsManifest.mods.length; i++) {
    const mod = modsManifest.mods[i];

    const filename = mod.filename.endsWith('.jar') ? mod.filename : `${mod.filename}.jar`;
    const modPath = path.join(modsDir, filename);
    
    if (await fs.pathExists(modPath)) {
      const stats = await fs.stat(modPath);
      if (stats.size > 0 && (mod.size === 0 || stats.size === mod.size)) {
        console.log(`[Mods] Saltando (ya existe): ${filename}`);
        continue;
      }
    }
    
    onProgress(10 + Math.round((i / totalMods) * 90), `Descargando mod ${i+1}/${totalMods}: ${mod.name}`);
    log.info('mods', `Descargando [${i+1}/${totalMods}]: ${mod.url}`);
    
    try {
      await downloadFile(mod.url, modPath);
      log.info('mods', `✅ Descargado: ${filename}`);
    } catch (err: any) {
      log.error('mods', `❌ Falló descarga de "${mod.name}": ${err.message}`);
      onProgress(10 + Math.round((i / totalMods) * 90), `⚠️ No se pudo descargar: ${mod.name}`);
    }
  }
  
  onProgress(100, 'Mods instalados');
}

/**
 * Nueva función dedicada a descargar los archivos de configuración
 * leyendo la propiedad 'configFiles' del mismo JSON manifest de mods.
 */
export async function downloadConfigs(
  config: ServerConfig,
  onProgress: (percentage: number, message: string) => void
): Promise<void> {
  onProgress(5, 'Obteniendo lista de configuraciones...');
  
  let modsManifest: ModsManifest;
  try {
    modsManifest = await downloadJson<ModsManifest>(config.modsListUrl);
  } catch (e: any) {
    log.error('configs', `No se pudo obtener el manifest: ${e.message}`);
    onProgress(100, 'Error obteniendo manifest de configs');
    return;
  }

  const configFiles = modsManifest.configFiles;
  
  if (!configFiles || configFiles.length === 0) {
    log.info('configs', 'No se encontraron archivos de configuración.');
    onProgress(100, 'Sin configuraciones por instalar');
    return;
  }

  // 1. Definimos explícitamente la carpeta 'config' dentro de la raíz del juego
  const configDir = path.join(getGameDir(), 'config');
  await fs.ensureDir(configDir);

  const totalConfigs = configFiles.length;
  log.info('configs', `Encontrados ${totalConfigs} archivos de configuración.`);

  for (let i = 0; i < totalConfigs; i++) {
    const configFile = configFiles[i];
    
    // 2. Unimos la carpeta 'config' con el nombre del archivo
    // Ahora caerán en: .cemele-modpack/config/dynamic_fps.json
    const destPath = path.join(configDir, configFile.path);
    
    // Mantenemos esto por si en el futuro agregas subcarpetas (ej: jei/jei.properties)
    await fs.ensureDir(path.dirname(destPath));

    if (await fs.pathExists(destPath)) {
      log.info('configs', `Saltando config (ya existe): ${configFile.path}`);
      continue;
    }
    
    onProgress(10 + Math.round((i / totalConfigs) * 90), `Descargando config ${i+1}/${totalConfigs}...`);
    
    try {
      await downloadFile(configFile.url, destPath);
      log.info('configs', `✅ Config descargada en: ${destPath}`);
    } catch (err: any) {
      log.error('configs', `❌ Falló descarga de config "${configFile.path}": ${err.message}`);
    }
  }

  onProgress(100, 'Configuraciones instaladas');
}