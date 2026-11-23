#!/usr/bin/env node
/**
 * Antigravity PostToolUse (run_command) reminder collector for PinPoint.
 *
 * Antigravity's PostToolUse contract expects `{}` on stdout and does not
 * inject context directly, so reminders from ui-screenshot-reminder.cjs and
 * preflight-reminder.sh are queued per conversationId and drained on the next
 * PreInvocation hook turn. Fail-open: always emits `{}` and exits 0.
 */

"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

function queuePathFor(conversationId) {
  const safeId =
    typeof conversationId === "string" && conversationId.trim()
      ? conversationId.trim().replace(/[^A-Za-z0-9_-]/g, "_")
      : "default";
  return path.join(os.tmpdir(), `pinpoint-agy-reminders-${safeId}.json`);
}

function runReminderHook(command, args, payloadJson, cwd) {
  try {
    const res = spawnSync(command, args, {
      cwd,
      input: payloadJson,
      encoding: "utf8",
      timeout: 4000,
    });
    if (!res.stdout || !res.stdout.trim()) return "";
    const parsed = JSON.parse(res.stdout);
    const ctx = parsed?.hookSpecificOutput?.additionalContext;
    return typeof ctx === "string" ? ctx.trim() : "";
  } catch {
    return "";
  }
}

function appendQueuedReminders(conversationId, reminders) {
  if (reminders.length === 0) return;
  const filePath = queuePathFor(conversationId);
  let existing = [];
  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (Array.isArray(parsed)) {
        existing = parsed.filter((item) => typeof item === "string");
      }
    }
  } catch {
    existing = [];
  }

  for (const msg of reminders) {
    if (!existing.includes(msg)) {
      existing.push(msg);
    }
  }

  try {
    fs.writeFileSync(filePath, JSON.stringify(existing), { mode: 0o600 });
  } catch {
    // Fail open on temp-file write failures.
  }
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
      process.stdout.write("{}");
      return;
    }
  }

  if (input.error || input.toolCall?.name !== "run_command") {
    process.stdout.write("{}");
    return;
  }

  const command = String(input.toolCall?.args?.CommandLine || "");
  if (!/\bgit\b[\s\S]*\b(?:commit|push)\b/.test(command)) {
    process.stdout.write("{}");
    return;
  }

  const cwd =
    (typeof input.cwd === "string" && input.cwd) ||
    (Array.isArray(input.workspacePaths) && input.workspacePaths[0]) ||
    REPO_ROOT;

  const claudePayload = JSON.stringify({
    tool_name: "Bash",
    tool_input: { command },
    cwd,
  });

  const reminders = [];
  const screenshotNote = runReminderHook(
    "node",
    [path.join(REPO_ROOT, ".claude", "hooks", "ui-screenshot-reminder.cjs")],
    claudePayload,
    cwd
  );
  if (screenshotNote) reminders.push(screenshotNote);

  const preflightNote = runReminderHook(
    "bash",
    [path.join(REPO_ROOT, ".claude", "hooks", "preflight-reminder.sh")],
    claudePayload,
    cwd
  );
  if (preflightNote) reminders.push(preflightNote);

  appendQueuedReminders(input.conversationId, reminders);
  process.stdout.write("{}");
}

main().catch(() => {
  process.stdout.write("{}");
});
