import { createVersion, type EnvironmentVersionCatalog } from "./createVersion";

export const gradleVersionCatalog: EnvironmentVersionCatalog = {
  gradle: [
    createVersion("gradle", "gradle", "9.2.1", "Gradle 9.2.1", "current", "archive"),
    createVersion("gradle", "gradle", "9.1.0", "Gradle 9.1.0", "stable", "archive"),
    createVersion("gradle", "gradle", "8.14.3", "Gradle 8.14.3", "stable", "archive"),
    createVersion("gradle", "gradle", "8.13", "Gradle 8.13", "stable", "archive"),
    createVersion("gradle", "gradle", "7.6.6", "Gradle 7.6.6", "stable", "archive"),
  ],
};
