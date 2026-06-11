import type {
  ConfigurableDatabaseEnvironmentKind,
  DatabaseInstallConfig,
  EnvironmentKind,
} from "./types";

export const configurableDatabaseKinds = ["mysql", "postgresql", "mongodb", "redis"] as const;

export function isConfigurableDatabaseEnvironment(
  environment: EnvironmentKind,
): environment is ConfigurableDatabaseEnvironmentKind {
  return configurableDatabaseKinds.includes(environment as ConfigurableDatabaseEnvironmentKind);
}

const defaultDatabaseConfigs: Record<ConfigurableDatabaseEnvironmentKind, DatabaseInstallConfig> = {
  mysql: {
    enabled: true,
    installAsService: false,
    startService: false,
    serviceName: "EnvManagerMySQL3306",
    port: 3306,
    bindAddress: "127.0.0.1",
    charset: "utf8mb4",
    collation: "utf8mb4_0900_ai_ci",
  },
  postgresql: {
    enabled: true,
    installAsService: false,
    startService: false,
    serviceName: "EnvManagerPostgreSQL5432",
    port: 5432,
    bindAddress: "127.0.0.1",
    charset: "UTF8",
    collation: "C",
  },
  mongodb: {
    enabled: true,
    installAsService: false,
    startService: false,
    serviceName: "EnvManagerMongoDB27017",
    port: 27017,
    bindAddress: "127.0.0.1",
    charset: "",
  },
  redis: {
    enabled: true,
    installAsService: false,
    startService: false,
    serviceName: "EnvManagerRedis6379",
    port: 6379,
    bindAddress: "127.0.0.1",
    charset: "",
  },
};

export function createDefaultDatabaseInstallConfig(
  environment: ConfigurableDatabaseEnvironmentKind,
): DatabaseInstallConfig {
  return {
    ...defaultDatabaseConfigs[environment],
  };
}

export function mergeDatabaseInstallConfig(
  environment: ConfigurableDatabaseEnvironmentKind,
  config?: DatabaseInstallConfig,
): DatabaseInstallConfig {
  return {
    ...createDefaultDatabaseInstallConfig(environment),
    ...config,
  };
}
