import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'da', 'sv', 'nb'],
  defaultLocale: 'en',
  // 'as-needed' keeps the URL clean for the default locale.
  // English: /  Danish: /da
  localePrefix: 'as-needed',
  // Detect the visitor's language from the Accept-Language header on the
  // locale-less entry path, so e.g. a Danish-language browser lands on the
  // Danish login/site instead of English. The first explicit choice via the
  // language switcher sets the NEXT_LOCALE cookie, which then pins the
  // language (so you can still force English by picking it once — useful
  // when testing on a non-English phone).
  localeDetection: true
});

export type AppLocale = (typeof routing.locales)[number];
