import type {
  ActiveEnvironmentMap,
  AppConfig,
  EnvironmentDefinition,
  EnvironmentKind,
  EnvironmentOwnership,
  InstallRecord,
  UninstallPolicy,
} from "../../../shared/types";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { environmentDefinitions } from "../../../shared/environmentDefinitions";

export interface EnvironmentData {
  installations: InstallRecord[];
}

export const defaultEnvironmentData: EnvironmentData = {
  installations: [],
};

export function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function getDefinition(environment: EnvironmentKind): EnvironmentDefinition {
  const definition = environmentDefinitions.find((item) => item.id === environment);

  if (!definition) {
    throw new Error(`未知环境：${environment}`);
  }

  return definition;
}

function getRecordOwnership(record: Partial<InstallRecord>): EnvironmentOwnership {
  return record.ownership ?? (record.managed === false ? "adopted" : "managed");
}

function getRecordUninstallPolicy(record: Partial<InstallRecord>): UninstallPolicy {
  if (record.uninstallPolicy) {
    return record.uninstallPolicy;
  }

  return getRecordOwnership(record) === "managed" ? "delete-directory" : "remove-record-only";
}

export function normalizeInstallRecord(record: InstallRecord): InstallRecord {
  const ownership = getRecordOwnership(record);
  const uninstallPolicy = getRecordUninstallPolicy(record);

  return {
    ...record,
    managed: ownership === "managed",
    ownership,
    uninstallPolicy,
  };
}

export function getEnvVars(definition: EnvironmentDefinition, rootPath: string): Record<string, string> {
  if (definition.id === "nvm") {
    return {
      NVM_HOME: rootPath,
      NVM_SYMLINK: join(rootPath, "nodejs"),
    };
  }

  if (definition.id === "rust") {
    return {
      CARGO_HOME: join(rootPath, "cargo"),
      RUSTUP_HOME: join(rootPath, "rustup"),
    };
  }

  return Object.fromEntries(definition.envVars.map((name) => [name, rootPath]));
}

export function getPathEntries(definition: EnvironmentDefinition, rootPath: string): string[] {
  return definition.pathEntries.map((entry) => (entry ? join(rootPath, entry) : rootPath));
}

export function getCurrentLinkPath(config: AppConfig, environment: EnvironmentKind): string {
  return resolve(config.globalInstallDir, ".current", environment);
}

export function getManagedPathEntries(environment: EnvironmentKind, records: InstallRecord[], config: AppConfig): string[] {
  const definition = getDefinition(environment);
  const stablePathEntries = getPathEntries(definition, getCurrentLinkPath(config, environment));
  return unique([...records.flatMap((record) => record.pathEntries), ...stablePathEntries]);
}

export function getActiveByKind(records: InstallRecord[]): ActiveEnvironmentMap {
  return records.reduce<ActiveEnvironmentMap>((activeByKind, record) => {
    if (record.active) {
      activeByKind[record.environment] = record.id;
    }

    return activeByKind;
  }, {});
}

export async function pathExists(path: string): Promise<boolean> {
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
