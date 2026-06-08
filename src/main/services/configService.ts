import { app } from "electron";
import { join, resolve } from "node:path";
import type { AppConfig } from "../../shared/types";
import { JsonFileStore } from "./jsonFileStore";

const systemDrive = process.env.SystemDrive ?? "C:";
const testingGlobalInstallDir = resolve("E:\\dev_env");
const legacyGlobalInstallDir = resolve(`${systemDrive}\\DevEnvs`);

function createDefaultConfig(): AppConfig {
  const userData = app.getPath("userData");

  return {
    globalInstallDir: testingGlobalInstallDir,
    downloadCacheDir: join(testingGlobalInstallDir, ".cache"),
    retainDownloads: true,
    proxy: {
      enabled: false,
      httpProxy: "",
      httpsProxy: "",
    },
    mirrors: {
      java: "official",
      go: "official",
      maven: "official",
      conda: "official",
    },
  };
}

function mergeConfig(current: AppConfig, patch: Partial<AppConfig>): AppConfig {
  return {
    ...current,
    ...patch,
    proxy: {
      ...current.proxy,
      ...patch.proxy,
    },
    mirrors: {
      ...current.mirrors,
      ...patch.mirrors,
    },
  };
}

export class ConfigService {
  private readonly store = new JsonFileStore<AppConfig>(
    join(app.getPath("userData"), "config.json"),
    createDefaultConfig(),
  );

  async get(): Promise<AppConfig> {
    const config = await this.store.read();

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
