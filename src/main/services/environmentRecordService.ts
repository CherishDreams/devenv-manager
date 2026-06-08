import { app } from "electron";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { environmentDefinitions } from "../../shared/environmentDefinitions";
import type {
  ActiveEnvironmentMap,
  AppConfig,
  EnvironmentDefinition,
  EnvironmentKind,
  EnvironmentSummary,
  InstallRecord,
  InstallScope,
} from "../../shared/types";
import { ConfigService } from "./configService";
import { JsonFileStore } from "./jsonFileStore";

interface EnvironmentData {
  installations: InstallRecord[];
}

interface RegistryProcessResult {
  stdout: string;
  stderr: string;
}

interface EnvironmentApplyPlan {
  envVars: Record<string, string>;
  addPathEntries: string[];
  removePathEntries: string[];
}

interface EnvironmentCleanupPlan {
  envVars: Record<string, string>;
  removePathEntries: string[];
}

const defaults: EnvironmentData = {
  installations: [],
};

const machineEnvironmentRegistryKey = "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment";
const registryBackupDirName = "registry-backups";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

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

function getDefinition(environment: EnvironmentKind): EnvironmentDefinition {
  const definition = environmentDefinitions.find((item) => item.id === environment);

  if (!definition) {
    throw new Error(`未知环境：${environment}`);
  }

  return definition;
}

function getEnvVars(definition: EnvironmentDefinition, rootPath: string): Record<string, string> {
  if (definition.id === "nvm") {
    return {
      NVM_HOME: rootPath,
      NVM_SYMLINK: join(rootPath, "nodejs"),
    };
  }

  return Object.fromEntries(definition.envVars.map((name) => [name, rootPath]));
}

function getPathEntries(definition: EnvironmentDefinition, rootPath: string): string[] {
  return definition.pathEntries.map((entry) => (entry ? join(rootPath, entry) : rootPath));
}

function getCurrentLinkPath(config: AppConfig, environment: EnvironmentKind): string {
  return resolve(config.globalInstallDir, ".current", environment);
}

function getManagedPathEntries(environment: EnvironmentKind, records: InstallRecord[], config: AppConfig): string[] {
  const definition = getDefinition(environment);
  const stablePathEntries = getPathEntries(definition, getCurrentLinkPath(config, environment));
  return unique([...records.flatMap((record) => record.pathEntries), ...stablePathEntries]);
}

function runProcess(command: string, args: string[], timeoutMs = 30_000): Promise<RegistryProcessResult> {
  return new Promise((resolveProcess, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
    });
    let settled = false;
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      settle(() => reject(new Error(`${basename(command)} 执行超时。`)));
    }, timeoutMs);
    const settle = (callback: () => void): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      callback();
    };

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
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
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

