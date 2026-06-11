import type { BrowserWindow } from "electron";
import type {
  AdoptEnvironmentInput,
  AppConfig,
  EnvironmentKind,
  InstallTaskInput,
  PrivilegeCheckInput,
  PrivilegeRequirement,
  VersionCatalogQuery,
} from "../../shared/types";
import type { ConfigService } from "../services/configService";
import type { EnvironmentDiscoveryService } from "../services/environmentDiscoveryService";
import type { EnvironmentRecordService } from "../services/environmentRecordService";
import type { SystemStatusService } from "../services/systemStatusService";
import type { TaskService } from "../services/taskService";
import type { VersionCatalogService } from "../services/versionCatalogService";
import { app, dialog, ipcMain } from "electron";
import {
  hasActiveElevatedBroker,
  requestElevatedEnvironmentOperation,
  requestElevationRelaunch,
} from "../services/elevationService";

export interface IpcServices {
  configService: ConfigService;
  environmentDiscoveryService: EnvironmentDiscoveryService;
  environmentRecordService: EnvironmentRecordService;
  systemStatusService: SystemStatusService;
  taskService: TaskService;
  versionCatalogService: VersionCatalogService;
}

async function ensureAdministratorForEnvironmentWrite(services: IpcServices, relaunchArgs: string[] = []): Promise<void> {
  if (await services.systemStatusService.isAdministrator()) {
    return;
  }

  await requestElevationRelaunch(relaunchArgs);
  setTimeout(() => app.quit(), 500);
  throw new Error("需要管理员权限写入系统环境变量，已发起以管理员身份重启。");
}

function encodeInstallInput(input: InstallTaskInput): string {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
}

function installNeedsServiceElevation(input: InstallTaskInput): boolean {
  return Boolean(input.databaseConfig?.enabled && input.databaseConfig.installAsService);
}

async function installNeedsElevation(services: IpcServices, input: InstallTaskInput): Promise<boolean> {
  if (installNeedsServiceElevation(input)) {
    return true;
  }

  return input.configureSystemEnv && services.environmentRecordService.requiresElevationForInstall(input.environment);
}

async function getPrivilegeRequirement(
  services: IpcServices,
  input: PrivilegeCheckInput,
): Promise<PrivilegeRequirement> {
  const config = await services.configService.get();
  const currentMode = config.environmentManagement.mode;

  if (await services.systemStatusService.isAdministrator()) {
    return {
      required: false,
      authorized: false,
      reason: "",
      canSwitchToSymlink: false,
      currentMode,
      authorizationMode: "none",
    };
  }

  let required = false;
  let reason = "该操作需要写入系统环境变量。";
  let canSwitchToSymlink = false;
  let authorizationMode: PrivilegeRequirement["authorizationMode"] = "elevated-helper";

  if (input.type === "set-active") {
    required = await services.environmentRecordService.requiresElevationForSetActive(input.environment, input.id);
    canSwitchToSymlink = required && currentMode === "direct";
    reason = "当前切换方式需要更新系统环境变量。";
  } else if (input.type === "uninstall") {
    required = await services.environmentRecordService.requiresElevationForUninstall(input.id);
    reason = "卸载需要清理系统环境变量。";
  } else {
    const installInput = input.type === "install" ? input.input : await services.taskService.getRetryInput(input.id);
    required = installInput ? await installNeedsElevation(services, installInput) : false;
    authorizationMode = "restart-app";

    if (installInput && installNeedsServiceElevation(installInput)) {
      reason = "注册数据库 Windows 系统服务需要管理员权限。";
    } else {
      reason = "安装完成后写入系统环境变量需要管理员权限。";
      canSwitchToSymlink = required && currentMode === "direct";
    }
  }

  const authorized = required && authorizationMode === "elevated-helper" ? await hasActiveElevatedBroker() : false;

  return {
    required,
    authorized,
    reason: required ? reason : "",
    canSwitchToSymlink,
    currentMode,
    authorizationMode: required ? authorizationMode : "none",
  };
}

