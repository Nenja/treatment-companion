# Data Protection Impact Assessment (DPIA) — Treatment Companion

> **STATUS: DRAFT for completion by the DPO / data-protection adviser.**
> This document is **not legal advice.** It is a structured starting point,
> written to be accurate to how the application actually works, so that the
> data controller and DPO can complete the assessment, confirm the legal
> analysis, assess the risks, and sign off. Everything only the controller can
> supply is marked `[to confirm]`.
>
> Prepared as part of the engineering hand-off. Pairs with the patient-facing
> notice `docs/PRIVACY_NOTICE_DRAFT.md`.

| Field | Value |
| --- | --- |
| Processing activity | Treatment Companion — patient-reported outcomes & treatment record for spasticity care |
| Data controller | [legal entity, address] |
| DPO / contact | [name, email] |
| Document owner | [name] |
| Version / date | 0.1 (draft) / [date] |
| Supervisory authority | Datatilsynet (Denmark) |

---

## 1. Purpose of this DPIA
To assess the data-protection risks of Treatment Companion before non-pilot
use, as required by GDPR Article 35, and to record the technical and
organisational measures that reduce those risks to data subjects.

## 2. Is a DPIA required?
A DPIA is very likely **required**. The processing involves, on a reasoned
view: **special-category health data** (Art. 9); **vulnerable data subjects**
(patients, including people with stroke, MS, cerebral palsy, anoxic brain
injury and similar conditions); **systematic and regular collection** of
patient-reported outcomes between visits; and potentially **wearable / movement
video data**. Several of these match the EDPB criteria and the Datatilsynet
list of processing requiring a DPIA. **[DPO to confirm and record the specific
triggering criteria.]**

## 3. Overview of the processing
Treatment Companion is a clinical web/mobile application that supports adults
receiving botulinum-toxin or intrathecal-baclofen (ITB) treatment for
spasticity. Patients propose and rate treatment goals, complete weekly
check-ins, and view their progress; clinicians configure goals and record
treatments; community physiotherapists, where involved, add assessments and
notes. The app produces descriptive summaries and clinician-facing exports.

**Deliberate scope limits (data-minimisation by design):** the app does **not**
diagnose, recommend doses, or make predictions. It records what patients and
clinicians enter and presents it back; it does not infer new clinical
conclusions.

## 4. Description of the processing operations

### 4.1 Nature, scope, context and purposes
- **Purposes:** (a) supporting the patient's clinical care between visits;
  (b) optionally, **pseudonymised** data for approved scientific research.
- **Scope:** [number of patients / sites — to confirm]; pilot → wider use.
- **Context:** health-care setting in Denmark; research group [name — to
  confirm]; multilingual (English / Danish / Swedish / Norwegian).

### 4.2 Categories of personal data
| Category | Examples (from the data model) | Special category? |
| --- | --- | --- |
| Identity / account | name, email, role, year of birth, sex, app preferences (`profile`, `patient`) | Sex may be sensitive in context |
| Clinical — condition | etiology/cause (e.g. stroke, MS, anoxic), affected side, ambulation, devices, medications (`patient`) | **Yes (Art. 9 health)** |
| Clinical — goals & outcomes | treatment goals & GAS anchors, NRS/GAS self-ratings, free-text check-in comments, who submitted (self/caregiver) (`approved_goal`, `weekly_checkin`, `weekly_goal_rating`) | **Yes (health)** |
| Clinical — treatment record | modality, drug/product, dose, dilution, guidance, injected muscles and injection sites incl. face-map coordinates, ITB pump and dose changes (`treatment_cycle`, `treatment_session`, `muscle_injection`, `itb_therapy`, `itb_dose_change`) | **Yes (health)** |
| Professional assessments & notes | physiotherapist assessments/ratings/suggestions; physician→therapist hand-off notes; goal hand-off notes; therapist notes (`physio_*`, `treatment_handoff`, `goal_handoff_note`, `therapist_note`) | **Yes (health)** |
| Movement video | short clips of the patient's movement, with separate consent (`*goal_video*`, video-consent flags) | **Yes — likely health/biometric; treat as high-sensitivity** |
| Wearable observations | activity/sensor readings (`observation`) | **Yes (health)** |
| Access / security | visit codes and unlock attempts, sessions, audit events (`visit_code`, `visit_code_unlock_attempt`, `*_session`, `audit_event`) | No (but security-relevant) |
| Push / device | web-push subscriptions and native device tokens, with locale (`push_subscription`, `device_push_token`) | No |
| Research pseudonym | study code (e.g. `TC-0001`) mapping to identity, held by the clinic (`study_code`) | Pseudonymous key |

