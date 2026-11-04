import { IpcMainInvokeEvent, dialog, shell } from "electron";
import path from "path";
import os from "os";
import fs from "fs-extra";
import AdmZip from "adm-zip";
import crypto from "crypto";
import { log } from "../../utils/logger";
import { parseGitHubRepo } from "../../config/server-config";
import { getTempDir } from "../../utils/paths";

export interface UpdateActionItem {
  type: "COPY" | "REPLACE" | "DELETE";
  localSourcePath?: string;
  targetPath: string; // Relativa al juego, ej. "mods/example.jar" o "config/options.txt"
}

export interface PackageUpdateRequest {
  version: string;
  name?: string;
  changelog: string[];
  actions: UpdateActionItem[];
  destinationZipPath: string;
}

function calculateFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex").toLowerCase()));
  });
}

/**
 * Verifica si el PIN ingresado coincide con el configurado en .env (o 1234 por defecto).
 */
export async function handleVerifyCreatorPin(_event: IpcMainInvokeEvent, pin: string): Promise<boolean> {
  const configuredPin = process.env.CREATOR_PIN || "1234";
  return (pin || "").trim() === configuredPin.trim();
}

/**
 * Abre el diálogo nativo del sistema operativo para seleccionar archivos.
 */
export async function handleSelectFilesDialog(_event: IpcMainInvokeEvent, options: { title?: string; filters?: any[]; multi?: boolean }): Promise<string[]> {
  const result = await dialog.showOpenDialog({
    title: options?.title || "Seleccionar archivos",
    properties: options?.multi !== false ? ["openFile", "multiSelections"] : ["openFile"],
    filters: options?.filters || [{ name: "Todos los archivos", extensions: ["*"] }],
  });

  if (result.canceled) return [];
  return result.filePaths;
}

/**
 * Abre el diálogo nativo para elegir dónde guardar el archivo .zip generado.
 */
export async function handleSelectSaveZipDialog(_event: IpcMainInvokeEvent, defaultFileName: string): Promise<string | null> {
  const result = await dialog.showSaveDialog({
    title: "Guardar paquete de actualización .ZIP",
    defaultPath: defaultFileName || "update.zip",
    filters: [{ name: "Archivo ZIP de actualización", extensions: ["zip"] }],
  });

  if (result.canceled) return null;
  return result.filePath;
}

/**
 * Lee el manifiesto local existente (modpack/manifest.json o manifest.json).
 */
export async function handleGetLocalManifestData(_event: IpcMainInvokeEvent): Promise<any> {
  const candidates = [path.join(process.cwd(), "modpack", "manifest.json"), path.join(process.cwd(), "manifest.json")];

  for (const p of candidates) {
    if (await fs.pathExists(p)) {
      try {
        return await fs.readJson(p);
      } catch (e: any) {
        log.warn("creator", `Error al leer ${p}: ${e.message}`);
      }
    }
  }

  return {
    modpack: "Cemele Modpack",
    latestVersion: "1.0.0",
    updates: [],
  };
}

/**
 * Abre el archivo o su carpeta contenedora en el explorador de archivos.
 */
export async function handleOpenItemInFolder(_event: IpcMainInvokeEvent, fullPath: string): Promise<void> {
  if (await fs.pathExists(fullPath)) {
    shell.showItemInFolder(fullPath);
  }
}

/**
 * Empaqueta visualmente la actualización:
 * 1. Genera steps.txt
 * 2. Copia los archivos a assets/
 * 3. Comprime todo en el ZIP seleccionado
 * 4. Calcula el hash SHA-256
 * 5. Actualiza automáticamente modpack/manifest.json y manifest.json
 */
