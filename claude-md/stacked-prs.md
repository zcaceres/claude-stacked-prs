## Stacked PRs

### How Graphite Works

Graphite models branches as a **dependency chain**, not independent branches off main. Each branch knows its *parent branch*:

```
main → feature-a → feature-b → feature-c
```

Each PR targets the branch below it, not main. Graphite tracks this stack metadata locally.

**Key commands:**
- `gt branch create` — create a new branch on top of the current one, recording the parent relationship
- `gt modify` — amend the current branch; Graphite knows to rebase everything above it
- `gt restack` — after changing a mid-stack branch, rebase all descendant branches so they stay coherent
- `gt stack submit` — push the entire stack and create/update PRs on GitHub, each targeting its parent branch (not main)
- `gt sync` — pull latest from trunk and clean up merged branches

**Merge cascading:** When the bottom PR merges into main, Graphite automatically retargets the next PR to main and rebases it. This cascades up the stack — no manual re-pointing needed.

**Important:** `gt stack submit` force-pushes (with lease) internally. If someone else pushed to a stacked branch outside Graphite, fetch and reconcile first.

### Norms

- Default to small, focused PRs stacked on each other rather than one large PR.
- When starting non-trivial work, propose the stack upfront: list the 2–5 slices you plan to ship and confirm before implementing.
- At each logical seam, run `/checkpoint` to ship the current slice as a stacked PR and continue on a fresh child branch.
- The PostToolUse hook will nudge when an uncommitted diff grows past ~300 lines / 8 files — treat that as a prompt to reflect, not a hard rule.
- Use Graphite (`gt`) for stack management: `gt branch create` to add a layer, `gt stack submit` to push and open PRs, `gt sync` + `gt restack` to cascade rebases when a lower PR merges. Standard GitHub PRs are the review surface — reviewers need nothing installed.
- When asking a teammate to review a stack, link the top PR and say "stacked — review bottom-up."
