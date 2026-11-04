import { getServerConfigPath, migrateLegacyDataIfNeeded } from "../utils/paths";
import path from "path";
import os from "os";
import fs from "fs-extra";

// Cargar .env al inicio (se resuelve desde dist/main/config -> root)
require("dotenv").config({ path: path.join(__dirname, "../../../.env") });

export type ModLoaderType = "FORGE" | "NEOFORGE" | "FABRIC";

export function normalizeModLoader(raw?: string): ModLoaderType {
  const normalized = (raw || "").trim().toUpperCase();
  if (normalized === "FABRIC") return "FABRIC";
  if (normalized === "NEOFORGE" || normalized === "NEO_FORGE") return "NEOFORGE";
  return "FORGE";
}

export interface ServerConfig {
  name: string;
  version: string;
  modLoader: ModLoaderType;
  modLoaderVersion?: string;
  forgeVersion: string; // Mantenido por retrocompatibilidad
  javaVersion: string;
  baseUrl: string;
  modsListUrl: string;
  githubRepositoryUrl?: string;
  manifestUrl?: string;
  serverIcon?: string;
  ramMin: string;
  ramMax: string;
  lastUsername?: string;
  // Opcional: URLs forzadas
  forgeInstallerUrl?: string;
  javaDownloadUrl?: string;
}

// Lee desde process.env con valores por defecto
function getEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

/**
 * Extrae el usuario/organización y el nombre del repositorio a partir de una URL o slug de GitHub.
 * Ejemplos aceptados:
 * - https://github.com/Usuario/MiRepo
 * - https://github.com/Usuario/MiRepo.git
 * - github.com/Usuario/MiRepo
 * - Usuario/MiRepo
 */
export function parseGitHubRepo(urlOrSlug?: string): { owner: string; repo: string } | null {
  if (!urlOrSlug) return null;
  const cleaned = urlOrSlug
    .trim()
    .replace(/\.git\/?$/, "")
    .replace(/\/+$/, "");
  const match = cleaned.match(/(?:https?:\/\/)?(?:github\.com\/|raw\.githubusercontent\.com\/)?([^/\s]+)\/([^/\s]+)/);
  if (match) {
    return {
      owner: match[1],
      repo: match[2],
    };
  }
  return null;
}

/**
 * Genera la lista ordenada de URLs candidatas para buscar el manifest.json o README.md en GitHub raw.
 */
export function getManifestUrlsFromRepo(githubRepoUrl?: string): string[] {
  const parsed = parseGitHubRepo(githubRepoUrl);
  if (!parsed) return [];

  const { owner, repo } = parsed;
  const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/refs/heads/main`;

  return [`${rawBase}/README.md`, `${rawBase}/manifest.json`, `${rawBase}/modpack/manifest.json`];
}

const envGithubRepo = getEnv("GITHUB_REPOSITORY_URL", "");
const candidateManifestUrls = getManifestUrlsFromRepo(envGithubRepo);
const defaultManifestUrl = candidateManifestUrls.length > 0 ? candidateManifestUrls[0] : getEnv("SERVER_MANIFEST_URL", getEnv("SERVER_BASE_URL", ""));

const envModLoader = normalizeModLoader(process.env["MOD_LOADER"]);
const envModLoaderVersion = process.env["MOD_LOADER_VERSION"] || undefined;

export const DEFAULT_CONFIG: ServerConfig = {
  name: getEnv("MODPACK_NAME", "Cemele Modpack"),
  version: getEnv("MINECRAFT_VERSION", "1.20.1"),
  modLoader: envModLoader,
  modLoaderVersion: envModLoaderVersion,
  forgeVersion: process.env["FORGE_VERSION"] || envModLoaderVersion || "47.2.20",
  javaVersion: getEnv("JAVA_VERSION", "21.0.3+9"),
  baseUrl: getEnv("SERVER_BASE_URL", ""),
  modsListUrl: getEnv("SERVER_MODS_LIST_URL", ""),
  githubRepositoryUrl: envGithubRepo || undefined,
  manifestUrl: defaultManifestUrl,
  serverIcon: process.env["SERVER_ICON_URL"] || undefined,
  ramMin: getEnv("RAM_MIN", "2G"),
  ramMax: getEnv("RAM_MAX", "4G"),
  forgeInstallerUrl: process.env["FORGE_INSTALLER_URL"] || process.env["NEOFORGE_INSTALLER_URL"] || undefined,
  javaDownloadUrl: process.env["JAVA_DOWNLOAD_URL"] || undefined,
};

export function loadConfig(): ServerConfig {
  try {
    migrateLegacyDataIfNeeded();
    const configPath = getServerConfigPath();

    if (fs.existsSync(configPath)) {
      const fileConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      return {
        ...DEFAULT_CONFIG,
        modLoader: fileConfig.modLoader ? normalizeModLoader(fileConfig.modLoader) : DEFAULT_CONFIG.modLoader,
        modLoaderVersion: fileConfig.modLoaderVersion !== undefined ? fileConfig.modLoaderVersion : DEFAULT_CONFIG.modLoaderVersion,
        githubRepositoryUrl: fileConfig.githubRepositoryUrl || DEFAULT_CONFIG.githubRepositoryUrl,
        manifestUrl: fileConfig.manifestUrl || DEFAULT_CONFIG.manifestUrl,
        ramMin: fileConfig.ramMin || DEFAULT_CONFIG.ramMin,
        ramMax: fileConfig.ramMax || DEFAULT_CONFIG.ramMax,
        lastUsername: fileConfig.lastUsername || DEFAULT_CONFIG.lastUsername,
      };
    }
  } catch (e) {
    console.log("No se encontró config personalizada o hubo un error al leer, usando .env");
  }
  return DEFAULT_CONFIG;
}

// Para debug: mostrar config cargada
export function debugConfig(): void {
  console.log("=== CONFIGURACIÓN CARGADA ===");
  console.log(JSON.stringify(DEFAULT_CONFIG, null, 2));
  console.log("=============================");
}
