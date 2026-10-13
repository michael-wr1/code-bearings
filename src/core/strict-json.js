import { PackageError } from './errors.js';

// Native JSON parsing discards duplicate object keys. Preserve that distinction
// before validating and hashing an imported package.
export function parseStrictJson(text) {
  let position = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const number = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const fail = (message) => {
    throw new PackageError('invalid-json', `${message} at character ${position + 1}.`);
  };
  const whitespace = () => {
    while (/[\x20\t\r\n]/.test(text[position] ?? '') && position < text.length) position++;
  };
  const string = () => {
    const start = position++;
    while (position < text.length) {
      if (text[position] === '\\') position += 2;
      else if (text[position++] === '"') {
        try { return JSON.parse(text.slice(start, position)); }
        catch { fail('Invalid string'); }
      }
    }
    fail('Unterminated string');
  };
  const value = (depth = 0) => {
    if (depth > 100) fail('JSON nesting is too deep');
    whitespace();
    const char = text[position];
    if (char === '"') return string();
    if (char === '{') {
      position++;
      const result = Object.create(null);
      const keys = new Set();
      whitespace();
      if (text[position] === '}') { position++; return result; }
      while (position < text.length) {
        whitespace();
        if (text[position] !== '"') fail('Expected an object key');
        const key = string();
        if (keys.has(key)) fail('Duplicate object key');
        keys.add(key);
        whitespace();
        if (text[position++] !== ':') fail('Expected a colon');
        result[key] = value(depth + 1);
        whitespace();
        if (text[position] === '}') { position++; return result; }
        if (text[position++] !== ',') fail('Expected a comma or closing brace');
      }
      fail('Unterminated object');
    }
    if (char === '[') {
      position++;
      const result = [];
      whitespace();
      if (text[position] === ']') { position++; return result; }
      while (position < text.length) {
        result.push(value(depth + 1));
        whitespace();
        if (text[position] === ']') { position++; return result; }
        if (text[position++] !== ',') fail('Expected a comma or closing bracket');
      }
      fail('Unterminated array');
    }
    for (const [token, parsed] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(token, position)) { position += token.length; return parsed; }
    }
    number.lastIndex = position;
    const match = number.exec(text);
    if (match) { position = number.lastIndex; return Number(match[0]); }
    fail('Expected a JSON value');
  };
  const result = value();
  whitespace();
  if (position !== text.length) fail('Unexpected content after JSON');
  return result;
}
