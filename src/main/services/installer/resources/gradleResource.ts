import type { AppConfig, InstallTaskInput } from "../../../../shared/types";
import type { PackageResource } from "../types";
import { getMirrorSourceName } from "../../../../shared/mirrorPresets";
import { getGradleDistributionBaseUrl } from "../../versionCatalog/gradleProvider";

export function resolveGradleResource(input: InstallTaskInput, config: AppConfig): PackageResource {
  if ((input.vendor ?? "gradle") !== "gradle") {
    throw new Error("当前自动安装暂只支持 Gradle 官方发行版。");
  }

  const fileName = `gradle-${input.version}-bin.zip`;

  return {
    url: `${getGradleDistributionBaseUrl(config)}/${fileName}`,
    fileName,
    packageType: "archive",
    resolvedVersion: input.version,
    sourceName: getMirrorSourceName("gradle", config.mirrors.gradle, "Gradle 官方源"),
  };
}
