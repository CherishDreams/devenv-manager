import { contextBridge, ipcRenderer } from "electron";
import type {
  AppConfig,
  AdoptEnvironmentInput,
  DiscoveredEnvironment,
  EnvironmentKind,
  EnvironmentSummary,
  InstallTaskInput,
  ManagedTask,
  VersionCatalogQuery,
} from "../shared/types";

const envManagerApi = {
  config: {
    get: () => ipcRenderer.invoke("config:get") as Promise<AppConfig>,
    update: (patch: Partial<AppConfig>) => ipcRenderer.invoke("config:update", patch) as Promise<AppConfig>,
  },
  system: {
    getStatus: () => ipcRenderer.invoke("system:get-status"),
  },
  environments: {
    getSummary: () => ipcRenderer.invoke("environments:get-summary"),
    discover: () => ipcRenderer.invoke("environments:discover") as Promise<DiscoveredEnvironment[]>,
    adopt: (inputs: AdoptEnvironmentInput[]) =>
      ipcRenderer.invoke("environments:adopt", inputs) as Promise<EnvironmentSummary>,
    setActive: (environment: EnvironmentKind, id: string) =>
      ipcRenderer.invoke("environments:set-active", environment, id),
    uninstall: (id: string) => ipcRenderer.invoke("environments:uninstall", id),
    onChanged: (callback: (summary: EnvironmentSummary) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, summary: EnvironmentSummary) => callback(summary);
      ipcRenderer.on("environments:changed", listener);
      return () => {
        ipcRenderer.off("environments:changed", listener);
      };
    },
  },
  tasks: {
    list: () => ipcRenderer.invoke("tasks:list") as Promise<ManagedTask[]>,
    createInstall: (input: InstallTaskInput) => ipcRenderer.invoke("tasks:create-install", input) as Promise<ManagedTask>,
    cancel: (id: string) => ipcRenderer.invoke("tasks:cancel", id) as Promise<ManagedTask | undefined>,
    retry: (id: string) => ipcRenderer.invoke("tasks:retry", id) as Promise<ManagedTask>,
    remove: (id: string) => ipcRenderer.invoke("tasks:remove", id) as Promise<ManagedTask[]>,
    clearFinished: () => ipcRenderer.invoke("tasks:clear-finished") as Promise<ManagedTask[]>,
    onChanged: (callback: (tasks: ManagedTask[]) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, tasks: ManagedTask[]) => callback(tasks);
      ipcRenderer.on("tasks:changed", listener);
      return () => {
        ipcRenderer.off("tasks:changed", listener);
      };
    },
  },
  catalog: {
    listVersions: (query: VersionCatalogQuery) => ipcRenderer.invoke("catalog:list-versions", query),
  },
  dialog: {
    selectDirectory: () => ipcRenderer.invoke("dialog:select-directory") as Promise<string | undefined>,
  },
};

contextBridge.exposeInMainWorld("envManager", envManagerApi);

export type EnvManagerApi = typeof envManagerApi;
