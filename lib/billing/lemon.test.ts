// npx tsx lib/billing/lemon.test.ts
//
// ΕΔΩ ΚΡΙΝΕΤΑΙ ΠΟΙΟΣ ΠΛΗΡΩΝΕΙ ΚΑΙ ΠΟΙΟΣ ΟΧΙ.
// Ενα λάθος σε αυτό το αρχείο δεν χαλάει οθόνη: ή χαρίζει συνδρομή, ή κόβει
// πρόσβαση σε πελάτη που πλήρωσε. Και τα δύο τα μαθαίνεις από παράπονο.
import {
  carriesSubscription,
  LS_STATUSES, isLsStatus, isEntitled, parseVariantMap, planOfVariant, readSubscriptionEvent,
} from './lemon'
import { verifySignature } from './lemonSignature'
import { createHmac } from 'node:crypto'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }

const NOW = '2026-08-20T10:00:00Z'

// ── ΟΙ ΚΑΤΑΣΤΑΣΕΙΣ ────────────────────────────────────────────────────────
ok('επτά καταστάσεις, όσες ορίζει η τεκμηρίωση', LS_STATUSES.length === 7)
ok('άγνωστη κατάσταση δεν αναγνωρίζεται', !isLsStatus('super_active'))
ok('κενό δεν αναγνωρίζεται', !isLsStatus('') && !isLsStatus(null) && !isLsStatus(7))

const ent = (status: string, endsAt: string | null = null) =>
  isEntitled({ status: status as never, endsAt }, NOW)

ok('η δοκιμή δίνει πρόσβαση', ent('on_trial'))
ok('η ενεργή δίνει πρόσβαση', ent('active'))
ok('η καθυστερημένη πληρωμή ΔΕΝ κόβει αμέσως', ent('past_due'))
ok('η παύση δεν είναι δωρεάν συνδρομή', !ent('paused'))
ok('η ανείσπρακτη δεν δίνει πρόσβαση', !ent('unpaid'))
ok('η ληγμένη δεν δίνει πρόσβαση', !ent('expired'))

// ΤΟ ΚΡΙΣΙΜΟ: η ακύρωση κρατά ό,τι πληρώθηκε και ούτε μέρα παραπάνω.
ok('ακυρωμένη με λήξη στο μέλλον: πρόσβαση', ent('cancelled', '2026-09-01T00:00:00Z'))
ok('ακυρωμένη με λήξη στο παρελθόν: τέλος', !ent('cancelled', '2026-08-01T00:00:00Z'))
ok('ακυρωμένη ΧΩΡΙΣ λήξη δεν εφευρίσκει περίοδο χάριτος', !ent('cancelled', null))
ok('η λήξη είναι η στιγμή, όχι η ημέρα', !ent('cancelled', NOW))

// ── Ο ΧΑΡΤΗΣ ΠΑΡΑΛΛΑΓΩΝ ───────────────────────────────────────────────────
{
  const r = parseVariantMap('811223:solo:monthly, 811224:solo:annual ,811225:owner:monthly')
  ok('τρεις παραλλαγές, καμία διαμαρτυρία', r.error === '' && r.map.size === 3)
  ok('η παραλλαγή δίνει πακέτο και κύκλο',
    planOfVariant(r.map, '811224')?.plan === 'solo' && planOfVariant(r.map, '811224')?.cycle === 'annual')
  ok('παραλλαγή εκτός χάρτη δεν αναβαθμίζει κανέναν', planOfVariant(r.map, '999999') === null)
}
{
  // ΤΟ ΤΥΠΟΓΡΑΦΙΚΟ ΣΤΟ ΟΝΟΜΑ ΠΑΚΕΤΟΥ ΕΙΝΑΙ ΤΟ ΠΙΘΑΝΟΤΕΡΟ ΛΑΘΟΣ, γιατί η τιμή
  // γράφεται με το χέρι σε πεδίο ιστοσελίδας. Το normalizePlan θα το γύριζε
  // σιωπηλά σε «free»: ο πελάτης θα πλήρωνε και δεν θα έπαιρνε τίποτα.
  const r = parseVariantMap('811223:sollo:monthly')
  ok('άγνωστο πακέτο καταγγέλλεται αντί να γίνει «free»', r.error.includes('sollo') && r.map.size === 0)
}
{
  const r = parseVariantMap('811223:solo:μηνιαίο')
  ok('άγνωστος κύκλος καταγγέλλεται', r.error.includes('κύκλος') && r.map.size === 0)
}
{
  const r = parseVariantMap('811223:solo:monthly,811223:owner:annual')
  ok('η ίδια παραλλαγή δύο φορές είναι σφάλμα, όχι «η τελευταία νικά»',
    r.error.includes('δύο φορές') && r.map.get('811223')?.plan === 'solo')
}
{
  const r = parseVariantMap('811223-solo-monthly')
  ok('λάθος μορφή καταγγέλλεται ονομαστικά', r.error.includes('811223-solo-monthly'))
}
ok('κενή μεταβλητή λέει ποια μεταβλητή λείπει', parseVariantMap('').error.includes('LEMON_VARIANTS'))
ok('και το undefined το ίδιο', parseVariantMap(undefined).error.includes('LEMON_VARIANTS'))

