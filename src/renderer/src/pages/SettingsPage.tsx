import { FolderOpenOutlined, SaveOutlined } from "@ant-design/icons";
import { App as AntdApp, Button, Card, Checkbox, Form, Input, Space, Typography } from "antd";
import type React from "react";
import { useEffect } from "react";
import type { AppConfig } from "@shared/types";
import { envManagerApi } from "../api/envManagerApi";
import { useConfigStore } from "../stores/configStore";

type ConfigFormValues = AppConfig;

function DirectoryInput({ onPick }: { onPick: () => void }): React.ReactElement {
  return (
    <Input
      addonAfter={
        <Button type="text" size="small" icon={<FolderOpenOutlined />} onClick={onPick} aria-label="选择目录" />
      }
    />
  );
}

export default function SettingsPage(): React.ReactElement {
  const [form] = Form.useForm<ConfigFormValues>();
  const { message } = AntdApp.useApp();
  const config = useConfigStore((state) => state.config);
  const update = useConfigStore((state) => state.update);
  const loading = useConfigStore((state) => state.loading);

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
    const values = await form.validateFields();
    await update(values);
    message.success("设置已保存");
  };

  return (
    <div className="page-stack narrow-page">
      <div className="page-title-row">
        <div>
          <Typography.Title level={3}>设置</Typography.Title>
          <Typography.Text type="secondary">安装目录、下载缓存、镜像源与代理</Typography.Text>
        </div>
        <Button type="primary" icon={<SaveOutlined />} loading={loading} onClick={() => void save()}>
          保存
        </Button>
      </div>

      <Form<ConfigFormValues> form={form} layout="vertical">
        <Card title="路径">
          <Form.Item name="globalInstallDir" label="全局安装目录" rules={[{ required: true, message: "请选择目录" }]}>
            <DirectoryInput onPick={() => void selectDirectory("globalInstallDir")} />
          </Form.Item>
          <Form.Item name="downloadCacheDir" label="下载缓存目录" rules={[{ required: true, message: "请选择目录" }]}>
            <DirectoryInput onPick={() => void selectDirectory("downloadCacheDir")} />
          </Form.Item>
          <Form.Item name="retainDownloads" valuePropName="checked">
            <Checkbox>保留安装包</Checkbox>
          </Form.Item>
        </Card>

        <Card title="代理">
          <Form.Item name={["proxy", "enabled"]} valuePropName="checked">
            <Checkbox>启用代理</Checkbox>
          </Form.Item>
          <Form.Item name={["proxy", "httpProxy"]} label="HTTP_PROXY">
            <Input placeholder="http://127.0.0.1:7890" />
          </Form.Item>
          <Form.Item name={["proxy", "httpsProxy"]} label="HTTPS_PROXY">
            <Input placeholder="http://127.0.0.1:7890" />
          </Form.Item>
        </Card>

        <Card title="镜像源">
          <Space direction="vertical" className="full-width" size={0}>
            <Form.Item name={["mirrors", "java"]} label="Java">
              <Input />
            </Form.Item>
            <Form.Item name={["mirrors", "go"]} label="Go">
              <Input />
            </Form.Item>
            <Form.Item name={["mirrors", "maven"]} label="Maven">
              <Input />
            </Form.Item>
            <Form.Item name={["mirrors", "conda"]} label="Conda">
              <Input />
            </Form.Item>
          </Space>
        </Card>
      </Form>
    </div>
  );
}
