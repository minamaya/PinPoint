/**
 * Page actions (list-views §3.7–§3.10, design-bible §26): buttons on the
 * title row, labeled and outlined while they fit and borderless icons
 * otherwise, then ⋯ ("More"), which holds the page's own entries (editing,
 * Export, Print entries, Delete) and any action that did not fit its row.
 * Below md ⋯ opens a sheet titled "More" instead of a menu (§3.10).
 *
 * Which actions fold depends on the room the row has, and an entry that
 * would be ⋯'s only one shows as its own button while there is room (§3.7),
 * so a test that only needs to reach an action goes through
 * `clickPageAction` and works at every width.
 */

import { expect, type Locator, type Page } from "@playwright/test";
import { openDropdownMenu } from "./actions.js";

/** Tailwind's `md`; below it ⋯ opens a sheet (`useIsMobile`). */
const MD_BREAKPOINT_PX = 768;

/** ⋯'s accessible name, and its sheet's title on phones. */
const MORE = "More";

/**
 * A page action's name. An entry that reads differently as its own button,
 * such as Export ("Export to CSV" in ⋯), names both.
 */
export type PageActionName =
  string | RegExp | { button: string | RegExp; entry: string | RegExp };

function buttonName(name: PageActionName): string | RegExp {
  return typeof name === "object" && "button" in name ? name.button : name;
}

function entryName(name: PageActionName): string | RegExp {
  return typeof name === "object" && "entry" in name ? name.entry : name;
}

function opensSheet(page: Page): boolean {
  const width = page.viewportSize()?.width ?? MD_BREAKPOINT_PX;
  return width < MD_BREAKPOINT_PX;
}

/** ⋯, the last page action. By test id: an open menu aria-hides it. */
export function pageActionsTrigger(page: Page): Locator {
  return page.getByTestId("page-actions-menu");
}

/** A page action shown as its own button (or link) on the title row. */
export function pageActionButton(page: Page, name: PageActionName): Locator {
  const main = page.getByRole("main");
  const shown = buttonName(name);
  return main
    .getByRole("button", { name: shown, exact: true })
    .or(main.getByRole("link", { name: shown, exact: true }));
}

/**
 * Opens ⋯ and returns what it opened: the menu from md up, the More sheet
 * below it.
 */
export async function openPageActions(page: Page): Promise<Locator> {
  await openDropdownMenu(pageActionsTrigger(page));
  const opened = opensSheet(page)
    ? page.getByRole("dialog", { name: MORE })
    : page.getByRole("menu");
  await expect(opened).toBeVisible();
  return opened;
}

/** Closes an open ⋯ and waits for it to go. */
export async function closePageActions(
  page: Page,
  opened: Locator
): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(opened).toBeHidden();
}

/**
 * An entry in an open ⋯: a menu item in the menu, a link or button in the
 * sheet.
 */
export function pageActionsEntry(
  opened: Locator,
  name: PageActionName
): Locator {
  const entry = entryName(name);
  return opened
    .getByRole("menuitem", { name: entry, exact: true })
    .or(opened.getByRole("link", { name: entry, exact: true }))
    .or(opened.getByRole("button", { name: entry, exact: true }));
}

/** Waits until the page actions have rendered: an action button or ⋯. */
async function waitForPageActions(
  page: Page,
  name: PageActionName
): Promise<Locator> {
  const button = pageActionButton(page, name);
  await expect(button.or(pageActionsTrigger(page)).first()).toBeVisible();
  return button;
}

/**
 * Clicks a page action wherever its row put it: its own button, or its entry
 * in ⋯ once it folded (§3.9). Also reaches an entry ⋯ always holds, such as
 * Edit collection… or Delete tag.
 */
export async function clickPageAction(
  page: Page,
  name: PageActionName
): Promise<void> {
  const button = await waitForPageActions(page, name);
  if (await button.isVisible()) {
    await button.click();
    return;
  }
  const opened = await openPageActions(page);
  await pageActionsEntry(opened, name).click();
}

/**
 * Asserts the viewer is offered a page action: as its own button, or as an
 * entry in ⋯. ⋯ is closed again before this returns.
 */
export async function expectPageAction(
  page: Page,
  name: PageActionName
): Promise<void> {
  const button = await waitForPageActions(page, name);
  if (await button.isVisible()) return;
  const opened = await openPageActions(page);
  await expect(pageActionsEntry(opened, name)).toBeVisible();
  await closePageActions(page, opened);
}

/**
 * Asserts the viewer is not offered a page action anywhere: no button for
 * it, and no entry in ⋯ when the page has one.
 */
export async function expectNoPageAction(
  page: Page,
  name: PageActionName
): Promise<void> {
  // A viewer may have no page actions at all, so nothing to wait for.
  await expect(pageActionButton(page, name)).toHaveCount(0);
  if ((await pageActionsTrigger(page).count()) === 0) return;
  const opened = await openPageActions(page);
  await expect(pageActionsEntry(opened, name)).toHaveCount(0);
  await closePageActions(page, opened);
}
