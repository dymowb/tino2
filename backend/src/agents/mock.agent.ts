/**
 * Mock Agent - For Phase 1 UAT Testing
 *
 * A simple agent that provides predictable responses for testing
 * the workflow orchestration system without requiring LLM integration.
 */

import { Agent, AgentResult, AgentMetadata, ReflectionResult } from './types/agent.types';
import { WorkflowContext } from './types/workflow.types';
import logger from '../config/logger';

/**
 * Input: User message as string
 */
export interface MockAgentInput {
  message: string;
}

/**
 * Output: Mock response with predefined data
 */
export interface MockAgentOutput {
  response: string;
  testData: {
    processedAt: Date;
    inputLength: number;
  };
}

/**
 * Mock Agent - Returns predictable responses for testing
 */
export class MockAgent implements Agent<MockAgentInput, MockAgentOutput> {
  readonly metadata: AgentMetadata = {
    name: 'mock-agent',
    description: 'Mock agent for Phase 1 UAT testing',
    model: 'claude-haiku-4-5-20251001',
    tools: [],
    maxTokens: 100,
    temperature: 0,
    systemPrompt: 'Mock agent for testing - no LLM calls',
  };

  /**
   * Execute the agent (implements Agent interface)
   */
  async execute(
    input: MockAgentInput,
    context: WorkflowContext
  ): Promise<AgentResult<MockAgentOutput>> {
    logger.debug('MockAgent.process() called with:', input);

    // Simulate some processing time (50ms)
    await new Promise(resolve => setTimeout(resolve, 50));

    // Generate mock response based on input
    const response = `Mock response to: "${input.message}"`;
    const testData = {
      processedAt: new Date(),
      inputLength: input.message.length
    };

    logger.debug('MockAgent returning response:', response);

    return {
      success: true,
      output: {
        response,
        testData
      },
      metadata: {
        executionTimeMs: 50,
        tokensUsed: 0, // Mock agent doesn't use tokens
        modelUsed: 'mock-v1',
        confidence: 1.0
      },
      suggestedNextAgent: null // Workflow should end after mock agent
    };
  }

  /**
   * Reflection - Mock agent always returns perfect results
   * Note: Parameters are (output, input) per Agent interface
   */
  async reflect(
    output: MockAgentOutput,
    input: MockAgentInput
  ): Promise<ReflectionResult> {
    logger.debug('MockAgent.reflect() called');

    // Mock agent always produces perfect results (for testing)
    return {
      needsImprovement: false,
      confidence: 1.0,
      reasoning: 'Mock agent output is always correct for testing purposes',
      improvements: []
    };
  }
}

// Export singleton instance
export const mockAgent = new MockAgent();
