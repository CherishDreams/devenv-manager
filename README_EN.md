# DevEnv Manager

[中文](README.md)

Windows desktop environment manager for developer runtimes, built with Tauri 2, Rust, React, Ant Design, Zustand and pnpm.

DevEnv Manager helps you install, adopt, switch and remove local development runtimes from a single desktop app. It focuses on multi-version coexistence, predictable installation paths, task logs, proxy/mirror configuration and Windows environment variable management.

## Features

- Manage multiple developer runtimes from one desktop app
- Install into a global directory or a custom path, with automatic download of matching Windows x64 packages
- Keep multiple versions side by side and switch the active version with one click
- Task queue management: real-time progress, download size/speed, paginated logs
- Retry failed tasks in place, cancel running tasks, clear historical logs
- Two environment variable management modes:
  - **Symlink mode**: switch active versions through app-managed symbolic links, minimizing direct edits to system environment variables
  - **Direct mode**: write environment variables to point directly at the selected version
- Adopt existing system environments without deleting their original directories
- Choose to delete directories or only remove records on uninstall
- Proxy and mirror source configuration for faster downloads
- Database installation with configurable service, port, charset and more
- Default and liquid-glass UI themes; classic sidebar and icon rail navigation layouts

## Supported Environments

Programming languages and runtimes:

- Java JDK: Eclipse Temurin, Azul Zulu, BellSoft Liberica, Oracle JDK
- Python: CPython
- Conda: Miniconda, Anaconda
- Go
- Node.js
- nvm-windows
- C++: LLVM-MinGW
- Lua
- Rust
- .NET SDK
- PHP
- Ruby

Build tools:

- Maven
- Gradle
- CMake
- Ninja

Mobile development:

- Flutter
- Android SDK command line tools

Databases and database tools:

- MySQL
- PostgreSQL
- MongoDB
- Redis for Windows
- SQLite tools

## Requirements

- Windows
- Node.js
- pnpm
- Rust (required for development, used to compile the backend)

The packaged Windows app requests administrator privileges because system environment variable writes require elevation. In development mode, switching or installing with system environment configuration may also require an elevated process.

## Getting Started

Install dependencies:

```powershell
pnpm install
```

Start the development app (launches both Vite frontend and Tauri backend):

```powershell
pnpm dev
```

Type check and build frontend:

```powershell
pnpm build
```

Create a Windows installer (NSIS):

```powershell
pnpm dist
```

## Project Structure

```text
src/
  renderer/   React UI, stores, pages, styles and assets
  shared/     Shared types, environment definitions and version catalogs
src-tauri/
  src/        Rust backend: IPC commands, services, installer and environment management
  capabilities/  Tauri permissions and capability configuration
  tauri.conf.json  Tauri application configuration
```

Key modules:

- `src/shared/environmentDefinitions.ts`: environment metadata, vendors, env vars and PATH entries
- `src/shared/versionCatalogs/`: static offline version catalogs split by environment
- `src-tauri/src/services/version_catalog/`: online version providers
- `src-tauri/src/services/installer/`: download, extraction, installer execution and verification
- `src-tauri/src/services/task_service.rs`: persisted install task queue and logs
- `src-tauri/src/services/environment_record.rs`: installed/adopted environment records and active version switching
- `src-tauri/src/commands/`: Tauri IPC command entry points
- `src/renderer/src/pages/`: main UI pages

## Data and Installation Paths

The app stores user configuration and task records under Tauri's `AppData` directory (`%APPDATA%\com.local.envmanager\`).

Install directory and download cache directory are configurable in Settings. During local testing, `E:\dev_env` is a convenient install root, with cached downloads under `E:\dev_env\.cache`.

## Environment Management Notes

- Symlink mode is intended to reduce direct edits to user/system environment variables. The active version points to an app-managed current directory.
- Direct mode updates environment variables to point at the selected version.
- System-level writes require administrator privileges.
- Adopted environments are registered for switching/visibility, but removing an adopted record does not delete the original directory.
- The app avoids managing environments discovered from its own current-link directory and common WindowsApps paths.

## Current Scope

This project currently targets Windows desktop usage. Package resolution and installation logic are implemented for Windows x64 archives/installers. Other platforms are outside the current scope.

Some ecosystems need follow-up installation steps after the base tool is installed. For example, Android SDK command line tools may still need platform packages, build tools or Java depending on the workflow.

## License

This project is licensed under the [MIT](LICENSE) License.

## Support

If this project is helpful to you, consider supporting its development:

- **WeChat**: Scan the QR code below to tip via WeChat Pay

  <img src="build/wechat-sponsor.png" alt="WeChat Sponsor QR Code" width="200" />
