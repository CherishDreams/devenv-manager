import type { AppConfig, AvailableVersion } from "../../../shared/types";
import { createVersion, fetchJson, getStaticVersionsWithMirrorNote, type GitHubRelease, maxVersionOptions } from "./utils";

export async function listRedisVersions(config: AppConfig): Promise<AvailableVersion[]> {
  if (config.mirrors.redis.trim() && config.mirrors.redis.trim() !== "official") {
    return getStaticVersionsWithMirrorNote({ environment: "redis", vendor: "redis-windows" }, config.mirrors.redis);
  }

  const releases = await fetchJson<GitHubRelease[]>("https://api.github.com/repos/tporadowski/redis/releases?per_page=40", config);

  return releases
    .filter((release) => !release.draft && !release.prerelease)
    .filter((release) => release.assets.some((asset) => /^Redis-x64-.+\.zip$/i.test(asset.name)))
    .slice(0, maxVersionOptions)
    .map((release, index) => {
      const version = release.tag_name.replace(/^v/, "");
      return createVersion("redis", "redis-windows", version, `Redis Windows ${version}`, index === 0 ? "current" : "stable", "archive");
    });
}
