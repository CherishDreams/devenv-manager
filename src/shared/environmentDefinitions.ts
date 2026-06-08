import type { EnvironmentDefinition } from "./types";

export const environmentDefinitions: EnvironmentDefinition[] = [
  {
    id: "java",
    name: "Java",
    group: "编程语言",
    description: "JDK 运行时和开发工具链",
    logoId: "java",
    accentColor: "#e76f00",
    envVars: ["JAVA_HOME"],
    pathEntries: ["bin"],
    installType: "archive",
    vendors: [
      {
        id: "temurin",
        name: "Eclipse Temurin",
        homepage: "https://adoptium.net",
      },
      {
        id: "zulu",
        name: "Azul Zulu",
        homepage: "https://www.azul.com/downloads",
      },
      {
        id: "liberica",
        name: "BellSoft Liberica",
        homepage: "https://bell-sw.com/libericajdk",
      },
      {
        id: "oracle",
        name: "Oracle JDK",
        homepage: "https://www.oracle.com/java/technologies/downloads",
      },
    ],
  },
  {
    id: "go",
    name: "Go",
    group: "编程语言",
    description: "Go 语言运行时和工具链",
    logoId: "go",
    accentColor: "#00add8",
    envVars: ["GOROOT"],
    pathEntries: ["bin"],
    installType: "archive",
    vendors: [
      {
        id: "golang",
        name: "Go 官方",
        homepage: "https://go.dev/dl",
      },
    ],
  },
  {
    id: "maven",
    name: "Maven",
    group: "构建工具",
    description: "Java 项目构建和依赖管理",
    logoId: "maven",
    accentColor: "#c71a36",
    envVars: ["MAVEN_HOME"],
    pathEntries: ["bin"],
    installType: "archive",
    vendors: [
      {
        id: "apache",
        name: "Apache Maven",
        homepage: "https://maven.apache.org/download.cgi",
      },
    ],
  },
  {
    id: "conda",
    name: "Miniconda / Conda",
    group: "Python",
    description: "Python Conda 发行版和基础环境",
    logoId: "conda",
    accentColor: "#43a047",
    envVars: ["CONDA_HOME"],
    pathEntries: ["Scripts", "Library\\bin", "condabin"],
    installType: "installer",
    vendors: [
      {
        id: "miniconda",
        name: "Miniconda",
        homepage: "https://docs.anaconda.com/miniconda",
      },
      {
        id: "anaconda",
        name: "Anaconda Distribution",
        homepage: "https://www.anaconda.com/download",
      },
    ],
  },
];
