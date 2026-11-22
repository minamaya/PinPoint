"use client";

import * as React from "react";

import { DiscardChangesDialog } from "~/components/ui/discard-changes-dialog";

/**
 * One dismissal standard for every modal that holds user input (design-bible
 * §17, CORE-UI-008). A Dialog, Sheet or Drawer opts in with `dirty`:
 *
 * - A click outside the modal does nothing.
 * - With unsaved changes, Escape, the close X, Cancel (a `DialogClose`) and a
 *   swipe-down on a Drawer open "Discard changes?" instead of closing.
 * - With none, they close at once.
 *
 * Closing from code (`setOpen(false)` after a save) is never guarded.
 */
export interface ModalDismissalProps {
  /**
   * Opts the modal into the standard and says whether it has unsaved changes.
   * Pass a boolean on every render: leaving it out makes the modal a plain one
   * that an outside click dismisses.
   */
  dirty?: boolean | undefined;
  /**
   * Runs when the user confirms Discard, just before the modal closes. Reset
   * the draft here when it lives outside the modal's own content.
   */
  onDiscard?: (() => void) | undefined;
}

interface ModalDismissalContextValue {
  /** Set by DrawerContent so a refused swipe can snap the drawer back. */
  closeBlockedRef: React.RefObject<(() => void) | null>;
}

const ModalDismissalContext =
  React.createContext<ModalDismissalContextValue | null>(null);

/** Non-null inside a modal that opted in; its Content reads it to ignore outside clicks. */
export function useModalDismissal(): ModalDismissalContextValue | null {
  return React.useContext(ModalDismissalContext);
}

/**
 * Props for a modal Content part: an outside click or focus move is ignored
 * when the modal opted in, after the caller's own handler has run.
 */
export function useIgnoreOutsideInteraction<
  E extends { preventDefault: () => void },
>(
  onInteractOutside: ((event: E) => void) | undefined
): ((event: E) => void) | undefined {
  const guard = useModalDismissal();
  return React.useMemo(() => {
    if (!guard) return onInteractOutside;
    return (event: E) => {
      onInteractOutside?.(event);
      event.preventDefault();
    };
  }, [guard, onInteractOutside]);
}

/**
 * Wraps a plain (non-opted-in) modal so a guarded modal around it does not
 * make its Content ignore outside clicks too: context flows through portals.
 */
export function UnguardedModal({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <ModalDismissalContext.Provider value={null}>
      {children}
    </ModalDismissalContext.Provider>
  );
}

interface RootProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface GuardedModalProps extends ModalDismissalProps {
  open: boolean | undefined;
  defaultOpen: boolean | undefined;
  onOpenChange: ((open: boolean) => void) | undefined;
  /** Renders the primitive's Root with the guarded open state. */
  children: (root: RootProps) => React.ReactNode;
}

/**
 * Shared by Dialog, Sheet and Drawer when `dirty` is passed. Owns the open
 * state (so it works controlled or uncontrolled), turns a close request on a
 * dirty modal into the discard confirm, and renders that confirm beside Root.
 */
export function GuardedModal({
  dirty,
  onDiscard,
  open: openProp,
  defaultOpen,
  onOpenChange,
  children,
}: GuardedModalProps): React.JSX.Element {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(
    defaultOpen ?? false
  );
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const closeBlockedRef = React.useRef<(() => void) | null>(null);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : uncontrolledOpen;

  // The confirm belongs to one open modal: closing it from code takes it down.
  React.useEffect(() => {
    if (!open) setConfirmOpen(false);
  }, [open]);

  const setOpen = React.useCallback(
    (next: boolean): void => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );

  const handleOpenChange = React.useCallback(
    (next: boolean): void => {
      if (!next && dirty === true) {
        setConfirmOpen(true);
        closeBlockedRef.current?.();
        return;
      }
      setOpen(next);
    },
    [dirty, setOpen]
  );

  const context = React.useMemo(() => ({ closeBlockedRef }), []);

  return (
    <ModalDismissalContext.Provider value={context}>
      {children({ open, onOpenChange: handleOpenChange })}
      <DiscardChangesDialog
        open={confirmOpen && open}
        onKeepEditing={() => setConfirmOpen(false)}
        onDiscard={() => {
          setConfirmOpen(false);
          onDiscard?.();
          setOpen(false);
        }}
      />
    </ModalDismissalContext.Provider>
  );
}
