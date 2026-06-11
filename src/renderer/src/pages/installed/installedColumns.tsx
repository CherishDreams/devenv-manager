import type { InstallRecord } from "@shared/types";
import type { TableColumnsType } from "antd";
import { DeleteOutlined, PlayCircleOutlined } from "@ant-design/icons";
import { Button, Popconfirm, Space, Tag, Typography } from "antd";

export function createInstalledColumns(
  activeByKind: Record<string, string | undefined>,
  switchActive: (record: InstallRecord) => Promise<void>,
  uninstallRecord: (record: InstallRecord) => Promise<void>,
): TableColumnsType<InstallRecord> {
  return [
    {
      title: "版本",
      dataIndex: "version",
      key: "version",
      width: 180,
      render: (version: string, record) => (
        <div className="installed-version-cell">
          <Typography.Text strong className="installed-version-text">
            {version}
          </Typography.Text>
          <span className="installed-version-tags">
            {record.active ? <Tag color="green">当前</Tag> : null}
            {record.ownership && record.ownership !== "managed" ? <Tag color="orange">接管</Tag> : null}
          </span>
        </div>
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
      title: "操作",
      key: "actions",
      width: 190,
      render: (_, record) => {
        const deletesDirectory = record.uninstallPolicy === "delete-directory";
        const actionText = deletesDirectory ? "卸载" : "移除";

        return (
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
              title={deletesDirectory ? "卸载环境" : "移除接管记录"}
              description={
                deletesDirectory
                  ? `删除 ${record.name} ${record.version}，并清理匹配的环境变量？`
                  : `仅从本程序移除 ${record.name} ${record.version} 的接管记录，不删除原目录。`
              }
              okText={actionText}
              okButtonProps={{ danger: true }}
              cancelText="取消"
              onConfirm={() => void uninstallRecord(record)}
            >
              <Button danger size="small" icon={<DeleteOutlined />}>
                {actionText}
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];
}
