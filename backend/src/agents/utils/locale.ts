export function getLanguageInstruction(locale?: string): string {
  if (locale === 'en') return 'Respond in English. All text, questions, and analysis must be in English.';
  return 'Respond in Brazilian Portuguese (pt-BR). All text, questions, and analysis must be in Portuguese.';
}
