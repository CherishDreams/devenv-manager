# DevEnv Manager

Windows developer environment manager built with Electron, React, Ant Design, Zustand and pnpm.

DevEnv Manager is a desktop tool for installing, adopting, switching and removing local development runtimes. It focuses on multi-version coexistence, predictable installation paths, task logs, proxy/mirror configuration and Windows environment variable management.

## Features

- Manage developer runtimes from one desktop app.
- Install runtimes into a global install directory or a custom path.
- Download matching Windows x64 packages automatically.
- Track install tasks with progress, download size/speed and paged logs.
- Retry failed tasks, cancel running tasks and clear historical logs.
- Keep multiple versions side by side and switch the active version.
- Configure proxy and mirror sources in Settings.
- Choose environment variable management mode:
  - Symlink mode: switch active versions through app-managed links.
  - Direct mode: write environment variables directly.
- Adopt existing system environments without deleting their original directories.
- Remove only environments installed by this app, or only remove adoption records for adopted environments.
- Solid and vibrant UI themes.

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

## Tech Stack

- Electron 35
- electron-vite
- React 18
- TypeScript
- Ant Design 5
- Zustand
- pnpm
- undici

## Requirements

- Windows
- Node.js
- pnpm

The packaged Windows app requests administrator privileges because system environment variable writes require elevation. In development mode, switching or installing with system environment configuration may also require an elevated Electron process.

## Getting Started

Install dependencies:

```powershell
pnpm install
```

Start the Electron development app:

```powershell
pnpm dev
```

Build the app:

```powershell
pnpm build
```

Create a Windows installer:

```powershell
pnpm dist
```

## Project Structure

```text
src/
  main/       Electron main process, IPC, installation tasks and Windows services
  preload/    Safe renderer-to-main bridge
  renderer/   React UI, stores, pages, styles and assets
  shared/     Shared types, environment definitions and version catalogs
```

Important modules:

- `src/shared/environmentDefinitions.ts`: environment metadata, vendors, env vars and PATH entries.
- `src/shared/versionCatalogs/`: static fallback version catalogs split by environment.
- `src/main/services/versionCatalog/`: online version providers.
- `src/main/services/installer/resources/`: package URL resolvers.
- `src/main/services/installer/`: download, extraction, installer execution and verification helpers.
- `src/main/services/taskService.ts`: persisted install task queue and logs.
- `src/main/services/environmentRecordService.ts`: installed/adopted environment records and active version switching.
- `src/renderer/src/pages/`: main UI pages.

## Data and Installation Paths

The app stores user configuration and task records under Electron's `userData` directory.

By default, installed environments and download cache are controlled from Settings. During local testing, `E:\dev_env` is a convenient install root, with cached downloads under `E:\dev_env\.cache`.

## Environment Management Notes

- Symlink mode is intended to reduce direct edits to user/system environment variables. The active version points to an app-managed current directory.
- Direct mode updates environment variables to point at the selected version.
- System-level writes require administrator privileges.
- Adopted environments are registered for switching/visibility, but removing an adopted record does not delete the original directory.
- The app avoids managing environments discovered from its own current-link directory and common WindowsApps paths.

## Current Scope

This project currently targets Windows desktop usage. Package resolution and installation logic are implemented for Windows x64 archives/installers. Other platforms are outside the current scope.

Some ecosystems need follow-up installation steps after the base tool is installed. For example, Android SDK command line tools may still need platform packages, build tools or Java depending on the workflow.
