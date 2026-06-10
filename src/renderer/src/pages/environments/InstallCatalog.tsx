import { ArrowLeftOutlined, CloudDownloadOutlined } from "@ant-design/icons";
import { Button, Card, Empty, Space, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import type React from "react";
import { useMemo } from "react";
import type { EnvironmentDefinition, EnvironmentKind, InstallRecord } from "@shared/types";
import { EnvironmentLogo } from "../../components/EnvironmentLogo";
import { EnvironmentCard } from "./EnvironmentCard";
import { getEnvironmentStatus, groupDefinitions } from "./environmentInstallHelpers";
import { OperationArea } from "./OperationArea";
import { useConfigStore } from "../../stores/configStore";

export function InstallCatalog({
  definitions,
  recordsByKind,
  selectedDefinition,
  onSelectDefinition,
  onClearSelection,
  columns,
  loading,
}: {
  definitions: EnvironmentDefinition[];
  recordsByKind: Map<EnvironmentKind, InstallRecord[]>;
  selectedDefinition?: EnvironmentDefinition;
  onSelectDefinition: (id: EnvironmentKind) => void;
  onClearSelection: () => void;
  columns: TableColumnsType<InstallRecord>;
  loading: boolean;
}): React.ReactElement {
  const config = useConfigStore((s) => s.config);
  const groupedDefinitions = useMemo(() => groupDefinitions(definitions), [definitions]);

  if (definitions.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可安装环境" />;
  }

  if (selectedDefinition) {
    const records = recordsByKind.get(selectedDefinition.id) ?? [];
    const status = getEnvironmentStatus(records);

    return (
      <div className="page-stack">
        <div className="page-title-row">
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={onClearSelection}>
              返回
            </Button>
            <EnvironmentLogo definition={selectedDefinition} />
            <div>
              <Typography.Title level={3}>{selectedDefinition.name}</Typography.Title>
              <Typography.Text type="secondary">{selectedDefinition.description}</Typography.Text>
            </div>
          </Space>
          <Tag color={status.installed ? "green" : "default"}>{status.status}</Tag>
        </div>

        <OperationArea definition={selectedDefinition} />

        <Card title="已安装版本">
          <Table
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={records}
            pagination={false}
            locale={{
              emptyText: "暂无本程序安装的版本",
            }}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div>
        <Typography.Title level={3}>环境安装</Typography.Title>
        <Space>
          <Typography.Text type="secondary">选择环境后配置发行商、版本和安装路径</Typography.Text>
          <Tag icon={<CloudDownloadOutlined />} color="blue">
            {config?.globalInstallDir ?? "未配置"}
          </Tag>
        </Space>
      </div>

      {groupedDefinitions.map(([group, groupItems]) => (
        <section className="environment-category" key={group}>
          <Typography.Title level={4}>{group}</Typography.Title>
          <div className="environment-card-grid">
            {groupItems.map((definition) => (
              <EnvironmentCard
                key={definition.id}
                definition={definition}
                records={recordsByKind.get(definition.id) ?? []}
                onClick={() => onSelectDefinition(definition.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
