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
  // TODO: Define the fields for a single search result
  // Based on our discussion, include:
  // - providerId (string)
  // - businessName (string)
  // - pricing (object with baseRate, currency, rateType)
  // - rating (number out of 5)
  // - totalReviews (number)
  // - completedJobs (number)
  // - availableHours (object)
  // - location (object with city, state, distance from user)
  // - isBackgroundChecked (boolean)
  // - isInsured (boolean)
  // - matchScore (number, 0-1)
  // - services (string[])

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
  availableHours: any;
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
    model: 'claude-3-5-sonnet-20241022', // Use Sonnet for planning + ranking logic
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
   * Execute search for providers
   */
  async execute(
    _input: SearchAgentInput,
    _context: WorkflowContext
  ): Promise<AgentResult<SearchAgentOutput>> {
    // TODO: Implement in Step 3.2
    throw new Error('Not implemented yet');
  }

  /**
   * Reflect on search results quality
   */
  async reflect(
    _output: SearchAgentOutput,
    _input: SearchAgentInput
  ): Promise<ReflectionResult> {
    // TODO: Implement in Step 3.2
    // Check: Did we find enough providers (at least 1)?
    // Check: Are match scores reasonable (not all 0.1)?
    // Check: Are results diverse (not all same business)?
    throw new Error('Not implemented yet');
  }
}

export const searchAgent = new SearchAgent();
