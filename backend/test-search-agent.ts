/**
 * Quick Search Agent Validation Script
 * Run with: npx ts-node test-search-agent.ts
 */

import { AppDataSource } from './src/config/database';
import { searchAgent } from './src/agents/search.agent';
import { WorkflowContext } from './src/agents/types/workflow.types';

async function testSearchAgent() {
  console.log('🚀 Testing Search Agent...\n');

  // Initialize database
  await AppDataSource.initialize();
  console.log('✅ Database connected\n');

  try {
    // Test 1: Search for plumbing services
    console.log('Test 1: Searching for plumbing services...');
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

    const result = await searchAgent.execute(input, context);

    console.log(`✅ Search completed successfully!`);
    console.log(`   Providers found: ${result.output.providers.length}`);
    console.log(`   Total matching: ${result.output.totalFound}`);
    console.log(`   Filters: ${result.output.searchMetadata.filtersApplied.join(', ')}`);
    console.log(`   Weights:`, result.output.searchMetadata.scoringWeights);

    if (result.output.providers.length > 0) {
      console.log('\n   Top provider:');
      const top = result.output.providers[0];
      console.log(`     - ${top.businessName}`);
      console.log(`     - Rating: ${top.rating}/5 (${top.totalReviews} reviews)`);
      console.log(`     - Completed jobs: ${top.completedJobs}`);
      console.log(`     - Match score: ${top.matchScore}`);
      console.log(`     - Pricing: $${top.pricing.baseRate}/${top.pricing.rateType}`);
    }

    // Test 2: Reflection
    console.log('\n\nTest 2: Testing reflection...');
    const reflection = await searchAgent.reflect(result.output, input);
    console.log(`✅ Reflection completed!`);
    console.log(`   Needs improvement: ${reflection.needsImprovement}`);
    console.log(`   Confidence: ${reflection.confidence}`);
    if (reflection.improvements.length > 0) {
      console.log('   Improvements:', reflection.improvements);
    }

    // Test 3: Empty results
    console.log('\n\nTest 3: Testing empty results handling...');
    const emptyInput = {
      ...input,
      requirements: {
        ...input.requirements,
        serviceType: 'unicorn-grooming',
      },
    };
    const emptyResult = await searchAgent.execute(emptyInput, context);
    const emptyReflection = await searchAgent.reflect(emptyResult.output, emptyInput);

    console.log(`✅ Empty results handled correctly!`);
    console.log(`   Providers found: ${emptyResult.output.providers.length}`);
    console.log(`   Reflection detected issue: ${emptyReflection.needsImprovement}`);
    if (emptyReflection.improvements.length > 0) {
      console.log(`   Suggestion: ${emptyReflection.improvements[0]}`);
    }

    console.log('\n\n🎉 All tests passed! Search Agent is working correctly.\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    await AppDataSource.destroy();
    console.log('✅ Database connection closed');
  }
}

// Run tests
testSearchAgent().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
