/**
 * Percent-encoding decoder following RFC 3986 §2.1.
 *
 * Decoding strategy — single, stated interpretation:
 *
 *   • All "%HH" sequences (where HH is two uppercase or lowercase hex digits)
 *     are treated as raw octets and concatenated into a byte buffer.
 *   • Non-encoded characters are appended to the same byte buffer as their
 *     UTF-8 bytes, so a string containing both literal and escaped UTF-8
 *     fragments decodes correctly.
 *   • If a stray percent is followed by non-hex characters, or the hex run
 *     ends prematurely, the malformed escape is copied verbatim into the
 *     output. This keeps the decoder total: every input produces output.
 *   • The result is then interpreted as UTF-8. Invalid UTF-8 sequences are
 *     replaced with U+FFFD (the Unicode replacement character) per the
 *     WHATWG "replace" error mode, never thrown.
 *
 * Why not throw on malformed escapes? Callers frequently receive data from
 * untrusted URLs and banners; a total decoder that preserves unrecognised
 * bytes lets higher layers decide policy. Throwing would force every caller
 * to wrap the call in try/catch even when best-effort output is acceptable.
 */

const HEX = (() => {
  const t = new Uint8Array(128).fill(255);
  for (let i = 0; i < 10; i++) t[0x30 + i] = i;
  for (let i = 0; i < 6; i++) {
    t[0x41 + i] = 10 + i;
    t[0x61 + i] = 10 + i;
  }
  return t;
})();

function textEncoder() {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder();
  // Fallback for environments without TextEncoder; encodes BMP chars as UTF-8.
  return {
    encode(s) {
      const out = [];
      for (const ch of s) {
        const cp = ch.codePointAt(0);
        if (cp < 0x80) out.push(cp);
        else if (cp < 0x800) {
          out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
        } else if (cp < 0x10000) {
          out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        } else {
          out.push(
            0xf0 | (cp >> 18),
            0x80 | ((cp >> 12) & 0x3f),
            0x80 | ((cp >> 6) & 0x3f),
            0x80 | (cp & 0x3f),
          );
        }
      }
      return Uint8Array.from(out);
    },
  };
}

function textDecoder() {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8', { fatal: false });
  // Minimal UTF-8 decoder with replacement semantics.
  return {
    decode(bytes) {
      let out = '';
      let i = 0;
      const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      while (i < b.length) {
        const byte = b[i];
        if (byte < 0x80) {
          out += String.fromCharCode(byte);
          i++;
        } else if (byte < 0xc0) {
          out += '\ufffd';
          i++;
        } else if (byte < 0xe0) {
          if (i + 1 < b.length && (b[i + 1] & 0xc0) === 0x80) {
            out += String.fromCharCode(((byte & 0x1f) << 6) | (b[i + 1] & 0x3f));
            i += 2;
          } else {
            out += '\ufffd';
            i++;
          }
        } else if (byte < 0xf0) {
          if (i + 2 < b.length && (b[i + 1] & 0xc0) === 0x80 && (b[i + 2] & 0xc0) === 0x80) {
            out += String.fromCharCode(((byte & 0x0f) << 12) | ((b[i + 1] & 0x3f) << 6) | (b[i + 2] & 0x3f));
            i += 3;
          } else {
            out += '\ufffd';
            i++;
          }
        } else {
          if (i + 3 < b.length && (b[i + 1] & 0xc0) === 0x80 && (b[i + 2] & 0xc0) === 0x80 && (b[i + 3] & 0xc0) === 0x80) {
            const cp = ((byte & 0x07) << 18) | ((b[i + 1] & 0x3f) << 12) | ((b[i + 2] & 0x3f) << 6) | (b[i + 3] & 0x3f);
            out += String.fromCodePoint(cp);
            i += 4;
          } else {
            out += '\ufffd';
            i++;
          }
        }
      }
      return out;
    },
  };
}

const sharedEncoder = textEncoder();
const sharedDecoder = textDecoder();

/**
 * Error thrown only when the caller explicitly requests strict mode
 * via decodeToBytes(input, { throwOnMalformed: true }).
 */
export class DecodeError extends Error {
  constructor(message, position) {
    super(message);
    this.name = 'DecodeError';
    if (typeof position === 'number') this.position = position;
  }
}

/**
 * Decode a percent-encoded string into a UTF-8 string.
 *
 * @param {string} input - percent-encoded input; coerced to String.
 * @param {object} [options]
 * @param {boolean} [options.throwOnMalformed=false] - if true, a stray '%' or
 *   short hex run raises DecodeError instead of being copied verbatim.
 * @returns {string}
 */
export function decode(input, options) {
  const bytes = decodeToBytes(input, options);
  return sharedDecoder.decode(bytes);
}

/**
 * Decode a percent-encoded string into a byte array.
 *
 * Returns the raw octets before UTF-8 decoding, useful when the caller wants
 * to apply a different charset or inspect malformed byte sequences.
 *
 * @param {string} input
 * @param {object} [options]
 * @param {boolean} [options.throwOnMalformed=false]
 * @returns {Uint8Array}
 */
export function decodeToBytes(input, options) {
  const s = String(input);
  const throwOnMalformed = !!(options && options.throwOnMalformed);
  const chunks = [];
  let i = 0;
  const n = s.length;

  while (i < n) {
    const ch = s.charCodeAt(i);

    if (ch === 0x25) {
      // Lookahead for two hex digits. We must read both before committing,
      // because a malformed escape should either throw (strict) or be copied
      // verbatim including the '%'.
      const h1 = i + 1 < n ? HEX[s.charCodeAt(i + 1) & 0x7f] : 255;
      const h2 = i + 2 < n ? HEX[s.charCodeAt(i + 2) & 0x7f] : 255;

      if (h1 !== 255 && h2 !== 255) {
        chunks.push(h1 << 4 | h2);
        i += 3;
        continue;
      }

      if (throwOnMalformed) {
        throw new DecodeError('malformed percent-escape at position ' + i, i);
      }
      // Copy the '%' verbatim; the loop will advance past it next iteration.
      chunks.push(0x25);
      i++;
      continue;
    }

    // ASCII fast path — avoids allocating a substring for the common case.
    if (ch < 0x80) {
      chunks.push(ch);
      i++;
      continue;
    }

    // Non-ASCII literal: accumulate a run so TextEncoder is called once per
    // run rather than once per character.
    let j = i + 1;
    while (j < n) {
      const cj = s.charCodeAt(j);
      if (cj === 0x25 || cj < 0x80) break;
      j++;
    }
    const bytes = sharedEncoder.encode(s.slice(i, j));
    for (let k = 0; k < bytes.length; k++) chunks.push(bytes[k]);
    i = j;
  }

  return Uint8Array.from(chunks);
}
