import { IpcMainInvokeEvent, BrowserWindow } from "electron";

import { log } from "../../utils/logger";
import { appState } from "../../stateManager";

import { isJavaInstalled, installJava } from "../../java/java-downloader";
import {
  getGameDir,
  isMinecraftInstalled,
  installMinecraft,
  installForge,
  downloadMods,
  downloadConfigs,
  downloadOthers,
  verifyModsSync,
  verifyConfigsSync,
  verifyOthersSync,
} from "../../minecraft/minecraft-installer";
import { checkUpdatesStatus, applyAllPendingUpdates } from "../../minecraft/updater-patcher";

/**
 * Verifica si el juego, Java, y los archivos del modpack están instalados y al día con el manifest.
 */
export async function handleCheckInstallation(_event?: IpcMainInvokeEvent) {
  log.info("check", "Verificando instalación y actualizaciones...");

  try {
    const serverConfig = appState.get("serverConfig");
    const gameDir = getGameDir();

    const hasJava = await isJavaInstalled(gameDir);
    const hasMinecraft = await isMinecraftInstalled(serverConfig);

    // 1. Verificación primaria: Sistema de Manifest y Releases
    let needsUpdate = false;
    let hasMods = false;
    let currentVersion: string | null = null;
    let latestVersion: string | null = null;
    let pendingUpdatesCount = 0;

    try {
      const updateStatus = await checkUpdatesStatus(serverConfig, gameDir);
      currentVersion = updateStatus.currentVersion;
      latestVersion = updateStatus.latestVersion;
      pendingUpdatesCount = updateStatus.pendingUpdates.length;

      if (updateStatus.latestVersion) {
        // El manifest remoto existe y respondió
        if (updateStatus.isUpToDate) {
          hasMods = true;
          needsUpdate = false;
        } else {
          hasMods = false;
          needsUpdate = true;
        }
      } else {
        // Si el modpack usa GitHub/Manifest y no se pudo obtener latestVersion
        if (serverConfig.githubRepositoryUrl || serverConfig.manifestUrl) {
          if (currentVersion) {
            log.info("check", `Modo offline-safe: versión local instalada v${currentVersion}, pero sin conexión al manifiesto.`);
            hasMods = true;
            needsUpdate = false;
          } else {
            hasMods = false;
            needsUpdate = true;
          }
        } else {
          // Fallback a verificación legacy
          const legacyMods = await verifyModsSync(serverConfig, gameDir);
          const legacyConfigs = await verifyConfigsSync(serverConfig, gameDir);
          const legacyOthers = await verifyOthersSync(serverConfig, gameDir);
          hasMods = legacyMods && legacyConfigs && legacyOthers;
        }
      }
    } catch (e: any) {
      log.warn("check", `Verificación con manifest no disponible: ${e.message}. Usando verificación local.`);
      const legacyMods = await verifyModsSync(serverConfig, gameDir);
      hasMods = legacyMods;
    }

    log.info(
      "check",
      `Java: ${hasJava} | Minecraft: ${hasMinecraft} | Mods/Updates: ${hasMods} | Versión Local: ${currentVersion || "ninguna"} | Última: ${latestVersion || "desconocida"}`,
    );

    const isFullyInstalled = hasJava && hasMinecraft && hasMods && !needsUpdate;

    return {
      installed: isFullyInstalled,
      hasJava,
      hasMinecraft,
      hasMods,
      needsUpdate,
      currentVersion,
      latestVersion,
      pendingUpdatesCount,
      gameDir,
      version: currentVersion || serverConfig.version,
    };
  } catch (error: any) {
    log.error("check", "Error verificando instalación", error);
    return { installed: false, error: error.message };
  }
}

/**
 * Orquesta toda la instalación del modpack y la aplicación de actualizaciones del manifest.
 */
