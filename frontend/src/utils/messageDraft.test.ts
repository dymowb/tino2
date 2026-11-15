import { beforeEach, describe, expect, it } from "vitest";
import { stashMessageDraft, takeMessageDraft } from "./messageDraft";

/**
 * The handoff between the readiness drawer and the message composer.
 *
 * It carries a sentence the user is about to send to another person, so it is
 * keyed by booking and read once: a draft written for one conversation must not
 * appear in another, and must not come back after it has been used.
 */
describe("message draft handoff", () => {
  beforeEach(() => sessionStorage.clear());

  it("hands the draft to the conversation it was written for", () => {
    stashMessageDraft("booking-1", "Alguém poderá atender o interfone?");

    expect(takeMessageDraft("booking-1")).toBe(
      "Alguém poderá atender o interfone?",
    );
  });

  it("does not surface in a different booking's thread", () => {
    // The composer mounts for whichever conversation is open; a draft keyed to
    // another booking has to stay put rather than land in the wrong chat.
    stashMessageDraft("booking-1", "secret question about booking one");

    expect(takeMessageDraft("booking-2")).toBeNull();
    // And is still waiting for the right one.
    expect(takeMessageDraft("booking-1")).toBe(
      "secret question about booking one",
    );
  });

  it("is read once, so returning to Messages later does not refill it", () => {
    stashMessageDraft("booking-1", "already sent this");

    expect(takeMessageDraft("booking-1")).toBe("already sent this");
    expect(takeMessageDraft("booking-1")).toBeNull();
  });

  it("returns nothing when there is no draft, or no booking to match", () => {
    expect(takeMessageDraft("booking-1")).toBeNull();
    expect(takeMessageDraft(null)).toBeNull();
    expect(takeMessageDraft(undefined)).toBeNull();
  });

  it("survives a corrupt stash rather than throwing into the composer", () => {
    sessionStorage.setItem("tino.messageDraft", "not json");

    expect(takeMessageDraft("booking-1")).toBeNull();
  });
});