// ── Η ΑΝΑΓΝΩΣΗ ΤΟΥ ΓΕΓΟΝΟΤΟΣ ──────────────────────────────────────────────
const evt = (over: Record<string, unknown> = {}, metaOver: Record<string, unknown> = {}) => ({
  meta: { event_name: 'subscription_updated', custom_data: { user_id: 'u-1' }, ...metaOver },
  data: {
    type: 'subscriptions', id: 4321,
    attributes: {
      status: 'active', variant_id: 811223, customer_id: 55,
      renews_at: '2026-09-20T10:00:00.000000Z', ends_at: null, ...over,
    },
  },
})
// ΤΟ ΕΡΩΤΗΜΑΤΙΚΟ ΕΙΝΑΙ ΑΠΑΡΑΙΤΗΤΟ, όχι στιλιστικό: χωρίς αυτό το `({…})` του
// σώματος και το `{` του επόμενου μπλοκ διαβάζονται ως παράμετροι και σώμα
// ΑΛΛΗΣ συνάρτησης και το αρχείο δεν μεταγλωττίζεται.
;

{
  const r = readSubscriptionEvent(evt())
  ok('διαβάζεται γνήσιο γεγονός', r.ok === true)
  if (r.ok) {
    // Τα αναγνωριστικά έρχονται ΑΡΙΘΜΟΙ από τη Lemon Squeezy. Αν μείνουν
    // αριθμοί, η σύγκριση με τον χάρτη (κλειδιά κειμένου) αποτυγχάνει πάντα.
    ok('το data.id γίνεται κείμενο', r.sub.id === '4321')
    ok('το variant_id γίνεται κείμενο', r.sub.variantId === '811223')
    ok('το customer_id γίνεται κείμενο', r.sub.customerId === '55')
    ok('ο χρήστης έρχεται από το custom_data', r.sub.userId === 'u-1')
    ok('η ανανέωση κρατιέται όπως ήρθε', r.sub.renewsAt === '2026-09-20T10:00:00.000000Z')
    ok('το κενό ends_at μένει κενό, δεν γίνεται σημερινή ημερομηνία', r.sub.endsAt === null)
  }
}
{
  const r = readSubscriptionEvent(evt({ status: 'super_active' }))
  ok('άγνωστη κατάσταση απορρίπτεται ονομαστικά', !r.ok && r.reason.includes('super_active'))
}
{
  const r = readSubscriptionEvent(evt({ variant_id: null }))
  ok('χωρίς παραλλαγή δεν προκύπτει πακέτο', !r.ok && r.reason.includes('variant_id'))
}
{
  const r = readSubscriptionEvent(evt({}, { custom_data: {} }))
  ok('χωρίς user_id το γεγονός διαβάζεται αλλά ο χρήστης είναι κενός',
    r.ok === true && r.sub.userId === null)
}
{
  const r = readSubscriptionEvent({ meta: { event_name: 'order_created' }, data: { id: '1', attributes: {} } })
  ok('γεγονός παραγγελίας δεν περνά για συνδρομή', !r.ok && r.reason.includes('order_created'))
}
ok('κενό φορτίο απορρίπτεται', !readSubscriptionEvent(null).ok)
ok('φορτίο χωρίς data απορρίπτεται', !readSubscriptionEvent({ meta: { event_name: 'subscription_created' } }).ok)

