import type { AppConfig, InstallTaskInput } from "../../../../shared/types";
import { fetchJson } from "../network";
import type { PackageResource } from "../types";

interface ZuluPackage {
  download_url: string;
  java_version: number[];
  name: string;
}

interface LibericaRelease {
  downloadUrl: string;
  filename: string;
  GA: boolean;
  packageType: string;
  version: string;
}

function isPlainZuluPackage(item: ZuluPackage): boolean {
  return !item.name.includes("-fx-") && !item.name.includes("-crac-");
}

export async function resolveJavaResource(
  input: InstallTaskInput,
  config: AppConfig,
  signal: AbortSignal,
): Promise<PackageResource> {
  const vendor = input.vendor ?? "temurin";

  if (vendor === "temurin") {
    return {
      url: `https://api.adoptium.net/v3/binary/latest/${input.version}/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk`,
      fileName: `temurin-jdk-${input.version}-windows-x64.zip`,
      packageType: "archive",
      resolvedVersion: input.version,
      sourceName: "Adoptium API",
    };
  }

  if (vendor === "zulu") {
    const packages = await fetchJson<ZuluPackage[]>(
      `https://api.azul.com/metadata/v1/zulu/packages/?java_version=${input.version}&os=windows&arch=x64&java_package_type=jdk&archive_type=zip&release_status=ga&availability_types=CA&page=1&page_size=50`,
      config,
      signal,
    );
    const selectedPackage = packages.find(isPlainZuluPackage);

    if (!selectedPackage) {
      throw new Error(`未找到 Zulu JDK ${input.version} 的 Windows x64 zip。`);
    }

    return {
      url: selectedPackage.download_url,
      fileName: selectedPackage.name,
      packageType: "archive",
      resolvedVersion: selectedPackage.java_version.join("."),
      sourceName: "Azul Metadata API",
    };
  }

  if (vendor === "liberica") {
    const releases = await fetchJson<LibericaRelease[]>(
      `https://api.bell-sw.com/v1/liberica/releases?version-feature=${input.version}&version-modifier=latest&bitness=64&release-type=all&os=windows&arch=x86&package-type=zip&bundle-type=jdk`,
      config,
      signal,
    );
    const selectedRelease = releases.find((item) => item.GA && item.packageType === "zip");

    if (!selectedRelease) {
      throw new Error(`未找到 Liberica JDK ${input.version} 的 Windows x64 zip。`);
    }

    return {
      url: selectedRelease.downloadUrl,
      fileName: selectedRelease.filename,
      packageType: "archive",
      resolvedVersion: selectedRelease.version,
      sourceName: "BellSoft Product Discovery API",
    };
  }

  if (vendor === "oracle") {
    return {
      url: `https://download.oracle.com/java/${input.version}/latest/jdk-${input.version}_windows-x64_bin.zip`,
      fileName: `oracle-jdk-${input.version}-windows-x64.zip`,
      packageType: "archive",
      resolvedVersion: input.version,
      sourceName: "Oracle Java 下载页",
    };
  }

  throw new Error(`暂不支持该 Java 发行商：${vendor}`);
}
