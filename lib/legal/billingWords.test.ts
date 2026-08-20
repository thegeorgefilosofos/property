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
import { TRIAL_DAYS } from '../billing/plans'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }

const LIVE = {
  LEMON_SQUEEZY_API_KEY: 'κλειδί',
  LEMON_STORE_ID: '12345',
  LEMON_VARIANTS: '811223:solo:monthly',
}
const DARK = {}

// ── Η ΣΥΝΘΗΚΗ ─────────────────────────────────────────────────────────────
ok('με τη ρύθμιση πλήρη, το ταμείο είναι ζωντανό', checkoutIsLive(LIVE))
ok('χωρίς ρύθμιση, δεν είναι', !checkoutIsLive(DARK))
// ΤΟ ΜΙΣΟ ΕΙΝΑΙ ΧΕΙΡΟΤΕΡΟ ΑΠΟ ΤΟ ΤΙΠΟΤΑ, και γι' αυτό μετράνε και οι τρεις:
// με ζωντανό ταμείο και ξεχασμένο χάρτη παραλλαγών, ο πελάτης πληρώνει και ο
// webhook απαντά σφάλμα σε κάθε γεγονός — χρεωμένος, χωρίς πακέτο.
ok('χωρίς χάρτη παραλλαγών δεν μετράει ως ζωντανό ταμείο',
  !checkoutIsLive({ ...LIVE, LEMON_VARIANTS: '' }))
ok('χωρίς κλειδί API δεν μετράει', !checkoutIsLive({ ...LIVE, LEMON_SQUEEZY_API_KEY: '' }))
ok('χαλασμένο αναγνωριστικό καταστήματος δεν μετράει',
  !checkoutIsLive({ ...LIVE, LEMON_STORE_ID: 'PropertyOS' }))

