// ═══════════════════════════════════════════════════════════════════════════
// Η edge function των προτάσεων περνά από το ΙΔΙΟ ταβάνι κόστους AI.
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ: η smart-suggestions καλούσε το Anthropic κατευθείαν, χωρίς
// bump_ai_usage. Δεύτερος δρόμος προς το ίδιο κλειδί, χωρίς ταβάνι — το μηνιαίο
// όριο και η κοινή δεξαμενή απλώς παρακάμπτονταν. Δεν έσκαγε τίποτα· φαινόταν
// μόνο στον λογαριασμό στο τέλος του μήνα.
//
// ΓΙΑΤΙ ΕΛΕΓΧΕΙ ΚΕΙΜΕΝΟ ΚΑΙ ΟΧΙ ΣΥΜΠΕΡΙΦΟΡΑ: η index.ts είναι Deno (Deno.env
// στο module scope, Deno.serve) — δεν φορτώνεται σε Node. Αυτό όμως που πρέπει
// να φυλαχτεί είναι δομικό και φαίνεται στην πηγή: ότι ο έλεγχος υπάρχει, ότι
// τρέχει ΠΡΙΝ την κλήση του μοντέλου και ότι τα νούμερα δεν έχουν αποκλίνει
// από το lib/billing/aiLimits.ts.
//
// Ο ΚΑΘΡΕΦΤΗΣ: το Deno δεν φτάνει στο lib/ και το supabase-deploy.yml ανεβάζει
// functions μόνο σε αλλαγή του supabase/**. Άρα τα νούμερα αντιγράφονται στην
// edge function — και ΑΥΤΟ το τεστ είναι που τα κρατά ίδια με την πηγή.
//
// Τρέξε: npx tsx supabase/functions/smart-suggestions/index.test.ts
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  MAX_PER_MINUTE, FREE_POOL_PER_MONTH,
  dailyLimitsByRank, monthlyLimitsByRank, PLAN_RANK_ORDER,
} from '../../../lib/billing/aiLimits.ts'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) {
  if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) }
}

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.ts'), 'utf8')

// ── 1. Ο έλεγχος υπάρχει και τρέχει ΠΡΙΝ πληρώσουμε το μοντέλο ─────────────
// Αυτά τα δύο έπεφταν πριν τη διόρθωση: η λέξη «bump_ai_usage» δεν υπήρχε
// πουθενά στο αρχείο, άρα το πρώτο σκάει και το δεύτερο δεν έχει καν δείκτη.
const iBump  = SRC.indexOf("'bump_ai_usage'")
const iModel = SRC.indexOf('api.anthropic.com')

ok('η function καλεί την bump_ai_usage', iBump >= 0)
ok('υπάρχει κλήση στο Anthropic για να φυλαχθεί', iModel >= 0)
ok('ο έλεγχος ορίου προηγείται της κλήσης του μοντέλου', iBump >= 0 && iModel >= 0 && iBump < iModel)

// ── 2. Με ποιον client καλείται ─────────────────────────────────────────────
// Η bump_ai_usage διαβάζει auth.uid(). Με service_role αυτό είναι null και το
// RPC γυρίζει πάντα reason 'auth' — δηλαδή θα έκοβε ΟΛΟΥΣ τους χρήστες και ο
// «έλεγχος» θα ήταν στην πραγματικότητα σπασμένη λειτουργία.
const rpcCaller = SRC.match(/(\w+)\.rpc\(\s*'bump_ai_usage'/)?.[1]
ok('το RPC καλείται με τον client του χρήστη (authClient), όχι με το service',
  rpcCaller === 'authClient')

// ── 3. Το { error } του γραψίματος ελέγχεται και κλείνει ───────────────────
// Ο μετρητής είναι upsert. Αν αποτύχει και συνεχίσουμε, γυρίσαμε ακριβώς στο
// πρόβλημα: κλήση στο μοντέλο χωρίς να ξέρουμε πόσα έχει ξοδέψει ο χρήστης.
const errBinding = SRC.match(
  /const\s*\{[^}]*\berror:\s*(\w+)[^}]*\}\s*=\s*await\s+authClient\.rpc\(\s*'bump_ai_usage'/,
)?.[1]
ok('το σφάλμα του RPC δεσμεύεται σε μεταβλητή', !!errBinding)
if (errBinding) {
  const iErrGuard = SRC.indexOf(`if (${errBinding})`)
  ok('σε σφάλμα RPC η function σταματά πριν το μοντέλο',
    iErrGuard > iBump && iErrGuard < iModel)
}

