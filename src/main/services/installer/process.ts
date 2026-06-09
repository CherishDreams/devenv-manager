import { spawn } from "node:child_process";
import { basename } from "node:path";

export function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function runProcess(
  command: string,
  args: string[],
  signal: AbortSignal,
  options?: { env?: NodeJS.ProcessEnv },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolveProcess, reject) => {
    const child = spawn(command, args, {
      env: options?.env,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";

    const abort = (): void => {
      child.kill();
      reject(new Error("任务已取消。"));
    };

    if (signal.aborted) {
      abort();
      return;
    }

    signal.addEventListener("abort", abort, { once: true });

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      signal.removeEventListener("abort", abort);
      reject(error);
    });
    child.on("close", (code) => {
      signal.removeEventListener("abort", abort);

      if (signal.aborted) {
        reject(new Error("任务已取消。"));
        return;
      }

      if (code === 0) {
        resolveProcess({ stdout, stderr });
        return;
      }

      reject(new Error(`${basename(command)} 退出码 ${code}\n${stderr || stdout}`));
    });
  });
}
