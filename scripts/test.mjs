#!/usr/bin/env node
// Test runner — auto-discovers and runs EVERY *.test.ts (plus the _shared
// verify-*.ts domain verifiers) via tsx, each in its own process so a failing
// suite's process.exit(1) can't abort the run. Fails (exit 1) if any suite fails.
//
// Replaces the previous hand-maintained &&-chained list in package.json, which
// had silently dropped 25 of 63 test files (live modules — loans, pricing,
// entitlements, market returns, tax, depreciation) from CI. Glob discovery means
// a new *.test.ts is picked up automatically and can never be orphaned again.
//
// TZ is pinned to UTC so time-dependent suites are deterministic regardless of
// where the runner executes (CI or a local machine in any timezone).

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { findTests } from './lib/find-tests.mjs'

// Domain verifiers that aren't named *.test.ts but are part of the suite.
const EXTRA = [
  'supabase/functions/_shared/verify-policy.ts',
  'supabase/functions/_shared/verify-gender.ts',
]

// Η ανακάλυψη ζει στο scripts/lib/find-tests.mjs, μαζί με τον φύλακα της ουράς:
// όσο η λίστα φακέλων ήταν γραμμένη δύο φορές, οι δύο εκδοχές απέκλιναν και το
// components/confirmBus.test.ts δεν έτρεχε ποτέ.
const files = findTests()
for (const e of EXTRA) if (existsSync(e)) files.push(e)
files.sort()

if (files.length === 0) {
  console.error('No test files found — refusing to pass a no-op test run.')
  process.exit(1)
}

console.log(`Running ${files.length} test suites (TZ=UTC)…\n`)
let passed = 0
const failed = []
for (const f of files) {
  const res = spawnSync('npx', ['tsx', f], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, TZ: 'UTC', NEXT_TELEMETRY_DISABLED: '1' },
  })
  if (res.status === 0) passed++
  else failed.push(f)
}

console.log(`\n──────────────────────────────────────────`)
console.log(`Test suites: ${files.length} · ✓ ${passed} · ✗ ${failed.length}`)
if (failed.length) {
  console.log('FAILED:')
  for (const f of failed) console.log('  ✗ ' + f)
  process.exit(1)
}
console.log('✅ All test suites passed.')
