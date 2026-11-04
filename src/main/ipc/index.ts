import { ipcMain, BrowserWindow } from "electron";
import { handleGetServerConfig, handleSetServerConfig } from "./handlers/config";
import { handleMicrosoftLogin, handleOfflineLogin, handleGetSession, handleLogout } from "./handlers/auth";
import { handleCheckInstallation, handleInstallModpack } from "./handlers/installer";
import { handleLaunchGame, handleOpenModsFolder } from "./handlers/launcher";
import { handleMinimizeWindow, handleCloseWindow } from "./handlers/window";
import {
  handleVerifyCreatorPin,
  handleSelectFilesDialog,
  handleSelectSaveZipDialog,
  handleGetLocalManifestData,
  handlePackageUpdate,
  handleOpenItemInFolder,
} from "./handlers/creator";

export function registerIpcHandlers(mainWindow: BrowserWindow) {
  // ========== CONFIGURACIÓN ==========
  ipcMain.handle("get-server-config", handleGetServerConfig);
  ipcMain.handle("set-server-config", handleSetServerConfig);

  // ========== AUTENTICACIÓN ==========
  ipcMain.handle("microsoft-login", handleMicrosoftLogin);
  ipcMain.handle("offline-login", handleOfflineLogin);
  ipcMain.handle("get-session", handleGetSession);
  ipcMain.handle("logout", handleLogout);

  // ========== INSTALACIÓN ==========
  ipcMain.handle("check-installation", handleCheckInstallation);

  // Como necesita la ventana, lo envolvemos así:
  ipcMain.handle("install-modpack", () => handleInstallModpack(mainWindow));

  // ========== LANZADOR ==========
  ipcMain.handle("launch-game", () => handleLaunchGame(mainWindow));
  ipcMain.handle("open-mods-folder", handleOpenModsFolder);

  // ========== CONTROL DE VENTANA ==========
  ipcMain.handle("minimize-window", () => handleMinimizeWindow(mainWindow));
  ipcMain.handle("close-window", () => handleCloseWindow(mainWindow));

  // ========== MODO CREADOR (STUDIO) ==========
  ipcMain.handle("verify-creator-pin", handleVerifyCreatorPin);
  ipcMain.handle("select-files-dialog", handleSelectFilesDialog);
  ipcMain.handle("select-save-zip-dialog", handleSelectSaveZipDialog);
  ipcMain.handle("get-local-manifest-data", handleGetLocalManifestData);
  ipcMain.handle("package-update", handlePackageUpdate);
  ipcMain.handle("open-item-in-folder", handleOpenItemInFolder);
}
