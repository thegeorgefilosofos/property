// npx tsx lib/billing/planRank.test.ts
//
// Η ΚΑΤΑΤΑΞΗ ΠΛΑΝΩΝ ΖΕΙ ΣΕ ΔΥΟ ΣΗΜΕΙΑ ΚΑΙ ΠΡΕΠΕΙ ΝΑ ΣΥΜΦΩΝΟΥΝ.
//
//   πελάτης: rank = PLAN_ORDER.indexOf(plan)          (lib/billing/entitlements.ts)
//   βάση:    public.user_plan_rank + plan_max_properties  (migration)
//
// Παρεμβολή πλάνου στη μέση του PLAN_ORDER μετακινεί ΚΑΘΕ επόμενο επίπεδο κατά
// ένα. Αν αλλάξει μόνο ο πελάτης, ο συνδρομητής «Ιδιοκτήτης» διαβάζεται από τη
// βάση ως «Ένα ακίνητο» και χάνει δύο από τα τρία ακίνητά του — σιωπηλά, χωρίς
// σφάλμα πουθενά. Αυτό ακριβώς συνέβη όταν μπήκε το `solo` και γι' αυτό η
// αντιστοιχία γράφεται εδώ ρητά, με τους αριθμούς του migration.
import { PLANS, PLAN_ORDER, normalizePlan, type PlanId } from './plans'
import { planAtLeast, FEATURE_MIN_PLAN, ALLOWED_PLANS, TRIAL_PLAN } from './entitlements'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }

// ── Η ΑΝΤΙΣΤΟΙΧΙΑ ΜΕ ΤΟ MIGRATION ────────────────────────────────────────────
// Αντιγραμμένη από το 20260805090000_solo_plan.sql. Όποιος αλλάξει το ένα χωρίς
// το άλλο, ρίχνει αυτό το τεστ.
const DB_RANK: Record<PlanId, number> = { free: 0, solo: 1, owner: 2, agency: 3, office: 4 }
const DB_MAX_PROPERTIES: Record<number, number> = { 0: 1, 1: 1, 2: 3, 3: 15, 4: 2147483647 }

for (const id of PLAN_ORDER) {
  ok(`${id}: ίδιο rank σε πελάτη και βάση`, PLAN_ORDER.indexOf(id) === DB_RANK[id])
}
ok('κανένα πλάνο δεν λείπει από την αντιστοιχία', PLAN_ORDER.length === Object.keys(DB_RANK).length)

for (const id of PLAN_ORDER) {
  const dbMax = DB_MAX_PROPERTIES[DB_RANK[id]]
  const clientMax = PLANS[id].maxProperties
  const same = clientMax === Infinity ? dbMax > 1_000_000 : clientMax === dbMax
  ok(`${id}: ίδιο όριο ακινήτων (πελάτης ${clientMax}, βάση ${dbMax})`, same)
}

// ── Η ΔΟΚΙΜΗ ΔΕΝ ΥΠΟΒΑΘΜΙΖΕΤΑΙ ──────────────────────────────────────────────
// Η δοκιμή δίνει «Ιδιοκτήτης». Στο migration αυτό είναι πλέον rank 2 — ήταν 1.
// Αν κάποιος το ξαναγυρίσει σε 1, κάθε νέος λογαριασμός πέφτει από 3 ακίνητα σε 1
// ΜΕΣΑ στη δοκιμή του, δηλαδή ακριβώς στις πρώτες του μέρες.
ok('η δοκιμή δίνει «Ιδιοκτήτης»', TRIAL_PLAN === 'owner')
ok('και ο «Ιδιοκτήτης» είναι επίπεδο 2', DB_RANK[TRIAL_PLAN] === 2)
ok('δηλαδή 3 ακίνητα στη δοκιμή', DB_MAX_PROPERTIES[DB_RANK[TRIAL_PLAN]] === 3)

