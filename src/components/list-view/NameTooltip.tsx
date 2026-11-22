"use client";

import type React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

/** Where focus comes back from when a control's own overlay closes. */
const OVERLAY = '[role="menu"],[role="dialog"],[role="alertdialog"]';

/**
 * Whether focus is returning to the control rather than arriving by Tab:
 * from a menu, sheet, or dialog it opened, or from nowhere (an element
 * that was removed, such as a closed editor, or a programmatic focus).
 */
function isReturningFocus(event: React.FocusEvent): boolean {
  const from = event.relatedTarget;
  if (!(from instanceof Element) || !from.isConnected) return true;
  return from.closest(OVERLAY) !== null;
}

/**
 * The desktop tooltip of an icon-only button, the same text as its
 * accessible name (design-bible §26.2).
 *
 * It wraps the button in a span that takes the tooltip's trigger wiring.
 * Radix points an open tooltip's trigger `aria-describedby` at the
 * tooltip, and its Slot joins that onto the child's own; on the button
 * itself that would repeat the name as a description and push the button's
 * own description (which item a ⋯ belongs to) behind it. On the span, the
 * button keeps exactly its own description.
 *
 * It also stays shut when focus comes back to the button from a menu,
 * sheet, dialog, or editor the button opened; Radix would otherwise open
 * it on that focus. Arriving by Tab and hovering still show it.
 */
export function NameTooltip({
  label,
  show = true,
  className,
  children,
}: {
  /** The button's accessible name. */
  label: string;
  /** False keeps the tooltip out, such as while the button shows its label. */
  show?: boolean | undefined;
  /** The wrapper's position, such as negative margins in a dense row. */
  className?: string | undefined;
  /** The button, including any menu or sheet trigger around it. */
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger
          asChild
          onFocus={(event) => {
            // composeEventHandlers skips Radix's open when this prevents it.
            if (isReturningFocus(event)) event.preventDefault();
          }}
        >
          <span className={cn("inline-flex shrink-0", className)}>
            {children}
          </span>
        </TooltipTrigger>
        {show ? (
          <TooltipContent className="max-md:hidden">{label}</TooltipContent>
        ) : null}
      </Tooltip>
    </TooltipProvider>
  );
}
