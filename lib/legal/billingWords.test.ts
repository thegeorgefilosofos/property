// npx tsx lib/legal/billingWords.test.ts
//
// ΕΔΩ ΚΡΙΝΕΤΑΙ ΑΝ ΤΑ ΝΟΜΙΚΑ ΚΕΙΜΕΝΑ ΛΕΝΕ ΤΗΝ ΑΛΗΘΕΙΑ.
// Το σφάλμα που γεννά αυτό το αρχείο: ο κώδικας απέκτησε ζωντανό κουμπί
// πληρωμής και πέντε επιφάνειες συνέχισαν να γράφουν «η χρέωση δεν έχει
// ενεργοποιηθεί». Ο έλεγχος δεν ρωτά «τι λέει η σελίδα» — ρωτά αν οι δύο
// καταστάσεις είναι όντως δύο, και αν διαλέγονται από τη ΣΩΣΤΗ συνθήκη.
import { billingWords } from './billingWords'
import { checkoutIsLive } from '../billing/lemonCheckout'
import { subprocessors, activeSubprocessors, plannedSubprocessors } from './subprocessors'
import { PAYMENTS_PROVIDER } from './merchant'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }

const LINK = 'https://propertyos.lemonsqueezy.com/buy/aaaa'
const LIVE = { LEMON_CHECKOUT_LINKS: `solo:monthly=${LINK}` }
const DARK = {}

// ── Η ΣΥΝΘΗΚΗ ─────────────────────────────────────────────────────────────
ok('με σύνδεσμο αγοράς, το ταμείο είναι ζωντανό', checkoutIsLive(LIVE))
ok('χωρίς σύνδεσμο, δεν είναι', !checkoutIsLive(DARK))
// Χαλασμένη τιμή ΔΕΝ μετράει ως ζωντανή: το route γυρίζει `available:false`,
// άρα ένα κείμενο που έλεγε «χρεώνουμε» θα ήταν ψέμα.
ok('χαλασμένος χάρτης δεν μετράει ως ζωντανό ταμείο',
  !checkoutIsLive({ LEMON_CHECKOUT_LINKS: 'solo:monthly=https://evil.example/buy/x' }))

// ── ΟΙ ΔΥΟ ΚΑΤΑΣΤΑΣΕΙΣ ΕΙΝΑΙ ΟΝΤΩΣ ΔΥΟ ────────────────────────────────────
{
  const live = billingWords(LIVE), dark = billingWords(DARK)
  ok('η σημαία ακολουθεί το ταμείο', live.live === true && dark.live === false)
  const keys = ['chargingToday', 'afterTrial', 'cardData', 'compMonths', 'howWeArePaid', 'paymentMethodAsked'] as const
  // Αν μια φράση είναι ίδια και στις δύο καταστάσεις, τότε η μία από τις δύο
  // λέει ψέματα — και δεν θα το έπιανε κανείς, γιατί «υπάρχει διατύπωση».
  for (const k of keys) ok(`η «${k}» διαφέρει ανά κατάσταση`, live[k] !== dark[k])

  ok('όταν χρεώνουμε, δεν λέμε ότι δεν χρεώνουμε',
    !live.chargingToday.includes('δεν έχει ενεργοποιηθεί') && !live.cardData.includes('δεν έχει ενεργοποιηθεί'))
  ok('όταν ΔΕΝ χρεώνουμε, το λέμε', dark.chargingToday.includes('δεν έχει ενεργοποιηθεί'))
  ok('ο έμπορος ονομάζεται όταν χρεώνει', live.chargingToday.includes(PAYMENTS_PROVIDER))
  // Καμία φράση δεν μένει κενή: μια κενή πρόταση σε νομικό κείμενο είναι
  // παράλειψη ενημέρωσης, όχι συντομία.
  for (const k of keys) ok(`καμία κενή φράση: ${k}`, live[k].length > 20 && dark[k].length > 20)
}

// ── ΤΟ ΜΗΤΡΩΟ ΥΠΕΡΓΟΛΑΒΩΝ ΑΚΟΛΟΥΘΕΙ ──────────────────────────────────────
// Είναι μηχαναγνώσιμο δημοσιευμένο έγγραφο του άρθρου 28 GDPR: ένα `false`
// εκεί δεν είναι σχόλιο, είναι δήλωση προς το υποκείμενο.
{
  const merchantOf = (env: Record<string, string | undefined>) =>
    subprocessors(env).find(s => s.name === PAYMENTS_PROVIDER)!
  ok('με ζωντανό ταμείο ο πάροχος πληρωμών είναι ενεργός', merchantOf(LIVE).active === true)
  ok('χωρίς ταμείο δεν είναι', merchantOf(DARK).active === false)
  ok('και μετακινείται ανάμεσα στους δύο καταλόγους',
    activeSubprocessors(LIVE).some(s => s.name === PAYMENTS_PROVIDER)
    && plannedSubprocessors(DARK).some(s => s.name === PAYMENTS_PROVIDER))
  ok('η αιτιολόγηση του παρόχου δανείζεται τη μία διατύπωση',
    merchantOf(DARK).purpose.includes(billingWords(DARK).cardData))
  // Οι υπόλοιποι πάροχοι δεν παρασύρονται από τη μεταβλητή της χρέωσης.
  const others = (env: Record<string, string | undefined>) =>
    subprocessors(env).filter(s => s.name !== PAYMENTS_PROVIDER).map(s => `${s.name}:${s.active}`).join()
  ok('κανένας άλλος πάροχος δεν αλλάζει κατάσταση', others(LIVE) === others(DARK))
}

console.log(fail === 0 ? `✓ billingWords: ${pass} έλεγχοι πέρασαν` : `✗ billingWords: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