// ── ΤΟ «ΕΝΑ ΑΚΙΝΗΤΟ» ────────────────────────────────────────────────────────
ok('υπάρχει', !!PLANS.solo)
ok('κοστίζει 3,90 €', PLANS.solo.priceMonthly === 3.9)
ok('ένα ακίνητο', PLANS.solo.maxProperties === 1)
ok('έχει δοκιμή', PLANS.solo.trialDays > 0)
ok('φθηνότερο από τον Ιδιοκτήτη', PLANS.solo.priceMonthly < PLANS.owner.priceMonthly)
ok('ακριβότερο από το δωρεάν', PLANS.solo.priceMonthly > PLANS.free.priceMonthly)

// Ο ΛΟΓΟΣ ΥΠΑΡΞΗΣ ΤΟΥ: τα φορολογικά χωρίς να πληρώνεις για τρία ακίνητα.
ok('ξεκλειδώνει το Ε2', FEATURE_MIN_PLAN.e2_export === 'solo')
ok('ξεκλειδώνει τις εισπράξεις', FEATURE_MIN_PLAN.rent_collection === 'solo')
ok('το δωρεάν ΔΕΝ τα έχει', !planAtLeast('free', FEATURE_MIN_PLAN.e2_export))
ok('το solo τα έχει', planAtLeast('solo', FEATURE_MIN_PLAN.e2_export))
// …αλλά ΔΕΝ δίνει δεύτερο ακίνητο· εκεί αρχίζει ο «Ιδιοκτήτης».
ok('δεν δίνει δεύτερο ακίνητο', !planAtLeast('solo', FEATURE_MIN_PLAN.multi_property))
ok('ούτε σύγκριση, που θέλει δύο ακίνητα', !planAtLeast('solo', FEATURE_MIN_PLAN.comparison))
ok('ο Ιδιοκτήτης δίνει δεύτερο ακίνητο', planAtLeast('owner', FEATURE_MIN_PLAN.multi_property))

// ── Η ΜΟΝΟΤΟΝΙΑ ΤΗΣ ΣΚΑΛΑΣ ──────────────────────────────────────────────────
// Κάθε επόμενο πλάνο κοστίζει περισσότερο ΚΑΙ δίνει τουλάχιστον όσα το προηγούμενο.
// Χωρίς αυτό, υπάρχει πλάνο που δεν αγοράζει κανείς ποτέ — ή, χειρότερα, πλάνο
// που κοστίζει παραπάνω και δίνει λιγότερα.
for (let i = 1; i < PLAN_ORDER.length; i++) {
  const prev = PLANS[PLAN_ORDER[i - 1]], cur = PLANS[PLAN_ORDER[i]]
  ok(`${cur.id}: ακριβότερο από το ${prev.id}`, cur.priceMonthly > prev.priceMonthly)
  ok(`${cur.id}: τουλάχιστον όσα ακίνητα με το ${prev.id}`, cur.maxProperties >= prev.maxProperties)
  ok(`${cur.id}: υψηλότερο επίπεδο από το ${prev.id}`, planAtLeast(cur.id, prev.id) && !planAtLeast(prev.id, cur.id))
}

// ── ΑΝΑΓΝΩΣΗ ΑΠΟΘΗΚΕΥΜΕΝΟΥ ΠΛΑΝΟΥ ──────────────────────────────────────────
ok('«solo» διαβάζεται', normalizePlan('solo') === 'solo')
ok('άγνωστο → δωρεάν', normalizePlan('premium-plus') === 'free')
ok('κενό → δωρεάν', normalizePlan(null) === 'free')
ok('ο Ιδιώτης μπορεί να αγοράσει το «Ένα ακίνητο»', ALLOWED_PLANS.individual.includes('solo'))

// ── ΕΤΗΣΙΑ ΤΙΜΗ ─────────────────────────────────────────────────────────────
// Πρέπει να συμφέρει, αλλιώς είναι διακοσμητική. Δέκα μήνες για δώδεκα.
for (const id of PLAN_ORDER) {
  const p = PLANS[id]
  if (p.priceMonthly === 0) continue
  ok(`${id}: η ετήσια είναι φθηνότερη από 12 μήνες`, p.priceAnnual < p.priceMonthly * 12)
}

console.log(fail === 0 ? `✓ planRank: ${pass} έλεγχοι πέρασαν` : `✗ planRank: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
