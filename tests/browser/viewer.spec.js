import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { payloadDigest } from '../../src/core/canonical.js';

const packagePath = new URL('../fixtures/repository-overview.quiz.json', import.meta.url).pathname;
const fixture = JSON.parse(await readFile(packagePath, 'utf8'));
let browserErrors = [];
test.beforeEach(async ({ page }) => {
  browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.goto('/', { waitUntil: 'networkidle' });
});
test.afterEach(() => expect(browserErrors).toEqual([]));

async function openFixture(page) {
  await page.locator('#package-file').setInputFiles(packagePath);
  await expect(page.getByRole('button', { name: 'Start quiz', exact: true })).toBeVisible();
}
async function start(page) {
  await openFixture(page);
  await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
  await expect(page.locator('.concept-label')).toHaveText('Topic: Component responsibilities');
}
async function choose(page, question, ids = question.answer.optionIds) {
  if (question.type === 'single-choice') {
    const option = question.options.find((item) => item.id === ids[0]);
    await page.getByRole('radio', { name: option.text, exact: true }).check();
  } else if (question.type === 'multiple-select') {
    for (const option of question.options) await page.getByRole('checkbox', { name: option.text, exact: true }).setChecked(ids.includes(option.id));
  } else {
    for (let target = 0; target < ids.length; target++) {
      const option = question.options.find((item) => item.id === ids[target]);
      const labels = await page.locator('#ordering-list .order-label').allTextContents();
      let index = labels.indexOf(option.text);
      while (index > target) {
        const move = page.getByRole('button', { name: `Move up: ${option.text}`, exact: true });
        await move.focus();
        await page.keyboard.press('Enter');
        index--;
      }
    }
    await expect(page.locator('#ordering-list .order-label')).toHaveText(ids.map((id) => question.options.find((option) => option.id === id).text));
  }
}
async function accessibility(page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target), summaries: nodes.map((node) => node.failureSummary) }))).toEqual([]);
}

