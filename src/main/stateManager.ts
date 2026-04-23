import { loadConfig, ServerConfig } from './config/server-config';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';

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
  private state: AppState;
  private sessionPath = path.join(os.homedir(), 'AppData', 'Roaming', '.cemele-launcher', 'session.json');

  constructor() {
    this.state = {
      currentSession: this.loadSession(),
      serverConfig: loadConfig(),
    };
  }

  private loadSession(): any | null {
    try {
      if (fs.existsSync(this.sessionPath)) {
        return fs.readJsonSync(this.sessionPath);
      }
    } catch (e) {
      console.error('Error loading session:', e);
    }
    return null;
  }

  private saveSession(session: any | null): void {
    try {
      if (session) {
        fs.ensureDirSync(path.dirname(this.sessionPath));
        fs.writeJsonSync(this.sessionPath, session, { spaces: 2 });
      } else {
        if (fs.existsSync(this.sessionPath)) {
          fs.removeSync(this.sessionPath);
        }
      }
    } catch (e) {
      console.error('Error saving session:', e);
    }
  }

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
    
    if (key === 'currentSession') {
      this.saveSession(value);
    }
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