/**
 * "Redo the tutorial" signal.
 *
 * The onboarding wizard normally shows once, gated by
 * profile.has_seen_intro. When the user taps "Show tutorial again" in
 * the account menu, we don't want to flip that persistent flag back to
 * false on the server (it would re-show on every device, and we'd have
 * to set it true again on finish). Instead this is a transient,
 * session-scoped flag: set it, navigate to the role's landing screen,
 * and the wizard shows because the flag is set — regardless of
 * has_seen_intro. Finishing or skipping clears it.
 *
 * Mirrored to sessionStorage so it survives the navigation from
 * wherever the menu was opened to the landing screen (a route change).
 * In-memory alone isn't enough because the destination may be a fresh
 * document depending on how navigation resolves.
 */

const KEY = 'tc:show-tutorial-again';

let inMemory = false;

export function requestTutorialReplay(): void {
  inMemory = true;
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    // sessionStorage unavailable (private mode / SSR) — the in-memory
    // flag still covers a same-document re-render.
  }
}

export function isTutorialReplayRequested(): boolean {
  if (inMemory) return true;
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function clearTutorialReplay(): void {
  inMemory = false;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
