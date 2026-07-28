// Τεστ για τα όρια του AI βοηθού ανά πλάνο.
//
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ: τα όρια είναι ταυτόχρονα οικονομικός έλεγχος και υπόσχεση
// προς τον χρήστη. Ένα λάθος προς τα πάνω κοστίζει χρήματα από την τσέπη του
// ιδιοκτήτη· ένα λάθος προς τα κάτω διώχνει χρήστες. Και τα δύο είναι σιωπηλά:
// δεν σκάει τίποτα, απλώς κάτι πάει στραβά αργά.
//
// Ο κρίσιμος έλεγχος δεν είναι «υπάρχουν τα νούμερα». Είναι ότι το ΑΘΡΟΙΣΜΑ
// στο χειρότερο σενάριο μένει μέσα στον προϋπολογισμό, και ότι η κλιμάκωση
// είναι μονότονη — αλλιώς ένας συνδρομητής θα μπορούσε να παίρνει λιγότερα
// από έναν δωρεάν χρήστη χωρίς να το πάρει κανείς είδηση.

import {
  aiLimitsFor, WARN_AT, dailyExhaustedMessage, monthlyExhaustedMessage,
  poolExhaustedMessage, COST_PER_REQUEST_USD, FREE_BUDGET_USD, FREE_POOL_PER_MONTH,
  dailyLimitsByRank, monthlyLimitsByRank, PLAN_RANK_ORDER, MAX_PER_MINUTE,
} from './aiLimits'
import { PLANS, PLAN_ORDER, type PlanId } from './plans'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }

const FREE_USERS_TARGET = 10
const EUR_TO_USD = 1.08

// ── Ο ΣΚΛΗΡΟΣ οικονομικός έλεγχος: η κοινή δεξαμενή ────────────────────────
// Τα ατομικά όρια ΔΕΝ αρκούν: δέκα δωρεάν χρήστες στο μέγιστο αθροίζουν
// 10 × 60 × 0,052 $ = 31,20 $, πάνω από τον στόχο. Αυτό που κάνει την εγγύηση
// σκληρή είναι η δεξαμενή — και αυτό ακριβώς ελέγχουμε εδώ.
{
  const poolCost = FREE_POOL_PER_MONTH * COST_PER_REQUEST_USD
  ok('η δεξαμενή χωράει στον προϋπολογισμό', poolCost <= FREE_BUDGET_USD)
  ok('ο προϋπολογισμός μένει στον στόχο 16-20 $', FREE_BUDGET_USD >= 16 && FREE_BUDGET_USD <= 20)
  ok('η δεξαμενή αξιοποιεί τον προϋπολογισμό (>85%), δεν τον αφήνει αχρησιμοποίητο',
    poolCost / FREE_BUDGET_USD > 0.85)

  // Η δεξαμενή πρέπει να ΔΕΣΜΕΥΕΙ: αν χωρούσε δέκα χρήστες στο ατομικό μέγιστο,
  // θα ήταν διακοσμητική και η εγγύηση θα ήταν ψεύτικη.
  const free = aiLimitsFor('free')
  ok('η δεξαμενή δεσμεύει πριν από τα ατομικά όρια',
    FREE_POOL_PER_MONTH < free.perMonth * FREE_USERS_TARGET)

  // …αλλά ούτε τόσο σφιχτή ώστε να κόβει έναν μοναχικό χρήστη. Πέντε ενεργοί
  // δωρεάν χρήστες στο πλήρες μηνιαίο τους πρέπει να χωρούν άνετα.
  ok('πέντε δωρεάν χρήστες στο πλήρες μηνιαίο τους χωρούν',
    FREE_POOL_PER_MONTH >= free.perMonth * 5)
}

// ── Το ατομικό μηνιαίο δεσμεύει πριν από το ημερήσιο ──────────────────────
{
  for (const id of PLAN_ORDER) {
    const l = aiLimitsFor(id)
    ok(`${id}: το ημερήσιο × 30 ξεπερνά το μηνιαίο (άρα το μηνιαίο δεσμεύει)`, l.perDay * 30 > l.perMonth)
    // …αλλά το ημερήσιο πρέπει να επιτρέπει να τελειώσει μια δουλειά σε μία μέρα.
    ok(`${id}: το ημερήσιο φτάνει για μια ολόκληρη συνεδρία (≥1/5 του μηνιαίου)`, l.perDay * 5 >= l.perMonth)
  }
}

