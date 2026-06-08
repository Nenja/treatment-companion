-- 0089_goal_video_delete.sql
-- ---------------------------------------------------------------------------
-- Clinician-facing deletion of a saved goal-video clip.
--
-- Until now a clip, once saved, could be viewed (0062 read policy) but never
-- removed by the clinic — only the patient could delete within their own
-- folder, and only the recorder could discard *before* saving. This closes
-- that gap (e.g. a clip recorded in error, or a remove-on-request), in two
-- parts:
--   1. clear_goal_rating_video(rating) — nulls the per-rating video reference
--      and the now-orphaned clinic score, for a patient the clinician can
--      access. Mirrors the access pattern of set_clinic_video_score (0072).
--   2. A Storage DELETE policy so the clinician can remove the object itself,
--      scoped to patients they currently have an active session with (the
--      same predicate as the 0062 read policy). The patient keeps full manage
--      over their own folder via 0062; this only adds the clinician path.
-- Additive: nothing is dropped; baseline clips are cleared via the existing
-- set_goal_baseline_video(goal, '') and this same DELETE policy.
-- ---------------------------------------------------------------------------

create or replace function clear_goal_rating_video(p_rating_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_patient uuid;
begin
  select ag.patient_id
    into v_patient
    from weekly_goal_rating wgr
    join approved_goal ag on ag.id = wgr.approved_goal_id
   where wgr.id = p_rating_id;
  if v_patient is null then
    raise exception 'rating not found';
  end if;
  if not clinician_can_access_patient(v_patient) then
    raise exception 'not authorized for this patient';
  end if;
  update weekly_goal_rating
     set video_path = null,
         clinic_video_rating = null,
         clinic_video_unusable = false,
         clinic_video_scored_by = null,
         clinic_video_scored_at = null
   where id = p_rating_id;
end;
$$;

revoke all on function clear_goal_rating_video(uuid) from public;
grant execute on function clear_goal_rating_video(uuid) to authenticated;

drop policy if exists "clinician deletes patient goal videos" on storage.objects;
create policy "clinician deletes patient goal videos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'goal-videos'
    and current_patient_id() is null
    and clinician_can_access_patient(((storage.foldername(name))[1])::uuid)
  );
