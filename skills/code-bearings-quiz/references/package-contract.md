# Quiz package v1

**Status: Implemented v1 contract.** The [schema](../../../schema/quiz-package-v1.schema.json) defines structural validation. This document adds semantic checks and preparation requirements that JSON Schema alone does not enforce. Browser import and the local validation command share those checks in `src/core/package.js`.

## Envelope

A package is one UTF-8 JSON file, conventionally named `<name>.quiz.json`, with three fields:

| Field | Meaning |
|---|---|
| `formatVersion` | Exactly `1.0`; other values are rejected by the first viewer. |
| `payload` | All playable content and its repository/preparation context. |
| `verification` | Independent subagent's review of this exact payload. |

The schema uses [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12). Schema declarations do not require fetching anything at runtime; the viewer bundles its supported schema. Unknown properties are rejected so misspelled fields do not silently disappear.

## Payload

| Field | Required contents |
|---|---|
| `id`, `title` | Stable package identifier and human-readable title. |
| `repository` | `name`, `cloneUrl`, `branch`, full lowercase `commitSha`. |
| `changeSet` | Required for the `change-set` scope and rejected otherwise; see below. |
| `preparation` | Actual `generatorId` and UTC `createdAt`. |
| `learning` | Scope, familiarity, target minutes, concept coverage, explicit exclusions. |
| `sources` | Embedded, individually identified source excerpts. |
| `questions` | Ordered playable questions. |

Scope is `repository-overview` or `change-set`. Familiarity is `new-to-repo` or `working-in-repo`; these are preparation inputs, not runtime question transformations. `targetMinutes` is a positive safe integer, default 25, with no countdown during play. Coverage items have an `id`, `title`, and `summary`; question `conceptIds` refer to those IDs.

`cloneUrl` is displayed/copied as text and never executed. It can represent an HTTPS or SSH Git remote; preparation must not embed credentials. Shared validation rejects HTTP(S) URLs containing user information and any parsed URL containing a password. Normal SSH usernames remain valid, including `ssh://git@example.invalid/team/repo.git` and `git@example.invalid:team/repo.git`. This guard does not replace preparation's inspection for secrets elsewhere in a remote or package. Branch provides context, while the SHA identifies the committed source. Format v1 accepts full 40-character SHA-1 commit IDs; support for SHA-256 Git repositories is deferred to a later format version.

## Change set

A `change-set` package teaches a bounded range of committed changes. `repository.commitSha` is the head commit and `repository.branch` its fetchable branch; all excerpts come from head. `changeSet` contains:

| Field | Meaning |
|---|---|
| `baseCommitSha` | Full lowercase SHA of the range's base: an ancestor of head and different from it. |
| `selection` | `{ "method": "explicit" }`, or `{ "method": "merge-base", "comparisonBranch", "comparisonCommitSha" }` when the base is the unique merge base of head and the comparison branch's recorded SHA. |
| `focusPaths` | Optional repository-relative files or directories (a trailing `/` is allowed) narrowing the teaching topics. Supporting excerpts may come from elsewhere. |
| `compareUrl` | Optional HTTPS link to a hosted comparison naming the full base and head SHAs. |

The range is the endpoint tree difference from base to head. The payload digest covers this record, so changing the range invalidates a review. The importer checks structure, SHA syntax, distinct base and head, path rules, and link scheme. Ancestry, merge-base derivation, a nonempty range, and links require `verify-sources`. The [change-set addendum](change-set.md) describes selection, permitted claims, and verification.

## Source excerpts

Each source has `id`, repository-relative POSIX `path`, `language`, one-based inclusive `startLine`/`endLine`, and `code`. An optional HTTPS `url` links to that exact commit and range; it is not needed to play offline.

Semantic requirements:

- Source IDs and coverage IDs are unique; paths are relative, contain no empty, `.` or `..` segments, and never begin with `/` or use backslashes.
- `endLine >= startLine`. The number of LF-separated lines in `code` equals `endLine - startLine + 1`. No extra trailing delimiter is added to an excerpt. A file's terminal newline ends its last line; it does not create another source line. Preserve actual final blank lines instead of trimming all trailing newlines.
- Excerpts are copied from the Git object at `repository.commitSha`, normalized from CRLF to LF, with no trim, manual edits, omitted interior lines, or fabricated code. The preparer and verifier check them against Git. The offline viewer can check line counts, but cannot prove correspondence to a repository it does not possess.
- For external links, `verify-sources` checks that the link path names the recorded commit and source path and that its line fragment (`#L1-L5`, `#L1-5`, or `#lines-1:5`) matches the excerpt range. The viewer checks HTTPS before enabling a link. It does not fetch the link to validate evidence.

## Questions

Every question has `id`, `type`, `prompt`, `conceptIds`, `options`, `answer`, and `discussion`, and may have `explorationSourceIds`. IDs are unique within their appropriate scope; option IDs are unique within a question. Each discussion item has `prompt` and supporting `sourceIds`.

`answer` contains `optionIds`, `explanation`, `evidence` (source ID plus explanation of support), and `optionFeedback` (one explanation for each displayed option/item). Only prompt/options appear before reveal. Source filenames and excerpts, answer feedback, evidence annotations, and discussion prompts appear after reveal. Verification notes belong in preparation reporting. The optional `explorationSourceIds` field is validated when present so earlier reviewed packages remain valid; new packages omit it, and it does not enable a pre-reveal exploration phase. The viewer presents answer-evidence and discussion references after reveal.