// ── Η ΥΠΟΓΡΑΦΗ ────────────────────────────────────────────────────────────
{
  const secret = 'το-μυστικό-του-webhook'
  const body = JSON.stringify(evt())
  const good = createHmac('sha256', secret).update(body, 'utf8').digest('hex')

  ok('γνήσια υπογραφή περνά', verifySignature(body, good, secret))
  ok('κεφαλαία δεκαεξαδικά περνούν το ίδιο', verifySignature(body, good.toUpperCase(), secret))
  ok('αλλαγμένο σώμα κόβεται', !verifySignature(body + ' ', good, secret))
  ok('λάθος μυστικό κόβεται', !verifySignature(body, good, 'άλλο-μυστικό'))
  // ΧΩΡΙΣ ΜΥΣΤΙΚΟ ΔΕΝ ΠΕΡΝΑ ΤΙΠΟΤΑ. Το «δεν ρυθμίστηκε ακόμη, άσε το ανοιχτό»
  // είναι ο συνηθέστερος τρόπος να μείνει ανοιχτό για πάντα.
  ok('χωρίς μυστικό δεν περνά τίποτα', !verifySignature(body, good, undefined))
  ok('χωρίς κεφαλίδα δεν περνά τίποτα', !verifySignature(body, null, secret))
  // Η timingSafeEqual ΠΕΤΑΕΙ σε άνισα μήκη — αν δεν ελεγχθεί πριν, ο έλεγχος
  // ασφαλείας βγάζει 500 αντί για 401.
  ok('κοντή υπογραφή δεν ρίχνει εξαίρεση', !verifySignature(body, 'abcd', secret))
  ok('μη δεκαεξαδική υπογραφή δεν ρίχνει εξαίρεση', !verifySignature(body, 'ζζζζ', secret))
}


// ── ΤΑ ΠΑΡΑΣΤΑΤΙΚΑ ΔΕΝ ΕΙΝΑΙ ΣΥΝΔΡΟΜΕΣ ────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΘΕΡΑΠΕΥΕΤΑΙ: το `subscription_payment_success` αρχίζει από
// «subscription_», αλλά στο `data` φέρνει ΠΑΡΑΣΤΑΤΙΚΟ με `status: "paid"`.
// Ο χειριστής το διάβαζε ως συνδρομή, αποτύγχανε και απαντούσε «ξαναστείλ'
// το» — για πάντα. Θα συνέβαινε μόλις κάποιος επέλεγε «όλα τα γεγονότα
// συνδρομής» στη ρύθμιση του webhook, δηλαδή την πρώτη φορά.
for (const e of ['subscription_created', 'subscription_updated', 'subscription_cancelled',
  'subscription_resumed', 'subscription_expired', 'subscription_paused',
  'subscription_unpaused', 'subscription_plan_changed']) {
  ok(`το «${e}» κουβαλά συνδρομή`, carriesSubscription(e))
}
for (const e of ['subscription_payment_success', 'subscription_payment_failed',
  'subscription_payment_recovered', 'subscription_payment_refunded']) {
  ok(`το «${e}» ΔΕΝ κουβαλά συνδρομή`, !carriesSubscription(e))
}
ok('τα γεγονότα παραγγελίας δεν κουβαλούν συνδρομή',
  !carriesSubscription('order_created') && !carriesSubscription('order_refunded'))
ok('άγνωστο γεγονός συνδρομής αγνοείται ήσυχα', !carriesSubscription('subscription_κάτι_νέο'))
ok('το κενό δεν κουβαλά τίποτα', !carriesSubscription('') && !carriesSubscription('   '))
{
  // Το πραγματικό σχήμα ενός γεγονότος παραστατικού: `status: "paid"`.
  const invoice = {
    meta: { event_name: 'subscription_payment_success' },
    data: { id: '9', attributes: { status: 'paid', subscription_id: 5, total: 390 } },
  }
  const r = readSubscriptionEvent(invoice)
  ok('το παραστατικό δεν διαβάζεται ως συνδρομή', !r.ok)
  ok('και ο λόγος λέει ότι δεν κουβαλά συνδρομή',
    !r.ok && r.reason.includes('δεν κουβαλά συνδρομή'))
}

console.log(fail === 0 ? `✓ lemon: ${pass} έλεγχοι πέρασαν` : `✗ lemon: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
