import { AiGateway, AiProviderAdapter, parseModelChain } from './ai-gateway.service';

const adapter = (
  generate: AiProviderAdapter['generate'],
  configured = true
): AiProviderAdapter => ({
  isConfigured: () => configured,
  generate,
  async *stream() {
    yield (await generate('test', { systemPrompt: '', userMessage: '' })).text;
  },
});

describe('AiGateway', () => {
  test('requires an explicitly configured model chain', () => {
    expect(() => parseModelChain()).toThrow('REBOOK_AI_MODEL_CHAIN is required');
  });

  test('parses an ordered, customizable provider and model chain', () => {
    expect(parseModelChain('openai:gpt-example, anthropic:claude-example')).toEqual([
      { provider: 'openai', model: 'gpt-example' },
      { provider: 'anthropic', model: 'claude-example' },
    ]);
  });

  test('falls back when the primary response fails workflow validation', async () => {
    const gateway = new AiGateway({
      anthropic: adapter(async () => ({
        text: 'not-json',
        finishReason: 'end_turn',
        usage: { inputTokens: 1, outputTokens: 1 },
      })),
      openai: adapter(async () => ({
        text: '{"ok":true}',
        finishReason: 'completed',
        usage: { inputTokens: 1, outputTokens: 1 },
      })),
    });

    const result = await gateway.execute({
      request: { systemPrompt: 'system', userMessage: 'user' },
      targets: parseModelChain('anthropic:primary,openai:fallback'),
      validate: (response) => JSON.parse(response.text),
    });

    expect(result).toMatchObject({
      value: { ok: true },
      provider: 'openai',
      model: 'fallback',
      attempts: 2,
    });
  });

  test('skips providers that do not have credentials configured', async () => {
    const unavailable = jest.fn();
    const fallback = jest.fn(async () => ({
      text: 'valid',
      finishReason: 'completed',
      usage: { inputTokens: 1, outputTokens: 1 },
    }));
    const gateway = new AiGateway({
      anthropic: adapter(unavailable, false),
      openai: adapter(fallback),
    });

    const result = await gateway.execute({
      request: { systemPrompt: 'system', userMessage: 'user' },
      targets: parseModelChain('anthropic:primary,openai:fallback'),
      validate: (response) => response.text,
    });

    expect(unavailable).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe('openai');
  });
});
