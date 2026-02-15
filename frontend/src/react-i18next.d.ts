// TypeScript definitions for react-i18next
import 'react-i18next';

// Define the resources type (this tells TypeScript what namespaces exist)
declare module 'react-i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    // Allow any string as namespace for flexibility
    resources: {
      common: any;
      auth: any;
      providers: any;
      bookings: any;
      quotes: any;
      messages: any;
      payments: any;
      reviews: any;
      profile: any;
      notifications: any;
      dashboard: any;
    };
  }
}
