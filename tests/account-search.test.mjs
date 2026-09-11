import test from "node:test";
import assert from "node:assert/strict";
import { matchesAccountQuery, filterAccountsByQuery } from "../.test-build/account-search.js";

test("matchesAccountQuery returns true for empty or whitespace query", () => {
  const account = { label: "Personal Account", email: "personal@example.com" };
  assert.equal(matchesAccountQuery(account, ""), true);
  assert.equal(matchesAccountQuery(account, "   "), true);
  assert.equal(matchesAccountQuery(account, null), true);
  assert.equal(matchesAccountQuery(account, undefined), true);
});

test("matchesAccountQuery matches by name/label ignoring letter case", () => {
  const account = { label: "Work Account", email: "alice@company.com" };
  assert.equal(matchesAccountQuery(account, "work"), true);
  assert.equal(matchesAccountQuery(account, "WORK"), true);
  assert.equal(matchesAccountQuery(account, "Account"), true);
  assert.equal(matchesAccountQuery(account, "k acc"), true);
  assert.equal(matchesAccountQuery(account, "personal"), false);
});

test("matchesAccountQuery matches by email ignoring letter case", () => {
  const account = { label: "Dev", email: "John.Doe@Example.com" };
  assert.equal(matchesAccountQuery(account, "john"), true);
  assert.equal(matchesAccountQuery(account, "DOE"), true);
  assert.equal(matchesAccountQuery(account, "example.com"), true);
  assert.equal(matchesAccountQuery(account, "nonexistent"), false);
});

test("matchesAccountQuery handles accounts with missing email or label gracefully", () => {
  const noEmail = { label: "Local Profile" };
  assert.equal(matchesAccountQuery(noEmail, "local"), true);
  assert.equal(matchesAccountQuery(noEmail, "email"), false);

  const noLabel = { email: "solo@mail.com" };
  assert.equal(matchesAccountQuery(noLabel, "solo"), true);
  assert.equal(matchesAccountQuery(noLabel, "profile"), false);

  const emptyAccount = {};
  assert.equal(matchesAccountQuery(emptyAccount, "anything"), false);
  assert.equal(matchesAccountQuery(emptyAccount, ""), true);
});

test("filterAccountsByQuery filters an array of accounts by name and email", () => {
  const accounts = [
    { id: "1", label: "Alice Work", email: "alice@work.com" },
    { id: "2", label: "Bob Personal", email: "bob@gmail.com" },
    { id: "3", label: "Charlie Work", email: "charlie@other.org" },
    { id: "4", label: "Dave", email: "work.dave@corp.net" },
  ];

  // Empty query returns all accounts
  assert.deepEqual(filterAccountsByQuery(accounts, ""), accounts);
  assert.deepEqual(filterAccountsByQuery(accounts, "   "), accounts);

  // Search "work" should match Alice (label and email), Charlie (label), Dave (email)
  const workMatches = filterAccountsByQuery(accounts, "work");
  assert.equal(workMatches.length, 3);
  assert.deepEqual(workMatches.map((a) => a.id), ["1", "3", "4"]);

  // Search "BOB" case insensitive
  const bobMatches = filterAccountsByQuery(accounts, "BOB");
  assert.equal(bobMatches.length, 1);
  assert.equal(bobMatches[0].id, "2");

  // Search no match
  const noneMatches = filterAccountsByQuery(accounts, "nonexistent-query");
  assert.equal(noneMatches.length, 0);
});

test("Header search input contracts: supports both controlled and uncontrolled states with escape and clear", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const headerPath = path.resolve("src/components/common/Header.tsx");
  const headerSrc = fs.readFileSync(headerPath, "utf-8");

  assert.match(headerSrc, /searchQuery:\s*propSearchQuery/);
  assert.match(headerSrc, /onSearchChange:\s*propOnSearchChange/);
  assert.match(headerSrc, /internalSearchQuery/);
  assert.match(headerSrc, /handleSearchChange/);
  assert.match(headerSrc, /onChange=\{\(e\)\s*=>\s*handleSearchChange\(e\.target\.value\)\}/);
  assert.match(headerSrc, /if\s*\(e\.key\s*===\s*"Escape"\)\s*handleSearchChange\(""\)/);
});

test("App contracts: searchQuery state is wired to Header and account tabs", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const appPath = path.resolve("src/App.tsx");
  const appSrc = fs.readFileSync(appPath, "utf-8");

  assert.match(appSrc, /const\s*\[searchQuery,\s*setSearchQuery\]\s*=\s*useState\(["']["']\)/);
  assert.match(appSrc, /<Header[\s\S]*?searchQuery=\{searchQuery\}[\s\S]*?onSearchChange=\{setSearchQuery\}/);
  assert.match(appSrc, /<AntigravityTab[\s\S]*?searchQuery=\{searchQuery\}/);
  assert.match(appSrc, /<CodexTab[\s\S]*?searchQuery=\{searchQuery\}/);
});

test("CSS contracts: header search input allows user text selection and track button is perfectly centered", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const baseCss = fs.readFileSync(path.resolve("src/styles/base.css"), "utf-8");
  const agCss = fs.readFileSync(path.resolve("src/styles/antigravity.css"), "utf-8");
  const agTabSrc = fs.readFileSync(path.resolve("src/components/antigravity/AntigravityTab.tsx"), "utf-8");
  const codexTabSrc = fs.readFileSync(path.resolve("src/components/codex/CodexTab.tsx"), "utf-8");

  // Search input user-select
  assert.match(baseCss, /\.header-search-input\s*\{[^}]*user-select:\s*text;/);
  assert.match(baseCss, /\.header-search-input\s*\{[^}]*cursor:\s*text;/);

  // Icon-only button centering
  assert.match(agCss, /\.account-action-btn--icon-only\s*\{[^}]*align-items:\s*center;/);
  assert.match(agCss, /\.account-action-btn--icon-only\s*\{[^}]*justify-content:\s*center;/);
  assert.match(agCss, /\.account-action-btn--icon-only\s*\{[^}]*gap:\s*0;/);
  assert.match(agCss, /\.account-action-btn--icon-only\s*\{[^}]*line-height:\s*0;/);
  assert.match(agCss, /\.account-action-btn--icon-only\s*\{[^}]*min-width:\s*20px;/);
  assert.match(agCss, /\.account-action-btn--icon-only\s*svg\s*\{[^}]*margin:\s*0\s*auto;/);

  // Buttons have no whitespace text nodes around TrackCurrentAccountIcon
  assert.match(agTabSrc, /<button[^>]*account-action-btn--icon-only[^>]*><TrackCurrentAccountIcon \/><\/button>/);
  assert.match(codexTabSrc, /<button[^>]*account-action-btn--icon-only[^>]*><TrackCurrentAccountIcon \/><\/button>/);
});
