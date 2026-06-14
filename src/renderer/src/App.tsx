import type React from "react";
import type { TaskStatus } from "@shared/types";
import {
  AppstoreOutlined,
  BellOutlined,
  BgColorsOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DashboardOutlined,
  FileTextOutlined,
  SettingOutlined,
  StopOutlined,
  SyncOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { App as AntdApp, Badge, Button, ConfigProvider, Popover, Progress, Spin, Switch, Tag, Tooltip, Typography } from "antd";
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
const InstalledEnvironmentsPage = lazy(() =>
  import("./pages/InstalledEnvironmentsPage").then((mod) => ({ default: mod.InstalledEnvironmentsPage })),
);
const EnvironmentsPage = lazy(() =>
  import("./pages/EnvironmentsPage").then((mod) => ({ default: mod.EnvironmentInstallPage })),
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((mod) => ({ default: mod.SettingsPage })),
);
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
      return <SettingsPage key="settings" />;
    case "dashboard":
    default:
      return <DashboardPage />;
  }
}

const taskStatusMeta: Record<TaskStatus, { text: string; color: string; icon: React.ReactNode }> = {
  queued: { text: "排队中", color: "default", icon: <ClockCircleOutlined /> },
  running: { text: "运行中", color: "processing", icon: <SyncOutlined spin /> },
  succeeded: { text: "成功", color: "success", icon: <CheckCircleOutlined /> },
  failed: { text: "失败", color: "error", icon: <CloseCircleOutlined /> },
  cancelled: { text: "已取消", color: "default", icon: <StopOutlined /> },
};

function TaskPopoverContent(): React.ReactElement {
  const tasks = useTaskStore((state) => state.tasks);

  const displayTasks = useMemo(() => {
    const active = tasks.filter((t) => t.status === "running" || t.status === "queued");
    const recent = tasks
      .filter((t) => t.status !== "running" && t.status !== "queued")
      .slice(0, 3);
    return [...active, ...recent].slice(0, 8);
  }, [tasks]);

  const navigateToLogs = () => {
    window.dispatchEvent(new CustomEvent("env-manager:navigate", { detail: "logs" }));
  };

  if (displayTasks.length === 0) {
    return (
      <div className="task-popover-content">
        <div className="task-popover-empty">暂无任务</div>
        <button className="task-popover-link" onClick={navigateToLogs} type="button">
          查看日志
        </button>
      </div>
    );
  }

  return (
    <div className="task-popover-content">
      <ul className="task-popover-list">
        {displayTasks.map((task) => {
          const meta = taskStatusMeta[task.status];
          return (
            <li key={task.id} className="task-popover-item">
              <div className="task-popover-item-header">
                <span className="task-popover-item-title">{task.title}</span>
                <Tag icon={meta.icon} color={meta.color} bordered={false} style={{ marginRight: 0 }}>
                  {meta.text}
                </Tag>
              </div>
              {task.status === "running" && task.progress > 0 && (
                <Progress
                  percent={Math.round(task.progress)}
                  size="small"
                  showInfo={false}
                  strokeColor="var(--primary-color)"
                  style={{ marginTop: 4 }}
                />
              )}
              {task.status === "running" && task.download && !task.download.completed && (
                <div className="task-popover-item-download">
                  {task.download.percent != null
                    ? `下载中 ${Math.round(task.download.percent)}%`
                    : "下载中…"}
                </div>
              )}
              {task.status === "failed" && task.logs.length > 0 && (
                <div className="task-popover-item-error">
                  {task.logs[task.logs.length - 1].message}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <button className="task-popover-link" onClick={navigateToLogs} type="button">
        查看全部日志
      </button>
    </div>
  );
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
      <Popover
        content={<TaskPopoverContent />}
        trigger="click"
        placement="bottomRight"
        overlayClassName="task-popover"
        arrow={false}
      >
        <Tooltip title="任务列表">
          <Badge count={runningTaskCount} size="small">
            <Button icon={<BellOutlined />} />
          </Badge>
        </Tooltip>
      </Popover>
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
            className={
              pageKey === item.key ? "classic-sidebar-item classic-sidebar-item-active" : "classic-sidebar-item"
            }
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
          className={
            pageKey === "settings" ? "classic-sidebar-item classic-sidebar-item-active" : "classic-sidebar-item"
          }
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

export function App(): React.ReactElement {
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
          {navigationLayout === "sidebar" ? (
            <ClassicSidebar pageKey={pageKey} onNavigate={setPageKey} />
          ) : (
            <PageRail pageKey={pageKey} onNavigate={setPageKey} onOpenSettings={() => setPageKey("settings")} />
          )}
          <main className={pageKey === "settings" ? "shell-main shell-main-settings" : "shell-main"}>
            {pageKey !== "settings" ? (
              <header className="app-header">
                <div className="app-header-title">
                  <Typography.Title level={3}>{pageTitles[pageKey]}</Typography.Title>
                  <Typography.Text>DevEnv Manager</Typography.Text>
                </div>
                <HeaderStatus />
              </header>
            ) : null}
            <section className="app-content">
              <Suspense
                fallback={
                  <div className="page-loading">
                    <Spin />
                  </div>
                }
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
