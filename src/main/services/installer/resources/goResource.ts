import type { AppConfig, InstallTaskInput } from "../../../../shared/types";
import type { PackageResource } from "../types";
import { getMirrorSourceName, isOfficialMirrorValue } from "../../../../shared/mirrorPresets";
import { fetchJsonFromSources } from "../network";

interface GoRelease {
  version: string;
  files: Array<{
    filename: string;
    os: string;
    arch: string;
    kind: string;
  }>;
}

function getGoDownloadSource(name: string, baseUrl: string): { name: string; url: string; downloadBaseUrl: string } {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const downloadBaseUrl = normalizedBaseUrl.endsWith("/dl") ? normalizedBaseUrl : `${normalizedBaseUrl}/dl`;

  return {
    name,
    url: `${downloadBaseUrl}/?mode=json&include=all`,
    downloadBaseUrl,
  };
}

export async function resolveGoResource(
  input: InstallTaskInput,
  config: AppConfig,
  signal: AbortSignal,
): Promise<PackageResource> {
  const configuredMirror = config.mirrors.go.trim();
  const configuredSource = isOfficialMirrorValue(configuredMirror)
    ? []
    : [getGoDownloadSource(getMirrorSourceName("go", configuredMirror, "Go 官方源"), configuredMirror)];
  const sources = [
    ...configuredSource,
    getGoDownloadSource("Go 官方源", "https://go.dev"),
    getGoDownloadSource("Go 中国镜像", "https://golang.google.cn"),
  ];
  const { data: releases, source } = await fetchJsonFromSources<GoRelease[]>(sources, config, signal);
  const release = releases.find(
    (item) => item.version === `go${input.version}` || item.version.startsWith(`go${input.version}.`),
  );
  const file = release?.files.find((item) => item.os === "windows" && item.arch === "amd64" && item.kind === "archive");

  if (!release || !file) {
    throw new Error(`未找到 Go ${input.version} 的 Windows x64 压缩包。`);
  }

  return {
    url: `${source.downloadBaseUrl}/${file.filename}`,
    fileName: file.filename,
    packageType: "archive",
    resolvedVersion: release.version.replace(/^go/, ""),
    sourceName: source.name,
  };
}
