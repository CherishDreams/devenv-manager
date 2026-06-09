import { ImportOutlined } from "@ant-design/icons";
import { Alert, Modal, Space, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import type React from "react";
import { useMemo } from "react";
import type { DiscoveredEnvironment, EnvironmentDefinition, EnvironmentKind } from "@shared/types";
import { EnvironmentLogo } from "../../components/EnvironmentLogo";

function createDiscoveryColumns(definitions: EnvironmentDefinition[]): TableColumnsType<DiscoveredEnvironment> {
  const definitionByKind = new Map(definitions.map((definition) => [definition.id, definition]));

  return [
    {
      title: "环境",
      dataIndex: "environment",
      key: "environment",
      width: 190,
      render: (_environment: EnvironmentKind, record) => {
        const definition = definitionByKind.get(record.environment);

        return (
          <Space>
            {definition ? <EnvironmentLogo definition={definition} /> : null}
            <div>
              <Typography.Text strong>{record.name}</Typography.Text>
              <div>
                <Typography.Text type="secondary">{record.environment}</Typography.Text>
              </div>
            </div>
          </Space>
        );
      },
    },
    {
      title: "版本",
      dataIndex: "version",
      key: "version",
      width: 170,
      render: (version: string, record) => (
        <div className="installed-version-cell">
          <Typography.Text className="installed-version-text">{version}</Typography.Text>
          <span className="installed-version-tags">
            {record.active ? <Tag color="green">当前</Tag> : null}
            {record.alreadyManaged ? <Tag color="default">已管理</Tag> : null}
          </span>
        </div>
      ),
    },
    {
      title: "来源",
      dataIndex: "source",
      key: "source",
      width: 210,
    },
    {
      title: "目录",
      dataIndex: "installPath",
      key: "installPath",
      ellipsis: true,
    },
  ];
}

export function DiscoveryModal({
  open,
  loading,
  discovering,
  discovered,
  selectedRowKeys,
  selectedCount,
  definitions,
  onSelectRows,
  onCancel,
  onAdopt,
}: {
  open: boolean;
  loading: boolean;
  discovering: boolean;
  discovered: DiscoveredEnvironment[];
  selectedRowKeys: React.Key[];
  selectedCount: number;
  definitions: EnvironmentDefinition[];
  onSelectRows: (keys: React.Key[]) => void;
  onCancel: () => void;
  onAdopt: () => void;
}): React.ReactElement {
  const discoveryColumns = useMemo(() => createDiscoveryColumns(definitions), [definitions]);

  return (
    <Modal
      className="discovery-modal"
      title="接管系统现有环境"
      open={open}
      width={980}
      okText="接管选中环境"
      okButtonProps={{
        icon: <ImportOutlined />,
        disabled: selectedCount === 0,
        loading,
      }}
      cancelText="取消"
      onOk={onAdopt}
      onCancel={onCancel}
    >
      <Space direction="vertical" size={12} className="full-width">
        <Alert
          type="info"
          showIcon
          message="接管不会删除或移动原环境目录"
          description="导入后可以参与版本切换；从本程序移除接管记录时默认不会删除原目录。"
        />
        <Table<DiscoveredEnvironment>
          rowKey="id"
          loading={discovering}
          columns={discoveryColumns}
          dataSource={discovered}
          tableLayout="fixed"
          pagination={{ pageSize: 8 }}
          rowSelection={{
            selectedRowKeys,
            onChange: onSelectRows,
            getCheckboxProps: (record) => ({
              disabled: record.alreadyManaged,
            }),
          }}
          locale={{
            emptyText: "未发现可接管环境",
          }}
        />
      </Space>
    </Modal>
  );
}
