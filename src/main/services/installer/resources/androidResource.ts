import type { AppConfig, InstallTaskInput } from "../../../../shared/types";
import { getMirrorSourceName } from "../../../../shared/mirrorPresets";
import type { PackageResource } from "../types";

export function resolveAndroidResource(input: InstallTaskInput, config: AppConfig): PackageResource {
  if ((input.vendor ?? "google") !== "google") {
    throw new Error("当前自动安装暂只支持 Android Command Line Tools。");
  }

  const fileName = `commandlinetools-win-${input.version}_latest.zip`;
  const configuredMirror = config.mirrors.android.trim();
  const baseUrl =
    configuredMirror && configuredMirror !== "official"
      ? configuredMirror.replace(/\/+$/, "")
      : "https://dl.google.com/android/repository";

  return {
    url: `${baseUrl}/${fileName}`,
    fileName,
    packageType: "archive",
    resolvedVersion: input.version,
    sourceName: getMirrorSourceName("android", configuredMirror, "Android 官方源"),
  };
}
