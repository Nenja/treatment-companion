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
// notified_at / reminded_at on weekly_prompt prevent duplicates. Gone
// subscriptions (410/404) are cleaned up.
//
// Patients who haven't chosen a day (notify_weekday IS NULL) get no
// push — the app prompts them to choose on login.
//
// Trigger:
//   POST /functions/v1/send-checkin-notifications
//   header: Authorization: Bearer <CRON_SECRET>
//   optional body: { "dryRun": true }
//
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET

import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

interface Subscription {
  id: string;
  profile_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  locale: 'en' | 'da';
}

interface PromptRow {
  id: string;
  patient_id: string;
  week_number: number;
  due_date: string;
  notified_at: string | null;
  reminded_at: string | null;
}

const COPY = {
  initial: {
    en: {
      title: 'Weekly check-in',
      body: 'How has this week gone? Tap to rate your goals.'
    },
    da: {
      title: 'Ugentlig status',
      body: 'Hvordan er ugen gået? Tryk for at vurdere dine mål.'
    }
  },
  reminder: {
    en: {
      title: 'Check-in reminder',
      body: 'You have a check-in waiting. It takes about two minutes.'
    },
    da: {
      title: 'Påmindelse',
      body: 'Du har en status, der venter. Det tager omkring to minutter.'
    }
  }
} as const;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type'
};

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
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      dryRun = !!body?.dryRun;
    } catch {
      // empty body is fine
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT');

  if (!supabaseUrl || !serviceKey || !vapidPublic || !vapidPrivate || !vapidSubject) {
    return new Response(
      JSON.stringify({
        error: 'Missing required env vars',
        required: [
          'SUPABASE_URL',
          'SUPABASE_SERVICE_ROLE_KEY',
          'VAPID_PUBLIC_KEY',
          'VAPID_PRIVATE_KEY',
          'VAPID_SUBJECT'
        ]
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  });

  // ---- Date boundaries (UTC) ---------------------------------------------
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const todayDow = today.getUTCDay(); // 0=Sun .. 6=Sat
  // Reminders only for prompts notified on/before ~the previous chosen
  // weekday. 6 days back (rather than 7) absorbs the time-of-day offset
  // of the original notified_at so the reminder reliably fires on the
  // next occurrence of the chosen weekday.
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
    return ok({ today: todayIso, todayDow, sent: 0, note: 'no patients scheduled today' });
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
    return ok({ today: todayIso, todayDow, sent: 0, note: 'no patient rows for scheduled profiles' });
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

  // ---- 4) Subscriptions for the involved profiles -------------------------
  const promptProfileIds = new Set<string>();
  for (const p of [...allInitial, ...allReminder]) {
    const pid = profileByPatient.get(p.patient_id);
    if (pid) promptProfileIds.add(pid);
  }

  let subscriptions: Subscription[] = [];
  if (promptProfileIds.size > 0) {
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

  // ---- 5) Build the send plan --------------------------------------------
  interface SendItem {
    kind: 'initial' | 'reminder';
    prompt: PromptRow;
    subscription: Subscription;
  }
  const plan: SendItem[] = [];
  function planFor(kind: 'initial' | 'reminder', prompts: PromptRow[]) {
    for (const p of prompts) {
      const pid = profileByPatient.get(p.patient_id);
      if (!pid) continue;
      for (const s of subsByProfile.get(pid) ?? []) {
        plan.push({ kind, prompt: p, subscription: s });
      }
    }
  }
  planFor('initial', allInitial);
  planFor('reminder', allReminder);

  if (dryRun) {
    return ok({
      dryRun: true,
      today: todayIso,
      todayDow,
      initialPromptsFound: allInitial.length,
      reminderPromptsFound: allReminder.length,
      totalSendsPlanned: plan.length,
      plan: plan.map((p) => ({
        kind: p.kind,
        promptId: p.prompt.id,
        weekNumber: p.prompt.week_number,
        dueDate: p.prompt.due_date,
        profileId: p.subscription.profile_id,
        locale: p.subscription.locale
      }))
    });
  }

  // ---- 6) Send ------------------------------------------------------------
  let sent = 0;
  const sentInitialPromptIds = new Set<string>();
  const sentReminderPromptIds = new Set<string>();
  const goneSubscriptionIds: string[] = [];
  const errors: Array<{ subscriptionId: string; error: string; status?: number }> = [];

  for (const item of plan) {
    const copy = COPY[item.kind][item.subscription.locale];
    const payload = JSON.stringify({ title: copy.title, body: copy.body, url: '/' });
    try {
      await webpush.sendNotification(
        {
          endpoint: item.subscription.endpoint,
          keys: { p256dh: item.subscription.p256dh, auth: item.subscription.auth }
        },
        payload,
        { TTL: 24 * 60 * 60 }
      );
      sent++;
      if (item.kind === 'initial') sentInitialPromptIds.add(item.prompt.id);
      else sentReminderPromptIds.add(item.prompt.id);
    } catch (e) {
      const err = e as { statusCode?: number; message?: string };
      const status = err.statusCode;
      const message = err.message ?? String(e);
      if (status === 410 || status === 404) goneSubscriptionIds.push(item.subscription.id);
      errors.push({ subscriptionId: item.subscription.id, error: message, status });
    }
  }

  if (sentInitialPromptIds.size > 0) {
    await supabase
      .from('weekly_prompt')
      .update({ notified_at: new Date().toISOString() })
      .in('id', Array.from(sentInitialPromptIds));
  }
  if (sentReminderPromptIds.size > 0) {
    await supabase
      .from('weekly_prompt')
      .update({ reminded_at: new Date().toISOString() })
      .in('id', Array.from(sentReminderPromptIds));
  }
  if (goneSubscriptionIds.length > 0) {
    await supabase.from('push_subscription').delete().in('id', goneSubscriptionIds);
  }

  return ok({
    today: todayIso,
    todayDow,
    sent,
    promptsNotifiedInitial: sentInitialPromptIds.size,
    promptsNotifiedReminder: sentReminderPromptIds.size,
    goneSubscriptionsRemoved: goneSubscriptionIds.length,
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
