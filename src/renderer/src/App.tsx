import { AppstoreOutlined, CloseOutlined, DashboardOutlined, FileTextOutlined, SettingOutlined, ToolOutlined } from "@ant-design/icons";
import { App as AntdApp, Button, ConfigProvider, Layout, Menu, Spin, Tag, Typography } from "antd";
import type { MenuProps } from "antd";
import type React from "react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useConfigStore } from "./stores/configStore";
import { useEnvironmentStore } from "./stores/environmentStore";
import { useSystemStore } from "./stores/systemStore";
import { useTaskStore } from "./stores/taskStore";

type PageKey = "dashboard" | "installed" | "environments" | "logs";

const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const InstalledEnvironmentsPage = lazy(() => import("./pages/InstalledEnvironmentsPage"));
const EnvironmentsPage = lazy(() => import("./pages/EnvironmentsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const LogsPage = lazy(() => import("./pages/LogsPage"));

const navItems: MenuProps["items"] = [
  {
    key: "dashboard",
    icon: <DashboardOutlined />,
    label: "总览",
  },
  {
    key: "environments",
    icon: <ToolOutlined />,
    label: "环境管理",
  },
  {
    key: "installed",
    icon: <AppstoreOutlined />,
    label: "已安装环境",
  },
  {
    key: "logs",
    icon: <FileTextOutlined />,
    label: "日志",
  },
];

function renderPage(pageKey: PageKey): React.ReactNode {
  switch (pageKey) {
    case "environments":
      return <EnvironmentsPage />;
    case "installed":
      return <InstalledEnvironmentsPage />;
    case "logs":
      return <LogsPage />;
    case "dashboard":
    default:
      return <DashboardPage />;
  }
}

function HeaderStatus(): React.ReactElement {
  const status = useSystemStore((state) => state.status);
  const runningTaskCount = useTaskStore((state) => state.tasks.filter((task) => task.status === "running").length);

  return (
    <div className="header-status">
      <Tag color={status?.isWindows ? "blue" : "red"}>{status?.isWindows ? "Windows" : "非 Windows"}</Tag>
      <Tag color={status?.isAdministrator ? "green" : "orange"}>
        {status?.isAdministrator ? "管理员" : "普通权限"}
      </Tag>
      <Tag color={runningTaskCount > 0 ? "processing" : "default"}>运行中 {runningTaskCount}</Tag>
    </div>
  );
}

export default function App(): React.ReactElement {
  const [pageKey, setPageKey] = useState<PageKey>("dashboard");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const loadConfig = useConfigStore((state) => state.load);
  const loadSystem = useSystemStore((state) => state.load);
  const loadEnvironment = useEnvironmentStore((state) => state.load);
  const subscribeToEnvironmentEvents = useEnvironmentStore((state) => state.subscribeToEnvironmentEvents);
  const loadTasks = useTaskStore((state) => state.load);
  const subscribeToTaskEvents = useTaskStore((state) => state.subscribeToTaskEvents);

  useEffect(() => {
    void Promise.all([loadConfig(), loadSystem(), loadEnvironment(), loadTasks()]);
    const unsubscribeTasks = subscribeToTaskEvents();
    const unsubscribeEnvironments = subscribeToEnvironmentEvents();

    return () => {
      unsubscribeTasks();
      unsubscribeEnvironments();
    };
  }, [loadConfig, loadEnvironment, loadSystem, loadTasks, subscribeToEnvironmentEvents, subscribeToTaskEvents]);

  useEffect(() => {
    const navigate = (event: Event): void => {
      const page = (event as CustomEvent<PageKey>).detail;

      if (page) {
        setPageKey(page);
      }
    };

    window.addEventListener("env-manager:navigate", navigate);
    return () => window.removeEventListener("env-manager:navigate", navigate);
  }, []);

  const selectedKeys = useMemo(() => [pageKey], [pageKey]);

  return (
    <ConfigProvider
      theme={{
        token: {
          borderRadius: 8,
          colorPrimary: "#1668dc",
          fontFamily:
            "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        },
        components: {
          Layout: {
            bodyBg: "#f5f7fb",
            siderBg: "#ffffff",
            headerBg: "#ffffff",
          },
        },
      }}
    >
      <AntdApp>
        <Layout className="app-shell">
          <Layout.Sider className="side-nav" width={228}>
            <div className="brand">
              <div className="brand-mark">EM</div>
              <div>
                <Typography.Text strong>环境管理</Typography.Text>
                <Typography.Text className="brand-subtitle">Windows</Typography.Text>
              </div>
            </div>
            <Menu
              mode="inline"
              selectedKeys={selectedKeys}
              items={navItems}
              onClick={(event) => setPageKey(event.key as PageKey)}
            />
            <div className="side-nav-footer">
              <Button icon={<SettingOutlined />} block onClick={() => setSettingsOpen(true)}>
                设置
              </Button>
            </div>
          </Layout.Sider>
          <Layout>
            <Layout.Header className="app-header">
              <Typography.Title level={4}>开发环境管理</Typography.Title>
              <HeaderStatus />
            </Layout.Header>
            <Layout.Content className="app-content">
              <Suspense
                fallback={
                  <div className="page-loading">
                    <Spin />
                  </div>
                }
              >
                {renderPage(pageKey)}
              </Suspense>
            </Layout.Content>
          </Layout>
        </Layout>
        {settingsOpen ? (
          <div className="settings-overlay">
            <div className="settings-overlay-header">
              <div>
                <Typography.Title level={3}>设置</Typography.Title>
                <Typography.Text type="secondary">安装目录、镜像源、代理与缓存</Typography.Text>
              </div>
              <Button icon={<CloseOutlined />} onClick={() => setSettingsOpen(false)}>
                关闭
              </Button>
            </div>
            <div className="settings-overlay-content">
              <Suspense
                fallback={
                  <div className="page-loading">
                    <Spin />
                  </div>
                }
              >
                <SettingsPage />
              </Suspense>
            </div>
          </div>
        ) : null}
      </AntdApp>
    </ConfigProvider>
  );
}
