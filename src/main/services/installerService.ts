import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat, cp, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { finished } from "node:stream/promises";
import { fetch, ProxyAgent, type Dispatcher } from "undici";
import { environmentDefinitions } from "../../shared/environmentDefinitions";
import type {
  AppConfig,
  EnvironmentDefinition,
  EnvironmentKind,
  InstallationResult,
  InstallTaskInput,
  TaskDownloadProgress,
  TaskLogEntry,
} from "../../shared/types";
import { ConfigService } from "./configService";

export interface InstallerEvents {
  log: (message: string, level?: TaskLogEntry["level"]) => void;
  progress: (progress: number) => void;
  downloadProgress: (progress: TaskDownloadProgress) => void;
}

interface PackageResource {
  url: string;
  fileName: string;
  packageType: "archive" | "installer";
  resolvedVersion: string;
  sourceName?: string;
}

interface GoRelease {
  version: string;
  files: Array<{
    filename: string;
    os: string;
    arch: string;
    kind: string;
  }>;
}

interface ZuluPackage {
  download_url: string;
  java_version: number[];
  name: string;
}

interface LibericaRelease {
  downloadUrl: string;
  filename: string;
  GA: boolean;
  packageType: string;
  version: string;
}

interface NodeRelease {
  version: string;
  lts: false | string;
  files: string[];
}

function describeFetchError(error: unknown): string {
  const cause = (error as { cause?: { code?: string; message?: string } }).cause;
  const details = [error instanceof Error ? error.message : String(error), cause?.code, cause?.message].filter(Boolean);
  return details.join(" / ");
}

function getProxyUrl(url: string, config: AppConfig): string | undefined {
  if (!config.proxy.enabled) {
    return undefined;
  }

  const requestProtocol = new URL(url).protocol;
  const preferredProxy = requestProtocol === "http:" ? config.proxy.httpProxy : config.proxy.httpsProxy;
  const fallbackProxy = requestProtocol === "http:" ? config.proxy.httpsProxy : config.proxy.httpProxy;
  const proxyUrl = (preferredProxy || fallbackProxy).trim();
  return proxyUrl || undefined;
}

function createProxyDispatcher(url: string, config: AppConfig): Dispatcher | undefined {
  const proxyUrl = getProxyUrl(url, config);

  if (!proxyUrl) {
    return undefined;
  }

  try {
    return new ProxyAgent(proxyUrl);
  } catch (error) {
    throw new Error(`代理地址无效：${proxyUrl}\n${describeFetchError(error)}`);
  }
}

async function closeDispatcher(dispatcher: Dispatcher | undefined): Promise<void> {
  await dispatcher?.close().catch(() => undefined);
}

function getGoDownloadSource(name: string, baseUrl: string): { name: string; url: string; downloadBaseUrl: string } {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const downloadBaseUrl = normalizedBaseUrl.endsWith("/dl") ? normalizedBaseUrl : `${normalizedBaseUrl}/dl`;

  return {
    name,
    url: `${downloadBaseUrl}/?mode=json&include=all`,
    downloadBaseUrl,
  };
}

