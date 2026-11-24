// @vitest-environment jsdom
/**
 * Integration Test: Hand-applied tag pages, permission gating & machine editor wiring (PP-nffph.14)
 *
 * Worker-scoped PGlite (CORE-TEST-001). Exercises real Server Components
 * (`TagsPage`, `TagTypePage`, `TagLayout`, `TagOverviewPage`, `MachineInfoTab`)
 * with real unmocked Client Components (`TagsPageActions`, `TagTypePageActions`,
 * `TagTypeExclusiveDialog`, `TagPageActions`, `MoveTagDialog`, `MergeTagDialog`,
 * `InfoRail`, `MachineTagList`, `MachineTagEditor`):
 * - `TagsPage`: browse grouping/order and manager-only create actions.
 * - `TagTypePage`: member/anon read-only gating, exclusive-conflict blocker,
 *   and unblocking once the duplicate machine tag is removed.
 * - `TagLayout` & `TagOverviewPage`: member/anon action gating, Move conflict
 *   detection (taken name + exclusive machine), Merge conflict detection +
 *   already-tagged summary, empty-tag UI, and non-canonical redirect.
 * - `MachineInfoTab`: owner `canCreate=false`, non-owner/anon read-only tags,
 *   and technician `canCreate=true` wiring into `MachineTagEditor`.
 */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDb, setupTestDb } from "~/test/setup/pglite";
import { machineTags, tags, tagTypes } from "~/server/db/schema";
import { seedMachine, seedUser } from "~/test/helpers/seed";
import { signInAs, signOut } from "~/test/helpers/mock-auth";
import { MachineGroupShell } from "~/components/collections/MachineGroupShell";

vi.mock("~/lib/supabase/server", () => import("~/test/helpers/mock-auth"));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

class RedirectError extends Error {
  href: string;
  constructor(href: string) {
    super(`NEXT_REDIRECT:${href}`);
    this.href = href;
  }
}
class NotFoundError extends Error {}

vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string): never => {
    throw new RedirectError(href);
  }),
  notFound: vi.fn((): never => {
    throw new NotFoundError("NEXT_NOT_FOUND");
  }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/c/tags",
  useSelectedLayoutSegment: () => null,
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers([["host", "localhost:3000"]])),
  cookies: () => Promise.resolve({ get: () => undefined }),
}));

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <img alt={alt} src={src} />
  ),
}));

// Unrelated timeline query on MachineInfoTab (mirrors machine-info-tab.test.tsx).
vi.mock("~/components/machines/timeline/MachineRecentActivity", () => ({
  MachineRecentActivity: () => <div data-testid="machine-recent-activity" />,
}));

const { default: TagsPage } = await import("~/app/(app)/c/tags/page");
const { default: TagTypePage } = await import("~/app/(app)/c/tags/[type]/page");
const { default: TagLayout } =
  await import("~/app/(app)/c/tags/[type]/[slug]/(tabs)/layout");
const { default: TagOverviewPage } =
  await import("~/app/(app)/c/tags/[type]/[slug]/(tabs)/page");
const { default: MachineInfoTab } =
  await import("~/app/(app)/m/[initials]/(tabs)/page");
const { setMachineTagAction } = await import("~/app/(app)/c/tags/actions");

type ShellProps = React.ComponentProps<typeof MachineGroupShell>;

function isShellProps(props: unknown): props is ShellProps {
  return (
    typeof props === "object" &&
    props !== null &&
    "title" in props &&
    typeof props.title === "string" &&
    "machines" in props &&
    Array.isArray(props.machines) &&
    "basePath" in props &&
    typeof props.basePath === "string" &&
    "breadcrumb" in props &&
    "children" in props
  );
}

/**
 * Resolve async `MachineGroupShell` inside `TagLayout` so React 19 jsdom
 * renders the full unmocked shell + actions + dialogs tree against PGlite.
 */
async function resolveTagLayout(
  element: React.ReactElement
): Promise<React.ReactElement> {
  if (!React.isValidElement<{ children?: React.ReactNode }>(element)) {
    return element;
  }
  const child = element.props.children;
  if (
    React.isValidElement(child) &&
    child.type === MachineGroupShell &&
    isShellProps(child.props)
  ) {
    const resolvedShell = await MachineGroupShell(child.props);
    return React.cloneElement(element, undefined, resolvedShell);
  }
  return element;
}

const EMPTY_SEARCH = Promise.resolve<
  Record<string, string | string[] | undefined>
>({});

