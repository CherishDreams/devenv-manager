import type { EnvironmentVersionCatalog } from "./createVersion";
import { createVersion } from "./createVersion";

export const postgresqlVersionCatalog: EnvironmentVersionCatalog = {
  edb: [
    createVersion("postgresql", "edb", "18.4", "PostgreSQL 18.4", "current", "archive"),
    createVersion("postgresql", "edb", "17.10", "PostgreSQL 17.10", "stable", "archive"),
    createVersion("postgresql", "edb", "16.14", "PostgreSQL 16.14", "stable", "archive"),
    createVersion("postgresql", "edb", "15.18", "PostgreSQL 15.18", "stable", "archive"),
  ],
};
