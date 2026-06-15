# Turning on Sentry — setup runbook

The app is already wired for Sentry (error capture on browser, server, and edge,
with strict PII scrubbing). Nothing is sent until you give it a DSN. These are
the dashboard steps to switch it on — all in sentry.io and Vercel, no code.

> One code step ships with this: a file rename. The browser init moved from
> `sentry.client.config.ts` to `instrumentation-client.ts` (Next.js loads the
> latter natively, so browser errors are actually captured). When you drop this
> batch, **add `instrumentation-client.ts` and DELETE `sentry.client.config.ts`.**

---

## 1. Create an EU Sentry project

Patient health data must stay in the EU, so the Sentry **organization** must be
in the **Europe** data region (its DSN ends in `ingest.de.sentry.io`, which the
app's CSP already allows).

1. In sentry.io, use (or create) an organization whose **Data Region = Europe**.
   The region is fixed per organization and can't be changed later — if your org
   is on the US region, create a new EU org.
2. Create a project: platform **Next.js**. Name it (e.g. `treatment-companion`).
3. Project **Settings → Client Keys (DSN)** → copy the **DSN**
   (looks like `https://<key>@o<org>.ingest.de.sentry.io/<project>`).

## 2. Set the env vars in Vercel

Vercel → your project → **Settings → Environment Variables**. Add for
**Production** (and Preview if you want preview errors too):

| Name | Value | Required |
|------|-------|----------|
| `NEXT_PUBLIC_SENTRY_DSN` | the DSN from step 1 | **yes** |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | `production` | recommended |

- `NEXT_PUBLIC_` matters: the browser bundle can only read vars with that prefix,
  and Sentry needs to init in the browser too.
- The **release** (which deploy an error came from) resolves automatically from
  Vercel's git SHA on the server. For the browser tag too, optionally turn on
  Vercel's *Automatically expose System Environment Variables*, or set
  `NEXT_PUBLIC_SENTRY_RELEASE` to the commit SHA. Optional — leaving it empty is
  harmless.

## 3. Redeploy

Env vars only take effect on a new deployment. Trigger a redeploy (push a commit,
or Vercel → Deployments → Redeploy).

## 4. Confirm it's connected

The Sentry project's **Issues** tab will show errors as they happen. To prove the
pipe works once, trigger a deliberate error: temporarily add
`throw new Error('sentry connectivity test')` to any page, deploy, load that page,
confirm the issue appears in Sentry, then remove it. (Or just wait for the next
real error.)

---

## 5. Alert rules (so you actually get told)

Sentry → **Alerts → Create Alert → Issues**. Create these and set the action to
**email** your address (you can add Slack/Teams later):

1. **New issue** — *"When a new issue is created."* This is the important one:
   you hear the first time any new error type appears. Environment: `production`.
2. **Regression** — *"When an issue changes state from resolved to unresolved."*
   Tells you something you'd fixed has broken again.
3. **Spike / widespread** — *"When an issue is seen more than 10 times in one
   hour."* Catches an error hitting many users at once. Tune the number to taste.

Keep them scoped to the `production` environment so preview-deploy noise doesn't
page you. Sentry also emails the org owner on its own digest by default.

---

## Privacy / regulatory notes

- **Sentry is a third-party data processor.** Add it to the data-processing
  inventory / DPIA, and use the EU region (above) so events stay in the EU.
- The app is configured to **not** send PII: `sendDefaultPii: false`, plus a
  `beforeSend` that strips request bodies, cookies, headers, query strings, user
  identifiers, and breadcrumb URLs (see `lib/sentry.shared.ts`).
- **One thing the scrubber cannot catch:** the text of an exception itself. If
  code ever does `throw new Error('... ' + patientName)`, that message would be
  sent. Keep patient data out of error messages — note this for code review.
- No performance tracing, profiling, or session replay is enabled (errors only),
  which keeps the data surface minimal.

## Optional later enhancements (not set up here)

- **Readable browser stack traces (source maps):** wrap `next.config.ts` in
  `withSentryConfig` and add a `SENTRY_AUTH_TOKEN` secret so Sentry can upload
  source maps at build time. Without this, browser stack traces are minified.
  (Server-side traces are already readable.) This is the main worthwhile upgrade
  once the basics are confirmed working.
- **Navigation tracing:** if you ever set `tracesSampleRate > 0`, also add
  `export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;`
  to `instrumentation-client.ts`.
