// npx tsx lib/core/dbError.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΝΕΝΑ ΑΓΓΛΙΚΟ ΣΤΗΝ ΟΘΟΝΗ
//
// Ο έλεγχος που μετράει είναι ο τελευταίος: ΟΤΙΔΗΠΟΤΕ κι αν δώσει η βάση, το
// μήνυμα που φτάνει στον χρήστη δεν περιέχει λατινικούς χαρακτήρες σε θέση
// πρότασης. Ένας μεταφραστής που «τα περισσότερα τα πιάνει» δεν λύνει τίποτα:
// αρκεί ένα «duplicate key value violates unique constraint» για να καταλάβει
// ο ιδιοκτήτης ότι κοιτάζει μηχανή.
// ═══════════════════════════════════════════════════════════════════════════
import { dbReason, failed, RETRY } from './dbError';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error(`✗ ${name}`); } };

// ── Κωδικοί Postgres ──────────────────────────────────────────────────────
ok('μοναδικότητα', dbReason({ code: '23505' })=== 'Υπάρχει ήδη καταχώρηση με αυτά τα στοιχεία.');
ok('ξένο κλειδί', (dbReason({ code: '23503' }) || '').startsWith('Η εγγραφή συνδέεται'));
ok('υποχρεωτικό πεδίο', dbReason({ code: '23502' }) === 'Λείπει ένα υποχρεωτικό στοιχείο.');
ok('δικαιώματα', dbReason({ code: '42501' }) === 'Δεν έχεις δικαίωμα σε αυτή την εγγραφή.');
ok('έληξε η συνεδρία', dbReason({ code: 'PGRST301' }) === 'Η σύνδεσή σου έληξε. Μπες ξανά.');

// Ο κωδικός ΝΙΚΑΕΙ το κείμενο: το κείμενο αλλάζει με την έκδοση της βάσης.
ok('ο κωδικός προηγείται του κειμένου',
  dbReason({ code: '23505', message: 'Failed to fetch' }) === 'Υπάρχει ήδη καταχώρηση με αυτά τα στοιχεία.');

// ── Σφάλματα χωρίς κωδικό ─────────────────────────────────────────────────
ok('χαμένο δίκτυο', (dbReason({ message: 'TypeError: Failed to fetch' }) || '').includes('σύνδεση στο διαδίκτυο'));
ok('όριο ρυθμού', (dbReason({ message: 'Email rate limit exceeded' }) || '').includes('Στάλθηκαν πολλά'));
ok('λάθος στοιχεία εισόδου', dbReason({ message: 'Invalid login credentials' }) === 'Λάθος ηλεκτρονικό ταχυδρομείο ή κωδικός.');
ok('υπάρχων λογαριασμός', (dbReason({ message: 'User already registered' }) || '').includes('Υπάρχει ήδη λογαριασμός'));
ok('πολιτική RLS', dbReason({ message: 'new row violates row-level security policy for table "expenses"' })
  === 'Δεν έχεις δικαίωμα σε αυτή την εγγραφή.');
ok('σκέτο κείμενο', (dbReason('Failed to fetch') || '').includes('διαδίκτυο'));

// ── Το άγνωστο ΔΕΝ μεταφράζεται σε αγγλικά ────────────────────────────────
ok('άγνωστος κωδικός → null', dbReason({ code: 'XX999', message: 'something exploded' }) === null);
ok('κενό → null', dbReason(null) === null && dbReason(undefined) === null && dbReason({}) === null);

// ── Η σύνθεση του μηνύματος ───────────────────────────────────────────────
ok('τι + γιατί', failed('Η τιμή ρεύματος δεν αποθηκεύτηκε', { code: '42501' })
  === 'Η τιμή ρεύματος δεν αποθηκεύτηκε. Δεν έχεις δικαίωμα σε αυτή την εγγραφή.');
ok('άγνωστο → προτροπή', failed('Η τιμή ρεύματος δεν αποθηκεύτηκε', { code: 'XX999' })
  === `Η τιμή ρεύματος δεν αποθηκεύτηκε. ${RETRY}`);
ok('χωρίς σφάλμα → προτροπή', failed('Δεν αποθηκεύτηκε') === `Δεν αποθηκεύτηκε. ${RETRY}`);

// Η στίξη μπαίνει ΜΙΑ φορά: 199 μηνύματα δεν επιτρέπεται να διαφωνούν στην τελεία.
ok('η τελεία δεν διπλασιάζεται', failed('Δεν αποθηκεύτηκε.') === `Δεν αποθηκεύτηκε. ${RETRY}`);
ok('η άνω τελεία καθαρίζεται', failed('Ο τύπος θέρμανσης δεν αποθηκεύτηκε:', { code: '23502' })
  === 'Ο τύπος θέρμανσης δεν αποθηκεύτηκε. Λείπει ένα υποχρεωτικό στοιχείο.');

// ── ΤΟ ΚΡΙΣΙΜΟ: καμία αγγλική πρόταση δεν διαφεύγει ──────────────────────
const LATIN_WORD = /[A-Za-z]{4,}/;
const SAMPLES: unknown[] = [
  { code: '23505', message: 'duplicate key value violates unique constraint "bills_pkey"' },
  { code: '42501', message: 'permission denied for table expenses' },
  { code: 'XX999', message: 'unexpected internal error' },
  { message: 'JWT expired' }, { message: 'Failed to fetch' },
  { message: 'AbortError: The operation was aborted' },
  new Error('Unexpected token < in JSON at position 0'),
  'boom', null, undefined, {}, 42,
];
for (const s of SAMPLES) {
  const msg = failed('Η ενέργεια δεν ολοκληρώθηκε', s);
  ok(`χωρίς αγγλικά: ${JSON.stringify(String((s as { message?: string })?.message ?? s)).slice(0, 44)}`,
    !LATIN_WORD.test(msg));
}

console.log(`dbError.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
