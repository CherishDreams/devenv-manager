import type { InstallRecord } from "@shared/types";
import type { TableColumnsType } from "antd";
import type React from "react";
import type { InstalledGroup } from "./groupInstallations";
import { Space, Table, Tag, Typography } from "antd";
import { EnvironmentLogo } from "../../components/EnvironmentLogo";

export function InstalledGroupSection({
  group,
  columns,
  loading,
}: {
  group: InstalledGroup;
  columns: TableColumnsType<InstallRecord>;
  loading: boolean;
}): React.ReactElement {
  return (
    <section className="task-section" key={group.key}>
      <div className="task-section-header">
        <Space>
          {group.definition ? <EnvironmentLogo definition={group.definition} /> : null}
          <div>
            <Typography.Title level={4}>{group.title}</Typography.Title>
            {group.description ? <Typography.Text type="secondary">{group.description}</Typography.Text> : null}
          </div>
        </Space>
        <Tag color="default">
          {group.records.length}
          {" "}
          个版本
        </Tag>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={group.records}
        pagination={false}
        tableLayout="fixed"
      />
    </section>
  );
}
