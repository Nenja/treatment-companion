-- 0080_goal_therapy.sql
-- ---------------------------------------------------------------------------
-- Slice 2 of ITB + BTX: goals for either therapy.
--
-- A goal already belongs to the patient's active treatment cycle, and the
-- weekly check-in rates whichever goals the client submits (weekly_goal_rating
-- links a check-in to a goal with no cycle constraint). So rather than open a
-- second concurrent active cycle for ITB — which would hijack every
-- "resolve the active cycle" RPC — an ITB goal simply rides the patient's
-- existing active cycle and is TAGGED as ITB. The weekly self-report carries
-- it automatically; the UI groups goals by this tag.
--
--   'bont' — botulinum-toxin goal (the default; everything as before)
--   'itb'  — intrathecal-baclofen goal, shown under the ITB track
-- ---------------------------------------------------------------------------

alter table approved_goal
  add column if not exists therapy text not null default 'bont'
    check (therapy in ('bont', 'itb'));

comment on column approved_goal.therapy is
  'Which therapy this goal belongs to: ''bont'' (default) or ''itb''. Lets a '
  'patient track goals for both therapies in one weekly check-in while the '
  'clinician sees them grouped by therapy. Independent of the cycle the goal '
  'is attached to.';

-- Tag (or re-tag) a goal's therapy. Kept separate from the create RPCs so
-- those signatures are untouched: the client creates a goal as usual, then
-- tags it 'itb' when recorded from the ITB track.
create or replace function set_goal_therapy(
  p_goal_id uuid,
  p_therapy text
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_patient uuid;
begin
  if p_therapy not in ('bont', 'itb') then
    raise exception 'invalid therapy: %', p_therapy;
  end if;
  select patient_id into v_patient from approved_goal where id = p_goal_id;
  if v_patient is null then
    raise exception 'goal not found';
  end if;
  if not clinician_can_access_patient(v_patient) then
    raise exception 'not authorized for this patient';
  end if;
  update approved_goal set therapy = p_therapy where id = p_goal_id;
end;
$$;

revoke all on function set_goal_therapy(uuid, text) from public;
grant execute on function set_goal_therapy(uuid, text) to authenticated;
