import type { SystemStatus } from "../../shared/types";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

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
  isAdministrator(): Promise<boolean> {
    return isWindowsAdministrator();
  }

  async getStatus(): Promise<SystemStatus> {
    const keys = [
      "JAVA_HOME",
      "PYTHON_HOME",
      "CONDA_HOME",
      "GOROOT",
      "NODE_HOME",
      "NVM_HOME",
      "NVM_SYMLINK",
      "MAVEN_HOME",
      "LLVM_MINGW_HOME",
      "LUA_HOME",
      "MYSQL_HOME",
      "PG_HOME",
      "Path",
      "PATH",
    ];

    return {
      platform: process.platform,
      arch: process.arch,
      isWindows: process.platform === "win32",
      isAdministrator: await this.isAdministrator(),
      systemDrive: process.env.SystemDrive ?? "C:",
      env: Object.fromEntries(keys.map((key) => [key, process.env[key]])),
    };
  }
}
