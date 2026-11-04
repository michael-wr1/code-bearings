import validateStructure from '../generated/package-validator.js';
import { PackageError } from './errors.js';
import { parseStrictJson } from './strict-json.js';
import { canonicalize, payloadDigest } from './canonical.js';

export const MAX_PACKAGE_BYTES = 10 * 1024 * 1024;
const fail = (code, message, path = '') => { throw new PackageError(code, message, path); };

function unique(values, path) {
  if (new Set(values).size !== values.length) fail('invalid-reference', 'IDs must not repeat.', path);
}
function references(values, allowed, path) {
  unique(values, path);
  if (values.some((id) => !allowed.has(id))) fail('invalid-reference', 'Reference does not match an included item.', path);
}
function validTimestamp(timestamp, path) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.valueOf()) || date.toISOString().replace('.000Z', 'Z') !== timestamp) {
    fail('invalid-structure', 'Use a valid UTC date and time.', path);
  }
}

// Repository-relative POSIX path. Directory focus paths may end with one slash.
export function relativePath(path, allowTrailingSlash = false) {
  const trimmed = allowTrailingSlash && path.endsWith('/') ? path.slice(0, -1) : path;
  return !trimmed.startsWith('/') && !trimmed.includes('\\') && trimmed.split('/').every((part) => part && part !== '.' && part !== '..');
}
function httpsLink(value, code, label, path) {
  let url;
  try { url = new URL(value); } catch { fail(code, `${label} is not a valid HTTPS URL.`, path); }
  if (url.protocol !== 'https:' || url.username || url.password) fail(code, `${label}s must use HTTPS without embedded credentials.`, path);
}
function credentialFreeCloneUrl(value) {
  let url;
  // SCP-style SSH remotes are not URLs; preserve their user@host:path syntax.
  try { url = new URL(value); } catch { return; }
  if (url.password || (['http:', 'https:'].includes(url.protocol) && url.username)) {
    fail('invalid-structure', 'Clone URLs must not contain embedded credentials. Use a credential-free HTTPS URL or an SSH remote without a password.', '/payload/repository/cloneUrl');
  }
}
function validateChangeSet(payload) {
  const { changeSet } = payload;
  if (!changeSet) return;
  if (changeSet.baseCommitSha === payload.repository.commitSha) fail('invalid-structure', 'The base commit must differ from the head commit.', '/payload/changeSet/baseCommitSha');
  (changeSet.focusPaths ?? []).forEach((focus, index) => {
    if (!relativePath(focus, true)) fail('invalid-structure', 'Focus paths must be relative to the repository.', `/payload/changeSet/focusPaths/${index}`);
  });
  unique(changeSet.focusPaths ?? [], '/payload/changeSet/focusPaths');
  if (changeSet.compareUrl) httpsLink(changeSet.compareUrl, 'invalid-structure', 'Comparison link', '/payload/changeSet/compareUrl');
}

