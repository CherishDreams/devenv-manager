import type { AvailableVersion } from "@shared/types";
import type React from "react";
import { Space, Tag, Typography } from "antd";

export function VersionOption({ version }: { version: AvailableVersion }): React.ReactElement {
  return (
    <Space className="version-select-option" direction="vertical" size={4}>
      <Space>
        <Typography.Text strong>{version.label}</Typography.Text>
        <Tag color={version.channel === "lts" ? "green" : "blue"}>{version.channel.toUpperCase()}</Tag>
      </Space>
      <Typography.Text type="secondary">
        {version.architecture} /{version.packageType}
      </Typography.Text>
      {version.notes ? <Typography.Text type="secondary">{version.notes}</Typography.Text> : null}
    </Space>
  );
}
