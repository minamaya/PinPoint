#!/usr/bin/env node
/**
 * Antigravity PreToolUse (run_command) guard for PinPoint.
 *
 * Fail-closed: malformed payloads, runtime errors, or a missing/crashed
 * branch-switch guard return `decision: "deny"`.
 *
 * Enforces:
 *   1. Main-worktree branch switch block (.claude/hooks/block-main-worktree-branch-switch.cjs)
 *   2. PinPoint repo deny rules (mirroring .claude/settings.json#permissions.deny)
 *   3. PinPoint repo ask rules (mirroring .claude/settings.json#permissions.ask)
 *   4. Beads actor attribution (`export BEADS_ACTOR=<actor>; <cmd>`) when running `bd`
 */

"use strict";

const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SAFE_ACTOR_RE = /^[A-Za-z0-9_-]+$/;

function respond(payload) {
  process.stdout.write(JSON.stringify(payload));
  process.exit(0);
}

function deny(reason) {
  respond({ decision: "deny", reason });
}

/**
 * Strip heredoc bodies so literal text inside `<<EOF ... EOF` is not inspected.
 */
function stripHeredocs(command) {
  return command.replace(/<<-?\s*['"]?(\w+)['"]?[\s\S]*?\n\s*\1(?=\s|$)/g, "");
}

/**
 * Replace single- and double-quoted contents with spaces of identical length,
 * keeping character offsets aligned with the input string.
 */
function blankQuotesPreserveIndices(str) {
  return str
    .replace(/'[^']*'/g, (m) => `'${" ".repeat(m.length - 2)}'`)
    .replace(/"(?:\\.|[^"\\])*"/g, (m) => `"${" ".repeat(m.length - 2)}"`);
}

/**
 * Split a command into shell segments `[start, end)` using `quoteBlanked` so
 * separators inside quotes do not split segments.
 */
function findSegments(quoteBlanked) {
  const sepRe = /&&|\|\||[;&|\n()`]/g;
  const segments = [];
  let start = 0;
  let match;
  while ((match = sepRe.exec(quoteBlanked)) !== null) {
    if (match.index > start) {
      segments.push([start, match.index]);
    }
    start = match.index + match[0].length;
  }
  if (start < quoteBlanked.length) {
    segments.push([start, quoteBlanked.length]);
  }
  return segments;
}

/**
 * Strip leading shell wrappers (`sudo`, `env`, `VAR=val`) from a segment's
 * tokens and return `{ bin, restTokens, qSeg, rawSeg }`.
 */
function parseSegment(heredocStripped, quoteBlanked, start, end) {
  const qSeg = quoteBlanked.slice(start, end);
  const rawSeg = heredocStripped.slice(start, end);
  const tokens = qSeg.trim().split(/\s+/).filter(Boolean);

  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok === "sudo" || tok === "command" || tok === "noglob") {
      i++;
      continue;
    }
    if (tok === "env") {
      i++;
      while (
        i < tokens.length &&
        (/^-/.test(tokens[i]) || /^[A-Za-z_]\w*=/.test(tokens[i]))
      ) {
        i++;
      }
      continue;
    }
    if (/^[A-Za-z_]\w*=/.test(tok)) {
      i++;
      continue;
    }
    break;
  }

  if (i >= tokens.length) {
    return null;
  }

  const bin = path.basename(tokens[i]);
  return {
    bin,
    args: tokens.slice(i + 1),
    qSeg,
    rawSeg,
  };
}

/**
 * Extract the git subcommand and remaining args after global git flags
 * (`-C <dir>`, `-c <kv>`, `--git-dir <d>`, etc.).
 */
function extractGitSubcommand(args) {
  const VALUE_FLAGS = new Set([
    "-C",
    "-c",
    "--git-dir",
    "--work-tree",
    "--namespace",
    "--super-prefix",
  ]);
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (VALUE_FLAGS.has(a)) {
      i += 2;
      continue;
    }
    if (a.startsWith("-")) {
      i++;
      continue;
    }
    return { sub: a, rest: args.slice(i + 1) };
  }
  return { sub: "", rest: [] };
}

function extractGhSubcommand(args) {
  const VALUE_FLAGS = new Set(["-R", "--repo", "--hostname"]);
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (VALUE_FLAGS.has(a)) {
      i += 2;
      continue;
    }
    if (a.startsWith("-")) {
      i++;
      continue;
    }
    return { sub: a, rest: args.slice(i + 1) };
  }
  return { sub: "", rest: [] };
}

function checkSegmentDeny(seg) {
  const { bin, args, rawSeg } = seg;

  if (bin === "supabase" && args[0] === "projects" && args[1] === "delete") {
    return {
      id: "supabase-projects-delete",
      reason:
        "Blocked by PinPoint guard (supabase-projects-delete): deleting Supabase projects is forbidden.",
    };
  }

  if (bin === "gh") {
    const { sub: topSub, rest: topRest } = extractGhSubcommand(args);

    if (topSub === "pr") {
      const { sub: prSub } = extractGhSubcommand(topRest);
      if (prSub === "merge" && topRest.includes("--admin")) {
        return {
          id: "gh-pr-merge-admin",
          reason:
            "Blocked by PinPoint guard (gh-pr-merge-admin): never pass --admin to gh pr merge; satisfy the ruleset gates instead.",
        };
      }
      if (prSub === "update-branch" && topRest.includes("--rebase")) {
        return {
          id: "gh-pr-update-branch-rebase",
          reason:
            "Blocked by PinPoint guard (gh-pr-update-branch-rebase): sync branches with merge, never --rebase.",
        };
      }
      if (prSub === "checkout" || prSub === "co") {
        return {
          id: "gh-pr-checkout",
          reason:
            "Blocked by PinPoint guard (gh-pr-checkout): do not switch branches with gh pr checkout/co.",
        };
      }
    }

    if (topSub === "co") {
      return {
        id: "gh-co",
        reason:
          "Blocked by PinPoint guard (gh-co): do not switch branches with gh co.",
      };
    }

    if (topSub === "api") {
      if (
        /pulls\/[^\s"']*\/merge\b|\bmergePullRequest\b|\benablePullRequestAutoMerge\b|\bpending_deployments\b/.test(
          rawSeg
        )
      ) {
        return {
          id: "gh-api-merge-bypass",
          reason:
            "Blocked by PinPoint guard (gh-api-merge-bypass): raw GitHub API merge/auto-merge/deployment endpoints are forbidden; use `gh pr merge`.",
        };
      }
    }
  }

  return null;
}

function checkSegmentAsk(seg) {
  const { bin, args } = seg;

  if (bin === "supabase") {
    const joined = args.join(" ");
    if (/^db\s+reset\b/.test(joined)) {
      return "supabase db reset";
    }
    if (/^db\s+remote\s+commit\b/.test(joined)) {
      return "supabase db remote commit";
    }
    if (/^migration\s+repair\b/.test(joined)) {
      return "supabase migration repair";
    }
    if (/^branches\s+delete\b/.test(joined)) {
      return "supabase branches delete";
    }
  }

  if (bin === "git") {
    const { sub, rest } = extractGitSubcommand(args);
    if (sub === "rebase") {
      return "git rebase";
    }
    if (sub === "reset" && rest.includes("--hard")) {
      return "git reset --hard";
    }
    if (sub === "clean") {
      return "git clean";
    }
    if (sub === "branch" && rest.includes("-D")) {
      return "git branch -D";
    }
    if (
      sub === "push" &&
      rest.some(
        (a) =>
          a === "-f" ||
          a === "--force" ||
          a === "--force-with-lease" ||
          a.startsWith("--force-with-lease=")
      )
    ) {
      return "git push --force";
    }
  }

  if (bin === "rm") {
    const shortFlags = new Set();
    let hasRecursive = false;
    let hasForce = false;
    for (const a of args) {
      if (a === "--recursive") hasRecursive = true;
      else if (a === "--force") hasForce = true;
      else if (a.startsWith("-") && !a.startsWith("--")) {
        for (const ch of a.slice(1)) shortFlags.add(ch);
      }
    }
    if (
      (hasRecursive || shortFlags.has("r") || shortFlags.has("R")) &&
      (hasForce || shortFlags.has("f"))
    ) {
      return "rm -rf";
    }
  }

  if (bin === "docker") {
    if (args[0] === "rm") return "docker rm";
    if (args[0] === "volume" && args[1] === "rm") return "docker volume rm";
  }

  if (bin === "kill") {
    return "kill";
  }

  if (bin === "xargs" && args.includes("kill")) {
    return "xargs kill";
  }

  return null;
}

function resolveBeadsActor(conversationId) {
  if (
    typeof conversationId !== "string" ||
    !SAFE_ACTOR_RE.test(conversationId)
  ) {
    return "Antigravity";
  }
  const whoamiScript = path.join(
    os.homedir(),
    "Code",
    "huddle",
    "lib",
    "huddle-whoami.sh"
  );
  if (!fs.existsSync(whoamiScript)) {
    return "Antigravity";
  }
  try {
    const out = execFileSync("bash", [whoamiScript, "whoami", conversationId], {
      encoding: "utf8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (SAFE_ACTOR_RE.test(out)) {
      return out;
    }
  } catch {
    // Fall back to static Antigravity actor, never Tim's git user.name.
  }
  return "Antigravity";
}

function evaluateCommandForAntigravity(input) {
  const toolName = input?.toolCall?.name;
  if (toolName !== "run_command") {
    return { decision: "allow" };
  }

  const command = String(input?.toolCall?.args?.CommandLine || "");
  if (!command.trim()) {
    return { decision: "allow" };
  }

  const cwd =
    (typeof input.cwd === "string" && input.cwd) ||
    (Array.isArray(input.workspacePaths) && input.workspacePaths[0]) ||
    REPO_ROOT;

  // Check 1: main-worktree branch switch (fail-closed if script missing/crashed).
  const branchGuard = path.join(
    REPO_ROOT,
    ".claude",
    "hooks",
    "block-main-worktree-branch-switch.cjs"
  );
  if (!fs.existsSync(branchGuard)) {
    return {
      decision: "deny",
      reason: `pinpoint pre-tool-guard failed closed: missing ${branchGuard}`,
    };
  }
  const branchResult = spawnSync("node", [branchGuard], {
    input: JSON.stringify({
      tool_name: "Bash",
      tool_input: { command },
      cwd,
    }),
    encoding: "utf8",
    timeout: 8000,
  });
  if (
    branchResult.error ||
    branchResult.status === null ||
    (branchResult.status !== 0 && branchResult.status !== 2)
  ) {
    const errMsg = branchResult.error
      ? branchResult.error.message
      : `exit ${branchResult.status}`;
    return {
      decision: "deny",
      reason: `pinpoint pre-tool-guard failed closed: branch switch check errored (${errMsg}).`,
    };
  }
  if (branchResult.status === 2) {
    return {
      decision: "deny",
      reason:
        (branchResult.stderr || "").trim() ||
        "Branch switch blocked in the MAIN worktree.",
    };
  }

  const heredocStripped = stripHeredocs(command);
  const quoteBlanked = blankQuotesPreserveIndices(heredocStripped);
  const segments = findSegments(quoteBlanked)
    .map(([s, e]) => parseSegment(heredocStripped, quoteBlanked, s, e))
    .filter(Boolean);

  // Check 2: PinPoint deny rules across every command segment.
  for (const seg of segments) {
    const denied = checkSegmentDeny(seg);
    if (denied) {
      return { decision: "deny", reason: denied.reason };
    }
  }

  // Check 3: PinPoint ask rules across every command segment.
  for (const seg of segments) {
    const askId = checkSegmentAsk(seg);
    if (askId) {
      return {
        decision: "ask",
        reason: `PinPoint guard requires confirmation for ${askId}.`,
      };
    }
  }

  // Check 4: Beads actor attribution via overwrite when invoking `bd` without --actor / BEADS_ACTOR.
  const hasBdSegment = segments.some((seg) => seg.bin === "bd");
  if (hasBdSegment) {
    const hasExplicitActor =
      /(?:^|\s)--actor(?:=|\s)/.test(quoteBlanked) ||
      /(?:^|[;\s])BEADS_ACTOR=/.test(heredocStripped);
    if (!hasExplicitActor) {
      const actor = resolveBeadsActor(input.conversationId);
      return {
        decision: "allow",
        overwrite: {
          CommandLine: `export BEADS_ACTOR=${actor}; ${command}`,
        },
      };
    }
  }

  return { decision: "allow" };
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) {
    raw += chunk;
  }
  if (!raw.trim()) {
    deny("pinpoint pre-tool-guard failed closed: empty hook payload.");
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    deny("pinpoint pre-tool-guard failed closed: malformed JSON payload.");
  }

  const decision = evaluateCommandForAntigravity(input);
  respond(decision);
}

main().catch((err) => {
  deny(
    `pinpoint pre-tool-guard failed closed: ${err instanceof Error ? err.message : String(err)}`
  );
});
