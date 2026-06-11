import type { AppConfig, EnvironmentDefinition, EnvironmentKind, InstallTaskInput } from "../../../shared/types";
import { join, resolve } from "node:path";
import { environmentDefinitions } from "../../../shared/environmentDefinitions";

export function getDefinition(environment: EnvironmentKind): EnvironmentDefinition {
  const definition = environmentDefinitions.find((item) => item.id === environment);

  if (!definition) {
    throw new Error(`未知环境：${environment}`);
  }

  return definition;
}

export function getInstallPath(config: AppConfig, input: InstallTaskInput, resolvedVersion: string): string {
  if (input.scope === "custom") {
    if (!input.installPath) {
      throw new Error("未指定手动安装路径。");
    }

    return resolve(input.installPath);
  }

  return resolve(config.globalInstallDir, input.environment, input.vendor ?? "default", resolvedVersion);
}

export function getPathEntries(definition: EnvironmentDefinition, installPath: string): string[] {
  return definition.pathEntries.map((entry) => (entry ? join(installPath, entry) : installPath));
}

export function getEnvVars(definition: EnvironmentDefinition, installPath: string): Record<string, string> {
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

export function getVerificationCommand(environment: EnvironmentKind, installPath: string): { command: string; args: string[] } {
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
    case "gradle":
      return { command: join(installPath, "bin", "gradle.bat"), args: ["--version"] };
    case "cmake":
      return { command: join(installPath, "bin", "cmake.exe"), args: ["--version"] };
    case "ninja":
      return { command: join(installPath, "ninja.exe"), args: ["--version"] };
    case "cpp":
      return { command: join(installPath, "bin", "clang++.exe"), args: ["--version"] };
    case "lua":
      return { command: join(installPath, "lua.exe"), args: ["-v"] };
    case "rust":
      return { command: join(installPath, "cargo", "bin", "rustc.exe"), args: ["--version"] };
    case "dotnet":
      return { command: join(installPath, "dotnet.exe"), args: ["--version"] };
    case "php":
      return { command: join(installPath, "php.exe"), args: ["-v"] };
    case "ruby":
      return { command: join(installPath, "bin", "ruby.exe"), args: ["-v"] };
    case "flutter":
      return { command: join(installPath, "bin", "flutter.bat"), args: ["--version"] };
    case "android":
      return { command: join(installPath, "cmdline-tools", "bin", "sdkmanager.bat"), args: ["--version"] };
    case "mysql":
      return { command: join(installPath, "bin", "mysqld.exe"), args: ["--version"] };
    case "postgresql":
      return { command: join(installPath, "bin", "postgres.exe"), args: ["--version"] };
    case "mongodb":
      return { command: join(installPath, "bin", "mongod.exe"), args: ["--version"] };
    case "redis":
      return { command: join(installPath, "redis-server.exe"), args: ["--version"] };
    case "sqlite":
      return { command: join(installPath, "sqlite3.exe"), args: ["--version"] };
    default: {
      const unhandled: never = environment;
      throw new Error(`不支持的环境类型：${String(unhandled)}`);
    }
  }
}

export function compareVersion(left: string, right: string): number {
  const leftParts = left.split(".").map((part) => Number.parseInt(part, 10));
  const rightParts = right.split(".").map((part) => Number.parseInt(part, 10));
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart !== rightPart) {
      return leftPart - rightPart;
    }
  }

  return 0;
}
