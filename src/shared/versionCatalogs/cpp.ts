import type { EnvironmentVersionCatalog } from "./createVersion";
import { createVersion } from "./createVersion";

export const cppVersionCatalog: EnvironmentVersionCatalog = {
  "llvm-mingw": [
    createVersion("cpp", "llvm-mingw", "20260602", "LLVM-MinGW 20260602", "stable", "archive"),
    createVersion("cpp", "llvm-mingw", "20250528", "LLVM-MinGW 20250528", "stable", "archive"),
  ],
};
