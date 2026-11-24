// @vitest-environment jsdom
/**
 * Integration Test: Collection pages, layout gating, descriptions & sharing (PP-nffph.14)
 *
 * Worker-scoped PGlite (CORE-TEST-001). Exercises real Server Components
 * (`MyCollectionsPage`, `CollectionLayout`, `CollectionOverviewPage`,
 * `MachineGroupShell`) with real unmocked Client Components
 * (`CollectionPageActions`, `AddMachinesInline`, `ClampedDescription`,
 * `RichTextDisplay`):
 * - `MyCollectionsPage`: auth redirect, owned + shared-with-you sections,
 *   Removed-machine count exclusion, and Editor badge.
 * - `CollectionLayout`: UUID vs View Link access control, `no-referrer`
 *   metadata on View Links, breadcrumb visibility, owner/editor/admin/anon
 *   `CollectionPageActions` gating, and description rendering/omission.
 * - `CollectionOverviewPage`: empty-collection `AddMachinesInline` vs
 *   read-only empty state.
 */
import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDb, setupTestDb } from "~/test/setup/pglite";
import {
  collectionCollaborators,
  collectionMachines,
  collections,
} from "~/server/db/schema";
import { seedMachine, seedUser } from "~/test/helpers/seed";
import { signInAs, signOut } from "~/test/helpers/mock-auth";
import { plainTextToDoc } from "~/lib/tiptap/types";
import { MachineGroupShell } from "~/components/collections/MachineGroupShell";

vi.mock("~/lib/supabase/server", () => import("~/test/helpers/mock-auth"));

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
  usePathname: () => "/c/collection",
  useSelectedLayoutSegment: () => null,
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers([["host", "localhost:3000"]])),
  cookies: () => Promise.resolve({ get: () => undefined }),
}));

const { default: MyCollectionsPage } =
  await import("~/app/(app)/c/collections/page");
const { default: CollectionLayout, generateMetadata } =
  await import("~/app/(app)/c/[id]/(tabs)/layout");
const { default: CollectionOverviewPage } =
  await import("~/app/(app)/c/[id]/(tabs)/page");

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
 * Resolve async `MachineGroupShell` inside `CollectionLayout` so React 19
 * jsdom renders the full unmocked shell + actions + description tree against PGlite.
 */
