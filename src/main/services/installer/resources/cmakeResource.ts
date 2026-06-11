import type { AppConfig, InstallTaskInput } from "../../../../shared/types";
import type { PackageResource } from "../types";
import { getMirrorSourceName } from "../../../../shared/mirrorPresets";

export function resolveCMakeResource(input: InstallTaskInput, config: AppConfig): PackageResource {
  if ((input.vendor ?? "kitware") !== "kitware") {
    throw new Error("当前自动安装暂只支持 Kitware CMake。");
  }

  const fileName = `cmake-${input.version}-windows-x86_64.zip`;
  const configuredMirror = config.mirrors.cmake.trim();

  if (configuredMirror && configuredMirror !== "official") {
    const baseUrl = configuredMirror.replace(/\/+$/, "");
    return {
      url: `${baseUrl}/${fileName}`,
      fileName,
      packageType: "archive",
      resolvedVersion: input.version,
      sourceName: getMirrorSourceName("cmake", configuredMirror, "CMake GitHub Releases"),
    };
  }

  return {
    url: `https://github.com/Kitware/CMake/releases/download/v${input.version}/${fileName}`,
    fileName,
    packageType: "archive",
    resolvedVersion: input.version,
    sourceName: "CMake GitHub Releases",
  };
}
