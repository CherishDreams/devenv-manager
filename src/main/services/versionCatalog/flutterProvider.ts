import type { AppConfig, AvailableVersion } from "../../../shared/types";
import { createVersion, fetchJson, getStaticVersionsWithMirrorNote, maxVersionOptions } from "./utils";

interface FlutterReleaseManifest {
  releases: Array<{
    version: string;
    channel: string;
    archive: string;
  }>;
}

export async function listFlutterVersions(config: AppConfig): Promise<AvailableVersion[]> {
  if (config.mirrors.flutter.trim() && config.mirrors.flutter.trim() !== "official") {
    return getStaticVersionsWithMirrorNote({ environment: "flutter", vendor: "google" }, config.mirrors.flutter);
  }

  const manifest = await fetchJson<FlutterReleaseManifest>(
    "https://storage.googleapis.com/flutter_infra_release/releases/releases_windows.json",
    config,
  );

  return manifest.releases
    .filter((release) => release.channel === "stable" && release.archive.endsWith(".zip"))
    .slice(0, maxVersionOptions)
    .map((release, index) =>
      createVersion(
        "flutter",
        "google",
        release.version,
        `Flutter ${release.version}`,
        index === 0 ? "current" : "stable",
        "archive",
      ),
    );
}
