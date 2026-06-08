import { CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, StopOutlined, SyncOutlined } from "@ant-design/icons";
import { App as AntdApp, Badge, Button, Card, Empty, List, Progress, Space, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import type React from "react";
import { useMemo, useState } from "react";
import type { ManagedTask, TaskDownloadProgress, TaskStatus } from "@shared/types";
import { useTaskStore } from "../stores/taskStore";

const statusMeta: Record<TaskStatus, { text: string; color: string; icon: React.ReactNode }> = {
  queued: {
    text: "排队中",
    color: "default",
    icon: <ClockCircleOutlined />,
  },
  running: {
    text: "运行中",
    color: "processing",
    icon: <SyncOutlined spin />,
  },
  succeeded: {
    text: "成功",
    color: "success",
    icon: <CheckCircleOutlined />,
  },
  failed: {
    text: "失败",
    color: "error",
    icon: <CloseCircleOutlined />,
  },
  cancelled: {
    text: "已取消",
    color: "warning",
    icon: <CloseCircleOutlined />,
  },
};

function StatusTag({ status }: { status: TaskStatus }): React.ReactElement {
  const meta = statusMeta[status];
  return (
    <Tag icon={meta.icon} color={meta.color}>
      {meta.text}
    </Tag>
  );
}

function formatBytes(value?: number): string {
  if (typeof value !== "number") {
    return "未知";
  }

  if (value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let nextValue = value;
  let unitIndex = 0;

  while (nextValue >= 1024 && unitIndex < units.length - 1) {
    nextValue /= 1024;
    unitIndex += 1;
  }

  const precision = nextValue >= 100 || unitIndex === 0 ? 0 : 1;
  return `${nextValue.toFixed(precision)} ${units[unitIndex]}`;
}

function formatSpeed(value: number): string {
  if (value <= 0) {
    return "计算中";
  }

  return `${formatBytes(value)}/s`;
}

function DownloadSummary({ download, compact = false }: { download?: TaskDownloadProgress; compact?: boolean }): React.ReactElement {
  if (!download) {
    return <Typography.Text type="secondary">-</Typography.Text>;
  }

  const speedLabel = download.completed ? "" : formatSpeed(download.bytesPerSecond);
  const received = formatBytes(download.receivedBytes);
  const total = formatBytes(download.totalBytes);
  const sizeLabel = download.totalBytes ? `${received} / ${total}` : `${received} / 未知大小`;
  const percent = download.percent ?? 0;

  return (
    <div className={compact ? "download-summary download-summary-compact" : "download-summary"}>
      {speedLabel ? <Typography.Text type="secondary">{speedLabel}</Typography.Text> : null}
      <Progress percent={percent} size="small" status={download.completed ? "success" : "active"} />
      <Typography.Text type="secondary">{sizeLabel}</Typography.Text>
    </div>
  );
}

export default function LogsPage(): React.ReactElement {
  const tasks = useTaskStore((state) => state.tasks);
  const loading = useTaskStore((state) => state.loading);
  const cancel = useTaskStore((state) => state.cancel);
  const { message } = AntdApp.useApp();
  const [selectedTaskId, setSelectedTaskId] = useState<string>();

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? tasks[0],
    [selectedTaskId, tasks],
  );

  const columns = useMemo<TableColumnsType<ManagedTask>>(
    () => [
      {
        title: "任务",
        dataIndex: "title",
        key: "title",
      },
      {
        title: "状态",
        dataIndex: "status",
        key: "status",
        width: 130,
        render: (status: TaskStatus) => <StatusTag status={status} />,
      },
      {
        title: "进度",
        dataIndex: "progress",
        key: "progress",
        width: 160,
        render: (progress: number) => <Progress percent={progress} size="small" />,
      },
      {
        title: "下载",
        dataIndex: "download",
        key: "download",
        width: 220,
        render: (download: TaskDownloadProgress | undefined) => <DownloadSummary download={download} compact />,
      },
      {
        title: "更新时间",
        dataIndex: "updatedAt",
        key: "updatedAt",
        width: 220,
        render: (value: string) => new Date(value).toLocaleString(),
      },
      {
        title: "操作",
        key: "actions",
        width: 120,
        render: (_, record) => {
          const cancellable = record.status === "queued" || record.status === "running";

          return (
            <Button
              danger
              size="small"
              icon={<StopOutlined />}
              disabled={!cancellable}
              onClick={(event) => {
                event.stopPropagation();
                void cancel(record.id).then(() => message.success("任务已取消"));
              }}
            >
              取消
            </Button>
          );
        },
      },
    ],
    [cancel, message],
  );

  return (
    <div className="page-stack">
      <div className="page-title-row">
        <div>
          <Typography.Title level={3}>日志</Typography.Title>
          <Typography.Text type="secondary">任务执行记录</Typography.Text>
        </div>
        <Badge count={tasks.length} />
      </div>

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={tasks}
        pagination={false}
        onRow={(record) => ({
          onClick: () => setSelectedTaskId(record.id),
        })}
      />

      <Card title={selectedTask?.title ?? "日志详情"}>
        {selectedTask ? (
          <div className="task-detail-stack">
            <DownloadSummary download={selectedTask.download} />
            <List
              dataSource={selectedTask.logs}
              renderItem={(entry) => (
                <List.Item>
                  <Space>
                    <Tag color={entry.level === "error" ? "red" : entry.level === "warn" ? "orange" : "blue"}>
                      {entry.level}
                    </Tag>
                    <Typography.Text type="secondary">{new Date(entry.at).toLocaleString()}</Typography.Text>
                    <Typography.Text>{entry.message}</Typography.Text>
                  </Space>
                </List.Item>
              )}
            />
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无日志" />
        )}
      </Card>
    </div>
  );
}
