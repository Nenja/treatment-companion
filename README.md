# Treatment Companion

A patient-first treatment companion for adults receiving botulinum toxin
treatment for spasticity. Mobile-first, accessibility-first, regulatory-safe.

This repository holds the **slice 1 prototype** — the shell, data model,
and patient home screen with read-only fake data. No backend, no auth, no
exports yet.

## Stack

- Next.js 15 (App Router) · TypeScript · React 19
- Tailwind CSS 4 (CSS-first config in `app/globals.css`)
- `next-intl` for i18n (English + Danish from day one)
- Fonts: **Newsreader** (display) + **Atkinson Hyperlegible** (UI/body —
  designed specifically for low-vision accessibility)

## Run it

```bash
npm install
npm run dev
# open http://localhost:3000
```

Type-check at any time:

```bash
npm run typecheck
```

## What's in slice 1

- **Patient home screen.** Greeting, cycle/week context, weekly check-in
  prompt (or next-due card), approved goal cards with collapsible GAS
  anchors, pending suggestions summary, "suggest a new goal" CTA, and the
  static safety notice.
- **Data model.** Every entity from the brief is typed in `lib/types.ts`,
  even the ones we haven't built UI for yet, so the shape is stable as we
  build the rest.
- **In-memory store with localStorage persistence** (`lib/store.ts`).
  Uses `useSyncExternalStore` so it's hydration-safe.
- **Three fake patients** seeded with deliberately different shapes (see
  `lib/fakeData.ts`):
  - **Anna** — mid-cycle, 2 active goals, 4 completed check-ins, week 5
    pending. The "full" patient view.
  - **Lars** — fresh, 2 suggestions awaiting review, no approved goals.
    Demonstrates the empty-goals state and populates the clinician review
    queue (used in slice 4).
  - **Mette** — further along, 3 active goals, 6 completed check-ins
    including a reported fall in week 3. Reserved for the clinician
    summary in slice 5.
- **Dev panel** (bottom-right cog button, dev mode only):
  - Switch role (Patient / Clinician)
  - Switch active patient
  - Simulate next week (advances virtual clock + creates new prompts)
  - View audit log
  - Reset fake data
- **i18n scaffolded** with English + Danish. Visit `/` for English, `/da`
  for Danish. Both message files are in `messages/`.

## Important: Danish translations

`messages/da.json` is **placeholder quality**. The `_meta.status` field
flags this. Before any user testing or patient-facing demo in Danish, a
native Danish reviewer (ideally with clinical familiarity) must review and
correct every string. The structure and keys will not change — only the
values.

## Regulatory boundary

All user-facing strings live in `messages/{locale}.json` so the wording
that defines our regulatory boundary is auditable from a single place.
The brief's static safety notice lives under `safety.body` and must not be
paraphrased.

No screen in this prototype:

- diagnoses
- recommends treatment
- calculates dose
- suggests muscles
- predicts response
- classifies success or failure
- provides decision support

The data model intentionally has no fields for any of those, either.

## What's coming next

| Slice | Scope                                                         |
| ----- | ------------------------------------------------------------- |
| 1     | **Done.** Shell, data model, patient home.                    |
| 2     | **Done.** Suggest-goal flow (5-step wizard with auto-save).   |
| 3     | **Done.** Weekly check-in flow.                               |
| 4     | **Done.** Clinician unlock + suggestion review + approval form. |
| 5     | **Done.** Patient comments + treatment record entry.          |

After slice 5, we'll have a complete clickable prototype of the
seven-screen flow specified in the brief.

## File map

```
app/
  [locale]/
    layout.tsx        ← fonts, i18n provider, html lang
    page.tsx          ← Patient home (slice 1's screen)
  globals.css         ← Tailwind v4 + design tokens
components/
  cards/              GoalCard, CheckinPromptCard, Card primitive
  dev/                DevPanel (role/patient switcher etc.)
  layout/             AppShell, TopBar, SafetyNotice
i18n/
  routing.ts          locales + routing config
  request.ts          server-side message loader
lib/
  types.ts            every entity from the brief
  dates.ts            ISO date helpers + week calc
  fakeData.ts         three-patient seed
  store.ts            in-memory + localStorage + audit log
messages/
  en.json             English copy
  da.json             Danish copy (PLACEHOLDER — needs native review)
middleware.ts         next-intl locale routing
```
