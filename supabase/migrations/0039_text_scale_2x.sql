-- ============================================================================
-- 0039 — Allow a 2.0× text scale.
--
-- The text-size control gains a fourth, largest step (2.0×) so
-- low-vision patients can reach the WCAG-expected 200% enlargement.
-- The text_scale column's check constraint (set inline in 0019) only
-- permits 1.00 / 1.25 / 1.50, so it must be widened — otherwise saving
-- 2.0 fails silently and the new button appears to do nothing.
--
-- The 0019 constraint was created inline with the column, so Postgres
-- auto-generated its name. Rather than guess that name, this finds and
-- drops whatever CHECK constraint currently exists on profile.text_scale,
-- then adds the widened one under a known name.
-- ============================================================================

do $$
declare
  c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class rel  on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
     where rel.relname = 'profile'
       and ns.nspname = 'public'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%text_scale%'
  loop
    execute format(
      'alter table public.profile drop constraint %I', c.conname
    );
  end loop;
end $$;

alter table profile
  add constraint profile_text_scale_valid
  check (text_scale in (1.00, 1.25, 1.50, 2.00));
