import { AppDataSource } from '@/config/database';
import logger from '@/config/logger';
import { AppSettings } from '@/models/AppSettings';

export const AI_SETTING_KEYS = {
  fast: 'ai_fast_model_chain',
  reasoning: 'ai_reasoning_model_chain',
  synthesis: 'ai_synthesis_model_chain',
  rebook: 'ai_rebook_model_chain',
  embedding: 'ai_embedding_chain',
  transcription: 'ai_transcription_model',
  speech: 'ai_speech_model',
} as const;

export type AiConfigurationField = keyof typeof AI_SETTING_KEYS;

const ENV_KEYS: Record<AiConfigurationField, string> = {
  fast: 'AI_FAST_MODEL_CHAIN',
  reasoning: 'AI_REASONING_MODEL_CHAIN',
  synthesis: 'AI_SYNTHESIS_MODEL_CHAIN',
  rebook: 'REBOOK_AI_MODEL_CHAIN',
  embedding: 'AI_EMBEDDING_CHAIN',
  transcription: 'VOICE_TRANSCRIPTION_MODEL',
  speech: 'VOICE_TTS_MODEL',
};

const descriptions: Record<AiConfigurationField, string> = {
  fast: 'Ordered provider:model chain for fast AI tasks',
  reasoning: 'Ordered provider:model chain for reasoning tasks',
  synthesis: 'Ordered provider:model chain for final synthesis',
  rebook: 'Ordered provider:model chain for rebooking; blank inherits fast',
  embedding: 'Ordered provider:model chain used for memory embeddings',
  transcription: 'OpenAI model used for voice transcription',
  speech: 'OpenAI model used for speech synthesis',
};

const overrides = new Map<AiConfigurationField, string>();

function envValue(field: AiConfigurationField): string {
  if (field === 'rebook') return process.env.REBOOK_AI_MODEL_CHAIN?.trim() || getAiSetting('fast');
  return process.env[ENV_KEYS[field]]?.trim() || '';
}

export function getAiSetting(field: AiConfigurationField): string {
  return overrides.get(field) ?? envValue(field);
}

export function validateAiSetting(field: AiConfigurationField, rawValue: unknown): string {
  const value = String(rawValue ?? '').trim();
  if (field === 'rebook' && !value) return '';
  if (!value) throw new Error(`${field} model configuration cannot be empty`);

  if (field === 'transcription' || field === 'speech') {
    if (!/^[A-Za-z0-9._-]+$/.test(value)) throw new Error(`Invalid ${field} model name`);
    return value;
  }

  const allowed = field === 'embedding' ? ['openai', 'voyage'] : ['openai', 'anthropic'];
  for (const target of value.split(',')) {
    const separator = target.indexOf(':');
    const provider = target.slice(0, separator).trim().toLowerCase();
    const model = target.slice(separator + 1).trim();
    if (separator < 1 || !model || !allowed.includes(provider)) {
      throw new Error(`Invalid target "${target.trim()}"; expected ${allowed.join('|')}:model`);
    }
    if (!/^[A-Za-z0-9._-]+$/.test(model)) throw new Error(`Invalid model name "${model}"`);
  }
  return value;
}

export async function loadAiConfiguration(): Promise<void> {
  if (!AppDataSource.isInitialized) return;
  const keys = Object.values(AI_SETTING_KEYS);
  const rows = await AppDataSource.getRepository(AppSettings)
    .createQueryBuilder('setting')
    .where('setting.key IN (:...keys)', { keys })
    .getMany();
  overrides.clear();
  for (const row of rows) {
    const field = (Object.entries(AI_SETTING_KEYS).find(([, key]) => key === row.key)?.[0] ||
      '') as AiConfigurationField;
    if (!field) continue;
    try {
      const value = validateAiSetting(field, row.value);
      if (value) overrides.set(field, value);
    } catch (error) {
      logger.error('Ignoring invalid persisted AI configuration', { field, error });
    }
  }
}

export async function updateAiConfiguration(
  field: AiConfigurationField,
  rawValue: unknown
): Promise<void> {
  const value = validateAiSetting(field, rawValue);
  const key = AI_SETTING_KEYS[field];
  await AppDataSource.getRepository(AppSettings).upsert(
    { key, value, description: descriptions[field] },
    ['key']
  );
  if (value) overrides.set(field, value);
  else overrides.delete(field);
}

function displayTarget(target: string): { provider: string; model: string } {
  const separator = target.indexOf(':');
  return { provider: target.slice(0, separator), model: target.slice(separator + 1) };
}

export function getAiConfigurationView() {
  const fields = Object.keys(AI_SETTING_KEYS) as AiConfigurationField[];
  return Object.fromEntries(
    fields.map((field) => {
      const value = getAiSetting(field);
      const isChain = !['transcription', 'speech'].includes(field);
      return [
        field,
        {
          value,
          source: overrides.has(field) ? 'admin' : 'environment',
          models: isChain
            ? value.split(',').filter(Boolean).map(displayTarget)
            : [{ provider: 'openai', model: value }],
        },
      ];
    })
  );
}
