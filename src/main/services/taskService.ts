import type { InstallTaskInput, ManagedTask, TaskDownloadProgress, TaskLogEntry } from "../../shared/types";
import type { EnvironmentRecordService } from "./environmentRecordService";
import type { InstallerService } from "./installerService";
import { EventEmitter } from "node:events";
import { join } from "node:path";
import { app } from "electron";
import { environmentDefinitions } from "../../shared/environmentDefinitions";
import { getErrorMessage } from "../../shared/errorUtils";
import { JsonFileStore } from "./jsonFileStore";

function createLog(message: string, level: TaskLogEntry["level"] = "info"): TaskLogEntry {
  return {
    at: new Date().toISOString(),
    level,
    message,
  };
}

function normalizeTaskLog(entry: TaskLogEntry): TaskLogEntry {
  if (entry.message === "下载源解析和安装执行器将在下一阶段接入。") {
    return {
      ...entry,
      message: "安装器已进入执行队列。",
    };
  }

  if (entry.message === "安装计划已完成，真实下载安装执行器将在下一阶段接入。") {
    return {
      ...entry,
      message: "安装任务流程已完成。",
    };
  }

  if (entry.message === "下载器和安装器执行通道已准备。") {
    return {
      ...entry,
      message: "正在执行资源下载和安装准备。",
    };
  }

  return entry;
}

function getVerificationLogIndex(logs: TaskLogEntry[]): number {
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    if (logs[index].message.startsWith("验证完成：")) {
      return index;
    }
  }

  return -1;
}

function isActiveTask(task: ManagedTask): boolean {
  return task.status === "queued" || task.status === "running";
}

function cloneInstallInput(input: InstallTaskInput): InstallTaskInput {
  return {
    ...input,
    databaseConfig: input.databaseConfig ? { ...input.databaseConfig } : undefined,
  };
}

function recoverLegacyInput(task: ManagedTask): InstallTaskInput | undefined {
  const [environmentToken, vendorOrVersion, ...versionParts] = task.title.trim().split(/\s+/);
  const definition = environmentDefinitions.find((item) => item.id.toUpperCase() === environmentToken?.toUpperCase());

  if (!definition || !vendorOrVersion) {
    return undefined;
  }

  const vendor = versionParts.length > 0 ? vendorOrVersion : definition.vendors[0]?.id;
  const version = versionParts.length > 0 ? versionParts.join(" ") : vendorOrVersion;

  if (!version) {
    return undefined;
  }

  return {
    environment: definition.id,
    vendor,
    version,
    scope: "global",
    configureSystemEnv: true,
  };
}

function getRetryInput(task: ManagedTask): InstallTaskInput | undefined {
  return task.input ? cloneInstallInput(task.input) : recoverLegacyInput(task);
}

interface TaskData {
  tasks: ManagedTask[];
}

const defaults: TaskData = {
  tasks: [],
};

export class TaskService extends EventEmitter {
  private tasks: ManagedTask[] = [];
  private readonly controllers = new Map<string, AbortController>();
  private readonly store = new JsonFileStore<TaskData>(join(app.getPath("userData"), "tasks.json"), defaults);
  private readonly ready: Promise<void>;

  constructor(
    private readonly installerService: InstallerService,
    private readonly environmentRecordService: EnvironmentRecordService,
  ) {
    super();
    this.ready = this.restoreTasks();
  }

  async list(): Promise<ManagedTask[]> {
    await this.ready;
    return this.snapshot();
  }

  async createInstallTask(input: InstallTaskInput): Promise<ManagedTask> {
    await this.ready;
    return this.createQueuedInstallTask(input);
  }

  async getRetryInput(id: string): Promise<InstallTaskInput | undefined> {
    await this.ready;
    const task = this.findTask(id);
    const input = task ? getRetryInput(task) : undefined;
    return input ? cloneInstallInput(input) : undefined;
  }

