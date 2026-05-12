#!/usr/bin/env bun
/**
 * Installer for claude-stacked-prs.
 *
 * Wires the project into ~/.claude/ via symlinks + a settings.json patch +
 * a fenced section in CLAUDE.md. Idempotent. Pass --uninstall to reverse.
 */

import {
  lstat,
  mkdir,
  readFile,
  readlink,
  rename,
  rm,
  symlink,
  writeFile,
} from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { z } from "zod";

const HOME = homedir();
const PROJECT_DIR = import.meta.dir;

const CLAUDE_DIR = join(HOME, ".claude");
const COMMANDS_DIR = join(CLAUDE_DIR, "commands");
const STATE_DIR = join(CLAUDE_DIR, "state");
const SETTINGS_FILE = join(CLAUDE_DIR, "settings.json");
const CLAUDE_MD_FILE = join(CLAUDE_DIR, "CLAUDE.md");

const HOOK_SCRIPT = join(PROJECT_DIR, "src", "pr-size-nudge.ts");
const HOOK_CMD = `bun run ${HOOK_SCRIPT}`;
const HOOK_MATCHER = "Edit|Write|MultiEdit|NotebookEdit";

const CANONICAL_CLAUDE_MD = join(PROJECT_DIR, "claude-md", "stacked-prs.md");
const COMMAND_SOURCES: Array<{ from: string; to: string }> = [
  {
    from: join(PROJECT_DIR, "commands", "checkpoint.md"),
    to: join(COMMANDS_DIR, "checkpoint.md"),
  },
  {
    from: join(PROJECT_DIR, "commands", "commit-push-pr.md"),
    to: join(COMMANDS_DIR, "commit-push-pr.md"),
  },
];

const FENCE_START = "<!-- claude-stacked-prs:start -->";
const FENCE_END = "<!-- claude-stacked-prs:end -->";

const SettingsSchema = z
  .object({
    hooks: z.record(z.string(), z.array(z.unknown())).optional(),
  })
  .passthrough();

// === fs helpers ===

async function pathExists(p: string): Promise<boolean> {
  try {
    await lstat(p);
    return true;
  } catch {
    return false;
  }
}

async function isSymlink(p: string): Promise<boolean> {
  try {
    return (await lstat(p)).isSymbolicLink();
  } catch {
    return false;
  }
}