export async function handlePackageUpdate(
  _event: IpcMainInvokeEvent,
  data: PackageUpdateRequest,
): Promise<{ success: boolean; sha256?: string; zipPath?: string; size?: number; error?: string }> {
  log.stage(`EMPAQUETANDO ACTUALIZACIÓN VISUAL v${data.version}`);

  const version = (data.version || "").trim();
  if (!version) {
    return { success: false, error: "Debes indicar un número de versión válido (ej. 1.1.0)." };
  }

  if (!data.actions || data.actions.length === 0) {
    return { success: false, error: "Debes añadir al menos una acción (mod, config o borrado) para la actualización." };
  }

  if (!data.destinationZipPath) {
    return { success: false, error: "No se indicó la ruta de guardado del archivo ZIP." };
  }

  const stagingDir = path.join(getTempDir(), `creator-${version}-${Date.now()}`);
  const assetsDir = path.join(stagingDir, "assets");

  try {
    await fs.ensureDir(stagingDir);
    await fs.ensureDir(assetsDir);

    const stepsLines: string[] = [
      `# =============================================================`,
      `# ACTUALIZACIÓN v${version} - Generada con Creator Studio`,
      `# Fecha: ${new Date().toISOString()}`,
      `# =============================================================`,
      ``,
    ];

    for (let i = 0; i < data.actions.length; i++) {
      const action = data.actions[i];
      const targetClean = action.targetPath.replace(/^[/\\]+/, "").trim();

      if (action.type === "DELETE") {
        stepsLines.push(`DELETE "${targetClean}"`);
      } else {
        if (!action.localSourcePath || !(await fs.pathExists(action.localSourcePath))) {
          throw new Error(`El archivo de origen no existe: "${action.localSourcePath || "desconocido"}"`);
        }

        // Destino dentro de assets/ en el zip
        const destInStaging = path.join(assetsDir, targetClean);
        await fs.ensureDir(path.dirname(destInStaging));

        const stat = await fs.stat(action.localSourcePath);
        if (stat.isDirectory()) {
          await fs.copy(action.localSourcePath, destInStaging);
        } else {
          await fs.copyFile(action.localSourcePath, destInStaging);
        }

        const zipRelativePath = `assets/${targetClean}`;
        stepsLines.push(`${action.type} "${zipRelativePath}" "${targetClean}"`);
      }
    }

    // Escribir steps.txt en la raíz del staging
    const stepsPath = path.join(stagingDir, "steps.txt");
    await fs.writeFile(stepsPath, stepsLines.join("\n"), "utf-8");

    // Comprimir en el ZIP de destino
    log.info("creator", `Comprimiendo paquete en: ${data.destinationZipPath}`);
    await fs.ensureDir(path.dirname(data.destinationZipPath));

    const zip = new AdmZip();
    zip.addLocalFile(stepsPath);

    // Añadir carpeta assets
    if (await fs.pathExists(assetsDir)) {
      const assetEntries = await fs.readdir(assetsDir);
      for (const entry of assetEntries) {
        const fullEntry = path.join(assetsDir, entry);
        const st = await fs.stat(fullEntry);
        if (st.isDirectory()) {
          zip.addLocalFolder(fullEntry, path.join("assets", entry));
        } else {
          zip.addLocalFile(fullEntry, "assets");
        }
      }
    }

    zip.writeZip(data.destinationZipPath);

    // Calcular SHA-256
    const sha256 = await calculateFileSha256(data.destinationZipPath);
    const zipStat = await fs.stat(data.destinationZipPath);

    log.info("creator", `✅ Paquete generado con éxito. SHA-256: ${sha256}`);

    // Resolver URL de GitHub Release a partir de GITHUB_REPOSITORY_URL
    const zipFileName = path.basename(data.destinationZipPath);
    const ghRepo = parseGitHubRepo(process.env.GITHUB_REPOSITORY_URL);
    const downloadUrl = ghRepo
      ? `https://github.com/${ghRepo.owner}/${ghRepo.repo}/releases/download/v${version}/${zipFileName}`
      : `https://github.com/TU_USUARIO/TU_REPO/releases/download/v${version}/${zipFileName}`;

    const manifestEntry = {
      version,
      name: data.name || `Actualización v${version}`,
      releaseDate: new Date().toISOString().split("T")[0],
      url: downloadUrl,
      sha256,
      size: zipStat.size,
      changelog: data.changelog && data.changelog.length > 0 ? data.changelog : [`Actualización v${version}`],
    };

    // Actualizar archivos de manifiesto locales en el proyecto
    const manifestPaths = [path.join(process.cwd(), "modpack", "manifest.json"), path.join(process.cwd(), "manifest.json")];

    for (const mp of manifestPaths) {
      try {
        let manifest: any = { modpack: "Cemele Modpack", latestVersion: version, updates: [] };
        if (await fs.pathExists(mp)) {
          manifest = await fs.readJson(mp);
        }

        manifest.latestVersion = version;
        if (!Array.isArray(manifest.updates)) manifest.updates = [];

        const existingIdx = manifest.updates.findIndex((u: any) => u.version === version);
        if (existingIdx >= 0) {
          manifest.updates[existingIdx] = { ...manifest.updates[existingIdx], ...manifestEntry };
        } else {
          manifest.updates.push(manifestEntry);
        }

        await fs.ensureDir(path.dirname(mp));
        await fs.writeJson(mp, manifest, { spaces: 2 });
        log.info("creator", `✅ Manifiesto actualizado: ${mp}`);
      } catch (err: any) {
        log.warn("creator", `No se pudo actualizar ${mp}: ${err.message}`);
      }
    }

    return {
      success: true,
      sha256,
      zipPath: data.destinationZipPath,
      size: zipStat.size,
    };
  } catch (err: any) {
    log.error("creator", `Fallo al empaquetar actualización: ${err.message}`, err);
    return { success: false, error: err.message };
  } finally {
    await fs.remove(stagingDir).catch(() => {});
  }
}
