import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const worker = fs.readFileSync('src-tauri/src/antigravity_worker.rs', 'utf8')
const processSource = fs.readFileSync('src-tauri/src/process.rs', 'utf8')
const lib = fs.readFileSync('src-tauri/src/lib.rs', 'utf8')
const profileWriter = fs.readFileSync('src-tauri/src/python/write_worker_vscdb.py', 'utf8')
const app = fs.readFileSync('src/App.tsx', 'utf8')

test('worker launch is isolated and carries a QuotaShift ownership marker', () => {
  assert.match(worker, /--user-data-dir/)
  assert.match(worker, /worker-marker\.json/)
  assert.match(worker, /ownership_nonce/)
  assert.match(worker, /antigravity-workers/)
})

test('exact refresh is sequential and verifies returned identity', () => {
  assert.match(worker, /for request in requests/)
  assert.match(worker, /parse_exact_status\(expected_email/)
  assert.doesNotMatch(worker, /join_all|FuturesUnordered/)
})

test('termination is PID/profile owned, never broad process-name killing', () => {
  assert.match(worker, /owned_process_ids/)
  assert.match(worker, /taskkill/)
  assert.match(worker, /\/PID/)
  assert.doesNotMatch(worker, /\/IM|language_server\.exe|Antigravity\.exe/)
  assert.match(processSource, /scan_process_records/)
  assert.match(processSource, /descendant_process_ids/)
})

test('profile writer targets the isolated database path supplied by Rust', () => {
  assert.match(profileWriter, /sys\.argv\[1\]/)
  assert.match(profileWriter, /sqlite3\.connect\(db\)/)
  assert.doesNotMatch(profileWriter, /APPDATA|LOCALAPPDATA|Credential Manager/i)
})

test('Tauri registers worker manager and lifecycle commands', () => {
  assert.match(lib, /mod antigravity_worker;/)
  assert.match(lib, /manage\(antigravity_worker::AntigravityWorkerManager::default\(\)\)/)
  assert.match(lib, /refresh_antigravity_accounts_exact/)
  assert.match(lib, /stop_antigravity_worker/)
  assert.match(lib, /stop_all_antigravity_workers/)
})


test('enabling persistent mode waits for the next explicit refresh', () => {
  const start = app.indexOf('const handleTogglePersistentWorkers');
  const end = app.indexOf('// Poll Interval Changed', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const toggleHandler = app.slice(start, end);
  assert.doesNotMatch(toggleHandler, /refreshExactAntigravityAccounts/);
  assert.match(toggleHandler, /savePersistentWorkerPreference/);
});

test('stopping all workers also resets persistent restart throttles', () => {
  const start = worker.indexOf('pub fn stop_all');
  const end = worker.indexOf('pub fn statuses', start);
  const stopAll = worker.slice(start, end);
  assert.match(stopAll, /restart_history/);
  assert.match(stopAll, /clear\(\)/);
});
