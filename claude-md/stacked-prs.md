## Stacked PRs

### How It Works

Stacked PRs model branches as a **dependency chain**. Each branch knows its *parent branch*:

```
main ← feature-a ← feature-b ← feature-c
```

Each PR targets the branch below it, not main.

### Graphite (preferred when available)

**Key commands:**
- `gt branch create` — create a new branch on top of the current one, recording the parent relationship
- `gt modify` — amend the current branch; Graphite knows to rebase everything above it
- `gt restack` — after changing a mid-stack branch, rebase all descendant branches so they stay coherent
- `gt stack submit` — push the entire stack and create/update PRs on GitHub, each targeting its parent branch (not main)
- `gt sync` — pull latest from trunk and clean up merged branches

**Merge cascading:** When the bottom PR merges into main, Graphite automatically retargets the next PR to main and rebases it. This cascades up the stack — no manual re-pointing needed.

**Important:** `gt stack submit` force-pushes (with lease) internally. If someone else pushed to a stacked branch outside Graphite, fetch and reconcile first.

### Plain `gh` + `git` (fallback)

When Graphite isn't installed or initialized, use `gh` CLI + `git` directly.

**Creating a stacked branch:**
```bash
git checkout -b feature/layer-2 feature/layer-1   # branch off parent, not main
git push -u origin feature/layer-2
gh pr create --base feature/layer-1 --title "Layer 2: ..."
```

**Merging a stack (bottom-up, one at a time):**

Merge each PR from the bottom of the stack upward. After each merge:

```bash
# 1. Merge the bottom PR
gh pr merge <PR-NUMBER> --squash --delete-branch

# 2. Retarget the next PR to main
gh pr edit <NEXT-PR-NUMBER> --base main

# 3. Verify retarget completed (GitHub does this async)
gh pr view <NEXT-PR-NUMBER> --json baseRefName -q '.baseRefName'
#    must print "main" before continuing

# 4. Rebase onto updated main and force-push
git fetch origin
git checkout feature/layer-2
git rebase origin/main
git push --force-with-lease

# 5. Wait for CI, then repeat from step 1 for the next PR
```

**Critical: do not tight-loop merges.** GitHub's branch retarget after `--delete-branch` is async. Always verify the child PR's base with `gh pr view` before merging the next one.

**Squash-merge changes commit hashes.** Downstream branches still reference old commits — you must rebase each layer onto the new `main` tip or you get phantom conflicts.

**Useful verification commands:**
```bash
# Check a PR's current base branch
gh pr view <NUMBER> --json baseRefName -q '.baseRefName'

# List your open PRs with their bases
gh pr list --author @me --json number,title,baseRefName,state \
  -q '.[] | "\(.number) \(.baseRefName) \(.state) \(.title)"'
```

### Norms

- Default to small, focused PRs stacked on each other rather than one large PR.
- When starting non-trivial work, propose the stack upfront: list the 2–5 slices you plan to ship and confirm before implementing.
- At each logical seam, run `/checkpoint` to ship the current slice as a stacked PR and continue on a fresh child branch.
- The PostToolUse hook will nudge when an uncommitted diff grows past ~300 lines / 8 files — treat that as a prompt to reflect, not a hard rule.
- Use Graphite (`gt`) when available. Otherwise use `gh` CLI + `git` for stack management. Standard GitHub PRs are the review surface — reviewers need nothing installed.
- When merging a stack without Graphite, merge bottom-up and verify each child PR's base retargeted before merging the next.
- Keep stacks shallow — 3–4 PRs max before rebase cascades get painful.
- When asking a teammate to review a stack, link the top PR and say "stacked — review bottom-up."
