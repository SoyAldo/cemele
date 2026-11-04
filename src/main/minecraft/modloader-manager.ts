import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { spawn } from 'child_process';
import fetch from 'node-fetch';
import { log } from '../utils/logger';
import { downloadFile } from '../utils/downloader';
import { ServerConfig, ModLoaderType } from '../config/server-config';

const FORGE_MAVEN = 'https://maven.minecraftforge.net/net/minecraftforge/forge';
const FORGE_PROMOTIONS_URL = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';
const FABRIC_META_URL = 'https://meta.fabricmc.net/v2';
const NEOFORGE_MAVEN = 'https://maven.neoforged.net/releases/net/neoforged';

/**
 * Convierte una coordenada Maven (group:artifact:version[:classifier][@ext]) a su ruta relativa en libraries.
 * Ejemplo: org.ow2.asm:asm:9.7.1 -> org/ow2/asm/asm/9.7.1/asm-9.7.1.jar
 */
export function mavenToPath(mavenName: string): string {
  let ext = 'jar';
  let coord = mavenName;
  if (coord.includes('@')) {
    const parts = coord.split('@');
    coord = parts[0];
    ext = parts[1];
  }

  const parts = coord.split(':');
  const group = parts[0].replace(/\./g, '/');
  const artifact = parts[1];
  const version = parts[2];
  const classifier = parts[3] ? `-${parts[3]}` : '';

  return `${group}/${artifact}/${version}/${artifact}-${version}${classifier}.${ext}`;
}

/**
 * Asegura la existencia de launcher_profiles.json en la raíz del juego,
 * requerido por los instaladores oficiales de Forge, NeoForge y Fabric.
 */
export async function ensureLauncherProfiles(gameDir: string, mcVersion: string): Promise<void> {
  const profilePath = path.join(gameDir, 'launcher_profiles.json');
  if (await fs.pathExists(profilePath)) {
    return;
  }

  const profile = {
    profiles: {
      cemele: {
        name: 'CEMELE',
        type: 'custom',
        created: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
        icon: 'Furnace',
        lastVersionId: mcVersion,
        gameDir
      }
    },
    settings: {
      crashAssistance: true,
      enableAdvanced: true,
      enableAnalytics: false,
      enableHistorical: false,
      enableReleases: true,
      enableSnapshots: false,
      keepLauncherOpen: false,
      profileSorting: 'byLastPlayed',
      showGameLog: true,
      showMenu: false,
      soundOn: false
    },
    version: 3
  };

  await fs.ensureDir(gameDir);
  await fs.writeJson(profilePath, profile, { spaces: 2 });
  log.info('modloader', `launcher_profiles.json creado en: ${profilePath}`);
}

/**
 * Resuelve la versión del modloader. Si se pasa una versión específica, se usa esa.
 * Si no se establece, consulta la API oficial para obtener la última versión recomendada o estable.
 */
export async function resolveModLoaderVersion(
  modLoader: ModLoaderType,
  mcVersion: string,
  explicitVersion?: string
): Promise<string> {
  if (explicitVersion && explicitVersion.trim().length > 0) {
    return explicitVersion.trim();
  }

  log.info('modloader', `Resolviendo última versión de ${modLoader} para Minecraft ${mcVersion}...`);

  if (modLoader === 'FABRIC') {
    try {
      const response = await fetch(`${FABRIC_META_URL}/versions/loader/${mcVersion}`);
      if (response.ok) {
        const loaders = await response.json();
        if (Array.isArray(loaders) && loaders.length > 0 && loaders[0].loader?.version) {
          const latest = loaders[0].loader.version;
          log.info('modloader', `Última versión de Fabric encontrada: ${latest}`);
          return latest;
        }
      }
    } catch (e: any) {
      log.warn('modloader', `No se pudo consultar la API de Fabric: ${e.message}`);
    }
    return '0.16.10'; // Fallback estable
  }

  if (modLoader === 'NEOFORGE') {
    try {
      if (mcVersion === '1.20.1') {
        const response = await fetch('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/forge');
        if (response.ok) {
          const data = await response.json();
          const matches = (data.versions || []).filter((v: string) => v.startsWith('1.20.1-'));
          if (matches.length > 0) {
            const latest = matches[matches.length - 1];
            log.info('modloader', `Última versión de NeoForge 1.20.1 encontrada: ${latest}`);
            return latest;
          }
        }
        return '1.20.1-47.1.106';
      }

      // Para Minecraft 1.20.2+ el prefijo de versión es p.ej. 20.4, 20.6, 21.1
      const prefix = mcVersion.replace(/^1\./, '');
      const response = await fetch('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge');
      if (response.ok) {
        const data = await response.json();
        const matches = (data.versions || []).filter((v: string) => v.startsWith(`${prefix}.`));
        if (matches.length > 0) {
          const latest = matches[matches.length - 1];
          log.info('modloader', `Última versión de NeoForge encontrada: ${latest}`);
          return latest;
        }
      }
    } catch (e: any) {
      log.warn('modloader', `No se pudo consultar la API de NeoForge: ${e.message}`);
    }
    return mcVersion === '1.20.1' ? '1.20.1-47.1.106' : `${mcVersion.replace(/^1\./, '')}.1`;
  }

  // Por defecto: FORGE
  try {
    const response = await fetch(FORGE_PROMOTIONS_URL);
    if (response.ok) {
      const data = await response.json();
      const promos = data.promos || {};
      const version = promos[`${mcVersion}-recommended`] || promos[`${mcVersion}-latest`];
      if (version) {
        log.info('modloader', `Última versión de Forge encontrada: ${version}`);
        return version;
      }
    }
  } catch (e: any) {
    log.warn('modloader', `No se pudo consultar promotions_slim de Forge: ${e.message}`);
  }

  return '47.2.20'; // Fallback estable para 1.20.1
}

