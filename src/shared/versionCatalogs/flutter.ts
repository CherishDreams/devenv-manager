import type { EnvironmentVersionCatalog } from "./createVersion";
import { createVersion } from "./createVersion";

export const flutterVersionCatalog: EnvironmentVersionCatalog = {
  google: [
    createVersion("flutter", "google", "3.35.7", "Flutter 3.35.7", "current", "archive"),
    createVersion("flutter", "google", "3.32.8", "Flutter 3.32.8", "stable", "archive"),
    createVersion("flutter", "google", "3.29.3", "Flutter 3.29.3", "stable", "archive"),
  ],
};
