#!/usr/bin/env node
// Fails (exit 1) if messages/en.json and messages/da.json don't have an
// identical set of keys. Danish `_meta` keys (translation bookkeeping) are
// ignored. Used by CI and runnable locally with `npm run check:i18n`.

import { readFileSync } from 'node:fs';

function flatten(obj, prefix = '') {
  return Object.entries(obj).reduce((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(acc, flatten(v, key));
    } else {
      acc[key] = v;
    }
    return acc;
  }, {});
}

const en = flatten(JSON.parse(readFileSync('messages/en.json', 'utf8')));
const da = flatten(JSON.parse(readFileSync('messages/da.json', 'utf8')));

const onlyEn = Object.keys(en).filter((k) => !(k in da));
const onlyDa = Object.keys(da).filter((k) => !(k in en) && !k.includes('_meta'));

if (onlyEn.length || onlyDa.length) {
  console.error('✗ i18n parity FAILED — en.json and da.json are out of sync.');
  if (onlyEn.length) {
    console.error(`\n  In en.json but missing from da.json (${onlyEn.length}):`);
    for (const k of onlyEn) console.error(`    - ${k}`);
  }
  if (onlyDa.length) {
    console.error(`\n  In da.json but missing from en.json (${onlyDa.length}):`);
    for (const k of onlyDa) console.error(`    - ${k}`);
  }
  process.exit(1);
}

console.log(`✓ i18n parity OK — ${Object.keys(en).length} keys, en/da aligned.`);
