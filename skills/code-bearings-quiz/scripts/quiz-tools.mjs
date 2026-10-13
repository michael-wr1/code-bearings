import { readFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { importPackageBytes, MAX_PACKAGE_BYTES } from '../../../src/core/package.js';
import { parseStrictJson } from '../../../src/core/strict-json.js';
import { payloadDigest } from '../../../src/core/canonical.js';

const execute = promisify(execFile);
const usage = 'Usage: node quiz-tools.mjs validate <quiz.json> | digest <payload.json> | verify-sources <quiz.json> <checkout>';
async function readInput(path) {
  if ((await stat(path)).size > MAX_PACKAGE_BYTES) throw new Error('Input must be 10 MiB or smaller.');
  const bytes = await readFile(path);
  if (bytes.byteLength > MAX_PACKAGE_BYTES) throw new Error('Input must be 10 MiB or smaller.');
  return bytes;
}
async function git(checkout, args) {
  return (await execute('git', ['-C', checkout, ...args], { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 })).stdout;
}
async function verifySources(quiz, checkout) {
  const { commitSha, branch } = quiz.payload.repository;
  const kind = new TextDecoder().decode(await git(checkout, ['cat-file', '-t', commitSha])).trim();
  if (kind !== 'commit') throw new Error('Recorded SHA must identify a commit.');
  const refs = new TextDecoder().decode(await git(checkout, ['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes'])).trim().split('\n');
  const candidates = refs.filter(ref => ref === `refs/heads/${branch}` || (ref.startsWith('refs/remotes/') && ref.slice('refs/remotes/'.length).split('/').slice(1).join('/') === branch));
  let reachable = false;
  for (const ref of candidates) {
    try { await git(checkout, ['merge-base', '--is-ancestor', commitSha, ref]); reachable = true; break; }
    catch (error) { if (error.code !== 1) throw error; }
  }
  if (!reachable) throw new Error('Recorded commit is not reachable from the named branch in this checkout.');
  for (const source of quiz.payload.sources) {
    const bytes = await git(checkout, ['cat-file', 'blob', `${commitSha}:${source.path}`]);
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes).replace(/\r\n/g, '\n');
    const lines = text ? text.split('\n') : [];
    // A terminal newline ends the last line; it does not create another one.
    // Remove only its split delimiter so an actual final blank line is preserved.
    if (text.endsWith('\n')) lines.pop();
    const actual = lines.slice(source.startLine - 1, source.endLine).join('\n');
    if (source.endLine > lines.length || actual !== source.code) throw new Error(`Source mismatch: ${source.path}:${source.startLine}-${source.endLine}`);
  }
}

const args = process.argv.slice(2);
const [command, input, checkout] = args;
if (command === '--help' && args.length === 1) console.log(usage);
else if (!input || !['validate', 'digest', 'verify-sources'].includes(command) || args.length !== (command === 'verify-sources' ? 3 : 2) || (command === 'verify-sources' && !checkout)) {
  console.error(usage);
  process.exitCode = 2;
} else {
  try {
    const bytes = await readInput(input);
    if (command === 'digest') {
      const payload = parseStrictJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (!payload || Array.isArray(payload) || typeof payload !== 'object') throw new Error('Provide the payload object alone.');
      if ('formatVersion' in payload && 'verification' in payload) throw new Error('Provide payload alone, not the package envelope.');
      console.log(await payloadDigest(payload));
    } else {
      const quiz = await importPackageBytes(bytes);
      if (command === 'verify-sources') {
        await verifySources(quiz, checkout);
        console.log(`Source checks passed: ${quiz.payload.sources.length} excerpts at ${quiz.payload.repository.commitSha}.`);
      } else console.log(`Package checks passed: ${quiz.payload.questions.length} questions; ${quiz.payload.repository.commitSha}.`);
    }
  } catch (error) {
    console.error(`${error.code ?? 'check-failed'}: ${error.message}`);
    if (error.path) console.error(`Field: ${error.path}`);
    process.exitCode = 1;
  }
}
