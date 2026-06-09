import type { AppConfig, AvailableVersion } from "../../../shared/types";
import { getMirrorSourceName, isOfficialMirrorValue } from "../../../shared/mirrorPresets";
import { createVersion, fetchJsonFromSources, maxVersionOptions, unique } from "./utils";

interface GoRelease {
  version: string;
  stable?: boolean;
  files: Array<{
    filename: string;
    os: string;
    arch: string;
    kind: string;
  }>;
}

function getGoDownloadSource(name: string, baseUrl: string): { name: string; url: string } {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const downloadBaseUrl = normalizedBaseUrl.endsWith("/dl") ? normalizedBaseUrl : `${normalizedBaseUrl}/dl`;
  return {
    name,
    url: `${downloadBaseUrl}/?mode=json&include=all`,
  };
}

export async function listGoVersions(config: AppConfig): Promise<AvailableVersion[]> {
  const configuredMirror = config.mirrors.go.trim();
  const configuredSource = isOfficialMirrorValue(configuredMirror)
    ? []
    : [getGoDownloadSource(getMirrorSourceName("go", configuredMirror, "Go 官方源"), configuredMirror)];
  const { data: releases, source } = await fetchJsonFromSources<GoRelease[]>(
    [
      ...configuredSource,
      getGoDownloadSource("Go 官方源", "https://go.dev"),
      getGoDownloadSource("Go 中国镜像", "https://golang.google.cn"),
    ],
    config,
  );
  const minorVersions = unique(
    releases
      .filter((release) => release.stable !== false)
      .filter((release) =>
        release.files.some((file) => file.os === "windows" && file.arch === "amd64" && file.kind === "archive"),
      )
      .map((release) => release.version.replace(/^go/, "").split(".").slice(0, 2).join(".")),
  );
  const sourceNotes = `来自 ${source.name}`;

  return minorVersions.slice(0, maxVersionOptions).map((version) =>
    createVersion("go", "golang", version, `Go ${version}`, "stable", "archive", sourceNotes),
  );
}
