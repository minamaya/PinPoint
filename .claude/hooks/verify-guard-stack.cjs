#!/usr/bin/env node
// SessionStart hook: guard-stack canary. On 2026-07-05 a settings.json rewrite
// silently dropped the guard hooks and permission rules, and the session ran
// guardless for ~1.5h. This reads .claude/settings.json and prints a warning
// to STDOUT (SessionStart adds stdout to Claude's context; stderr is never
// seen) when a wired hook script is missing from disk, a merge deny rule is
// missing from permissions.deny, or a Supabase write-tool rule is missing from
// permissions.ask. Silent when healthy; always exits 0.
//
// It cannot detect its own removal from settings.json.

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");

// The merge channels agents must never use: the admin bypass of the ruleset's
// gates, and the raw API/MCP merges outside the documented `gh pr merge` path.
// Keep in step with permissions.deny in .claude/settings.json.
const REQUIRED_DENY = [
  "Bash(gh pr merge *--admin*)",
  "Bash(gh api *pulls/*/merge*)",
  "Bash(gh api *mergePullRequest*)",
  "Bash(gh api *enablePullRequestAutoMerge*)",
  "mcp__*__merge_pull_request",
  "mcp__*__enable_pr_auto_merge",
];

// The prod-mutating Supabase MCP tools (CORE-SEC-010). The server segment is a
// glob because the server's name differs per surface (CLI connector, cloud,
// plugin, and a per-connector UUID in the desktop app); a rule naming one
// surface leaves the others unprompted. Keep in step with permissions.ask.
const REQUIRED_ASK = [
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
];

// Repo-relative scripts a hook command runs, e.g. `node "${CLAUDE_PROJECT_DIR:-.}"/.claude/hooks/x.cjs`.
const SCRIPT = /(?:\.claude|scripts)\/[\w./-]+\.(?:cjs|mjs|js|sh|py)\b/g;

function findProblems(settings) {
  const commands = Object.values(settings.hooks ?? {})
    .flat()
    .flatMap((entry) => entry?.hooks ?? [])
    .map((hook) => String(hook?.command ?? ""));
  const scripts = new Set(commands.flatMap((command) => command.match(SCRIPT) ?? []));
  const missing = [...scripts].filter((script) => !fs.existsSync(path.join(ROOT, script)));
  const deny = settings.permissions?.deny ?? [];
  const absent = REQUIRED_DENY.filter((rule) => !deny.includes(rule));
  const ask = settings.permissions?.ask ?? [];
  const unasked = REQUIRED_ASK.filter((rule) => !ask.includes(rule));

  const problems = [];
  if (missing.length > 0) problems.push(`hook scripts missing from disk: ${missing.join(", ")}`);
  if (absent.length > 0) problems.push(`merge deny rules missing from permissions.deny: ${absent.join(", ")}`);
  if (unasked.length > 0) problems.push(`Supabase write-tool rules missing from permissions.ask: ${unasked.join(", ")}`);
  return problems;
}

let problems;
try {
  problems = findProblems(JSON.parse(fs.readFileSync(path.join(ROOT, ".claude", "settings.json"), "utf8")));
} catch (err) {
  problems = [`cannot check .claude/settings.json (${err instanceof Error ? err.message : String(err)})`];
}
if (problems.length > 0) {
  process.stdout.write(
    `⚠️ GUARD STACK DEGRADED — ${problems.join("; ")}. Restore .claude/settings.json from git before continuing.\n`
  );
}
