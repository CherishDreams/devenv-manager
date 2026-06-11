import type { EnvironmentVersionCatalog } from "./createVersion";
import { createVersion } from "./createVersion";

export const phpVersionCatalog: EnvironmentVersionCatalog = {
  windows: [
    createVersion("php", "windows", "8.4.14", "PHP 8.4.14", "current", "archive"),
    createVersion("php", "windows", "8.3.27", "PHP 8.3.27", "stable", "archive"),
    createVersion("php", "windows", "8.2.29", "PHP 8.2.29", "stable", "archive"),
  ],
};
