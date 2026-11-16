import os from "os";
import path from "path";
import fs from "fs-extra";
import crypto from "crypto";
import fetch from "node-fetch";
import { log } from "../utils/logger";
import { downloadFile } from "../utils/downloader";
import { extractZip } from "../utils/extractor";
import { getTempDir } from "../utils/paths";
import { ServerConfig, getManifestUrlsFromRepo } from "../config/server-config";

export interface UpdatePackageInfo {
  version: string;
  name?: string;
  releaseDate?: string;
  url: string;
  sha256: string;
  size?: number;
  changelog?: string[];
  mandatory?: boolean;
}

export interface ModpackManifest {
  modpack?: string;
  minecraftVersion?: string;
  forgeVersion?: string;
  latestVersion: string;
  minLauncherVersion?: string;
  updates: UpdatePackageInfo[];
}

export interface LocalVersionInfo {
  currentVersion: string | null;
  installedAt?: string;
  history?: Array<{
    version: string;
    installedAt: string;
    sha256?: string;
  }>;
}

export interface UpdateStep {
  type: "DELETE" | "COPY" | "REPLACE";
  source?: string; // Ruta dentro del ZIP
  target: string; // Ruta relativa dentro del directorio del juego
  rawLine: string;
}

export interface StepExecutionResult {
  step: UpdateStep;
  success: boolean;
  message?: string;
}

const VERSION_FILE_NAME = "version.json";

/**
 * Obtiene la ruta del archivo local version.json dentro del directorio del juego.
 */
export function getLocalVersionPath(gameDir: string): string {
  return path.join(gameDir, VERSION_FILE_NAME);
}

/**
 * Lee la versión actualmente instalada en el cliente.
 */
export async function getLocalVersion(gameDir: string): Promise<LocalVersionInfo> {
  const versionPath = getLocalVersionPath(gameDir);
  try {
    if (await fs.pathExists(versionPath)) {
      const data = await fs.readJson(versionPath);
      return {
        currentVersion: data.currentVersion || null,
        installedAt: data.installedAt,
        history: Array.isArray(data.history) ? data.history : [],
      };
    }
  } catch (error: any) {
    log.warn("updater", `No se pudo leer ${versionPath}: ${error.message}`);
  }

  // Fallback: Si no existe version.json pero ya tiene carpeta mods con archivos
  const modsDir = path.join(gameDir, "mods");
  if (await fs.pathExists(modsDir)) {
    const files = await fs.readdir(modsDir);
    if (files.filter((f) => f.endsWith(".jar")).length > 0) {
      log.info("updater", "Se detectaron mods previos sin version.json (versión legacy).");
      return { currentVersion: "0.0.0", history: [] };
    }
  }

  return { currentVersion: null, history: [] };
}

/**
 * Guarda o actualiza la versión local instalada.
 */
export async function saveLocalVersion(gameDir: string, newVersion: string, sha256?: string): Promise<void> {
  const versionPath = getLocalVersionPath(gameDir);
  const currentInfo = await getLocalVersion(gameDir);

  const history = currentInfo.history || [];
  history.push({
    version: newVersion,
    installedAt: new Date().toISOString(),
    sha256,
  });

  const updatedData: LocalVersionInfo = {
    currentVersion: newVersion,
    installedAt: new Date().toISOString(),
    history,
  };

  await fs.ensureDir(gameDir);
  await fs.writeJson(versionPath, updatedData, { spaces: 2 });
  log.info("updater", `Versión local actualizada a: ${newVersion}`);
}

/**
 * Limpia errores sintácticos comunes en JSON como comas finales (trailing commas)
 * o comentarios JavaScript introducidos manualmente en manifest.json.
 */
export function sanitizeJsonString(raw: string): string {
  // 1. Eliminar comentarios multilínea (/* ... */)
  let cleaned = raw.replace(/\/\*[\s\S]*?\*\//g, "");
  // 2. Eliminar comentarios de una línea (// ...) respetando URLs http:// o https://
  cleaned = cleaned.replace(/(^|[^:])\/\/[^\r\n]*/g, "$1");
  // 3. Eliminar comas finales (trailing commas) antes de ] o }
  cleaned = cleaned.replace(/,(\s*[\]\}])/g, (_, m) => m);
  return cleaned;
}

