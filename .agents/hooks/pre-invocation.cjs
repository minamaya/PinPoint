#!/usr/bin/env node
/**
 * Antigravity PreInvocation reminder injector for PinPoint.
 *
 * Emits active `.prototype-mode` state and drains any queued PostToolUse
 * reminders (UI screenshot / preflight) for the current conversationId.
 * Fail-open: always emits valid `injectSteps` JSON and exits 0.
 */

"use strict";

const { execFileSync } = require("node:child_process");
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

function drainQueuedReminders(conversationId) {
  const filePath = queuePathFor(conversationId);
  if (!fs.existsSync(filePath)) return [];
  let items = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (Array.isArray(parsed)) {
      items = parsed.filter((item) => typeof item === "string" && item.trim());
    }
  } catch {
    items = [];
  }
  try {
    fs.unlinkSync(filePath);
  } catch {
    // Ignore cleanup race.
  }
  return items;
}

function pollPrototypeMode() {
  const script = path.join(
    REPO_ROOT,
    "scripts",
    "hooks",
    "prototype-mode-poll.sh"
  );
  if (!fs.existsSync(script)) return "";
  try {
    return execFileSync("bash", [script], {
      cwd: REPO_ROOT,
      env: { ...process.env, CLAUDE_PROJECT_DIR: REPO_ROOT },
      encoding: "utf8",
      timeout: 4000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
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
      input = {};
    }
  }

  const messages = [];
  const protoNote = pollPrototypeMode();
  if (protoNote) messages.push(protoNote);

  for (const queued of drainQueuedReminders(input.conversationId)) {
    messages.push(queued);
  }

  const out = {
    injectSteps: messages.map((msg) => ({
      systemMessage: { systemMessage: msg },
    })),
  };
  process.stdout.write(JSON.stringify(out));
}

main().catch(() => {
  process.stdout.write(JSON.stringify({ injectSteps: [] }));
});
