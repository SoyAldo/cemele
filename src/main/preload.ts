import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getServerConfig: () => ipcRenderer.invoke("get-server-config"),
  setServerConfig: (config: any) => ipcRenderer.invoke("set-server-config", config),
  checkInstallation: () => ipcRenderer.invoke("check-installation"),
  installModpack: () => ipcRenderer.invoke("install-modpack"),
  onInstallProgress: (callback: (data: any) => void) => {
    ipcRenderer.on("install-progress", (_, data) => callback(data));
  },
  onInstallComplete: (callback: (data: any) => void) => {
    ipcRenderer.on("install-complete", (_, data) => callback(data));
  },
  onInstallError: (callback: (data: any) => void) => {
    ipcRenderer.on("install-error", (_, data) => callback(data));
  },
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
  microsoftLogin: () => ipcRenderer.invoke("microsoft-login"),
  offlineLogin: (username: string) => ipcRenderer.invoke("offline-login", username),
  getSession: () => ipcRenderer.invoke("get-session"),
  logout: () => ipcRenderer.invoke("logout"),
  launchGame: () => ipcRenderer.invoke("launch-game"),
  openModsFolder: () => ipcRenderer.invoke("open-mods-folder"),
  openSettings: () => ipcRenderer.invoke("open-settings"),
  minimizeWindow: () => ipcRenderer.invoke("minimize-window"),
  closeWindow: () => ipcRenderer.invoke("close-window"),
  getLogPath: () => ipcRenderer.invoke("get-log-path"),

  // Modo Creador (Studio)
  verifyCreatorPin: (pin: string) => ipcRenderer.invoke("verify-creator-pin", pin),
  selectFilesDialog: (options: any) => ipcRenderer.invoke("select-files-dialog", options),
  selectSaveZipDialog: (defaultFileName: string) => ipcRenderer.invoke("select-save-zip-dialog", defaultFileName),
  getLocalManifestData: () => ipcRenderer.invoke("get-local-manifest-data"),
  packageUpdate: (data: any) => ipcRenderer.invoke("package-update", data),
  openItemInFolder: (fullPath: string) => ipcRenderer.invoke("open-item-in-folder", fullPath),
  onGameClosed: (callback: (data: { code: number | null; error?: string }) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on("game-closed", handler);
    return () => {
      ipcRenderer.removeListener("game-closed", handler);
    };
  },
});
