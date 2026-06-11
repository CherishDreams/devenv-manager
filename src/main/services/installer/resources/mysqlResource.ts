import type { AppConfig, InstallTaskInput } from "../../../../shared/types";
import type { PackageResource } from "../types";
import { getMirrorSourceName } from "../../../../shared/mirrorPresets";

function getMySqlTrack(version: string): string {
  return version.split(".").slice(0, 2).join(".");
}

export function resolveMySqlResource(input: InstallTaskInput, config: AppConfig): PackageResource {
  const vendor = input.vendor ?? "community";

  if (vendor !== "community") {
    throw new Error("当前自动安装暂只支持 MySQL Community Server。");
  }

  const fileName = `mysql-${input.version}-winx64.zip`;
  const configuredMirror = config.mirrors.mysql.trim();
  const baseUrl
    = configuredMirror && configuredMirror !== "official"
      ? configuredMirror.replace(/\/+$/, "")
      : "https://cdn.mysql.com/Downloads";

  return {
    url: `${baseUrl}/MySQL-${getMySqlTrack(input.version)}/${fileName}`,
    fileName,
    packageType: "archive",
    resolvedVersion: input.version,
    sourceName: getMirrorSourceName("mysql", configuredMirror, "MySQL CDN"),
  };
}
