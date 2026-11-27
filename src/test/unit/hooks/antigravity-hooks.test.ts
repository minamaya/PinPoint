// Unit tests for Antigravity hooks under .agents/hooks/.
// Spawns each hook via Node with Antigravity stdin JSON and checks decisions,
// fail-closed guarantees, Beads actor attribution, and PostToolUse -> PreInvocation
// reminder queuing.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

const REPO_ROOT = process.cwd();
const PRE_TOOL_HOOK = path.resolve(
  REPO_ROOT,
  ".agents/hooks/pre-tool-guard.cjs"
);
const MCP_HOOK = path.resolve(
  REPO_ROOT,
  ".agents/hooks/pre-tool-mcp-guard.cjs"
);
const POST_TOOL_HOOK = path.resolve(
  REPO_ROOT,
  ".agents/hooks/post-tool-reminders.cjs"
);
const PRE_INVOCATION_HOOK = path.resolve(
  REPO_ROOT,
  ".agents/hooks/pre-invocation.cjs"
);
const SESSION_START_HOOK = path.resolve(
  REPO_ROOT,
  ".agents/hooks/session-start.cjs"
);

const HookResponseSchema = z.object({
  decision: z.string().optional(),
  reason: z.string().optional(),
  overwrite: z.object({ CommandLine: z.string().optional() }).optional(),
  injectSteps: z
    .array(
      z.object({
        systemMessage: z
          .object({ systemMessage: z.string().optional() })
          .optional(),
      })
    )
    .optional(),
});

type HookResponse = z.infer<typeof HookResponseSchema>;

function runHookJson(hookPath: string, payload: unknown): HookResponse {
  const input = typeof payload === "string" ? payload : JSON.stringify(payload);
  const result = spawnSync("node", [hookPath], {
    input,
    encoding: "utf8",
    timeout: 15_000,
  });
  expect(result.status).toBe(0);
  return HookResponseSchema.parse(JSON.parse(result.stdout));
}

