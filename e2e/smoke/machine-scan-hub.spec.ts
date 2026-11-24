import { expect, test } from "../support/fixtures.js";
import { seededMachines } from "../support/constants.js";

test("apron scan opens Quick report with AFM and source preserved", async ({
  page,
}) => {
  const initials = seededMachines.attackFromMars.initials;
  await page.goto(`/m/${initials}/hub?source=apron`);

  await page.getByRole("link", { name: "Report a problem" }).click();

  await expect(page).toHaveURL(`/report?machine=${initials}&source=apron`);
  await expect(page.getByRole("combobox", { name: "Machine" })).toContainText(
    "Attack from Mars"
  );
  await expect(page.getByTestId("report-source")).toHaveValue("apron");
  await expect(page.getByRole("link", { name: "Add details" })).toHaveAttribute(
    "href",
    "/report/detailed?machine=AFM&source=apron"
  );

  await page.getByRole("link", { name: "Add details" }).click();
  await expect(page).toHaveURL("/report/detailed?machine=AFM&source=apron");
  await expect(
    page.getByRole("combobox", { name: "Select Machine" })
  ).toContainText("Attack from Mars");
  await expect(page.getByTestId("report-source")).toHaveValue("apron");
  const loginHref = await page
    .getByRole("link", { name: "Log in" })
    .getAttribute("href");
  expect(loginHref).toBeTruthy();
  if (!loginHref) throw new Error("Expected a login link on Detailed report.");
  const loginUrl = new URL(loginHref, page.url());
  expect(loginUrl.searchParams.get("next")).toBe(
    "/report/detailed?machine=AFM&source=apron"
  );
});

test.describe("artwork band (PP-o355.60)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("shows the band with both button rows and peeks Top scores; nothing is pinned", async ({
    page,
  }) => {
    // Answer OPDB image requests locally; the suite never reaches img.opdb.org.
    await page.route("https://img.opdb.org/**", (route) =>
      route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
          "base64"
        ),
      })
    );
    const initials = seededMachines.medievalMadness.initials;
    await page.goto(`/m/${initials}/hub`);

    const band = page.getByTestId("hub-artwork-band");
    await expect(band).toBeVisible();
    // Spec §3.1, §4.5: the identity is not a link; Game details is.
    await expect(
      band.getByRole("link", { name: /medieval madness/i })
    ).toHaveCount(0);
    const actions = page.getByRole("navigation", { name: "Machine actions" });
    await expect(
      actions.getByRole("link", { name: "Game details" })
    ).toHaveAttribute("href", `/m/${initials}`);
    await expect(
      actions.getByRole("link", { name: /ask pinbrain/i })
    ).toHaveAttribute("target", "_blank");
    const report = page.getByRole("link", { name: "Report a problem" });
    await expect(report).toBeInViewport();

    // Spec §3.7, §5.4: both button rows and the top 60px of Top scores show
    // above the tab bar on first load, and the band never drops below 180px.
    const layout = await page.evaluate(() => {
      const scores = document.querySelector(
        "section[aria-labelledby=hub-scores-heading]"
      );
      const tabBar = document.querySelector('[aria-label="mobile navigation"]');
      const art = document.querySelector("[data-testid=hub-artwork-band]");
      return {
        scoresTop: scores?.getBoundingClientRect().top ?? Infinity,
        tabBarTop: tabBar?.getBoundingClientRect().top ?? window.innerHeight,
        bandHeight: art?.getBoundingClientRect().height ?? 0,
      };
    });
    expect(layout.tabBarTop - layout.scoresTop).toBeGreaterThanOrEqual(60);
    expect(layout.bandHeight).toBeGreaterThanOrEqual(180);

    // Spec §5.5: nothing is pinned, so the actions move by exactly the
    // distance the page scrolls.
    const moved = await page.locator("#main-content").evaluate((main) => {
      const actions = document.querySelector('[aria-label="Machine actions"]');
      const before = actions?.getBoundingClientRect().top ?? 0;
      main.scrollTo(0, main.scrollHeight);
      return {
        scrolled: main.scrollTop,
        shift: before - (actions?.getBoundingClientRect().top ?? 0),
      };
    });
    expect(moved.scrolled).toBeGreaterThan(0);
    expect(moved.shift).toBeCloseTo(moved.scrolled, 0);
  });
});
