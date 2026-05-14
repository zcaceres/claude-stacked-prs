import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import {
  patchSettings,
  uninstallClaudeMd,
  uninstallSettings,
  wireClaudeMd,
} from "./install";

const TMP_HOME = await mkdtemp(join(tmpdir(), "claude-stacked-prs-test-"));
const CLAUDE_DIR = join(TMP_HOME, ".claude");
const SETTINGS_FILE = join(CLAUDE_DIR, "settings.json");
const CLAUDE_MD_FILE = join(CLAUDE_DIR, "CLAUDE.md");

const PROJECT_DIR = import.meta.dir;
const HOOK_CMD = `bun run ${join(PROJECT_DIR, "src", "pr-size-nudge.ts")}`;

beforeEach(async () => {
  await rm(CLAUDE_DIR, { recursive: true, force: true });
  await mkdir(CLAUDE_DIR, { recursive: true });
});

afterAll(async () => {
  await rm(TMP_HOME, { recursive: true, force: true });
});

describe("patchSettings", () => {
  test("creates settings.json with hook entry when file is missing", async () => {
    const msg = await patchSettings(TMP_HOME);
    expect(msg).toContain("hook entry added");

    const written = JSON.parse(await readFile(SETTINGS_FILE, "utf-8"));
    const post = written.hooks.PostToolUse;
    expect(Array.isArray(post)).toBe(true);
    expect(post[0].hooks[0].command).toBe(HOOK_CMD);
  });

  test("is idempotent when hook is already present", async () => {
    await patchSettings(TMP_HOME);
    const msg = await patchSettings(TMP_HOME);
    expect(msg).toContain("already present");

    const written = JSON.parse(await readFile(SETTINGS_FILE, "utf-8"));
    expect(written.hooks.PostToolUse).toHaveLength(1);
  });

  test("preserves unrelated PostToolUse entries and top-level keys", async () => {
    const seed = {
      theme: "dark",
      hooks: {
        PostToolUse: [
          {
            matcher: "Bash",
            hooks: [{ type: "command", command: "echo unrelated" }],
          },
        ],
      },
    };
    await writeFile(SETTINGS_FILE, JSON.stringify(seed, null, 2));

    await patchSettings(TMP_HOME);
    const written = JSON.parse(await readFile(SETTINGS_FILE, "utf-8"));

    expect(written.theme).toBe("dark");
    expect(written.hooks.PostToolUse).toHaveLength(2);
    const commands = written.hooks.PostToolUse.flatMap(
      (e: { hooks: Array<{ command: string }> }) => e.hooks.map((h) => h.command),
    );
    expect(commands).toContain("echo unrelated");
    expect(commands).toContain(HOOK_CMD);
  });
});

describe("wireClaudeMd", () => {
  test("symlinks when CLAUDE.md is missing", async () => {
    const msg = await wireClaudeMd(TMP_HOME);
    expect(msg).toContain("symlinked");

    const content = await readFile(CLAUDE_MD_FILE, "utf-8");
    expect(content.length).toBeGreaterThan(0);
  });

  test("appends fenced section to existing non-empty CLAUDE.md", async () => {
    await writeFile(CLAUDE_MD_FILE, "# my notes\n\nhello world\n");
    const msg = await wireClaudeMd(TMP_HOME);
    expect(msg).toContain("appended");

    const content = await readFile(CLAUDE_MD_FILE, "utf-8");
    expect(content).toContain("# my notes");
    expect(content).toContain("hello world");
    expect(content).toContain("claude-stacked-prs:start");
    expect(content).toContain("claude-stacked-prs:end");
  });

  test("updates fenced section in place on a second run", async () => {
    await writeFile(
      CLAUDE_MD_FILE,
      "# my notes\n\n<!-- claude-stacked-prs:start -->\nOLD CONTENT\n<!-- claude-stacked-prs:end -->\n\ntrailing\n",
    );
    const msg = await wireClaudeMd(TMP_HOME);
    expect(msg).toContain("updated");

    const content = await readFile(CLAUDE_MD_FILE, "utf-8");
    expect(content).toContain("# my notes");
    expect(content).toContain("trailing");
    expect(content).not.toContain("OLD CONTENT");
  });
});

describe("install/uninstall round-trip", () => {
  test("uninstall removes the hook entry that install added", async () => {
    await patchSettings(TMP_HOME);
    const msg = await uninstallSettings(TMP_HOME);
    expect(msg).toContain("removed hook entry");

    const written = JSON.parse(await readFile(SETTINGS_FILE, "utf-8"));
    expect(written.hooks).toBeUndefined();
  });

  test("uninstall strips fenced section appended by install", async () => {
    await writeFile(CLAUDE_MD_FILE, "# my notes\n\nhello\n");
    await wireClaudeMd(TMP_HOME);
    await uninstallClaudeMd(TMP_HOME);

    const content = await readFile(CLAUDE_MD_FILE, "utf-8");
    expect(content).toContain("# my notes");
    expect(content).toContain("hello");
    expect(content).not.toContain("claude-stacked-prs:start");
    expect(content).not.toContain("claude-stacked-prs:end");
  });
});
