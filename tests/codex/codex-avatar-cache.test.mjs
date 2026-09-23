import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { extractCodexProfilePicture } from "../../.test-build/codex/codex-profile.js";

test("extractCodexProfilePicture finds direct and nested ChatGPT avatars", () => {
  assert.equal(
    extractCodexProfilePicture({ picture: "https://example.com/direct.png" }),
    "https://example.com/direct.png",
  );
  assert.equal(
    extractCodexProfilePicture({
      account_user: { profile_picture_url: "https://example.com/nested.png" },
    }),
    "https://example.com/nested.png",
  );
  assert.equal(
    extractCodexProfilePicture({
      items: [{ user: { avatar_url: "https://example.com/item.png" } }],
    }),
    "https://example.com/item.png",
  );
  assert.equal(extractCodexProfilePicture({ picture: "data:image/png;base64,abc" }), null);
});

test("Codex OAuth caches avatar from login identity/profile lookup", () => {
  const modal = fs.readFileSync("src/components/codex/AddAccountModal.tsx", "utf8");
  const resolver = fs.readFileSync("src/components/codex/codex-login-profile.ts", "utf8");

  assert.match(modal, /resolveCodexLoginPicture\(/);
  assert.match(modal, /profileUrl:\s*profilePicture\s*\?\s*obfuscate\(profilePicture\)/);
  assert.match(resolver, /decodeJwtProfile\(idToken\)\?\.picture/);
  assert.match(resolver, /extractCodexProfilePicture\(accountsResponse\)/);
  assert.match(resolver, /invoke<unknown>\("fetch_chatgpt_profile", \{ accessToken \}\)/);
});

test("Codex polling only attempts a missing avatar once and persists the cached URL", () => {
  const fetcher = fs.readFileSync("src/hooks/codex/useCodexUsageFetcher.ts", "utf8");
  assert.match(fetcher, /avatarLookupAttemptedRef\s*=\s*useRef<Set<string>>\(new Set\(\)\)/);
  assert.match(
    fetcher,
    /if \(account\.profileUrl \|\| avatarLookupAttemptedRef\.current\.has\(account\.id\)\) return/,
  );
  assert.match(fetcher, /avatarLookupAttemptedRef\.current\.add\(account\.id\)/);
  assert.match(
    fetcher,
    /if \(!account\.profileUrl\) void cacheAvatarIfMissing\(account, oauthData\)/,
  );
  assert.match(fetcher, /profileUrl\s*=\s*obfuscate\(picture\)/);
  assert.doesNotMatch(fetcher, /resolveRefreshedAvatarUrl/);
});

test("ChatGPT profile lookup is separate from quota usage and registered as a Tauri command", () => {
  const profile = fs.readFileSync("src-tauri/src/auth/oauth/codex_profile.rs", "utf8");
  const usage = fs.readFileSync("src-tauri/src/auth/oauth/codex.rs", "utf8");
  const commands = fs.readFileSync("src-tauri/src/app/commands/oauth.rs", "utf8");
  const lib = fs.readFileSync("src-tauri/src/lib.rs", "utf8");

  assert.match(profile, /fetch_chatgpt_profile/);
  assert.match(profile, /https:\/\/chatgpt\.com\/backend-api\/me/);
  assert.match(usage, /https:\/\/chatgpt\.com\/backend-api\/wham\/usage/);
  assert.match(commands, /pub async fn fetch_chatgpt_profile/);
  assert.match(lib, /fetch_chatgpt_profile,/);
});
