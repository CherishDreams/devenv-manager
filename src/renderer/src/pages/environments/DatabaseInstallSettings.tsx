import type { ConfigurableDatabaseEnvironmentKind, DatabaseInstallConfig } from "@shared/types";
import type React from "react";
import { createDefaultDatabaseInstallConfig } from "@shared/databaseInstallConfig";
import { Alert, Checkbox, Input, InputNumber, Select, Space, Switch, Typography } from "antd";
import { useMemo } from "react";

interface DatabaseInstallSettingsProps {
  environment: ConfigurableDatabaseEnvironmentKind;
  value: DatabaseInstallConfig;
  onChange: (value: DatabaseInstallConfig) => void;
}

interface DatabaseConfigSpec {
  title: string;
  description: string;
  configFileLabel: string;
  charsetOptions: Array<{ label: string; value: string }>;
  collationPlaceholder?: string;
  showCharset: boolean;
  showCollation: boolean;
}

const databaseConfigSpecs: Record<ConfigurableDatabaseEnvironmentKind, DatabaseConfigSpec> = {
  mysql: {
    title: "MySQL 运行配置",
    description: "安装后生成 my.cnf / my.ini，可选择初始化 data 目录并注册 Windows 服务。",
    configFileLabel: "my.cnf / my.ini",
    charsetOptions: [
      { label: "utf8mb4", value: "utf8mb4" },
      { label: "utf8", value: "utf8" },
      { label: "latin1", value: "latin1" },
      { label: "gbk", value: "gbk" },
    ],
    collationPlaceholder: "utf8mb4_0900_ai_ci",
    showCharset: true,
    showCollation: true,
  },
  postgresql: {
    title: "PostgreSQL 运行配置",
    description: "安装后初始化 data 目录，并写入 postgresql.conf。",
    configFileLabel: "postgresql.conf",
    charsetOptions: [
      { label: "UTF8", value: "UTF8" },
      { label: "GBK", value: "GBK" },
      { label: "LATIN1", value: "LATIN1" },
    ],
    collationPlaceholder: "C",
    showCharset: true,
    showCollation: true,
  },
  mongodb: {
    title: "MongoDB 运行配置",
    description: "安装后生成 mongod.cfg，可选择注册为 Windows 服务。",
    configFileLabel: "mongod.cfg",
    charsetOptions: [],
    showCharset: false,
    showCollation: false,
  },
  redis: {
    title: "Redis 运行配置",
    description: "安装后生成 redis.windows.conf，可选择注册为 Windows 服务。",
    configFileLabel: "redis.windows.conf",
    charsetOptions: [],
    showCharset: false,
    showCollation: false,
  },
};

export function DatabaseInstallSettings({
  environment,
  value,
  onChange,
}: DatabaseInstallSettingsProps): React.ReactElement {
  const spec = databaseConfigSpecs[environment];
  const serviceHelp = value.installAsService
    ? "需要管理员权限；服务名建议保持唯一。"
    : "不注册服务时仅写入启动配置文件。";
  const serviceName = value.serviceName || createDefaultDatabaseInstallConfig(environment).serviceName;

  const charsetOptions = useMemo(
    () =>
      spec.charsetOptions.some((option) => option.value === value.charset) || !value.charset
        ? spec.charsetOptions
        : [{ label: value.charset, value: value.charset }, ...spec.charsetOptions],
    [spec.charsetOptions, value.charset],
  );

  const update = (patch: Partial<DatabaseInstallConfig>): void => {
    onChange({
      ...value,
      ...patch,
    });
  };

  const toggleService = (checked: boolean): void => {
    update({
      installAsService: checked,
      startService: checked ? value.startService : false,
      serviceName,
    });
  };

  return (
    <div className="database-config-section">
      <div className="operation-section-title">
        <div>
          <Typography.Title level={5}>{spec.title}</Typography.Title>
          <Typography.Text type="secondary">{spec.description}</Typography.Text>
        </div>
        <Switch
          checked={value.enabled}
          checkedChildren="生成"
          unCheckedChildren="跳过"
          onChange={(checked) => update({ enabled: checked })}
        />
      </div>

      {value.enabled ? (
        <Space direction="vertical" size={12} className="full-width">
          <Alert
            type="info"
            showIcon
            message={`安装器会写入 ${spec.configFileLabel}，端口和绑定地址会在启动时生效。`}
          />

          <div className="database-config-grid">
            <label className="database-config-field">
              <Typography.Text strong>端口</Typography.Text>
              <InputNumber
                min={1}
                max={65535}
                value={value.port}
                className="full-width"
                onChange={(nextValue) => update({ port: nextValue ?? value.port })}
              />
            </label>

            <label className="database-config-field">
              <Typography.Text strong>绑定地址</Typography.Text>
              <Input value={value.bindAddress} onChange={(event) => update({ bindAddress: event.target.value })} />
            </label>

            {spec.showCharset ? (
              <label className="database-config-field">
                <Typography.Text strong>编码</Typography.Text>
                <Select
                  value={value.charset}
                  options={charsetOptions}
                  showSearch
                  onChange={(nextValue) => update({ charset: nextValue })}
                />
              </label>
            ) : null}

            {spec.showCollation ? (
              <label className="database-config-field">
                <Typography.Text strong>{environment === "postgresql" ? "Locale" : "排序规则"}</Typography.Text>
                <Input
                  value={value.collation}
                  placeholder={spec.collationPlaceholder}
                  onChange={(event) => update({ collation: event.target.value })}
                />
              </label>
            ) : null}
          </div>

          <div className="database-service-row">
            <Checkbox checked={value.installAsService} onChange={(event) => toggleService(event.target.checked)}>
              注册为 Windows 系统服务
            </Checkbox>
            <Typography.Text type="secondary">{serviceHelp}</Typography.Text>
          </div>

          {value.installAsService ? (
            <div className="database-config-grid database-config-grid-service">
              <label className="database-config-field">
                <Typography.Text strong>服务名</Typography.Text>
                <Input value={serviceName} onChange={(event) => update({ serviceName: event.target.value })} />
              </label>

              <div className="database-config-field database-config-checkbox-field">
                <Checkbox
                  checked={value.startService}
                  onChange={(event) => update({ startService: event.target.checked })}
                >
                  安装完成后启动服务
                </Checkbox>
              </div>
            </div>
          ) : null}
        </Space>
      ) : (
        <Alert type="warning" showIcon message="将只解压数据库运行时，不生成端口、编码或服务配置。" />
      )}
    </div>
  );
}
