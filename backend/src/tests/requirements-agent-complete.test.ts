/**
 * Requirements Agent - Complete Request Test
 *
 * Run with: npx ts-node src/tests/requirements-agent-complete.test.ts
 */

import { requirementsAgent } from '../agents/requirements.agent';
import { WorkflowContext } from '../agents/types/workflow.types';

async function testCompleteRequest() {
  console.log('🧪 Testing Requirements Agent - Complete Request\n');
  console.log('='.repeat(60));

  // Test with detailed request that should have all information
  console.log('\n📝 Test: Detailed plumbing request with all info\n');

  const testInput = {
    userRequest: `I need an emergency plumber in Austin, TX for a kitchen sink leak.
                  My budget is up to $500 and I need someone licensed and insured.
                  I'm in a downtown apartment with lobby access.`,
    conversationHistory: [],
  };

  const testContext: WorkflowContext = {
    workflowId: 'test-workflow-2',
    userId: 'test-user-2',
    createdAt: new Date(),
    userRequest: testInput.userRequest,
  };

  try {
    const result = await requirementsAgent.execute(testInput, testContext);

    console.log('✅ Result:', JSON.stringify(result, null, 2));

    // Test reflection
    console.log('\n🤔 Testing reflection on output...\n');
    const reflection = await requirementsAgent.reflect(
      result.output,
      testInput
    );

    console.log('🔍 Reflection:', JSON.stringify(reflection, null, 2));

    // Check if requirements are complete
    if (result.output.isComplete) {
      console.log('\n✅ Requirements marked as COMPLETE');
      console.log('📊 Summary:', JSON.stringify(result.output.requirementsSummary, null, 2));
    } else {
      console.log('\n⚠️  Requirements still INCOMPLETE');
      console.log('❓ Follow-up question:', result.output.followUpQuestion);
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n✅ Testing complete!\n');
}

// Run the test
testCompleteRequest().catch(console.error);
