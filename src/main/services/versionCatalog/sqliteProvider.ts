import type { AppConfig, AvailableVersion } from "../../../shared/types";
import { createVersion, fetchText, getStaticVersionsWithMirrorNote, maxVersionOptions, unique } from "./utils";

function sqliteCodeToVersion(code: string): string {
  const major = Number.parseInt(code.slice(0, 1), 10);
  const minor = Number.parseInt(code.slice(1, 3), 10);
  const patch = Number.parseInt(code.slice(3, 5), 10);
  return `${major}.${minor}.${patch}`;
}

export async function listSqliteVersions(config: AppConfig): Promise<AvailableVersion[]> {
  if (config.mirrors.sqlite.trim() && config.mirrors.sqlite.trim() !== "official") {
    return getStaticVersionsWithMirrorNote({ environment: "sqlite", vendor: "sqlite" }, config.mirrors.sqlite);
  }

  const page = await fetchText("https://www.sqlite.org/download.html", config);
  const codes = unique(Array.from(page.matchAll(/sqlite-tools-win-x64-(\d+)\.zip/g), (match) => match[1]));

  return codes.slice(0, maxVersionOptions).map((code, index) => {
    const version = sqliteCodeToVersion(code);
    return createVersion("sqlite", "sqlite", code, `SQLite ${version}`, index === 0 ? "current" : "stable", "archive");
  });
}
