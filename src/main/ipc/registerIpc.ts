import { app, dialog, ipcMain, type BrowserWindow } from "electron";
import type { AdoptEnvironmentInput, AppConfig, EnvironmentKind, InstallTaskInput } from "../../shared/types";
import { ConfigService } from "../services/configService";
import { requestElevationRelaunch } from "../services/elevationService";
import { EnvironmentDiscoveryService } from "../services/environmentDiscoveryService";
import { EnvironmentRecordService } from "../services/environmentRecordService";
import { SystemStatusService } from "../services/systemStatusService";
import { TaskService } from "../services/taskService";
import { VersionCatalogService } from "../services/versionCatalogService";

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

export function registerIpc(mainWindow: BrowserWindow, services: IpcServices): void {
  ipcMain.handle("config:get", () => services.configService.get());
  ipcMain.handle("config:update", (_, patch: Partial<AppConfig>) => services.configService.update(patch));

  ipcMain.handle("system:get-status", () => services.systemStatusService.getStatus());

  ipcMain.handle("environments:get-summary", () => services.environmentRecordService.getSummary());
  ipcMain.handle("environments:discover", () => services.environmentDiscoveryService.discover());
  ipcMain.handle("environments:adopt", async (_, inputs: AdoptEnvironmentInput[]) => {
    const summary = await services.environmentRecordService.adoptExistingInstalls(inputs);
    mainWindow.webContents.send("environments:changed", summary);
    return summary;
  });
  ipcMain.handle("environments:set-active", async (_, environment: EnvironmentKind, id: string) => {
    if (await services.environmentRecordService.requiresElevationForSetActive(environment, id)) {
      await ensureAdministratorForEnvironmentWrite(services, ["--env-manager-set-active", environment, id]);
    }

    const summary = await services.environmentRecordService.setActive(environment, id);
    mainWindow.webContents.send("environments:changed", summary);
    return summary;
  });
  ipcMain.handle("environments:uninstall", async (_, id: string) => {
    if (await services.environmentRecordService.requiresElevationForUninstall(id)) {
      await ensureAdministratorForEnvironmentWrite(services);
    }

    const summary = await services.environmentRecordService.uninstallManaged(id);
    mainWindow.webContents.send("environments:changed", summary);
    return summary;
  });

  ipcMain.handle("tasks:list", () => services.taskService.list());
  ipcMain.handle("tasks:create-install", async (_, input: InstallTaskInput) => {
    if (input.configureSystemEnv && (await services.environmentRecordService.requiresElevationForInstall(input.environment))) {
      await ensureAdministratorForEnvironmentWrite(services);
    }

    return services.taskService.createInstallTask(input);
  });
  ipcMain.handle("tasks:cancel", (_, id: string) => services.taskService.cancelTask(id));
  ipcMain.handle("tasks:retry", async (_, id: string) => {
    const input = await services.taskService.getRetryInput(id);

    if (input?.configureSystemEnv && (await services.environmentRecordService.requiresElevationForInstall(input.environment))) {
      await ensureAdministratorForEnvironmentWrite(services);
    }

    return services.taskService.retryTask(id);
  });
  ipcMain.handle("tasks:remove", (_, id: string) => services.taskService.removeTask(id));
  ipcMain.handle("tasks:clear-finished", () => services.taskService.clearFinishedTasks());

  ipcMain.handle("catalog:list-versions", (_, query) => services.versionCatalogService.listVersions(query));

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
