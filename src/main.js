import './styles.css';
import { importPackageBytes, MAX_PACKAGE_BYTES } from './core/package.js';
import { PackageError } from './core/errors.js';
import { QuizSession, outcome } from './core/session.js';

const app = document.querySelector('#app');
const fileInput = document.querySelector('#package-file');
const openButton = document.querySelector('#open-package');
const notice = document.querySelector('#import-notice');
const announcements = document.querySelector('#announcements');
const confirmation = document.querySelector('#confirmation');
let quiz = null;
let sourceLabels = new Map();
let session = null;
let importing = false;
let importSequence = 0;

function el(tag, properties = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(properties)) {
    if (value === false || value == null) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'class') node.className = value;
    else if (key === 'checked') node.checked = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child != null && child !== false) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}
function button(label, action, kind = 'secondary', props = {}) {
  return el('button', { type: 'button', class: `button ${kind}`, onclick: action, ...props }, label);
}
function say(message) { announcements.textContent = message; }
function focus(id = 'page-title') {
  document.getElementById(id)?.focus({ preventScroll: true });
}
function confirm(title, description, label, action) {
  const previousFocus = document.activeElement;
  let confirmed = false;
  confirmation.replaceChildren(
    el('h2', { id: 'confirmation-title' }, title),
    el('p', { id: 'confirmation-description' }, description),
    el('div', { class: 'actions' },
      button('Cancel', () => confirmation.close()),
      button(label, () => { confirmed = true; confirmation.close(); action(); }, 'primary')),
  );
  confirmation.onclose = () => { if (!confirmed && previousFocus.isConnected) previousFocus.focus(); };
  confirmation.showModal();
}
function clearError() { notice.hidden = true; notice.replaceChildren(); }
function showError(error) {
  const recovery = {
    'package-too-large': 'Choose a quiz file that is 10 MiB or smaller.',
    'unsupported-version': 'Ask the quiz author for a copy compatible with this viewer.',
    'incomplete-verification': 'This quiz needs a completed review. Ask its author for a verified copy.',
    'stale-verification': 'This quiz changed after review. Ask its author for a newly verified copy.',
    'invalid-json': 'This file could not be read as a quiz. Choose another file or ask its author for a corrected copy.',
    'invalid-structure': 'This quiz contains missing or inconsistent information. Ask its author for a corrected copy.',
    'invalid-source-range': 'This quiz has inconsistent source references. Ask its author for a corrected copy.',
    'invalid-reference': 'This quiz has inconsistent references. Ask its author for a corrected copy.',
    'invalid-answer': 'This quiz has inconsistent answer information. Ask its author for a corrected copy.',
  };
  const details = el('details', { class: 'import-details' },
    el('summary', {}, 'Technical details'), el('p', {}, error.message));
  if (error.path) details.append(el('p', {}, 'Field: ', el('code', {}, error.path)));
  notice.hidden = false;
  notice.replaceChildren(
    el('p', {}, el('strong', {}, 'Couldn’t open this quiz. '), recovery[error.code] ?? 'Try opening the file again, or choose another quiz.'),
    details,
  );
  notice.focus();
}
// Shortest path suffix that tells each file apart from the quiz's other files.
// Files supplying several excerpts are also distinguished by line range.
function labelSources(sources) {
  const paths = [...new Set(sources.map((source) => source.path))];
  const suffix = (path, length) => path.split('/').slice(-length).join('/');
  const names = new Map(paths.map((path) => {
    let length = 1;
    while (length < path.split('/').length && paths.some((other) => other !== path && suffix(other, length) === suffix(path, length))) length++;
    return [path, suffix(path, length)];
  }));
  return new Map(sources.map((source) => {
    const shared = sources.some((other) => other !== source && other.path === source.path);
    const name = names.get(source.path);
    return [source.id, { name, inspect: shared ? `${name}, lines ${source.startLine}–${source.endLine}` : name }];
  }));
}
function acceptQuiz(candidate) {
  const replace = () => { quiz = candidate; sourceLabels = labelSources(candidate.payload.sources); session = null; clearError(); render(); focus(); say('Quiz package ready.'); };
  if (session) confirm('Replace this session?', 'Its answers and progress will be cleared.', 'Replace session', replace);
  else replace();
}
async function load(importer) {
  const sequence = ++importSequence;
  importing = true;
  openButton.disabled = true;
  clearError();
  say('Checking quiz package.');
  try {
    const candidate = await importer();
    if (sequence === importSequence) acceptQuiz(candidate);
  } catch (error) {
    if (sequence === importSequence) showError(error);
  } finally {
    if (sequence === importSequence) {
      importing = false;
      openButton.disabled = false;
    }
  }
}
openButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (!file) return;
  load(async () => {
    if (file.size > MAX_PACKAGE_BYTES) throw new PackageError('package-too-large', 'Quiz packages must be 10 MiB or smaller.');
    return importPackageBytes(await file.arrayBuffer());
  });
});

