## Stacked PRs

- Default to small, focused PRs stacked on each other rather than one large PR.
- When starting non-trivial work, propose the stack upfront: list the 2–5 slices you plan to ship and confirm before implementing.
- At each logical seam, run `/checkpoint` to ship the current slice as a stacked PR and continue on a fresh child branch.
- The PostToolUse hook will nudge when an uncommitted diff grows past ~300 lines / 8 files — treat that as a prompt to reflect, not a hard rule.
- Use Graphite (`gt`) for stack management: `gt branch create` to add a layer, `gt stack submit` to push and open PRs, `gt sync` + `gt restack` to cascade rebases when a lower PR merges. Standard GitHub PRs are the review surface — reviewers need nothing installed.
- When asking a teammate to review a stack, link the top PR and say "stacked — review bottom-up."
