export type EnvironmentKind =
  | "java"
  | "python"
  | "conda"
  | "go"
  | "node"
  | "nvm"
  | "maven"
  | "gradle"
  | "cmake"
  | "ninja"
  | "cpp"
  | "lua"
  | "rust"
  | "dotnet"
  | "php"
  | "ruby"
  | "flutter"
  | "android"
  | "mysql"
  | "postgresql"
  | "mongodb"
  | "redis"
  | "sqlite";

export type InstallScope = "global" | "custom";

export type TaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type EnvironmentManagementMode = "symlink" | "direct";

export type EnvironmentOwnership = "managed" | "adopted" | "external";

export type UninstallPolicy = "delete-directory" | "remove-record-only" | "manual";

export type NavigationLayout = "sidebar" | "rail";

export type InstallType = "archive" | "installer";

export type VersionChannel = "lts" | "stable" | "current";

export type EnvironmentGroup = "编程语言" | "Python" | "JavaScript" | "构建工具" | "移动开发" | "数据库";

export interface EnvironmentManagementSettings {
  mode: EnvironmentManagementMode;
}

export interface AppearanceSettings {
  navigationLayout: NavigationLayout;
}

export interface VendorOption {
  id: string;
  name: string;
  homepage: string;
}

export interface EnvironmentDefinition {
  id: EnvironmentKind;
  name: string;
  group: EnvironmentGroup;
  description: string;
  logoId: EnvironmentKind;
  accentColor: string;
  envVars: string[];
  pathEntries: string[];
  installType: InstallType;
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
  channel: VersionChannel;
  packageType: InstallType;
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
  python: string;
  conda: string;
  go: string;
  node: string;
  nvm: string;
  maven: string;
  gradle: string;
  cmake: string;
  ninja: string;
  cpp: string;
  lua: string;
  rust: string;
  dotnet: string;
  php: string;
  ruby: string;
  flutter: string;
  android: string;
  mysql: string;
  postgresql: string;
  mongodb: string;
  redis: string;
  sqlite: string;
}

export interface AppConfig {
  globalInstallDir: string;
  downloadCacheDir: string;
  retainDownloads: boolean;
  appearance: AppearanceSettings;
  environmentManagement: EnvironmentManagementSettings;
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
  managed: boolean;
  ownership: EnvironmentOwnership;
  uninstallPolicy: UninstallPolicy;
  discoverySource?: string;
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
  databaseConfig?: DatabaseInstallConfig;
}

export type PrivilegeCheckInput =
  | { type: "set-active"; environment: EnvironmentKind; id: string }
  | { type: "uninstall"; id: string }
  | { type: "install"; input: InstallTaskInput }
  | { type: "retry"; id: string };

export interface PrivilegeRequirement {
  required: boolean;
  authorized: boolean;
  reason: string;
  canSwitchToSymlink: boolean;
  currentMode: EnvironmentManagementMode;
  authorizationMode: "none" | "elevated-helper" | "restart-app";
}

export type DatabaseEnvironmentKind = Extract<EnvironmentKind, "mysql" | "postgresql" | "mongodb" | "redis" | "sqlite">;

export type ConfigurableDatabaseEnvironmentKind = Exclude<DatabaseEnvironmentKind, "sqlite">;

export interface DatabaseInstallConfig {
  enabled: boolean;
  installAsService: boolean;
  startService: boolean;
  serviceName: string;
  port: number;
  bindAddress: string;
  charset: string;
  collation?: string;
}

export interface DiscoveredEnvironment {
  id: string;
  environment: EnvironmentKind;
  name: string;
  vendor?: string;
  version: string;
  installPath: string;
  envVars: Record<string, string>;
  pathEntries: string[];
  source: string;
  active: boolean;
  alreadyManaged: boolean;
}

export interface AdoptEnvironmentInput {
  environment: EnvironmentKind;
  name: string;
  vendor?: string;
  version: string;
  installPath: string;
  envVars: Record<string, string>;
  pathEntries: string[];
  source: string;
  active: boolean;
  ownership: Extract<EnvironmentOwnership, "adopted" | "external">;
  uninstallPolicy: Extract<UninstallPolicy, "remove-record-only" | "manual">;
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
  input?: InstallTaskInput;
  download?: TaskDownloadProgress;
  logs: TaskLogEntry[];
}
