#!/usr/bin/env node
/**
 * Antigravity SessionStart aggregator for PinPoint.
 *
 * Fail-open: collects startup context from PinPoint's session hooks and emits
 * a single `injectSteps` payload. Always exits 0.
 */

"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

function runText(command, args, options) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      ...options,
    }).trim();
  } catch {
    return "";
  }
}

function verifyAntigravityHooks(repoRoot) {
  const hooksJsonPath = path.join(repoRoot, ".agents", "hooks.json");
  let config;
  try {
    config = JSON.parse(fs.readFileSync(hooksJsonPath, "utf8"));
  } catch (err) {
    return `⚠️ ANTIGRAVITY GUARD STACK DEGRADED — cannot parse .agents/hooks.json (${err instanceof Error ? err.message : String(err)}).`;
  }

  const commands = [];
  for (const hookGroup of Object.values(config || {})) {
    if (!hookGroup || typeof hookGroup !== "object") continue;
    for (const eventName of ["SessionStart", "PreInvocation"]) {
      const entries = hookGroup[eventName];
      if (!Array.isArray(entries)) continue;
      for (const h of entries) {
        if (h && typeof h.command === "string") commands.push(h.command);
      }
    }
    for (const eventName of ["PreToolUse", "PostToolUse"]) {
      const groups = hookGroup[eventName];
      if (!Array.isArray(groups)) continue;
      for (const g of groups) {
        if (!g || !Array.isArray(g.hooks)) continue;
        for (const h of g.hooks) {
          if (h && typeof h.command === "string") commands.push(h.command);
        }
      }
    }
  }

  const scriptRe = /\.\/hooks\/[\w./-]+\.cjs\b/g;
  const missing = new Set();
  for (const cmd of commands) {
    const matches = cmd.match(scriptRe) || [];
    for (const rel of matches) {
      if (!fs.existsSync(path.join(repoRoot, ".agents", rel))) {
        missing.add(`.agents/${rel.slice(2)}`);
      }
    }
  }

  if (missing.size > 0) {
    return `⚠️ ANTIGRAVITY GUARD STACK DEGRADED — hook scripts missing from disk: ${[...missing].join(", ")}. Restore .agents/hooks/ before continuing.`;
  }
  return "";
}

function collectStartupMessages(input) {
  const messages = [];
  const cwd =
    (typeof input.cwd === "string" && input.cwd) ||
    (Array.isArray(input.workspacePaths) && input.workspacePaths[0]) ||
    REPO_ROOT;
  const childEnv = { ...process.env, CLAUDE_PROJECT_DIR: REPO_ROOT };

  if (fs.existsSync(path.join(REPO_ROOT, ".beads"))) {
    const bdPrime = runText("bd", ["prime"], {
      cwd: REPO_ROOT,
      env: childEnv,
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (bdPrime) messages.push(bdPrime);
  }

  const choresNag = runText(
    "bash",
    [path.join(REPO_ROOT, ".claude", "hooks", "session-start-chores-nag.sh")],
    {
      cwd,
      env: childEnv,
      input: JSON.stringify({
        transcript_path:
          typeof input.transcriptPath === "string" ? input.transcriptPath : "",
        hook_event_name: "SessionStart",
      }),
      timeout: 5000,
      stdio: ["pipe", "pipe", "ignore"],
    }
  );
  if (choresNag) messages.push(choresNag);

  const worktreeReap = runText(
    "bash",
    [
      path.join(
        REPO_ROOT,
        ".claude",
        "hooks",
        "session-start-worktree-reap.sh"
      ),
    ],
    {
      cwd: REPO_ROOT,
      env: childEnv,
      timeout: 24000,
      stdio: ["ignore", "pipe", "ignore"],
    }
  );
  if (worktreeReap) messages.push(worktreeReap);

  const protoPoll = runText(
    "bash",
    [path.join(REPO_ROOT, "scripts", "hooks", "prototype-mode-poll.sh")],
    {
      cwd: REPO_ROOT,
      env: childEnv,
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    }
  );
  if (protoPoll) messages.push(protoPoll);

  const guardCheck = runText(
    "node",
    [path.join(REPO_ROOT, ".claude", "hooks", "verify-guard-stack.cjs")],
    {
      cwd: REPO_ROOT,
      env: childEnv,
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    }
  );
  if (guardCheck) messages.push(guardCheck);

  const agyGuardCheck = verifyAntigravityHooks(REPO_ROOT);
  if (agyGuardCheck) messages.push(agyGuardCheck);

  return messages;
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) {
    raw += chunk;
  }

  let input = {};
  if (raw.trim()) {
    try {
      input = JSON.parse(raw) || {};
    } catch {
      input = {};
    }
  }

  const messages = collectStartupMessages(input);
  const combined = messages.join("\n\n");
  const out = {
    injectSteps: combined
      ? [{ systemMessage: { systemMessage: combined } }]
      : [],
  };
  process.stdout.write(JSON.stringify(out));
}

main().catch(() => {
  process.stdout.write(JSON.stringify({ injectSteps: [] }));
});
