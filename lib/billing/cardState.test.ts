// npx tsx lib/billing/cardState.test.ts
//
// ΤΟ «ΙΣΧΥΕΙ ΩΣ» ΚΑΙ ΤΟ «ΕΛΗΞΕ ΣΤΙΣ» ΕΙΝΑΙ ΤΟ ΙΔΙΟ ΠΕΔΙΟ
// ─────────────────────────────────────────────────────────────────────────
// Η κάρτα της συνδρομής έκρινε το `mor_ends_at` ως ΥΠΑΡΞΗ και όχι ως
// ημερομηνία. Δύο συνέπειες· και οι δύο σε πελάτη που πληρώνει:
//
//   · το πλαίσιο έλεγε σε ενεστώτα «η συνδρομή ισχύει ώς τις 12/09/2025» σε
//     κάποιον που έληξε πριν από έναν χρόνο·
//   · και το «τρέχει συνδρομή;» κρινόταν από τη ΦΑΣΗ, που για την ακυρωμένη
//     είναι «τελείωσε». Ο πελάτης που ακύρωσε χθες έβλεπε «Πληρωμή με κάρτα»
//     ακριβώς πάνω από το πλαίσιο που του έλεγε ότι η συνδρομή του ισχύει.
//     Πατώντας το, αγόραζε δεύτερη συνδρομή δίπλα στην πρώτη.
//
// Οσο ο κανόνας ζούσε μέσα στο .tsx, καμία δοκιμή δεν τον έφτανε: χρειαζόταν
// περιηγητή για να κριθεί μια σύγκριση ημερομηνιών.
import { cardState } from './subscription';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n); } };

const NOW = '2026-06-15T10:00:00.000Z';
const AHEAD = '2026-07-01T00:00:00.000Z';
const PAST = '2025-09-12T00:00:00.000Z';

// ── Η ΑΚΥΡΩΜΕΝΗ ΠΟΥ ΤΡΕΧΕΙ ΑΚΟΜΗ ─────────────────────────────────────────
{
  const s = cardState({ status: 'cancelled', endsAt: AHEAD }, NOW);
  ok('ακυρωμένη με ημερομηνία μπροστά: το πλαίσιο λέει ότι ισχύει', s.tone === 'cancelled-running');
  ok('ΚΑΙ ΤΟ ΤΑΜΕΙΟ ΜΕΝΕΙ ΚΛΕΙΣΤΟ, αλλιώς αγοράζει δεύτερη', s.running);
}

// ── Η ΑΚΥΡΩΜΕΝΗ ΠΟΥ ΤΕΛΕΙΩΣΕ ─────────────────────────────────────────────
{
  const s = cardState({ status: 'cancelled', endsAt: PAST }, NOW);
  ok('ακυρωμένη με ημερομηνία που πέρασε: μιλά σε αόριστο', s.tone === 'cancelled-over');
  ok('και το ταμείο ανοίγει ξανά', !s.running);
}

// ── Η ΛΗΓΜΕΝΗ ΚΡΑΤΑ ΚΙ ΑΥΤΗ ΗΜΕΡΟΜΗΝΙΑ ───────────────────────────────────
// Το `mor_ends_at` δεν σβήνεται όταν ο έμπορος γράψει «expired»: η ίδια
// γραμμή κώδικα κρίνει και τις δύο καταστάσεις.
{
  const s = cardState({ status: 'expired', endsAt: PAST }, NOW);
  ok('ληγμένη: αόριστος και ανοιχτό ταμείο', s.tone === 'cancelled-over' && !s.running);
}

// ── ΟΣΕΣ ΤΡΕΧΟΥΝ ΚΑΝΟΝΙΚΑ ────────────────────────────────────────────────
{
  ok('δοκιμή σε εξέλιξη', cardState({ status: 'on_trial', endsAt: null }, NOW).tone === 'trial');
  ok('ενεργή', cardState({ status: 'active', endsAt: null }, NOW).tone === 'active');
  ok('ξαναδοκιμάζει την κάρτα', cardState({ status: 'past_due', endsAt: null }, NOW).tone === 'retrying');
  ok('και οι τρεις κρατούν το ταμείο κλειστό',
    ['on_trial', 'active', 'past_due'].every(st => cardState({ status: st, endsAt: null }, NOW).running));
}

// ── ΟΣΕΣ ΔΕΝ ΔΙΝΟΥΝ ΠΡΟΣΒΑΣΗ ─────────────────────────────────────────────
{
  ok('η παύση δεν λέει ψέματα ότι ισχύει', cardState({ status: 'paused', endsAt: null }, NOW).tone === 'none');
  ok('και αφήνει το ταμείο ανοιχτό', !cardState({ status: 'paused', endsAt: null }, NOW).running);
  ok('καμία συνδρομή ποτέ', cardState({ status: '', endsAt: null }, NOW).tone === 'none');
}

// ── ΤΟ ΟΡΙΟ ΕΙΝΑΙ Η ΙΔΙΑ Η ΣΤΙΓΜΗ ────────────────────────────────────────
// Η ώρα λήξης δεν είναι «ώς και», είναι «ώς». Στη στιγμή ακριβώς, τελείωσε.
{
  ok('την ίδια στιγμή της λήξης η συνδρομή έχει τελειώσει',
    cardState({ status: 'cancelled', endsAt: NOW }, NOW).tone === 'cancelled-over');
  ok('ένα χιλιοστό πριν, όχι',
    cardState({ status: 'cancelled', endsAt: '2026-06-15T10:00:00.001Z' }, NOW).tone === 'cancelled-running');
}

console.log(`cardState — ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
console.log('✓ όλα πέρασαν');
