import type { AppConfig, InstallTaskInput } from "../../../../shared/types";
import { getMirrorSourceName } from "../../../../shared/mirrorPresets";
import type { PackageResource } from "../types";

export function resolveMongoDbResource(input: InstallTaskInput, config: AppConfig): PackageResource {
  if ((input.vendor ?? "community") !== "community") {
    throw new Error("当前自动安装暂只支持 MongoDB Community Server。");
  }

  const fileName = `mongodb-windows-x86_64-${input.version}.zip`;
  const configuredMirror = config.mirrors.mongodb.trim();
  const baseUrl =
    configuredMirror && configuredMirror !== "official" ? configuredMirror.replace(/\/+$/, "") : "https://fastdl.mongodb.org/windows";

  return {
    url: `${baseUrl}/${fileName}`,
    fileName,
    packageType: "archive",
    resolvedVersion: input.version,
    sourceName: getMirrorSourceName("mongodb", configuredMirror, "MongoDB 官方源"),
  };
}
