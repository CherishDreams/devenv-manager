import type { TaskDownloadProgress, TaskLogEntry } from "../../../shared/types";

export interface InstallerEvents {
  log: (message: string, level?: TaskLogEntry["level"]) => void;
  progress: (progress: number) => void;
  downloadProgress: (progress: TaskDownloadProgress) => void;
}

export interface PackageResource {
  url: string;
  fileName: string;
  packageType: "archive" | "installer";
  resolvedVersion: string;
  sourceName?: string;
}
