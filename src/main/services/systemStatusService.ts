import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SystemStatus } from "../../shared/types";

const execFileAsync = promisify(execFile);

async function isWindowsAdministrator(): Promise<boolean> {
  if (process.platform !== "win32") {
    return false;
  }

  try {
    await execFileAsync("net", ["session"], {
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

export class SystemStatusService {
  async getStatus(): Promise<SystemStatus> {
    const keys = ["JAVA_HOME", "GOROOT", "MAVEN_HOME", "CONDA_HOME", "Path", "PATH"];

    return {
      platform: process.platform,
      arch: process.arch,
      isWindows: process.platform === "win32",
      isAdministrator: await isWindowsAdministrator(),
      systemDrive: process.env.SystemDrive ?? "C:",
      env: Object.fromEntries(keys.map((key) => [key, process.env[key]])),
    };
  }
}
