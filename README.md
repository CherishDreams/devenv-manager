# 环境管理 DevEnv Manager

[English](README_EN.md)

Windows 开发者环境管理桌面工具，基于 Tauri 2、Rust、React、Ant Design、Zustand 和 pnpm 构建。

DevEnv Manager 帮助你在一款桌面应用中完成开发运行时的安装、接管、切换和卸载。它专注于多版本共存、可预期的安装路径、任务日志、代理与镜像源配置，以及 Windows 环境变量管理。

## 功能特性

- 统一桌面应用管理多种开发者运行时
- 安装到全局目录或自定义路径，自动下载匹配的 Windows x64 安装包
- 多版本共存，一键切换当前激活版本
- 任务队列管理：实时进度、下载大小/速度、分页日志
- 失败任务原地重试，运行中任务可取消，历史日志可清理
- 两种环境变量管理模式：
  - **软链接模式**：通过应用管理的符号链接切换活跃版本，减少直接修改系统环境变量
  - **直接模式**：直接将环境变量指向所选版本
- 接管系统中已有的环境，无需删除原始目录
- 卸载时可选择删除目录或仅移除记录
- 代理和镜像源配置，加速国内下载
- 数据库安装时可配置服务、端口、字符集等参数
- 默认主题与液态玻璃主题，侧边栏经典布局与图标浮栏布局

## 支持的环境

编程语言与运行时：

- Java JDK：Eclipse Temurin、Azul Zulu、BellSoft Liberica、Oracle JDK
- Python：CPython
- Conda：Miniconda、Anaconda
- Go
- Node.js
- nvm-windows
- C++：LLVM-MinGW
- Lua
- Rust
- .NET SDK
- PHP
- Ruby

构建工具：

- Maven
- Gradle
- CMake
- Ninja

移动开发：

- Flutter
- Android SDK 命令行工具

数据库与工具：

- MySQL
- PostgreSQL
- MongoDB
- Redis for Windows
- SQLite 工具

## 运行要求

- Windows
- Node.js
- pnpm
- Rust（开发环境需要，用于编译后端）

打包后的 Windows 安装版会请求管理员权限，因为系统环境变量写入需要提权。开发模式下，切换或安装环境时如果涉及系统环境变量配置，也可能需要以管理员身份运行应用。

## 快速开始

安装依赖：

```powershell
pnpm install
```

启动开发环境（同时启动 Vite 前端和 Tauri 后端）：

```powershell
pnpm dev
```

类型检查与前端构建：

```powershell
pnpm build
```

打包 Windows 安装包（NSIS）：

```powershell
pnpm dist
```

## 项目结构

```text
src/
  renderer/   React UI、状态管理、页面、样式和素材
  shared/     共享类型、环境定义和版本目录
src-tauri/
  src/        Rust 后端：IPC 命令、服务层、安装器和环境管理
  capabilities/  Tauri 权限与能力配置
  tauri.conf.json  Tauri 应用配置
```

核心模块：

- `src/shared/environmentDefinitions.ts`：环境元数据、厂商、环境变量和 PATH 条目
- `src/shared/versionCatalogs/`：静态离线版本目录，按环境分类
- `src-tauri/src/services/version_catalog/`：在线版本提供器
- `src-tauri/src/services/installer/`：下载、解压、安装器执行和验证
- `src-tauri/src/services/task_service.rs`：持久化的安装任务队列和日志
- `src-tauri/src/services/environment_record.rs`：已安装/接管环境记录和版本切换
- `src-tauri/src/commands/`：Tauri IPC 命令入口
- `src/renderer/src/pages/`：主要 UI 页面

## 数据与安装路径

应用将用户配置和任务记录存储在 Tauri 的 `AppData` 目录下（`%APPDATA%\com.local.envmanager\`）。

安装目录和下载缓存目录可在设置中配置。本地测试时，`E:\dev_env` 是一个方便的安装根目录，下载缓存位于 `E:\dev_env\.cache`。

## 环境管理说明

- 软链接模式旨在减少对用户/系统环境变量的直接修改，活跃版本指向应用管理的 current 目录
- 直接模式会将环境变量更新为指向所选版本
- 系统级写入需要管理员权限
- 接管的环境会被注册以便切换和显示，但移除接管记录不会删除原始目录
- 应用会避免管理从自身 current 链接目录和常见 WindowsApps 路径中发现的环境

## 当前范围

本项目目前仅面向 Windows 桌面使用，包解析和安装逻辑针对 Windows x64 归档/安装器实现，其他平台不在当前范围内。

部分生态在安装基础工具后还需要后续步骤。例如 Android SDK 命令行工具可能仍需要根据工作流安装平台包、构建工具或 Java。

## 开源协议

本项目采用 [MIT](LICENSE) 开源协议。

## 赞助

如果这个项目对你有帮助，欢迎赞助支持开发：

- **微信赞赏**：扫描下方二维码

  <img src="assets/wechat-sponsor.png" alt="微信赞赏码" width="200" />