export function registerIpc(mainWindow: BrowserWindow, services: IpcServices): void {
  ipcMain.handle("config:get", () => services.configService.get());
  ipcMain.handle("config:update", (_, patch: Partial<AppConfig>) => services.configService.update(patch));

  ipcMain.handle("system:get-status", () => services.systemStatusService.getStatus());
  ipcMain.handle("permissions:check", (_, input: PrivilegeCheckInput) => getPrivilegeRequirement(services, input));

  ipcMain.handle("environments:get-summary", () => services.environmentRecordService.getSummary());
  ipcMain.handle("environments:discover", () => services.environmentDiscoveryService.discover());
  ipcMain.handle("environments:adopt", async (_, inputs: AdoptEnvironmentInput[]) => {
    const summary = await services.environmentRecordService.adoptExistingInstalls(inputs);
    mainWindow.webContents.send("environments:changed", summary);
    return summary;
  });
  ipcMain.handle("environments:set-active", async (_, environment: EnvironmentKind, id: string, authorized = false) => {
    const requiresElevation = await services.environmentRecordService.requiresElevationForSetActive(environment, id);

    if (requiresElevation && !(await services.systemStatusService.isAdministrator())) {
      if (!authorized) {
        throw new Error("该版本切换需要管理员权限。");
      }

      const summary = await requestElevatedEnvironmentOperation({ type: "set-active", environment, id });
      await services.environmentRecordService.synchronizeProcessEnvironment();
      mainWindow.webContents.send("environments:changed", summary);
      return summary;
    }

    const summary = await services.environmentRecordService.setActive(environment, id);
    mainWindow.webContents.send("environments:changed", summary);
    return summary;
  });
  ipcMain.handle("environments:uninstall", async (_, id: string, authorized = false) => {
    const requiresElevation = await services.environmentRecordService.requiresElevationForUninstall(id);

    if (requiresElevation && !(await services.systemStatusService.isAdministrator())) {
      if (!authorized) {
        throw new Error("该卸载操作需要管理员权限。");
      }

      const summary = await requestElevatedEnvironmentOperation({ type: "uninstall", id });
      await services.environmentRecordService.synchronizeProcessEnvironment();
      mainWindow.webContents.send("environments:changed", summary);
      return summary;
    }

    const summary = await services.environmentRecordService.uninstallManaged(id);
    mainWindow.webContents.send("environments:changed", summary);
    return summary;
  });

  ipcMain.handle("tasks:list", () => services.taskService.list());
  ipcMain.handle("tasks:create-install", async (_, input: InstallTaskInput, authorized = false) => {
    if ((await installNeedsElevation(services, input)) && !(await services.systemStatusService.isAdministrator())) {
      if (!authorized) {
        throw new Error("该安装任务需要管理员权限。");
      }

      await ensureAdministratorForEnvironmentWrite(services, ["--env-manager-create-install", encodeInstallInput(input)]);
    }

    return services.taskService.createInstallTask(input);
  });
  ipcMain.handle("tasks:cancel", (_, id: string) => services.taskService.cancelTask(id));
  ipcMain.handle("tasks:retry", async (_, id: string, authorized = false) => {
    const input = await services.taskService.getRetryInput(id);

    if (input && (await installNeedsElevation(services, input)) && !(await services.systemStatusService.isAdministrator())) {
      if (!authorized) {
        throw new Error("重试该安装任务需要管理员权限。");
      }

      await ensureAdministratorForEnvironmentWrite(services, ["--env-manager-create-install", encodeInstallInput(input)]);
    }

    return services.taskService.retryTask(id);
  });
  ipcMain.handle("tasks:remove", (_, id: string) => services.taskService.removeTask(id));
  ipcMain.handle("tasks:clear-finished", () => services.taskService.clearFinishedTasks());

  ipcMain.handle("catalog:list-versions", (_, query: VersionCatalogQuery) => services.versionCatalogService.listVersions(query));

  ipcMain.handle("dialog:select-directory", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"],
    });

    return result.canceled ? undefined : result.filePaths[0];
  });

  services.taskService.on("changed", (tasks) => {
    mainWindow.webContents.send("tasks:changed", tasks);
  });
  services.taskService.on("environmentChanged", (summary) => {
    mainWindow.webContents.send("environments:changed", summary);
  });
}
