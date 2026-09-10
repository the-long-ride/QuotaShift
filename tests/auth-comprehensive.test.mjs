import test from "node:test";
import assert from "node:assert/strict";
import {
  obfuscate,
  deobfuscate,
  decodeJwtProfile,
  decodeJwtEmail,
  fetchGoogleUserInfo,
  escapeHtml,
} from "../.test-build/auth.js";

test("obfuscate and deobfuscate roundtrip ASCII and Unicode strings", () => {
  const original = "Hello World! 12345! @#$%^&*()_+";
  const obf = obfuscate(original);
  assert.notEqual(obf, original);
  assert.equal(deobfuscate(obf), original);

  // Unicode support
  const unicodeStr = "Xin chào 🌍 日本語 ✨ 用户";
  const obfUnicode = obfuscate(unicodeStr);
  assert.equal(deobfuscate(obfUnicode), unicodeStr);
});

test("deobfuscate returns original value on invalid base64", () => {
  assert.equal(deobfuscate("not-valid-base-64!!!"), "not-valid-base-64!!!");
});

test("decodeJwtProfile parses claims, emails and avatars", () => {
  assert.equal(decodeJwtProfile(null), null);
  assert.equal(decodeJwtProfile(undefined), null);
  assert.equal(decodeJwtProfile(""), null);
  assert.equal(decodeJwtProfile("invalid"), null);

  // Standard payload
  const header = btoa(JSON.stringify({ alg: "HS256" }));
  const payload1 = btoa(
    JSON.stringify({
      email: "user@example.com",
      picture: "https://example.com/pic.png",
      name: "Test User",
    })
  );
  const jwt1 = `${header}.${payload1}.signature`;

  const profile1 = decodeJwtProfile(jwt1);
  assert.deepEqual(profile1, {
    email: "user@example.com",
    picture: "https://example.com/pic.png",
    name: "Test User",
  });
  assert.equal(decodeJwtEmail(jwt1), "user@example.com");

  // Avatar URL fallback
  const payload2 = btoa(
    JSON.stringify({
      avatar_url: "https://example.com/avatar.jpg",
    })
  );
  const jwt2 = `${header}.${payload2}.sig`;
  assert.equal(decodeJwtProfile(jwt2).picture, "https://example.com/avatar.jpg");

  // OpenAI profile structure with base64url hyphens and underscores
  const payload3Json = JSON.stringify({
    email: "openai@test.com",
    "https://api.openai.com/profile": { picture: "https://api.openai.com/pic.png" },
  });
  // Simulate base64url with - and _
  const payload3 = btoa(payload3Json).replace(/\+/g, "-").replace(/\//g, "_");
  const jwt3 = `${header}.${payload3}.sig`;
  const profile3 = decodeJwtProfile(jwt3);
  assert.equal(profile3.email, "openai@test.com");
  assert.equal(profile3.picture, "https://api.openai.com/pic.png");

  // Malformed JSON payload
  const badPayload = btoa("{ bad json");
  assert.equal(decodeJwtProfile(`${header}.${badPayload}.sig`), null);
});

test("decodeJwtEmail returns null on invalid or missing tokens", () => {
  assert.equal(decodeJwtEmail(null), null);
  assert.equal(decodeJwtEmail(""), null);
});

test("fetchGoogleUserInfo handles successful and failed HTTP responses", async () => {
  const origFetch = globalThis.fetch;
  try {
    // Success response
    globalThis.fetch = async (url, opts) => {
      assert.equal(url, "https://www.googleapis.com/oauth2/v3/userinfo");
      assert.equal(opts.headers.Authorization, "Bearer token-123");
      return {
        ok: true,
        json: async () => ({ email: "google@test.com", name: "Google User" }),
      };
    };

    const user = await fetchGoogleUserInfo("token-123");
    assert.deepEqual(user, { email: "google@test.com", name: "Google User" });

    // Non-ok response
    globalThis.fetch = async () => ({ ok: false });
    assert.equal(await fetchGoogleUserInfo("bad-token"), null);

    // Network error
    globalThis.fetch = async () => {
      throw new Error("Network error");
    };
    assert.equal(await fetchGoogleUserInfo("error-token"), null);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("escapeHtml escapes HTML entities correctly", () => {
  assert.equal(
    escapeHtml(`<script>alert("XSS" & 'test')</script>`),
    "&lt;script&gt;alert(&quot;XSS&quot; &amp; &#039;test&#039;)&lt;/script&gt;"
  );
});
