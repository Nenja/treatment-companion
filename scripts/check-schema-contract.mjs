#!/usr/bin/env node
// Schema-contract check.
//
// Reads a schema snapshot (produced by applying the migrations — see CI), then
// scans the app's data layer for Supabase queries and verifies that:
//   • every  .from('table')         references a table that exists,
//   • every selected bare column    exists on that table,
//   • every  .rpc('function')       references a function that exists.
//
// This catches the class of bug that broke pages this session: the app reading
// a column that was dropped (e.g. length_weeks) or one that only exists after a
// migration that hasn't been applied. It needs no backend and no running app.
//
// Embedded PostgREST resources (e.g. "profile:profile_id (display_name)") are
// skipped — resolving the foreign table reliably is out of scope — so the check
// favours zero false positives over exhaustive coverage.
//
// Usage:  node scripts/check-schema-contract.mjs <schema.json>
//   schema.json shape: { "tables": { "patient": ["id", ...], ... },
//                        "functions": ["submit_weekly_checkin", ...] }

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const schemaPath = process.argv[2] || 'schema.json';
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const tables = schema.tables || {};
const functions = new Set(schema.functions || []);

const ROOTS = ['lib', 'app', 'components'];
const SKIP_DIRS = new Set(['node_modules', '.next', '.git']);

const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      walk(p);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(p);
    }
  }
}
for (const r of ROOTS) {
  try {
    walk(r);
  } catch {
    /* root may not exist */
  }
}

// Split a select string on top-level commas (ignoring commas inside parens).
function splitTopLevel(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur);
  return out;
}

const problems = [];

for (const f of files) {
  const src = readFileSync(f, 'utf8');

  // .rpc('fn')
  for (const m of src.matchAll(/\.rpc\('([a-z_][a-z0-9_]*)'/g)) {
    const fn = m[1];
    if (!functions.has(fn)) {
      problems.push(`${f}: rpc('${fn}') — no such function in the migrated schema`);
    }
  }

  // .from('table') paired with the next .select('...') before the next .from(
  const froms = [...src.matchAll(/\.from\('([a-z_][a-z0-9_]*)'\)/g)].map((m) => ({
    table: m[1],
    idx: m.index
  }));
  const sels = [...src.matchAll(/\.select\('([^']*)'\)/g)].map((m) => ({
    cols: m[1],
    idx: m.index
  }));

  for (let i = 0; i < froms.length; i++) {
    const fr = froms[i];
    const nextFrom = froms[i + 1] ? froms[i + 1].idx : Infinity;

    if (!(fr.table in tables)) {
      problems.push(`${f}: from('${fr.table}') — no such table in the migrated schema`);
      continue;
    }
    const sel = sels.find((s) => s.idx > fr.idx && s.idx < nextFrom);
    if (!sel) continue;

    for (let item of splitTopLevel(sel.cols)) {
      item = item.trim();
      if (!item || item === '*' || item === 'count') continue;
      if (item.includes('(')) continue; // embedded resource — skip
      if (item.includes(':')) item = item.split(':').pop().trim(); // alias:realcol
      const m = item.match(/^([a-z_][a-z0-9_]*)/i); // leading identifier (strip ->, ::, etc.)
      if (!m) continue;
      const col = m[1];
      if (!tables[fr.table].includes(col)) {
        problems.push(
          `${f}: from('${fr.table}').select(… '${col}' …) — column '${col}' is not on table '${fr.table}'`
        );
      }
    }
  }
}

if (problems.length) {
  console.error(`✗ schema-contract check FAILED — ${problems.length} issue(s):\n`);
  for (const p of problems) console.error(`   - ${p}`);
  console.error(
    '\nEither the app references something that no longer exists (fix the query) or a migration ' +
      'that adds it is missing from supabase/migrations/.'
  );
  process.exit(1);
}

console.log(
  '✓ schema-contract OK — every .from table, selected column, and .rpc function exists in the migrated schema.'
);
