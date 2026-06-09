import { app } from "electron";
import { join, resolve } from "node:path";
import { createOfficialMirrorSettings } from "../../shared/mirrorPresets";
import type { AppConfig } from "../../shared/types";
import { JsonFileStore } from "./jsonFileStore";

const systemDrive = process.env.SystemDrive ?? "C:";
const testingGlobalInstallDir = resolve("E:\\dev_env");
const legacyGlobalInstallDir = resolve(`${systemDrive}\\DevEnvs`);

function createDefaultConfig(): AppConfig {
  return {
    globalInstallDir: testingGlobalInstallDir,
    downloadCacheDir: join(testingGlobalInstallDir, ".cache"),
    retainDownloads: true,
    appearance: {
      navigationLayout: "sidebar",
    },
    environmentManagement: {
      mode: "symlink",
    },
    proxy: {
      enabled: false,
      httpProxy: "",
      httpsProxy: "",
    },
    mirrors: createOfficialMirrorSettings(),
  };
}

function mergeConfig(current: AppConfig, patch: Partial<AppConfig>): AppConfig {
  const normalizedCurrent = normalizeConfig(current);

  return {
    ...normalizedCurrent,
    ...patch,
    appearance: {
      ...normalizedCurrent.appearance,
      ...patch.appearance,
    },
    environmentManagement: {
      ...normalizedCurrent.environmentManagement,
      ...patch.environmentManagement,
    },
    proxy: {
      ...normalizedCurrent.proxy,
      ...patch.proxy,
    },
    mirrors: {
      ...normalizedCurrent.mirrors,
      ...patch.mirrors,
    },
  };
}

function normalizeConfig(config: AppConfig): AppConfig {
  const defaults = createDefaultConfig();
  const partialConfig = config as Partial<AppConfig>;

  return {
    ...defaults,
    ...partialConfig,
    appearance: {
      ...defaults.appearance,
      ...partialConfig.appearance,
    },
    environmentManagement: {
      ...defaults.environmentManagement,
      ...partialConfig.environmentManagement,
    },
    proxy: {
      ...defaults.proxy,
      ...partialConfig.proxy,
    },
    mirrors: {
      ...defaults.mirrors,
      ...partialConfig.mirrors,
    },
  };
}

export class ConfigService {
  private readonly store = new JsonFileStore<AppConfig>(
    join(app.getPath("userData"), "config.json"),
    createDefaultConfig(),
  );

  async get(): Promise<AppConfig> {
    const config = normalizeConfig(await this.store.read());

    if (resolve(config.globalInstallDir) === legacyGlobalInstallDir) {
      return this.store.write({
        ...config,
        globalInstallDir: testingGlobalInstallDir,
        downloadCacheDir: join(testingGlobalInstallDir, ".cache"),
      });
    }

    return config;
  }

  update(patch: Partial<AppConfig>): Promise<AppConfig> {
    return this.store.update((current) => mergeConfig(current, patch));
  }
}
