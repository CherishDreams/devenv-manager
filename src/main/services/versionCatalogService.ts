import type { AppConfig, AvailableVersion, VersionCatalogQuery } from "../../shared/types";
import type { ConfigService } from "./configService";
import { getErrorMessage } from "../../shared/errorUtils";
import { listAndroidVersions } from "./versionCatalog/androidProvider";
import { listCMakeVersions } from "./versionCatalog/cmakeProvider";
import { listCondaVersions } from "./versionCatalog/condaProvider";
import { listCppVersions } from "./versionCatalog/cppProvider";
import { listDotnetVersions } from "./versionCatalog/dotnetProvider";
import { listFlutterVersions } from "./versionCatalog/flutterProvider";
import { listGoVersions } from "./versionCatalog/goProvider";
import { listGradleVersions } from "./versionCatalog/gradleProvider";
import { listJavaVersions } from "./versionCatalog/javaProvider";
import { listLuaVersions } from "./versionCatalog/luaProvider";
import { listMavenVersions } from "./versionCatalog/mavenProvider";
import { listMongoDbVersions } from "./versionCatalog/mongodbProvider";
import { listMySqlVersions } from "./versionCatalog/mysqlProvider";
import { listNinjaVersions } from "./versionCatalog/ninjaProvider";
import { listNodeVersions } from "./versionCatalog/nodeProvider";
import { listNvmVersions } from "./versionCatalog/nvmProvider";
import { listPhpVersions } from "./versionCatalog/phpProvider";
import { listPostgresqlVersions } from "./versionCatalog/postgresqlProvider";
import { listPythonVersions } from "./versionCatalog/pythonProvider";
import { listRedisVersions } from "./versionCatalog/redisProvider";
import { listRubyVersions } from "./versionCatalog/rubyProvider";
import { listRustVersions } from "./versionCatalog/rustProvider";
import { listSqliteVersions } from "./versionCatalog/sqliteProvider";
import { getStaticVersions } from "./versionCatalog/utils";

export class VersionCatalogService {
  constructor(private readonly configService: ConfigService) {}

  async listVersions(query: VersionCatalogQuery): Promise<AvailableVersion[]> {
    const config = await this.configService.get();

    try {
      return await this.listOnlineVersions(query, config);
    } catch (error) {
      const fallbackVersions = getStaticVersions(query);

      if (fallbackVersions.length === 0) {
        throw error;
      }

      return fallbackVersions.map((version) => ({
        ...version,
        notes: `在线获取失败，已使用内置目录：${getErrorMessage(error)}`,
      }));
    }
  }

  private listOnlineVersions(query: VersionCatalogQuery, config: AppConfig): Promise<AvailableVersion[]> {
    switch (query.environment) {
      case "java":
        return listJavaVersions(query, config);
      case "python":
        return query.vendor === "cpython" ? listPythonVersions(config) : Promise.resolve(getStaticVersions(query));
      case "conda":
        return listCondaVersions(query, config);
      case "go":
        return query.vendor === "golang" ? listGoVersions(config) : Promise.resolve(getStaticVersions(query));
      case "node":
        return query.vendor === "nodejs" ? listNodeVersions(config) : Promise.resolve(getStaticVersions(query));
      case "nvm":
        return query.vendor === "coreybutler" ? listNvmVersions(config) : Promise.resolve(getStaticVersions(query));
      case "maven":
        return query.vendor === "apache" ? listMavenVersions(config) : Promise.resolve(getStaticVersions(query));
      case "gradle":
        return query.vendor === "gradle" ? listGradleVersions(config) : Promise.resolve(getStaticVersions(query));
      case "cmake":
        return query.vendor === "kitware" ? listCMakeVersions(config) : Promise.resolve(getStaticVersions(query));
      case "ninja":
        return query.vendor === "ninja-build" ? listNinjaVersions(config) : Promise.resolve(getStaticVersions(query));
      case "cpp":
        return query.vendor === "llvm-mingw" ? listCppVersions(config) : Promise.resolve(getStaticVersions(query));
      case "lua":
        return query.vendor === "luabinaries" ? listLuaVersions(config) : Promise.resolve(getStaticVersions(query));
      case "rust":
        return Promise.resolve(query.vendor === "rustup" ? listRustVersions(config) : getStaticVersions(query));
      case "dotnet":
        return query.vendor === "microsoft" ? listDotnetVersions(config) : Promise.resolve(getStaticVersions(query));
      case "php":
        return query.vendor === "windows" ? listPhpVersions(config) : Promise.resolve(getStaticVersions(query));
      case "ruby":
        return query.vendor === "rubyinstaller" ? listRubyVersions(config) : Promise.resolve(getStaticVersions(query));
      case "flutter":
        return query.vendor === "google" ? listFlutterVersions(config) : Promise.resolve(getStaticVersions(query));
      case "android":
        return Promise.resolve(query.vendor === "google" ? listAndroidVersions(config) : getStaticVersions(query));
      case "mysql":
        return query.vendor === "community" ? listMySqlVersions(config) : Promise.resolve(getStaticVersions(query));
      case "postgresql":
        return query.vendor === "edb" ? listPostgresqlVersions(config) : Promise.resolve(getStaticVersions(query));
      case "mongodb":
        return Promise.resolve(query.vendor === "community" ? listMongoDbVersions(config) : getStaticVersions(query));
      case "redis":
        return query.vendor === "redis-windows" ? listRedisVersions(config) : Promise.resolve(getStaticVersions(query));
      case "sqlite":
        return query.vendor === "sqlite" ? listSqliteVersions(config) : Promise.resolve(getStaticVersions(query));
      default: {
        const unhandled: never = query.environment;
        throw new Error(`不支持的环境类型：${String(unhandled)}`);
      }
    }
  }
}
