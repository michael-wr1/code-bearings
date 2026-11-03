# Use the prepared downloads

Each candidate includes a viewer ZIP, a skill ZIP, the separate public
`code-bearings.quiz.json` example, `manifest.json`, and `SHA256SUMS`.
Archive names contain the package version and source commit. The manifest records
the full commit and build runtime. These files are release candidates until a
maintainer publishes a tagged release; a CI artifact is not a published release.

To check downloaded files together on macOS, run `shasum -a 256 -c SHA256SUMS`.
On Linux, use `sha256sum -c SHA256SUMS`.

## Viewer

Extract the viewer ZIP. It contains a `code-bearings-viewer` folder with the
prebuilt application, this guide, and license notices. No npm installation or
source checkout is needed. Serving it locally requires Python 3:

```bash
cd code-bearings-viewer
python3 -m http.server 4173 --bind 127.0.0.1
```

Open **http://127.0.0.1:4173**. Choose **Open quiz package**, select the separately
downloaded `code-bearings.quiz.json`, and start the quiz. You can also import a
private quiz prepared for your repository. Stop the server with Ctrl+C.

Serve the viewer through HTTP; opening `index.html` directly with `file://` is
not supported. Keep quiz packages outside the served viewer directory. The
viewer reads user-selected files; importing a package does not copy it into the
server directory. Answers and progress are lost on refresh or when the window
closes. Once loaded, quiz play works offline; optional source links need network
access.

## Preparation skill

Requires Node.js 22.12 or newer, Git, and a coding agent with independent subagent
support. Extract the skill ZIP; it contains `code-bearings-quiz`. From the folder
where you extracted it, install the whole folder for your chosen agent.

For a first Codex installation:

```bash
mkdir -p ~/.agents/skills
cp -R code-bearings-quiz ~/.agents/skills/
```

For a first Claude Code installation:

```bash
mkdir -p ~/.claude/skills
cp -R code-bearings-quiz ~/.claude/skills/
```

When updating, back up and replace the existing skill folder rather than nesting
one copy inside another. The skill's tools need no npm installation or viewer
checkout. Retain the included license and third-party notices.

Start a fresh agent session in the repository you want to learn. Invoke
`$code-bearings-quiz` in Codex or `/code-bearings-quiz` in Claude Code and ask:

```text
Prepare a repository overview for newcomers using this branch's committed tip.
Target 25 minutes including discussion. Save it to ~/quizzes/.
```

To learn a committed change, request a change-set quiz and name the branch or
commit range. Open the resulting `.quiz.json` in the viewer; the adjacent
`.review/` folder contains preparation and verification records. Keep private
repository packages and review records private.

## Build and verify downloads as a maintainer

From a clean committed source checkout with npm dependencies installed, Node.js
22.12 or newer, Python 3, and the matching Playwright Chromium available:

```bash
npm run build:release
npm run test:release
```

The first command rebuilds the viewer and skill and writes only the selected
distribution files to ignored `.release/`. It refuses a dirty or untracked source
tree. The second verifies checksums and archive contents, extracts into a fresh
temporary directory, validates the example with the installed skill, compares
its committed sources, and plays it in the extracted viewer through a loopback
Python server. It requires the example's recorded Git revision locally (CI
checks out full history).

The GitHub workflow runs on pushes and manual dispatch with read-only repository
permissions. It tests Node 22.12.0 and Node 24, installs without a restored npm
cache, and uploads the tested Node 24 downloads as a 30-day Actions artifact.
This does not publish a tag or release. Release only the exact candidate that
passed these checks; changing its source requires a new build and verification.
