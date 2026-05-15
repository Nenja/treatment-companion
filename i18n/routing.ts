import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'da'],
  defaultLocale: 'en',
  // 'as-needed' keeps the URL clean for the default locale.
  // English: /  Danish: /da
  localePrefix: 'as-needed'
});

export type AppLocale = (typeof routing.locales)[number];