async function copy(text, label) {
  try { await navigator.clipboard.writeText(text); say(`Copied ${label}.`); }
  catch { say(`Copy is unavailable. Select the ${label} text to copy it.`); }
}
function metadata(label, value, copyLabel, note) {
  return el('div', { class: 'reference-row' },
    el('dt', {}, label),
    el('dd', {}, note && el('p', { class: 'reference-note' }, note), el('code', {}, value),
      copyLabel && button('Copy', () => copy(value, copyLabel), 'text', { 'aria-label': `Copy ${copyLabel}` })),
  );
}
function endSession() {
  const end = () => { quiz = null; session = null; clearError(); render(); focus(); say('Session ended.'); };
  if (session && !session.complete) confirm('End this session?', 'Its answers and progress will be cleared.', 'End session', end);
  else end();
}
function restart() {
  const reset = () => { session = null; render(); focus(); say('Ready to start a new session.'); };
  if (session && !session.complete) confirm('Restart this quiz?', 'Its current answers and progress will be cleared.', 'Restart quiz', reset);
  else reset();
}

function sidebar() {
  const side = el('aside', { class: 'sidebar', 'aria-label': 'Quiz context' });
  const { repository, changeSet } = quiz.payload;
  side.append(el('h2', { class: 'repo-name' }, repository.name));
  const commits = changeSet ? [
    metadata('Base commit', changeSet.baseCommitSha, 'base commit SHA',
      changeSet.selection.method === 'merge-base' && `Merge base with ${changeSet.selection.comparisonBranch}`),
    metadata('Head commit', repository.commitSha, 'head commit SHA', 'Source excerpts come from this commit'),
  ] : [metadata('Commit', repository.commitSha, 'commit SHA')];
  const provenance = el('details', { class: 'provenance', open: !session },
    el('summary', {}, 'Repository reference'),
    el('dl', {},
      metadata('Clone URL', repository.cloneUrl, 'clone URL'),
      metadata('Branch', repository.branch, 'branch name'),
      commits),
    changeSet?.compareUrl && el('a', { class: 'source-link', href: changeSet.compareUrl, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Compare base and head (opens in new tab)' }, 'Compare base and head ↗'),
  );
  side.append(provenance);
  if (session) {
    const nav = el('nav', { class: 'question-nav', 'aria-label': 'Quiz questions' }, el('h3', {}, 'Session questions'));
    const list = el('ol');
    for (let index = 0; index < session.records.length; index++) {
      const record = session.records[index];
      const available = index <= session.activeIndex;
      const active = session.mode === 'session' && index === session.viewIndex;
      list.append(el('li', {}, button(
        [el('span', { class: 'question-number' }, String(index + 1).padStart(2, '0')),
          el('span', {}, record.phase === 'revealed' ? 'Reviewed' : available ? 'Current question' : 'Not started'),
          record.phase === 'revealed' && el('span', { class: 'nav-done', 'aria-hidden': 'true' }, '✓')],
        () => { session.review(index); render(); focus(); }, 'nav',
        { disabled: !available, 'aria-current': active ? 'step' : null, 'aria-label': `Question ${index + 1}, ${record.phase === 'revealed' ? 'reviewed' : available ? 'current' : 'not started'}` },
      )));
    }
    nav.append(list);
    if (session.complete) nav.append(button('Learning recap', () => { session.recap(); render(); focus(); }, 'text', { 'aria-current': session.mode === 'recap' ? 'page' : null }));
    side.append(nav, el('div', { class: 'sidebar-actions' }, button('Restart quiz', restart, 'text'), button('End session', endSession, 'text')));
  }
  return side;
}

function emptyView(main) {
  main.append(el('div', { class: 'empty-layout' },
    el('section', { class: 'import-workspace' },
      el('h1', { id: 'page-title', tabindex: '-1' }, 'Open a quiz package.'),
      el('p', { class: 'lead' }, 'Answer together, explore the source, and discuss how the code connects.'),
      el('div', { class: 'actions' },
        button('Choose a package', () => fileInput.click(), 'primary', { disabled: importing })),
      el('p', { class: 'import-note' }, 'Source excerpts are included. No checkout needed.')),
    el('section', { class: 'session-guide', 'aria-labelledby': 'guide-title' },
      el('h2', { id: 'guide-title' }, 'Answer. Explore. Discuss.'),
      el('ol', { class: 'guide-steps' },
        guideStep('01', 'Answer the question', 'Choose an answer, or say you’re not sure.'),
        guideStep('02', 'See the explanation', 'Reveal the answer and its source references.'),
        guideStep('03', 'Discuss the code', 'Connect responsibilities and dependencies through the discussion topics.'))),
  ));
}
function guideStep(number, title, description) {
  return el('li', {}, el('span', { class: 'guide-number', 'aria-hidden': 'true' }, number), el('div', {}, el('h3', {}, title), el('p', {}, description)));
}
function readyView(main) {
  const payload = quiz.payload;
  main.append(
    el('h1', { id: 'page-title', tabindex: '-1' }, payload.title),
    el('p', { class: 'quiz-facts' }, `${payload.questions.length} questions · ${payload.learning.targetMinutes}-minute target · ${payload.learning.familiarity === 'new-to-repo' ? 'New to the repo' : 'Already working in the repo'}`),
    el('p', { class: 'scope-label' }, payload.learning.scope === 'change-set' ? 'Change set' : 'Repository overview'),
  );

  const coverageList = el('ol', { class: 'coverage-list' });
  payload.learning.coverage.forEach((concept, index) => {
    const number = el('span', { class: 'coverage-number', 'aria-hidden': 'true' }, String(index + 1).padStart(2, '0'));
    const description = el('div', {}, el('h3', {}, concept.title), el('p', {}, concept.summary));
    coverageList.append(el('li', {}, number, description));
  });
  const coverage = el('section', { class: 'coverage', 'aria-labelledby': 'coverage-title' },
    el('h2', { id: 'coverage-title' }, 'The map you’ll build'), coverageList);
  main.append(coverage);

  const exclusions = el('details', { class: 'exclusions' },
    el('summary', {}, 'What this quiz leaves for later'),
    el('ul', {}, payload.learning.exclusions.map((item) => el('li', {}, item))));
  main.append(exclusions);

  const start = button('Start quiz', () => {
    session = new QuizSession(quiz);
    render();
    focus();
    say('Question 1. Choose an answer.');
  }, 'primary');
  main.append(el('div', { class: 'ready-footer' }, start));
}
function updateResponseActions() {
  document.querySelector('#submit-response')?.toggleAttribute('disabled', !session.canAnswer());
}
function responseControls(question, record) {
  const instruction = question.type === 'single-choice' ? 'Choose one answer.' : question.type === 'multiple-select' ? 'Select all that apply.' : 'Put the steps in order.';
  const fieldset = el('fieldset', { class: 'response-controls' }, el('legend', {}, instruction));
  if (question.type === 'ordering') {
    fieldset.append(orderList(question, record));
    fieldset.append(el('p', { class: 'control-hint' }, 'Use the up and down buttons to move each step.'));
  } else {
    const list = el('div', { class: 'choice-list' });
    question.options.forEach((option, index) => {
      const input = el('input', {
        id: `option-${option.id}`, type: question.type === 'single-choice' ? 'radio' : 'checkbox', name: 'response',
        value: option.id, checked: record.draft?.includes(option.id),
        onchange: (event) => {
          if (question.type === 'single-choice') session.setDraft([option.id]);
          else {
            const selected = new Set(record.draft ?? []);
            if (event.target.checked) selected.add(option.id); else selected.delete(option.id);
            session.setDraft([...selected]);
          }
          updateResponseActions();
        },
      });
      list.append(el('label', { class: 'choice', for: input.id }, input,
        el('span', { class: 'option-letter', 'aria-hidden': 'true' }, String.fromCharCode(65 + index)), el('span', {}, option.text)));
    });
    fieldset.append(list);
  }
  return fieldset;
}
function orderList(question, record) {
  const list = el('ol', { class: 'ordering-list', id: 'ordering-list' });
  const sequence = record.draft ?? question.options.map((option) => option.id);
  sequence.forEach((id, index) => {
    const option = question.options.find((item) => item.id === id);
    const move = (direction) => {
      const next = [...sequence];
      [next[index], next[index + direction]] = [next[index + direction], next[index]];
      session.setDraft(next);
      list.replaceWith(orderList(question, record));
      const moved = document.querySelector(`[data-move-id="${id}"][data-direction="${direction}"]`);
      if (moved && !moved.disabled) moved.focus();
      else document.querySelector(`[data-move-id="${id}"]:not(:disabled)`)?.focus();
      updateResponseActions();
      say(`Moved ${option.text} to position ${index + direction + 1}.`);
    };
    list.append(el('li', {}, el('span', { class: 'order-position', 'aria-hidden': 'true' }, String(index + 1).padStart(2, '0')),
      el('span', { class: 'order-label' }, option.text),
      el('div', { class: 'order-actions' },
        button('↑', () => move(-1), 'move', { disabled: index === 0, 'aria-label': `Move up: ${option.text}`, 'data-move-id': id, 'data-direction': '-1' }),
        button('↓', () => move(1), 'move', { disabled: index === sequence.length - 1, 'aria-label': `Move down: ${option.text}`, 'data-move-id': id, 'data-direction': '1' })),
    ));
  });
  return list;
}
const outcomeLabel = (value) => value === 'correct' ? 'Correct' : value === 'unanswered' ? 'Not answered' : 'Worth revisiting';
function resultView(question, record) {
  const result = outcome(question, record.response);
  const section = el('section', { class: `answer-section ${result}`, 'aria-labelledby': 'answer-heading' },
    el('div', { class: 'outcome-heading' }, el('h2', { id: 'answer-heading', tabindex: '-1' }, outcomeLabel(result))),
    el('p', { class: 'answer-explanation' }, question.answer.explanation));
  const order = question.type === 'ordering' ? question.answer.optionIds : question.options.map((option) => option.id);
  const answerList = el(question.type === 'ordering' ? 'ol' : 'ul', { class: 'answer-list' });
  for (const id of order) {
    const option = question.options.find((item) => item.id === id);
    const expected = question.answer.optionIds.includes(id);
    const chosen = record.response?.includes(id);
    const feedback = question.answer.optionFeedback.find((item) => item.optionId === id);
    answerList.append(el('li', { class: expected ? 'expected' : '' },
      el('div', { class: 'answer-option' }, el('strong', {}, option.text),
        question.type !== 'ordering' && el('span', { class: 'answer-label' }, expected ? (chosen ? 'Expected · Selected' : 'Expected answer') : chosen ? 'Selected · Reconsider' : 'Alternative')),
      el('p', {}, feedback.explanation)));
  }
  section.append(el('h3', {}, question.type === 'ordering' ? 'Reference sequence' : 'Answer details'), answerList);
  if (question.type === 'ordering') {
    section.append(el('p', { class: 'response-summary' }, 'Your sequence: ', record.response ? record.response.map((id) => question.options.find((item) => item.id === id).text).join(' → ') : 'Not answered'));
  }
  return section;
}
function sourceDetail(source, record, reason, prefix) {
  const details = el('details', { class: 'source-detail', id: `${prefix}-${source.id}`, open: record?.openedSources.has(source.id) },
    el('summary', {}, el('span', { class: 'source-filename' }, sourceLabels.get(source.id).name),
      el('span', { class: 'source-range' }, `Lines ${source.startLine}–${source.endLine}`)),
    el('p', { class: 'source-path' }, source.path));
  if (reason) details.append(el('p', { class: 'source-reason' }, reason));
  const code = el('code');
  source.code.split('\n').forEach((line, index) => code.append(el('span', { class: 'code-line' },
    el('span', { class: 'line-number', 'aria-hidden': 'true' }, source.startLine + index), el('span', { class: 'line-text' }, line || ' '))));
  details.append(el('pre', { tabindex: '0', 'aria-label': `${source.path}, lines ${source.startLine} through ${source.endLine}` }, code));
  if (source.url) details.append(el('a', { class: 'source-link', href: source.url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Open ${source.path} at this commit (opens in new tab)` }, 'Open at this commit ↗'));
  details.addEventListener('toggle', () => {
    if (!details.isConnected || !record) return;
    if (details.open) {
      record.openedSources.add(source.id);
    } else record.openedSources.delete(source.id);
  });
  return details;
}
function inspectSource(sourceId) {
  const details = document.getElementById(`question-source-${sourceId}`);
  if (details) {
    details.open = true;
    details.querySelector('summary').focus();
    details.scrollIntoView({ block: 'nearest' });
  }
}
function sourcePanel(question, record) {
  const ids = [...new Set([...question.answer.evidence.map((item) => item.sourceId), ...question.discussion.flatMap((topic) => topic.sourceIds)])];
  const panel = el('aside', { class: 'source-panel', 'aria-labelledby': 'source-title' },
    el('h2', { id: 'source-title' }, 'Source references'));
  for (const id of ids) {
    const source = quiz.payload.sources.find((item) => item.id === id);
    const reason = question.answer.evidence.find((item) => item.sourceId === id)?.reason;
    panel.append(sourceDetail(source, record, reason, 'question-source'));
  }
  return panel;
}
function discussionView(question) {
  return el('section', { class: 'discussion-section', 'aria-labelledby': 'discussion-title' },
    el('h2', { id: 'discussion-title' }, 'Discuss together'),
    el('ol', {}, question.discussion.map((topic) => el('li', {}, el('p', {}, topic.prompt),
      el('div', { class: 'discussion-sources' }, topic.sourceIds.map((id) =>
        button(`Inspect ${sourceLabels.get(id).inspect}`, () => inspectSource(id), 'text')))))));
}
function questionView(main) {
  const question = session.question;
  const record = session.record;
  const concepts = question.conceptIds.map((id) => quiz.payload.learning.coverage.find((item) => item.id === id).title);
  main.append(el('div', { class: 'question-topline' },
    el('p', { class: 'eyebrow' }, `Question ${session.viewIndex + 1} of ${session.records.length}`),
    el('p', { class: 'concept-label' }, concepts[0])));
  const layout = el('div', { class: `question-layout ${record.phase === 'attempt' ? 'attempt-layout' : ''}` });
  const work = el('div', { class: 'question-workspace' }, el('h1', { id: 'page-title', tabindex: '-1' }, question.prompt));
  if (record.phase === 'revealed') work.append(resultView(question, record), discussionView(question));
  else {
    work.append(responseControls(question, record),
      el('div', { class: 'actions question-actions' },
        button('Reveal answer', () => {
          session.reveal();
          render();
          focus('answer-heading');
          say(`Answer revealed. ${outcomeLabel(outcome(question, record.response))}.`);
        }, 'primary', { id: 'submit-response', disabled: !session.canAnswer() }),
        button('I’m not sure', () => {
          session.reveal(true);
          render();
          focus('answer-heading');
          say('Answer revealed. Not answered.');
        }, 'text')));
  }
  if (record.phase === 'revealed') {
    let nextAction;
    if (session.complete) {
      const label = session.viewIndex === session.activeIndex ? 'View learning recap' : 'Back to learning recap';
      nextAction = button(label, () => {
        session.recap();
        render();
        focus();
      }, 'primary');
    } else if (session.viewIndex !== session.activeIndex) {
      nextAction = button('Return to current question', () => {
        session.review(session.activeIndex);
        render();
        focus();
      }, 'primary');
    } else {
      nextAction = button('Next question', () => {
        session.next();
        render();
        focus();
      }, 'primary');
    }
    work.append(el('div', { class: 'next-action' }, nextAction));
  }
  layout.append(work);
  if (record.phase === 'revealed') layout.append(sourcePanel(question, record));
  main.append(layout);
}
function recapView(main) {
  const questions = quiz.payload.questions;
  main.append(el('h1', { id: 'page-title', tabindex: '-1' }, 'Learning recap'));

  const conceptList = el('ul', { class: 'concept-list' });
  for (const concept of quiz.payload.learning.coverage) {
    conceptList.append(el('li', {}, el('strong', {}, concept.title), el('p', {}, concept.summary)));
  }
  const coverage = el('section', { class: 'recap-coverage', 'aria-labelledby': 'recap-concepts' },
    el('h2', { id: 'recap-concepts' }, 'Concepts covered'), conceptList);
  main.append(coverage);

  const revisit = questions.map((question, index) => ({ question, record: session.records[index], index }))
    .filter(({ question, record }) => outcome(question, record.response) !== 'correct');
  const revisitSection = el('section', { class: 'revisit-section', 'aria-labelledby': 'revisit-title' },
    el('h2', { id: 'revisit-title' }, 'Worth revisiting'));
  if (revisit.length) {
    const revisitList = el('ul');
    for (const { question, index } of revisit) {
      const review = button(`Question ${index + 1}: ${question.prompt}`, () => {
        session.review(index);
        render();
        focus();
      }, 'text');
      revisitList.append(el('li', {}, review));
    }
    revisitSection.append(revisitList);
  } else {
    revisitSection.append(el('p', {}, 'Your answers matched the reference answers.'));
  }
  main.append(revisitSection);

  const questionSection = el('section', { class: 'recap-questions', 'aria-labelledby': 'recap-questions-title' },
    el('h2', { id: 'recap-questions-title' }, 'Questions and discussion'));
  questions.forEach((question, index) => {
    const record = session.records[index];
    const result = outcome(question, record.response);
    const number = el('span', { class: 'recap-number', 'aria-hidden': 'true' }, String(index + 1).padStart(2, '0'));
    const heading = el('span', {},
      el('strong', {}, question.prompt),
      el('span', { class: 'recap-outcome' }, outcomeLabel(result)));
    const discussions = el('ul', { class: 'recap-discussions' },
      question.discussion.map((topic) => el('li', {}, topic.prompt)));
    const review = button('Review question and source', () => {
      session.review(index);
      render();
      focus();
    }, 'secondary');
    const details = el('details', { class: 'recap-question' },
      el('summary', {}, number, heading),
      el('p', { class: 'recap-explanation' }, question.answer.explanation),
      discussions, review);
    questionSection.append(details);
  });
  main.append(questionSection);

  const footer = el('div', { class: 'recap-footer actions' },
    button('Start another session', restart, 'primary'),
    button('End session', endSession, 'secondary'));
  main.append(footer);
}
function render() {
  const shell = el('div', { class: `app-layout ${quiz ? 'has-quiz' : ''}` });
  const main = el('main', { id: 'main', tabindex: '-1', class: `main-workspace ${session?.mode === 'recap' ? 'recap-workspace' : ''}` });
  if (quiz) shell.append(sidebar());
  shell.append(main);
  if (!quiz) emptyView(main);
  else if (!session) readyView(main);
  else if (session.mode === 'recap') recapView(main);
  else questionView(main);
  app.replaceChildren(shell);
  document.title = `${session?.mode === 'recap' ? 'Learning recap' : session ? `Question ${session.viewIndex + 1}` : quiz ? quiz.payload.repository.name : 'Repository quizzes'} — Code Bearings`;
}
render();
