import { readFile } from 'node:fs/promises';
import { importPackageBytes } from '../src/core/package.js';

const path = process.argv[2];
if (!path) {
  console.error('Usage: npm run validate-package -- <path/to/package.quiz.json>');
  process.exitCode = 2;
} else {
  try {
    const quiz = await importPackageBytes(await readFile(path));
    console.log(`Valid: ${quiz.payload.title}`);
    console.log(`${quiz.payload.questions.length} questions · ${quiz.payload.repository.branch} · ${quiz.payload.repository.commitSha}`);
    console.log('Structure, references, and recorded independent review are consistent.');
  } catch (error) {
    console.error(`${error.code ?? 'read-error'}: ${error.message}`);
    process.exitCode = 1;
  }
}
