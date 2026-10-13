import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canonicalize, payloadDigest } from '../../src/core/canonical.js';
import { parseStrictJson } from '../../src/core/strict-json.js';
import { importPackageText, importPackageBytes, MAX_PACKAGE_BYTES } from '../../src/core/package.js';

const raw = await readFile(new URL('../fixtures/repository-overview.quiz.json', import.meta.url), 'utf8');
const fixture = JSON.parse(raw);
const rejected = (change, code) => async () => {
  const invalid = structuredClone(fixture);
  change(invalid);
  await assert.rejects(importPackageText(JSON.stringify(invalid)), (error) => error.code === code);
};

test('the synthetic fixture imports with its recorded digest', async () => {
  const result = await importPackageText(raw);
  assert.equal(result.payload.questions.length, 8);
  assert.equal(await payloadDigest(result.payload), 'a97317a8254e1bdf3179f67bd74d0c9ef8489a6ced38447e8a56b7557ba20b86');
});
test('formatting and property order do not invalidate a review', async () => {
  const copy = structuredClone(fixture);
  copy.payload = Object.fromEntries(Object.entries(copy.payload).reverse());
  await importPackageText(JSON.stringify(copy, null, 4));
});
test('content changed after review is rejected', rejected((p) => p.payload.questions[0].prompt += ' edited', 'stale-verification'));
test('unsupported package version is rejected', rejected((p) => p.formatVersion = '2.0', 'unsupported-version'));
test('absent review is rejected', rejected((p) => delete p.verification, 'incomplete-verification'));
test('failed review is rejected', rejected((p) => p.verification.status = 'failed', 'incomplete-verification'));
test('same generator and verifier identity is rejected', rejected((p) => p.verification.verifierId = p.payload.preparation.generatorId, 'incomplete-verification'));
test('review for another source commit is rejected', rejected((p) => p.verification.sourceCommitSha = '0'.repeat(40), 'incomplete-verification'));
test('incomplete review coverage is rejected', rejected((p) => p.verification.questionReviews.pop(), 'incomplete-verification'));
test('duplicate review entries are rejected', rejected((p) => p.verification.questionReviews.push(p.verification.questionReviews[0]), 'invalid-reference'));
test('review must include answer evidence', rejected((p) => p.verification.questionReviews[0].evidenceSourceIds = ['tests-source'], 'incomplete-verification'));
test('unknown evidence ID is rejected', rejected((p) => p.payload.questions[0].answer.evidence[0].sourceId = 'unknown', 'invalid-reference'));
test('duplicate option IDs are rejected', rejected((p) => p.payload.questions[0].options[1].id = 'view', 'invalid-reference'));
test('ordering must contain every item', rejected((p) => p.payload.questions[3].answer.optionIds.pop(), 'invalid-answer'));
test('initial ordering cannot expose the answer sequence', rejected((p) => {
  const q = p.payload.questions[3];
  q.options = q.answer.optionIds.map((id) => q.options.find((option) => option.id === id));
}, 'invalid-answer'));
test('choice questions need a distractor', rejected((p) => p.payload.questions[1].answer.optionIds.push('website'), 'invalid-answer'));
test('every option needs feedback', rejected((p) => p.payload.questions[0].answer.optionFeedback.pop(), 'invalid-answer'));
test('source line counts must match', rejected((p) => p.payload.sources[0].endLine++, 'invalid-source-range'));
test('source paths cannot escape the repository', rejected((p) => p.payload.sources[0].path = '../secret', 'invalid-source-range'));
test('unsafe source links are rejected', rejected((p) => p.payload.sources[0].url = 'javascript:alert(1)', 'invalid-structure'));
test('unknown schema properties are rejected', rejected((p) => p.payload.questions[0].typo = true, 'invalid-structure'));
test('dates must be real UTC calendar timestamps', rejected((p) => p.payload.preparation.createdAt = '2026-02-30T00:00:00Z', 'invalid-structure'));
test('oversized files stop before parsing', async () => {
  await assert.rejects(importPackageText(' '.repeat(MAX_PACKAGE_BYTES + 1)), (error) => error.code === 'package-too-large');
});
test('invalid UTF-8 is rejected', async () => {
  await assert.rejects(importPackageBytes(new Uint8Array([0xff, 0xfe])), (error) => error.code === 'invalid-json');
});
test('duplicate JSON keys, including escaped spellings, are rejected', () => {
  for (const text of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"a":{"b":1,"b":2}}']) {
    assert.throws(() => parseStrictJson(text), (error) => error.code === 'invalid-json');
  }
});
test('strict JSON agrees with native parsing for valid input', () => {
  const text = '{"a":[true,false,null,-3,1e2,"escaped \\\" string","é"],"__proto__":{"x":1}}';
  assert.equal(JSON.stringify(parseStrictJson(text)), JSON.stringify(JSON.parse(text)));
  assert.equal(Object.getPrototypeOf(parseStrictJson(text)), null);
});
test('malformed JSON and excessive nesting are rejected', () => {
  for (const text of ['{"a":1,}', '[1,]', 'true false', '{"a":01}', '"unterminated', '[ '.repeat(101) + '0' + ']'.repeat(101)]) assert.throws(() => parseStrictJson(text));
});
test('canonicalization preserves Unicode, array order, and primitive serialization', () => {
  assert.equal(canonicalize({ z: [2, 1], a: 'é\n', n: 3 }), '{"a":"é\\n","n":3,"z":[2,1]}');
  assert.throws(() => canonicalize({ text: '\ud800' }));
  assert.throws(() => canonicalize({ number: Infinity }));
  assert.throws(() => canonicalize({ number: Number.MAX_SAFE_INTEGER + 1 }));
});
