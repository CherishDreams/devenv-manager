import { SaveOutlined } from "@ant-design/icons";
import { Alert, App as AntdApp, Button, Input, Select, Space, Switch, Typography } from "antd";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  customMirrorPresetId,
  getMirrorDisplayName,
  getMirrorPresets,
  getMirrorSelection,
  normalizeMirrorValue,
  officialMirrorValue,
} from "@shared/mirrorPresets";
import type { EnvironmentDefinition } from "@shared/types";

interface MirrorSourceControlProps {
  definition: EnvironmentDefinition;
  savedMirrorValue?: string;
  saving: boolean;
  onApply: (value: string) => Promise<void>;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value);
}

export function MirrorSourceControl({
  definition,
  savedMirrorValue,
  saving,
  onApply,
}: MirrorSourceControlProps): React.ReactElement {
  const { message } = AntdApp.useApp();
  const presets = useMemo(() => getMirrorPresets(definition.id), [definition.id]);
  const [enabled, setEnabled] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState(officialMirrorValue);
  const [customMirrorUrl, setCustomMirrorUrl] = useState("");

  useEffect(() => {
    const selection = getMirrorSelection(definition.id, savedMirrorValue);
    setEnabled(selection.enabled);
    setSelectedPresetId(selection.presetId);
    setCustomMirrorUrl(selection.customValue);
  }, [definition.id, savedMirrorValue]);

  const presetOptions = useMemo(
    () =>
      presets.map((preset) => ({
        label: preset.description ? `${preset.name} - ${preset.description}` : preset.name,
        value: preset.id,
      })),
    [presets],
  );

  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId);
  const pendingMirrorValue = !enabled
    ? officialMirrorValue
    : selectedPresetId === customMirrorPresetId
      ? customMirrorUrl.trim()
      : selectedPreset?.value ?? officialMirrorValue;
  const normalizedSavedValue = normalizeMirrorValue(savedMirrorValue);
  const normalizedPendingValue = normalizeMirrorValue(pendingMirrorValue);
  const dirty = normalizedSavedValue !== normalizedPendingValue;
  const showCustomInput = enabled && selectedPresetId === customMirrorPresetId;

  const toggleEnabled = (nextEnabled: boolean): void => {
    setEnabled(nextEnabled);

    if (!nextEnabled) {
      setSelectedPresetId(officialMirrorValue);
      setCustomMirrorUrl("");
      return;
    }

    const firstMirrorPreset = presets.find((preset) => ![officialMirrorValue, customMirrorPresetId].includes(preset.id));
    setSelectedPresetId(firstMirrorPreset?.id ?? customMirrorPresetId);
  };

  const apply = async (): Promise<void> => {
    if (showCustomInput && !customMirrorUrl.trim()) {
      message.warning("请输入自定义镜像源 URL");
      return;
    }

    if (showCustomInput && !isHttpUrl(customMirrorUrl.trim())) {
      message.warning("自定义镜像源需要以 http:// 或 https:// 开头");
      return;
    }

    try {
      await onApply(normalizedPendingValue);
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  return (
    <div className="operation-section mirror-source-section">
      <div className="operation-section-title">
        <Typography.Title level={5}>下载源</Typography.Title>
        <Typography.Text type="secondary">当前：{getMirrorDisplayName(definition.id, savedMirrorValue)}</Typography.Text>
      </div>

      <Space direction="vertical" size={12} className="full-width">
        <div className="mirror-source-row">
          <Space>
            <Switch checked={enabled} onChange={toggleEnabled} />
            <Typography.Text strong>{enabled ? "使用镜像源" : "使用官方源"}</Typography.Text>
          </Space>
          <Button icon={<SaveOutlined />} loading={saving} disabled={!dirty} onClick={() => void apply()}>
            应用下载源
          </Button>
        </div>

        {enabled ? (
          <>
            <Select
              value={selectedPresetId}
              options={presetOptions}
              onChange={setSelectedPresetId}
              className="full-width"
              optionFilterProp="label"
              showSearch
            />
            {showCustomInput ? (
              <Input
                value={customMirrorUrl}
                onChange={(event) => setCustomMirrorUrl(event.target.value)}
                placeholder="https://mirror.example.com/path"
              />
            ) : null}
          </>
        ) : (
          <Alert type="info" showIcon message="当前环境将使用默认官方源获取版本和下载安装包。" />
        )}
      </Space>
    </div>
  );
}
