import type { AppConfig, AvailableVersion } from "../../../shared/types";
import { getMirrorVersionNote } from "../../../shared/mirrorPresets";
import { compareVersionsDesc, createVersion, fetchText, getMirrorBaseUrl, maxVersionOptions } from "./utils";

export async function listMavenVersions(config: AppConfig): Promise<AvailableVersion[]> {
  const configuredMirror = config.mirrors.maven.trim();
  const repositoryBaseUrl = getMirrorBaseUrl(configuredMirror, "https://repo.maven.apache.org/maven2");
  const metadata = await fetchText(
    `${repositoryBaseUrl}/org/apache/maven/apache-maven/maven-metadata.xml`,
    config,
  );
  const versions = Array.from(metadata.matchAll(/<version>(3\.\d+\.\d+)<\/version>/g), (match) => match[1])
    .sort(compareVersionsDesc)
    .slice(0, maxVersionOptions);

  return versions.map((version) =>
    createVersion(
      "maven",
      "apache",
      version,
      `Maven ${version}`,
      "stable",
      "archive",
      getMirrorVersionNote("maven", configuredMirror, "来自 Maven Central metadata"),
    ),
  );
}
