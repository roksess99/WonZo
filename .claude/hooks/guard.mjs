#!/usr/bin/env node
// PreToolUse guard for Claude Code.
//
// Enforces the hard boundaries from CLAUDE.md that must not depend on model
// behaviour: secrets, destructive git, pushes to main, production actions,
// destructive SQL, download-and-execute, and writes outside the project.
//
// Contract (Claude Code hooks): JSON on stdin with `tool_name` and
// `tool_input`. Exit 2 blocks the call and shows stderr to Claude. Exit 0
// means "no objection"; the normal permission flow still applies.
//
// Fail closed: if the input cannot be parsed or the guard itself crashes, the
// call is blocked. A broken guard must not silently become no guard.
//
// This is a guard rail, not a sandbox: a sufficiently creative command can
// evade pattern matching. It exists to stop the common mistakes. Tests:
// `node scripts/test-guard.mjs`.

import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROTECTED_BRANCHES = ['main', 'master'];

// ---------------------------------------------------------------- helpers

const isWin = process.platform === 'win32';

function norm(p) {
  if (!p) return '';
  let s = String(p).trim().replace(/^["']|["']$/g, '');
  // Git Bash style /c/foo → C:/foo
  if (isWin && /^\/[a-zA-Z]\//.test(s)) s = `${s[1]}:${s.slice(2)}`;
  s = path.resolve(s);
  return isWin ? s.toLowerCase() : s;
}

function isInside(child, parent) {
  if (!child || !parent) return false;
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function isSecretFile(p) {
  const base = path.basename(String(p)).toLowerCase();
  if (base === '.env.example') return false;
  if (/^\.env(\..+)?$/.test(base)) return true;
  if (/\.(pem|key|p12|pfx)$/.test(base)) return true;
  if (/^id_(rsa|ed25519|ecdsa|dsa)(\.pub)?$/.test(base)) return !base.endsWith('.pub');
  return false;
}

// Split a shell command into simple segments on common operators. Not a full
// parser; good enough to evaluate each sub-command separately.
function segments(command) {
  return command
    .split(/&&|\|\||;|\||\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function tokens(segment) {
  return segment.match(/"[^"]*"|'[^']*'|\S+/g)?.map((t) => t.replace(/^["']|["']$/g, '')) ?? [];
}

function currentBranch(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- secrets in content

const SECRET_PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/\b[sr]k_live_[0-9A-Za-z]{16,}/, 'live payment API key'],
  [/\blive_[A-Za-z0-9]{30,}\b/, 'live API key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key id'],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, 'GitHub token'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'Google API key'],
];

function findSecret(text) {
  if (!text) return null;
  for (const [re, label] of SECRET_PATTERNS) if (re.test(text)) return label;
  return null;
}

// .env.example is committed: secret-looking keys must stay empty or a placeholder.
function envExampleViolation(text) {
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]*(TOKEN|SECRET|PASSWORD|_KEY|APIKEY)[A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const value = m[3].trim();
    if (value === '' || value.startsWith('<<') || /^(changeme|example|test_?)/i.test(value)) continue;
    return m[1];
  }
  return null;
}

// ---------------------------------------------------------------- shell rules

