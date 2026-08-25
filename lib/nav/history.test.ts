// npx tsx lib/nav/history.test.ts
//
// ΤΟ HASH ΤΟ ΓΡΑΦΕΙ Ο ΧΡΗΣΤΗΣ.
// Μπορεί να το πληκτρολογήσει, να το επικολλήσει από παλιό μήνυμα, ή να μείνει
// από προηγούμενη έκδοση της εφαρμογής. Καμία τιμή δεν επιτρέπεται να ρίξει τον
// πίνακα — και καμία δεν επιτρέπεται να μπει αυτούσια σε επόμενο σύνδεσμο.
import { parseNavHash, formatNavHash, shouldPush, readLaunchShortcut } from './history'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }
const FB = 'overview'

// ── Ανάγνωση ──────────────────────────────────────────────────────────────
ok('σκέτη καρτέλα', parseNavHash('#finances', FB).tab === 'finances')
ok('καρτέλα με ακίνητο', parseNavHash('#finances/abc-123', FB).propertyId === 'abc-123')
ok('χωρίς δίεση', parseNavHash('finances', FB).tab === 'finances')
ok('κενό → η προεπιλογή', parseNavHash('', FB).tab === FB)
ok('μόνο δίεση → η προεπιλογή', parseNavHash('#', FB).tab === FB)
ok('null → η προεπιλογή', parseNavHash(null, FB).tab === FB)
ok('κενά γύρω-γύρω', parseNavHash('  #tenant  ', FB).tab === 'tenant')
ok('χωρίς ακίνητο → null, όχι κενή συμβολοσειρά', parseNavHash('#tenant', FB).propertyId === null)

// ── Ό,τι δεν αναγνωρίζεται ΔΕΝ περνά ──────────────────────────────────────
// Το `SAFE` δεν είναι διακοσμητικό: το hash καταλήγει σε `history.pushState` και
// σε συγκρίσεις με ονόματα καρτελών. Μια τιμή με `<`, κενά ή κάθετες θα
// ταξίδευε μέσα στην εφαρμογή σαν να ήταν καρτέλα.
ok('σκουπίδια → προεπιλογή', parseNavHash('#<script>', FB).tab === FB)
ok('κενό μέσα → προεπιλογή', parseNavHash('#two words', FB).tab === FB)
ok('άκυρο ακίνητο αγνοείται', parseNavHash('#finances/../etc', FB).propertyId === null)
ok('το άκυρο ακίνητο δεν παρασέρνει την καρτέλα', parseNavHash('#finances/@@', FB).tab === 'finances')
ok('παύλες και κάτω παύλες επιτρέπονται', parseNavHash('#rent_roi/a-b_c', FB).propertyId === 'a-b_c')

// ── Γραφή ─────────────────────────────────────────────────────────────────
ok('μόνο καρτέλα', formatNavHash({ tab: 'finances', propertyId: null }) === '#finances')
ok('καρτέλα και ακίνητο', formatNavHash({ tab: 'finances', propertyId: 'x1' }) === '#finances/x1')
ok('άκυρη καρτέλα → κενό', formatNavHash({ tab: 'a b', propertyId: null }) === '')
ok('άκυρο ακίνητο → μόνο η καρτέλα', formatNavHash({ tab: 'finances', propertyId: 'a/b' }) === '#finances')

// Ανάγνωση και γραφή είναι αντίστροφες: ό,τι γράφτηκε, ξαναδιαβάζεται ίδιο.
for (const loc of [
  { tab: 'overview', propertyId: null },
  { tab: 'finances', propertyId: 'abc' },
  { tab: 'rent_roi', propertyId: 'a-1_b' },
]) {
  const back = parseNavHash(formatNavHash(loc), FB)
  ok(`κύκλος γραφής/ανάγνωσης: ${loc.tab}`, back.tab === loc.tab && back.propertyId === loc.propertyId)
}

