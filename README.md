# Percent Encoding Decoder

Decodes percent-encoded strings per RFC 3986, building a byte buffer from `%HH` escapes and non-encoded text, then interpreting it as UTF-8.

```js
import { decode, decodeToBytes, DecodeError } from 'percent-encoding-decoder';

decode('%E4%B8%96%E7%95%8C');        // → '世界'
decode('café%20naïve');               // → 'café naïve'
decode('100%25 done');               // → '100% done'
decode('100%25 done', { throwOnMalformed: true }); // → throws DecodeError

const bytes = decodeToBytes('%C3%A9'); // → Uint8Array [0xc3, 0xa9]
```

## Why

URLs in the wild mix correctly escaped UTF-8, legacy Latin-1 escapes, and stray percent signs from template substitution. `decodeURIComponent` throws on the first malformed escape, which is correct for spec compliance but impractical when scanning untrusted input. This library is total: every input produces output. Malformed escapes are copied verbatim by default, and invalid UTF-8 octets become the replacement character `U+FFFD` rather than raising.

If you want strict behaviour, pass `{ throwOnMalformed: true }` and catch `DecodeError`, whose `position` property gives the index of the offending `%`.

## Edge you will hit

A stray `%` not followed by two hex digits is preserved as a literal `%` in the output, not interpreted as an error. This is deliberate so that strings like `100%25 done` survive round-tripping. If your data should never contain a bare percent, enable strict mode.

The library does not decode `+` to space — that is `application/x-www-form-urlencoded` semantics, not RFC 3986 percent-encoding.

## Exports

- `decode(input: string, options?: { throwOnMalformed?: boolean }): string`
- `decodeToBytes(input: string, options?: { throwOnMalformed?: boolean }): Uint8Array`
- `DecodeError` — thrown only in strict mode; carries a `position` property.

## Design notes

The window stores values eagerly rather than keeping running aggregates. Running
sums drift with floating point over long streams, and recomputing from a small
buffer is cheap enough that the drift is not worth the speed.


## License

MIT
