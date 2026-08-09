import { aiGateway, getRebookModelChain } from '@/agents/services/ai-gateway.service';
import { parseLlmJson } from '@/agents/utils/llm-json';

export interface RebookDraftInput {
  serviceType: string;
  description: string;
  specialInstructions: string;
  estimatedDurationHours: number;
  proposedBudget: number;
}

class RebookRefinementService {
  async refine(
    draft: RebookDraftInput,
    changeRequest: string
  ): Promise<{
    draft: RebookDraftInput;
    changedFields: string[];
    summary: string;
  }> {
    const result = await aiGateway.execute({
      targets: getRebookModelChain(),
      request: {
        systemPrompt: `You refine an existing repeat-service request from a customer's explicit change request.
Return JSON only with: serviceType, description, specialInstructions, estimatedDurationHours,
proposedBudget, changedFields (array), summary (one sentence).
Keep every field unchanged unless the customer explicitly asks to change it. Never invent provider
agreements, availability, prices, dates, addresses, materials, or guarantees.`,
        userMessage: `Current draft:\n${JSON.stringify(draft)}\n\nCustomer changes:\n${changeRequest}`,
        maxTokens: 900,
        temperature: 0.1,
      },
      validate: (response) => {
        const parsed = parseLlmJson<any>(response.text, 'object');
        if (!parsed) throw new Error('Could not parse refinement');
        return parsed;
      },
    });
    const parsed = result.value;

    const next: RebookDraftInput = {
      serviceType: String(parsed.serviceType || draft.serviceType).slice(0, 200),
      description: String(parsed.description || draft.description).slice(0, 5000),
      specialInstructions: String(parsed.specialInstructions ?? draft.specialInstructions).slice(
        0,
        3000
      ),
      estimatedDurationHours: Math.min(
        8,
        Math.max(0.5, Number(parsed.estimatedDurationHours) || draft.estimatedDurationHours)
      ),
      proposedBudget: Math.max(0, Number(parsed.proposedBudget) || draft.proposedBudget),
    };
    // A budget change must be grounded in an explicit number from the customer's instruction.
    if (!/\d/.test(changeRequest)) next.proposedBudget = draft.proposedBudget;
    const changedFields = (Object.keys(next) as Array<keyof RebookDraftInput>).filter(
      (key) => next[key] !== draft[key]
    );
    return {
      draft: next,
      changedFields,
      summary: String(parsed.summary || 'Draft updated from your requested changes').slice(0, 300),
    };
  }
}

export default new RebookRefinementService();
