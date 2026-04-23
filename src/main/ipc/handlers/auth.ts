import { IpcMainInvokeEvent } from 'electron';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { log } from '../../utils/logger';
import { appState } from '../../stateManager';

/**
 * Maneja el inicio de sesión con Microsoft.
 */
export async function handleMicrosoftLogin(_event: IpcMainInvokeEvent) {
  log.stage('Autenticación Microsoft');
  
  try {
    // MOCK temporal para testing
    const mockSession = {
      username: 'JugadorTest',
      uuid: '00000000-0000-0000-0000-000000000000',
      accessToken: 'mock_token_' + Date.now()
    };

    // Actualizamos el estado global para que launcher.ts pueda verlo
    appState.set('currentSession', mockSession);

    log.info('auth', `Login mock exitoso: ${mockSession.username}`);
    return { success: true, session: mockSession };
    
  } catch (error: any) {
    log.error('auth', 'Login fallido', error);
    return { success: false, error: error.message };
  }
}

/**
 * Maneja el inicio de sesión offline (nombre personalizado).
 */
export async function handleOfflineLogin(_event: IpcMainInvokeEvent, username: string) {
  log.stage('Autenticación Offline');
  
  if (!username || username.trim().length === 0) {
    return { success: false, error: 'El nombre de usuario es obligatorio' };
  }

  try {
    const session = {
      username: username.trim(),
      uuid: '00000000-0000-0000-0000-000000000000', // UUID genérico para offline
      accessToken: 'offline_token_' + Date.now()
    };

    appState.set('currentSession', session);

    // Guardar el último nombre en la configuración
    const config = appState.get('serverConfig');
    const newConfig = { ...config, lastUsername: session.username };
    appState.set('serverConfig', newConfig);

    const configDir = path.join(os.homedir(), 'AppData', 'Roaming', '.cemele-launcher');
    const configPath = path.join(configDir, 'server-config.json');
    await fs.ensureDir(configDir);
    await fs.writeJson(configPath, newConfig, { spaces: 2 });

    log.info('auth', `Login offline exitoso: ${session.username}`);
    return { success: true, session };
    
  } catch (error: any) {
    log.error('auth', 'Login offline fallido', error);
    return { success: false, error: error.message };
  }
}

/**
 * Devuelve la sesión actual guardada en memoria.
 */
export async function handleGetSession(_event: IpcMainInvokeEvent) {
  return appState.get('currentSession');
}

/**
 * Cierra la sesión activa borrando los datos del estado global.
 */
export async function handleLogout(_event: IpcMainInvokeEvent) {
  log.info('auth', 'Cerrando sesión de usuario');
  
  // Limpiamos el estado global
  appState.set('currentSession', null);
  
  // Retornamos vacío (o { success: true } si tu frontend lo prefiere)
  return; 
}