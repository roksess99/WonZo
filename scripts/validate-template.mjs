#!/usr/bin/env node
// Validates the consistency of this template: references, placeholders,
// rule frontmatter, configuration, decisions and measured claims.
//
// Dependency-free (Node 18+). Deterministic: reads files, changes nothing.
//
//   node scripts/validate-template.mjs            template mode
//   node scripts/validate-template.mjs --project  also fail on any placeholder
//
// Exit code 0 = all checks passed, 1 = at least one failure.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_MODE = process.argv.includes('--project');

const REQUIRED_FILES = [
  'CLAUDE.md',
  'LEESMIJ.md',
  '.gitignore',
  '.env.example',
  '.claude/settings.json',
  '.claude/hooks/guard.mjs',
  'scripts/test-guard.mjs',
  'docs/AUTHORITY.md',
  'docs/CLAUDE_CODE.md',
  'docs/DECISIONS.md',
  'docs/DATAMODEL.md',
  'docs/STATE_MACHINES.md',
  'docs/PAYMENTS.md',
  'docs/IDEMPOTENCY.md',
  'docs/PRIJZEN.md',
  'docs/SUPPLIER_RESILIENCE.md',
  'docs/THREAT_MODEL.md',
  'docs/TESTEN.md',
  'docs/CI_CD.md',
  'docs/OBSERVABILITY.md',
  'docs/DISASTER_RECOVERY.md',
  'docs/ACCESSIBILITY.md',
  'docs/PRIVACY.md',
];

const DECISION_STATUSES = ['OPEN', 'BLOCKED', 'READY', 'DECIDED', 'SUPERSEDED'];
const META_PLACEHOLDERS = new Set(['NAAM']); // notation examples, not fill-ins
const SKIP_DIRS = new Set(['.git', 'node_modules', '.next', 'dist', 'build', 'coverage']);

// ---------------------------------------------------------------- reporting

const results = [];
function check(name, fn) {
  const failures = [];
  const fail = (msg) => failures.push(msg);
  try {
    fn(fail);
  } catch (err) {
    fail(`check crashed: ${err.stack ?? err}`);
  }
  results.push({ name, failures });
}

// ---------------------------------------------------------------- file helpers

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const rel = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');
const read = (r) => fs.readFileSync(path.join(ROOT, r), 'utf8');

// Case-sensitive existence check, also on case-insensitive filesystems.
function existsExact(relPath) {
  const parts = relPath.replace(/\/+$/, '').split('/').filter((p) => p && p !== '.');
  let dir = ROOT;
  for (const part of parts) {
    if (part === '..') {
      dir = path.dirname(dir);
      continue;
    }
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return false;
    }
    if (!entries.includes(part)) return false;
    dir = path.join(dir, part);
  }
  return true;
}

const ALL_FILES = walk(ROOT).map(rel).sort();
const MD_FILES = ALL_FILES.filter((f) => f.endsWith('.md'));
const TEXT_FILES = ALL_FILES.filter((f) => /\.(md|json|ya?ml|example)$/.test(f) || f === '.gitignore');

