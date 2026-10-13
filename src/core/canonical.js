import { PackageError } from './errors.js';

function validUnicode(text) {
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code >= 0xd800 && code <= 0xdfff) {
      throw new PackageError('invalid-json', 'Package contains an unpaired Unicode surrogate.');
    }
  }
}

// RFC 8785: UTF-16 key sorting, ECMAScript primitive serialization, no Unicode
// normalization, and preserved array order. V1 restricts numbers to safe integers.
export function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => {
      validUnicode(key);
      return `${JSON.stringify(key)}:${canonicalize(value[key])}`;
    }).join(',')}}`;
  }
  if (typeof value === 'string') validUnicode(value);
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new PackageError('invalid-json', 'Package numbers must be finite safe integers.');
  }
  return JSON.stringify(value);
}

export async function payloadDigest(payload) {
  const data = new TextEncoder().encode(canonicalize(payload));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