/**
 * Descarga y parsea el archivo manifest.json remoto.
 * Admite una URL individual o un listado de URLs candidatas (por ejemplo en GitHub raw).
 * Si el archivo es un README.md o documento con texto, buscará bloques JSON internamente.
 */
export async function fetchManifest(manifestUrlOrCandidates: string | string[]): Promise<ModpackManifest> {
  const urls = Array.isArray(manifestUrlOrCandidates) ? manifestUrlOrCandidates : [manifestUrlOrCandidates];
  let lastError: Error | null = null;

  for (const url of urls) {
    try {
      log.info("updater", `Consultando manifiesto desde: ${url}`);
      const isApi = url.includes("api.github.com");
      const cacheBusterUrl = isApi ? url : (url.includes("?") ? `${url}&_t=${Date.now()}` : `${url}?_t=${Date.now()}`);

      const response = await fetch(cacheBusterUrl, {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
          "User-Agent": "CemeleLauncher",
          Accept: "application/vnd.github.v3.raw, application/json, text/plain, */*",
        },
        timeout: 10000,
      });

      if (!response.ok) {
        log.info("updater", `HTTP ${response.status} en ${url}`);
        continue;
      }

      const text = await response.text();
      let parsed: any;
      const sanitizedText = sanitizeJsonString(text);

      try {
        parsed = JSON.parse(sanitizedText);
      } catch {
        // Soporte si el manifiesto está en un bloque ```json de un README.md
        const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonBlockMatch) {
          parsed = JSON.parse(sanitizeJsonString(jsonBlockMatch[1]));
        } else {
          // Búsqueda del primer objeto JSON dentro del texto
          const firstBrace = sanitizedText.indexOf("{");
          const lastBrace = sanitizedText.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            parsed = JSON.parse(sanitizeJsonString(sanitizedText.substring(firstBrace, lastBrace + 1)));
          } else {
            throw new Error("El archivo no contiene un JSON de manifiesto válido.");
          }
        }
      }

      if (parsed && parsed.latestVersion && Array.isArray(parsed.updates)) {
        log.info("updater", `✅ Manifiesto cargado exitosamente desde: ${url} (latestVersion: ${parsed.latestVersion})`);
        return parsed as ModpackManifest;
      }
    } catch (e: any) {
      log.warn("updater", `No se pudo obtener manifest desde ${url}: ${e.message}`);
      lastError = e;
    }
  }

  throw new Error(`No se pudo cargar el manifiesto desde ninguna de las URLs probadas. ${lastError ? lastError.message : ""}`);
}

/**
 * Calcula el hash SHA-256 de un archivo en disco.
 */
export function calculateSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);

    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex").toLowerCase()));
  });
}

/**
 * Limpia y normaliza una cadena de versión eliminando prefijos 'v' y espacios.
 */
export function cleanVersion(version: string | null | undefined): string {
  if (!version) return "";
  return version.trim().replace(/^v/i, "");
}

/**
 * Compara dos versiones semánticas (por ejemplo "1.0.0" y "1.1.0").
 * Devuelve:
 *  > 0 si v1 > v2
 *  < 0 si v1 < v2
 *    0 si v1 === v2
 */
export function compareVersions(v1: string | null | undefined, v2: string | null | undefined): number {
  const c1 = cleanVersion(v1);
  const c2 = cleanVersion(v2);

  if (!c1 && !c2) return 0;
  if (!c1) return -1;
  if (!c2) return 1;
  if (c1 === c2) return 0;

  const parts1 = c1.split(/[-+]/)[0].split(".").map((n) => parseInt(n, 10) || 0);
  const parts2 = c2.split(/[-+]/)[0].split(".").map((n) => parseInt(n, 10) || 0);
  const maxLen = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < maxLen; i++) {
    const num1 = parts1[i] ?? 0;
    const num2 = parts2[i] ?? 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }

  return 0;
}

/**
 * Determina qué actualizaciones están pendientes a partir de la versión local.
 * Ordena todas las actualizaciones del manifiesto cronológicamente de menor a mayor
 * y selecciona secuencialmente todas las versiones superiores a la actual.
 */
