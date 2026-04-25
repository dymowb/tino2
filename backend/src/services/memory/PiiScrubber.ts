import { memoryConfig } from '@/config/memory';

export interface ScrubResult {
  text: string;
  detected: boolean;
  types: string[];
}

const REPLACEMENTS: Record<string, string> = {
  brazilianPhone: '[PHONE]',
  cpf: '[CPF]',
  email: '[EMAIL]',
  creditCard: '[CARD]',
  streetAddress: '[ADDRESS]',
};

export function scrubPii(input: string): ScrubResult {
  let text = input;
  const types: string[] = [];
  const patterns = memoryConfig.pii.patterns;

  for (const [key, pattern] of Object.entries(patterns)) {
    // Reset lastIndex since patterns use /g flag
    pattern.lastIndex = 0;
    if (pattern.test(input)) {
      types.push(key);
      pattern.lastIndex = 0;
      text = text.replace(pattern, REPLACEMENTS[key] ?? '[REDACTED]');
    }
  }

  return { text, detected: types.length > 0, types };
}
