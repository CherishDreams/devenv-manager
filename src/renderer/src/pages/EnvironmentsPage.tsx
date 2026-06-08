import {
  ArrowLeftOutlined,
  CloudDownloadOutlined,
  DeleteOutlined,
  FolderOpenOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Checkbox,
  Empty,
  Input,
  List,
  Popconfirm,
  Radio,
  Select,
  Space,
  Steps,
  Table,
  Tag,
  Typography,
} from "antd";
import type { TableColumnsType } from "antd";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { EnvironmentLogo } from "../components/EnvironmentLogo";
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
        className="vendor-list"
        dataSource={vendors}
        renderItem={(vendor) => (
          <List.Item
            className={vendor.id === selectedVendorId ? "vendor-item vendor-item-active" : "vendor-item"}
            onClick={() => onSelect(vendor.id)}
          >
            <Space className="vendor-item-content" direction="vertical" size={2}>
              <Typography.Text strong className="vendor-item-name">
                {vendor.name}
              </Typography.Text>
              <Typography.Text className="vendor-item-homepage" type="secondary">
                {vendor.homepage}
              </Typography.Text>
            </Space>
          </List.Item>
        )}
      />
    </Card>
  );
}

function VersionOption({ version }: { version: AvailableVersion }): React.ReactElement {
  return (
    <Space className="version-select-option" direction="vertical" size={4}>
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

interface VersionSelectOption {
  value: string;
  label: string;
  searchText: string;
  version: AvailableVersion;
}

function createVersionSelectOption(version: AvailableVersion): VersionSelectOption {
  return {
    value: version.id,
    label: version.label,
    searchText: [version.label, version.version, version.channel, version.notes].filter(Boolean).join(" ").toLowerCase(),
    version,
  };
}

function filterVersionOption(input: string, option?: VersionSelectOption): boolean {
  return option?.searchText.includes(input.trim().toLowerCase()) ?? false;
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

  const versionSelectOptions = useMemo(() => versions.map(createVersionSelectOption), [versions]);

  const suggestedInstallPath = useMemo(
    () => getSuggestedInstallPath(config?.globalInstallDir ?? "E:\\dev_env", definition, selectedVendorId, selectedVersion),
    [config?.globalInstallDir, definition, selectedVendorId, selectedVersion],
  );

  const stepCurrent = selectedVendorId ? (selectedVersion ? 2 : 1) : 0;

  const refreshVersions = async (): Promise<void> => {
    if (!selectedVendorId) {
      message.warning("请先选择发行商");
      return;
    }

    try {
      const nextVersions = await loadVersions({ environment: definition.id, vendor: selectedVendorId }, { force: true });
      setSelectedVersionId((current) => (nextVersions.some((version) => version.id === current) ? current : nextVersions[0]?.id));

      if (nextVersions.length > 0) {
        message.success(`版本获取完成，共 ${nextVersions.length} 个可安装版本`);
      } else {
        message.info("版本获取完成，当前发行商暂无可安装版本");
      }
    } catch (fetchError) {
      message.error(`版本获取失败：${(fetchError as Error).message}`);
    }
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
              <Select<string, VersionSelectOption>
                className="version-select"
                popupClassName="version-select-popup"
                showSearch
                allowClear
                value={selectedVersionId}
                options={versionSelectOptions}
                loading={loading}
                placeholder="选择版本"
                optionFilterProp="searchText"
                filterOption={filterVersionOption}
                optionRender={(option) => <VersionOption version={option.data.version} />}
                onChange={(value) => setSelectedVersionId(value)}
                onClear={() => setSelectedVersionId(undefined)}
              />
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
  const { message } = AntdApp.useApp();
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<EnvironmentKind | undefined>();
  const summary = useEnvironmentStore((state) => state.summary);
  const loading = useEnvironmentStore((state) => state.loading);
  const setActive = useEnvironmentStore((state) => state.setActive);
  const uninstall = useEnvironmentStore((state) => state.uninstall);

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
    () => createInstallColumns(summary?.activeByKind ?? {}, switchActive, uninstallRecord),
    [summary?.activeByKind, switchActive, uninstallRecord],
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
