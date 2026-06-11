import type React from "react";
import {
  AppstoreOutlined,
  BellOutlined,
  BgColorsOutlined,
  DashboardOutlined,
  FileTextOutlined,
  SettingOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { App as AntdApp, Badge, Button, ConfigProvider, Spin, Switch, Tooltip, Typography } from "antd";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { AppLogo } from "./components/AppLogo";
import { useConfigStore } from "./stores/configStore";
import { useEnvironmentStore } from "./stores/environmentStore";
import { useSystemStore } from "./stores/systemStore";
import { useTaskStore } from "./stores/taskStore";
import { useUiStore } from "./stores/uiStore";
import { getThemeDefinition, themeBodyClasses } from "./theme/themeDefinitions";

type PageKey = "dashboard" | "installed" | "environments" | "logs" | "settings";

const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const InstalledEnvironmentsPage = lazy(() => import("./pages/InstalledEnvironmentsPage"));
const EnvironmentsPage = lazy(() => import("./pages/EnvironmentsPage").then((mod) => ({ default: mod.EnvironmentInstallPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const LogsPage = lazy(() => import("./pages/LogsPage"));

const pageTitles: Record<PageKey, string> = {
  dashboard: "仪表盘",
  environments: "环境管理",
  installed: "已安装环境",
  logs: "日志",
  settings: "应用设置",
};

const navItems: Array<{ key: PageKey; icon: React.ReactNode; label: string }> = [
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
    case "settings":
      return <SettingsPage />;
    case "dashboard":
    default:
      return <DashboardPage />;
  }
}

function HeaderStatus(): React.ReactElement {
  const runningTaskCount = useTaskStore((state) => state.tasks.filter((task) => task.status === "running").length);
  const { themeStyle, setThemeStyle } = useUiStore();
  const isLiquidGlass = themeStyle === "liquidGlass";
  const nextTheme = getThemeDefinition(isLiquidGlass ? "default" : "liquidGlass");

  return (
    <div className="header-status">
      <Tooltip title={`切换${nextTheme.label}`}>
        <Switch
          checkedChildren={<BgColorsOutlined />}
          unCheckedChildren={<BgColorsOutlined />}
          checked={isLiquidGlass}
          onChange={(checked) => setThemeStyle(checked ? "liquidGlass" : "default")}
        />
      </Tooltip>
      <Tooltip title="运行中的任务">
        <Badge count={runningTaskCount} size="small">
          <Button icon={<BellOutlined />} />
        </Badge>
      </Tooltip>
    </div>
  );
}

function PageRail({
  pageKey,
  onNavigate,
  onOpenSettings,
}: {
  pageKey: PageKey;
  onNavigate: (key: PageKey) => void;
  onOpenSettings: () => void;
}): React.ReactElement {
  return (
    <aside className="floating-rail" aria-label="主导航">
      <div className="rail-brand">
        <AppLogo />
      </div>
      <nav className="rail-nav">
        {navItems.map((item) => (
          <Tooltip title={item.label} placement="right" key={item.key}>
            <button
              className={pageKey === item.key ? "rail-button rail-button-active" : "rail-button"}
              type="button"
              aria-label={item.label}
              aria-current={pageKey === item.key ? "page" : undefined}
              onClick={() => onNavigate(item.key)}
            >
              {item.icon}
            </button>
          </Tooltip>
        ))}
      </nav>
      <div className="rail-footer">
        <Tooltip title="设置" placement="right">
          <button
            className={pageKey === "settings" ? "rail-button rail-button-active" : "rail-button"}
            type="button"
            aria-label="设置"
            aria-current={pageKey === "settings" ? "page" : undefined}
            onClick={onOpenSettings}
          >
            <SettingOutlined />
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}

function ClassicSidebar({
  pageKey,
  onNavigate,
}: {
  pageKey: PageKey;
  onNavigate: (key: PageKey) => void;
}): React.ReactElement {
  return (
    <aside className="classic-sidebar" aria-label="主导航">
      <div className="classic-sidebar-brand">
        <div className="classic-brand-mark">
          <AppLogo />
        </div>
        <div className="classic-brand-copy">
          <strong>DevEnv Manager</strong>
          <span>Windows</span>
        </div>
      </div>
      <nav className="classic-sidebar-nav">
        {navItems.map((item) => (
          <button
            className={pageKey === item.key ? "classic-sidebar-item classic-sidebar-item-active" : "classic-sidebar-item"}
            type="button"
            key={item.key}
            aria-current={pageKey === item.key ? "page" : undefined}
            onClick={() => onNavigate(item.key)}
          >
            <span className="classic-sidebar-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="classic-sidebar-footer">
        <button
          className={pageKey === "settings" ? "classic-sidebar-item classic-sidebar-item-active" : "classic-sidebar-item"}
          type="button"
          aria-current={pageKey === "settings" ? "page" : undefined}
          onClick={() => onNavigate("settings")}
        >
          <span className="classic-sidebar-icon">
            <SettingOutlined />
          </span>
          <span>设置</span>
        </button>
      </div>
    </aside>
  );
}

export default function App(): React.ReactElement {
  const [pageKey, setPageKey] = useState<PageKey>("dashboard");
  const config = useConfigStore((state) => state.config);
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
    const navigate = ((event: CustomEvent<PageKey>): void => {
      const page = event.detail;

      if (page) {
        setPageKey(page);
      }
    }) as EventListener;

    window.addEventListener("env-manager:navigate", navigate);
    return () => window.removeEventListener("env-manager:navigate", navigate);
  }, []);

  const { themeStyle } = useUiStore();
  const navigationLayout = config?.appearance?.navigationLayout ?? "sidebar";
  const themeDefinition = getThemeDefinition(themeStyle);

  useEffect(() => {
    document.body.classList.remove(...themeBodyClasses);
    document.body.classList.add(themeDefinition.bodyClass);
  }, [themeDefinition.bodyClass]);

  const themeConfig = useMemo(() => {
    return {
      token: {
        ...themeDefinition.token,
      },
      components: {
        Button: {
          borderRadius: 8,
        },
        Card: {
          borderRadiusLG: 8,
        },
      },
    };
  }, [themeDefinition]);

  return (
    <ConfigProvider theme={themeConfig}>
      <AntdApp>
        <div className={`app-shell app-shell-${navigationLayout}`}>
          {navigationLayout === "sidebar"
            ? (
                <ClassicSidebar pageKey={pageKey} onNavigate={setPageKey} />
              )
            : (
                <PageRail pageKey={pageKey} onNavigate={setPageKey} onOpenSettings={() => setPageKey("settings")} />
              )}
          <main className={pageKey === "settings" ? "shell-main shell-main-settings" : "shell-main"}>
            {pageKey !== "settings"
              ? (
                  <header className="app-header">
                    <div className="app-header-title">
                      <Typography.Title level={3}>{pageTitles[pageKey]}</Typography.Title>
                      <Typography.Text>DevEnv Manager</Typography.Text>
                    </div>
                    <HeaderStatus />
                  </header>
                )
              : null}
            <section className="app-content">
              <Suspense
                fallback={(
                  <div className="page-loading">
                    <Spin />
                  </div>
                )}
              >
                {renderPage(pageKey)}
              </Suspense>
            </section>
          </main>
        </div>
      </AntdApp>
    </ConfigProvider>
  );
}
