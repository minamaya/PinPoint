"use client";

import type React from "react";
import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import { TagNameField } from "~/components/tags/TagNameField";
import { createTagTypeAction } from "~/app/(app)/c/tags/actions";

interface AddTagTypeDialogProps {
  /** Opens from the Tags page's Add tag type… action (spec 11.12). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where focus goes when the dialog closes (useReturnFocus). */
  onCloseAutoFocus?: ((event: Event) => void) | undefined;
}

/** "Add tag type" on the tag browse (spec 11.1, 11.12). */
export function AddTagTypeDialog({
  open,
  onOpenChange,
  onCloseAutoFocus,
}: AddTagTypeDialogProps): React.JSX.Element {
  const [name, setName] = useState("");
  const [exclusive, setExclusive] = useState(false);

  // Each open starts clean.
  useEffect(() => {
    if (open) {
      setName("");
      setExclusive(false);
    }
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      dirty={name !== "" || exclusive}
    >
      <DialogContent
        className="sm:max-w-sm"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <AddTagTypeForm
          name={name}
          onNameChange={setName}
          exclusive={exclusive}
          onExclusiveChange={setExclusive}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function AddTagTypeForm({
  name,
  onNameChange,
  exclusive,
  onExclusiveChange,
  onClose,
}: {
  name: string;
  onNameChange: (name: string) => void;
  exclusive: boolean;
  onExclusiveChange: (exclusive: boolean) => void;
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
      const result = await createTagTypeAction({ name, exclusive });
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
        <DialogTitle>Add tag type</DialogTitle>
        <DialogDescription>
          A kind of tag, like Location or Features.
        </DialogDescription>
      </DialogHeader>
      <TagNameField
        id={`${id}-name`}
        value={name}
        onChange={onNameChange}
        errorId={error === null ? undefined : `${id}-error`}
      />
      <div className="flex items-start gap-3">
        <Checkbox
          id={`${id}-exclusive`}
          checked={exclusive}
          onCheckedChange={(checked) => onExclusiveChange(checked === true)}
          aria-describedby={`${id}-exclusive-hint`}
          className="mt-0.5"
        />
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-exclusive`}>One per machine</Label>
          <p
            id={`${id}-exclusive-hint`}
            className="text-xs text-muted-foreground"
          >
            A machine can hold only one of its tags.
          </p>
        </div>
      </div>
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
          Add tag type
        </Button>
      </DialogFooter>
    </form>
  );
}
