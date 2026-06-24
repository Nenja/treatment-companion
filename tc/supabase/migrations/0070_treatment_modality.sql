-- 0070_treatment_modality.sql
-- ---------------------------------------------------------------------------
-- Futureproofing seam (work package 4: baclofen pumps & surgery).
--
-- Today the app's whole treatment spine assumes botulinum toxin: a
-- `treatment_cycle` carries injection muscles, doses, sides, guidance, etc.
-- Baclofen-pump courses (test dose -> implant -> titration) and surgical
-- episodes (preop -> postop -> complications) do not fit that shape. This
-- migration stops the model from *assuming* a single modality, WITHOUT
-- building the pump/surgery capture yet.
--
-- It is strictly additive and backward-compatible:
--   * existing cycles backfill to 'botulinum_toxin' (the column default),
--   * the botulinum-toxin flow is unchanged,
--   * no clinical logic branches on the modality yet — it is readiness only.
--
-- Extension plan (for when WP4 is scheduled): each non-BoNT modality adds
-- its OWN detail table keyed on treatment_cycle.id (e.g. a future
-- `baclofen_course` or `surgical_episode`), and modality-specific views read
-- from those. Concurrent pathways (a patient on BoNT who also has a pump)
-- are represented as parallel cycles of different modalities — the active
-- index is already non-unique, so that needs no schema change here.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'treatment_modality') then
    create type treatment_modality as enum (
      'botulinum_toxin',
      'baclofen_pump',
      'surgery',
      'other'
    );
  end if;
end$$;

alter table treatment_cycle
  add column if not exists modality treatment_modality not null
    default 'botulinum_toxin';

comment on column treatment_cycle.modality is
  'Treatment modality for this cycle/course. Defaults to botulinum_toxin — '
  'the only modality with capture + views today. Future modalities '
  '(baclofen_pump, surgery, other) attach their own detail tables keyed on '
  'this cycle; no clinical logic branches on this column yet. Readiness seam '
  'for WP4 (advanced treatments).';
