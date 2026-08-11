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

describe('AiGateway timeouts', () => {
  test('aborts the provider request when the attempt times out', async () => {
    // Racing without aborting leaves the abandoned call generating and billing
    // while the fallback starts — the exact failure the gateway should contain.
    let observed: AbortSignal | undefined;
    const gateway = new AiGateway({
      anthropic: adapter((_model, request) => {
        observed = request.signal;
        return new Promise(() => undefined); // never settles
      }),
      openai: adapter(async () => ({
        text: 'fallback',
        finishReason: 'end_turn',
        usage: { inputTokens: 0, outputTokens: 0 },
      })),
    });

    const result = await gateway.execute({
      request: { systemPrompt: '', userMessage: '' },
      targets: [
        { provider: 'anthropic', model: 'slow' },
        { provider: 'openai', model: 'quick' },
      ],
      validate: (response) => response,
      timeoutMs: 1000,
    });

    expect(result.value.text).toBe('fallback');
    expect(observed?.aborted).toBe(true);
  });

  test('honours a caller-supplied timeout instead of the 30s default', async () => {
    const started = Date.now();
    const gateway = new AiGateway({
      anthropic: adapter(() => new Promise(() => undefined)),
      openai: adapter(() => new Promise(() => undefined)),
    });

    await expect(
      gateway.execute({
        request: { systemPrompt: '', userMessage: '' },
        targets: [{ provider: 'anthropic', model: 'slow' }],
        validate: (response) => response,
        timeoutMs: 1000,
      })
    ).rejects.toThrow(/timed out after 1000ms/);

    expect(Date.now() - started).toBeLessThan(10_000);
  });

  test('propagates a caller abort to the provider request', async () => {
    let observed: AbortSignal | undefined;
    const controller = new AbortController();
    const gateway = new AiGateway({
      anthropic: adapter((_model, request) => {
        observed = request.signal;
        controller.abort();
        return new Promise(() => undefined);
      }),
      openai: adapter(() => new Promise(() => undefined)),
    });

    await expect(
      gateway.execute({
        request: { systemPrompt: '', userMessage: '', signal: controller.signal },
        targets: [{ provider: 'anthropic', model: 'slow' }],
        validate: (response) => response,
        timeoutMs: 1500,
      })
    ).rejects.toThrow();

    expect(observed?.aborted).toBe(true);
  });
});
