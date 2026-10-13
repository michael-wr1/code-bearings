import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { payloadDigest } from '../../src/core/canonical.js';

const execute = promisify(execFile);
const fixture = JSON.parse(await readFile(new URL('../fixtures/repository-overview.quiz.json', import.meta.url), 'utf8'));
let directory, tool, packagePath, payloadPath, checkout, committedPackage;
async function run(...args) {
  try {
    const result = await execute(process.execPath, [tool, ...args], { cwd: directory, env: { ...process.env, NODE_PATH: '' } });
    return { code: 0, ...result };
  } catch (error) { return { code: error.code, stdout: error.stdout, stderr: error.stderr }; }
}
async function git(...args) {
  return (await execute('git', ['-C', checkout, ...args])).stdout.trim();
}
async function writePackage(name, quiz) {
  quiz.verification.reviewedPayloadSha256 = await payloadDigest(quiz.payload);
  const destination = join(directory, name);
  await writeFile(destination, JSON.stringify(quiz));
  return destination;
}
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'code-bearings-skill-'));
  await cp(new URL('../../.skill-build/code-bearings-quiz/', import.meta.url), join(directory, 'installed-skill'), { recursive: true });
  tool = join(directory, 'installed-skill/scripts/quiz-tools.mjs');
  packagePath = join(directory, 'example.quiz.json');
  payloadPath = join(directory, 'payload.json');
  await writeFile(packagePath, JSON.stringify(fixture));
  await writeFile(payloadPath, JSON.stringify(fixture.payload));
  checkout = join(directory, 'example-repository');
  await mkdir(checkout);
  await git('init', '-b', 'main');
  committedPackage = structuredClone(fixture);
  committedPackage.payload.sources[0].code = '\ufeff' + committedPackage.payload.sources[0].code;
  for (const source of committedPackage.payload.sources) {
    const path = join(checkout, source.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, source.code.replace(/\n/g, '\r\n'));
  }
  await git('add', '.');
  await git('-c', 'user.name=Fixture Author', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'Synthetic source snapshot');
  const sha = await git('rev-parse', 'HEAD');
  committedPackage.payload.repository.commitSha = sha;
  committedPackage.verification.sourceCommitSha = sha;
});
after(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

test('exported tools validate a package from an isolated installation without npm dependencies', async () => {
  const result = await run('validate', packagePath);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /8 questions/);
});
test('exported digest matches the viewer canonicalization and rejects an envelope', async () => {
  const result = await run('digest', payloadPath);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.trim(), fixture.verification.reviewedPayloadSha256);
  assert.equal((await run('digest', packagePath)).code, 1);
});
test('exported validator rejects stale content and gives distinct usage exit codes', async () => {
  const changed = structuredClone(fixture);
  changed.payload.title += ' edited';
  const path = join(directory, 'stale.quiz.json');
  await writeFile(path, JSON.stringify(changed));
  const result = await run('validate', path);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /stale-verification/);
  assert.equal((await run()).code, 2);
  assert.equal((await run('verify-sources', packagePath)).code, 2);
  assert.equal((await run('validate', packagePath, '')).code, 2);
  assert.equal((await run('--help')).code, 0);
});
test('digest rejects duplicate keys and oversized inputs', async () => {
  const duplicate = join(directory, 'duplicate.json');
  const oversized = join(directory, 'oversized.json');
  await writeFile(duplicate, '{"value":1,"value":2}');
  await writeFile(oversized, ' '.repeat(10 * 1024 * 1024 + 1));
  assert.equal((await run('digest', duplicate)).code, 1);
  assert.equal((await run('digest', oversized)).code, 1);
});
test('source comparison reads the pinned Git snapshot, preserving BOM and normalizing CRLF', async () => {
  const path = await writePackage('committed.quiz.json', structuredClone(committedPackage));
  await writeFile(join(checkout, 'src/store.js'), 'uncommitted replacement');
  const before = await git('status', '--porcelain');
  const result = await run('verify-sources', path, checkout);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /4 excerpts/);
  assert.equal(await git('status', '--porcelain'), before);
  assert.equal(await readFile(join(checkout, 'src/store.js'), 'utf8'), 'uncommitted replacement');
});
test('source comparison rejects fabricated code even with a consistent review digest', async () => {
  const invalid = structuredClone(committedPackage);
  invalid.payload.sources[0].code = invalid.payload.sources[0].code.replace('new Map()', 'new Set()');
  const path = await writePackage('invented.quiz.json', invalid);
  const result = await run('verify-sources', path, checkout);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Source mismatch: src\/store.js/);
});
test('source comparison accepts a remote-tracking branch and rejects an unknown branch', async () => {
  await git('update-ref', 'refs/remotes/example/released', committedPackage.payload.repository.commitSha);
  const remote = structuredClone(committedPackage);
  remote.payload.repository.branch = 'released';
  const remotePath = await writePackage('remote.quiz.json', remote);
  assert.equal((await run('verify-sources', remotePath, checkout)).code, 0);
  const missing = structuredClone(committedPackage);
  missing.payload.repository.branch = 'missing';
  const missingPath = await writePackage('missing-branch.quiz.json', missing);
  const result = await run('verify-sources', missingPath, checkout);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /not reachable/);
});
test('source comparison rejects a commit newer than the selected branch', async () => {
  await git('branch', 'older', committedPackage.payload.repository.commitSha);
  await git('-c', 'user.name=Fixture Author', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'Another synthetic snapshot');
  const invalid = structuredClone(committedPackage);
  invalid.payload.repository.branch = 'older';
  invalid.payload.repository.commitSha = await git('rev-parse', 'HEAD');
  invalid.verification.sourceCommitSha = invalid.payload.repository.commitSha;
  const path = await writePackage('unreachable.quiz.json', invalid);
  const result = await run('verify-sources', path, checkout);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /not reachable/);
});
