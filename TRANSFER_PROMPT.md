# Transfer prompt — paste this into a new chat

> **What this is.** Paste the text below (everything under the line) into a
> fresh chat, and attach the latest handoff zip. It's the short kickoff that
> orients a new Claude instance in one shot. The deep reference is
> `HANDOVER.md` inside the zip — this prompt just points at it and encodes the
> rules, the working style, and where we are.
>
> **Keep this current.** At the end of *every* delivery, update the two
> volatile sections (**“Where we are”** and **“What’s likely next”**) to match
> `HANDOVER.md` §7/§8, and bump the build tag + migration number. The rest is
> stable and rarely changes.

---

You're picking up work on **Treatment Companion** with me. **First, read
`HANDOVER.md` in the attached zip — it's the single source of truth.** Then
confirm where we are and wait for my direction. Don't restate the whole
handover back to me; just tell me the current build/migration and that you're
ready.

**Who I am / the project.** I'm a physician in Denmark (non-developer). The app
is a patient-first clinical web app for adults on botulinum-toxin spasticity
treatment, with an intrathecal-baclofen parallel therapy and a face-muscle
dosing module. Patients suggest goals; clinicians approve them; patients do
weekly check-ins; the app produces descriptive summaries, EHR text and
pseudonymised CSV exports. It deliberately **does not diagnose, dose, recommend
or predict**. Direction of information is primarily **upward** (patient/therapist
→ clinic); the only sanctioned downward channel is the physician→therapist
handoff note (inter-professional). Don't build a
clinic→patient messaging channel.

**My setup (this shapes how you deliver).**
- Stack: Next.js 16.2.7 / next-intl 4.13.0 / React 19 / TypeScript / Tailwind v4 / Supabase (Postgres 16).
- Live: `https://treatment-companion.vercel.app` · GitHub:
  `github.com/Nenja/treatment-companion`.
- I'm on **Windows + Firefox** and **cannot run code locally.** I deploy by
  **uploading a zip to GitHub** (Vercel auto-builds), and I run **SQL migrations
  by hand in the Supabase SQL editor**. So everything you give me has to work
  through that pipeline.

**Non-negotiable delivery workflow** (details in `HANDOVER.md` §2):
1. **One clean repo zip per delivery**, with a **new filename** and a root
   **`BUILD.txt`** (what changed, which migration to run, what I must QA). The
   zip excludes `node_modules` and `.next`.
2. **Font-stub build before shipping:** the two `next/font/google` fonts in
   `app/[locale]/layout.tsx` can't fetch in the sandbox, so stub them, run
   `rm -rf .next && NEXT_TELEMETRY_DISABLED=1 npx next build`, confirm it
   compiles, then **restore `layout.tsx` byte-for-byte** and confirm **zero
   `BUILD-STUB` remnants**. Also run `npx tsc --noEmit` clean.
3. **New migrations:** numbered next in `supabase/migrations/`, **and** dropped
   as a **standalone `.sql` in outputs** so I can paste it into Supabase. Only
   for *new* migrations — never re-deliver old ones. For any non-trivial
   migration (RPC, constraint, RLS), **verify it on a throwaway Postgres**
   first (`HANDOVER.md` §5.12 D) and say so.
4. **i18n parity:** every user-facing string gets **en + da** keys, kept at
   full parity. Danish is your first pass, flagged as pending native review.
   Watch the known blind spot: strings hidden in ternaries / error messages.
5. **Be honest about what's unverified.** You can't see rendered screens, real
   devices, or live RLS here. Mark those **“please QA”** in `BUILD.txt` rather
   than claiming they're done. Don't over-caution about a dev build with no
   real patient data, though — I'll push back if you do.
6. **Update `HANDOVER.md`, `BUILD.txt`, and this `TRANSFER_PROMPT.md`** at the
   end of every delivery. `HANDOVER.md` is the living source of truth.

**How I work.** Short, precise directives — “go”, “confirmed”, “keep going”.
I want action without long preamble. Deliver in batches. I catch clinical /
anatomical errors, so get those right (sides, muscle names, etc.). When a
design debate runs long and I say **“move on”**, that means *keep building*,
not skip the work. Reusable audit/review prompts are welcome.

---

