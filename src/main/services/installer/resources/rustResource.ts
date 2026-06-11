import type { AppConfig, InstallTaskInput } from "../../../../shared/types";
import type { PackageResource } from "../types";
import { getMirrorSourceName } from "../../../../shared/mirrorPresets";

export function resolveRustResource(input: InstallTaskInput, config: AppConfig): PackageResource {
  if ((input.vendor ?? "rustup") !== "rustup") {
    throw new Error("当前自动安装暂只支持 rustup。");
  }

  const configuredMirror = config.mirrors.rust.trim();
  const baseUrl =
    configuredMirror && configuredMirror !== "official"
      ? configuredMirror.replace(/\/+$/, "")
      : "https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc";

  return {
    url: `${baseUrl}/rustup-init.exe`,
    fileName: `rustup-init-${input.version}.exe`,
    packageType: "installer",
    resolvedVersion: input.version,
    sourceName: getMirrorSourceName("rust", configuredMirror, "Rust 官方源"),
  };
}
