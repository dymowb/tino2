/**
 * Search Agent
 *
 * Finds and ranks service providers based on user requirements.
 *
 * Key Design Decisions:
 * 1. FILTER first (service match, location, active status) - binary exclusion
 * 2. SCORE remaining providers (quality, budget, availability) - ranking
 * 3. Dynamic weighting based on urgency (emergency prioritizes availability)
 * 4. Return top 3-5 results with match scores
 */

import { Agent, AgentMetadata, AgentResult, ReflectionResult } from './types/agent.types';
import { WorkflowContext } from './types/workflow.types';
import { RequirementsAgentOutput } from './requirements.agent';
import { anthropicService, ClaudeModel } from './services/anthropic.service';
import ProviderService from '@/services/ProviderService';
import { Provider } from '@/models/Provider';
import logger from '@/config/logger';

/**
 * Input for Search Agent
 *
 * The Search Agent receives the complete requirements from the Requirements Agent.
 */
export interface SearchAgentInput {
  /** Requirements gathered from user */
  requirements: RequirementsAgentOutput['requirementsSummary'];

  /** Workflow context for additional data */
  workflowId: string;
  userId: string;
}

/**
 * Single provider search result
 *
 * Contains only the fields needed for analysis and display.
 * Minimal data transfer - Analysis Agent can fetch more if needed.
 */
export interface ProviderSearchResult {
  providerId: string;
  businessName: string;
  pricing: {
    baseRate: number;
    currency: string;
    rateType: 'hourly' | 'fixed' | 'quote';
  };

  /** Provider rating (0-5 scale, validated at runtime) */
  rating: number;

  totalReviews: number;
  completedJobs: number;
  availableHours: {
    monday: { start: string; end: string; available: boolean };
    tuesday: { start: string; end: string; available: boolean };
    wednesday: { start: string; end: string; available: boolean };
    thursday: { start: string; end: string; available: boolean };
    friday: { start: string; end: string; available: boolean };
    saturday: { start: string; end: string; available: boolean };
    sunday: { start: string; end: string; available: boolean };
  };
  location: {
    city: string;
    state: string;
    distanceFromUser: number;
  };
  isBackgroundChecked: boolean;
  isInsured: boolean;

  /** Match score (0-1 scale, where 1 = perfect match) */
  matchScore: number;

  services: string[];
}

/**
 * Output from Search Agent
 *
 * Returns ranked list of providers matching requirements.
 */
export interface SearchAgentOutput {
  /** Top providers matching requirements (sorted by matchScore descending) */
  providers: ProviderSearchResult[];

  /** Total providers found before limiting to top 5 */
  totalFound: number;

  /** Search metadata for debugging */
  searchMetadata: {
    /** Filters applied (service type, location radius, etc.) */
    filtersApplied: string[];

    /** Scoring weights used (depends on urgency) */
    scoringWeights: {
      quality: number;
      budget: number;
      availability: number;
    };

    /** Number of providers eliminated by filters */
    filteredOutCount: number;
  };
}

/**
 * Search Agent
 *
 * Implements intelligent provider search with:
 * - Binary filtering (service, location, active status)
 * - Multi-factor scoring (quality, budget, availability)
 * - Dynamic weighting based on urgency
 * - Planning pattern (decides search strategy before executing)
 */
class SearchAgent implements Agent<SearchAgentInput, SearchAgentOutput> {
  readonly metadata: AgentMetadata = {
    name: 'search',
    description: 'Finds and ranks service providers based on requirements',
    model: 'claude-sonnet-4-6', // Use Sonnet for planning + ranking logic
    tools: [], // No MCP tools needed - direct database access
    maxTokens: 2000, // Enough for planning + reasoning
    temperature: 0.3, // Low temperature for consistent, deterministic search strategy
    systemPrompt: `You are a Search Planning Agent. Your job is to analyze user requirements
and determine the optimal search strategy for finding service providers.

Consider:
- Service type matching (exact vs. similar services)
- Geographic proximity (distance from user location)
- Budget constraints (filter by pricing)
- Availability requirements (timing flexibility)
- Urgency level (affects weighting of factors)

Plan your search strategy before executing queries.`,
  };

