import type { AppConfig, AvailableVersion } from "../../../shared/types";
import { getStaticVersionsWithMirrorNote } from "./utils";

export function listMongoDbVersions(config: AppConfig): AvailableVersion[] {
  return getStaticVersionsWithMirrorNote({ environment: "mongodb", vendor: "community" }, config.mirrors.mongodb);
}