describe("Hand-applied tag pages & machine tag editor wiring (PGlite)", () => {
  setupTestDb();

  beforeEach(() => {
    vi.clearAllMocks();
    signOut();
  });

  it("TagsPage shows management actions only to technicians/admins and renders groups for members/anonymous", async () => {
    const db = await getTestDb();
    const member = await seedUser({ role: "member" });
    const technician = await seedUser({ role: "technician" });
    await db
      .insert(tagTypes)
      .values({ slug: "location", name: "Location", exclusive: true });

    // Anonymous and member see Location + Settings tags, with no Add tag / Add tag type.
    for (const userId of [null, member.id]) {
      if (userId) signInAs(userId);
      else signOut();
      const view = render(await TagsPage());
      expect(
        screen.getByRole("link", { name: "Location" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Settings tags" })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Add tag/ })
      ).not.toBeInTheDocument();
      view.unmount();
    }

    // Technician sees Add tag and Add tag type.
    signInAs(technician.id);
    render(await TagsPage());
    expect(screen.getByRole("button", { name: "Add tag" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add tag type" })
    ).toBeInTheDocument();
  });

  it("TagTypePage gates management controls by role and surfaces exclusive blockers until cleared", async () => {
    const db = await getTestDb();
    const member = await seedUser({ role: "member" });
    const technician = await seedUser({ role: "technician" });
    const machine = await seedMachine({
      initials: "RCK",
      name: "Rocket Ship",
    });
    const [rack] = await db
      .insert(tagTypes)
      .values({ slug: "rack", name: "Rack", exclusive: false })
      .returning();
    if (!rack) throw new Error("seed failed");
    const [top, low] = await db
      .insert(tags)
      .values([
        {
          slug: "top",
          name: "Top",
          tagTypeId: rack.id,
          typeExclusive: false,
        },
        {
          slug: "low",
          name: "Low",
          tagTypeId: rack.id,
          typeExclusive: false,
        },
      ])
      .returning();
    if (!top || !low) throw new Error("seed failed");
    await db.insert(machineTags).values([
      {
        machineId: machine.id,
        tagId: top.id,
        tagTypeId: rack.id,
        typeExclusive: false,
      },
      {
        machineId: machine.id,
        tagId: low.id,
        tagTypeId: rack.id,
        typeExclusive: false,
      },
    ]);

    // Anonymous and member see tags with no Add tag or More menu.
    for (const userId of [null, member.id]) {
      if (userId) signInAs(userId);
      else signOut();
      const view = render(
        await TagTypePage({ params: Promise.resolve({ type: "rack" }) })
      );
      expect(
        screen.getByRole("heading", { level: 1, name: "Rack" })
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Top/ })).toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      view.unmount();
    }

    // Technician sees blocked "Make one per machine" dialog listing Rocket Ship.
    const user = userEvent.setup();
    signInAs(technician.id);
    const blockedView = render(
      await TagTypePage({ params: Promise.resolve({ type: "rack" }) })
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Make one per machine" })
    );
    const blockedDialog = await screen.findByRole("alertdialog", {
      name: "Make Rack one per machine?",
    });
    expect(within(blockedDialog).getByRole("alert")).toHaveTextContent(
      "1 machine has more than one Rack tag"
    );
    expect(
      within(blockedDialog).getByRole("link", { name: "Rocket Ship" })
    ).toHaveAttribute("href", "/m/RCK");
    expect(
      within(blockedDialog).queryByRole("button", {
        name: "Make one per machine",
      })
    ).not.toBeInTheDocument();
    blockedView.unmount();

    // Removing the extra tag unblocks making the type exclusive.
    const cleared = await setMachineTagAction({
      machineId: machine.id,
      tagId: low.id,
      applied: false,
    });
    expect(cleared.ok).toBe(true);

    const unblockedView = render(
      await TagTypePage({ params: Promise.resolve({ type: "rack" }) })
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Make one per machine" })
    );
    const confirmDialog = await screen.findByRole("alertdialog", {
      name: "Make Rack one per machine?",
    });
    expect(within(confirmDialog).queryByRole("alert")).not.toBeInTheDocument();
    await user.click(
      within(confirmDialog).getByRole("button", {
        name: "Make one per machine",
      })
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    );
    unblockedView.unmount();

    // Exclusive type now displays "One per machine" badge and offers "Allow more than one per machine".
    render(await TagTypePage({ params: Promise.resolve({ type: "rack" }) }));
    expect(screen.getByText("One per machine")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(
      await screen.findByRole("menuitem", {
        name: "Allow more than one per machine",
      })
    ).toBeInTheDocument();
  });

  it("TagLayout and TagOverviewPage enforce read-only visitor gating and wire Move/Merge conflicts & canonical redirects", async () => {
    const db = await getTestDb();
    const member = await seedUser({ role: "member" });
    const technician = await seedUser({ role: "technician" });
    const holdsBoth = await seedMachine({ initials: "HB", name: "Holds Both" });
    const holdsSource = await seedMachine({
      initials: "HS",
      name: "Holds Source",
    });

    const [looseType, takenType, exclusiveType] = await db
      .insert(tagTypes)
      .values([
        { slug: "loose", name: "Loose", exclusive: false },
        { slug: "taken", name: "Taken", exclusive: false },
        { slug: "zone", name: "Zone", exclusive: true },
      ])
      .returning();
    if (!looseType || !takenType || !exclusiveType)
      throw new Error("seed failed");

    const [sourceTag, peerTag, heldTag, emptyTag] = await db
      .insert(tags)
      .values([
        {
          slug: "src",
          name: "Shared Name",
          tagTypeId: looseType.id,
          typeExclusive: false,
        },
        {
          slug: "src-dup",
          name: "Shared Name",
          tagTypeId: takenType.id,
          typeExclusive: false,
        },
        {
          slug: "held",
          name: "Held Zone",
          tagTypeId: exclusiveType.id,
          typeExclusive: true,
        },
        {
          slug: "empty-tag",
          name: "Empty Tag",
          tagTypeId: looseType.id,
          typeExclusive: false,
        },
      ])
      .returning();
    if (!sourceTag || !peerTag || !heldTag || !emptyTag)
      throw new Error("seed failed");

    const [intoTag] = await db
      .insert(tags)
      .values({
        slug: "into-zone",
        name: "Into Zone",
        tagTypeId: exclusiveType.id,
        typeExclusive: true,
      })
      .returning();
    if (!intoTag) throw new Error("seed failed");

    await db.insert(machineTags).values([
      {
        machineId: holdsBoth.id,
        tagId: sourceTag.id,
        tagTypeId: looseType.id,
        typeExclusive: false,
      },
      {
        machineId: holdsSource.id,
        tagId: sourceTag.id,
        tagTypeId: looseType.id,
        typeExclusive: false,
      },
      {
        machineId: holdsBoth.id,
        tagId: heldTag.id,
        tagTypeId: exclusiveType.id,
        typeExclusive: true,
      },
      {
        machineId: holdsSource.id,
        tagId: peerTag.id,
        tagTypeId: takenType.id,
        typeExclusive: false,
      },
    ]);

    // Anonymous and member see Share + Print settings sheets only (no More / editing).
    for (const userId of [null, member.id]) {
      if (userId) signInAs(userId);
      else signOut();
      const layoutView = render(
        await resolveTagLayout(
          await TagLayout({
            params: Promise.resolve({ type: "loose", slug: "src" }),
            children: <div>Body</div>,
          })
        )
      );
      expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Print settings sheets" })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "More" })
      ).not.toBeInTheDocument();
      layoutView.unmount();

      const emptyView = render(
        await TagOverviewPage({
          params: Promise.resolve({ type: "loose", slug: "empty-tag" }),
          searchParams: EMPTY_SEARCH,
        })
      );
      expect(screen.getByText("No machines")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Add machines" })
      ).not.toBeInTheDocument();
      emptyView.unmount();
    }

    // Wrong type segment redirects to canonical path.
    await expect(
      TagOverviewPage({
        params: Promise.resolve({ type: "other", slug: "src" }),
        searchParams: EMPTY_SEARCH,
      })
    ).rejects.toThrow("NEXT_REDIRECT:/c/tags/loose/src");

    // Technician sees Add machines on empty tag, plus Move/Merge conflict wiring on populated tag.
    const user = userEvent.setup();
    signInAs(technician.id);
    const emptyTechView = render(
      await TagOverviewPage({
        params: Promise.resolve({ type: "loose", slug: "empty-tag" }),
        searchParams: EMPTY_SEARCH,
      })
    );
    expect(
      screen.getByRole("button", { name: "Add machines" })
    ).toBeInTheDocument();
    emptyTechView.unmount();

    const techLayoutView = render(
      await resolveTagLayout(
        await TagLayout({
          params: Promise.resolve({ type: "loose", slug: "src" }),
          children: <div>Body</div>,
        })
      )
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Move to another tag type…" })
    );
    const moveDialog = await screen.findByRole("dialog", {
      name: "Move Shared Name",
    });
    const typeSelect = within(moveDialog).getByLabelText("Tag type");
    await user.selectOptions(typeSelect, "Taken");
    expect(within(moveDialog).getByRole("alert")).toHaveTextContent(
      "Taken already has a tag named Shared Name"
    );
    expect(
      within(moveDialog).getByRole("button", { name: "Move tag" })
    ).toBeDisabled();

    await user.selectOptions(typeSelect, "Zone · one per machine");
    expect(within(moveDialog).getByRole("alert")).toHaveTextContent(
      "1 machine would hold two Zone tags"
    );
    expect(
      within(moveDialog).getByRole("link", { name: "Holds Both" })
    ).toHaveAttribute("href", "/m/HB");
    expect(within(moveDialog).getByText("Held Zone")).toBeInTheDocument();
    expect(
      within(moveDialog).getByRole("button", { name: "Move tag" })
    ).toBeDisabled();
    await user.keyboard("{Escape}");
    await user.click(await screen.findByRole("button", { name: "Discard" }));

    // Merge dialog: blocked on exclusive target and shows alreadyCount on non-conflicting target.
    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Merge into another tag…" })
    );
    const mergeDialog = await screen.findByRole("dialog", {
      name: "Merge Shared Name into another tag",
    });
    const mergeSelect = within(mergeDialog).getByLabelText("Merge into");
    await user.selectOptions(mergeSelect, "Into Zone · 0 machines");
    expect(within(mergeDialog).getByRole("alert")).toHaveTextContent(
      "1 machine would hold two Zone tags"
    );
    expect(
      within(mergeDialog).getByRole("link", { name: "Holds Both" })
    ).toHaveAttribute("href", "/m/HB");
    expect(
      within(mergeDialog).getByRole("button", { name: "Merge tags" })
    ).toBeDisabled();

    await user.selectOptions(mergeSelect, "Shared Name · 1 machine");
    expect(
      within(mergeDialog).getByText(
        /All 2 machines will be tagged Shared Name \(1 already is\)\./
      )
    ).toBeInTheDocument();
    expect(
      within(mergeDialog).getByRole("button", { name: "Merge tags" })
    ).toBeEnabled();
    techLayoutView.unmount();
  });

  it("MachineInfoTab grants Edit tags without create to machine owner, hides editor from non-owner/anon, and enables create for technician", async () => {
    const db = await getTestDb();
    const owner = await seedUser({ role: "member" });
    const otherMember = await seedUser({ role: "member" });
    const technician = await seedUser({ role: "technician" });
    const machine = await seedMachine({
      initials: "TAG",
      name: "Tagged Pin",
      ownerId: owner.id,
    });
    const [typeRow] = await db
      .insert(tagTypes)
      .values({ slug: "spot", name: "Spot", exclusive: false })
      .returning();
    if (!typeRow) throw new Error("seed failed");
    const [tagRow] = await db
      .insert(tags)
      .values({
        slug: "corner",
        name: "Corner",
        tagTypeId: typeRow.id,
        typeExclusive: false,
      })
      .returning();
    if (!tagRow) throw new Error("seed failed");
    await db.insert(machineTags).values({
      machineId: machine.id,
      tagId: tagRow.id,
      tagTypeId: typeRow.id,
      typeExclusive: false,
    });

    // Anonymous and non-owner member see tag link, but no Edit tags button.
    for (const userId of [null, otherMember.id]) {
      if (userId) signInAs(userId);
      else signOut();
      const view = render(
        await MachineInfoTab({
          params: Promise.resolve({ initials: machine.initials }),
        })
      );
      const card = screen.getByTestId("machine-tags");
      expect(
        within(card).getByRole("link", { name: "Corner" })
      ).toHaveAttribute("href", "/c/tags/spot/corner");
      expect(
        within(card).queryByRole("button", { name: "Edit tags" })
      ).not.toBeInTheDocument();
      view.unmount();
    }

    // Owner sees Edit tags with search-only ("Find a tag", canCreate=false).
    const user = userEvent.setup();
    signInAs(owner.id);
    const ownerView = render(
      await MachineInfoTab({
        params: Promise.resolve({ initials: machine.initials }),
      })
    );
    const [ownerTrigger] = within(
      screen.getByTestId("machine-tags")
    ).getAllByRole("button", { name: "Edit tags" });
    if (!ownerTrigger) throw new Error("expected owner Edit tags trigger");
    await user.click(ownerTrigger);
    const ownerDialog = await screen.findByRole("dialog", {
      name: "Edit tags",
    });
    const ownerSearch = within(ownerDialog).getByLabelText("Find a tag");
    await user.type(ownerSearch, "Nonexistent");
    expect(
      within(ownerDialog).getByText("No matching tags")
    ).toBeInTheDocument();
    expect(
      within(ownerDialog).queryByRole("button", { name: /^Create/ })
    ).not.toBeInTheDocument();
    await user.click(within(ownerDialog).getByRole("button", { name: "Done" }));
    ownerView.unmount();

    // Technician on non-owned machine sees Edit tags with create enabled ("Find or create a tag").
    signInAs(technician.id);
    render(
      await MachineInfoTab({
        params: Promise.resolve({ initials: machine.initials }),
      })
    );
    const [techTrigger] = within(
      screen.getByTestId("machine-tags")
    ).getAllByRole("button", { name: "Edit tags" });
    if (!techTrigger) throw new Error("expected technician Edit tags trigger");
    await user.click(techTrigger);
    const techDialog = await screen.findByRole("dialog", { name: "Edit tags" });
    expect(
      within(techDialog).getByLabelText("Find or create a tag")
    ).toBeInTheDocument();
  });
});
