# claude-stacked-prs

Claude Code hooks, commands, and a lightweight stack manager that nudge Claude toward small, focused stacked PRs.

## What's in here

- **`git stack`** (`bin/git-stack`) — lightweight stacked-PR manager built on `gh` + `git`. Creates branches, tracks parent relationships, pushes + opens PRs, and merges stacks bottom-up. No third-party services or extra auth. Source lives at [`zcaceres/git-stack`](https://github.com/zcaceres/git-stack); `bin/git-stack` is a fetched release binary (see [Updating git-stack](#updating-git-stack)).
- **PostToolUse hook** (`src/pr-size-nudge.ts`) — nudges Claude toward `/checkpoint` when the uncommitted diff in the current repo grows past a threshold.
- **`/checkpoint` slash command** (`commands/checkpoint.md`) — ships the current slice as a stacked PR and leaves you on a fresh child branch ready to keep working. Uses `git stack` when available, otherwise falls back to `gh` CLI + `git`.
- **`/commit-push-pr` slash command** (`commands/commit-push-pr.md`) — commit, push, and open a PR. Stack-aware: uses `git stack submit` on stacked branches, otherwise falls back to `gh pr create` (preserves base branch).
- **Stacked-PR norm** (`claude-md/stacked-prs.md`) — section installed into `~/.claude/CLAUDE.md` codifying the default behavior.
- **Installer** (`install.ts`) — wires everything into `~/.claude/` via symlinks + a settings.json patch. Idempotent. `--uninstall` reverses it.

## Why this exists

Agent PRs are too big.

With "accept all" and "auto mode," a single task touches dozens of files and edits hundreds or thousands of lines.

This hook nags Claude to commit once it has finished a logical unit of work. (I call the pattern an *AI behavioral nudge*.)

Any time it changes a file, the hook reads the diff and says *"Hey Claude, you've edited X lines in Y files — sure it's not time for a commit?"* Left open-ended, Claude proposes a slice back to me: "I think we can ship {some change} as one unit."

When approved, `/checkpoint` calls `git stack` to land it as a focused, stacked PR.

## Install

```bash
cd ~/claude-stacked-prs
bun install
bun run install.ts
```

The installer:

1. Verifies `bun`, `git`, `gh` are on PATH.
2. Symlinks `commands/*.md` into `~/.claude/commands/`.
3. Installs `git stack` to `~/.local/bin/git-stack` (symlink).
4. Adds a PostToolUse hook entry to `~/.claude/settings.json`. Idempotent.
5. Either symlinks an empty `~/.claude/CLAUDE.md` to `claude-md/stacked-prs.md`, or appends the content between fence markers if `CLAUDE.md` already has content.
6. Creates `~/.claude/state/` for the hook's dedup state.

Existing files are backed up as `.bak.<timestamp>` before being overwritten.

### Updating git-stack

`bin/git-stack` is fetched from the [`zcaceres/git-stack`](https://github.com/zcaceres/git-stack) release artifacts. To pull the latest:

```bash
bun run update:git-stack
```

## `git stack` commands

```bash
git stack create [<name>] [-m "message"]    # Create a stacked branch
git stack log                               # Visualize the current stack with PR status
git stack submit                            # Push all branches + create/update PRs
git stack merge [--all] [--rebase|--squash] [--dry-run]  # Merge PRs bottom-up
git stack sync [--no-push]                  # Rebase stack onto updated trunk
```

Parent relationships are stored in `git config branch.<name>.stack-parent`. No external services, no auth beyond `gh auth login`.

### Merging a stack

`git stack merge` merges the bottom-most open PR. Add `--all` to merge the entire stack bottom-up. Each child PR is explicitly retargeted to `main` before the next merge — no reliance on GitHub's async retarget behavior.

Three strategies are supported:

| Strategy | Flag | Best for |
|----------|------|----------|
| Merge commit | `--merge` (default) | Stacks — preserves SHAs, no child rebasing needed |
| Rebase | `--rebase` | Linear history — rewrites SHAs, children rebased automatically |
| Squash | `--squash` | Single-commit PRs — same tradeoffs as rebase |

**Important:** Never use `gh pr merge --delete-branch` with stacked PRs. GitHub's auto-retarget is a repo setting, not guaranteed. Deleting a base branch can auto-close child PRs irrecoverably.

### Fallback: plain `gh` + `git`

If `git stack` isn't installed, `/checkpoint` and `/commit-push-pr` fall back to `gh` + `git` directly. This requires only `gh auth login`. Merging is manual — see `claude-md/stacked-prs.md` for the full guide.

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
3. You type `/checkpoint <slice description>`. Claude reviews the diff, stages files, and ships the slice:
   - **With `git stack`:** `git stack create -m "..."` + `git stack submit` (pushes + opens the PR with the correct base branch).
   - **Without `git stack`:** `git checkout -b <branch>` + `git push` + `gh pr create --base <parent-branch>`.
4. You're now on the fresh child branch. Keep working. Next checkpoint stacks again.
5. If trunk has advanced while you worked, `git stack sync` rebases the entire stack onto the updated trunk.
6. When you're ready to merge: `git stack merge --all` merges the entire stack bottom-up, retargeting each child PR automatically.

## Uninstall

```bash
bun run install.ts --uninstall
```

Removes symlinks, restores `~/.claude/settings.json` and `~/.claude/CLAUDE.md` from the most recent backup, leaves `~/claude-stacked-prs/` in place so you can reinstall later.

## Project layout

```
~/claude-stacked-prs/
├── bin/
│   └── git-stack                    # git stack CLI (fetched release binary)
├── src/
│   └── pr-size-nudge.ts             # PostToolUse hook
├── commands/
│   ├── checkpoint.md                # /checkpoint slash command
│   └── commit-push-pr.md           # /commit-push-pr slash command
├── claude-md/
│   └── stacked-prs.md              # CLAUDE.md "Stacked PRs" norm
├── install.ts                       # installer
├── package.json
├── tsconfig.json
└── README.md
```