function isPlainZuluPackage(item: ZuluPackage): boolean {
  return !item.name.includes("-fx-") && !item.name.includes("-crac-");
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function fetchText(url: string, config: AppConfig, signal: AbortSignal): Promise<string> {
  const dispatcher = createProxyDispatcher(url, config);
  let response: Awaited<ReturnType<typeof fetch>>;

  try {
    response = await fetch(url, { dispatcher, signal });
  } catch (error) {
    await closeDispatcher(dispatcher);
    throw new Error(`请求失败：${url}\n${describeFetchError(error)}`);
  }

  try {
    if (!response.ok) {
      throw new Error(`请求失败 ${response.status}: ${url}`);
    }

    return await response.text();
  } finally {
    await closeDispatcher(dispatcher);
  }
}

async function fetchJson<TData>(url: string, config: AppConfig, signal: AbortSignal): Promise<TData> {
  const dispatcher = createProxyDispatcher(url, config);
  let response: Awaited<ReturnType<typeof fetch>>;

  try {
    response = await fetch(url, { dispatcher, signal });
  } catch (error) {
    await closeDispatcher(dispatcher);
    throw new Error(`请求失败：${url}\n${describeFetchError(error)}`);
  }

  try {
    if (!response.ok) {
      throw new Error(`请求失败 ${response.status}: ${url}`);
    }

    return (await response.json()) as TData;
  } finally {
    await closeDispatcher(dispatcher);
  }
}

async function fetchJsonFromSources<TData>(
  sources: Array<{ name: string; url: string; downloadBaseUrl: string }>,
  config: AppConfig,
  signal: AbortSignal,
): Promise<{ data: TData; source: { name: string; downloadBaseUrl: string } }> {
  const errors: string[] = [];

  for (const source of sources) {
    try {
      return {
        data: await fetchJson<TData>(source.url, config, signal),
        source,
      };
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }

      errors.push(`${source.name}: ${(error as Error).message}`);
    }
  }

  throw new Error(`所有下载源请求失败：\n${errors.join("\n")}`);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function ensureEmptyInstallTarget(installPath: string): Promise<void> {
  if (!(await pathExists(installPath))) {
    await mkdir(dirname(installPath), { recursive: true });
    return;
  }

  const entries = await readdir(installPath);

  if (entries.length > 0) {
    throw new Error(`安装目录已存在且不为空：${installPath}`);
  }

  await rm(installPath, { recursive: true, force: true });
  await mkdir(dirname(installPath), { recursive: true });
}

async function moveDirectory(source: string, target: string): Promise<void> {
  try {
    await rename(source, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") {
      throw error;
    }

    await cp(source, target, { recursive: true });
    await rm(source, { recursive: true, force: true });
  }
}

async function findArchiveRoot(extractDir: string): Promise<string> {
  const entries = await readdir(extractDir, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());

  if (directories.length === 1) {
    return join(extractDir, directories[0].name);
  }

  return extractDir;
}

function runProcess(
  command: string,
  args: string[],
  signal: AbortSignal,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolveProcess, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";

    const abort = (): void => {
      child.kill();
      reject(new Error("任务已取消。"));
    };

    if (signal.aborted) {
      abort();
      return;
    }

    signal.addEventListener("abort", abort, { once: true });

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      signal.removeEventListener("abort", abort);
      reject(error);
    });
    child.on("close", (code) => {
      signal.removeEventListener("abort", abort);

      if (signal.aborted) {
        reject(new Error("任务已取消。"));
        return;
      }

      if (code === 0) {
        resolveProcess({ stdout, stderr });
        return;
      }

      reject(new Error(`${basename(command)} 退出码 ${code}\n${stderr || stdout}`));
    });
  });
}

async function downloadFile(
  url: string,
  targetFile: string,
  config: AppConfig,
  signal: AbortSignal,
  onProgress: (progress: TaskDownloadProgress) => void,
): Promise<void> {
  const dispatcher = createProxyDispatcher(url, config);
  let response: Awaited<ReturnType<typeof fetch>>;

  try {
    response = await fetch(url, {
      dispatcher,
      redirect: "follow",
      signal,
    });
  } catch (error) {
    await closeDispatcher(dispatcher);
    throw new Error(`下载失败：${url}\n${describeFetchError(error)}`);
  }

  if (!response.ok || !response.body) {
    await closeDispatcher(dispatcher);
    throw new Error(`下载失败 ${response.status}: ${url}`);
  }

  try {
    await mkdir(dirname(targetFile), { recursive: true });
    const total = Number(response.headers.get("content-length") ?? 0);
    const file = createWriteStream(targetFile);
    const reader = response.body.getReader();
    let received = 0;
    const startedAt = Date.now();
    let lastReportedAt = 0;
    let lastSpeedAt = startedAt;
    let lastSpeedBytes = 0;
    let bytesPerSecond = 0;

    const emitProgress = (completed: boolean): void => {
      const now = Date.now();
      const speedElapsedSeconds = Math.max((now - lastSpeedAt) / 1000, 0.001);

      if (completed || now - lastSpeedAt >= 500) {
        bytesPerSecond = Math.max(0, Math.round((received - lastSpeedBytes) / speedElapsedSeconds));
        lastSpeedAt = now;
        lastSpeedBytes = received;
      }

      onProgress({
        url,
        fileName: basename(targetFile),
        receivedBytes: received,
        totalBytes: total > 0 ? total : undefined,
        bytesPerSecond,
        percent: total > 0 ? Math.min(100, Math.round((received / total) * 100)) : undefined,
        updatedAt: new Date(now).toISOString(),
        completed,
      });
      lastReportedAt = now;
    };

    const writeChunk = (chunk: Buffer): Promise<void> => {
      if (file.write(chunk)) {
        return Promise.resolve();
      }

      return new Promise((resolveWrite, rejectWrite) => {
        file.once("drain", resolveWrite);
        file.once("error", rejectWrite);
      });
    };

    try {
      emitProgress(false);

      while (true) {
        if (signal.aborted) {
          throw new Error("任务已取消。");
        }

        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        received += value.byteLength;
        await writeChunk(Buffer.from(value));

        if (Date.now() - lastReportedAt >= 500) {
          emitProgress(false);
        }
      }
    } finally {
      file.end();
    }

    await finished(file);
    emitProgress(true);
  } finally {
    await closeDispatcher(dispatcher);
  }
}

