import { createVersion, type EnvironmentVersionCatalog } from "./createVersion";

export const redisVersionCatalog: EnvironmentVersionCatalog = {
  "redis-windows": [
    createVersion("redis", "redis-windows", "5.0.14.1", "Redis Windows 5.0.14.1", "stable", "archive"),
    createVersion("redis", "redis-windows", "5.0.10", "Redis Windows 5.0.10", "stable", "archive"),
  ],
};