  async retryTask(id: string): Promise<ManagedTask> {
    await this.ready;
    const task = this.findTask(id);

    if (!task) {
      throw new Error("未找到要重试的任务。");
    }

    if (task.status !== "failed") {
      throw new Error("只有失败任务可以重试。");
    }

    const input = getRetryInput(task);

    if (!input) {
      throw new Error("该任务缺少可重试的安装参数，请重新创建安装任务。");
    }

    const legacyWarning = task.input
      ? undefined
      : createLog("原任务缺少完整安装参数，已按标题恢复为全局安装任务。", "warn");

    return this.createQueuedInstallTask(input, [
      createLog(`由失败任务重试创建：${task.title}`),
      ...(legacyWarning ? [legacyWarning] : []),
    ]);
  }

  async clearFinishedTasks(): Promise<ManagedTask[]> {
    await this.ready;
    const remainingTasks = this.tasks.filter(isActiveTask);

    if (remainingTasks.length === this.tasks.length) {
      return this.snapshot();
    }

    this.tasks = remainingTasks;
    this.emitChanged();
    return this.snapshot();
  }

  async removeTask(id: string): Promise<ManagedTask[]> {
    await this.ready;
    const task = this.findTask(id);

    if (!task) {
      return this.snapshot();
    }

    if (isActiveTask(task)) {
      throw new Error("进行中的任务不能移除，请先取消任务。");
    }

    this.tasks = this.tasks.filter((item) => item.id !== id);
    this.emitChanged();
    return this.snapshot();
  }

  async cancelTask(id: string): Promise<ManagedTask | undefined> {
    await this.ready;
    const task = this.findTask(id);

    if (!task || !isActiveTask(task)) {
      return task ? this.cloneTask(task) : undefined;
    }

    this.controllers.get(id)?.abort();
    this.controllers.delete(id);
    this.updateTask(id, {
      status: "cancelled",
      log: createLog("任务已取消。", "warn"),
    });

    const updatedTask = this.findTask(id);
    return updatedTask ? this.cloneTask(updatedTask) : undefined;
  }

  private createQueuedInstallTask(input: InstallTaskInput, additionalLogs: TaskLogEntry[] = []): ManagedTask {
    const now = new Date().toISOString();
    const title = [input.environment.toUpperCase(), input.vendor, input.version].filter(Boolean).join(" ");
    const task: ManagedTask = {
      id: crypto.randomUUID(),
      title,
      status: "queued",
      progress: 0,
      createdAt: now,
      updatedAt: now,
      input: cloneInstallInput(input),
      logs: [
        createLog("安装任务已创建。"),
        createLog("安装器已进入执行队列。"),
        ...additionalLogs,
      ],
    };

    this.tasks.unshift(task);
    this.emitChanged();
    this.startInstallTask(task.id, input);
    return this.cloneTask(task);
  }

  private async restoreTasks(): Promise<void> {
    const data = await this.store.read();
    const summary = await this.environmentRecordService.getSummary();
    const now = new Date().toISOString();
    let changed = false;

    this.tasks = data.tasks.map((task) => {
      const normalizedLogs = task.logs.map(normalizeTaskLog);
      const verificationLogIndex = getVerificationLogIndex(normalizedLogs);
      const hasErrorAfterVerification
        = verificationLogIndex >= 0 && normalizedLogs.slice(verificationLogIndex + 1).some((entry) => entry.level === "error");
      const normalizedTitle = task.title.toLowerCase();
      const hasMatchingInstallation = summary.installations.some((installation) => {
        const vendorMatches = !installation.vendor || normalizedTitle.includes(installation.vendor.toLowerCase());
        return (
          normalizedTitle.includes(installation.environment.toLowerCase())
          && normalizedTitle.includes(installation.version.toLowerCase())
          && vendorMatches
        );
      });
      const interruptedAfterVerification = normalizedLogs.some((entry) =>
        entry.message.includes("任务尚未完成，已标记为中断"),
      );
      const shouldRecoverCompleted
        = task.status !== "succeeded"
          && verificationLogIndex >= 0
          && !hasErrorAfterVerification
          && hasMatchingInstallation
          && (["queued", "running"].includes(task.status) || interruptedAfterVerification);

      if (shouldRecoverCompleted) {
        changed = true;
        const alreadyLogged = normalizedLogs.some((entry) => entry.message === "检测到安装记录和验证日志，已恢复任务为成功。");

        return {
          ...task,
          status: "succeeded" as const,
          progress: 100,
          updatedAt: now,
          logs: alreadyLogged
            ? normalizedLogs
            : [...normalizedLogs, createLog("检测到安装记录和验证日志，已恢复任务为成功。")],
        };
      }

      if (!isActiveTask(task)) {
        return {
          ...task,
          logs: normalizedLogs,
        };
      }

      changed = true;
      return {
        ...task,
        status: "failed",
        updatedAt: now,
        logs: [
          ...normalizedLogs,
          createLog("程序重启时任务尚未完成，已标记为中断。请重新创建安装任务。", "warn"),
        ],
      };
    });

    if (changed) {
      await this.persist();
    }
  }

