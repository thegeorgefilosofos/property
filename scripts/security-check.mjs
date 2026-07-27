#!/usr/bin/env node
// Automated security gate — runs in CI on every PR/push, blocking.
//
// A free substitute for the paid GitHub secret-scanning/push-protection (which
// isn't available on a private repo without Advanced Security). It scans every
// git-TRACKED file for committed credentials and other must-never-ship patterns,
// and fails the build (exit 1) on any hit. Add allow-listed exceptions sparingly.

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// Files we never scan for secrets (docs describe patterns; examples are templates).
const SKIP = [
  /(^|\/)\.env\.example$/,
  /(^|\/)scripts\/security-check\.mjs$/, // this file names the patterns
  /(^|\/)docs\//,                        // documentation references keys by shape
  /(^|\/)package-lock\.json$/,
]

// Secret signatures. Each: {name, re}. Kept specific to avoid false positives.
const SECRET_PATTERNS = [
  { name: 'Supabase personal access token (sbp_)', re: /\bsbp_[a-z0-9]{36,}\b/ },
  { name: 'Anthropic API key (sk-ant-)', re: /\bsk-ant-[a-zA-Z0-9_\-]{20,}/ },
  { name: 'Resend API key (re_)', re: /\bre_[A-Za-z0-9]{20,}\b/ },
  { name: 'OpenAI key (sk-)', re: /\bsk-[a-zA-Z0-9]{40,}\b/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_\-]{35}\b/ },
  { name: 'Stripe secret key', re: /\b(sk|rk)_live_[0-9a-zA-Z]{24,}\b/ },
  { name: 'Private key block', re: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  // A Supabase service_role JWT decodes to include "role":"service_role".
  { name: 'Supabase service_role JWT', re: /eyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/ },
]

// A tracked .env file (other than the example) must never exist.
const TRACKED_ENV = /(^|\/)\.env(\.[a-z]+)?$/

// ── Egress guard: hosts that must never appear in shipped source ────────────
// Not secrets — silent privacy leaks. A third-party asset URL in a page or a
// generated document hands that party the user's IP address on every render,
// with no consent step and nothing visible to the user.
//
// Google Fonts is here because it actually happened: four report generators
// carried `<link href="fonts.googleapis.com">`, so every printed statement
// leaked the landlord's IP to Google. The app's CSP already said
// `font-src 'self'` — but those documents open via `window.open('')` into
// `about:blank`, where no CSP header exists to enforce anything. The lesson is
// that a header cannot guard code it never covers. This scan can.
//
// Fonts are self-hosted in public/fonts/ and emitted by lib/print/fonts.ts.
const EGRESS_PATTERNS = [
  { name: 'Google Fonts stylesheet (leaks user IP)', re: /fonts\.googleapis\.com/ },
  { name: 'Google Fonts asset host (leaks user IP)', re: /fonts\.gstatic\.com/ },
  { name: 'External QR service (leaks payload in URL)', re: /api\.qrserver\.com/ },
  // A CDN import inside an edge function puts a third party in the deploy path —
  // and, worse, in the ROLLBACK path. On 2026-07-27 esm.sh returned 522 and no
  // function could be deployed at all; had production been broken at that moment,
  // `git revert` would have pointed straight back at the same dead host. The
  // range (`@2`) was also resolved by the CDN at deploy time, so two deploys a
  // week apart could ship different library code with nothing recording it.
  // Use `npm:<pkg>@<exact-version>` instead.
  { name: 'CDN import in an edge function (unreproducible deploy — use npm:)',
    re: /from\s+['"]https:\/\/(esm\.sh|deno\.land\/x|unpkg\.com|cdn\.skypack\.dev)\// },
]

// Files allowed to name these hosts: the guard itself, the module that replaced
// them, its test, and documentation that explains the history.
const EGRESS_SKIP = [
  /(^|\/)scripts\/security-check\.mjs$/,
  /(^|\/)lib\/print\/fonts\.ts$/,
  /(^|\/)lib\/print\/fonts\.test\.ts$/,
  /(^|\/)lib\/qr\.ts$/,
  /(^|\/)lib\/qr\.test\.ts$/,   // εξηγεί στα σχόλια γιατί έφυγε το qrserver
  /(^|\/)proxy\.ts$/,
  /(^|\/)docs\//,
]

function trackedFiles() {
  return execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean)
}

const files = trackedFiles()
const findings = []

for (const f of files) {
  if (TRACKED_ENV.test(f) && !/\.env\.example$/.test(f)) {
    findings.push(`Tracked env file must not be committed: ${f}`)
  }
  let text
  try { text = readFileSync(f, 'utf8') } catch { continue }
  if (text.includes(String.fromCharCode(0))) continue // skip binary files

  // Egress guard runs on its own allow-list: the secret SKIP list exempts all of
  // docs/, but a leaking asset URL in a shipped file must be caught regardless.
  if (!EGRESS_SKIP.some(re => re.test(f))) {
    for (const { name, re } of EGRESS_PATTERNS) {
      const m = text.match(re)
      if (m) findings.push(`${name} in ${f}: “${m[0]}”`)
    }
  }

  if (SKIP.some(re => re.test(f))) continue
  for (const { name, re } of SECRET_PATTERNS) {
    const m = text.match(re)
    if (m) {
      // For the generic JWT pattern, only flag if it's clearly a service_role token
      // context to avoid catching sample/anon tokens in tests.
      if (name.includes('service_role') && !/service_role/.test(text)) continue
      findings.push(`${name} in ${f}: “${m[0].slice(0, 24)}…”`)
    }
  }
}

if (findings.length) {
  console.error('🔴 Security check FAILED — potential secrets / forbidden files:')
  for (const x of findings) console.error('  ✗ ' + x)
  console.error('\nRotate any real secret immediately and purge it from git history.')
  process.exit(1)
}
console.log(`✅ Security check passed — scanned ${files.length} tracked files, no secrets found.`)
