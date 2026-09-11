import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  isNewerAvatarUrl,
  resolveRefreshedAvatarUrl,
} from '../.test-build/account-avatar.js';
import { obfuscate, deobfuscate } from '../.test-build/auth.js';

test('isNewerAvatarUrl detects when a remote avatar URL differs from local', () => {
  const localOld = obfuscate('https://lh3.googleusercontent.com/old-avatar.png');

  // Invalid or empty remote URLs should not trigger update
  assert.equal(isNewerAvatarUrl(localOld, null), false);
  assert.equal(isNewerAvatarUrl(localOld, undefined), false);
  assert.equal(isNewerAvatarUrl(localOld, ''), false);
  assert.equal(isNewerAvatarUrl(localOld, 'ftp://not-http.png'), false);

  // When local has no avatar, valid remote URL should be considered new
  assert.equal(isNewerAvatarUrl(null, 'https://lh3.googleusercontent.com/new-avatar.png'), true);
  assert.equal(isNewerAvatarUrl(undefined, 'https://lh3.googleusercontent.com/new-avatar.png'), true);

  // When remote is identical to local, no update
  assert.equal(isNewerAvatarUrl(localOld, 'https://lh3.googleusercontent.com/old-avatar.png'), false);

  // When remote is newer / different, trigger update
  assert.equal(isNewerAvatarUrl(localOld, 'https://lh3.googleusercontent.com/new-avatar.png'), true);
});

test('resolveRefreshedAvatarUrl applies newer avatar URL and preserves existing if unchanged or invalid', () => {
  const localOld = obfuscate('https://lh3.googleusercontent.com/old-avatar.png');

  // New avatar applied
  const next = resolveRefreshedAvatarUrl(localOld, 'https://lh3.googleusercontent.com/new-avatar.png', deobfuscate, obfuscate);
  assert.notEqual(next, localOld);
  assert.equal(deobfuscate(next), 'https://lh3.googleusercontent.com/new-avatar.png');

  // Unchanged avatar preserved
  const same = resolveRefreshedAvatarUrl(localOld, 'https://lh3.googleusercontent.com/old-avatar.png', deobfuscate, obfuscate);
  assert.equal(same, localOld);

  // Missing or failed remote avatar preserves local avatar
  const preservedNull = resolveRefreshedAvatarUrl(localOld, null, deobfuscate, obfuscate);
  assert.equal(preservedNull, localOld);
  const preservedEmpty = resolveRefreshedAvatarUrl(localOld, '', deobfuscate, obfuscate);
  assert.equal(preservedEmpty, localOld);
});

test('Antigravity refresh fetches user info and updates avatar if newer than local', () => {
  const code = fs.readFileSync('src/utils/antigravity/app-antigravity-ops.ts', 'utf8');

  assert.match(code, /fetchGoogleUserInfo/);
  assert.match(code, /resolveRefreshedAvatarUrl/);
  assert.match(code, /profileUrl:\s*fetchedProfileUrl\s*\||\s*account\.profileUrl/);
});

test('Codex refresh syncs newer avatar URL from decoded profile', () => {
  const code = fs.readFileSync('src/App.tsx', 'utf8');

  assert.match(code, /resolveRefreshedAvatarUrl\(account\.profileUrl,\s*profile\.picture/);
});

test('Antigravity and Codex tabs heal failed avatar error states when profileUrl changes', () => {
  const agTab = fs.readFileSync('src/components/antigravity/AntigravityTab.tsx', 'utf8');
  const codexTab = fs.readFileSync('src/components/codex/CodexTab.tsx', 'utf8');

  assert.match(agTab, /prevAvatarsRef/);
  assert.match(agTab, /next\.delete\(a\.id\)/);
  assert.match(codexTab, /prevAvatarsRef/);
  assert.match(codexTab, /next\.delete\(a\.id\)/);
});
