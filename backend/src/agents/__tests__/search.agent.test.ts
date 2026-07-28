/**
 * Search Agent Test
 *
 * Quick test to verify Search Agent basic functionality
 */

import { searchAgent } from '../search.agent';
import { WorkflowContext } from '../types/workflow.types';
import { anthropicService } from '../services/anthropic.service';

describe('Search Agent', () => {
  beforeEach(() => {
    jest.spyOn(anthropicService, 'callClaude').mockImplementation(async (request) => {
      const serviceType = request.userMessage.match(/Service type= "([^"]+)"/)?.[1] ?? '';
      return {
        text: JSON.stringify(serviceType ? [serviceType] : []),
        usage: { inputTokens: 1, outputTokens: 1 },
        model: 'test',
        stopReason: 'end_turn',
      };
    });
  });

  it('should find providers for a simple search (plumbing)', async () => {
    // Arrange: Create test input
    const input = {
      requirements: {
        serviceType: 'plumbing',
        location: {
          city: 'San Francisco',
          state: 'CA',
        },
        timing: {
          isFlexible: true,
        },
        budget: {
          hasFlexibility: true,
        },
        specialRequirements: [],
        urgency: 'medium' as const,
      },
      workflowId: 'test-workflow-123',
      userId: 'test-user-123',
    };

    const context: WorkflowContext = {
      workflowId: 'test-workflow-123',
      userId: 'test-user-123',
      createdAt: new Date(),
      userRequest: 'I need a plumber in San Francisco',
    };

    // Act: Execute search
    const result = await searchAgent.execute(input, context);

    // Assert: Check results
    expect(result.success).toBe(true);
    expect(result.output.providers).toBeDefined();
    expect(result.output.totalFound).toBeGreaterThanOrEqual(0);
    expect(result.output.searchMetadata).toBeDefined();
    expect(result.output.searchMetadata.filtersApplied).toContain('Service: plumbing');

    console.log('\n=== Search Agent Test Results ===');
    console.log(`Providers found: ${result.output.providers.length}`);
    console.log(`Total matching: ${result.output.totalFound}`);
    console.log(`Filters applied: ${result.output.searchMetadata.filtersApplied.join(', ')}`);
    console.log(`Scoring weights:`, result.output.searchMetadata.scoringWeights);

    if (result.output.providers.length > 0) {
      console.log('\nTop provider:');
      const top = result.output.providers[0];
      console.log(`  - ${top.businessName}`);
      console.log(`  - Rating: ${top.rating}/5 (${top.totalReviews} reviews)`);
      console.log(`  - Completed jobs: ${top.completedJobs}`);
      console.log(`  - Match score: ${top.matchScore}`);
      console.log(`  - Services: ${top.services.join(', ')}`);
    }
  });

  it('should reflect on search results quality', async () => {
    // Arrange: Create test input
    const input = {
      requirements: {
        serviceType: 'plumbing',
        location: {
          city: 'San Francisco',
          state: 'CA',
        },
        timing: {
          isFlexible: true,
        },
        budget: {
          hasFlexibility: true,
        },
        specialRequirements: [],
        urgency: 'emergency' as const,
      },
      workflowId: 'test-workflow-456',
      userId: 'test-user-456',
    };

    const context: WorkflowContext = {
      workflowId: 'test-workflow-456',
      userId: 'test-user-456',
      createdAt: new Date(),
      userRequest: 'Emergency plumber needed now!',
    };

    // Act: Execute search and reflection
    const result = await searchAgent.execute(input, context);
    const reflection = await searchAgent.reflect(result.output, input);

    // Assert: Check reflection
    expect(reflection).toBeDefined();
    expect(reflection.needsImprovement).toBeDefined();
    expect(reflection.improvements).toBeDefined();
    expect(reflection.confidence).toBeGreaterThan(0);
    expect(reflection.confidence).toBeLessThanOrEqual(1);

    console.log('\n=== Reflection Results ===');
    console.log(`Needs improvement: ${reflection.needsImprovement}`);
    console.log(`Confidence: ${reflection.confidence}`);
    if (reflection.improvements.length > 0) {
      console.log('Suggested improvements:');
      reflection.improvements.forEach((imp) => console.log(`  - ${imp}`));
    } else {
      console.log('No improvements needed!');
    }
  });

  it('should handle empty results gracefully', async () => {
    // Arrange: Search for a service that likely doesn't exist
    const input = {
      requirements: {
        serviceType: 'unicorn-grooming', // This service doesn't exist!
        location: {
          city: 'San Francisco',
          state: 'CA',
        },
        timing: {
          isFlexible: true,
        },
        budget: {
          hasFlexibility: true,
        },
        specialRequirements: [],
        urgency: 'low' as const,
      },
      workflowId: 'test-workflow-789',
      userId: 'test-user-789',
    };

    const context: WorkflowContext = {
      workflowId: 'test-workflow-789',
      userId: 'test-user-789',
      createdAt: new Date(),
      userRequest: 'Need unicorn grooming service',
    };

    // Act: Execute search
    const result = await searchAgent.execute(input, context);
    const reflection = await searchAgent.reflect(result.output, input);

    // Assert: Should handle empty results
    expect(result.success).toBe(true);
    expect(result.output.providers).toHaveLength(0);
    expect(result.output.totalFound).toBe(0);

    // Reflection should detect this issue
    expect(reflection.needsImprovement).toBe(true);
    expect(reflection.improvements).toContain('No providers found - broaden search criteria');

    console.log('\n=== Empty Results Test ===');
    console.log('Correctly handled empty results!');
    console.log(`Reflection detected issue: ${reflection.improvements[0]}`);
  });
});
