'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale } from 'next-intl';

/**
 * Thin wrapper over the browser's built-in speech synthesis
 * (`window.speechSynthesis`). On-device, free, no network — the audio
 * never leaves the phone. Language follows the app locale (da-DK / en),
 * using whatever matching voice the device has installed.
 *
 * `supported` is resolved on the client only, so server render and the
 * first client paint agree (it starts false, then flips if available),
 * avoiding a hydration mismatch.
 */
export function useSpeak() {
  const locale = useLocale();
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(
      typeof window !== 'undefined' && 'speechSynthesis' in window
    );
  }, []);

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
      const utter = new SpeechSynthesisUtterance(trimmed);
      utter.lang = locale === 'da' ? 'da-DK' : 'en-US';
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

  return { speak, stop, supported };
}
