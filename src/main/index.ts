import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { registerIpc } from "./ipc/registerIpc";
import { ConfigService } from "./services/configService";
import { EnvironmentRecordService } from "./services/environmentRecordService";
import { InstallerService } from "./services/installerService";
import { SystemStatusService } from "./services/systemStatusService";
import { TaskService } from "./services/taskService";
import { VersionCatalogService } from "./services/versionCatalogService";

let mainWindow: BrowserWindow | undefined;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 820,
    minWidth: 1100,
    minHeight: 720,
    title: "环境管理",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const configService = new ConfigService();
  const environmentRecordService = new EnvironmentRecordService();
  const installerService = new InstallerService(configService);

  registerIpc(mainWindow, {
    configService,
    environmentRecordService,
    systemStatusService: new SystemStatusService(),
    taskService: new TaskService(installerService, environmentRecordService),
    versionCatalogService: new VersionCatalogService(),
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
