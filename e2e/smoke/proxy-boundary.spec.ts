import { expect, test } from "@playwright/test";
import { seededMachines } from "../support/constants.js";

test("the request proxy canonicalizes machine links", async ({ request }) => {
  const response = await request.get("/m/afm/i/12?from=qr", {
    maxRedirects: 0,
  });

  expect(response.status()).toBe(308);
  expect(response.headers()["location"]).toMatch(/\/m\/AFM\/i\/12\?from=qr$/);
});

test("HTML has a fresh CSP nonce that Next applies to scripts", async ({
  page,
  request,
}) => {
  const blockedScripts: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /content security policy|refused to execute script/i.test(message.text())
    ) {
      blockedScripts.push(message.text());
    }
  });

  const firstResponse = await page.goto("/login?autologin=off");
  expect(firstResponse).not.toBeNull();
  const firstCsp = firstResponse?.headers()["content-security-policy"];
  const firstNonce = firstCsp?.match(/'nonce-([^']+)'/)?.[1];
  expect(firstNonce).toBeTruthy();

  const scriptNonce = await page
    .locator("script[nonce]")
    .first()
    .evaluate((script) =>
      script instanceof HTMLScriptElement ? script.nonce : null
    );
  expect(scriptNonce).toBe(firstNonce);

  const secondResponse = await request.get("/login?autologin=off");
  const secondCsp = secondResponse.headers()["content-security-policy"];
  const secondNonce = secondCsp?.match(/'nonce-([^']+)'/)?.[1];
  expect(secondNonce).toBeTruthy();
  expect(secondNonce).not.toBe(firstNonce);

  await page.getByRole("link", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/signup$/);
  expect(blockedScripts).toEqual([]);
});

test("anonymous protected routes redirect while public routes stay open", async ({
  request,
}) => {
  const headers = { "x-skip-autologin": "true" };
  const protectedResponse = await request.get("/settings", {
    headers,
    maxRedirects: 0,
  });
  expect(protectedResponse.status()).toBe(307);
  expect(protectedResponse.headers()["location"]).toBe(
    "/login?next=%2Fsettings"
  );

  const publicResponse = await request.get("/login", { headers });
  expect(publicResponse.status()).toBe(200);
});

test("anonymous page-level machine guards redirect", async ({ request }) => {
  const headers = { "x-skip-autologin": "true" };

  // /m/* is public in middleware, so /m/new enforces auth inside NewMachinePage.
  const newMachineResponse = await request.get("/m/new", {
    headers,
    maxRedirects: 0,
  });
  expect(newMachineResponse.status()).toBe(307);
  expect(newMachineResponse.headers()["location"]).toMatch(
    /\/login\?next=%2Fm%2Fnew$/
  );

  // MachineEditPage sends anonymous viewers back to the public machine page.
  const { initials } = seededMachines.medievalMadness;
  const editResponse = await request.get(`/m/${initials}/edit`, {
    headers,
    maxRedirects: 0,
  });
  expect(editResponse.status()).toBe(307);
  expect(editResponse.headers()["location"]).toMatch(
    new RegExp(`/m/${initials}$`)
  );
});
