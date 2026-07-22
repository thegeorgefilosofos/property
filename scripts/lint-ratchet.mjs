#!/usr/bin/env node
// Lint-debt ratchet — a free, standardized guard against lint regressions.
//
// The project carries legacy ESLint debt (mostly no-explicit-any and unused
// vars) that isn't worth a risky mass-fix. Instead of making lint fully blocking
// (which would fail every PR) or fully informational (which lets debt grow), this
// enforces a MONOTONIC ceiling: the number of lint errors may only go DOWN.
//
// CI fails if errors exceed scripts/lint-baseline.json → any NEW error must be
// fixed. When you clean some up, lower the baseline to lock the gain in.

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const baseline = JSON.parse(readFileSync(new URL('./lint-baseline.json', import.meta.url), 'utf8'))
const cap = baseline.maxErrors

let raw = ''
try {
  raw = execSync('npx eslint . -f json', { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })
} catch (e) {
  // ESLint exits non-zero when errors exist; the JSON report is still on stdout.
  raw = e.stdout || ''
}
if (!raw.trim()) {
  console.error('lint-ratchet: ESLint produced no output — cannot evaluate.')
  process.exit(1)
}

let results
try {
  results = JSON.parse(raw)
} catch {
  console.error('lint-ratchet: could not parse ESLint JSON output.')
  process.exit(1)
}

let errors = 0
const byRule = {}
for (const file of results) {
  for (const m of file.messages) {
    if (m.severity === 2) {
      errors++
      const r = m.ruleId || '(parse)'
      byRule[r] = (byRule[r] || 0) + 1
    }
  }
}

const top = Object.entries(byRule).sort((a, b) => b[1] - a[1]).slice(0, 8)

if (errors > cap) {
  console.error(`🔴 Lint ratchet FAILED — ${errors} errors > baseline ${cap} (+${errors - cap}).`)
  console.error('   New lint errors were introduced. Fix them before merging.')
  console.error('   Top rules now:')
  for (const [r, c] of top) console.error(`     ${String(c).padStart(4)}  ${r}`)
  process.exit(1)
}

console.log(`✅ Lint ratchet passed — ${errors} errors ≤ baseline ${cap}.`)
if (errors < cap) {
  console.log(`   ↓ Improved by ${cap - errors}. Lower "maxErrors" in scripts/lint-baseline.json to ${errors} to lock it in.`)
}
