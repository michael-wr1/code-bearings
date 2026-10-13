import { readFile, mkdir, writeFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import standalone from 'ajv/dist/standalone/index.js';

const schema = JSON.parse(await readFile(new URL('../schema/quiz-package-v1.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: true, allErrors: true, code: { source: true, esm: true } });
let code = standalone(ajv, ajv.compile(schema));
// Ajv's standalone runtime helpers use require even with ESM exports. Convert
// these fixed compiler-generated imports so Node and Vite share the same output.
code = code.replace(/const (\w+) = require\("(ajv\/dist\/runtime\/[^".]+)"\)\.default;/g,
  (_, name, path) => `import ${name}Module from '${path}.js'; const ${name} = ${name}Module.default ?? ${name}Module;`);
if (code.includes('require(')) throw new Error('Unexpected standalone validator dependency.');
await mkdir(new URL('../src/generated/', import.meta.url), { recursive: true });
await writeFile(new URL('../src/generated/package-validator.js', import.meta.url), code);
console.log('Compiled the v1 package schema.');