async function extractZip(
  archivePath: string,
  installPath: string,
  cacheDir: string,
  signal: AbortSignal,
  onLog: (message: string, level?: TaskLogEntry["level"]) => void,
): Promise<void> {
  const extractDir = join(cacheDir, `extract-${Date.now()}-${crypto.randomUUID()}`);
  await mkdir(extractDir, { recursive: true });
  const startedAt = Date.now();
  let extractor = "tar.exe";

  try {
    try {
      onLog("正在使用 tar.exe 解压安装包。");
      await runProcess("tar.exe", ["-xf", archivePath, "-C", extractDir], signal);
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }

      extractor = "PowerShell Expand-Archive";
      onLog(`tar.exe 解压失败，回退 PowerShell：${(error as Error).message.split("\n")[0]}`, "warn");
      await runProcess(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `Expand-Archive -LiteralPath ${psQuote(archivePath)} -DestinationPath ${psQuote(extractDir)} -Force`,
        ],
        signal,
      );
    }

    const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    onLog(`解压完成：${extractor}，耗时 ${elapsedSeconds} 秒。`);

    const archiveRoot = await findArchiveRoot(extractDir);
    await ensureEmptyInstallTarget(installPath);
    await moveDirectory(archiveRoot, installPath);
  } finally {
    await rm(extractDir, { recursive: true, force: true });
  }
}

function getDefinition(environment: EnvironmentKind): EnvironmentDefinition {
  const definition = environmentDefinitions.find((item) => item.id === environment);

  if (!definition) {
    throw new Error(`未知环境：${environment}`);
  }

  return definition;
}

function getInstallPath(config: AppConfig, input: InstallTaskInput, resolvedVersion: string): string {
  if (input.scope === "custom") {
    if (!input.installPath) {
      throw new Error("未指定手动安装路径。");
    }

    return resolve(input.installPath);
  }

  return resolve(config.globalInstallDir, input.environment, input.vendor ?? "default", resolvedVersion);
}

function getPathEntries(definition: EnvironmentDefinition, installPath: string): string[] {
  return definition.pathEntries.map((entry) => (entry ? join(installPath, entry) : installPath));
}

function getEnvVars(definition: EnvironmentDefinition, installPath: string): Record<string, string> {
  if (definition.id === "nvm") {
    return {
      NVM_HOME: installPath,
      NVM_SYMLINK: join(installPath, "nodejs"),
    };
  }

  return Object.fromEntries(definition.envVars.map((name) => [name, installPath]));
}

