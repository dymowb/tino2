import { EmbeddingAdapter, EmbeddingGateway, parseEmbeddingChain } from './EmbeddingService';

const vector = (value: number, dimensions = 3) => Array(dimensions).fill(value);
const adapter = (embed: EmbeddingAdapter['embed'], configured = true): EmbeddingAdapter => ({
  isConfigured: () => configured,
  embed,
});

describe('EmbeddingGateway', () => {
  test('requires an explicit provider and model chain', () => {
    expect(() => parseEmbeddingChain()).toThrow('AI_EMBEDDING_CHAIN is required');
  });

  test('parses ordered OpenAI and Voyage targets', () => {
    expect(parseEmbeddingChain('openai:primary, voyage:fallback')).toEqual([
      { provider: 'openai', model: 'primary' },
      { provider: 'voyage', model: 'fallback' },
    ]);
  });

  test('falls back when the primary returns incompatible dimensions', async () => {
    const primary = jest.fn(async () => [vector(1, 2)]);
    const fallback = jest.fn(async () => [vector(2)]);
    const gateway = new EmbeddingGateway(parseEmbeddingChain('openai:primary,voyage:fallback'), 3, {
      openai: adapter(primary),
      voyage: adapter(fallback),
    });

    await expect(gateway.embed('hello')).resolves.toEqual(vector(2));
    expect(primary).toHaveBeenCalledTimes(1);
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  test('skips providers without credentials', async () => {
    const primary = jest.fn();
    const fallback = jest.fn(async () => [vector(3)]);
    const gateway = new EmbeddingGateway(parseEmbeddingChain('openai:primary,voyage:fallback'), 3, {
      openai: adapter(primary, false),
      voyage: adapter(fallback),
    });

    await expect(gateway.embed('hello')).resolves.toEqual(vector(3));
    expect(primary).not.toHaveBeenCalled();
  });
});
