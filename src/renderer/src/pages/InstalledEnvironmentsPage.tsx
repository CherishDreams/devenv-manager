import { AppstoreOutlined, PlayCircleOutlined } from "@ant-design/icons";
import { Card, Empty, Space, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import type React from "react";
import { useMemo } from "react";
import type { EnvironmentKind, InstallRecord } from "@shared/types";
import { useEnvironmentStore } from "../stores/environmentStore";

function createColumns(
  activeByKind: Record<string, string | undefined>,
  setActive: (environment: EnvironmentKind, id: string) => Promise<void>,
): TableColumnsType<InstallRecord> {
  return [
    {
      title: "环境",
      dataIndex: "name",
      key: "name",
      width: 180,
    },
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
      width: 140,
      render: (_, record) => (
        <Typography.Link
          onClick={() => {
            void setActive(record.environment, record.id);
          }}
          disabled={activeByKind[record.environment] === record.id}
        >
          <PlayCircleOutlined /> 切换
        </Typography.Link>
      ),
    },
  ];
}

export default function InstalledEnvironmentsPage(): React.ReactElement {
  const summary = useEnvironmentStore((state) => state.summary);
  const loading = useEnvironmentStore((state) => state.loading);
  const setActive = useEnvironmentStore((state) => state.setActive);
  const installations = summary?.installations ?? [];

  const columns = useMemo(
    () => createColumns(summary?.activeByKind ?? {}, setActive),
    [setActive, summary?.activeByKind],
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

      <Card>
        {installations.length > 0 ? (
          <Table rowKey="id" loading={loading} columns={columns} dataSource={installations} pagination={false} />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无本程序安装的环境" />
        )}
      </Card>
    </div>
  );
}
