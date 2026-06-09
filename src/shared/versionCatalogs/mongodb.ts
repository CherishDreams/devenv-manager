import { createVersion, type EnvironmentVersionCatalog } from "./createVersion";

export const mongodbVersionCatalog: EnvironmentVersionCatalog = {
  community: [
    createVersion("mongodb", "community", "8.2.2", "MongoDB 8.2.2", "current", "archive"),
    createVersion("mongodb", "community", "8.0.16", "MongoDB 8.0.16", "stable", "archive"),
    createVersion("mongodb", "community", "7.0.25", "MongoDB 7.0.25", "stable", "archive"),
    createVersion("mongodb", "community", "6.0.26", "MongoDB 6.0.26", "stable", "archive"),
  ],
};
