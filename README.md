# claude-stacked-prs — archived

> [!IMPORTANT]
> **Moved to the skills collection:** [`zcaceres/skills`](https://github.com/zcaceres/skills)
>
> New home: [`skills/stacked-pr`](https://github.com/zcaceres/skills/tree/main/skills/stacked-pr)

> **This repo is archived.** The hooks, slash commands, and stacked-PR
> workflow have moved into [`zcaceres/skills`](https://github.com/zcaceres/skills)
> as a single bundled skill.

## New home

| Old artifact | New location |
|---|---|
| `/checkpoint` slash command | `/stacked-pr checkpoint` subcommand — [`zcaceres/skills/skills/stacked-pr`](https://github.com/zcaceres/skills/tree/main/skills/stacked-pr) |
| `/commit-push-pr` slash command | `/stacked-pr update` subcommand — same skill |
| `src/pr-size-nudge.ts` PostToolUse hook | Bundled into the same `stacked-pr` skill (`scripts/run.sh`); install via `scripts/install.sh` |
| `claude-md/stacked-prs.md` norm | Same content lives in the user's `~/.claude/CLAUDE.md` (or copy from the `stacked-pr` skill README) |
| `bin/git-stack` (fetched release binary) | Still upstream at [`zcaceres/git-stack`](https://github.com/zcaceres/git-stack) — fetched directly, no longer mirrored here |

## Why the move

One skill is easier to install, version, and update than three sibling
slash commands plus a hook plus a CLAUDE.md fragment. The bundled
`stacked-pr` skill exposes the whole workflow under one entry point:

```
/stacked-pr checkpoint [slice description]   # ship the next slice
/stacked-pr update [base]                    # commit + push + update PR
/stacked-pr submit                           # push the whole stack
/stacked-pr log                              # visualize
/stacked-pr sync [--no-push]                 # rebase onto trunk
/stacked-pr merge [--merge|--rebase|--squash] [--all] [--dry-run]
```

## Install (new path)

```sh
npx skills add zcaceres/skills -s stacked-pr -g
~/.claude/skills/stacked-pr/scripts/install.sh
```

The second step wires the PostToolUse nudge into
`~/.claude/settings.json`. See the
[skill README](https://github.com/zcaceres/skills/tree/main/skills/stacked-pr)
for full docs.

## Migrating from this repo

If you previously installed via `bun run install.ts` here:

1. Run `bun run install.ts --uninstall` from this directory to remove the
   old symlinks and restore your `~/.claude/settings.json` /
   `~/.claude/CLAUDE.md` backups.
2. Follow the install steps above.

The new install is a strict superset — no functionality was dropped.
