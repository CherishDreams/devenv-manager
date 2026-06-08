import { EventEmitter } from "node:events";
import { app } from "electron";
import { join } from "node:path";
import type { InstallTaskInput, ManagedTask, TaskDownloadProgress, TaskLogEntry } from "../../shared/types";
import { environmentDefinitions } from "../../shared/environmentDefinitions";
import { EnvironmentRecordService } from "./environmentRecordService";
import { InstallerService } from "./installerService";
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
    const now = new Date().toISOString();
    const title = [input.environment.toUpperCase(), input.vendor, input.version].filter(Boolean).join(" ");
    const task: ManagedTask = {
      id: crypto.randomUUID(),
      title,
      status: "queued",
      progress: 0,
      createdAt: now,
      updatedAt: now,
      logs: [
        createLog("安装任务已创建。"),
        createLog("安装器已进入执行队列。"),
      ],
    };

    this.tasks.unshift(task);
    this.emitChanged();
    this.startInstallTask(task.id, input);
    return this.cloneTask(task);
  }

  async cancelTask(id: string): Promise<ManagedTask | undefined> {
    await this.ready;
    const task = this.findTask(id);

    if (!task || !["queued", "running"].includes(task.status)) {
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

  private async restoreTasks(): Promise<void> {
    const data = await this.store.read();
    const summary = await this.environmentRecordService.getSummary();
    const now = new Date().toISOString();
    let changed = false;

    this.tasks = data.tasks.map((task) => {
      const normalizedLogs = task.logs.map(normalizeTaskLog);
      const verificationLogIndex = getVerificationLogIndex(normalizedLogs);
      const hasErrorAfterVerification =
        verificationLogIndex >= 0 && normalizedLogs.slice(verificationLogIndex + 1).some((entry) => entry.level === "error");
      const normalizedTitle = task.title.toLowerCase();
      const hasMatchingInstallation = summary.installations.some((installation) => {
        const vendorMatches = !installation.vendor || normalizedTitle.includes(installation.vendor.toLowerCase());
        return (
          normalizedTitle.includes(installation.environment.toLowerCase()) &&
          normalizedTitle.includes(installation.version.toLowerCase()) &&
          vendorMatches
        );
      });
      const interruptedAfterVerification = normalizedLogs.some((entry) =>
        entry.message.includes("任务尚未完成，已标记为中断"),
      );
      const shouldRecoverCompleted =
        task.status !== "succeeded" &&
        verificationLogIndex >= 0 &&
        !hasErrorAfterVerification &&
        hasMatchingInstallation &&
        (["queued", "running"].includes(task.status) || interruptedAfterVerification);

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

      if (task.status !== "queued" && task.status !== "running") {
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
        log: createLog((error as Error).message, "error"),
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

    if (!task || ["succeeded", "failed", "cancelled"].includes(task.status)) {
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
      download: task.download ? { ...task.download } : undefined,
      logs: [...task.logs],
    };
  }
}
