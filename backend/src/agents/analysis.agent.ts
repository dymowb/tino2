/**
 * Analysis Agent
 *
 * Performs deep evaluation of search results by:
 * 1. Fetching review data and booking history for each provider
 * 2. Sending the enriched data to Claude for analysis
 * 3. Generating strengths, concerns, sentiment, and risk factors
 *
 * Pipeline position: Search Agent → [Analysis Agent] → (future) Recommendation Agent
 *
 * Pattern: Tool Use (database queries) + LLM Analysis
 * Model: Sonnet (balanced cost/quality for analytical work)
 */

import {
  Agent,
  AgentMetadata,
  AgentResult,
  ReflectionResult,
} from './types/agent.types';
import { WorkflowContext, ProviderAnalysis } from './types/workflow.types';
import { ProviderSearchResult } from './search.agent';
import { RequirementsAgentOutput } from './requirements.agent';
import reviewService from '../services/ReviewService';
import bookingService from '../services/BookingService';
import { anthropicService, ClaudeModel } from './services/anthropic.service';
import logger from '../config/logger';

// ─── Type Definitions ───────────────────────────────────────────────

/**
 * Input from coordinator (matches prepareAgentInput in coordinator.ts:368-373)
 */
export interface AnalysisAgentInput {
  /** Providers found by Search Agent (top 5, sorted by matchScore) */
  providers: ProviderSearchResult[];

  /** Full requirements output for context */
  requirements: RequirementsAgentOutput;
}

/**
 * Output stored in workflow context as analysisResults
 */
export interface AnalysisAgentOutput {
  /** Deep analysis for each provider */
  analyses: ProviderAnalysis[];

  /** How many providers were analyzed (may be fewer than input if we limit) */
  providersAnalyzed: number;

  /** Total execution time */
  executionTimeMs: number;
}

/**
 * Enriched provider data — search result + DB data combined
 * This is what we feed to Claude for analysis
 */
interface EnrichedProviderData {
  /** Original search result */
  provider: ProviderSearchResult;

  /** Review analytics from ReviewService */
  reviewAnalytics: {
    totalReviews: number;
    averageRating: number;
    ratingDistribution: Record<number, number>;
    criteriaAverages: Record<string, number>;
    responseRate: number;
    recentTrend: string;
  } | null;

  /** Recent review comments (last 5) */
  recentReviews: Array<{
    rating: number;
    comment: string;
    createdAt: string;
  }>;

  /** Booking history summary */
  bookingHistory: {
    totalBookings: number;
    completedBookings: number;
    cancelledBookings: number;
    completionRate: number;
  } | null;
}

// Maximum providers to deeply analyze — 3 matches our recommendation cap and keeps prompts small
const MAX_PROVIDERS_TO_ANALYZE = 3;

// ─── Agent Implementation ───────────────────────────────────────────

class AnalysisAgent implements Agent<AnalysisAgentInput, AnalysisAgentOutput> {
  readonly metadata: AgentMetadata = {
    name: 'analysis',
    description: 'Deeply evaluates providers using reviews, booking history, and LLM analysis',
    model: 'claude-haiku-4-5-20251001',
    tools: [],
    maxTokens: 2000,
    temperature: 0.3, // Low temperature for consistent structured output
    systemPrompt: `You are a Provider Analysis Agent. Your job is to evaluate service providers
based on their profile data, customer reviews, and booking history.

For each provider, generate:
1. strengths (3-5): Specific, data-backed strengths. Reference actual review themes or stats.
2. concerns (1-3): Honest concerns or trade-offs. Don't invent issues - only flag real ones.
3. reviewSentiment: One sentence summarizing the overall review themes.
4. uniqueValue (optional): What makes this provider stand out from others.
5. riskFactors (optional): Red flags like very few reviews, declining trend, low completion rate.

Be specific and honest. Reference actual data (e.g., "98% completion rate" not just "reliable").
If data is limited, say so rather than making things up.

Return a JSON array of analysis objects.`,
  };

  // ─── Data Fetching Methods (boilerplate) ────────────────────────