async function resolveCollectionLayout(
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

describe("Collections pages & layout (PGlite)", () => {
  setupTestDb();

  beforeEach(() => {
    vi.clearAllMocks();
    signOut();
  });

  it("MyCollectionsPage redirects anonymous visitors and lists owned + shared collections excluding Removed machines", async () => {
    await expect(MyCollectionsPage()).rejects.toThrow(
      "NEXT_REDIRECT:/login?next=%2Fc%2Fcollections"
    );

    const db = await getTestDb();
    const owner = await seedUser({
      firstName: "Member",
      lastName: "One",
      role: "member",
    });
    const sharer = await seedUser({
      firstName: "Sharer",
      lastName: "Two",
      role: "member",
    });
    const active = await seedMachine({
      initials: "ACT",
      name: "Active Game",
      ownerId: owner.id,
    });
    const removed = await seedMachine({
      initials: "RMV",
      name: "Removed Game",
      ownerId: owner.id,
      presenceStatus: "removed",
    });

    const [ownedCol, sharedCol] = await db
      .insert(collections)
      .values([
        { name: "Zed List", ownerId: owner.id },
        { name: "League Bank", ownerId: sharer.id },
      ])
      .returning();
    if (!ownedCol || !sharedCol) throw new Error("seed failed");

    await db.insert(collectionMachines).values([
      { collectionId: ownedCol.id, machineId: active.id },
      { collectionId: ownedCol.id, machineId: removed.id },
      { collectionId: sharedCol.id, machineId: active.id },
    ]);
    await db.insert(collectionCollaborators).values({
      collectionId: sharedCol.id,
      userId: owner.id,
      role: "editor",
      addedBy: sharer.id,
    });

    signInAs(owner.id);
    render(await MyCollectionsPage());

    expect(
      screen.getByRole("heading", { level: 1, name: "My Collections" })
    ).toBeInTheDocument();
    expect(screen.getByTestId("create-collection-trigger")).toBeInTheDocument();

    const myMachinesLink = screen.getByTestId("my-machines-collection-link");
    expect(myMachinesLink).toHaveTextContent("1 machine");

    const ownedLink = screen.getByRole("link", { name: /Zed List/ });
    expect(ownedLink).toHaveAttribute("href", `/c/${ownedCol.id}`);
    expect(ownedLink).toHaveTextContent("1 machine");

    const sharedLink = screen.getByRole("link", { name: /League Bank/ });
    expect(sharedLink).toHaveAttribute("href", `/c/${sharedCol.id}`);
    expect(sharedLink).toHaveTextContent("Shared by Sharer Two");
    expect(sharedLink).toHaveTextContent("Editor");
    expect(sharedLink).toHaveTextContent("1 machine");
  });

  it("CollectionLayout enforces private UUID access, view-link no-referrer metadata, and role-gated actions & breadcrumbs", async () => {
    const db = await getTestDb();
    const owner = await seedUser({
      firstName: "Owner",
      lastName: "User",
      role: "member",
    });
    const editor = await seedUser({
      firstName: "Editor",
      lastName: "User",
      role: "technician",
    });
    const admin = await seedUser({
      firstName: "Admin",
      lastName: "User",
      role: "admin",
    });
    const stranger = await seedUser({
      firstName: "Stranger",
      lastName: "User",
      role: "member",
    });
    const machine = await seedMachine({
      initials: "AFM",
      name: "Attack from Mars",
      ownerId: owner.id,
    });

    const token = "AbCdEfGhIjKlMnOpQrStUvWxYz01_-23";
    const [col] = await db
      .insert(collections)
      .values({
        name: "Friday Finals",
        ownerId: owner.id,
        viewToken: token,
        description: plainTextToDoc("Tournament lineup notes."),
      })
      .returning();
    if (!col) throw new Error("seed failed");
    await db
      .insert(collectionMachines)
      .values({ collectionId: col.id, machineId: machine.id });
    await db.insert(collectionCollaborators).values({
      collectionId: col.id,
      userId: editor.id,
      role: "editor",
      addedBy: owner.id,
    });

    // Anonymous and non-collaborator member cannot open by UUID; metadata sets no-referrer only on token.
    await expect(
      CollectionLayout({
        params: Promise.resolve({ id: col.id }),
        children: <div>Body</div>,
      })
    ).rejects.toThrow(NotFoundError);

    signInAs(stranger.id);
    await expect(
      CollectionLayout({
        params: Promise.resolve({ id: col.id }),
        children: <div>Body</div>,
      })
    ).rejects.toThrow(NotFoundError);

    expect(
      (await generateMetadata({ params: Promise.resolve({ id: token }) }))
        .referrer
    ).toBe("no-referrer");
    signInAs(owner.id);
    expect(
      (await generateMetadata({ params: Promise.resolve({ id: col.id }) }))
        .referrer
    ).toBeUndefined();

    // Owner via View Link still sees breadcrumb, Share, Edit, and Delete.
    const user = userEvent.setup();
    const ownerView = render(
      await resolveCollectionLayout(
        await CollectionLayout({
          params: Promise.resolve({ id: token }),
          children: <div>Tab body</div>,
        })
      )
    );
    expect(
      within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole(
        "link",
        { name: "Collections" }
      )
    ).toHaveAttribute("href", "/c/collections");
    expect(screen.getByTestId("collection-description")).toHaveTextContent(
      "Tournament lineup notes."
    );
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More" }));
    const ownerMenu = await screen.findByRole("menu");
    expect(
      within(ownerMenu).getByRole("menuitem", { name: "Edit collection…" })
    ).toBeInTheDocument();
    expect(
      within(ownerMenu).getByRole("menuitem", { name: "Delete collection" })
    ).toBeInTheDocument();
    ownerView.unmount();

    // Editor via UUID sees breadcrumb + Edit collection…, but no Share and no Delete.
    signInAs(editor.id);
    const editorView = render(
      await resolveCollectionLayout(
        await CollectionLayout({
          params: Promise.resolve({ id: col.id }),
          children: <div>Tab body</div>,
        })
      )
    );
    expect(
      screen.getByRole("navigation", { name: "Breadcrumb" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Share" })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More" }));
    const editorMenu = await screen.findByRole("menu");
    expect(
      within(editorMenu).getByRole("menuitem", { name: "Edit collection…" })
    ).toBeInTheDocument();
    expect(
      within(editorMenu).queryByRole("menuitem", { name: "Delete collection" })
    ).not.toBeInTheDocument();
    editorView.unmount();

    // Non-editor admin via UUID sees breadcrumb, only Print settings sheets (no Share / More).
    signInAs(admin.id);
    const adminView = render(
      await resolveCollectionLayout(
        await CollectionLayout({
          params: Promise.resolve({ id: col.id }),
          children: <div>Tab body</div>,
        })
      )
    );
    expect(
      screen.getByRole("navigation", { name: "Breadcrumb" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Print settings sheets" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    adminView.unmount();

    // Anonymous View Link visitor sees description, no Breadcrumb, and only Print settings sheets.
    signOut();
    render(
      await resolveCollectionLayout(
        await CollectionLayout({
          params: Promise.resolve({ id: token }),
          children: <div>Tab body</div>,
        })
      )
    );
    expect(
      screen.queryByRole("navigation", { name: "Breadcrumb" })
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("collection-description")).toHaveTextContent(
      "Tournament lineup notes."
    );
    expect(
      screen.getByRole("link", { name: "Print settings sheets" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("CollectionLayout omits description when null or whitespace-only", async () => {
    const db = await getTestDb();
    const owner = await seedUser({ role: "member" });
    const [emptyDescCol] = await db
      .insert(collections)
      .values({
        name: "No Desc",
        ownerId: owner.id,
        description: plainTextToDoc("   "),
      })
      .returning();
    if (!emptyDescCol) throw new Error("seed failed");

    signInAs(owner.id);
    render(
      await resolveCollectionLayout(
        await CollectionLayout({
          params: Promise.resolve({ id: emptyDescCol.id }),
          children: <div>Tab body</div>,
        })
      )
    );

    expect(
      screen.queryByTestId("collection-description")
    ).not.toBeInTheDocument();
  });

  it("CollectionOverviewPage shows AddMachinesInline to owner on empty collection and read-only message to viewers", async () => {
    const db = await getTestDb();
    const owner = await seedUser({ role: "member" });
    await seedMachine({ initials: "AFM", name: "Attack from Mars" });
    const token = "TokenEmptyCollection1234567890ab";
    const [col] = await db
      .insert(collections)
      .values({ name: "Empty Set", ownerId: owner.id, viewToken: token })
      .returning();
    if (!col) throw new Error("seed failed");

    signInAs(owner.id);
    const ownerView = render(
      await CollectionOverviewPage({
        params: Promise.resolve({ id: col.id }),
        searchParams: EMPTY_SEARCH,
      })
    );
    expect(
      screen.getByText("This collection is empty. Add machines to get started.")
    ).toBeInTheDocument();
    expect(screen.getByTestId("collection-add-machines")).toBeDisabled();
    ownerView.unmount();

    signOut();
    render(
      await CollectionOverviewPage({
        params: Promise.resolve({ id: token }),
        searchParams: EMPTY_SEARCH,
      })
    );
    expect(
      screen.getByText("No machines in this collection yet.")
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("collection-add-machines")
    ).not.toBeInTheDocument();
  });
});
