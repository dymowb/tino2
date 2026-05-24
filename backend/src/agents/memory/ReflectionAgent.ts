import { anthropicService, ClaudeModel } from '@/agents/services/anthropic.service';
import logger from '@/config/logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EpisodeSummary {
  id: string;
  summary: string;
  occurredAt: Date;
  importance: number;
}

export interface ReflectedFact {
  content: string;
  confidence: number;
  importance: number;
  sourceEpisodeIds: string[];
}

export interface ReflectedRule {
  ruleText: string;
  promptFragment: string;
  confidence: number;
  sourceEpisodeIds: string[];
}

export interface ReflectionOutput {
  semanticFacts: ReflectedFact[];
  proceduralRules: ReflectedRule[];
}

// ── System prompt ─────────────────────────────────────────────────────────────
// Design note: Sonnet (not Haiku) — pattern recognition across sessions requires
// more reasoning than single-turn extraction. The prompt explicitly asks for
// cross-session patterns only; single-session facts are already handled by
// ExtractionAgent and we don't want duplicates.

const SYSTEM_PROMPT = `You are a reflection agent for a domestic-service platform (Tino). Your job is to analyze a series of past session summaries for a single user and identify durable cross-session patterns worth remembering.

You will receive a list of session summaries ordered chronologically. Identify:
1. Stable facts that appear repeatedly or are implied by a consistent pattern of behaviour
2. Behavioral rules the agent should apply automatically in future sessions

Output ONLY valid JSON matching this schema exactly:
{
  "semantic_facts": [
    {
      "content": string,
      "confidence": number,
      "importance": number,
      "source_episode_ids": string[]
    }
  ],
  "procedural_rules": [
    {
      "rule_text": string,
      "prompt_fragment": string,
      "confidence": number,
      "source_episode_ids": string[]
    }
  ]
}

## Confidence rubric
- 0.9–1.0: Pattern appears in ≥ 3 sessions or was stated explicitly multiple times
- 0.7–0.89: Pattern appears in 2 sessions or is strongly implied
- 0.65–0.69: Pattern appears once but is highly specific and credible
- Below 0.65: Do not include — insufficient evidence

## Importance rubric (semantic_facts)
- 0.8–1.0: Critical for search/matching (consistent location, budget, pet restrictions)
- 0.5–0.79: Useful context (schedule preferences, provider quality bar)
- Below 0.5: Do not include

## Rules format guidance
- rule_text: Plain English description of the pattern ("User consistently books only providers with ≥ 10 reviews")
- prompt_fragment: Actionable instruction for the agent in Portuguese, ready to inject into a system prompt ("Ao buscar prestadores para este usuário, aplicar filtro mínimo de 10 avaliações")
- source_episode_ids: UUIDs of the specific episodes that support this pattern

## Critical rules
- Only extract CROSS-SESSION patterns — do NOT re-extract facts already obvious from a single session
- Do NOT invent patterns not present in the summaries
- Do NOT include PII (phone, CPF, exact addresses, cards)
- source_episode_ids MUST reference episode IDs from the input — never invent them
- semantic_facts must be ATOMIC (one fact per entry)
- procedural_rules must be ACTIONABLE by the agent (not observations, but instructions)
- If you see no meaningful cross-session pattern, return empty arrays — do not force output

## Example — good procedural rule
Episodes: session 1 filtered for licensed providers, session 2 asked if provider was licensed, session 3 rejected unlicensed suggestion
→ rule_text: "User consistently requires licensed providers"
→ prompt_fragment: "Ao buscar prestadores, aplicar filtro de prestadores licenciados automaticamente"

## Example — bad procedural rule (DO NOT do this)
"User likes good service" — not actionable
"User sometimes asks questions" — not a pattern
"Apply all filters" — too vague`;

// ── Agent ─────────────────────────────────────────────────────────────────────

