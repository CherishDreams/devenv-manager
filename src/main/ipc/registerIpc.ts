import { dialog, ipcMain, type BrowserWindow } from "electron";
import type { AppConfig, EnvironmentKind, InstallTaskInput } from "../../shared/types";
import { ConfigService } from "../services/configService";
import { EnvironmentRecordService } from "../services/environmentRecordService";
import { SystemStatusService } from "../services/systemStatusService";
import { TaskService } from "../services/taskService";
import { VersionCatalogService } from "../services/versionCatalogService";

export interface IpcServices {
  configService: ConfigService;
  environmentRecordService: EnvironmentRecordService;
  systemStatusService: SystemStatusService;
  taskService: TaskService;
  versionCatalogService: VersionCatalogService;
}

export function registerIpc(mainWindow: BrowserWindow, services: IpcServices): void {
  ipcMain.handle("config:get", () => services.configService.get());
  ipcMain.handle("config:update", (_, patch: Partial<AppConfig>) => services.configService.update(patch));

  ipcMain.handle("system:get-status", () => services.systemStatusService.getStatus());

  ipcMain.handle("environments:get-summary", () => services.environmentRecordService.getSummary());
  ipcMain.handle("environments:set-active", (_, environment: EnvironmentKind, id: string) =>
    services.environmentRecordService.setActive(environment, id),
  );

  ipcMain.handle("tasks:list", () => services.taskService.list());
  ipcMain.handle("tasks:create-install", (_, input: InstallTaskInput) => services.taskService.createInstallTask(input));
  ipcMain.handle("tasks:cancel", (_, id: string) => services.taskService.cancelTask(id));

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
