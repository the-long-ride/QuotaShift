import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const writerPath = (name) => new URL(`../src-tauri/src/python/${name}`, import.meta.url);

function runPythonSource(source, input, args = []) {
  return spawnSync('python', ['-c', source, ...args], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    windowsHide: true,
  });
}

function runWriter(name, input) {
  return runPythonSource(readFileSync(writerPath(name), 'utf8'), input);
}

function inspectDatabase(dbPath) {
  const script = `import json, sqlite3, sys
conn = sqlite3.connect(sys.argv[1])
rows = dict(conn.execute("SELECT key, value FROM ItemTable"))
print(json.dumps(rows, ensure_ascii=True))`;
  const result = spawnSync('python', ['-c', script, dbPath], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('SQLite writer accepts Unicode and quoted credentials only through JSON stdin', () => {
  const root = mkdtempSync(join(tmpdir(), 'quotashift-writer-'));
  try {
    const dbPath = join(root, 'isolated', 'state.vscdb');
    const token = `access-'quoted"-${'锁'.repeat(2)}`;
    const refresh = 'refresh\nquoted';
    const result = runWriter('write_vscdb.py', {
      db_paths: [dbPath],
      token,
      refresh_token: refresh,
      profile_url: 'https://profile.example/用户',
      email: '用户+test@example.test',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /SUCCESS/);
    assert.equal(result.stderr, '');

    const rows = inspectDatabase(dbPath);
    assert.equal(rows['antigravity.profileUrl'], 'https://profile.example/用户');
    assert.equal(rows['antigravity.refreshToken'], refresh);
    assert.match(Buffer.from(rows['antigravityUnifiedStateSync.oauthToken'], 'base64').toString('utf8'), /oauthTokenInfoSentinelKey/);
    if (process.platform !== 'win32') {
      assert.equal(statSync(join(root, 'isolated')).mode & 0o777, 0o700);
      assert.equal(statSync(dbPath).mode & 0o777, 0o600);
    }

    const emptyOptionals = runWriter('write_vscdb.py', {
      db_paths: [dbPath],
      token: 'replacement-token',
      refresh_token: '',
      profile_url: '',
      email: '',
    });
    assert.equal(emptyOptionals.status, 0, emptyOptionals.stderr);
    const replacedRows = inspectDatabase(dbPath);
    assert.equal(replacedRows['antigravity.profileUrl'], undefined);
    assert.equal(replacedRows['antigravity.refreshToken'], undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('isolated worker writer preserves auth method and private database mode', () => {
  const root = mkdtempSync(join(tmpdir(), 'quotashift-worker-writer-'));
  try {
    const dbPath = join(root, 'User', 'globalStorage', 'state.vscdb');
    const result = runWriter('write_worker_vscdb.py', {
      db_paths: [dbPath],
      token: 'worker-access-"quoted"',
      refresh_token: 'worker-refresh',
      profile_url: 'https://profile.example/worker',
      email: 'worker@example.test',
      auth_method: 'enterprise',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /SUCCESS/);
    const rows = inspectDatabase(dbPath);
    assert.equal(rows['antigravity.authMethod'], 'enterprise');
    assert.equal(rows['antigravity.refreshToken'], 'worker-refresh');
    if (process.platform !== 'win32') assert.equal(statSync(dbPath).mode & 0o777, 0o600);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writers reject malformed input and write failures without echoing secrets', () => {
  for (const name of ['write_vscdb.py', 'write_worker_vscdb.py']) {
    const source = readFileSync(writerPath(name), 'utf8');
    const malformed = spawnSync('python', ['-c', source], {
      input: '{malformed-json',
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.notEqual(malformed.status, 0);
    assert.match(malformed.stderr, /invalid writer input/);
    assert.doesNotMatch(`${malformed.stdout}\n${malformed.stderr}`, /secret-value/);

    const root = mkdtempSync(join(tmpdir(), 'quotashift-writer-failure-'));
    try {
      const blocker = join(root, 'blocker');
      writeFileSync(blocker, 'not a directory');
      const failed = runWriter(name, {
        db_paths: [join(blocker, 'state.vscdb')],
        token: 'secret-value',
        refresh_token: 'secret-refresh',
      });
      assert.notEqual(failed.status, 0);
      assert.match(failed.stderr, /writer failed/);
      assert.doesNotMatch(`${failed.stdout}\n${failed.stderr}`, /secret-value|secret-refresh/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('writer subprocess shape carries synthetic payload on stdin and no secret argv', () => {
  const secret = 'argv-secret-quoted-\u{1f512}';
  const fake = 'import json, sys; print(json.dumps({"argv": sys.argv[1:], "stdin": sys.stdin.buffer.read().decode("utf-8")}))';
  const result = runPythonSource(fake, { token: secret, refresh_token: 'refresh' });
  assert.equal(result.status, 0, result.stderr);
  const captured = JSON.parse(result.stdout);
  assert.deepEqual(captured.argv, []);
  assert.equal(JSON.parse(captured.stdin).token, secret);
  assert.doesNotMatch(result.stderr, /argv-secret/);
});

test('writer sources do not read credential values from sys.argv', () => {
  for (const name of ['write_cred_mgr.py', 'write_vscdb.py', 'write_worker_vscdb.py']) {
    assert.doesNotMatch(readFileSync(writerPath(name), 'utf8'), /sys\.argv/);
  }
});