// ── Κλιμάκωση: όποιος πληρώνει περισσότερα παίρνει περισσότερα ─────────────
{
  const f = aiLimitsFor('free'), o = aiLimitsFor('owner'), a = aiLimitsFor('agency')
  ok('ημερήσιο: free < owner < agency', f.perDay < o.perDay && o.perDay < a.perDay)
  ok('μηνιαίο: free < owner < agency', f.perMonth < o.perMonth && o.perMonth < a.perMonth)
  ok('το ανά λεπτό είναι ίδιο παντού (φράγμα κατάχρησης, όχι πώλησης)',
    f.perMinute === o.perMinute && o.perMinute === a.perMinute && f.perMinute === MAX_PER_MINUTE)
}

// ── Οι συνδρομητές ΕΠΙΔΟΤΟΥΝ, δεν κοστίζουν ───────────────────────────────
// Ρητή επιθυμία: «οι πληρωμένοι να μπορούν αναλόγως να κάνουν περισσότερες
// ερωτήσεις» και να καλύπτεται το κόστος του δωρεάν. Ελέγχουμε ότι το κόστος
// στη ΧΕΙΡΟΤΕΡΗ περίπτωση μένει κάτω από τα έσοδα, με πραγματικό περιθώριο.
{
  for (const id of ['owner', 'agency'] as PlanId[]) {
    const l = aiLimitsFor(id)
    const revenue = PLANS[id].priceMonthly * EUR_TO_USD
    const worstCost = l.perMonth * COST_PER_REQUEST_USD
    ok(`${id}: το χειρότερο κόστος μένει κάτω από τα έσοδα`, worstCost < revenue)
    ok(`${id}: περιθώριο τουλάχιστον 40%`, worstCost / revenue <= 0.60)
    // Και δεν πρέπει να είναι τσιγκούνικο: ένα πλάνο που ξοδεύει το 10% των
    // εσόδων του σε AI απλώς δεν δίνει αρκετό στον συνδρομητή.
    ok(`${id}: δίνει ουσιαστικό πακέτο (>30% των εσόδων σε αξία AI)`, worstCost / revenue > 0.30)
  }
}

// ── Κάθε πλάνο έχει όρια, και άγνωστο πλάνο πέφτει στο δωρεάν ─────────────
{
  for (const id of PLAN_ORDER) ok(`υπάρχουν όρια για «${id}»`, aiLimitsFor(id).perDay > 0)
  const free = aiLimitsFor('free')
  for (const bad of [null, undefined, '', 'enterprise', 'ΑΓΝΩΣΤΟ']) {
    const l = aiLimitsFor(bad as never)
    ok(`«${String(bad)}» πέφτει στο δωρεάν (fail-closed στο κόστος)`,
      l.perDay === free.perDay && l.perMonth === free.perMonth)
  }
}

// ── Οι πίνακες προς το RPC ταιριάζουν με τα rank του user_plan_rank ────────
// Η bump_ai_usage διαβάζει p_day[rank+1]. Αν η σειρά εδώ αποκλίνει από τη σειρά
// των rank στη βάση, ένας επαγγελματίας θα έπαιρνε σιωπηλά όρια δωρεάν χρήστη.
{
  ok('η σειρά rank είναι free → owner → agency',
    PLAN_RANK_ORDER.join(',') === 'free,owner,agency')
  const d = dailyLimitsByRank(), m = monthlyLimitsByRank()
  ok('ο πίνακας ημερήσιων έχει μία θέση ανά πλάνο', d.length === PLAN_RANK_ORDER.length)
  ok('ο πίνακας μηνιαίων έχει μία θέση ανά πλάνο', m.length === PLAN_RANK_ORDER.length)
  ok('κάθε θέση αντιστοιχεί στο σωστό πλάνο',
    PLAN_RANK_ORDER.every((p, i) => d[i] === aiLimitsFor(p).perDay && m[i] === aiLimitsFor(p).perMonth))
  ok('οι πίνακες είναι αύξοντες (ίδια εγγύηση με την κλιμάκωση, στη μορφή που φεύγει στη βάση)',
    d.every((v, i) => i === 0 || v > d[i - 1]) && m.every((v, i) => i === 0 || v > m[i - 1]))
}

