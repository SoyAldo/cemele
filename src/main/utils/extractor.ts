import fs from 'fs-extra';
import { spawn } from 'child_process';
import { log } from './logger';

/**
 * Descomprime un archivo .zip de forma ultra rápida:
 * 1. Usa la herramienta nativa 'tar' (integrada en Windows 10/11, Linux y macOS).
 *    No consume memoria en el heap de Node.js (0 MB RAM) y es streaming multi-hilo en C++.
 * 2. Si 'tar' no está disponible o falla, recurre a AdmZip de forma asíncrona.
 */
export async function extractZip(zipPath: string, destDir: string): Promise<void> {
  await fs.ensureDir(destDir);

  // 1. Intentar primero con tar nativo del sistema operativo
  const tarSuccess = await new Promise<boolean>((resolve) => {
    try {
      const proc = spawn('tar', ['-xf', zipPath, '-C', destDir], { windowsHide: true });
      proc.on('close', (code) => {
        resolve(code === 0);
      });
      proc.on('error', () => {
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });

  if (tarSuccess) {
    return;
  }

  log.warn('extractor', 'tar nativo no disponible o falló. Usando fallback AdmZip...');

  // 2. Fallback con AdmZip asíncrono
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(zipPath);
  await new Promise<void>((resolve, reject) => {
    zip.extractAllToAsync(destDir, true, false, (err: any) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

