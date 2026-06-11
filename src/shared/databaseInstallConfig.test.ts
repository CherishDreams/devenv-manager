import {
  configurableDatabaseKinds,
  createDefaultDatabaseInstallConfig,
  isConfigurableDatabaseEnvironment,
  mergeDatabaseInstallConfig,
} from "./databaseInstallConfig";

describe("configurableDatabaseKinds", () => {
  it("contains the four configurable database kinds", () => {
    expect(configurableDatabaseKinds).toEqual(["mysql", "postgresql", "mongodb", "redis"]);
  });
});

describe("isConfigurableDatabaseEnvironment", () => {
  it("returns true for configurable database kinds", () => {
    expect(isConfigurableDatabaseEnvironment("mysql")).toBe(true);
    expect(isConfigurableDatabaseEnvironment("postgresql")).toBe(true);
    expect(isConfigurableDatabaseEnvironment("mongodb")).toBe(true);
    expect(isConfigurableDatabaseEnvironment("redis")).toBe(true);
  });

  it("returns false for non-configurable kinds", () => {
    expect(isConfigurableDatabaseEnvironment("sqlite")).toBe(false);
    expect(isConfigurableDatabaseEnvironment("java")).toBe(false);
    expect(isConfigurableDatabaseEnvironment("node")).toBe(false);
  });
});

describe("createDefaultDatabaseInstallConfig", () => {
  it("returns correct defaults for mysql", () => {
    const config = createDefaultDatabaseInstallConfig("mysql");
    expect(config.port).toBe(3306);
    expect(config.charset).toBe("utf8mb4");
    expect(config.bindAddress).toBe("127.0.0.1");
    expect(config.enabled).toBe(true);
    expect(config.installAsService).toBe(false);
    expect(config.startService).toBe(false);
  });

  it("returns correct defaults for postgresql", () => {
    const config = createDefaultDatabaseInstallConfig("postgresql");
    expect(config.port).toBe(5432);
    expect(config.charset).toBe("UTF8");
  });

  it("returns correct defaults for mongodb", () => {
    const config = createDefaultDatabaseInstallConfig("mongodb");
    expect(config.port).toBe(27017);
    expect(config.charset).toBe("");
  });

  it("returns correct defaults for redis", () => {
    const config = createDefaultDatabaseInstallConfig("redis");
    expect(config.port).toBe(6379);
  });

  it("returns a new object each time (not shared reference)", () => {
    const config1 = createDefaultDatabaseInstallConfig("mysql");
    const config2 = createDefaultDatabaseInstallConfig("mysql");
    expect(config1).not.toBe(config2);
    expect(config1).toEqual(config2);
  });
});

describe("mergeDatabaseInstallConfig", () => {
  it("returns defaults when no override is provided", () => {
    const config = mergeDatabaseInstallConfig("mysql");
    expect(config.port).toBe(3306);
    expect(config.charset).toBe("utf8mb4");
  });

  it("returns defaults when undefined is provided", () => {
    const config = mergeDatabaseInstallConfig("mysql", undefined);
    expect(config.port).toBe(3306);
  });

  it("overrides specific fields while keeping defaults for others", () => {
    const defaults = createDefaultDatabaseInstallConfig("mysql");
    const config = mergeDatabaseInstallConfig("mysql", { ...defaults, port: 3307, charset: "utf8" });
    expect(config.port).toBe(3307);
    expect(config.charset).toBe("utf8");
    expect(config.bindAddress).toBe("127.0.0.1");
    expect(config.enabled).toBe(true);
  });

  it("allows overriding enabled flag", () => {
    const defaults = createDefaultDatabaseInstallConfig("mysql");
    const config = mergeDatabaseInstallConfig("mysql", { ...defaults, enabled: false });
    expect(config.enabled).toBe(false);
    expect(config.port).toBe(3306);
  });
});