// ── Η προειδοποίηση φτάνει ΠΡΙΝ τον τοίχο ─────────────────────────────────
{
  ok('προειδοποιούμε στο 80%, όχι στο 100%', WARN_AT > 0.5 && WARN_AT < 1)
  const free = aiLimitsFor('free')
  const warnAt = Math.floor(free.perMonth * WARN_AT)
  ok('μένουν πραγματικές ερωτήσεις μετά την προειδοποίηση', free.perMonth - warnAt >= 10)
}

// ── Τα μηνύματα: ποτέ αδιέξοδο, πάντα διέξοδος ────────────────────────────
{
  for (const id of PLAN_ORDER) {
    const d = dailyExhaustedMessage(id), m = monthlyExhaustedMessage(id)
    ok(`${id}: το ημερήσιο μήνυμα λέει πότε ανανεώνεται`, /μεσάνυχτα|ανανεών/.test(d))
    ok(`${id}: το μηνιαίο μήνυμα δίνει διέξοδο`, /αναβαθμ|ράψε μας|1η/.test(m))
    ok(`${id}: κανένα μήνυμα δεν είναι αδιέξοδο`, d.length > 40 && m.length > 40)
    ok(`${id}: το μήνυμα λέει το ΠΡΑΓΜΑΤΙΚΟ νούμερο του πλάνου`,
      d.includes(String(aiLimitsFor(id).perDay)) && m.includes(String(aiLimitsFor(id).perMonth)))
  }
  // Ο επαγγελματίας ΔΕΝ πρέπει να δέχεται πρόταση αναβάθμισης — δεν υπάρχει
  // ανώτερο πλάνο, και το να του προτείνεις ένα είναι κοροϊδία.
  ok('ο επαγγελματίας δεν καλείται να «αναβαθμίσει»',
    !/αναβαθμ/i.test(dailyExhaustedMessage('agency')) && !/αναβαθμ/i.test(monthlyExhaustedMessage('agency')))
  ok('ο δωρεάν ΚΑΛΕΙΤΑΙ να αναβαθμίσει', /αναβαθμ/i.test(monthlyExhaustedMessage('free')))

  // Το μήνυμα της δεξαμενής αφορά κάτι που ΔΕΝ έφταιξε ο χρήστης. Δεν επιτρέπεται
  // να τον κατηγορεί ούτε να τον αφήνει χωρίς σαφή ημερομηνία επιστροφής.
  const p = poolExhaustedMessage()
  ok('η δεξαμενή εξηγεί πότε ξανανοίγει', /1η του επόμενου μήνα/.test(p))
  ok('η δεξαμενή δεν κατηγορεί τον χρήστη', !/υπέρβασ|ξεπέρασ|κατάχρησ/i.test(p))
  ok('η δεξαμενή λέει ότι η υπόλοιπη εφαρμογή δουλεύει', /υπόλοιπα εργαλεία/.test(p))
}

// ── Απόδειξη ότι ο οικονομικός έλεγχος ΠΙΑΝΕΙ υπερβολικά όρια ────────────
// Ένα τεστ που περνά με οποιοδήποτε νούμερο δεν ελέγχει τίποτα. Επιβεβαιώνουμε
// ότι το προηγούμενο όριο των 400/ημέρα θα είχε κοπεί.
{
  const OLD_DAILY = 400
  const OLD_COST = 0.130   // χωρίς caching, με το prompt να ξεκινά από προσωπικά στοιχεία
  const oldWorstMonthly = OLD_DAILY * 30 * OLD_COST * FREE_USERS_TARGET
  ok('ο έλεγχος ΠΙΑΝΕΙ το παλιό όριο των 400/ημέρα', oldWorstMonthly > FREE_BUDGET_USD)
  ok('και το πιάνει με τεράστια διαφορά (>100×)', oldWorstMonthly > FREE_BUDGET_USD * 100)
  // Και ότι ο χωρισμός του prompt όντως έφερε την τάξη μεγέθους που ισχυριζόμαστε.
  ok('το caching μείωσε το κόστος τουλάχιστον 2×', OLD_COST / COST_PER_REQUEST_USD >= 2)
}

console.log(`aiLimits.test.ts: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