| Type | Reference answer | Correctness |
|---|---|---|
| `single-choice` | One option ID. | Same selected ID. |
| `multiple-select` | Nonempty subset, with at least one incorrect alternative. | Exact set equality; selection order is irrelevant. |
| `ordering` | Every displayed item ID once, in the unique intended sequence. | Exact sequence equality. |

An ordering question requires at least three items and must identify a specific path and assumptions (for example, a successful branch rather than all error branches). Exclude partial orders, independent concurrent operations, and equally valid alternative sequences. Initial displayed ordering must differ from the reference sequence. Feedback explains positions/relationships rather than inventing numerical partial credit.

Compatibility note: earlier v1 validators accepted two-item ordering questions. Current validators reject them because the required incorrect initial order makes their answer trivial. Use a single-choice question for a two-step relationship. Revising an existing package requires fresh independent review and a matching payload digest; import does not convert old questions.

Additional semantic requirements:

- Every concept, exploration source, evidence source, discussion source, and feedback option reference resolves. No repeated IDs in reference arrays.
- `optionFeedback` covers every displayed option exactly once. Every question has at least one answer-evidence reference and discussion prompt.
- The verifier checks that each incorrect alternative is actually wrong under the prompt's assumptions and that selected evidence supports the explanation and discussion premises.
- Exploration material may contain code that enables solving the question. It must not include an answer-key annotation or explanation masquerading as a source excerpt.
- All content strings are plain text. The first version does not accept executable content or HTML formatting in packages.

## Verification record

The record includes `status: passed`, `method: independent-subagent`, actual `verifierId`, UTC `verifiedAt`, `sourceCommitSha`, `reviewedPayloadSha256`, `independentSolutionsRecorded: true`, a summary, and one passed `questionReviews` entry for each question. Each review records `questionId`, supporting `evidenceSourceIds`, and notes.

The viewer's semantic validator requires:

1. Generator and verifier identities differ and the declared method is independent-subagent.
2. Source commit matches the payload repository revision.
3. Reviews cover every playable question exactly once with a passed verdict. Their evidence lists include every answer-evidence source for that question.
4. The payload digest matches the current payload.

Compute `reviewedPayloadSha256` as lowercase hexadecimal SHA-256 over the UTF-8 [RFC 8785 JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785.html) representation of `payload` alone. Reformatting JSON or reordering object properties preserves the digest; changing any payload value or array order invalidates the old review. All v1 numbers are safe integers. Preserve Unicode strings without normalization; reject duplicate JSON object keys and unpaired surrogate characters before canonicalization.

The verifier computes or independently checks the digest and returns the review. The coordinating agent assembles the envelope without rewriting the reviewed payload. Changes require re-review and a new record. Failed or incomplete reviews belong to the preparation report, not a playable package.

This record is an auditable attestation with change detection. It is not a signed proof of agent identity, independence, or source correctness: a file author can edit both content and the declaration. Code Bearings relies on the preparation workflow and source review, with no signing keys, registry, or verification service in v1. Describe this as a recorded independent review if discussing provenance; never claim live source verification from importer checks.

## Import order and failures

Check size, UTF-8/JSON integrity, exact version, bundled schema, semantic references/source ranges, and verification consistency. Only then offer `Start quiz`. Do not truncate invalid content, invent missing metadata, skip failed questions, repair answers automatically, or display technical validation notes during attempts.

Suggested error categories are `invalid-json`, `unsupported-version`, `invalid-structure`, `invalid-reference`, `invalid-source-range`, `invalid-answer`, `incomplete-verification`, `stale-verification`, and `package-too-large`. The specification's 10 MiB / 100 question limits are enforced consistently during preparation and import.

The importer rejects nesting beyond 100 levels to bound parsing work; valid v1 packages do not need deep arbitrary object nesting. UTF-8 files may have a leading byte-order mark. Source links must not embed URL credentials. Date fields must be real UTC calendar timestamps, not merely match a date-shaped string.

The exported skill provides `node <skill-directory>/scripts/quiz-tools.mjs validate <package path>`. From a viewer source checkout, `npm run validate-package -- <package path>` remains available after installing npm dependencies. Exit code 0 means structural, semantic, and review-record consistency checks passed; 1 reports an invalid/unreadable package; 2 indicates invalid usage. Validation does not inspect the referenced repository or perform a new independent review.

`quiz-tools.mjs digest <payload.json>` prints the canonical payload SHA-256. Supply the payload object alone, excluding the envelope and verification record. `quiz-tools.mjs verify-sources <package path> <checkout>` first validates the package, then compares all excerpts and source links with committed blobs and checks reachability from a matching branch known to that checkout. For a change set it also checks the recorded range as described above. Working-tree edits are ignored. Branch lookup accepts bare names, remote-qualified names such as `origin/main`, and full `refs/heads/` or `refs/remotes/` names. Exact branch refs take precedence; a bare name falls back to a matching remote-tracking branch only when there is no exact ref. Ambiguous names require an explicit ref. A matching local/remote-tracking branch does not establish that the remote is currently accessible.

`quiz-tools.mjs resolve-range <checkout> <head> (--base <commit> | --compare <branch>) [--focus <path>]...` resolves a change-set range and prints its SHAs, `selection` record, and changed files as JSON. It fails for a non-ancestor base, multiple or missing merge bases, an empty range, or focus paths without changes.
