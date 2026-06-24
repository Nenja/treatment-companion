-- Emits the public-schema shape as JSON for the schema-contract check.
-- Invoke with: psql -tA -f supabase/ci/dump-schema.sql > schema.json
-- { "tables": { name: [columns...] }, "functions": [names...] }
select json_build_object(
  'tables', coalesce((
    select json_object_agg(table_name, cols) from (
      select table_name, json_agg(column_name order by ordinal_position) as cols
      from information_schema.columns
      where table_schema = 'public'
      group by table_name
    ) t
  ), '{}'::json),
  'functions', coalesce((
    select json_agg(distinct p.proname)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  ), '[]'::json)
);
