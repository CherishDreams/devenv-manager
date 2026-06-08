import { app } from "electron";
import { spawn } from "node:child_process";

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function getRelaunchArgs(extraArgs: string[]): string[] {
  const args = process.argv.slice(1);
  const baseArgs = args.length > 0 ? args : app.isPackaged ? [] : [app.getAppPath()];
  return [...baseArgs, ...extraArgs];
}

export function requestElevationRelaunch(extraArgs: string[] = []): Promise<void> {
  if (process.platform !== "win32") {
    return Promise.reject(new Error("当前平台不支持 Windows UAC 提权。"));
  }

  const relaunchArgs = getRelaunchArgs(extraArgs);
  const argumentList = relaunchArgs.length > 0 ? ` -ArgumentList @(${relaunchArgs.map(psQuote).join(", ")})` : "";
  const script = `Start-Process -FilePath ${psQuote(process.execPath)}${argumentList} -WorkingDirectory ${psQuote(
    app.getAppPath(),
  )} -Verb RunAs`;

  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        windowsHide: true,
      },
    );
    let stderr = "";

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `提权重启失败，退出码 ${code}`));
    });
  });
}
