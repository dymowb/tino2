import { describe, expect, it } from "vitest";
import type { ReadinessEvidence, ReadinessFinding } from "../../services/api";
import { answerFromKey, evidenceLine, summarizeFindings } from "./readinessFormat";

/** Known keys translate; anything else falls back the way i18next does. */
const dictionary: Record<string, string> = {
  "readiness.source.booking": "Booking",
  "readiness.source.quote": "Accepted quote",
  "readiness.field.scheduledDate": "Date and time",
  "readiness.field.notes": "Notes",
  "readiness.field.status": "Status",
  "readiness.evidence_message.you": "Your message",
  "readiness.evidence_message.customer": "Message from the customer",
  "readiness.evidence_message.other": "Message",
  "status.confirmed": "Confirmed",
};
const t = (key: string, options?: Record<string, unknown>) =>
  dictionary[key] ?? (options && "defaultValue" in options ? String(options.defaultValue) : key);

const ref = (over: Partial<ReadinessEvidence>): ReadinessEvidence => ({
  source: "booking",
  recordId: "r",
  field: "description",
  ...over,
});

describe("an evidence line a participant can read", () => {
  it("formats a stored instant instead of printing it", () => {
    const line = evidenceLine(
      ref({ field: "scheduledDate", excerpt: "2026-11-18T16:00:00.000Z" }),
      t,
      "en-US",
    );

    expect(line).toMatch(/^Booking · Date and time: /);
    expect(line).toContain("2026");
    expect(line).not.toContain("T16:00:00.000Z");
  });

  it("names a field in words and quotes what it says", () => {
    expect(
      evidenceLine(ref({ source: "quote", field: "notes", excerpt: "Bring products" }), t, "en"),
    ).toBe("Accepted quote · Notes: “Bring products”");
  });

  it("shows the source alone for a field it has no words for", () => {
    // Never the identifier: "Booking — conflictingBookingCount" is not copy.
    expect(evidenceLine(ref({ field: "someInternalField" }), t, "en")).toBe("Booking");
  });

  it("translates a status instead of quoting the enum", () => {
    expect(evidenceLine(ref({ field: "status", excerpt: "confirmed" }), t, "en")).toBe(
      "Booking · Status: Confirmed",
    );
  });

  it("attributes a quoted message to whoever wrote it", () => {
    const message = ref({
      source: "message",
      field: "text",
      excerpt: "Tenho um cachorro",
      from: "customer",
    });

    expect(evidenceLine(message, t, "en", "provider")).toBe(
      "Message from the customer: “Tenho um cachorro”",
    );
    expect(evidenceLine(message, t, "en", "customer")).toBe("Your message: “Tenho um cachorro”");
    expect(evidenceLine({ ...message, from: undefined }, t, "en", "customer")).toBe(
      "Message: “Tenho um cachorro”",
    );
  });
});

describe("the summary", () => {
  const finding = (
    id: string,
    severity: ReadinessFinding["severity"],
    category: ReadinessFinding["category"],
  ): ReadinessFinding => ({
    id,
    severity,
    category,
    visibility: "shared",
    statement: id,
    evidence: [],
  });

  it("counts by severity and groups by category, worst first", () => {
    const summary = summarizeFindings([
      finding("i", "info", "access"),
      finding("a", "attention", "payment"),
      finding("b", "blocking", "payment"),
    ]);

    expect(summary.counts).toEqual({ blocking: 1, attention: 1, info: 1 });
    expect(summary.categories).toEqual([
      { category: "payment", count: 2, severity: "blocking", firstId: "b" },
      { category: "access", count: 1, severity: "info", firstId: "i" },
    ]);
  });
});

describe("whose answer a finding needs", () => {
  it.each([
    ["provider", "provider", "you"],
    ["customer", "provider", "customer"],
    ["both", "provider", "both"],
    [undefined, "provider", "both"],
    ["customer", undefined, "customer"],
  ] as const)("%s seen by %s reads as %s", (answerFrom, viewer, expected) => {
    expect(answerFromKey(answerFrom, viewer)).toBe(expected);
  });
});
