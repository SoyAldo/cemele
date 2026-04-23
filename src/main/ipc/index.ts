import { ipcMain, BrowserWindow } from 'electron';
import { handleGetServerConfig, handleSetServerConfig } from './handlers/config';
import { handleMicrosoftLogin, handleGetSession, handleLogout } from './handlers/auth';
import { handleCheckInstallation, handleInstallModpack } from './handlers/installer';
import { handleLaunchGame } from './handlers/launcher';
import { handleMinimizeWindow, handleCloseWindow } from './handlers/window';

export function registerIpcHandlers(mainWindow: BrowserWindow) {
  // ========== CONFIGURACIÓN ==========
  ipcMain.handle('get-server-config', handleGetServerConfig);  
  ipcMain.handle('set-server-config', handleSetServerConfig);

  // ========== AUTENTICACIÓN ==========
  ipcMain.handle('microsoft-login', handleMicrosoftLogin);
  ipcMain.handle('get-session', handleGetSession);
  ipcMain.handle('logout', handleLogout);

  // ========== INSTALACIÓN ==========
  ipcMain.handle('check-installation', handleCheckInstallation);
  
  // Como necesita la ventana, lo envolvemos así:
  ipcMain.handle('install-modpack', () => handleInstallModpack(mainWindow));

  // ========== LANZADOR ==========
  ipcMain.handle('launch-game', () => handleLaunchGame(mainWindow));

  // ========== CONTROL DE VENTANA ==========
  ipcMain.handle('minimize-window', () => handleMinimizeWindow(mainWindow));
  ipcMain.handle('close-window', () => handleCloseWindow(mainWindow));
}