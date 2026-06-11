import type { AppConfig, InstallTaskInput } from "../../../../shared/types";
import type { PackageResource } from "../types";
import { getMirrorSourceName } from "../../../../shared/mirrorPresets";
import { fetchText } from "../network";

function extractPostgresqlWindowsLink(page: string, version: string): string | undefined {
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `Version\\s*(?:<!-- -->)?${escapedVersion}.*?<a href="([^"]+)"><img alt="Windows x86-64"`,
    "s",
  );
  const match = page.match(pattern);
  const url = match?.[1]?.replace(/&amp;/g, "&");

  if (!url) {
    return undefined;
  }

  return url.startsWith("http") ? url : `https://www.enterprisedb.com${url}`;
}

export async function resolvePostgresqlResource(
  input: InstallTaskInput,
  config: AppConfig,
  signal: AbortSignal,
): Promise<PackageResource> {
  const vendor = input.vendor ?? "edb";

  if (vendor !== "edb") {
    throw new Error("当前自动安装暂只支持 EDB PostgreSQL Binaries。");
  }

  const fileName = `postgresql-${input.version}-windows-x64-binaries.zip`;
  const configuredMirror = config.mirrors.postgresql.trim();

  if (configuredMirror && configuredMirror !== "official") {
    const baseUrl = configuredMirror.replace(/\/+$/, "");
    return {
      url: `${baseUrl}/${fileName}`,
      fileName,
      packageType: "archive",
      resolvedVersion: input.version,
      sourceName: getMirrorSourceName("postgresql", configuredMirror, "EDB PostgreSQL Binaries"),
    };
  }

  const page = await fetchText("https://www.enterprisedb.com/download-postgresql-binaries", config, signal);
  const url = extractPostgresqlWindowsLink(page, input.version);

  if (!url) {
    throw new Error(`未找到 PostgreSQL ${input.version} 的 Windows x64 二进制包。`);
  }

  return {
    url,
    fileName,
    packageType: "archive",
    resolvedVersion: input.version,
    sourceName: "EDB PostgreSQL Binaries",
  };
}
