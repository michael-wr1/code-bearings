// Fictional source and fabricated review records for automated testing only.
// This fixture is never bundled into the viewer or presented as an agent-reviewed quiz.
import { writeFile } from 'node:fs/promises';
import { payloadDigest } from '../../src/core/canonical.js';

const source = (id, path, code) => ({ id, path, language: 'javascript', startLine: 1, endLine: code.split('\n').length, code });
const sources = [
  source('store-source', 'src/store.js', 'export class Store {\n  constructor() { this.entries = new Map(); }\n  save(key, value) { this.entries.set(key, value); }\n  get(key) { return this.entries.get(key); }\n}'),
  source('loader-source', 'src/loader.js', "import { Store } from './store.js';\nexport class Loader {\n  constructor(store = new Store(), clock = Date) {\n    this.store = store; this.clock = clock;\n  }\n  async load(read, notify) {\n    const text = await read();\n    const value = JSON.parse(text);\n    this.store.save('current', value);\n    notify(value, this.clock.now());\n    return value;\n  }\n}"),
  source('controller-source', 'src/controller.js', "import { Store } from './store.js';\nexport async function show(loader, read, view) {\n  if (typeof read !== 'function') throw new Error('Reader required');\n  const value = await loader.load(read, () => {});\n  view.render(value);\n}\nexport const sharedStore = new Store();"),
  source('tests-source', 'tests/store.test.js', "import { Store } from '../src/store.js';\nconst store = new Store();\nstore.save('example', 42);\nif (store.get('example') !== 42) throw new Error('Round trip failed');"),
];
function question(id, type, prompt, options, correct, sourceIds, explanation, discussion) {
  return {
    id, type, prompt, conceptIds: [type === 'ordering' ? 'flow' : type === 'multiple-select' ? 'dependencies' : 'responsibilities'],
    options: options.map(([id, text]) => ({ id, text })), explorationSourceIds: sourceIds,
    answer: { optionIds: correct, explanation, evidence: sourceIds.map(sourceId => ({ sourceId, reason: explanation })),
      optionFeedback: options.map(([optionId, text]) => ({ optionId, explanation: type === 'ordering' ? `${text} belongs at step ${correct.indexOf(optionId) + 1}.` : `${text} ${correct.includes(optionId) ? 'matches' : 'does not match'} the responsibility described in the cited implementation.` })) },
    discussion: [{ prompt: discussion, sourceIds }],
  };
}
const questions = [
  question('state-owner', 'single-choice', 'Which component owns the in-memory entries?', [['view', 'View'], ['store', 'Store'], ['loader', 'Loader']], ['store'], ['store-source', 'loader-source'], 'Store creates the Map and implements save and get; Loader delegates storage to it.', 'How might the Store interface change if entries needed persistence?'),
  question('direct-imports', 'multiple-select', 'Which files directly import Store?', [['loader', 'Loader'], ['tests', 'Store tests'], ['controller', 'Controller'], ['website', 'Website']], ['loader', 'tests', 'controller'], ['loader-source', 'controller-source', 'tests-source'], 'The Loader, Controller, and Store test files each directly import Store.', 'What might a shared store mean for dependency ownership?'),
  question('render-boundary', 'single-choice', 'Which function coordinates loading and rendering?', [['controller', 'show'], ['store', 'Store.save'], ['loader', 'Loader.load']], ['controller'], ['controller-source', 'loader-source'], 'show awaits Loader.load and then calls view.render.', 'Where would you handle a failed read before rendering?'),
  question('load-flow', 'ordering', 'Order the operations inside Loader.load.', [['notify', 'Notify the caller'], ['save', 'Save the value'], ['read', 'Read the text'], ['parse', 'Parse the text']], ['read', 'parse', 'save', 'notify'], ['loader-source'], 'Loader.load awaits the text, parses JSON, saves the result, and then notifies the caller.', 'What state would remain if notification threw an exception?'),
  question('parse-owner', 'single-choice', 'Where does JSON text become a value?', [['store', 'Store.get'], ['loader', 'Loader.load'], ['view', 'View.render']], ['loader'], ['loader-source', 'store-source'], 'Loader.load calls JSON.parse before passing the value to Store.', 'How could parsing be tested separately from reading?'),
  question('loader-dependencies', 'multiple-select', 'Which collaborators are injected through the Loader constructor?', [['store', 'Store'], ['clock', 'Clock'], ['view', 'View']], ['store', 'clock'], ['loader-source'], 'The constructor accepts store and clock; view is not a constructor parameter.', 'What would a fake clock make easier to test?'),
  question('show-flow', 'ordering', 'Order the successful path through show.', [['render', 'Render the value'], ['validate', 'Check the reader'], ['fetch', 'Await the loader']], ['validate', 'fetch', 'render'], ['controller-source'], 'show first validates the reader, awaits the loader, and then renders the value.', 'How would asynchronous rendering affect this contract?'),
  question('test-scope', 'single-choice', 'What does the included Store test exercise?', [['round-trip', 'Saving and reading an entry'], ['render', 'Rendering a view'], ['parse', 'Parsing JSON text']], ['round-trip'], ['tests-source'], 'The test saves 42 under a key and checks that get returns it.', 'Which failure cases would you add for a production store?'),
];
const payload = {
  id: 'synthetic-overview', title: 'Example repository: a map of responsibilities',
  repository: { name: 'Example repository (synthetic)', cloneUrl: 'https://example.invalid/repository.git', branch: 'main', commitSha: '1'.repeat(40) },
  preparation: { generatorId: 'synthetic-test-generator', createdAt: '2026-01-01T00:00:00Z' },
  learning: { scope: 'repository-overview', familiarity: 'new-to-repo', targetMinutes: 25,
    coverage: [
      { id: 'responsibilities', title: 'Component responsibilities', summary: 'Locate state, parsing, and presentation coordination.' },
      { id: 'dependencies', title: 'Dependency boundaries', summary: 'Follow imports and constructor collaborators.' },
      { id: 'flow', title: 'Execution flow', summary: 'Trace loading and rendering in order.' },
    ], exclusions: ['This is invented test data, not a real repository or a measured learning exercise.'] },
  sources, questions,
};
const fixture = { formatVersion: '1.0', payload, verification: {
  status: 'passed', method: 'independent-subagent', verifierId: 'synthetic-test-verifier', verifiedAt: '2026-01-01T00:00:01Z',
  sourceCommitSha: payload.repository.commitSha, reviewedPayloadSha256: await payloadDigest(payload), independentSolutionsRecorded: true,
  summary: 'Fabricated attestation for automated testing only. No independent agent review was performed on this fictional fixture.',
  questionReviews: questions.map(q => ({ questionId: q.id, verdict: 'passed', evidenceSourceIds: q.explorationSourceIds, notes: 'Synthetic review entry used to exercise validation and UI behavior.' })),
} };
await writeFile(new URL('./repository-overview.quiz.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
