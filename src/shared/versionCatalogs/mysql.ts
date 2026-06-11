import type { EnvironmentVersionCatalog } from "./createVersion";
import { createVersion } from "./createVersion";

export const mysqlVersionCatalog: EnvironmentVersionCatalog = {
  community: [
    createVersion("mysql", "community", "9.6.0", "MySQL 9.6.0", "current", "archive"),
    createVersion("mysql", "community", "9.5.0", "MySQL 9.5.0", "stable", "archive"),
    createVersion("mysql", "community", "9.4.0", "MySQL 9.4.0", "stable", "archive"),
    createVersion("mysql", "community", "8.4.9", "MySQL 8.4.9 LTS", "lts", "archive"),
    createVersion("mysql", "community", "8.0.44", "MySQL 8.0.44", "stable", "archive"),
    createVersion("mysql", "community", "5.7.44", "MySQL 5.7.44", "stable", "archive"),
    createVersion("mysql", "community", "5.6.51", "MySQL 5.6.51", "stable", "archive"),
    createVersion("mysql", "community", "5.5.62", "MySQL 5.5.62", "stable", "archive"),
  ],
};
