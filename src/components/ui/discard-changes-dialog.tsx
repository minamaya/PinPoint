"use client";

import * as React from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";

export interface DiscardChangesDialogProps {
  open: boolean;
  /** Escape, "Keep editing", or anything else that backs out of the confirm. */
  onKeepEditing: () => void;
  onDiscard: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  discardLabel?: string;
  keepEditingLabel?: string;
  onCloseAutoFocus?: React.ComponentProps<
    typeof AlertDialogContent
  >["onCloseAutoFocus"];
}

/**
 * The one "Discard changes?" confirm (design-bible §17). Modals reach it
 * through the `dirty` prop on Dialog, Sheet and Drawer; pages reach it through
 * `useUnsavedChangesGuard`. Both render this component so the copy and the
 * buttons never drift.
 */
export function DiscardChangesDialog({
  open,
  onKeepEditing,
  onDiscard,
  title = "Discard changes?",
  description = "Unsaved changes will be lost.",
  discardLabel = "Discard",
  keepEditingLabel = "Keep editing",
  onCloseAutoFocus,
}: DiscardChangesDialogProps): React.JSX.Element {
  // Radix closes the alert on every button, so its `onOpenChange(false)` also
  // follows a Discard click. `discarded` keeps that from reading as Keep editing.
  const discarded = React.useRef(false);
  React.useEffect(() => {
    if (open) discarded.current = false;
  }, [open]);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        if (discarded.current) {
          discarded.current = false;
          return;
        }
        onKeepEditing();
      }}
    >
      <AlertDialogContent
        {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}
        data-testid="discard-changes-dialog"
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{keepEditingLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              discarded.current = true;
              onDiscard();
            }}
          >
            {discardLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