// ── 4. Σε υπέρβαση επιστρέφεται καθαρό σφάλμα, όχι κλήση στο μοντέλο ────────
const iDenied = SRC.indexOf('allowed === false')
ok('η απάντηση «δεν επιτρέπεται» του RPC ελέγχεται', iDenied >= 0)
ok('η υπέρβαση κόβει πριν το μοντέλο', iDenied > iBump && iDenied < iModel)
ok('η υπέρβαση γυρίζει 429', /allowed === false[\s\S]{0,700}?\}, 429\)/.test(SRC))

// ── 5. Ο καθρέφτης συμφωνεί με το lib/billing/aiLimits.ts ───────────────────
// ΥΠΟΛΟΓΙΣΜΟΣ ΣΤΟ ΧΕΡΙ, με τη σειρά PLAN_RANK_ORDER = [free, owner, agency, office]
// (δείκτης = user_plan_rank, όπως τη θέλει το RPC):
//   perMinute        = PER_MINUTE                     = 20
//   perDayByRank     = [15, 30, 60, 120]   (free 15 · owner 30 · agency 60 · office 120)
//   perMonthByRank   = [60, 120, 300, 600] (free 60 · owner 120 · agency 300 · office 600)
//   freePoolPerMonth = FREE_TESTERS_PER_MONTH × TRIAL_LIMITS.perMonth = 50 × 20
// Η σύγκριση γίνεται με την ΠΗΓΗ, όχι με αυτά τα νούμερα: αν αύριο αλλάξει το
// πλάνο, το τεστ πρέπει να απαιτήσει την αλλαγή και εδώ — όχι να την επαναλάβει.
const num = (field: string): number | null => {
  const m = SRC.match(new RegExp(`${field}:\\s*(\\d+)`))
  return m ? Number(m[1]) : null
}
const arr = (field: string): number[] | null => {
  const m = SRC.match(new RegExp(`${field}:\\s*\\[([^\\]]*)\\]`))
  return m ? m[1].split(',').map(s => Number(s.trim())) : null
}
const same = (a: number[] | null, b: number[]) =>
  !!a && a.length === b.length && a.every((v, i) => v === b[i])

const day   = arr('perDayByRank')
const month = arr('perMonthByRank')

ok('perMinute ίδιο με το MAX_PER_MINUTE', num('perMinute') === MAX_PER_MINUTE)
ok('perDayByRank ίδιο με το dailyLimitsByRank()', same(day, dailyLimitsByRank()))
ok('perMonthByRank ίδιο με το monthlyLimitsByRank()', same(month, monthlyLimitsByRank()))
ok('freePoolPerMonth ίδιο με το FREE_POOL_PER_MONTH', num('freePoolPerMonth') === FREE_POOL_PER_MONTH)

// Αν προστεθεί πλάνο στο PLAN_RANK_ORDER και δεν ενημερωθούν οι πίνακες εδώ, το
// RPC θα έπεφτε σιωπηλά πίσω στο p_day[1] — δηλαδή στο ΔΩΡΕΑΝ όριο για όλους.
ok('οι πίνακες καλύπτουν κάθε πλάνο του PLAN_RANK_ORDER',
  day?.length === PLAN_RANK_ORDER.length && month?.length === PLAN_RANK_ORDER.length)

console.log(`\nsmart-suggestions: ✓ ${passed} · ✗ ${failed}`)
if (failed) process.exit(1)
