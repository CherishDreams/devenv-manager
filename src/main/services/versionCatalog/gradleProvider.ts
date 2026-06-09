import type { AppConfig, AvailableVersion } from "../../../shared/types";
import { createVersion, fetchJson, getMirrorBaseUrl, getStaticVersionsWithMirrorNote, maxVersionOptions } from "./utils";

interface GradleRelease {
  version: string;
  snapshot: boolean;
  nightly: boolean;
  releaseNightly: boolean;
  rcFor?: string;
  activeRc: boolean;
}

export async function listGradleVersions(config: AppConfig): Promise<AvailableVersion[]> {
  if (config.mirrors.gradle.trim() && config.mirrors.gradle.trim() !== "official") {
    return getStaticVersionsWithMirrorNote({ environment: "gradle", vendor: "gradle" }, config.mirrors.gradle);
  }

  const releases = await fetchJson<GradleRelease[]>("https://services.gradle.org/versions/all", config);

  return releases
    .filter((release) => !release.snapshot && !release.nightly && !release.releaseNightly && !release.rcFor && !release.activeRc)
    .slice(0, maxVersionOptions)
    .map((release, index) =>
      createVersion("gradle", "gradle", release.version, `Gradle ${release.version}`, index === 0 ? "current" : "stable", "archive"),
    );
}

export function getGradleDistributionBaseUrl(config: AppConfig): string {
  return getMirrorBaseUrl(config.mirrors.gradle, "https://services.gradle.org/distributions");
}
