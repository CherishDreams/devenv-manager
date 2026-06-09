import type { EnvironmentDefinition, EnvironmentKind, InstallRecord } from "@shared/types";

export interface InstalledGroup {
  key: string;
  title: string;
  description?: string;
  definition?: EnvironmentDefinition;
  records: InstallRecord[];
}

export function groupInstallations(definitions: EnvironmentDefinition[], installations: InstallRecord[]): InstalledGroup[] {
  const recordsByKind = installations.reduce<Map<EnvironmentKind, InstallRecord[]>>((grouped, record) => {
    const nextRecords = grouped.get(record.environment) ?? [];
    nextRecords.push(record);
    grouped.set(record.environment, nextRecords);
    return grouped;
  }, new Map());
  const knownKinds = new Set(definitions.map((definition) => definition.id));
  const knownGroups = definitions.flatMap((definition) => {
    const records = recordsByKind.get(definition.id) ?? [];

    return records.length > 0
      ? [
          {
            key: definition.id,
            title: definition.name,
            description: definition.description,
            definition,
            records,
          },
        ]
      : [];
  });
  const unknownRecords = installations.filter((record) => !knownKinds.has(record.environment));

  return [
    ...knownGroups,
    ...(unknownRecords.length > 0 ? [{ key: "other", title: "其他", records: unknownRecords }] : []),
  ];
}
