import * as React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationsDirtyStateProvider } from "../integrations-dirty-state";
import { DiscordConfigForm } from "./discord-config-form";

const refreshMock = vi.fn();
const pushMock = vi.fn();
const clearBotTokenMock = vi.fn();
const validateBotTokenMock = vi.fn();
const validateServerIdMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: pushMock }),
}));

vi.mock("./actions", () => ({
  saveDiscordConfigAction: vi.fn(),
  clearDiscordBotTokenAction: () => clearBotTokenMock(),
  validateBotToken: (...args: unknown[]) => validateBotTokenMock(...args),
  validateServerId: (...args: unknown[]) => validateServerIdMock(...args),
}));

describe("DiscordConfigForm on the combined page", () => {
  beforeEach(() => {
    refreshMock.mockReset();
    pushMock.mockReset();
    clearBotTokenMock.mockReset();
    validateBotTokenMock.mockReset();
    validateServerIdMock.mockReset();
  });

  it("retains its validation behavior and resets only its own controlled state", async () => {
    const user = userEvent.setup();
    validateBotTokenMock.mockResolvedValue({
      ok: true,
      botUsername: "pinpoint-bot",
    });
    render(
      <IntegrationsDirtyStateProvider>
        <DiscordConfigForm
          guildId="1084526293445124096"
          inviteLink="https://discord.gg/pinpoint"
          hasToken
        />
      </IntegrationsDirtyStateProvider>
    );

    const token = screen.getByLabelText(/Bot token/);
    const serverId = screen.getByLabelText(/Server ID/);
    const inviteLink = screen.getByLabelText(/Invite link/);
    await user.type(token, "replacement-token");
    await user.clear(serverId);
    await user.type(serverId, "999999999999999999");
    await user.clear(inviteLink);
    await user.type(inviteLink, "https://discord.gg/changed");
    const [validateTokenButton] = screen.getAllByRole("button", {
      name: "Validate",
    });
    if (!validateTokenButton)
      throw new Error("Validate token button not found");
    await user.click(validateTokenButton);
    expect(
      await screen.findByText("Token valid. Bot logs in as @pinpoint-bot.")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset" }));

    expect(token).toHaveValue("");
    expect(serverId).toHaveValue("1084526293445124096");
    expect(inviteLink).toHaveValue("https://discord.gg/pinpoint");
    expect(
      screen.queryByText("Token valid. Bot logs in as @pinpoint-bot.")
    ).not.toBeInTheDocument();
  });

  it("shows plain 'Token valid.' when Discord gives no bot name", async () => {
    const user = userEvent.setup();
    validateBotTokenMock.mockResolvedValue({ ok: true });
    render(
      <IntegrationsDirtyStateProvider>
        <DiscordConfigForm guildId="" inviteLink="" hasToken />
      </IntegrationsDirtyStateProvider>
    );

    await user.type(screen.getByLabelText(/Bot token/), "some-token");
    const [validateTokenButton] = screen.getAllByRole("button", {
      name: "Validate",
    });
    if (!validateTokenButton)
      throw new Error("Validate token button not found");
    await user.click(validateTokenButton);

    expect(await screen.findByText("Token valid.")).toBeInTheDocument();
  });

  it("hides Remove saved token when no token is saved", () => {
    render(
      <IntegrationsDirtyStateProvider>
        <DiscordConfigForm guildId="" inviteLink="" hasToken={false} />
      </IntegrationsDirtyStateProvider>
    );

    expect(
      screen.queryByRole("button", { name: "Remove saved token" })
    ).not.toBeInTheDocument();
  });

  it("opens Remove token confirmation and cancels without calling action", async () => {
    const user = userEvent.setup();
    render(
      <IntegrationsDirtyStateProvider>
        <DiscordConfigForm guildId="" inviteLink="" hasToken />
      </IntegrationsDirtyStateProvider>
    );

    await user.click(
      screen.getByRole("button", { name: "Remove saved token" })
    );
    expect(clearBotTokenMock).not.toHaveBeenCalled();

    const dialog = screen.getByRole("alertdialog", {
      name: "Remove the Discord bot token?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(clearBotTokenMock).not.toHaveBeenCalled();
  });

  it("confirms token removal: calls clearDiscordBotTokenAction and handles success vs error", async () => {
    const user = userEvent.setup();
    clearBotTokenMock.mockResolvedValueOnce({ ok: true });
    render(
      <IntegrationsDirtyStateProvider>
        <DiscordConfigForm guildId="" inviteLink="" hasToken />
      </IntegrationsDirtyStateProvider>
    );

    await user.click(
      screen.getByRole("button", { name: "Remove saved token" })
    );
    await user.click(screen.getByRole("button", { name: "Remove token" }));

    expect(clearBotTokenMock).toHaveBeenCalledTimes(1);
    expect(refreshMock).toHaveBeenCalledTimes(1);

    clearBotTokenMock.mockReset();
    refreshMock.mockReset();
    clearBotTokenMock.mockResolvedValueOnce({
      ok: false,
      message: "The saved token changed.",
    });

    await user.click(
      screen.getByRole("button", { name: "Remove saved token" })
    );
    await user.click(screen.getByRole("button", { name: "Remove token" }));

    expect(
      await screen.findByText("The saved token changed.")
    ).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
