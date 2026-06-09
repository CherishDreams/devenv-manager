import type { AppConfig, AvailableVersion } from "../../../shared/types";
import { getStaticVersionsWithMirrorNote } from "./utils";

export function listAndroidVersions(config: AppConfig): AvailableVersion[] {
  return getStaticVersionsWithMirrorNote({ environment: "android", vendor: "google" }, config.mirrors.android);
}
