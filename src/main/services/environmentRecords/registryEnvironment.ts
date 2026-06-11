import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { app } from "electron";

export interface EnvironmentApplyPlan {
  envVars: Record<string, string>;
  addPathEntries: string[];
  removePathEntries: string[];
}

export interface EnvironmentCleanupPlan {
  envVars: Record<string, string>;
  removePathEntries: string[];
}

interface RegistryProcessResult {
  stdout: string;
  stderr: string;
}

const machineEnvironmentRegistryKey = "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment";
const registryBackupDirName = "registry-backups";

function normalizePathEntry(value: string): string {
  return value.trim().replace(/[\\/]+$/, "").toLowerCase();
}

function splitPathValue(value: string | undefined): string[] {
  return (value ?? "")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function updatePathValue(currentValue: string | undefined, removeEntries: string[], addEntries: string[]): string {
  const removeKeys = new Set(removeEntries.map(normalizePathEntry));
  const nextEntries = splitPathValue(currentValue).filter((entry) => !removeKeys.has(normalizePathEntry(entry)));
  const existingKeys = new Set(nextEntries.map(normalizePathEntry));

  addEntries.forEach((entry) => {
    const normalizedEntry = normalizePathEntry(entry);

    if (!existingKeys.has(normalizedEntry)) {
      nextEntries.push(entry);
      existingKeys.add(normalizedEntry);
    }
  });

  return nextEntries.join(";");
}

function runProcess(command: string, args: string[], timeoutMs = 30_000): Promise<RegistryProcessResult> {
  return new Promise((resolveProcess, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
    });
    let settled = false;
    let stdout = "";
    let stderr = "";
    let timeout: ReturnType<typeof setTimeout>;
    const settle = (callback: () => void): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      callback();
    };
    timeout = setTimeout(() => {
      child.kill();
      settle(() => reject(new Error(`${basename(command)} 执行超时。`)));
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      settle(() => reject(error));
    });
    child.on("close", (code) => {
      if (code === 0) {
        settle(() => resolveProcess({ stdout, stderr }));
        return;
      }

      settle(() => reject(new Error(`${basename(command)} 退出码 ${code}\n${stderr || stdout}`)));
    });
  });
}

function decodeRegistryExport(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return buffer.subarray(2).toString("utf16le");
  }

  return buffer.toString("utf8");
}

function unescapeRegistryString(value: string): string {
  return value.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function readContinuedRegistryValue(lines: string[], startIndex: number, firstValue: string): { value: string; endIndex: number } {
  let value = firstValue.trim();
  let index = startIndex;

  while (value.endsWith("\\") && index + 1 < lines.length) {
    value = `${value.slice(0, -1)}${lines[index + 1].trim()}`;
    index += 1;
  }

  return { value, endIndex: index };
}

function parseRegistryHexString(value: string): string | undefined {
  const hexValue = value.replace(/^hex\([^)]+\):/i, "").replace(/^hex:/i, "");
  const bytes = hexValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Number.parseInt(item, 16));

  if (bytes.some((byte) => Number.isNaN(byte))) {
    return undefined;
  }

  return Buffer.from(bytes).toString("utf16le").replace(/\0+$/, "");
}

function parseRegistryExportValue(content: string, name: string): string | undefined {
  const lines = content.split(/\r?\n/);
  const normalizedName = name.toLowerCase();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    const match = /^"((?:\\"|[^"])*)"=(.+)$/.exec(line);

    if (!match || unescapeRegistryString(match[1]).toLowerCase() !== normalizedName) {
      continue;
    }

    const continuedValue = readContinuedRegistryValue(lines, index, match[2]);
    index = continuedValue.endIndex;

    const rawValue = continuedValue.value;
    if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
      return unescapeRegistryString(rawValue.slice(1, -1));
    }

    if (/^hex(?:\([^)]+\))?:/i.test(rawValue)) {
      return parseRegistryHexString(rawValue);
    }
  }

  return undefined;
}