  private startInstallTask(id: string, input: InstallTaskInput): void {
    const controller = new AbortController();
    this.controllers.set(id, controller);

    void this.runInstallTask(id, input, controller);
  }

  private async runInstallTask(id: string, input: InstallTaskInput, controller: AbortController): Promise<void> {
    try {
      this.updateTask(id, {
        status: "running",
        progress: 1,
        log: createLog("任务开始执行。"),
      });

      const result = await this.installerService.install(
        input,
        {
          log: (message, level = "info") => {
            this.updateTask(id, {
              log: createLog(message, level),
            });
          },
          progress: (progress) => {
            this.updateTask(id, {
              progress,
            });
          },
          downloadProgress: (download) => {
            this.updateTask(id, {
              download,
            });
          },
        },
        controller.signal,
      );

      const definition = environmentDefinitions.find((item) => item.id === input.environment);
      await this.environmentRecordService.addManagedInstall({
        environment: input.environment,
        name: definition?.name ?? input.environment,
        vendor: input.vendor,
        version: result.resolvedVersion,
        installPath: result.installPath,
        scope: input.scope,
        active: input.configureSystemEnv,
        envVars: result.envVars,
        pathEntries: result.pathEntries,
      });
      this.emit("environmentChanged", await this.environmentRecordService.getSummary());

      this.updateTask(id, {
        log: createLog(result.verificationOutput || "验证完成。"),
      });
      this.updateTask(id, {
        status: "succeeded",
        progress: 100,
        log: createLog("安装完成。"),
      });
    } catch (error) {
      if (controller.signal.aborted) {
        this.updateTask(id, {
          status: "cancelled",
          log: createLog("任务已取消。", "warn"),
        });
        return;
      }

      this.updateTask(id, {
        status: "failed",
        log: createLog(getErrorMessage(error), "error"),
      });
    } finally {
      this.controllers.delete(id);
    }
  }

  private updateTask(
    id: string,
    patch: Partial<Pick<ManagedTask, "status" | "progress">> & {
      download?: TaskDownloadProgress;
      log?: TaskLogEntry;
    },
  ): void {
    const task = this.findTask(id);

    if (!task || !isActiveTask(task)) {
      return;
    }

    if (patch.status) {
      task.status = patch.status;
    }

    if (typeof patch.progress === "number") {
      task.progress = patch.progress;
    }

    if (patch.download) {
      task.download = patch.download;
    }

    if (patch.log) {
      task.logs.push(patch.log);
    }

    task.updatedAt = new Date().toISOString();
    this.emitChanged();
  }

  private findTask(id: string): ManagedTask | undefined {
    return this.tasks.find((task) => task.id === id);
  }

  private emitChanged(): void {
    const snapshot = this.snapshot();
    void this.persist();
    this.emit("changed", snapshot);
  }

  private async persist(): Promise<void> {
    await this.store.write({
      tasks: this.snapshot(),
    });
  }

  private snapshot(): ManagedTask[] {
    return this.tasks.map((task) => this.cloneTask(task));
  }

  private cloneTask(task: ManagedTask): ManagedTask {
    return {
      ...task,
      input: task.input ? cloneInstallInput(task.input) : undefined,
      download: task.download ? { ...task.download } : undefined,
      logs: [...task.logs],
    };
  }
}
