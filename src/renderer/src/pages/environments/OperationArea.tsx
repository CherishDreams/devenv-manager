import { CloudDownloadOutlined, FolderOpenOutlined, ReloadOutlined } from "@ant-design/icons";
import { Alert, App as AntdApp, Button, Card, Checkbox, Empty, Input, Radio, Select, Space, Steps, Typography } from "antd";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import type { EnvironmentDefinition, InstallScope, InstallTaskInput } from "@shared/types";
import { envManagerApi } from "../../api/envManagerApi";
import { useCatalogStore } from "../../stores/catalogStore";
import { useConfigStore } from "../../stores/configStore";
import { useTaskStore } from "../../stores/taskStore";
import {
  createVersionSelectOption,
  filterVersionOption,
  getCatalogKey,
  getSuggestedInstallPath,
  type VersionSelectOption,
} from "./environmentInstallHelpers";
import { MirrorSourceControl } from "./MirrorSourceControl";
import { VendorList } from "./VendorList";
import { VersionOption } from "./VersionOption";

export function OperationArea({ definition }: { definition: EnvironmentDefinition }): React.ReactElement {
  const { message } = AntdApp.useApp();
  const config = useConfigStore((state) => state.config);
  const updateConfig = useConfigStore((state) => state.update);
  const configLoading = useConfigStore((state) => state.loading);
  const createInstall = useTaskStore((state) => state.createInstall);
  const versionsByKey = useCatalogStore((state) => state.versionsByKey);
  const loadingByKey = useCatalogStore((state) => state.loadingByKey);
  const errorByKey = useCatalogStore((state) => state.errorByKey);
  const loadVersions = useCatalogStore((state) => state.loadVersions);
  const clearVersions = useCatalogStore((state) => state.clearVersions);
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
    setSelectedVersionId(undefined);
  }, [definition.id, selectedVendorId]);

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId),
    [selectedVersionId, versions],
  );

  const versionSelectOptions = useMemo(() => versions.map(createVersionSelectOption), [versions]);

  const suggestedInstallPath = useMemo(
    () => getSuggestedInstallPath(config?.globalInstallDir ?? "E:\\dev_env", definition, selectedVendorId, selectedVersion),
    [config?.globalInstallDir, definition, selectedVendorId, selectedVersion],
  );

  const stepCurrent = selectedVendorId ? (selectedVersion ? 3 : 2) : 0;

  const applyMirrorSource = async (value: string): Promise<void> => {
    if (!config) {
      message.warning("配置尚未加载完成");
      return;
    }

    await updateConfig({
      mirrors: {
        ...config.mirrors,
        [definition.id]: value,
      },
    });
    clearVersions(definition.id);
    setSelectedVersionId(undefined);
    message.success("下载源已应用，请重新获取版本");
  };

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
            items={[{ title: "发行商" }, { title: "下载源" }, { title: "版本" }, { title: "配置" }, { title: "创建任务" }]}
          />

          <MirrorSourceControl
            definition={definition}
            savedMirrorValue={config?.mirrors[definition.id]}
            saving={configLoading}
            onApply={applyMirrorSource}
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
