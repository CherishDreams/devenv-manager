import { createVersion, type EnvironmentVersionCatalog } from "./createVersion";

export const rustVersionCatalog: EnvironmentVersionCatalog = {
  rustup: [
    createVersion("rust", "rustup", "stable", "Rust stable", "stable", "installer", "由 rustup 安装稳定工具链"),
    createVersion("rust", "rustup", "beta", "Rust beta", "current", "installer", "由 rustup 安装 beta 工具链"),
    createVersion("rust", "rustup", "nightly", "Rust nightly", "current", "installer", "由 rustup 安装 nightly 工具链"),
  ],
};
