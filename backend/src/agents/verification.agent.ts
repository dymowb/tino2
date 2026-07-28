/**
 * Verification Agent
 *
 * Final quality-assurance pass on the complete workflow output.
 * Checks that recommendations actually address the user's requirements,
 * reasoning is coherent, and information is complete.
 *
 * Pipeline position: Recommendation Agent → [Verification Agent] → Done
 *
 * Key design decisions:
 * - Soft pass: if verification fails OR times out, recommendations go through anyway.
 *   The user has invested effort — blocking them is never acceptable.
 * - Timeout with Promise.race(): verification is enhancement, not load-bearing.
 *   If Claude is slow, we skip gracefully.
 * - Claude Haiku: fast and cheap — this is a QA check, not synthesis.
 */

import { Agent, AgentMetadata, AgentResult, ReflectionResult } from './types/agent.types';
import {
  WorkflowContext,
  VerificationReport,
  CheckResult,
  Recommendation,
} from './types/workflow.types';
import { RequirementsAgentOutput } from './requirements.agent';
import { anthropicService, ClaudeModel } from './services/anthropic.service';
import { parseLlmJson } from './utils/llm-json';
import logger from '../config/logger';

// ─── Types ───────────────────────────────────────────────────────────

export interface VerificationAgentInput {
  requirements: RequirementsAgentOutput;
  recommendations: Recommendation[];
  /** Formatted <constraints> block from active procedural rules */
  constraintContext?: string;
}

export interface VerificationAgentOutput {
  report: VerificationReport;
  timedOut: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────

/** Abort verification if Claude takes longer than this (ms).
 *  15s is generous for Haiku; if it hits this, something is wrong. */
const VERIFICATION_TIMEOUT_MS = 15_000;

// ─── Agent Implementation ─────────────────────────────────────────────

class VerificationAgent implements Agent<VerificationAgentInput, VerificationAgentOutput> {
  readonly metadata: AgentMetadata = {
    name: 'verification',
    description: 'Quality-assurance check that recommendations match requirements',
    model: 'claude-haiku-4-5-20251001',
    tools: [],
    maxTokens: 800,
    temperature: 0.1, // Near-deterministic — QA should be consistent
    systemPrompt: `You are a Quality Assurance Agent. Your job is to verify that a set of
provider recommendations properly addresses the customer's stated requirements.

You will receive:
- The customer's requirements (service type, location, budget, urgency)
- The final ranked recommendations (provider name, reasoning, tradeoffs)

Run exactly three checks:
1. requirementsCoverage: Do the recommendations address what the customer asked for?
2. recommendationQuality: Is the reasoning clear, logical, and non-contradictory?
3. completeness: Is all necessary information present (reasoning, tradeoffs if any)?

Return ONLY a JSON object. No markdown, no text outside JSON.

Format:
{
  "requirementsCoverage": { "passed": true, "notes": "one sentence" },
  "recommendationQuality": { "passed": true, "notes": "one sentence" },
  "completeness": { "passed": true, "notes": "one sentence" },
  "qualityScore": 8.5,
  "suggestions": ["optional improvement", "..."]
}

Rules:
- qualityScore must be 0-10
- notes must be one sentence
- suggestions can be empty array []
- Be strict but fair — minor omissions should lower the score, not fail a check`,
  };

  // ─── Main Entry Point ─────────────────────────────────────────────

