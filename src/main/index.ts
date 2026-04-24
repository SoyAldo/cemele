import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { registerIpcHandlers } from './ipc';
import { initLogger, closeLogger, log } from './utils/logger';

// Inicializar logger ANTES de cualquier otra cosa
initLogger().catch((e) => {
  console.error('[index] No se pudo inicializar el logger:', e);
});

let mainWindow: BrowserWindow;

function createWindow() {
  log.stage('Creando ventana principal');

  mainWindow = new BrowserWindow({
    width: 1000,
    height: 650,
    minWidth: 800,
    minHeight: 500,
    frame: false,
    transparent: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Cargar UI
  if (process.env.NODE_ENV === 'development') {
    log.info('index', 'Modo desarrollo → cargando http://localhost:5173');
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const htmlPath = path.join(__dirname, '../renderer/index.html');
    log.info('index', `Modo producción → cargando ${htmlPath}`);
    mainWindow.loadFile(htmlPath);
  }

  mainWindow.once('ready-to-show', () => {
    log.info('index', 'Ventana lista para mostrar');
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    log.info('index', 'Ventana cerrada');
  });

  // Registrar handlers IPC
  registerIpcHandlers(mainWindow);
  log.info('index', 'IPC handlers registrados');
}

app.whenReady().then(() => {
  log.stage('Electron app ready');
  createWindow();
});

app.on('window-all-closed', () => {
  log.info('index', 'Todas las ventanas cerradas');
  closeLogger();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
