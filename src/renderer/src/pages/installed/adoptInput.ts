import type { AdoptEnvironmentInput, DiscoveredEnvironment } from "@shared/types";

export function createAdoptInput(item: DiscoveredEnvironment): AdoptEnvironmentInput {
  return {
    environment: item.environment,
    name: item.name,
    vendor: item.vendor,
    version: item.version,
    installPath: item.installPath,
    envVars: item.envVars,
    pathEntries: item.pathEntries,
    source: item.source,
    active: item.active,
    ownership: "adopted",
    uninstallPolicy: "remove-record-only",
  };
}
