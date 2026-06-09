import type { AppConfig, AvailableVersion } from "../../../shared/types";
import { createVersion, fetchJson, getStaticVersionsWithMirrorNote, type GitHubRelease, maxVersionOptions } from "./utils";

function isCMakeWindowsAsset(name: string, version: string): boolean {
  return name === `cmake-${version}-windows-x86_64.zip`;
}

export async function listCMakeVersions(config: AppConfig): Promise<AvailableVersion[]> {
  if (config.mirrors.cmake.trim() && config.mirrors.cmake.trim() !== "official") {
    return getStaticVersionsWithMirrorNote({ environment: "cmake", vendor: "kitware" }, config.mirrors.cmake);
  }

  const releases = await fetchJson<GitHubRelease[]>("https://api.github.com/repos/Kitware/CMake/releases?per_page=40", config);

  return releases
    .filter((release) => !release.draft && !release.prerelease)
    .map((release) => release.tag_name.replace(/^v/, ""))
    .filter((version, index, versions) => versions.indexOf(version) === index)
    .filter((version) => releases.some((release) => release.assets.some((asset) => isCMakeWindowsAsset(asset.name, version))))
    .slice(0, maxVersionOptions)
    .map((version, index) =>
      createVersion("cmake", "kitware", version, `CMake ${version}`, index === 0 ? "current" : "stable", "archive"),
    );
}
