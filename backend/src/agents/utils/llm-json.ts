/**
 * Robust JSON parsing for LLM responses.
 *
 * LLMs occasionally wrap JSON in markdown fences, prepend prose, emit trailing
 * commas, or — under rate limiting / truncation — return an empty or cut-off
 * body. A raw `JSON.parse` on any of those throws (classically
 * "Unexpected end of JSON input"), and an uncaught throw inside an agent
 * crashes the whole workflow into an error screen, discarding work already
 * done by earlier agents. These helpers parse defensively and let callers
 * supply a graceful fallback instead of crashing.
 */

import logger from '../../config/logger';
import { ClaudeResponse } from '../services/anthropic.service';

/**
 * Extract and parse the outermost JSON value of the requested shape from an
 * LLM response. Tolerates ```json fences, surrounding prose, and trailing
 * commas. Returns `null` on any failure (caller decides the fallback).
 */
export function parseLlmJson<T = any>(text: string, kind: 'object' | 'array' = 'object'): T | null {
  if (!text || typeof text !== 'string') return null;

  // Strip a markdown code fence if present (```json … ``` or ``` … ```).
  let cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) cleaned = fence[1].trim();

  // Slice from the first opening bracket to the last matching closing bracket,
  // dropping any prose the model wrapped around the JSON.
  const open = kind === 'array' ? '[' : '{';
  const close = kind === 'array' ? ']' : '}';
  const start = cleaned.indexOf(open);
  const end = cleaned.lastIndexOf(close);
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = cleaned.slice(start, end + 1);

  try {
    return JSON.parse(candidate) as T;
  } catch {
    // Light repair: strip trailing commas before } or ] and retry once.
    try {
      return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1')) as T;
    } catch {
      return null;
    }
  }
}

/**
 * Run a Claude call and parse its JSON, retrying the call on parse failure.
 * Transient empty/truncated responses (common when rate-limited) usually
 * succeed on a second attempt. Returns the parsed value (or `null` if every
 * attempt failed) alongside the last raw response so callers can still read
 * token usage for metadata.
 */
export async function parseClaudeJson<T>(
  runCall: () => Promise<ClaudeResponse>,
  kind: 'object' | 'array',
  opts: { agentName: string; retries?: number } = { agentName: 'agent' }
): Promise<{ parsed: T | null; response: ClaudeResponse }> {
  const retries = opts.retries ?? 1;
  let response = await runCall();
  let parsed = parseLlmJson<T>(response.text, kind);

  for (let attempt = 1; parsed === null && attempt <= retries; attempt++) {
    logger.warn(
      `[${opts.agentName}] could not parse LLM JSON (${kind}); retrying (${attempt}/${retries})`
    );
    response = await runCall();
    parsed = parseLlmJson<T>(response.text, kind);
  }

  if (parsed === null) {
    logger.warn(
      `[${opts.agentName}] LLM JSON unparseable after ${retries + 1} attempt(s); using fallback`
    );
  }

  return { parsed, response };
}
