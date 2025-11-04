/**
 * Requirements Agent - Manual Testing Script
 *
 * Run with: npx ts-node src/tests/requirements-agent.test.ts
 */

import { requirementsAgent } from '../agents/requirements.agent';
import { WorkflowContext } from '../agents/types/workflow.types';

async function testRequirementsAgent() {
  console.log('🧪 Testing Requirements Agent\n');
  console.log('='.repeat(60));

  // Test 1: Initial vague request
  console.log('\n📝 Test 1: Vague request - "I need a plumber"\n');

  const testInput1 = {
    userRequest: 'I need a plumber',
    conversationHistory: [],
  };

  const testContext: WorkflowContext = {
    workflowId: 'test-workflow-1',
    userId: 'test-user-1',
    createdAt: new Date(),
    userRequest: 'I need a plumber',
  };

  try {
    const result1 = await requirementsAgent.execute(testInput1, testContext);

    console.log('✅ Result:', JSON.stringify(result1, null, 2));

    // Test reflection
    console.log('\n🤔 Testing reflection on output...\n');
    const reflection1 = await requirementsAgent.reflect(
      result1.output,
      testInput1
    );

    console.log('🔍 Reflection:', JSON.stringify(reflection1, null, 2));
  } catch (error) {
    console.error('❌ Test failed:', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n✅ Testing complete!\n');
}

// Run the test
testRequirementsAgent().catch(console.error);
