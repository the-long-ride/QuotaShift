import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const slice = (source, start, end) => {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing source marker: ${start}`);
  const tail = source.slice(from);
  const to = tail.indexOf(end);
  assert.notEqual(to, -1, `missing source marker: ${end}`);
  return tail.slice(0, to);
};

test('Antigravity Apply delegates IDE and CLI switching to one backend operation', () => {
  const app = read('src/App.tsx');
  const apply = slice(app, 'const handleApplyAntigravityAccount = async', 'const handleDeleteAntigravityAccount = async');

  assert.match(apply, /switch_antigravity_account/);
  assert.doesNotMatch(apply, /quit_antigravity_ide/);
  assert.doesNotMatch(apply, /open_antigravity_ide/);
  assert.doesNotMatch(apply, /write_antigravity_session/);
});

test('Antigravity switch result uses toast instead of the header status badge', () => {
  const app = read('src/App.tsx');
  const apply = slice(app, 'const handleApplyAntigravityAccount = async', 'const handleDeleteAntigravityAccount = async');
  const header = read('src/components/common/Header.tsx');
  const toast = read('src/components/common/Toast.tsx');

  assert.match(app, /<Toast/);
  assert.match(apply, /showToast\(switchResult\.message/);
  assert.doesNotMatch(apply, /setStatusText\(switchResult\.message\)/);
  assert.match(toast, /role="status"/);
  assert.match(toast, /onDismiss/);
  assert.match(header, /status-text">\{statusText\}/);
});

test('backend detects IDE and agy CLI and preserves the exact IDE executable', () => {
  const session = read('src-tauri/src/system/session.rs');
  const lib = read('src-tauri/src/lib.rs');

  assert.match(session, /AntigravityRuntimeState/);
  assert.match(session, /AntigravitySwitchResult/);
  assert.match(session, /detect_antigravity_runtime/);
  assert.match(session, /agy/);
  assert.match(session, /antigravity-cli/);
  assert.match(session, /runtime\.ide_executable/);
  assert.match(session, /stop_antigravity_cli/);
  assert.match(session, /open_antigravity_ide_at/);
  assert.match(session, /CLI switched/);
  assert.match(session, /run agy again/);
  assert.match(lib, /switch_antigravity_account/);
});