  /**
   * Fetch review analytics and recent reviews for a provider
   */
  private async fetchReviewData(providerId: string): Promise<{
    analytics: EnrichedProviderData['reviewAnalytics'];
    recentReviews: EnrichedProviderData['recentReviews'];
  }> {
    try {
      // Get analytics (avg rating, distribution, criteria, trend)
      const analytics = await reviewService.getReviewAnalytics(providerId);

      // Get recent reviews for sentiment analysis
      const reviewsResponse = await reviewService.getProviderReviews(providerId, {
        limit: 3,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      const recentReviews = (reviewsResponse.data || []).map((r: any) => ({
        rating: r.rating,
        comment: r.comment || '',
        createdAt: r.createdAt,
      }));

      return {
        analytics: analytics ? {
          totalReviews: analytics.totalReviews || 0,
          averageRating: analytics.averageRating || 0,
          ratingDistribution: analytics.ratingDistribution || {},
          criteriaAverages: analytics.criteriaAverages || {},
          responseRate: analytics.responseRate || 0,
          recentTrend: analytics.recentTrend || 'stable',
        } : null,
        recentReviews,
      };
    } catch (error) {
      logger.warn('Failed to fetch review data for provider', { providerId, error });
      return { analytics: null, recentReviews: [] };
    }
  }

  /**
   * Fetch booking history summary for a provider
   */
  private async fetchBookingHistory(providerId: string): Promise<EnrichedProviderData['bookingHistory']> {
    try {
      const completedResult = await bookingService.searchBookings({
        providerId,
        status: 'completed',
        limit: 1, // We just need the count
      });

      const cancelledResult = await bookingService.searchBookings({
        providerId,
        status: 'cancelled',
        limit: 1,
      });

      const totalResult = await bookingService.searchBookings({
        providerId,
        limit: 1,
      });

      const total = totalResult.total || 0;
      const completed = completedResult.total || 0;
      const cancelled = cancelledResult.total || 0;

      return {
        totalBookings: total,
        completedBookings: completed,
        cancelledBookings: cancelled,
        completionRate: total > 0 ? completed / total : 0,
      };
    } catch (error) {
      logger.warn('Failed to fetch booking history for provider', { providerId, error });
      return null;
    }
  }

  /**
   * Enrich all providers with DB data (runs in parallel)
   */
  private async enrichProviders(providers: ProviderSearchResult[]): Promise<EnrichedProviderData[]> {
    const enrichmentPromises = providers.map(async (provider) => {
      const [reviewData, bookingHistory] = await Promise.all([
        this.fetchReviewData(provider.providerId),
        this.fetchBookingHistory(provider.providerId),
      ]);

      return {
        provider,
        reviewAnalytics: reviewData.analytics,
        recentReviews: reviewData.recentReviews,
        bookingHistory,
      };
    });

    return Promise.all(enrichmentPromises);
  }

  // ─── TODO: execute() — YOUR CODE GOES HERE ─────────────────────
  //
  // This method should:
  //
  // 1. Limit providers to MAX_PROVIDERS_TO_ANALYZE (take the top N by matchScore)
  //    const topProviders = input.providers.slice(0, MAX_PROVIDERS_TO_ANALYZE);
  //
  // 2. Enrich them with DB data
  //    const enrichedProviders = await this.enrichProviders(topProviders);
  //
  // 3. Build a userMessage string for Claude containing:
  //    - The user's requirements (from input.requirements.requirementsSummary)
  //    - For each enriched provider: profile data, review analytics, recent reviews, booking history
  //    Format it clearly so Claude can analyze each provider
  //
  // 4. Call Claude via anthropicService.callClaude() with:
  //    - model: ClaudeModel.SONNET
  //    - systemPrompt: this.metadata.systemPrompt
  //    - userMessage: the string you built
  //    - maxTokens: this.metadata.maxTokens
  //    - temperature: this.metadata.temperature
  //
  // 5. Parse the JSON array from Claude's response
  //    (use the same regex pattern as inferServices: response.text.match(/\[[\s\S]*\]/))
  //
  // 6. Return an AgentResult<AnalysisAgentOutput> with:
  //    - success: true
  //    - output: { analyses, providersAnalyzed, executionTimeMs }
  //    - metadata: { executionTimeMs, tokensUsed, modelUsed, confidence }
  //
  // Hints:
  //   - JSON.stringify(data, null, 2) makes readable output for Claude
  //   - Log at the start and end (logger.info)
  //   - Measure time with Date.now()
  //   - Wrap the Claude call in try/catch
  //

  async execute(
    
    input: AnalysisAgentInput,
    _context: WorkflowContext
  ): Promise<AgentResult<AnalysisAgentOutput>> {
    const startTime = Date.now();

    logger.info('Analysis Agent executing', { workflowId: _context.workflowId });
    const topProviders = input.providers.slice(0, MAX_PROVIDERS_TO_ANALYZE);
    const enrichedProviders = await this.enrichProviders(topProviders);
    const userMessage = `Customer Requirements:\n${JSON.stringify(input.requirements.requirementsSummary, null, 2)}\n\n` +
      `Providers to Analyze:\n${enrichedProviders.map((ep, index) => (
          `Provider: ${index +1})\n` +
          `Profile: ${JSON.stringify(ep.provider, null, 2)}\n` +
          `Review Analytics: ${JSON.stringify(ep.reviewAnalytics, null, 2)}\n` +
          `Recent Reviews: ${JSON.stringify(ep.recentReviews, null, 2)}\n` +
          `Booking History: ${JSON.stringify(ep.bookingHistory, null, 2)}\n`
      )).join('\n\n')}`

    const response = await anthropicService.callClaude({
      model: ClaudeModel.HAIKU,
      systemPrompt: this.metadata.systemPrompt,
      userMessage,
      maxTokens: this.metadata.maxTokens,
      temperature: this.metadata.temperature,
    });

    const analyses = response.text.match(/\[[\s\S]*\]/);
    if (!analyses) {
      logger.warn('Failed to extract analysis JSON from Claude response', { response });
      throw new Error('Failed to extract analysis JSON from Claude response');
    }

    const parsedAnalyses = JSON.parse(analyses[0]);
    const executionTimeMs = Date.now() - startTime;

    return {
      success: true,
      output: {
        analyses: parsedAnalyses,
        providersAnalyzed: enrichedProviders.length,
        executionTimeMs,
      },
      metadata: {
        executionTimeMs,
        tokensUsed: response.usage.inputTokens + response.usage.outputTokens,
        modelUsed: ClaudeModel.SONNET,
        confidence: 0.95, // Assume high confidence for now
      },
    };
  }

  // ─── TODO: reflect() — YOUR CODE GOES HERE ─────────────────────
  //
  // Quality checks for the analysis output:
  //
  // 1. Check all providers were analyzed
  //    (output.analyses.length should match the number of input providers, up to MAX)
  //
  // 2. Check each analysis has at least 2 strengths
  //
  // 3. Check each analysis has a non-empty reviewSentiment
  //
  // 4. Check matchScores are reasonable (between 0 and 1)
  //
  // Return a ReflectionResult:
  //   - needsImprovement: true if any check fails
  //   - improvements: list of what's wrong
  //   - confidence: 0.9 if all good, lower if issues found
  //

  async reflect(
    output: AnalysisAgentOutput,
    input: AnalysisAgentInput
  ): Promise<ReflectionResult> {
    const improvements: string[] = [];

    // Check 1: Did we get analyses for all providers?
    const expectedCount = Math.min(input.providers.length, MAX_PROVIDERS_TO_ANALYZE);
    if (output.analyses.length !== expectedCount) {
      improvements.push(`Expected ${expectedCount} analyses, got ${output.analyses.length}`);
    }

    // Check 2: Are all analyses valid?
    for (let i = 0; i < output.analyses.length; i++) {
      const analysis = output.analyses[i];
      if (!analysis.strengths || analysis.strengths.length < 2) {
        improvements.push(`Analysis ${i + 1} has fewer than 2 strengths`);
      }
      if (!analysis.reviewSentiment || analysis.reviewSentiment.trim() === '') {
        improvements.push(`Analysis ${i + 1} has empty review sentiment`);
      }
      if (analysis.matchScore < 0 || analysis.matchScore > 1) {
        improvements.push(`Analysis ${i + 1} has invalid matchScore: ${analysis.matchScore}`);
      }
    }

    return {
      needsImprovement: improvements.length > 0,
      improvements,
      confidence: improvements.length > 0 ? 0.5 : 0.9,
    };
  }
}

// Export singleton
export const analysisAgent = new AnalysisAgent();
