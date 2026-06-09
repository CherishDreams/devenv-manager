import type { AppConfig, InstallTaskInput } from "../../../../shared/types";
import { getMirrorSourceName } from "../../../../shared/mirrorPresets";
import type { PackageResource } from "../types";

export function resolveNinjaResource(input: InstallTaskInput, config: AppConfig): PackageResource {
  if ((input.vendor ?? "ninja-build") !== "ninja-build") {
    throw new Error("当前自动安装暂只支持 Ninja Build 官方发行版。");
  }

  const configuredMirror = config.mirrors.ninja.trim();

  if (configuredMirror && configuredMirror !== "official") {
    return {
      url: `${configuredMirror.replace(/\/+$/, "")}/ninja-win.zip`,
      fileName: `ninja-${input.version}-win.zip`,
      packageType: "archive",
      resolvedVersion: input.version.replace(/^v/, ""),
      sourceName: getMirrorSourceName("ninja", configuredMirror, "Ninja GitHub Releases"),
    };
  }

  return {
    url: `https://github.com/ninja-build/ninja/releases/download/${input.version}/ninja-win.zip`,
    fileName: `ninja-${input.version}-win.zip`,
    packageType: "archive",
    resolvedVersion: input.version.replace(/^v/, ""),
    sourceName: "Ninja GitHub Releases",
  };
}