**Where we are** *(update each delivery)*
- **Stack current.** Next.js **16.2.7**, next-intl **4.13.0**, React 19, Supabase (Postgres 16). Migrations **0001-0111**. **Living plan: `docs/ROADMAP.md`** (done-vs-open + owners — read it first); `docs/ASSESSMENT-2026-06-15.md` is the dated snapshot.
- **Latest delivery — `admin-collapsible-nav-1` (cumulative; deploy this ONE zip and discard the intermediate ones).** Folds in the whole 2026-06-16/17 session (deploy-hardening, REDCap sync, admin restructure) plus:
  - **Login language switcher fixed** — switching back to **English** failed because `LanguageSelect` didn't set the `NEXT_LOCALE` cookie that `localeDetection: true` reads, so the unprefixed English path was redirected back to the prior locale. Now sets the cookie on switch (both variants).
  - **Admin page: floating overview menu + collapsible sections.** New `Collapsible` (native `<details>`) wraps Accounts/Create/Export/Studies/Purge (*Active access* keeps its own toggle); **Accounts + Create collapsed by default, rest open.** A **fixed floating side menu in the left gutter on `xl`+** (inline link-row is the `<xl` fallback); both open the target section and smooth-scroll. Localized the previously-hardcoded `'Back'` + three create-account field helpers; new `admin.*` keys (`back`, `navLabel`, `emailHelper`, `displayNameHelper`, `tempPasswordHelper`). Parity **1729**.
  - **REDCap sync result reporting fixed + pipeline PROVEN.** Message now reports REDCap's confirmed **records** count (not built rows) and only flags a problem on a real error; the false "0/7 of N" alarms are gone. **End-to-end confirmed:** REDCap test project shows TC-0001…TC-0007 with enrolment + repeating instruments populated.
  - **REDCap project setup (no code, for the real project later):** enable **every form except `enrolment`** as a Repeating Instrument in the REDCap project (dictionary import does NOT do this); per-environment API tokens (Preview→test project, Production→its own) mirror the Supabase env-scoping rule.
- **`0111_fix_export_guidance.sql` — RUN in staging (already run in production).** The research-export RPC read `m.guidance`, but `0009` had moved that column to the session; fixed to `s.guidance`. Method-D verified. Standalone SQL in outputs.
- **Ops lesson from this session (important).** A production outage (500s everywhere: *"Your project's URL and Key are required"*) was caused by the **Production** Supabase env vars getting un-scoped during the staging split. **Standing rule: never edit/uncheck the shared Supabase vars — only ADD Preview-scoped entries for staging, so Production keeps its value.** On Hobby, Instant Rollback only goes one step back, so **fix forward** (correct the Production vars → redeploy) rather than relying on rollback. Env changes need a **fresh build** to take effect. Deploy-on-green + a staging env are live; run migrations in **staging first, then production**.
- **Process note (important):** trust the repo/filesystem over any carried-over summary, **and verify zip contents before claiming a change ships** — this session an "already shipped" claim was wrong because intermediate zips predated the edit. The files are the source of truth.

**What's likely next** *(from `docs/ROADMAP.md`)*
- **P0 — before any real patient:** **backups + a tested restore** (Supabase Pro + `pg_dump` → a scratch project; highest data-loss risk, still the one ops item left); the external gates — regulatory + DPO sign-off (MDR determination + DPIA / privacy notice / sub-processor DPAs); and **native-language review** of the clinical strings (da first-pass, plus sv/nb), now including this session's new `admin.*` keys + `actionAdmin` + the `clinician.researchExport` keys.
- **Before REDCap pilot go-live (decided: SAME project, move to production — not a separate project).** In the test project: Project Setup → **Move project to production**, choosing to **delete all existing data** (wipes TC-0001…TC-0007). `REDCAP_API_URL`/`TOKEN` and the repeating-instrument setup are unchanged (token survives the move). **Critical caveat of the single-project choice:** the **Preview/staging** env currently points its `REDCAP_API_*` at this same project, so a staging sync would inject test patients into live study data — before go-live, repoint Preview `REDCAP_API_*` at a throwaway project, OR remove the Preview REDCap vars, OR never sync from staging. Also: production mode locks the data dictionary (later schema changes need REDCap draft+approval), so finalise the dictionary first. Set `CRON_SECRET` if enabling the weekly cron. **Analysis-readiness dry-run PASSED on the 7 test records** (`redcap_dryrun.R`, base-R) — 7 records, 0 orphan muscles, 0 undecoded codes; re-run it once real data flows.
- **P1 — hardening (`docs/ROADMAP.md`):** add a **Method-D / CI smoke-call of `export_research_dataset()`** — the SQL RPCs aren't covered by the JS tests, which is exactly the gap that let 0111's `m.guidance` bug reach production. Then: finish CSP (Report-Only → nonce-based); branch protection + PRs once the developer is on; **re-ground the Tier-2 E2E scaffolds** (the dev-scenario mechanism they used is retired — reseed via SQL + a reusable visit code); WCAG 2.2 AA + real-device pass; type-aware ESLint; 2FA/biometric (specced).
- **Design tension to revisit:** the Admin entry now lives in the *patient* Tools rail for discoverability, but tapping it navigates out of the patient session. Fine for now; reconsider if it feels off (a header control is the alternative).
- **P2 — product threads (no patient-safety gate):** therapist surface Slice 2+ (cockpit consuming `therapist_note`, per-goal cards); face module production integration; EHR-text reshape; per-goal handoff note; persistent/recurring therapist access; cross-version goal chart.

**Your first reply:** confirm you've read `HANDOVER.md`, state the current build
+ migration in a line or two, and either wait for my “go” or ask the one thing
you need to start.
