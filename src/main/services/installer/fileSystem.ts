import { mkdir, readdir, rename, rm, stat, cp } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { TaskLogEntry } from "../../../shared/types";
import { psQuote, runProcess } from "./process";

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export async function ensureEmptyInstallTarget(installPath: string): Promise<void> {
  if (!(await pathExists(installPath))) {
    await mkdir(dirname(installPath), { recursive: true });
    return;
  }

  const entries = await readdir(installPath);

  if (entries.length > 0) {
    throw new Error(`安装目录已存在且不为空：${installPath}`);
  }

  await rm(installPath, { recursive: true, force: true });
  await mkdir(dirname(installPath), { recursive: true });
}

async function moveDirectory(source: string, target: string): Promise<void> {
  try {
    await rename(source, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") {
      throw error;
    }

    await cp(source, target, { recursive: true });
    await rm(source, { recursive: true, force: true });
  }
}

async function findArchiveRoot(extractDir: string): Promise<string> {
  const entries = await readdir(extractDir, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());

  if (directories.length === 1) {
    return join(extractDir, directories[0].name);
  }

  return extractDir;
}

export async function extractZip(
  archivePath: string,
  installPath: string,
  cacheDir: string,
  signal: AbortSignal,
  onLog: (message: string, level?: TaskLogEntry["level"]) => void,
): Promise<void> {
  const extractDir = join(cacheDir, `extract-${Date.now()}-${crypto.randomUUID()}`);
  await mkdir(extractDir, { recursive: true });
  const startedAt = Date.now();
  let extractor = "tar.exe";

  try {
    try {
      onLog("正在使用 tar.exe 解压安装包。");
      await runProcess("tar.exe", ["-xf", archivePath, "-C", extractDir], signal);
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }

      extractor = "PowerShell Expand-Archive";
      onLog(`tar.exe 解压失败，回退 PowerShell：${(error as Error).message.split("\n")[0]}`, "warn");
      await runProcess(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `Expand-Archive -LiteralPath ${psQuote(archivePath)} -DestinationPath ${psQuote(extractDir)} -Force`,
        ],
        signal,
      );
    }

    const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    onLog(`解压完成：${extractor}，耗时 ${elapsedSeconds} 秒。`);

    const archiveRoot = await findArchiveRoot(extractDir);
    await ensureEmptyInstallTarget(installPath);
    await moveDirectory(archiveRoot, installPath);
  } finally {
    await rm(extractDir, { recursive: true, force: true });
  }
}
