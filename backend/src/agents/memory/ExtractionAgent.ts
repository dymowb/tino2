import { anthropicService, ClaudeModel } from '@/agents/services/anthropic.service';
import { deduper, SemanticCandidate, DedupResult } from '@/services/memory/Deduper';
import { scrubPii } from '@/services/memory/PiiScrubber';
import { episodicWriter } from './EpisodicWriter';
import { isMemoryEnabled } from '@/config/memoryDatabase';
import { AppDataSource } from '@/config/database';
import logger from '@/config/logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConversationTurn {
  role: 'user' | 'agent';
  content: string;
  timestamp?: Date;
}

interface ExtractedFact {
  content: string;
  confidence: number; // 0–1: how certain the model is this is a stable, genuine fact
  importance: number; // 0–1: how useful this is for future sessions
}

interface ExtractionLLMOutput {
  semantic_facts: ExtractedFact[];
  episodic_summary: string;
  episodic_importance: number;
}

export interface ExtractionResult {
  written: Array<{ content: string; action: DedupResult['action']; memoryId?: string }>;
  episodicSummary: string;
  episodicImportance: number;
  piiDetected: boolean;
}

// ── System prompt ─────────────────────────────────────────────────────────────
// Design note: strict JSON-only output with a "no-hallucination" rule is
// critical here. Haiku is fast and cheap but will invent facts if not
// constrained. The prompt uses few-shot examples (correct + incorrect pattern)
// and an explicit confidence rubric to calibrate outputs.

const SYSTEM_PROMPT = `You are a memory extraction agent for a domestic-service platform (Tino). Your job is to read a conversation between a user and an AI assistant, then extract durable facts worth remembering for future sessions.

Output ONLY valid JSON matching this schema exactly:
{
  "semantic_facts": [
    { "content": string, "confidence": number, "importance": number }
  ],
  "episodic_summary": string,
  "episodic_importance": number
}

## Confidence rubric
- 0.9–1.0: User stated this directly and explicitly ("I live in Lagoa", "my budget is R$300")
- 0.7–0.89: Strongly implied by behavior or repeated choices ("user always filters by licensed")
- 0.5–0.69: Reasonably inferred but uncertain ("user might prefer morning appointments")
- Below 0.5: Do not include — too speculative

## Importance rubric
- 0.8–1.0: Critical for search/matching (location, budget, pet restrictions, allergies)
- 0.5–0.79: Useful context (preferred schedule, past providers, communication style)
- 0.3–0.49: Nice-to-have (minor preferences, passing comments)
- Below 0.3: Do not include — not worth the token budget

## Rules
- Extract ATOMIC facts only — one fact per entry, as short as possible
- Facts must be about the USER, not the assistant or providers
- Do NOT extract facts that are only true for this one session (e.g., "wants cleaning this Saturday")
- Do NOT invent or assume facts not present in the conversation
- Do NOT include PII like phone numbers, CPF, exact street addresses, or credit card numbers — the system will scrub these, but do not store them in the first place
- episodic_summary: 1–3 sentences, past-tense, factual. What happened in this session? Did a booking result?
- episodic_importance: 0–1, higher if booking was made or strong signal emerged

## Example — good output
Conversation: "User: Preciso de uma faxineira para o meu apartamento em Lagoa. Tenho dois gatos. Meu orçamento é até R$280."
{
  "semantic_facts": [
    { "content": "User lives in Lagoa da Conceição, Florianópolis", "confidence": 0.9, "importance": 0.9 },
    { "content": "User has two cats; needs pet-friendly providers", "confidence": 0.95, "importance": 0.85 },
    { "content": "User's cleaning budget is up to R$280", "confidence": 0.95, "importance": 0.8 }
  ],
  "episodic_summary": "User searched for a cleaner for their apartment in Lagoa. Mentioned two cats and a R$280 budget. No booking was confirmed in this session.",
  "episodic_importance": 0.4
}

## Example — bad output (DO NOT do this)
- "User might want cleaning on weekends" — too speculative, no evidence
- "User lives at Rua das Flores 123" — exact address, PII
- "Assistant recommended Maria Santos" — fact about assistant, not user
- "User wants cleaning this Saturday" — session-specific, not durable`;

// ── Agent ─────────────────────────────────────────────────────────────────────

export class ExtractionAgent {
  // Maximum turns to include in the extraction window.
  // Longer windows = more context but higher Haiku cost.
  private readonly maxTurns = 20;

