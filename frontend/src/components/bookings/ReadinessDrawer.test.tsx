import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import apiService, { ReadinessRunResponse } from "../../services/api";
import { ReadinessDrawer } from "./ReadinessDrawer";

/**
 * One drawer serves every booking on the page, so its mutations outlive the
 * booking they were started for: the user can close the drawer, or open another
 * booking's, while a draft or a run is still in flight. TanStack Query hands a
 * pending mutation the *latest* options on every render, so a callback reading
 * `bookingId` from its closure reads the booking open when the call returns —
 * which staged a draft about one customer's job in another customer's
 * conversation, one click from sending.
 */

vi.mock("../../services/api", () => ({
  default: {
    getLatestReadinessRun: vi.fn(),
    draftReadinessMessage: vi.fn(),
    createReadinessRun: vi.fn(),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

const api = vi.mocked(apiService);

const runFor = (bookingId: string): ReadinessRunResponse => ({
  runId: `run-${bookingId}`,
  status: "completed",
  freshness: "current",
  stale: false,
  plan: {
    bookingId,
    sourceFingerprint: "fp",
    readiness: "needs_attention",
    agreedScope: ["Clean the kitchen"],
    exclusions: [],
    findings: [
      {
        id: `finding-${bookingId}`,
        category: "access",
        severity: "attention",
        visibility: "shared",
        statement: `Access is unclear for ${bookingId}`,
        evidence: [{ source: "booking", recordId: bookingId, field: "location" }],
      },
    ],
    verification: { droppedCount: 0, semanticReviewRan: true },
    generatedAt: new Date().toISOString(),
    unavailableSections: [],
  },
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const setup = (client: QueryClient, onDraftReady = vi.fn(), onClose = vi.fn()) => {
  const ui = (bookingId: string | null, open: boolean) => (
    <React.StrictMode>
      <QueryClientProvider client={client}>
        <ReadinessDrawer
          bookingId={bookingId}
          open={open}
          onClose={onClose}
          onDraftReady={onDraftReady}
        />
      </QueryClientProvider>
    </React.StrictMode>
  );
  const view = render(ui("A", true));
  return { ...view, ui, onDraftReady, onClose };
};

const draftBody = { recipientRole: "customer" as const, purpose: "access", body: "About A", resolvesFindingIds: ["finding-A"] };

describe("a drawer call that finishes after the user moved on", () => {
  let client: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    api.getLatestReadinessRun.mockImplementation(async (id: string) => runFor(id));
  });

  it("hands over a draft for the booking that is still open", async () => {
    // The control: without it, the two cases below would pass against a drawer
    // that never hands anything over.
    const pending = deferred<typeof draftBody>();
    api.draftReadinessMessage.mockReturnValue(pending.promise);
    const { onDraftReady } = setup(client);

    fireEvent.click(await screen.findByTestId("readiness-draft"));
    await act(async () => pending.resolve(draftBody));

    await waitFor(() => expect(onDraftReady).toHaveBeenCalledWith("A", "About A"));
  });

  it("drops a draft that arrives after switching to another booking", async () => {
    const pending = deferred<typeof draftBody>();
    api.draftReadinessMessage.mockReturnValue(pending.promise);
    const { rerender, ui, onDraftReady } = setup(client);

    fireEvent.click(await screen.findByTestId("readiness-draft"));
    rerender(ui("B", true));
    await screen.findByText("Access is unclear for B");
    await act(async () => pending.resolve(draftBody));

    expect(onDraftReady).not.toHaveBeenCalled();
  });

  it("drops a draft that arrives after the drawer was closed", async () => {
    const pending = deferred<typeof draftBody>();
    api.draftReadinessMessage.mockReturnValue(pending.promise);
    const { rerender, ui, onDraftReady } = setup(client);

    fireEvent.click(await screen.findByTestId("readiness-draft"));
    rerender(ui(null, false));
    await act(async () => pending.resolve(draftBody));

    expect(onDraftReady).not.toHaveBeenCalled();
  });

  it("stores a run against the booking it was for, not the one now open", async () => {
    api.getLatestReadinessRun.mockImplementation(async (id: string) =>
      id === "A" ? { ...runFor("A"), plan: null } : runFor(id),
    );
    const pending = deferred<ReadinessRunResponse>();
    api.createReadinessRun.mockReturnValue(pending.promise);
    const { rerender, ui } = setup(client);

    fireEvent.click(await screen.findByTestId("readiness-run"));
    rerender(ui("B", true));
    await screen.findByText("Access is unclear for B");
    const freshA = { ...runFor("A"), runId: "run-A-fresh" };
    await act(async () => pending.resolve(freshA));

    expect(api.createReadinessRun).toHaveBeenCalledWith("A");
    expect(client.getQueryData<ReadinessRunResponse>(["readiness", "A"])?.runId).toBe(
      "run-A-fresh",
    );
    expect(client.getQueryData<ReadinessRunResponse>(["readiness", "B"])?.runId).toBe("run-B");
  });

  it("still shows a run as in flight after switching away and back", async () => {
    // Resetting the run on a switch re-enabled the button, and a second click
    // was refused by the server's one-in-flight-run-per-booking rule.
    // No plan on either booking, so both show the same "Check readiness" button.
    api.getLatestReadinessRun.mockImplementation(async (id: string) => ({
      ...runFor(id),
      plan: null,
    }));
    const pending = deferred<ReadinessRunResponse>();
    api.createReadinessRun.mockReturnValue(pending.promise);
    const { rerender, ui } = setup(client);

    fireEvent.click(await screen.findByTestId("readiness-run"));
    rerender(ui("B", true));
    await waitFor(() => expect(screen.getByTestId("readiness-run")).not.toBeDisabled());
    rerender(ui("A", true));

    await waitFor(() => expect(screen.getByTestId("readiness-run")).toBeDisabled());
    await act(async () => pending.resolve(runFor("A")));
  });

  it("keeps A's run in flight after a run is started on B", async () => {
    api.getLatestReadinessRun.mockImplementation(async (id: string) => ({
      ...runFor(id),
      plan: null,
    }));
    const runs: Record<string, ReturnType<typeof deferred<ReadinessRunResponse>>> = {
      A: deferred(),
      B: deferred(),
    };
    api.createReadinessRun.mockImplementation((id: string) => runs[id].promise);
    const { rerender, ui } = setup(client);

    fireEvent.click(await screen.findByTestId("readiness-run"));
    rerender(ui("B", true));
    await waitFor(() => expect(screen.getByTestId("readiness-run")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("readiness-run"));
    rerender(ui("A", true));

    await waitFor(() => expect(screen.getByTestId("readiness-run")).toBeDisabled());
    await act(async () => {
      runs.A.resolve(runFor("A"));
      runs.B.resolve(runFor("B"));
    });
  });

  it("offers no draft from a plan that is no longer current", async () => {
    api.getLatestReadinessRun.mockImplementation(async (id: string) => ({
      ...runFor(id),
      freshness: "stale",
      stale: true,
    }));
    setup(client);

    await screen.findByText("Access is unclear for A");
    expect(screen.queryByTestId("readiness-draft")).toBeNull();
  });

  it("keeps drafts when only the conversation has moved on", async () => {
    // Sending one message used to mark the plan stale and hide every other
    // draft, so asking a second question cost a paid re-run.
    api.getLatestReadinessRun.mockImplementation(async (id: string) => ({
      ...runFor(id),
      freshness: "messages_changed",
      stale: true,
    }));
    setup(client);

    await screen.findByText("Access is unclear for A");
    expect(screen.getByTestId("readiness-messages-changed")).toBeInTheDocument();
    expect(screen.queryByTestId("readiness-stale")).toBeNull();
    expect(screen.getByTestId("readiness-draft")).toBeEnabled();
  });

  it("allows one draft at a time", async () => {
    // The first draft to finish closes the drawer, so a second started
    // alongside it would be paid for and thrown away.
    api.getLatestReadinessRun.mockImplementation(async (id: string) => {
      const run = runFor(id);
      const [first] = run.plan!.findings;
      return {
        ...run,
        plan: {
          ...run.plan!,
          findings: [first, { ...first, id: "second", statement: "Parking is unclear" }],
        },
      };
    });
    api.draftReadinessMessage.mockReturnValue(deferred<typeof draftBody>().promise);
    setup(client);

    await screen.findByText("Parking is unclear");
    const [first, second] = screen.getAllByTestId("readiness-draft");
    fireEvent.click(first);

    await waitFor(() => expect(second).toBeDisabled());
    expect(api.draftReadinessMessage).toHaveBeenCalledTimes(1);
  });
});

describe("what the drawer says at the top", () => {
  let client: QueryClient;

  const finding = (
    id: string,
    severity: "blocking" | "attention" | "info",
    category: "payment" | "scope" | "access",
    extra: object = {},
  ) => ({
    id,
    category,
    severity,
    visibility: "shared" as const,
    statement: `statement ${id}`,
    evidence: [],
    ...extra,
  });

  const withFindings = (
    findings: ReturnType<typeof finding>[],
    extra: Partial<ReadinessRunResponse> = {},
  ) =>
    api.getLatestReadinessRun.mockImplementation(async (id: string) => {
      const run = runFor(id);
      return {
        ...run,
        ...extra,
        plan: { ...run.plan!, readiness: "blocked" as const, findings },
      };
    });

  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it("counts what there is to settle by category, instead of one word", async () => {
    // Listed attention-first on purpose: the summary and the list must order
    // by severity themselves, not inherit the server's order.
    withFindings([
      finding("a1", "attention", "access"),
      finding("b1", "blocking", "payment"),
      finding("a2", "attention", "payment"),
      finding("b2", "blocking", "scope"),
    ]);
    setup(client);

    const status = await screen.findByTestId("readiness-status");
    expect(status).toHaveTextContent("readiness.summary.blocking");
    expect(status).toHaveTextContent("readiness.summary.also_attention");

    const chips = screen.getAllByTestId("readiness-summary-chip");
    expect(chips.map((chip) => [chip.dataset.category, chip.textContent])).toEqual([
      ["payment", "readiness.category.payment · 2"],
      ["scope", "readiness.category.scope · 1"],
      ["access", "readiness.category.access · 1"],
    ]);

    // Blocking findings come first, whatever order they arrived in.
    expect(
      screen.getAllByTestId("readiness-finding").map((card) => card.dataset.severity),
    ).toEqual(["blocking", "blocking", "attention", "attention"]);
  });

  it("takes a category chip to that category's most severe finding", async () => {
    withFindings([
      finding("a2", "attention", "payment"),
      finding("b1", "blocking", "payment"),
    ]);
    const scrolled: string[] = [];
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
      scrolled.push(this.id);
    };
    setup(client);

    fireEvent.click(await screen.findByTestId("readiness-summary-chip"));

    expect(scrolled).toEqual(["readiness-finding-b1"]);
  });

  it("puts the points to settle above the agreed work, which starts folded", async () => {
    withFindings([finding("b1", "blocking", "payment")]);
    setup(client);

    await screen.findByText("statement b1");
    expect(screen.queryByText("Clean the kitchen")).toBeNull();

    fireEvent.click(screen.getByTestId("readiness-agreed-toggle"));
    expect(await screen.findByText("Clean the kitchen")).toBeInTheDocument();
  });

  it("shows the agreed work straight away when there is nothing to settle", async () => {
    withFindings([]);
    setup(client);

    expect(await screen.findByText("Clean the kitchen")).toBeInTheDocument();
  });

  it("tells each reader whether the next move is theirs", async () => {
    withFindings(
      [
        finding("mine", "blocking", "payment", { answerFrom: "provider" }),
        finding("theirs", "attention", "scope", { answerFrom: "customer" }),
        finding("ours", "attention", "access", { answerFrom: "both" }),
        finding("old", "info", "access"),
      ],
      { viewerRole: "provider" },
    );
    setup(client);

    await screen.findByText("statement mine");
    expect(
      screen.getAllByTestId("readiness-answer-from").map((el) => el.dataset.answerFrom),
    ).toEqual(["you", "customer", "both", "both"]);
  });

  it("says both parties see it only when that is true of everything shown", async () => {
    withFindings([finding("b1", "blocking", "payment")]);
    const first = setup(client);
    expect(await screen.findByTestId("readiness-status")).toHaveTextContent(
      "readiness.shared_note",
    );
    first.unmount();

    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    withFindings([
      finding("b1", "blocking", "payment"),
      finding("mine", "attention", "scope", { visibility: "customer_only" }),
    ]);
    setup(client);
    await screen.findByText("statement mine");
    expect(screen.getByTestId("readiness-status")).not.toHaveTextContent(
      "readiness.shared_note",
    );
  });

  it("does not show the count of items the checker threw away", async () => {
    withFindings([finding("b1", "blocking", "payment")]);
    setup(client);

    await screen.findByText("statement b1");
    expect(screen.queryByText(/readiness\.verification/)).toBeNull();
  });

  it("still says so when the plan was never double-checked", async () => {
    api.getLatestReadinessRun.mockImplementation(async (id: string) => {
      const run = runFor(id);
      return {
        ...run,
        plan: { ...run.plan!, verification: { droppedCount: 0, semanticReviewRan: false } },
      };
    });
    setup(client);

    expect(await screen.findByTestId("readiness-unreviewed")).toBeInTheDocument();
  });
});
