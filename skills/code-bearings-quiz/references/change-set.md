# Change-set quizzes

**Status: Addendum to the [preparation protocol](preparation.md).** Follow that protocol and the [package contract](package-contract.md) in full; this file adds only what differs when a quiz teaches a bounded set of committed changes. Package structure is defined by the [v1 schema](../../../schema/quiz-package-v1.schema.json).

A change-set quiz helps engineers understand how a feature was built: the responsibilities a range introduced or affected, its connections to existing components, and paths through the resulting implementation. Use `learning.scope: change-set` with a `payload.changeSet` record.

## Select the range

The head is the package's `repository.commitSha` on `repository.branch`, resolved exactly as for an overview. Choose the base by one of two methods:

| Request | Selection | Base |
|---|---|---|
| “Since this branch diverged from main” | `merge-base` | Unique merge base of head and the comparison branch’s resolved SHA |
| A merge commit already on main | `explicit` | The merge commit’s first parent; head is the merge commit |
| A squashed or single commit | `explicit` | The commit’s parent; head is the commit |
| A named earlier starting point | `explicit` | That commit, which must be an ancestor of head |

Resolve the range with the bundled tool instead of hand-written Git commands:

```text
node <skill-directory>/scripts/quiz-tools.mjs resolve-range <checkout> <head-sha> --compare <branch> [--focus <path>]...
node <skill-directory>/scripts/quiz-tools.mjs resolve-range <checkout> <head-sha> --base <commit> [--focus <path>]...
```

`--compare` requires a branch: a local name such as `main`, a remote-qualified name such as `origin/main`, or a full branch ref. Bare names fall back to an unambiguous remote-tracking branch when no exact branch ref exists. Use a full ref when names are ambiguous. Commit SHAs, tags, and revision expressions are supported for head and `--base`, but not for `--compare`. Resolution and source verification use the same branch lookup.

It prints the head and base SHAs, the `selection` record for the package, and the changed files (with renames). It fails, and you should ask the facilitator, when:

- the base is not an ancestor of head;
- head and the comparison branch have several merge bases or no shared history;
- the range is empty. A branch already merged into its comparison branch produces this; offer the merge-commit or squash selection rather than guessing;
- the focus paths contain no changes.

Never compare against the comparison branch’s current tip, choose one of several merge bases, or silently reinterpret the request. Stop after asking, as the skill requires for any unresolved input.

The range is the endpoint tree difference: changes introduced and later reverted inside the range are outside it. Renamed files use their paths at head. Behavior that exists only in deleted code cannot supply head evidence; record it as an exclusion in the preparation report. If the range contains only generated, vendored, or unsupported material, or the intended feature cannot be inferred from a mixed range, say so and ask for focus or another range.

Head must be fetchable through the recorded remote and branch. The base is needed to reproduce the diff, not to play; record an unfetchable base as a provenance limitation. For a deleted feature branch, resolve an available containing branch with the facilitator.

Add the range, selection method, and any focus to the setup summary.

## Inputs and defaults

- Familiarity defaults to `working-in-repo`; a change set rarely gives a newcomer enough orientation. When `new-to-repo` is requested, include supporting-context questions or suggest pairing the quiz with an overview.
- Duration keeps the 25-minute default. Small ranges may support fewer questions; do not pad with unrelated repository trivia.
- `focusPaths` (optional) narrow the teaching topics; they do not restrict the supporting excerpts you may cite.
- `compareUrl` (optional) is an HTTPS link to a hosted comparison naming both full SHAs.

## Generate

Map the affected responsibilities and execution paths from the diff and the committed source at head. A useful sequence is feature context → component responsibilities → dependencies → execution flow → boundary or change-impact discussion. Every question must connect to a responsibility or behavior the range affected. Unchanged callers, interfaces, storage, and tests may be cited when they explain the change.

What questions, explanations, and discussion may claim:

- **Allowed:** what the range added, modified, renamed, or removed, stated as a fact about the range (“this change introduced `HistoryLog`”). These claims must be checkable with `git diff <base> <head>`.
- **Excluded:** how the code behaved before the change, what removed code did, and why an author made a decision, unless supplied documentation supports it. Frame hypothetical changes as hypothetical.

Avoid questions about commit counts, authorship, or whether code was AI-generated; Git history does not establish the last.

Use participant language for the selected version: “after this change,” “this version,” or simply the named behavior. Avoid unexplained phrases such as “head revision” and “head calculation” in questions, explanations, and discussion. Keep precise base/head terminology in provenance and preparation records; use it in teaching content only when Git revisions are themselves the topic, explaining the terms when needed.

All excerpts, filenames, and line numbers come from head. Omit the optional `explorationSourceIds` field. Keep a private coverage table that maps each question to the affected behavior, the changed paths it depends on, and any unchanged context it uses.

## Verify

Use the protocol’s two verifier handoffs unchanged.

1. **Blind solving.** Give the verifier the repository, head, base, selection, focus, and questions/options. Withhold the candidate path, answer key, explanations, discussion, and coverage table.
2. **Complete review.** Resume the verifier with the candidate and coverage table. In addition to the protocol’s checks, it confirms the range selection, checks every claim about what changed against the diff, checks that each question is relevant to the range, and rejects excluded historical or rationale claims.

`verify-sources` also checks the change set: the base is an ancestor of head; for a merge-base selection, the comparison SHA is reachable from the comparison branch and the recorded base is the unique merge base; the range (within any focus paths) is nonempty; and source and comparison links name the recorded revisions.