test('answer each question directly, then inspect evidence and complete the recap', async ({ page }) => {
  await page.screenshot({ path: 'test-results/screenshots/empty-desktop.png', fullPage: true });
  await openFixture(page);
  await expect(page.getByText(fixture.payload.repository.commitSha, { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/screenshots/ready-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
  await expect(page.locator('.source-panel')).toHaveCount(0);
  await expect(page.getByText('store.js', { exact: true })).toHaveCount(0);
  await expect(page.getByText(fixture.payload.questions[0].answer.explanation, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Question 2, not started', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Reveal answer', exact: true })).toBeDisabled();
  await page.screenshot({ path: 'test-results/screenshots/question-desktop.png', fullPage: true });
  await accessibility(page);
  await choose(page, fixture.payload.questions[0], ['view']);
  await expect(page.locator('.source-panel')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Incorrect', exact: true })).toBeVisible();
  await expect(page.locator('#answer-heading')).toBeFocused();
  await expect(page.locator('#announcements')).toHaveText('Answer revealed. Incorrect.');
  await expect(page.locator('.answer-label')).toHaveText(['✕ Incorrect · Selected', '✓ Correct · Not selected', '✕ Incorrect']);
  await expect(page.getByRole('heading', { name: 'Source references', exact: true })).toBeVisible();
  await expect(page.locator('.answer-explanation')).toHaveText(fixture.payload.questions[0].answer.explanation);
  await expect(page.locator('.question-workspace')).not.toContainText('false');
  await page.getByText('store.js', { exact: true }).click();
  await expect(page.getByText('src/store.js', { exact: true })).toBeVisible();
  await expect(page.locator('.line-number').first()).toHaveText('1');
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Discuss together', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/screenshots/reveal-desktop.png', fullPage: true });
  await accessibility(page);
  await page.getByRole('button', { name: 'Next question', exact: true }).click();

  for (let index = 1; index < fixture.payload.questions.length; index++) {
    const question = fixture.payload.questions[index];
    await expect(page.locator('.source-panel')).toHaveCount(0);
    if (index === 1) {
      await page.getByRole('button', { name: 'I’m not sure', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Not answered', exact: true })).toBeVisible();
    } else {
      await choose(page, question);
      await page.getByRole('button', { name: 'Reveal answer', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Correct', exact: true })).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: 'Source references', exact: true })).toBeVisible();
    await page.getByRole('button', { name: index === fixture.payload.questions.length - 1 ? 'View learning recap' : 'Next question', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Learning recap', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Worth revisiting', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /overall score|percentage|leaderboard/i })).toHaveCount(0);
  await page.locator('.recap-question').first().locator('summary').click();
  await expect(page.getByText(fixture.payload.questions[0].discussion[0].prompt, { exact: true })).toBeVisible();
  await expect(page.locator('.recap-question').first().locator('.recap-outcome')).toHaveText('Incorrect');
  await expect(page.locator('.recap-question').nth(1).locator('.recap-outcome')).toHaveText('Not answered');
  await page.screenshot({ path: 'test-results/screenshots/recap-desktop.png', fullPage: true });
  await accessibility(page);
  await expect(page.getByRole('button', { name: 'Question 1, reviewed', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Question 1, reviewed', exact: true }).click();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to learning recap', exact: true }).click();
  await page.getByRole('button', { name: 'Start another session', exact: true }).click();
  await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
  await expect(page.getByRole('radio', { checked: true })).toHaveCount(0);
});

test('history navigation preserves drafts and sources, and an unsure final answer opens recap', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'I’m not sure', exact: true }).click();
  await expect(page.locator('#answer-heading')).toBeFocused();
  await expect(page.locator('#announcements')).toHaveText('Answer revealed. Not answered.');
  await expect(page.locator('.answer-label')).toHaveText(['✕ Incorrect', '✓ Correct', '✕ Incorrect']);
  await expect(page.locator('#answer-heading [aria-hidden]')).toHaveCount(0);
  await page.getByText('store.js', { exact: true }).click();
  await page.getByRole('button', { name: 'Next question', exact: true }).click();
  const selected = fixture.payload.questions[1].options[0];
  await choose(page, fixture.payload.questions[1], [selected.id]);

  await page.getByRole('button', { name: 'Question 1, reviewed', exact: true }).click();
  await expect(page.getByText('src/store.js', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next question', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Return to current question', exact: true }).click();
  await expect(page.locator('#page-title')).toBeFocused();
  await expect(page.getByRole('checkbox', { name: selected.text, exact: true })).toBeChecked();

  for (let index = 1; index < fixture.payload.questions.length; index++) {
    await page.getByRole('button', { name: 'I’m not sure', exact: true }).click();
    await expect(page.locator('#answer-heading')).toBeFocused();
    if (index < fixture.payload.questions.length - 1) {
      await page.getByRole('button', { name: 'Next question', exact: true }).click();
    }
  }
  await expect(page.getByRole('button', { name: 'Next question', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'View learning recap', exact: true }).click();
  await expect(page.locator('#page-title')).toHaveText('Learning recap');
  await expect(page.locator('#page-title')).toBeFocused();
  await expect(page.locator('.recap-outcome')).toHaveText(fixture.payload.questions.map(() => 'Not answered'));
});

test('multiple-select feedback distinguishes selected, missed, and incorrect options', async ({ page }) => {
  await start(page);
  await choose(page, fixture.payload.questions[0]);
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click();
  await expect(page.locator('.answer-label')).toHaveText(['✕ Incorrect', '✓ Correct · Selected', '✕ Incorrect']);
  await page.getByRole('button', { name: 'Next question', exact: true }).click();
  await choose(page, fixture.payload.questions[1], ['loader', 'website']);
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Incorrect', exact: true })).toBeVisible();
  await expect(page.locator('.answer-label')).toHaveText([
    '✓ Correct · Selected', '✓ Correct · Not selected', '✓ Correct · Not selected', '✕ Incorrect · Selected',
  ]);
  await accessibility(page);
});

test('long source lines wrap without losing indentation, blank lines, or line numbers', async ({ page }) => {
  // Synthetic evidence exercises prose, code, and an unbroken token; no real review is claimed.
  const wrapped = structuredClone(fixture);
  const source = wrapped.payload.sources[0];
  const lines = [
    '// ' + 'A long source explanation with words to wrap. '.repeat(12),
    '    const value = "' + 'x'.repeat(240) + '";',
    '',
    '\treturn value;',
  ];
  source.code = lines.join('\n');
  source.endLine = source.startLine + lines.length - 1;
  wrapped.verification.reviewedPayloadSha256 = await payloadDigest(wrapped.payload);
  await page.locator('#package-file').setInputFiles({ name: 'wrapped.quiz.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(wrapped)) });
  await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
  await page.getByRole('button', { name: 'I’m not sure', exact: true }).click();
  const details = page.locator('#question-source-store-source');
  await details.locator('summary').click();
  expect(await details.locator('.line-text').allTextContents()).toEqual(lines);
  await expect(details.locator('.line-number')).toHaveText(['1', '2', '3', '4']);
  for (const width of [1440, 640, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const sizes = await details.locator('pre').evaluate((pre) => ({
      scroll: pre.scrollWidth, client: pre.clientWidth,
      pageScroll: document.documentElement.scrollWidth, viewport: innerWidth,
      lineHeight: parseFloat(getComputedStyle(pre).lineHeight),
      wrappedHeight: pre.querySelector('.line-text').getBoundingClientRect().height,
    }));
    expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);
    expect(sizes.pageScroll).toBeLessThanOrEqual(sizes.viewport);
    expect(sizes.wrappedHeight).toBeGreaterThan(sizes.lineHeight);
  }
  await page.setViewportSize({ width: 640, height: 1000 });
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  expect(await details.locator('pre').evaluate((pre) => pre.scrollWidth <= pre.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await details.locator('.line-text').allTextContents()).toEqual(lines);
  await accessibility(page);
  await page.screenshot({ path: 'test-results/screenshots/wrapped-source-enlarged.png', fullPage: true });
});

test('file import, rejected replacement, and explicit replacement confirmation preserve session state', async ({ page }) => {
  await page.locator('#package-file').setInputFiles(packagePath);
  await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
  await choose(page, fixture.payload.questions[0], ['view']);
  const stale = structuredClone(fixture);
  stale.payload.title += ' edited';
  await page.locator('#package-file').setInputFiles({ name: 'stale.quiz.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(stale)) });
  await expect(page.getByRole('alert')).toContainText('Ask its author for a newly verified copy.');
  const diagnostic = page.getByText('Quiz content changed after its recorded review. Prepare and verify the package again.', { exact: true });
  await expect(diagnostic).not.toBeVisible();
  const details = page.getByText('Technical details', { exact: true });
  await details.focus();
  await page.keyboard.press('Enter');
  await expect(diagnostic).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('/verification/reviewedPayloadSha256');
  await accessibility(page);
  await expect(page.getByRole('radio', { name: 'View', exact: true })).toBeChecked();
  await expect(page.locator('.source-panel')).toHaveCount(0);
  await page.locator('#package-file').setInputFiles(packagePath);
  await expect(page.getByRole('dialog', { name: 'Replace this session?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'View', exact: true })).toBeChecked();
  await page.locator('#package-file').setInputFiles(packagePath);
  await page.getByRole('button', { name: 'Replace session', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start quiz', exact: true })).toBeVisible();
  await expect(page.locator('#page-title')).toBeFocused();
});

test('playing works offline, writes no session storage, and reload clears progress', async ({ page, context }) => {
  await context.setOffline(true);
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await openFixture(page);
  await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
  await page.getByRole('button', { name: 'I’m not sure', exact: true }).click();
  await page.getByText('store.js', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Not answered', exact: true })).toBeVisible();
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Open a quiz package.', exact: true })).toBeVisible();
});

test('package content is rendered as text, never markup or script', async ({ page }) => {
  const textOnly = structuredClone(fixture);
  const attack = '<img src=x onerror="window.injected=true">';
  textOnly.payload.title = attack;
  textOnly.payload.questions[0].options[0].text = attack;
  textOnly.verification.reviewedPayloadSha256 = await payloadDigest(textOnly.payload);
  await page.locator('#package-file').setInputFiles({ name: 'text-only.quiz.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(textOnly)) });
  await expect(page.getByRole('heading', { name: attack, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
  await expect(page.getByRole('radio', { name: attack, exact: true })).toBeVisible();
  expect(await page.locator('main img').count()).toBe(0);
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
});

test('keyboard navigation, ordering and mobile reflow stay usable', async ({ page }) => {
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await accessibility(page);
  await start(page);
  for (let index = 0; index < 3; index++) {
    await page.getByRole('button', { name: 'I’m not sure', exact: true }).click();
    await page.getByRole('button', { name: 'Next question', exact: true }).click();
  }
  await accessibility(page);
  await choose(page, fixture.payload.questions[3]);
  const visible = await page.locator('#ordering-list .order-label').allTextContents();
  expect(visible).toEqual(fixture.payload.questions[3].answer.optionIds.map((id) => fixture.payload.questions[3].options.find((item) => item.id === id).text));
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Reveal answer', exact: true })).toBeVisible();
  }
  await expect(page.locator('.source-panel')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/screenshots/question-mobile.png', fullPage: true });
  await accessibility(page);
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Correct', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Source references', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/screenshots/reveal-mobile.png', fullPage: true });
  await accessibility(page);
  await page.getByRole('button', { name: 'Restart quiz', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Restart this quiz?' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Correct', exact: true })).toBeVisible();
});

test('a change-set quiz shows its range and distinguishes files that share a name', async ({ page }) => {
  const changePath = new URL('../fixtures/change-set.quiz.json', import.meta.url).pathname;
  const change = JSON.parse(await readFile(changePath, 'utf8'));
  const { changeSet, repository, questions } = change.payload;
  await page.locator('#package-file').setInputFiles(changePath);
  await expect(page.getByText('Change set', { exact: true })).toBeVisible();
  await expect(page.getByText('Repository overview', { exact: true })).toHaveCount(0);
  const reference = page.locator('.provenance');
  await expect(reference.locator('dt')).toHaveText(['Clone URL', 'Branch', 'Base commit', 'Head commit']);
  await expect(reference.getByText(changeSet.baseCommitSha, { exact: true })).toBeVisible();
  await expect(reference.getByText(repository.commitSha, { exact: true })).toBeVisible();
  await expect(reference.getByText('Merge base with main', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Compare base and head (opens in new tab)' })).toHaveAttribute('href', changeSet.compareUrl);
  await page.screenshot({ path: 'test-results/screenshots/change-set-ready.png', fullPage: true });
  await accessibility(page);
  await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
  await expect(page.locator('.source-panel')).toHaveCount(0);
  await expect(page.getByText('index.js', { exact: false })).toHaveCount(0);

  await choose(page, questions[0]);
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click();
  await expect(page.locator('.source-filename')).toHaveText(['history/index.js', 'import/index.js']);
  await accessibility(page);
  await page.getByRole('button', { name: 'Next question', exact: true }).click();

  await choose(page, questions[1]);
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click();
  const flow = page.getByRole('button', { name: 'Inspect import/index.js, lines 3–9', exact: true });
  await expect(page.getByRole('button', { name: 'Inspect import/index.js, lines 1–2', exact: true })).toBeVisible();
  await flow.click();
  await expect(page.locator('#question-source-import-flow summary')).toBeFocused();
  await expect(page.locator('#question-source-import-flow .line-number').first()).toHaveText('3');
  await page.screenshot({ path: 'test-results/screenshots/change-set-reveal.png', fullPage: true });
  await accessibility(page);
  await page.getByRole('button', { name: 'Next question', exact: true }).click();

  for (let index = 2; index < questions.length; index++) {
    await choose(page, questions[index]);
    await page.getByRole('button', { name: 'Reveal answer', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Correct', exact: true })).toBeVisible();
    if (index === 3) await expect(page.locator('.discussion-sources .button')).toHaveText(['Inspect export/index.js', 'Inspect store.js']);
    await page.getByRole('button', { name: index === questions.length - 1 ? 'View learning recap' : 'Next question', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Learning recap', exact: true })).toBeVisible();
  await expect(page.getByText('Your answers matched the reference answers.', { exact: true })).toBeVisible();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByText('Repository reference', { exact: true }).click();
  await page.screenshot({ path: 'test-results/screenshots/change-set-recap-mobile.png', fullPage: true });
  await accessibility(page);
});
