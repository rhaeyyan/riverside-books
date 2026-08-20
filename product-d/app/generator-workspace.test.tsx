// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { fixtureBook } from "../lib/content/book.fixture";
import { GeneratorWorkspace } from "./generator-workspace";
import HomePage from "./page";

function variationCards(): HTMLElement[] {
  return screen.queryAllByRole("region", { name: /^Variation [1-3]$/i });
}

function captionsFrom(cards: HTMLElement[]): string[] {
  return cards.map((card) => {
    const caption = within(card).getByLabelText("Caption").textContent;

    if (!caption) throw new Error("Every variation must expose its caption");

    return caption;
  });
}

describe("GeneratorWorkspace", () => {
  it("is rendered by the Product D page", () => {
    render(<HomePage />);

    expect(screen.getByRole("combobox", { name: "Record" })).toBeVisible();
    expect(screen.getByRole("radiogroup", { name: "Channel" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Generate" })).toBeEnabled();
  });

  it("shows the selected fixture facts and accessible generation controls", () => {
    render(<GeneratorWorkspace record={fixtureBook} />);

    expect(
      screen.getByRole("heading", { name: "Create social content" }),
    ).toBeVisible();

    const recordSelector = screen.getByRole("combobox", { name: "Record" });

    expect(recordSelector).toBeVisible();
    expect(recordSelector).toHaveValue(fixtureBook.id);
    expect(
      within(recordSelector).getByRole("option", { name: fixtureBook.title }),
    ).toBeInTheDocument();

    const sourceFacts = screen.getByRole("region", { name: "Source facts" });

    if (fixtureBook.author === null) {
      throw new Error("The Phase 0 fixture book must include an author");
    }

    expect(within(sourceFacts).getByText(fixtureBook.title)).toBeVisible();
    expect(within(sourceFacts).getByText(fixtureBook.author)).toBeVisible();
    expect(within(sourceFacts).getByText("$18.99")).toBeVisible();

    const channelGroup = screen.getByRole("radiogroup", { name: "Channel" });
    const instagram = within(channelGroup).getByRole("radio", {
      name: "Instagram",
    });
    const facebook = within(channelGroup).getByRole("radio", {
      name: "Facebook",
    });

    expect(instagram).toBeChecked();
    expect(facebook).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Generate" })).toBeEnabled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("renders exactly three distinct, fully labeled variations", async () => {
    render(<GeneratorWorkspace record={fixtureBook} />);

    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() => expect(variationCards()).toHaveLength(3));

    const cards = variationCards();
    const captions = captionsFrom(cards);

    expect(new Set(captions).size).toBe(3);

    for (const [index, card] of cards.entries()) {
      expect(
        within(card).getByRole("heading", {
          name: `Variation ${index + 1}`,
        }),
      ).toBeVisible();
      expect(within(card).getByLabelText("Caption")).toHaveTextContent(
        fixtureBook.title,
      );
      expect(
        within(card).getByLabelText("Post idea"),
      ).not.toBeEmptyDOMElement();
      expect(
        within(card).getByText("No unsupported facts flagged"),
      ).toBeVisible();
    }
  });

  it("clears stale results when the channel changes and generates changed Facebook captions", async () => {
    render(<GeneratorWorkspace record={fixtureBook} />);

    const generate = screen.getByRole("button", { name: "Generate" });

    fireEvent.click(generate);
    await waitFor(() => expect(variationCards()).toHaveLength(3));
    const instagramCaptions = captionsFrom(variationCards());

    fireEvent.click(screen.getByRole("radio", { name: "Facebook" }));

    expect(screen.getByRole("radio", { name: "Facebook" })).toBeChecked();
    expect(variationCards()).toHaveLength(0);

    fireEvent.click(generate);
    await waitFor(() => expect(variationCards()).toHaveLength(3));
    const facebookCaptions = captionsFrom(variationCards());

    expect(new Set(facebookCaptions).size).toBe(3);
    expect(facebookCaptions).not.toEqual(instagramCaptions);
    for (const caption of facebookCaptions) {
      expect(instagramCaptions).not.toContain(caption);
    }
  });

  it("replaces results on repeated generation instead of appending cards", async () => {
    render(<GeneratorWorkspace record={fixtureBook} />);

    const generate = screen.getByRole("button", { name: "Generate" });

    fireEvent.click(generate);
    await waitFor(() => expect(variationCards()).toHaveLength(3));

    fireEvent.click(generate);
    fireEvent.click(generate);

    await waitFor(() => expect(variationCards()).toHaveLength(3));
  });
});