function getVerificationCommand(environment: EnvironmentKind, installPath: string): { command: string; args: string[] } {
  switch (environment) {
    case "java":
      return { command: join(installPath, "bin", "java.exe"), args: ["-version"] };
    case "python":
      return { command: join(installPath, "python.exe"), args: ["--version"] };
    case "conda":
      return { command: join(installPath, "Scripts", "conda.exe"), args: ["--version"] };
    case "go":
      return { command: join(installPath, "bin", "go.exe"), args: ["version"] };
    case "node":
      return { command: join(installPath, "node.exe"), args: ["--version"] };
    case "nvm":
      return { command: join(installPath, "nvm.exe"), args: ["version"] };
    case "maven":
      return { command: join(installPath, "bin", "mvn.cmd"), args: ["-version"] };
  }
}

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

    const resource = await this.resolveResource(input, config, signal);
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
      await this.runInstaller(input, downloadPath, installPath, signal);
    }

    await this.prepareInstalledEnvironment(input, installPath, events.log);

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

  private async resolveResource(input: InstallTaskInput, config: AppConfig, signal: AbortSignal): Promise<PackageResource> {
    switch (input.environment) {
      case "java":
        return this.resolveJava(input, config, signal);
      case "python":
        return this.resolvePython(input, config);
      case "conda":
        return this.resolveConda(input, config);
      case "go":
        return this.resolveGo(input, config, signal);
      case "node":
        return this.resolveNode(input, config, signal);
      case "nvm":
        return this.resolveNvm(input, config);
      case "maven":
        return this.resolveMaven(input, config, signal);
    }
  }

  private async resolveJava(input: InstallTaskInput, config: AppConfig, signal: AbortSignal): Promise<PackageResource> {
    const vendor = input.vendor ?? "temurin";

    if (vendor === "temurin") {
      return {
        url: `https://api.adoptium.net/v3/binary/latest/${input.version}/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk`,
        fileName: `temurin-jdk-${input.version}-windows-x64.zip`,
        packageType: "archive",
        resolvedVersion: input.version,
        sourceName: "Adoptium API",
      };
    }

    if (vendor === "zulu") {
      const packages = await fetchJson<ZuluPackage[]>(
        `https://api.azul.com/metadata/v1/zulu/packages/?java_version=${input.version}&os=windows&arch=x64&java_package_type=jdk&archive_type=zip&release_status=ga&availability_types=CA&page=1&page_size=50`,
        config,
        signal,
      );
      const selectedPackage = packages.find(isPlainZuluPackage);

      if (!selectedPackage) {
        throw new Error(`未找到 Zulu JDK ${input.version} 的 Windows x64 zip。`);
      }

      return {
        url: selectedPackage.download_url,
        fileName: selectedPackage.name,
        packageType: "archive",
        resolvedVersion: selectedPackage.java_version.join("."),
        sourceName: "Azul Metadata API",
      };
    }

    if (vendor === "liberica") {
      const releases = await fetchJson<LibericaRelease[]>(
        `https://api.bell-sw.com/v1/liberica/releases?version-feature=${input.version}&version-modifier=latest&bitness=64&release-type=all&os=windows&arch=x86&package-type=zip&bundle-type=jdk`,
        config,
        signal,
      );
      const selectedRelease = releases.find((item) => item.GA && item.packageType === "zip");

      if (!selectedRelease) {
        throw new Error(`未找到 Liberica JDK ${input.version} 的 Windows x64 zip。`);
      }

      return {
        url: selectedRelease.downloadUrl,
        fileName: selectedRelease.filename,
        packageType: "archive",
        resolvedVersion: selectedRelease.version,
        sourceName: "BellSoft Product Discovery API",
      };
    }

    if (vendor === "oracle") {
      return {
        url: `https://download.oracle.com/java/${input.version}/latest/jdk-${input.version}_windows-x64_bin.zip`,
        fileName: `oracle-jdk-${input.version}-windows-x64.zip`,
        packageType: "archive",
        resolvedVersion: input.version,
        sourceName: "Oracle Java 下载页",
      };
    }

    throw new Error(`暂不支持该 Java 发行商：${vendor}`);
  }

  private resolvePython(input: InstallTaskInput, config: AppConfig): PackageResource {
    const vendor = input.vendor ?? "cpython";

    if (vendor !== "cpython") {
      throw new Error("当前自动安装暂只支持 Python 官方发行版。");
    }

    const configuredMirror = config.mirrors.python.trim();
    const baseUrl = configuredMirror && configuredMirror !== "official" ? configuredMirror.replace(/\/+$/, "") : "https://www.python.org/ftp/python";
    const fileName = `python-${input.version}-amd64.exe`;

    return {
      url: `${baseUrl}/${input.version}/${fileName}`,
      fileName,
      packageType: "installer",
      resolvedVersion: input.version,
      sourceName: configuredMirror && configuredMirror !== "official" ? "自定义 Python 镜像" : "Python 官方源",
    };
  }

  private async resolveGo(input: InstallTaskInput, config: AppConfig, signal: AbortSignal): Promise<PackageResource> {
    const configuredMirror = config.mirrors.go.trim();
    const configuredSource =
      configuredMirror && configuredMirror !== "official"
        ? [getGoDownloadSource("自定义 Go 镜像", configuredMirror)]
        : [];
    const sources = [
      ...configuredSource,
      getGoDownloadSource("Go 官方源", "https://go.dev"),
      getGoDownloadSource("Go 中国镜像", "https://golang.google.cn"),
    ];
    const { data: releases, source } = await fetchJsonFromSources<GoRelease[]>(sources, config, signal);
    const release = releases.find((item) => item.version === `go${input.version}` || item.version.startsWith(`go${input.version}.`));
    const file = release?.files.find((item) => item.os === "windows" && item.arch === "amd64" && item.kind === "archive");

    if (!release || !file) {
      throw new Error(`未找到 Go ${input.version} 的 Windows x64 压缩包。`);
    }

    return {
      url: `${source.downloadBaseUrl}/${file.filename}`,
      fileName: file.filename,
      packageType: "archive",
      resolvedVersion: release.version.replace(/^go/, ""),
      sourceName: source.name,
    };
  }

  private async resolveMaven(input: InstallTaskInput, config: AppConfig, signal: AbortSignal): Promise<PackageResource> {
    const metadata = await fetchText(
      "https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/maven-metadata.xml",
      config,
      signal,
    );
    const versions = Array.from(metadata.matchAll(/<version>([^<]+)<\/version>/g), (match) => match[1]);
    const version = versions.filter((item) => item === input.version || item.startsWith(`${input.version}.`)).at(-1);

    if (!version) {
      throw new Error(`未找到 Maven ${input.version} 的发布版本。`);
    }

    return {
      url: `https://dlcdn.apache.org/maven/maven-3/${version}/binaries/apache-maven-${version}-bin.zip`,
      fileName: `apache-maven-${version}-bin.zip`,
      packageType: "archive",
      resolvedVersion: version,
    };
  }

  private async resolveNode(input: InstallTaskInput, config: AppConfig, signal: AbortSignal): Promise<PackageResource> {
    const vendor = input.vendor ?? "nodejs";

    if (vendor !== "nodejs") {
      throw new Error("当前自动安装暂只支持 Node.js 官方发行版。");
    }

    const configuredMirror = config.mirrors.node.trim();
    const distBaseUrl =
      configuredMirror && configuredMirror !== "official" ? configuredMirror.replace(/\/+$/, "") : "https://nodejs.org/dist";
    const releases = await fetchJson<NodeRelease[]>(`${distBaseUrl}/index.json`, config, signal);
    const requestedVersion = input.version.replace(/^v/, "");
    const release = releases.find((item) => {
      const version = item.version.replace(/^v/, "");
      return version === requestedVersion || version.startsWith(`${requestedVersion}.`);
    });

    if (!release || !release.files.includes("win-x64-zip")) {
      throw new Error(`未找到 Node.js ${input.version} 的 Windows x64 压缩包。`);
    }

    const fileName = `node-${release.version}-win-x64.zip`;

    return {
      url: `${distBaseUrl}/${release.version}/${fileName}`,
      fileName,
      packageType: "archive",
      resolvedVersion: release.version.replace(/^v/, ""),
      sourceName: configuredMirror && configuredMirror !== "official" ? "自定义 Node.js 镜像" : "Node.js 官方源",
    };
  }

  private resolveNvm(input: InstallTaskInput, config: AppConfig): PackageResource {
    const vendor = input.vendor ?? "coreybutler";

    if (vendor !== "coreybutler") {
      throw new Error("当前自动安装暂只支持 nvm-windows。");
    }

    const configuredMirror = config.mirrors.nvm.trim();
    const releaseBaseUrl =
      configuredMirror && configuredMirror !== "official"
        ? configuredMirror.replace(/\/+$/, "")
        : `https://github.com/coreybutler/nvm-windows/releases/download/${input.version}`;

    return {
      url: `${releaseBaseUrl}/nvm-noinstall.zip`,
      fileName: `nvm-windows-${input.version}-noinstall.zip`,
      packageType: "archive",
      resolvedVersion: input.version,
      sourceName: configuredMirror && configuredMirror !== "official" ? "自定义 nvm-windows 镜像" : "GitHub Releases",
    };
  }

  private resolveConda(input: InstallTaskInput, config: AppConfig): PackageResource {
    const vendor = input.vendor ?? "miniconda";
    const configuredMirror = config.mirrors.conda.trim();
    const baseUrl =
      configuredMirror && configuredMirror !== "official" ? configuredMirror.replace(/\/+$/, "") : "https://repo.anaconda.com";

    if (vendor === "anaconda") {
      const fileName =
        input.version === "latest" ? "Anaconda3-latest-Windows-x86_64.exe" : `Anaconda3-${input.version}-Windows-x86_64.exe`;

      return {
        url: `${baseUrl}/archive/${fileName}`,
        fileName,
        packageType: "installer",
        resolvedVersion: input.version,
        sourceName: configuredMirror && configuredMirror !== "official" ? "自定义 Conda 镜像" : "Anaconda 官方源",
      };
    }

    const fileName =
      input.version === "latest" || /^py\d+$/.test(input.version)
        ? "Miniconda3-latest-Windows-x86_64.exe"
        : `Miniconda3-${input.version}-Windows-x86_64.exe`;

    return {
      url: `${baseUrl}/miniconda/${fileName}`,
      fileName,
      packageType: "installer",
      resolvedVersion: input.version,
      sourceName: configuredMirror && configuredMirror !== "official" ? "自定义 Conda 镜像" : "Anaconda 官方源",
    };
  }

  private async runInstaller(
    input: InstallTaskInput,
    installerPath: string,
    installPath: string,
    signal: AbortSignal,
  ): Promise<void> {
    if (input.environment === "python") {
      await ensureEmptyInstallTarget(installPath);
      await runProcess(
        installerPath,
        [
          "/quiet",
          "InstallAllUsers=0",
          "AssociateFiles=0",
          "Shortcuts=0",
          "Include_launcher=0",
          "Include_pip=1",
          "Include_test=0",
          "PrependPath=0",
          `TargetDir=${installPath}`,
        ],
        signal,
      );
      return;
    }

    if (input.environment === "conda") {
      await ensureEmptyInstallTarget(installPath);
      await runProcess(
        installerPath,
        ["/InstallationType=JustMe", "/RegisterPython=0", "/NoShortcuts=1", "/AddToPath=0", "/S", `/D=${installPath}`],
        signal,
      );
      return;
    }

    throw new Error("暂不支持该安装器类型。");
  }

  private async prepareInstalledEnvironment(
    input: InstallTaskInput,
    installPath: string,
    onLog: (message: string, level?: TaskLogEntry["level"]) => void,
  ): Promise<void> {
    if (input.environment !== "nvm") {
      return;
    }

    const symlinkPath = join(installPath, "nodejs");
    const settings = [
      `root: ${installPath}`,
      `path: ${symlinkPath}`,
      "arch: 64",
      "proxy: none",
      "originalpath:",
      "originalversion:",
      "",
    ].join("\r\n");

    await mkdir(symlinkPath, { recursive: true });
    await writeFile(join(installPath, "settings.txt"), settings, "utf8");
    onLog("已写入 nvm-windows settings.txt。");
  }
}
