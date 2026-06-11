import type { AppConfig, AvailableVersion, VersionCatalogQuery } from "../../../shared/types";
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

export async function listCondaVersions(query: VersionCatalogQuery, config: AppConfig): Promise<AvailableVersion[]> {
  const configuredMirror = config.mirrors.conda.trim();
  const baseUrl = getMirrorBaseUrl(configuredMirror, "https://repo.anaconda.com");

  if (query.vendor === "anaconda") {
    const listing = await fetchText(`${baseUrl}/archive/`, config);
    const versions = unique(
      Array.from(listing.matchAll(/Anaconda3-(\d{4}\.\d+(?:-\d+)?)-Windows-x86_64\.exe/g), (match) => match[1]),
    ).sort(compareVersionsDesc);

    return (versions.length > 0 ? versions.slice(0, maxVersionOptions) : ["latest"]).map((version) =>
      createVersion(
        "conda",
        "anaconda",
        version,
        version === "latest" ? "Anaconda Distribution" : `Anaconda ${version}`,
        "stable",
        "installer",
        getMirrorVersionNote("conda", configuredMirror, "来自 Anaconda archive 目录"),
      ),
    );
  }

  if (query.vendor === "miniconda") {
    const listing = await fetchText(`${baseUrl}/miniconda/`, config);
    const versions = unique(
      Array.from(
        listing.matchAll(/Miniconda3-(py\d+_\d+\.\d+\.\d+(?:-\d+)?)-Windows-x86_64\.exe/g),
        (match) => match[1],
      ),
    ).sort(compareVersionsDesc);

    return (versions.length > 0 ? versions.slice(0, maxVersionOptions) : ["latest"]).map((version) =>
      createVersion(
        "conda",
        "miniconda",
        version,
        version === "latest" ? "Miniconda 最新版" : `Miniconda ${version}`,
        "stable",
        "installer",
        getMirrorVersionNote("conda", configuredMirror, "来自 Anaconda miniconda 目录"),
      ),
    );
  }

  return getStaticVersions(query);
}
