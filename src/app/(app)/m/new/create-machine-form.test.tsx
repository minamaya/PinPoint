import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPortal } from "react-dom";

import { CreateMachineForm } from "./create-machine-form";
import { createMachineAction } from "~/app/(app)/m/actions";
import { getIscoredGamesAction } from "~/app/(app)/m/iscored-actions";
import { err } from "~/lib/result";
import type { OwnerSelectUser } from "~/components/machines/OwnerSelect";

vi.mock("~/app/(app)/m/actions", () => ({
  createMachineAction: vi.fn(),
}));

vi.mock("~/app/(app)/m/iscored-actions", () => ({
  getIscoredGamesAction: vi.fn(),
}));

vi.mock("~/components/editor/RichTextEditorDynamic", () => ({
  RichTextEditor: () => <div data-testid="mock-rich-text-editor" />,
}));

const nestedInviteSubmitted = vi.hoisted(() => vi.fn());

vi.mock("~/components/machines/OwnerSelect", async () => {
  const { useState } = await import("react");
  return {
    OwnerSelect: ({
      users,
      onValueChange,
    }: {
      users: OwnerSelectUser[];
      onValueChange?: (id: string) => void;
    }) => {
      const [selectedId, setSelectedId] = useState("");
      const [inviteOpen, setInviteOpen] = useState(false);
      return (
        <div data-testid="mock-owner-select">
          <select
            name="ownerId"
            aria-label="Machine Owner"
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
              onValueChange?.(e.target.value);
            }}
          >
            <option value="">Select an owner</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setInviteOpen(true)}>
            Open nested invite
          </button>
          {inviteOpen &&
            createPortal(
              <form
                data-testid="mock-portalled-invite-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  nestedInviteSubmitted();
                }}
              >
                <button type="submit">Submit nested invite</button>
              </form>,
              document.body
            )}
        </div>
      );
    },
  };
});

// Reports its preselected title the way the real field does on mount, so the
// Pinball Map block in Integrations sees it.
vi.mock("~/components/machines/PinballMapLinkField", async () => {
  const { useEffect } = await import("react");
  return {
    PinballMapLinkField: ({
      defaultMachineId = null,
      onSelectionChange,
    }: {
      defaultMachineId?: number | null;
      onSelectionChange?: (s: {
        manual: boolean;
        pinballmapMachineId: number | null;
      }) => void;
    }) => {
      useEffect(() => {
        onSelectionChange?.({
          manual: false,
          pinballmapMachineId: defaultMachineId,
        });
      }, [defaultMachineId, onSelectionChange]);
      return (
        <div
          data-testid="mock-pbm-link-field"
          data-default-id={defaultMachineId ?? ""}
        />
      );
    },
  };
});

vi.mock("~/app/(app)/m/pinballmap-actions", () => ({
  getPinballMapTitleIcEligibleAction: vi.fn().mockResolvedValue(false),
}));

describe("CreateMachineForm — iScored picker integration", () => {
  const mockGames = [
    { gameId: "77956", gameName: "Medieval Madness" },
    { gameId: "104656", gameName: "Demolition Man" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getIscoredGamesAction).mockResolvedValue({ games: mockGames });
    vi.mocked(createMachineAction).mockResolvedValue({
      ok: true,
      value: {
        machineId: "mock-machine-uuid",
        redirectTo: "/m/MM",
      },
    });
  });

  it("does not render iScored picker when iscoredConfigured is false or omitted", () => {
    render(<CreateMachineForm allUsers={[]} canSelectOwner={false} />);
    expect(
      screen.queryByTestId("iscored-game-picker-trigger")
    ).not.toBeInTheDocument();
  });

  it("renders iScored picker when iscoredConfigured is true", async () => {
    render(
      <CreateMachineForm
        allUsers={[]}
        canSelectOwner={false}
        iscoredConfigured={true}
      />
    );

    await waitFor(() => {
      expect(getIscoredGamesAction).toHaveBeenCalled();
    });

    expect(
      screen.getByTestId("iscored-game-picker-trigger")
    ).toBeInTheDocument();
  });

  it("submits selected iScored game ID with form submission", async () => {
    const user = userEvent.setup();
    render(
      <CreateMachineForm
        allUsers={[]}
        canSelectOwner={false}
        iscoredConfigured={true}
      />
    );

    // Fill required fields
    await user.type(screen.getByLabelText(/Machine Name/), "Medieval Madness");
    await user.type(screen.getByLabelText(/Initials/), "MM");

    // Open picker and choose Demolition Man (#104656)
    await user.click(screen.getByTestId("iscored-game-picker-trigger"));
    const option = await screen.findByTestId("iscored-game-option-104656");
    await user.click(option);

    // Submit form
    await user.click(screen.getByRole("button", { name: /Create Machine/i }));

    await waitFor(() => {
      expect(createMachineAction).toHaveBeenCalled();
    });

    const fd = vi.mocked(createMachineAction).mock.calls[0]?.[1];
    expect(fd).toBeInstanceOf(FormData);
    expect(fd?.get("name")).toBe("Medieval Madness");
    expect(fd?.get("initials")).toBe("MM");
    expect(fd?.get("iscoredGameId")).toBe("104656");
  });

  it("resets name and initials inputs on successful submission", async () => {
    const user = userEvent.setup();
    render(<CreateMachineForm allUsers={[]} canSelectOwner={false} />);

    const nameInput = screen.getByLabelText(/Machine Name/);
    const initialsInput = screen.getByLabelText(/Initials/);

    await user.type(nameInput, "Medieval Madness");
    await user.type(initialsInput, "MM");

    expect(nameInput).toHaveValue("Medieval Madness");
    expect(initialsInput).toHaveValue("MM");

    await user.click(screen.getByRole("button", { name: /Create Machine/i }));

    await waitFor(() => {
      expect(createMachineAction).toHaveBeenCalled();
    });

    // After success, the form's useEffect calls resetForm() which clears inputs
    await waitFor(() => {
      expect(nameInput).toHaveValue("");
      expect(initialsInput).toHaveValue("");
    });
  });
});

