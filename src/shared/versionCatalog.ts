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
  python: {
    cpython: [
      createVersion("python", "cpython", "3.14.4", "Python 3.14.4", "current", "installer"),
      createVersion("python", "cpython", "3.13.13", "Python 3.13.13", "stable", "installer"),
      createVersion("python", "cpython", "3.12.13", "Python 3.12.13", "stable", "installer"),
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
  go: {
    golang: [
      createVersion("go", "golang", "1.24", "Go 1.24", "stable", "archive"),
      createVersion("go", "golang", "1.23", "Go 1.23", "stable", "archive"),
      createVersion("go", "golang", "1.22", "Go 1.22", "stable", "archive"),
    ],
  },
  node: {
    nodejs: [
      createVersion("node", "nodejs", "24", "Node.js 24", "stable", "archive", "安装时解析最新 24.x"),
      createVersion("node", "nodejs", "22", "Node.js 22 LTS", "lts", "archive", "安装时解析最新 22.x"),
      createVersion("node", "nodejs", "20", "Node.js 20 LTS", "lts", "archive", "安装时解析最新 20.x"),
    ],
  },
  nvm: {
    coreybutler: [
      createVersion("nvm", "coreybutler", "1.2.2", "nvm-windows 1.2.2", "stable", "archive"),
      createVersion("nvm", "coreybutler", "1.1.12", "nvm-windows 1.1.12", "stable", "archive"),
    ],
  },
  maven: {
    apache: [
      createVersion("maven", "apache", "3.9", "Maven 3.9", "stable", "archive"),
      createVersion("maven", "apache", "3.8", "Maven 3.8", "stable", "archive"),
    ],
  },
};
