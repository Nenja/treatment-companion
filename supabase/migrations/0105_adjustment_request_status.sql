-- 0105_adjustment_request_status.sql
-- ---------------------------------------------------------------------------
-- Status loop for therapist adjustment requests.
--
-- Today a physiotherapist can flag a goal as "needs adjustment" (0083:
-- physio_goal_rating.needs_adjustment + adjustment_note) and the treating
-- clinician sees it read-only — there is no way to close the loop, so a
-- request lingers forever. This adds a clinician-set status:
--   open (default) -> addressed | dismissed
--
-- OPTION (A) — clinician-side only: resolving simply removes the request from
-- the clinician's open list. The therapist is NOT shown the outcome (no new
-- downward clinic->therapist channel), so there is no patient/therapist-facing
-- change here; the status + who/when are stored for audit only.
--
-- The clinician writes the status via a SECURITY DEFINER RPC (mirrors
-- submit_therapist_note / mark_therapist_notes_seen): role-gated to the
-- physician ('clinician') and authorised against the patient that owns the
-- rating. SECURITY DEFINER bypasses RLS, so no extra UPDATE policy is needed.
-- IDEMPOTENT (add column if not exists; create or replace).
-- ---------------------------------------------------------------------------

alter table physio_goal_rating
  add column if not exists adjustment_status text not null default 'open'
    check (adjustment_status in ('open', 'addressed', 'dismissed'));
alter table physio_goal_rating
  add column if not exists adjustment_resolved_at timestamptz;
alter table physio_goal_rating
  add column if not exists adjustment_resolved_by uuid;

comment on column physio_goal_rating.adjustment_status is
  'Lifecycle of the therapist adjustment request: open (default) until the '
  'treating clinician marks it addressed or dismissed. Clinician-side only — '
  'not shown to the therapist.';

create or replace function resolve_adjustment_request(
  p_rating_id uuid,
  p_status text
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_patient uuid;
begin
  -- Only the physician ('clinician') resolves; therapists raise requests.
  if current_app_role() <> 'clinician' then
    raise exception 'only the treating clinician can resolve an adjustment request';
  end if;
  if p_status not in ('addressed', 'dismissed') then
    raise exception 'status must be addressed or dismissed';
  end if;

  select pa.patient_id
    into v_patient
    from physio_goal_rating r
    join physio_assessment pa on pa.id = r.physio_assessment_id
    where r.id = p_rating_id;

  if v_patient is null then
    raise exception 'adjustment request not found';
  end if;
  if not clinician_can_access_patient(v_patient) then
    raise exception 'not authorized for this patient';
  end if;

  update physio_goal_rating
    set adjustment_status = p_status,
        adjustment_resolved_at = now(),
        adjustment_resolved_by = auth.uid()
    where id = p_rating_id;
end;
$$;

grant execute on function resolve_adjustment_request(uuid, text) to authenticated;
