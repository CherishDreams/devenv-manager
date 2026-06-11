import type { EnvironmentKind, InstallTaskInput } from "../shared/types";
import { join } from "node:path";
import { app, BrowserWindow, Menu } from "electron";
import { getErrorMessage, parseJsonAs } from "../shared/errorUtils";
import { registerIpc } from "./ipc/registerIpc";
import { ConfigService } from "./services/configService";
import { shutdownElevatedBroker, startElevatedBrokerServer } from "./services/elevationService";
import { EnvironmentDiscoveryService } from "./services/environmentDiscoveryService";
import { EnvironmentRecordService } from "./services/environmentRecordService";
import { InstallerService } from "./services/installerService";
import { SystemStatusService } from "./services/systemStatusService";
import { TaskService } from "./services/taskService";
import { VersionCatalogService } from "./services/versionCatalogService";

let mainWindow: BrowserWindow | undefined;

function getElevatedBrokerOptions(): { pipePath: string; parentPid?: number } | undefined {
  const markerIndex = process.argv.indexOf("--env-manager-elevated-broker");

  if (markerIndex < 0) {
    return undefined;
  }

  const pipePath = process.argv[markerIndex + 1];
  const parentPid = Number.parseInt(process.argv[markerIndex + 2], 10);
  return pipePath ? { pipePath, parentPid: Number.isNaN(parentPid) ? undefined : parentPid } : undefined;
}

function watchParentProcess(parentPid: number | undefined): void {
  if (!parentPid) {
    return;
  }

  const timer = setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch {
      // Parent process gone, exit broker
      app.exit(0);
    }
  }, 5_000);
  timer.unref();
}

async function runElevatedBroker(options: { pipePath: string; parentPid?: number }): Promise<void> {
  watchParentProcess(options.parentPid);
  const configService = new ConfigService();
  const environmentRecordService = new EnvironmentRecordService(configService);

  await startElevatedBrokerServer(options.pipePath, (operation) =>
    operation.type === "set-active"
      ? environmentRecordService.setActive(operation.environment, operation.id)
      : environmentRecordService.uninstallManaged(operation.id),
  );
}

function getAppIconPath(): string {
  return app.isPackaged ? join(process.resourcesPath, "icon.ico") : join(process.cwd(), "build/icon.ico");
}

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

function getPendingInstallInput(): InstallTaskInput | undefined {
  const markerIndex = process.argv.indexOf("--env-manager-create-install");
  const encodedInput = markerIndex >= 0 ? process.argv[markerIndex + 1] : undefined;

  if (!encodedInput) {
    return undefined;
  }

  try {
    return parseJsonAs<InstallTaskInput>(Buffer.from(encodedInput, "base64url").toString("utf8"), "InstallTaskInput");
  } catch {
    // Malformed install input from CLI, ignore
    return undefined;
  }
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
        window.webContents.send("environments:switch-failed", getErrorMessage(error));
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
    icon: getAppIconPath(),
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
  const environmentDiscoveryService = new EnvironmentDiscoveryService(environmentRecordService, configService);
  const installerService = new InstallerService(configService);
  const systemStatusService = new SystemStatusService();
  const taskService = new TaskService(installerService, environmentRecordService);

  registerIpc(mainWindow, {
    configService,
    environmentDiscoveryService,
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

  const pendingInstallInput = getPendingInstallInput();
  if (pendingInstallInput) {
    mainWindow.webContents.once("did-finish-load", () => {
      void taskService.createInstallTask(pendingInstallInput);
    });
  }
}

const elevatedBrokerOptions = getElevatedBrokerOptions();

void app.whenReady().then(() => {
  if (elevatedBrokerOptions) {
    void runElevatedBroker(elevatedBrokerOptions);
    return;
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    void shutdownElevatedBroker();
    app.quit();
  }
});
