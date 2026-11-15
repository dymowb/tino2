import type { ReadinessEvidence, ReadinessFinding } from "../../services/api";

type T = (key: string, options?: Record<string, unknown>) => string;
type Role = "customer" | "provider";
type Severity = ReadinessFinding["severity"];

export const SEVERITY_ORDER: Record<Severity, number> = {
  blocking: 0,
  attention: 1,
  info: 2,
};

const DATE_FIELDS = new Set(["scheduledDate", "preferredDate"]);

/** "15 Nov 2026, 14:16" in the reader's language. No seconds: nobody needs them. */
export function formatWhen(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * One evidence reference as something a participant can read.
 *
 * The server sends the record's own field name and raw value — `scheduledDate`,
 * `"2026-11-18T16:00:00.000Z"`, `status: "pending"` — which is what the agents
 * cite and what validation checks, but not something to put in front of a
 * customer. An unknown field shows its source alone rather than a camelCase
 * identifier.
 */
export function evidenceLine(
  ref: ReadinessEvidence,
  t: T,
  locale: string,
  viewerRole?: Role,
): string {
  if (ref.source === "message") {
    // A quoted message is one participant's words, not a platform fact, so it
    // always says whose.
    const who =
      ref.from && ref.from === viewerRole ? "you" : (ref.from ?? "other");
    const label = t(`readiness.evidence_message.${who}`);
    const when = ref.at ? `, ${formatWhen(ref.at, locale)}` : "";
    return ref.excerpt
      ? `${label}${when}: “${ref.excerpt}”`
      : `${label}${when}`;
  }

  const source = t(`readiness.source.${ref.source}`);
  const field = t(`readiness.field.${ref.field}`, { defaultValue: "" });
  const head = field ? `${source} · ${field}` : source;
  const value = evidenceValue(ref, t, locale);
  return value ? `${head}: ${value}` : head;
}

function evidenceValue(ref: ReadinessEvidence, t: T, locale: string): string {
  if (!ref.excerpt) return "";
  if (DATE_FIELDS.has(ref.field)) return formatWhen(ref.excerpt, locale);
  if (ref.field === "status") {
    return t(`status.${ref.excerpt}`, { defaultValue: ref.excerpt });
  }
  if (ref.field === "paymentStatus") {
    return t(`payment_status.${ref.excerpt}`, { defaultValue: ref.excerpt });
  }
  return `“${ref.excerpt}”`;
}

export interface CategorySummary {
  category: ReadinessFinding["category"];
  count: number;
  /** The worst severity among this category's findings. */
  severity: Severity;
  /** Where the summary jumps to: the category's most severe finding. */
  firstId: string;
}

export interface FindingsSummary {
  counts: Record<Severity, number>;
  categories: CategorySummary[];
}

/**
 * What the headline says instead of one word. "Blocked" told a reader neither
 * how much was wrong nor about what; counts by severity and by category do.
 */
export function summarizeFindings(findings: ReadinessFinding[]): FindingsSummary {
  const counts: Record<Severity, number> = { blocking: 0, attention: 0, info: 0 };
  const byCategory = new Map<string, CategorySummary>();

  for (const finding of sortFindings(findings)) {
    counts[finding.severity] += 1;
    const existing = byCategory.get(finding.category);
    if (existing) {
      existing.count += 1;
    } else {
      // Sorted worst-first, so the first one seen is the worst and the target.
      byCategory.set(finding.category, {
        category: finding.category,
        count: 1,
        severity: finding.severity,
        firstId: finding.id,
      });
    }
  }

  return { counts, categories: [...byCategory.values()] };
}

export function sortFindings(findings: ReadinessFinding[]): ReadinessFinding[] {
  return [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
}

/**
 * Who has to answer, from the reader's side. `both` when the plan does not say:
 * it is the one reading that never tells someone to wait for the other person.
 */
export function answerFromKey(
  answerFrom: ReadinessFinding["answerFrom"],
  viewerRole?: Role,
): "you" | "both" | Role {
  if (!answerFrom || answerFrom === "both") return "both";
  return answerFrom === viewerRole ? "you" : answerFrom;
}
