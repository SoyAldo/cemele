export interface InstallStatus {
  installed: boolean;
  hasJava?: boolean;
  hasMinecraft?: boolean;
  hasMods?: boolean;
  gameDir?: string;
  version?: string;
}

export interface InstallProgressData {
  stage: 'java' | 'minecraft' | 'neoforge' | 'mods';
  percentage: number;
  message: string;
}

export interface AuthSession {
  username: string;
  uuid: string;
  accessToken: string;
  refreshToken?: string;
}

export interface LaunchResult {
  success: boolean;
  error?: string;
}

export interface ServerConfigData {
  name: string;
  version: string;
  neoforgeVersion: string;
  javaVersion: string;
  baseUrl: string;
  modsListUrl: string;
  ramMin: string;
  ramMax: string;
  lastUsername?: string;
}

declare global {
  interface Window {
    electronAPI: {
      getServerConfig: () => Promise<any>;
      setServerConfig: (config: any) => Promise<boolean>;
      checkInstallation: () => Promise<InstallStatus>;
      installModpack: () => Promise<{ success: boolean; error?: string }>;
      onInstallProgress: (callback: (data: InstallProgressData) => void) => void;
      onInstallComplete: (callback: (data: any) => void) => void;
      onInstallError: (callback: (data: any) => void) => void;
      removeAllListeners: (channel: string) => void;
      microsoftLogin: () => Promise<{ success: boolean; session?: AuthSession; error?: string }>;
      offlineLogin: (username: string) => Promise<{ success: boolean; session?: AuthSession; error?: string }>;
      getSession: () => Promise<AuthSession | null>;
      logout: () => Promise<void>;
      launchGame: () => Promise<LaunchResult>;
      openModsFolder: () => Promise<void>;
      openSettings: () => Promise<void>;
      minimizeWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;
    };
  }
}