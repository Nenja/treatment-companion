-- 0092_goal_video_archive.sql
-- ---------------------------------------------------------------------------
-- Archiving a goal video: move a clip out of the day-to-day cockpit WITHOUT
-- deleting the file, keeping it (e.g. until it has been rated, and for research).
--
-- A clinician-only table `archived_goal_video` (RLS-isolated from patients,
-- like treatment_handoff in 0088) snapshots, per archived clip:
--   * which patient / goal / rating it came from and its Storage path,
--   * the clinic score it carried (clinic_video_rating / unusable / nrs_value),
--   * the patient's consent flags AT THE MOMENT of archiving (audit trail),
--   * who archived it and when, plus an optional note.
--
-- archive_goal_video(...)  — snapshots the clip, then clears its reference on
--   the rating (video_path) or goal (baseline_video_path) so it leaves the
--   active views. The Storage object and the rating's score are KEPT. Requires
--   the patient's clinical video consent (same gate as baseline filming, 0091).
-- unarchive_goal_video(id) — restores the reference and removes the archive row.
-- Permanent delete of an archived clip is done client-side: the SELECT/DELETE
--   RLS below + the clinician Storage DELETE policy from 0089.
--
-- Access mirrors clear_goal_rating_video (0089) / treatment_handoff (0088):
-- clinician role + clinician_can_access_patient. Additive and idempotent.
-- ---------------------------------------------------------------------------

create table if not exists archived_goal_video (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patient(id) on delete cascade,
  approved_goal_id uuid not null references approved_goal(id) on delete cascade,
  source text not null check (source in ('rating', 'baseline')),
  rating_id uuid references weekly_goal_rating(id) on delete set null,
  video_path text not null,
  clinic_video_rating int
    check (clinic_video_rating is null or clinic_video_rating between -2 and 2),
  clinic_video_unusable boolean not null default false,
  nrs_value int,
  consent_clinical boolean not null default false,
  consent_research boolean not null default false,
  note text,
  archived_by uuid references profile(id) on delete set null,
  archived_at timestamptz not null default now()
);

create index if not exists archived_goal_video_patient_idx
  on archived_goal_video (patient_id, archived_at desc);

alter table archived_goal_video enable row level security;

drop policy if exists archived_goal_video_select on archived_goal_video;
create policy archived_goal_video_select on archived_goal_video
  for select to authenticated
  using (clinician_can_access_patient(patient_id));

drop policy if exists archived_goal_video_delete on archived_goal_video;
create policy archived_goal_video_delete on archived_goal_video
  for delete to authenticated
  using (clinician_can_access_patient(patient_id));

drop policy if exists archived_goal_video_admin_all on archived_goal_video;
create policy archived_goal_video_admin_all on archived_goal_video
  for all to authenticated
  using (current_app_role() = 'admin');

-- INSERT is performed only by archive_goal_video() (security definer), so no
-- INSERT policy is granted to authenticated users directly.

create or replace function archive_goal_video(
  p_approved_goal_id uuid,
  p_source text,
  p_rating_id uuid,
  p_note text
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_role role;
  v_patient uuid;
  v_path text;
  v_rating int;
  v_unusable boolean;
  v_nrs int;
  v_cc boolean;
  v_cr boolean;
  v_id uuid;
begin
  v_role := current_app_role();
  if v_role <> 'clinician' then
    raise exception 'only a clinician can archive videos';
  end if;

  select patient_id into v_patient from approved_goal where id = p_approved_goal_id;
  if v_patient is null then
    raise exception 'goal not found';
  end if;
  if not clinician_can_access_patient(v_patient) then
    raise exception 'no active session for this patient';
  end if;

  select video_consent_clinical, video_consent_research
    into v_cc, v_cr
    from patient where id = v_patient;
  if not coalesce(v_cc, false) then
    raise exception 'video consent not recorded for this patient';
  end if;

  if p_source = 'baseline' then
    select baseline_video_path into v_path
      from approved_goal where id = p_approved_goal_id;
    if nullif(trim(coalesce(v_path, '')), '') is null then
      raise exception 'no baseline clip to archive';
    end if;
    v_rating := null;
    v_unusable := false;
    v_nrs := null;
    update approved_goal set baseline_video_path = null
     where id = p_approved_goal_id;
  elsif p_source = 'rating' then
    if p_rating_id is null then
      raise exception 'rating id required';
    end if;
    select wgr.video_path, wgr.clinic_video_rating,
           wgr.clinic_video_unusable, wgr.nrs_value
      into v_path, v_rating, v_unusable, v_nrs
      from weekly_goal_rating wgr
      join approved_goal ag on ag.id = wgr.approved_goal_id
     where wgr.id = p_rating_id and ag.id = p_approved_goal_id;
    if nullif(trim(coalesce(v_path, '')), '') is null then
      raise exception 'no clip to archive on this rating';
    end if;
    update weekly_goal_rating set video_path = null where id = p_rating_id;
  else
    raise exception 'invalid source';
  end if;

  insert into archived_goal_video (
    patient_id, approved_goal_id, source, rating_id, video_path,
    clinic_video_rating, clinic_video_unusable, nrs_value,
    consent_clinical, consent_research, note, archived_by
  ) values (
    v_patient, p_approved_goal_id, p_source,
    case when p_source = 'rating' then p_rating_id else null end, v_path,
    v_rating, v_unusable, v_nrs,
    coalesce(v_cc, false), coalesce(v_cr, false),
    nullif(trim(coalesce(p_note, '')), ''), auth.uid()
  ) returning id into v_id;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), v_role, 'goal_video_archived', 'archived_goal_video', v_id::text
  );
  return v_id;
end;
$$;

revoke all on function archive_goal_video(uuid, text, uuid, text) from public;
grant execute on function archive_goal_video(uuid, text, uuid, text) to authenticated;

create or replace function unarchive_goal_video(p_archive_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_role role;
  v_patient uuid;
  v_source text;
  v_rating uuid;
  v_goal uuid;
  v_path text;
begin
  v_role := current_app_role();
  if v_role <> 'clinician' then
    raise exception 'only a clinician can unarchive videos';
  end if;

  select patient_id, source, rating_id, approved_goal_id, video_path
    into v_patient, v_source, v_rating, v_goal, v_path
    from archived_goal_video where id = p_archive_id;
  if v_patient is null then
    raise exception 'archive entry not found';
  end if;
  if not clinician_can_access_patient(v_patient) then
    raise exception 'no active session for this patient';
  end if;

  if v_source = 'baseline' then
    update approved_goal set baseline_video_path = v_path where id = v_goal;
  elsif v_rating is not null then
    update weekly_goal_rating set video_path = v_path where id = v_rating;
  end if;

  delete from archived_goal_video where id = p_archive_id;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), v_role, 'goal_video_unarchived', 'archived_goal_video',
    p_archive_id::text
  );
end;
$$;

revoke all on function unarchive_goal_video(uuid) from public;
grant execute on function unarchive_goal_video(uuid) to authenticated;