### 4.3 Data subjects
Patients (primary); clinicians; community physiotherapists; caregivers (named
only as the submitter of a check-in).

### 4.4 Recipients, processors and sub-processors
| Party | Role | Data seen | Location / transfer |
| --- | --- | --- | --- |
| Care team (physician, physiotherapist) | Recipients (clinical) | The patient's goals, check-ins, treatments, notes | Within the clinic |
| Supabase | Processor — database, file/video storage, authentication | All stored data | EU region **[confirm region + DPA]** |
| Vercel | Processor — application hosting / serverless | Data in transit during requests | **[confirm region + DPA]** |
| Sentry | Processor — error monitoring | Technical error data; **confirm scrubbing so no health data is captured** | **[confirm location + transfer mechanism (e.g. SCCs / DPF)]** |
| Google Firebase Cloud Messaging (FCM) | Processor — native push delivery | Device token + **generic** notification text (no health detail) | Google (likely outside EEA) — **[confirm SCCs / DPF]** |
| Browser push services (web push, VAPID) | Delivery of encrypted web-push payloads | Encrypted payload + endpoint | Vendor push services — **[confirm]** |
| REDCap instance | Recipient — research dataset (**pseudonymised**) | Study-code-labelled clinical data, no name | **[confirm hosting + agreement]** |

