---
name: code-bearings-quiz
description: Prepare a Code Bearings repository quiz from committed source, gathering missing inputs and coordinating independent subagent verification. Use when someone wants to generate a quiz package for learning a codebase.
---

# Prepare a repository quiz

Produce a portable `.quiz.json` package for Code Bearings. The facilitator answers a question, reveals its answer, then explores source evidence and discussion. Prepare all content before the session; this skill does not modify the viewer.

## Resolve the inputs

Use supplied values and existing conversation context first. Ask only for information that cannot be safely resolved, bundling missing inputs in one short exchange. Accept a complete request without repeating its questions or adding an approval step.

If a required input needs clarification, stop after asking. Do not map source, draft questions, delegate verification, or create preparation files until the user answers. A suggested destination, an unanswered question, or a non-interactive tool returning no answer is not a supplied value. In a non-interactive invocation, return the clarification question and end the run; continue only in a later request that supplies the missing value.

| Input | Resolution |
|---|---|
| Repository | Use the clearly identified target checkout. A request for “this repository” means the user's working repository, not the installed skill's directory. Ask when ambiguous. For a URL, find an existing checkout or obtain an isolated clone using the environment's normal permissions. |
| Branch and commit | Default to the target checkout's current named branch and committed tip. Resolve the full SHA once and use it throughout. An explicit commit must be reachable from the selected branch. Ask for a branch for detached HEAD; a repository without commits cannot produce a quiz. |
| Familiarity | Default to `new-to-repo`. Accept `working-in-repo` for engineers already contributing; translate equivalent plain-language requests. |
| Duration | Default to 25 minutes including evidence and discussion. Accept a positive whole number of minutes. Ask about ambiguous ranges or invalid values. |
| Destination | Use an explicitly supplied file or directory, or an established private destination from the conversation. Otherwise ask where to save and wait for the answer. A repository instruction recommending `local/` is not an established destination for this request. For a directory, choose `<repo>-<short-sha>.quiz.json` without overwriting an existing file. Keep packages and review evidence outside committed/public artifacts. |

Read target-repository instructions. Identify a credential-free clone URL; ask if no unambiguous remote exists. Check that the branch/revision can be fetched from that remote using available evidence. If it is local-only or cannot be checked, explain the limitation and resolve the revision with the facilitator rather than publishing source changes yourself. Read Git objects, excluding working-tree edits. Do not switch, clean, commit, or push the target checkout to prepare a quiz.

State the resolved repository, branch/full SHA, familiarity, duration, and destination briefly before starting. This is a setup summary, not a new permission gate. If the user has explicitly requested an approval step, honor it.

## Prepare and verify

Read the [preparation protocol](references/preparation.md), [package contract](references/package-contract.md), and [v1 schema](../../schema/quiz-package-v1.schema.json). Resolve resources relative to this skill's actual directory, independent of the user's working directory.

Check early that Git, Node.js 22.12 or newer, and the bundled tools are available, and that a fresh independent subagent can run and inspect the committed source. If a requirement is unavailable, report incomplete preparation; never invent an agent identity, successful review, or self-review fallback. This request authorizes the protocol's verification delegation, subject to the environment's actual tool and permission availability.

Generate a repository overview using single-choice, multiple-select, and ordering questions about responsibilities, dependencies, and execution flow. For 25 minutes, 8–12 questions is a starting heuristic; adjust for source complexity. Avoid questions answerable merely by matching the prompt's wording to a class name. Support every alternative and discussion premise with source evidence.

Delegate blind solving to a fresh context without answers or generation history. Use a separate invocation for each verification phase: the blind-solving instruction must not include the candidate payload, its path, or later instructions to open it. Wait for the subagent to return its written solutions, then resume/message that same verifier with the candidate for exact-payload review. If it cannot be resumed or contacted, report incomplete preparation; do not combine both phases in one instruction as a workaround. A replacement verifier must complete a new blind-only invocation and return its solutions before receiving the candidate. Follow the protocol's revision limits and fresh-solving requirements when questions change.

## Finish the package

The [bundled tools](scripts/quiz-tools.mjs) require Node.js 22.12 or newer; source checks also require Git. In an exported/installed skill they need no npm dependencies or Code Bearings checkout. In a source checkout, build the skill before copying or installing it.

Run these commands using the actual skill directory and resolved file paths:

```text
node <skill-directory>/scripts/quiz-tools.mjs digest <payload.json>
node <skill-directory>/scripts/quiz-tools.mjs validate <package.quiz.json>
node <skill-directory>/scripts/quiz-tools.mjs verify-sources <package.quiz.json> <repository-checkout>
```

The verifier independently computes/checks the payload digest before returning its record. Final validation and committed-source comparison must pass before reporting a playable package. Tools do not authenticate agent identity or replace its source-based reasoning. Missing tools or failed checks mean incomplete preparation.

Return the quiz path, revision, coverage/exclusions, and paths to the independent solutions and preparation report. Record actual review identities, revisions/dropped questions, tool results, and unperformed checks in that report. Preserve the exact reviewed payload. Keep source excerpts and repository-specific evidence private; do not include them in the skill or publish them automatically.
