import { readFile } from 'node:fs/promises';

export async function bundledDependencyNotices({ includeVite = false } = {}) {
  const dependencies = [
    ['Ajv runtime helpers', 'ajv/LICENSE'],
    ['fast-deep-equal', 'fast-deep-equal/LICENSE'],
  ];
  const notices = await Promise.all(dependencies.map(async ([name, path]) =>
    `${name}\n\n${await readFile(new URL(`../node_modules/${path}`, import.meta.url), 'utf8')}`));
  if (includeVite) {
    const viteLicense = await readFile(new URL('../node_modules/vite/LICENSE.md', import.meta.url), 'utf8');
    const separator = viteLicense.indexOf('# Licenses of bundled dependencies');
    if (separator === -1) throw new Error('Vite core license section not found.');
    notices.push(`Vite browser module-preload helper\n\n${viteLicense.slice(0, separator).trim()}`);
  }
  return `Third-party code bundled with Code Bearings\n\n${notices.join('\n\n---\n\n')}\n`;
}
