import type { AppConfig, InstallTaskInput } from "../../../../shared/types";
import type { PackageResource } from "../types";
import { getMirrorSourceName } from "../../../../shared/mirrorPresets";

export function resolveLuaResource(input: InstallTaskInput, config: AppConfig): PackageResource {
  const vendor = input.vendor ?? "luabinaries";

  if (vendor !== "luabinaries") {
    throw new Error("当前自动安装暂只支持 LuaBinaries。");
  }

  const fileName = `lua-${input.version}_Win64_bin.zip`;
  const configuredMirror = config.mirrors.lua.trim();
  const baseUrl =
    configuredMirror && configuredMirror !== "official"
      ? configuredMirror.replace(/\/+$/, "")
      : `https://sourceforge.net/projects/luabinaries/files/${input.version}/Tools%20Executables`;

  return {
    url: `${baseUrl}/${fileName}${configuredMirror && configuredMirror !== "official" ? "" : "/download"}`,
    fileName,
    packageType: "archive",
    resolvedVersion: input.version,
    sourceName: getMirrorSourceName("lua", configuredMirror, "LuaBinaries SourceForge"),
  };
}
