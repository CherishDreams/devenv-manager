import type { AppConfig, InstallTaskInput } from "../../../shared/types";
import type { PackageResource } from "./types";
import { resolveAndroidResource } from "./resources/androidResource";
import { resolveCMakeResource } from "./resources/cmakeResource";
import { resolveCondaResource } from "./resources/condaResource";
import { resolveCppResource } from "./resources/cppResource";
import { resolveDotnetResource } from "./resources/dotnetResource";
import { resolveFlutterResource } from "./resources/flutterResource";
import { resolveGoResource } from "./resources/goResource";
import { resolveGradleResource } from "./resources/gradleResource";
import { resolveJavaResource } from "./resources/javaResource";
import { resolveLuaResource } from "./resources/luaResource";
import { resolveMavenResource } from "./resources/mavenResource";
import { resolveMongoDbResource } from "./resources/mongodbResource";
import { resolveMySqlResource } from "./resources/mysqlResource";
import { resolveNinjaResource } from "./resources/ninjaResource";
import { resolveNodeResource } from "./resources/nodeResource";
import { resolveNvmResource } from "./resources/nvmResource";
import { resolvePhpResource } from "./resources/phpResource";
import { resolvePostgresqlResource } from "./resources/postgresqlResource";
import { resolvePythonResource } from "./resources/pythonResource";
import { resolveRedisResource } from "./resources/redisResource";
import { resolveRubyResource } from "./resources/rubyResource";
import { resolveRustResource } from "./resources/rustResource";
import { resolveSqliteResource } from "./resources/sqliteResource";

export async function resolveResource(
  input: InstallTaskInput,
  config: AppConfig,
  signal: AbortSignal,
): Promise<PackageResource> {
  switch (input.environment) {
    case "java":
      return resolveJavaResource(input, config, signal);
    case "python":
      return resolvePythonResource(input, config);
    case "conda":
      return resolveCondaResource(input, config);
    case "go":
      return resolveGoResource(input, config, signal);
    case "node":
      return resolveNodeResource(input, config, signal);
    case "nvm":
      return resolveNvmResource(input, config);
    case "maven":
      return resolveMavenResource(input, config, signal);
    case "gradle":
      return resolveGradleResource(input, config);
    case "cmake":
      return resolveCMakeResource(input, config);
    case "ninja":
      return resolveNinjaResource(input, config);
    case "cpp":
      return resolveCppResource(input, config);
    case "lua":
      return resolveLuaResource(input, config);
    case "rust":
      return resolveRustResource(input, config);
    case "dotnet":
      return resolveDotnetResource(input, config);
    case "php":
      return resolvePhpResource(input, config);
    case "ruby":
      return resolveRubyResource(input, config);
    case "flutter":
      return resolveFlutterResource(input, config);
    case "android":
      return resolveAndroidResource(input, config);
    case "mysql":
      return resolveMySqlResource(input, config);
    case "postgresql":
      return resolvePostgresqlResource(input, config, signal);
    case "mongodb":
      return resolveMongoDbResource(input, config);
    case "redis":
      return resolveRedisResource(input, config);
    case "sqlite":
      return resolveSqliteResource(input, config);
    default: {
      const unhandled: never = input.environment;
      throw new Error(`不支持的环境类型：${String(unhandled)}`);
    }
  }
}