describe(".agents/hooks/pre-tool-guard.cjs", () => {
  let mainRepo = "";
  let linkedWorktree = "";

  beforeAll(() => {
    mainRepo = fs.mkdtempSync(path.join(os.tmpdir(), "agy-pretool-main-"));
    linkedWorktree = `${mainRepo}-linked`;
    const git = (...args: string[]): void => {
      execFileSync("git", args, { cwd: mainRepo, stdio: "ignore" });
    };
    git("init", "-q", "-b", "main");
    git(
      "-c",
      "user.email=test@example.com",
      "-c",
      "user.name=Test",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "base"
    );
    git("worktree", "add", "-q", "-b", "feature/test", linkedWorktree);
  });

  afterAll(() => {
    fs.rmSync(mainRepo, { recursive: true, force: true });
    fs.rmSync(linkedWorktree, { recursive: true, force: true });
  });

  it("blocks branch switches in the main worktree and allows them in linked worktrees", () => {
    const blocked = runHookJson(PRE_TOOL_HOOK, {
      toolCall: {
        name: "run_command",
        args: { CommandLine: "git checkout feature/x" },
      },
      cwd: mainRepo,
    });
    expect(blocked.decision).toBe("deny");
    expect(blocked.reason).toContain("MAIN worktree");

    const allowed = runHookJson(PRE_TOOL_HOOK, {
      toolCall: {
        name: "run_command",
        args: { CommandLine: "git checkout feature/x" },
      },
      cwd: linkedWorktree,
    });
    expect(allowed.decision).toBe("allow");
  });

  it("fails closed on malformed or empty payloads", () => {
    expect(runHookJson(PRE_TOOL_HOOK, "{not-json").decision).toBe("deny");
    expect(runHookJson(PRE_TOOL_HOOK, "").decision).toBe("deny");
  });

  it.each([
    "supabase projects delete my-ref",
    "gh pr merge 123 --admin --squash",
    "gh pr -R owner/repo merge 123 --admin",
    "gh pr update-branch 123 --rebase",
    "gh api /repos/owner/repo/pulls/123/merge",
    "gh api graphql -f query='mutation { mergePullRequest(input:{pullRequestId:\"1\"}) { clientMutationId } }'",
    "gh api graphql -f query='mutation { enablePullRequestAutoMerge(input:{pullRequestId:\"1\"}) { clientMutationId } }'",
    "gh api /repos/owner/repo/deployments/1/pending_deployments",
    "gh pr checkout 123",
    "gh pr -R owner/repo co 123",
    "gh co 123",
  ])("denies blocked PinPoint command: %s", (cmd) => {
    const res = runHookJson(PRE_TOOL_HOOK, {
      toolCall: { name: "run_command", args: { CommandLine: cmd } },
      cwd: linkedWorktree,
    });
    expect(res.decision).toBe("deny");
  });

  it.each([
    "supabase db reset",
    "supabase db remote commit",
    "supabase migration repair --status applied 123",
    "supabase branches delete feat",
    "git rebase origin/main",
    "git -C /tmp/repo rebase origin/main",
    "git reset --hard HEAD~1",
    "git -C /tmp/repo reset --hard",
    "git clean -fd",
    "git branch -D old-branch",
    "git push --force origin feat",
    "git push --force-with-lease origin feat",
    "git push -f origin feat",
    "echo $(git reset --hard)",
    "rm -rf tmp/foo",
    "rm -fr tmp/foo",
    "docker rm abc",
    "docker volume rm xyz",
    "kill 1234",
    "lsof -ti :3000 | xargs kill",
  ])("prompts on ask-gated PinPoint command: %s", (cmd) => {
    const res = runHookJson(PRE_TOOL_HOOK, {
      toolCall: { name: "run_command", args: { CommandLine: cmd } },
      cwd: linkedWorktree,
    });
    expect(res.decision).toBe("ask");
  });

  it.each([
    "git status",
    "gh pr merge 123 --squash",
    "gh pr update-branch 123",
    'git commit -m "avoid git push --force and rm -rf"',
    "rg 'gh pr checkout' docs/",
    "echo 'mergePullRequest' && gh api user",
    "cat << 'EOF'\nsupabase projects delete\ngit reset --hard\nEOF",
    "git branch -d merged-branch",
    "rm tmp/single-file.txt",
  ])("allows safe command or quoted/heredoc mention: %s", (cmd) => {
    const res = runHookJson(PRE_TOOL_HOOK, {
      toolCall: { name: "run_command", args: { CommandLine: cmd } },
      cwd: linkedWorktree,
    });
    expect(res.decision).toBe("allow");
    expect(res.overwrite).toBeUndefined();
  });

  it("injects BEADS_ACTOR overwrite on bd calls unless already specified", () => {
    const rewritten = runHookJson(PRE_TOOL_HOOK, {
      toolCall: { name: "run_command", args: { CommandLine: "bd ready" } },
      cwd: linkedWorktree,
      conversationId: "nonexistent-conv-id-test",
    });
    expect(rewritten.decision).toBe("allow");
    expect(rewritten.overwrite?.CommandLine).toBe(
      "export BEADS_ACTOR=Antigravity; bd ready"
    );

    const explicitFlag = runHookJson(PRE_TOOL_HOOK, {
      toolCall: {
        name: "run_command",
        args: { CommandLine: "bd --actor CustomAgent ready" },
      },
      cwd: linkedWorktree,
    });
    expect(explicitFlag.decision).toBe("allow");
    expect(explicitFlag.overwrite).toBeUndefined();

    const explicitEnv = runHookJson(PRE_TOOL_HOOK, {
      toolCall: {
        name: "run_command",
        args: { CommandLine: "BEADS_ACTOR=CustomAgent bd ready" },
      },
      cwd: linkedWorktree,
    });
    expect(explicitEnv.decision).toBe("allow");
    expect(explicitEnv.overwrite).toBeUndefined();
  });
});

describe(".agents/hooks/pre-tool-mcp-guard.cjs", () => {
  it("fails closed on invalid payloads", () => {
    expect(runHookJson(MCP_HOOK, "{invalid").decision).toBe("deny");
    expect(runHookJson(MCP_HOOK, "").decision).toBe("deny");
  });

  it("denies merge MCP tools on both lazy call_mcp_tool and eager mcp_* forms", () => {
    expect(
      runHookJson(MCP_HOOK, {
        toolCall: {
          name: "call_mcp_tool",
          args: { ServerName: "github", ToolName: "merge_pull_request" },
        },
      }).decision
    ).toBe("deny");

    expect(
      runHookJson(MCP_HOOK, {
        toolCall: { name: "mcp_github_enable_pr_auto_merge", args: {} },
      }).decision
    ).toBe("deny");
  });

  it("requires force_ask on Supabase write tools while allowing GitHub create_branch and PinPoint reads", () => {
    for (const toolName of [
      "execute_sql",
      "apply_migration",
      "deploy_edge_function",
      "delete_branch",
    ]) {
      expect(
        runHookJson(MCP_HOOK, {
          toolCall: {
            name: "call_mcp_tool",
            args: { ServerName: "supabase", ToolName: toolName },
          },
        }).decision
      ).toBe("force_ask");
    }

    expect(
      runHookJson(MCP_HOOK, {
        toolCall: { name: "mcp_supabase_create_branch", args: {} },
      }).decision
    ).toBe("force_ask");

    expect(
      runHookJson(MCP_HOOK, {
        toolCall: {
          name: "call_mcp_tool",
          args: { ServerName: "github", ToolName: "create_branch" },
        },
      }).decision
    ).toBe("allow");

    expect(
      runHookJson(MCP_HOOK, {
        toolCall: {
          name: "call_mcp_tool",
          args: { ServerName: "pinpoint", ToolName: "list_machines" },
        },
      }).decision
    ).toBe("allow");
  });
});

