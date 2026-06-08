import { ArrowLeftOutlined, CloudDownloadOutlined, FolderOpenOutlined, PlayCircleOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Checkbox,
  Empty,
  Input,
  List,
  Radio,
  Space,
  Steps,
  Table,
  Tag,
  Typography,
} from "antd";
import type { TableColumnsType } from "antd";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import type {
  AvailableVersion,
  EnvironmentDefinition,
  EnvironmentKind,
  InstallRecord,
  InstallScope,
  InstallTaskInput,
  VendorOption,
} from "@shared/types";
import { envManagerApi } from "../api/envManagerApi";
import { useCatalogStore } from "../stores/catalogStore";
import { useConfigStore } from "../stores/configStore";
import { useEnvironmentStore } from "../stores/environmentStore";
import { useTaskStore } from "../stores/taskStore";

function getCatalogKey(environment: EnvironmentKind, vendor: string): string {
  return `${environment}:${vendor}`;
}

function groupDefinitions(definitions: EnvironmentDefinition[]): Array<[string, EnvironmentDefinition[]]> {
  const groups = definitions.reduce<Map<string, EnvironmentDefinition[]>>((grouped, definition) => {
    const next = grouped.get(definition.group) ?? [];
    next.push(definition);
    grouped.set(definition.group, next);
    return grouped;
  }, new Map());

  return Array.from(groups.entries());
}

function EnvironmentLogo({ definition }: { definition: EnvironmentDefinition }): React.ReactElement {
  const style = { "--logo-color": definition.accentColor } as React.CSSProperties;

  return (
    <div className="environment-logo" style={style}>
      {definition.logoId === "java" ? (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M25 10c6 5-4 8 1 13M35 8c7 6-5 10 1 16M18 30h28v8c0 8-5 13-14 13s-14-5-14-13v-8Z" />
          <path d="M46 32h4c4 0 6 3 5 7-1 5-5 8-12 8M17 53h31M20 26h26" />
        </svg>
      ) : null}
      {definition.logoId === "go" ? (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M10 24h18M6 32h18M12 40h16" />
          <path d="M28 32c0-9 7-16 17-16s17 7 17 16-7 16-17 16-17-7-17-16Z" />
          <path d="M41 26h12M39 32h13M41 38h8" />
        </svg>
      ) : null}
      {definition.logoId === "maven" ? (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M17 50c11-20 24-32 39-36-2 12-11 25-29 39" />
          <path d="M28 34l12 12M22 42l6 6M36 24l10 10" />
        </svg>
      ) : null}
      {definition.logoId === "conda" ? (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M18 35c0-11 9-20 20-20 7 0 12 3 16 8" />
          <path d="M46 29c0 11-9 20-20 20-7 0-12-3-16-8" />
          <path d="M25 18c1 7-2 12-9 15M39 46c-1-7 2-12 9-15" />
          <path d="M21 35h22" />
        </svg>
      ) : null}
    </div>
  );
}

function getEnvironmentStatus(records: InstallRecord[]): {
  installed: boolean;
  status: string;
} {
  const activeRecord = records.find((record) => record.active);
  const fallbackRecord = records[0];

  if (activeRecord) {
    return {
      installed: true,
      status: `当前 ${activeRecord.version}`,
    };
  }

  if (fallbackRecord) {
    return {
      installed: true,
      status: `已安装 ${fallbackRecord.version}`,
    };
  }

  return {
    installed: false,
    status: "未安装",
  };
}