  /**
   * Infer which services from the catalog match the user's requirements.
   * Uses LLM to understand natural language → service name mapping.
   *
   * Examples:
   *   "blocked drain" → ["Drain Cleaning", "Plumbing Repair", "Emergency Plumbing"]
   *   "plumber" → ["Plumbing Repair", "Pipe Installation", "Leak Detection", ...]
   *   "need someone to paint my house exterior" → ["Exterior Painting", "Pressure Washing"]
   */
  private async inferServices(
    requirements: SearchAgentInput['requirements'],
    serviceCatalog: string[]
  ): Promise<string[]> {
    // YOUR CODE HERE:
    // 1. Write the systemPrompt - tell the LLM its role
    // 2. Write the userMessage - include requirements + catalog
    // 3. Ask for JSON array response format
    //
    // Hints:
    // - requirements has: serviceType, description, urgency
    // - serviceCatalog is a string[] of all available service names
    // - Think about domain knowledge: "plumber" should match "Drain Cleaning"
    // - Use JSON.stringify() to include the catalog in the message

    const systemPrompt = 'You are a service inference agent. Your job is to analyze user requirements and map them to matching service names from a catalog. The matching is based on semantic similarity and domain knowledge (e.g. A plumber handles drain cleaning, pipe repairs, leak detection. A painter does pressure washing, etc). Return only a JSON array of matching service names that exist exactly in the provided catalog.';
    const userMessage = `User requirements: Service type= ${JSON.stringify(requirements.serviceType)}; Service requirements= ${JSON.stringify(requirements.specialRequirements)}\nAvailable services: ${JSON.stringify(serviceCatalog)}`;

    const response = await anthropicService.callClaude({
      model: ClaudeModel.HAIKU,
      systemPrompt,
      userMessage,
      maxTokens: 500,
      temperature: 0.2,
    });

    // Parse response - extract JSON array of service names
    try {
      const jsonMatch = response.text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        logger.warn('No JSON array found in inferServices response, falling back to serviceType');
        return requirements.serviceType ? [requirements.serviceType] : [];
      }
      const services = JSON.parse(jsonMatch[0]) as string[];
      logger.info('Inferred services from requirements', { services });
      return services;
    } catch (error) {
      logger.warn('Failed to parse inferServices response, falling back', { error });
      return requirements.serviceType ? [requirements.serviceType] : [];
    }
  }

  /**
   * Execute search for providers
   */
  async execute(
    input: SearchAgentInput,
    context: WorkflowContext
  ): Promise<AgentResult<SearchAgentOutput>> {
    const startTime = Date.now();
    logger.info(`Search Agent executing`, { workflowId: context.workflowId });

    try {
      // Step 1: Infer matching services from catalog using LLM
      const serviceCatalog = await ProviderService.getServiceCatalog();
      const inferredServices = await this.inferServices(input.requirements, serviceCatalog);

      // Step 2: Build search query — use city/state from requirements for location filtering
      const { city, state } = input.requirements.location ?? {};
      const searchQuery = {
        services: inferredServices.length > 0 ? inferredServices : undefined,
        city: city ?? undefined,
        state: state ?? undefined,
        page: 1,
        limit: 20,
        sortBy: 'rating' as const,
      };

      // Step 2: Call ProviderService to get matching providers
      logger.info(`Searching providers with query`, { query: searchQuery });
      const searchResults = await ProviderService.searchProviders(searchQuery);

      // Step 3: Transform Provider entities into ProviderSearchResult objects
      const providerResults: ProviderSearchResult[] = searchResults.providers.map(
        (provider: Provider) => ({
          providerId: provider.id,
          businessName: provider.businessName,
          pricing: provider.pricing || {
              baseRate: 0,
              currency: 'USD',
              rateType: 'quote' as const,
          },
          rating: provider.rating,
          totalReviews: provider.totalReviews,
          completedJobs: provider.completedJobs,
          availableHours: provider.availableHours,
          location: {
            city: provider.location.city,
            state: provider.location.state,
            distanceFromUser: 0,
          },
          isBackgroundChecked: provider.isBackgroundChecked,
          isInsured: provider.isInsured,
          matchScore: 0,
          services: provider.services,
        })
      ); 

      // Step 4: Calculate match scores for each provider
      providerResults.forEach((provider) => {
        provider.matchScore = this.calculateMatchScore(provider, input);
      });

      // Step 5: Sort by match score and take top 5
      const topProviders = providerResults
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 5);

      // Step 6: Build output with metadata
      const output: SearchAgentOutput = {
        providers: topProviders,
        totalFound: searchResults.total,
        searchMetadata: {
          filtersApplied: this.getFiltersApplied(searchQuery),
          scoringWeights: this.getScoringWeights(input.requirements.urgency),
          filteredOutCount: 0, // Will calculate in Step 3.4
        },
      };

      const executionTimeMs = Date.now() - startTime;
      logger.info(`Search Agent completed`, {
        workflowId: context.workflowId,
        providersFound: output.providers.length,
        totalFound: output.totalFound,
        executionTimeMs,
      });

      return {
        success: true,
        output,
        metadata: {
          executionTimeMs,
          tokensUsed: 0, // No LLM call in this basic version
          modelUsed: this.metadata.model,
          confidence: 1.0, // High confidence since we're just querying database
        },
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      logger.error(`Search Agent failed`, {
        workflowId: context.workflowId,
        error: error instanceof Error ? error.message : String(error),
        executionTimeMs,
      });

      throw error;
    }
  }

  /**
   * Helper: Get list of filters applied
   */
  private getFiltersApplied(query: any): string[] {
    const filters: string[] = [];
    if (query.services) filters.push(`Service: ${query.services.join(', ')}`);
    if (query.latitude && query.longitude) filters.push(`Location within ${query.radius} miles`);
    if (query.minRating) filters.push(`Min rating: ${query.minRating}`);
    if (query.isInsured) filters.push('Insured providers only');
    if (query.isBackgroundChecked) filters.push('Background-checked providers only');
    return filters;
  }

  /**
   * Helper: Get scoring weights based on urgency
   */
  private getScoringWeights(urgency: 'low' | 'medium' | 'high' | 'emergency') {
    // Dynamic weighting based on urgency (as we designed in Step 3.1)
    switch (urgency) {
      case 'emergency':
        return { quality: 0.3, budget: 0.1, availability: 0.6 };
      case 'high':
        return { quality: 0.4, budget: 0.2, availability: 0.4 };
      default:
        return { quality: 0.5, budget: 0.3, availability: 0.2 };
    }
  }

  /**
   * Calculate Quality Score (0-1 scale)
   *
   * Quality is based on three factors:
   * - Rating (60%): How good is their service? (0-5 stars → 0-1)
   * - Reviews (20%): Social proof - more reviews = more trustworthy (capped at 50)
   * - Experience (20%): Track record - completed jobs (capped at 100)
   *
   * @param provider - Provider to score
   * @returns Quality score between 0 and 1
   *
   * Example:
   *   Provider with: 4.5 stars, 30 reviews, 45 completed jobs
   *   = (4.5/5) * 0.6 + (30/50) * 0.2 + (45/100) * 0.2
   *   = 0.9 * 0.6 + 0.6 * 0.2 + 0.45 * 0.2
   *   = 0.54 + 0.12 + 0.09
   *   = 0.75 (good quality!)
   */
  private calculateQualityScore(provider: ProviderSearchResult): number {
    // Component 1: Rating (60% weight)
    // Normalize 0-5 star rating to 0-1 scale
    const ratingScore = (provider.rating / 5.0) * 0.6;

    // Component 2: Review count (20% weight)
    // Cap at 50 reviews - beyond that doesn't add much confidence
    const reviewScore = (Math.min(provider.totalReviews, 50) / 50) * 0.2;

    // Component 3: Experience (20% weight)
    // Cap at 100 jobs - beyond that they're clearly experienced
    const experienceScore = (Math.min(provider.completedJobs, 100) / 100) * 0.2;

    // Combine all three components
    const qualityScore = ratingScore + reviewScore + experienceScore;

    // Ensure score is between 0 and 1
    return Math.max(0, Math.min(1, qualityScore));
  }

  private calculateBudgetScore(
    provider: ProviderSearchResult,
    userBudget?: {min?: number; max?: number; hasFlexibleBudget?: boolean}
  ): number {
    // If no budget provided, return neutral score of 1.0
    if (!userBudget || !userBudget.max) {
      return 1.0;
    }
    if (provider.pricing.baseRate <= userBudget.max) {
      return 1.0;
    }
    else{
      const overBudgetAmount = provider.pricing.baseRate - userBudget.max;
      const  penalty = overBudgetAmount / userBudget.max;
      return Math.max(0, 1.0 - penalty);
    }
  }
  private calculateAvailabilityScore(
    provider: ProviderSearchResult,
    timingRequirements?: { preferredDate?: string;preferredTime?: string; isFlexible?: boolean }
  ): number {
    if ((!timingRequirements?.preferredDate && !timingRequirements?.preferredTime) || timingRequirements?.isFlexible) {
      return 1.0;
    }
    else{
      if (provider.availableHours) {
        const daysAvailable = Object.values(provider.availableHours).filter((day) => day.available).length;
        return daysAvailable / 7;
      }
      return 0;
    }
  }

  private calculateMatchScore(
    provider: ProviderSearchResult,
    input: SearchAgentInput
  ): number {
    const qualityScore = this.calculateQualityScore(provider);
    const budgetScore = this.calculateBudgetScore(provider, input.requirements.budget);
    const availabilityScore = this.calculateAvailabilityScore(provider, input.requirements.timing);
    const weights = this.getScoringWeights(input.requirements.urgency);

    const matchScore =
      qualityScore * weights.quality +
      budgetScore * weights.budget +
      availabilityScore * weights.availability;

    return Math.max(0, Math.min(1, matchScore));
  }
  /**
   * Reflect on search results quality
   */
  async reflect(
    _output: SearchAgentOutput,
    _input: SearchAgentInput
  ): Promise<ReflectionResult> {
     const improvements: string[] = [];
        // Check 1: Did we find enough providers?
    if (_output.providers.length === 0) {
      improvements.push('No providers found - broaden search criteria');
    }

    // Check 2: Are match scores reasonable?
    // Hint: Use .every() to check if ALL scores are below 0.3
    const allScoresLow = _output.providers.every(provider => provider.matchScore < 0.3);
    if (allScoresLow) {
      improvements.push('All match scores are low - adjust ranking algorithm');
    }

    // Check 3: Are results diverse? (not all same business)
    // Hint: Use Set to get unique business names, compare size to total
    const uniqueBusinesses = new Set( _output.providers.map(provider => provider.businessName)).size;
    if (uniqueBusinesses === 1 && _output.providers.length > 1) {
      improvements.push('All results are from same business - need more diversity');
    }

    // Determine if improvements are needed
    const needsImprovement = improvements.length > 0;
    const confidence = needsImprovement ? 0.5 : 0.9;

    return {
      needsImprovement,
      improvements,
      confidence,
    };
  }
}

export const searchAgent = new SearchAgent();
