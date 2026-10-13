# Code Bearings

**Find your bearings in the code.**

Agent-prepared, source-backed quizzes that help engineers build and reinforce a mental map of a codebase, especially as they rely more on AI-generated code.

A facilitator shares a browser window, or a solo engineer works through the same flow:

**Answer → reveal → explore source and discuss.**

Quizzes are prepared before the session through one request to a coding agent, which delegates verification to an independent subagent. Portable packages include source excerpts, filenames, line numbers, and the repository URL, branch, and full commit SHA.

The agreed delivery model is a reusable browser viewer that imports separate quiz packages. The viewer is intended for local use; public hosting is not required.

## Run locally

Requires Node.js 22.12 or newer and npm.

```bash
npm ci
npm run dev
```

Open **http://127.0.0.1:4173**. Choose a `.quiz.json` package from your filesystem. Review the repository revision and coverage, then start the session.

The viewer tracks only this window's current session. Refreshing or closing the page clears answers and progress. Package checks validate structure, references, and the recorded independent review's payload digest; source correctness and agent independence come from the preparation workflow.

For a production build:

```bash
npm run build
npm run preview
```

The resulting `dist/` directory contains static assets and can be served locally. Playing a loaded quiz requires no provider APIs, checkout, or external network requests. External source links open only when selected.

## Prepare another quiz

Use the [Code Bearings quiz skill](skills/code-bearings-quiz/SKILL.md) from a coding-agent session in the repository you want to learn. It gathers missing inputs, defaults to a newcomer overview of the current branch's committed tip and a 25-minute session, and asks where to save when no private destination is established. You can supply a different repository, branch/commit, familiarity, or duration upfront.

Build the portable skill from this checkout:

```bash
npm ci
npm run build:skill
```

The output is `.skill-build/code-bearings-quiz/`. It includes the preparation protocol, package contract, schema, and standalone tools. Copy the **whole exported folder**, rather than just `SKILL.md`, into your coding agent's skills directory. Once installed, it needs Node.js 22.12 or newer and Git; its tools require no npm dependencies or viewer checkout. The coding environment must support a fresh independent verifier subagent.

For a first local Codex installation:

```bash
mkdir -p ~/.agents/skills
cp -R .skill-build/code-bearings-quiz ~/.agents/skills/
```

For a first local Claude Code installation:

```bash
mkdir -p ~/.claude/skills
cp -R .skill-build/code-bearings-quiz ~/.claude/skills/
```

In Codex, invoke `$code-bearings-quiz`; in Claude Code, invoke `/code-bearings-quiz`. For example:

```text
Prepare an overview of this repository for newcomers, targeting 25 minutes.
Save it to ~/quizzes/.
```

The agent resolves the committed snapshot and coordinates generation, independent blind solving, and exact-payload review. It returns a `.quiz.json` file, a `.preparation.md` report, and `.independent-solutions.json` evidence in your chosen private destination. Import the finalized quiz into the viewer. Preparation remains incomplete if independent verification or required tooling is unavailable.

The detailed [preparation protocol](skills/code-bearings-quiz/references/preparation.md) is also usable by agents without skill discovery. It and the [package contract](skills/code-bearings-quiz/references/package-contract.md) are maintained with the skill.

Local installation and invocation follow the [official Codex skill documentation](https://learn.chatgpt.com/docs/build-skills) and [Claude Code skill documentation](https://code.claude.com/docs/en/skills). The portable tools have automated checks; a full native skill invocation in each host remains a separate compatibility check.

Validate a package locally:

```bash
npm run validate-package -- /path/to/your-package.quiz.json
```

## Development checks

```bash
npm test
npm run test:skill
npm run test:e2e
```

The browser suite tests a production build using pinned Playwright 1.58.2. On a fresh workstation, install its Chromium browser if needed with `npx playwright install chromium`; an existing matching browser is reused. The suite uses fictional test data and covers direct answer reveal, source concealment, keyboard ordering, imports, offline play, responsive layouts, and automated accessibility. Real screen-reader and participant learning checks are recorded separately.

## Project status

The first reusable viewer is implemented, with a versioned package contract and a documented independent verification workflow. The intent is to release it as a free, open-source tool; the license is still to be selected.

- [Package contract](skills/code-bearings-quiz/references/package-contract.md) and [JSON Schema](schema/quiz-package-v1.schema.json)
- [Quiz preparation instructions](skills/code-bearings-quiz/references/preparation.md)
- [Quiz preparation skill](skills/code-bearings-quiz/SKILL.md)
- [Agent guidance](AGENTS.md)

The first version focuses on repository-overview quizzes, shared sessions, and a selectable familiarity level and duration. Defaults are **new to the repo** and **20–30 minutes**, including exploration and discussion.

Launch question formats are **single-choice, multiple-select, and ordering**, covering responsibilities, dependencies, and execution flow.

The viewer provides question-level correctness and an end-of-session learning recap, without an overall numerical score. Discussion topics appear after answer reveal and are collected in the final recap.

Answers, progress, and the recap are tracked only for the current session. Saved history and cross-session resume are outside the first version.


Quiz content is supplied by the user and is not bundled with the application. Keep private packages and preparation evidence under the ignored `local/` directory or outside this checkout. Public test fixtures are synthetic and do not represent an independently verified repository. Participant timing and learning effectiveness remain to be measured.
