import type { Server, Socket } from "node:net";
import type { EnvironmentKind, EnvironmentSummary } from "../../shared/types";
import { spawn } from "node:child_process";
import { connect, createServer } from "node:net";
import { app } from "electron";
import { getErrorMessage, parseJsonAs } from "../../shared/errorUtils";
import { psQuote } from "./common/shellUtils";

export type ElevatedEnvironmentOperation
  = | { type: "set-active"; environment: EnvironmentKind; id: string }
    | { type: "uninstall"; id: string };

type ElevatedBrokerCommand = ElevatedEnvironmentOperation | { type: "ping" } | { type: "shutdown" };

export interface ElevatedOperationResult {
  ok: boolean;
  summary?: EnvironmentSummary;
  error?: string;
}

type ElevatedBrokerHandler = (operation: ElevatedEnvironmentOperation) => Promise<EnvironmentSummary>;

let elevatedBrokerPipePath: string | undefined;
let elevatedBrokerStarting: Promise<string> | undefined;

function getRelaunchArgs(extraArgs: string[]): string[] {
  const args = process.argv.slice(1).filter((argument) => argument !== "--env-manager-elevated-broker");
  const baseArgs = args.length > 0 ? args : app.isPackaged ? [] : [app.getAppPath()];
  return [...baseArgs, ...extraArgs];
}

function launchElevated(extraArgs: string[], wait: boolean): Promise<void> {
  if (process.platform !== "win32") {
    return Promise.reject(new Error("当前平台不支持 Windows UAC 提权。"));
  }

  const relaunchArgs = getRelaunchArgs(extraArgs);
  const argumentList = relaunchArgs.length > 0 ? ` -ArgumentList @(${relaunchArgs.map(psQuote).join(", ")})` : "";
  const waitArguments = wait ? " -Wait" : "";
  const script = `Start-Process -FilePath ${psQuote(process.execPath)}${argumentList} -WorkingDirectory ${psQuote(
    app.getAppPath(),
  )} -Verb RunAs${waitArguments}`;

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

export function requestElevationRelaunch(extraArgs: string[] = []): Promise<void> {
  return launchElevated(extraArgs, false);
}

function createPipePath(): string {
  return `\\\\.\\pipe\\env-manager-${process.pid}-${crypto.randomUUID()}`;
}

function sendBrokerCommand(
  pipePath: string,
  command: ElevatedBrokerCommand,
  timeoutMs = 30_000,
): Promise<ElevatedOperationResult> {
  return new Promise((resolve, reject) => {
    const client = connect(pipePath);
    let buffer = "";
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;
    const settle = (callback: () => void): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      callback();
    };
    timeout = setTimeout(() => {
      client.destroy();
      settle(() => reject(new Error("管理员辅助进程响应超时。")));
    }, timeoutMs);

    client.on("connect", () => {
      client.write(`${JSON.stringify(command)}\n`, "utf8");
    });
    client.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");

      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) {
        return;
      }

      const line = buffer.slice(0, newlineIndex).trim();

      try {
        const result = parseJsonAs<ElevatedOperationResult>(line, "ElevatedOperationResult");
        settle(() => {
          client.end();
          resolve(result);
        });
      } catch (error) {
        settle(() => {
          client.destroy();
          reject(error);
        });
      }
    });
    client.on("error", (error) => {
      settle(() => reject(error));
    });
    client.on("close", () => {
      settle(() => reject(new Error("管理员辅助进程连接已关闭。")));
    });
  });
}

async function waitForBroker(pipePath: string): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 30_000) {
    try {
      const result = await sendBrokerCommand(pipePath, { type: "ping" }, 1_000);

      if (result.ok) {
        return;
      }
    } catch {
      // Broker not ready yet, will retry on next iteration
      await new Promise((resolve) => {
        setTimeout(resolve, 250);
      });
    }
  }

  throw new Error("管理员辅助进程启动超时。");
}

export async function hasActiveElevatedBroker(): Promise<boolean> {
  if (!elevatedBrokerPipePath) {
    return false;
  }

  try {
    const result = await sendBrokerCommand(elevatedBrokerPipePath, { type: "ping" }, 750);

    if (result.ok) {
      return true;
    }
  } catch {
    // Broker unreachable, clear stale reference
    elevatedBrokerPipePath = undefined;
  }

  return false;
}

async function ensureElevatedBroker(): Promise<string> {
  if (elevatedBrokerPipePath) {
    try {
      const result = await sendBrokerCommand(elevatedBrokerPipePath, { type: "ping" });

      if (result.ok) {
        return elevatedBrokerPipePath;
      }
    } catch {
      // Broker unreachable, will recreate below
      elevatedBrokerPipePath = undefined;
    }
  }

  if (!elevatedBrokerStarting) {
    elevatedBrokerStarting = (async () => {
      const pipePath = createPipePath();
      await launchElevated(["--env-manager-elevated-broker", pipePath, String(process.pid)], false);
      await waitForBroker(pipePath);
      elevatedBrokerPipePath = pipePath;
      return pipePath;
    })().finally(() => {
      elevatedBrokerStarting = undefined;
    });
  }

  try {
    return await elevatedBrokerStarting;
  } catch (error) {
    elevatedBrokerPipePath = undefined;
    throw error;
  }
}

export async function requestElevatedEnvironmentOperation(
  operation: ElevatedEnvironmentOperation,
): Promise<EnvironmentSummary> {
  const pipePath = await ensureElevatedBroker();
  let result: ElevatedOperationResult;

  try {
    result = await sendBrokerCommand(pipePath, operation);
  } catch {
    // Broker died mid-operation, restart and retry once
    elevatedBrokerPipePath = undefined;
    result = await sendBrokerCommand(await ensureElevatedBroker(), operation);
  }

  if (!result.ok || !result.summary) {
    throw new Error(result.error || "管理员操作未完成。");
  }

  return result.summary;
}

export async function shutdownElevatedBroker(): Promise<void> {
  if (!elevatedBrokerPipePath) {
    return;
  }

  const pipePath = elevatedBrokerPipePath;
  elevatedBrokerPipePath = undefined;
  // Ignore errors — the broker may have already exited
  await sendBrokerCommand(pipePath, { type: "shutdown" }).catch(() => undefined);
}

function writeBrokerResponse(socket: Socket, result: ElevatedOperationResult): void {
  socket.end(`${JSON.stringify(result)}\n`, "utf8");
}

function handleBrokerSocket(socket: Socket, server: Server, handler: ElevatedBrokerHandler): void {
  let buffer = "";

  socket.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");

    const newlineIndex = buffer.indexOf("\n");
    if (newlineIndex < 0) {
      return;
    }

    const line = buffer.slice(0, newlineIndex).trim();

    void (async () => {
      try {
        const command = parseJsonAs<ElevatedBrokerCommand>(line, "ElevatedBrokerCommand");

        if (command.type === "ping") {
          writeBrokerResponse(socket, { ok: true });
          return;
        }

        if (command.type === "shutdown") {
          writeBrokerResponse(socket, { ok: true });
          server.close(() => app.exit(0));
          return;
        }

        const summary = await handler(command);
        writeBrokerResponse(socket, { ok: true, summary });
      } catch (error) {
        writeBrokerResponse(socket, { ok: false, error: getErrorMessage(error) });
      }
    })();
  });
}

export function startElevatedBrokerServer(pipePath: string, handler: ElevatedBrokerHandler): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = createServer((socket) => handleBrokerSocket(socket, server, handler));

    server.once("error", reject);
    server.listen({ path: pipePath, readableAll: true, writableAll: true }, () => {
      server.off("error", reject);
      resolve();
    });
  });
}
