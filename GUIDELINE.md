# 📖 Installation & Development Guideline

This document contains instructions for installing the desktop application and setting up a local development environment to modify, run, or build it.

---

## 📦 Installation Guide

Choose the file from the [latest GitHub release](https://github.com/the-long-ride/antigravity-quota-quickcheck/releases/latest) that matches your operating system:

### Windows
- **Installer**: Download and run `*setup.exe` to install it on your system.
- **Portable**: Download and run `*portable.exe` directly without installation.

### Linux
- **Debian / Ubuntu**: Download and install the `.deb` package:
  ```bash
  sudo dpkg -i <filename>.deb
  ```

---

## 🛠️ Local Development Guide

### Prerequisites

Ensure the following tools are installed on your system:
1. **Node.js** (v18 or higher recommended)
2. **Rust** toolchain (via [rustup](https://rustup.rs/))
3. **OS Build Tools** (for Tauri backend compilation):
   - **Windows**: C++ Build Tools (via Visual Studio Build Tools).
   - **Linux**: System packages required by Tauri (e.g. `libgtk-3-dev`, `libwebkit2gtk-4.1-dev`, `libssl-dev`, etc.).

### Setup

Clone this repository and install the frontend dependencies from the root directory:
```bash
npm install
```

### Run in Development Mode

Run the Tauri dev server to compile the Rust backend and launch the hot-reloading frontend:
```bash
npm run tauri dev
```

### Build a Release Version

To compile a production release build (installers and portable binary):
```bash
npm run build:release
```
The output installers and portable executables will be copied to `release/` in the root of the repository.
