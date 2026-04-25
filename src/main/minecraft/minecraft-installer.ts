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
    
    onProgress(60, 'Verificando y descargando assets (esto puede tardar)...');
    await downloadAssets(indexPath, onProgress);
  }
  
  onProgress(100, 'Minecraft vanilla instalado');
}

async function downloadAssets(indexPath: string, onProgress: (percentage: number, message: string) => void): Promise<void> {
  const assetsDir = getAssetsDir();
  const objectsDir = path.join(assetsDir, 'objects');
  await fs.ensureDir(objectsDir);

  const indexData = await fs.readJson(indexPath);
  const objects = indexData.objects;
  if (!objects) return;

  const entries = Object.values(objects) as Array<{hash: string, size: number}>;
  let downloadedCount = 0;
  const totalAssets = entries.length;

  // Límite de concurrencia para no saturar la red ni crear miles de promesas al mismo tiempo
  const concurrency = 20;
  for (let i = 0; i < totalAssets; i += concurrency) {
    const chunk = entries.slice(i, i + concurrency);
    await Promise.all(chunk.map(async (obj) => {
      const hash = obj.hash;
      const prefix = hash.substring(0, 2);
      const destPath = path.join(objectsDir, prefix, hash);
      
      if (!await fs.pathExists(destPath)) {
        const url = `https://resources.download.minecraft.net/${prefix}/${hash}`;
        try {
          await downloadFile(url, destPath);
        } catch (e: any) {
          log.warn('assets', `No se pudo descargar asset ${hash}: ${e.message}`);
        }
      }
      downloadedCount++;
    }));
    
    // Actualizamos el progreso visualmente cada cierto bloque
    if (i % (concurrency * 2) === 0 || i + concurrency >= totalAssets) {
      onProgress(60 + Math.round((downloadedCount / totalAssets) * 35), `Descargando assets... ${downloadedCount}/${totalAssets}`);
    }
  }
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
  config?: { fileName: string; url: string; size: number; sha1?: string; required: boolean };
  others?: Array<{ fileName: string; path: string; url: string; size: number; sha1?: string; required: boolean }>;
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

  // Eliminar mods extra que no están en el manifest oficial
  try {
    const expectedFiles = new Set(modsManifest.mods.map(m => m.filename.endsWith('.jar') ? m.filename : `${m.filename}.jar`));
    const localFiles = await fs.readdir(modsDir);
    
    for (const file of localFiles) {
      if (file.endsWith('.jar') && !expectedFiles.has(file)) {
        await fs.remove(path.join(modsDir, file));
        log.info('mods', `🗑️ Archivo borrado (no oficial): ${file}`);
      }
    }
  } catch (e: any) {
    log.warn('mods', `Error al limpiar mods no oficiales: ${e.message}`);
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

  const configObj = modsManifest.config;
  const configFiles = modsManifest.configFiles;
  
  if (!configObj && (!configFiles || configFiles.length === 0)) {
    log.info('configs', 'No se encontraron archivos de configuración.');
    onProgress(100, 'Sin configuraciones por instalar');
    return;
  }

  const configDir = path.join(getGameDir(), 'config');
  await fs.ensureDir(configDir);

  // 1. Soporte para el archivo ZIP (nueva forma)
  if (configObj) {
    const zipPath = path.join(getGameDir(), configObj.fileName || 'mods.zip');
    
    let needsDownload = true;
    if (await fs.pathExists(zipPath)) {
      const stats = await fs.stat(zipPath);
      if (stats.size === configObj.size) {
        needsDownload = false;
        log.info('configs', `El archivo config zip (${configObj.fileName}) ya existe y no ha cambiado, no se descarga.`);
      }
    }
    
    if (needsDownload) {
      onProgress(30, 'Descargando configuraciones...');
      try {
        await downloadFile(configObj.url, zipPath);
        log.info('configs', `✅ Config descargada en: ${zipPath}`);
        
        onProgress(70, 'Extrayendo configuraciones...');
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(configDir, true);
        log.info('configs', '✅ Configuraciones extraídas');
      } catch (err: any) {
        log.error('configs', `❌ Falló descarga o extracción de config zip: ${err.message}`);
      }
    }
  }

  // 2. Soporte para archivos sueltos (forma antigua)
  if (configFiles && configFiles.length > 0) {
    const totalConfigs = configFiles.length;
    log.info('configs', `Encontrados ${totalConfigs} archivos de configuración sueltos.`);

    for (let i = 0; i < totalConfigs; i++) {
      const configFile = configFiles[i];
      const destPath = path.join(configDir, configFile.path);
      
      await fs.ensureDir(path.dirname(destPath));

      if (await fs.pathExists(destPath)) {
        continue;
      }
      
      onProgress(10 + Math.round((i / totalConfigs) * 90), `Descargando config ${i+1}/${totalConfigs}...`);
      
      try {
        await downloadFile(configFile.url, destPath);
      } catch (err: any) {
        log.error('configs', `❌ Falló descarga de config "${configFile.path}": ${err.message}`);
      }
    }
  }

  onProgress(100, 'Configuraciones instaladas');
}

/**
 * Función dedicada a descargar los archivos adicionales (resourcepacks, shaderpacks, options.txt, etc.)
 * leyendo la propiedad 'others' del JSON manifest.
 */
export async function downloadOthers(
  config: ServerConfig,
  onProgress: (percentage: number, message: string) => void
): Promise<void> {
  onProgress(5, 'Obteniendo lista de archivos adicionales...');
  
  let modsManifest: ModsManifest;
  try {
    modsManifest = await downloadJson<ModsManifest>(config.modsListUrl);
  } catch (e: any) {
    log.error('others', `No se pudo obtener el manifest: ${e.message}`);
    onProgress(100, 'Error obteniendo manifest de archivos adicionales');
    return;
  }

  const others = modsManifest.others;
  
  if (!others || others.length === 0) {
    log.info('others', 'No se encontraron archivos adicionales.');
    onProgress(100, 'Sin archivos adicionales por instalar');
    return;
  }

  const totalOthers = others.length;
  log.info('others', `Encontrados ${totalOthers} archivos adicionales.`);

  for (let i = 0; i < totalOthers; i++) {
    const other = others[i];
    const destPath = path.join(getGameDir(), other.path, other.fileName);
    
    await fs.ensureDir(path.dirname(destPath));

    if (await fs.pathExists(destPath)) {
      const stats = await fs.stat(destPath);
      if (stats.size > 0 && (other.size === 0 || stats.size === other.size)) {
        console.log(`[Others] Saltando (ya existe): ${other.fileName}`);
        continue;
      }
    }
    
    onProgress(10 + Math.round((i / totalOthers) * 90), `Descargando archivo adicional ${i+1}/${totalOthers}...`);
    
    try {
      await downloadFile(other.url, destPath);
    } catch (err: any) {
      log.error('others', `❌ Falló descarga de "${other.fileName}": ${err.message}`);
    }
  }

  onProgress(100, 'Archivos adicionales instalados');
}

/**
 * Verifica sincrónicamente (esperando las promesas) si los mods coinciden
 * exactamente con el mods.json remoto.
 */
export async function verifyModsSync(config: ServerConfig, gameDir: string): Promise<boolean> {
  const modsDir = path.join(gameDir, 'mods');
  if (!await fs.pathExists(modsDir)) return false;

  try {
    const modsManifest = await downloadJson<ModsManifest>(config.modsListUrl);
    if (!modsManifest.mods || modsManifest.mods.length === 0) return true;

    const expectedFiles = new Set(modsManifest.mods.map(m => m.filename.endsWith('.jar') ? m.filename : `${m.filename}.jar`));
    const localFiles = await fs.readdir(modsDir);
    
    // Verificar si hay archivos extra no oficiales
    for (const file of localFiles) {
      if (file.endsWith('.jar') && !expectedFiles.has(file)) {
        return false; // Sobran archivos
      }
    }

    // Verificar si falta alguno o tiene un tamaño incorrecto
    for (const mod of modsManifest.mods) {
      const filename = mod.filename.endsWith('.jar') ? mod.filename : `${mod.filename}.jar`;
      const modPath = path.join(modsDir, filename);
      
      if (!await fs.pathExists(modPath)) {
        return false; // Falta un archivo
      }
      
      if (mod.size && mod.size > 0) {
        const stats = await fs.stat(modPath);
        if (stats.size !== mod.size) {
          return false; // El tamaño es diferente (actualización)
        }
      }
    }
    
    return true; // Todo coincide perfecto
  } catch (e: any) {
    log.warn('check', `No se pudo verificar mods.json (¿offline?): ${e.message}`);
    // Fallback: si no hay internet, comprobamos si la carpeta tiene archivos
    return (await fs.readdir(modsDir)).length > 0;
  }
}

/**
 * Verifica sincrónicamente si los archivos de configuración coinciden
 * con el mods.json remoto.
 */
export async function verifyConfigsSync(config: ServerConfig, gameDir: string): Promise<boolean> {
  const configDir = path.join(gameDir, 'config');
  if (!await fs.pathExists(configDir)) return false;

  try {
    const modsManifest = await downloadJson<ModsManifest>(config.modsListUrl);
    
    // Si usa el nuevo formato ZIP
    if (modsManifest.config) {
      const zipPath = path.join(gameDir, modsManifest.config.fileName || 'mods.zip');
      if (!await fs.pathExists(zipPath)) return false;
      const stats = await fs.stat(zipPath);
      if (stats.size !== modsManifest.config.size) return false;
      return true;
    }
    
    // Si usa formato de archivos sueltos
    if (!modsManifest.configFiles || modsManifest.configFiles.length === 0) return true;

    for (const file of modsManifest.configFiles) {
      const targetPath = path.join(configDir, file.path);
      if (!await fs.pathExists(targetPath)) {
        return false;
      }
    }
    return true;
  } catch (e: any) {
    // Fallback: si no hay internet
    return (await fs.readdir(configDir)).length > 0;
  }
}

/**
 * Verifica sincrónicamente si los archivos adicionales coinciden
 * con el mods.json remoto.
 */
export async function verifyOthersSync(config: ServerConfig, gameDir: string): Promise<boolean> {
  try {
    const modsManifest = await downloadJson<ModsManifest>(config.modsListUrl);
    
    if (!modsManifest.others || modsManifest.others.length === 0) return true;

    for (const file of modsManifest.others) {
      const targetPath = path.join(gameDir, file.path, file.fileName);
      if (!await fs.pathExists(targetPath)) {
        return false;
      }
    }
    return true;
  } catch (e: any) {
    // Fallback: si no hay internet asumimos true si no podemos comprobarlo
    return true;
  }
}