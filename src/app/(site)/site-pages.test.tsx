import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LandingPage from "./page";
import AboutPage from "./about/page";
import PrivacyPage from "./privacy/page";
import TermsPage from "./terms/page";

vi.mock("next/image", () => ({
  default: ({
    alt,
    priority: _priority,
    fill: _fill,
    sizes: _sizes,
    quality: _quality,
    ...props
  }: React.ComponentProps<"img"> & {
    priority?: boolean;
    fill?: boolean;
    sizes?: string;
    quality?: number;
  }) => <img alt={alt} {...props} />,
}));

describe("Public site pages", () => {
  describe("LandingPage", () => {
    it("renders welcome heading, APC logo link, and primary CTAs to /m, /report, and /dashboard", () => {
      render(<LandingPage />);

      expect(
        screen.getByRole("heading", { level: 1, name: "Welcome to PinPoint" })
      ).toBeInTheDocument();

      const apcLogo = screen.getByTestId("hero-apc-logo");
      expect(apcLogo).toBeInTheDocument();
      expect(
        screen.getByRole("link", {
          name: "Visit Austin Pinball Collective website",
        })
      ).toHaveAttribute("href", "https://austinpinballcollective.org");

      expect(screen.getByTestId("cta-browse-machines")).toHaveAttribute(
        "href",
        "/m"
      );
      expect(screen.getByTestId("cta-report-issue")).toHaveAttribute(
        "href",
        "/report"
      );
      expect(screen.getByTestId("cta-dashboard")).toHaveAttribute(
        "href",
        "/dashboard"
      );
    });
  });

  describe("AboutPage", () => {
    it("renders About PinPoint content and legal links to /privacy and /terms", () => {
      render(<AboutPage />);

      expect(screen.getByText("About PinPoint")).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Austin Pinball Collective" })
      ).toHaveAttribute("href", "https://austinpinballcollective.org");
      expect(
        screen.getByRole("link", { name: "Privacy Policy" })
      ).toHaveAttribute("href", "/privacy");
      expect(
        screen.getByRole("link", { name: "Terms of Service" })
      ).toHaveAttribute("href", "/terms");
    });
  });

  describe("PrivacyPage & TermsPage", () => {
    it("renders PrivacyPolicy with cross-link to /terms", () => {
      render(<PrivacyPage />);

      expect(screen.getByText("Privacy Policy")).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Terms of Service" })
      ).toHaveAttribute("href", "/terms");
    });

    it("renders TermsPage with cross-link to /privacy", () => {
      render(<TermsPage />);

      expect(screen.getByText("Terms of Service")).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Privacy Policy" })
      ).toHaveAttribute("href", "/privacy");
    });
  });
});
