import type { EnvironmentKind, InstallRecord } from "@shared/types";
import type React from "react";
import { useMemo, useState } from "react";
import { useEnvironmentActions } from "../../hooks/useEnvironmentActions";
import { useEnvironmentStore } from "../../stores/environmentStore";
import { InstallCatalog } from "./InstallCatalog";
import { createInstallColumns } from "./installColumns";

export default function EnvironmentInstallPage(): React.ReactElement {
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<EnvironmentKind | undefined>();
  const summary = useEnvironmentStore((state) => state.summary);
  const loading = useEnvironmentStore((state) => state.loading);
  const { switchActive, uninstallRecord } = useEnvironmentActions();

  const definitions = summary?.definitions ?? [];
  const installations = summary?.installations ?? [];

  const recordsByKind = useMemo(() => {
    return installations.reduce<Map<EnvironmentKind, InstallRecord[]>>((groupedRecords, record) => {
      const nextRecords = groupedRecords.get(record.environment) ?? [];
      nextRecords.push(record);
      groupedRecords.set(record.environment, nextRecords);
      return groupedRecords;
    }, new Map());
  }, [installations]);

  const columns = useMemo(
    () => createInstallColumns(summary?.activeByKind ?? {}, switchActive, uninstallRecord),
    [summary?.activeByKind, switchActive, uninstallRecord],
  );

  const selectedDefinition = useMemo(
    () => definitions.find((definition) => definition.id === selectedDefinitionId),
    [definitions, selectedDefinitionId],
  );

  return (
    <InstallCatalog
      definitions={definitions}
      recordsByKind={recordsByKind}
      selectedDefinition={selectedDefinition}
      onSelectDefinition={setSelectedDefinitionId}
      onClearSelection={() => setSelectedDefinitionId(undefined)}
      columns={columns}
      loading={loading}
    />
  );
}
