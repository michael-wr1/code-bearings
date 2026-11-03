import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, '.release');
const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert.equal(manifest.sourceCommit, execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim());
assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' }).trim(), '', 'Release tests require a clean committed checkout.');
const sums = (await readFile(join(output, 'SHA256SUMS'), 'utf8')).trim().split('\n');
for (const row of sums) {
  const [hash, name] = row.split('  ');
  assert.match(name, /^[a-zA-Z0-9._-]+$/);
  assert.equal(sha256(await readFile(join(output, name))), hash, name);
}
assert.deepEqual((await readdir(output)).sort(), [...Object.keys(manifest.files), 'manifest.json', 'SHA256SUMS'].sort());
for (const [name, hash] of Object.entries(manifest.files)) {
  assert.equal(sha256(await readFile(join(output, name))), hash, name);
}

const temporary = await mkdtemp(join(tmpdir(), 'code-bearings-downloads-'));
let server;
let browser;
try {
  for (const archive of Object.values(manifest.archives)) {
    const entries = JSON.parse(execFileSync('python3', ['-c',
      'import json,sys,zipfile; print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist()))', join(output, archive.file)], { encoding: 'utf8' }));
    assert.deepEqual(entries, archive.entries);
    for (const entry of entries) {
      assert.ok(entry.startsWith(`${archive.root}/`) && !entry.includes('..') && !entry.includes('\\'));
      assert.ok(!/node_modules|\.git\/|local\/|tests\/|\.quiz\.json$|\.review\//.test(entry), entry);
    }
    execFileSync('python3', ['-m', 'zipfile', '-e', join(output, archive.file), temporary]);
  }
  const tool = join(temporary, 'code-bearings-quiz/scripts/quiz-tools.mjs');
  const example = join(output, 'code-bearings.quiz.json');
  for (const args of [['validate', example], ['verify-sources', example, root]]) {
    console.log(execFileSync(process.execPath, [tool, ...args], { cwd: temporary, encoding: 'utf8', env: { ...process.env, NODE_PATH: '' } }).trim());
  }
  const viewer = join(temporary, 'code-bearings-viewer');
  const port = 4177;
  const url = `http://127.0.0.1:${port}`;
  server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: viewer, stdio: 'ignore' });
  let serverError;
  server.on('error', (error) => { serverError = error; });
  await expect.poll(async () => {
    if (serverError) throw serverError;
    if (server.exitCode !== null) throw new Error('The release test server could not start; port 4177 must be free.');
    try { return (await fetch(url)).ok; } catch { return false; }
  }, { timeout: 10_000 }).toBe(true);
  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.context().setOffline(true);
  await page.locator('#package-file').setInputFiles(example);
  await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
  const quiz = JSON.parse(await readFile(example, 'utf8'));
  for (let index = 0; index < quiz.payload.questions.length; index++) {
    await expect(page.locator('.source-panel')).toHaveCount(0);
    await page.getByRole('button', { name: 'I’m not sure', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Not answered', exact: true })).toBeVisible();
    await page.locator('.source-detail summary').first().click();
    await expect(page.locator('.source-detail pre').first()).toBeVisible();
    await page.getByRole('button', { name: index === quiz.payload.questions.length - 1 ? 'View learning recap' : 'Next question', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Learning recap', exact: true })).toBeVisible();
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, [], 'Extracted viewer must play without network requests.');
  console.log('Download checks passed: checksums, archive contents, isolated skill, committed sources, and offline viewer playback.');
} finally {
  await browser?.close();
  server?.kill();
  await rm(temporary, { recursive: true, force: true });
}
