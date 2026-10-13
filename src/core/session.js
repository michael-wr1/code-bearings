const copy = (response) => response === null ? null : [...response];

export function outcome(question, response) {
  if (response === null) return 'unanswered';
  const expected = question.answer.optionIds;
  const actual = question.type === 'multiple-select' ? [...response].sort() : response;
  const reference = question.type === 'multiple-select' ? [...expected].sort() : expected;
  return actual.length === reference.length && actual.every((id, index) => id === reference[index]) ? 'correct' : 'revisit';
}

export class QuizSession {
  constructor(quiz) {
    this.quiz = quiz;
    this.activeIndex = 0;
    this.viewIndex = 0;
    this.mode = 'session';
    this.records = quiz.payload.questions.map((question) => ({
      phase: 'attempt', response: null,
      draft: question.type === 'ordering' ? question.options.map((option) => option.id) : [],
      openedSources: new Set(),
    }));
  }
  get question() { return this.quiz.payload.questions[this.viewIndex]; }
  get record() { return this.records[this.viewIndex]; }
  get complete() { return this.records.every((record) => record.phase === 'revealed'); }
  canAnswer(response = this.record.draft) {
    if (!Array.isArray(response)) return false;
    const allowed = this.question.options.map((option) => option.id);
    if (new Set(response).size !== response.length || response.some((id) => !allowed.includes(id))) return false;
    if (this.question.type === 'single-choice') return response.length === 1;
    if (this.question.type === 'multiple-select') return response.length >= 1;
    return response.length === allowed.length;
  }
  setDraft(response) {
    if (this.record.phase === 'revealed') throw new Error('Revealed answers cannot be changed.');
    const allowed = this.question.options.map((option) => option.id);
    if (!Array.isArray(response) || new Set(response).size !== response.length || response.some((id) => !allowed.includes(id))) throw new Error('Invalid response.');
    if (this.question.type === 'single-choice' && response.length > 1) throw new Error('Choose one answer.');
    if (this.question.type === 'ordering' && response.length !== allowed.length) throw new Error('Keep every ordering item.');
    this.record.draft = copy(response);
  }
  reveal(unsure = false) {
    if (this.record.phase !== 'attempt') throw new Error('This answer is already revealed.');
    if (!unsure && !this.canAnswer()) throw new Error('Choose an answer or reveal as unsure.');
    this.record.response = unsure ? null : copy(this.record.draft);
    this.record.phase = 'revealed';
  }
  next() {
    if (this.viewIndex !== this.activeIndex || this.record.phase !== 'revealed') throw new Error('Reveal the current answer before advancing.');
    if (this.activeIndex === this.records.length - 1) this.mode = 'recap';
    else { this.activeIndex++; this.viewIndex = this.activeIndex; }
  }
  review(index) {
    if (!Number.isInteger(index) || index < 0 || index > this.activeIndex || (index !== this.activeIndex && this.records[index].phase !== 'revealed')) throw new Error('That question is not yet available.');
    this.viewIndex = index;
    this.mode = 'session';
  }
  recap() {
    if (!this.complete) throw new Error('Complete the quiz before opening its recap.');
    this.mode = 'recap';
  }
}
