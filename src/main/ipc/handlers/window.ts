import { BrowserWindow } from 'electron';
import { log } from '../../utils/logger';

/**
 * Minimiza la ventana principal de la aplicación.
 * @param mainWindow Ventana principal.
 */
export function handleMinimizeWindow(mainWindow: BrowserWindow) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  } else {
    log.warn('window', 'Intento de minimizar una ventana que no existe o está destruida');
  }
}

/**
 * Cierra la ventana principal de la aplicación.
 * @param mainWindow Ventana principal.
 */
export function handleCloseWindow(mainWindow: BrowserWindow) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    log.info('window', 'Cerrando aplicación desde el botón de la UI');
    mainWindow.close();
  }
}