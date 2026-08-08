// ═══════════════════════════════════════════════════════════════════════════
// ΑΚΡΙΒΥΝΕ ΚΑΤΙ ΠΟΥ ΠΛΗΡΩΝΩ, ΚΑΙ ΔΕΝ ΤΟ ΠΗΡΑ ΕΙΔΗΣΗ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΕΡΩΤΗΜΑ ΠΟΥ ΖΗΤΗΘΗΚΕ: «μία φορά τον μήνα να ελέγχουμε Netflix, Spotify,
// Disney+ και ό,τι άλλο, για αλλαγές τιμών».
//
// Η ΠΡΟΦΑΝΗΣ ΛΥΣΗ ΕΙΝΑΙ Η ΛΑΘΟΣ. Θα ήταν κατάλογος τιμών της αγοράς,
// ενημερωμένος με αναζήτηση — δηλαδή ακριβώς το ίδιο πράγμα που απέτυχε στα
// τιμολόγια ρεύματος: εκατό τιμές τρίτων, συντηρημένες από μακριά, που παλιώνουν
// σιωπηλά. Και θα απαντούσε σε λάθος ερώτηση: ο ιδιοκτήτης δεν ρωτά «πόσο κάνει
// το Netflix», ρωτά «γιατί μου χρεώθηκαν τρία ευρώ παραπάνω».
//
// Η ΑΠΑΝΤΗΣΗ ΕΙΝΑΙ ΜΕΣΑ ΣΤΑ ΔΙΚΑ ΤΟΥ ΔΕΔΟΜΕΝΑ. Αν πλήρωνε 8,99 € για δέκα μήνες
// και τον ενδέκατο 10,99 €, η αύξηση είναι ΓΕΓΟΝΟΣ — όχι εκτίμηση, όχι τιμή
// καταλόγου, όχι κάτι που χρειάζεται επαλήθευση από τρίτη πηγή. Δεν σαπίζει
// ποτέ, γιατί δεν είναι δεδομένο τρίτου.
//
// Η ΔΙΑΚΡΙΣΗ ΠΟΥ ΚΑΝΕΙ ΤΗ ΔΙΑΦΟΡΑ ΑΝΑΜΕΣΑ ΣΕ ΧΡΗΣΙΜΟ ΚΑΙ ΣΕ ΘΟΡΥΒΟ
//
// Σε ΣΤΑΘΕΡΗ συνδρομή (Netflix, ασφάλεια, internet) η αύξηση σημαίνει ένα
// πράγμα: ακρίβυνε. Σε ΜΕΤΡΟΥΜΕΝΟ λογαριασμό (ρεύμα, νερό, αέριο) η ίδια αύξηση
// μπορεί να σημαίνει ότι έκανε κρύο. Το να πούμε «ακρίβυνε το ρεύμα» τον
// Ιανουάριο είναι λάθος με σιγουριά — και ο χρήστης που το διαβάζει δύο φορές
// παύει να διαβάζει τις ειδοποιήσεις.
//
// Γι' αυτό η ίδια μέτρηση παράγει ΔΥΟ διαφορετικές διατυπώσεις, και η επιλογή
// γίνεται από την κατηγορία, όχι από το μέγεθος της διαφοράς.
// ═══════════════════════════════════════════════════════════════════════════

import { expectedSeries } from './expected';
import type { LedgerEntry } from './ledger';

/**
 * Κατηγορίες όπου το ποσό ΔΕΝ εξαρτάται από κατανάλωση.
 *
 * Εκεί η μεταβολή του ποσού είναι μεταβολή ΤΙΜΗΣ και λέγεται έτσι. Παντού
 * αλλού λέγεται «άλλαξε το ποσό», που είναι το μόνο που ξέρουμε σίγουρα.
 */
const FLAT_RATE = /stream|subscription|συνδρομ|cloud|netflix|spotify|disney|insurance|ασφαλ|internet|τηλεφ|σταθερ|security|συναγερμ/;

/** Κάτω από αυτό, η διαφορά είναι στρογγυλοποίηση ή μικροχρέωση, όχι είδηση. */
const MIN_ABS_EUR = 2;
/** Και κάτω από αυτό το ποσοστό, δεν αξίζει τη διακοπή της προσοχής. */
const MIN_PCT = 10;
/** Πόσες προηγούμενες εμφανίσεις χρειάζονται για να υπάρχει «κανονική» τιμή. */
const MIN_PRIOR = 3;

