import type { AppConfig, AvailableVersion } from "../../../shared/types";
import { createVersion, fetchJson, getStaticVersionsWithMirrorNote, type GitHubRelease, maxVersionOptions } from "./utils";

function getRubyInstallerVersion(tagName: string): string {
  return tagName.replace(/^RubyInstaller-/, "");
}

export async function listRubyVersions(config: AppConfig): Promise<AvailableVersion[]> {
  if (config.mirrors.ruby.trim() && config.mirrors.ruby.trim() !== "official") {
    return getStaticVersionsWithMirrorNote({ environment: "ruby", vendor: "rubyinstaller" }, config.mirrors.ruby);
  }

  const releases = await fetchJson<GitHubRelease[]>(
    "https://api.github.com/repos/oneclick/rubyinstaller2/releases?per_page=40",
    config,
  );

  return releases
    .filter((release) => !release.draft && !release.prerelease)
    .filter((release) => release.assets.some((asset) => /^rubyinstaller-devkit-.+-x64\.exe$/i.test(asset.name)))
    .slice(0, maxVersionOptions)
    .map((release, index) => {
      const version = getRubyInstallerVersion(release.tag_name);
      return createVersion(
        "ruby",
        "rubyinstaller",
        version,
        `RubyInstaller ${version}`,
        index === 0 ? "current" : "stable",
        "installer",
      );
    });
}
