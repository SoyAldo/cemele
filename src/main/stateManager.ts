import { loadConfig, ServerConfig } from './config/server-config';

/**
 * Interfaz que define el estado actual de la aplicación.
 */
export interface AppState {
  currentSession: any | null;
  serverConfig: ServerConfig;
}

/**
 * Gestor de estado de la aplicación.
 */
class StateManager {
  private state: AppState = {
    currentSession: null,
    serverConfig: loadConfig(),
  };

  /**
   * Obtiene un valor del estado actual de la aplicación.
   * @param key La clave del valor a obtener.
   * @returns El valor correspondiente a la clave.
   */
  get<K extends keyof AppState>(key: K): AppState[K] {
    return this.state[key];
  }

  /**
   * Actualiza un valor del estado actual de la aplicación.
   * @param key La clave del valor a actualizar.
   * @param value El nuevo valor.
   */
  set<K extends keyof AppState>(key: K, value: AppState[K]): void {
    this.state[key] = value;
    // Aquí podrías agregar lógica extra, como emitir un evento al Logger
    // log.info('state', `Estado actualizado: ${key} = ${value}`);
  }

  /**
   * Obtiene el estado actual de la aplicación.
   * @returns {AppState} El estado actual de la aplicación.
   */
  getAll(): AppState {
    return { ...this.state };
  }
}

/**
 * Instancia única del gestor de estado de la aplicación.
 */
export const appState = new StateManager();