#!/usr/bin/env node
/**
 * Antigravity PreToolUse (call_mcp_tool|mcp_.*) guard for PinPoint.
 *
 * Fail-closed: malformed payloads or errors return `decision: "deny"`.
 * Enforces CORE-SEC-010 (Supabase write tools require `force_ask`) and
 * merge-channel rules (merge_pull_request / enable_pr_auto_merge denied).
 */

"use strict";

function respond(payload) {
  process.stdout.write(JSON.stringify(payload));
  process.exit(0);
}

function deny(reason) {
  respond({ decision: "deny", reason });
}

const DENY_TOOLS = ["merge_pull_request", "enable_pr_auto_merge"];

const ALWAYS_ASK_TOOLS = [
  "execute_sql",
  "apply_migration",
  "deploy_edge_function",
  "pause_project",
  "restore_project",
  "create_project",
  "delete_branch",
  "merge_branch",
  "rebase_branch",
  "reset_branch",
];

function matchesTool(candidate, target) {
  return new RegExp(`(?:^|_)${target}$`).test(candidate);
}

function evaluateMcpToolCall(input) {
  const callName = String(input?.toolCall?.name || "");
  const args = input?.toolCall?.args || {};

  let serverName;
  let toolName;
  if (callName === "call_mcp_tool") {
    serverName = String(args.ServerName || "");
    toolName = String(args.ToolName || "");
  } else if (callName.startsWith("mcp_")) {
    serverName = callName;
    toolName = callName;
  } else {
    return { decision: "allow" };
  }

  for (const blocked of DENY_TOOLS) {
    if (matchesTool(toolName, blocked)) {
      return {
        decision: "deny",
        reason: `Blocked by PinPoint MCP guard (${blocked}): use \`gh pr merge <PR> --squash\` when Tim asks to merge.`,
      };
    }
  }

  for (const askTool of ALWAYS_ASK_TOOLS) {
    if (matchesTool(toolName, askTool)) {
      return {
        decision: "force_ask",
        reason: `PinPoint MCP guard (CORE-SEC-010) requires explicit confirmation for ${askTool}.`,
      };
    }
  }

  if (matchesTool(toolName, "create_branch") && !/github/i.test(serverName)) {
    return {
      decision: "force_ask",
      reason:
        "PinPoint MCP guard (CORE-SEC-010) requires explicit confirmation for non-GitHub create_branch.",
    };
  }

  return { decision: "allow" };
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) {
    raw += chunk;
  }
  if (!raw.trim()) {
    deny("pinpoint pre-tool-mcp-guard failed closed: empty hook payload.");
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    deny("pinpoint pre-tool-mcp-guard failed closed: malformed JSON payload.");
  }

  respond(evaluateMcpToolCall(input));
}

main().catch((err) => {
  deny(
    `pinpoint pre-tool-mcp-guard failed closed: ${err instanceof Error ? err.message : String(err)}`
  );
});
