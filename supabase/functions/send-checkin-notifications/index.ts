// Edge Function: send-checkin-notifications
//
// Run on a daily cron. Finds patients whose weekly check-in is either
// (a) due today and not yet notified, or
// (b) due 2 days ago, still pending, and not yet reminded.
//
// Sends a Web Push notification to every subscription registered for
// that patient. Marks notified_at / reminded_at to prevent duplicates.
// Cleans up subscriptions that the push service reports as gone (410)
// or not found (404).
//
// Trigger:
//   POST /functions/v1/send-checkin-notifications
//   with header: Authorization: Bearer <CRON_SECRET>
//   optional body: { "dryRun": true } — returns intended sends without sending
//
// Required env vars:
//   SUPABASE_URL                 (auto-set by Supabase)
//   SUPABASE_SERVICE_ROLE_KEY    (auto-set by Supabase)
//   VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY
//   VAPID_SUBJECT                (e.g. mailto:you@example.com)
//   CRON_SECRET                  (random string; cron passes it as Authorization)

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
  patient: { profile_id: string };
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
  // ---- CORS preflight -----------------------------------------------------
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  // ---- Auth gate ----------------------------------------------------------
  const cronSecret = Deno.env.get('CRON_SECRET');
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Forbidden', {
      status: 403,
      headers: CORS_HEADERS
    });
  }

  // Parse optional dryRun flag.
  let dryRun = false;
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      dryRun = !!body?.dryRun;
    } catch {
      // empty body is fine
    }
  }

  // ---- Env ----------------------------------------------------------------
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
      {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      }
    );
  }

  // Configure web-push with the VAPID identity.
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  });

  // ---- Compute date boundaries (UTC) -------------------------------------
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // ---- Find prompts in scope ---------------------------------------------

  const { data: initialPrompts, error: initErr } = await supabase
    .from('weekly_prompt')
    .select(
      'id, patient_id, week_number, due_date, notified_at, reminded_at, patient:patient_id ( profile_id )'
    )
    .eq('status', 'pending')
    .is('notified_at', null)
    .eq('due_date', todayIso);

  if (initErr) {
    return jsonError('Failed to load initial prompts', initErr.message);
  }

  const { data: reminderPrompts, error: remErr } = await supabase
    .from('weekly_prompt')
    .select(
      'id, patient_id, week_number, due_date, notified_at, reminded_at, patient:patient_id ( profile_id )'
    )
    .eq('status', 'pending')
    .not('notified_at', 'is', null)
    .is('reminded_at', null)
    .eq('due_date', twoDaysAgo);

  if (remErr) {
    return jsonError('Failed to load reminder prompts', remErr.message);
  }

  const allInitial = (initialPrompts ?? []) as unknown as PromptRow[];
  const allReminder = (reminderPrompts ?? []) as unknown as PromptRow[];

  // ---- Look up subscriptions per patient ----------------------------------

  const profileIds = new Set<string>();
  for (const p of allInitial) profileIds.add(p.patient.profile_id);
  for (const p of allReminder) profileIds.add(p.patient.profile_id);

  let subscriptions: Subscription[] = [];
  if (profileIds.size > 0) {
    const { data, error: subErr } = await supabase
      .from('push_subscription')
      .select('id, profile_id, endpoint, p256dh, auth, locale')
      .in('profile_id', Array.from(profileIds));
    if (subErr) {
      return jsonError('Failed to load subscriptions', subErr.message);
    }
    subscriptions = (data ?? []) as Subscription[];
  }

  const subsByProfile = new Map<string, Subscription[]>();
  for (const sub of subscriptions) {
    const arr = subsByProfile.get(sub.profile_id) ?? [];
    arr.push(sub);
    subsByProfile.set(sub.profile_id, arr);
  }

  // ---- Build the send plan ------------------------------------------------

  interface SendItem {
    kind: 'initial' | 'reminder';
    prompt: PromptRow;
    subscription: Subscription;
  }

  const plan: SendItem[] = [];

  function planFor(kind: 'initial' | 'reminder', prompts: PromptRow[]) {
    for (const p of prompts) {
      const subs = subsByProfile.get(p.patient.profile_id) ?? [];
      for (const s of subs) {
        plan.push({ kind, prompt: p, subscription: s });
      }
    }
  }
  planFor('initial', allInitial);
  planFor('reminder', allReminder);

  // ---- Dry-run short-circuit ---------------------------------------------

  if (dryRun) {
    return new Response(
      JSON.stringify({
        dryRun: true,
        today: todayIso,
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
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  // ---- Send pushes --------------------------------------------------------

  let sent = 0;
  const sentInitialPromptIds = new Set<string>();
  const sentReminderPromptIds = new Set<string>();
  const goneSubscriptionIds: string[] = [];
  const errors: Array<{ subscriptionId: string; error: string; status?: number }> = [];

  for (const item of plan) {
    const copy = COPY[item.kind][item.subscription.locale];
    const payload = JSON.stringify({
      title: copy.title,
      body: copy.body,
      url: '/'
    });

    try {
      await webpush.sendNotification(
        {
          endpoint: item.subscription.endpoint,
          keys: {
            p256dh: item.subscription.p256dh,
            auth: item.subscription.auth
          }
        },
        payload,
        { TTL: 24 * 60 * 60 }
      );
      sent++;
      if (item.kind === 'initial') {
        sentInitialPromptIds.add(item.prompt.id);
      } else {
        sentReminderPromptIds.add(item.prompt.id);
      }
    } catch (e) {
      const err = e as { statusCode?: number; message?: string };
      const status = err.statusCode;
      const message = err.message ?? String(e);
      if (status === 410 || status === 404) {
        goneSubscriptionIds.push(item.subscription.id);
      }
      errors.push({ subscriptionId: item.subscription.id, error: message, status });
    }
  }

  // ---- Mark prompts as notified/reminded -----------------------------------

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

  // ---- Clean up gone subscriptions ----------------------------------------
  if (goneSubscriptionIds.length > 0) {
    await supabase
      .from('push_subscription')
      .delete()
      .in('id', goneSubscriptionIds);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      today: todayIso,
      sent,
      promptsNotifiedInitial: sentInitialPromptIds.size,
      promptsNotifiedReminder: sentReminderPromptIds.size,
      goneSubscriptionsRemoved: goneSubscriptionIds.length,
      errors
    }),
    { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
  );
});

function jsonError(label: string, detail: string) {
  return new Response(JSON.stringify({ error: label, detail }), {
    status: 500,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}
