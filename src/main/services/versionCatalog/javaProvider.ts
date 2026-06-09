import type { AppConfig, AvailableVersion, VersionCatalogQuery } from "../../../shared/types";
import { createVersion, fetchJson, fetchText, getStaticVersions, maxVersionOptions, unique } from "./utils";

interface AdoptiumAvailableReleases {
  available_lts_releases: number[];
  available_releases: number[];
  most_recent_feature_release: number;
}

interface ZuluPackage {
  java_version: number[];
  name: string;
}

interface LibericaRelease {
  featureVersion: number;
  GA: boolean;
  LTS: boolean;
  packageType: string;
  version: string;
}

const javaMajorCandidates = Array.from({ length: 27 }, (_, index) => 30 - index);

function isPlainZuluPackage(item: ZuluPackage): boolean {
  return !item.name.includes("-fx-") && !item.name.includes("-crac-");
}

export function listJavaVersions(query: VersionCatalogQuery, config: AppConfig): Promise<AvailableVersion[]> {
  switch (query.vendor) {
    case "temurin":
      return listTemurinVersions(config);
    case "zulu":
      return listZuluVersions(config);
    case "liberica":
      return listLibericaVersions(config);
    case "oracle":
      return listOracleVersions(config);
    default:
      return Promise.resolve(getStaticVersions(query));
  }
}

async function listTemurinVersions(config: AppConfig): Promise<AvailableVersion[]> {
  const releases = await fetchJson<AdoptiumAvailableReleases>(
    "https://api.adoptium.net/v3/info/available_releases",
    config,
  );
  const ltsReleases = new Set(releases.available_lts_releases);
  const majors = unique(releases.available_releases.slice().sort((left, right) => right - left));

  return majors.slice(0, maxVersionOptions).map((major) =>
    createVersion(
      "java",
      "temurin",
      String(major),
      `JDK ${major}${ltsReleases.has(major) ? " LTS" : ""}`,
      major === releases.most_recent_feature_release ? "current" : ltsReleases.has(major) ? "lts" : "stable",
      "archive",
      "来自 Adoptium 在线版本接口",
    ),
  );
}

async function listZuluVersions(config: AppConfig): Promise<AvailableVersion[]> {
  const packages = await fetchJson<ZuluPackage[]>(
    "https://api.azul.com/metadata/v1/zulu/packages/?os=windows&arch=x64&java_package_type=jdk&archive_type=zip&release_status=ga&availability_types=CA&page=1&page_size=1000",
    config,
  );
  const latestByMajor = new Map<number, ZuluPackage>();

  packages.filter(isPlainZuluPackage).forEach((item) => {
    const major = item.java_version[0];

    if (!latestByMajor.has(major)) {
      latestByMajor.set(major, item);
    }
  });

  return Array.from(latestByMajor.entries())
    .sort(([left], [right]) => right - left)
    .slice(0, maxVersionOptions)
    .map(([major, item], index) =>
      createVersion(
        "java",
        "zulu",
        String(major),
        `Zulu JDK ${major}`,
        [21, 17, 11, 8].includes(major) ? "lts" : index === 0 ? "current" : "stable",
        "archive",
        `最新补丁版本 ${item.java_version.join(".")}，来自 Azul Metadata API`,
      ),
    );
}

async function listLibericaVersions(config: AppConfig): Promise<AvailableVersion[]> {
  const releases = (
    await Promise.all(
      javaMajorCandidates.map(async (major) => {
        try {
          const result = await fetchJson<LibericaRelease[]>(
            `https://api.bell-sw.com/v1/liberica/releases?version-feature=${major}&version-modifier=latest&bitness=64&release-type=all&os=windows&arch=x86&package-type=zip&bundle-type=jdk`,
            config,
          );
          return result.find((item) => item.GA && item.packageType === "zip");
        } catch {
          return undefined;
        }
      }),
    )
  ).filter((item): item is LibericaRelease => Boolean(item));

  return releases
    .sort((left, right) => right.featureVersion - left.featureVersion)
    .slice(0, maxVersionOptions)
    .map((release, index) =>
      createVersion(
        "java",
        "liberica",
        String(release.featureVersion),
        `Liberica JDK ${release.featureVersion}`,
        release.LTS ? "lts" : index === 0 ? "current" : "stable",
        "archive",
        `最新补丁版本 ${release.version}，来自 BellSoft Product Discovery API`,
      ),
    );
}

async function listOracleVersions(config: AppConfig): Promise<AvailableVersion[]> {
  const page = await fetchText("https://www.oracle.com/java/technologies/downloads/", config);
  const majors = unique(
    Array.from(
      page.matchAll(/https:\/\/download\.oracle\.com\/java\/(\d+)\/latest\/jdk-\1_windows-x64_bin\.zip/g),
      (match) => Number.parseInt(match[1], 10),
    ),
  )
    .filter((major) => !Number.isNaN(major))
    .sort((left, right) => right - left);

  return majors.slice(0, maxVersionOptions).map((major, index) =>
    createVersion(
      "java",
      "oracle",
      String(major),
      `Oracle JDK ${major}`,
      [21, 17, 11, 8].includes(major) ? "lts" : index === 0 ? "current" : "stable",
      "archive",
      "来自 Oracle Java 下载页",
    ),
  );
}
