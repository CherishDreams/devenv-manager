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
  SystemStatus,
  TaskDownloadProgress,
  VersionCatalogQuery,
} from "@shared/types";
import { environmentDefinitions } from "@shared/environmentDefinitions";
import { createOfficialMirrorSettings } from "@shared/mirrorPresets";
import { versionCatalog } from "@shared/versionCatalog";

const mockConfig: AppConfig = {
  globalInstallDir: "E:\\dev_env",
  downloadCacheDir: "E:\\dev_env\\.cache",
  retainDownloads: true,
  appearance: {
    navigationLayout: "sidebar",
  },
  environmentManagement: {
    mode: "symlink",
    envScope: "user",
  },
  proxy: {
    enabled: false,
    httpProxy: "",
    httpsProxy: "",
  },
  mirrors: createOfficialMirrorSettings(),
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

export function createMockApi(): NonNullable<typeof window.envManager> {
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
      // localStorage unavailable or corrupted
      return [];
    }
  }

  function persistMockTasks(): void {
    window.localStorage.setItem("env-manager:tasks", JSON.stringify(tasks));
  }

  function recoverLegacyInput(task: ManagedTask): InstallTaskInput | undefined {
    const [environmentToken, vendorOrVersion, ...versionParts] = task.title.trim().split(/\s+/);
    const definition = environmentDefinitions.find((item) => item.id.toUpperCase() === environmentToken?.toUpperCase());

    if (!definition || !vendorOrVersion) {
      return undefined;
    }

    return {
      environment: definition.id,
      vendor: versionParts.length > 0 ? vendorOrVersion : definition.vendors[0]?.id,
      version: versionParts.length > 0 ? versionParts.join(" ") : vendorOrVersion,
      scope: "global",
      configureSystemEnv: true,
    };
  }

  const emitTasks = (): void => {
    persistMockTasks();
    listeners.forEach((listener) =>
      listener(
        tasks.map((task) => ({
          ...task,
          input: task.input
            ? {
                ...task.input,
                databaseConfig: task.input.databaseConfig ? { ...task.input.databaseConfig } : undefined,
              }
            : undefined,
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

  const createMockInstallTask = (input: InstallTaskInput, extraLogs: ManagedTask["logs"] = []): ManagedTask => {
    const now = new Date().toISOString();
    const task: ManagedTask = {
      id: crypto.randomUUID(),
      title: [input.environment.toUpperCase(), input.vendor, input.version].filter(Boolean).join(" "),
      status: "queued",
      progress: 0,
      createdAt: now,
      updatedAt: now,
      input: { ...input, databaseConfig: input.databaseConfig ? { ...input.databaseConfig } : undefined },
      logs: [
        {
          at: now,
          level: "info",
          message: "安装任务已创建。",
        },
        ...extraLogs,
      ],
    };

    tasks = [task, ...tasks];
    emitTasks();
    scheduleTask(task.id);
    return task;
  };

  return {
    config: {
      get: async () => config,
      update: async (patch: Partial<AppConfig>) => {
        config = {
          ...config,
          ...patch,
          appearance: {
            ...config.appearance,
            ...patch.appearance,
          },
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
      switchEnvScope: async (scope: string) => {
        config = {
          ...config,
          environmentManagement: {
            ...config.environmentManagement,
            envScope: scope as "user" | "system",
          },
        };
      },
    },
    system: {
      getStatus: async () => mockSystemStatus,
    },
    permissions: {
      check: async (input: PrivilegeCheckInput) => {
        const installInput =
          input.type === "install"
            ? input.input
            : input.type === "retry"
              ? tasks.find((task) => task.id === input.id)?.input
              : undefined;
        // Database Windows service registration requires admin.
        const needsServiceElevation = Boolean(
          installInput?.databaseConfig?.enabled && installInput.databaseConfig.installAsService,
        );
        // System scope env writes require admin.
        const needsEnvElevation = config.environmentManagement.envScope === "system";
        const required = !mockSystemStatus.isAdministrator && (needsServiceElevation || needsEnvElevation);

        let reason = "";
        if (needsServiceElevation) {
          reason = "注册数据库 Windows 系统服务需要管理员权限。";
        } else if (needsEnvElevation) {
          reason = "环境变量写入系统级注册表 (HKLM) 需要管理员权限。";
        }

        return {
          required,
          authorized: false,
          reason,
          canSwitchToSymlink: false,
          currentMode: config.environmentManagement.mode,
          authorizationMode: required ? "restart-app" : "none",
        };
      },
    },
    environments: {
      getSummary: async () => summary,
      discover: async (): Promise<DiscoveredEnvironment[]> => [],
      adopt: async (inputs: AdoptEnvironmentInput[]) => {
        const now = new Date().toISOString();
        summary = {
          ...summary,
          installations: [
            ...inputs.map((input) => ({
              id: crypto.randomUUID(),
              environment: input.environment,
              name: input.name,
              vendor: input.vendor,
              version: input.version,
              installPath: input.installPath,
              scope: "custom" as const,
              managed: false,
              ownership: input.ownership,
              uninstallPolicy: input.uninstallPolicy,
              discoverySource: input.source,
              active: input.active,
              envVars: input.envVars,
              pathEntries: input.pathEntries,
              installedAt: now,
              updatedAt: now,
            })),
            ...summary.installations,
          ],
        };
        environmentListeners.forEach((listener) => listener(summary));
        return summary;
      },
      setActive: async (environment: EnvironmentKind, id: string, _authorized = false) => {
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
      uninstall: async (id: string, _authorized = false) => {
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
      createInstall: async (input: InstallTaskInput, _authorized = false) => {
        return createMockInstallTask(input);
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
      retry: async (id: string, _authorized = false) => {
        const taskIndex = tasks.findIndex((item) => item.id === id);

        if (taskIndex === -1) {
          throw new Error("未找到要重试的任务。");
        }

        const task = tasks[taskIndex];

        if (task.status !== "failed") {
          throw new Error("只有失败任务可以重试。");
        }

        const input = task.input
          ? { ...task.input, databaseConfig: task.input.databaseConfig ? { ...task.input.databaseConfig } : undefined }
          : recoverLegacyInput(task);

        if (!input) {
          throw new Error("该任务缺少可重试的安装参数，请重新创建安装任务。");
        }

        const now = new Date().toISOString();
        tasks[taskIndex] = {
          ...task,
          status: "queued" as const,
          progress: 0,
          download: undefined,
          updatedAt: now,
          logs: [
            {
              at: now,
              level: "info" as const,
              message: "任务已重新加入队列，等待执行。",
            },
          ],
        };
        emitTasks();
        scheduleTask(id);
        return tasks[taskIndex];
      },
      remove: async (id: string) => {
        const task = tasks.find((item) => item.id === id);

        if (task && ["queued", "running"].includes(task.status)) {
          throw new Error("进行中的任务不能移除，请先取消任务。");
        }

        tasks = tasks.filter((item) => item.id !== id);
        emitTasks();
        return tasks;
      },
      clearFinished: async () => {
        tasks = tasks.filter((task) => task.status === "queued" || task.status === "running");
        emitTasks();
        return tasks;
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
}
