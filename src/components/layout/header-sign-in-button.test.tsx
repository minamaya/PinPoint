import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HeaderSignInButton } from "./header-sign-in-button";

const mockUsePathname = vi.fn<() => string>();
const mockUseSearchParams = vi.fn<() => URLSearchParams>();

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useSearchParams: () => mockUseSearchParams(),
}));

describe("HeaderSignInButton", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue("/report/detailed");
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
  });

  it("preserves pathname and query params in the login ?next= target", () => {
    mockUsePathname.mockReturnValue("/report/detailed");
    mockUseSearchParams.mockReturnValue(new URLSearchParams("machine=AFM"));

    render(<HeaderSignInButton />);

    const link = screen.getByTestId("nav-signin");
    expect(link).toHaveAttribute(
      "href",
      "/login?next=%2Freport%2Fdetailed%3Fmachine%3DAFM"
    );
  });

  it("omits ?next= when already on the root landing path", () => {
    mockUsePathname.mockReturnValue("/");
    mockUseSearchParams.mockReturnValue(new URLSearchParams());

    render(<HeaderSignInButton />);

    expect(screen.getByTestId("nav-signin")).toHaveAttribute("href", "/login");
  });

  it("preserves bare pathname without trailing question mark when query is empty", () => {
    mockUsePathname.mockReturnValue("/report");
    mockUseSearchParams.mockReturnValue(new URLSearchParams());

    render(<HeaderSignInButton testId="custom-signin" />);

    expect(screen.getByTestId("custom-signin")).toHaveAttribute(
      "href",
      "/login?next=%2Freport"
    );
  });
});
