import type { EnvironmentVersionCatalog } from "./createVersion";
import { createVersion } from "./createVersion";

export const dotnetVersionCatalog: EnvironmentVersionCatalog = {
  microsoft: [
    createVersion("dotnet", "microsoft", "10.0.100", ".NET SDK 10.0.100", "current", "archive"),
    createVersion("dotnet", "microsoft", "9.0.308", ".NET SDK 9.0.308", "stable", "archive"),
    createVersion("dotnet", "microsoft", "8.0.415", ".NET SDK 8.0.415 LTS", "lts", "archive"),
    createVersion("dotnet", "microsoft", "6.0.428", ".NET SDK 6.0.428", "stable", "archive"),
  ],
};