export function getPendingUpdates(currentVersion: string | null, manifest: ModpackManifest): UpdatePackageInfo[] {
  if (!manifest.updates || !Array.isArray(manifest.updates) || manifest.updates.length === 0) {
    return [];
  }

  // Ordenar todas las actualizaciones del manifiesto de menor a mayor (ascendente)
  const sortedUpdates = [...manifest.updates].sort((a, b) => compareVersions(a.version, b.version));

  // Si no hay versión instalada, necesitamos todas las actualizaciones en orden secuencial
  if (!currentVersion || !cleanVersion(currentVersion)) {
    return sortedUpdates;
  }

  // Si la versión actual es '0.0.0' (versión legacy sin version.json), aplicar todas
  if (cleanVersion(currentVersion) === "0.0.0") {
    return sortedUpdates;
  }

  // Filtrar estrictamente las actualizaciones superiores a la versión local actual
  return sortedUpdates.filter((u) => compareVersions(u.version, currentVersion) > 0);
}

/**
 * Parsea el contenido de steps.txt línea por línea.
 */
export function parseStepsFile(content: string): UpdateStep[] {
  const steps: UpdateStep[] = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine || rawLine.startsWith("#") || rawLine.startsWith("//")) {
      continue;
    }

    const firstSpace = rawLine.indexOf(" ");
    if (firstSpace === -1) {
      log.warn("updater", `Línea ignorada por formato inválido en steps.txt (L${i + 1}): "${rawLine}"`);
      continue;
    }

    const command = rawLine.substring(0, firstSpace).toUpperCase();
    const argsString = rawLine.substring(firstSpace + 1).trim();

    if (command === "DELETE" || command === "REMOVE") {
      const cleanTarget = argsString.replace(/^["']|["']$/g, "").trim();
      steps.push({
        type: "DELETE",
        target: cleanTarget,
        rawLine,
      });
    } else if (command === "COPY" || command === "REPLACE" || command === "OVERWRITE") {
      const type: "COPY" | "REPLACE" = command === "COPY" ? "COPY" : "REPLACE";

      let source = "";
      let target = "";

      if (argsString.includes(" -> ")) {
        const parts = argsString.split(" -> ");
        source = parts[0].trim().replace(/^["']|["']$/g, "");
        target = parts[1].trim().replace(/^["']|["']$/g, "");
      } else {
        // Tokenizar respetando comillas
        const tokens: string[] = [];
        const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
        let match;
        while ((match = regex.exec(argsString)) !== null) {
          tokens.push(match[1] || match[2] || match[0]);
        }

        if (tokens.length >= 2) {
          source = tokens[0];
          target = tokens[1];
        } else {
          log.warn("updater", `Argumentos insuficientes para ${command} en L${i + 1}: "${rawLine}"`);
          continue;
        }
      }

      steps.push({
        type,
        source,
        target,
        rawLine,
      });
    } else {
      log.warn("updater", `Comando desconocido en steps.txt L${i + 1}: ${command}`);
    }
  }

  return steps;
}

/**
 * Previene vulnerabilidades de path traversal verificando que la ruta no escape de su base.
 */
function isSafeSubpath(baseDir: string, relativePath: string): boolean {
  const resolved = path.resolve(baseDir, relativePath);
  return resolved === baseDir || resolved.startsWith(baseDir + path.sep);
}

/**
 * Ejecuta una instrucción individual de steps.txt y corrobora su resultado.
 */
export async function executeStep(step: UpdateStep, extractedDir: string, gameDir: string, verbose: boolean = true): Promise<StepExecutionResult> {
  try {
    const sanitizedTarget = step.target.replace(/^[/\\]+/, "");
    if (!isSafeSubpath(gameDir, sanitizedTarget)) {
      throw new Error(`Ruta de destino insegura detectada: ${step.target}`);
    }
    const targetPath = path.resolve(gameDir, sanitizedTarget);

    if (step.type === "DELETE") {
      if (await fs.pathExists(targetPath)) {
        await fs.remove(targetPath);

        // CORROBORACIÓN: Verificar que el archivo ya no exista
        if (await fs.pathExists(targetPath)) {
          throw new Error(`No se pudo eliminar el archivo o carpeta: ${step.target}`);
        }
        if (verbose) log.info("updater", `🗑️ [DELETE] Eliminado con éxito: ${step.target}`);
        return { step, success: true, message: `Eliminado: ${step.target}` };
      } else {
        if (verbose) log.info("updater", `ℹ️ [DELETE] El archivo a eliminar no existía previamente: ${step.target}`);
        return { step, success: true, message: `Ya no existía: ${step.target}` };
      }
    }

    if (step.type === "COPY" || step.type === "REPLACE") {
      if (!step.source) {
        throw new Error(`Falta origen para la acción ${step.type}`);
      }

      const sanitizedSource = step.source.replace(/^[/\\]+/, "");
      if (!isSafeSubpath(extractedDir, sanitizedSource)) {
        throw new Error(`Ruta de origen insegura detectada en el ZIP: ${step.source}`);
      }
      const sourcePath = path.resolve(extractedDir, sanitizedSource);

      if (!(await fs.pathExists(sourcePath))) {
        throw new Error(`Archivo no encontrado dentro del ZIP: ${step.source}`);
      }

      // Asegurar que el directorio contenedor exista
      await fs.ensureDir(path.dirname(targetPath));

      const srcStat = await fs.stat(sourcePath);

      // Copiar archivo o carpeta
      await fs.copy(sourcePath, targetPath, {
        overwrite: true,
        errorOnExist: false,
      });

      // CORROBORACIÓN: Verificar que exista en destino y que coincida el tamaño
      if (!(await fs.pathExists(targetPath))) {
        throw new Error(`Fallo de corroboración: el destino ${step.target} no fue creado.`);
      }

      const destStat = await fs.stat(targetPath);
      if (srcStat.isFile()) {
        if (destStat.size !== srcStat.size) {
          throw new Error(`Fallo de integridad: tamaño de ${step.target} (${destStat.size} bytes) no coincide con el paquete (${srcStat.size} bytes).`);
        }
      }

      if (verbose) log.info("updater", `✅ [${step.type}] Aplicado y corroborado: ${step.target}`);
      return { step, success: true, message: `Aplicado: ${step.target}` };
    }

    throw new Error(`Tipo de paso no soportado: ${step.type}`);
  } catch (error: any) {
    log.error("updater", `❌ Error ejecutando paso "${step.rawLine}": ${error.message}`);
    return { step, success: false, message: error.message };
  }
}

/**
 * Busca steps.txt en el directorio extraído (directo o en subcarpetas).
 */
async function findStepsFileAndRoot(extractedDir: string): Promise<{ stepsPath: string; rootDir: string }> {
  const directSteps = path.join(extractedDir, "steps.txt");
  if (await fs.pathExists(directSteps)) {
    return { stepsPath: directSteps, rootDir: extractedDir };
  }

  // Buscar en subcarpetas si el ZIP contenía una carpeta raíz
  const entries = await fs.readdir(extractedDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const nested = path.join(extractedDir, entry.name, "steps.txt");
      if (await fs.pathExists(nested)) {
        return { stepsPath: nested, rootDir: path.join(extractedDir, entry.name) };
      }
    }
  }

  throw new Error("No se encontró el archivo steps.txt dentro del archivo ZIP de la actualización.");
}

/**
 * Descarga, verifica por SHA-256, descomprime y ejecuta una actualización individual.
 */
export async function applyUpdatePackage(
  update: UpdatePackageInfo,
  gameDir: string,
  onProgress?: (percentage: number, message: string) => void,
): Promise<{ success: boolean; details: StepExecutionResult[] }> {
  const baseTempDir = getTempDir();
  const tempDir = path.join(baseTempDir, `update-${update.version}-${Date.now()}`);
  const tempZipPath = path.join(tempDir, `update-${update.version}.zip`);
  const extractDir = path.join(tempDir, "extracted");

  log.stage(`APLICANDO ACTUALIZACIÓN v${update.version}`);
  log.info("updater", `Directorio temporal: ${tempDir}`);
  log.info("updater", `URL de descarga: ${update.url}`);
  log.info("updater", `SHA-256 esperado: ${update.sha256}`);

  await fs.ensureDir(tempDir);

  try {
    // 1. Descarga del ZIP
    if (onProgress) onProgress(10, `Descargando actualización v${update.version}...`);
    await downloadFile(update.url, tempZipPath, (p) => {
      if (onProgress) {
        onProgress(10 + Math.round(p.percentage * 0.4), `Descargando v${update.version} (${p.percentage}%)...`);
      }
    });

    // 2. FASE 1: Verificación de Integridad Criptográfica (SHA-256)
    if (onProgress) onProgress(55, `Verificando firma SHA-256 de v${update.version}...`);
    log.info("updater", "Calculando hash SHA-256 del archivo descargado...");

    const computedHash = await calculateSha256(tempZipPath);
    const expectedHash = update.sha256.trim().toLowerCase();

    if (computedHash !== expectedHash) {
      throw new Error(`Fallo de verificación de integridad (SHA-256 no coincide).\n` + `Esperado: ${expectedHash}\n` + `Obtenido: ${computedHash}`);
    }
    log.info("updater", `✅ Hash SHA-256 verificado correctamente: ${computedHash}`);

    // 3. Descompresión ultra-rápida (streaming nativo tar o fallback AdmZip)
    if (onProgress) onProgress(65, `Extrayendo archivos de v${update.version}...`);
    await fs.ensureDir(extractDir);
    const extractStartTime = Date.now();
    await extractZip(tempZipPath, extractDir);
    log.info("updater", `✅ Descompresión finalizada en ${((Date.now() - extractStartTime) / 1000).toFixed(1)}s`);

    // 4. Localizar y parsear steps.txt
    const { stepsPath, rootDir } = await findStepsFileAndRoot(extractDir);
    const stepsContent = await fs.readFile(stepsPath, "utf-8");
    const steps = parseStepsFile(stepsContent);

    log.info("updater", `Total de pasos a ejecutar: ${steps.length}`);

    // 5. FASE 2 y 3: Ejecutar y Corroborar cada paso en lotes paralelos
    const executionResults: StepExecutionResult[] = [];
    const isLargeBatch = steps.length > 50;
    const BATCH_SIZE = 30; // Concurrencia óptima para disco
    let lastProgressTime = 0;
    let lastPercent = -1;

    for (let i = 0; i < steps.length; i += BATCH_SIZE) {
      const batch = steps.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map((step) => executeStep(step, rootDir, gameDir, !isLargeBatch)));

      for (const res of batchResults) {
        executionResults.push(res);
        if (!res.success) {
          throw new Error(`Falló la corroboración del paso: ${res.message}`);
        }
      }

      const processed = Math.min(i + BATCH_SIZE, steps.length);
      const stepPct = 70 + Math.round((processed / steps.length) * 25);
      const now = Date.now();

      // Throttling de IPC para evitar saturar Chromium y congelar la interfaz
      if (onProgress && (stepPct !== lastPercent || now - lastProgressTime > 120 || processed === steps.length)) {
        lastProgressTime = now;
        lastPercent = stepPct;
        onProgress(stepPct, `Aplicando [${processed}/${steps.length}]: ${batch[0].type} ${batch[0].target}`);
      }
    }

    // 6. Guardar la nueva versión en disco
    await saveLocalVersion(gameDir, update.version, computedHash);

    if (onProgress) onProgress(100, `Actualización v${update.version} completada`);
    log.info("updater", `🎉 Actualización v${update.version} aplicada y verificada con éxito.`);

    return { success: true, details: executionResults };
  } finally {
    // Limpieza de archivos temporales
    try {
      await fs.remove(tempDir);
    } catch (e: any) {
      log.warn("updater", `No se pudo eliminar la carpeta temporal ${tempDir}: ${e.message}`);
    }
  }
}

/**
 * Consulta el estado de actualizaciones comparando local con remoto.
 */
export async function checkUpdatesStatus(
  config: ServerConfig,
  gameDir: string,
): Promise<{
  isUpToDate: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
  pendingUpdates: UpdatePackageInfo[];
  manifest?: ModpackManifest;
}> {
  const local = await getLocalVersion(gameDir);
  const candidates: string[] = [];

  if (config.githubRepositoryUrl) {
    candidates.push(...getManifestUrlsFromRepo(config.githubRepositoryUrl));
  }
  if (config.manifestUrl && !candidates.includes(config.manifestUrl)) {
    if (config.manifestUrl.toLowerCase().endsWith("readme.md")) {
      candidates.push(config.manifestUrl);
    } else {
      candidates.unshift(config.manifestUrl);
    }
  }
  if (candidates.length === 0 && config.baseUrl) {
    candidates.push(`${config.baseUrl.replace(/\/+$/, "")}/manifest.json`);
  }

  try {
    const manifest = await fetchManifest(candidates);
    const pendingUpdates = getPendingUpdates(local.currentVersion, manifest);

    const isUpToDate =
      pendingUpdates.length === 0 &&
      !!local.currentVersion &&
      !!manifest.latestVersion &&
      compareVersions(local.currentVersion, manifest.latestVersion) >= 0;

    return {
      isUpToDate,
      currentVersion: local.currentVersion,
      latestVersion: manifest.latestVersion,
      pendingUpdates,
      manifest,
    };
  } catch (error: any) {
    log.warn("updater", `No se pudo consultar el manifest de actualizaciones: ${error.message}`);
    // Si falló la consulta no podemos afirmar que esté al día
    return {
      isUpToDate: false,
      currentVersion: local.currentVersion,
      latestVersion: null,
      pendingUpdates: [],
    };
  }
}

/**
 * Aplica todas las actualizaciones pendientes de forma secuencial una tras otra.
 */
export async function applyAllPendingUpdates(
  config: ServerConfig,
  gameDir: string,
  onProgress?: (percentage: number, message: string) => void,
  preloadedStatus?: {
    isUpToDate?: boolean;
    currentVersion?: string | null;
    latestVersion?: string | null;
    pendingUpdates: UpdatePackageInfo[];
    manifest?: ModpackManifest;
  },
): Promise<{ success: boolean; appliedVersions: string[] }> {
  const status = preloadedStatus || (await checkUpdatesStatus(config, gameDir));

  if (status.isUpToDate || status.pendingUpdates.length === 0) {
    log.info("updater", "El cliente ya se encuentra en la última versión.");
    if (onProgress) onProgress(100, "El modpack ya está actualizado");
    return { success: true, appliedVersions: [] };
  }

  const pending = status.pendingUpdates;
  const total = pending.length;
  log.info("updater", `Iniciando aplicación secuencial de ${total} actualización(es) pendiente(s)...`);

  const appliedVersions: string[] = [];

  for (let i = 0; i < total; i++) {
    const update = pending[i];
    log.info("updater", `[${i + 1}/${total}] Preparando actualización v${update.version}...`);

    const updateProgressBase = Math.round((i / total) * 100);
    const updateProgressSlice = Math.round(100 / total);

    if (onProgress) {
      onProgress(updateProgressBase, `[${i + 1}/${total}] Actualización v${update.version}...`);
    }

    try {
      await applyUpdatePackage(update, gameDir, (pct, msg) => {
        if (onProgress) {
          const overall = updateProgressBase + Math.round((pct / 100) * updateProgressSlice);
          onProgress(Math.min(overall, 99), `[${i + 1}/${total}] ${msg}`);
        }
      });

      appliedVersions.push(update.version);
      log.info("updater", `✅ [${i + 1}/${total}] Actualización v${update.version} completada y registrada en version.json`);
    } catch (updateError: any) {
      log.error("updater", `❌ Error al aplicar actualización v${update.version} (${i + 1} de ${total}): ${updateError.message}`);
      throw new Error(`Error en actualización v${update.version} (${i + 1} de ${total}): ${updateError.message}`);
    }
  }

  if (onProgress) onProgress(100, `Todas las actualizaciones (${appliedVersions.join(", ")}) han sido aplicadas con éxito`);
  log.info("updater", `🎉 Se aplicaron exitosamente todas las actualizaciones: ${appliedVersions.join(" ➔ ")}`);
  return { success: true, appliedVersions };
}