export async function handleInstallModpack(mainWindow: BrowserWindow) {
  const serverConfig = appState.get("serverConfig");
  const gameDir = getGameDir();

  log.stage("INSTALACIÓN O ACTUALIZACIÓN DEL MODPACK");
  log.info("install", `gameDir: ${gameDir}`);

  try {
    // 1. Java (0% al 20%)
    if (!(await isJavaInstalled(gameDir))) {
      log.stage("Instalando Java");
      await installJava(gameDir, serverConfig, (pct, msg) => {
        log.info("java", `[${pct}%] ${msg}`);
        mainWindow.webContents.send("install-progress", {
          stage: "java",
          percentage: Math.round(pct * 0.2),
          message: msg,
        });
      });
    } else {
      log.info("java", "Java ya está instalado, saltando.");
      mainWindow.webContents.send("install-progress", {
        stage: "java",
        percentage: 20,
        message: "Java comprobado",
      });
    }

    // 2. Minecraft Vanilla (20% al 45%)
    log.stage("Instalando Minecraft vanilla");
    await installMinecraft(serverConfig, (pct, msg) => {
      log.info("minecraft", `[${pct}%] ${msg}`);
      mainWindow.webContents.send("install-progress", {
        stage: "minecraft",
        percentage: 20 + Math.round(pct * 0.25),
        message: msg,
      });
    });

    // 3. ModLoader: Forge, NeoForge o Fabric (45% al 65%)
    if (!(await isMinecraftInstalled(serverConfig))) {
      log.stage(`Instalando ${serverConfig.modLoader}`);
      await installForge(serverConfig, (pct, msg) => {
        log.info("forge", `[${pct}%] ${msg}`);
        mainWindow.webContents.send("install-progress", {
          stage: "forge",
          percentage: 45 + Math.round(pct * 0.2),
          message: msg,
        });
      });
    } else {
      log.info("forge", `${serverConfig.modLoader} ya está instalado, saltando.`);
      mainWindow.webContents.send("install-progress", {
        stage: "forge",
        percentage: 65,
        message: `${serverConfig.modLoader} comprobado`,
      });
    }

    // 4. Sistema de Actualizaciones por Manifest (65% al 100%)
    log.stage("Comprobando actualizaciones del modpack");
    let usedManifest = false;
    let updateStatus = null;

    try {
      updateStatus = await checkUpdatesStatus(serverConfig, gameDir);
    } catch (checkErr: any) {
      log.warn("updates", `No se pudo consultar el manifest de actualizaciones: ${checkErr.message}`);
    }

    if (updateStatus && updateStatus.latestVersion) {
      usedManifest = true;
      if (updateStatus.pendingUpdates.length > 0) {
        log.stage(`Aplicando ${updateStatus.pendingUpdates.length} paquetes de actualización vía Manifest`);
        await applyAllPendingUpdates(
          serverConfig,
          gameDir,
          (pct, msg) => {
            log.info("updates", `[${pct}%] ${msg}`);
            mainWindow.webContents.send("install-progress", {
              stage: "updates",
              percentage: 65 + Math.round(pct * 0.35),
              message: msg,
            });
          },
          updateStatus,
        );
      } else if (!updateStatus.isUpToDate) {
        throw new Error(
          `La versión más reciente es v${updateStatus.latestVersion}, pero no se encontraron paquetes para actualizar desde v${updateStatus.currentVersion || "base"}.`,
        );
      } else {
        log.info("updates", "El modpack ya se encuentra en la versión más reciente.");
      }
    } else if (serverConfig.githubRepositoryUrl || serverConfig.manifestUrl) {
      throw new Error(
        "No se pudo conectar con el servidor de actualizaciones en GitHub. Comprueba tu conexión a internet o intenta nuevamente.",
      );
    }

    // 5. Fallback a mods.json legacy si el manifest no fue utilizado
    if (!usedManifest) {
      log.info("install", "Ejecutando sincronización de mods clásica (fallback)...");

      await downloadMods(serverConfig, (pct, msg) => {
        mainWindow.webContents.send("install-progress", {
          stage: "mods",
          percentage: 65 + Math.round(pct * 0.2),
          message: msg,
        });
      });

      await downloadConfigs(serverConfig, (pct, msg) => {
        mainWindow.webContents.send("install-progress", {
          stage: "configs",
          percentage: 85 + Math.round(pct * 0.1),
          message: msg,
        });
      });

      await downloadOthers(serverConfig, (pct, msg) => {
        mainWindow.webContents.send("install-progress", {
          stage: "mods",
          percentage: 95 + Math.round(pct * 0.05),
          message: msg,
        });
      });
    }

    log.info("install", "✅ Instalación/Actualización completada exitosamente");
    mainWindow.webContents.send("install-progress", {
      stage: "updates",
      percentage: 100,
      message: "¡Completado con éxito!",
    });
    mainWindow.webContents.send("install-complete", { success: true });
    return { success: true };
  } catch (error: any) {
    log.error("install", `❌ Instalación fallida: ${error.message}`, error);
    mainWindow.webContents.send("install-error", { error: error.message });
    return { success: false, error: error.message };
  }
}
