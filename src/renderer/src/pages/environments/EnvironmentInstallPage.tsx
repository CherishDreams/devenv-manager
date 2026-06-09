import { App as AntdApp } from "antd";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import type { EnvironmentKind, InstallRecord } from "@shared/types";
import { useEnvironmentStore } from "../../stores/environmentStore";
import { createInstallColumns } from "./installColumns";
import { InstallCatalog } from "./InstallCatalog";

export default function EnvironmentInstallPage(): React.ReactElement {
  const { message } = AntdApp.useApp();
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<EnvironmentKind | undefined>();
  const summary = useEnvironmentStore((state) => state.summary);
  const loading = useEnvironmentStore((state) => state.loading);
  const setActive = useEnvironmentStore((state) => state.setActive);
  const uninstall = useEnvironmentStore((state) => state.uninstall);

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

  const switchActive = useCallback(
    async (record: InstallRecord) => {
      try {
        await setActive(record.environment, record.id);
        message.success(`已切换到 ${record.name} ${record.version}`);
      } catch (error) {
        message.error((error as Error).message);
      }
    },
    [message, setActive],
  );

  const uninstallRecord = useCallback(
    async (record: InstallRecord) => {
      try {
        await uninstall(record.id);
        message.success(`已卸载 ${record.name} ${record.version}`);
      } catch (error) {
        message.error((error as Error).message);
      }
    },
    [message, uninstall],
  );

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
