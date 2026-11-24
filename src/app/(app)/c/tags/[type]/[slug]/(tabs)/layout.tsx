import type React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MachineGroupShell } from "~/components/collections/MachineGroupShell";
import { PageExportProvider } from "~/components/list-view";
import type { Crumb } from "~/components/layout/Breadcrumb";
import { TagPageActions } from "~/components/tags/TagPageActions";
import { groupSettingsSheetsHref } from "~/lib/collections/settings-sheets-href";
import type { ResolvedTag } from "~/lib/tags/tags";
import {
  getTagEditor,
  getTagForLayout,
  getTagMerge,
  getTagMove,
} from "~/app/(app)/c/tags/[type]/[slug]/_data";

interface TagParams {
  params: Promise<{ type: string; slug: string }>;
}

export async function generateMetadata({
  params,
}: TagParams): Promise<Metadata> {
  const { type, slug } = await params;
  const resolved = await getTagForLayout(type, slug);
  return {
    title: resolved ? `${resolved.tag.name} | PinPoint` : "Tag | PinPoint",
  };
}

/**
 * The crumbs after Tags on a tag's breadcrumb: its tag type, or none for a
 * tag without one (collections-and-tags 7.7).
 */
function trailCrumbs(resolved: ResolvedTag): Crumb[] {
  const { group } = resolved;
  if (group.kind === "automatic") {
    return [{ label: group.type.label, href: group.type.href }];
  }
  if (group.kind === "hand") {
    return [{ label: group.type.name, href: group.type.href }];
  }
  return [];
}

export default async function TagLayout({
  children,
  params,
}: TagParams & { children: React.ReactNode }): Promise<React.JSX.Element> {
  const { type, slug } = await params;
  const [resolved, editor, move, merge] = await Promise.all([
    getTagForLayout(type, slug),
    getTagEditor(type, slug),
    getTagMove(type, slug),
    getTagMerge(type, slug),
  ]);
  if (!resolved) notFound();
  const { tag } = resolved;

  // The tab's list offers its Export to the page's ⋯ (collections-and-tags
  // 4.17).
  return (
    <PageExportProvider>
      <MachineGroupShell
        title={tag.name}
        breadcrumb={{
          section: "tags",
          crumbs: trailCrumbs(resolved),
        }}
        machines={tag.machines}
        basePath={tag.href}
        actions={
          <TagPageActions
            tagHref={tag.href}
            tagName={tag.name}
            settingsSheetsHref={groupSettingsSheetsHref(tag.machines)}
            editing={
              editor && move && merge
                ? {
                    editor,
                    parentHref: editor.parentHref,
                    move,
                    merge,
                  }
                : null
            }
          />
        }
      >
        {children}
      </MachineGroupShell>
    </PageExportProvider>
  );
}
