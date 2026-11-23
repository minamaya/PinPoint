import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useFormDirty } from "~/hooks/use-form-dirty";

function Harness(): React.JSX.Element {
  const { dirty, formProps } = useFormDirty();
  return (
    <form {...formProps}>
      <input aria-label="Name" defaultValue="Ada" name="name" />
      <input aria-label="Send" name="send" type="checkbox" defaultChecked />
      <select aria-label="Role" name="role" defaultValue="member">
        <option value="member">member</option>
        <option value="admin">admin</option>
      </select>
      <output data-testid="state">{dirty ? "dirty" : "clean"}</output>
    </form>
  );
}

describe("useFormDirty", () => {
  it("starts clean", () => {
    render(<Harness />);
    expect(screen.getByTestId("state")).toHaveTextContent("clean");
  });

  it("is dirty after a text edit and clean again when it is undone", async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText("Name"), "x");
    expect(screen.getByTestId("state")).toHaveTextContent("dirty");
    await userEvent.type(screen.getByLabelText("Name"), "{Backspace}");
    expect(screen.getByTestId("state")).toHaveTextContent("clean");
  });

  it("tracks checkboxes and selects", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByLabelText("Send"));
    expect(screen.getByTestId("state")).toHaveTextContent("dirty");
    await userEvent.click(screen.getByLabelText("Send"));
    expect(screen.getByTestId("state")).toHaveTextContent("clean");
    await userEvent.selectOptions(screen.getByLabelText("Role"), "admin");
    expect(screen.getByTestId("state")).toHaveTextContent("dirty");
  });
});
