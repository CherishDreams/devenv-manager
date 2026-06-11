import type { AppConfig, InstallTaskInput } from "../../../../shared/types";
import type { PackageResource } from "../types";
import { getMirrorSourceName } from "../../../../shared/mirrorPresets";

export function resolveRubyResource(input: InstallTaskInput, config: AppConfig): PackageResource {
  if ((input.vendor ?? "rubyinstaller") !== "rubyinstaller") {
    throw new Error("当前自动安装暂只支持 RubyInstaller。");
  }

  const fileName = `rubyinstaller-devkit-${input.version}-x64.exe`;
  const configuredMirror = config.mirrors.ruby.trim();

  if (configuredMirror && configuredMirror !== "official") {
    return {
      url: `${configuredMirror.replace(/\/+$/, "")}/${fileName}`,
      fileName,
      packageType: "installer",
      resolvedVersion: input.version,
      sourceName: getMirrorSourceName("ruby", configuredMirror, "RubyInstaller GitHub Releases"),
    };
  }

  return {
    url: `https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-${input.version}/${fileName}`,
    fileName,
    packageType: "installer",
    resolvedVersion: input.version,
    sourceName: "RubyInstaller GitHub Releases",
  };
}
