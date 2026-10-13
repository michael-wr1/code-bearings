import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const source = new URL('../skills/code-bearings-quiz/', import.meta.url);
const destination = new URL('../.skill-build/code-bearings-quiz/', import.meta.url);
await rm(destination, { recursive: true, force: true });
for (const directory of ['references/', 'scripts/', 'assets/']) await mkdir(new URL(directory, destination), { recursive: true });
const files = ['SKILL.md', 'references/preparation.md', 'references/package-contract.md'];
for (const file of files) {
  const content = await readFile(new URL(file, source), 'utf8');
  const schemaPath = file === 'SKILL.md' ? '../../schema/quiz-package-v1.schema.json' : '../../../schema/quiz-package-v1.schema.json';
  if (!content.includes(schemaPath)) throw new Error(`Expected schema link missing from ${file}.`);
  const portablePath = file === 'SKILL.md' ? 'assets/quiz-package-v1.schema.json' : '../assets/quiz-package-v1.schema.json';
  await writeFile(new URL(file, destination), content.replaceAll(schemaPath, portablePath));
}
await copyFile(new URL('../schema/quiz-package-v1.schema.json', import.meta.url), new URL('assets/quiz-package-v1.schema.json', destination));
const notices = await Promise.all(['ajv/LICENSE', 'fast-deep-equal/LICENSE'].map(path => readFile(new URL(`../node_modules/${path}`, import.meta.url), 'utf8')));
await writeFile(new URL('assets/third-party-notices.txt', destination), `Bundled runtime helpers: Ajv and fast-deep-equal\n\n${notices.join('\n\n')}`);
await build({
  configFile: false,
  publicDir: false,
  ssr: { noExternal: true },
  build: {
    ssr: fileURLToPath(new URL('scripts/quiz-tools.mjs', source)),
    outDir: fileURLToPath(new URL('scripts/', destination)),
    target: 'node22', minify: false, emptyOutDir: true,
    rolldownOptions: { output: { format: 'es', entryFileNames: 'quiz-tools.mjs' } },
  },
});
console.log('Portable skill built at .skill-build/code-bearings-quiz/.');
