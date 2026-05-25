/**
 * Recommendation Agent
 *
 * Synthesizes search results and analysis data into ranked recommendations
 * by making a holistic, comparative judgment across all providers.
 *
 * Pipeline position: Analysis Agent → [Recommendation Agent] → (future) Verification Agent
 *
 * Key design: Claude only generates new knowledge (rank, reasoning, tradeoffs, bestFor).
 * We assemble the full Recommendation object in code by joining with existing data.
 * This prevents hallucination and avoids wasting tokens re-generating what we already have.
 *
 * Pattern: Pure LLM Synthesis (no DB calls needed — Analysis Agent already enriched data)
 * Model: Sonnet (nuanced cross-provider comparison and narrative reasoning)
 */

import {
  Agent,
  AgentMetadata,
  AgentResult,
  ReflectionResult,
} from './types/agent.types';
import {
  WorkflowContext,
  ProviderAnalysis,
  ProviderSearchResult,
  Recommendation,
} from './types/workflow.types';
import { RequirementsAgentOutput } from './requirements.agent';
import { anthropicService, ClaudeModel } from './services/anthropic.service';
import logger from '../config/logger';

// ─── Type Definitions ───────────────────────────────────────────────

/**
 * Input from coordinator (matches prepareAgentInput in coordinator.ts)
 */
export interface RecommendationAgentInput {
  /** Providers from Search Agent (with matchScore, pricing, availability) */
  providers: ProviderSearchResult[];

  /** Per-provider analysis from Analysis Agent (strengths, concerns, sentiment) */
  analysisResults: ProviderAnalysis[];

  /** Full requirements — used to explain WHY a provider fits the user's needs */
  requirements: RequirementsAgentOutput;

  /** Formatted <constraints> block from active procedural rules */
  constraintContext?: string;
}

/**
 * Output stored in workflow context as recommendations
 * (WorkflowContext already typed as Recommendation[])
 */
export interface RecommendationAgentOutput {
  /** Ranked recommendations, best first */
  recommendations: Recommendation[];

  /** How many providers were considered */
  providersConsidered: number;

  /** Total execution time */
  executionTimeMs: number;
}

/**
 * What Claude returns for each ranked provider.
 * Intentionally minimal — we assemble the full Recommendation in code.
 */
interface ClaudeRankedProvider {
  providerId: string;
  rank: number;
  reasoning: string;
  tradeoffs: string[];
  bestFor: string;
}

// Maximum recommendations to return
const MAX_RECOMMENDATIONS = 3;

// ─── Agent Implementation ───────────────────────────────────────────

class RecommendationAgent implements Agent<RecommendationAgentInput, RecommendationAgentOutput> {
  readonly metadata: AgentMetadata = {
    name: 'recommendation',
    description: 'Synthesizes analysis data into ranked provider recommendations with reasoning',
    model: 'claude-sonnet-4-6',
    tools: [],
    maxTokens: 2000,
    temperature: 0.4, // Fairly deterministic — we want consistent ranking logic
    systemPrompt: `You are a Provider Recommendation Agent. Your job is to rank service providers
and explain your reasoning in a way that helps the customer make a confident decision.
Respond ONLY in Brazilian Portuguese (pt-BR). All reasoning, descriptions, and bestFor text must be in Portuguese.

You will receive:
- The customer's requirements (what they need, where, when, budget)
- A list of providers with their match scores, pricing, and availability
- Analysis for each provider (strengths, concerns, review sentiment)

Your task:
1. Rank the top ${MAX_RECOMMENDATIONS} providers from best to worst fit for THIS customer
2. For each, write a concise reasoning (2-3 sentences) explaining WHY you ranked them there
3. Note real tradeoffs (e.g., "best reviews but slightly above budget")
4. Describe who this provider is "bestFor" (e.g., "customers who prioritize reliability over price")

Return ONLY a JSON array. No markdown, no explanation text outside JSON.

Format:
[
  {
    "providerId": "uuid",
    "rank": 1,
    "reasoning": "Maria is the strongest match because...",
    "tradeoffs": ["Slightly above budget", "Only available afternoons"],
    "bestFor": "Customers who want a reliable, thorough clean"
  },
  ...
]

Rules:
- Rank must be 1, 2, or 3 (no ties, no skipping)
- reasoning must be 1-3 sentences
- tradeoffs can be empty array [] if no real tradeoffs
- bestFor must be a short phrase, not a sentence
- Only use providerIds from the input data`,
  };

  // ─── Main Entry Point ──────────────────────────────────────────────

