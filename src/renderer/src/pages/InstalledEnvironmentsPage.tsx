import { AppstoreOutlined, DeleteOutlined, PlayCircleOutlined } from "@ant-design/icons";
import { Alert, App as AntdApp, Button, Empty, Popconfirm, Space, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import type React from "react";
import { useCallback, useMemo } from "react";
import type { EnvironmentDefinition, EnvironmentKind, InstallRecord } from "@shared/types";
import { EnvironmentLogo } from "../components/EnvironmentLogo";
import { useEnvironmentStore } from "../stores/environmentStore";

interface InstalledGroup {
  key: string;
  title: string;
  description?: string;
  definition?: EnvironmentDefinition;
  records: InstallRecord[];
}

function groupInstallations(definitions: EnvironmentDefinition[], installations: InstallRecord[]): InstalledGroup[] {
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

function createColumns(
  activeByKind: Record<string, string | undefined>,
  switchActive: (record: InstallRecord) => Promise<void>,
  uninstallRecord: (record: InstallRecord) => Promise<void>,
): TableColumnsType<InstallRecord> {
  return [
    {
      title: "版本",
      dataIndex: "version",
      key: "version",
      width: 140,
      render: (version: string, record) => (
        <Space>
          <Typography.Text strong>{version}</Typography.Text>
          {record.active ? <Tag color="green">当前</Tag> : null}
        </Space>
      ),
    },
    {
      title: "发行商",
      dataIndex: "vendor",
      key: "vendor",
      width: 180,
      render: (vendor?: string) => vendor ?? "-",
    },
    {
      title: "安装目录",
      dataIndex: "installPath",
      key: "installPath",
      ellipsis: true,
    },
    {
      title: "操作",
      key: "actions",
      width: 190,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<PlayCircleOutlined />}
            disabled={activeByKind[record.environment] === record.id}
            onClick={() => void switchActive(record)}
          >
            切换
          </Button>
          <Popconfirm
            title="卸载环境"
            description={`删除 ${record.name} ${record.version}，并清理匹配的环境变量？`}
            okText="卸载"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() => uninstallRecord(record)}
          >
            <Button danger size="small" icon={<DeleteOutlined />}>
              卸载
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];
}

export default function InstalledEnvironmentsPage(): React.ReactElement {
  const { message } = AntdApp.useApp();
  const summary = useEnvironmentStore((state) => state.summary);
  const loading = useEnvironmentStore((state) => state.loading);
  const error = useEnvironmentStore((state) => state.error);
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
        message.success(`已卸载 ${record.name} ${record.version}`);
      } catch (error) {
        message.error((error as Error).message);
      }
    },
    [message, uninstall],
  );

  const columns = useMemo(
    () => createColumns(summary?.activeByKind ?? {}, switchActive, uninstallRecord),
    [summary?.activeByKind, switchActive, uninstallRecord],
  );

  const groupedInstallations = useMemo(
    () => groupInstallations(summary?.definitions ?? [], installations),
    [installations, summary?.definitions],
  );

  const activeCount = installations.filter((record) => record.active).length;

  return (
    <div className="page-stack">
      <div className="page-title-row">
        <div>
          <Typography.Title level={3}>已安装环境</Typography.Title>
          <Typography.Text type="secondary">本程序安装和管理的环境版本</Typography.Text>
        </div>
        <Space>
          <Tag icon={<AppstoreOutlined />} color="blue">
            {installations.length} 个版本
          </Tag>
          <Tag color="green">{activeCount} 个激活</Tag>
        </Space>
      </div>

      {error ? <Alert type="error" message={error} showIcon /> : null}

      {groupedInstallations.length > 0 ? (
        groupedInstallations.map((group) => (
          <section className="task-section" key={group.key}>
            <div className="task-section-header">
              <Space>
                {group.definition ? <EnvironmentLogo definition={group.definition} /> : null}
                <div>
                  <Typography.Title level={4}>{group.title}</Typography.Title>
                  {group.description ? <Typography.Text type="secondary">{group.description}</Typography.Text> : null}
                </div>
              </Space>
              <Tag color="default">{group.records.length} 个版本</Tag>
            </div>
            <Table rowKey="id" loading={loading} columns={columns} dataSource={group.records} pagination={false} />
          </section>
        ))
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无本程序安装的环境" />
      )}
    </div>
  );
}
