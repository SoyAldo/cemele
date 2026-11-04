import fetch from "node-fetch";
import fs from "fs-extra";
import path from "path";
import { pipeline } from "stream";
import { promisify } from "util";
import { getTempDir } from "./paths";
import { extractZip } from "./extractor";

const streamPipeline = promisify(pipeline);

export interface DownloadProgress {
  file: string;
  downloaded: number;
  total: number;
  percentage: number;
}

export async function downloadFile(url: string, destPath: string, onProgress?: (progress: DownloadProgress) => void): Promise<void> {
  await fs.ensureDir(path.dirname(destPath));

  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);

  const total = parseInt(response.headers.get("content-length") || "0");
  let downloaded = 0;

  const fileStream = fs.createWriteStream(destPath);

  return new Promise((resolve, reject) => {
    response.body.on("data", (chunk: Buffer) => {
      downloaded += chunk.length;
      if (onProgress && total > 0) {
        onProgress({
          file: path.basename(destPath),
          downloaded,
          total,
          percentage: Math.round((downloaded / total) * 100),
        });
      }
    });

    response.body.pipe(fileStream);

    fileStream.on("finish", () => {
      fileStream.close();
      resolve();
    });

    fileStream.on("error", (err) => {
      fs.unlink(destPath).catch(() => {});
      reject(err);
    });
  });
}

export async function downloadJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.json() as Promise<T>;
}

// Descargar y extraer ZIP
export async function downloadAndExtract(url: string, destDir: string, onProgress?: (progress: DownloadProgress) => void): Promise<void> {
  const tempDir = getTempDir();
  await fs.ensureDir(tempDir);
  const tempFile = path.join(tempDir, `download-${Date.now()}.zip`);

  try {
    await downloadFile(url, tempFile, onProgress);
    await extractZip(tempFile, destDir);
  } finally {
    await fs.remove(tempFile).catch(() => {});
  }
}
