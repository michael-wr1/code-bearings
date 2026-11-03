import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { payloadDigest } from '../../src/core/canonical.js';

// Synthetic history (all content fictional):
//   main:     M0 ── M1 ──────── M2            (M1 and M2 change only README.md)
//                    └── F1  feature           (rewrites import, renames legacy-log.js to history/index.js)
//   integration: M2 merged with F1 as MG
//   x/y:      criss-cross merges from M0, producing two merge bases
const execute = promisify(execFile);
const fixture = JSON.parse(await readFile(new URL('../fixtures/change-set.quiz.json', import.meta.url), 'utf8'));
let directory, tool, checkout;
const sha = {};
async function run(...args) {
  try {
    const result = await execute(process.execPath, [tool, ...args], { cwd: directory, env: { ...process.env, NODE_PATH: '' } });
    return { code: 0, ...result };
  } catch (error) { return { code: error.code, stdout: error.stdout, stderr: error.stderr }; }
}
async function git(...args) {
  return (await execute('git', ['-C', checkout, '-c', 'user.name=Fixture Author', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args])).stdout.trim();
}
async function write(files) {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(checkout, path)), { recursive: true });
    await writeFile(join(checkout, path), content);
  }
}
async function commit(message, files = {}) {
  await write(files);
  await git('add', '-A');
  await git('commit', '--allow-empty', '-m', message);
  return git('rev-parse', 'HEAD');
}
// Reassembles each file at head from its contiguous fixture excerpts.
function headFiles() {
  const files = {};
  for (const source of [...fixture.payload.sources].sort((a, b) => a.startLine - b.startLine)) {
    files[source.path] = files[source.path] ? `${files[source.path]}\n${source.code}` : source.code;
  }
  return Object.fromEntries(Object.entries(files).map(([path, code]) => [path, `${code}\n`]));
}
async function writePackage(name, change = () => {}) {
  const quiz = structuredClone(fixture);
  Object.assign(quiz.payload.repository, { branch: 'feature', commitSha: sha.F1 });
  quiz.payload.changeSet = {
    baseCommitSha: sha.M1,
    selection: { method: 'merge-base', comparisonBranch: 'main', comparisonCommitSha: sha.M2 },
    focusPaths: ['src/import/', 'src/history/'],
    compareUrl: `https://example.invalid/repository/compare/${sha.M1}...${sha.F1}`,
  };
  change(quiz.payload);
  quiz.verification.sourceCommitSha = quiz.payload.repository.commitSha;
  quiz.verification.reviewedPayloadSha256 = await payloadDigest(quiz.payload);
  const path = join(directory, name);
  await writeFile(path, JSON.stringify(quiz));
  return path;
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'code-bearings-change-set-'));
  await cp(new URL('../../.skill-build/code-bearings-quiz/', import.meta.url), join(directory, 'installed-skill'), { recursive: true });
  tool = join(directory, 'installed-skill/scripts/quiz-tools.mjs');
  checkout = join(directory, 'repository');
  await mkdir(checkout);
  await git('init', '-b', 'main');
  const head = headFiles();
  sha.M0 = await commit('Initial snapshot', {
    'README.md': 'Example\n',
    'src/store.js': head['src/store.js'],
    'src/export/index.js': head['src/export/index.js'],
    'src/import/index.js': "import { Store } from '../store.js';\nexport async function importFile(read, store = new Store()) {\n  store.save('current', JSON.parse(await read()));\n}\n",
    'src/legacy-log.js': head['src/history/index.js'].replace('  latest() { return this.entries.at(-1); }\n', ''),
  });
  sha.M1 = await commit('Document the example', { 'README.md': 'Example repository\n' });
  await git('checkout', '-b', 'feature');
  await git('rm', '-q', 'src/legacy-log.js');
  sha.F1 = await commit('Record import history', head);
  await git('checkout', 'main');
  sha.M2 = await commit('Expand the documentation', { 'README.md': 'Example repository with documentation\n' });
  await git('checkout', '-b', 'integration');
  await git('merge', '--no-ff', '-m', 'Merge import history', 'feature');
  sha.MG = await git('rev-parse', 'HEAD');
  await git('checkout', '-b', 'x', sha.M0);
  sha.X1 = await commit('X work', { 'x.txt': 'x\n' });
  await git('checkout', '-b', 'y', sha.M0);
  sha.Y1 = await commit('Y work', { 'y.txt': 'y\n' });
  await git('merge', '--no-ff', '-m', 'Merge x into y', sha.X1);
  await git('checkout', 'x');
  await git('merge', '--no-ff', '-m', 'Merge y into x', sha.Y1);
  await git('checkout', 'main');
});
after(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

test('a merge-base range uses the fixed divergence point, not the comparison tip', async () => {
  const result = await run('resolve-range', checkout, 'feature', '--compare', 'main');
  assert.equal(result.code, 0, result.stderr);
  const range = JSON.parse(result.stdout);
  assert.equal(range.headCommitSha, sha.F1);
  assert.equal(range.baseCommitSha, sha.M1);
  assert.deepEqual(range.selection, { method: 'merge-base', comparisonBranch: 'main', comparisonCommitSha: sha.M2 });
  assert.ok(range.changedFiles.every((file) => file.path !== 'README.md'), 'comparison-branch work is outside the range');
  const rename = range.changedFiles.find((file) => file.status === 'R');
  assert.equal(rename?.previousPath, 'src/legacy-log.js');
  assert.equal(rename.path, 'src/history/index.js');
  assert.deepEqual(range.changedFiles.map((file) => file.path).sort(), ['src/history/index.js', 'src/import/index.js']);
});
test('an explicit base must be an ancestor of head', async () => {
  const valid = await run('resolve-range', checkout, sha.F1, '--base', sha.M0);
  assert.equal(valid.code, 0, valid.stderr);
  assert.deepEqual(JSON.parse(valid.stdout).selection, { method: 'explicit' });
  const invalid = await run('resolve-range', checkout, sha.F1, '--base', sha.M2);
  assert.equal(invalid.code, 1);
  assert.match(invalid.stderr, /not an ancestor/);
});
test('remote-qualified comparison selections round-trip through source verification', async () => {
  await git('update-ref', 'refs/remotes/origin/main', sha.M2);
  await git('update-ref', 'refs/remotes/other/main', sha.M0);
  for (const branch of ['origin/main', 'refs/remotes/origin/main', 'refs/heads/main']) {
    const resolved = await run('resolve-range', checkout, 'feature', '--compare', branch);
    assert.equal(resolved.code, 0, resolved.stderr);
    const range = JSON.parse(resolved.stdout);
    assert.equal(range.selection.comparisonBranch, branch);
    assert.equal(range.selection.comparisonCommitSha, sha.M2);
    const path = await writePackage('remote-comparison.quiz.json', (payload) => {
      payload.changeSet.selection = range.selection;
      payload.changeSet.baseCommitSha = range.baseCommitSha;
    });
    const verified = await run('verify-sources', path, checkout);
    assert.equal(verified.code, 0, verified.stderr);
  }
  const wrongRemote = await writePackage('wrong-remote.quiz.json', (payload) => {
    payload.changeSet.selection.comparisonBranch = 'other/main';
  });
  const rejected = await run('verify-sources', wrongRemote, checkout);
  assert.equal(rejected.code, 1);
  assert.match(rejected.stderr, /comparison branch/);
});
test('branch lookup preserves slash names and falls back to an unambiguous remote', async () => {
  await git('update-ref', 'refs/heads/release/current', sha.M2);
  await git('update-ref', 'refs/remotes/origin/release/previous', sha.M1);
  for (const [branch, expected] of [['release/current', sha.M2], ['release/previous', sha.M1]]) {
    const resolved = await run('resolve-range', checkout, 'feature', '--compare', branch);
    assert.equal(resolved.code, 0, resolved.stderr);
    const range = JSON.parse(resolved.stdout);
    assert.equal(range.selection.comparisonCommitSha, expected);
    const path = await writePackage('slash-branch.quiz.json', (payload) => {
      payload.changeSet.selection = range.selection;
    });
    const verified = await run('verify-sources', path, checkout);
    assert.equal(verified.code, 0, verified.stderr);
  }
  await git('update-ref', 'refs/remotes/other/release/previous', sha.M2);
  const ambiguous = await run('resolve-range', checkout, 'feature', '--compare', 'release/previous');
  assert.equal(ambiguous.code, 1);
  assert.match(ambiguous.stderr, /ambiguous/);
});
test('comparison selection rejects missing branches and non-branch revisions', async () => {
  await git('tag', 'comparison-tag', sha.M2);
  for (const branch of ['missing', 'missing/main', sha.M2, 'main^', 'comparison-tag']) {
    const result = await run('resolve-range', checkout, 'feature', '--compare', branch);
    assert.equal(result.code, 1, branch);
    assert.match(result.stderr, /does not identify a branch/, branch);
  }
});
test('already-merged work explains how to select the merge commit', async () => {
  const merged = await run('resolve-range', checkout, sha.F1, '--compare', 'integration');
  assert.equal(merged.code, 1);
  assert.match(merged.stderr, /already contained.*merge commit/);
  const mergeCommit = await run('resolve-range', checkout, sha.MG, '--base', `${sha.MG}^1`);
  assert.equal(mergeCommit.code, 0, mergeCommit.stderr);
  assert.deepEqual(JSON.parse(mergeCommit.stdout).changedFiles.map((file) => file.path).sort(), ['src/history/index.js', 'src/import/index.js']);
});
test('multiple merge bases, empty ranges, and empty focus require another selection', async () => {
  const crissCross = await run('resolve-range', checkout, 'y', '--compare', 'x');
  assert.equal(crissCross.code, 1);
  assert.match(crissCross.stderr, /2 merge bases/);
  const empty = await run('resolve-range', checkout, sha.F1, '--base', sha.F1);
  assert.equal(empty.code, 1);
  assert.match(empty.stderr, /empty/);
  const focus = await run('resolve-range', checkout, sha.F1, '--compare', 'main', '--focus', 'src/export/');
  assert.equal(focus.code, 1);
  assert.match(focus.stderr, /nothing within the focus/);
  const focused = JSON.parse((await run('resolve-range', checkout, sha.F1, '--compare', 'main', '--focus', 'src/import/')).stdout);
  assert.deepEqual(focused.focusedChangedFiles.map((file) => file.path), ['src/import/index.js']);
});
test('range usage errors are distinct from failed checks', async () => {
  assert.equal((await run('resolve-range', checkout, sha.F1)).code, 2);
  assert.equal((await run('resolve-range', checkout, sha.F1, '--base', sha.M1, '--compare', 'main')).code, 2);
  assert.equal((await run('resolve-range', checkout, sha.F1, '--base')).code, 2);
  assert.equal((await run('resolve-range', checkout, sha.F1, '--compare', 'main', '--focus', '../outside')).code, 1);
  assert.equal((await run('resolve-range', checkout, 'no-such-branch', '--compare', 'main')).code, 1);
});
test('source comparison accepts a correctly derived change set', async () => {
  const result = await run('verify-sources', await writePackage('change-set.quiz.json'), checkout);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`5 excerpts and range ${sha.M1}\\.\\.${sha.F1}`));
  const explicit = await run('verify-sources', await writePackage('explicit.quiz.json', (payload) => {
    payload.changeSet.baseCommitSha = sha.M0;
    payload.changeSet.selection = { method: 'explicit' };
    delete payload.changeSet.compareUrl;
  }), checkout);
  assert.equal(explicit.code, 0, explicit.stderr);
});
test('source comparison rejects fabricated change-set derivations', async () => {
  for (const [name, change, message] of [
    ['wrong-merge-base', (payload) => { payload.changeSet.baseCommitSha = sha.M0; }, /unique merge base/],
    ['comparison-tip', (payload) => { payload.changeSet.baseCommitSha = sha.M2; }, /not an ancestor/],
    ['other-branch', (payload) => { payload.changeSet.selection.comparisonBranch = 'x'; }, /comparison branch/],
    ['empty-focus', (payload) => { payload.changeSet.focusPaths = ['src/export/']; }, /nothing within its focus/],
    ['stale-link', (payload) => { payload.changeSet.compareUrl = `https://example.invalid/repository/compare/main...${sha.F1}`; }, /Comparison link/],
    ['missing-base', (payload) => { payload.changeSet.baseCommitSha = 'a'.repeat(40); }, /Base commit/],
  ]) {
    const result = await run('verify-sources', await writePackage(`${name}.quiz.json`, change), checkout);
    assert.equal(result.code, 1, name);
    assert.match(result.stderr, message, name);
  }
});
