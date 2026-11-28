/**
 * Regression guard for PP-bhd7.7 on `SwitchWithFormSupport` (exported as
 * `Switch` from `~/components/ui/switch`).
 *
 * The form-support Switch renders a hidden `<input>` so an *unchecked* toggle
 * can still submit an explicit "off" (a native unchecked checkbox submits
 * nothing, and the notification-preferences action needs to tell "off" apart
 * from "absent"). The defect: that hidden input rendered unconditionally, so a
 * *disabled* Switch also submitted a value — the opposite of a native disabled
 * checkbox, which is excluded from submission entirely. That silently
 * overwrote saved state (the Discord toggles while the account is unlinked),
 * and the original fix lived at one call site instead of in the component.
 *
 * These tests read the real constructed FormData set for a `<form>`, so they
 * exercise both the custom hidden input and Radix's own bubble input.
 *
 * They also guard PP-msjp: the Radix Root used to carry `name` too, so a
 * checked switch submitted the bubble's "on" *and* the hidden input's "on"
 * under one name — getAll(name) returned ["on", "on"]. The action reads
 * .get() (the first value), so it was latent, but a switch to .getAll() would
 * have been surprised. The Root is now nameless; the hidden input is the sole
 * carrier, so exactly one entry is submitted.
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { Switch } from "~/components/ui/switch";

function formDataFor(ui: React.ReactElement): FormData {
  const { container } = render(<form>{ui}</form>);
  const form = container.querySelector("form");
  if (!form) throw new Error("form not found");
  return new FormData(form);
}

function renderInForm(ui: React.ReactElement): {
  form: HTMLFormElement;
  toggle: HTMLElement;
  submittedValue: () => FormDataEntryValue | null;
  reset: () => void;
} {
  const { container, getByRole } = render(<form>{ui}</form>);
  const form = container.querySelector("form");
  if (!form) throw new Error("form not found");
  const toggle = getByRole("switch");
  return {
    form,
    toggle,
    submittedValue: () => new FormData(form).get("notify"),
    // `fireEvent.reset` dispatches the same `reset` event a native
    // `<form>.reset()` fires — the signal Radix's form listener acts on. One
    // test below drives it through a real reset button for the full path.
    reset: () => fireEvent.reset(form),
  };
}

describe("SwitchWithFormSupport form submission", () => {
  it("submits an explicit 'off' when enabled and unchecked", () => {
    // This is why the hidden input exists at all: a native unchecked checkbox
    // would submit nothing, but the action must distinguish "off" from absent.
    const data = formDataFor(<Switch name="notify" />);
    expect(data.get("notify")).toBe("off");
  });

  it("submits exactly one entry when enabled and checked (PP-msjp)", () => {
    // The Radix bubble input used to share the name, so a checked switch
    // emitted ["on", "on"] and getAll() saw both; .get() read only the first,
    // which is why the duplicate stayed latent. This is the one shape that
    // regresses: an *unchecked* Radix bubble submits nothing, so only the
    // checked case ever doubled up.
    const data = formDataFor(<Switch name="notify" defaultChecked />);
    expect(data.getAll("notify")).toEqual(["on"]);
  });

  it("contributes nothing to FormData when disabled", () => {
    const data = formDataFor(<Switch name="notify" defaultChecked disabled />);
    expect(data.has("notify")).toBe(false);
    expect(data.get("notify")).toBeNull();
  });

  it("contributes nothing when disabled and controlled (the production shape)", () => {
    // The notification form drives the Discord switch controlled
    // (checked={...} + disabled) rather than uncontrolled, so pin that shape.
    const data = formDataFor(
      <Switch
        name="notify"
        checked
        disabled
        onCheckedChange={() => undefined}
      />
    );
    expect(data.has("notify")).toBe(false);
  });

  it("emits no submission field when rendered without a name", () => {
    const data = formDataFor(<Switch defaultChecked />);
    expect([...data.keys()]).toHaveLength(0);
  });
});

describe("SwitchWithFormSupport native form reset (PP-r5xz)", () => {
  // PP-r5xz worried that because the hidden input's submitted value and the
  // visual toggle both derive from React state (not a real form control), a
  // native `<form>` reset — which only restores real controls to their HTML
  // defaults — would leave both stuck at the user's last value. It does not:
  // Radix's SwitchTrigger attaches a `reset` listener to the enclosing form
  // and calls its `setChecked` with the mount-time value, which fires this
  // wrapper's `onCheckedChange`, reverting the state that both the hidden
  // input and the visual read. So no listener of our own is needed (adding one
  // would duplicate Radix). These tests pin that behavior: it is the seam a
  // "simplification" that dropped the `onCheckedChange` wiring, or a Radix
  // change, could silently break. No consumer relies on switch form-reset today
  // (the bead flags it as latent), so this is a robustness guard, not a fix.
  //
  // Deliberately not covered: a `defaultChecked` prop mutated *after* mount
  // reverts to the mount-time default (frozen by both our `useState` and
  // Radix's initial ref), not the new one — a divergence from native semantics,
  // but mutable `defaultChecked` is an anti-pattern and it still reverts to a
  // default, never to the user's last value (which is the bead's actual claim).

  it("reverts an uncontrolled switch's value and visual to its default on reset", () => {
    const { toggle, submittedValue, reset } = renderInForm(
      <Switch name="notify" />
    );

    // Default off.
    expect(submittedValue()).toBe("off");

    // User turns it on.
    fireEvent.click(toggle);
    expect(submittedValue()).toBe("on");
    expect(toggle.getAttribute("aria-checked")).toBe("true");

    // Native reset restores the default — the hidden input value and the Radix
    // toggle revert together, because both read the same reverted state.
    reset();
    expect(submittedValue()).toBe("off");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("reverts on a real reset-button click, not only a dispatched event", () => {
    // The other cases use fireEvent.reset (the event alone); this drives the
    // full user path — a `<button type="reset">` click triggers the browser's
    // form-reset activation, which fires the `reset` event Radix listens for.
    const { container, getByRole } = render(
      <form>
        <Switch name="notify" />
        <button type="reset">Reset</button>
      </form>
    );
    const form = container.querySelector("form");
    if (!form) throw new Error("form not found");
    const toggle = getByRole("switch");
    const submitted = (): FormDataEntryValue | null =>
      new FormData(form).get("notify");

    fireEvent.click(toggle);
    expect(submitted()).toBe("on");
    expect(toggle.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(getByRole("button", { name: "Reset" }));
    expect(submitted()).toBe("off");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("reverts a defaultChecked switch back to checked on reset", () => {
    const { toggle, submittedValue, reset } = renderInForm(
      <Switch name="notify" defaultChecked />
    );

    fireEvent.click(toggle); // turn off
    expect(submittedValue()).toBe("off");
    expect(toggle.getAttribute("aria-checked")).toBe("false");

    reset();
    expect(submittedValue()).toBe("on");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("leaves a controlled switch untouched on reset (the parent owns its value)", () => {
    // A controlled switch's value is the parent's; a native reset must not
    // rewrite it behind the parent's back (that would desync parent and DOM).
    const { toggle, submittedValue, reset } = renderInForm(
      <Switch name="notify" checked onCheckedChange={() => undefined} />
    );

    expect(submittedValue()).toBe("on");

    reset();
    expect(submittedValue()).toBe("on");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });
});
