import { app } from "electron";
import { join } from "node:path";
import { environmentDefinitions } from "../../shared/environmentDefinitions";
import type {
  ActiveEnvironmentMap,
  EnvironmentKind,
  EnvironmentSummary,
  InstallRecord,
  InstallScope,
} from "../../shared/types";
import { JsonFileStore } from "./jsonFileStore";

interface EnvironmentData {
  installations: InstallRecord[];
}

const defaults: EnvironmentData = {
  installations: [],
};

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

  async getSummary(): Promise<EnvironmentSummary> {
    const data = await this.store.read();

    return {
      definitions: environmentDefinitions,
      installations: data.installations,
      activeByKind: getActiveByKind(data.installations),
    };
  }

  async setActive(environment: EnvironmentKind, id: string): Promise<EnvironmentSummary> {
    await this.store.update((current) => ({
      installations: current.installations.map((record) => ({
        ...record,
        active: record.environment === environment ? record.id === id : record.active,
        updatedAt: record.environment === environment ? new Date().toISOString() : record.updatedAt,
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
}
