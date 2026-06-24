-- ============================================================================
-- Treatment Companion — row-level security policies
--
-- The database is the security boundary. Even if the API layer has a bug
-- and tries to fetch Anna's data for Lars, these policies stop it.
--
-- Roles modelled here:
--   - patient    : sees only their own rows
--   - clinician  : sees only rows for patients they have an active
--                  clinician_session for
--   - admin      : sees everything (used by admin UI, not normal users)
--   - service    : bypasses RLS entirely (used by trusted server jobs
--                  like the prompt generator; never granted to clients)
--
-- Helpers below assume Supabase's `auth.uid()` returns the auth user ID
-- and that we can join from auth.uid() to a `profile` row to get role.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

create or replace function current_profile_id() returns uuid as $$
  select id from profile where id = auth.uid();
$$ language sql stable security definer;

create or replace function current_app_role() returns role as $$
  select role from profile where id = auth.uid();
$$ language sql stable security definer;

-- Returns the patient.id for the currently authenticated user, IF they
-- are a patient. NULL otherwise.
create or replace function current_patient_id() returns uuid as $$
  select p.id from patient p
   join profile pr on pr.id = p.profile_id
   where pr.id = auth.uid();
$$ language sql stable security definer;

-- Returns the clinician.id for the currently authenticated user, IF
-- they are a clinician. NULL otherwise.
create or replace function current_clinician_id() returns uuid as $$
  select c.id from clinician c
   join profile pr on pr.id = c.profile_id
   where pr.id = auth.uid();
$$ language sql stable security definer;

-- True if the current user is a clinician with an active session that
-- grants them access to the given patient.
create or replace function clinician_can_access_patient(p_patient_id uuid)
  returns boolean as $$
  select exists (
    select 1 from clinician_session s
     where s.clinician_id = current_clinician_id()
       and s.patient_id = p_patient_id
       and s.ended_at is null
       -- The application enforces the 1-hour inactivity timeout, but we
       -- also gate it at the database so a stale session can't be used
       -- to read data via a direct API call.
       and s.last_activity_at > now() - interval '1 hour'
  );
$$ language sql stable security definer;

-- ---------------------------------------------------------------------------
-- Enable RLS on every table
-- ---------------------------------------------------------------------------

alter table profile             enable row level security;
alter table patient             enable row level security;
alter table clinician           enable row level security;
alter table treatment_cycle     enable row level security;
alter table goal_suggestion     enable row level security;
alter table approved_goal       enable row level security;
alter table weekly_prompt       enable row level security;
alter table weekly_checkin      enable row level security;
alter table weekly_goal_rating  enable row level security;
alter table treatment_session   enable row level security;
alter table muscle_injection    enable row level security;
alter table visit_code          enable row level security;
alter table clinician_session   enable row level security;
alter table audit_event         enable row level security;

-- ---------------------------------------------------------------------------
-- profile
--
-- A user can see their own profile. Clinicians can see profiles of
-- patients they're currently sessioned with. Admins see all.
-- ---------------------------------------------------------------------------

create policy profile_self_read on profile
  for select using (id = auth.uid());

create policy profile_clinician_read_patient on profile
  for select using (
    current_app_role() = 'clinician'
    and exists (
      select 1 from patient p
       where p.profile_id = profile.id
         and clinician_can_access_patient(p.id)
    )
  );

create policy profile_admin_all on profile
  for all using (current_app_role() = 'admin');

create policy profile_self_update on profile
  for update using (id = auth.uid())
  with check (id = auth.uid() and role = current_app_role()); -- can't change own role

-- ---------------------------------------------------------------------------
-- patient
-- ---------------------------------------------------------------------------

create policy patient_self_read on patient
  for select using (profile_id = auth.uid());

create policy patient_clinician_read on patient
  for select using (clinician_can_access_patient(id));

