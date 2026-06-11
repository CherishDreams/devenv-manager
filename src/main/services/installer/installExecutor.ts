import type { InstallTaskInput, TaskLogEntry } from "../../../shared/types";
import { copyFile, mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureEmptyInstallTarget, pathExists } from "./fileSystem";
import { runProcess } from "./process";

export async function runInstaller(
  input: InstallTaskInput,
  installerPath: string,
  installPath: string,
  signal: AbortSignal,
): Promise<void> {
  if (input.environment === "python") {
    await ensureEmptyInstallTarget(installPath);
    await runProcess(
      installerPath,
      [
        "/quiet",
        "InstallAllUsers=0",
        "AssociateFiles=0",
        "Shortcuts=0",
        "Include_launcher=0",
        "Include_pip=1",
        "Include_test=0",
        "PrependPath=0",
        `TargetDir=${installPath}`,
      ],
      signal,
    );
    return;
  }

  if (input.environment === "conda") {
    await ensureEmptyInstallTarget(installPath);
    await runProcess(
      installerPath,
      ["/InstallationType=JustMe", "/RegisterPython=0", "/NoShortcuts=1", "/AddToPath=0", "/S", `/D=${installPath}`],
      signal,
    );
    return;
  }

  if (input.environment === "rust") {
    const cargoHome = join(installPath, "cargo");
    const rustupHome = join(installPath, "rustup");

    await ensureEmptyInstallTarget(installPath);
    await mkdir(cargoHome, { recursive: true });
    await mkdir(rustupHome, { recursive: true });
    await runProcess(
      installerPath,
      [
        "-y",
        "--no-modify-path",
        "--profile",
        "default",
        "--default-host",
        "x86_64-pc-windows-msvc",
        "--default-toolchain",
        input.version,
      ],
      signal,
      {
        env: {
          ...process.env,
          CARGO_HOME: cargoHome,
          RUSTUP_HOME: rustupHome,
        },
      },
    );
    return;
  }

  if (input.environment === "ruby") {
    await ensureEmptyInstallTarget(installPath);
    await runProcess(
      installerPath,
      ["/verysilent", "/suppressmsgboxes", "/norestart", `/dir=${installPath}`, "/tasks="],
      signal,
    );
    return;
  }

  throw new Error("暂不支持该安装器类型。");
}

async function moveIfExists(source: string, target: string): Promise<void> {
  try {
    await stat(source);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }

    throw error;
  }

  await rm(target, { recursive: true, force: true });
  await rename(source, target);
}

export async function prepareInstalledEnvironment(
  input: InstallTaskInput,
  installPath: string,
  onLog: (message: string, level?: TaskLogEntry["level"]) => void,
  _signal: AbortSignal,
): Promise<void> {
  if (input.environment === "nvm") {
    const symlinkPath = join(installPath, "nodejs");
    const settings = [
      `root: ${installPath}`,
      `path: ${symlinkPath}`,
      "arch: 64",
      "proxy: none",
      "originalpath:",
      "originalversion:",
      "",
    ].join("\r\n");

    await mkdir(symlinkPath, { recursive: true });
    await writeFile(join(installPath, "settings.txt"), settings, "utf8");
    onLog("已写入 nvm-windows settings.txt。");
    return;
  }

  if (input.environment === "lua") {
    const entries = await readdir(installPath);
    const luaExe = entries.find((entry) => /^lua\d+\.exe$/i.test(entry));
    const luacExe = entries.find((entry) => /^luac\d+\.exe$/i.test(entry));

    if (luaExe && !(await pathExists(join(installPath, "lua.exe")))) {
      await copyFile(join(installPath, luaExe), join(installPath, "lua.exe"));
    }

    if (luacExe && !(await pathExists(join(installPath, "luac.exe")))) {
      await copyFile(join(installPath, luacExe), join(installPath, "luac.exe"));
    }

    onLog("已生成 Lua 通用命令入口。");
    return;
  }

  if (input.environment === "php") {
    const phpIniDevelopment = join(installPath, "php.ini-development");
    const phpIni = join(installPath, "php.ini");

    if ((await pathExists(phpIniDevelopment)) && !(await pathExists(phpIni))) {
      await copyFile(phpIniDevelopment, phpIni);
      onLog("已生成 PHP php.ini。");
    }
    return;
  }

  if (input.environment === "android") {
    const nestedToolsPath = join(installPath, "cmdline-tools", "cmdline-tools");
    const latestPath = join(installPath, "cmdline-tools", "latest");
    await moveIfExists(nestedToolsPath, latestPath);

    if (await pathExists(latestPath)) {
      await moveIfExists(join(latestPath, "bin"), join(installPath, "cmdline-tools", "bin"));
      await moveIfExists(join(latestPath, "lib"), join(installPath, "cmdline-tools", "lib"));
      await moveIfExists(
        join(latestPath, "source.properties"),
        join(installPath, "cmdline-tools", "source.properties"),
      );
      await rm(latestPath, { recursive: true, force: true });
      onLog("已整理 Android Command Line Tools 目录。");
    }
  }
}
