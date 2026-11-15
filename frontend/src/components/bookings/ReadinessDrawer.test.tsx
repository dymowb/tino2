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
