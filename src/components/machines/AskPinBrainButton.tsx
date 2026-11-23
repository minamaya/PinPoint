import type React from "react";
import { ExternalLink } from "lucide-react";

import { buttonVariants } from "~/components/ui/button";
import { cn } from "~/lib/utils";

/**
 * PinBrain, the Collective's Gemini Notebook (pinbrain spec §1). One fixed
 * address for every machine (§2.4); changing it is a code change (§3.2).
 * Gemini Notebook has no public query API, so PinPoint only links to it.
 */
export const PINBRAIN_URL =
  "https://notebook.google.com/notebook/daa0dfeb-6600-466f-aad8-413105847b2a";

/**
 * The Ask PinBrain button: outlined (design bible §26.2), with a trailing
 * external-link mark, opening PinBrain in a new tab. Shown to every viewer
 * (pinbrain spec §3.1). The caller sets the height for its surface.
 */
export function AskPinBrainButton({
  className,
}: {
  className?: string;
}): React.JSX.Element {
  return (
    <a
      href={PINBRAIN_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Ask PinBrain (opens in a new tab)"
      className={cn(buttonVariants({ variant: "outline" }), className)}
    >
      Ask PinBrain
      <ExternalLink className="size-3.5" aria-hidden="true" />
    </a>
  );
}
