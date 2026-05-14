# claude-stacked-prs

Claude Code customizations that make small stacked PRs the path of least resistance.

## What's in here

- **PostToolUse hook** (`src/pr-size-nudge.ts`) — nudges Claude toward `/checkpoint` when the uncommitted diff in the current repo grows past a threshold.
- **`/checkpoint` slash command** (`commands/checkpoint.md`) — ships the current slice as a stacked PR using Graphite (`gt`) and leaves you on a fresh child branch ready to keep working.
- **`/commit-push-pr` slash command** (`commands/commit-push-pr.md`) — Graphite-aware version of the existing command; falls back to plain `git push` + `gh pr create` in non-Graphite repos.
- **Stacked-PR norm** (`claude-md/stacked-prs.md`) — short section installed into `~/.claude/CLAUDE.md` codifying the default behavior.
- **Installer** (`install.ts`) — wires everything into `~/.claude/` via symlinks + a settings.json patch. Idempotent. `--uninstall` reverses it.

## Why this exists

I'm a Neanderthal who still wants to read the code I merge. But agent PRs are too big — they drive me crazy.

With "accept all" and "auto mode," a single task touches dozens of files and edits hundreds or thousands of lines. It'll only get faster and more autonomous from here.

I've found a way to help: a hook that nags Claude to commit once it has finished a logical unit of work. (I call the pattern an *AI behavioral nudge*.)

Any time it changes a file, the hook reads the diff and says *"Hey Claude, you've edited X lines in Y files — sure it's not time for a commit?"* Left open-ended, Claude proposes a slice back to me: "I think we can ship {some change} as one unit."

When I approve, a skill calls [Graphite](https://graphite.dev) to land it as a focused, stacked PR.

## Install

```bash
cd ~/claude-stacked-prs
bun install
bun run install.ts
```

The installer:

1. Verifies `bun`, `git`, `gh` are on PATH.
2. Symlinks `commands/*.md` into `~/.claude/commands/` (backing up any existing files as `.bak.<timestamp>`).
3. Adds a PostToolUse hook entry to `~/.claude/settings.json` (backed up first). Idempotent.
4. Either symlinks an empty `~/.claude/CLAUDE.md` to `claude-md/stacked-prs.md`, or appends the content between fence markers if `CLAUDE.md` already has content.
5. Creates `~/.claude/state/` for the hook's dedup state.
6. Prints next steps for Graphite setup.

## Graphite setup (after install)

```bash
# Once per machine
brew install withgraphite/tap/graphite
gt auth                                # opens browser

# Once per repo where you want stacking
cd /path/to/your/repo
gt repo init
```

`gt auth` and `gt repo init` are both interactive and must be run by you (not the agent).

## Hook configuration (env vars)

| Var | Default | What it does |
|---|---|---|
| `PR_NUDGE_LINES` | `300` | Lines (insertions + deletions) before the nudge fires |
| `PR_NUDGE_FILES` | `8` | Changed file count before the nudge fires |
| `PR_NUDGE_SKIP_ROOTS` | (empty) | Colon-separated absolute repo-root paths to skip entirely. Exact match. |
| `PR_NUDGE_EXCLUDE` | (sane defaults — see below) | Colon-separated glob patterns to exclude from the diff count |

Default `PR_NUDGE_EXCLUDE` patterns (lockfiles + generated artifacts):

```
bun.lock:package-lock.json:pnpm-lock.yaml:yarn.lock:Cargo.lock:go.sum:Gemfile.lock:*.snap:dist/**:build/**:*.min.js:*.min.css
```

## How the workflow runs

1. You're working in some repo. The hook is silent until the uncommitted diff grows past the thresholds.
2. Past the threshold, on the next Edit/Write, Claude sees a system-reminder: "Uncommitted diff is X lines across Y files — consider `/checkpoint`."
3. You type `/checkpoint <slice description>`. Claude reviews the diff, stages files, runs `gt branch create -am "..."` (commits onto a new stacked branch) and `gt stack submit` (pushes + opens the PR with the right base branch).
4. You're now on the fresh child branch. Keep working. Next checkpoint stacks again.
5. When the bottom PR merges, `gt sync` + `gt restack` reparents the rest of the stack automatically.

## Uninstall

```bash
bun run install.ts --uninstall
```

Removes symlinks, restores `~/.claude/settings.json` and `~/.claude/CLAUDE.md` from the most recent backup, leaves `~/claude-stacked-prs/` in place so you can reinstall later.

## Project layout

```
~/claude-stacked-prs/
├── src/
│   └── pr-size-nudge.ts            # PostToolUse hook
├── commands/
│   ├── checkpoint.md               # /checkpoint slash command
│   └── commit-push-pr.md           # gt-aware /commit-push-pr
├── claude-md/
│   └── stacked-prs.md              # CLAUDE.md "Stacked PRs" norm
├── install.ts                       # installer
├── package.json
├── tsconfig.json
└── README.md
```
