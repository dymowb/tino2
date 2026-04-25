export const memoryConfig = {
  embedding: {
    model: process.env.VOYAGE_MODEL || 'voyage-3',
    dimensions: 1024,
    apiKey: process.env.VOYAGE_API_KEY || '',
    batchSize: 8,
  },

  retrieval: {
    semantic: {
      topK: parseInt(process.env.MEMORY_SEMANTIC_TOP_K || '5', 10),
      tokenBudget: 200,
      weights: {
        similarity: parseFloat(process.env.MEMORY_SEM_W_SIM || '0.55'),
        recency: parseFloat(process.env.MEMORY_SEM_W_REC || '0.15'),
        importance: parseFloat(process.env.MEMORY_SEM_W_IMP || '0.20'),
        accessBoost: parseFloat(process.env.MEMORY_SEM_W_ACC || '0.10'),
      },
    },
    episodic: {
      topK: parseInt(process.env.MEMORY_EPISODIC_TOP_K || '3', 10),
      tokenBudget: 150,
      weights: {
        similarity: parseFloat(process.env.MEMORY_EPI_W_SIM || '0.45'),
        recency: parseFloat(process.env.MEMORY_EPI_W_REC || '0.30'),
        importance: parseFloat(process.env.MEMORY_EPI_W_IMP || '0.15'),
        accessBoost: parseFloat(process.env.MEMORY_EPI_W_ACC || '0.10'),
      },
    },
    procedural: {
      tokenBudget: 100,
    },
    // recency half-life in days: exp(-λ * days), λ = ln(2)/halfLifeDays
    recencyHalfLifeDays: parseFloat(process.env.MEMORY_RECENCY_HALF_LIFE_DAYS || '14'),
  },

  dedup: {
    // cosine similarity threshold above which a candidate is considered a duplicate
    threshold: parseFloat(process.env.MEMORY_DEDUP_THRESHOLD || '0.92'),
    // minimum confidence for a candidate to be stored at all
    minConfidence: parseFloat(process.env.MEMORY_MIN_CONFIDENCE || '0.50'),
  },

  procedural: {
    autoApproveThreshold: parseFloat(process.env.PROCEDURAL_RULE_AUTO_APPROVE_THRESHOLD || '0.85'),
    queueThreshold: parseFloat(process.env.PROCEDURAL_RULE_QUEUE_THRESHOLD || '0.65'),
  },

  ttl: {
    semanticDays: parseInt(process.env.MEMORY_SEMANTIC_TTL_DAYS || '365', 10),
    episodicDays: parseInt(process.env.MEMORY_EPISODIC_TTL_DAYS || '180', 10),
    // importance halves every N days if accessCount doesn't grow
    importanceDecayDays: parseInt(process.env.MEMORY_IMPORTANCE_DECAY_DAYS || '90', 10),
  },

  reflection: {
    minEpisodesForReflection: parseInt(process.env.MEMORY_REFLECTION_MIN_EPISODES || '3', 10),
    maxEpisodesPerRun: parseInt(process.env.MEMORY_REFLECTION_MAX_EPISODES || '20', 10),
  },

  pii: {
    // patterns detected and redacted on write
    patterns: {
      brazilianPhone: /(\+55\s?)?(\(?\d{2}\)?\s?)(\d{4,5}[\s-]?\d{4})/g,
      cpf: /\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[\-\s]?\d{2}/g,
      email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
      streetAddress: /(?:rua|avenida|av\.|r\.|alameda|travessa)\s+[^\n,]{5,40},?\s*n[°º\.]?\s*\d+/gi,
    },
  },
};

export type MemoryConfig = typeof memoryConfig;
