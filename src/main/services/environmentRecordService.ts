import type {
  AdoptEnvironmentInput,
  AppConfig,
  EnvironmentKind,
  EnvironmentSummary,
  InstallRecord,
  InstallScope,
} from "../../shared/types";
import type { ConfigService } from "./configService";
import type { EnvironmentData } from "./environmentRecords/helpers";
import type { EnvironmentApplyPlan, EnvironmentCleanupPlan } from "./environmentRecords/registryEnvironment";
import { mkdir, rm, symlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { app } from "electron";
import { environmentDefinitions } from "../../shared/environmentDefinitions";
import {
  defaultEnvironmentData,

  getActiveByKind,
  getCurrentLinkPath,
  getDefinition,
  getEnvVars,
  getManagedPathEntries,
  getPathEntries,
  normalizeInstallRecord,
  pathExists,
  unique,
} from "./environmentRecords/helpers";
import {
  applyRegistryPlan,
  cleanupRegistryPlan,

  registryNeedsCleanup,
  registryNeedsUpdate,
  synchronizeProcessEnvironment,
} from "./environmentRecords/registryEnvironment";
import { JsonFileStore } from "./jsonFileStore";

export class EnvironmentRecordService {
  private readonly store = new JsonFileStore<EnvironmentData>(
    join(app.getPath("userData"), "environments.json"),
    defaultEnvironmentData,
  );

  constructor(private readonly configService: ConfigService) {}

  private async readData(): Promise<EnvironmentData> {
    const data = await this.store.read();
    return {
      installations: data.installations.map(normalizeInstallRecord),
    };
  }

  async getSummary(): Promise<EnvironmentSummary> {
    const data = await this.readData();

    return {
      definitions: environmentDefinitions,
      installations: data.installations,
      activeByKind: getActiveByKind(data.installations),
    };
  }

  synchronizeProcessEnvironment(): Promise<void> {
    return synchronizeProcessEnvironment(unique(environmentDefinitions.flatMap((definition) => definition.envVars)));
  }

  async requiresElevationForInstall(environment: EnvironmentKind): Promise<boolean> {
    const config = await this.configService.get();

    if (config.environmentManagement.mode === "direct") {
      return true;
    }

    const data = await this.readData();
    const definition = getDefinition(environment);
    const currentLinkPath = getCurrentLinkPath(config, environment);
    return registryNeedsUpdate({
      envVars: getEnvVars(definition, currentLinkPath),
      addPathEntries: getPathEntries(definition, currentLinkPath),
      removePathEntries: getManagedPathEntries(environment, data.installations, config),
    });
  }

  async requiresElevationForSetActive(environment: EnvironmentKind, id: string): Promise<boolean> {
    const data = await this.readData();
    const selectedRecord = this.getSelectedRecord(data.installations, environment, id);
    const environmentRecords = data.installations.filter((record) => record.environment === environment);
    const config = await this.configService.get();
    return registryNeedsUpdate(this.createApplyPlan(selectedRecord, environmentRecords, config));
  }

  async requiresElevationForUninstall(id: string): Promise<boolean> {
    const data = await this.readData();
    const record = data.installations.find((item) => item.id === id);

    if (!record) {
      return false;
    }

    const config = await this.configService.get();
    const remainingRecords = data.installations.filter((item) => item.id !== id);
    const remainingSameEnvironmentRecords = remainingRecords.filter((item) => item.environment === record.environment);
    const replacementRecord = record.active ? remainingSameEnvironmentRecords[0] : undefined;
    const shouldDeleteDirectory = record.uninstallPolicy === "delete-directory";

    if (replacementRecord) {
      return registryNeedsUpdate(this.createApplyPlan(replacementRecord, remainingSameEnvironmentRecords, config));
    }

    if (!shouldDeleteDirectory) {
      return false;
    }

    return registryNeedsCleanup(
      this.createCleanupPlan(record, remainingSameEnvironmentRecords, data.installations, config),
    );
  }

  async setActive(environment: EnvironmentKind, id: string): Promise<EnvironmentSummary> {
    const data = await this.readData();
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
    const currentData = await this.readData();
    const record: InstallRecord = {
      id: crypto.randomUUID(),
      environment: input.environment,
      name: input.name,
      vendor: input.vendor,
      version: input.version,
      installPath: input.installPath,
      scope: input.scope,
      managed: true,
      ownership: "managed",
      uninstallPolicy: "delete-directory",
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

  async adoptExistingInstalls(inputs: AdoptEnvironmentInput[]): Promise<EnvironmentSummary> {
    const now = new Date().toISOString();
    const adoptedRecords = inputs.map<InstallRecord>((input) => ({
      id: crypto.randomUUID(),
      environment: input.environment,
      name: input.name,
      vendor: input.vendor,
      version: input.version,
      installPath: input.installPath,
      scope: "custom",
      managed: false,
      ownership: input.ownership,
      uninstallPolicy: input.uninstallPolicy,
      discoverySource: input.source,
      active: input.active,
      envVars: input.envVars,
      pathEntries: input.pathEntries,
      installedAt: now,
      updatedAt: now,
    }));

    await this.store.update((current) => {
      const normalizedInstallations = current.installations.map(normalizeInstallRecord);

      return {
        installations: [
          ...adoptedRecords,
          ...normalizedInstallations.map((record) => {
            const replacement = adoptedRecords.find((item) => item.active && item.environment === record.environment);
            return replacement ? { ...record, active: false } : record;
          }),
        ],
      };
    });

    return this.getSummary();
  }

  async uninstallManaged(id: string): Promise<EnvironmentSummary> {
    const data = await this.readData();
    const record = data.installations.find((item) => item.id === id);

    if (!record) {
      throw new Error("未找到要卸载的环境。");
    }

    const config = await this.configService.get();
    const remainingRecords = data.installations.filter((item) => item.id !== id);
    const remainingSameEnvironmentRecords = remainingRecords.filter((item) => item.environment === record.environment);
    const replacementRecord = record.active ? remainingSameEnvironmentRecords[0] : undefined;
    const shouldDeleteDirectory = record.uninstallPolicy === "delete-directory";

    if (replacementRecord) {
      await this.applyActiveEnvironment(replacementRecord, remainingSameEnvironmentRecords);
    } else if (shouldDeleteDirectory) {
      await this.cleanupRemovedRecord(record, remainingSameEnvironmentRecords, data.installations, config);
    }

    if (shouldDeleteDirectory) {
      await rm(record.installPath, { recursive: true, force: true });
    }

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
