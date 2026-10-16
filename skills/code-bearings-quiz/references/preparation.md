# Prepare a Code Bearings quiz

**Status: Provider-neutral preparation protocol.** The [quiz skill](../SKILL.md) gathers inputs and uses this workflow to coordinate generation and independent verification. It can also be followed directly by a coding agent. For a change-set quiz, also follow the [change-set addendum](change-set.md); it adds range selection, limits on claims, and verification checks without replacing any step here.

## Example request

```text
Prepare a Code Bearings repository-overview quiz using the instructions in
this preparation protocol and its linked v1 schema.

Repository checkout: <path to repository>
Branch: <named branch>
Commit: <full commit SHA; default to that branch's current committed tip>
Familiarity: new-to-repo
Target duration: 25 minutes including source exploration and discussion
Output: <destination>/<name>.quiz.json

Generate the content, then delegate independent source-based verification to
a fresh verifier subagent. Give it questions without answers first, wait for
its independent solutions, then have it review the complete candidate. Do
not replace independent verification with self-review. Return the package
and a concise preparation report, or report why preparation is incomplete.
```

## 1. Establish the committed snapshot

Read applicable repository instructions. Record repository identity/clone URL, selected branch, and full SHA. Default to the branch's committed tip; for an explicitly selected older commit, verify it is reachable from the named branch. Do not silently substitute a different branch tip or invent a branch for a detached checkout.

Use committed Git content at the recorded SHA, not working-tree text. Existing unrelated edits are excluded and left alone. Read the Git tree or an isolated read-only snapshot; do not switch or modify the user's checkout to prepare a quiz.

Assess the major components, entry points, ownership boundaries, and dependencies. For large repositories, choose representative concepts and document exclusions. Default to newcomer orientation and a 25-minute target. Any source language an agent can inspect is eligible; v1 does not depend on a language-specific parser. Disclose coverage limits when the agent cannot reliably interpret a subsystem.

## 2. Generate a candidate

Use only single-choice, multiple-select, and ordering. Favor responsibilities, dependencies, and execution paths; avoid spelling quizzes and speculative design rationale.

Produce a payload according to [the contract](package-contract.md) and [schema](../../../schema/quiz-package-v1.schema.json), with exact committed excerpts and original line ranges. Include explanations for all alternatives/items and source-backed discussion prompts. Provide all source references required by the v1 contract. Omit the optional `explorationSourceIds` field, which remains only so earlier packages stay valid. The viewer hides source filenames and excerpts until answer reveal; there is no intermediate exploration/revision phase.

An overview should introduce the repository map before connecting components through a representative path. A useful starting range is 8–12 questions for a 25-minute session, adjusted for excerpt complexity. It is a preparation heuristic, not a promise of measured duration or a required package count.

## 3. Delegate independent solving

Invoke an actual subagent in a fresh context, without inheriting the generation conversation or exposing the proposed answers. Give it:

- The repository path, pinned branch/SHA, and applicable instruction locations.
- Questions, options/items, and stated path assumptions.
- The requirement to inspect committed source independently and record answers, evidence paths/line ranges, and ambiguity.

Do not provide the candidate answer key, explanations, discussion prompts, verifier verdicts, or a generator summary claiming correctness. Exploration excerpts can be checked in the next phase; independent solving should start from the repository.

Wait for the subagent to return its written independent solutions before giving it the candidate in a separate invocation. Do not include a candidate payload path or conditional instructions to open it later in the blind-solving request. File timestamps and instructions to do both phases in order within one invocation do not satisfy this handoff.

Record the actual verifier identity and preserve the solutions with the preparation report. Identity can be a tool-issued thread/task identifier; never invent a successful subagent run. When the coordinator receives a tool-issued identity, pass it back to the verifier for its final record instead of substituting an unknown-identity description.

## 4. Delegate complete review to that verifier

After independent solutions are recorded and returned, resume or message that same verifier with the complete candidate payload and the package contract. Require the verifier to compare its solutions, inspect each alternative, check exact source excerpts/ranges, explanations, and discussion premises, and report any disagreement or unsupported claim.

If the host cannot resume or contact the verifier, report incomplete preparation and the actual limitation. A replacement verifier must finish a fresh blind-only invocation and return its written solutions before receiving the candidate. Do not merge blind solving and review into one request to work around missing transcripts. In CLI/print-mode tests, retain the session state required by the host's subagent resume mechanism.

If content is revised, the verifier must review the revised exact payload. Questions with material prompt changes need a fresh blind-solve pass in a new verifier context; do not reuse a prior answer as independent evidence for a different question. Resolve every finding through revision and review or exclude the question and record why. After at most two revision rounds, return incomplete preparation if unresolved findings remain; a user can explicitly request another attempt.

The final verifier independently calculates/checks the canonical payload digest using `node <skill-directory>/scripts/quiz-tools.mjs digest <payload.json>` on the payload object alone, and returns its passed per-question review. If a subagent or source access is unavailable, return an incomplete report. No self-verification fallback is allowed.

## 5. Finalize and report

Assemble the exact reviewed payload and verifier-produced record, then run structural and semantic validation. Recheck that the package's source excerpts match the committed snapshot. Do not modify the payload after review; even metadata edits need a new digest and final verifier check.

Run the skill's bundled tools, resolving the directory from the installed `SKILL.md`:

```text
node <skill-directory>/scripts/quiz-tools.mjs validate <package.quiz.json>
node <skill-directory>/scripts/quiz-tools.mjs verify-sources <package.quiz.json> <repository-checkout>
```

The exported tools need Node.js 22.12 or newer and Git for source comparison, with no npm install or viewer checkout. Validation shares the viewer's strict JSON, schema, semantic, and digest rules. Source comparison reads committed blobs, normalizes only CRLF to LF, and checks the recorded commit's reachability from a matching local or remote-tracking branch. It does not prove remote availability, agent independence, or reasoning correctness. The coordinator checks fetchability separately; independent review remains required.

Both commands must succeed before delivering a playable package. If a required tool cannot run, report incomplete preparation and the unperformed check. The original `npm run validate-package -- <package path>` remains available from a Code Bearings checkout.

Return the `.quiz.json` package with companion `<name>.preparation.md` and `<name>.independent-solutions.json` files in the resolved private destination. Do not overwrite existing files. The report identifies revision and fetchability, coverage/exclusions, verifier identity, independent-solving evidence, changes and dropped questions, validation/source-comparison results, and any unperformed checks. An agent-checked pilot does not establish actual session duration, learning effectiveness, browser compatibility, or accessibility.

## Coding-agent compatibility

Use the native subagent capability available in the current coding environment; exact tool names and configuration vary. The instruction above explicitly requests delegation. OpenAI's [subagent documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents) describes explicit delegation in local Codex; Claude Code's [subagent documentation](https://code.claude.com/docs/en/sub-agents) describes separate subagent contexts. Use a fresh verifier, not a fork carrying the answer-generation conversation.

Same-model subagents are acceptable: independence here means separate context, independent source inspection, and a separately produced review. Different model/provider requirements are not part of v1. Permissions and available tools remain those of the user's coding environment; instructions cannot manufacture unavailable capabilities.

The skill instructions use the common Agent Skills format. Bundled tools are tested independently of either provider. Native invocation and a full preparation run must be exercised in each host before claiming end-to-end compatibility.
