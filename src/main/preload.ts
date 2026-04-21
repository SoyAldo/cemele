import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Configuración
  getServerConfig: () => ipcRenderer.invoke('get-server-config'),
  setServerConfig: (config: any) => ipcRenderer.invoke('set-server-config', config),
  
  // Instalación
  checkInstallation: () => ipcRenderer.invoke('check-installation'),
  installModpack: () => ipcRenderer.invoke('install-modpack'),
  
  // Eventos de progreso
  onInstallProgress: (callback: (data: any) => void) => {
    ipcRenderer.on('install-progress', (_, data) => callback(data));
  },
  onInstallComplete: (callback: (data: any) => void) => {
    ipcRenderer.on('install-complete', (_, data) => callback(data));
  },
  onInstallError: (callback: (data: any) => void) => {
    ipcRenderer.on('install-error', (_, data) => callback(data));
  },
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },

  // Autenticación
  microsoftLogin: () => ipcRenderer.invoke('microsoft-login'),
  getSession: () => ipcRenderer.invoke('get-session'),
  logout: () => ipcRenderer.invoke('logout'),

  // Juego
  launchGame: () => ipcRenderer.invoke('launch-game'),
  openModsFolder: () => ipcRenderer.invoke('open-mods-folder'),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  
  // Ventana - VERIFICAR QUE ESTÉN AQUÍ
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
});