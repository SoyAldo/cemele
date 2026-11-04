export type ModLoaderType = "FORGE" | "NEOFORGE" | "FABRIC";

export interface InstallStatus {
  installed: boolean;
  hasJava?: boolean;
  hasMinecraft?: boolean;
  hasMods?: boolean;
  gameDir?: string;
  version?: string;
  needsUpdate?: boolean;
  currentVersion?: string | null;
  latestVersion?: string | null;
  pendingUpdatesCount?: number;
  error?: string;
}

export interface InstallProgressData {
  stage: "java" | "minecraft" | "forge" | "mods" | "configs" | "updates";
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
  modLoader: ModLoaderType;
  modLoaderVersion?: string;
  forgeVersion: string;
  javaVersion: string;
  baseUrl: string;
  modsListUrl: string;
  githubRepositoryUrl?: string;
  manifestUrl?: string;
  ramMin: string;
  ramMax: string;
  lastUsername?: string;
}

export interface CreatorActionItem {
  id: string;
  type: "COPY" | "REPLACE" | "DELETE";
  localSourcePath?: string;
  targetPath: string;
}

export interface CreatorPackageResult {
  success: boolean;
  sha256?: string;
  zipPath?: string;
  size?: number;
  error?: string;
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

      // Modo Creador
      verifyCreatorPin: (pin: string) => Promise<boolean>;
      selectFilesDialog: (options: { title?: string; filters?: any[]; multi?: boolean }) => Promise<string[]>;
      selectSaveZipDialog: (defaultFileName: string) => Promise<string | null>;
      getLocalManifestData: () => Promise<any>;
      packageUpdate: (data: {
        version: string;
        name?: string;
        changelog: string[];
        actions: { type: "COPY" | "REPLACE" | "DELETE"; localSourcePath?: string; targetPath: string }[];
        destinationZipPath: string;
      }) => Promise<CreatorPackageResult>;
      openItemInFolder: (fullPath: string) => Promise<void>;
      onGameClosed?: (callback: (data: { code: number | null }) => void) => () => void;
    };
  }
}
