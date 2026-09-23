import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf-8');

test('system/process/query.rs correctly handles HTTPS and CSRF tokens to avoid HTTP fallback issues', () => {
  const queryRs = read('src-tauri/src/system/process/query.rs');
  
  assert.match(queryRs, /danger_accept_invalid_certs\(true\)/, 'query_server_https must ignore invalid certs for local servers');
  assert.match(queryRs, /header\("X-Codeium-Csrf-Token", token\)\s*\.header\("X-CSRF-Token", token\)/, 'query_server_https must send both CSRF token variations');
  assert.match(queryRs, /Err\(format!\("APP_ERR: HTTP status: \{\}", res\.status\(\)\)\)/, 'Must format HTTP status errors with prefix "APP_ERR: HTTP status: "');
});

test('antigravity/worker/process.rs does not fall back to HTTP when an HTTP status error occurs', () => {
  const processRs = read('src-tauri/src/antigravity/worker/process.rs');
  
  assert.match(processRs, /Err\(e\) if e\.starts_with\("APP_ERR:"\) => return Err\(e\),/, 'Must intercept APP_ERR: errors and prevent fallback to HTTP');
  assert.match(processRs, /Err\(_\) => \(\s*query_server/, 'Must still fall back to HTTP on connection errors');
});
