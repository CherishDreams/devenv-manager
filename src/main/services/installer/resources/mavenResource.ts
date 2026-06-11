import type { AppConfig, InstallTaskInput } from "../../../../shared/types";
import type { PackageResource } from "../types";
import { getMirrorSourceName } from "../../../../shared/mirrorPresets";
import { fetchText } from "../network";

export async function resolveMavenResource(
  input: InstallTaskInput,
  config: AppConfig,
  signal: AbortSignal,
): Promise<PackageResource> {
  const configuredMirror = config.mirrors.maven.trim();
  const repositoryBaseUrl
    = configuredMirror && configuredMirror !== "official"
      ? configuredMirror.replace(/\/+$/, "")
      : "https://repo.maven.apache.org/maven2";
  const metadata = await fetchText(
    `${repositoryBaseUrl}/org/apache/maven/apache-maven/maven-metadata.xml`,
    config,
    signal,
  );
  const versions = Array.from(metadata.matchAll(/<version>([^<]+)<\/version>/g), (match) => match[1]);
  const version = versions.filter((item) => item === input.version || item.startsWith(`${input.version}.`)).at(-1);

  if (!version) {
    throw new Error(`未找到 Maven ${input.version} 的发布版本。`);
  }

  return {
    url: `${repositoryBaseUrl}/org/apache/maven/apache-maven/${version}/apache-maven-${version}-bin.zip`,
    fileName: `apache-maven-${version}-bin.zip`,
    packageType: "archive",
    resolvedVersion: version,
    sourceName: getMirrorSourceName("maven", configuredMirror, "Maven Central"),
  };
}
