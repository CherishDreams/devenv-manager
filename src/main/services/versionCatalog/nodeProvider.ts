import type { AppConfig, AvailableVersion } from "../../../shared/types";
import { getMirrorVersionNote } from "../../../shared/mirrorPresets";
import { createVersion, fetchJson, getMirrorBaseUrl, maxVersionOptions } from "./utils";

interface NodeRelease {
  version: string;
  lts: false | string;
  files: string[];
}

export async function listNodeVersions(config: AppConfig): Promise<AvailableVersion[]> {
  const configuredMirror = config.mirrors.node.trim();
  const distBaseUrl = getMirrorBaseUrl(configuredMirror, "https://nodejs.org/dist");
  const sourceNotes = getMirrorVersionNote("node", configuredMirror, "来自 Node.js 官方 dist 目录");
  const releases = await fetchJson<NodeRelease[]>(`${distBaseUrl}/index.json`, config);
  const latestByMajor = new Map<string, NodeRelease>();

  releases
    .filter((release) => release.files.includes("win-x64-zip"))
    .forEach((release) => {
      const major = release.version.replace(/^v/, "").split(".")[0];

      if (!latestByMajor.has(major)) {
        latestByMajor.set(major, release);
      }
    });

  return Array.from(latestByMajor.entries())
    .slice(0, maxVersionOptions)
    .map(([major, release], index) =>
      createVersion(
        "node",
        "nodejs",
        major,
        `Node.js ${major}${release.lts ? " LTS" : ""}`,
        release.lts ? "lts" : index === 0 ? "current" : "stable",
        "archive",
        `最新补丁版本 ${release.version.replace(/^v/, "")}；${sourceNotes}`,
      ),
    );
}
