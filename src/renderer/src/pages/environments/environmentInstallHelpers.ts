import type { AvailableVersion, EnvironmentDefinition, EnvironmentKind, InstallRecord } from "@shared/types";

export interface EnvironmentStatus {
  installed: boolean;
  status: string;
}

export interface VersionSelectOption {
  value: string;
  label: string;
  searchText: string;
  version: AvailableVersion;
}

export function getCatalogKey(environment: EnvironmentKind, vendor: string): string {
  return `${environment}:${vendor}`;
}

export function groupDefinitions(definitions: EnvironmentDefinition[]): Array<[string, EnvironmentDefinition[]]> {
  const groups = definitions.reduce<Map<string, EnvironmentDefinition[]>>((grouped, definition) => {
    const next = grouped.get(definition.group) ?? [];
    next.push(definition);
    grouped.set(definition.group, next);
    return grouped;
  }, new Map());

  return Array.from(groups.entries());
}

export function getEnvironmentStatus(records: InstallRecord[]): EnvironmentStatus {
  const activeRecord = records.find((record) => record.active);
  const fallbackRecord = records[0];

  if (activeRecord) {
    return {
      installed: true,
      status: `当前 ${activeRecord.version}`,
    };
  }

  if (fallbackRecord) {
    return {
      installed: true,
      status: `已安装 ${fallbackRecord.version}`,
    };
  }

  return {
    installed: false,
    status: "未安装",
  };
}

export function createVersionSelectOption(version: AvailableVersion): VersionSelectOption {
  return {
    value: version.id,
    label: version.label,
    searchText: [version.label, version.version, version.channel, version.notes].filter(Boolean).join(" ").toLowerCase(),
    version,
  };
}

export function filterVersionOption(input: string, option?: VersionSelectOption): boolean {
  return option?.searchText.includes(input.trim().toLowerCase()) ?? false;
}

export function getSuggestedInstallPath(
  globalInstallDir: string,
  definition: EnvironmentDefinition,
  vendorId: string | undefined,
  version: AvailableVersion | undefined,
): string {
  const vendorSegment = vendorId ?? "vendor";
  const versionSegment = version?.version ?? "version";
  return `${globalInstallDir}\\${definition.id}\\${vendorSegment}\\${versionSegment}`;
}
