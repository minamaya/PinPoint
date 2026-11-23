import React, { createRef } from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MentionList, type MentionListRef } from "./MentionList";

const USERS = [
  { id: "u-1", name: "Alice Smith", avatarUrl: null },
  { id: "u-2", name: "Bob Jones", avatarUrl: null },
  { id: "u-3", name: "Carol Vance", avatarUrl: null },
];

function pressKey(
  ref: React.RefObject<MentionListRef | null>,
  key: string
): boolean {
  let handled = false;
  act(() => {
    handled =
      ref.current?.onKeyDown({
        event: new KeyboardEvent("keydown", { key }),
      }) ?? false;
  });
  return handled;
}

describe("MentionList", () => {
  it("shows empty notice when no users match", () => {
    render(<MentionList items={[]} command={vi.fn()} />);
    expect(screen.getByText("No users found")).toBeInTheDocument();
  });

  it("calls command with id and label when clicking a user", () => {
    const command = vi.fn();
    render(<MentionList items={USERS} command={command} />);

    expect(screen.getByText("AS")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Bob Jones/ }));

    expect(command).toHaveBeenCalledExactlyOnceWith({
      id: "u-2",
      label: "Bob Jones",
    });
  });

  it("supports ArrowDown, ArrowUp wrapping, and Enter selection via ref.onKeyDown", () => {
    const command = vi.fn();
    const ref = createRef<MentionListRef>();
    const { rerender } = render(
      <MentionList ref={ref} items={USERS} command={command} />
    );

    // Starts at index 0; ArrowUp wraps to the last item (Carol Vance).
    expect(pressKey(ref, "ArrowUp")).toBe(true);
    expect(pressKey(ref, "Enter")).toBe(true);
    expect(command).toHaveBeenLastCalledWith({
      id: "u-3",
      label: "Carol Vance",
    });

    // ArrowDown wraps back to index 0 (Alice Smith), then moves to Bob Jones.
    expect(pressKey(ref, "ArrowDown")).toBe(true);
    expect(pressKey(ref, "ArrowDown")).toBe(true);
    expect(pressKey(ref, "Enter")).toBe(true);
    expect(command).toHaveBeenLastCalledWith({
      id: "u-2",
      label: "Bob Jones",
    });

    // Unhandled keys fall through.
    expect(pressKey(ref, "Escape")).toBe(false);

    // Changing items resets selection back to index 0.
    rerender(
      <MentionList ref={ref} items={[USERS[0], USERS[2]]} command={command} />
    );
    expect(pressKey(ref, "Enter")).toBe(true);
    expect(command).toHaveBeenLastCalledWith({
      id: "u-1",
      label: "Alice Smith",
    });
  });
});
