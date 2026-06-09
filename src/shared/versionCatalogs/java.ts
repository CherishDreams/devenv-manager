import { createVersion, type EnvironmentVersionCatalog } from "./createVersion";

export const javaVersionCatalog: EnvironmentVersionCatalog = {
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
};
