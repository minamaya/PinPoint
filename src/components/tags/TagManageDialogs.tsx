"use client";

import type React from "react";
import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { TagNameField } from "~/components/tags/TagNameField";
import type { TagActionResult } from "~/app/(app)/c/tags/schemas";

interface RenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  currentName: string;
  onRename: (name: string) => Promise<TagActionResult>;
}

/** Rename a tag or tag type; its page keeps its address (spec 11.8). */
export function TagRenameDialog({
  open,
  onOpenChange,
  ...form
}: RenameDialogProps): React.JSX.Element {
  const { currentName } = form;
  const [name, setName] = useState(currentName);

  // Each open starts from the current name.
  useEffect(() => {
    if (open) setName(currentName);
  }, [open, currentName]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      dirty={name !== currentName}
    >
      <DialogContent className="sm:max-w-sm">
        <RenameForm
          {...form}
          name={name}
          onNameChange={setName}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({
  title,
  currentName,
  onRename,
  name,
  onNameChange,
  onClose,
}: Omit<RenameDialogProps, "open" | "onOpenChange"> & {
  name: string;
  onNameChange: (name: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const id = useId();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await onRename(name);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="sr-only">
          A new name for {currentName}
        </DialogDescription>
      </DialogHeader>
      <TagNameField
        id={`${id}-name`}
        value={name}
        onChange={onNameChange}
        errorId={error === null ? undefined : `${id}-error`}
      />
      {error !== null ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-sm text-destructive-text"
        >
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" loading={pending} disabled={name.trim() === ""}>
          Rename
        </Button>
      </DialogFooter>
    </form>
  );
}

interface DeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onDelete: () => Promise<TagActionResult>;
  /** Where to go once the page being viewed no longer exists. */
  redirectTo: string;
}

/** Confirm deleting a tag or tag type; it cannot be undone (spec 11.9). */
export function TagDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onDelete,
  redirectTo,
}: DeleteDialogProps): React.JSX.Element {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove(): void {
    setError(null);
    startTransition(async () => {
      const result = await onDelete();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(redirectTo);
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return;
        if (next) setError(null);
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error !== null ? (
          <p role="alert" className="text-sm text-destructive-text">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            onClick={remove}
            loading={pending}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
