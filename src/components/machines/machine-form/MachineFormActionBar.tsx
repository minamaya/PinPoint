import type React from "react";

/**
 * Cancel and the primary action (Save, or Create) at the foot of the machine
 * form.
 *
 * An ordinary row closing the form at every width: on a phone it scrolls with
 * the page rather than pinning above the app's tab bar (machine-editing 4.4,
 * design bible §3).
 */
export function MachineFormActionBar({
  status,
  children,
}: {
  /** Left-aligned note, such as the Manage tab's unsaved-changes line. */
  status?: React.ReactNode;
  /** The buttons, in reading order: Cancel, then the primary action. */
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      data-testid="machine-form-actions"
      className="flex items-center justify-end gap-3 pt-4"
    >
      {status ?? null}
      {children}
    </div>
  );
}
