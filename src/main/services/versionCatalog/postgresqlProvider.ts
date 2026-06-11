import type { AppConfig, AvailableVersion } from "../../../shared/types";
import { compareVersionsDesc, createVersion, fetchText, getStaticVersionsWithMirrorNote, maxVersionOptions, unique } from "./utils";

function getPostgresqlChannel(version: string, index: number): AvailableVersion["channel"] {
  const major = Number.parseInt(version.split(".")[0], 10);

  if (major >= 18 && index === 0) {
    return "current";
  }

  return [17, 16, 15, 14, 13].includes(major) ? "stable" : "current";
}

function parsePostgresqlWindowsVersions(page: string): string[] {
  const versions = Array.from(
    page.matchAll(/Version\s*(?:<!-- -->)?([\d.]+)<a href="[^"]+"><img alt="Windows x86-64"/g),
    (match) => match[1],
  );

  return unique(versions).sort(compareVersionsDesc);
}

export async function listPostgresqlVersions(config: AppConfig): Promise<AvailableVersion[]> {
  if (config.mirrors.postgresql.trim() && config.mirrors.postgresql.trim() !== "official") {
    return getStaticVersionsWithMirrorNote({ environment: "postgresql", vendor: "edb" }, config.mirrors.postgresql);
  }

  const page = await fetchText("https://www.enterprisedb.com/download-postgresql-binaries", config);
  const versions = parsePostgresqlWindowsVersions(page);

  return versions.slice(0, maxVersionOptions).map((version, index) =>
    createVersion(
      "postgresql",
      "edb",
      version,
      `PostgreSQL ${version}`,
      getPostgresqlChannel(version, index),
      "archive",
      "来自 EDB PostgreSQL Binaries 下载页",
    ),
  );
}
