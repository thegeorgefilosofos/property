// npx tsx lib/nav/history.test.ts
//
// ΤΟ HASH ΤΟ ΓΡΑΦΕΙ Ο ΧΡΗΣΤΗΣ.
// Μπορεί να το πληκτρολογήσει, να το επικολλήσει από παλιό μήνυμα, ή να μείνει
// από προηγούμενη έκδοση της εφαρμογής. Καμία τιμή δεν επιτρέπεται να ρίξει τον
// πίνακα — και καμία δεν επιτρέπεται να μπει αυτούσια σε επόμενο σύνδεσμο.
import { parseNavHash, formatNavHash, shouldPush } from './history'

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

console.log(fail === 0 ? `✓ navHistory: ${pass} έλεγχοι πέρασαν` : `✗ navHistory: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
