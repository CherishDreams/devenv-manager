import type { AppConfig, AvailableVersion, EnvironmentKind, VersionCatalogQuery } from "../../../shared/types";
import { fetch } from "undici";
import { getErrorMessage, parseResponseJsonAs } from "../../../shared/errorUtils";
import { appendMirrorVersionNote } from "../../../shared/mirrorPresets";
import { versionCatalog } from "../../../shared/versionCatalog";
import { closeDispatcher, createProxyDispatcher } from "../common/networkUtils";

const requestTimeoutMs = 20_000;

export const maxVersionOptions = 40;

export interface GitHubRelease {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets: Array<{
    name: string;
  }>;
}

export function createVersion(
  environment: EnvironmentKind,
  vendor: string,
  version: string,
  label: string,
  channel: AvailableVersion["channel"],
  packageType: AvailableVersion["packageType"],
  notes?: string,
): AvailableVersion {
  return {
    id: `${environment}:${vendor}:${version}`,
    environment,
    vendor,
    version,
    label,
    channel,
    packageType,
    architecture: "x64",
    notes,
  };
}

export function compareVersionsDesc(left: string, right: string): number {
  const leftParts = left.split(".").map((part) => Number.parseInt(part, 10));
  const rightParts = right.split(".").map((part) => Number.parseInt(part, 10));
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart !== rightPart) {
      return rightPart - leftPart;
    }
  }

  return 0;
}

export function unique<TValue>(values: TValue[]): TValue[] {
  return Array.from(new Set(values));
}

export function getStaticVersions(query: VersionCatalogQuery): AvailableVersion[] {
  return versionCatalog[query.environment]?.[query.vendor] ?? [];
}

export function getStaticVersionsWithMirrorNote(
  query: VersionCatalogQuery,
  mirrorValue: string | undefined,
): AvailableVersion[] {
  return getStaticVersions(query).map((version) => ({
    ...version,
    notes: appendMirrorVersionNote(query.environment, mirrorValue, version.notes ?? "版本来自内置目录"),
  }));
}

export function getMirrorBaseUrl(value: string, officialBaseUrl: string): string {
  const mirror = value.trim();
  return mirror && mirror !== "official" ? mirror.replace(/\/+$/, "") : officialBaseUrl;
}

export async function fetchText(url: string, config: AppConfig): Promise<string> {
  const dispatcher = createProxyDispatcher(url, config);

  try {
    const response = await fetch(url, {
      dispatcher,
      signal: AbortSignal.timeout(requestTimeoutMs),
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return await response.text();
  } finally {
    await closeDispatcher(dispatcher);
  }
}

export async function fetchJson<TData>(url: string, config: AppConfig): Promise<TData> {
  const dispatcher = createProxyDispatcher(url, config);

  try {
    const response = await fetch(url, {
      dispatcher,
      signal: AbortSignal.timeout(requestTimeoutMs),
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return await parseResponseJsonAs<TData>(response, `fetchJson(${url})`);
  } finally {
    await closeDispatcher(dispatcher);
  }
}

export async function fetchJsonFromSources<TData>(
  sources: Array<{ name: string; url: string }>,
  config: AppConfig,
): Promise<{ data: TData; source: { name: string; url: string } }> {
  const errors: string[] = [];

  for (const source of sources) {
    try {
      return {
        data: await fetchJson<TData>(source.url, config),
        source,
      };
    } catch (error) {
      errors.push(`${source.name}: ${getErrorMessage(error)}`);
    }
  }

  throw new Error(`所有版本源请求失败：${errors.join("；")}`);
}
