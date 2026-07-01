'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';

/**
 * Thin wrapper over the browser's built-in speech synthesis
 * (`window.speechSynthesis`). On-device, free, no network — the audio never
 * leaves the phone.
 *
 * The important part is voice SELECTION, not just `utter.lang`: most browsers
 * ignore the language hint and read with the default (usually English) voice
 * unless you explicitly assign `utter.voice`. So for Danish text we actively
 * pick an installed Danish voice; only if the device has none do we fall back
 * to the default. Voice lists load asynchronously (`getVoices()` is often empty
 * on first call and fills in on the `voiceschanged` event), so we warm and cache
 * them, and re-read at speak time as a safety net.
 *
 * `supported` resolves on the client only, so server render and the first client
 * paint agree (starts false, then flips), avoiding a hydration mismatch.
 */

const LANG_BY_LOCALE: Record<string, string> = {
  da: 'da-DK',
  sv: 'sv-SE',
  nb: 'nb-NO',
  no: 'nb-NO',
  en: 'en-US'
};

function targetLang(locale: string): string {
  return LANG_BY_LOCALE[locale] ?? 'en-US';
}

/**
 * Choose the best installed voice for a BCP-47 tag. Prefers an exact
 * region match (da-DK), then the same base language in any region (da-*,
 * and no-* as an alias for nb), and within that prefers an on-device
 * ("local") voice for reliability and zero network. Returns undefined when
 * nothing matches, so the caller can let the browser use its default.
 */
function pickVoice(
  voices: SpeechSynthesisVoice[],
  lang: string
): SpeechSynthesisVoice | undefined {
  if (!voices.length) return undefined;
  // Some platforms report voice.lang with an underscore (da_DK) rather than
  // the BCP-47 hyphen (da-DK); normalise both sides before comparing.
  const norm = (l: string) => l.toLowerCase().replace('_', '-');
  const region = norm(lang);
  const base = region.split('-')[0];

  const exact = voices.filter((v) => norm(v.lang) === region);
  const sameLang = voices.filter(
    (v) => norm(v.lang).split('-')[0] === base
  );
  // Norwegian Bokmål voices are sometimes tagged no-NO rather than nb-NO.
  const norwegianAlias =
    base === 'nb'
      ? voices.filter((v) => norm(v.lang).startsWith('no'))
      : [];

  const pool = exact.length
    ? exact
    : sameLang.length
      ? sameLang
      : norwegianAlias;
  if (!pool.length) return undefined;

  return (
    pool.find((v) => v.localService && v.default) ??
    pool.find((v) => v.localService) ??
    pool.find((v) => v.default) ??
    pool[0]
  );
}

export function useSpeak() {
  const locale = useLocale();
  const [supported, setSupported] = useState(false);
  // Whether the device actually has a voice for the current locale. Starts
  // false and flips once voices resolve; consumers hide read-aloud when it's
  // false so it never reads text in the wrong-language (fallback) voice.
  const [hasVoice, setHasVoice] = useState(false);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    setSupported(true);
    const synth = window.speechSynthesis;
    const load = () => {
      const v = synth.getVoices();
      if (v.length) voicesRef.current = v;
      setHasVoice(!!pickVoice(voicesRef.current, targetLang(locale)));
    };
    load();
    synth.addEventListener('voiceschanged', load);
    return () => synth.removeEventListener('voiceschanged', load);
  }, [locale]);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        return;
      }
      const trimmed = text?.trim();
      if (!trimmed) return;
      const synth = window.speechSynthesis;
      // Stop anything already speaking so taps don't queue up.
      synth.cancel();

      const lang = targetLang(locale);
      const utter = new SpeechSynthesisUtterance(trimmed);
      utter.lang = lang;

      const voices = voicesRef.current.length
        ? voicesRef.current
        : synth.getVoices();
      const voice = pickVoice(voices, lang);
      if (voice) utter.voice = voice;

      utter.rate = 1;
      synth.speak(utter);
    },
    [locale]
  );

  const stop = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  return { speak, stop, supported, hasVoice };
}
