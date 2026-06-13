/**
 * Native push registration (Capacitor).
 *
 * When the web app runs inside the native (Capacitor) shell, this registers the
 * device's FCM push token with the backend via the `register_device_push_token`
 * RPC, so the check-in reminder sender can reach the phone. In a normal browser
 * it is a no-op — Web Push (lib/pwa.ts) handles browsers.
 *
 * It reaches the Capacitor PushNotifications plugin through the `window.Capacitor`
 * runtime that the native shell injects, rather than importing
 * `@capacitor/push-notifications`. That keeps the web app free of any Capacitor
 * build dependency: this file compiles and ships normally, and simply does
 * nothing unless it is inside the native app (where the shell provides the
 * plugin).
 */
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

type PermissionState =
  | 'prompt'
  | 'prompt-with-rationale'
  | 'granted'
  | 'denied';

interface PushPlugin {
  checkPermissions(): Promise<{ receive: PermissionState }>;
  requestPermissions(): Promise<{ receive: PermissionState }>;
  register(): Promise<void>;
  addListener(
    event: 'registration',
    cb: (token: { value: string }) => void
  ): Promise<unknown>;
  addListener(
    event: 'registrationError',
    cb: (err: unknown) => void
  ): Promise<unknown>;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: { PushNotifications?: PushPlugin };
}

function getCapacitor(): CapacitorGlobal | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

let wired = false;

/**
 * Idempotent. Safe to call on every auth change; it acts once, and only inside
 * the native app with the PushNotifications plugin present.
 */
export async function registerNativePushToken(
  locale: 'en' | 'da'
): Promise<void> {
  const cap = getCapacitor();
  if (!cap?.isNativePlatform?.()) return; // plain browser → nothing to do
  const push = cap.Plugins?.PushNotifications;
  if (!push) return; // native shell without the plugin yet → nothing to do
  if (wired) return;
  wired = true;

  const platform = cap.getPlatform?.() === 'ios' ? 'ios' : 'android';

  try {
    await push.addListener('registration', (token) => {
      void (async () => {
        try {
          const supabase = createSupabaseBrowserClient();
          await supabase.rpc('register_device_push_token', {
            p_token: token.value,
            p_platform: platform,
            p_locale: locale
          });
        } catch {
          // best effort — a failed token save must never disrupt the app
        }
      })();
    });
    await push.addListener('registrationError', () => {
      // nothing actionable for the user
    });

    let receive = (await push.checkPermissions()).receive;
    if (receive === 'prompt' || receive === 'prompt-with-rationale') {
      receive = (await push.requestPermissions()).receive;
    }
    if (receive === 'granted') {
      await push.register();
    }
  } catch {
    // permission/registration unavailable — ignore; web push still covers browsers
  }
}