async function readMachineEnvironmentValue(name: string): Promise<string | undefined> {
  const tempDir = await mkdtemp(join(tmpdir(), "env-manager-reg-"));
  const exportFile = join(tempDir, "environment.reg");

  try {
    await runProcess("reg.exe", ["export", machineEnvironmentRegistryKey, exportFile, "/y"], 15_000);
    return parseRegistryExportValue(decodeRegistryExport(await readFile(exportFile)), name);
  } catch {
    return undefined;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function readRequiredMachineEnvironmentValue(name: string): Promise<string> {
  const value = await readMachineEnvironmentValue(name);

  if (typeof value !== "string") {
    throw new Error(`读取系统环境变量 ${name} 失败，已取消写入。`);
  }

  return value;
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

async function registryNeedsUpdate(plan: EnvironmentApplyPlan): Promise<boolean> {
  for (const [name, value] of Object.entries(plan.envVars)) {
    if ((await readMachineEnvironmentValue(name)) !== value) {
      return true;
    }
  }

  const currentPath = await readRequiredMachineEnvironmentValue("Path");
  return updatePathValue(currentPath, plan.removePathEntries, plan.addPathEntries) !== currentPath;
}

async function registryNeedsCleanup(plan: EnvironmentCleanupPlan): Promise<boolean> {
  for (const [name, value] of Object.entries(plan.envVars)) {
    if ((await readMachineEnvironmentValue(name)) === value) {
      return true;
    }
  }

  const currentPath = await readRequiredMachineEnvironmentValue("Path");
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

async function applyRegistryPlan(plan: EnvironmentApplyPlan): Promise<void> {
  const valuesToWrite: Array<{ name: string; value: string; type: "REG_SZ" | "REG_EXPAND_SZ" }> = [];

  for (const [name, value] of Object.entries(plan.envVars)) {
    if ((await readMachineEnvironmentValue(name)) !== value) {
      valuesToWrite.push({ name, value, type: "REG_SZ" });
    }
  }

  const currentPath = await readRequiredMachineEnvironmentValue("Path");
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

async function cleanupRegistryPlan(plan: EnvironmentCleanupPlan): Promise<void> {
  const namesToDelete: string[] = [];

  for (const [name, value] of Object.entries(plan.envVars)) {
    if ((await readMachineEnvironmentValue(name)) === value) {
      namesToDelete.push(name);
    }
  }

  const currentPath = await readRequiredMachineEnvironmentValue("Path");
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

function getActiveByKind(records: InstallRecord[]): ActiveEnvironmentMap {
  return records.reduce<ActiveEnvironmentMap>((activeByKind, record) => {
    if (record.active) {
      activeByKind[record.environment] = record.id;
    }

    return activeByKind;
  }, {});
}

export class EnvironmentRecordService {
  private readonly store = new JsonFileStore<EnvironmentData>(
    join(app.getPath("userData"), "environments.json"),
    defaults,
  );

  constructor(private readonly configService: ConfigService) {}

  async getSummary(): Promise<EnvironmentSummary> {
    const data = await this.store.read();

    return {
      definitions: environmentDefinitions,
      installations: data.installations,
      activeByKind: getActiveByKind(data.installations),
    };
  }

  async requiresElevationForInstall(environment: EnvironmentKind): Promise<boolean> {
    const config = await this.configService.get();

    if (config.environmentManagement.mode === "direct") {
      return true;
    }

    const data = await this.store.read();
    const definition = getDefinition(environment);
    const currentLinkPath = getCurrentLinkPath(config, environment);
    return registryNeedsUpdate({
      envVars: getEnvVars(definition, currentLinkPath),
      addPathEntries: getPathEntries(definition, currentLinkPath),
      removePathEntries: getManagedPathEntries(environment, data.installations, config),
    });
  }

  async requiresElevationForSetActive(environment: EnvironmentKind, id: string): Promise<boolean> {
    const data = await this.store.read();
    const selectedRecord = this.getSelectedRecord(data.installations, environment, id);
    const environmentRecords = data.installations.filter((record) => record.environment === environment);
    const config = await this.configService.get();
    return registryNeedsUpdate(this.createApplyPlan(selectedRecord, environmentRecords, config));
  }

  async requiresElevationForUninstall(id: string): Promise<boolean> {
    const data = await this.store.read();
    const record = data.installations.find((item) => item.id === id);

    if (!record) {
      return false;
    }

    const config = await this.configService.get();
    const remainingRecords = data.installations.filter((item) => item.id !== id);
    const remainingSameEnvironmentRecords = remainingRecords.filter((item) => item.environment === record.environment);
    const replacementRecord = record.active ? remainingSameEnvironmentRecords[0] : undefined;

    if (replacementRecord) {
      return registryNeedsUpdate(this.createApplyPlan(replacementRecord, remainingSameEnvironmentRecords, config));
    }

    return registryNeedsCleanup(
      this.createCleanupPlan(record, remainingSameEnvironmentRecords, data.installations, config),
    );
  }

  async setActive(environment: EnvironmentKind, id: string): Promise<EnvironmentSummary> {
    const data = await this.store.read();
    const selectedRecord = this.getSelectedRecord(data.installations, environment, id);
    const environmentRecords = data.installations.filter((record) => record.environment === environment);
    await this.applyActiveEnvironment(selectedRecord, environmentRecords);
    const now = new Date().toISOString();

    await this.store.update((current) => ({
      installations: current.installations.map((record) => ({
        ...record,
        active: record.environment === environment ? record.id === id : record.active,
        updatedAt: record.environment === environment ? now : record.updatedAt,
      })),
    }));

    return this.getSummary();
  }

  async addManagedInstall(input: {
    environment: EnvironmentKind;
    name: string;
    vendor?: string;
    version: string;
    installPath: string;
    scope: InstallScope;
    active: boolean;
    envVars: Record<string, string>;
    pathEntries: string[];
  }): Promise<InstallRecord> {
    const now = new Date().toISOString();
    const currentData = await this.store.read();
    const record: InstallRecord = {
      id: crypto.randomUUID(),
      environment: input.environment,
      name: input.name,
      vendor: input.vendor,
      version: input.version,
      installPath: input.installPath,
      scope: input.scope,
      managed: true,
      active: input.active,
      envVars: input.envVars,
      pathEntries: input.pathEntries,
      installedAt: now,
      updatedAt: now,
    };

    if (input.active) {
      await this.applyActiveEnvironment(record, [
        record,
        ...currentData.installations.filter((item) => item.environment === input.environment),
      ]);
    }

    await this.store.update((current) => ({
      installations: [
        record,
        ...current.installations.map((item) => ({
          ...item,
          active: input.active && item.environment === input.environment ? false : item.active,
        })),
      ],
    }));

    return record;
  }

  async uninstallManaged(id: string): Promise<EnvironmentSummary> {
    const data = await this.store.read();
    const record = data.installations.find((item) => item.id === id);

    if (!record) {
      throw new Error("未找到要卸载的环境。");
    }

    if (!record.managed) {
      throw new Error("只能卸载本程序安装和管理的环境。");
    }

    const config = await this.configService.get();
    const remainingRecords = data.installations.filter((item) => item.id !== id);
    const remainingSameEnvironmentRecords = remainingRecords.filter((item) => item.environment === record.environment);
    const replacementRecord = record.active ? remainingSameEnvironmentRecords[0] : undefined;

    if (replacementRecord) {
      await this.applyActiveEnvironment(replacementRecord, remainingSameEnvironmentRecords);
    } else {
      await this.cleanupRemovedRecord(record, remainingSameEnvironmentRecords, data.installations, config);
    }

    await rm(record.installPath, { recursive: true, force: true });
    const now = new Date().toISOString();

    await this.store.update((current) => ({
      installations: current.installations
        .filter((item) => item.id !== id)
        .map((item) => ({
          ...item,
          active: replacementRecord ? item.id === replacementRecord.id || item.active : item.active,
          updatedAt: replacementRecord && item.id === replacementRecord.id ? now : item.updatedAt,
        })),
    }));

    return this.getSummary();
  }

  private getSelectedRecord(records: InstallRecord[], environment: EnvironmentKind, id: string): InstallRecord {
    const selectedRecord = records.find((record) => record.id === id);

    if (!selectedRecord || selectedRecord.environment !== environment) {
      throw new Error("未找到要切换的环境版本。");
    }

    return selectedRecord;
  }

  private createApplyPlan(record: InstallRecord, records: InstallRecord[], config: AppConfig): EnvironmentApplyPlan {
    if (config.environmentManagement.mode === "direct") {
      return {
        envVars: record.envVars,
        addPathEntries: unique(record.pathEntries),
        removePathEntries: getManagedPathEntries(record.environment, records, config),
      };
    }

    const definition = getDefinition(record.environment);
    const currentLinkPath = getCurrentLinkPath(config, record.environment);

    return {
      envVars: getEnvVars(definition, currentLinkPath),
      addPathEntries: getPathEntries(definition, currentLinkPath),
      removePathEntries: getManagedPathEntries(record.environment, records, config),
    };
  }

  private createCleanupPlan(
    record: InstallRecord,
    remainingSameEnvironmentRecords: InstallRecord[],
    allRecords: InstallRecord[],
    config: AppConfig,
  ): EnvironmentCleanupPlan {
    if (config.environmentManagement.mode === "direct") {
      return {
        envVars: record.envVars,
        removePathEntries: record.pathEntries,
      };
    }

    if (remainingSameEnvironmentRecords.length > 0) {
      return {
        envVars: {},
        removePathEntries: record.pathEntries,
      };
    }

    const definition = getDefinition(record.environment);
    const currentLinkPath = getCurrentLinkPath(config, record.environment);

    return {
      envVars: getEnvVars(definition, currentLinkPath),
      removePathEntries: getManagedPathEntries(record.environment, allRecords, config),
    };
  }

  private async applyActiveEnvironment(record: InstallRecord, records: InstallRecord[]): Promise<void> {
    const config = await this.configService.get();

    if (config.environmentManagement.mode === "symlink") {
      await this.replaceCurrentLink(record, config);
    }

    await applyRegistryPlan(this.createApplyPlan(record, records, config));
  }

  private async cleanupRemovedRecord(
    record: InstallRecord,
    remainingSameEnvironmentRecords: InstallRecord[],
    allRecords: InstallRecord[],
    config: AppConfig,
  ): Promise<void> {
    await cleanupRegistryPlan(this.createCleanupPlan(record, remainingSameEnvironmentRecords, allRecords, config));

    if (config.environmentManagement.mode === "symlink" && remainingSameEnvironmentRecords.length === 0) {
      await rm(getCurrentLinkPath(config, record.environment), { recursive: true, force: true });
    }
  }

  private async replaceCurrentLink(record: InstallRecord, config: AppConfig): Promise<void> {
    if (!(await pathExists(record.installPath))) {
      throw new Error(`当前版本安装目录不存在：${record.installPath}`);
    }

    const linkPath = getCurrentLinkPath(config, record.environment);
    await mkdir(dirname(linkPath), { recursive: true });
    await rm(linkPath, { recursive: true, force: true });
    await symlink(resolve(record.installPath), linkPath, "junction");
  }
}
