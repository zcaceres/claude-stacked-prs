# Checkpoint — Ship Current Slice as a Stacked PR

Commit the current uncommitted work as the next branch in a stack, push it, and open a PR against the parent branch. Leave the user on the new child branch, ready to keep working.

Uses Graphite (`gt`) when available, otherwise falls back to `gh` CLI + `git`.

**Usage:** `/checkpoint [slice description]`

**Slice description:** $ARGUMENTS — used as both the commit message and the source for the auto-derived branch name. If empty, infer from the diff.

## Workflow

### 1. Identify Your Changes

Review this conversation to identify which files YOU modified using Write or Edit tools. Do NOT include:
- Files that were already modified before this conversation
- Changes made by other processes or previous sessions

List the files you changed and confirm with the user before proceeding.

### 2. Review the Diff

```bash
git status
git diff --stat HEAD
```

Show the user the stat. Do **NOT** adjudicate coherence yourself. Only pause to ask the user about slicing if the diff touches **more than 6 distinct top-level directories** — that's a cheap signal that multiple concerns are mixed.

### 3. Detect Stack Tooling

```bash
which gt 2>/dev/null && test -f "$(git rev-parse --show-toplevel)/.graphite_repo_config" 2>/dev/null
```

If both succeed → **Graphite path** (step 4A).
Otherwise → **`gh` fallback path** (step 4B).

### 4. Pre-flight: Check for Remote Drift

```bash
git fetch
```

If anyone else may have pushed to the current branch, resolve first.

### 5. Stage Only Your Changes

Stage explicitly — never `git add .` / `git add -A`:

```bash
git add <file1> <file2> ...
```

### 6A. Graphite Path — Create Branch + Submit

```bash
gt branch create -am "<commit message>"
```

`gt` slugifies the message into the branch name automatically. Pass `--name <slug>` only if `$ARGUMENTS` gave you a name hint that's different from the commit message.

If `$ARGUMENTS` is empty, generate a concise conventional-commit-style message from the diff (e.g. `feat: add user repository`, `fix: handle null token in middleware`).

Then submit the stack:

```bash
gt stack submit
```

This pushes (force-with-lease internally) and creates/updates one GitHub PR per branch in the stack, with the correct base branches.

### 6B. `gh` Fallback Path — Create Branch + PR

Record the current branch as the parent:

```bash
PARENT_BRANCH=$(git branch --show-current)
```

Generate a branch name from the commit message or `$ARGUMENTS` (slugified, e.g. `feat/add-user-repository`). Create and switch to the new branch:

```bash
git checkout -b <new-branch-name>
```

Commit:

```bash
git commit -m "$(cat <<'EOF'
<commit message>
EOF
)"
```

Push and create a PR targeting the parent branch (not main):

```bash
git push -u origin HEAD
gh pr create --base "$PARENT_BRANCH" --title "<title>" --body "$(cat <<'EOF'
## Summary

- <bullet points>

## Test plan

- <how to verify>

---
Stack: this PR targets `<PARENT_BRANCH>`, not `main`. Merge bottom-up.
EOF
)"
```

### 7. Report

Report:
- The new PR URL (parse from `gt stack submit` output, or `gh pr view --json url --jq .url`).
- The new branch name (`git branch --show-current`).
- A reminder: "You're on the child branch now. Keep working — the next `/checkpoint` will stack on top."

## Important

- NEVER commit files you didn't modify in this conversation.
- NEVER use `git add .` or stage unrelated changes.
- NEVER auto-run `gt repo init` or `gt auth` — both are interactive and must come from the user.
- **Graphite path:** If `gt stack submit` fails because the branch isn't tracked, run `gt branch track` then retry once before falling back to the `gh` path.
- **`gh` path:** Always set `--base` to the parent branch, not `main`, to preserve the stack chain.
- Report the PR URL when done.

## Merging a Stack (gh path)

**Never squash-merge stacked PRs.** Squash-merging rewrites commit SHAs — child branches still reference the original commits, so Git treats them as unmerged. This causes child PRs to be auto-closed or stranded with stale bases.

**Correct approach — regular merge, bottom-up:**

```bash
# Merge base PR (no --squash)
gh pr merge <base-pr> --merge --delete-branch

# Wait for GitHub to retarget the next PR
# Verify before proceeding:
gh pr view <next-pr> --json baseRefName --jq .baseRefName
# Should show "main" (or the new base). If not, retarget manually:
gh pr edit <next-pr> --base main

# Then merge the next PR
gh pr merge <next-pr> --merge --delete-branch
# Repeat up the stack
```

**Key rules:**
- Use `--merge`, not `--squash`, so child branches recognize their parent commits as merged.
- Verify each child's base has retargeted before merging the next — GitHub retargeting is async.
- Never tight-loop merges with `sleep` — poll `baseRefName` to confirm.
