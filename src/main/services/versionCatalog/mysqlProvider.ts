import type { AppConfig, AvailableVersion } from "../../../shared/types";
import { getMirrorVersionNote } from "../../../shared/mirrorPresets";
import {
  compareVersionsDesc,
  createVersion,
  fetchText,
  getMirrorBaseUrl,
  getStaticVersions,
  maxVersionOptions,
  unique,
} from "./utils";

function getMySqlTrack(version: string): string {
  return version.split(".").slice(0, 2).join(".");
}

export async function listMySqlVersions(config: AppConfig): Promise<AvailableVersion[]> {
  const configuredMirror = config.mirrors.mysql.trim();
  const baseUrl = getMirrorBaseUrl(configuredMirror, "https://dev.mysql.com/downloads/mysql");
  const sourceNotes = getMirrorVersionNote("mysql", configuredMirror, "来自 MySQL Community Server 下载页");
  const staticVersions = getStaticVersions({ environment: "mysql", vendor: "community" });
  const pages = await Promise.all(
    ["", "8.4.html", "8.0.html"].map(async (page) => {
      const url = page ? `${baseUrl}/${page}` : `${baseUrl}/`;
      try {
        return await fetchText(url, config);
      } catch {
        return "";
      }
    }),
  );
  const versions = unique(
    [
      ...pages.flatMap((page) =>
        Array.from(page.matchAll(/mysql-(\d+\.\d+\.\d+)(?:-winx64)?\.zip/g), (match) => match[1]),
      ),
      ...staticVersions.map((version) => version.version),
    ],
  ).sort(compareVersionsDesc);

  return versions.slice(0, maxVersionOptions).map((version, index) =>
    createVersion(
      "mysql",
      "community",
      version,
      `MySQL ${version}${getMySqlTrack(version) === "8.4" ? " LTS" : ""}`,
      getMySqlTrack(version) === "8.4" ? "lts" : index === 0 ? "current" : "stable",
      "archive",
      sourceNotes,
    ),
  );
}
