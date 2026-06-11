# 环境管理 DevEnv Manager

[English](README_EN.md)

Windows 开发者环境管理桌面工具，基于 Electron、React、Ant Design、Zustand 和 pnpm 构建。

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

## 技术栈

- Electron 35
- electron-vite
- React 18
- TypeScript
- Ant Design 5
- Zustand
- pnpm
- undici

## 运行要求

- Windows
- Node.js
- pnpm

打包后的 Windows 安装版会请求管理员权限，因为系统环境变量写入需要提权。开发模式下，切换或安装环境时如果涉及系统环境变量配置，也可能需要以管理员身份运行 Electron 进程。

## 快速开始

安装依赖：

```powershell
pnpm install
```

启动开发环境：

```powershell
pnpm dev
```

构建应用：

```powershell
pnpm build
```

打包 Windows 安装包：

```powershell
pnpm dist
```

## 项目结构

```text
src/
  main/       Electron 主进程、IPC、安装任务和 Windows 服务
  preload/    安全的渲染进程到主进程桥接
  renderer/   React UI、状态管理、页面、样式和素材
  shared/     共享类型、环境定义和版本目录
```

核心模块：

- `src/shared/environmentDefinitions.ts`：环境元数据、厂商、环境变量和 PATH 条目
- `src/shared/versionCatalogs/`：静态离线版本目录，按环境分类
- `src/main/services/versionCatalog/`：在线版本提供器
- `src/main/services/installer/resources/`：各环境的包 URL 解析器
- `src/main/services/installer/`：下载、解压、安装器执行和验证
- `src/main/services/taskService.ts`：持久化的安装任务队列和日志
- `src/main/services/environmentRecordService.ts`：已安装/接管环境记录和版本切换
- `src/renderer/src/pages/`：主要 UI 页面

## 数据与安装路径

应用将用户配置和任务记录存储在 Electron 的 `userData` 目录下。

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

  <img src="build/wechat-sponsor.png" alt="微信赞赏码" width="200" />