  async execute(
    input: RecommendationAgentInput,
    _context: WorkflowContext,
  ): Promise<AgentResult<RecommendationAgentOutput>> {
    const startTime = Date.now();
    logger.info('Recommendation Agent executing', {
      providers: input.providers.length,
      analyses: input.analysisResults.length,
    });

    // TODO 5.2a: Log that we're starting
    // logger.info(...)
    logger.info('Starting recommendation synthesis', {
      providersConsidered: input.providers.length,
      analysisResults: input.analysisResults.length,
    });
    // TODO 5.2b: Build the userMessage string for Claude.
    // Structure it in 3 sections:
    //   Section 1: "Customer Requirements:\n" + JSON.stringify(requirements.requirementsSummary)
    //   Section 2: "Providers to Consider:\n" + for each provider, show their search result
    //   Section 3: "Provider Analyses:\n" + for each analysis, show strengths/concerns/sentiment
    //
    // Tip: you can use providers.slice(0, MAX_RECOMMENDATIONS + 2) to give Claude a few extras
    // to choose from (it picks the best MAX_RECOMMENDATIONS).
    const topProviders = input.providers.slice(0, MAX_RECOMMENDATIONS + 2);
    
    const userMessage = `Customer Requirements:\n${JSON.stringify(input.requirements.requirementsSummary, null, 2)}\n\nProviders to Consider:\n${topProviders.map(p => JSON.stringify(p, null, 2)).join('\n')}\n\nProvider Analyses:\n${input.analysisResults.map(a => JSON.stringify(a, null, 2)).join('\n')}`;

    // TODO 5.2c: Call Claude (same pattern as analysis agent).
    // Use this.metadata.model, this.metadata.systemPrompt, etc.
    const systemPrompt = input.constraintContext
      ? `${input.constraintContext}\n\n${this.metadata.systemPrompt}`
      : this.metadata.systemPrompt;

    const response = await anthropicService.callClaude({
      model: ClaudeModel.SONNET,
      systemPrompt,
      userMessage,
      maxTokens: this.metadata.maxTokens,
      temperature: this.metadata.temperature,
    });

    // TODO 5.2d: Extract the JSON array from Claude's response.
    // Same regex pattern as analysis agent: response.text.match(/\[[\s\S]*\]/)
    // Throw if no match.
    const jsonMatch = response.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Failed to extract recommendation JSON from Claude response');
    }
    const claudeRankings: ClaudeRankedProvider[] = JSON.parse(jsonMatch[0]);

    // TODO 5.2e: Assemble full Recommendation objects.
    // For each item in claudeRankings (sorted by rank):
    //   1. Find the matching ProviderSearchResult from input.providers
    //   2. Find the matching ProviderAnalysis from input.analysisResults
    //   3. Build a Recommendation object: { rank, provider, analysis, reasoning, tradeoffs, bestFor }
    //   4. Skip any where provider or analysis can't be found (defensive coding)
    //
    // Tip: use .find(p => p.providerId === item.providerId) for both lookups
    const recommendations: Recommendation[] = [];
    for (const item of claudeRankings.sort((a, b) => a.rank - b.rank)) {
      const provider = input.providers.find(p => p.providerId === item.providerId);
      const analysis = input.analysisResults.find(a => a.providerId === item.providerId);
      if (!provider || !analysis) {
        logger.warn('Skipping recommendation due to missing data', { providerId: item.providerId });
        continue;
      }
      recommendations.push({
        rank: item.rank,
        provider: provider,
        analysis,
        reasoning: item.reasoning,
        tradeoffs: item.tradeoffs,
        bestFor: item.bestFor,
      });
    }

    const executionTimeMs = Date.now() - startTime;

    // TODO 5.2f: Return the AgentResult.
    // output: { recommendations, providersConsidered: input.providers.length, executionTimeMs }
    // metadata: executionTimeMs, tokensUsed, modelUsed, confidence: 0.9
    return {
      success: true,
      output: {
        recommendations,
        providersConsidered: input.providers.length,
        executionTimeMs,
      },
      metadata: {
        executionTimeMs,
        tokensUsed: response.usage.inputTokens + response.usage.outputTokens,
        modelUsed: ClaudeModel.SONNET,
        confidence: 0.9,
      },
    };
  }

  // ─── Reflection ───────────────────────────────────────────────────

  async reflect(
    output: RecommendationAgentOutput,
    _input: RecommendationAgentInput,
  ): Promise<ReflectionResult> {
    const improvements: string[] = [];

    // TODO 5.3a: Check we got at least 1 recommendation
    // if (output.recommendations.length === 0) { improvements.push(...) }

    // TODO 5.3b: Check ranks are sequential starting from 1 (no gaps, no duplicates)
    // Hint: sort by rank, then check rank[0]===1, rank[1]===2, etc.
    // If not sequential, push an improvement message

    // TODO 5.3c: Check each recommendation has non-empty reasoning
    // Loop through output.recommendations, check reasoning.trim() !== ''

    // TODO 5.3d: Return ReflectionResult
    // needsImprovement: improvements.length > 0
    // improvements: improvements
    // confidence: improvements.length > 0 ? 0.5 : 0.9
    
    if (output.recommendations.length === 0) {
      improvements.push('No recommendations were generated. At least one recommendation is needed to be useful.');
    }

    const sortedByRank = [...output.recommendations].sort((a, b) => a.rank - b.rank);
    for (let i = 0; i < sortedByRank.length; i++) {
      if (sortedByRank[i].rank !== i + 1) {
        improvements.push(`Recommendation ranks are not sequential starting from 1. Found rank ${sortedByRank[i].rank} at position ${i}. Ranks should be 1, 2, 3...`);
        break;
      }
    }

    output.recommendations.forEach((rec, index) => {
      if (!rec.reasoning || rec.reasoning.trim() === '') {
        improvements.push(`Recommendation for providerId ${rec.provider.providerId} is missing reasoning. Reasoning is important to help customers understand the recommendation.`);
      }
    });
    return {
      needsImprovement: improvements.length > 0,
      improvements,
      confidence: improvements.length > 0 ? 0.5 : 0.9,
    };
  }
}

/**
 * Singleton export
 */
export const recommendationAgent = new RecommendationAgent();
