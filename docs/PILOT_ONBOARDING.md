# Pilot onboarding playbook — Treatment Companion

*Grounded in the current build's actual flows (routes, visit-code pairing, role
rules). Items marked **[decide]** or **[confirm]** are choices or checks for you
before go-live.*

---

## 1. What this pilot is — and isn't

**Purpose.** Test whether the tool *works in real clinical practice* for adults
receiving botulinum toxin for muscle overactivity (spasticity / dystonia):
- Is it **usable** for each role (patient, clinician, therapist)?
- Is it **acceptable** and does it fit the clinic workflow without adding burden?
- Is the **patient-reported data** complete and good enough to be useful?
- Does the **shared overview** actually improve communication across the care team?
- Is it **technically robust** (login, reminders, video, export) in real use?

**What it is NOT.** It is not a test of whether the *treatment* works (not an
efficacy trial), and the app does not diagnose, dose, recommend, score, or
predict. It is a goal-setting, patient-reported-outcome, and communication tool.
Keep this framing in the consent text and any protocol — it keeps scope,
consent, and regulatory posture honest.

---

## 2. Before anyone is onboarded — readiness checklist

These are the things that gate a *lawful, working* patient pilot. Most are not
screens — they're approvals, accounts, and housekeeping.

**Approvals & legal**
- [ ] Ethics / research approval (or a documented determination that it isn't needed) **[confirm]**
- [ ] Informed-consent process and form ready; privacy notice live (`/privacy`)
- [ ] DPIA finalised + DPO sign-off; data-processing agreements with sub-processors (Supabase EU; email/SMS provider; Apple/Google if push)

**Technical readiness**
- [ ] Danish UI text reviewed by a native clinician (currently first-pass) **[confirm]**
- [ ] Email sending configured (custom SMTP / Resend on a verified domain) — account, password-reset, and reminder emails must actually arrive
- [ ] Reminder channel decided — **SMS recommended** as the reliable backbone (email drowns, iOS push is unreliable unless native) **[decide]**
- [ ] First **admin clinician** account seeded
- [ ] Security housekeeping: run migrations 0112 + 0113; enable leaked-password protection; drop the stray `whoami`
- [ ] **Remove the TEST01–TEST06 reusable visit codes and any demo/seed test patients** before real data
- [ ] Backups: confirm daily DB backup + a **separate** backup plan for the `goal-videos` storage bucket
- [ ] Decide install method: PWA "Add to Home Screen" (works now) vs browser-only **[decide]**

---

## 3. The three roles at a glance

| Role | Gets an account by | Connects to a patient by | Does |
|---|---|---|---|
| **Clinician / admin** | Created by an admin (never self-signup) | Enters the patient's **visit code** → 1-hour session | Sets up treatment & goals, approves suggested goals, reviews check-ins, generates summary / EHR text / export |
| **Patient (+ caregiver)** | Self-signup *or* admin-created | Generates a **visit code** for staff to enter | Suggests goals, weekly check-ins, records goal videos, views own progress |
| **Therapist (physio)** | Self-signup *or* admin-created | Enters the patient's **visit code** → 1-hour session | Reviews that patient's progress; contributes observations / suggestions |

> **Caregivers have no separate login.** A caregiver helps the patient on the
> patient's own device; entries can be attributed "self" vs "caregiver."

---

## 4. Clinician / admin onboarding

**Accounts.** Clinicians are created **only by an admin** (self-signup cannot
create a clinician — the database enforces this). You seed the first admin; that
admin creates the rest.

**First-run steps**
1. Admin opens **`/clinician/admin`** → creates each clinician with name, email,
   and a temporary password (mark as admin if they should also manage accounts).
2. The new clinician signs in at **`/login`** → is **forced to set a new password**
   on first login.
3. Set language (English / Dansk) via the switcher.

**What a clinician does in a visit**
- Ask the patient to open their **visit code** and read it out; enter it to open a
  **1-hour session** with that patient.
- Set up / review the patient's treatment and goals; configure rating anchors.
- Approve or adjust **patient-suggested goals** (`/clinician/suggestion`).
- Review check-ins and observations; generate the **descriptive summary / EHR
  text** and the **pseudonymised export** for REDCap.

---

## 5. Patient onboarding

**Getting an account [decide which for the pilot]**
- **In-clinic, staff-assisted:** at the first visit, staff help the patient
  self-register at **`/signup`** (role: patient, email + password), *or*
- **Admin-created:** a clinician creates the patient account ahead of time with a
  temporary password (patient resets it on first login).

**First-run steps (do these with the patient at the visit)**
1. Sign in; set language.
2. **Add to Home Screen** (iPhone: Safari → Share → Add to Home Screen) so the app
   is one tap away and notifications can work.
3. Allow notifications if using push; confirm a phone number if using SMS reminders.
4. Read the privacy notice / complete consent.

**The pairing moment.** Patient opens **`/visit-code`**; the app shows a short
code (no live countdown, by design, to avoid pressure). The patient reads it to
the clinician or therapist, who enters it to open their session. A fresh code is
generated each visit — so the patient initiates every connection.

**Between visits, the patient**
- Suggests goals that matter to them (`/suggest-goal`).
- Completes the **weekly check-in** (`/checkin`).
- Records short **goal videos** when relevant.
- Views their own goals and progress (`/goals`).

---

## 6. Therapist (community physiotherapist) onboarding

**Getting an account.** Self-registration at **`/signup`** (role: therapist +
profession), or admin-created — same as patients.

**Accessing a patient.** The therapist uses the **same visit-code mechanism** as
the clinician: the patient generates a code at their session, the therapist enters
it, and gets a **1-hour session** with that patient. Access is therefore
**session-based and patient-initiated** — the patient must be present and produce
the code each time. (Persistent, recurring therapist access is a possible future
option; it is **not** part of the pilot.)

**What the therapist does.** Review that patient's progress (`/physio/progress`)
and contribute observations / goal & muscle suggestions.
> **[confirm]** Which therapist reporting features are enabled in the current
> build — some were planned as later "slices." Verify before relying on them.

---

## 7. The day-of clinic flow (everything together)

1. **Setup (first visit):** staff help the patient sign in and install the app;
   patient generates a visit code; clinician enters it, sets up goals & treatment.
2. **At home:** patient does weekly check-ins and records videos; gets reminders
   (SMS backbone + push where available).
3. **Between visits:** the community physio enters a fresh patient-generated code
   to review progress and add observations.
4. **Next injection visit:** clinician opens a session, reviews the summary, and
   produces the EHR text / export.

---

## 8. Support & fallback

- **[decide]** Who patients contact for help (a clinic email/phone), and put it on
  the patient handout.
- If a reminder is missed (e.g. iOS push dropped), the **SMS backstop** ensures the
  check-in still gets prompted.
- If login/email fails: the password-reset flow (`/forgot-password`) — but this
  depends on email sending being configured (see §2).

---

*Next: this playbook can be split into three short, plain-language handouts — one
per role — in English and Danish, ready to print or send.*
