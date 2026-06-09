import { createVersion, type EnvironmentVersionCatalog } from "./createVersion";

export const ninjaVersionCatalog: EnvironmentVersionCatalog = {
  "ninja-build": [
    createVersion("ninja", "ninja-build", "v1.13.1", "Ninja 1.13.1", "current", "archive"),
    createVersion("ninja", "ninja-build", "v1.12.1", "Ninja 1.12.1", "stable", "archive"),
    createVersion("ninja", "ninja-build", "v1.11.1", "Ninja 1.11.1", "stable", "archive"),
  ],
};
