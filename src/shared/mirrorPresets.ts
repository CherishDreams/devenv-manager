import type { EnvironmentKind, MirrorSettings } from "./types";

export const officialMirrorValue = "official";
export const customMirrorPresetId = "custom";

export interface MirrorPreset {
  id: string;
  name: string;
  value: string;
  description?: string;
}

const officialPreset: MirrorPreset = {
  id: officialMirrorValue,
  name: "官方源",
  value: officialMirrorValue,
  description: "使用项目默认下载源",
};

const customPreset: MirrorPreset = {
  id: customMirrorPresetId,
  name: "自定义 URL",
  value: customMirrorPresetId,
  description: "手动输入与当前安装器兼容的基础地址",
};

const stableMirrorPresets: Partial<Record<EnvironmentKind, MirrorPreset[]>> = {
  python: [
    {
      id: "huaweicloud",
      name: "华为云 Python",
      value: "https://mirrors.huaweicloud.com/python",
      description: "Python FTP 镜像目录",
    },
  ],
  conda: [
    {
      id: "tuna",
      name: "清华 TUNA Anaconda",
      value: "https://mirrors.tuna.tsinghua.edu.cn/anaconda",
      description: "Anaconda archive 与 Miniconda 镜像目录",
    },
  ],
  go: [
    {
      id: "golang-cn",
      name: "Go 中国镜像",
      value: "https://golang.google.cn",
      description: "Go 官方中国镜像",
    },
  ],
  node: [
    {
      id: "npmmirror",
      name: "npmmirror Node.js",
      value: "https://npmmirror.com/mirrors/node",
      description: "Node.js dist 镜像目录",
    },
  ],
  flutter: [
    {
      id: "flutter-cn",
      name: "Flutter 中国镜像",
      value: "https://storage.flutter-io.cn/flutter_infra_release/releases/stable/windows",
      description: "Flutter Windows stable 压缩包镜像目录",
    },
  ],
};

export const officialMirrorSettings: MirrorSettings = {
  java: officialMirrorValue,
  python: officialMirrorValue,
  conda: officialMirrorValue,
  go: officialMirrorValue,
  node: officialMirrorValue,
  nvm: officialMirrorValue,
  maven: officialMirrorValue,
  gradle: officialMirrorValue,
  cmake: officialMirrorValue,
  ninja: officialMirrorValue,
  cpp: officialMirrorValue,
  lua: officialMirrorValue,
  rust: officialMirrorValue,
  dotnet: officialMirrorValue,
  php: officialMirrorValue,
  ruby: officialMirrorValue,
  flutter: officialMirrorValue,
  android: officialMirrorValue,
  mysql: officialMirrorValue,
  postgresql: officialMirrorValue,
  mongodb: officialMirrorValue,
  redis: officialMirrorValue,
  sqlite: officialMirrorValue,
};

export interface MirrorSelection {
  enabled: boolean;
  presetId: string;
  customValue: string;
}

export function createOfficialMirrorSettings(): MirrorSettings {
  return { ...officialMirrorSettings };
}

export function normalizeMirrorValue(value: string | undefined): string {
  const normalizedValue = value?.trim();
  return normalizedValue || officialMirrorValue;
}

export function isOfficialMirrorValue(value: string | undefined): boolean {
  return normalizeMirrorValue(value) === officialMirrorValue;
}

export function getMirrorPresets(environment: EnvironmentKind): MirrorPreset[] {
  return [officialPreset, ...(stableMirrorPresets[environment] ?? []), customPreset];
}

export function getMirrorSelection(environment: EnvironmentKind, value: string | undefined): MirrorSelection {
  const normalizedValue = normalizeMirrorValue(value);

  if (normalizedValue === officialMirrorValue) {
    return {
      enabled: false,
      presetId: officialMirrorValue,
      customValue: "",
    };
  }

  const matchedPreset = getMirrorPresets(environment).find((preset) => preset.value === normalizedValue);

  return {
    enabled: true,
    presetId: matchedPreset?.id ?? customMirrorPresetId,
    customValue: matchedPreset ? "" : normalizedValue,
  };
}

export function getMirrorDisplayName(environment: EnvironmentKind, value: string | undefined): string {
  const normalizedValue = normalizeMirrorValue(value);
  const matchedPreset = getMirrorPresets(environment).find((preset) => preset.value === normalizedValue);

  return matchedPreset?.name ?? "自定义 URL";
}

export function getMirrorSourceName(
  environment: EnvironmentKind,
  value: string | undefined,
  officialSourceName: string,
): string {
  return isOfficialMirrorValue(value) ? officialSourceName : getMirrorDisplayName(environment, value);
}

export function getMirrorVersionNote(
  environment: EnvironmentKind,
  value: string | undefined,
  officialNote: string,
): string {
  return isOfficialMirrorValue(value) ? officialNote : `来自 ${getMirrorDisplayName(environment, value)}`;
}

export function appendMirrorVersionNote(
  environment: EnvironmentKind,
  value: string | undefined,
  baseNote: string | undefined,
): string | undefined {
  if (isOfficialMirrorValue(value)) {
    return baseNote;
  }

  const mirrorNote = `下载源为 ${getMirrorDisplayName(environment, value)}`;
  return baseNote ? `${baseNote}；${mirrorNote}` : mirrorNote;
}

export function getConfiguredMirrorEntries(mirrors: MirrorSettings): Array<{
  environment: EnvironmentKind;
  value: string;
  displayName: string;
}> {
  return (Object.keys(mirrors) as EnvironmentKind[]).flatMap((environment) => {
    const value = mirrors[environment];
    const normalizedValue = normalizeMirrorValue(value);

    if (normalizedValue === officialMirrorValue) {
      return [];
    }

    return [
      {
        environment,
        value: normalizedValue,
        displayName: getMirrorDisplayName(environment, normalizedValue),
      },
    ];
  });
}
