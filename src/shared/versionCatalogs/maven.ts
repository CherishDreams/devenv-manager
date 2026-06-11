import type { EnvironmentVersionCatalog } from "./createVersion";
import { createVersion } from "./createVersion";

export const mavenVersionCatalog: EnvironmentVersionCatalog = {
  apache: [
    createVersion("maven", "apache", "3.9", "Maven 3.9", "stable", "archive"),
    createVersion("maven", "apache", "3.8", "Maven 3.8", "stable", "archive"),
  ],
};
