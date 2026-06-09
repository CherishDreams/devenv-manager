import type { AppConfig, InstallTaskInput } from "../../../../shared/types";
import { getMirrorSourceName } from "../../../../shared/mirrorPresets";
import type { PackageResource } from "../types";

export function resolveFlutterResource(input: InstallTaskInput, config: AppConfig): PackageResource {
  if ((input.vendor ?? "google") !== "google") {
    throw new Error("当前自动安装暂只支持 Flutter 官方 SDK。");
  }

  const fileName = `flutter_windows_${input.version}-stable.zip`;
  const configuredMirror = config.mirrors.flutter.trim();
  const baseUrl =
    configuredMirror && configuredMirror !== "official"
      ? configuredMirror.replace(/\/+$/, "")
      : "https://storage.googleapis.com/flutter_infra_release/releases/stable/windows";

  return {
    url: `${baseUrl}/${fileName}`,
    fileName,
    packageType: "archive",
    resolvedVersion: input.version,
    sourceName: getMirrorSourceName("flutter", configuredMirror, "Flutter 官方源"),
  };
}
