import { IpcMainInvokeEvent } from 'electron';
import fs from 'fs-extra';
import { log } from '../../utils/logger';
import { appState } from '../../stateManager';
import { ServerConfig } from '../../config/server-config';
import { getLauncherDataDir, getServerConfigPath } from '../../utils/paths';

/**
 * Maneja la actualización y guardado de la configuración del servidor.
 */
export async function handleSetServerConfig(
  _event: IpcMainInvokeEvent, 
  config: ServerConfig
): Promise<boolean> {
  log.info('config', 'Actualizando configuración del servidor...');

  try {
    // 1. Actualizar el estado global en memoria (instantáneo para el resto de la app)
    appState.set('serverConfig', config);

    // 2. Definir la ruta de guardado en assets/launcher/server-config.json
    const configDir = getLauncherDataDir();
    const configPath = getServerConfigPath();

    // 3. Asegurar que el directorio exista y escribir el archivo
    await fs.ensureDir(configDir);    
    await fs.writeJson(configPath, config, { spaces: 2 });

    log.info('config', `Configuración guardada exitosamente en: ${configPath}`);
    return true;
  } catch (error: any) {
    log.error('config', 'Error al guardar la configuración en disco', error);
    return false; 
  }
}

/**
 * Maneja la obtención de la configuración actual.
 */
export function handleGetServerConfig(_event?: IpcMainInvokeEvent): ServerConfig {
  return appState.get('serverConfig');
}
