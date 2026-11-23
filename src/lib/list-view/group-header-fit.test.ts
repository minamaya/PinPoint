import { describe, expect, it } from "vitest";
import { FIT_TOLERANCE, planGroupHeader } from "./overflow";

// A 300px title and a description column of 24 + 280 = 304px beside it.
const title = 300;
const column = 24 + 280;

describe("planGroupHeader (list-views §8.10)", () => {
  const fit = (available: number): ReturnType<typeof planGroupHeader> =>
    planGroupHeader({ available, title, description: true });

  it("puts the description beside the title while its column fits", () => {
    expect(fit(title + column + FIT_TOLERANCE)).toEqual({
      descriptionBeside: true,
    });
  });

  it("moves the description under the title inside the tolerance", () => {
    expect(fit(title + column + FIT_TOLERANCE - 1)).toEqual({
      descriptionBeside: false,
    });
  });

  it("never puts a missing description beside", () => {
    expect(
      planGroupHeader({ available: 2000, title, description: false })
    ).toEqual({ descriptionBeside: false });
  });
});