async function readMachineEnvironmentValues(names: string[]): Promise<Record<string, string | undefined>> {
  const tempDir = await mkdtemp(join(tmpdir(), "env-manager-reg-"));
  const exportFile = join(tempDir, "environment.reg");

  try {
    await runProcess("reg.exe", ["export", machineEnvironmentRegistryKey, exportFile, "/y"], 15_000);
    const content = decodeRegistryExport(await readFile(exportFile));
    return Object.fromEntries(names.map((name) => [name, parseRegistryExportValue(content, name)]));
  } catch {
    return Object.fromEntries(names.map((name) => [name, undefined]));
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function writeMachineEnvironmentValue(name: string, value: string, type: "REG_SZ" | "REG_EXPAND_SZ"): Promise<void> {
  await runProcess("reg.exe", ["add", machineEnvironmentRegistryKey, "/v", name, "/t", type, "/d", value, "/f"], 15_000);
}

async function deleteMachineEnvironmentValue(name: string): Promise<void> {
  await runProcess("reg.exe", ["delete", machineEnvironmentRegistryKey, "/v", name, "/f"], 15_000);
}

async function backupMachineEnvironmentRegistry(): Promise<void> {
  const backupDir = join(app.getPath("userData"), registryBackupDirName);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  await mkdir(backupDir, { recursive: true });
  await runProcess("reg.exe", ["export", machineEnvironmentRegistryKey, join(backupDir, `environment-${timestamp}.reg`), "/y"], 15_000);
}

export async function registryNeedsUpdate(plan: EnvironmentApplyPlan): Promise<boolean> {
  const currentValues = await readMachineEnvironmentValues([...Object.keys(plan.envVars), "Path"]);

  for (const [name, value] of Object.entries(plan.envVars)) {
    if (currentValues[name] !== value) {
      return true;
    }
  }

  const currentPath = currentValues.Path;

  if (typeof currentPath !== "string") {
    throw new TypeError("读取系统环境变量 Path 失败，已取消写入。");
  }

  return updatePathValue(currentPath, plan.removePathEntries, plan.addPathEntries) !== currentPath;
}

export async function registryNeedsCleanup(plan: EnvironmentCleanupPlan): Promise<boolean> {
  const currentValues = await readMachineEnvironmentValues([...Object.keys(plan.envVars), "Path"]);

  for (const [name, value] of Object.entries(plan.envVars)) {
    if (currentValues[name] === value) {
      return true;
    }
  }

  const currentPath = currentValues.Path;

  if (typeof currentPath !== "string") {
    throw new TypeError("读取系统环境变量 Path 失败，已取消写入。");
  }

  return updatePathValue(currentPath, plan.removePathEntries, []) !== currentPath;
}

function updateProcessEnvironment(envVars: Record<string, string>, pathValue: string): void {
  Object.entries(envVars).forEach(([name, value]) => {
    process.env[name] = value;
  });

  const pathKey = process.env.Path === undefined && process.env.PATH !== undefined ? "PATH" : "Path";
  process.env[pathKey] = pathValue;
}

function cleanupProcessEnvironment(envVars: Record<string, string>, pathValue: string): void {
  Object.entries(envVars).forEach(([name, value]) => {
    if (process.env[name] === value) {
      delete process.env[name];
    }
  });

  const pathKey = process.env.Path === undefined && process.env.PATH !== undefined ? "PATH" : "Path";
  process.env[pathKey] = pathValue;
}

export async function synchronizeProcessEnvironment(names: string[]): Promise<void> {
  const currentValues = await readMachineEnvironmentValues([...names, "Path"]);

  for (const name of names) {
    const value = currentValues[name];

    if (typeof value === "string") {
      process.env[name] = value;
    } else {
      delete process.env[name];
    }
  }

  const pathValue = currentValues.Path;

  if (typeof pathValue !== "string") {
    throw new TypeError("读取系统环境变量 Path 失败，无法同步当前进程环境。");
  }

  const pathKey = process.env.Path === undefined && process.env.PATH !== undefined ? "PATH" : "Path";
  process.env[pathKey] = pathValue;
}

export async function applyRegistryPlan(plan: EnvironmentApplyPlan): Promise<void> {
  const valuesToWrite: Array<{ name: string; value: string; type: "REG_SZ" | "REG_EXPAND_SZ" }> = [];
  const currentValues = await readMachineEnvironmentValues([...Object.keys(plan.envVars), "Path"]);

  for (const [name, value] of Object.entries(plan.envVars)) {
    if (currentValues[name] !== value) {
      valuesToWrite.push({ name, value, type: "REG_SZ" });
    }
  }

  const currentPath = currentValues.Path;

  if (typeof currentPath !== "string") {
    throw new TypeError("读取系统环境变量 Path 失败，已取消写入。");
  }

  const nextPath = updatePathValue(currentPath, plan.removePathEntries, plan.addPathEntries);

  if (nextPath !== currentPath) {
    valuesToWrite.push({ name: "Path", value: nextPath, type: "REG_EXPAND_SZ" });
  }

  if (valuesToWrite.length > 0) {
    await backupMachineEnvironmentRegistry();
  }

  for (const entry of valuesToWrite) {
    await writeMachineEnvironmentValue(entry.name, entry.value, entry.type);
  }

  updateProcessEnvironment(plan.envVars, nextPath);
}

export async function cleanupRegistryPlan(plan: EnvironmentCleanupPlan): Promise<void> {
  const namesToDelete: string[] = [];
  const currentValues = await readMachineEnvironmentValues([...Object.keys(plan.envVars), "Path"]);

  for (const [name, value] of Object.entries(plan.envVars)) {
    if (currentValues[name] === value) {
      namesToDelete.push(name);
    }
  }

  const currentPath = currentValues.Path;

  if (typeof currentPath !== "string") {
    throw new TypeError("读取系统环境变量 Path 失败，已取消写入。");
  }

  const nextPath = updatePathValue(currentPath, plan.removePathEntries, []);
  const shouldWritePath = nextPath !== currentPath;

  if (namesToDelete.length > 0 || shouldWritePath) {
    await backupMachineEnvironmentRegistry();
  }

  for (const name of namesToDelete) {
    await deleteMachineEnvironmentValue(name).catch(() => undefined);
  }

  if (shouldWritePath) {
    await writeMachineEnvironmentValue("Path", nextPath, "REG_EXPAND_SZ");
  }

  cleanupProcessEnvironment(plan.envVars, nextPath);
}
