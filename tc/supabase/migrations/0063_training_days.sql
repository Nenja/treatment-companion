-- 0063_training_days.sql
-- ---------------------------------------------------------------------------
-- Weekly training/exercise reporting.
--
-- As part of a check-in, the patient reports which days of the week they
-- did their exercises/workouts. Stored as an array of ISO weekday numbers
-- (1 = Monday … 7 = Sunday) on the check-in. Null = not reported; an empty
-- array = reported "no training this week".
-- ---------------------------------------------------------------------------

alter table weekly_checkin
  add column if not exists training_days smallint[];

comment on column weekly_checkin.training_days is
  'ISO weekday numbers (1=Mon..7=Sun) the patient trained that week. '
  'NULL = not reported; {} = reported no training.';

-- ---------------------------------------------------------------------------
-- Patient sets the training days for one of their own check-ins. Called
-- right after submit_weekly_checkin_v4 returns the check-in id. Kept as a
-- small separate RPC so the submit RPC doesn't need a new version.
-- ---------------------------------------------------------------------------
create or replace function set_checkin_training_days(
  p_checkin_id uuid,
  p_days smallint[]
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_owner uuid;
begin
  select patient_id into v_owner from weekly_checkin where id = p_checkin_id;
  if v_owner is null then
    raise exception 'check-in not found';
  end if;
  if v_owner <> current_patient_id() then
    raise exception 'not authorized for this check-in';
  end if;
  -- Reject anything outside 1..7 so bad input can't be stored.
  if p_days is not null and exists (
    select 1 from unnest(p_days) d where d < 1 or d > 7
  ) then
    raise exception 'weekday out of range (expected 1..7)';
  end if;
  update weekly_checkin set training_days = p_days where id = p_checkin_id;
end;
$$;

revoke all on function set_checkin_training_days(uuid, smallint[]) from public;
grant execute on function set_checkin_training_days(uuid, smallint[]) to authenticated;