> Notification copy is intentionally generic ("Weekly check-in" / "Check-in
> reminder") with **no health details**, limiting what the push providers see.

### 4.5 Data flows (summary)
1. Patient enters goals, ratings and comments → stored in the database.
2. Clinician records treatments; physiotherapist (if involved) adds
   assessments/notes.
3. Professional access to a patient's record is gated by a patient-supplied
   **visit code**; access is row-level restricted per patient.
4. Downward professional notes (physician→therapist, goal hand-off, therapist
   notes) are **never visible to the patient** (no patient read access at the
   database level).
5. Reminder notifications are sent (only if enabled) with generic text.
6. For consented patients, a **pseudonymised** dataset (study code, no name) is
   exported for research.

### 4.6 Retention
[To confirm.] Clinical data retained per Danish medical-record requirements
(e.g. the record-keeping rules — confirm applicable period); research data per
the study protocol/consent; push tokens removed on unsubscribe; consider
routines for deleting/anonymising data of patients who leave.

### 4.7 International transfers
[To confirm.] Primary storage is in the EU. Transfers may arise via Sentry and
Google FCM (and browser push vendors). Record the transfer mechanism (adequacy,
SCCs, or EU–US Data Privacy Framework) for each.

## 5. Lawful basis (to be confirmed by the DPO)
The following is a **reasoned starting point**, not a determination:
- **Care use:** GDPR Art. 6(1) [public task / legal obligation / contract — to
  confirm] together with **Art. 9(2)(h)** (provision of health/medical care and
  treatment by or under the responsibility of a health professional), supported
  by Danish law (e.g. the Health Act and the Danish Data Protection Act).
- **Research use:** **Art. 9(2)(j)** (scientific research) with national-law
  conditions and safeguards (pseudonymisation), and any required research-ethics
  approval. **[Confirm whether ethics-committee approval applies.]**
- **Movement video:** **explicit consent**, Art. 9(2)(a) (the app records video
  consent).
- **Push notifications:** consent (the patient enables them); consider
  ePrivacy/cookie rules for storage on the device.

## 6. Necessity and proportionality
- **Data minimisation by design:** no diagnosis, dosing or prediction; the app
  records and reflects, it does not infer.
- **Purpose limitation:** care use is separated from research; research uses a
  **pseudonymised** copy keyed by study code, with the identity mapping held
  only by the clinic.
- **Access proportionality:** professional access is **opt-in per visit** via a
  visit code, restricted **per patient** at the database level (row-level
  security), and rate-limited against code-guessing.
- **Confidentiality of notes:** professional-to-professional notes are withheld
  from patients at the database level (no patient read policy), matching
  clinical-record norms.
- **Minimised disclosure to processors:** notification text is generic, so push
  providers never receive health detail.
- **Transparency:** the patient notice (`docs/PRIVACY_NOTICE_DRAFT.md`) explains
  the processing in plain language.

## 7. Consultation
- **DPO:** [advice to be recorded].
- **Data subjects / patient representatives:** [whether consulted].
- **Research-ethics committee:** [if applicable].

## 8. Risk assessment (to data subjects)
Complete likelihood/severity and residual risk with the DPO.

| # | Risk to data subjects | Likelihood | Severity | Mitigations in place | Residual |
| --- | --- | --- | --- | --- | --- |
| R1 | Unauthorised access to another patient's health data | [ ] | High | Row-level security per patient; visit-code-gated professional access; authentication | [ ] |
| R2 | Brute-forcing a visit code to gain access | [ ] | High | Visit-code **unlock rate-limiting** and logging of attempts | [ ] |
| R3 | Re-identification of the research dataset | [ ] | High | Pseudonymisation (study code, no name); identity mapping held only by the clinic; access controls on export | [ ] |
| R4 | Patient sees clinician-only notes intended for professionals | [ ] | Medium | Notes stored in tables with **no patient read access** | [ ] |
| R5 | Sensitivity of movement video | [ ] | High | Separate explicit consent; access limited to care team; [storage/encryption to confirm] | [ ] |
| R6 | Data breach at a processor | [ ] | High | EU storage; [encryption in transit/at rest — confirm]; processor DPAs; [breach process — define] | [ ] |
| R7 | Transfer of technical data outside EEA (Sentry / FCM) | [ ] | Medium | Generic push text; [SCCs/DPF + Sentry scrubbing — confirm] | [ ] |
| R8 | Excessive or lingering access after care ends | [ ] | Medium | Per-visit access model; [routine to revoke access / delete leavers — define] | [ ] |
| R9 | Loss of availability of clinical data | [ ] | Medium | [Managed backups + tested restore — see OPS.md; confirm] | [ ] |

## 9. Measures to reduce the risks
**Technical (implemented):** per-patient row-level security; authenticated
access; visit-code gating with unlock rate-limiting and attempt logging; audit
event log; notes tables without patient read access; pseudonymised research
export; generic notification content; separate consent capture for video and
research; EU-region storage.

**Technical / organisational (to confirm or define):** encryption in transit
and at rest; signed Data Processing Agreements with each processor and recorded
transfer safeguards; Sentry data scrubbing; backup and tested-restore routine;
data-breach detection and notification process; access review and a routine to
revoke access / delete or anonymise data when a patient or professional leaves;
staff confidentiality and training; records of processing (Art. 30).

## 10. Outcome and sign-off
- Residual risk after measures: [low / medium / high — DPO to assess].
- Prior consultation with Datatilsynet required (Art. 36)? [yes / no — only if
  high residual risk remains].
- DPO opinion: [ ]
- Controller approval: [name, date]
- Review date: [date / on material change to processing].

## 11. Open items to confirm
- [ ] Controller legal entity, DPO contact, sites, and patient numbers.
- [ ] Lawful bases (Art. 6 + Art. 9) and Danish-law references (§5).
- [ ] Research-ethics approval status and the research consent/information sheet.
- [ ] Processor DPAs, locations, and transfer mechanisms (§4.4, §4.7).
- [ ] Encryption at rest / in transit confirmation.
- [ ] Retention periods (§4.6).
- [ ] Backup + tested-restore, breach process, access-review and leaver routines.
- [ ] Sentry scrubbing configuration (no health data in error reports).
- [ ] Risk likelihood/severity and residual-risk ratings (§8).
- [ ] Sign-off (§10).
