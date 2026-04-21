import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { registerIpcHandlers } from './ipc-handlers';

let mainWindow: BrowserWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 650,
    minWidth: 800,
    minHeight: 500,
    frame: false,        // Sin bordes de Windows
    transparent: true,   // Para esquinas redondeadas
    resizable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),  // ← CRÍTICO
      contextIsolation: true,                      // ← CRÍTICO
      nodeIntegration: false,                      // ← CRÍTICO
      sandbox: true
    }
  });

  // Cargar UI
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Registrar handlers IPC
  registerIpcHandlers(mainWindow);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});