describe("PostToolUse -> PreInvocation reminder relay", () => {
  let uiRepo = "";
  const convId = `vitest-agy-relay-${process.pid}`;

  beforeAll(() => {
    uiRepo = fs.mkdtempSync(path.join(os.tmpdir(), "agy-relay-repo-"));
    const git = (...args: string[]): string =>
      execFileSync("git", args, { cwd: uiRepo, encoding: "utf8" });

    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    fs.writeFileSync(path.join(uiRepo, "README.md"), "base\n");
    git("add", "README.md");
    git("commit", "-q", "-m", "base");
    const baseSha = git("rev-parse", "HEAD").trim();
    git("update-ref", "refs/remotes/origin/main", baseSha);

    git("checkout", "-q", "-b", "feature/ui");
    fs.mkdirSync(path.join(uiRepo, "src", "components"), { recursive: true });
    fs.writeFileSync(
      path.join(uiRepo, "src", "components", "Widget.tsx"),
      "export const Widget = 1;\n"
    );
    git("add", "src/components/Widget.tsx");
    git("commit", "-q", "-m", "add Widget");
  });

  afterAll(() => {
    fs.rmSync(uiRepo, { recursive: true, force: true });
    const queueFile = path.join(
      os.tmpdir(),
      `pinpoint-agy-reminders-${convId}.json`
    );
    fs.rmSync(queueFile, { force: true });
  });

  it("queues UI screenshot and preflight reminders in PostToolUse and drains them once in PreInvocation", () => {
    const postCommit = runHookJson(POST_TOOL_HOOK, {
      conversationId: convId,
      cwd: uiRepo,
      toolCall: {
        name: "run_command",
        args: { CommandLine: "git commit -m 'add Widget'" },
      },
    });
    expect(postCommit).toEqual({});

    const postPush = runHookJson(POST_TOOL_HOOK, {
      conversationId: convId,
      cwd: uiRepo,
      toolCall: {
        name: "run_command",
        args: { CommandLine: "git push -u origin feature/ui" },
      },
    });
    expect(postPush).toEqual({});

    const preFirst = runHookJson(PRE_INVOCATION_HOOK, {
      conversationId: convId,
    });
    const texts = (preFirst.injectSteps ?? []).map(
      (s) => s.systemMessage?.systemMessage ?? ""
    );
    expect(
      texts.some(
        (t) =>
          t.includes("UI-touching change") && t.includes("pr-screenshots.mjs")
      )
    ).toBe(true);
    expect(texts.some((t) => t.includes("pnpm run preflight"))).toBe(true);

    // Queue is drained after the first PreInvocation call.
    const preSecond = runHookJson(PRE_INVOCATION_HOOK, {
      conversationId: convId,
    });
    const secondTexts = (preSecond.injectSteps ?? []).map(
      (s) => s.systemMessage?.systemMessage ?? ""
    );
    expect(secondTexts.some((t) => t.includes("UI-touching change"))).toBe(
      false
    );
    expect(secondTexts.some((t) => t.includes("pnpm run preflight"))).toBe(
      false
    );
  });

  it("does not queue reminders when PostToolUse reports an error", () => {
    const errConv = `${convId}-err`;
    const postErr = runHookJson(POST_TOOL_HOOK, {
      conversationId: errConv,
      cwd: uiRepo,
      error: "exit status 1",
      toolCall: {
        name: "run_command",
        args: { CommandLine: "git push origin feature/ui" },
      },
    });
    expect(postErr).toEqual({});

    const pre = runHookJson(PRE_INVOCATION_HOOK, { conversationId: errConv });
    const texts = (pre.injectSteps ?? []).map(
      (s) => s.systemMessage?.systemMessage ?? ""
    );
    expect(texts.some((t) => t.includes("pnpm run preflight"))).toBe(false);
  });
});

