import type { AppConfig, InstallTaskInput } from "../../../../shared/types";
import { getMirrorSourceName } from "../../../../shared/mirrorPresets";
import { fetchJson } from "../network";
import type { PackageResource } from "../types";

interface NodeRelease {
  version: string;
  lts: false | string;
  files: string[];
}

export async function resolveNodeResource(
  input: InstallTaskInput,
  config: AppConfig,
  signal: AbortSignal,
): Promise<PackageResource> {
  const vendor = input.vendor ?? "nodejs";

  if (vendor !== "nodejs") {
    throw new Error("当前自动安装暂只支持 Node.js 官方发行版。");
  }

  const configuredMirror = config.mirrors.node.trim();
  const distBaseUrl =
    configuredMirror && configuredMirror !== "official" ? configuredMirror.replace(/\/+$/, "") : "https://nodejs.org/dist";
  const releases = await fetchJson<NodeRelease[]>(`${distBaseUrl}/index.json`, config, signal);
  const requestedVersion = input.version.replace(/^v/, "");
  const release = releases.find((item) => {
    const version = item.version.replace(/^v/, "");
    return version === requestedVersion || version.startsWith(`${requestedVersion}.`);
  });

  if (!release || !release.files.includes("win-x64-zip")) {
    throw new Error(`未找到 Node.js ${input.version} 的 Windows x64 压缩包。`);
  }

  const fileName = `node-${release.version}-win-x64.zip`;

  return {
    url: `${distBaseUrl}/${release.version}/${fileName}`,
    fileName,
    packageType: "archive",
    resolvedVersion: release.version.replace(/^v/, ""),
    sourceName: getMirrorSourceName("node", configuredMirror, "Node.js 官方源"),
  };
}
