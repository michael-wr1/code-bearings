# Working on Code Bearings

## Project context

Code Bearings helps solo engineers and small teams build and reinforce a mental map of a repository. It addresses the understanding gap that can develop when code is generated faster than engineers can explore it.

Read `README.md` before substantive work. For quiz work, also read `skills/code-bearings-quiz/SKILL.md`, its preparation and package-contract references, and `schema/quiz-package-v1.schema.json`. Distinguish agreed product direction and the implemented v1 contract from open questions. User instructions take precedence.

## Implementation conventions

- The viewer uses static JavaScript ES modules and Vite. `src/core/` owns package validation and session transitions; `src/main.js` owns DOM presentation; `src/styles.css` owns visual tokens and responsive styling.
- Compile the JSON Schema using `npm run compile-schema`; `src/generated/` is build output, not hand-edited source. Ajv is a development dependency; the browser uses standalone validation code without dynamic code generation or remote schema loads.
- Use `npm test` for contract/state checks and `npm run test:e2e` for the production browser flow. The Playwright version pins its matching Chromium build; check local browser availability before downloading another browser.
- Bind development/preview servers to loopback by default. Keep dependencies and fonts local. Import quiz content from user-selected files; do not bundle private packages. Render imported content as text.
- Preserve exact independently reviewed package payloads. Content changes require fresh independent review and a matching digest.
- `skills/code-bearings-quiz/` owns the quiz-preparation skill and canonical preparation/contract references. Do not maintain duplicate protocols. The schema remains canonical under `schema/`.
- `npm run build:skill` exports a self-contained skill to ignored `.skill-build/`, copying the schema and bundling the shared validator into Node tools. Never copy private packages into the export. Run `npm run test:skill` for isolated-installation and committed-source comparison checks.

## Agreed product direction

- Build a shared tool intended for free, open-source distribution.
- Present quizzes in a browser, suitable for local use and screen sharing in a team call.
- Use a reusable viewer that imports separate quiz packages. Keep quiz content separate from the application; standalone HTML export is a possible later enhancement.
- Start with one facilitator controlling a shared session. A solo engineer uses the same flow.
- Accept agent-prepared quiz packages. Generation and verification happen through existing coding-agent workflows, such as Claude Code or Codex, before play begins.
- Provide one preparation request that coordinates generation and delegates verification to an independent subagent.
- The first version does not need direct Anthropic or OpenAI API integration.
- Follow this learning progression: overall repository, then a feature or workflow, then recent AI-generated changes. The first version focuses on the repository overview.
- Make familiarity selectable, defaulting to `new to the repo`.
- Make target duration selectable, defaulting to 20–30 minutes including exploration and discussion.
- Launch with single-choice, multiple-select, and ordering questions, covering responsibilities, dependencies, and execution flow. Matching and fill-in-the-blank are outside the initial scope.
- Present relevant discussion topics after each answer reveal and collect them in the final learning recap, so the facilitator can discuss them immediately or return to them at the end.
- Follow the interaction sequence: answer the question, then reveal correctness, explanation, source evidence, and discussion. Keep source filenames and excerpts hidden until reveal.
- Provide question-level correctness and a learning recap rather than an overall numerical score. Correctness feedback belongs at answer reveal. Record one response and outcome per question.
- Track answers, progress, and the learning recap only for the current session. Saved history, persistent results, and cross-session resume are outside the first version.
- Packages must work without the original repository being present, using embedded source excerpts and references.
- Record repository clone URL, branch name, and full commit SHA so participants can fetch the relevant source for deeper exploration.
- Use committed source only. All source evidence and line numbers must refer to the recorded commit.

## Quiz content and verification

- Favor responsibilities, relationships, boundaries, execution paths, and change impact over symbol memorization.
- An independent verifier subagent must inspect the recorded source and verify questions and answers before a quiz becomes playable. It must work in a separate agent context and establish its own source evidence. Self-review by the generating agent does not satisfy this requirement.
- If an independent verifier subagent cannot run, report preparation as incomplete rather than marking the quiz verified. Do not fabricate verification findings.
- Keep all source material hidden before answer reveal so filenames and excerpts do not give away the answer. The v1 package retains its exploration-source field for compatibility, but it does not enable a pre-reveal exploration stage.
- Support explanations with filenames, line numbers, and code excerpts. Include multiple references when the answer depends on relationships across files.
- Distinguish demonstrated behavior from inferred design intent. Do not invent rationale unsupported by source or supplied documentation.
- Resolve or exclude ambiguous and unsupported questions before publication into a playable package.
- Verify factual premises in discussion prompts; frame hypothetical changes as hypothetical.

## Scope and contribution guidance

- Preserve the agreed scope. Resolve open product and technical choices explicitly rather than presenting them as existing decisions.
- Do not invent setup commands, implemented capabilities, or test results. Document actual commands once tooling exists.
- Keep preparation concerns out of the participant experience unless they help someone understand provenance or explore the code.
- When implementing, run checks appropriate to the change and report their results. Documentation-only edits need content and diff review rather than application tests.
- Keep browser interactions accessible, including keyboard operation and feedback that does not depend on color alone.
- Use the project's established architecture and conventions as they emerge. Do not introduce an unrelated orchestration workflow by default.

## Public repository content

- Keep personal or private repository names, clone URLs, local paths, branches, commit identifiers, source excerpts, quiz packages, and preparation reports out of committed artifacts. Use the ignored `local/` directory for private material.
- Keep internal planning documents and development review reports under ignored `local/`. Public documentation should help people use, build, or maintain the application and skill. Do not add contribution invitations or pull-request workflows unless requested.
- Public tests use explicitly fictional fixtures under `tests/fixtures/`. Their review records are fabricated test inputs, not evidence of actual independent verification. Do not bundle them into the viewer.
- Inspect intended commit files and production assets for private content before committing or distributing a build. Do not add ignored local material to Git.

## Participant-facing UI copy

- Include text when it helps participants act, understand the code, interpret an outcome, or make a decision. Check its audience, purpose, timing, and whether clear controls already communicate the same information.
- Keep implementation status, preparation checks, verification bookkeeping, and development scope reminders in documentation or optional details. Do not turn acceptance criteria into persistent UI labels or success badges.
- Show consequences when they matter: explain lost progress in restart/replacement confirmations rather than displaying a permanent session-scope reminder. Preserve useful errors, recovery actions, accessible labels, and interaction announcements.
- Let questions, source evidence, and discussion lead the interface. Repository identity, branch, and commit remain available because they support source exploration; routine messages such as "Package checks passed" do not need participant attention.
- Review visible copy during UI work and remove redundant explanations. Explicit user-approved copy takes precedence; surface a conflict rather than silently rewriting it.
