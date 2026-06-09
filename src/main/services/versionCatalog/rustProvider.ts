import type { AppConfig, AvailableVersion } from "../../../shared/types";
import { getStaticVersionsWithMirrorNote } from "./utils";

export function listRustVersions(config: AppConfig): AvailableVersion[] {
  return getStaticVersionsWithMirrorNote({ environment: "rust", vendor: "rustup" }, config.mirrors.rust);
}
