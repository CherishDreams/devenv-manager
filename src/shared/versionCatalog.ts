import type { AvailableVersion, EnvironmentKind } from "./types";

type VersionCatalog = Record<EnvironmentKind, Record<string, AvailableVersion[]>>;

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

export const versionCatalog: VersionCatalog = {
  java: {
    temurin: [
      createVersion("java", "temurin", "21", "JDK 21 LTS", "lts", "archive"),
      createVersion("java", "temurin", "17", "JDK 17 LTS", "lts", "archive"),
      createVersion("java", "temurin", "11", "JDK 11 LTS", "lts", "archive"),
      createVersion("java", "temurin", "8", "JDK 8 LTS", "lts", "archive"),
    ],
    zulu: [
      createVersion("java", "zulu", "21", "Zulu JDK 21 LTS", "lts", "archive"),
      createVersion("java", "zulu", "17", "Zulu JDK 17 LTS", "lts", "archive"),
      createVersion("java", "zulu", "11", "Zulu JDK 11 LTS", "lts", "archive"),
    ],
    liberica: [
      createVersion("java", "liberica", "21", "Liberica JDK 21 LTS", "lts", "archive"),
      createVersion("java", "liberica", "17", "Liberica JDK 17 LTS", "lts", "archive"),
      createVersion("java", "liberica", "11", "Liberica JDK 11 LTS", "lts", "archive"),
    ],
    oracle: [
      createVersion("java", "oracle", "21", "Oracle JDK 21 LTS", "lts", "installer"),
      createVersion("java", "oracle", "17", "Oracle JDK 17 LTS", "lts", "installer"),
    ],
  },
  go: {
    golang: [
      createVersion("go", "golang", "1.24", "Go 1.24", "stable", "archive"),
      createVersion("go", "golang", "1.23", "Go 1.23", "stable", "archive"),
      createVersion("go", "golang", "1.22", "Go 1.22", "stable", "archive"),
    ],
  },
  maven: {
    apache: [
      createVersion("maven", "apache", "3.9", "Maven 3.9", "stable", "archive"),
      createVersion("maven", "apache", "3.8", "Maven 3.8", "stable", "archive"),
    ],
  },
  conda: {
    miniconda: [
      createVersion("conda", "miniconda", "py312", "Miniconda Python 3.12", "stable", "installer"),
      createVersion("conda", "miniconda", "py311", "Miniconda Python 3.11", "stable", "installer"),
    ],
    anaconda: [
      createVersion("conda", "anaconda", "latest", "Anaconda Distribution", "stable", "installer"),
    ],
  },
};