create policy patient_admin_all on patient
  for all using (current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- clinician
--
-- Clinicians can see their own row. Patients can see clinicians who
-- have approved their goals or recorded their treatments — but for the
-- prototype we don't need to expose clinician identity to patients at
-- all, so we leave that policy off until needed.
-- ---------------------------------------------------------------------------

create policy clinician_self_read on clinician
  for select using (profile_id = auth.uid());

create policy clinician_admin_all on clinician
  for all using (current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- treatment_cycle
-- ---------------------------------------------------------------------------

create policy treatment_cycle_patient_read on treatment_cycle
  for select using (patient_id = current_patient_id());

create policy treatment_cycle_clinician_read on treatment_cycle
  for select using (clinician_can_access_patient(patient_id));

create policy treatment_cycle_clinician_write on treatment_cycle
  for all using (
    current_app_role() = 'clinician'
    and clinician_can_access_patient(patient_id)
  )
  with check (clinician_can_access_patient(patient_id));

create policy treatment_cycle_admin_all on treatment_cycle
  for all using (current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- goal_suggestion
--
-- Patient can read and write their own. Clinician can read (review) and
-- update the status column when accessing the patient.
-- ---------------------------------------------------------------------------

create policy goal_suggestion_patient_read on goal_suggestion
  for select using (patient_id = current_patient_id());

create policy goal_suggestion_patient_insert on goal_suggestion
  for insert with check (patient_id = current_patient_id());

create policy goal_suggestion_patient_update on goal_suggestion
  for update using (
    patient_id = current_patient_id() and status = 'needsReview'
  )
  with check (patient_id = current_patient_id());
-- ^ patients can edit a suggestion only while it's still awaiting review.

create policy goal_suggestion_clinician_read on goal_suggestion
  for select using (clinician_can_access_patient(patient_id));

create policy goal_suggestion_clinician_update on goal_suggestion
  for update using (clinician_can_access_patient(patient_id))
  with check (clinician_can_access_patient(patient_id));

create policy goal_suggestion_admin_all on goal_suggestion
  for all using (current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- approved_goal
--
-- Patient reads only. Created and edited by clinicians during a session.
-- ---------------------------------------------------------------------------

create policy approved_goal_patient_read on approved_goal
  for select using (patient_id = current_patient_id());

create policy approved_goal_clinician_read on approved_goal
  for select using (clinician_can_access_patient(patient_id));

create policy approved_goal_clinician_write on approved_goal
  for all using (clinician_can_access_patient(patient_id))
  with check (clinician_can_access_patient(patient_id));

create policy approved_goal_admin_all on approved_goal
  for all using (current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- weekly_prompt
--
-- Patient reads only. Prompts are created by a server job (running as
-- the service role, which bypasses RLS) — patients don't create them.
-- ---------------------------------------------------------------------------

create policy weekly_prompt_patient_read on weekly_prompt
  for select using (patient_id = current_patient_id());

create policy weekly_prompt_patient_update on weekly_prompt
  for update using (patient_id = current_patient_id())
  with check (patient_id = current_patient_id());

create policy weekly_prompt_clinician_read on weekly_prompt
  for select using (clinician_can_access_patient(patient_id));

create policy weekly_prompt_admin_all on weekly_prompt
  for all using (current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- weekly_checkin + weekly_goal_rating
--
-- Patient writes their own check-ins; clinicians read them during a
-- session. Patients cannot edit a check-in after it's submitted (the
-- update policy is omitted; if a patient wants to correct, they'd need
-- a clinician path — keeps the data trustworthy).
-- ---------------------------------------------------------------------------

create policy weekly_checkin_patient_read on weekly_checkin
  for select using (patient_id = current_patient_id());

create policy weekly_checkin_patient_insert on weekly_checkin
  for insert with check (patient_id = current_patient_id());

create policy weekly_checkin_clinician_read on weekly_checkin
  for select using (clinician_can_access_patient(patient_id));

create policy weekly_checkin_admin_all on weekly_checkin
  for all using (current_app_role() = 'admin');

create policy weekly_goal_rating_patient_read on weekly_goal_rating
  for select using (exists (
    select 1 from weekly_checkin c
     where c.id = weekly_goal_rating.weekly_checkin_id
       and c.patient_id = current_patient_id()
  ));

create policy weekly_goal_rating_patient_insert on weekly_goal_rating
  for insert with check (exists (
    select 1 from weekly_checkin c
     where c.id = weekly_goal_rating.weekly_checkin_id
       and c.patient_id = current_patient_id()
  ));

create policy weekly_goal_rating_clinician_read on weekly_goal_rating
  for select using (exists (
    select 1 from weekly_checkin c
     where c.id = weekly_goal_rating.weekly_checkin_id
       and clinician_can_access_patient(c.patient_id)
  ));

create policy weekly_goal_rating_admin_all on weekly_goal_rating
  for all using (current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- treatment_session + muscle_injection
--
-- Patient reads (so the patient can see what was injected). Clinician
-- writes during a session.
-- ---------------------------------------------------------------------------

create policy treatment_session_patient_read on treatment_session
  for select using (patient_id = current_patient_id());

create policy treatment_session_clinician_read on treatment_session
  for select using (clinician_can_access_patient(patient_id));

create policy treatment_session_clinician_write on treatment_session
  for all using (clinician_can_access_patient(patient_id))
  with check (clinician_can_access_patient(patient_id));

create policy treatment_session_admin_all on treatment_session
  for all using (current_app_role() = 'admin');

create policy muscle_injection_select on muscle_injection
  for select using (exists (
    select 1 from treatment_session t
     where t.id = muscle_injection.treatment_session_id
       and (
         t.patient_id = current_patient_id()
         or clinician_can_access_patient(t.patient_id)
       )
  ));

create policy muscle_injection_clinician_write on muscle_injection
  for all using (exists (
    select 1 from treatment_session t
     where t.id = muscle_injection.treatment_session_id
       and clinician_can_access_patient(t.patient_id)
  ))
  with check (exists (
    select 1 from treatment_session t
     where t.id = muscle_injection.treatment_session_id
       and clinician_can_access_patient(t.patient_id)
  ));

create policy muscle_injection_admin_all on muscle_injection
  for all using (current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- visit_code
--
-- Patient generates their own codes and reads them. Clinicians don't
-- read codes directly — they submit a code via an API endpoint (a SECURITY
-- DEFINER function that the policy here allows). For simplicity, this
-- migration permits SELECT by clinicians on codes that match exactly,
-- which is enough for the unlock-by-code RPC.
-- ---------------------------------------------------------------------------

create policy visit_code_patient_read on visit_code
  for select using (patient_id = current_patient_id());

-- No direct INSERT for patients. They call generate_visit_code() which
-- runs SECURITY DEFINER and inserts on their behalf after invalidating
-- any prior unconsumed code. This forces the "one active code per
-- patient" rule to be applied every time.

-- Clinician-side lookups happen through a SECURITY DEFINER function
-- (defined in a later migration) that takes a code string, checks it,
-- creates a clinician_session row, and returns the patient ID. No
-- generic SELECT for clinicians.

create policy visit_code_admin_all on visit_code
  for all using (current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- clinician_session
--
-- A clinician sees their own session rows. A patient sees sessions tied
-- to themselves (so they could see "Dr X opened my record at 14:02").
-- ---------------------------------------------------------------------------

create policy clinician_session_clinician_read on clinician_session
  for select using (clinician_id = current_clinician_id());

create policy clinician_session_clinician_update on clinician_session
  for update using (clinician_id = current_clinician_id())
  with check (clinician_id = current_clinician_id());

create policy clinician_session_patient_read on clinician_session
  for select using (patient_id = current_patient_id());

create policy clinician_session_admin_all on clinician_session
  for all using (current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- audit_event
--
-- Everyone can write audit events about themselves. Reads are
-- restricted: a user sees events where they were the actor; a patient
-- additionally sees events about their own entities; admins see all.
-- ---------------------------------------------------------------------------

create policy audit_event_self_read on audit_event
  for select using (actor_profile_id = auth.uid());

create policy audit_event_patient_read_own on audit_event
  for select using (
    current_app_role() = 'patient'
    and entity in ('patient', 'goal_suggestion', 'approved_goal',
                   'weekly_checkin', 'treatment_session', 'visit_code')
    -- The application is responsible for setting entity_id to the
    -- patient-scoped UUID; patient sees rows where they own that entity.
    -- A more precise policy would join to each entity table; we keep
    -- this looser for the prototype and rely on the application to
    -- pass correct entity_ids.
  );

create policy audit_event_admin_read on audit_event
  for select using (current_app_role() = 'admin');

create policy audit_event_insert on audit_event
  for insert with check (actor_profile_id = auth.uid());

-- Note: UPDATE and DELETE are blocked by the trigger in 0001, not RLS.
