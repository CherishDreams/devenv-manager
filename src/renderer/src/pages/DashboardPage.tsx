import { ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Col, Descriptions, Row, Space, Tag, Typography } from "antd";
import type React from "react";
import { useMemo } from "react";
import type { EnvironmentKind, InstallRecord } from "@shared/types";
import { EnvironmentLogo } from "../components/EnvironmentLogo";
import { useConfigStore } from "../stores/configStore";
import { useEnvironmentStore } from "../stores/environmentStore";
import { useSystemStore } from "../stores/systemStore";

const envTagColors: Record<EnvironmentKind, string> = {
  java: "volcano",
  python: "blue",
  conda: "green",
  go: "cyan",
  node: "green",
  nvm: "lime",
  maven: "purple",
};

export default function DashboardPage(): React.ReactElement {
  const config = useConfigStore((state) => state.config);
  const loadConfig = useConfigStore((state) => state.load);
  const status = useSystemStore((state) => state.status);
  const loadSystem = useSystemStore((state) => state.load);
  const summary = useEnvironmentStore((state) => state.summary);
  const loadEnvironment = useEnvironmentStore((state) => state.load);

  const activeRecords = useMemo(() => {
    const records = summary?.installations ?? [];
    return records.reduce<Map<EnvironmentKind, InstallRecord>>((activeByKind, record) => {
      if (record.active) {
        activeByKind.set(record.environment, record);
      }
      return activeByKind;
    }, new Map());
  }, [summary?.installations]);

  const refresh = async (): Promise<void> => {
    await Promise.all([loadConfig(), loadSystem(), loadEnvironment()]);
  };

  return (
    <div className="page-stack">
      {!status?.isAdministrator && (
        <Alert
          type="warning"
          showIcon
          message="当前不是管理员权限"
          description="系统环境变量写入需要管理员权限，打包后的 Windows 安装版会请求管理员运行。"
        />
      )}

      <div className="page-title-row">
        <div>
          <Typography.Title level={3}>总览</Typography.Title>
          <Typography.Text type="secondary">当前主机环境状态</Typography.Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={refresh}>
          刷新
        </Button>
      </div>

      <Row gutter={[16, 16]}>
        {(summary?.definitions ?? []).map((definition) => {
          const activeRecord = activeRecords.get(definition.id);

          return (
            <Col span={6} key={definition.id}>
              <Card className="summary-card" bodyStyle={{ padding: "20px", height: "100%" }}>
                <div className="summary-card-content">
                  <div className="summary-card-header">
                    <div className="summary-card-header-left">
                      <Tag color={envTagColors[definition.id]} bordered={false}>{definition.group}</Tag>
                      <Typography.Text strong style={{ fontSize: 16 }} title={definition.name}>
                        {definition.name === "nvm-windows" ? "NVM" : definition.name}
                      </Typography.Text>
                    </div>
                    <div className="summary-card-logo-wrapper">
                      <EnvironmentLogo definition={definition} />
                    </div>
                  </div>
                  
                  <div className="summary-card-body">
                    {activeRecord ? (
                      <div className="summary-card-active">
                        <Typography.Title level={3} style={{ margin: 0, fontWeight: 600 }}>
                          {activeRecord.version}
                        </Typography.Title>
                        <Typography.Text type="secondary" ellipsis={{ tooltip: activeRecord.installPath }}>
                          {activeRecord.installPath}
                        </Typography.Text>
                      </div>
                    ) : (
                      <div className="summary-card-inactive">
                        <Typography.Text type="secondary" style={{ opacity: 0.8 }}>未安装或未激活</Typography.Text>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </Col>
          );
        })}
      </Row>

      <Card>
        <Descriptions title="基础配置" column={2}>
          <Descriptions.Item label="全局安装目录">{config?.globalInstallDir ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="下载缓存目录">{config?.downloadCacheDir ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="系统盘">{status?.systemDrive ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="架构">{status?.arch ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="代理">{config?.proxy.enabled ? "已启用" : "未启用"}</Descriptions.Item>
          <Descriptions.Item label="保留安装包">{config?.retainDownloads ? "是" : "否"}</Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
}
