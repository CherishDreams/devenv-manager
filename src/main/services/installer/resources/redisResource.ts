import type { AppConfig, InstallTaskInput } from "../../../../shared/types";
import { getMirrorSourceName } from "../../../../shared/mirrorPresets";
import type { PackageResource } from "../types";

export function resolveRedisResource(input: InstallTaskInput, config: AppConfig): PackageResource {
  if ((input.vendor ?? "redis-windows") !== "redis-windows") {
    throw new Error("当前自动安装暂只支持 Redis Windows 发行版。");
  }

  const fileName = `Redis-x64-${input.version}.zip`;
  const configuredMirror = config.mirrors.redis.trim();

  if (configuredMirror && configuredMirror !== "official") {
    return {
      url: `${configuredMirror.replace(/\/+$/, "")}/${fileName}`,
      fileName,
      packageType: "archive",
      resolvedVersion: input.version,
      sourceName: getMirrorSourceName("redis", configuredMirror, "Redis Windows GitHub Releases"),
    };
  }

  return {
    url: `https://github.com/tporadowski/redis/releases/download/v${input.version}/${fileName}`,
    fileName,
    packageType: "archive",
    resolvedVersion: input.version,
    sourceName: "Redis Windows GitHub Releases",
  };
}
