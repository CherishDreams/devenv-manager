import type { AppConfig, NavigationLayout } from "@shared/types";
import type React from "react";
import type { ThemeStyle } from "../theme/themeDefinitions";
import {
  CloudDownloadOutlined,
  FolderOpenOutlined,
  ReloadOutlined,
  SaveOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { environmentDefinitions } from "@shared/environmentDefinitions";
import { createOfficialMirrorSettings, getConfiguredMirrorEntries } from "@shared/mirrorPresets";
import { App as AntdApp, Button, Form, Input, Radio, Select, Space, Switch, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { envManagerApi } from "../api/envManagerApi";
import { useCatalogStore } from "../stores/catalogStore";
import { useConfigStore } from "../stores/configStore";
import { useUiStore } from "../stores/uiStore";
import { themeOptions } from "../theme/themeDefinitions";

type ConfigFormValues = Partial<AppConfig>;
type SettingsTabKey = "general" | "network" | "data" | "about";

const settingsTabs: Array<{ key: SettingsTabKey; label: string }> = [
  { key: "general", label: "通用" },
  { key: "network", label: "网络服务" },
  { key: "data", label: "数据管理" },
  { key: "about", label: "关于" },
];

function DirectoryInput({
  onPick,
  value,
  onChange,
}: {
  onPick: () => void;
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}): React.ReactElement {
  return (
    <Input
      value={value}
      onChange={onChange}
      addonAfter={
        <Button type="text" size="small" icon={<FolderOpenOutlined />} onClick={onPick} aria-label="选择目录" />
      }
    />
  );
}

function SettingsRow({
  title,
  description,
  control,
}: {
  title: string;
  description: string;
  control: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <Typography.Text strong>{title}</Typography.Text>
        <Typography.Text type="secondary">{description}</Typography.Text>
      </div>
      <div className="settings-row-control">{control}</div>
    </div>
  );
}

export default function SettingsPage(): React.ReactElement {
  const [form] = Form.useForm<ConfigFormValues>();
  const [activeTab, setActiveTab] = useState<SettingsTabKey>("general");
  const { message, modal } = AntdApp.useApp();
  const config = useConfigStore((state) => state.config);
  const update = useConfigStore((state) => state.update);
  const loading = useConfigStore((state) => state.loading);
  const clearVersions = useCatalogStore((state) => state.clearVersions);
  const { themeStyle, setThemeStyle } = useUiStore();

  const definitionsById = useMemo(() => new Map(environmentDefinitions.map((definition) => [definition.id, definition])), []);
  const configuredMirrors = useMemo(() => {
    if (!config) {
      return [];
    }

    return getConfiguredMirrorEntries(config.mirrors).map((entry) => ({
      ...entry,
      definition: definitionsById.get(entry.environment),
    }));
  }, [config, definitionsById]);

  const navigationLayout = config?.appearance?.navigationLayout ?? "sidebar";

  useEffect(() => {
    if (config) {
      form.setFieldsValue(config);
    }
  }, [config, form]);

  const selectDirectory = async (fieldName: keyof Pick<AppConfig, "globalInstallDir" | "downloadCacheDir">): Promise<void> => {
    const selected = await envManagerApi.dialog.selectDirectory();
    if (selected) {
      form.setFieldValue(fieldName, selected);
    }
  };

  const save = async (): Promise<void> => {
    await form.validateFields();
    await update(form.getFieldsValue(true) as Partial<AppConfig>);
    message.success("设置已保存");
  };

  const updateNavigationLayout = async (value: NavigationLayout): Promise<void> => {
    form.setFieldValue(["appearance", "navigationLayout"], value);
    await update({
      appearance: {
        ...(config?.appearance ?? {}),
        navigationLayout: value,
      },
    });
    message.success("侧边栏布局已切换");
  };

  const openEnvironmentMirrors = (): void => {
    window.dispatchEvent(new CustomEvent("env-manager:navigate", { detail: "environments" }));
  };

  const resetMirrors = (): void => {
    modal.confirm({
      title: "重置镜像源",
      content: `确认将 ${configuredMirrors.length} 个环境的镜像源恢复为官方源？`,
      okText: "重置",
      okType: "danger",
      cancelText: "取消",
      onOk: async () => {
        await update({ mirrors: createOfficialMirrorSettings() });
        clearVersions();
        message.success("镜像源已重置为官方源");
      },
    });
  };

  const renderGeneralTab = (): React.ReactNode => (
    <div className="settings-panel">
      <SettingsRow
        title="显示语言"
        description="选择界面的显示语言"
        control={(
          <Select
            value="zh-CN"
            disabled
            options={[{ value: "zh-CN", label: "简体中文" }]}
            className="settings-control"
          />
        )}
      />
      <SettingsRow
        title="应用主题"
        description="切换默认或液态玻璃效果"
        control={(
          <Select
            value={themeStyle}
            onChange={(value: ThemeStyle) => setThemeStyle(value)}
            options={themeOptions}
            className="settings-control"
          />
        )}
      />
      <SettingsRow
        title="侧边栏布局"
        description="切换经典侧栏或图标浮栏"
        control={(
          <Select
            value={navigationLayout}
            loading={loading}
            onChange={(value: NavigationLayout) => void updateNavigationLayout(value)}
            options={[
              { value: "sidebar", label: "经典布局" },
              { value: "rail", label: "图标浮栏" },
            ]}
            className="settings-control"
          />
        )}
      />
      <SettingsRow
        title="界面缩放"
        description="调整界面缩放比例"
        control={
          <Select value="100" disabled options={[{ value: "100", label: "100%" }]} className="settings-control" />
        }
      />
      <SettingsRow
        title="窗口关闭行为"
        description="选择关闭窗口时的默认行为"
        control={
          <Select value="ask" disabled options={[{ value: "ask", label: "每次询问" }]} className="settings-control" />
        }
      />
    </div>
  );

  const renderNetworkTab = (): React.ReactNode => (
    <div className="settings-panel">
      <SettingsRow
        title="启用代理"
        description="安装器下载资源时使用代理"
        control={(
          <Form.Item name={["proxy", "enabled"]} valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        )}
      />
      <SettingsRow
        title="HTTP_PROXY"
        description="HTTP 下载请求使用的代理地址"
        control={(
          <Form.Item name={["proxy", "httpProxy"]} noStyle>
            <Input placeholder="http://127.0.0.1:7890" className="settings-control" />
          </Form.Item>
        )}
      />
      <SettingsRow
        title="HTTPS_PROXY"
        description="HTTPS 下载请求使用的代理地址"
        control={(
          <Form.Item name={["proxy", "httpsProxy"]} noStyle>
            <Input placeholder="http://127.0.0.1:7890" className="settings-control" />
          </Form.Item>
        )}
      />
      <SettingsRow
        title="镜像源摘要"
        description={`当前 ${configuredMirrors.length} 个环境启用了非官方镜像源`}
        control={(
          <Space wrap>
            <Button icon={<CloudDownloadOutlined />} onClick={openEnvironmentMirrors}>
              前往配置
            </Button>
            <Button danger icon={<ReloadOutlined />} disabled={configuredMirrors.length === 0} onClick={resetMirrors}>
              全部重置
            </Button>
          </Space>
        )}
      />
      {configuredMirrors.length > 0
        ? (
            <div className="settings-mirror-strip">
              {configuredMirrors.map((entry) => (
                <Tag key={entry.environment} color="blue">
                  {entry.definition?.name ?? entry.environment}
                  :
                  {entry.displayName}
                </Tag>
              ))}
            </div>
          )
        : null}
    </div>
  );

  const renderDataTab = (): React.ReactNode => (
    <div className="settings-panel">
      <SettingsRow
        title="全局安装目录"
        description="未手动选择路径时默认安装到这里"
        control={(
          <Form.Item name="globalInstallDir" rules={[{ required: true, message: "请选择目录" }]} noStyle>
            <DirectoryInput onPick={() => void selectDirectory("globalInstallDir")} />
          </Form.Item>
        )}
      />
      <SettingsRow
        title="下载缓存目录"
        description="下载的安装包和临时文件缓存位置"
        control={(
          <Form.Item name="downloadCacheDir" rules={[{ required: true, message: "请选择目录" }]} noStyle>
            <DirectoryInput onPick={() => void selectDirectory("downloadCacheDir")} />
          </Form.Item>
        )}
      />
      <SettingsRow
        title="保留安装包"
        description="安装完成后保留下载文件，便于复用"
        control={(
          <Form.Item name="retainDownloads" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        )}
      />
      <SettingsRow
        title="版本切换方式"
        description="选择软件软链接或直接修改系统环境变量"
        control={(
          <Form.Item name={["environmentManagement", "mode"]} noStyle>
            <Radio.Group optionType="button" buttonStyle="solid">
              <Radio.Button value="symlink">软件软链接</Radio.Button>
              <Radio.Button value="direct">直接指向</Radio.Button>
            </Radio.Group>
          </Form.Item>
        )}
      />
    </div>
  );

  const renderAboutTab = (): React.ReactNode => (
    <div className="settings-panel">
      <SettingsRow title="应用名称" description="当前程序" control={<Typography.Text>DevEnv Manager</Typography.Text>} />
      <SettingsRow title="目标平台" description="当前支持范围" control={<Typography.Text>Windows</Typography.Text>} />
      <SettingsRow title="技术栈" description="桌面端与前端框架" control={<Typography.Text>Electron + React</Typography.Text>} />
      <SettingsRow
        title="环境管理"
        description="支持多版本安装、切换、接管和卸载"
        control={<Tag color="blue">本地优先</Tag>}
      />
    </div>
  );

  const tabContent: Record<SettingsTabKey, React.ReactNode> = {
    general: renderGeneralTab(),
    network: renderNetworkTab(),
    data: renderDataTab(),
    about: renderAboutTab(),
  };

  return (
    <div className="settings-app-page">
      <div className="settings-page-heading">
        <div>
          <Typography.Title level={2}>应用设置</Typography.Title>
          <div className="settings-section-label">
            <SettingOutlined />
            <span>{settingsTabs.find((item) => item.key === activeTab)?.label}</span>
          </div>
        </div>
        <div className="settings-segmented-tabs" role="tablist" aria-label="设置分类">
          {settingsTabs.map((tab) => (
            <button
              key={tab.key}
              className={activeTab === tab.key ? "settings-tab settings-tab-active" : "settings-tab"}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <Form<ConfigFormValues> form={form} className="settings-row-form">
        {tabContent[activeTab]}
      </Form>

      {activeTab !== "about"
        ? (
            <div className="settings-actions">
              <Button type="primary" icon={<SaveOutlined />} loading={loading} onClick={() => void save()}>
                保存设置
              </Button>
            </div>
          )
        : null}
    </div>
  );
}
