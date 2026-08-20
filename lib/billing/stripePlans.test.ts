// npx tsx lib/billing/stripePlans.test.ts
//
// ΕΔΩ ΚΡΙΝΕΤΑΙ ΑΝ Ο ΠΕΛΑΤΗΣ ΠΑΙΡΝΕΙ ΑΥΤΟ ΠΟΥ ΠΛΗΡΩΣΕ.
// Ολη η μετάφραση «τι έστειλε ο πάροχος» → «τι πακέτο έχει ο λογαριασμός»
// γίνεται εδώ, χωρίς δίκτυο. Λάθος σε αυτό το αρχείο σημαίνει χρεωμένος
// άνθρωπος χωρίς πρόσβαση, ή πρόσβαση χωρίς χρέωση.
import {
  SUB_STATUSES, isSubStatus, isEntitled, subPhase, isoFrom,
  catalogue, priceFor, planOfPrice, catalogueGaps, readSubscription,
  CYCLES, type SubStatus,
} from './stripePlans'
import { PLANS, type PlanId } from './plans'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }

// ── ΟΙ ΚΑΤΑΣΤΑΣΕΙΣ ────────────────────────────────────────────────────────
ok('η λίστα καταστάσεων είναι πλήρης όπως την ορίζει ο πάροχος', SUB_STATUSES.length === 8)
ok('άγνωστη κατάσταση δεν γίνεται δεκτή', !isSubStatus('on_trial') && !isSubStatus('cancelled'))
ok('γνωστή κατάσταση γίνεται', isSubStatus('trialing') && isSubStatus('canceled'))

// Η ΠΡΟΣΒΑΣΗ ΚΑΙ Η ΦΡΑΣΗ ΔΕΝ ΕΠΙΤΡΕΠΕΤΑΙ ΝΑ ΔΙΑΦΩΝΟΥΝ. Μια οθόνη που λέει
// «ενεργή συνδρομή» ενώ η πόρτα είναι κλειστή είναι χειρότερη από σιωπή.
{
  const openDoor: SubStatus[] = []
  for (const s of SUB_STATUSES) {
    const p = subPhase(s)
    const saysOpen = p === 'trial' || p === 'active' || p === 'retrying'
    if (saysOpen) openDoor.push(s)
    ok(`«${s}»: η φάση συμφωνεί με την πρόσβαση`, saysOpen === isEntitled(s))
    ok(`«${s}»: έχει φάση`, p !== 'none')
  }
  ok('τρεις καταστάσεις δίνουν πρόσβαση, ούτε μία παραπάνω', openDoor.length === 3)
}
// Ο,τι δεν είναι κατάσταση του παρόχου δεν γίνεται φάση κατά λάθος.
ok('τα ονόματα του προηγούμενου εμπόρου δεν περνούν',
  subPhase('on_trial') === 'none' && subPhase('cancelled') === 'none' && subPhase('') === 'none')

// ── Ο ΧΡΟΝΟΣ ──────────────────────────────────────────────────────────────
ok('το Unix γίνεται ISO', isoFrom(1_800_000_000) === new Date(1_800_000_000_000).toISOString())
ok('το μηδέν και το κενό δεν γίνονται 1970',
  isoFrom(0) === null && isoFrom(null) === null && isoFrom('1800000000') === null && isoFrom(NaN) === null)

// ── Ο ΚΑΤΑΛΟΓΟΣ ───────────────────────────────────────────────────────────
// Το ερωτηματικό ΧΡΕΙΑΖΕΤΑΙ: χωρίς αυτό, το `({…})` της επιστροφής και το `{`
// του επόμενου μπλοκ διαβάζονται ως λίστα παραμέτρων άλλου βέλους.
const price = (id: string, plan: string, cycle: string, active = true) =>
  ({ id, active, metadata: { plan_id: plan, cycle } });

{
  const cat = catalogue([
    price('price_solo_m', 'solo', 'monthly'),
    price('price_solo_y', 'solo', 'annual'),
    // ΑΣΗΜΑΝΤΗ ΤΙΜΗ: πρόσθετο ή εφάπαξ. Δεν είναι σφάλμα, δεν είναι πακέτο.
    { id: 'price_addon', active: true, metadata: {} },
    { id: 'price_bare', active: true },
    // ΑΝΕΝΕΡΓΗ: παλιά τιμή που δεν πωλείται πια.
    price('price_old', 'owner', 'monthly', false),
    // ΑΓΝΩΣΤΟ ΠΑΚΕΤΟ ή ΚΥΚΛΟΣ: δεν μαντεύουμε.
    price('price_x', 'enterprise', 'monthly'),
    price('price_y', 'solo', 'weekly'),
    // ΤΟ ΔΩΡΕΑΝ ΔΕΝ ΠΩΛΕΙΤΑΙ.
    price('price_free', 'free', 'monthly'),
  ])
  ok('ο κατάλογος κρατά μόνο τις σημασμένες, ενεργές, πληρωτέες τιμές', cat.length === 2)
  ok('η τιμή βρίσκεται από πακέτο και κύκλο',
    priceFor(cat, 'solo', 'monthly') === 'price_solo_m' && priceFor(cat, 'solo', 'annual') === 'price_solo_y')
  ok('πακέτο χωρίς τιμή δεν επιστρέφει τίποτα', priceFor(cat, 'office', 'monthly') === null)
  ok('η τιμή γυρίζει σε πακέτο', planOfPrice(cat, 'price_solo_y')?.plan === 'solo')
  ok('ανενεργή τιμή δεν γυρίζει σε πακέτο', planOfPrice(cat, 'price_old') === null)
  ok('τα κενά ονομάζονται', catalogueGaps(cat).includes(PLANS.office.name))
}
{
  // ΠΛΗΡΕΣ ΚΑΤΑΣΤΗΜΑ: κανένα κενό. Χωρίς αυτόν τον έλεγχο, ένα `catalogueGaps`
  // που επιστρέφει πάντα κείμενο θα περνούσε τον προηγούμενο.
  const paid = (Object.keys(PLANS) as PlanId[]).filter(p => PLANS[p].priceMonthly > 0)
  const full = catalogue(paid.flatMap(p => CYCLES.map(c => price(`price_${p}_${c}`, p, c))))
  ok('πλήρες κατάστημα δεν έχει κενά', catalogueGaps(full) === '')
  ok('πλήρες κατάστημα έχει δύο τιμές ανά πακέτο', full.length === paid.length * 2)
}

