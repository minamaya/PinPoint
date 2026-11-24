import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { AddMachinesInline } from "./AddMachinesInline";

const updateCollection = vi.fn();
vi.mock("~/app/(app)/c/collections/actions", () => ({
  updateCollectionAction: (input: unknown) => updateCollection(input),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

const machines = [
  { id: "m-1", initials: "AFM", name: "Attack from Mars" },
  { id: "m-2", initials: "MM", name: "Medieval Madness" },
];

describe("AddMachinesInline", () => {
  let resizeObserverDescriptor: PropertyDescriptor | undefined;
  let scrollIntoViewDescriptor: PropertyDescriptor | undefined;

  beforeAll(() => {
    resizeObserverDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "ResizeObserver"
    );
    scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
      Element.prototype,
      "scrollIntoView"
    );
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      writable: true,
      value: MockResizeObserver,
    });
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });

  afterAll(() => {
    if (resizeObserverDescriptor) {
      Object.defineProperty(
        globalThis,
        "ResizeObserver",
        resizeObserverDescriptor
      );
    } else {
      Reflect.deleteProperty(globalThis, "ResizeObserver");
    }
    if (scrollIntoViewDescriptor) {
      Object.defineProperty(
        Element.prototype,
        "scrollIntoView",
        scrollIntoViewDescriptor
      );
    } else {
      Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    }
  });

  beforeEach(() => {
    updateCollection.mockReset();
    refresh.mockReset();
  });

  it("disables submit until a machine is picked, then saves and refreshes", async () => {
    updateCollection.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(
      <AddMachinesInline
        collectionId="c-1"
        collectionName="Friday League"
        allMachines={machines}
      />
    );

    expect(
      screen.getByText("This collection is empty. Add machines to get started.")
    ).toBeInTheDocument();
    const submit = screen.getByTestId("collection-add-machines");
    expect(submit).toBeDisabled();

    await user.click(screen.getByTestId("collection-machines-multiselect"));
    await user.click(screen.getByRole("option", { name: /Attack from Mars/ }));
    await user.keyboard("{Escape}");

    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() =>
      expect(updateCollection).toHaveBeenCalledWith({
        collectionId: "c-1",
        name: "Friday League",
        machineIds: ["m-1"],
      })
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it("shows an error alert and skips refresh when saving fails", async () => {
    updateCollection.mockResolvedValue({
      success: false,
      error: "Unknown machine",
    });
    const user = userEvent.setup();
    render(
      <AddMachinesInline
        collectionId="c-1"
        collectionName="Friday League"
        allMachines={machines}
      />
    );

    await user.click(screen.getByTestId("collection-machines-multiselect"));
    await user.click(screen.getByRole("option", { name: /Medieval Madness/ }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByTestId("collection-add-machines"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unknown machine"
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
