import { fetch, ProxyAgent, type Dispatcher } from "undici";
import { versionCatalog } from "../../shared/versionCatalog";
import type { AppConfig, AvailableVersion, EnvironmentKind, VersionCatalogQuery } from "../../shared/types";
import { ConfigService } from "./configService";

interface AdoptiumAvailableReleases {
  available_lts_releases: number[];
  available_releases: number[];
  most_recent_feature_release: number;
}

interface GoRelease {
  version: string;
  stable?: boolean;
  files: Array<{
    filename: string;
    os: string;
    arch: string;
    kind: string;
  }>;
}

interface NodeRelease {
  version: string;
  lts: false | string;
  files: string[];
}

interface GitHubRelease {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets: Array<{
    name: string;
  }>;
}

const requestTimeoutMs = 20_000;

function createVersion(
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

function compareVersionsDesc(left: string, right: string): number {
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

function unique<TValue>(values: TValue[]): TValue[] {
  return Array.from(new Set(values));
}

function getProxyUrl(url: string, config: AppConfig): string | undefined {
  if (!config.proxy.enabled) {
    return undefined;
  }

  const requestProtocol = new URL(url).protocol;
  const preferredProxy = requestProtocol === "http:" ? config.proxy.httpProxy : config.proxy.httpsProxy;
  const fallbackProxy = requestProtocol === "http:" ? config.proxy.httpsProxy : config.proxy.httpProxy;
  const proxyUrl = (preferredProxy || fallbackProxy).trim();
  return proxyUrl || undefined;
}

function createProxyDispatcher(url: string, config: AppConfig): Dispatcher | undefined {
  const proxyUrl = getProxyUrl(url, config);

  if (!proxyUrl) {
    return undefined;
  }

  return new ProxyAgent(proxyUrl);
}

async function closeDispatcher(dispatcher: Dispatcher | undefined): Promise<void> {
  await dispatcher?.close().catch(() => undefined);
}

async function fetchText(url: string, config: AppConfig): Promise<string> {
  const dispatcher = createProxyDispatcher(url, config);

  try {
    const response = await fetch(url, {
      dispatcher,
      signal: AbortSignal.timeout(requestTimeoutMs),
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return response.text();
  } finally {
    await closeDispatcher(dispatcher);
  }
}

async function fetchJson<TData>(url: string, config: AppConfig): Promise<TData> {
  const dispatcher = createProxyDispatcher(url, config);

  try {
    const response = await fetch(url, {
      dispatcher,
      signal: AbortSignal.timeout(requestTimeoutMs),
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return (await response.json()) as TData;
  } finally {
    await closeDispatcher(dispatcher);
  }
}

function getStaticVersions(query: VersionCatalogQuery): AvailableVersion[] {
  return versionCatalog[query.environment]?.[query.vendor] ?? [];
}

function getMirrorBaseUrl(value: string, officialBaseUrl: string): string {
  const mirror = value.trim();
  return mirror && mirror !== "official" ? mirror.replace(/\/+$/, "") : officialBaseUrl;
}

function getGoDownloadSource(name: string, baseUrl: string): { name: string; url: string } {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const downloadBaseUrl = normalizedBaseUrl.endsWith("/dl") ? normalizedBaseUrl : `${normalizedBaseUrl}/dl`;
  return {
    name,
    url: `${downloadBaseUrl}/?mode=json&include=all`,
  };
}

async function fetchJsonFromSources<TData>(
  sources: Array<{ name: string; url: string }>,
  config: AppConfig,
): Promise<TData> {
  const errors: string[] = [];

  for (const source of sources) {
    try {
      return await fetchJson<TData>(source.url, config);
    } catch (error) {
      errors.push(`${source.name}: ${(error as Error).message}`);
    }
  }

  throw new Error(`所有版本源请求失败：${errors.join("；")}`);
}

export class VersionCatalogService {
  constructor(private readonly configService: ConfigService) {}

  async listVersions(query: VersionCatalogQuery): Promise<AvailableVersion[]> {
    const config = await this.configService.get();

    switch (query.environment) {
      case "java":
        return query.vendor === "temurin" ? this.listTemurinVersions(config) : getStaticVersions(query);
      case "python":
        return query.vendor === "cpython" ? this.listPythonVersions(config) : getStaticVersions(query);
      case "conda":
        return this.listCondaVersions(query, config);
      case "go":
        return query.vendor === "golang" ? this.listGoVersions(config) : getStaticVersions(query);
      case "node":
        return query.vendor === "nodejs" ? this.listNodeVersions(config) : getStaticVersions(query);
      case "nvm":
        return query.vendor === "coreybutler" ? this.listNvmVersions(config) : getStaticVersions(query);
      case "maven":
        return query.vendor === "apache" ? this.listMavenVersions(config) : getStaticVersions(query);
    }
  }

  private async listTemurinVersions(config: AppConfig): Promise<AvailableVersion[]> {
    const releases = await fetchJson<AdoptiumAvailableReleases>(
      "https://api.adoptium.net/v3/info/available_releases",
      config,
    );
    const ltsReleases = new Set(releases.available_lts_releases);
    const majors = unique([
      releases.most_recent_feature_release,
      ...releases.available_lts_releases.slice().sort((left, right) => right - left),
    ]).filter((major) => releases.available_releases.includes(major));

    return majors.slice(0, 6).map((major) =>
      createVersion(
        "java",
        "temurin",
        String(major),
        `JDK ${major}${ltsReleases.has(major) ? " LTS" : ""}`,
        ltsReleases.has(major) ? "lts" : "current",
        "archive",
        "来自 Adoptium 在线版本接口",
      ),
    );
  }

  private async listPythonVersions(config: AppConfig): Promise<AvailableVersion[]> {
    const baseUrl = getMirrorBaseUrl(config.mirrors.python, "https://www.python.org/ftp/python");
    const listing = await fetchText(`${baseUrl}/`, config);
    const versions = unique(
      Array.from(listing.matchAll(/href=["'](\d+\.\d+\.\d+)\/["']/g), (match) => match[1]).filter((version) =>
        version.startsWith("3."),
      ),
    ).sort(compareVersionsDesc);
    const series = ["3.14", "3.13", "3.12", "3.11"];
    const selectedVersions = series.flatMap((prefix) => versions.find((version) => version.startsWith(`${prefix}.`)) ?? []);
    const fallbackVersions = versions.slice(0, 4);

    return (selectedVersions.length > 0 ? selectedVersions : fallbackVersions).map((version, index) =>
      createVersion(
        "python",
        "cpython",
        version,
        `Python ${version}`,
        index === 0 ? "current" : "stable",
        "installer",
        "来自 Python.org FTP 目录",
      ),
    );
  }

  private async listCondaVersions(query: VersionCatalogQuery, config: AppConfig): Promise<AvailableVersion[]> {
    const baseUrl = getMirrorBaseUrl(config.mirrors.conda, "https://repo.anaconda.com");

    if (query.vendor === "anaconda") {
      const listing = await fetchText(`${baseUrl}/archive/`, config);
      const version = Array.from(
        listing.matchAll(/Anaconda3-(\d{4}\.\d+(?:-\d+)?)-Windows-x86_64\.exe/g),
        (match) => match[1],
      ).at(-1);

      return [
        createVersion(
          "conda",
          "anaconda",
          version ?? "latest",
          version ? `Anaconda ${version}` : "Anaconda Distribution",
          "stable",
          "installer",
          "来自 Anaconda archive 目录",
        ),
      ];
    }

    if (query.vendor === "miniconda") {
      const listing = await fetchText(`${baseUrl}/miniconda/`, config);
      const versions = unique(
        Array.from(
          listing.matchAll(/Miniconda3-(py\d+)_\d+\.\d+\.\d+(?:-\d+)?-Windows-x86_64\.exe/g),
          (match) => match[1],
        ),
      ).sort((left, right) => right.localeCompare(left));

      return (versions.length > 0 ? versions.slice(0, 3) : ["latest"]).map((version) =>
        createVersion(
          "conda",
          "miniconda",
          version,
          version === "latest" ? "Miniconda 最新版" : `Miniconda ${version.replace(/^py/, "Python ")}`,
          "stable",
          "installer",
          "来自 Anaconda miniconda 目录",
        ),
      );
    }

    return getStaticVersions(query);
  }

  private async listGoVersions(config: AppConfig): Promise<AvailableVersion[]> {
    const configuredMirror = config.mirrors.go.trim();
    const configuredSource =
      configuredMirror && configuredMirror !== "official" ? [getGoDownloadSource("自定义 Go 镜像", configuredMirror)] : [];
    const releases = await fetchJsonFromSources<GoRelease[]>(
      [
        ...configuredSource,
        getGoDownloadSource("Go 官方源", "https://go.dev"),
        getGoDownloadSource("Go 中国镜像", "https://golang.google.cn"),
      ],
      config,
    );
    const minorVersions = unique(
      releases
        .filter((release) => release.stable !== false)
        .filter((release) =>
          release.files.some((file) => file.os === "windows" && file.arch === "amd64" && file.kind === "archive"),
        )
        .map((release) => release.version.replace(/^go/, "").split(".").slice(0, 2).join(".")),
    );

    return minorVersions.slice(0, 5).map((version) =>
      createVersion("go", "golang", version, `Go ${version}`, "stable", "archive", "来自 Go 在线发布目录"),
    );
  }

  private async listNodeVersions(config: AppConfig): Promise<AvailableVersion[]> {
    const distBaseUrl = getMirrorBaseUrl(config.mirrors.node, "https://nodejs.org/dist");
    const releases = await fetchJson<NodeRelease[]>(`${distBaseUrl}/index.json`, config);
    const latestByMajor = new Map<string, NodeRelease>();

    releases
      .filter((release) => release.files.includes("win-x64-zip"))
      .forEach((release) => {
        const major = release.version.replace(/^v/, "").split(".")[0];

        if (!latestByMajor.has(major)) {
          latestByMajor.set(major, release);
        }
      });

    return Array.from(latestByMajor.entries())
      .slice(0, 6)
      .map(([major, release], index) =>
        createVersion(
          "node",
          "nodejs",
          major,
          `Node.js ${major}${release.lts ? " LTS" : ""}`,
          release.lts ? "lts" : index === 0 ? "current" : "stable",
          "archive",
          `最新补丁版本 ${release.version.replace(/^v/, "")}`,
        ),
      );
  }

  private async listNvmVersions(config: AppConfig): Promise<AvailableVersion[]> {
    if (config.mirrors.nvm.trim() && config.mirrors.nvm.trim() !== "official") {
      return getStaticVersions({ environment: "nvm", vendor: "coreybutler" });
    }

    const releases = await fetchJson<GitHubRelease[]>(
      "https://api.github.com/repos/coreybutler/nvm-windows/releases?per_page=10",
      config,
    );

    return releases
      .filter((release) => !release.draft && !release.prerelease)
      .filter((release) => release.assets.some((asset) => asset.name === "nvm-noinstall.zip"))
      .slice(0, 5)
      .map((release) => {
        const version = release.tag_name.replace(/^v/, "");
        return createVersion(
          "nvm",
          "coreybutler",
          version,
          `nvm-windows ${version}`,
          "stable",
          "archive",
          "来自 GitHub Releases API",
        );
      });
  }

  private async listMavenVersions(config: AppConfig): Promise<AvailableVersion[]> {
    const metadata = await fetchText(
      "https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/maven-metadata.xml",
      config,
    );
    const versions = Array.from(metadata.matchAll(/<version>(3\.\d+\.\d+)<\/version>/g), (match) => match[1])
      .sort(compareVersionsDesc)
      .slice(0, 6);

    return versions.map((version) =>
      createVersion("maven", "apache", version, `Maven ${version}`, "stable", "archive", "来自 Maven Central metadata"),
    );
  }
}
