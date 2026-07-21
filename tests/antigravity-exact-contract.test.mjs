import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('exact parser keeps five-hour and weekly lanes independent', () => {
  const source = read('src-tauri/src/parser.rs');
  assert.match(source, /classify_bucket_window/);
  assert.match(source, /BucketWindow::FiveHour/);
  assert.match(source, /BucketWindow::Weekly/);
  assert.doesNotMatch(source, /shared_unlabeled/);
});

test('only exhausted entries with missing percentages contribute zero', () => {
  const source = read('src-tauri/src/parser.rs');
  assert.match(source, /remaining_fraction:\s*Option<f64>/);
  assert.match(source, /None if bucket\.disabled => 0/);
  assert.match(source, /None => continue/);
  assert.match(source, /BucketWindow::Unknown[\s\S]*continue/);
  assert.doesNotMatch(source, /remaining_fraction:\s*remaining[^\n]+unwrap_or\(1\.0\)/);
});

test('exact result verifies the local account email', () => {
  const source = read('src-tauri/src/antigravity_exact.rs');
  assert.match(source, /normalize_email/);
  assert.match(source, /identity mismatch/i);
  assert.match(source, /parse_exact_status/);
});
