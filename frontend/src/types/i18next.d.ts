import 'react-i18next';

/**
 * Key-level typing for `t()`, from the reference locale's actual files.
 *
 * ⚠️ **This declaration currently has no effect, and that is deliberate for now.**
 *
 * Two separate things were wrong with it. The first is fixed: it imported from
 * `../locales/en/*.json`, a directory that has never existed, so even the JSON
 * never resolved — invisible because `tsconfig.json` sets `skipLibCheck: true`.
 * The paths below are real and the namespace list is now complete.
 *
 * The second is not fixed. On i18next 25 / react-i18next 16, `CustomTypeOptions`
 * is exported from **`i18next`**, not `react-i18next`, so augmenting
 * `react-i18next` declares a fresh interface that nothing reads. Changing the
 * module below to `'i18next'` does switch key checking on — and immediately
 * produces 22 errors, none of them typos: dynamic keys built from template
 * literals, cross-namespace calls like `t('bookings:dispute.title')` from a
 * component scoped to another namespace, and a `TFunction` passed into a helper
 * typed as `(k: string) => string`. Each is a real change to real components.
 *
 * That is worth doing and is not this change. Until it is done, the guarantee
 * that keys exist comes from `i18n/manifest.test.ts` comparing the catalogs to
 * each other — which is a weaker promise than the compiler, and is the reason
 * this comment exists rather than a quietly broken file.
 */
declare module 'react-i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof import('../../public/locales/en/common.json');
      auth: typeof import('../../public/locales/en/auth.json');
      providers: typeof import('../../public/locales/en/providers.json');
      bookings: typeof import('../../public/locales/en/bookings.json');
      quotes: typeof import('../../public/locales/en/quotes.json');
      messages: typeof import('../../public/locales/en/messages.json');
      payments: typeof import('../../public/locales/en/payments.json');
      reviews: typeof import('../../public/locales/en/reviews.json');
      profile: typeof import('../../public/locales/en/profile.json');
      notifications: typeof import('../../public/locales/en/notifications.json');
      dashboard: typeof import('../../public/locales/en/dashboard.json');
      assistant: typeof import('../../public/locales/en/assistant.json');
      admin: typeof import('../../public/locales/en/admin.json');
      memory: typeof import('../../public/locales/en/memory.json');
    };
  }
}
