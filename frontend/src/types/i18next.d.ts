import 'react-i18next';

declare module 'react-i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof import('../locales/en/common.json');
      auth: typeof import('../locales/en/auth.json');
      providers: typeof import('../locales/en/providers.json');
      bookings: typeof import('../locales/en/bookings.json');
      quotes: typeof import('../locales/en/quotes.json');
      messages: typeof import('../locales/en/messages.json');
      payments: typeof import('../locales/en/payments.json');
      reviews: typeof import('../locales/en/reviews.json');
      profile: typeof import('../locales/en/profile.json');
      notifications: typeof import('../locales/en/notifications.json');
      dashboard: typeof import('../locales/en/dashboard.json');
    };
  }
}
