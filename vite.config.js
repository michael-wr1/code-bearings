import { readFile } from 'node:fs/promises';
import { defineConfig } from 'vite';
import { bundledDependencyNotices } from './scripts/build-licenses.mjs';

export default defineConfig({
  plugins: [{
    name: 'distribution-licenses',
    async generateBundle() {
      const [license, notices] = await Promise.all([
        readFile(new URL('./LICENSE', import.meta.url), 'utf8'),
        bundledDependencyNotices({ includeVite: true }),
      ]);
      this.emitFile({ type: 'asset', fileName: 'LICENSE', source: license });
      this.emitFile({ type: 'asset', fileName: 'THIRD-PARTY-NOTICES.txt', source: notices });
    },
  }],
});
