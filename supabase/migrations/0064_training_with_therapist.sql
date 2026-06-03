-- 0064_training_with_therapist.sql
-- ---------------------------------------------------------------------------
-- Split weekly training into "at home" and "with a therapist".
--
-- weekly_checkin.training_days already holds the days trained AT HOME (ISO
-- weekday 1=Mon..7=Sun). This adds a parallel column for days trained WITH A
-- THERAPIST. A given day may appear in both. NULL = not reported; {} =
-- reported none.
-- ---------------------------------------------------------------------------

alter table weekly_checkin
  add column if not exists training_days_therapist smallint[];

comment on column weekly_checkin.training_days is
  'ISO weekday numbers (1=Mon..7=Sun) the patient trained AT HOME that week. '
  'NULL = not reported; {} = reported none.';
comment on column weekly_checkin.training_days_therapist is
  'ISO weekday numbers (1=Mon..7=Sun) the patient trained WITH A THERAPIST '
  'that week. NULL = not reported; {} = reported none.';

-- Replace the setter with a two-array version. The home array stays the
-- second argument (so the meaning of existing call sites is unchanged); the
-- therapist array is added and defaults to NULL.
drop function if exists set_checkin_training_days(uuid, smallint[]);

create or replace function set_checkin_training_days(
  p_checkin_id uuid,
  p_days smallint[],
  p_days_therapist smallint[] default null
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
  if p_days is not null and exists (
    select 1 from unnest(p_days) d where d < 1 or d > 7
  ) then
    raise exception 'weekday out of range (expected 1..7)';
  end if;
  if p_days_therapist is not null and exists (
    select 1 from unnest(p_days_therapist) d where d < 1 or d > 7
  ) then
    raise exception 'weekday out of range (expected 1..7)';
  end if;
  update weekly_checkin
     set training_days = p_days,
         training_days_therapist = p_days_therapist
   where id = p_checkin_id;
end;
$$;

revoke all on function set_checkin_training_days(uuid, smallint[], smallint[]) from public;
grant execute on function set_checkin_training_days(uuid, smallint[], smallint[]) to authenticated;