export class ReflectionAgent {
  async analyze(episodes: EpisodeSummary[], userId: string): Promise<ReflectionOutput> {
    if (episodes.length === 0) {
      return { semanticFacts: [], proceduralRules: [] };
    }

    const episodeText = episodes
      .map((ep, i) => {
        const date = ep.occurredAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        return `[${i + 1}] ID: ${ep.id}\nData: ${date} | Importância: ${ep.importance.toFixed(2)}\nResumo: ${ep.summary}`;
      })
      .join('\n\n');

    const userMessage = `Analyze the following ${episodes.length} session summaries for a single user. Identify cross-session patterns.\n\n${episodeText}`;

    let raw: string;
    try {
      const response = await anthropicService.callClaude({
        model: ClaudeModel.SONNET,
        systemPrompt: SYSTEM_PROMPT,
        userMessage,
        maxTokens: 2500,
        temperature: 0,
      });
      raw = response.text;
    } catch (err) {
      logger.error(`[ReflectionAgent] LLM call failed for user ${userId}`, err);
      return { semanticFacts: [], proceduralRules: [] };
    }

    return this.parse(raw, episodes, userId);
  }

  private parse(raw: string, episodes: EpisodeSummary[], userId: string): ReflectionOutput {
    let cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleaned = jsonMatch[0];

    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      logger.warn(`[ReflectionAgent] JSON parse failed for user ${userId}. Raw: ${raw.slice(0, 200)}`);
      return { semanticFacts: [], proceduralRules: [] };
    }

    const validEpisodeIds = new Set(episodes.map(e => e.id));

    const semanticFacts: ReflectedFact[] = Array.isArray(obj.semantic_facts)
      ? (obj.semantic_facts as unknown[]).filter(isRawFact).map(f => ({
          content: f.content,
          confidence: clamp(f.confidence),
          importance: clamp(f.importance),
          sourceEpisodeIds: filterValidIds(f.source_episode_ids, validEpisodeIds),
        }))
      : [];

    const proceduralRules: ReflectedRule[] = Array.isArray(obj.procedural_rules)
      ? (obj.procedural_rules as unknown[]).filter(isRawRule).map(r => ({
          ruleText: r.rule_text,
          promptFragment: r.prompt_fragment,
          confidence: clamp(r.confidence),
          sourceEpisodeIds: filterValidIds(r.source_episode_ids, validEpisodeIds),
        }))
      : [];

    logger.info(
      `[ReflectionAgent] user=${userId} episodes=${episodes.length} ` +
      `facts=${semanticFacts.length} rules=${proceduralRules.length}`,
    );

    return { semanticFacts, proceduralRules };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(n: unknown): number {
  return typeof n === 'number' ? Math.min(1, Math.max(0, n)) : 0;
}

function filterValidIds(ids: unknown, validSet: Set<string>): string[] {
  if (!Array.isArray(ids)) return [];
  return (ids as unknown[]).filter(id => typeof id === 'string' && validSet.has(id)) as string[];
}

interface RawFact {
  content: string;
  confidence: number;
  importance: number;
  source_episode_ids: unknown[];
}

interface RawRule {
  rule_text: string;
  prompt_fragment: string;
  confidence: number;
  source_episode_ids: unknown[];
}

function isRawFact(x: unknown): x is RawFact {
  return (
    typeof x === 'object' && x !== null &&
    typeof (x as RawFact).content === 'string' && (x as RawFact).content.trim().length > 0 &&
    typeof (x as RawFact).confidence === 'number' &&
    typeof (x as RawFact).importance === 'number'
  );
}

function isRawRule(x: unknown): x is RawRule {
  return (
    typeof x === 'object' && x !== null &&
    typeof (x as RawRule).rule_text === 'string' && (x as RawRule).rule_text.trim().length > 0 &&
    typeof (x as RawRule).prompt_fragment === 'string' && (x as RawRule).prompt_fragment.trim().length > 0 &&
    typeof (x as RawRule).confidence === 'number'
  );
}

export const reflectionAgent = new ReflectionAgent();
