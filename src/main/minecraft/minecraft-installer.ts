import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { spawn } from 'child_process';
import { downloadFile, downloadJson, downloadAndExtract } from '../utils/downloader';
import { ServerConfig } from '../config/server-config';
import { log } from '../utils/logger';

const MOJANG_VERSIONS_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest.json';

// NeoForge usa Maven diferente
const NEOFORGE_MAVEN = 'https://maven.neoforged.net/releases/net/neoforged/neoforge';

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
  const neoforgeVersionName = `${config.version}-neoforge-${config.neoforgeVersion}`;
  const versionDir = path.join(getVersionsDir(), neoforgeVersionName);
  const jarFile = path.join(versionDir, `${neoforgeVersionName}.jar`);
  return fs.pathExists(jarFile);
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
  
  onProgress(60, 'Minecraft vanilla instalado');
}

// ========== NEOFORGE - SISTEMA DIFERENTE ==========

interface NeoForgeVersionMeta {
  version: string;
  rawVersion: string;
  stable: boolean;
  // NeoForge usa un formato diferente en su Maven
}

async function createMinecraftProfile(gameDir: string, version: string): Promise<void> {
  const profilePath = path.join(gameDir, 'launcher_profiles.json');
  
  // Crear perfil mínimo que NeoForge espera
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

/**
 * NeoForge usa un sistema de versionado diferente:
 * - Las versiones son tipo: 47.1.106 (sin prefijo de MC)
 * - El installer está en: maven.neoforged.net
 * - El formato es: neoforge-VERSION-installer.jar
 */
export async function installNeoForge(
  config: ServerConfig,
  onProgress: (percentage: number, message: string) => void
): Promise<void> {
  const { version, neoforgeVersion } = config;
  
  // Usar URL forzada desde .env si existe, si no calcular automáticamente
  const installerUrl = config.neoforgeInstallerUrl || 
    `${NEOFORGE_MAVEN}/${neoforgeVersion}/neoforge-${neoforgeVersion}-installer.jar`;

  const installerPath = path.join(os.tmpdir(), `neoforge-installer-${Date.now()}.jar`);
    
  onProgress(60, 'Descargando instalador de NeoForge...');
  
  try {
    log.info('neoforge', `Descargando installer desde: ${installerUrl}`);
    await downloadFile(installerUrl, installerPath);
    log.info('neoforge', `Installer descargado: ${installerPath}`);
  } catch (error) {
    log.warn('neoforge', `Falló descarga principal, intentando URL legacy...`);
    const legacyUrl = `https://maven.neoforged.net/releases/net/neoforged/forge/${version}-${neoforgeVersion}/forge-${version}-${neoforgeVersion}-installer.jar`;
    log.info('neoforge', `URL legacy: ${legacyUrl}`);
    await downloadFile(legacyUrl, installerPath);
  }

  onProgress(65, 'Creando perfil de Minecraft...');
  
  // CREAR PERFIL ANTES DE EJECUTAR INSTALLER
  await createMinecraftProfile(getGameDir(), config.version);

  onProgress(70, 'Ejecutando instalador de NeoForge...');
  
  const javaPath = path.join(getGameDir(), 'java', 'bin', 'java.exe');
  
  // IMPORTANTE: --installClient NO acepta un path como argumento.
  // El installer lee %APPDATA% para encontrar la carpeta .minecraft.
  // Estrategia: apuntar APPDATA al padre de gameDir y crear un junction
  // .minecraft → gameDir, para que el installer instale exactamente en gameDir.
  const gameDir = getGameDir();
  const fakeAppData = path.dirname(gameDir);
  const dotMinecraft = path.join(fakeAppData, '.minecraft');

  if (!await fs.pathExists(dotMinecraft)) {
    // Junction (symlink de directorio en Windows): .minecraft → .cemele-modpack
    await fs.ensureSymlink(gameDir, dotMinecraft, 'junction');
    log.info('neoforge', `Junction creado: ${dotMinecraft} → ${gameDir}`);
  } else {
    log.info('neoforge', `Junction ya existe: ${dotMinecraft}`);
  }

  const stderrLines: string[] = [];
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(javaPath, [
      '-Djava.awt.headless=true',   // JVM flag ANTES de -jar
      '-jar', installerPath,
      '--installClient',             // sin path — usa APPDATA/.minecraft
    ], {
      cwd: path.dirname(installerPath),
      env: {
        ...process.env,
        'APPDATA': fakeAppData,     // installer usará fakeAppData/.minecraft = gameDir
      }
    });
    
    proc.stdout.on('data', (data) => {
      const output = data.toString().trim();
      log.info('neoforge-installer', output);
      if (output.includes('Downloading') || output.includes('Extracting') || output.includes('Installing')) {
        onProgress(75, output.substring(0, 80));
      }
    });
    
    proc.stderr.on('data', (data) => {
      const line = data.toString().trim();
      log.warn('neoforge-installer', `stderr: ${line}`);
      stderrLines.push(line);
    });
    
    proc.on('error', (err) => {
      log.error('neoforge-installer', 'No se pudo iniciar el proceso', err);
      reject(new Error(`No se pudo iniciar el instalador: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code === 0) {
        log.info('neoforge-installer', `Instalador terminó con código 0 (OK)`);
        resolve();
      } else {
        const errDetail = stderrLines.slice(-5).join(' | ');
        log.error('neoforge-installer', `Instalador terminó con código ${code}: ${errDetail}`);
        reject(new Error(`NeoForge installer falló (código ${code}): ${errDetail}`));
      }
    });
  });
  
  // Limpiar installer
  await fs.remove(installerPath);
  log.info('neoforge', 'Installer temporal eliminado');
  
  // NeoForge crea el perfil con nombre diferente, verificar
  const neoforgeVersionName = `${version}-neoforge-${neoforgeVersion}`;
  const expectedVersionDir = path.join(getVersionsDir(), neoforgeVersionName);
  
  if (!await fs.pathExists(expectedVersionDir)) {
    const versions = await fs.readdir(getVersionsDir()).catch(() => [] as string[]);
    const neoforgeDir = versions.find(v => v.includes('neoforge') || v.includes('neo'));
    if (neoforgeDir) {
      log.info('neoforge', `Instalado con nombre: ${neoforgeDir}`);
    } else {
      log.warn('neoforge', `No se encontró carpeta de NeoForge en ${getVersionsDir()}. Versiones: ${versions.join(', ')}`);
    }
  } else {
    log.info('neoforge', `Versión encontrada: ${neoforgeVersionName}`);
  }
  
  onProgress(85, 'NeoForge instalado correctamente');
  log.info('neoforge', '✅ NeoForge instalado');
}

// ========== MODS ==========

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
  onProgress(85, 'Obteniendo lista de mods...');
  
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
  }

  for (let i = 0; i < modsManifest.mods.length; i++) {
    const mod = modsManifest.mods[i];

    // Asegurar que el filename termine en .jar
    const filename = mod.filename.endsWith('.jar') ? mod.filename : `${mod.filename}.jar`;
    const modPath = path.join(modsDir, filename);
    
    if (await fs.pathExists(modPath)) {
      const stats = await fs.stat(modPath);
      // Solo saltear si el tamaño coincide Y el archivo no es 0 bytes
      if (stats.size > 0 && (mod.size === 0 || stats.size === mod.size)) {
        console.log(`[Mods] Saltando (ya existe): ${filename}`);
        continue;
      }
    }
    
    onProgress(85 + Math.round((i / totalMods) * 10), `Descargando mod ${i+1}/${totalMods}: ${mod.name}`);
    log.info('mods', `Descargando [${i+1}/${totalMods}]: ${mod.url}`);
    
    try {
      await downloadFile(mod.url, modPath);
      log.info('mods', `✅ Descargado: ${filename}`);
    } catch (err: any) {
      log.error('mods', `❌ Falló descarga de "${mod.name}": ${err.message}`);
      onProgress(85 + Math.round((i / totalMods) * 10), `⚠️ No se pudo descargar: ${mod.name}`);
    }
  }
  
  if (modsManifest.configFiles) {
    for (const configFile of modsManifest.configFiles) {
      const destPath = path.join(getGameDir(), configFile.path);
      await fs.ensureDir(path.dirname(destPath));
      await downloadFile(configFile.url, destPath);
    }
  }
  
  onProgress(95, 'Mods instalados');
}