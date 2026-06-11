import type {
  ConfigurableDatabaseEnvironmentKind,
  DatabaseInstallConfig,
  InstallTaskInput,
  TaskLogEntry,
} from "../../../shared/types";
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  isConfigurableDatabaseEnvironment,
  mergeDatabaseInstallConfig,
} from "../../../shared/databaseInstallConfig";
import { compareVersion } from "./environmentMetadata";
import { pathExists } from "./fileSystem";
import { runProcess } from "./process";

type LogFn = (message: string, level?: TaskLogEntry["level"]) => void;

const generatedConfigStart = "# >>> Env Manager database config >>>";
const generatedConfigEnd = "# <<< Env Manager database config <<<";

function toConfigPath(path: string): string {
  return path.replace(/\\/g, "/");
}

function quoteConfigValue(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function normalizePort(port: number): number {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("数据库端口必须在 1 到 65535 之间。");
  }

  return port;
}

function normalizeBindAddress(value: string): string {
  return value.trim() || "127.0.0.1";
}

function normalizeServiceName(value: string, environment: ConfigurableDatabaseEnvironmentKind): string {
  const serviceName = value.trim();

  if (!serviceName) {
    throw new Error("注册 Windows 服务时必须填写服务名。");
  }

  if (!/^[\w.-]+$/.test(serviceName)) {
    throw new Error(`${environment} 服务名只能包含英文字母、数字、下划线、点或短横线。`);
  }

  return serviceName;
}

async function directoryHasEntries(path: string): Promise<boolean> {
  if (!(await pathExists(path))) {
    return false;
  }

  return (await readdir(path)).length > 0;
}

async function appendGeneratedBlock(path: string, lines: string[]): Promise<void> {
  const block = [generatedConfigStart, ...lines, generatedConfigEnd].join("\r\n");
  let current = "";

  if (await pathExists(path)) {
    current = await readFile(path, "utf8");
  }

  const pattern = new RegExp(`${generatedConfigStart}[\\s\\S]*?${generatedConfigEnd}`);
  const next = pattern.test(current) ? current.replace(pattern, block) : [current.trimEnd(), block, ""].join("\r\n");
  await writeFile(path, next, "utf8");
}

async function startWindowsService(serviceName: string, signal: AbortSignal): Promise<void> {
  await runProcess("net.exe", ["start", serviceName], signal);
}

function normalizeConfig(
  environment: ConfigurableDatabaseEnvironmentKind,
  config: DatabaseInstallConfig,
): DatabaseInstallConfig {
  return {
    ...config,
    port: normalizePort(config.port),
    bindAddress: normalizeBindAddress(config.bindAddress),
    serviceName: config.installAsService ? normalizeServiceName(config.serviceName, environment) : config.serviceName,
    charset: config.charset.trim(),
    collation: config.collation?.trim(),
  };
}

async function setupMySql(
  input: InstallTaskInput,
  installPath: string,
  config: DatabaseInstallConfig,
  onLog: LogFn,
  signal: AbortSignal,
): Promise<void> {
  const dataDir = join(installPath, "data");
  const myCnfPath = join(installPath, "my.cnf");
  const myIniPath = join(installPath, "my.ini");
  const mysqldPath = join(installPath, "bin", "mysqld.exe");
  const charset = config.charset || "utf8mb4";
  const lines = [
    "[mysqld]",
    `basedir=${toConfigPath(installPath)}`,
    `datadir=${toConfigPath(dataDir)}`,
    `port=${config.port}`,
    `bind-address=${config.bindAddress}`,
    `character-set-server=${charset}`,
    config.collation ? `collation-server=${config.collation}` : undefined,
    "explicit_defaults_for_timestamp=ON",
    "",
    "[client]",
    `port=${config.port}`,
    `default-character-set=${charset}`,
    "",
  ].filter((line): line is string => typeof line === "string");

  await writeFile(myCnfPath, lines.join("\r\n"), "utf8");
  await copyFile(myCnfPath, myIniPath);
  onLog(`已写入 MySQL 配置：${myCnfPath}`);

  const dataDirHasContent = await directoryHasEntries(dataDir);

  if (!dataDirHasContent && compareVersion(input.version, "5.7.0") >= 0) {
    await rm(dataDir, { recursive: true, force: true });
    onLog("正在初始化 MySQL data 目录，默认 root 为空密码。");
    await runProcess(mysqldPath, [`--defaults-file=${myCnfPath}`, "--initialize-insecure", "--console"], signal);
  } else if (!dataDirHasContent) {
    onLog("当前 MySQL 历史版本未自动初始化 data 目录，将使用压缩包自带目录。", "warn");
  }

  if (!config.installAsService) {
    onLog("MySQL 未注册 Windows 服务，可使用 mysqld --defaults-file 启动。");
    return;
  }

  await runProcess(mysqldPath, [`--defaults-file=${myCnfPath}`, "--install", config.serviceName], signal);
  onLog(`已注册 MySQL Windows 服务：${config.serviceName}`);

  if (config.startService) {
    await startWindowsService(config.serviceName, signal);
    onLog(`已启动 MySQL Windows 服务：${config.serviceName}`);
  }
}

