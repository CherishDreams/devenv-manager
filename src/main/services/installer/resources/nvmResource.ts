import type { AppConfig, InstallTaskInput } from "../../../../shared/types";
import type { PackageResource } from "../types";
import { getMirrorSourceName } from "../../../../shared/mirrorPresets";

export function resolveNvmResource(input: InstallTaskInput, config: AppConfig): PackageResource {
  const vendor = input.vendor ?? "coreybutler";

  if (vendor !== "coreybutler") {
    throw new Error("当前自动安装暂只支持 nvm-windows。");
  }

  const configuredMirror = config.mirrors.nvm.trim();
  const releaseBaseUrl =
    configuredMirror && configuredMirror !== "official"
      ? configuredMirror.replace(/\/+$/, "")
      : `https://github.com/coreybutler/nvm-windows/releases/download/${input.version}`;

  return {
    url: `${releaseBaseUrl}/nvm-noinstall.zip`,
    fileName: `nvm-windows-${input.version}-noinstall.zip`,
    packageType: "archive",
    resolvedVersion: input.version,
    sourceName: getMirrorSourceName("nvm", configuredMirror, "GitHub Releases"),
  };
}
