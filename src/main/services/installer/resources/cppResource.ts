import type { AppConfig, InstallTaskInput } from "../../../../shared/types";
import type { PackageResource } from "../types";
import { getMirrorSourceName } from "../../../../shared/mirrorPresets";

export function resolveCppResource(input: InstallTaskInput, config: AppConfig): PackageResource {
  const vendor = input.vendor ?? "llvm-mingw";

  if (vendor !== "llvm-mingw") {
    throw new Error("当前自动安装暂只支持 LLVM-MinGW。");
  }

  const fileName = `llvm-mingw-${input.version}-ucrt-x86_64.zip`;
  const configuredMirror = config.mirrors.cpp.trim();

  if (configuredMirror && configuredMirror !== "official") {
    const baseUrl = configuredMirror.replace(/\/+$/, "");
    return {
      url: `${baseUrl}/${fileName}`,
      fileName,
      packageType: "archive",
      resolvedVersion: input.version,
      sourceName: getMirrorSourceName("cpp", configuredMirror, "LLVM-MinGW GitHub Releases"),
    };
  }

  return {
    url: `https://github.com/mstorsjo/llvm-mingw/releases/download/${input.version}/${fileName}`,
    fileName,
    packageType: "archive",
    resolvedVersion: input.version,
    sourceName: "LLVM-MinGW GitHub Releases",
  };
}
