import type { EnvironmentDefinition, EnvironmentKind, InstallRecord, ManagedTask } from "@shared/types";
import type React from "react";
import {
  AppstoreOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DatabaseOutlined,
  FolderOpenOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { Button, Descriptions, Empty, Progress, Tag, Typography } from "antd";
import { useMemo } from "react";
import { EnvironmentLogo } from "../components/EnvironmentLogo";
import { useConfigStore } from "../stores/configStore";
import { useEnvironmentStore } from "../stores/environmentStore";
import { useSystemStore } from "../stores/systemStore";
import { useTaskStore } from "../stores/taskStore";

interface DashboardMetric {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent: string;
  note?: string;
}

const taskStatusLabels: Record<ManagedTask["status"], string> = {
  queued: "排队中",
  running: "运行中",
  succeeded: "成功",
  failed: "失败",
  cancelled: "已取消",
};

function MetricCard({ metric }: { metric: DashboardMetric }): React.ReactElement {
  return (
    <div className="dashboard-metric-card">
      <div className="dashboard-metric-icon" style={{ color: metric.accent }}>
        {metric.icon}
      </div>
      <div className="dashboard-metric-copy">
        <Typography.Text className="dashboard-metric-label">{metric.label}</Typography.Text>
        <Typography.Title level={2}>{metric.value}</Typography.Title>
        {metric.note ? <Typography.Text type="secondary">{metric.note}</Typography.Text> : null}
      </div>
    </div>
  );
}

function ActiveEnvironmentRow({
  record,
  definition,
}: {
  record: InstallRecord;
  definition?: EnvironmentDefinition;
}): React.ReactElement {
  return (
    <div className="dashboard-record-row">
      {definition ? <EnvironmentLogo definition={definition} /> : null}
      <div className="dashboard-record-main">
        <Typography.Text strong>{record.name}</Typography.Text>
        <Typography.Text type="secondary" ellipsis={{ tooltip: record.installPath }}>
          {record.installPath}
        </Typography.Text>
      </div>
      <Tag color="green">{record.version}</Tag>
    </div>
  );
}

function TaskRow({ task }: { task: ManagedTask }): React.ReactElement {
  const color = task.status === "failed" ? "red" : task.status === "running" ? "processing" : "default";

  return (
    <div className="dashboard-task-row">
      <div className="dashboard-task-main">
        <Typography.Text strong ellipsis={{ tooltip: task.title }}>
          {task.title}
        </Typography.Text>
        <Typography.Text type="secondary">{new Date(task.updatedAt).toLocaleString()}</Typography.Text>
      </div>
      <Progress percent={Math.round(task.progress)} size="small" showInfo={false} />
      <Tag color={color}>{taskStatusLabels[task.status]}</Tag>
    </div>
  );
}

export default function DashboardPage(): React.ReactElement {
  const config = useConfigStore((state) => state.config);
  const loadConfig = useConfigStore((state) => state.load);
  const status = useSystemStore((state) => state.status);
  const loadSystem = useSystemStore((state) => state.load);
  const summary = useEnvironmentStore((state) => state.summary);
  const loadEnvironment = useEnvironmentStore((state) => state.load);
  const tasks = useTaskStore((state) => state.tasks);
  const loadTasks = useTaskStore((state) => state.load);

  const definitionsById = useMemo(() => {
    return (summary?.definitions ?? []).reduce<Map<EnvironmentKind, EnvironmentDefinition>>(
      (definitions, definition) => {
        definitions.set(definition.id, definition);
        return definitions;
      },
      new Map(),
    );
  }, [summary?.definitions]);

  const activeRecords = useMemo(() => {
    const records = summary?.installations ?? [];
    return records.filter((record) => record.active);
  }, [summary?.installations]);

  const runningTaskCount = useMemo(() => tasks.filter((task) => task.status === "running").length, [tasks]);
  const failedTaskCount = useMemo(() => tasks.filter((task) => task.status === "failed").length, [tasks]);
  const recentTasks = useMemo(() => tasks.slice(0, 5), [tasks]);

  const metrics = useMemo<DashboardMetric[]>(() => {
    const installations = summary?.installations ?? [];
    const adoptedCount = installations.filter((record) => record.ownership === "adopted").length;

    return [
      {
        label: "已安装版本",
        value: installations.length,
        icon: <AppstoreOutlined />,
        accent: "#246bfe",
        note: adoptedCount > 0 ? `接管 ${adoptedCount}` : "本机记录",
      },
      {
        label: "当前激活",
        value: activeRecords.length,
        icon: <CheckCircleOutlined />,
        accent: "#10a36d",
        note: `${summary?.definitions.length ?? 0} 类环境`,
      },
      {
        label: "运行任务",
        value: runningTaskCount,
        icon: <PlayCircleOutlined />,
        accent: "#1677ff",
        note: "实时执行",
      },
      {
        label: "失败任务",
        value: failedTaskCount,
        icon: <CloseCircleOutlined />,
        accent: "#f5222d",
        note: "可在日志重试",
      },
      {
        label: "安装根目录",
        value: config?.globalInstallDir ? "已配置" : "-",
        icon: <FolderOpenOutlined />,
        accent: "#8b5cf6",
        note: config?.globalInstallDir ?? "未加载",
      },
    ];
  }, [
    activeRecords.length,
    config?.globalInstallDir,
    failedTaskCount,
    runningTaskCount,
    summary?.definitions.length,
    summary?.installations,
  ]);

  const refresh = async (): Promise<void> => {
    await Promise.all([loadConfig(), loadSystem(), loadEnvironment(), loadTasks()]);
  };

  return (
    <div className="dashboard-page">
      <div className="dashboard-toolbar">
        <div>
          <Typography.Title level={3}>开发环境状态</Typography.Title>
          <Typography.Text type="secondary">当前主机的工具链、版本和安装任务</Typography.Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void refresh()}>
          刷新
        </Button>
      </div>

      <div className="dashboard-metric-grid">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </div>

      <div className="dashboard-panel-grid">
        <section className="dashboard-panel">
          <div className="dashboard-panel-header">
            <div>
              <Typography.Title level={4}>当前激活环境</Typography.Title>
              <Typography.Text type="secondary">一键切换后的全局版本</Typography.Text>
            </div>
            <Tag color="green">{activeRecords.length} 个</Tag>
          </div>
          <div className="dashboard-record-list">
            {activeRecords.length > 0 ? (
              activeRecords
                .slice(0, 6)
                .map((record) => (
                  <ActiveEnvironmentRow
                    key={record.id}
                    record={record}
                    definition={definitionsById.get(record.environment)}
                  />
                ))
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无激活环境" />
            )}
          </div>
        </section>

        <section className="dashboard-panel">
          <div className="dashboard-panel-header">
            <div>
              <Typography.Title level={4}>最近任务</Typography.Title>
              <Typography.Text type="secondary">下载、安装和卸载执行状态</Typography.Text>
            </div>
            <Tag color={runningTaskCount > 0 ? "processing" : "default"}>
              运行中
              {runningTaskCount}
            </Tag>
          </div>
          <div className="dashboard-task-list">
            {recentTasks.length > 0 ? (
              recentTasks.map((task) => <TaskRow key={task.id} task={task} />)
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无任务" />
            )}
          </div>
        </section>
      </div>

      <section className="dashboard-panel dashboard-config-panel">
        <div className="dashboard-panel-header">
          <div>
            <Typography.Title level={4}>基础配置</Typography.Title>
            <Typography.Text type="secondary">安装目录、缓存和代理状态</Typography.Text>
          </div>
          <DatabaseOutlined />
        </div>
        <Descriptions column={3}>
          <Descriptions.Item label="全局安装目录">{config?.globalInstallDir ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="下载缓存目录">{config?.downloadCacheDir ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="系统盘">{status?.systemDrive ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="架构">{status?.arch ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="代理">{config?.proxy.enabled ? "已启用" : "未启用"}</Descriptions.Item>
          <Descriptions.Item label="保留安装包">{config?.retainDownloads ? "是" : "否"}</Descriptions.Item>
        </Descriptions>
      </section>
    </div>
  );
}