  async extractAndWrite(
    turns: ConversationTurn[],
    userId: string,
    workflowId: string,
  ): Promise<ExtractionResult> {
    if (!isMemoryEnabled()) {
      return { written: [], episodicSummary: '', episodicImportance: 0, piiDetected: false };
    }

    // Respect user opt-out — check before any extraction work
    try {
      const rows = await AppDataSource.query(`SELECT settings FROM users WHERE id = $1`, [userId]);
      if (rows[0]?.settings?.memoryOptOut === true) {
        logger.info(`[ExtractionAgent] user=${userId} opted out — skipping extraction`);
        return { written: [], episodicSummary: '', episodicImportance: 0, piiDetected: false };
      }
    } catch (err) {
      // DB failure must not block the write path — proceed with extraction
      logger.warn('[ExtractionAgent] opt-out check failed, proceeding with extraction', err);
    }

    const window = turns.slice(-this.maxTurns);
    if (window.length === 0) {
      return { written: [], episodicSummary: '', episodicImportance: 0, piiDetected: false };
    }

    const conversationText = window
      .map(t => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`)
      .join('\n');

    // ── Step 1: LLM extraction ─────────────────────────────────────────────
    let llmOutput: ExtractionLLMOutput;
    try {
      llmOutput = await this.callLlm(conversationText, workflowId);
    } catch (err) {
      logger.error(`[ExtractionAgent] LLM extraction failed for user ${userId}`, err);
      return { written: [], episodicSummary: '', episodicImportance: 0, piiDetected: false };
    }

    // ── Step 2: PII scrub + dedup each fact ────────────────────────────────
    // Write path is: scrub → dedup (which handles embedding + DB write)
    // Fire-and-forget is intentional: memory writes must not block the user response.
    // Any error in the loop is swallowed (logged) so a bad fact doesn't fail the whole batch.
    let piiDetected = false;
    const written: ExtractionResult['written'] = [];

    for (const fact of llmOutput.semantic_facts) {
      try {
        const scrubbed = scrubPii(fact.content);
        if (scrubbed.detected) {
          piiDetected = true;
          logger.warn(`[ExtractionAgent] PII scrubbed from fact (types: ${scrubbed.types.join(', ')})`);
        }

        const candidate: SemanticCandidate = {
          content: scrubbed.text,
          confidence: Math.min(1, Math.max(0, fact.confidence)),
          importance: Math.min(1, Math.max(0, fact.importance)),
        };

        const result = await deduper.process(candidate, userId, fact.content);
        written.push({ content: candidate.content, action: result.action, memoryId: result.memoryId });
      } catch (err) {
        logger.error(`[ExtractionAgent] Failed to process fact: "${fact.content.slice(0, 60)}"`, err);
      }
    }

    logger.info(
      `[ExtractionAgent] user=${userId} workflow=${workflowId} ` +
      `facts=${llmOutput.semantic_facts.length} ` +
      `created=${written.filter(w => w.action === 'created').length} ` +
      `merged=${written.filter(w => w.action === 'merged').length} ` +
      `discarded=${written.filter(w => w.action === 'discarded').length}`,
    );

    // Write episodic memory — summary of this session with temporal context
    if (llmOutput.episodic_summary) {
      await episodicWriter.write({
        userId,
        workflowId,
        summary: llmOutput.episodic_summary,
        importance: llmOutput.episodic_importance,
        occurredAt: new Date(),
      });
    }

    return {
      written,
      episodicSummary: llmOutput.episodic_summary,
      episodicImportance: llmOutput.episodic_importance,
      piiDetected,
    };
  }

  private async callLlm(conversationText: string, workflowId: string): Promise<ExtractionLLMOutput> {
    const response = await anthropicService.callClaude({
      model: ClaudeModel.HAIKU,
      systemPrompt: SYSTEM_PROMPT,
      userMessage: `Conversation to extract from:\n\n${conversationText}`,
      maxTokens: 800,
      temperature: 0,
    });

    const parsed = this.parseResponse(response.text, workflowId);
    return parsed;
  }

  private parseResponse(text: string, workflowId: string): ExtractionLLMOutput {
    // Strip markdown code fences if present
    let cleaned = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();

    // Haiku occasionally prefixes with prose before the JSON object — extract the last {...} block
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleaned = jsonMatch[0];

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      logger.warn(`[ExtractionAgent] JSON parse failed for workflow=${workflowId}. Raw: ${text.slice(0, 200)}`);
      return { semantic_facts: [], episodic_summary: '', episodic_importance: 0 };
    }

    if (!parsed || typeof parsed !== 'object') {
      return { semantic_facts: [], episodic_summary: '', episodic_importance: 0 };
    }

    const obj = parsed as Record<string, unknown>;
    const facts = Array.isArray(obj.semantic_facts)
      ? (obj.semantic_facts as unknown[]).filter(isExtractedFact)
      : [];

    return {
      semantic_facts: facts,
      episodic_summary: typeof obj.episodic_summary === 'string' ? obj.episodic_summary : '',
      episodic_importance:
        typeof obj.episodic_importance === 'number'
          ? Math.min(1, Math.max(0, obj.episodic_importance))
          : 0.3,
    };
  }
}

function isExtractedFact(x: unknown): x is ExtractedFact {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as ExtractedFact).content === 'string' &&
    (x as ExtractedFact).content.trim().length > 0 &&
    typeof (x as ExtractedFact).confidence === 'number' &&
    typeof (x as ExtractedFact).importance === 'number'
  );
}

export const extractionAgent = new ExtractionAgent();
