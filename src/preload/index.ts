import { contextBridge, ipcRenderer } from "electron";
import type {
  AppConfig,
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
    setActive: (environment: EnvironmentKind, id: string) =>
      ipcRenderer.invoke("environments:set-active", environment, id),
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
