import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { app } from 'electron';

/**
 * Obtiene el directorio raíz donde está instalado el launcher.
 * - En producción empaquetada (NSIS): el directorio elegido por el usuario donde se ubica el .exe.
 * - En desarrollo: el directorio raíz del proyecto.
 */
export function getInstallRootDir(): string {
  if (app && app.isPackaged) {
    return path.dirname(process.execPath);
  }
  return process.cwd();
}

/**
 * Directorio donde se descargan e instalan todos los archivos del modpack
 * (Minecraft, versiones, librerías, Java, mods, configs, resourcepacks).
 * Ubicación: <directorio_de_instalacion>/assets/modpack
 */
export function getGameDir(): string {
  return path.join(getInstallRootDir(), 'assets', 'modpack');
}

/**
 * Directorio donde se guardan los archivos de configuración, sesión y logs del launcher.
 * Ubicación: <directorio_de_instalacion>/assets/launcher
 */
export function getLauncherDataDir(): string {
  return path.join(getInstallRootDir(), 'assets', 'launcher');
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

export function getServerConfigPath(): string {
  return path.join(getLauncherDataDir(), 'server-config.json');
}

export function getSessionPath(): string {
  return path.join(getLauncherDataDir(), 'session.json');
}

export function getLogsDir(): string {
  return path.join(getLauncherDataDir(), 'internal_logs');
}

/**
 * Directorio para descargas temporales y descompresión de actualizaciones.
 * Ubicación: <directorio_de_instalacion>/assets/modpack/.temp
 */
export function getTempDir(): string {
  return path.join(getGameDir(), '.temp');
}

/**
 * Migra automáticamente configuraciones y sesiones previas desde AppData/Roaming si existen.
 */
export function migrateLegacyDataIfNeeded(): void {
  try {
    const oldLauncherDir = path.join(os.homedir(), 'AppData', 'Roaming', '.cemele-launcher');
    const newLauncherDir = getLauncherDataDir();

    if (fs.existsSync(oldLauncherDir)) {
      fs.ensureDirSync(newLauncherDir);
      const files = ['server-config.json', 'session.json'];
      for (const file of files) {
        const oldFile = path.join(oldLauncherDir, file);
        const newFile = path.join(newLauncherDir, file);
        if (fs.existsSync(oldFile) && !fs.existsSync(newFile)) {
          fs.copySync(oldFile, newFile);
        }
      }
    }
  } catch {
    // Si falla la migración silenciosa, continúa normalmente
  }
}

