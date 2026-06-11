import type { AppConfig, AvailableVersion } from "../../../shared/types";
import { createVersion, fetchJson, getStaticVersionsWithMirrorNote, maxVersionOptions } from "./utils";

interface DotnetReleaseIndex {
  "releases-index": Array<{
    "channel-version": string;
    "support-phase": string;
    "release-type": string;
    "releases.json": string;
  }>;
}

interface DotnetReleases {
  releases: Array<{
    sdk: {
      version: string;
    };
  }>;
}

export async function listDotnetVersions(config: AppConfig): Promise<AvailableVersion[]> {
  if (config.mirrors.dotnet.trim() && config.mirrors.dotnet.trim() !== "official") {
    return getStaticVersionsWithMirrorNote({ environment: "dotnet", vendor: "microsoft" }, config.mirrors.dotnet);
  }

  const index = await fetchJson<DotnetReleaseIndex>(
    "https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json",
    config,
  );
  const channels = index["releases-index"].slice(0, 8);
  const channelReleases = await Promise.all(
    channels.map(async (channel) => ({
      channel,
      data: await fetchJson<DotnetReleases>(channel["releases.json"], config),
    })),
  );

  return channelReleases
    .flatMap(({ channel, data }) =>
      data.releases
        .slice(0, 4)
        .map((release) =>
          createVersion(
            "dotnet",
            "microsoft",
            release.sdk.version,
            `.NET SDK ${release.sdk.version}${channel["release-type"].toLowerCase() === "lts" ? " LTS" : ""}`,
            channel["release-type"].toLowerCase() === "lts"
              ? "lts"
              : channel["support-phase"] === "active"
                ? "stable"
                : "current",
            "archive",
            `${channel["channel-version"]} ${channel["support-phase"]}`,
          ),
        ),
    )
    .slice(0, maxVersionOptions);
}