export async function validatePackage(data) {
  if (!data || Array.isArray(data) || typeof data !== 'object') fail('invalid-structure', 'A quiz package must be a JSON object.');
  canonicalize(data); // Reject invalid Unicode and unsafe numbers throughout.
  if (data.formatVersion !== '1.0') fail('unsupported-version', 'This viewer supports quiz package version 1.0.', '/formatVersion');
  if (!data.verification || data.verification.status !== 'passed' || data.verification.method !== 'independent-subagent') {
    fail('incomplete-verification', 'A passed independent-subagent review is required before this quiz can start.', '/verification');
  }
  if (!validateStructure(data)) {
    const error = validateStructure.errors[0];
    const path = error.instancePath || '/';
    const code = path.startsWith('/verification') ? 'incomplete-verification' : 'invalid-structure';
    fail(code, `Package field ${path} ${error.message}.`, path);
  }
  const { payload, verification } = data;
  credentialFreeCloneUrl(payload.repository.cloneUrl);
  validTimestamp(payload.preparation.createdAt, '/payload/preparation/createdAt');
  validTimestamp(verification.verifiedAt, '/verification/verifiedAt');
  unique(payload.sources.map((source) => source.id), '/payload/sources');
  unique(payload.learning.coverage.map((concept) => concept.id), '/payload/learning/coverage');
  unique(payload.questions.map((question) => question.id), '/payload/questions');
  const sources = new Set(payload.sources.map((source) => source.id));
  const concepts = new Set(payload.learning.coverage.map((concept) => concept.id));
  payload.sources.forEach((source, index) => {
    const path = `/payload/sources/${index}`;
    if (!relativePath(source.path)) fail('invalid-source-range', 'Source paths must be relative to the repository.', `${path}/path`);
    if (source.endLine < source.startLine || source.code.includes('\r') || source.code.split('\n').length !== source.endLine - source.startLine + 1) {
      fail('invalid-source-range', 'Source excerpt must match its inclusive line range and use LF line endings.', path);
    }
    if (source.url) httpsLink(source.url, 'invalid-source-range', 'Source link', `${path}/url`);
  });
  validateChangeSet(payload);
  payload.questions.forEach((question, index) => {
    const path = `/payload/questions/${index}`;
    const options = question.options.map((option) => option.id);
    unique(options, `${path}/options`);
    const optionIds = new Set(options);
    references(question.conceptIds, concepts, `${path}/conceptIds`);
    if (question.explorationSourceIds) references(question.explorationSourceIds, sources, `${path}/explorationSourceIds`);
    references(question.answer.optionIds, optionIds, `${path}/answer/optionIds`);
    references(question.answer.evidence.map((item) => item.sourceId), sources, `${path}/answer/evidence`);
    const feedback = question.answer.optionFeedback.map((item) => item.optionId);
    references(feedback, optionIds, `${path}/answer/optionFeedback`);
    if (feedback.length !== options.length) fail('invalid-answer', 'Every answer option needs feedback.', `${path}/answer/optionFeedback`);
    question.discussion.forEach((topic, topicIndex) => references(topic.sourceIds, sources, `${path}/discussion/${topicIndex}/sourceIds`));
    if (question.type === 'ordering') {
      if (question.answer.optionIds.length !== options.length) fail('invalid-answer', 'An ordering answer must contain every item exactly once.', `${path}/answer/optionIds`);
      if (question.answer.optionIds.every((id, optionIndex) => id === options[optionIndex])) fail('invalid-answer', 'Initial item order must differ from the reference answer.', `${path}/options`);
    } else if (question.answer.optionIds.length === options.length) fail('invalid-answer', 'A choice question must contain an incorrect alternative.', `${path}/answer/optionIds`);
  });
  if (verification.verifierId === payload.preparation.generatorId || verification.sourceCommitSha !== payload.repository.commitSha || !verification.independentSolutionsRecorded) {
    fail('incomplete-verification', 'Review identity, source revision, and independent-solving declaration must match the preparation requirements.', '/verification');
  }
  const questionIds = new Set(payload.questions.map((question) => question.id));
  references(verification.questionReviews.map((review) => review.questionId), questionIds, '/verification/questionReviews');
  if (verification.questionReviews.length !== questionIds.size) fail('incomplete-verification', 'Every question needs its own passed review.', '/verification/questionReviews');
  verification.questionReviews.forEach((review, index) => {
    const path = `/verification/questionReviews/${index}/evidenceSourceIds`;
    references(review.evidenceSourceIds, sources, path);
    const question = payload.questions.find((item) => item.id === review.questionId);
    if (question.answer.evidence.some((item) => !review.evidenceSourceIds.includes(item.sourceId))) {
      fail('incomplete-verification', 'Question review must cover all answer evidence.', path);
    }
  });
  if (await payloadDigest(payload) !== verification.reviewedPayloadSha256) {
    fail('stale-verification', 'Quiz content changed after its recorded review. Prepare and verify the package again.', '/verification/reviewedPayloadSha256');
  }
  return data;
}

export async function importPackageText(text) {
  if (new TextEncoder().encode(text).byteLength > MAX_PACKAGE_BYTES) fail('package-too-large', 'Quiz packages must be 10 MiB or smaller.');
  return validatePackage(parseStrictJson(text));
}

export async function importPackageBytes(bytes) {
  if (bytes.byteLength > MAX_PACKAGE_BYTES) fail('package-too-large', 'Quiz packages must be 10 MiB or smaller.');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { fail('invalid-json', 'The quiz package must be a valid UTF-8 text file.'); }
  return importPackageText(text);
}