// ── ΠΟΤΕ ΓΡΑΦΕΤΑΙ ΕΓΓΡΑΦΗ ΣΤΟ ΙΣΤΟΡΙΚΟ ────────────────────────────────────
// Αυτό είναι που κάνει το «πίσω» χρήσιμο αντί για βασανιστήριο. Χωρίς τον
// έλεγχο, κάθε `setNav` με την ίδια τιμή προσθέτει εγγραφή και ο χρήστης πατά
// «πίσω» πέντε φορές για να φύγει από μία οθόνη.
const L = (tab: string, propertyId: string | null = null) => ({ tab, propertyId })
ok('ίδια καρτέλα, ίδιο ακίνητο → καμία εγγραφή', !shouldPush(L('a', 'p'), L('a', 'p')))
ok('αλλαγή καρτέλας → εγγραφή', shouldPush(L('a'), L('b')))
ok('αλλαγή ακινήτου → εγγραφή', shouldPush(L('a', 'p1'), L('a', 'p2')))
ok('προσθήκη ακινήτου → εγγραφή', shouldPush(L('a'), L('a', 'p')))
ok('αφαίρεση ακινήτου → εγγραφή', shouldPush(L('a', 'p'), L('a')))

// ── ΤΟ ΙΔΙΟ ΑΚΙΝΗΤΟ ΣΕ ΔΥΟ ΚΑΡΤΕΛΕΣ ───────────────────────────────────────
{
  const a = parseNavHash('#finances/p1', FB)
  const b = parseNavHash('#tenant/p1', FB)
  ok('το ακίνητο επιβιώνει της αλλαγής καρτέλας', a.propertyId === b.propertyId)
  ok('και μετράει ως νέα θέση', shouldPush(a, b))
}

// ── ΟΙ ΣΥΝΤΟΜΕΥΣΕΙΣ ΤΟΥ ΕΙΚΟΝΙΔΙΟΥ ────────────────────────────────────────
// Το manifest υπόσχεται δύο ενέργειες στο μακρύ πάτημα. Οποιος τις πατά είναι
// όρθιος, με το ένα χέρι και δεν έχει διάθεση να ψάξει καρτέλα.
{
  const KNOWN = ['overview', 'finances', 'calendar']
  const s1 = readLaunchShortcut('?tab=finances', '', KNOWN)
  ok('η καρτέλα γίνεται hash', s1.hash === '#finances' && s1.consumed && !s1.scan)
  ok('και το ερώτημα αδειάζει', s1.search === '')

  const s2 = readLaunchShortcut('?action=scan', '', KNOWN)
  ok('η σάρωση ζητείται', s2.scan && s2.hash === null && s2.consumed)

  const s3 = readLaunchShortcut('?tab=hack', '', KNOWN)
  ok('άγνωστη καρτέλα αγνοείται', s3.hash === null)
  ok('αλλά το κλειδί καταναλώνεται, ώστε να φύγει από τη διεύθυνση', s3.consumed)

  const s4 = readLaunchShortcut('?tab=finances', '#overview/p7', KNOWN)
  ok('το ακίνητο επιβιώνει της συντόμευσης', s4.hash === '#finances/p7')

  const s5 = readLaunchShortcut('?utm_source=x&tab=calendar', '', KNOWN)
  ok('τα ξένα κλειδιά μένουν', s5.search === '?utm_source=x' && s5.hash === '#calendar')

  const s6 = readLaunchShortcut('', '#finances', KNOWN)
  ok('χωρίς ερώτημα δεν αγγίζεται τίποτα', !s6.consumed && s6.hash === null && !s6.scan)

  const s7 = readLaunchShortcut('?action=whatever', '', KNOWN)
  ok('άγνωστη ενέργεια δεν ανοίγει παράθυρο', !s7.scan && s7.consumed)
}

console.log(fail === 0 ? `✓ navHistory: ${pass} έλεγχοι πέρασαν` : `✗ navHistory: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
