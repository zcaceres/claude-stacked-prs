## Stacked PRs

### How It Works

Stacked PRs model branches as a **dependency chain**. Each branch knows its *parent branch*:

```
main ← feature-a ← feature-b ← feature-c
```

Each PR targets the branch below it, not main.

### `git stack` (primary)

Lightweight stack management using `git` + `gh`. No third-party services or extra auth.

**Key commands:**
- `git stack create <name> [-m "message"]` — create a new branch on top of the current one, recording the parent relationship in git config
- `git stack log` — visualize the current stack with PR status
- `git stack submit` — push all branches in the stack and create/update PRs on GitHub, each targeting its parent branch
- `git stack merge [--all] [--rebase|--squash] [--dry-run]` — merge PRs bottom-up, handling retarget verification automatically
- `git stack sync [--no-push]` — fetch trunk and rebase the entire stack onto the updated tip; use `--no-push` to rebase locally without force-pushing

**How it works:** Parent relationships are stored in `git config branch.<name>.stack-parent`. The `gh-merge-base` config key is also set so `gh pr create` auto-picks the correct base.

**Important:** `git stack submit` uses `--force-with-lease` when pushing. If someone else pushed to a stacked branch, fetch and reconcile first.

### Plain `gh` + `git` (fallback)

When `git stack` isn't installed, use `gh` CLI + `git` directly.

**Creating a stacked branch:**
```bash
git checkout -b feature/layer-2 feature/layer-1   # branch off parent, not main
git push -u origin feature/layer-2
gh pr create --base feature/layer-1 --title "Layer 2: ..."
```

**Merging a stack (bottom-up, one at a time):**

Three merge strategies exist. Each has different implications for stacked PRs:

| Strategy | Flag | SHAs preserved? | Child branches break? | Rebase needed? |
|----------|------|------------------|-----------------------|----------------|
| Merge commit | `--merge` | Yes | No | No |
| Rebase merge | `--rebase` | No (rewritten) | Yes | Yes |
| Squash merge | `--squash` | No (single new) | Yes | Yes |

#### Option A: Merge commit (simplest, recommended for stacks)

```bash
# For each PR, bottom to top:
gh pr merge <PR> --merge

# Retarget child PR to main (don't rely on GitHub auto-retarget — it's a repo setting):
gh pr edit <NEXT-PR> --base main

# Verify retarget:
gh pr view <NEXT-PR> --json baseRefName -q '.baseRefName'
# Must print "main" before continuing.

# Repeat for next PR
```

**Do NOT use `--delete-branch`** — GitHub's auto-retarget is a repo setting, not default. Deleting the base branch can auto-close child PRs irrecoverably.

Child branches recognize parent commits as already merged — no rebasing needed.

#### Option B: Rebase merge (preserves individual commits, linear history)

**Do NOT use `--delete-branch`.** Deleting the base branch auto-closes child PRs, and GitHub won't let you reopen a PR whose base branch no longer exists.

For each PR, bottom to top:

```bash
# 1. Retarget to main
gh pr edit <PR> --base main

# 2. Rebase ONLY this PR's unique commit(s) onto main.
#    <parent-commit> = the tip of the branch below this one (before rebase).
#    This drops already-merged ancestor commits with old SHAs.
git fetch origin main
git rebase --onto origin/main <parent-commit> origin/<branch>

# 3. Force-push the rebased branch
git push --force-with-lease origin HEAD:refs/heads/<branch>

# 4. Merge (no --delete-branch!)
gh pr merge <PR> --rebase

# 5. Fetch updated main, repeat for next PR
git fetch origin main
```

**Finding `<parent-commit>`:** Each stacked branch has N ancestor commits + 1 unique commit. The parent commit is `origin/<branch>~1` when the PR has a single commit (the common case with `/checkpoint`). For multi-commit PRs, it's the last commit that belongs to the parent PR.

**Tip:** Before starting, map the stack: for each branch, record its tip SHA and its parent SHA. These are the original SHAs before any rebasing — use them throughout.

#### Option C: Squash merge

Same workflow as rebase merge (Option B) — squash also rewrites SHAs. The same `--delete-branch` warning and rebase-onto-main requirements apply.

#### Recovery: child PR auto-closed by deleted base branch

If `--delete-branch` was used and a child PR got closed:
```bash
# Recreate the deleted base branch pointing at current main
git push origin origin/main:refs/heads/<deleted-base-branch>
# Reopen the child PR
gh pr reopen <PR>
# Retarget to main
gh pr edit <PR> --base main
# Delete the temporary branch
git push origin --delete <deleted-base-branch>
# Then rebase the child branch onto main and force-push (Option B step 2-3)
```

**Useful verification commands:**
```bash
# Check a PR's current base branch
gh pr view <NUMBER> --json baseRefName -q '.baseRefName'

# List your open PRs with their bases
gh pr list --author @me --json number,title,baseRefName,state \
  -q '.[] | "\(.number) \(.baseRefName) \(.state) \(.title)"'

# Map a stack — shows each branch's tip and parent commit
for branch in <branch1> <branch2> ...; do
  echo "$branch: $(git log --oneline -1 origin/$branch) parent:$(git rev-parse --short origin/$branch~1)"
done
```

### Norms

- Default to small, focused PRs stacked on each other rather than one large PR.
- When starting non-trivial work, propose the stack upfront: list the 2–5 slices you plan to ship and confirm before implementing.
- At each logical seam, run `/checkpoint` to ship the current slice as a stacked PR and continue on a fresh child branch.
- The PostToolUse hook will nudge when an uncommitted diff grows past ~300 lines / 8 files — treat that as a prompt to reflect, not a hard rule.
- Use `git stack` when available. Otherwise use `gh` CLI + `git` for stack management. Standard GitHub PRs are the review surface — reviewers need nothing installed.
- When merging a stack, merge bottom-up and verify each child PR's base retargeted before merging the next.
- Keep stacks shallow — 3–4 PRs max before rebase cascades get painful.
- When asking a teammate to review a stack, link the top PR and say "stacked — review bottom-up."
