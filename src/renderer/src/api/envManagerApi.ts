import { environmentDefinitions } from "@shared/environmentDefinitions";
import { versionCatalog } from "@shared/versionCatalog";
import type {
  AppConfig,
  AvailableVersion,
  EnvironmentKind,
  EnvironmentSummary,
  InstallTaskInput,
  ManagedTask,
  SystemStatus,
  TaskDownloadProgress,
  VersionCatalogQuery,
} from "@shared/types";

const mockConfig: AppConfig = {
  globalInstallDir: "E:\\dev_env",
  downloadCacheDir: "E:\\dev_env\\.cache",
  retainDownloads: true,
  environmentManagement: {
    mode: "symlink",
  },
  proxy: {
    enabled: false,
    httpProxy: "",
    httpsProxy: "",
  },
  mirrors: {
    java: "official",
    python: "official",
    conda: "official",
    go: "official",
    node: "official",
    nvm: "official",
    maven: "official",
  },
};

const mockSummary: EnvironmentSummary = {
  definitions: environmentDefinitions,
  installations: [],
  activeByKind: {},
};

const mockSystemStatus: SystemStatus = {
  platform: "win32",
  arch: "x64",
  isWindows: true,
  isAdministrator: false,
  systemDrive: "C:",
  env: {},
};

