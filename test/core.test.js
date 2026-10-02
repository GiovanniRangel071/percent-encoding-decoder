import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode, decodeToBytes, DecodeError } from '../src/index.js';

test('plain ASCII passes through unchanged', () => {
  assert.equal(decode('hello world'), 'hello world');
});

test('basic percent escapes decode', () => {
  assert.equal(decode('%20'), ' ');
  assert.equal(decode('a%20b'), 'a b');
});

test('lowercase hex is accepted', () => {
  assert.equal(decode('%2f'), '/');
  assert.equal(decode('%2F'), '/');
});

test('reserved characters from RFC 3986 examples', () => {
  assert.equal(decode('%3A'), ':');
  assert.equal(decode('%2F'), '/');
  assert.equal(decode('%3F'), '?');
  assert.equal(decode('%23'), '#');
  assert.equal(decode('%5B'), '[');
  assert.equal(decode('%5D'), ']');
});

test('multibyte UTF-8 round-trips', () => {
  const input = encodeURIComponent('café — 漢字');
  assert.equal(decode(input), 'café — 漢字');
});

test('mixed literal and escaped UTF-8 in one string', () => {
  assert.equal(decode('café%20naïve'), 'café naïve');
});

test('astral plane character decodes correctly', () => {
  // U+1F600 encoded as four UTF-8 bytes: F0 9F 98 80
  assert.equal(decode('%F0%9F%98%80'), '😀');
});

test('consecutive escapes', () => {
  assert.equal(decode('%41%42%43'), 'ABC');
});

test('stray percent is copied verbatim by default', () => {
  assert.equal(decode('100% done'), '100% done');
  assert.equal(decode('%ZZ'), '%ZZ');
  assert.equal(decode('%2'), '%2');
});

test('truncated escape at end of string is copied verbatim', () => {
  assert.equal(decode('end%'), 'end%');
  assert.equal(decode('end%2'), 'end%2');
});

test('throwOnMalformed throws on stray percent', () => {
  assert.throws(() => decode('100% done', { throwOnMalformed: true }), DecodeError);
});

test('throwOnMalformed error carries position', () => {
  try {
    decode('abc%ZZ', { throwOnMalformed: true });
    assert.fail('should have thrown');
  } catch (err) {
    assert.ok(err instanceof DecodeError);
    assert.equal(err.position, 3);
  }
});

test('decodeToBytes returns raw octets', () => {
  const bytes = decodeToBytes('%C3%A9'); // é in UTF-8
  assert.deepEqual(Array.from(bytes), [0xc3, 0xa9]);
});

test('decodeToBytes preserves invalid UTF-8 bytes', () => {
  // 0xFF is never a valid leading UTF-8 byte.
  const bytes = decodeToBytes('%FF');
  assert.deepEqual(Array.from(bytes), [0xff]);
});

test('invalid UTF-8 becomes replacement character in decode', () => {
  assert.equal(decode('%FF'), '\ufffd');
});

test('empty input returns empty', () => {
  assert.equal(decode(''), '');
  assert.deepEqual(Array.from(decodeToBytes('')), []);
});

test('non-string input is coerced to string', () => {
  // null -> "null", number 42 -> "42"
  assert.equal(decode(null), 'null');
  assert.equal(decode(42), '42');
});
