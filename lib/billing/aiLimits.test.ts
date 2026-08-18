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
  poolExhaustedMessage, COST_PER_REQUEST_USD, COST_PER_REQUEST_EUR, FREE_BUDGET_USD,
  FREE_POOL_PER_MONTH, dailyLimitsByRank, monthlyLimitsByRank, PLAN_RANK_ORDER,
  MAX_PER_MINUTE, AI_SHARE, monthlyQuestionBudget, TRIAL_LIMITS, effectiveAiLimits,
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

  // Η δεξαμενή πρέπει να ΔΕΣΜΕΥΕΙ: αν δεν έπιανε ποτέ, η εγγύηση θα ήταν
  // διακοσμητική. Με το πακέτο αναμονής στα 10, δεσμεύει στους 52 λογαριασμούς
  // χωρίς συνδρομή — και αυτούς τους πληρώνουμε από την ίδια τσέπη.
  const free = aiLimitsFor('free')
  ok('η δεξαμενή δεσμεύει σε ρεαλιστικό πλήθος λογαριασμών',
    FREE_POOL_PER_MONTH / free.perMonth < 100)

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
  const κλίμακα = PLAN_ORDER.map(p => aiLimitsFor(p))
  ok('το ημερήσιο ανεβαίνει σε κάθε πλάνο, χωρίς εξαίρεση',
    κλίμακα.every((l, i) => i === 0 || l.perDay > κλίμακα[i - 1].perDay))
  ok('το μηνιαίο ανεβαίνει σε κάθε πλάνο, χωρίς εξαίρεση',
    κλίμακα.every((l, i) => i === 0 || l.perMonth > κλίμακα[i - 1].perMonth))
  ok('το ανά λεπτό είναι ίδιο παντού (φράγμα κατάχρησης, όχι πώλησης)',
    κλίμακα.every(l => l.perMinute === MAX_PER_MINUTE))
}