const ENV_FILE_RE = /(^|[\s'"`=:/\\<>(])\.env(\.[A-Za-z0-9_.-]+)?(?=$|[\s'"`;|&)<>])/g;

// Segments that only carry a human-written message (commit/tag text). Content
// checks skip them so "chore: add .env to .gitignore" is not a false positive.
// Those commands are still subject to the git rules below and to `ask` rules.
const MESSAGE_SEGMENT_RE = /^git\s+(-C\s+\S+\s+)?(commit|tag)\b/;

function checkContent(seg) {
  for (const m of seg.matchAll(ENV_FILE_RE)) {
    if (m[2] && m[2].toLowerCase() === '.example') continue;
    return 'Access to .env files is blocked. Use .env.example for variable names; ask the user for values.';
  }
  if (/(^|[\s/\\'"])(id_rsa|id_ed25519|id_ecdsa)(?![\w.]*\.pub)\b|\.(pem|p12|pfx)\b/.test(seg)) {
    return 'Access to private key files is blocked.';
  }
  if (/\b(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE(\s+TABLE)?\s+\w)/i.test(seg)) {
    return 'Destructive SQL (DROP/TRUNCATE) is blocked. Write a reviewed migration instead.';
  }
  if (/\bDELETE\s+FROM\s+[\w."`]+\s*(;|"|'|$)/im.test(seg)) {
    return 'DELETE without WHERE is blocked.';
  }
  return null;
}

function checkShell(command, ctx) {
  const full = command;

  // Download and execute (spans a pipe, so checked on the full command)
  if (/\b(curl|wget|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^|\n]*\|\s*(sudo\s+)?(sh|bash|zsh|node|python3?|iex|Invoke-Expression)\b/i.test(full)) {
    return 'Piping downloaded content into an interpreter is blocked. Download, inspect, then ask.';
  }

  for (const seg of segments(full)) {
    const t = tokens(seg);
    if (t.length === 0) continue;
    const cmd = path.basename(t[0]).toLowerCase().replace(/\.exe$/, '');
    const isMessageSegment = MESSAGE_SEGMENT_RE.test(seg);

    if (!isMessageSegment) {
      const contentIssue = checkContent(seg);
      if (contentIssue) return contentIssue;
    }

    // Environment dumps
    if (cmd === 'printenv' || (cmd === 'env' && t.length === 1)) {
      return 'Dumping the environment is blocked: it exposes secrets.';
    }
    if (/^(get-childitem|gci|dir|ls)$/.test(cmd) && t.some((x) => /^env:/i.test(x))) {
      return 'Listing the environment drive is blocked: it exposes secrets.';
    }

    // Production actions are performed by a human, not by Claude
    if (
      !isMessageSegment &&
      (/\bterraform\s+(apply|destroy|import|state\s+rm)\b/.test(seg) ||
      /\bkubectl\s+(apply|create|delete|replace|scale|rollout|drain|patch|edit|exec)\b/.test(seg) ||
      /\bhelm\s+(install|upgrade|uninstall|rollback)\b/.test(seg) ||
      /\b(vercel|netlify)\b.*--prod\b/.test(seg) ||
      /\b(fly|flyctl)\s+deploy\b/.test(seg) ||
      /\bgh\s+workflow\s+run\b/.test(seg) ||
      /\b(deploy|release|migrate|migration)\b.*\b(prod|production)\b/i.test(seg) ||
      /\b(NODE_ENV|APP_ENV|ENVIRONMENT)=(prod|production)\b/.test(seg))
    ) {
      return 'Production actions (deploy, infra, production migrations) require a human operator. Describe the command; the user runs it.';
    }

    // Recursive delete outside safe targets
    if (cmd === 'rm' || /^(remove-item|ri|rmdir|rd|del)$/.test(cmd)) {
      const recursive = t.some((x) => /^-[a-zA-Z]*[rR][a-zA-Z]*$/.test(x) || x === '--recursive' || /^-recurse$/i.test(x));
      if (recursive) {
        const targets = t.slice(1).filter((x) => !x.startsWith('-'));
        for (const target of targets) {
          if (/^(\/|\/\*|~|~[\\/].*|\$HOME.*|\*|\.|\.[\\/]?\*?|\.\.([\\/].*)?|[A-Za-z]:[\\/]?)$/.test(target)) {
            return `Recursive delete of "${target}" is blocked.`;
          }
          const isAbs = path.isAbsolute(target) || /^[A-Za-z]:[\\/]/.test(target) || /^\/[a-zA-Z]\//.test(target);
          if (isAbs) {
            const n = norm(target);
            if (!ctx.writableRoots.some((r) => isInside(n, r)) || n === ctx.projectDir) {
              return `Recursive delete outside the project ("${target}") is blocked.`;
            }
          }
        }
      }
    }

    if (cmd !== 'git') continue;

    // git [-C dir] [-c k=v] <sub> ...
    let i = 1;
    while (i < t.length && /^-(C|c)$/.test(t[i])) i += 2;
    const sub = t[i];
    const args = t.slice(i + 1);
    const has = (re) => args.some((a) => re.test(a));

    if (has(/^--no-verify$/) || (sub === 'commit' && has(/^-[a-zA-Z]*n[a-zA-Z]*$/))) {
      return 'Skipping git hooks (--no-verify) is blocked.';
    }

    if (sub === 'push') {
      if (has(/^(--force|--force-with-lease(=.*)?|--force-if-includes|--mirror|--delete|--prune)$/) || has(/^-[a-zA-Z]*[fd][a-zA-Z]*$/)) {
        return 'Force push, mirror push and remote deletes are blocked.';
      }
      const positional = args.filter((a) => !a.startsWith('-'));
      if (positional.some((a) => a.startsWith('+') || a.startsWith(':'))) {
        return 'Force-push or delete refspecs (+ref, :ref) are blocked.';
      }
      const refspecs = positional.slice(1);
      const targetsProtected = refspecs.some((r) => {
        let dst = (r.includes(':') ? r.split(':').pop() : r).replace(/^refs\/heads\//, '');
        if (dst === 'HEAD') dst = currentBranch(ctx.cwd) ?? dst;
        return PROTECTED_BRANCHES.includes(dst);
      });
      if (targetsProtected) return `Pushing to a protected branch (${PROTECTED_BRANCHES.join('/')}) is blocked. Open a pull request.`;
      if (refspecs.length === 0 && !has(/^--(all|tags)$/)) {
        const branch = currentBranch(ctx.cwd);
        if (branch && PROTECTED_BRANCHES.includes(branch)) {
          return `You are on ${branch}; pushing it is blocked. Work on a feature branch and open a pull request.`;
        }
      }
      if (has(/^--all$/)) return 'git push --all is blocked; push one feature branch explicitly.';
    }

    if (sub === 'reset' && has(/^--(hard|merge|keep)$/)) return 'git reset --hard/--merge/--keep is blocked: it discards work.';
    if (sub === 'clean' && has(/^-[a-zA-Z]*f[a-zA-Z]*$|^--force$/)) return 'git clean -f is blocked: it deletes untracked files.';
    if (sub === 'checkout' && (args.includes('--') || has(/^\.$/) || has(/^(-f|--force)$/))) return 'git checkout that discards changes is blocked.';
    if (sub === 'restore' && !(has(/^(--staged|-S)$/) && !has(/^(--worktree|-W)$/))) return 'git restore of the working tree is blocked: it discards changes.';
    if (sub === 'branch' && (has(/^-[a-zA-Z]*D[a-zA-Z]*$/) || (has(/^(-d|--delete)$/) && has(/^(-f|--force)$/)))) return 'Force-deleting branches is blocked.';
    if (sub === 'stash' && /^(drop|clear)$/.test(args[0] ?? '')) return 'Dropping stashes is blocked.';
    if (sub === 'add' && has(/^(-f|--force)$/)) return 'git add --force is blocked: it adds ignored files such as .env.';
    if (/^(filter-branch|filter-repo|replace)$/.test(sub ?? '')) return `git ${sub} rewrites history and is blocked.`;
    if (sub === 'reflog' && args[0] === 'expire') return 'Expiring the reflog is blocked.';
    if (sub === 'gc' && has(/^--prune(=.*)?$/)) return 'git gc --prune is blocked.';
    if (sub === 'update-ref' && has(/^-d$/)) return 'Deleting refs is blocked.';
    if (sub === 'config' && has(/^core\.hooksPath$/)) return 'Changing core.hooksPath is blocked.';
  }
  return null;
}

// ---------------------------------------------------------------- evaluation

export function evaluate(input, env = process.env) {
  const tool = input?.tool_name;
  const ti = input?.tool_input ?? {};
  const cwd = input?.cwd || process.cwd();
  const projectDir = norm(env.CLAUDE_PROJECT_DIR || cwd);
  const writableRoots = [
    projectDir,
    norm(os.tmpdir()),
    norm(path.join(os.homedir(), '.claude')),
    input?.scratchpad_dir ? norm(input.scratchpad_dir) : null,
  ].filter(Boolean);
  const ctx = { cwd: norm(cwd), projectDir, writableRoots };

  if (tool === 'Bash' || tool === 'PowerShell') {
    return checkShell(String(ti.command ?? ''), ctx);
  }

  const paths = [ti.file_path, ti.notebook_path, ti.path, ...(Array.isArray(ti.paths) ? ti.paths : [])].filter(Boolean);

  for (const p of paths) {
    if (isSecretFile(p)) return `Access to ${path.basename(p)} is blocked: it may contain secrets.`;
  }

  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    for (const p of paths) {
      const n = norm(p);
      if (!writableRoots.some((r) => isInside(n, r))) {
        return `Writing outside the project is blocked: ${p}`;
      }
      if (n.split(path.sep).includes('.git')) return 'Editing files inside .git is blocked.';
    }
    const texts = [ti.content, ti.new_string, ti.new_str, ti.new_source, ...(Array.isArray(ti.edits) ? ti.edits.map((e) => e?.new_string) : [])].filter((x) => typeof x === 'string');
    for (const text of texts) {
      const secret = findSecret(text);
      if (secret) return `Content looks like a real ${secret}. Secrets belong in .env (never committed), not in files.`;
    }
    if (paths.some((p) => path.basename(p).toLowerCase() === '.env.example')) {
      for (const text of texts) {
        const key = envExampleViolation(text);
        if (key) return `.env.example is committed: ${key} must stay empty or a <<PLACEHOLDER>>.`;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------- main

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.stderr.write('guard: could not parse hook input; blocking to be safe.\n');
    process.exit(2);
  }
  const reason = evaluate(input);
  if (reason) {
    process.stderr.write(`Blocked by .claude/hooks/guard.mjs: ${reason}\n`);
    process.exit(2);
  }
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(`guard: internal error (${err?.message ?? err}); blocking to be safe.\n`);
    process.exit(2);
  });
}
