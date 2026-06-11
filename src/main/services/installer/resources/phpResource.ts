import type { AppConfig, InstallTaskInput } from "../../../../shared/types";
import type { PackageResource } from "../types";
import { getMirrorSourceName } from "../../../../shared/mirrorPresets";

export function resolvePhpResource(input: InstallTaskInput, config: AppConfig): PackageResource {
  if ((input.vendor ?? "windows") !== "windows") {
    throw new Error("当前自动安装暂只支持 PHP for Windows。");
  }

  const configuredMirror = config.mirrors.php.trim();
  const baseUrl =
    configuredMirror && configuredMirror !== "official"
      ? configuredMirror.replace(/\/+$/, "")
      : "https://windows.php.net/downloads/releases";
  const fileName = `php-${input.version}-Win32-vs17-x64.zip`;

  return {
    url: `${baseUrl}/${fileName}`,
    fileName,
    packageType: "archive",
    resolvedVersion: input.version,
    sourceName: getMirrorSourceName("php", configuredMirror, "PHP for Windows"),
  };
}
