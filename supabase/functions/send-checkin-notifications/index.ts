// Edge Function: send-checkin-notifications
//
// Run on a daily cron. Sends each patient's weekly check-in reminder on
// the weekday THEY chose (profile.notify_weekday, 0=Sun..6=Sat). Each
// day the function:
//   (a) finds patients whose notify_weekday == today's UTC weekday,
//   (b) for those patients, finds pending prompts that are due
//       (due_date <= today) and not yet notified  -> initial push,
//   (c) and pending prompts already notified at least ~a week ago and
//       not yet reminded                            -> reminder push.
// notified_at / reminded_at on weekly_prompt prevent duplicates.
//
// Two delivery channels, each INDEPENDENTLY OPTIONAL:
//   • Web Push   (browser PWA)   — enabled when VAPID_* are set. Gone
//                                  subscriptions (410/404) are removed.
//   • Native FCM (Android/iOS)   — enabled when FCM_SERVICE_ACCOUNT is set.
//                                  Reads device_push_token; dead tokens
//                                  (FCM 404 / UNREGISTERED) are removed.
// A prompt is marked notified/reminded if it was delivered on AT LEAST one
// channel; both channels send in the same run before the mark, so there are
// no duplicate and no missed reminders.
//
// Patients who haven't chosen a day (notify_weekday IS NULL) get no push.
//
// Trigger:
//   POST /functions/v1/send-checkin-notifications
//   header: Authorization: Bearer <CRON_SECRET>
//   optional body:
//     { "dryRun": true }                 -> report the plan, send nothing
//     { "testProfileId": "<profile-id>"} -> send ONE test push to that
//                                           profile's channels now; marks
//                                           nothing. Great for verifying setup.
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET
// Web push (optional): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// Native push (optional): FCM_SERVICE_ACCOUNT  (the full service-account
//   JSON downloaded from Firebase → Project settings → Service accounts)

import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

interface Subscription {
  id: string;
  profile_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  locale: 'en' | 'da' | 'sv' | 'nb';
}

interface DeviceToken {
  id: string;
  profile_id: string;
  token: string;
  platform: 'android' | 'ios';
  locale: 'en' | 'da' | 'sv' | 'nb';
}

interface PromptRow {
  id: string;
  patient_id: string;
  week_number: number;
  due_date: string;
  notified_at: string | null;
  reminded_at: string | null;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri: string;
}

const COPY = {
  initial: {
    en: { title: 'Weekly check-in', body: 'How has this week gone? Tap to rate your goals.' },
    da: { title: 'Ugentlig status', body: 'Hvordan er ugen gået? Tryk for at vurdere dine mål.' },
    // sv / nb are a first pass — flag for native-speaker review.
    sv: { title: 'Veckovis status', body: 'Hur har veckan gått? Tryck för att skatta dina mål.' },
    nb: { title: 'Ukentlig status', body: 'Hvordan har uken gått? Trykk for å vurdere målene dine.' }
  },
  reminder: {
    en: { title: 'Check-in reminder', body: 'You have a check-in waiting. It takes about two minutes.' },
    da: { title: 'Påmindelse', body: 'Du har en status, der venter. Det tager omkring to minutter.' },
    sv: { title: 'Påminnelse', body: 'Du har en status som väntar. Det tar ungefär två minuter.' },
    nb: { title: 'Påminnelse', body: 'Du har en status som venter. Det tar omtrent to minutter.' }
  }
} as const;

const COPY_LOCALES = ['en', 'da', 'sv', 'nb'] as const;
type CopyLocale = (typeof COPY_LOCALES)[number];

// Resolve a stored locale to one we have copy for, defaulting to English. The
// `locale` column can hold any of the app's locales (sv/nb were added in 0103),
// and could in principle hold an unknown value; defaulting here means an
// unexpected locale degrades to English instead of throwing mid-send.
function copyFor(kind: 'initial' | 'reminder', locale: string) {
  const l: CopyLocale = (COPY_LOCALES as readonly string[]).includes(locale)
    ? (locale as CopyLocale)
    : 'en';
  return COPY[kind][l];
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type'
};

// ---- FCM HTTP v1 helpers (no external deps; Web Crypto only) --------------
function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function jsonToBase64Url(obj: unknown): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(obj)));
}

