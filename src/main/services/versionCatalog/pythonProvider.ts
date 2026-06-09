import type { AppConfig, AvailableVersion } from "../../../shared/types";
import { getMirrorVersionNote } from "../../../shared/mirrorPresets";
import {
  compareVersionsDesc,
  createVersion,
  fetchText,
  getMirrorBaseUrl,
  maxVersionOptions,
  unique,
} from "./utils";

export async function listPythonVersions(config: AppConfig): Promise<AvailableVersion[]> {
  const configuredMirror = config.mirrors.python.trim();
  const baseUrl = getMirrorBaseUrl(configuredMirror, "https://www.python.org/ftp/python");
  const sourceNotes = getMirrorVersionNote("python", configuredMirror, "来自 Python.org FTP 目录");
  const listing = await fetchText(`${baseUrl}/`, config);
  const versions = unique(
    Array.from(listing.matchAll(/href=["'](\d+\.\d+\.\d+)\/["']/g), (match) => match[1]).filter((version) =>
      version.startsWith("3."),
    ),
  ).sort(compareVersionsDesc);
  const latestPatchBySeries = versions.reduce<Map<string, string>>((latestVersions, version) => {
    const series = version.split(".").slice(0, 2).join(".");

    if (!latestVersions.has(series)) {
      latestVersions.set(series, version);
    }

    return latestVersions;
  }, new Map());
  const selectedVersions = Array.from(latestPatchBySeries.values()).slice(0, maxVersionOptions);
  const fallbackVersions = versions.slice(0, maxVersionOptions);

  return (selectedVersions.length > 0 ? selectedVersions : fallbackVersions).map((version, index) =>
    createVersion(
      "python",
      "cpython",
      version,
      `Python ${version}`,
      index === 0 ? "current" : "stable",
      "installer",
      sourceNotes,
    ),
  );
}
