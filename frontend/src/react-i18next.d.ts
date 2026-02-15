// Override react-i18next types for TS 4.9 compatibility
// react-i18next v16 + i18next v25 use 'const' type parameters (TS 5.0+ feature)
// This provides a simplified but fully functional type signature
import type { i18n } from 'i18next';

declare module 'react-i18next' {
  type TFunction = (key: string, optionsOrDefaultValue?: string | Record<string, unknown>) => string;

  interface UseTranslationReturn {
    t: TFunction;
    i18n: i18n;
    ready: boolean;
  }

  export function useTranslation(
    ns?: string | string[],
    options?: Record<string, unknown>,
  ): UseTranslationReturn;
}
