/**
 * Dynamic-port dev launcher.
 *
 * Finds a free TCP port starting from 1420, then starts `tauri dev`
 * with the real port injected into both Vite (VITE_PORT env) and Tauri
 * (--config <tempfile> override for build.devUrl).
 *
 * Uses a temp JSON file + cmd.exe on Windows to sidestep Node v24 EINVAL
 * and all Windows shell-quoting issues with JSON strings.
 */
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/** Returns the first free TCP port >= start */
function findFreePort(start = 1420) {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(start, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", () => findFreePort(start + 1).then(resolve, reject));
  });
}

const port = await findFreePort();
console.log(`[dev] Using port ${port}`);

// Write override config to a temp file — sidesteps all quoting issues
const tmpConfig = join(tmpdir(), `tauri-dev-config-${process.pid}.json`).replaceAll("\\", "/");
writeFileSync(tmpConfig, JSON.stringify({ build: { devUrl: `http://localhost:${port}` } }));

const cleanup = () => { try { unlinkSync(tmpConfig); } catch { } };
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });
process.on("SIGTERM", () => { cleanup(); process.exit(143); });

// On Windows + Node v24, spawning .cmd files requires going through cmd.exe.
// Call node_modules/.bin/tauri.CMD directly to bypass pnpm's own arg-wrapping.
const proc = process.platform === "win32"
  ? spawn(
      "cmd.exe",
      ["/c", `node_modules\\.bin\\tauri.CMD dev --config ${tmpConfig}`],
      { env: { ...process.env, VITE_PORT: String(port) }, stdio: "inherit", shell: false }
    )
  : spawn(
      "node_modules/.bin/tauri",
      ["dev", "--config", tmpConfig],
      { env: { ...process.env, VITE_PORT: String(port) }, stdio: "inherit", shell: false }
    );

proc.on("close", (code) => { cleanup(); process.exit(code ?? 0); });
