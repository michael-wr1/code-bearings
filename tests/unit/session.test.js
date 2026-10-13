import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { QuizSession, outcome } from '../../src/core/session.js';

const fixture = JSON.parse(await readFile(new URL('../fixtures/repository-overview.quiz.json', import.meta.url), 'utf8'));
const create = () => new QuizSession(fixture);
function finishCurrent(session, unsure = false) {
  if (!unsure) session.setDraft(session.question.answer.optionIds);
  session.reveal(unsure);
}

test('revealing needs an answer or an explicit unsure response, and next needs reveal', () => {
  const session = create();
  assert.throws(() => session.reveal());
  assert.throws(() => session.next());
  assert.equal(session.record.phase, 'attempt');
});
test('reveal directly freezes one response independently of the draft', () => {
  const session = create();
  session.setDraft(['view']);
  session.reveal();
  assert.equal(session.record.phase, 'revealed');
  session.record.draft[0] = 'store';
  assert.deepEqual(session.record.response, ['view']);
  assert.equal(outcome(session.question, session.record.response), 'revisit');
});
test('unsure is a distinct response and does not force a guess', () => {
  const session = create();
  session.setDraft(['store']);
  session.reveal(true);
  assert.equal(outcome(session.question, session.record.response), 'unanswered');
  assert.equal(session.record.phase, 'revealed');
});
test('revealed responses cannot be changed or submitted twice', () => {
  const session = create();
  finishCurrent(session);
  assert.throws(() => session.setDraft(['view']));
  assert.throws(() => session.reveal());
});
test('multiple-select uses exact set equality, without selection-order penalties', () => {
  const question = fixture.payload.questions[1];
  assert.equal(outcome(question, ['loader', 'tests', 'controller']), 'correct');
  assert.equal(outcome(question, ['loader', 'controller']), 'revisit');
  assert.equal(outcome(question, ['loader', 'tests', 'controller', 'website']), 'revisit');
});
test('ordering needs an exact complete sequence', () => {
  const question = fixture.payload.questions[3];
  assert.equal(outcome(question, ['read', 'parse', 'save', 'notify']), 'correct');
  assert.equal(outcome(question, ['parse', 'read', 'save', 'notify']), 'revisit');
});
test('future questions and early recap cannot be opened', () => {
  const session = create();
  assert.throws(() => session.review(1));
  assert.throws(() => session.recap());
});
test('reviewing history preserves the current question and cannot advance it', () => {
  const session = create();
  finishCurrent(session);
  session.next();
  session.setDraft(['loader']);
  session.review(0);
  assert.equal(session.record.phase, 'revealed');
  assert.throws(() => session.next());
  session.review(session.activeIndex);
  assert.deepEqual(session.record.draft, ['loader']);
});
test('all question formats can complete and return from recap for read-only review', () => {
  const session = create();
  for (let index = 0; index < fixture.payload.questions.length; index++) {
    finishCurrent(session);
    session.next();
  }
  assert.equal(session.complete, true);
  assert.equal(session.mode, 'recap');
  session.review(3);
  assert.equal(session.record.phase, 'revealed');
  session.recap();
  assert.equal(session.mode, 'recap');
  const restarted = create();
  assert.equal(restarted.complete, false);
  assert.equal(restarted.records.some((record) => record.response !== null), false);
});
