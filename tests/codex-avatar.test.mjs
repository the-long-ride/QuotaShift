import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { decodeJwtProfile, decodeJwtEmail } from "../.test-build/auth.js";

function makeJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.signature`;
}

test("decodeJwtProfile extracts email, picture, and name from JWT idToken", () => {
  const token = makeJwt({
    email: "user@example.com",
    picture: "https://example.com/avatar.png",
    name: "User Name",
  });

  const profile = decodeJwtProfile(token);
  assert.equal(profile?.email, "user@example.com");
  assert.equal(profile?.picture, "https://example.com/avatar.png");
  assert.equal(profile?.name, "User Name");
});

test("decodeJwtProfile handles avatar_url and nested OpenAI profile picture", () => {
  const tokenAvatarUrl = makeJwt({
    email: "user1@example.com",
    avatar_url: "https://example.com/avatar1.png",
  });
  assert.equal(decodeJwtProfile(tokenAvatarUrl)?.picture, "https://example.com/avatar1.png");

  const tokenOpenAi = makeJwt({
    email: "user2@example.com",
    "https://api.openai.com/profile": {
      picture: "https://example.com/openai-pic.png",
    },
  });
  assert.equal(decodeJwtProfile(tokenOpenAi)?.picture, "https://example.com/openai-pic.png");
});

test("decodeJwtProfile and decodeJwtEmail return null on invalid tokens", () => {
  assert.equal(decodeJwtProfile(null), null);
  assert.equal(decodeJwtProfile(""), null);
  assert.equal(decodeJwtProfile("invalid"), null);

  assert.equal(decodeJwtEmail(null), null);
  assert.equal(decodeJwtEmail(""), null);
});

test("CodexTab renders avatar img when available and initial letter fallback", () => {
  const code = fs.readFileSync("src/components/CodexTab.tsx", "utf8");

  assert.match(code, /acc\.profileUrl/);
  assert.match(code, /decodeJwtProfile/);
  assert.match(code, /avatarUrl && !failedAvatarIds\.has\(acc\.id\)/);
  assert.match(code, /<img\s+className="codex-card-avatar"/);
  assert.match(code, /onError=\{/);
  assert.match(code, /acc\.label \? acc\.label\.charAt\(0\)\.toUpperCase\(\) : "C"/);
});
