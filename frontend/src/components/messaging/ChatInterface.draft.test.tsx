import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stashMessageDraft } from "../../utils/messageDraft";
import ChatInterface from "./ChatInterface";

/**
 * The hand-off from the readiness drawer into the composer.
 *
 * `ChatInterface` has two effects that both write the composer's text: one
 * clears it when the conversation changes, one fills it from a claimed draft.
 * React applies effects in declaration order within a flush, and a warm-cached
 * conversation query delivers its data on the first render — so with the claim
 * declared first, the clear landed on top of a draft that had already been
 * removed from the stash. The composer came up empty, the draft was gone, and a
 * paid model call was wasted. It only reproduced from the *second* use onward,
 * which is why walking the flow once by hand did not show it.
 */
const BOOKING = "booking-1";
const CONVERSATION = "conversation-1";

vi.mock("../../services/api", () => ({
  default: {
    getConversation: vi.fn(async () => ({
      id: CONVERSATION,
      type: "direct",
      participants: [],
      metadata: { bookingId: BOOKING },
    })),
    getMessages: vi.fn(async () => ({ data: [] })),
    getStoredUser: vi.fn(() => ({ id: "user-1" })),
    sendMessage: vi.fn(),
    updateMessage: vi.fn(),
    deleteMessage: vi.fn(),
    markMessagesAsRead: vi.fn(async () => undefined),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));

/**
 * Rendered inside `<React.StrictMode>` because `index.tsx` is — and that is not
 * cosmetic. StrictMode runs mount effects setup → cleanup → setup, which is what
 * exposed a claim that could only apply what it took once: the second pass
 * re-ran the composer reset and skipped the claim, clearing a draft that
 * `takeMessageDraft` had already removed from the stash. A test that omits the
 * wrapper the app uses cannot see that.
 */
const renderChat = (client: QueryClient, conversationId = CONVERSATION) =>
  render(
    <React.StrictMode>
      <QueryClientProvider client={client}>
        <ChatInterface conversationId={conversationId} />
      </QueryClientProvider>
    </React.StrictMode>,
  );

const composer = () =>
  screen
    .getAllByRole("textbox")
    .find((el) => el instanceof HTMLTextAreaElement) as
    HTMLTextAreaElement | undefined;

describe("claiming a drafted message", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    // jsdom does not implement it; the component scrolls to the newest message
    // on mount. Not what is under test.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("fills the composer when the conversation is already cached", async () => {
    // The regression case. Seeding the cache makes the query resolve on the
    // first render, so both effects run in one flush — exactly what happens the
    // second time a user drafts, because the first visit warmed the cache.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(["conversation", CONVERSATION], {
      id: CONVERSATION,
      type: "direct",
      participants: [],
      metadata: { bookingId: BOOKING },
    });
    stashMessageDraft(BOOKING, "Alguém poderá atender o interfone?");

    renderChat(client);

    await waitFor(() => expect(composer()).toBeDefined());
    await waitFor(() =>
      expect(composer()?.value).toBe("Alguém poderá atender o interfone?"),
    );
  });

  it("fills the composer when the conversation has to be fetched", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    stashMessageDraft(BOOKING, "Confirma quem leva os produtos?");

    renderChat(client);

    await waitFor(() =>
      expect(composer()?.value).toBe("Confirma quem leva os produtos?"),
    );
  });

  it("still claims after the user has opened a different thread first", async () => {
    // The fallback route selects nothing, so the user may well open another
    // conversation before the right one. A per-mount flag would have been spent
    // by that first thread and the draft would never arrive.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(["conversation", "other-conversation"], {
      id: "other-conversation",
      type: "direct",
      participants: [],
      metadata: { bookingId: "some-other-booking" },
    });
    stashMessageDraft(BOOKING, "Confirma o horário?");

    // Re-rendered, not remounted: `MessagingPage` keeps one `ChatInterface`
    // and swaps `conversationId`, so the ref survives the switch. A per-mount
    // flag would have been spent by the first thread and never reset.
    const { rerender } = renderChat(client, "other-conversation");
    await waitFor(() => expect(composer()).toBeDefined());
    expect(composer()?.value).toBe("");

    rerender(
      <React.StrictMode>
        <QueryClientProvider client={client}>
          <ChatInterface conversationId={CONVERSATION} />
        </QueryClientProvider>
      </React.StrictMode>,
    );

    await waitFor(() => expect(composer()?.value).toBe("Confirma o horário?"));
  });

  it("does not resurrect a draft the user has already sent", async () => {
    // The claim keeps what it took so a StrictMode second pass can re-apply it.
    // That must not mean re-applying it forever: `getConversationById` embeds
    // the message list, so sending the draft changes the payload, and an effect
    // keyed on the whole object wrote the sent text back into the now-empty
    // composer — one keystroke from sending it twice.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const conversation = {
      id: CONVERSATION,
      type: "direct",
      participants: [],
      metadata: { bookingId: BOOKING },
      messages: [] as unknown[],
    };
    client.setQueryData(["conversation", CONVERSATION], conversation);
    stashMessageDraft(BOOKING, "Alguém poderá atender o interfone?");

    renderChat(client);
    await waitFor(() =>
      expect(composer()?.value).toBe("Alguém poderá atender o interfone?"),
    );

    // The user sends it: the composer is cleared the way the send mutation does.
    fireEvent.change(composer() as HTMLTextAreaElement, {
      target: { value: "" },
    });
    expect(composer()?.value).toBe("");

    // A refetch lands carrying the message that was just sent.
    client.setQueryData(["conversation", CONVERSATION], {
      ...conversation,
      messages: [{ id: "m1", message: "Alguém poderá atender o interfone?" }],
    });

    await waitFor(() => expect(composer()).toBeDefined());
    expect(composer()?.value).toBe("");
  });

  it("stays empty when stepping through a thread with no booking and back", async () => {
    // Quote-scoped and ad-hoc conversations carry no `bookingId`, and the claim
    // effect returns early on them. Review raised that the early return happened
    // before the stale claim was invalidated, which would let a sent draft
    // return. The invalidation was moved first regardless — it is strictly safer
    // — but be honest about this case: it passes with the invalidation in either
    // position, so it documents the flow rather than fencing that defect.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(["conversation", CONVERSATION], {
      id: CONVERSATION,
      type: "direct",
      participants: [],
      metadata: { bookingId: BOOKING },
    });
    client.setQueryData(["conversation", "quote-conversation"], {
      id: "quote-conversation",
      type: "direct",
      participants: [],
      // No bookingId — this is what `messageProviderFromQuote` creates.
      metadata: { quoteRequestId: "q1", serviceType: "Limpeza" },
    });
    stashMessageDraft(BOOKING, "Alguém poderá atender o interfone?");

    const { rerender } = renderChat(client);
    await waitFor(() =>
      expect(composer()?.value).toBe("Alguém poderá atender o interfone?"),
    );

    // Sent, then away to a thread with no booking, then back.
    fireEvent.change(composer() as HTMLTextAreaElement, {
      target: { value: "" },
    });
    const show = (id: string) =>
      rerender(
        <React.StrictMode>
          <QueryClientProvider client={client}>
            <ChatInterface conversationId={id} />
          </QueryClientProvider>
        </React.StrictMode>,
      );

    show("quote-conversation");
    await waitFor(() => expect(composer()?.value).toBe(""));

    show(CONVERSATION);
    await waitFor(() => expect(composer()).toBeDefined());
    expect(composer()?.value).toBe("");
  });

  it("leaves the composer alone when the draft belongs to another booking", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    stashMessageDraft("a-different-booking", "not for this thread");

    renderChat(client);

    await waitFor(() => expect(composer()).toBeDefined());
    expect(composer()?.value).toBe("");
    // And it is still waiting for the thread it was written for.
    expect(sessionStorage.getItem("tino.messageDraft")).toContain(
      "a-different-booking",
    );
  });
});
