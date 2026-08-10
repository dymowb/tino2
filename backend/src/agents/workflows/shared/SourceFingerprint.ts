import { createHash } from 'crypto';

/**
 * Stable hash over the facts that would change a workflow's answer.
 *
 * Deliberately NOT `updatedAt`: a cosmetic touch on a booking row would mark
 * every existing plan stale and push users into needless re-runs. The caller
 * picks the fields that are actually load-bearing.
 */
export function fingerprint(parts: unknown): string {
  return createHash('sha256').update(stableStringify(parts)).digest('hex').slice(0, 32);
}

/**
 * JSON.stringify with sorted object keys, so two structurally equal snapshots
 * always hash identically regardless of property insertion order.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(',')}}`;
}