/**
 * Obtiene la URL de descarga del instalador del modloader correspondiente.
 */
export async function getModLoaderInstallerUrl(
  modLoader: ModLoaderType,
  mcVersion: string,
  loaderVersion: string,
  customUrl?: string
): Promise<string> {
  if (customUrl && customUrl.trim().length > 0) {
    return customUrl.trim();
  }

  if (modLoader === 'FABRIC') {
    try {
      const response = await fetch(`${FABRIC_META_URL}/versions/installer`);
      if (response.ok) {
        const installers = await response.json();
        if (Array.isArray(installers) && installers.length > 0 && installers[0].url) {
          return installers[0].url;
        }
      }
    } catch (e: any) {
      log.warn('modloader', `Fallo al consultar versión del installer de Fabric: ${e.message}`);
    }
    return 'https://maven.fabricmc.net/net/fabricmc/fabric-installer/1.1.2/fabric-installer-1.1.2.jar';
  }

  if (modLoader === 'NEOFORGE') {
    if (mcVersion === '1.20.1') {
      const cleanVer = loaderVersion.startsWith('1.20.1-') ? loaderVersion : `1.20.1-${loaderVersion}`;
      return `${NEOFORGE_MAVEN}/forge/${cleanVer}/forge-${cleanVer}-installer.jar`;
    }
    return `${NEOFORGE_MAVEN}/neoforge/${loaderVersion}/neoforge-${loaderVersion}-installer.jar`;
  }

  // FORGE
  return `${FORGE_MAVEN}/${mcVersion}-${loaderVersion}/forge-${mcVersion}-${loaderVersion}-installer.jar`;
}

/**
 * Busca el directorio de la versión instalada del modloader dentro de la carpeta versions/.
 */
export async function findInstalledModLoader(
  versionsDir: string,
  modLoader: ModLoaderType,
  mcVersion: string,
  loaderVersion?: string
): Promise<string | undefined> {
  if (!(await fs.pathExists(versionsDir))) return undefined;
  const versions = await fs.readdir(versionsDir);
  const cleanLoaderVer = loaderVersion ? loaderVersion.trim() : '';

  if (modLoader === 'FABRIC') {
    return versions.find(v => {
      const lower = v.toLowerCase();
      const isFabric = lower.includes('fabric-loader') || lower.startsWith('fabric');
      const matchesMc = v.includes(mcVersion);
      const matchesLoader = !cleanLoaderVer || v.includes(cleanLoaderVer);
      return isFabric && matchesMc && matchesLoader;
    }) || versions.find(v => v.toLowerCase().includes('fabric-loader'));
  }

  if (modLoader === 'NEOFORGE') {
    return versions.find(v => {
      const lower = v.toLowerCase();
      const isNeo = lower.includes('neoforge');
      const matchesLoader = !cleanLoaderVer || v.includes(cleanLoaderVer);
      return isNeo && matchesLoader;
    }) || versions.find(v => v.toLowerCase().includes('neoforge'));
  }

  // FORGE
  return versions.find(v => {
    const lower = v.toLowerCase();
    const isForge = lower.includes('forge') && !lower.includes('neoforge');
    const matchesLoader = !cleanLoaderVer || v.includes(cleanLoaderVer);
    return isForge && matchesLoader;
  }) || versions.find(v => v.toLowerCase().includes('forge') && !v.toLowerCase().includes('neoforge'));
}

/**
 * Comprueba si el modloader configurado ya está instalado en el juego.
 */
