import path from "path";
import os from "os";
import fs from "fs-extra";

// Cargar .env al inicio (se resuelve desde dist/main/config -> root)
require("dotenv").config({ path: path.join(__dirname, '../../../.env') });

export interface ServerConfig {
  name: string;
  version: string;
  forgeVersion: string;
  javaVersion: string;
  baseUrl: string;
  modsListUrl: string;
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

export const DEFAULT_CONFIG: ServerConfig = {
  name: getEnv("MODPACK_NAME", "Cemele Modpack"),
  version: getEnv("MINECRAFT_VERSION", "1.20.6"),
  forgeVersion: getEnv("FORGE_VERSION", "47.2.20"),
  javaVersion: getEnv("JAVA_VERSION", "17.0.9+9"),
  baseUrl: getEnv("SERVER_BASE_URL", "https://soyaldo.github.io/example-modpack/"),
  modsListUrl: getEnv("SERVER_MODS_LIST_URL", "https://soyaldo.github.io/example-modpack/mods.json"),
  serverIcon: process.env["SERVER_ICON_URL"] || undefined,
  ramMin: getEnv("RAM_MIN", "2G"),
  ramMax: getEnv("RAM_MAX", "4G"),
  forgeInstallerUrl: process.env["FORGE_INSTALLER_URL"] || undefined,
  javaDownloadUrl: process.env["JAVA_DOWNLOAD_URL"] || undefined,
};

export function loadConfig(): ServerConfig {
  try {
    const configPath = path.join(os.homedir(), "AppData", "Roaming", ".cemele-launcher", "server-config.json");

    if (fs.existsSync(configPath)) {
      const fileConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      // SOLO cargar las configuraciones del usuario desde el archivo.
      // Así evitamos que un 'forgeVersion' o 'modsListUrl' viejo guardado sobrescriba el .env
      return { 
        ...DEFAULT_CONFIG, 
        ramMin: fileConfig.ramMin || DEFAULT_CONFIG.ramMin,
        ramMax: fileConfig.ramMax || DEFAULT_CONFIG.ramMax,
        lastUsername: fileConfig.lastUsername || DEFAULT_CONFIG.lastUsername
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
