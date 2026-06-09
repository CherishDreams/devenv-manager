import type { AppConfig, InstallTaskInput } from "../../../../shared/types";
import { getMirrorSourceName } from "../../../../shared/mirrorPresets";
import type { PackageResource } from "../types";

export function resolveDotnetResource(input: InstallTaskInput, config: AppConfig): PackageResource {
  if ((input.vendor ?? "microsoft") !== "microsoft") {
    throw new Error("当前自动安装暂只支持 Microsoft .NET SDK。");
  }

  const fileName = `dotnet-sdk-${input.version}-win-x64.zip`;
  const configuredMirror = config.mirrors.dotnet.trim();
  const baseUrl =
    configuredMirror && configuredMirror !== "official" ? configuredMirror.replace(/\/+$/, "") : "https://dotnetcli.azureedge.net/dotnet";

  return {
    url: `${baseUrl}/Sdk/${input.version}/${fileName}`,
    fileName,
    packageType: "archive",
    resolvedVersion: input.version,
    sourceName: getMirrorSourceName("dotnet", configuredMirror, ".NET 官方源"),
  };
}
