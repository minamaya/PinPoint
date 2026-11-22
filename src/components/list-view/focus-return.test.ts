import { afterEach, describe, expect, it } from "vitest";
import {
  markFocusReturn,
  returnFocusTo,
  takeFocusReturn,
} from "./focus-return";

function button(): HTMLButtonElement {
  const element = document.createElement("button");
  document.body.append(element);
  return element;
}

/** Marks for focus handed back to a control (NameTooltip). */
describe("focus-return", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("marks the focus that follows at once, for that focus only", () => {
    const element = button();
    markFocusReturn(element);
    expect(takeFocusReturn(element)).toBe(true);
    expect(takeFocusReturn(element)).toBe(false);
  });

  it("lets a mark the focus never took lapse before any later arrival", async () => {
    const element = button();
    // As when Radix decides not to refocus the trigger after all.
    markFocusReturn(element);
    await Promise.resolve();
    expect(takeFocusReturn(element)).toBe(false);
  });

  it("does not mark an element that already has focus, which gets no focus event", () => {
    const element = button();
    element.focus();
    returnFocusTo(element);
    expect(element).toHaveFocus();
    expect(takeFocusReturn(element)).toBe(false);
  });

  it("hands focus back with the given options", () => {
    const element = button();
    let taken = false;
    element.addEventListener("focus", () => {
      taken = takeFocusReturn(element);
    });
    returnFocusTo(element, { preventScroll: true });
    expect(element).toHaveFocus();
    expect(taken).toBe(true);
  });
});
