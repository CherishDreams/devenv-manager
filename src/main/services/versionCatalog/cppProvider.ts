import type { AppConfig, AvailableVersion } from "../../../shared/types";
import type { GitHubRelease } from "./utils";
import { createVersion, fetchJson, getStaticVersionsWithMirrorNote, maxVersionOptions } from "./utils";

function isLlvmMingwAsset(name: string): boolean {
  return /^llvm-mingw-\d+-ucrt-x86_64\.zip$/i.test(name);
}

export async function listCppVersions(config: AppConfig): Promise<AvailableVersion[]> {
  if (config.mirrors.cpp.trim() && config.mirrors.cpp.trim() !== "official") {
    return getStaticVersionsWithMirrorNote({ environment: "cpp", vendor: "llvm-mingw" }, config.mirrors.cpp);
  }

  const releases = await fetchJson<GitHubRelease[]>(
    "https://api.github.com/repos/mstorsjo/llvm-mingw/releases?per_page=40",
    config,
  );

  return releases
    .filter((release) => !release.draft && !release.prerelease)
    .filter((release) => release.assets.some((asset) => isLlvmMingwAsset(asset.name)))
    .slice(0, maxVersionOptions)
    .map((release) =>
      createVersion(
        "cpp",
        "llvm-mingw",
        release.tag_name,
        `LLVM-MinGW ${release.tag_name}`,
        "stable",
        "archive",
        "来自 LLVM-MinGW GitHub Releases API",
      ),
    );
}
