import type { EnvironmentVersionCatalog } from "./createVersion";
import { createVersion } from "./createVersion";

export const cmakeVersionCatalog: EnvironmentVersionCatalog = {
  kitware: [
    createVersion("cmake", "kitware", "4.2.0", "CMake 4.2.0", "current", "archive"),
    createVersion("cmake", "kitware", "4.1.3", "CMake 4.1.3", "stable", "archive"),
    createVersion("cmake", "kitware", "3.31.10", "CMake 3.31.10", "stable", "archive"),
    createVersion("cmake", "kitware", "3.30.9", "CMake 3.30.9", "stable", "archive"),
  ],
};
