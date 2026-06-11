import type { EnvironmentVersionCatalog } from "./createVersion";
import { createVersion } from "./createVersion";

export const nodeVersionCatalog: EnvironmentVersionCatalog = {
  nodejs: [
    createVersion("node", "nodejs", "24", "Node.js 24", "stable", "archive", "安装时解析最新 24.x"),
    createVersion("node", "nodejs", "22", "Node.js 22 LTS", "lts", "archive", "安装时解析最新 22.x"),
    createVersion("node", "nodejs", "20", "Node.js 20 LTS", "lts", "archive", "安装时解析最新 20.x"),
  ],
};
