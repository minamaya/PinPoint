"use client";

import type React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { takeFocusReturn } from "./focus-return";

/** An open overlay that focus can come straight back from. */
const OVERLAY = '[role="menu"],[role="dialog"],[role="alertdialog"]';

/**
 * Whether focus is being handed back to the control rather than arriving
 * by Tab: marked by whatever handed it back (focus-return), or coming
 * straight from inside a menu or dialog still on the page. A focus with no
 * previous element is never taken as a return on its own: it is also the
 * first Tab after a reload or from the address bar.
 */
function isReturningFocus(event: React.FocusEvent): boolean {
  if (event.target instanceof Element && takeFocusReturn(event.target)) {
    return true;
  }
  const from = event.relatedTarget;
  return (
    from instanceof Element &&
    from.isConnected &&
    from.closest(OVERLAY) !== null
  );
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
 * It also stays shut when focus is handed back to the button from a menu,
 * sheet, dialog, or editor the button opened, which the component handing
 * it back marks (markFocusReturn, returnFocusTo); Radix would otherwise
 * open it on that focus. Arriving by Tab and hovering still show it.
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