  async execute(
    input: VerificationAgentInput,
    _context: WorkflowContext
  ): Promise<AgentResult<VerificationAgentOutput>> {
    const startTime = Date.now();
    logger.info('Verification Agent executing', {
      recommendations: input.recommendations.length,
    });

    // ── Build prompt ──────────────────────────────────────────────────
    const reqSummary = JSON.stringify(input.requirements.requirementsSummary, null, 2);
    const recsSummary = input.recommendations
      .map((r) =>
        JSON.stringify(
          {
            rank: r.rank,
            provider: r.provider.businessName,
            reasoning: r.reasoning,
            tradeoffs: r.tradeoffs ?? [],
            bestFor: r.bestFor ?? '',
            strengths: r.analysis.strengths,
            concerns: r.analysis.concerns,
          },
          null,
          2
        )
      )
      .join('\n\n');

    const userMessage = `Customer Requirements:\n${reqSummary}\n\nRecommendations:\n${recsSummary}`;

    // ── Race Claude against timeout ───────────────────────────────────
    const systemPrompt = input.constraintContext
      ? `${input.constraintContext}\n\n${this.metadata.systemPrompt}`
      : this.metadata.systemPrompt;

    const claudeCall = anthropicService.callClaude({
      model: ClaudeModel.HAIKU,
      systemPrompt,
      userMessage,
      maxTokens: this.metadata.maxTokens,
      temperature: this.metadata.temperature,
    });

    // null resolves when timeout fires
    const timeoutSignal = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), VERIFICATION_TIMEOUT_MS)
    );

    const response = await Promise.race([claudeCall, timeoutSignal]);

    // ── Timeout path — soft pass ──────────────────────────────────────
    if (response === null) {
      logger.warn('Verification Agent timed out — soft pass, returning unmodified recommendations');
      return this.timedOutResult(startTime);
    }

    // ── Parse Claude response ─────────────────────────────────────────
    const parsed = parseLlmJson<any>(response.text, 'object');
    if (!parsed) {
      logger.warn('Verification Agent: could not parse JSON — soft pass');
      return this.timedOutResult(startTime);
    }

    // Defensive: even valid JSON may omit a check object. Default any missing
    // check to a soft pass rather than throwing on `undefined.passed`.
    const softCheck = (c: any): CheckResult => ({
      passed: c?.passed ?? true,
      notes: c?.notes ?? '',
    });
    const requirementsCoverage = softCheck(parsed.requirementsCoverage);
    const recommendationQuality = softCheck(parsed.recommendationQuality);
    const completeness = softCheck(parsed.completeness);

    const report: VerificationReport = {
      passed: requirementsCoverage.passed && recommendationQuality.passed && completeness.passed,
      qualityScore: Math.min(10, Math.max(0, Number(parsed.qualityScore) || 0)),
      requirementsCoverage,
      recommendationQuality,
      completeness,
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    };

    logger.info('Verification Agent completed', {
      passed: report.passed,
      qualityScore: report.qualityScore,
    });

    return {
      success: true,
      output: { report, timedOut: false },
      metadata: {
        executionTimeMs: Date.now() - startTime,
        tokensUsed: response.usage.inputTokens + response.usage.outputTokens,
        modelUsed: ClaudeModel.HAIKU,
        confidence: report.passed ? 0.9 : 0.6,
      },
    };
  }

  // ─── Reflection ───────────────────────────────────────────────────

  async reflect(
    output: VerificationAgentOutput,
    _input: VerificationAgentInput
  ): Promise<ReflectionResult> {
    // If verification timed out there is nothing to improve
    if (output.timedOut) {
      return { needsImprovement: false, improvements: [], confidence: 0 };
    }

    const improvements: string[] = [];

    if (output.report.qualityScore < 0 || output.report.qualityScore > 10) {
      improvements.push(`qualityScore ${output.report.qualityScore} is out of 0-10 range`);
    }

    return {
      needsImprovement: improvements.length > 0,
      improvements,
      confidence: output.report.passed ? 0.9 : 0.6,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  /** Soft-pass result used when verification is skipped (timeout or parse failure) */
  private timedOutResult(startTime: number): AgentResult<VerificationAgentOutput> {
    const skipped: CheckResult = { passed: true, notes: 'Verification skipped (timeout)' };
    return {
      success: true,
      output: {
        timedOut: true,
        report: {
          passed: true,
          qualityScore: 0,
          requirementsCoverage: skipped,
          recommendationQuality: skipped,
          completeness: skipped,
          suggestions: [],
          timedOut: true,
        },
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
        tokensUsed: 0,
        modelUsed: ClaudeModel.HAIKU,
        confidence: 0,
      },
    };
  }
}

/**
 * Singleton export
 */
export const verificationAgent = new VerificationAgent();
