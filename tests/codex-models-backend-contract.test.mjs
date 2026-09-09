import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('Codex model catalog backend is registered as a Tauri command', () => {
  const lib = read('src-tauri/src/lib.rs');
  const backend = read('src-tauri/src/codex_models.rs');

  assert.match(backend, /pub\s+async\s+fn\s+fetch_chatgpt_models/);
  assert.match(backend, /#\[tauri::command\]/);
  assert.match(lib, /mod\s+codex_models\s*;/);
  assert.match(lib, /codex_models::fetch_chatgpt_models/);
});

test('catalog request stays account-scoped and never logs credentials in error formatting', () => {
  const backend = read('src-tauri/src/codex_models.rs');

  assert.match(backend, /ChatGPT-Account-Id/);
  assert.match(backend, /originator/);
  assert.match(backend, /client_version/);
  assert.doesNotMatch(backend, /format!\([^)]*access_token/);
  assert.doesNotMatch(backend, /format!\([^)]*account_id/);
});
