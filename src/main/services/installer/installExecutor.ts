import { copyFile, mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { InstallTaskInput, TaskLogEntry } from "../../../shared/types";
import { compareVersion } from "./environmentMetadata";
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
    await runProcess(installerPath, ["/verysilent", "/suppressmsgboxes", "/norestart", `/dir=${installPath}`, "/tasks="], signal);
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
  signal: AbortSignal,
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
      await moveIfExists(join(latestPath, "source.properties"), join(installPath, "cmdline-tools", "source.properties"));
      await rm(latestPath, { recursive: true, force: true });
      onLog("已整理 Android Command Line Tools 目录。");
    }
    return;
  }

  if (input.environment === "mysql") {
    const dataDir = join(installPath, "data");
    const myIniPath = join(installPath, "my.ini");
    const dataDirHasContent = (await pathExists(dataDir)) && (await readdir(dataDir)).length > 0;

    await writeFile(
      myIniPath,
      [
        "[mysqld]",
        `basedir=${installPath.replace(/\\/g, "/")}`,
        `datadir=${dataDir.replace(/\\/g, "/")}`,
        "port=3306",
        "character-set-server=utf8mb4",
        "",
        "[client]",
        "default-character-set=utf8mb4",
        "",
      ].join("\r\n"),
      "utf8",
    );

    if (!dataDirHasContent && compareVersion(input.version, "5.7.0") >= 0) {
      await rm(dataDir, { recursive: true, force: true });
      onLog("正在初始化 MySQL data 目录，默认 root 为空密码。");
      await runProcess(
        join(installPath, "bin", "mysqld.exe"),
        ["--initialize-insecure", `--basedir=${installPath}`, `--datadir=${dataDir}`, "--console"],
        signal,
      );
    } else if (!dataDirHasContent) {
      onLog("当前 MySQL 历史版本未自动初始化 data 目录，将使用压缩包自带目录。", "warn");
    }

    onLog("已写入 MySQL my.ini；未注册 Windows 服务。");
    return;
  }

  if (input.environment === "postgresql") {
    const dataDir = join(installPath, "data");
    const dataDirHasContent = (await pathExists(dataDir)) && (await readdir(dataDir)).length > 0;

    if (!dataDirHasContent) {
      await rm(dataDir, { recursive: true, force: true });
      onLog("正在初始化 PostgreSQL data 目录，默认用户 postgres，认证方式 trust。");
      await runProcess(
        join(installPath, "bin", "initdb.exe"),
        ["-D", dataDir, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--no-locale"],
        signal,
      );
    }

    onLog("PostgreSQL data 目录已就绪；未注册 Windows 服务。");
  }
}
