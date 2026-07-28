import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import ProfileCompletionPrompt from "./ProfileCompletionPrompt";

describe("ProfileCompletionPrompt", () => {
  test("offers an actionable next step for incomplete profiles", () => {
    const onAction = vi.fn();
    render(
      <ProfileCompletionPrompt
        completion={65}
        label="Profile completion"
        actionLabel="Complete profile"
        onAction={onAction}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Complete profile" }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(screen.getByText("65%")).toBeInTheDocument();
  });

  test("does not nag a completed provider", () => {
    render(
      <ProfileCompletionPrompt
        completion={100}
        label="Profile completion"
        actionLabel="Complete profile"
        onAction={() => undefined}
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
