import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { COOKIE_CONSENT_KEY } from "~/lib/cookies/constants";
import { hasCookieConsent } from "~/lib/cookies/client";
import { CookieConsentBanner } from "./CookieConsentBanner";

function clearConsentCookie(): void {
  document.cookie = `${COOKIE_CONSENT_KEY}=; path=/; max-age=0`;
}

describe("CookieConsentBanner", () => {
  beforeEach(() => {
    clearConsentCookie();
  });

  afterEach(() => {
    clearConsentCookie();
  });

  it("shows notice and Privacy link when consent cookie is absent, then hides and stores cookie on Got it", async () => {
    const user = userEvent.setup();
    render(<CookieConsentBanner />);

    const region = screen.getByRole("region", {
      name: "Cookie consent notice",
    });
    expect(region).toBeInTheDocument();
    expect(region).toHaveTextContent(
      "PinPoint uses cookies for authentication and to remember your preferences."
    );
    expect(screen.getByRole("link", { name: "Learn more" })).toHaveAttribute(
      "href",
      "/privacy"
    );
    expect(hasCookieConsent()).toBe(false);

    await user.click(screen.getByRole("button", { name: "Got it" }));

    expect(
      screen.queryByRole("region", { name: "Cookie consent notice" })
    ).not.toBeInTheDocument();
    expect(hasCookieConsent()).toBe(true);
    expect(document.cookie).toContain(`${COOKIE_CONSENT_KEY}=true`);
  });

  it("stays hidden when consent cookie is already present", () => {
    document.cookie = `${COOKIE_CONSENT_KEY}=true; path=/`;

    render(<CookieConsentBanner />);

    expect(
      screen.queryByRole("region", { name: "Cookie consent notice" })
    ).not.toBeInTheDocument();
  });
});
