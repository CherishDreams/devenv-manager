import { versionCatalog } from "../../shared/versionCatalog";
import type { AvailableVersion, VersionCatalogQuery } from "../../shared/types";

export class VersionCatalogService {
  async listVersions(query: VersionCatalogQuery): Promise<AvailableVersion[]> {
    return versionCatalog[query.environment]?.[query.vendor] ?? [];
  }
}
