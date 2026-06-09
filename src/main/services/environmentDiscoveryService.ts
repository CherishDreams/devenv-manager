import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { environmentDefinitions } from "../../shared/environmentDefinitions";
import type { AppConfig, DiscoveredEnvironment, EnvironmentDefinition, EnvironmentKind, EnvironmentSummary } from "../../shared/types";
import { ConfigService } from "./configService";
import { EnvironmentRecordService } from "./environmentRecordService";

const execFileAsync = promisify(execFile);
const commandTimeoutMs = 8_000;

interface Probe {
  environment: EnvironmentKind;
  commands: string[];
  verify: (rootPath: string) => { command: string; args: string[] };
  rootFromExecutable: (executablePath: string) => string;
  parseVersion: (output: string) => string | undefined;
}

interface ServiceInfo {
  Name?: string;
  DisplayName?: string;
  PathName?: string;
}

interface DiscoveryContext {
  existingPaths: Set<string>;
  excludedRoots: Set<string>;
}

function normalizePath(value: string): string {
  return resolve(value).replace(/[\\/]+/g, "\\").replace(/\\+$/, "").toLowerCase();
}

function splitPathValue(value: string | undefined): string[] {
  return (value ?? "")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function runProcess(command: string, args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync(command, args, {
    windowsHide: true,
    timeout: commandTimeoutMs,
  });

  return [stdout, stderr].filter(Boolean).join("\n");
}

function firstVersion(output: string): string | undefined {
  return output.match(/(\d+(?:\.\d+){1,3}(?:[-+][\w.]+)?)/)?.[1];
}

function getDefinition(environment: EnvironmentKind): EnvironmentDefinition {
  const definition = environmentDefinitions.find((item) => item.id === environment);

  if (!definition) {
    throw new Error(`未知环境：${environment}`);
  }

  return definition;
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

  if (definition.id === "rust") {
    return {
      CARGO_HOME: join(installPath, "cargo"),
      RUSTUP_HOME: join(installPath, "rustup"),
    };
  }

  return Object.fromEntries(definition.envVars.map((name) => [name, installPath]));
}

function addNormalizedPath(paths: Set<string>, value: string | undefined): void {
  if (value) {
    paths.add(normalizePath(value));
  }
}

function isPathInside(path: string, root: string): boolean {
  const normalizedPath = normalizePath(path);
  const normalizedRoot = normalizePath(root);
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}\\`);
}

function isWindowsAppsPath(path: string): boolean {
  return /(^|[\\/])windowsapps([\\/]|$)/i.test(path);
}

function isExcludedRoot(path: string, excludedRoots: Set<string>): boolean {
  return Array.from(excludedRoots).some((root) => isPathInside(path, root));
}

function getCurrentLinkPath(config: AppConfig, environment: EnvironmentKind): string {
  return resolve(config.globalInstallDir, ".current", environment);
}

function createExistingPathSet(summary: EnvironmentSummary): Set<string> {
  const paths = new Set<string>();

  summary.installations.forEach((record) => {
    addNormalizedPath(paths, record.installPath);
  });

  return paths;
}

function createDiscoveryExclusionRoots(summary: EnvironmentSummary, config: AppConfig): Set<string> {
  const roots = new Set<string>();

  addNormalizedPath(roots, resolve(config.globalInstallDir, ".current"));

  environmentDefinitions.forEach((definition) => {
    const currentLinkPath = getCurrentLinkPath(config, definition.id);
    addNormalizedPath(roots, currentLinkPath);
    getPathEntries(definition, currentLinkPath).forEach((entry) => addNormalizedPath(roots, entry));
  });

  summary.installations.forEach((record) => {
    addNormalizedPath(roots, record.installPath);
    record.pathEntries.forEach((entry) => addNormalizedPath(roots, entry));
    Object.values(record.envVars).forEach((entry) => addNormalizedPath(roots, entry));
  });

  return roots;
}

async function normalizeCandidateRoot(probe: Probe, rootPath: string): Promise<string> {
  const installPath = resolve(rootPath);

  if (probe.environment !== "java" || basename(installPath).toLowerCase() !== "jre") {
    return installPath;
  }

  const parentPath = dirname(installPath);
  return (await pathExists(join(parentPath, "bin", "java.exe"))) ? parentPath : installPath;
}

function trimExecutablePath(value: string): string | undefined {
  const trimmed = value.trim();
  const quotedMatch = trimmed.match(/^"([^"]+\.exe)"/i);

  if (quotedMatch) {
    return quotedMatch[1];
  }

  return trimmed.match(/^([^\s]+\.exe)/i)?.[1];
}

function createProbeMap(): Map<EnvironmentKind, Probe> {
  const parentOfBin = (executablePath: string): string => dirname(dirname(executablePath));
  const executableDir = (executablePath: string): string => dirname(executablePath);
  const rustRoot = (executablePath: string): string => dirname(dirname(dirname(executablePath)));

  return new Map<EnvironmentKind, Probe>([
    [
      "java",
      {
        environment: "java",
        commands: ["java.exe"],
        verify: (rootPath) => ({ command: join(rootPath, "bin", "java.exe"), args: ["-version"] }),
        rootFromExecutable: parentOfBin,
        parseVersion: (output) => output.match(/version "([^"]+)"/)?.[1] ?? firstVersion(output),
      },
    ],
    [
      "python",
      {
        environment: "python",
        commands: ["python.exe"],
        verify: (rootPath) => ({ command: join(rootPath, "python.exe"), args: ["--version"] }),
        rootFromExecutable: executableDir,
        parseVersion: firstVersion,
      },
    ],
    [
      "conda",
      {
        environment: "conda",
        commands: ["conda.exe"],
        verify: (rootPath) => ({ command: join(rootPath, "Scripts", "conda.exe"), args: ["--version"] }),
        rootFromExecutable: (executablePath) => {
          const directory = dirname(executablePath);
          return ["Scripts", "condabin"].includes(directory.split(/[\\/]/).at(-1) ?? "") ? dirname(directory) : directory;
        },
        parseVersion: firstVersion,
      },
    ],
    [
      "go",
      {
        environment: "go",
        commands: ["go.exe"],
        verify: (rootPath) => ({ command: join(rootPath, "bin", "go.exe"), args: ["version"] }),
        rootFromExecutable: parentOfBin,
        parseVersion: (output) => output.match(/go version go([^\s]+)/)?.[1] ?? firstVersion(output),
      },
    ],
    [
      "node",
      {
        environment: "node",
        commands: ["node.exe"],
        verify: (rootPath) => ({ command: join(rootPath, "node.exe"), args: ["--version"] }),
        rootFromExecutable: executableDir,
        parseVersion: (output) => output.match(/v?(\d+\.\d+\.\d+)/)?.[1],
      },
    ],
    [
      "nvm",
      {
        environment: "nvm",
        commands: ["nvm.exe"],
        verify: (rootPath) => ({ command: join(rootPath, "nvm.exe"), args: ["version"] }),
        rootFromExecutable: executableDir,
        parseVersion: firstVersion,
      },
    ],
    [
      "maven",
      {
        environment: "maven",
        commands: ["mvn.cmd", "mvn.bat"],
        verify: (rootPath) => ({ command: join(rootPath, "bin", "mvn.cmd"), args: ["-version"] }),
        rootFromExecutable: parentOfBin,
        parseVersion: (output) => output.match(/Apache Maven ([^\s]+)/)?.[1] ?? firstVersion(output),
      },
    ],
    [
      "gradle",
      {
        environment: "gradle",
        commands: ["gradle.bat", "gradle.exe"],
        verify: (rootPath) => ({ command: join(rootPath, "bin", "gradle.bat"), args: ["--version"] }),
        rootFromExecutable: parentOfBin,
        parseVersion: (output) => output.match(/Gradle\s+([^\s]+)/)?.[1] ?? firstVersion(output),
      },
    ],
    [
      "cmake",
      {
        environment: "cmake",
        commands: ["cmake.exe"],
        verify: (rootPath) => ({ command: join(rootPath, "bin", "cmake.exe"), args: ["--version"] }),
        rootFromExecutable: parentOfBin,
        parseVersion: (output) => output.match(/cmake version\s+([^\s]+)/i)?.[1] ?? firstVersion(output),
      },
    ],
    [
      "ninja",
      {
        environment: "ninja",
        commands: ["ninja.exe"],
        verify: (rootPath) => ({ command: join(rootPath, "ninja.exe"), args: ["--version"] }),
        rootFromExecutable: executableDir,
        parseVersion: firstVersion,
      },
    ],
    [
      "cpp",
      {
        environment: "cpp",
        commands: ["clang++.exe", "g++.exe"],
        verify: (rootPath) => ({ command: join(rootPath, "bin", "clang++.exe"), args: ["--version"] }),
        rootFromExecutable: parentOfBin,
        parseVersion: (output) => output.match(/clang version ([^\s]+)/)?.[1] ?? firstVersion(output),
      },
    ],
    [
      "rust",
      {
        environment: "rust",
        commands: ["rustc.exe", "cargo.exe"],
        verify: (rootPath) => ({ command: join(rootPath, "cargo", "bin", "rustc.exe"), args: ["--version"] }),
        rootFromExecutable: rustRoot,
        parseVersion: (output) => output.match(/rustc\s+([^\s]+)/)?.[1] ?? firstVersion(output),
      },
    ],
    [
      "dotnet",
      {
        environment: "dotnet",
        commands: ["dotnet.exe"],
        verify: (rootPath) => ({ command: join(rootPath, "dotnet.exe"), args: ["--version"] }),
        rootFromExecutable: executableDir,
        parseVersion: firstVersion,
      },
    ],
    [
      "php",
      {
        environment: "php",
        commands: ["php.exe"],
        verify: (rootPath) => ({ command: join(rootPath, "php.exe"), args: ["-v"] }),
        rootFromExecutable: executableDir,
        parseVersion: (output) => output.match(/PHP\s+([^\s]+)/)?.[1] ?? firstVersion(output),
      },
    ],
    [
      "ruby",
      {
        environment: "ruby",
        commands: ["ruby.exe"],
        verify: (rootPath) => ({ command: join(rootPath, "bin", "ruby.exe"), args: ["-v"] }),
        rootFromExecutable: parentOfBin,
        parseVersion: (output) => output.match(/ruby\s+([^\s]+)/)?.[1] ?? firstVersion(output),
      },
    ],
    [
      "flutter",
      {
        environment: "flutter",
        commands: ["flutter.bat"],
        verify: (rootPath) => ({ command: join(rootPath, "bin", "flutter.bat"), args: ["--version"] }),
        rootFromExecutable: parentOfBin,
        parseVersion: (output) => output.match(/Flutter\s+([^\s]+)/)?.[1] ?? firstVersion(output),
      },
    ],
    [
      "android",
      {
        environment: "android",
        commands: ["sdkmanager.bat", "adb.exe"],
        verify: (rootPath) => ({ command: join(rootPath, "cmdline-tools", "bin", "sdkmanager.bat"), args: ["--version"] }),
        rootFromExecutable: (executablePath) => {
          const directory = dirname(executablePath);
          return directory.toLowerCase().endsWith("platform-tools") ? dirname(directory) : dirname(dirname(directory));
        },
        parseVersion: firstVersion,
      },
    ],
    [
      "lua",
      {
        environment: "lua",
        commands: ["lua.exe"],
        verify: (rootPath) => ({ command: join(rootPath, "lua.exe"), args: ["-v"] }),
        rootFromExecutable: executableDir,
        parseVersion: firstVersion,
      },
    ],
    [
      "mysql",
      {
        environment: "mysql",
        commands: ["mysqld.exe", "mysql.exe"],
        verify: (rootPath) => ({ command: join(rootPath, "bin", "mysqld.exe"), args: ["--version"] }),
        rootFromExecutable: parentOfBin,
        parseVersion: (output) => output.match(/Ver\s+([\d.]+)/)?.[1] ?? firstVersion(output),
      },
    ],
    [
      "postgresql",
      {
        environment: "postgresql",
        commands: ["postgres.exe", "psql.exe"],
        verify: (rootPath) => ({ command: join(rootPath, "bin", "postgres.exe"), args: ["--version"] }),
        rootFromExecutable: parentOfBin,
        parseVersion: (output) => output.match(/PostgreSQL\)?\s+([\d.]+)/)?.[1] ?? firstVersion(output),
      },
    ],
    [
      "mongodb",
      {
        environment: "mongodb",
        commands: ["mongod.exe", "mongo.exe", "mongosh.exe"],
        verify: (rootPath) => ({ command: join(rootPath, "bin", "mongod.exe"), args: ["--version"] }),
        rootFromExecutable: parentOfBin,
        parseVersion: (output) => output.match(/db version v?([^\s]+)/)?.[1] ?? firstVersion(output),
      },
    ],
    [
      "redis",
      {
        environment: "redis",
        commands: ["redis-server.exe", "redis-cli.exe"],
        verify: (rootPath) => ({ command: join(rootPath, "redis-server.exe"), args: ["--version"] }),
        rootFromExecutable: executableDir,
        parseVersion: (output) => output.match(/v=([^\s]+)/)?.[1] ?? firstVersion(output),
      },
    ],
    [
      "sqlite",
      {
        environment: "sqlite",
        commands: ["sqlite3.exe"],
        verify: (rootPath) => ({ command: join(rootPath, "sqlite3.exe"), args: ["--version"] }),
        rootFromExecutable: executableDir,
        parseVersion: firstVersion,
      },
    ],
  ]);
}

async function findExecutables(command: string): Promise<string[]> {
  try {
    const output = await runProcess("where.exe", [command]);
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.toLowerCase().endsWith(command.toLowerCase()));
  } catch {
    return [];
  }
}

async function listDatabaseServices(): Promise<ServiceInfo[]> {
  const command = [
    "$ErrorActionPreference='SilentlyContinue'",
    "$items = Get-CimInstance Win32_Service | Where-Object { $_.Name -match 'mysql|postgres|postgresql|mongo|mongodb|redis' -or $_.DisplayName -match 'mysql|postgres|postgresql|mongo|mongodb|redis' } | Select-Object Name,DisplayName,PathName",
    "$items | ConvertTo-Json -Compress",
  ].join("; ");

  try {
    const output = await runProcess("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command]);
    const parsed = JSON.parse(output || "[]") as ServiceInfo[] | ServiceInfo;
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

export class EnvironmentDiscoveryService {
  private readonly probes = createProbeMap();

  constructor(
    private readonly environmentRecordService: EnvironmentRecordService,
    private readonly configService: ConfigService,
  ) {}

  async discover(): Promise<DiscoveredEnvironment[]> {
    const summary = await this.environmentRecordService.getSummary();
    const config = await this.configService.get();
    const context: DiscoveryContext = {
      existingPaths: createExistingPathSet(summary),
      excludedRoots: createDiscoveryExclusionRoots(summary, config),
    };
    const discovered = new Map<string, DiscoveredEnvironment>();

    for (const definition of environmentDefinitions) {
      const probe = this.probes.get(definition.id);

      if (!probe) {
        continue;
      }

      for (const envVar of definition.envVars) {
        const value = process.env[envVar];

        if (value) {
          await this.addCandidate(discovered, probe, value, `${envVar} 环境变量`, true, context);
        }
      }

      for (const command of probe.commands) {
        const executablePaths = await findExecutables(command);

        for (const executablePath of executablePaths) {
          await this.addCandidate(
            discovered,
            probe,
            probe.rootFromExecutable(executablePath),
            `Path 命令：${command}`,
            false,
            context,
          );
        }
      }
    }

    await this.addDatabaseServiceCandidates(discovered, context);

    return Array.from(discovered.values()).sort((left, right) => left.name.localeCompare(right.name));
  }

  private async addDatabaseServiceCandidates(
    discovered: Map<string, DiscoveredEnvironment>,
    context: DiscoveryContext,
  ): Promise<void> {
    const services = await listDatabaseServices();

    for (const service of services) {
      const executablePath = service.PathName ? trimExecutablePath(service.PathName) : undefined;

      if (!executablePath) {
        continue;
      }

      const lowerPath = executablePath.toLowerCase();
      const environment = lowerPath.includes("postgres")
        ? "postgresql"
        : lowerPath.includes("mysql")
          ? "mysql"
          : lowerPath.includes("mongo")
            ? "mongodb"
            : lowerPath.includes("redis")
              ? "redis"
              : undefined;
      const probe = environment ? this.probes.get(environment) : undefined;

      if (!probe) {
        continue;
      }

      await this.addCandidate(
        discovered,
        probe,
        probe.rootFromExecutable(executablePath),
        `Windows 服务：${service.DisplayName ?? service.Name ?? environment}`,
        true,
        context,
      );
    }
  }

  private async addCandidate(
    discovered: Map<string, DiscoveredEnvironment>,
    probe: Probe,
    rootPath: string,
    source: string,
    active: boolean,
    context: DiscoveryContext,
  ): Promise<void> {
    const installPath = await normalizeCandidateRoot(probe, rootPath);
    const normalizedPath = normalizePath(installPath);
    const key = `${probe.environment}:${normalizedPath}`;

    if (
      discovered.has(key) ||
      isWindowsAppsPath(installPath) ||
      isExcludedRoot(installPath, context.excludedRoots) ||
      !(await pathExists(installPath))
    ) {
      return;
    }

    const definition = getDefinition(probe.environment);
    const verification = probe.verify(installPath);

    if (!(await pathExists(verification.command))) {
      return;
    }

    let version = "未知版本";

    try {
      version = probe.parseVersion(await runProcess(verification.command, verification.args)) ?? version;
    } catch {
      return;
    }

    discovered.set(key, {
      id: key,
      environment: probe.environment,
      name: definition.name,
      version,
      installPath,
      envVars: getEnvVars(definition, installPath),
      pathEntries: getPathEntries(definition, installPath),
      source,
      active,
      alreadyManaged: context.existingPaths.has(normalizedPath),
    });
  }
}