async function getFcmAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600
  };
  const signingInput = `${jsonToBase64Url(header)}.${jsonToBase64Url(claims)}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  );
  const jwt = `${signingInput}.${bytesToBase64Url(new Uint8Array(sig))}`;
  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });
  if (!res.ok) {
    throw new Error(`FCM token exchange failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return json.access_token as string;
}

async function sendFcmMessage(
  projectId: string,
  accessToken: string,
  deviceToken: string,
  title: string,
  body: string
): Promise<{ ok: boolean; status: number; gone: boolean; error?: string }> {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: { title, body },
          data: { url: '/' },
          android: { priority: 'high' }
        }
      })
    }
  );
  if (res.ok) return { ok: true, status: res.status, gone: false };
  const text = await res.text();
  const gone = res.status === 404 || text.includes('UNREGISTERED');
  return { ok: false, status: res.status, gone, error: text };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const cronSecret = Deno.env.get('CRON_SECRET');
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Forbidden', { status: 403, headers: CORS_HEADERS });
  }

  let dryRun = false;
  let testProfileId: string | null = null;
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      dryRun = !!body?.dryRun;
      if (typeof body?.testProfileId === 'string') testProfileId = body.testProfileId;
    } catch {
      // empty body is fine
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT');
  const fcmRaw = Deno.env.get('FCM_SERVICE_ACCOUNT');

  if (!supabaseUrl || !serviceKey) {
    return jsonError('Missing required env vars', 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  const webEnabled = !!(vapidPublic && vapidPrivate && vapidSubject);

  let serviceAccount: ServiceAccount | null = null;
  if (fcmRaw) {
    try {
      serviceAccount = JSON.parse(fcmRaw) as ServiceAccount;
    } catch (e) {
      return jsonError('FCM_SERVICE_ACCOUNT is not valid JSON', String(e));
    }
  }
  const fcmEnabled = !!serviceAccount;

  if (!webEnabled && !fcmEnabled) {
    return jsonError(
      'No delivery channel configured',
      'Set VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT for web push, and/or FCM_SERVICE_ACCOUNT for native push.'
    );
  }

  if (webEnabled) {
    webpush.setVapidDetails(vapidSubject as string, vapidPublic as string, vapidPrivate as string);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  });

  // ---- TEST MODE: one-off push to a single profile, marks nothing --------
  if (testProfileId) {
    const out = {
      test: true,
      profileId: testProfileId,
      channels: { web: webEnabled, native: fcmEnabled },
      web: [] as Array<Record<string, unknown>>,
      native: [] as Array<Record<string, unknown>>
    };
    const testTitle = 'Treatment Companion';
    const testBody = 'Test notification — push is working.';

    if (webEnabled) {
      const { data: subs } = await supabase
        .from('push_subscription')
        .select('id, endpoint, p256dh, auth, locale')
        .eq('profile_id', testProfileId);
      for (const s of (subs ?? []) as Subscription[]) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ title: testTitle, body: testBody, url: '/' }),
            { TTL: 60 }
          );
          out.web.push({ id: s.id, ok: true });
        } catch (e) {
          const err = e as { statusCode?: number; message?: string };
          out.web.push({ id: s.id, ok: false, status: err.statusCode, error: err.message ?? String(e) });
        }
      }
    }

    if (fcmEnabled && serviceAccount) {
      const { data: toks } = await supabase
        .from('device_push_token')
        .select('id, token, platform, locale')
        .eq('profile_id', testProfileId);
      const list = (toks ?? []) as Array<Pick<DeviceToken, 'id' | 'token' | 'platform' | 'locale'>>;
      if (list.length > 0) {
        try {
          const at = await getFcmAccessToken(serviceAccount);
          for (const t of list) {
            const r = await sendFcmMessage(serviceAccount.project_id, at, t.token, testTitle, testBody);
            out.native.push({ id: t.id, platform: t.platform, ok: r.ok, status: r.status, error: r.error });
          }
        } catch (e) {
          out.native.push({ ok: false, error: `access token: ${String(e)}` });
        }
      }
    }
    return ok(out);
  }

  // ---- Date boundaries (UTC) ---------------------------------------------
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const todayDow = today.getUTCDay(); // 0=Sun .. 6=Sat
  const sixDaysAgoIso = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // ---- 1) Patients who chose TODAY's weekday ------------------------------
  const { data: profs, error: profErr } = await supabase
    .from('profile')
    .select('id')
    .eq('role', 'patient')
    .eq('notify_weekday', todayDow);
  if (profErr) return jsonError('Failed to load profiles', profErr.message);

  const profileIds = (profs ?? []).map((p: { id: string }) => p.id);
  if (profileIds.length === 0) {
    return ok({ today: todayIso, todayDow, sentWeb: 0, sentNative: 0, note: 'no patients scheduled today' });
  }

  // ---- 2) Map those profiles to patient ids -------------------------------
  const { data: patients, error: patErr } = await supabase
    .from('patient')
    .select('id, profile_id')
    .in('profile_id', profileIds);
  if (patErr) return jsonError('Failed to load patients', patErr.message);

  const profileByPatient = new Map<string, string>();
  for (const p of (patients ?? []) as Array<{ id: string; profile_id: string }>) {
    profileByPatient.set(p.id, p.profile_id);
  }
  const patientIds = Array.from(profileByPatient.keys());
  if (patientIds.length === 0) {
    return ok({ today: todayIso, todayDow, sentWeb: 0, sentNative: 0, note: 'no patient rows for scheduled profiles' });
  }

  // ---- 3) Prompts in scope ------------------------------------------------
  const { data: initialPrompts, error: initErr } = await supabase
    .from('weekly_prompt')
    .select('id, patient_id, week_number, due_date, notified_at, reminded_at')
    .eq('status', 'pending')
    .is('notified_at', null)
    .lte('due_date', todayIso)
    .in('patient_id', patientIds);
  if (initErr) return jsonError('Failed to load initial prompts', initErr.message);

  const { data: reminderPrompts, error: remErr } = await supabase
    .from('weekly_prompt')
    .select('id, patient_id, week_number, due_date, notified_at, reminded_at')
    .eq('status', 'pending')
    .not('notified_at', 'is', null)
    .is('reminded_at', null)
    .lte('notified_at', sixDaysAgoIso)
    .in('patient_id', patientIds);
  if (remErr) return jsonError('Failed to load reminder prompts', remErr.message);

  const allInitial = (initialPrompts ?? []) as PromptRow[];
  const allReminder = (reminderPrompts ?? []) as PromptRow[];

  // ---- 4) Recipients for the involved profiles ----------------------------
  const promptProfileIds = new Set<string>();
  for (const p of [...allInitial, ...allReminder]) {
    const pid = profileByPatient.get(p.patient_id);
    if (pid) promptProfileIds.add(pid);
  }

  let subscriptions: Subscription[] = [];
  if (webEnabled && promptProfileIds.size > 0) {
    const { data, error: subErr } = await supabase
      .from('push_subscription')
      .select('id, profile_id, endpoint, p256dh, auth, locale')
      .in('profile_id', Array.from(promptProfileIds));
    if (subErr) return jsonError('Failed to load subscriptions', subErr.message);
    subscriptions = (data ?? []) as Subscription[];
  }
  const subsByProfile = new Map<string, Subscription[]>();
  for (const sub of subscriptions) {
    const arr = subsByProfile.get(sub.profile_id) ?? [];
    arr.push(sub);
    subsByProfile.set(sub.profile_id, arr);
  }

  let deviceTokens: DeviceToken[] = [];
  if (fcmEnabled && promptProfileIds.size > 0) {
    const { data, error: tokErr } = await supabase
      .from('device_push_token')
      .select('id, profile_id, token, platform, locale')
      .in('profile_id', Array.from(promptProfileIds));
    if (tokErr) return jsonError('Failed to load device tokens', tokErr.message);
    deviceTokens = (data ?? []) as DeviceToken[];
  }
  const tokensByProfile = new Map<string, DeviceToken[]>();
  for (const t of deviceTokens) {
    const arr = tokensByProfile.get(t.profile_id) ?? [];
    arr.push(t);
    tokensByProfile.set(t.profile_id, arr);
  }

  // ---- 5) Build the send plans -------------------------------------------
  interface WebItem { kind: 'initial' | 'reminder'; prompt: PromptRow; subscription: Subscription; }
  interface NativeItem { kind: 'initial' | 'reminder'; prompt: PromptRow; token: DeviceToken; }
  const webPlan: WebItem[] = [];
  const nativePlan: NativeItem[] = [];

  function planFor(kind: 'initial' | 'reminder', prompts: PromptRow[]) {
    for (const p of prompts) {
      const pid = profileByPatient.get(p.patient_id);
      if (!pid) continue;
      for (const s of subsByProfile.get(pid) ?? []) webPlan.push({ kind, prompt: p, subscription: s });
      for (const t of tokensByProfile.get(pid) ?? []) nativePlan.push({ kind, prompt: p, token: t });
    }
  }
  planFor('initial', allInitial);
  planFor('reminder', allReminder);

  if (dryRun) {
    return ok({
      dryRun: true,
      today: todayIso,
      todayDow,
      channels: { web: webEnabled, native: fcmEnabled },
      initialPromptsFound: allInitial.length,
      reminderPromptsFound: allReminder.length,
      webSendsPlanned: webPlan.length,
      nativeSendsPlanned: nativePlan.length
    });
  }

  // ---- 6) Send ------------------------------------------------------------
  let sentWeb = 0;
  let sentNative = 0;
  const sentInitialPromptIds = new Set<string>();
  const sentReminderPromptIds = new Set<string>();
  const goneSubscriptionIds: string[] = [];
  const goneDeviceTokenIds: string[] = [];
  const errors: Array<{ kind: 'web' | 'native'; id: string; error: string; status?: number }> = [];

  function markSent(item: { kind: 'initial' | 'reminder'; prompt: PromptRow }) {
    if (item.kind === 'initial') sentInitialPromptIds.add(item.prompt.id);
    else sentReminderPromptIds.add(item.prompt.id);
  }

  // 6a) Web push
  for (const item of webPlan) {
    const copy = copyFor(item.kind, item.subscription.locale);
    const payload = JSON.stringify({ title: copy.title, body: copy.body, url: '/' });
    try {
      await webpush.sendNotification(
        { endpoint: item.subscription.endpoint, keys: { p256dh: item.subscription.p256dh, auth: item.subscription.auth } },
        payload,
        { TTL: 24 * 60 * 60 }
      );
      sentWeb++;
      markSent(item);
    } catch (e) {
      const err = e as { statusCode?: number; message?: string };
      const status = err.statusCode;
      if (status === 410 || status === 404) goneSubscriptionIds.push(item.subscription.id);
      errors.push({ kind: 'web', id: item.subscription.id, error: err.message ?? String(e), status });
    }
  }

  // 6b) Native FCM
  let fcmTokenError: string | null = null;
  if (nativePlan.length > 0 && serviceAccount) {
    let accessToken: string | null = null;
    try {
      accessToken = await getFcmAccessToken(serviceAccount);
    } catch (e) {
      fcmTokenError = String(e);
    }
    if (accessToken) {
      for (const item of nativePlan) {
        const copy = copyFor(item.kind, item.token.locale);
        const r = await sendFcmMessage(serviceAccount.project_id, accessToken, item.token.token, copy.title, copy.body);
        if (r.ok) {
          sentNative++;
          markSent(item);
        } else {
          if (r.gone) goneDeviceTokenIds.push(item.token.id);
          errors.push({ kind: 'native', id: item.token.id, error: r.error ?? '', status: r.status });
        }
      }
    }
  }

  // ---- 7) Persist outcomes ------------------------------------------------
  if (sentInitialPromptIds.size > 0) {
    await supabase.from('weekly_prompt')
      .update({ notified_at: new Date().toISOString() })
      .in('id', Array.from(sentInitialPromptIds));
  }
  if (sentReminderPromptIds.size > 0) {
    await supabase.from('weekly_prompt')
      .update({ reminded_at: new Date().toISOString() })
      .in('id', Array.from(sentReminderPromptIds));
  }
  if (goneSubscriptionIds.length > 0) {
    await supabase.from('push_subscription').delete().in('id', goneSubscriptionIds);
  }
  if (goneDeviceTokenIds.length > 0) {
    await supabase.from('device_push_token').delete().in('id', goneDeviceTokenIds);
  }

  return ok({
    today: todayIso,
    todayDow,
    channels: { web: webEnabled, native: fcmEnabled },
    sentWeb,
    sentNative,
    promptsNotifiedInitial: sentInitialPromptIds.size,
    promptsNotifiedReminder: sentReminderPromptIds.size,
    goneSubscriptionsRemoved: goneSubscriptionIds.length,
    goneDeviceTokensRemoved: goneDeviceTokenIds.length,
    fcmTokenError,
    errors
  });
});

function ok(payload: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: true, ...payload }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}

function jsonError(label: string, detail: string) {
  return new Response(JSON.stringify({ error: label, detail }), {
    status: 500,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}
