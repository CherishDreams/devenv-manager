import type { EnvironmentDefinition, InstallRecord } from "@shared/types";
import type React from "react";
import { Tag, Typography } from "antd";
import { EnvironmentLogo } from "../../components/EnvironmentLogo";
import { getEnvironmentStatus } from "./environmentInstallHelpers";

export function EnvironmentCard({
  definition,
  records,
  selected,
  onClick,
}: {
  definition: EnvironmentDefinition;
  records: InstallRecord[];
  selected?: boolean;
  onClick?: () => void;
}): React.ReactElement {
  const status = getEnvironmentStatus(records);
  const className = selected ? "environment-card environment-card-active" : "environment-card";
  const content = (
    <>
      <EnvironmentLogo definition={definition} />
      <div className="environment-card-body">
        <Typography.Text strong className="environment-card-title">
          {definition.name}
        </Typography.Text>
        <Tag color={status.installed ? "green" : "default"}>{status.status}</Tag>
      </div>
      <Typography.Text className="environment-card-action">{status.installed ? "管理" : "安装"}</Typography.Text>
    </>
  );

  if (onClick) {
    return (
      <button className={className} type="button" onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}
