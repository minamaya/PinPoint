import type React from "react";
import Link from "next/link";
import { HelpCircle, Library, Tag, type LucideIcon } from "lucide-react";
import { SETTINGS_TAGS_HREF } from "~/lib/machines/settings-tags";
import { cn } from "~/lib/utils";

/** One step of a breadcrumb: a page above this one. */
export interface Crumb {
  label: string;
  href: string;
}

/**
 * The sections whose pages carry a breadcrumb (design-bible §27). Each one
 * names its first crumb and the icon the navigation uses for it.
 */
const SECTIONS = {
  tags: { label: "Tags", href: "/c/tags", icon: Tag },
  settingsTags: { label: "Settings tags", href: SETTINGS_TAGS_HREF, icon: Tag },
  collections: { label: "Collections", href: "/c/collections", icon: Library },
  help: { label: "Help", href: "/help", icon: HelpCircle },
} as const satisfies Record<string, Crumb & { icon: LucideIcon }>;

export type BreadcrumbSection = keyof typeof SECTIONS;

export interface BreadcrumbProps {
  /** The section the page sits in; its root is the first crumb. */
  section: BreadcrumbSection;
  /**
   * Crumbs after the section's root, nearest the page last. The current page
   * is never one: the title names it.
   */
  crumbs?: readonly Crumb[] | undefined;
  className?: string | undefined;
}

// On phones each link reaches 44px (list-views §7.9) through a centered hit
// area, so the trail keeps its spacing. The label truncates inside the link
// rather than on it, so the hit area is not clipped.
const linkClass =
  "relative block min-w-0 rounded-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-md:after:absolute max-md:after:top-1/2 max-md:after:left-1/2 max-md:after:size-11 max-md:after:-translate-x-1/2 max-md:after:-translate-y-1/2";

/**
 * The one breadcrumb (design-bible §27): on its own line above the page
 * title, the section's icon and then green links separated by a muted "›".
 * It stays on one line: the last crumb shortens with an ellipsis, and the
 * first never shortens.
 */
export function Breadcrumb({
  section,
  crumbs = [],
  className,
}: BreadcrumbProps): React.JSX.Element {
  const root = SECTIONS[section];
  const Icon = root.icon;
  const trail: readonly Crumb[] = [root, ...crumbs];
  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex min-w-0 items-center gap-1.5 text-[13px] leading-[18px] text-muted-foreground">
        <li aria-hidden="true" className="shrink-0">
          <Icon className="size-3.5 text-primary" />
        </li>
        {trail.map((crumb, index) => {
          const last = index === trail.length - 1 && index > 0;
          return (
            <CrumbItem
              key={crumb.href}
              crumb={crumb}
              separated={index > 0}
              shortens={last}
            />
          );
        })}
      </ol>
    </nav>
  );
}

function CrumbItem({
  crumb,
  separated,
  shortens,
}: {
  crumb: Crumb;
  separated: boolean;
  shortens: boolean;
}): React.JSX.Element {
  return (
    <>
      {separated ? (
        <li aria-hidden="true" className="shrink-0">
          ›
        </li>
      ) : null}
      <li className={shortens ? "min-w-0" : "shrink-0"}>
        <Link href={crumb.href} className={linkClass}>
          <span className="block truncate">{crumb.label}</span>
        </Link>
      </li>
    </>
  );
}
