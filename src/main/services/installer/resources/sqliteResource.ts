import type { AppConfig, InstallTaskInput } from "../../../../shared/types";
import type { PackageResource } from "../types";
import { getMirrorSourceName } from "../../../../shared/mirrorPresets";

export function resolveSqliteResource(input: InstallTaskInput, config: AppConfig): PackageResource {
  if ((input.vendor ?? "sqlite") !== "sqlite") {
    throw new Error("当前自动安装暂只支持 SQLite Tools。");
  }

  const fileName = `sqlite-tools-win-x64-${input.version}.zip`;
  const configuredMirror = config.mirrors.sqlite.trim();
  const baseUrl =
    configuredMirror && configuredMirror !== "official"
      ? configuredMirror.replace(/\/+$/, "")
      : `https://www.sqlite.org/${new Date().getFullYear()}`;

  return {
    url: `${baseUrl}/${fileName}`,
    fileName,
    packageType: "archive",
    resolvedVersion: input.version,
    sourceName: getMirrorSourceName("sqlite", configuredMirror, "SQLite 官方源"),
  };
}
