import type { EnvironmentDefinition } from "@shared/types";
import type React from "react";
import { SaveOutlined } from "@ant-design/icons";
import { getErrorMessage } from "@shared/errorUtils";
import {
  customMirrorPresetId,
  getMirrorDisplayName,
  getMirrorPresets,
  getMirrorSelection,
  normalizeMirrorValue,
  officialMirrorValue,
} from "@shared/mirrorPresets";
import { Alert, App as AntdApp, Button, Input, Select, Space, Switch, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";

interface MirrorSourceControlProps {
  definition: EnvironmentDefinition;
  savedMirrorValue?: string;
  isSaving: boolean;
  onApply: (value: string) => Promise<void>;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value);
}

export function MirrorSourceControl({
  definition,
  savedMirrorValue,
  isSaving,
  onApply,
}: MirrorSourceControlProps): React.ReactElement {
  const { message } = AntdApp.useApp();
  const presets = useMemo(() => getMirrorPresets(definition.id), [definition.id]);
  const [isEnabled, setIsEnabled] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState(officialMirrorValue);
  const [customMirrorUrl, setCustomMirrorUrl] = useState("");

  useEffect(() => {
    const selection = getMirrorSelection(definition.id, savedMirrorValue);
    setIsEnabled(selection.enabled);
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
  const pendingMirrorValue = !isEnabled
    ? officialMirrorValue
    : selectedPresetId === customMirrorPresetId
      ? customMirrorUrl.trim()
      : selectedPreset?.value ?? officialMirrorValue;
  const normalizedSavedValue = normalizeMirrorValue(savedMirrorValue);
  const normalizedPendingValue = normalizeMirrorValue(pendingMirrorValue);
  const isDirty = normalizedSavedValue !== normalizedPendingValue;
  const showCustomInput = isEnabled && selectedPresetId === customMirrorPresetId;

  const handleToggleEnabled = (nextEnabled: boolean): void => {
    setIsEnabled(nextEnabled);

    if (!nextEnabled) {
      setSelectedPresetId(officialMirrorValue);
      setCustomMirrorUrl("");
      return;
    }

    const firstMirrorPreset = presets.find((preset) => ![officialMirrorValue, customMirrorPresetId].includes(preset.id));
    setSelectedPresetId(firstMirrorPreset?.id ?? customMirrorPresetId);
  };

  const handleApply = async (): Promise<void> => {
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
      message.error(getErrorMessage(error));
    }
  };

  return (
    <div className="operation-section mirror-source-section">
      <div className="operation-section-title">
        <Typography.Title level={5}>下载源</Typography.Title>
        <Typography.Text type="secondary">
          当前：
          {getMirrorDisplayName(definition.id, savedMirrorValue)}
        </Typography.Text>
      </div>

      <Space direction="vertical" size={12} className="full-width">
        <div className="mirror-source-row">
          <Space>
            <Switch checked={isEnabled} onChange={handleToggleEnabled} />
            <Typography.Text strong>{isEnabled ? "使用镜像源" : "使用官方源"}</Typography.Text>
          </Space>
          <Button icon={<SaveOutlined />} loading={isSaving} disabled={!isDirty} onClick={() => void handleApply()}>
            应用下载源
          </Button>
        </div>

        {isEnabled
          ? (
              <>
                <Select
                  value={selectedPresetId}
                  options={presetOptions}
                  onChange={setSelectedPresetId}
                  className="full-width"
                  optionFilterProp="label"
                  showSearch
                />
                {showCustomInput
                  ? (
                      <Input
                        value={customMirrorUrl}
                        onChange={(event) => setCustomMirrorUrl(event.target.value)}
                        placeholder="https://mirror.example.com/path"
                      />
                    )
                  : null}
              </>
            )
          : (
              <Alert type="info" showIcon message="当前环境将使用默认官方源获取版本和下载安装包。" />
            )}
      </Space>
    </div>
  );
}
