import { app, BrowserWindow, Menu } from "electron";
import { join } from "node:path";
import { registerIpc } from "./ipc/registerIpc";
import { ConfigService } from "./services/configService";
import { EnvironmentRecordService } from "./services/environmentRecordService";
import { InstallerService } from "./services/installerService";
import { SystemStatusService } from "./services/systemStatusService";
import { TaskService } from "./services/taskService";
import { VersionCatalogService } from "./services/versionCatalogService";
import type { EnvironmentKind } from "../shared/types";

let mainWindow: BrowserWindow | undefined;

function getPendingSetActive(): { environment: EnvironmentKind; id: string } | undefined {
  const markerIndex = process.argv.indexOf("--env-manager-set-active");

  if (markerIndex < 0) {
    return undefined;
  }

  const environment = process.argv[markerIndex + 1] as EnvironmentKind | undefined;
  const id = process.argv[markerIndex + 2];

  if (!environment || !id) {
    return undefined;
  }

  return { environment, id };
}

function runPendingSetActive(
  window: BrowserWindow,
  environmentRecordService: EnvironmentRecordService,
  pending: { environment: EnvironmentKind; id: string },
): void {
  window.webContents.once("did-finish-load", () => {
    void environmentRecordService
      .setActive(pending.environment, pending.id)
      .then((summary) => {
        window.webContents.send("environments:changed", summary);
      })
      .catch((error) => {
        window.webContents.send("environments:switch-failed", (error as Error).message);
      });
  });
}

function createWindow(): void {
  const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);

  Menu.setApplicationMenu(null);

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
  mainWindow.setMenu(null);

  const configService = new ConfigService();
  const environmentRecordService = new EnvironmentRecordService(configService);
  const installerService = new InstallerService(configService);
  const systemStatusService = new SystemStatusService();
  const taskService = new TaskService(installerService, environmentRecordService);

  registerIpc(mainWindow, {
    configService,
    environmentRecordService,
    systemStatusService,
    taskService,
    versionCatalogService: new VersionCatalogService(configService),
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });

  if (isDev) {
    mainWindow.webContents.on("before-input-event", (_, input) => {
      const key = input.key.toLowerCase();
      const shouldToggleDevTools =
        input.type === "keyDown" && (key === "f12" || (input.control && input.shift && key === "i"));

      if (shouldToggleDevTools) {
        mainWindow?.webContents.toggleDevTools();
      }
    });
  }

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  const pendingSetActive = getPendingSetActive();
  if (pendingSetActive) {
    runPendingSetActive(mainWindow, environmentRecordService, pendingSetActive);
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
