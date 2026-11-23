"use client";

import { useCallback, useRef, useState } from "react";

export interface FormDirtyProps {
  ref: (form: HTMLFormElement | null) => void;
  onInput: () => void;
  onChange: () => void;
  onReset: () => void;
}

export interface UseFormDirtyResult {
  /** Whether any field differs from what the form held when it mounted. */
  dirty: boolean;
  /** Spread onto the `<form>`: `<form {...formProps}>`. */
  formProps: FormDirtyProps;
}

function serialize(form: HTMLFormElement): string {
  return JSON.stringify(
    Array.from(new FormData(form).entries()).map(([name, value]) => [
      name,
      typeof value === "string" ? value : value.name,
    ])
  );
}

/**
 * Dirty state for a native form of uncontrolled fields, for the `dirty` prop on
 * Dialog, Sheet and Drawer (design-bible §17). The form's fields are compared
 * with their values at mount, so typing a character and deleting it is clean.
 * Call it in the component that renders the modal (it owns `dirty`) and spread
 * `formProps` on the form, wherever the form renders: the snapshot is taken
 * when the form mounts with the modal's content, and resets when it unmounts.
 *
 * Covers native inputs and Radix Select (its form field fires `change`).
 * Controlled fields and rich-text editors compute `dirty` from their own state.
 */
export function useFormDirty(): UseFormDirtyResult {
  const formRef = useRef<HTMLFormElement | null>(null);
  const initialRef = useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const check = useCallback((): void => {
    const form = formRef.current;
    if (!form || initialRef.current === null) return;
    setDirty(serialize(form) !== initialRef.current);
  }, []);

  const ref = useCallback((form: HTMLFormElement | null): void => {
    formRef.current = form;
    initialRef.current = form ? serialize(form) : null;
    setDirty(false);
  }, []);

  // A form reset (React 19 resets uncontrolled fields after an action) lands
  // after the event, so compare once the fields have their new values.
  const onReset = useCallback((): void => {
    setTimeout(check, 0);
  }, [check]);

  return {
    dirty,
    formProps: { ref, onInput: check, onChange: check, onReset },
  };
}
