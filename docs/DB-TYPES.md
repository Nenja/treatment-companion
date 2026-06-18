# Typed database layer (Supabase generated types)

**Status: scaffolded, not yet wired.** The Supabase client is currently created
without a `Database` type, so queries are not checked against the real schema at
compile time. This is the highest-value remaining stack addition — it catches
schema/query drift (e.g. a renamed column like the `m.guidance`→`s.guidance`
move that slipped through in migration 0111) at build time instead of at runtime.

It is a **developer / CLI step** because generating the types needs the Supabase
CLI talking to the project (Nikolaj can't run code locally). It is deliberately
*not* hand-written — generated types are the only reliable source.

## One-time / per-schema-change generation

```bash
# Needs the Supabase CLI + a personal access token (SUPABASE_ACCESS_TOKEN)
export SUPABASE_PROJECT_ID=<the project ref>
npm run gen:types          # writes lib/database.types.ts
```

The `gen:types` script is already in `package.json`. Commit the resulting
`lib/database.types.ts`. Regenerate whenever a migration changes the schema.

## Wiring it in (once the file exists)

In `lib/supabase/browser.ts`, `lib/supabase/server.ts`, and
`lib/supabase/serviceClient.ts`, type the client:

```ts
import type { Database } from '@/lib/database.types';
createBrowserClient<Database>(url, key);   // and the server/service equivalents
```

That turns `.from('treatment_session').select('guidance')` into a compile-time
check against the actual columns.

## Keeping it honest in CI (optional, recommended)

Add a CI job that regenerates types against the linked project and fails if the
committed file is stale (`git diff --exit-code lib/database.types.ts`). Needs
`SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_ID` as repo secrets. This makes
"types match the live schema" an enforced invariant rather than a manual habit.
