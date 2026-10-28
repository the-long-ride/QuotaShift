import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = (path) => fs.readFileSync(path, "utf8");

test("authorized routing badge on Codex cards uses the dual-swirl icon", () => {
  const card = source("src/components/codex/cards/CodexAccountCard.tsx");
  const icons = source("src/components/common/icons/CopySvgIcon.tsx");
  assert.match(
    card,
    /codex-card-routing-ready-btn[\s\S]*?<RoutingAuthorizedSvgIcon size=\{11\} \/>[\s\S]*?<CodexCardDeleteBtn/,
  );
  assert.doesNotMatch(card, /AuthorizeRoutingSvgIcon/);
  const icon = icons.slice(icons.indexOf("export const RoutingAuthorizedSvgIcon"));
  assert.match(icon, /viewBox="0 0 48 48"/);
  assert.match(icon, /<circle cx="24" cy="24" r="20"/);
  assert.match(icon, /M24 44C18\.4772 44 14 39\.5228 14 34/);
  assert.match(icon, /M44 24C44 29\.5228 39\.5228 34 34 34/);
  assert.doesNotMatch(icon, /#000000/);
});

test("SIWC callback page explains failures with sanitized reasons", () => {
  const callback = source("src-tauri/src/codex/siwc/callback.rs");
  const exchange = source("src-tauri/src/codex/siwc/token_exchange.rs");
  assert.match(callback, /fn callback_page\(ok: bool, reason: Option<&str>\)/);
  assert.match(callback, /escape_html\(/);
  assert.match(exchange, /fn oauth_error_code\(/);
  assert.doesNotMatch(exchange, /error_description"\)/);
});
