import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const PYTHON_COMMAND = process.platform === 'win32' ? 'python' : 'python3';
const writerSource = readFileSync(
  new URL('../../src-tauri/src/python/write_cred_mgr.py', import.meta.url),
  'utf8',
);

// Loads the writer as a library (no Credential Manager access) and runs merge_credential.
function merge(existing, input) {
  const harness = `import datetime, json, sys
ns = {"__name__": "writer_under_test"}
exec(compile(sys.argv[1], "write_cred_mgr.py", "exec"), ns)
args = json.loads(sys.stdin.read())
now = datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)
print(json.dumps(ns["merge_credential"](args["existing"], args["token"], args.get("refresh"), args.get("id_token"), args.get("email"), now)))`;
  const result = spawnSync(PYTHON_COMMAND, ['-c', harness, writerSource], {
    input: JSON.stringify({ existing, ...input }),
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

const idTokenFor = (email) =>
  `header-phrase.${Buffer.from(JSON.stringify({ email })).toString('base64url')}.signature-phrase`;

const staleLogin = {
  auth_method: 'consumer',
  token: { access_token: 'old access phrase' },
  id_token: idTokenFor('previous@example.test'),
  id_token_email: 'previous@example.test',
};

test('applying an account with an id token relabels agy to that account', () => {
  const merged = merge(structuredClone(staleLogin), {
    token: 'new access phrase',
    id_token: idTokenFor('applied@example.test'),
    email: 'applied@example.test',
  });
  assert.equal(merged.id_token_email, 'applied@example.test');
  assert.equal(merged.token.access_token, 'new access phrase');
  assert.equal(merged.auth_method, 'consumer');
});

test('applying an account without an id token drops the stale id token and relabels', () => {
  const merged = merge(structuredClone(staleLogin), {
    token: 'new access phrase',
    email: 'applied@example.test',
  });
  assert.equal(merged.id_token, undefined);
  assert.equal(merged.id_token_email, 'applied@example.test');
});

test('the id token owner wins over a mismatched requested email', () => {
  const merged = merge(structuredClone(staleLogin), {
    token: 'new access phrase',
    id_token: idTokenFor('owner@example.test'),
    email: 'requested@example.test',
  });
  assert.equal(merged.id_token_email, 'owner@example.test');
});

test('no identity at all removes the stale label instead of keeping it', () => {
  const merged = merge(structuredClone(staleLogin), { token: 'new access phrase' });
  assert.equal(merged.id_token, undefined);
  assert.equal(merged.id_token_email, undefined);
});

test('writer only touches Credential Manager when run as a script', () => {
  assert.match(writerSource, /if __name__ == "__main__":\s+main\(\)/);
  assert.doesNotMatch(writerSource.split('def main():')[0], /WinDLL/);
});
