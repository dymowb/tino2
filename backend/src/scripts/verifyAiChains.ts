/**
 * Verifies every configured AI model chain against the live provider.
 *
 * Boot-time validateAiConfiguration() only checks that the chains parse — it
 * never calls a provider, so a typo'd model ID or a bad key still starts the
 * server and fails later inside a workflow. This exercises each profile end to
 * end through the gateway, the same path the agents use.
 *
 *   npx ts-node src/scripts/verifyAiChains.ts
 */
import 'reflect-metadata';
import dotenv from 'dotenv';

dotenv.config();

import { aiGateway, getAiProfileChain, AiProfileName } from '@/agents/services/ai-gateway.service';
import {
  EmbeddingGateway,
  getEmbeddingDimensions,
  parseEmbeddingChain,
} from '@/services/memory/EmbeddingService';

const PROFILES: AiProfileName[] = ['fast', 'reasoning', 'synthesis'];

async function main(): Promise<void> {
  let failures = 0;

  for (const profile of PROFILES) {
    const chain = getAiProfileChain(profile)
      .map((target) => `${target.provider}:${target.model}`)
      .join(' → ');

    try {
      const result = await aiGateway.generate(profile, {
        systemPrompt: 'Reply with exactly one word.',
        userMessage: 'Say OK.',
        maxTokens: 16,
      });
      const reply = JSON.stringify(result.value ?? result)
        .replace(/\s+/g, ' ')
        .slice(0, 80);
      console.log(`PASS  ${profile.padEnd(9)} ${chain}\n      ${reply}`);
    } catch (error) {
      failures += 1;
      console.log(
        `FAIL  ${profile.padEnd(9)} ${chain}\n      ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // Embeddings: the dimension must match the vector(N) column the existing
  // memories live in, so check the width as well as the call succeeding.
  const embeddingChain = parseEmbeddingChain(process.env.AI_EMBEDDING_CHAIN)
    .map((target) => `${target.provider}:${target.model}`)
    .join(' → ');
  try {
    const expected = getEmbeddingDimensions();
    const vector = await new EmbeddingGateway().embed('readiness copilot smoke test');
    const ok = vector.length === expected;
    if (!ok) failures += 1;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${'embedding'.padEnd(9)} ${embeddingChain}\n` +
        `      ${vector.length} dimensions (expected ${expected})`
    );
  } catch (error) {
    failures += 1;
    console.log(
      `FAIL  ${'embedding'.padEnd(9)} ${embeddingChain}\n      ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
