import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getServerConfig: () => ipcRenderer.invoke('get-server-config'),
  setServerConfig: (config: any) => ipcRenderer.invoke('set-server-config', config),
  checkInstallation: () => ipcRenderer.invoke('check-installation'),
  installModpack: () => ipcRenderer.invoke('install-modpack'),
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
  microsoftLogin: () => ipcRenderer.invoke('microsoft-login'),
  getSession: () => ipcRenderer.invoke('get-session'),
  logout: () => ipcRenderer.invoke('logout'),
  launchGame: () => ipcRenderer.invoke('launch-game'),
  openModsFolder: () => ipcRenderer.invoke('open-mods-folder'),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  getLogPath: () => ipcRenderer.invoke('get-log-path'),
});