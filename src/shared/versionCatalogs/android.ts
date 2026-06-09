import { createVersion, type EnvironmentVersionCatalog } from "./createVersion";

export const androidVersionCatalog: EnvironmentVersionCatalog = {
  google: [
    createVersion("android", "google", "13114758", "Android Command Line Tools 13114758", "current", "archive"),
    createVersion("android", "google", "11076708", "Android Command Line Tools 11076708", "stable", "archive"),
    createVersion("android", "google", "10406996", "Android Command Line Tools 10406996", "stable", "archive"),
  ],
};