// Lines with fenced code blocks marked, so checks can skip or include them.
function lines(file) {
  let inFence = false;
  return read(file)
    .split(/\r?\n/)
    .map((text, i) => {
      const fenceLine = /^\s*(```|~~~)/.test(text);
      const result = { text, n: i + 1, inFence: inFence || fenceLine };
      if (fenceLine) inFence = !inFence;
      return result;
    });
}

const stripInlineCode = (s) => s.replace(/`[^`]*`/g, '');

// ---------------------------------------------------------------- shared data

function placeholderRegistry() {
  const text = read('LEESMIJ.md');
  const m = text.match(/<!-- placeholder-registry:start -->([\s\S]*?)<!-- placeholder-registry:end -->/);
  if (!m) return null;
  return new Set([...m[1].matchAll(/<<([A-Z][A-Z0-9_]*)>>/g)].map((x) => x[1]));
}

function declaredStructure() {
  const text = read('CLAUDE.md');
  const section = text.split(/^## Structuur\s*$/m)[1] ?? '';
  const block = section.match(/```[a-z]*\r?\n([\s\S]*?)```/);
  if (!block) return [];
  return block[1]
    .split(/\r?\n/)
    .map((l) => l.trim().split(/\s+/)[0])
    .filter((p) => p && /^[\w.-]+(\/[\w.-]*)*$/.test(p));
}

function parseDecisions() {
  const decisions = new Map();
  const dupes = [];
  let current = null;
  for (const { text, n, inFence } of lines('docs/DECISIONS.md')) {
    if (inFence) continue;
    const h = text.match(/^## (.*)$/);
    if (h) {
      const d = h[1].match(/^(D-\d{2}) · (.+)$/);
      if (d) {
        if (decisions.has(d[1])) dupes.push(`${d[1]} (line ${n})`);
        current = { id: d[1], title: d[2], line: n, fields: {} };
        decisions.set(d[1], current);
      } else {
        current = null;
        if (/^(D-?\d|\d)/.test(h[1])) dupes.push(`malformed decision heading at line ${n}: "${h[1]}"`);
      }
      continue;
    }
    const f = current && text.match(/^- \*\*(Status|Depends on|Decided|Superseded by):\*\* (.*)$/);
    if (f) current.fields[f[1]] = f[2].trim();
  }
  return { decisions, dupes };
}

// ---------------------------------------------------------------- checks

check('Required documents exist', (fail) => {
  for (const f of REQUIRED_FILES) if (!existsExact(f)) fail(`missing: ${f}`);
});

check('JSON configuration is valid', (fail) => {
  for (const f of ALL_FILES.filter((x) => x.endsWith('.json'))) {
    try {
      JSON.parse(read(f));
    } catch (err) {
      fail(`${f}: ${err.message}`);
    }
  }
});

check('Claude Code settings are well-formed', (fail) => {
  const s = JSON.parse(read('.claude/settings.json'));
  const rules = [...(s.permissions?.allow ?? []), ...(s.permissions?.ask ?? []), ...(s.permissions?.deny ?? [])];
  for (const r of rules) {
    if (!/^[A-Za-z]+(\(.+\))?$/.test(r)) fail(`permission rule has an unexpected shape: ${r}`);
    if (/^(Write|Glob|MultiEdit|NotebookEdit)\(/.test(r)) fail(`path rules for ${r.split('(')[0]} are never consulted; use Edit(...) or Read(...): ${r}`);
  }
  for (const [event, groups] of Object.entries(s.hooks ?? {})) {
    for (const g of groups) {
      for (const h of g.hooks ?? []) {
        if (h.type !== 'command') continue;
        for (const m of String(h.command).matchAll(/\$\{?CLAUDE_PROJECT_DIR\}?\/([^"'\s]+)/g)) {
          if (!existsExact(m[1])) fail(`${event} hook points to missing file: ${m[1]}`);
        }
      }
    }
  }
});

check('Rule frontmatter and scoped paths are valid', (fail) => {
  const declared = declaredStructure();
  if (declared.length === 0) fail('no structure block found under "## Structuur" in CLAUDE.md');
  const ruleFiles = ALL_FILES.filter((f) => /^\.claude\/rules\/.+\.md$/.test(f));
  const claudeMd = read('CLAUDE.md');
  for (const f of ruleFiles) {
    const text = read(f);
    const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    if (!fm) {
      fail(`${f}: no frontmatter (rule would load in every session)`);
      continue;
    }
    const body = fm[1].split(/\r?\n/);
    if (body[0] !== 'paths:') fail(`${f}: frontmatter must start with "paths:"`);
    const patterns = [];
    for (const line of body.slice(1)) {
      const m = line.match(/^ {2}- "([^"]+)"$/);
      if (!m) fail(`${f}: unexpected frontmatter line: ${JSON.stringify(line)}`);
      else patterns.push(m[1]);
    }
    if (patterns.length === 0) fail(`${f}: empty paths list`);
    for (const p of patterns) {
      if (/<<|>>/.test(p)) fail(`${f}: placeholder in path pattern (never matches): ${p}`);
      if (/\\/.test(p) || /^(\.\/|\/)/.test(p)) fail(`${f}: use project-relative forward-slash patterns: ${p}`);
      if ((p.match(/\{/g) ?? []).length !== (p.match(/\}/g) ?? []).length) fail(`${f}: unbalanced braces: ${p}`);
      if ((p.match(/\[/g) ?? []).length !== (p.match(/\]/g) ?? []).length) fail(`${f}: unbalanced brackets: ${p}`);
      const firstGlob = p.search(/[*?{[]/);
      const staticPart = firstGlob === -1 ? p : p.slice(0, firstGlob);
      const prefix = staticPart.includes('/') ? staticPart.slice(0, staticPart.lastIndexOf('/') + 1) : '';
      const compatible = prefix === '' || declared.some((d) => d.startsWith(prefix) || prefix.startsWith(d));
      if (!compatible) fail(`${f}: path "${p}" is outside the structure declared in CLAUDE.md`);
    }
    if (!claudeMd.includes(`\`${f}\``)) fail(`${f}: not listed in CLAUDE.md § Path-scoped regels`);
  }
  for (const m of claudeMd.matchAll(/`(\.claude\/rules\/[^`]+\.md)`/g)) {
    if (!ruleFiles.includes(m[1])) fail(`CLAUDE.md lists a rule that does not exist: ${m[1]}`);
  }
});

check('Placeholders are registered and well-formed', (fail) => {
  const registry = placeholderRegistry();
  if (!registry) {
    fail('LEESMIJ.md has no placeholder-registry block');
    return;
  }
  const used = new Set();
  for (const f of TEXT_FILES) {
    let inRegistry = false;
    for (const { text, n } of lines(f)) {
      if (text.includes('placeholder-registry:start')) inRegistry = true;
      if (text.includes('placeholder-registry:end')) inRegistry = false;
      for (const m of text.matchAll(/<<([^<>\n]*)>>/g)) {
        const name = m[1];
        if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
          fail(`${f}:${n}: malformed placeholder <<${name}>> (use <<UPPER_SNAKE>>)`);
          continue;
        }
        if (META_PLACEHOLDERS.has(name) || inRegistry) continue;
        used.add(name);
        if (!registry.has(name)) fail(`${f}:${n}: placeholder <<${name}>> is not in the LEESMIJ.md registry`);
        else if (PROJECT_MODE && f !== 'START-PROMPT.md') fail(`${f}:${n}: unresolved placeholder <<${name}>>`);
      }
    }
  }
  const unused = [...registry].filter((x) => !used.has(x));
  if (unused.length) console.log(`  note: registered but not used in files (filled in on the site later): ${unused.join(', ')}`);
});

check('No unresolved TODO / TBD / ??? markers in prose', (fail) => {
  for (const f of MD_FILES) {
    for (const { text, n, inFence } of lines(f)) {
      if (inFence) continue;
      if (/\bTODO\b|\bTBD\b|\?\?\?/.test(stripInlineCode(text))) fail(`${f}:${n}: ${text.trim()}`);
    }
  }
});

check('Internal references resolve (case-sensitive)', (fail) => {
  const refRe = /`((?:docs|\.claude|scripts|\.github)\/[^`\s]*|CLAUDE\.md|LEESMIJ\.md|START-PROMPT\.md|\.env\.example|\.gitignore)`(\s*§\s*([^§)|\n.,;:—]+?)(?=\s+(?:en|and)\b|[)|.,;:—]|\s*$))?/g;
  // Personal or generated files that are referenced on purpose but not shipped.
  const OPTIONAL = new Set(['.claude/settings.local.json']);
  for (const f of MD_FILES) {
    for (const { text, n, inFence } of lines(f)) {
      if (inFence) continue;
      // backtick references
      for (const m of text.matchAll(refRe)) {
        const target = m[1].replace(/:\d+$/, '');
        if (/[*<{]/.test(target) || OPTIONAL.has(target)) continue;
        if (!existsExact(target)) {
          fail(`${f}:${n}: reference to missing path \`${target}\``);
          continue;
        }
        const section = m[3]?.trim();
        if (section && target.endsWith('.md')) {
          const headings = read(target)
            .split(/\r?\n/)
            .filter((l) => /^#{1,4} /.test(l))
            .map((l) => l.replace(/^#+\s*/, '').replace(/[`*]/g, '').toLowerCase());
          const want = section.replace(/[`*]/g, '').toLowerCase();
          if (!headings.some((h) => h.startsWith(want) || h.replace(/^\d+\.\s*/, '').startsWith(want))) {
            fail(`${f}:${n}: \`${target}\` has no section starting with "${section}"`);
          }
        }
      }
      // @imports (only meaningful in CLAUDE.md files, outside inline code)
      if (/(^|\/)CLAUDE\.md$/.test(f)) {
        for (const m of stripInlineCode(text).matchAll(/(?:^|\s)@([^\s]+)/g)) {
          const target = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1]));
          if (!existsExact(target)) fail(`${f}:${n}: @import of missing file ${m[1]}`);
        }
      }
      // markdown links
      for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        const href = m[1];
        if (/^(https?:|mailto:|#)/.test(href)) continue;
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(f), href.split('#')[0]));
        if (!existsExact(target)) fail(`${f}:${n}: broken link ${href}`);
      }
    }
  }
});

check('Every document is indexed in CLAUDE.md', (fail) => {
  const claudeMd = read('CLAUDE.md');
  const section = claudeMd.split(/^## Documenten\s*$/m)[1]?.split(/^## /m)[0] ?? '';
  const indexed = new Set([...section.matchAll(/`(docs\/[^`]+\.md)`/g)].map((m) => m[1]));
  for (const f of MD_FILES.filter((x) => x.startsWith('docs/'))) {
    if (!indexed.has(f)) fail(`not in CLAUDE.md § Documenten: ${f}`);
  }
  for (const f of indexed) if (!existsExact(f)) fail(`indexed but missing: ${f}`);
});

check('CLAUDE.md stays compact', (fail) => {
  const count = read('CLAUDE.md').split(/\r?\n/).length;
  if (count > 200) fail(`CLAUDE.md has ${count} lines; keep it at or under 200 (move detail to rules or docs)`);
});

check('Decisions: unique ids, valid statuses, consistent dependencies', (fail) => {
  const { decisions, dupes } = parseDecisions();
  for (const d of dupes) fail(`duplicate or malformed decision: ${d}`);
  if (decisions.size === 0) fail('no decisions found (expected "## D-NN · Title" headings)');
  const ids = (s) => (s && s !== '—' ? s.split(/\s*,\s*/).filter(Boolean) : []);
  for (const d of decisions.values()) {
    const where = `${d.id} (line ${d.line})`;
    const status = d.fields.Status;
    if (!status) fail(`${where}: missing Status`);
    else if (!DECISION_STATUSES.includes(status)) fail(`${where}: invalid status "${status}"`);
    if (!('Depends on' in d.fields)) fail(`${where}: missing "Depends on" (use — for none)`);
    const deps = ids(d.fields['Depends on']);
    for (const dep of deps) {
      if (!/^D-\d{2}$/.test(dep)) fail(`${where}: malformed dependency "${dep}"`);
      else if (!decisions.has(dep)) fail(`${where}: depends on unknown ${dep}`);
      else if (dep === d.id) fail(`${where}: depends on itself`);
    }
    const undecided = deps.filter((x) => decisions.get(x)?.fields.Status !== 'DECIDED');
    if (status === 'BLOCKED' && undecided.length === 0) fail(`${where}: BLOCKED but all dependencies are DECIDED (should be READY or OPEN)`);
    if ((status === 'READY' || status === 'DECIDED') && undecided.length) fail(`${where}: ${status} while ${undecided.join(', ')} not DECIDED`);
    if (status === 'DECIDED' && !/^\d{4}-\d{2}-\d{2}$/.test(d.fields.Decided ?? '')) fail(`${where}: DECIDED needs "Decided: YYYY-MM-DD"`);
    if (status === 'SUPERSEDED') {
      const by = d.fields['Superseded by'];
      if (!by || !decisions.has(by)) fail(`${where}: SUPERSEDED needs "Superseded by" an existing decision`);
    }
  }
  // cycles
  const state = new Map();
  const visit = (id, stack) => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'active') {
      fail(`dependency cycle: ${[...stack, id].join(' → ')}`);
      return;
    }
    state.set(id, 'active');
    for (const dep of ids(decisions.get(id)?.fields['Depends on'])) if (decisions.has(dep)) visit(dep, [...stack, id]);
    state.set(id, 'done');
  };
  for (const id of decisions.keys()) visit(id, []);
  // references elsewhere
  for (const f of TEXT_FILES) {
    for (const { text, n } of lines(f)) {
      for (const m of text.matchAll(/\bD-(\d{2})\b/g)) {
        const id = `D-${m[1]}`;
        if (!decisions.has(id) && !(f === 'docs/DECISIONS.md' && id === 'D-99')) fail(`${f}:${n}: reference to unknown decision ${id}`);
      }
    }
  }
});

check('Measured claims carry a date', (fail) => {
  for (const f of MD_FILES) {
    for (const { text, n } of lines(f)) {
      const prose = stripInlineCode(text);
      for (const m of prose.matchAll(/\bGEMETEN\b(.{0,24})/g)) {
        if (!/^\**:?\**\s*(\d{4}-\d{2}-\d{2}|<<DATUM>>)/.test(m[1])) {
          fail(`${f}:${n}: GEMETEN without a date (write \`GEMETEN\` in backticks when naming the label): ${text.trim()}`);
        }
      }
    }
  }
});

// ---------------------------------------------------------------- summary

let failed = 0;
for (const r of results) {
  const ok = r.failures.length === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${r.name}`);
  for (const msg of r.failures) console.log(`      - ${msg}`);
}

const count = (name) => results.find((r) => r.name.startsWith(name))?.failures.length ?? 0;
console.log('');
console.log(`Mode:                   ${PROJECT_MODE ? 'project' : 'template'}`);
console.log(`Files scanned:          ${ALL_FILES.length}`);
console.log(`Broken references:      ${count('Internal references')}`);
console.log(`Placeholder issues:     ${count('Placeholders')}`);
console.log(`Invalid configs:        ${count('JSON configuration') + count('Claude Code settings') + count('Rule frontmatter')}`);
console.log(`Decision issues:        ${count('Decisions')}`);
console.log(`Template validator:     ${failed === 0 ? 'PASS' : `FAIL (${failed} of ${results.length} checks)`}`);
process.exit(failed === 0 ? 0 : 1);
