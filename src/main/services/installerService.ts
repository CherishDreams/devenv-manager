import type { InstallationResult, InstallTaskInput } from "../../shared/types";
import type { ConfigService } from "./configService";
import type { InstallerEvents } from "./installer/types";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { applyDatabaseInstallConfig } from "./installer/databaseSetup";
import {
  getDefinition,
  getEnvVars,
  getInstallPath,
  getPathEntries,
  getVerificationCommand,
} from "./installer/environmentMetadata";
import { ensureEmptyInstallTarget, extractZip } from "./installer/fileSystem";
import { prepareInstalledEnvironment, runInstaller } from "./installer/installExecutor";
import { downloadFile } from "./installer/network";
import { runProcess } from "./installer/process";
import { resolveResource } from "./installer/resourceResolver";

export type { InstallerEvents } from "./installer/types";

export class InstallerService {
  constructor(private readonly configService: ConfigService) {}

  async install(input: InstallTaskInput, events: InstallerEvents, signal: AbortSignal): Promise<InstallationResult> {
    const definition = getDefinition(input.environment);
    events.log("正在读取安装配置。");
    const config = await this.configService.get();
    if (config.proxy.enabled && (config.proxy.httpProxy.trim() || config.proxy.httpsProxy.trim())) {
      events.log("已启用代理配置。");
    } else if (config.proxy.enabled) {
      events.log("代理已启用但未填写地址，将使用直连。", "warn");
    }

    await mkdir(config.globalInstallDir, { recursive: true });
    await mkdir(config.downloadCacheDir, { recursive: true });
    events.progress(5);
    events.log(`已确认安装目录：${config.globalInstallDir}`);
    events.log(`已确认下载缓存目录：${config.downloadCacheDir}`);

    const resource = await resolveResource(input, config, signal);
    events.progress(12);
    events.log(`资源已解析：${resource.fileName}${resource.sourceName ? `（${resource.sourceName}）` : ""}`);

    const installPath = getInstallPath(config, input, resource.resolvedVersion);
    await ensureEmptyInstallTarget(installPath);
    events.progress(16);
    events.log(`目标安装目录可用：${installPath}`);

    const downloadPath = join(config.downloadCacheDir, resource.fileName);
    events.log(`开始下载：${resource.url}`);
    await downloadFile(resource.url, downloadPath, config, signal, (downloadProgress) => {
      events.downloadProgress(downloadProgress);

      if (typeof downloadProgress.percent === "number") {
        events.progress(Math.min(55, 18 + Math.round((downloadProgress.percent / 100) * 37)));
      }
    });
    events.progress(58);
    events.log(`下载完成：${downloadPath}`);

    if (resource.packageType === "archive") {
      events.log("开始解压安装包。");
      events.log("优先使用 Windows tar.exe 解压，失败时自动回退 PowerShell。");
      events.progress(62);
      await extractZip(downloadPath, installPath, config.downloadCacheDir, signal, events.log);
    } else {
      events.log("开始执行静默安装。");
      events.progress(62);
      await runInstaller(input, downloadPath, installPath, signal);
    }

    await prepareInstalledEnvironment(input, installPath, events.log, signal);
    await applyDatabaseInstallConfig(input, installPath, events.log, signal);

    events.progress(78);
    events.log("安装文件已就绪。");

    const envVars = getEnvVars(definition, installPath);
    const pathEntries = getPathEntries(definition, installPath);

    if (input.configureSystemEnv) {
      events.log("安装完成后将按设置应用环境变量。");
    } else {
      events.log("已跳过环境变量配置。", "warn");
    }

    events.progress(88);

    const verification = getVerificationCommand(input.environment, installPath);
    const verificationResult = await runProcess(verification.command, verification.args, signal);
    const verificationOutput = [verificationResult.stdout.trim(), verificationResult.stderr.trim()].filter(Boolean).join("\n");
    events.progress(96);
    events.log(`验证完成：${verificationOutput.split("\n")[0] ?? verification.command}`);

    if (!config.retainDownloads) {
      await rm(downloadPath, { force: true });
      events.log("已清理下载缓存。");
    }

    return {
      installPath,
      resolvedVersion: resource.resolvedVersion,
      envVars,
      pathEntries,
      verificationOutput,
    };
  }
}
