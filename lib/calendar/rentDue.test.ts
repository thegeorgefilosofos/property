// Αυστηρά τεστ για τη λογική auto-mark-paid ενοικίου (rentDue.ts).
// Τρέξε: npx tsx lib/calendar/rentDue.test.ts
import { rentDueOccurrence, applyExdate } from './rentDue'

let passed = 0, failed = 0
const fails: string[] = []
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; if (fails.length < 80) fails.push(name) } }

// ── rentDueOccurrence: η μέρα από τη βάση, ο μήνας/έτος από την πληρωμή ────────
ok('βάση 05 → occ 05', rentDueOccurrence('2026-08-05', 2026, 3) === '2026-03-05')
ok('βάση 28 → occ 28', rentDueOccurrence('2026-08-28', 2027, 12) === '2027-12-28')
ok('μονοψήφιος μήνας pad', rentDueOccurrence('2026-08-01', 2026, 1) === '2026-01-01')
ok('χωρίς μέρα → 01', rentDueOccurrence('', 2026, 5) === '2026-05-01')

// ── applyExdate: πρόσθεση/αφαίρεση, idempotent ────────────────────────────────
ok('paid σε κενό → [occ]', JSON.stringify(applyExdate([], '2026-03-05', true)) === JSON.stringify(['2026-03-05']))
ok('paid σε null → [occ]', JSON.stringify(applyExdate(null, '2026-03-05', true)) === JSON.stringify(['2026-03-05']))
ok('paid ενώ υπάρχει → no-op (null)', applyExdate(['2026-03-05'], '2026-03-05', true) === null)
ok('unpay υπάρχον → κενό', JSON.stringify(applyExdate(['2026-03-05'], '2026-03-05', false)) === JSON.stringify([]))
ok('unpay ανύπαρκτο → no-op (null)', applyExdate([], '2026-03-05', false) === null)
ok('paid κρατά τα υπόλοιπα', JSON.stringify(applyExdate(['2026-01-05'], '2026-03-05', true)) === JSON.stringify(['2026-01-05', '2026-03-05']))
ok('unpay αφαιρεί μόνο το σωστό', JSON.stringify(applyExdate(['2026-01-05', '2026-03-05'], '2026-03-05', false)) === JSON.stringify(['2026-01-05']))

// ── Πλήρης κύκλος: πληρωμή Μαρτίου → κλείνει, αναίρεση → ξανανοίγει ────────────
{
  const base = '2026-08-05'
  let ex: string[] = []
  const occ = rentDueOccurrence(base, 2026, 3)
  const afterPay = applyExdate(ex, occ, true); if (afterPay) ex = afterPay
  ok('κύκλος: μετά την πληρωμή κρυμμένο', ex.includes('2026-03-05'))
  const afterUnpay = applyExdate(ex, occ, false); if (afterUnpay) ex = afterUnpay
  ok('κύκλος: μετά την αναίρεση ορατό ξανά', !ex.includes('2026-03-05'))
}
// δεν διπλογράφει σε επαναλαμβανόμενη πληρωμή
{
  const ex: string[] = ['2026-03-05']
  const r = applyExdate(ex, '2026-03-05', true)
  ok('διπλή πληρωμή δεν διπλογράφει', r === null && ex.length === 1)
}

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\nrentDue.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed) { console.log('FAILED:\n' + fails.map((f) => '  ✗ ' + f).join('\n')); process.exit(1) }
console.log('όλα πέρασαν')
