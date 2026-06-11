import type { EnvironmentVersionCatalog } from "./createVersion";
import { createVersion } from "./createVersion";

export const goVersionCatalog: EnvironmentVersionCatalog = {
  golang: [
    createVersion("go", "golang", "1.24", "Go 1.24", "stable", "archive"),
    createVersion("go", "golang", "1.23", "Go 1.23", "stable", "archive"),
    createVersion("go", "golang", "1.22", "Go 1.22", "stable", "archive"),
  ],
};