async function symlinkTargetIs(linkPath: string, target: string): Promise<boolean> {
  try {
    return (await readlink(linkPath)) === target;
  } catch {
    return false;
  }
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function backupFile(p: string): Promise<string> {
  const bak = `${p}.bak.${timestamp()}`;
  await rename(p, bak);
  return bak;
}

async function commandOnPath(cmd: string): Promise<boolean> {
  const proc = Bun.spawn(["which", cmd], { stdout: "ignore", stderr: "ignore" });
  return (await proc.exited) === 0;
}

// === install steps ===

async function checkPrereqs(): Promise<void> {
  for (const cmd of ["bun", "git", "gh"]) {
    if (!(await commandOnPath(cmd))) {
      throw new Error(`Missing prerequisite: '${cmd}' not on PATH`);
    }
  }
}

async function installSymlinks(): Promise<string[]> {
  await mkdir(COMMANDS_DIR, { recursive: true });
  const out: string[] = [];
  for (const { from, to } of COMMAND_SOURCES) {
    if (await isSymlink(to)) {
      if (await symlinkTargetIs(to, from)) {
        out.push(`  = ${to} already correct`);
        continue;
      }
      await rm(to);
      await symlink(from, to);
      out.push(`  ~ ${to} symlink retargeted`);
    } else if (await pathExists(to)) {
      const bak = await backupFile(to);
      await symlink(from, to);
      out.push(`  + ${to} symlinked (existing backed up to ${bak})`);
    } else {
      await symlink(from, to);
      out.push(`  + ${to} symlinked`);
    }
  }
  return out;
}

async function patchSettings(): Promise<string> {
  await mkdir(CLAUDE_DIR, { recursive: true });

  type Settings = z.infer<typeof SettingsSchema>;
  let parsed: Settings;
  let fileExisted = false;

  if (await pathExists(SETTINGS_FILE)) {
    fileExisted = true;
    const raw = await readFile(SETTINGS_FILE, "utf-8");
    parsed = SettingsSchema.parse(JSON.parse(raw));
  } else {
    parsed = {};
  }

  const settings = parsed as Settings & {
    hooks?: Record<string, unknown[]>;
  };
  settings.hooks = settings.hooks ?? {};
  const existingPost = (settings.hooks["PostToolUse"] ?? []) as Array<{
    matcher?: string;
    hooks?: Array<{ type?: string; command?: string }>;
  }>;
  settings.hooks["PostToolUse"] = existingPost;

  const alreadyPresent = existingPost.some(
    (entry) =>
      Array.isArray(entry.hooks) &&
      entry.hooks.some((h) => h?.command === HOOK_CMD),
  );
  if (alreadyPresent) {
    return `  = ${SETTINGS_FILE} hook entry already present`;
  }

  let bak = "";
  if (fileExisted) {
    bak = await backupFile(SETTINGS_FILE);
  }

  existingPost.push({
    matcher: HOOK_MATCHER,
    hooks: [{ type: "command", command: HOOK_CMD }],
  });

  await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n");
  return `  + ${SETTINGS_FILE} hook entry added${bak ? ` (backup: ${bak})` : ""}`;
}

async function wireClaudeMd(): Promise<string> {
  await mkdir(CLAUDE_DIR, { recursive: true });

  if (!(await pathExists(CLAUDE_MD_FILE))) {
    await symlink(CANONICAL_CLAUDE_MD, CLAUDE_MD_FILE);
    return `  + ${CLAUDE_MD_FILE} symlinked (was missing)`;
  }

  if (await isSymlink(CLAUDE_MD_FILE)) {
    if (await symlinkTargetIs(CLAUDE_MD_FILE, CANONICAL_CLAUDE_MD)) {
      return `  = ${CLAUDE_MD_FILE} already symlinked correctly`;
    }
    return `  - ${CLAUDE_MD_FILE} is a symlink to something else — leaving alone`;
  }

  const content = await readFile(CLAUDE_MD_FILE, "utf-8");
  if (!content.trim()) {
    await rm(CLAUDE_MD_FILE);
    await symlink(CANONICAL_CLAUDE_MD, CLAUDE_MD_FILE);
    return `  + ${CLAUDE_MD_FILE} symlinked (was empty regular file)`;
  }

  const newSection = (await readFile(CANONICAL_CLAUDE_MD, "utf-8")).trim();
  const fenced = `${FENCE_START}\n${newSection}\n${FENCE_END}`;
  const fenceRe = new RegExp(
    `${FENCE_START}[\\s\\S]*?${FENCE_END}`,
    "m",
  );

  const bak = await backupFile(CLAUDE_MD_FILE);

  let updated: string;
  let verb: string;
  if (fenceRe.test(content)) {
    updated = content.replace(fenceRe, fenced);
    verb = "updated";
  } else {
    const sep = content.endsWith("\n") ? "\n" : "\n\n";
    updated = content + sep + fenced + "\n";
    verb = "appended";
  }
  await writeFile(CLAUDE_MD_FILE, updated);
  return `  + ${CLAUDE_MD_FILE} fenced section ${verb} (backup: ${bak})`;
}

async function createStateDir(): Promise<string> {
  await mkdir(STATE_DIR, { recursive: true });
  return `  + ${STATE_DIR} present`;
}

// === uninstall steps ===

async function uninstallSymlinks(): Promise<string[]> {
  const out: string[] = [];
  for (const { from, to } of COMMAND_SOURCES) {
    if (!(await pathExists(to))) {
      out.push(`  - ${to} not present`);
      continue;
    }
    if (await isSymlink(to)) {
      if (await symlinkTargetIs(to, from)) {
        await rm(to);
        out.push(`  - removed ${to}`);
      } else {
        out.push(`  ~ ${to} symlinked elsewhere — leaving alone`);
      }
    } else {
      out.push(`  ~ ${to} is not a symlink — leaving alone (manual cleanup)`);
    }
  }
  return out;
}

async function uninstallSettings(): Promise<string> {
  if (!(await pathExists(SETTINGS_FILE))) return `  - ${SETTINGS_FILE} doesn't exist`;
  const raw = await readFile(SETTINGS_FILE, "utf-8");
  const settings = SettingsSchema.parse(JSON.parse(raw)) as {
    hooks?: Record<string, unknown[]>;
  };
  const post = (settings.hooks?.["PostToolUse"] ?? []) as Array<{
    hooks?: Array<{ command?: string }>;
  }>;
  if (post.length === 0) return `  - ${SETTINGS_FILE} has no PostToolUse hooks`;

  const filtered = post.filter(
    (entry) =>
      !Array.isArray(entry.hooks) ||
      !entry.hooks.some((h) => h?.command === HOOK_CMD),
  );
  if (filtered.length === post.length) {
    return `  - ${SETTINGS_FILE} has no entry for our hook`;
  }

  if (filtered.length === 0) {
    delete settings.hooks?.["PostToolUse"];
  } else if (settings.hooks) {
    settings.hooks["PostToolUse"] = filtered;
  }
  if (settings.hooks && Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  const bak = await backupFile(SETTINGS_FILE);
  await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n");
  return `  - removed hook entry from ${SETTINGS_FILE} (backup: ${bak})`;
}

async function uninstallClaudeMd(): Promise<string> {
  if (!(await pathExists(CLAUDE_MD_FILE))) return `  - ${CLAUDE_MD_FILE} doesn't exist`;

  if (await isSymlink(CLAUDE_MD_FILE)) {
    if (await symlinkTargetIs(CLAUDE_MD_FILE, CANONICAL_CLAUDE_MD)) {
      await rm(CLAUDE_MD_FILE);
      return `  - removed symlink ${CLAUDE_MD_FILE}`;
    }
    return `  ~ ${CLAUDE_MD_FILE} symlinked elsewhere — leaving alone`;
  }

  const content = await readFile(CLAUDE_MD_FILE, "utf-8");
  const fenceRe = new RegExp(`\\n*${FENCE_START}[\\s\\S]*?${FENCE_END}\\n*`, "m");
  if (!fenceRe.test(content)) {
    return `  - ${CLAUDE_MD_FILE} has no fenced section to remove`;
  }
  const bak = await backupFile(CLAUDE_MD_FILE);
  const stripped = content.replace(fenceRe, "\n").trimEnd() + "\n";
  await writeFile(CLAUDE_MD_FILE, stripped);
  return `  - removed fenced section from ${CLAUDE_MD_FILE} (backup: ${bak})`;
}

// === entry ===

async function install(): Promise<void> {
  console.log("Installing claude-stacked-prs...\n");
  await checkPrereqs();
  console.log("Prerequisites: bun, git, gh present\n");

  console.log("Slash commands:");
  for (const r of await installSymlinks()) console.log(r);

  console.log("\nSettings:");
  console.log(await patchSettings());

  console.log("\nGlobal CLAUDE.md:");
  console.log(await wireClaudeMd());

  console.log("\nHook state directory:");
  console.log(await createStateDir());

  console.log("\n--- Next steps ---");
  const hasGt = await commandOnPath("gt");
  if (!hasGt) {
    console.log("Graphite not installed. Run:");
    console.log("  brew install withgraphite/tap/graphite");
  } else {
    console.log("Graphite (gt) is already installed.");
  }
  console.log("Then (interactive — you run these):");
  console.log("  gt auth                                # once per machine");
  console.log("  cd /path/to/your/repo && gt repo init  # once per repo");
  console.log("");
  console.log("The hook fires on Edit/Write past 300 lines or 8 files of");
  console.log("uncommitted diff. Opt out of specific repos by adding their");
  console.log("absolute paths to PR_NUDGE_SKIP_ROOTS (colon-separated).");
}

async function uninstall(): Promise<void> {
  console.log("Uninstalling claude-stacked-prs...\n");

  console.log("Slash commands:");
  for (const r of await uninstallSymlinks()) console.log(r);

  console.log("\nSettings:");
  console.log(await uninstallSettings());

  console.log("\nGlobal CLAUDE.md:");
  console.log(await uninstallClaudeMd());

  console.log(`\nProject directory left in place at ${PROJECT_DIR}`);
  console.log("Restore your original /commit-push-pr.md from the most recent .bak.<ts> file if you want it back.");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--uninstall")) {
    await uninstall();
  } else {
    await install();
  }
}

main().catch((err) => {
  console.error(`\nFailed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