const createMockApi = (): NonNullable<typeof window.envManager> => {
  let config = mockConfig;
  let tasks = readMockTasks();
  let summary = mockSummary;
  const taskTimers = new Map<string, number[]>();
  const listeners = new Set<(nextTasks: ManagedTask[]) => void>();
  const environmentListeners = new Set<(nextSummary: EnvironmentSummary) => void>();

  function readMockTasks(): ManagedTask[] {
    try {
      const raw = window.localStorage.getItem("env-manager:tasks");
      const restoredTasks = raw ? (JSON.parse(raw) as ManagedTask[]) : [];
      const now = new Date().toISOString();
      return restoredTasks.map((task) => {
        const normalizedLogs = task.logs.map((entry) => {
          if (entry.message === "安装计划已完成，真实下载安装执行器将在下一阶段接入。") {
            return {
              ...entry,
              message: "浏览器预览模式已完成任务流程；Electron 窗口中会执行真实下载和安装。",
            };
          }

          if (entry.message === "下载器和安装器执行通道已准备。") {
            return {
              ...entry,
              message: "正在执行资源下载和安装准备。",
            };
          }

          return entry;
        });

        if (task.status !== "queued" && task.status !== "running") {
          return {
            ...task,
            logs: normalizedLogs,
          };
        }

        return {
          ...task,
          status: "failed",
          updatedAt: now,
          logs: [
            ...normalizedLogs,
            {
              at: now,
              level: "warn",
              message: "页面刷新时任务尚未完成，已标记为中断。",
            },
          ],
        };
      });
    } catch {
      return [];
    }
  }

  function persistMockTasks(): void {
    window.localStorage.setItem("env-manager:tasks", JSON.stringify(tasks));
  }

  const emitTasks = (): void => {
    persistMockTasks();
    listeners.forEach((listener) =>
      listener(
        tasks.map((task) => ({
          ...task,
          logs: [...task.logs],
        })),
      ),
    );
  };

  const updateTask = (
    id: string,
    patch: Partial<Pick<ManagedTask, "status" | "progress">> & {
      download?: TaskDownloadProgress;
      message?: string;
      level?: "info" | "warn" | "error";
    },
  ): void => {
    tasks = tasks.map((task) => {
      if (task.id !== id || ["succeeded", "failed", "cancelled"].includes(task.status)) {
        return task;
      }

      return {
        ...task,
        status: patch.status ?? task.status,
        progress: typeof patch.progress === "number" ? patch.progress : task.progress,
        download: patch.download ?? task.download,
        updatedAt: new Date().toISOString(),
        logs: patch.message
          ? [
              ...task.logs,
              {
                at: new Date().toISOString(),
                level: patch.level ?? "info",
                message: patch.message,
              },
            ]
          : task.logs,
      };
    });
    emitTasks();
  };

  const scheduleTask = (id: string): void => {
    const totalBytes = 210 * 1024 * 1024;
    const url = "https://example.local/downloads/mock-runtime.zip";
    const fileName = "mock-runtime.zip";
    const createDownload = (
      receivedBytes: number,
      bytesPerSecond: number,
      completed = false,
    ): TaskDownloadProgress => ({
      url,
      fileName,
      receivedBytes,
      totalBytes,
      bytesPerSecond,
      percent: Math.min(100, Math.round((receivedBytes / totalBytes) * 100)),
      updatedAt: new Date().toISOString(),
      completed,
    });
    const steps: Array<{
      delay: number;
      progress: number;
      message: string;
      status?: ManagedTask["status"];
      download?: TaskDownloadProgress;
    }> = [
      {
        delay: 350,
        progress: 12,
        message: "任务开始执行。",
        status: "running",
      },
      {
        delay: 1000,
        progress: 28,
        message: "正在解析发行商和版本信息。",
      },
      {
        delay: 1700,
        progress: 46,
        message: "正在应用镜像源和代理配置。",
        download: createDownload(88 * 1024 * 1024, 18 * 1024 * 1024),
      },
      {
        delay: 2400,
        progress: 68,
        message: "正在准备安装目录和环境变量计划。",
        download: createDownload(162 * 1024 * 1024, 22 * 1024 * 1024),
      },
      {
        delay: 3200,
        progress: 86,
        message: "正在执行资源下载和安装准备。",
        download: createDownload(totalBytes, 16 * 1024 * 1024, true),
      },
      {
        delay: 4200,
        progress: 100,
        message: "浏览器预览模式已完成任务流程；Electron 窗口中会执行真实下载和安装。",
        status: "succeeded",
      },
    ];

    const timers = steps.map((step) =>
      window.setTimeout(() => {
        updateTask(id, {
          status: step.status ?? "running",
          progress: step.progress,
          download: step.download,
          message: step.message,
        });
      }, step.delay),
    );
    taskTimers.set(id, timers);
  };

  return {
    config: {
      get: async () => config,
      update: async (patch: Partial<AppConfig>) => {
        config = {
          ...config,
          ...patch,
          environmentManagement: {
            ...config.environmentManagement,
            ...patch.environmentManagement,
          },
          proxy: {
            ...config.proxy,
            ...patch.proxy,
          },
          mirrors: {
            ...config.mirrors,
            ...patch.mirrors,
          },
        };
        return config;
      },
    },
    system: {
      getStatus: async () => mockSystemStatus,
    },
    environments: {
      getSummary: async () => summary,
      setActive: async (environment: EnvironmentKind, id: string) => {
        summary = {
          ...summary,
          installations: summary.installations.map((record) => ({
            ...record,
            active: record.environment === environment ? record.id === id : record.active,
          })),
          activeByKind: {
            ...summary.activeByKind,
            [environment]: id,
          },
        };
        environmentListeners.forEach((listener) => listener(summary));
        return summary;
      },
      uninstall: async (id: string) => {
        summary = {
          ...summary,
          installations: summary.installations.filter((record) => record.id !== id),
        };
        environmentListeners.forEach((listener) => listener(summary));
        return summary;
      },
      onChanged: (callback: (nextSummary: EnvironmentSummary) => void) => {
        environmentListeners.add(callback);
        return () => {
          environmentListeners.delete(callback);
        };
      },
    },
    tasks: {
      list: async () => {
        persistMockTasks();
        return tasks;
      },
      createInstall: async (input: InstallTaskInput) => {
        const now = new Date().toISOString();
        const task: ManagedTask = {
          id: crypto.randomUUID(),
          title: `${input.environment.toUpperCase()} ${input.version}`,
          status: "queued",
          progress: 0,
          createdAt: now,
          updatedAt: now,
          logs: [
            {
              at: now,
              level: "info",
              message: "安装任务已创建。",
            },
          ],
        };
        tasks = [task, ...tasks];
        emitTasks();
        scheduleTask(task.id);
        return task;
      },
      cancel: async (id: string) => {
        const task = tasks.find((item) => item.id === id);

        if (!task || !["queued", "running"].includes(task.status)) {
          return task;
        }

        (taskTimers.get(id) ?? []).forEach((timer) => window.clearTimeout(timer));
        taskTimers.delete(id);
        updateTask(id, {
          status: "cancelled",
          message: "任务已取消。",
          level: "warn",
        });
        return tasks.find((item) => item.id === id);
      },
      onChanged: (callback: (nextTasks: ManagedTask[]) => void) => {
        listeners.add(callback);
        return () => {
          listeners.delete(callback);
        };
      },
    },
    catalog: {
      listVersions: async (query: VersionCatalogQuery): Promise<AvailableVersion[]> =>
        versionCatalog[query.environment]?.[query.vendor] ?? [],
    },
    dialog: {
      selectDirectory: async () => undefined,
    },
  };
};

function createMissingPreloadApi(): NonNullable<typeof window.envManager> {
  const message = "Electron preload 未加载，无法调用真实安装器。请重启应用或检查 preload 路径。";
  const reject = async (): Promise<never> => {
    throw new Error(message);
  };

  return {
    config: {
      get: reject,
      update: reject,
    },
    system: {
      getStatus: reject,
    },
    environments: {
      getSummary: reject,
      setActive: reject,
      uninstall: reject,
      onChanged: () => () => undefined,
    },
    tasks: {
      list: reject,
      createInstall: reject,
      cancel: reject,
      onChanged: () => () => undefined,
    },
    catalog: {
      listVersions: reject,
    },
    dialog: {
      selectDirectory: reject,
    },
  };
}

const runningInElectron = navigator.userAgent.includes("Electron");

export const envManagerApi = window.envManager ?? (runningInElectron ? createMissingPreloadApi() : createMockApi());