export interface PriceChange {
  key: string;
  title: string;
  category: string;
  vendor: string | null;
  /** Η καθιερωμένη τιμή, διάμεσος των προηγούμενων. */
  previous: number;
  /** Η τελευταία χρέωση. */
  current: number;
  /** Διαφορά σε ευρώ, θετική όταν ακρίβυνε. */
  deltaEur: number;
  /** Διαφορά σε ποσοστό, στρογγυλεμένη στο ακέραιο. */
  deltaPct: number;
  /** Ο μήνας της τελευταίας χρέωσης, «2026-08». */
  month: string;
  /** Σταθερή τιμή ή μετρούμενη κατανάλωση; Καθορίζει τη διατύπωση. */
  flatRate: boolean;
  /** Η πρόταση, έτοιμη για την οθόνη. */
  message: string;
}

const median = (nums: number[]): number => {
  const s = [...nums].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const monthOf = (iso: string) => iso.slice(0, 7);
const eur = (n: number) => `${n.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/**
 * Ποιες επαναλαμβανόμενες χρεώσεις άλλαξαν ποσό στην τελευταία τους εμφάνιση.
 *
 * Η ΣΥΓΚΡΙΣΗ ΓΙΝΕΤΑΙ ΜΕ ΤΙΣ ΠΡΟΗΓΟΥΜΕΝΕΣ, ΧΩΡΙΣ ΤΗΝ ΤΕΛΕΥΤΑΙΑ. Αν η τελευταία
 * μπει στον διάμεσο, τραβά τον διάμεσο προς το μέρος της και μικραίνει τη
 * διαφορά που ψάχνουμε — δηλαδή η μέτρηση κρύβει ακριβώς αυτό που μετρά.
 */
export function priceChanges(
  entries: readonly LedgerEntry[], today: Date,
): PriceChange[] {
  const series = expectedSeries(entries, today);
  const out: PriceChange[] = [];

  for (const s of series) {
    // Οι εμφανίσεις της σειράς, μία ανά μήνα, σε χρονική σειρά.
    const own = entries.filter(e =>
      e.date && e.amount > 0 &&
      `${e.category}|${(e.vendor || '').trim().toLowerCase()}` === s.key);
    const byMonth = new Map<string, number>();
    for (const e of own) byMonth.set(monthOf(e.date), (byMonth.get(monthOf(e.date)) ?? 0) + e.amount);
    const months = [...byMonth.keys()].sort();
    if (months.length < MIN_PRIOR + 1) continue;

    const lastMonth = months[months.length - 1];
    const current = byMonth.get(lastMonth)!;
    const prior = months.slice(0, -1).map(m => byMonth.get(m)!);
    const previous = median(prior);
    if (previous <= 0) continue;

    const deltaEur = Math.round((current - previous) * 100) / 100;
    const deltaPct = Math.round((deltaEur / previous) * 100);
    if (Math.abs(deltaEur) < MIN_ABS_EUR || Math.abs(deltaPct) < MIN_PCT) continue;

    const flatRate = FLAT_RATE.test(`${s.category} ${s.title} ${s.vendor ?? ''}`.toLowerCase());
    const up = deltaEur > 0;
    const message = flatRate
      ? `${s.title}: ${up ? 'ακρίβυνε' : 'έγινε φθηνότερο'} από ${eur(previous)} σε ${eur(current)}, ${up ? '+' : '−'}${eur(Math.abs(deltaEur))} τον μήνα.`
      // ΜΕΤΡΟΥΜΕΝΟΣ ΛΟΓΑΡΙΑΣΜΟΣ: λέμε ΜΟΝΟ ότι άλλαξε το ποσό, και ρητά ότι
      // μπορεί να φταίει η κατανάλωση. Το «ακρίβυνε το ρεύμα» τον Ιανουάριο
      // είναι λάθος με σιγουριά.
      : `${s.title}: ${eur(current)} αντί για ${eur(previous)} που πλήρωνες συνήθως, ${up ? '+' : '−'}${Math.abs(deltaPct)}%. Μπορεί να είναι η κατανάλωση ή η τιμή.`;

    out.push({
      key: s.key, title: s.title, category: s.category, vendor: s.vendor,
      previous: Math.round(previous * 100) / 100, current: Math.round(current * 100) / 100,
      deltaEur, deltaPct, month: lastMonth, flatRate, message,
    });
  }

  // Πρώτα η μεγαλύτερη αύξηση σε ευρώ: αυτή κοστίζει περισσότερο τον χρόνο.
  return out.sort((a, b) => b.deltaEur - a.deltaEur);
}
