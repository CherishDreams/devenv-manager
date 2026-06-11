import type { AppConfig, AvailableVersion } from "../../../shared/types";
import type { GitHubRelease } from "./utils";
import {
  compareVersionsDesc,
  createVersion,
  fetchJson,
  getStaticVersionsWithMirrorNote,

  maxVersionOptions,
  unique,
} from "./utils";

export async function listLuaVersions(config: AppConfig): Promise<AvailableVersion[]> {
  if (config.mirrors.lua.trim() && config.mirrors.lua.trim() !== "official") {
    return getStaticVersionsWithMirrorNote({ environment: "lua", vendor: "luabinaries" }, config.mirrors.lua);
  }

  const releases = await fetchJson<GitHubRelease[]>("https://api.github.com/repos/lua/lua/releases?per_page=40", config);
  const versions = unique(
    releases
      .filter((release) => !release.draft && !release.prerelease)
      .map((release) => release.tag_name.replace(/^v/i, ""))
      .filter((version) => /^\d+\.\d+\.\d+$/.test(version)),
  ).sort(compareVersionsDesc);

  return versions.slice(0, maxVersionOptions).map((version, index) =>
    createVersion(
      "lua",
      "luabinaries",
      version,
      `Lua ${version}`,
      index === 0 ? "current" : "stable",
      "archive",
      "版本来自 Lua GitHub Releases，Windows 包来自 LuaBinaries",
    ),
  );
}
