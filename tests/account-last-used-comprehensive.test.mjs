import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAccountEmail,
  markAccountLastUsed,
  markAccountLastUsedByEmail,
  formatLastUsed,
} from "../.test-build/account-last-used.js";

test("normalizeAccountEmail handles null, undefined, whitespace and cases", () => {
  assert.equal(normalizeAccountEmail(null), "");
  assert.equal(normalizeAccountEmail(undefined), "");
  assert.equal(normalizeAccountEmail(""), "");
  assert.equal(normalizeAccountEmail("  USER@Example.COM  "), "user@example.com");
  assert.equal(normalizeAccountEmail("test@test.org"), "test@test.org");
});

test("markAccountLastUsed edge cases and guards", () => {
  const accounts = [
    { id: "1", email: "a@test.com", lastUsedAt: 100 },
    { id: "2", email: "b@test.com" },
  ];

  // Invalid inputs return original array
  assert.equal(markAccountLastUsed(accounts, ""), accounts);
  assert.equal(markAccountLastUsed(accounts, "1", NaN), accounts);
  assert.equal(markAccountLastUsed(accounts, "1", -1), accounts);
  assert.equal(markAccountLastUsed(accounts, "1", 0), accounts);

  // Missing id returns original array
  assert.equal(markAccountLastUsed(accounts, "999", 500), accounts);

  // Previous timestamp greater than or equal to usedAt
  assert.equal(markAccountLastUsed(accounts, "1", 50), accounts);
  assert.equal(markAccountLastUsed(accounts, "1", 100), accounts);

  // Valid update advances lastUsedAt
  const updated = markAccountLastUsed(accounts, "1", 200);
  assert.notEqual(updated, accounts);
  assert.equal(updated[0].lastUsedAt, 200);
  assert.equal(updated[1].lastUsedAt, undefined);

  // Updating account without previous lastUsedAt
  const updated2 = markAccountLastUsed(accounts, "2", 300);
  assert.equal(updated2[1].lastUsedAt, 300);
});

test("markAccountLastUsedByEmail handles matching and non-matching emails", () => {
  const accounts = [
    { id: "acc-1", email: "Alpha@Test.com" },
    { id: "acc-2", email: "Beta@Test.com" },
  ];

  assert.equal(markAccountLastUsedByEmail(accounts, null), accounts);
  assert.equal(markAccountLastUsedByEmail(accounts, undefined), accounts);
  assert.equal(markAccountLastUsedByEmail(accounts, ""), accounts);
  assert.equal(markAccountLastUsedByEmail(accounts, "missing@test.com"), accounts);

  const updated = markAccountLastUsedByEmail(accounts, "alpha@test.com", 500);
  assert.equal(updated[0].lastUsedAt, 500);
});

test("formatLastUsed handles various inputs", () => {
  assert.equal(formatLastUsed(null), "");
  assert.equal(formatLastUsed(undefined), "");
  assert.equal(formatLastUsed(0), "");
  assert.equal(formatLastUsed(-100), "");
  assert.equal(formatLastUsed(NaN), "");
  assert.equal(formatLastUsed(Infinity), "");

  const time = 1700000000000;
  const formatted = formatLastUsed(time);
  assert.match(formatted, /^Last used: /);
});
