import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const rawBase = process.env.VITE_SITE_BASE?.trim() || "/QuotaShift/";
const base = rawBase === "/" ? "/" : `${rawBase.replace(/\/+$/, "")}/`;

const tauriApiShim = path.resolve(__dirname, "site/shims/tauri-api-shim.ts");
const tauriPluginsShim = path.resolve(__dirname, "site/shims/tauri-plugins-shim.ts");

function siteModalPortalPlugin() {
  return {
    name: "quotashift-site-modal-portal",
    transform(code: string, id: string) {
      if (!id.replace(/\\/g, "/").endsWith("/BackgroundStatusModal.tsx")) return null;
      return code.replace(
        /,\s*document\.body,?\s*\);/,
        ', document.querySelector(".qs-demo-window") ?? document.body);',
      );
    },
  };
}

export default defineConfig({
  base,
  root: path.resolve(__dirname, "site"),
  publicDir: path.resolve(__dirname, "public"),
  plugins: [siteModalPortalPlugin(), react()],
  resolve: {
    alias: [
      {
        find: /^@tauri-apps\/api\/(core|event|window|webviewWindow|webview|dpi|app)$/,
        replacement: tauriApiShim,
      },
      {
        find: /^@tauri-apps\/plugin-(opener|store|global-shortcut|notification)$/,
        replacement: tauriPluginsShim,
      },
    ],
  },
  build: {
    outDir: path.resolve(__dirname, "dist-site"),
    emptyOutDir: true,
  },
  server: {
    port: 1425,
    strictPort: false,
    fs: {
      allow: [path.resolve(__dirname)],
    },
  },
});
