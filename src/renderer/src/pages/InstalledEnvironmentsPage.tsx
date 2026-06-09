import { AppstoreOutlined, SearchOutlined } from "@ant-design/icons";
import { Alert, App as AntdApp, Button, Empty, Space, Tag, Typography } from "antd";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import type { DiscoveredEnvironment, InstallRecord } from "@shared/types";
import { useEnvironmentStore } from "../stores/environmentStore";
import { createAdoptInput } from "./installed/adoptInput";
import { DiscoveryModal } from "./installed/DiscoveryModal";
import { groupInstallations } from "./installed/groupInstallations";
import { InstalledGroupSection } from "./installed/InstalledGroupSection";
import { createInstalledColumns } from "./installed/installedColumns";

export default function InstalledEnvironmentsPage(): React.ReactElement {
  const { message } = AntdApp.useApp();
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredEnvironment[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const summary = useEnvironmentStore((state) => state.summary);
  const loading = useEnvironmentStore((state) => state.loading);
  const error = useEnvironmentStore((state) => state.error);
  const discoverExisting = useEnvironmentStore((state) => state.discoverExisting);
  const adoptExisting = useEnvironmentStore((state) => state.adoptExisting);
  const setActive = useEnvironmentStore((state) => state.setActive);
  const uninstall = useEnvironmentStore((state) => state.uninstall);
  const installations = summary?.installations ?? [];

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
        message.success(
          record.uninstallPolicy === "delete-directory"
            ? `已卸载 ${record.name} ${record.version}`
            : `已移除 ${record.name} ${record.version} 的接管记录`,
        );
      } catch (error) {
        message.error((error as Error).message);
      }
    },
    [message, uninstall],
  );

  const columns = useMemo(
    () => createInstalledColumns(summary?.activeByKind ?? {}, switchActive, uninstallRecord),
    [summary?.activeByKind, switchActive, uninstallRecord],
  );

  const groupedInstallations = useMemo(
    () => groupInstallations(summary?.definitions ?? [], installations),
    [installations, summary?.definitions],
  );

  const activeCount = installations.filter((record) => record.active).length;
  const selectedDiscovered = useMemo(
    () => discovered.filter((item) => selectedRowKeys.includes(item.id)),
    [discovered, selectedRowKeys],
  );

  const openDiscovery = useCallback(async () => {
    setDiscoveryOpen(true);
    setDiscovering(true);

    try {
      const nextDiscovered = await discoverExisting();
      setDiscovered(nextDiscovered);
      setSelectedRowKeys(nextDiscovered.filter((item) => !item.alreadyManaged).map((item) => item.id));
      message.success(`扫描完成，发现 ${nextDiscovered.length} 个环境`);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setDiscovering(false);
    }
  }, [discoverExisting, message]);

  const adoptSelected = useCallback(async () => {
    if (selectedDiscovered.length === 0) {
      message.warning("请选择要接管的环境");
      return;
    }

    try {
      await adoptExisting(selectedDiscovered.map(createAdoptInput));
      message.success(`已接管 ${selectedDiscovered.length} 个环境`);
      setDiscoveryOpen(false);
      setDiscovered([]);
      setSelectedRowKeys([]);
    } catch (error) {
      message.error((error as Error).message);
    }
  }, [adoptExisting, message, selectedDiscovered]);

  return (
    <div className="page-stack">
      <div className="page-title-row">
        <div>
          <Typography.Title level={3}>已安装环境</Typography.Title>
          <Typography.Text type="secondary">本程序安装和管理的环境版本</Typography.Text>
        </div>
        <Space>
          <Button icon={<SearchOutlined />} onClick={() => void openDiscovery()}>
            扫描系统环境
          </Button>
          <Tag icon={<AppstoreOutlined />} color="blue">
            {installations.length} 个版本
          </Tag>
          <Tag color="green">{activeCount} 个激活</Tag>
        </Space>
      </div>

      {error ? <Alert type="error" message={error} showIcon /> : null}

      {groupedInstallations.length > 0 ? (
        groupedInstallations.map((group) => (
          <InstalledGroupSection key={group.key} group={group} loading={loading} columns={columns} />
        ))
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无本程序安装的环境" />
      )}

      <DiscoveryModal
        open={discoveryOpen}
        loading={loading}
        discovering={discovering}
        discovered={discovered}
        selectedRowKeys={selectedRowKeys}
        selectedCount={selectedDiscovered.length}
        definitions={summary?.definitions ?? []}
        onSelectRows={setSelectedRowKeys}
        onCancel={() => setDiscoveryOpen(false)}
        onAdopt={() => void adoptSelected()}
      />
    </div>
  );
}