describe("CreateMachineForm — opened from a lineup entry (pinballmap 4.11)", () => {
  const pinballmap = {
    configured: true,
    locationName: "Austin Pinball Collective",
    canSetIntent: true,
    canAddAfterCreate: true,
    lineup: [],
  };

  it("prefills the name and title, and starts the lineup intent On", async () => {
    render(
      <CreateMachineForm
        allUsers={[]}
        canSelectOwner={false}
        pinballmap={pinballmap}
        initialName="Godzilla"
        initialPinballmap={{ id: 3416, name: "Godzilla (Premium)" }}
      />
    );

    expect(screen.getByLabelText(/Machine Name/)).toHaveValue("Godzilla");
    expect(screen.getByTestId("mock-pbm-link-field")).toHaveAttribute(
      "data-default-id",
      "3416"
    );
    expect(
      await screen.findByRole("radio", { name: "On the lineup" })
    ).toHaveAttribute("aria-checked", "true");
  });

  it("starts Off when opened directly", async () => {
    render(
      <CreateMachineForm
        allUsers={[]}
        canSelectOwner={false}
        pinballmap={pinballmap}
      />
    );

    expect(
      await screen.findByText("Lineup choice needs a model")
    ).toBeInTheDocument();
  });
});

describe("CreateMachineForm — a failed create must not revert Availability (PP-1ajq)", () => {
  it("keeps the chosen Availability after the action fails", async () => {
    vi.mocked(createMachineAction).mockResolvedValue({
      ok: false,
      code: "VALIDATION",
      message: "Initials are already taken.",
    });

    const user = userEvent.setup();
    render(<CreateMachineForm allUsers={[]} canSelectOwner={false} />);

    await user.type(screen.getByLabelText(/Machine Name/), "Twilight Zone");
    await user.type(screen.getByLabelText(/Initials/), "TZ");

    const availabilityTrigger = screen.getByLabelText("Availability");
    await user.click(availabilityTrigger);
    await user.click(screen.getByRole("option", { name: "Pending Arrival" }));
    expect(availabilityTrigger).toHaveTextContent("Pending Arrival");

    await user.click(screen.getByRole("button", { name: /Create Machine/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Initials are already taken.")
      ).toBeInTheDocument();
    });

    // Let React's post-action reset commit before asserting it didn't land.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(availabilityTrigger).toHaveTextContent("Pending Arrival");
  });
});