// ── Η ΑΝΑΓΝΩΣΗ ΤΗΣ ΣΥΝΔΡΟΜΗΣ ──────────────────────────────────────────────
const PERIOD = 1_800_000_000
const sub = (over: Record<string, unknown> = {}) => ({
  id: 'sub_1', status: 'active', customer: 'cus_1',
  metadata: { user_id: 'u-1' },
  cancel_at_period_end: false,
  items: { data: [{ price: { id: 'price_solo_m' }, current_period_end: PERIOD }] },
  ...over,
});

{
  const r = readSubscription(sub())
  ok('η συνδρομή διαβάζεται', r.ok)
  if (r.ok) {
    ok('κρατά αναγνωριστικό, πελάτη, τιμή και λογαριασμό',
      r.sub.id === 'sub_1' && r.sub.customerId === 'cus_1'
      && r.sub.priceId === 'price_solo_m' && r.sub.userId === 'u-1')
    ok('το τέλος περιόδου έρχεται από τη γραμμή', r.sub.periodEnd === isoFrom(PERIOD))
    ok('χωρίς αίτημα ακύρωσης δεν λέει ακύρωση', r.sub.cancelAtPeriodEnd === false)
  }
}
{
  // ΠΑΛΑΙΟΤΕΡΗ ΕΚΔΟΣΗ: το τέλος περιόδου ζούσε στη ΡΙΖΑ. Χωρίς αυτό, η
  // ημερομηνία ανανέωσης θα ήταν κενή και η οθόνη θα σιωπούσε.
  const r = readSubscription(sub({
    items: { data: [{ price: 'price_solo_m' }] },
    current_period_end: PERIOD,
  }))
  ok('το τέλος περιόδου βρίσκεται και στη ρίζα', r.ok && r.sub.periodEnd === isoFrom(PERIOD))
  ok('η τιμή διαβάζεται και ως σκέτο αναγνωριστικό', r.ok && r.sub.priceId === 'price_solo_m')
}
{
  const r = readSubscription(sub({ customer: { id: 'cus_2' } }))
  ok('ο πελάτης διαβάζεται και ως αντικείμενο', r.ok && r.sub.customerId === 'cus_2')
}
{
  const r = readSubscription(sub({ cancel_at_period_end: true, status: 'active' }))
  ok('η ακύρωση στο τέλος περιόδου κρατιέται', r.ok && r.sub.cancelAtPeriodEnd === true)
}
// ΤΑ ΣΚΟΥΠΙΔΙΑ ΔΕΝ ΓΙΝΟΝΤΑΙ ΣΥΝΔΡΟΜΗ. Καθένα από αυτά, αν περνούσε, θα
// έγραφε λάθος πακέτο σε πραγματικό λογαριασμό.
ok('χωρίς αναγνωριστικό δεν διαβάζεται', !readSubscription(sub({ id: '' })).ok)
ok('με άγνωστη κατάσταση δεν διαβάζεται', !readSubscription(sub({ status: 'on_trial' })).ok)
ok('το κενό δεν διαβάζεται', !readSubscription(null).ok && !readSubscription(undefined).ok)
ok('το σκέτο κείμενο δεν διαβάζεται', !readSubscription('sub_1').ok)
{
  // ΧΩΡΙΣ ΓΡΑΜΜΕΣ: η συνδρομή υπάρχει αλλά δεν ξέρουμε τι αγοράστηκε. Ο
  // webhook την απορρίπτει παρακάτω· εδώ αρκεί να μην εφευρεθεί τιμή.
  const r = readSubscription(sub({ items: { data: [] } }))
  ok('χωρίς γραμμή, καμία τιμή δεν εφευρίσκεται', r.ok && r.sub.priceId === null)
}
{
  const r = readSubscription(sub({ metadata: {} }))
  ok('χωρίς σήμανση λογαριασμού, κανένας λογαριασμός δεν μαντεύεται', r.ok && r.sub.userId === null)
}

console.log(fail === 0 ? `✓ stripePlans: ${pass} έλεγχοι πέρασαν` : `✗ stripePlans: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
