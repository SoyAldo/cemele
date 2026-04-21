import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { downloadFile, downloadAndExtract } from '../utils/downloader';
import { ServerConfig } from '../config/server-config';
import { log } from '../utils/logger';

const DEFAULT_JAVA_DOWNLOADS: Record<string, Record<string, string>> = {
  win32: {
    x64: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.3%2B9/OpenJDK21U-jre_x64_windows_hotspot_21.0.3_9.zip',
  },
  linux: {
    x64: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.3%2B9/OpenJDK21U-jre_x64_linux_hotspot_21.0.3_9.tar.gz',
  },
  darwin: {
    x64: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.3%2B9/OpenJDK21U-jre_x64_mac_hotspot_21.0.3_9.tar.gz',
    arm64: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.3%2B9/OpenJDK21U-jre_aarch64_mac_hotspot_21.0.3_9.tar.gz',
  }
};

export function getJavaPath(gameDir: string): string {
  const platform = os.platform();
  const javaDir = path.join(gameDir, 'java', 'bin');
  
  const javaExe = platform === 'win32' ? 'java.exe' : 'java';
  return path.join(javaDir, javaExe);
}

export async function isJavaInstalled(gameDir: string): Promise<boolean> {
  const javaPath = getJavaPath(gameDir);
  return fs.pathExists(javaPath);
}

export async function installJava(
  gameDir: string,
  config: ServerConfig,
  onProgress?: (percentage: number, message: string) => void
): Promise<void> {
  const platform = os.platform();
  const arch = os.arch();
  
  // Usar URL forzada desde .env, o la default
  const downloadUrl = config.javaDownloadUrl || 
    DEFAULT_JAVA_DOWNLOADS[platform]?.[arch];
  
  if (!downloadUrl) {
    throw new Error(`No hay descarga de Java para ${platform}-${arch}`);
  }
  
  log.info('java', `Plataforma: ${platform}-${arch}`);
  log.info('java', `URL de descarga: ${downloadUrl}`);

  const javaDir = path.join(gameDir, 'java');
  await fs.ensureDir(javaDir);
  
  onProgress?.(0, 'Descargando Java 21...');
  
  const tempFile = path.join(os.tmpdir(), `java-${Date.now()}.zip`);
  
  // Descargar
  await downloadFile(downloadUrl, tempFile, (prog) => {
    onProgress?.(Math.round(prog.percentage * 0.5), `Descargando Java... ${prog.percentage}%`);
  });
  
  onProgress?.(50, 'Extrayendo Java...');
  
  // Extraer
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(tempFile);
  
  // El ZIP de Adoptium tiene una carpeta raíz como jdk-17.0.9+9-jre/
  // Necesitamos extraer el contenido de esa carpeta a java/
  const entries = zip.getEntries();
  const rootFolder = entries[0].entryName.split('/')[0];
  
  // Extraer todo
  zip.extractAllTo(javaDir, true);
  
  // Mover contenido de la subcarpeta a java/
  const extractedDir = path.join(javaDir, rootFolder);
  if (await fs.pathExists(extractedDir)) {
    const files = await fs.readdir(extractedDir);
    for (const file of files) {
      await fs.move(path.join(extractedDir, file), path.join(javaDir, file), { overwrite: true });
    }
    await fs.rmdir(extractedDir);
  }
  
  await fs.remove(tempFile);
  
  // Verificar
  if (!await isJavaInstalled(gameDir)) {
    throw new Error('Java no se instaló correctamente');
  }
  
  log.info('java', '✅ Java instalado correctamente');
  onProgress?.(100, 'Java instalado correctamente');
}