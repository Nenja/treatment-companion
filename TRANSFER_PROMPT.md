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
handoff note (inter-professional, never patient-visible). Don't build a
clinic→patient messaging channel.

**My setup (this shapes how you deliver).**
- Stack: Next.js 15.1.9 / React 19 / TypeScript / Tailwind v4 / Supabase.
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
- **Latest build:** `audit-fixes` — **no migration**. DB stays at **0088** (0066
  is dev-only).
- **Just shipped:** remediation of the four audit docs in `docs/audits/`
  (all-roles-workflow, i18n-parity, clinician-cockpit-accessibility,
  data-output-correctness). Code/copy only, no schema change: fixed the EHR
  export's false "clear wearing-off" + sustained-streak + NRS-direction note +
  units reconciliation; keyed every i18n leak found (suggestion actions, the EHR
  export modal, the goal-chart legend/captions/aria) en+da; added a cockpit
  `<h1>`, a hidden chart data-table, and modal body-scroll-lock; and made the
  start-cycle button state it activates the patient/therapist. tsc clean, build
  60/60, catalog parity re-checked (0 ICU mismatches).
- **Epics complete:** goal-versioning; therapist-signals; physician->therapist
  handoff note (0088). The audit/remediation pass sits on top.

**What's likely next** *(update each delivery - see `HANDOVER.md` §8)*
- **Adjustment-request status loop** - the one audit fix NOT yet built: give the
  therapist's "needs adjusting" flag a status so the physician's response echoes
  back (needs a status column -> a small new migration + cross-role UI).
- **REDCap dictionary reconciliation (my decision)** - the dictionary defines
  check-in fields the app doesn't collect, exports goal free-text unflagged,
  models guidance per-muscle vs per-session, and exports exact dates +
  birth_year. Settle with the study team / DPO before any push is built (the
  push itself isn't built - the dictionary is a spec).
- **EHR-text language (my decision)** - the EHR paste is English-only; decide if
  it should follow locale.
- **Open policy calls (need my decision first):** persistent/recurring therapist
  access (touches the consent model); between-cycle observations.
- **Bigger infra (more the incoming developer's domain):** wearable vendor
  adapters; the treatment-modality WP4 backbone. Leave unless I ask.

**Your first reply:** confirm you've read `HANDOVER.md`, state the current build
+ migration in a line or two, and either wait for my “go” or ask the one thing
you need to start.
