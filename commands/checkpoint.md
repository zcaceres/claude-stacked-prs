# Checkpoint — Ship Current Slice as a Stacked PR

Commit the current uncommitted work as the next branch in a Graphite stack, push it, and open a PR against the parent branch. Leave the user on the new child branch, ready to keep working.

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

### 3. Verify Graphite Setup

Both must hold:

```bash
which gt
test -f "$(git rev-parse --show-toplevel)/.graphite_repo_config"
```

If either check fails, **stop** and tell the user:

> Graphite isn't set up in this repo. Run `gt repo init` here (interactive — pick the trunk branch). Then re-run `/checkpoint`. Falling back to `/commit-push-pr` for now.

Then invoke `/commit-push-pr` and exit. **Never** auto-run `gt repo init` — it's interactive.

### 4. Pre-flight: Check for Remote Drift

```bash
git fetch
```

If anyone else may have pushed to the current branch, resolve first. `gt stack submit` force-pushes the stack; you don't want to clobber another commit.

### 5. Stage Only Your Changes

Stage explicitly — never `git add .` / `git add -A`:

```bash
git add <file1> <file2> ...
```

### 6. Create the Stacked Branch + Commit

```bash
gt branch create -am "<commit message>"
```

`gt` slugifies the message into the branch name automatically. Pass `--name <slug>` only if `$ARGUMENTS` gave you a name hint that's different from the commit message.

If `$ARGUMENTS` is empty, generate a concise conventional-commit-style message from the diff (e.g. `feat: add user repository`, `fix: handle null token in middleware`).

### 7. Submit the Stack

```bash
gt stack submit
```

This pushes (force-with-lease internally) and creates/updates one GitHub PR per branch in the stack, with the correct base branches.

### 8. Report

Report:
- The new PR URL (parse from `gt stack submit` output, or `gh pr view --json url --jq .url`).
- The new branch name (`git branch --show-current`).
- A reminder: "You're on the child branch now. Keep working — the next `/checkpoint` will stack on top."

## Important

- NEVER commit files you didn't modify in this conversation.
- NEVER use `git add .` or stage unrelated changes.
- NEVER auto-run `gt repo init` or `gt auth` — both are interactive and must come from the user.
- If `gt stack submit` fails because the branch isn't tracked, run `gt branch track` then retry once before falling back to `/commit-push-pr`.
- Report the PR URL when done.
