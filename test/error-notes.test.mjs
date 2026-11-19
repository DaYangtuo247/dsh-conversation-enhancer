/*
 * error-notes: how a failed model request's body is laid out. The 429 text is the one dsh printed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPart } from './lib/harness.mjs';

const React = { useMemo: (f) => f(), Fragment: 'f' };
const { readFailure } = runPart('12-error-notes.js', { React, h: () => null, sheet: () => ({ ensure() {}, remove() {} }) }, 'zh-CN', ['readFailure']);
const pairs = (f) => Array.from(f.fields, ([k, v]) => `${k}=${v}`);

const CAPACITY = '429 {"detail":{"error":{"message":"Model \'DeepSeek-V4.1-Flash\' is at capacity; please retry later or use another model","type":"rate_limit_error","code":"model_concurrency_rate_limit_exceeded"}}}';

test('a 429 body: its message is the sentence, the status and the other fields follow', () => {
  const f = readFailure(CAPACITY);
  assert.equal(f.message, "Model 'DeepSeek-V4.1-Flash' is at capacity; please retry later or use another model");
  assert.deepEqual(pairs(f), ['HTTP=429', 'type=rate_limit_error', 'code=model_concurrency_rate_limit_exceeded']);
  assert.equal(f.json, null);
});

test('fields from every level are kept, outer first; null and nested values are not fields', () => {
  const f = readFailure('Error: 400 {"request_id":"r1","error":{"message":"bad","param":null,"code":"x","extra":{"a":1}}}');
  assert.equal(f.message, 'bad');
  assert.deepEqual(pairs(f), ['HTTP=400', 'request_id=r1', 'code=x']);
});

test('a string detail is the message; a body with no message is shown as itself', () => {
  assert.equal(readFailure('{"detail":"Not Found"}').message, 'Not Found');
  const f = readFailure('500 {"status":"down","retry":true}');
  assert.equal(f.message, '');
  assert.deepEqual(pairs(f), ['HTTP=500', 'status=down', 'retry=true']);
  assert.ok(f.json, 'the body is drawn as JSON');
});

test('a text without a JSON object is left to dsh', () => {
  assert.equal(readFailure('outbound body measures ~1,259,433 tokens (messages ~274,010) vs the effective model window 1,048,576'), null);
  assert.equal(readFailure('TypeError: fetch failed'), null);
  assert.equal(readFailure('{not json'), null);
  assert.equal(readFailure(''), null);
});
