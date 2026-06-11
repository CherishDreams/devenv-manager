import type { EnvironmentVersionCatalog } from "./createVersion";
import { createVersion } from "./createVersion";

export const pythonVersionCatalog: EnvironmentVersionCatalog = {
  cpython: [
    createVersion("python", "cpython", "3.14.4", "Python 3.14.4", "current", "installer"),
    createVersion("python", "cpython", "3.13.13", "Python 3.13.13", "stable", "installer"),
    createVersion("python", "cpython", "3.12.13", "Python 3.12.13", "stable", "installer"),
  ],
};
