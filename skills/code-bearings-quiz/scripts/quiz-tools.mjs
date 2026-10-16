import { readFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { importPackageBytes, relativePath, MAX_PACKAGE_BYTES } from '../../../src/core/package.js';
import { parseStrictJson } from '../../../src/core/strict-json.js';
import { payloadDigest } from '../../../src/core/canonical.js';

const execute = promisify(execFile);
const usage = [
  'Usage: node quiz-tools.mjs validate <quiz.json>',
  '       node quiz-tools.mjs digest <payload.json>',
  '       node quiz-tools.mjs verify-sources <quiz.json> <checkout>',
  '       node quiz-tools.mjs resolve-range <checkout> <head> (--base <commit> | --compare <branch>) [--focus <path>]...',
].join('\n');
async function readInput(path) {
  if ((await stat(path)).size > MAX_PACKAGE_BYTES) throw new Error('Input must be 10 MiB or smaller.');
  const bytes = await readFile(path);
  if (bytes.byteLength > MAX_PACKAGE_BYTES) throw new Error('Input must be 10 MiB or smaller.');
  return bytes;
}
async function git(checkout, args) {
  return (await execute('git', ['-C', checkout, ...args], { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 })).stdout;
}
const text = async (checkout, args) => new TextDecoder().decode(await git(checkout, args)).trim();
// Git reports a false predicate (ancestry, an empty diff) as exit status 1.
async function predicate(checkout, args) {
  try { await git(checkout, args); return true; }
  catch (error) { if (error.code === 1) return false; throw error; }
}
async function commit(checkout, revision, label) {
  try { return await text(checkout, ['rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`]); }
  catch { throw new Error(`${label} does not identify a commit in this checkout: ${revision}`); }
}
async function reachableFromBranch(checkout, sha, branch) {
  const refs = (await text(checkout, ['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes'])).split('\n');
  const candidates = refs.filter(ref => ref === `refs/heads/${branch}` || (ref.startsWith('refs/remotes/') && ref.slice('refs/remotes/'.length).split('/').slice(1).join('/') === branch));
  for (const ref of candidates) if (await predicate(checkout, ['merge-base', '--is-ancestor', sha, ref])) return true;
  return false;
}
const pathspecs = (focusPaths = []) => focusPaths.length ? ['--', ...focusPaths.map(path => `:(literal)${path}`)] : [];
async function mergeBases(checkout, comparison, head) {
  try { return (await text(checkout, ['merge-base', '--all', comparison, head])).split('\n').filter(Boolean); }
  catch (error) { if (error.code === 1) return []; throw error; }
}

// Accepts the line-fragment styles used by GitHub/Gitea (#L1-L5), GitLab (#L1-5),
// and Bitbucket (#lines-1:5). An unrecognized fragment cannot be checked.
function checkSourceLink(source, commitSha) {
  const url = new URL(source.url);
  let path;
  try { path = decodeURIComponent(url.pathname); } catch { path = url.pathname; }
  if (!path.includes(`/${commitSha}/`) || !path.endsWith(`/${source.path}`)) {
    throw new Error(`Source link must name the recorded commit and path: ${source.path}:${source.startLine}-${source.endLine}`);
  }
  const range = url.hash.match(/^#L(\d+)(?:-L?(\d+))?$/) ?? url.hash.match(/^#lines-(\d+)(?::(\d+))?$/);
  if (!range) throw new Error(`Source link needs a recognized line-range fragment: ${source.path}:${source.startLine}-${source.endLine}`);
  const [start, end = start] = range.slice(1).filter(Boolean).map(Number);
  if (start !== source.startLine || end !== source.endLine) throw new Error(`Source link range differs from its excerpt: ${source.path}:${source.startLine}-${source.endLine}`);
}
async function verifyChangeSet(payload, checkout) {
  const head = payload.repository.commitSha;
  const { baseCommitSha: base, selection, focusPaths, compareUrl } = payload.changeSet;
  if (await commit(checkout, base, 'Base commit') !== base) throw new Error('Recorded base SHA must identify a commit.');
  if (!(await predicate(checkout, ['merge-base', '--is-ancestor', base, head]))) throw new Error('Recorded base commit is not an ancestor of the head commit.');
  if (selection.method === 'merge-base') {
    const comparison = selection.comparisonCommitSha;
    if (await commit(checkout, comparison, 'Comparison commit') !== comparison) throw new Error('Recorded comparison SHA must identify a commit.');
    if (!(await reachableFromBranch(checkout, comparison, selection.comparisonBranch))) throw new Error('Recorded comparison commit is not reachable from the comparison branch in this checkout.');
    const bases = await mergeBases(checkout, comparison, head);
    if (bases.length !== 1 || bases[0] !== base) throw new Error('Recorded base is not the unique merge base of the comparison commit and head.');
  }
  if (await predicate(checkout, ['diff', '--quiet', base, head, ...pathspecs(focusPaths)])) {
    throw new Error(focusPaths ? 'The recorded range changes nothing within its focus paths.' : 'The recorded range is empty.');
  }
  if (compareUrl && !(compareUrl.includes(base) && compareUrl.includes(head))) throw new Error('Comparison link must name the full base and head SHAs.');
}
async function verifySources(quiz, checkout) {
  const { commitSha, branch } = quiz.payload.repository;
  if (await commit(checkout, commitSha, 'Recorded commit') !== commitSha) throw new Error('Recorded SHA must identify a commit.');
  if (!(await reachableFromBranch(checkout, commitSha, branch))) throw new Error('Recorded commit is not reachable from the named branch in this checkout.');
  if (quiz.payload.changeSet) await verifyChangeSet(quiz.payload, checkout);
  for (const source of quiz.payload.sources) {
    const bytes = await git(checkout, ['cat-file', 'blob', `${commitSha}:${source.path}`]);
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes).replace(/\r\n/g, '\n');
    const lines = text ? text.split('\n') : [];
    // A terminal newline ends the last line; it does not create another one.
    // Remove only its split delimiter so an actual final blank line is preserved.
    if (text.endsWith('\n')) lines.pop();
    const actual = lines.slice(source.startLine - 1, source.endLine).join('\n');
    if (source.endLine > lines.length || actual !== source.code) throw new Error(`Source mismatch: ${source.path}:${source.startLine}-${source.endLine}`);
    if (source.url) checkSourceLink(source, commitSha);
  }
}

function changedFiles(output) {
  const fields = new TextDecoder().decode(output).split('\0');
  const files = [];
  for (let index = 0; index < fields.length - 1;) {
    const status = fields[index++];
    // Renames and copies list the previous path before the path at head.
    if (/^[RC]/.test(status)) files.push({ status: status[0], similarity: Number(status.slice(1)), previousPath: fields[index++], path: fields[index++] });
    else files.push({ status, path: fields[index++] });
  }
  return files;
}
async function resolveRange(checkout, headRevision, options) {
  const head = await commit(checkout, headRevision, 'Head');
  let base, selection;
  if (options.base) {
    base = await commit(checkout, options.base, 'Base');
    if (!(await predicate(checkout, ['merge-base', '--is-ancestor', base, head]))) throw new Error('The base commit is not an ancestor of head. Choose an ancestor or a branch comparison.');
    selection = { method: 'explicit' };
  } else {
    const comparison = await commit(checkout, options.compare, 'Comparison branch');
    const bases = await mergeBases(checkout, comparison, head);
    if (bases.length === 0) throw new Error('Head and the comparison branch share no history in this checkout.');
    if (bases.length > 1) throw new Error(`Head and the comparison branch have ${bases.length} merge bases (${bases.join(', ')}). Choose an explicit base.`);
    base = bases[0];
    if (base === head) throw new Error('Head is already contained in the comparison branch, so the merge-base range is empty. For merged work, select the merge commit (base: its first parent) or the squashed commit (base: its parent) with --base.');
    selection = { method: 'merge-base', comparisonBranch: options.compare, comparisonCommitSha: comparison };
  }
  if (base === head) throw new Error('Base and head are the same commit, so the range is empty.');
  const files = changedFiles(await git(checkout, ['diff', '--name-status', '-z', '-M', base, head]));
  if (files.length === 0) throw new Error('The range is empty: base and head have identical trees.');
  const result = { headCommitSha: head, baseCommitSha: base, selection, changedFiles: files };
  if (options.focus.length) {
    result.focusPaths = options.focus;
    result.focusedChangedFiles = changedFiles(await git(checkout, ['diff', '--name-status', '-z', '-M', base, head, ...pathspecs(options.focus)]));
    if (result.focusedChangedFiles.length === 0) throw new Error('The range changes nothing within the focus paths.');
  }
  return result;
}
function rangeOptions(args) {
  const options = { focus: [], error: null };
  for (let index = 0; index < args.length; index += 2) {
    const [flag, value] = [args[index], args[index + 1]];
    if (!value) return null;
    if (flag === '--focus') {
      if (!relativePath(value, true)) options.error ??= new Error(`Focus paths must be relative to the repository: ${value}`);
      options.focus.push(value);
    } else if ((flag === '--base' || flag === '--compare') && !options.base && !options.compare) options[flag.slice(2)] = value;
    else return null;
  }
  return options.base || options.compare ? options : null;
}

const [command, ...args] = process.argv.slice(2);
const arity = { validate: 1, digest: 1, 'verify-sources': 2 };
const options = command === 'resolve-range' && args.length >= 4 && args[0] && args[1] ? rangeOptions(args.slice(2)) : null;
if (command === '--help' && args.length === 0) console.log(usage);
else if (command === 'resolve-range' ? !options : arity[command] !== args.length || args.some(arg => !arg)) {
  console.error(usage);
  process.exitCode = 2;
} else {
  try {
    if (options?.error) throw options.error;
    if (command === 'resolve-range') {
      console.log(JSON.stringify(await resolveRange(args[0], args[1], options), null, 2));
    } else {
      const bytes = await readInput(args[0]);
      if (command === 'digest') {
        const payload = parseStrictJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        if (!payload || Array.isArray(payload) || typeof payload !== 'object') throw new Error('Provide the payload object alone.');
        if ('formatVersion' in payload && 'verification' in payload) throw new Error('Provide payload alone, not the package envelope.');
        console.log(await payloadDigest(payload));
      } else {
        const quiz = await importPackageBytes(bytes);
        if (command === 'verify-sources') {
          await verifySources(quiz, args[1]);
          const range = quiz.payload.changeSet ? ` and range ${quiz.payload.changeSet.baseCommitSha}..` : ' at ';
          console.log(`Source checks passed: ${quiz.payload.sources.length} excerpts${range}${quiz.payload.repository.commitSha}.`);
        } else console.log(`Package checks passed: ${quiz.payload.questions.length} questions; ${quiz.payload.repository.commitSha}.`);
      }
    }
  } catch (error) {
    console.error(`${error.code ?? 'check-failed'}: ${error.message}`);
    if (error.path) console.error(`Field: ${error.path}`);
    process.exitCode = 1;
  }
}
