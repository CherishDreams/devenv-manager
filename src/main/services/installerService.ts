import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat, cp } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { finished } from "node:stream/promises";
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

const supportedJavaVendors = new Set(["temurin"]);

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function fetchText(url: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`请求失败 ${response.status}: ${url}`);
  }

  return response.text();
}

async function fetchJson<TData>(url: string, signal: AbortSignal): Promise<TData> {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`请求失败 ${response.status}: ${url}`);
  }

  return response.json() as Promise<TData>;
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
  signal: AbortSignal,
  onProgress: (progress: TaskDownloadProgress) => void,
): Promise<void> {
  const response = await fetch(url, {
    redirect: "follow",
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`下载失败 ${response.status}: ${url}`);
  }

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
}

async function extractZip(archivePath: string, installPath: string, cacheDir: string, signal: AbortSignal): Promise<void> {
  const extractDir = join(cacheDir, `extract-${Date.now()}-${crypto.randomUUID()}`);
  await mkdir(extractDir, { recursive: true });

  try {
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
  return definition.pathEntries.map((entry) => join(installPath, entry));
}

function getEnvVars(definition: EnvironmentDefinition, installPath: string): Record<string, string> {
  return Object.fromEntries(definition.envVars.map((name) => [name, installPath]));
}

function getVerificationCommand(environment: EnvironmentKind, installPath: string): { command: string; args: string[] } {
  switch (environment) {
    case "java":
      return { command: join(installPath, "bin", "java.exe"), args: ["-version"] };
    case "go":
      return { command: join(installPath, "bin", "go.exe"), args: ["version"] };
    case "maven":
      return { command: join(installPath, "bin", "mvn.cmd"), args: ["-version"] };
    case "conda":
      return { command: join(installPath, "Scripts", "conda.exe"), args: ["--version"] };
  }
}

export class InstallerService {
  constructor(private readonly configService: ConfigService) {}

  async install(input: InstallTaskInput, events: InstallerEvents, signal: AbortSignal): Promise<InstallationResult> {
    const definition = getDefinition(input.environment);
    events.log("正在读取安装配置。");
    const config = await this.configService.get();

    await mkdir(config.globalInstallDir, { recursive: true });
    await mkdir(config.downloadCacheDir, { recursive: true });
    events.progress(5);
    events.log(`已确认安装目录：${config.globalInstallDir}`);
    events.log(`已确认下载缓存目录：${config.downloadCacheDir}`);

    const resource = await this.resolveResource(input, signal);
    events.progress(12);
    events.log(`资源已解析：${resource.fileName}`);

    const installPath = getInstallPath(config, input, resource.resolvedVersion);
    await ensureEmptyInstallTarget(installPath);
    events.progress(16);
    events.log(`目标安装目录可用：${installPath}`);

    const downloadPath = join(config.downloadCacheDir, resource.fileName);
    events.log(`开始下载：${resource.url}`);
    await downloadFile(resource.url, downloadPath, signal, (downloadProgress) => {
      events.downloadProgress(downloadProgress);

      if (typeof downloadProgress.percent === "number") {
        events.progress(Math.min(55, 18 + Math.round((downloadProgress.percent / 100) * 37)));
      }
    });
    events.progress(58);
    events.log(`下载完成：${downloadPath}`);

    if (resource.packageType === "archive") {
      events.log("开始解压安装包。");
      events.log("正在调用 PowerShell 解压安装包，压缩包较大时这里可能需要等待。");
      events.progress(62);
      await extractZip(downloadPath, installPath, config.downloadCacheDir, signal);
    } else {
      events.log("开始执行静默安装。");
      events.progress(62);
      await this.runInstaller(input, downloadPath, installPath, signal);
    }

    events.progress(78);
    events.log("安装文件已就绪。");

    const envVars = getEnvVars(definition, installPath);
    const pathEntries = getPathEntries(definition, installPath);

    if (input.configureSystemEnv) {
      const target = await this.configureEnvironment(envVars, pathEntries, signal);
      events.log(`环境变量已写入：${target}`);
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

  private async resolveResource(input: InstallTaskInput, signal: AbortSignal): Promise<PackageResource> {
    switch (input.environment) {
      case "java":
        return this.resolveJava(input);
      case "go":
        return this.resolveGo(input, signal);
      case "maven":
        return this.resolveMaven(input, signal);
      case "conda":
        return this.resolveConda(input);
    }
  }

  private resolveJava(input: InstallTaskInput): PackageResource {
    const vendor = input.vendor ?? "temurin";

    if (!supportedJavaVendors.has(vendor)) {
      throw new Error("当前自动安装暂只支持 Eclipse Temurin。");
    }

    return {
      url: `https://api.adoptium.net/v3/binary/latest/${input.version}/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk`,
      fileName: `temurin-jdk-${input.version}-windows-x64.zip`,
      packageType: "archive",
      resolvedVersion: input.version,
    };
  }

  private async resolveGo(input: InstallTaskInput, signal: AbortSignal): Promise<PackageResource> {
    const releases = await fetchJson<GoRelease[]>("https://go.dev/dl/?mode=json&include=all", signal);
    const release = releases.find((item) => item.version === `go${input.version}` || item.version.startsWith(`go${input.version}.`));
    const file = release?.files.find((item) => item.os === "windows" && item.arch === "amd64" && item.kind === "archive");

    if (!release || !file) {
      throw new Error(`未找到 Go ${input.version} 的 Windows x64 压缩包。`);
    }

    return {
      url: `https://go.dev/dl/${file.filename}`,
      fileName: file.filename,
      packageType: "archive",
      resolvedVersion: release.version.replace(/^go/, ""),
    };
  }

  private async resolveMaven(input: InstallTaskInput, signal: AbortSignal): Promise<PackageResource> {
    const metadata = await fetchText(
      "https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/maven-metadata.xml",
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

  private resolveConda(input: InstallTaskInput): PackageResource {
    const vendor = input.vendor ?? "miniconda";

    if (vendor === "anaconda") {
      return {
        url: "https://repo.anaconda.com/archive/Anaconda3-latest-Windows-x86_64.exe",
        fileName: "Anaconda3-latest-Windows-x86_64.exe",
        packageType: "installer",
        resolvedVersion: "latest",
      };
    }

    return {
      url: "https://repo.anaconda.com/miniconda/Miniconda3-latest-Windows-x86_64.exe",
      fileName: "Miniconda3-latest-Windows-x86_64.exe",
      packageType: "installer",
      resolvedVersion: input.version,
    };
  }

  private async runInstaller(
    input: InstallTaskInput,
    installerPath: string,
    installPath: string,
    signal: AbortSignal,
  ): Promise<void> {
    if (input.environment !== "conda") {
      throw new Error("暂不支持该安装器类型。");
    }

    await ensureEmptyInstallTarget(installPath);
    await runProcess(
      installerPath,
      ["/InstallationType=JustMe", "/RegisterPython=0", "/NoShortcuts=1", "/AddToPath=0", "/S", `/D=${installPath}`],
      signal,
    );
  }

  private async configureEnvironment(
    envVars: Record<string, string>,
    pathEntries: string[],
    signal: AbortSignal,
  ): Promise<"Machine" | "User"> {
    const script = (target: "Machine" | "User"): string => {
      const envScript = Object.entries(envVars)
        .map(([name, value]) => `[Environment]::SetEnvironmentVariable(${psQuote(name)}, ${psQuote(value)}, ${psQuote(target)})`)
        .join("; ");
      const entries = pathEntries.map(psQuote).join(", ");

      return `
        ${envScript};
        $path = [Environment]::GetEnvironmentVariable('Path', ${psQuote(target)});
        $items = @();
        if ($path) { $items = $path -split ';' | Where-Object { $_ } }
        $managed = @(${entries});
        foreach ($entry in $managed) {
          if ($items -notcontains $entry) { $items += $entry }
        }
        [Environment]::SetEnvironmentVariable('Path', ($items -join ';'), ${psQuote(target)});
      `;
    };

    try {
      await runProcess(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script("Machine")],
        signal,
      );
      return "Machine";
    } catch {
      await runProcess("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script("User")], signal);
      return "User";
    }
  }
}