async function setupPostgreSql(
  installPath: string,
  config: DatabaseInstallConfig,
  onLog: LogFn,
  signal: AbortSignal,
): Promise<void> {
  const dataDir = join(installPath, "data");
  const initdbPath = join(installPath, "bin", "initdb.exe");
  const pgCtlPath = join(installPath, "bin", "pg_ctl.exe");
  const configPath = join(dataDir, "postgresql.conf");
  const charset = config.charset || "UTF8";
  const locale = config.collation || "C";
  const dataDirHasContent = await directoryHasEntries(dataDir);

  if (!dataDirHasContent) {
    await rm(dataDir, { recursive: true, force: true });
    onLog("正在初始化 PostgreSQL data 目录，默认用户 postgres，认证方式 trust。");
    await runProcess(
      initdbPath,
      ["-D", dataDir, "-U", "postgres", "-A", "trust", "-E", charset, locale === "C" ? "--no-locale" : `--locale=${locale}`],
      signal,
    );
  }

  await appendGeneratedBlock(configPath, [
    `listen_addresses = '${config.bindAddress}'`,
    `port = ${config.port}`,
    `client_encoding = '${charset}'`,
  ]);
  onLog(`已写入 PostgreSQL 配置：${configPath}`);

  if (!config.installAsService) {
    onLog("PostgreSQL 未注册 Windows 服务，可使用 pg_ctl 指定 data 目录启动。");
    return;
  }

  await runProcess(pgCtlPath, ["register", "-N", config.serviceName, "-D", dataDir], signal);
  onLog(`已注册 PostgreSQL Windows 服务：${config.serviceName}`);

  if (config.startService) {
    await startWindowsService(config.serviceName, signal);
    onLog(`已启动 PostgreSQL Windows 服务：${config.serviceName}`);
  }
}

async function setupMongoDb(
  installPath: string,
  config: DatabaseInstallConfig,
  onLog: LogFn,
  signal: AbortSignal,
): Promise<void> {
  const dataDir = join(installPath, "data");
  const logDir = join(installPath, "log");
  const configPath = join(installPath, "mongod.cfg");
  const mongodPath = join(installPath, "bin", "mongod.exe");

  await mkdir(dataDir, { recursive: true });
  await mkdir(logDir, { recursive: true });
  await writeFile(
    configPath,
    [
      "systemLog:",
      "  destination: file",
      `  path: ${quoteConfigValue(toConfigPath(join(logDir, "mongod.log")))}`,
      "  logAppend: true",
      "storage:",
      `  dbPath: ${quoteConfigValue(toConfigPath(dataDir))}`,
      "net:",
      `  bindIp: ${config.bindAddress}`,
      `  port: ${config.port}`,
      "",
    ].join("\r\n"),
    "utf8",
  );
  onLog(`已写入 MongoDB 配置：${configPath}`);

  if (!config.installAsService) {
    onLog("MongoDB 未注册 Windows 服务，可使用 mongod --config 启动。");
    return;
  }

  await runProcess(
    mongodPath,
    ["--config", configPath, "--install", "--serviceName", config.serviceName, "--serviceDisplayName", config.serviceName],
    signal,
  );
  onLog(`已注册 MongoDB Windows 服务：${config.serviceName}`);

  if (config.startService) {
    await startWindowsService(config.serviceName, signal);
    onLog(`已启动 MongoDB Windows 服务：${config.serviceName}`);
  }
}

async function setupRedis(
  installPath: string,
  config: DatabaseInstallConfig,
  onLog: LogFn,
  signal: AbortSignal,
): Promise<void> {
  const dataDir = join(installPath, "data");
  const configPath = join(installPath, "redis.windows.conf");
  const redisServerPath = join(installPath, "redis-server.exe");

  await mkdir(dataDir, { recursive: true });
  await writeFile(
    configPath,
    [
      `bind ${config.bindAddress}`,
      `port ${config.port}`,
      `dir ${quoteConfigValue(toConfigPath(dataDir))}`,
      `logfile ${quoteConfigValue(toConfigPath(join(installPath, "redis-server.log")))}`,
      "databases 16",
      "",
    ].join("\r\n"),
    "utf8",
  );
  onLog(`已写入 Redis 配置：${configPath}`);

  if (!config.installAsService) {
    onLog("Redis 未注册 Windows 服务，可使用 redis-server.exe redis.windows.conf 启动。");
    return;
  }

  await runProcess(redisServerPath, ["--service-install", configPath, "--service-name", config.serviceName], signal);
  onLog(`已注册 Redis Windows 服务：${config.serviceName}`);

  if (config.startService) {
    await runProcess(redisServerPath, ["--service-start", "--service-name", config.serviceName], signal);
    onLog(`已启动 Redis Windows 服务：${config.serviceName}`);
  }
}

export async function applyDatabaseInstallConfig(
  input: InstallTaskInput,
  installPath: string,
  onLog: LogFn,
  signal: AbortSignal,
): Promise<void> {
  if (!isConfigurableDatabaseEnvironment(input.environment)) {
    return;
  }

  const config = normalizeConfig(input.environment, mergeDatabaseInstallConfig(input.environment, input.databaseConfig));

  if (!config.enabled) {
    onLog("已跳过数据库运行配置。", "warn");
    return;
  }

  switch (input.environment) {
    case "mysql":
      await setupMySql(input, installPath, config, onLog, signal);
      break;
    case "postgresql":
      await setupPostgreSql(installPath, config, onLog, signal);
      break;
    case "mongodb":
      await setupMongoDb(installPath, config, onLog, signal);
      break;
    case "redis":
      await setupRedis(installPath, config, onLog, signal);
      break;
    default:
      throw new Error(`数据库环境不支持：${String(input.environment)}`);
  }
}
