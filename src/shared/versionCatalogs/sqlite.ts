import { createVersion, type EnvironmentVersionCatalog } from "./createVersion";

export const sqliteVersionCatalog: EnvironmentVersionCatalog = {
  sqlite: [
    createVersion("sqlite", "sqlite", "3510000", "SQLite 3.51.0", "current", "archive"),
    createVersion("sqlite", "sqlite", "3500400", "SQLite 3.50.4", "stable", "archive"),
    createVersion("sqlite", "sqlite", "3490200", "SQLite 3.49.2", "stable", "archive"),
  ],
};
