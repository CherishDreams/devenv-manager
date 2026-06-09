import type { AppConfig, InstallTaskInput } from "../../../../shared/types";
import { getMirrorSourceName, isOfficialMirrorValue } from "../../../../shared/mirrorPresets";
import type { PackageResource } from "../types";

export function resolvePythonResource(input: InstallTaskInput, config: AppConfig): PackageResource {
  const vendor = input.vendor ?? "cpython";

  if (vendor !== "cpython") {
    throw new Error("当前自动安装暂只支持 Python 官方发行版。");
  }

  const configuredMirror = config.mirrors.python.trim();
  const hasConfiguredMirror = !isOfficialMirrorValue(configuredMirror);
  const baseUrl = hasConfiguredMirror ? configuredMirror.replace(/\/+$/, "") : "https://www.python.org/ftp/python";
  const fileName = `python-${input.version}-amd64.exe`;

  return {
    url: `${baseUrl}/${input.version}/${fileName}`,
    fileName,
    packageType: "installer",
    resolvedVersion: input.version,
    sourceName: getMirrorSourceName("python", configuredMirror, "Python 官方源"),
  };
}
