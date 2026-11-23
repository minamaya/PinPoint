import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock createAdminClient so we don't hit a real Supabase instance.
// vi.mock() is hoisted above all imports, so a file-scope `const rpcMock`
// would still be uninitialized (in the TDZ) when the factory runs, and
// accessing it would throw. vi.hoisted() places the mock fn initializer
// in the same hoist bucket as vi.mock(), guaranteeing rpcMock is
// initialized before the factory closure uses it.
const { rpcMock, maybeSingleMock, eqMock, selectMock, fromMock } = vi.hoisted(
  () => {
    const maybeSingleMock = vi.fn();
    const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
    const selectMock = vi.fn(() => ({ eq: eqMock }));
    const fromMock = vi.fn(() => ({ select: selectMock }));
    return {
      rpcMock: vi.fn(),
      maybeSingleMock,
      eqMock,
      selectMock,
      fromMock,
    };
  }
);
vi.mock("~/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: rpcMock, from: fromMock }),
}));

import {
  getDiscordBotToken,
  getDiscordConfig,
  isDiscordIntegrationConfigured,
} from "~/lib/discord/config";

describe("getDiscordConfig", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("returns null when RPC yields no rows", async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    await expect(getDiscordConfig()).resolves.toBeNull();
  });

  it("returns null when the server ID is missing", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          guild_id: null,
          invite_link: null,
          bot_token: null,
          bot_health_status: "unknown",
          last_bot_check_at: null,
          updated_at: "2026-04-20T00:00:00Z",
        },
      ],
      error: null,
    });
    await expect(getDiscordConfig()).resolves.toBeNull();
  });

  it("returns null when the bot token is missing", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          guild_id: "123",
          invite_link: null,
          bot_token: null,
          bot_health_status: "unknown",
          last_bot_check_at: null,
          updated_at: "2026-04-20T00:00:00Z",
        },
      ],
      error: null,
    });
    await expect(getDiscordConfig()).resolves.toBeNull();
  });

  it("returns a typed DiscordConfig when server ID and token are set", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          guild_id: "123",
          invite_link: "https://discord.gg/abc",
          bot_token: "secret-token",
          bot_health_status: "healthy",
          last_bot_check_at: "2026-04-20T00:00:00Z",
          updated_at: "2026-04-20T00:00:00Z",
        },
      ],
      error: null,
    });
    const config = await getDiscordConfig();
    expect(config).not.toBeNull();
    expect(config?.guildId).toBe("123");
    expect(config?.botToken).toBe("secret-token");
  });

  it("throws when the RPC returns an error", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "rpc failed" },
    });
    await expect(getDiscordConfig()).rejects.toThrow(/rpc failed/);
  });

  it("returns a token for independently configured consumers without a server ID", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          guild_id: null,
          invite_link: null,
          bot_token: "region-alert-token",
          bot_health_status: "unknown",
          last_bot_check_at: null,
          updated_at: "2026-04-20T00:00:00Z",
        },
      ],
      error: null,
    });
    await expect(getDiscordBotToken()).resolves.toBe("region-alert-token");
  });
});

describe("isDiscordIntegrationConfigured", () => {
  beforeEach(() => {
    maybeSingleMock.mockReset();
    fromMock.mockClear();
    selectMock.mockClear();
    eqMock.mockClear();
  });

  it("returns false when query returns null data or an error", async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    await expect(isDiscordIntegrationConfigured()).resolves.toBe(false);
    expect(fromMock).toHaveBeenCalledWith("discord_integration_config");
    expect(selectMock).toHaveBeenCalledWith("guild_id, bot_token_vault_id");
    expect(eqMock).toHaveBeenCalledWith("id", "singleton");

    maybeSingleMock.mockResolvedValueOnce({
      data: { guild_id: "123", bot_token_vault_id: "vault-1" },
      error: { message: "rls failure" },
    });
    await expect(isDiscordIntegrationConfigured()).resolves.toBe(false);
  });

  it("returns false when guild_id or bot_token_vault_id is missing", async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: { guild_id: null, bot_token_vault_id: "vault-1" },
      error: null,
    });
    await expect(isDiscordIntegrationConfigured()).resolves.toBe(false);

    maybeSingleMock.mockResolvedValueOnce({
      data: { guild_id: "123", bot_token_vault_id: null },
      error: null,
    });
    await expect(isDiscordIntegrationConfigured()).resolves.toBe(false);
  });

  it("returns true when both guild_id and bot_token_vault_id are set", async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: { guild_id: "123", bot_token_vault_id: "vault-1" },
      error: null,
    });
    await expect(isDiscordIntegrationConfigured()).resolves.toBe(true);
  });

  it("fails closed (returns false) when the query throws", async () => {
    maybeSingleMock.mockRejectedValueOnce(new Error("network timeout"));
    await expect(isDiscordIntegrationConfigured()).resolves.toBe(false);
  });
});
