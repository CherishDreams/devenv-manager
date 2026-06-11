import type { AppConfig, InstallTaskInput } from "../../../../shared/types";
import type { PackageResource } from "../types";
import { getMirrorSourceName } from "../../../../shared/mirrorPresets";

export function resolveCondaResource(input: InstallTaskInput, config: AppConfig): PackageResource {
  const vendor = input.vendor ?? "miniconda";
  const configuredMirror = config.mirrors.conda.trim();
  const baseUrl =
    configuredMirror && configuredMirror !== "official"
      ? configuredMirror.replace(/\/+$/, "")
      : "https://repo.anaconda.com";

  if (vendor === "anaconda") {
    const fileName =
      input.version === "latest"
        ? "Anaconda3-latest-Windows-x86_64.exe"
        : `Anaconda3-${input.version}-Windows-x86_64.exe`;

    return {
      url: `${baseUrl}/archive/${fileName}`,
      fileName,
      packageType: "installer",
      resolvedVersion: input.version,
      sourceName: getMirrorSourceName("conda", configuredMirror, "Anaconda 官方源"),
    };
  }

  const fileName =
    input.version === "latest" || /^py\d+$/.test(input.version)
      ? "Miniconda3-latest-Windows-x86_64.exe"
      : `Miniconda3-${input.version}-Windows-x86_64.exe`;

  return {
    url: `${baseUrl}/miniconda/${fileName}`,
    fileName,
    packageType: "installer",
    resolvedVersion: input.version,
    sourceName: getMirrorSourceName("conda", configuredMirror, "Anaconda 官方源"),
  };
}
