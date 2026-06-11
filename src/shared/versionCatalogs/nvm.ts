import type { EnvironmentVersionCatalog } from "./createVersion";
import { createVersion } from "./createVersion";

export const nvmVersionCatalog: EnvironmentVersionCatalog = {
  coreybutler: [
    createVersion("nvm", "coreybutler", "1.2.2", "nvm-windows 1.2.2", "stable", "archive"),
    createVersion("nvm", "coreybutler", "1.1.12", "nvm-windows 1.1.12", "stable", "archive"),
  ],
};