describe("CreateMachineForm — promote guest dialog and nested invite form", () => {
  const guestUser: OwnerSelectUser = {
    id: "guest-1",
    name: "Guest Owner",
    lastName: "Owner",
    machineCount: 0,
    status: "active",
    role: "guest",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens the promote dialog on ASSIGNEE_NOT_MEMBER and closes on Cancel without re-submitting", async () => {
    vi.mocked(createMachineAction).mockResolvedValueOnce(
      err("ASSIGNEE_NOT_MEMBER", "Selected owner is a guest.", {
        assignee: {
          id: guestUser.id,
          name: guestUser.name,
          role: "guest",
          type: "active",
        },
      })
    );

    const user = userEvent.setup();
    render(<CreateMachineForm allUsers={[guestUser]} canSelectOwner={true} />);

    await user.type(screen.getByLabelText(/Machine Name/), "Black Knight");
    await user.type(screen.getByLabelText(/Initials/), "BK");
    await user.selectOptions(
      screen.getByLabelText("Machine Owner"),
      guestUser.id
    );
    await user.click(screen.getByRole("button", { name: /Create Machine/i }));

    const dialog = await screen.findByRole("dialog", {
      name: /Promote to member and assign/i,
    });
    expect(within(dialog).getByText("Guest Owner")).toBeInTheDocument();
    expect(within(dialog).getByText("(GUEST)")).toBeInTheDocument();
    expect(createMachineAction).toHaveBeenCalledTimes(1);

    await user.click(within(dialog).getByRole("button", { name: /Cancel/i }));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", {
          name: /Promote to member and assign/i,
        })
      ).not.toBeInTheDocument();
    });
    expect(createMachineAction).toHaveBeenCalledTimes(1);
  });

  it("shows (INVITED · GUEST) badge when assignee is an invited guest", async () => {
    vi.mocked(createMachineAction).mockResolvedValueOnce(
      err("ASSIGNEE_NOT_MEMBER", "Selected owner is a guest.", {
        assignee: {
          id: "invited-guest-1",
          name: "Invited Guest",
          role: "guest",
          type: "invited",
        },
      })
    );

    const user = userEvent.setup();
    render(<CreateMachineForm allUsers={[guestUser]} canSelectOwner={true} />);

    await user.type(screen.getByLabelText(/Machine Name/), "Black Knight");
    await user.type(screen.getByLabelText(/Initials/), "BK");
    await user.selectOptions(
      screen.getByLabelText("Machine Owner"),
      guestUser.id
    );
    await user.click(screen.getByRole("button", { name: /Create Machine/i }));

    const dialog = await screen.findByRole("dialog", {
      name: /Promote to member and assign/i,
    });
    expect(within(dialog).getByText("(INVITED · GUEST)")).toBeInTheDocument();
  });

  it("re-submits full FormData with forcePromoteUserId on confirm", async () => {
    vi.mocked(createMachineAction)
      .mockResolvedValueOnce(
        err("ASSIGNEE_NOT_MEMBER", "Selected owner is a guest.", {
          assignee: {
            id: guestUser.id,
            name: guestUser.name,
            role: "guest",
            type: "active",
          },
        })
      )
      .mockResolvedValueOnce({
        ok: true,
        value: { machineId: "m-new", redirectTo: "/m/BK" },
      });

    const user = userEvent.setup();
    render(<CreateMachineForm allUsers={[guestUser]} canSelectOwner={true} />);

    await user.type(screen.getByLabelText(/Machine Name/), "Black Knight");
    await user.type(screen.getByLabelText(/Initials/), "BK");
    await user.selectOptions(
      screen.getByLabelText("Machine Owner"),
      guestUser.id
    );
    await user.click(screen.getByRole("button", { name: /Create Machine/i }));

    const dialog = await screen.findByRole("dialog", {
      name: /Promote to member and assign/i,
    });
    await user.click(
      within(dialog).getByRole("button", { name: /Promote and assign/i })
    );

    await waitFor(() => {
      expect(createMachineAction).toHaveBeenCalledTimes(2);
    });

    const secondFd = vi.mocked(createMachineAction).mock.calls[1]?.[1];
    expect(secondFd).toBeInstanceOf(FormData);
    expect(secondFd?.get("name")).toBe("Black Knight");
    expect(secondFd?.get("initials")).toBe("BK");
    expect(secondFd?.get("ownerId")).toBe(guestUser.id);
    expect(secondFd?.get("forcePromoteUserId")).toBe(guestUser.id);
  });

  it("ignores form submissions bubbling from a portalled nested invite form", async () => {
    const user = userEvent.setup();
    render(<CreateMachineForm allUsers={[guestUser]} canSelectOwner={true} />);

    await user.click(
      screen.getByRole("button", { name: "Open nested invite" })
    );
    await user.click(
      screen.getByRole("button", { name: "Submit nested invite" })
    );

    expect(nestedInviteSubmitted).toHaveBeenCalledTimes(1);
    expect(createMachineAction).not.toHaveBeenCalled();
  });
});
