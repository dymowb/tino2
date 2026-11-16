/**
 * Function words, not content words: frequent, short, and — critically — not
 * shared between the two languages. A name, an address or a service type appears
 * in both and must not tip the count either way.
 *
 * `do` and `no` appear in BOTH languages, so they are in neither list. `do` was
 * previously counted as English, which is what made an entirely Portuguese thread
 * score pt:0 en:2 and draft in English — worse than having no heuristic at all,
 * because it overrode a fallback that was already right.
 */
const PORTUGUESE_MARKERS = [
  // Contractions and articles carry most of the signal in short scheduling
  // messages, which often contain none of the politer words at all.
  'de',
  'da',
  'na',
  'os',
  'dos',
  'das',
  'nas',
  'ao',
  'pelo',
  'pela',
  'um',
  'uma',
  'não',
  'sim',
  'você',
  'obrigado',
  'obrigada',
  'por favor',
  'está',
  'então',
  'com',
  'para',
  'que',
  'pode',
  'vou',
  'fazer',
  'tudo',
  'bem',
  'muito',
  'também',
  'já',
  'aqui',
  'quando',
  'onde',
  'meu',
  'minha',
  'seu',
  'sua',
];

const ENGLISH_MARKERS = [
  'the',
  'and',
  'you',
  'thanks',
  'please',
  'is',
  'are',
  'with',
  // Not 'for': Portuguese uses it constantly ("se for possível").
  'that',
  'can',
  'will',
  'about',
  'okay',
  'sure',
  'have',
  'was',
  'what',
  'when',
  'there',
];

/**
 * How much one language must lead by before it overrides the caller's locale.
 *
 * A one-word lead is noise — a single "that" in a Portuguese thread, or an
 * address that happens to contain a marker. Below this margin the requester's
 * own locale is the better answer, because it is at least a deliberate setting.
 */
const DECISIVE_MARGIN = 2;

/** Word-boundary counting that works for accented letters.
 *
 * `\b` is defined over `[A-Za-z0-9_]`, so `\bvocê\b` can never match: the `ê` is
 * not a word character, so there is no boundary after it. Lookarounds on
 * `\p{L}` are boundaries in any script. */
function countMarkers(text: string, markers: string[]): number {
  let total = 0;
  for (const marker of markers) {
    const pattern = new RegExp(`(?<!\\p{L})${marker}(?!\\p{L})`, 'giu');
    total += (text.match(pattern) ?? []).length;
  }
  return total;
}

/**
 * The language a body of participant text is written in, or null when the text
 * does not answer clearly (too short, or a near tie).
 *
 * Deliberately not a model call — asking one model what language another should
 * answer in is a lot of machinery for a question the existing text already
 * answers.
 */
export function detectLanguage(text: string): 'Portuguese' | 'English' | null {
  const portuguese = countMarkers(text, PORTUGUESE_MARKERS);
  const english = countMarkers(text, ENGLISH_MARKERS);
  if (Math.abs(portuguese - english) < DECISIVE_MARGIN) return null;
  return portuguese > english ? 'Portuguese' : 'English';
}

/** 'pt-BR' → 'Portuguese'; anything that is not English reads as the platform's own language. */
export function languageForLocale(locale: string): 'Portuguese' | 'English' {
  return locale.toLowerCase().startsWith('en') ? 'English' : 'Portuguese';
}