describe(".agents/hooks/session-start.cjs", () => {
  let fakeRepo = "";

  beforeAll(() => {
    fakeRepo = fs.mkdtempSync(path.join(os.tmpdir(), "agy-session-start-"));
    fs.mkdirSync(path.join(fakeRepo, ".agents", "hooks"), { recursive: true });
    fs.mkdirSync(path.join(fakeRepo, ".claude", "hooks"), { recursive: true });
    fs.mkdirSync(path.join(fakeRepo, "scripts", "hooks"), { recursive: true });

    fs.copyFileSync(
      SESSION_START_HOOK,
      path.join(fakeRepo, ".agents", "hooks", "session-start.cjs")
    );
    fs.copyFileSync(
      path.resolve(REPO_ROOT, ".claude/hooks/verify-guard-stack.cjs"),
      path.join(fakeRepo, ".claude", "hooks", "verify-guard-stack.cjs")
    );

    fs.writeFileSync(
      path.join(fakeRepo, ".claude", "hooks", "session-start-chores-nag.sh"),
      "#!/usr/bin/env bash\necho '🧹 Weekly chores due'\n"
    );
    fs.writeFileSync(
      path.join(fakeRepo, ".claude", "hooks", "session-start-worktree-reap.sh"),
      "#!/usr/bin/env bash\nexit 0\n"
    );
    fs.writeFileSync(
      path.join(fakeRepo, "scripts", "hooks", "prototype-mode-poll.sh"),
      "#!/usr/bin/env bash\nexit 0\n"
    );
    fs.writeFileSync(
      path.join(fakeRepo, ".claude", "settings.json"),
      JSON.stringify({
        hooks: {},
        permissions: {
          deny: [
            "Bash(gh pr merge *--admin*)",
            "Bash(gh api *pulls/*/merge*)",
            "Bash(gh api *mergePullRequest*)",
            "Bash(gh api *enablePullRequestAutoMerge*)",
            "mcp__*__merge_pull_request",
            "mcp__*__enable_pr_auto_merge",
          ],
          ask: [
            "mcp__*__execute_sql",
            "mcp__*__apply_migration",
            "mcp__*__deploy_edge_function",
            "mcp__*__pause_project",
            "mcp__*__restore_project",
            "mcp__*__create_project",
            "mcp__*__delete_branch",
            "mcp__*__merge_branch",
            "mcp__*__rebase_branch",
            "mcp__*__reset_branch",
            "mcp__*-*-*-*-*__create_branch",
          ],
        },
      })
    );
  });

  afterAll(() => {
    fs.rmSync(fakeRepo, { recursive: true, force: true });
  });

  it("collects startup messages into injectSteps and detects missing .agents/hooks scripts", () => {
    fs.writeFileSync(
      path.join(fakeRepo, ".agents", "hooks.json"),
      JSON.stringify({
        test: {
          SessionStart: [
            { type: "command", command: "node ./hooks/session-start.cjs" },
          ],
        },
      })
    );
    const healthy = runHookJson(
      path.join(fakeRepo, ".agents", "hooks", "session-start.cjs"),
      {
        conversationId: "vitest-session-start",
        workspacePaths: [fakeRepo],
      }
    );
    expect(Array.isArray(healthy.injectSteps)).toBe(true);
    const healthyMsg =
      healthy.injectSteps?.[0]?.systemMessage?.systemMessage ?? "";
    expect(healthyMsg).toContain("Weekly chores due");
    expect(healthyMsg).not.toContain("ANTIGRAVITY GUARD STACK DEGRADED");

    fs.writeFileSync(
      path.join(fakeRepo, ".agents", "hooks.json"),
      JSON.stringify({
        test: {
          SessionStart: [
            { type: "command", command: "node ./hooks/missing-guard.cjs" },
          ],
        },
      })
    );
    const degraded = runHookJson(
      path.join(fakeRepo, ".agents", "hooks", "session-start.cjs"),
      {
        conversationId: "vitest-session-start",
        workspacePaths: [fakeRepo],
      }
    );
    const degradedMsg =
      degraded.injectSteps?.[0]?.systemMessage?.systemMessage ?? "";
    expect(degradedMsg).toContain("ANTIGRAVITY GUARD STACK DEGRADED");
    expect(degradedMsg).toContain(".agents/hooks/missing-guard.cjs");
  });
});
