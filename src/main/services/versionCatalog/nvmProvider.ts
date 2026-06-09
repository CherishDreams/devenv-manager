import type { AppConfig, AvailableVersion } from "../../../shared/types";
import { createVersion, fetchJson, getStaticVersionsWithMirrorNote, type GitHubRelease, maxVersionOptions } from "./utils";

export async function listNvmVersions(config: AppConfig): Promise<AvailableVersion[]> {
  if (config.mirrors.nvm.trim() && config.mirrors.nvm.trim() !== "official") {
    return getStaticVersionsWithMirrorNote({ environment: "nvm", vendor: "coreybutler" }, config.mirrors.nvm);
  }

  const releases = await fetchJson<GitHubRelease[]>(
    "https://api.github.com/repos/coreybutler/nvm-windows/releases?per_page=30",
    config,
  );

  return releases
    .filter((release) => !release.draft && !release.prerelease)
    .filter((release) => release.assets.some((asset) => asset.name === "nvm-noinstall.zip"))
    .slice(0, maxVersionOptions)
    .map((release) => {
      const version = release.tag_name.replace(/^v/, "");
      return createVersion(
        "nvm",
        "coreybutler",
        version,
        `nvm-windows ${version}`,
        "stable",
        "archive",
        "来自 GitHub Releases API",
      );
    });
}
