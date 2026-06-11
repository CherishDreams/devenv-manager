import { spawn } from "node:child_process";
import { basename } from "node:path";

export { psQuote } from "../common/shellUtils";

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
    let settled = false;

    let settle: (fn: () => void) => void;
    const abort = (): void => {
      child.kill();
      settle(() => reject(new Error("任务已取消。")));
    };

    settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      fn();
    };

    signal.addEventListener("abort", abort, { once: true });

    if (signal.aborted) {
      abort();
      return;
    }

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      settle(() => reject(error));
    });

    child.on("close", (code) => {
      settle(() => {
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
  });
}
