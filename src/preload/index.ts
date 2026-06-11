import type {
  AdoptEnvironmentInput,
  AppConfig,
  AvailableVersion,
  DiscoveredEnvironment,
  EnvironmentKind,
  EnvironmentSummary,
  InstallTaskInput,
  ManagedTask,
  PrivilegeCheckInput,
  PrivilegeRequirement,
  SystemStatus,
  VersionCatalogQuery,
} from "../shared/types";
import { contextBridge, ipcRenderer } from "electron";

const envManagerApi = {
  config: {
    get: () => ipcRenderer.invoke("config:get") as Promise<AppConfig>,
    update: (patch: Partial<AppConfig>) => ipcRenderer.invoke("config:update", patch) as Promise<AppConfig>,
  },
  system: {
    getStatus: (): Promise<SystemStatus> => ipcRenderer.invoke("system:get-status"),
  },
  permissions: {
    check: (input: PrivilegeCheckInput): Promise<PrivilegeRequirement> => ipcRenderer.invoke("permissions:check", input),
  },
  environments: {
    getSummary: (): Promise<EnvironmentSummary> => ipcRenderer.invoke("environments:get-summary"),
    discover: (): Promise<DiscoveredEnvironment[]> => ipcRenderer.invoke("environments:discover"),
    adopt: (inputs: AdoptEnvironmentInput[]): Promise<EnvironmentSummary> =>
      ipcRenderer.invoke("environments:adopt", inputs),
    setActive: (environment: EnvironmentKind, id: string, authorized = false): Promise<EnvironmentSummary> =>
      ipcRenderer.invoke("environments:set-active", environment, id, authorized),
    uninstall: (id: string, authorized = false): Promise<EnvironmentSummary> =>
      ipcRenderer.invoke("environments:uninstall", id, authorized),
    onChanged: (callback: (summary: EnvironmentSummary) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, summary: EnvironmentSummary): void => callback(summary);
      ipcRenderer.on("environments:changed", listener);
      return () => {
        ipcRenderer.off("environments:changed", listener);
      };
    },
  },
  tasks: {
    list: (): Promise<ManagedTask[]> => ipcRenderer.invoke("tasks:list"),
    createInstall: (input: InstallTaskInput, authorized = false): Promise<ManagedTask> =>
      ipcRenderer.invoke("tasks:create-install", input, authorized),
    cancel: (id: string): Promise<ManagedTask | undefined> => ipcRenderer.invoke("tasks:cancel", id),
    retry: (id: string, authorized = false): Promise<ManagedTask> => ipcRenderer.invoke("tasks:retry", id, authorized),
    remove: (id: string): Promise<ManagedTask[]> => ipcRenderer.invoke("tasks:remove", id),
    clearFinished: (): Promise<ManagedTask[]> => ipcRenderer.invoke("tasks:clear-finished"),
    onChanged: (callback: (tasks: ManagedTask[]) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, tasks: ManagedTask[]): void => callback(tasks);
      ipcRenderer.on("tasks:changed", listener);
      return () => {
        ipcRenderer.off("tasks:changed", listener);
      };
    },
  },
  catalog: {
    listVersions: (query: VersionCatalogQuery): Promise<AvailableVersion[]> => ipcRenderer.invoke("catalog:list-versions", query),
  },
  dialog: {
    selectDirectory: (): Promise<string | undefined> => ipcRenderer.invoke("dialog:select-directory"),
  },
};

contextBridge.exposeInMainWorld("envManager", envManagerApi);

export type EnvManagerApi = typeof envManagerApi;
