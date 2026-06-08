export type EnvironmentKind = "java" | "go" | "maven" | "conda";

export type InstallScope = "global" | "custom";

export type TaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface VendorOption {
  id: string;
  name: string;
  homepage: string;
}

export interface EnvironmentDefinition {
  id: EnvironmentKind;
  name: string;
  group: string;
  description: string;
  logoId: "java" | "go" | "maven" | "conda";
  accentColor: string;
  envVars: string[];
  pathEntries: string[];
  installType: "archive" | "installer";
  vendors: VendorOption[];
}

export interface VersionCatalogQuery {
  environment: EnvironmentKind;
  vendor: string;
}

export interface AvailableVersion {
  id: string;
  environment: EnvironmentKind;
  vendor: string;
  version: string;
  label: string;
  channel: "lts" | "stable" | "current";
  packageType: "archive" | "installer";
  architecture: "x64";
  notes?: string;
}

export interface InstallationResult {
  installPath: string;
  resolvedVersion: string;
  envVars: Record<string, string>;
  pathEntries: string[];
  verificationOutput: string;
}

export interface ProxySettings {
  enabled: boolean;
  httpProxy: string;
  httpsProxy: string;
}

export interface MirrorSettings {
  java: string;
  go: string;
  maven: string;
  conda: string;
}

export interface AppConfig {
  globalInstallDir: string;
  downloadCacheDir: string;
  retainDownloads: boolean;
  proxy: ProxySettings;
  mirrors: MirrorSettings;
}

export interface InstallRecord {
  id: string;
  environment: EnvironmentKind;
  name: string;
  vendor?: string;
  version: string;
  installPath: string;
  scope: InstallScope;
  managed: true;
  active: boolean;
  envVars: Record<string, string>;
  pathEntries: string[];
  installedAt: string;
  updatedAt: string;
}

export type ActiveEnvironmentMap = Partial<Record<EnvironmentKind, string>>;

export interface EnvironmentSummary {
  definitions: EnvironmentDefinition[];
  installations: InstallRecord[];
  activeByKind: ActiveEnvironmentMap;
}

export interface SystemStatus {
  platform: NodeJS.Platform;
  arch: string;
  isWindows: boolean;
  isAdministrator: boolean;
  systemDrive: string;
  env: Record<string, string | undefined>;
}

export interface InstallTaskInput {
  environment: EnvironmentKind;
  vendor?: string;
  version: string;
  scope: InstallScope;
  installPath?: string;
  configureSystemEnv: boolean;
}

export interface TaskLogEntry {
  at: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface TaskDownloadProgress {
  url: string;
  fileName: string;
  receivedBytes: number;
  totalBytes?: number;
  bytesPerSecond: number;
  percent?: number;
  updatedAt: string;
  completed: boolean;
}

export interface ManagedTask {
  id: string;
  title: string;
  status: TaskStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
  download?: TaskDownloadProgress;
  logs: TaskLogEntry[];
}