// ── Ο ΚΑΝΟΝΑΣ ΤΟΥ ΠΡΟΫΠΟΛΟΓΙΣΜΟΥ, ΕΛΕΓΜΕΝΟΣ ΣΤΟ ΝΟΥΜΕΡΟ ──────────────────
// Ο βοηθός δεν τρώει πάνω από το 20% της μηνιαίας συνδρομής, ούτε πάνω από το
// 15% της ετήσιας. Αυτό ΔΕΝ είναι σχόλιο: αν κάποιος ανεβάσει ένα όριο με το
// χέρι ή πέσει η ισοτιμία, το τεστ σπάει εδώ και όχι στον λογαριασμό της
// Anthropic στο τέλος του μήνα.
{
  const PAID: PlanId[] = ['solo', 'owner', 'agency', 'office']
  for (const id of PAID) {
    const l = aiLimitsFor(id)
    const worstEur = l.perMonth * COST_PER_REQUEST_EUR
    const cap = PLANS[id].priceMonthly * AI_SHARE
    ok(`${id}: το χειρότερο κόστος δεν ξεπερνά το 20% της μηνιαίας`, worstEur <= cap)
    // Και δεν είναι τσιγκούνικο: μία ερώτηση λιγότερη από το ταβάνι, όχι δέκα.
    ok(`${id}: αξιοποιεί τον προϋπολογισμό του (μία ερώτηση από το ταβάνι)`,
      worstEur + COST_PER_REQUEST_EUR > cap)

    // Το ετήσιο μετριέται στο ΕΤΟΣ, γιατί εκεί δίνεται.
    const annualYear = monthlyQuestionBudget(id, 'annual') * 12 * COST_PER_REQUEST_EUR
    ok(`${id}: το ετήσιο δεν ξεπερνά το 20% της ετήσιας`,
      annualYear <= PLANS[id].priceAnnual * AI_SHARE)
    // Ο ετήσιος πληρώνει δέκα μήνες αντί για δώδεκα, άρα παίρνει ΑΝΑΛΟΓΙΚΑ
    // λιγότερα — ποτέ όμως λιγότερα από το πακέτο της δοκιμής.
    ok(`${id}: το ετήσιο είναι το 20% όσων πληρώνει, όχι λιγότερο`,
      annualYear + COST_PER_REQUEST_EUR * 12 > PLANS[id].priceAnnual * AI_SHARE)
  }

  // ΤΟ «ΧΩΡΙΣ ΣΥΝΔΡΟΜΗ» ΔΕΝ ΜΠΟΡΕΙ ΝΑ ΠΑΙΡΝΕΙ ΠΑΝΩ ΑΠΟ ΤΟΝ ΣΥΝΔΡΟΜΗΤΗ.
  // Έπαιρνε 60 όταν το φθηνότερο πληρωμένο έπαιρνε 23: ο λογαριασμός που δεν
  // πλήρωνε τίποτα έπαιρνε δυόμισι φορές περισσότερα από αυτόν που πλήρωνε.
  ok('η αναμονή παίρνει λιγότερα από το φθηνότερο πληρωμένο',
    aiLimitsFor('free').perMonth < aiLimitsFor('solo').perMonth)

  // ── Η ΔΟΚΙΜΗ ΔΕΝ ΞΕΠΕΡΝΑ ΤΟΝ ΣΥΝΔΡΟΜΗΤΗ ────────────────────────────────
  // Η δοκιμή ανεβάζει το επίπεδο στο «Ιδιοκτήτης+» για να δείξει τις
  // δυνατότητες. Αν έπαιρνε και τις ερωτήσεις του, ο δοκιμαστής θα είχε
  // δυόμισι φορές περισσότερες από όσες πληρώνει ο συνδρομητής.
  ok('η δοκιμή παίρνει λιγότερα από το φθηνότερο πληρωμένο',
    TRIAL_LIMITS.perMonth < aiLimitsFor('solo').perMonth)
  ok('η δοκιμή παίρνει περισσότερα από την αναμονή χωρίς συνδρομή',
    TRIAL_LIMITS.perMonth > aiLimitsFor('free').perMonth)
  ok('η δοκιμή κοστίζει λιγότερο από ένα ευρώ ανά λογαριασμό',
    TRIAL_LIMITS.perMonth * COST_PER_REQUEST_EUR < 1)
  ok('το ημερήσιο της δοκιμής επιτρέπει μια ολόκληρη δουλειά', TRIAL_LIMITS.perDay >= 5)
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
  // ΔΕΝ συγκρίνουμε με σταθερή συμβολοσειρά: θα χρειαζόταν αλλαγή σε κάθε νέο
  // πλάνο και θα έσπαγε για λάθος λόγο. Αυτό που πρέπει να ισχύει ΠΑΝΤΑ είναι ότι
  // η θέση κάθε πλάνου εδώ ταυτίζεται με το rank που επιστρέφει η βάση
  // (user_plan_rank: 0 δωρεάν, 1 ένα ακίνητο, 2 ιδιοκτήτης, 3 επαγγελματίας,
  // 4 γραφείο — 20260805090000_solo_plan.sql).
  const RANK_ΒΑΣΗΣ: Record<string, number> = { free: 0, solo: 1, owner: 2, agency: 3, office: 4 }
  ok('η θέση κάθε πλάνου ταυτίζεται με το rank της βάσης',
    PLAN_RANK_ORDER.every((p, i) => RANK_ΒΑΣΗΣ[p] === i))
  ok('κανένα πλάνο δεν λείπει από τη σειρά rank',
    PLAN_RANK_ORDER.length === Object.keys(RANK_ΒΑΣΗΣ).length)
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
  // Μετριέται στο φθηνότερο ΠΛΗΡΩΜΕΝΟ πακέτο: εκεί το περιθώριο είναι πιο
  // στενό, άρα εκεί κρίνεται αν η προειδοποίηση φτάνει έγκαιρα.
  const solo = aiLimitsFor('solo')
  const warnAt = Math.floor(solo.perMonth * WARN_AT)
  ok('μένουν πραγματικές ερωτήσεις μετά την προειδοποίηση', solo.perMonth - warnAt >= 4)
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
  // Ισχύει για ΚΑΘΕ πλάνο χωρίς ανώτερο, όχι μόνο για τον επαγγελματία: μόλις
  // μπήκε το «Γραφείο», ένας σκέτος έλεγχος για 'agency' θα άφηνε τον κάτοχο του
  // ακριβότερου πλάνου να διαβάζει «αναβάθμισε» — και δεν υπάρχει πού.
  for (const κορυφή of ['agency', 'office'] as PlanId[]) {
    ok(`το πλάνο «${κορυφή}» δεν καλείται να «αναβαθμίσει»`,
      !/αναβαθμ/i.test(dailyExhaustedMessage(κορυφή)) && !/αναβαθμ/i.test(monthlyExhaustedMessage(κορυφή)))
  }
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

// ── ΤΟ ΠΑΚΕΤΟ ΠΟΥ ΛΕΕΙ Ο ΒΟΗΘΟΣ ΕΙΝΑΙ ΤΟ ΠΑΚΕΤΟ ΠΟΥ ΕΠΙΒΑΛΕΙ Ο ΜΕΤΡΗΤΗΣ ───
// Ο κανόνας ζει δύο φορές: στη `bump_ai_usage` ως `least(όριο, δοκιμαστικό)`
// και εδώ ως `Math.min`. Δεν γίνεται αλλιώς — ο περιηγητής δεν τρέχει SQL. Αν
// αποκλίνουν, η Νόα υπόσχεται νούμερο που η βάση δεν δίνει, και ο χρήστης
// χτυπάει τοίχο έχοντας ακούσει το αντίθετο από τον ίδιο τον βοηθό.
{
  for (const id of PLAN_ORDER) {
    const paid = effectiveAiLimits(id, true)
    const free = effectiveAiLimits(id, false)
    ok(`${id}: ο πληρώνων παίρνει ακέραιο το πακέτο του`,
       paid.perMonth === aiLimitsFor(id).perMonth && paid.perDay === aiLimitsFor(id).perDay)
    ok(`${id}: ο μη πληρώνων είναι το least των δύο (όπως η SQL)`,
       free.perMonth === Math.min(aiLimitsFor(id).perMonth, TRIAL_LIMITS.perMonth)
       && free.perDay === Math.min(aiLimitsFor(id).perDay, TRIAL_LIMITS.perDay))
    ok(`${id}: κανένας μη πληρώνων δεν ξεπερνά το δοκιμαστικό πακέτο`,
       free.perMonth <= TRIAL_LIMITS.perMonth && free.perDay <= TRIAL_LIMITS.perDay)
    ok(`${id}: το ανυψωμένο επίπεδο δεν δίνει ΠΟΤΕ περισσότερα χωρίς πληρωμή`,
       free.perMonth <= paid.perMonth && free.perDay <= paid.perDay)
  }
  // Το συγκεκριμένο σφάλμα που γέννησε τη συνάρτηση: η δοκιμή τρέχει σε
  // επίπεδο «Ιδιοκτήτης+» και ο βοηθός διάβαζε το πακέτο ΕΚΕΙΝΟΥ του πλάνου.
  ok('η δοκιμή ΔΕΝ παίρνει το πακέτο του «Ιδιοκτήτης+»',
     effectiveAiLimits('owner', false).perMonth < aiLimitsFor('owner').perMonth)
  ok('και η απόκλιση ήταν πραγματικά μεγάλη (>2×)',
     aiLimitsFor('owner').perMonth / effectiveAiLimits('owner', false).perMonth > 2)
  // Ο δωρεάν λογαριασμός είναι ΗΔΗ κάτω από το δοκιμαστικό: το least δεν τον αγγίζει.
  ok('ο λογαριασμός χωρίς συνδρομή μένει στο δικό του, μικρότερο πακέτο',
     effectiveAiLimits('free', false).perMonth === aiLimitsFor('free').perMonth)
}

console.log(`aiLimits.test.ts: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
