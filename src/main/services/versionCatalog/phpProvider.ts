import type { AppConfig, AvailableVersion } from "../../../shared/types";
import { compareVersionsDesc, createVersion, fetchText, getStaticVersionsWithMirrorNote, maxVersionOptions, unique } from "./utils";

export async function listPhpVersions(config: AppConfig): Promise<AvailableVersion[]> {
  const configuredMirror = config.mirrors.php.trim();

  if (configuredMirror && configuredMirror !== "official") {
    return getStaticVersionsWithMirrorNote({ environment: "php", vendor: "windows" }, configuredMirror);
  }

  const page = await fetchText("https://windows.php.net/downloads/releases/", config);
  const versions = unique(
    Array.from(page.matchAll(/php-(\d+\.\d+\.\d+)-Win32-vs\d+-x64\.zip/g), (match) => match[1]),
  ).sort(compareVersionsDesc);

  return versions.slice(0, maxVersionOptions).map((version, index) =>
    createVersion("php", "windows", version, `PHP ${version}`, index === 0 ? "current" : "stable", "archive"),
  );
}