// ── ΟΙ ΔΥΟ ΚΑΤΑΣΤΑΣΕΙΣ ΕΙΝΑΙ ΟΝΤΩΣ ΔΥΟ ────────────────────────────────────
{
  const live = billingWords(LIVE), dark = billingWords(DARK)
  ok('η σημαία ακολουθεί το ταμείο', live.live === true && dark.live === false)
  const keys = ['chargingToday', 'afterTrial', 'cardData', 'compMonths', 'howWeArePaid', 'paymentMethodAsked', 'moneyBack', 'firstCharge'] as const
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

// ── ΤΟ ΜΟΝΤΕΛΟ ΤΩΝ ΧΡΗΜΑΤΩΝ, ΓΡΑΜΜΕΝΟ ΚΑΙ ΚΑΡΦΩΜΕΝΟ ─────────────────────
// Καθε πρόταση εδώ αντιστοιχεί σε κάτι που ΚΑΝΕΙ ο κώδικας. Οταν άλλαξε το
// μοντέλο, τα κείμενα έμειναν πίσω και έλεγαν το ακριβώς αντίθετο: «δεν
// ζητείται μέσο πληρωμής» δίπλα σε μια διαδρομή που ζητά κάρτα την τρίτη
// οθόνη. Οι έλεγχοι είναι λεξιλογικοί επίτηδες — ό,τι υπόσχεται ένα νομικό
// κείμενο δεν επιτρέπεται να αλλάξει κατά λάθος.
{
  const live = billingWords(LIVE), dark = billingWords(DARK)

  // Η ΚΑΡΤΑ ΔΗΛΩΝΕΤΑΙ ΣΤΗΝ ΑΡΧΗ, ΚΑΙ Η ΧΡΕΩΣΗ ΕΡΧΕΤΑΙ ΤΗΝ 31η ΗΜΕΡΑ.
  ok('η ζωντανή διατύπωση λέει πότε δηλώνεται το μέσο πληρωμής',
    live.afterTrial.includes('μέσο πληρωμής') && live.afterTrial.includes('ταμείο'))
  ok('και ποια ημέρα φεύγει το πρώτο ευρώ',
    live.afterTrial.includes(`${TRIAL_DAYS + 1}η ημέρα`))
  ok('και ότι η ακύρωση μέσα στη δοκιμή δεν κοστίζει',
    live.afterTrial.includes('δεν χρεώνεσαι καθόλου'))
  // ΤΟ ΠΑΛΙΟ ΨΕΜΑ, ΟΝΟΜΑΣΤΙΚΑ. Η φράση αυτή ήταν αληθής επί μήνες και έγινε
  // ψευδής μέσα σε ένα commit, χωρίς να το πει κανείς.
  ok('και ΔΕΝ λέει πια ότι δεν ζητείται μέσο πληρωμής',
    !live.afterTrial.includes('Δεν ζητείται μέσο πληρωμής'))
  ok('το μέσο πληρωμής ζητείται μετά την επιβεβαίωση του email',
    live.paymentMethodAsked.includes('επιβεβαίωση του email'))
  // Η ΣΥΝΤΟΜΗ ΜΟΡΦΗ ΛΕΕΙ ΤΟ ΙΔΙΟ ΠΡΑΓΜΑ ΜΕ ΤΗ ΜΑΚΡΙΑ. Γράφεται για στενές
  // επιφάνειες (ψιλά γράμματα, περιγραφή σελίδας) και είναι ακριβώς εκεί που
  // κάποιος θα την ξανάγραφε με το χέρι.
  ok('η σύντομη μορφή λέει την ημέρα της πρώτης χρέωσης',
    live.firstCharge.includes(`${TRIAL_DAYS + 1}η ημέρα`))
  ok('και χωρίς ταμείο δεν υπόσχεται καμία χρέωση',
    dark.firstCharge.includes('δεν έχει ενεργοποιηθεί') && !dark.firstCharge.includes(`${TRIAL_DAYS + 1}η ημέρα`))

  // Η ΕΓΓΥΗΣΗ ΤΩΝ 14 ΗΜΕΡΩΝ ΑΠΟ ΤΗΝ ΠΡΩΤΗ ΧΡΕΩΣΗ.
  // Οι 14 ημέρες του νόμου μετρούν από τη σύναψη, δηλαδή λήγουν δεκαέξι
  // ημέρες πριν φύγει το πρώτο ευρώ. Χωρίς αυτή τη δέσμευση, ο πελάτης
  // πληρώνει την 31η ημέρα χωρίς κανένα δικαίωμα επιστροφής.
  for (const [name, w] of [['ζωντανή', live.withdrawal], ['ανενεργή', dark.withdrawal]] as const) {
    ok(`η ${name} υπαναχώρηση αναφέρει την εγγύηση από την πρώτη χρέωση`,
      w.includes('14 ημέρες από την πρώτη χρέωση'))
  }
  ok('η ζωντανή εγγύηση επιστρέφει ολόκληρο το ποσό',
    live.withdrawal.includes('επιστρέφουμε ολόκληρο το ποσό'))
  // ΜΙΑ ΠΡΟΤΑΣΗ, ΔΥΟ ΘΕΣΕΙΣ. Ο τιμοκατάλογος τη δείχνει στα ψιλά γράμματα και
  // οι Οροι μέσα στην υπαναχώρηση: γραμμένη δύο φορές, θα απέκλινε.
  ok('η σύντομη εγγύηση ζει μέσα στην παράγραφο της υπαναχώρησης',
    live.withdrawal.includes(live.moneyBack) && dark.withdrawal.includes(dark.moneyBack))
  ok('και εξηγεί ΓΙΑΤΙ χρειάζεται', live.withdrawal.includes('αφού περάσουν οι 14 ημέρες'))

  // Η ΑΝΕΝΕΡΓΗ ΚΑΤΑΣΤΑΣΗ ΜΕΝΕΙ ΑΝΕΝΕΡΓΗ, χωρίς να υπόσχεται χρεώσεις.
  ok('χωρίς ταμείο, καμία υπόσχεση για χρέωση',
    dark.afterTrial.includes('δεν έχει ενεργοποιηθεί'))
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
