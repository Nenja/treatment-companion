import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

// Mirrors next-intl's AbstractIntlMessages: a tree of translation strings.
type Messages = { [id: string]: Messages | string };

/**
 * Deep-merge a locale's messages over the English baseline so any key a
 * locale hasn't translated yet — or a new English key added later — falls
 * back to English instead of throwing a missing-message error (which would
 * break the page during static generation or at runtime). English itself
 * short-circuits, since it IS the baseline.
 */
function deepMerge(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(override)) {
    const bv = out[k];
    if (typeof v === 'object' && typeof bv === 'object') {
      out[k] = deepMerge(bv, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale =
    requested && (routing.locales as readonly string[]).includes(requested)
      ? requested
      : routing.defaultLocale;

  const en = (await import('../messages/en.json')).default as Messages;
  const messages =
    locale === 'en'
      ? en
      : deepMerge(
          en,
          (await import(`../messages/${locale}.json`)).default as Messages
        );

  return { locale, messages };
});
