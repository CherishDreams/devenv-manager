import type { AppConfig, AvailableVersion } from "../../../shared/types";
import type { GitHubRelease } from "./utils";
import { createVersion, fetchJson, getStaticVersionsWithMirrorNote, maxVersionOptions } from "./utils";

export async function listNinjaVersions(config: AppConfig): Promise<AvailableVersion[]> {
  if (config.mirrors.ninja.trim() && config.mirrors.ninja.trim() !== "official") {
    return getStaticVersionsWithMirrorNote({ environment: "ninja", vendor: "ninja-build" }, config.mirrors.ninja);
  }

  const releases = await fetchJson<GitHubRelease[]>(
    "https://api.github.com/repos/ninja-build/ninja/releases?per_page=40",
    config,
  );

  return releases
    .filter((release) => !release.draft && !release.prerelease)
    .filter((release) => release.assets.some((asset) => asset.name === "ninja-win.zip"))
    .slice(0, maxVersionOptions)
    .map((release, index) =>
      createVersion(
        "ninja",
        "ninja-build",
        release.tag_name,
        `Ninja ${release.tag_name.replace(/^v/, "")}`,
        index === 0 ? "current" : "stable",
        "archive",
      ),
    );
}