function createInstallColumns(
  activeByKind: Record<string, string | undefined>,
  setActive: (environment: EnvironmentKind, id: string) => Promise<void>,
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
      title: "环境变量",
      dataIndex: "envVars",
      key: "envVars",
      width: 220,
      render: (envVars: InstallRecord["envVars"]) => (
        <Space wrap>
          {Object.keys(envVars).map((name) => (
            <Tag key={name}>{name}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 160,
      render: (_, record) => (
        <Button
          size="small"
          icon={<PlayCircleOutlined />}
          disabled={activeByKind[record.environment] === record.id}
          onClick={() => void setActive(record.environment, record.id)}
        >
          切换
        </Button>
      ),
    },
  ];
}

function EnvironmentCard({
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

function VendorList({
  vendors,
  selectedVendorId,
  onSelect,
}: {
  vendors: VendorOption[];
  selectedVendorId?: string;
  onSelect: (vendorId: string) => void;
}): React.ReactElement {
  return (
    <Card title="发行商" className="operation-card">
      <List
        dataSource={vendors}
        renderItem={(vendor) => (
          <List.Item
            className={vendor.id === selectedVendorId ? "vendor-item vendor-item-active" : "vendor-item"}
            onClick={() => onSelect(vendor.id)}
          >
            <Space direction="vertical" size={2}>
              <Typography.Text strong>{vendor.name}</Typography.Text>
              <Typography.Text type="secondary">{vendor.homepage}</Typography.Text>
            </Space>
          </List.Item>
        )}
      />
    </Card>
  );
}

function VersionOption({ version }: { version: AvailableVersion }): React.ReactElement {
  return (
    <Space direction="vertical" size={4}>
      <Space>
        <Typography.Text strong>{version.label}</Typography.Text>
        <Tag color={version.channel === "lts" ? "green" : "blue"}>{version.channel.toUpperCase()}</Tag>
      </Space>
      <Typography.Text type="secondary">
        {version.architecture} / {version.packageType}
      </Typography.Text>
      {version.notes ? <Typography.Text type="secondary">{version.notes}</Typography.Text> : null}
    </Space>
  );
}

function getSuggestedInstallPath(
  globalInstallDir: string,
  definition: EnvironmentDefinition,
  vendorId: string | undefined,
  version: AvailableVersion | undefined,
): string {
  const vendorSegment = vendorId ?? "vendor";
  const versionSegment = version?.version ?? "version";
  return `${globalInstallDir}\\${definition.id}\\${vendorSegment}\\${versionSegment}`;
}

function OperationArea({ definition }: { definition: EnvironmentDefinition }): React.ReactElement {
  const { message } = AntdApp.useApp();
  const config = useConfigStore((state) => state.config);
  const createInstall = useTaskStore((state) => state.createInstall);
  const versionsByKey = useCatalogStore((state) => state.versionsByKey);
  const loadingByKey = useCatalogStore((state) => state.loadingByKey);
  const errorByKey = useCatalogStore((state) => state.errorByKey);
  const loadVersions = useCatalogStore((state) => state.loadVersions);
  const [selectedVendorId, setSelectedVendorId] = useState<string | undefined>(definition.vendors[0]?.id);
  const [selectedVersionId, setSelectedVersionId] = useState<string | undefined>();
  const [scope, setScope] = useState<InstallScope>("global");
  const [customPath, setCustomPath] = useState("");
  const [configureSystemEnv, setConfigureSystemEnv] = useState(true);

  useEffect(() => {
    setSelectedVendorId(definition.vendors[0]?.id);
    setSelectedVersionId(undefined);
    setScope("global");
    setCustomPath("");
    setConfigureSystemEnv(true);
  }, [definition]);

  const catalogKey = selectedVendorId ? getCatalogKey(definition.id, selectedVendorId) : "";
  const versions = selectedVendorId ? versionsByKey[catalogKey] ?? [] : [];
  const loading = selectedVendorId ? Boolean(loadingByKey[catalogKey]) : false;
  const error = selectedVendorId ? errorByKey[catalogKey] : undefined;

  useEffect(() => {
    let cancelled = false;

    if (!selectedVendorId) {
      return undefined;
    }

    setSelectedVersionId(undefined);
    void loadVersions({ environment: definition.id, vendor: selectedVendorId }).then((nextVersions) => {
      if (!cancelled) {
        setSelectedVersionId(nextVersions[0]?.id);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [definition.id, loadVersions, selectedVendorId]);

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId),
    [selectedVersionId, versions],
  );

  const suggestedInstallPath = useMemo(
    () => getSuggestedInstallPath(config?.globalInstallDir ?? "E:\\dev_env", definition, selectedVendorId, selectedVersion),
    [config?.globalInstallDir, definition, selectedVendorId, selectedVersion],
  );

  const stepCurrent = selectedVendorId ? (selectedVersion ? 2 : 1) : 0;

  const refreshVersions = async (): Promise<void> => {
    if (!selectedVendorId) {
      return;
    }

    const nextVersions = await loadVersions({ environment: definition.id, vendor: selectedVendorId });
    setSelectedVersionId((current) => (nextVersions.some((version) => version.id === current) ? current : nextVersions[0]?.id));
  };

  const selectDirectory = async (): Promise<void> => {
    const selected = await envManagerApi.dialog.selectDirectory();
    if (selected) {
      setCustomPath(selected);
    }
  };

  const createTask = async (): Promise<void> => {
    if (!selectedVendorId || !selectedVersion) {
      message.warning("请先选择发行商和版本");
      return;
    }

    if (scope === "custom" && !customPath.trim()) {
      message.warning("请选择手动安装路径");
      return;
    }

    const input: InstallTaskInput = {
      environment: definition.id,
      vendor: selectedVendorId,
      version: selectedVersion.version,
      scope,
      installPath: scope === "custom" ? customPath.trim() : undefined,
      configureSystemEnv,
    };

    await createInstall(input);
    message.success("安装任务已创建");
    window.dispatchEvent(new CustomEvent("env-manager:navigate", { detail: "logs" }));
  };

  return (
    <div className="operation-layout">
      <VendorList vendors={definition.vendors} selectedVendorId={selectedVendorId} onSelect={setSelectedVendorId} />

      <Card title="安装操作" className="operation-card">
        <Space direction="vertical" size={16} className="full-width">
          <Steps
            size="small"
            current={stepCurrent}
            items={[
              { title: "发行商" },
              { title: "版本" },
              { title: "配置" },
              { title: "创建任务" },
            ]}
          />

          <div className="operation-section">
            <div className="operation-section-title">
              <Typography.Title level={5}>可安装版本</Typography.Title>
              <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void refreshVersions()}>
                获取版本
              </Button>
            </div>

            {error ? <Alert type="error" showIcon message={error} /> : null}

            {versions.length > 0 ? (
              <Radio.Group
                className="version-options"
                value={selectedVersionId}
                onChange={(event) => setSelectedVersionId(event.target.value as string)}
              >
                {versions.map((version) => (
                  <Radio.Button key={version.id} value={version.id} className="version-option">
                    <VersionOption version={version} />
                  </Radio.Button>
                ))}
              </Radio.Group>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={loading ? "正在获取版本" : "暂无版本数据"} />
            )}
          </div>

          <div className="operation-section">
            <Typography.Title level={5}>安装配置</Typography.Title>
            <Space direction="vertical" size={12} className="full-width">
              <Radio.Group
                value={scope}
                onChange={(event) => setScope(event.target.value as InstallScope)}
                options={[
                  { label: "全局目录", value: "global" },
                  { label: "手动路径", value: "custom" },
                ]}
              />

              {scope === "global" ? (
                <Alert type="info" showIcon message={suggestedInstallPath} />
              ) : (
                <Input
                  value={customPath}
                  onChange={(event) => setCustomPath(event.target.value)}
                  placeholder={suggestedInstallPath}
                  addonAfter={
                    <Button type="text" size="small" icon={<FolderOpenOutlined />} onClick={() => void selectDirectory()} />
                  }
                />
              )}

              <Checkbox checked={configureSystemEnv} onChange={(event) => setConfigureSystemEnv(event.target.checked)}>
                配置系统环境变量
              </Checkbox>

              <Button type="primary" icon={<CloudDownloadOutlined />} disabled={!selectedVersion} onClick={() => void createTask()}>
                创建安装任务
              </Button>
            </Space>
          </div>
        </Space>
      </Card>
    </div>
  );
}

function InstallCatalog({
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
      <div className="page-title-row">
        <div>
          <Typography.Title level={3}>环境安装</Typography.Title>
          <Typography.Text type="secondary">选择环境后配置发行商、版本和安装路径</Typography.Text>
        </div>
        <Tag icon={<CloudDownloadOutlined />} color="blue">
          测试目录 E:/dev_env
        </Tag>
      </div>

      {groupedDefinitions.map(([group, groupDefinitions]) => (
        <section className="environment-category" key={group}>
          <Typography.Title level={4}>{group}</Typography.Title>
          <div className="environment-card-grid">
            {groupDefinitions.map((definition) => (
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

export default function EnvironmentsPage(): React.ReactElement {
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<EnvironmentKind | undefined>();
  const summary = useEnvironmentStore((state) => state.summary);
  const loading = useEnvironmentStore((state) => state.loading);
  const setActive = useEnvironmentStore((state) => state.setActive);

  const definitions = summary?.definitions ?? [];
  const installations = summary?.installations ?? [];

  const recordsByKind = useMemo(() => {
    return installations.reduce<Map<EnvironmentKind, InstallRecord[]>>((groupedRecords, record) => {
      const nextRecords = groupedRecords.get(record.environment) ?? [];
      nextRecords.push(record);
      groupedRecords.set(record.environment, nextRecords);
      return groupedRecords;
    }, new Map());
  }, [installations]);

  const columns = useMemo(
    () => createInstallColumns(summary?.activeByKind ?? {}, setActive),
    [setActive, summary?.activeByKind],
  );

  const selectedDefinition = useMemo(
    () => definitions.find((definition) => definition.id === selectedDefinitionId),
    [definitions, selectedDefinitionId],
  );

  return (
    <InstallCatalog
      definitions={definitions}
      recordsByKind={recordsByKind}
      selectedDefinition={selectedDefinition}
      onSelectDefinition={setSelectedDefinitionId}
      onClearSelection={() => setSelectedDefinitionId(undefined)}
      columns={columns}
      loading={loading}
    />
  );
}
