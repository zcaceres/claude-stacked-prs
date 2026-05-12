# Commit, Push, and PR

Commit only the changes made in this conversation, push them, and open a PR if one doesn't exist. Graphite-aware: stacks update through `gt stack submit` when the repo is `gt`-initialized.

**Usage:** `/commit-push-pr [base-branch]`

**Base branch:** $ARGUMENTS (default: `main`, fallback to `master`) — only used in the non-Graphite fallback path.

> If you have uncommitted work that represents the *next* slice in a stack (not the current branch's PR), use `/checkpoint` instead — it creates a new stacked branch rather than amending the current PR.

## Workflow

### 1. Identify Your Changes

Review this conversation to identify which files YOU modified using Write or Edit tools. Do NOT include:
- Files that were already modified before this conversation
- Changes made by other processes or previous sessions

List the files you changed and confirm with the user before proceeding.

### 2. Check Git State

```bash
git status
git log --oneline -5
```

Verify your identified files match what's shown in git status.

### 3. Stage Only Your Changes

Stage ONLY the files you modified in this conversation:
```bash
git add <file1> <file2> ...
```

Do NOT use `git add .` or `git add -A` — be explicit about each file.

### 4. Commit

Generate a concise commit message based on what you accomplished. Use HEREDOC format:
```bash
git commit -m "$(cat <<'EOF'
<type>: <summary>

<optional body if needed>
EOF
)"
```

### 5. Push and Open PR — Graphite-Aware

Decide which path to take:

```bash
test -f "$(git rev-parse --show-toplevel)/.graphite_repo_config" && which gt
```

**If both succeed → Graphite path:**

```bash
gt stack submit
```

This force-pushes the current branch (and any ancestors in the stack) and creates/updates a GitHub PR for each branch with the correct base. Idempotent.

**Otherwise → plain git + gh fallback:**

```bash
git push -u origin HEAD
```

If the branch doesn't have an upstream, this sets it.

Then check for an existing PR:
```bash
gh pr list --head $(git branch --show-current) --state open
```

If no PR exists, create one:
```bash
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary

- <bullet points of changes>

## Test plan

- <how to verify>
EOF
)"
```

If a PR already exists, just report its URL.

## Important

- NEVER commit files you didn't modify in this conversation
- NEVER use `git add .` or stage unrelated changes
- If unsure which files you changed, ASK the user
- Report the PR URL when done
- If `gt stack submit` fails because the branch isn't tracked by Graphite, run `gt branch track` then retry once before falling back to the plain-git path
