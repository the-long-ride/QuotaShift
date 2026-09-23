import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const APP_SUBMODULES = [
  "src/components/app/AppModals.tsx",
  "src/components/app/AppTabBar.tsx",
  "src/hooks/app/useAppCoordinator.ts",
  "src/hooks/app/useAppBackups.ts",
  "src/hooks/codex/useCodexModelScanManager.ts",
  "src/hooks/codex/useCodexRouterManager.ts",
  "src/hooks/app/useAppAccountOperations.ts",
  "src/hooks/antigravity/useAntigravityAccountOps.ts",
  "src/hooks/codex/useCodexAccountOps.ts",
  "src/hooks/codex/useCodexUsageFetcher.ts",
  "src/hooks/app/useAppUsageAndOverlay.ts",
  "src/hooks/app/useAppSessionBootstrap.ts",
  "src/hooks/app/useAppUpdateCheck.ts",
  "src/hooks/app/useAppEventListeners.ts",
  "src/utils/common/app-overlay-helpers.ts",
  "src/utils/common/overlay-builder.ts",
];

export function readWithCssImports(filePath) {
  let target;
  if (filePath instanceof URL) {
    target = filePath;
  } else if (typeof filePath === "string") {
    if (filePath.startsWith("file:")) {
      target = new URL(filePath);
    } else if (path.isAbsolute(filePath)) {
      target = pathToFileURL(filePath);
    } else {
      target = new URL(`../${filePath.replace(/\\/g, "/")}`, import.meta.url);
    }
  } else {
    target = filePath;
  }
  let content = fs.readFileSync(target, "utf8");
  const targetStr = target instanceof URL ? target.pathname : String(target);
  if (
    targetStr.endsWith("/src/App.tsx") ||
    targetStr.endsWith("\\src\\App.tsx") ||
    targetStr.endsWith("src/App.tsx")
  ) {
    for (const sub of APP_SUBMODULES) {
      const subUrl = new URL(`../${sub}`, import.meta.url);
      if (fs.existsSync(subUrl)) {
        content += "\n" + fs.readFileSync(subUrl, "utf8");
      }
    }
  }
  return content.replace(/@import\s+["']([^"']+)["'];/g, (_, relPath) => {
    const resolved = new URL(relPath, target);
    return readWithCssImports(resolved);
  });
}
