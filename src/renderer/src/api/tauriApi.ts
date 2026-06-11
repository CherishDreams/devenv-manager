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
} from "@shared/types";
import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

// Tauri API implementation - replaces Electron preload API
export const tauriApi = {
  config: {
    get: () => invoke<AppConfig>("config_get"),
    update: (patch: Partial<AppConfig>) => invoke<AppConfig>("config_update", { patch }),
  },
  system: {
    getStatus: () => invoke<SystemStatus>("system_get_status"),
  },
  permissions: {
    check: (input: PrivilegeCheckInput) => invoke<PrivilegeRequirement>("permissions_check", { input }),
  },
  environments: {
    getSummary: () => invoke<EnvironmentSummary>("environments_get_summary"),
    discover: () => invoke<DiscoveredEnvironment[]>("environments_discover"),
    adopt: (inputs: AdoptEnvironmentInput[]) => invoke<EnvironmentSummary>("environments_adopt", { inputs }),
    setActive: (environment: EnvironmentKind, id: string, authorized = false) =>
      invoke<EnvironmentSummary>("environments_set_active", { environment, id, authorized }),
    uninstall: (id: string, authorized = false) =>
      invoke<EnvironmentSummary>("environments_uninstall", { id, authorized }),
    onChanged: (callback: (summary: EnvironmentSummary) => void): (() => void) => {
      let unlisten: UnlistenFn | undefined;
      void listen<EnvironmentSummary>("environments:changed", (event) => {
        callback(event.payload);
      }).then((fn) => {
        unlisten = fn;
      });
      return () => {
        unlisten?.();
      };
    },
  },
  tasks: {
    list: () => invoke<ManagedTask[]>("tasks_list"),
    createInstall: (input: InstallTaskInput, authorized = false) =>
      invoke<ManagedTask>("tasks_create_install", { input, authorized }),
    cancel: (id: string) => invoke<ManagedTask | null>("tasks_cancel", { id }),
    retry: (id: string, authorized = false) => invoke<ManagedTask>("tasks_retry", { id, authorized }),
    remove: (id: string) => invoke<ManagedTask[]>("tasks_remove", { id }),
    clearFinished: () => invoke<ManagedTask[]>("tasks_clear_finished"),
    onChanged: (callback: (tasks: ManagedTask[]) => void): (() => void) => {
      let unlisten: UnlistenFn | undefined;
      void listen<ManagedTask[]>("tasks:changed", (event) => {
        callback(event.payload);
      }).then((fn) => {
        unlisten = fn;
      });
      return () => {
        unlisten?.();
      };
    },
  },
  catalog: {
    listVersions: (query: VersionCatalogQuery) =>
      invoke<AvailableVersion[]>("catalog_list_versions", { query }),
  },
  dialog: {
    selectDirectory: async (): Promise<string | undefined> => {
      const result = await open({
        directory: true,
        multiple: false,
      });
      return result ?? undefined;
    },
  },
};
