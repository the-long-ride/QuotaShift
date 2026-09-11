import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/styles/codex-pools.css", import.meta.url), "utf8");
const toastTsx = await readFile(new URL("../src/components/common/Toast.tsx", import.meta.url), "utf8");

test("Toast component renders app-toast with message and close button", () => {
  assert.match(toastTsx, /className=\{`app-toast app-toast--\$\{toast\.kind\}`\}/);
  assert.match(toastTsx, /className="app-toast__message"/);
  assert.match(toastTsx, /className="app-toast__close"/);
});

test("Toast CSS enforces compact layout, max-content width, and smaller font", () => {
  assert.match(css, /\.app-toast\s*\{[\s\S]*?width:\s*max-content;/);
  assert.match(css, /\.app-toast\s*\{[\s\S]*?max-width:\s*min\(420px,\s*calc\(100vw\s*-\s*20px\)\);/);
  assert.match(css, /\.app-toast\s*\{[\s\S]*?font-size:\s*11px;/);
  assert.match(css, /\.app-toast__message\s*\{[\s\S]*?font-size:\s*11px;/);
  assert.match(css, /\.app-toast\s*\{[\s\S]*?padding:\s*6px\s+10px\s+6px\s+12px;/);
  assert.match(css, /\.app-toast\s*\{[\s\S]*?align-items:\s*center;/);
  assert.match(css, /\.app-toast__close\s*\{[\s\S]*?width:\s*16px;/);
  assert.match(css, /\.app-toast__close\s*\{[\s\S]*?height:\s*16px;/);
  assert.match(css, /\.app-toast__close\s*\{[\s\S]*?font-size:\s*13px;/);
});
