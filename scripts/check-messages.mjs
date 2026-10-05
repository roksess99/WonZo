#!/usr/bin/env node
// Every language has the same keys, and no value is empty
// (.claude/rules/frontend.md § Teksten). Runs before `next build`: a missing
// key fails the build instead of showing a key name on screen.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'messages');
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();

function flatten(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out.set(key, v);
  }
  return out;
}

const sets = files.map((f) => [f, flatten(JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')))]);
const problems = [];
const allKeys = new Set(sets.flatMap(([, m]) => [...m.keys()]));
for (const [file, map] of sets) {
  for (const key of allKeys) if (!map.has(key)) problems.push(`${file}: missing "${key}"`);
  for (const [key, value] of map) {
    if (typeof value !== 'string' || value.trim() === '') problems.push(`${file}: "${key}" is empty or not text`);
  }
  // Placeholders like {count} must match across languages.
  for (const [key, value] of map) {
    const vars = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const [otherFile, other] of sets) {
      if (other.has(key) && vars(other.get(key)) !== vars(value)) problems.push(`${file} vs ${otherFile}: "${key}" has different placeholders`);
    }
  }
}

const unique = [...new Set(problems)];
if (unique.length) {
  console.error(`Message check FAILED (${files.join(', ')}):`);
  for (const p of unique) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`Message check PASS: ${files.join(', ')} — ${allKeys.size} keys each`);