export async function isModLoaderInstalled(config: ServerConfig, gameDir: string): Promise<boolean> {
  const versionsDir = path.join(gameDir, 'versions');
  if (!(await fs.pathExists(versionsDir))) return false;

  const installedVersion = await findInstalledModLoader(
    versionsDir,
    config.modLoader,
    config.version,
    config.modLoaderVersion
  );

  if (!installedVersion) return false;

  const jsonFile = path.join(versionsDir, installedVersion, `${installedVersion}.json`);
  return await fs.pathExists(jsonFile);
}

/**
 * Descarga e instala el modloader configurado (Forge, NeoForge o Fabric).
 */
export async function installModLoader(
  config: ServerConfig,
  gameDir: string,
  javaPath: string,
  onProgress: (percentage: number, message: string) => void
): Promise<string> {
  const { version: mcVersion, modLoader } = config;
  const resolvedVersion = await resolveModLoaderVersion(modLoader, mcVersion, config.modLoaderVersion);

  onProgress(10, `Obteniendo instalador de ${modLoader} (v${resolvedVersion})...`);
  log.info('modloader', `Iniciando instalación de ${modLoader} v${resolvedVersion} para MC ${mcVersion}`);

  await ensureLauncherProfiles(gameDir, mcVersion);

  const installerUrl = await getModLoaderInstallerUrl(
    modLoader,
    mcVersion,
    resolvedVersion,
    config.forgeInstallerUrl
  );

  const installerPath = path.join(os.tmpdir(), `${modLoader.toLowerCase()}-installer-${Date.now()}.jar`);

  try {
    log.info('modloader', `Descargando instalador desde: ${installerUrl}`);
    await downloadFile(installerUrl, installerPath);
    log.info('modloader', `Instalador descargado: ${installerPath}`);
  } catch (error: any) {
    log.error('modloader', `Fallo al descargar instalador de ${modLoader}: ${error.message}`);
    throw error;
  }

  onProgress(30, `Ejecutando instalador de ${modLoader}...`);

  // Argumentos de ejecución según el modloader
  let procArgs: string[] = [];
  if (modLoader === 'FABRIC') {
    procArgs = [
      '-jar',
      installerPath,
      'client',
      '-dir',
      gameDir,
      '-mcversion',
      mcVersion,
      '-loader',
      resolvedVersion,
      '-downloadMinecraft',
      'false'
    ];
  } else {
    // Forge y NeoForge usan --installClient <gameDir>
    procArgs = [
      '-Djava.awt.headless=true',
      '-jar',
      installerPath,
      '--installClient',
      gameDir
    ];
  }

  const stderrLines: string[] = [];

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(javaPath, procArgs, {
      cwd: path.dirname(installerPath),
      env: process.env
    });

    proc.stdout.on('data', data => {
      const output = data.toString().trim();
      log.info(`${modLoader.toLowerCase()}-installer`, output);
      if (
        output.includes('Downloading') ||
        output.includes('Extracting') ||
        output.includes('Installing') ||
        output.includes('Building') ||
        output.includes('Descargando')
      ) {
        onProgress(60, output.substring(0, 80));
      }
    });

    proc.stderr.on('data', data => {
      const line = data.toString().trim();
      log.warn(`${modLoader.toLowerCase()}-installer`, `stderr: ${line}`);
      stderrLines.push(line);
    });

    proc.on('error', err => {
      log.error(`${modLoader.toLowerCase()}-installer`, 'No se pudo iniciar el proceso de instalación', err);
      reject(new Error(`No se pudo iniciar el instalador: ${err.message}`));
    });

    proc.on('close', code => {
      if (code === 0) {
        log.info(`${modLoader.toLowerCase()}-installer`, `Instalador terminó con código 0 (OK)`);
        resolve();
      } else {
        const errDetail = stderrLines.slice(-5).join(' | ');
        log.error(`${modLoader.toLowerCase()}-installer`, `Instalador terminó con código ${code}: ${errDetail}`);
        reject(new Error(`${modLoader} installer falló (código ${code}): ${errDetail}`));
      }
    });
  });

  // Limpiar archivo temporal del instalador
  await fs.remove(installerPath).catch(() => {});

  const versionsDir = path.join(gameDir, 'versions');
  const detected = await findInstalledModLoader(versionsDir, modLoader, mcVersion, resolvedVersion);

  if (detected) {
    log.info('modloader', `✅ ${modLoader} instalado exitosamente: ${detected}`);
  } else {
    log.warn('modloader', `No se encontró carpeta para ${modLoader} en ${versionsDir}`);
  }

  onProgress(100, `${modLoader} instalado correctamente`);
  return detected || resolvedVersion;
}

