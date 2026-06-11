import type { InstallRecord } from "@shared/types";
import type { TableColumnsType } from "antd";
import { DeleteOutlined, PlayCircleOutlined } from "@ant-design/icons";
import { Button, Popconfirm, Space, Tag, Typography } from "antd";

export function createInstallColumns(
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
            onConfirm={() => void uninstallRecord(record)}
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
