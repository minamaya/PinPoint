"use client";

import type React from "react";
import { useRef } from "react";
import {
  Breadcrumb,
  type BreadcrumbProps,
} from "~/components/layout/Breadcrumb";
import { useMeasuredWidths } from "~/components/list-view/use-measured-widths";
import { planGroupHeader } from "~/lib/list-view/overflow";
import { cn } from "~/lib/utils";

interface GroupPageHeaderProps {
  title: string;
  /** Where the group lives (collections-and-tags 4.8); null for none. */
  breadcrumb: BreadcrumbProps | null;
  /** A Collection's description, already clamped (4.7, 4.12). */
  description?: React.ReactNode;
}

const titleClass =
  "text-2xl/[30px] font-bold tracking-tight text-foreground md:text-3xl/9";

/**
 * A Collection or Tag page's header (collections-and-tags 4.2, 4.8–4.12):
 * the breadcrumb on its own line above the title, then the title and a
 * Collection's description, with no counts.
 *
 * At and above md the description sits beside the title in a 280–560px
 * column and moves under it when that column cannot get 280px; below md it
 * always sits under the title (list-views §8.10). The header measures its
 * own width and its title on one line (CORE-RESP-002 boundary) to decide.
 */
export function GroupPageHeader({
  title,
  breadcrumb,
  description,
}: GroupPageHeaderProps): React.JSX.Element {
  const containerRef = useRef<HTMLElement>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const hasDescription = description !== undefined && description !== null;
  const measured = useMeasuredWidths(containerRef, laneRef, title);

  // Before the first measurement CSS guesses the description beside.
  const beside =
    hasDescription &&
    (measured && measured.available > 0
      ? planGroupHeader({
          available: measured.available,
          title: measured.widths["title"] ?? 0,
          description: true,
        }).descriptionBeside
      : true);

  return (
    <header
      ref={containerRef}
      data-testid="group-header"
      // The plan the wide layout shows, for tests and screenshots to read.
      data-description={beside ? "beside" : "under"}
      className="relative flex flex-col gap-1"
    >
      {breadcrumb ? <Breadcrumb {...breadcrumb} /> : null}
      <div
        className={cn(
          "flex flex-col gap-1",
          beside && "md:flex-row md:items-start md:gap-6"
        )}
      >
        <h1
          className={cn("min-w-0 break-words md:flex-[0_1_auto]", titleClass)}
        >
          {title}
        </h1>
        {hasDescription ? (
          <div
            className={cn(
              "min-w-0",
              beside && "md:max-w-[560px] md:min-w-[280px] md:flex-[1_1_280px]"
            )}
          >
            {description}
          </div>
        ) : null}
      </div>

      {/* The title on one line, kept out of the accessibility tree and
          clipped so it never widens the page. */}
      <div
        ref={laneRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden"
      >
        <span data-measure="title" className={cn("absolute w-max", titleClass)}>
          {title}
        </span>
      </div>
    </header>
  );
}
