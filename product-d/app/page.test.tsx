// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("Product D Phase 0 shell", () => {
  it("identifies the Product D marketing workspace with an accessible heading", () => {
    render(<HomePage />);

    expect(screen.getByText("Riverside Books")).toBeVisible();
    expect(screen.getByText("Product D")).toBeVisible();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Social content grounded in the books and events you trust.",
      }),
    ).toBeVisible();
  });

  it("presents the complete deterministic Phase 0 workflow", () => {
    render(<HomePage />);

    expect(screen.getByText("Phase 0 in progress")).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 2, name: "The first workflow" }),
    ).toBeVisible();

    const steps = within(screen.getByRole("list")).getAllByRole("listitem");

    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent("Select a current book or event");
    expect(steps[1]).toHaveTextContent("Choose Instagram or Facebook");
    expect(steps[2]).toHaveTextContent("Review three grounded variations");
    expect(
      screen.getByText(/No content is published automatically/i),
    ).toBeVisible();
  });
});
