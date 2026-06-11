import type { AvailableVersion, EnvironmentKind } from "./types";
import { androidVersionCatalog } from "./versionCatalogs/android";
import { cmakeVersionCatalog } from "./versionCatalogs/cmake";
import { condaVersionCatalog } from "./versionCatalogs/conda";
import { cppVersionCatalog } from "./versionCatalogs/cpp";
import { dotnetVersionCatalog } from "./versionCatalogs/dotnet";
import { flutterVersionCatalog } from "./versionCatalogs/flutter";
import { goVersionCatalog } from "./versionCatalogs/go";
import { gradleVersionCatalog } from "./versionCatalogs/gradle";
import { javaVersionCatalog } from "./versionCatalogs/java";
import { luaVersionCatalog } from "./versionCatalogs/lua";
import { mavenVersionCatalog } from "./versionCatalogs/maven";
import { mongodbVersionCatalog } from "./versionCatalogs/mongodb";
import { mysqlVersionCatalog } from "./versionCatalogs/mysql";
import { ninjaVersionCatalog } from "./versionCatalogs/ninja";
import { nodeVersionCatalog } from "./versionCatalogs/node";
import { nvmVersionCatalog } from "./versionCatalogs/nvm";
import { phpVersionCatalog } from "./versionCatalogs/php";
import { postgresqlVersionCatalog } from "./versionCatalogs/postgresql";
import { pythonVersionCatalog } from "./versionCatalogs/python";
import { redisVersionCatalog } from "./versionCatalogs/redis";
import { rubyVersionCatalog } from "./versionCatalogs/ruby";
import { rustVersionCatalog } from "./versionCatalogs/rust";
import { sqliteVersionCatalog } from "./versionCatalogs/sqlite";

type VersionCatalog = Record<EnvironmentKind, Record<string, AvailableVersion[]>>;

export const versionCatalog: VersionCatalog = {
  java: javaVersionCatalog,
  python: pythonVersionCatalog,
  conda: condaVersionCatalog,
  go: goVersionCatalog,
  node: nodeVersionCatalog,
  nvm: nvmVersionCatalog,
  maven: mavenVersionCatalog,
  gradle: gradleVersionCatalog,
  cmake: cmakeVersionCatalog,
  ninja: ninjaVersionCatalog,
  cpp: cppVersionCatalog,
  lua: luaVersionCatalog,
  rust: rustVersionCatalog,
  dotnet: dotnetVersionCatalog,
  php: phpVersionCatalog,
  ruby: rubyVersionCatalog,
  flutter: flutterVersionCatalog,
  android: androidVersionCatalog,
  mysql: mysqlVersionCatalog,
  postgresql: postgresqlVersionCatalog,
  mongodb: mongodbVersionCatalog,
  redis: redisVersionCatalog,
  sqlite: sqliteVersionCatalog,
};
