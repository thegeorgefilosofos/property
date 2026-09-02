// ═══════════════════════════════════════════════════════════════════════════
// Η ΔΙΑΣΤΑΥΡΩΣΗ ΤΩΝ ΕΠΙΤΟΚΙΩΝ, ΧΩΡΙΣ ΔΙΚΤΥΟ ΚΑΙ ΧΩΡΙΣ ΒΑΣΗ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΕΚΑΝΕ Η ΤΡΟΦΟΔΟΣΙΑ ΠΡΙΝ. Μία φορά τον μήνα ρωτούσε ένα μοντέλο με
// αναζήτηση web και έγραφε ό,τι απαντούσε, αρκεί να ήταν αριθμός ανάμεσα σε
// 0,3 και 8. Ενα λάθος του μοντέλου —μια σελίδα του 2024, ένα επιτόκιο
// καταθέσεων αντί για στεγαστικό— θα έμπαινε στην οθόνη με σημερινή ημερομηνία
// και τη λέξη «επιβεβαιωμένο» δίπλα του. Και όταν αποτύγχανε, δεν άφηνε ίχνος:
// τα δεδομένα έμεναν του Ιουλίου και η οθόνη μετρούσε ημέρες.
//
// ΤΙ ΚΑΝΕΙ ΤΩΡΑ. Κάθε πρόταση συγκρίνεται με ό,τι ισχύει. Μια μικρή μεταβολή
// (ώς μία ποσοστιαία μονάδα) είναι ό,τι κάνουν οι τράπεζες όταν αλλάζουν
// τιμολόγιο: εφαρμόζεται. Μια μεγάλη μεταβολή είναι είτε είδηση είτε λάθος:
// ΚΡΑΤΙΕΤΑΙ, γράφεται στο ημερολόγιο αλλαγών και εφαρμόζεται μόνο αν η
// επόμενη ανεξάρτητη εκτέλεση επιστρέψει ΤΗΝ ΙΔΙΑ τιμή. Δύο περάσματα που
// συμφωνούν είναι διασταύρωση· ένα πέρασμα είναι φήμη.
//
// ΓΙΑΤΙ ΕΙΝΑΙ ΚΑΘΑΡΗ ΣΥΝΑΡΤΗΣΗ ΣΕ ΔΙΚΟ ΤΗΣ ΑΡΧΕΙΟ. Την τρέχει η edge function
// στο Deno και τη δοκιμάζει το `tsx` εδώ, με τους ίδιους αριθμούς. Χωρίς
// εισαγωγές `@/`, ώστε να τη φορτώνουν και τα δύο περιβάλλοντα με σχετική
// διαδρομή — όπως κάνει ήδη το `lib/market/ecb.ts` για την τροφοδοσία της ΕΚΤ.
// ═══════════════════════════════════════════════════════════════════════════

/** Τα πεδία που ελέγχονται, με το κατώφλι ΚΡΑΤΗΣΗΣ του καθενός (ποσοστιαίες μονάδες). */
export const RATE_FIELDS = ['fixed_3yr', 'fixed_5yr', 'fixed_10yr', 'fixed_15yr', 'fixed_20yr'] as const;
export const SPREAD_FIELDS = ['variable_spread_min', 'variable_spread_max'] as const;
export type RateField = typeof RATE_FIELDS[number];
export type SpreadField = typeof SPREAD_FIELDS[number];
export type CheckedField = RateField | SpreadField | 'max_ltv';

/** Πάνω από τόσο, η μεταβολή περιμένει δεύτερη επιβεβαίωση. */
export const HOLD_ABOVE: Record<CheckedField, number> = {
  fixed_3yr: 1.0, fixed_5yr: 1.0, fixed_10yr: 1.0, fixed_15yr: 1.0, fixed_20yr: 1.0,
  variable_spread_min: 1.0, variable_spread_max: 1.0,
  max_ltv: 10,
};

/** Η γραμμή όπως ζει στον πίνακα `bank_rates`: τα σταθερά είναι κείμενο («2,40» ή «2.40-4.70»). */
export type CurrentBank = {
  bank_id: string;
  fixed_3yr: string | null; fixed_5yr: string | null; fixed_10yr: string | null;
  fixed_15yr: string | null; fixed_20yr: string | null;
  variable_spread_min: number | null; variable_spread_max: number | null;
  max_ltv: number | null;
};

/** Η πρόταση του μοντέλου, ήδη στενεμένη σε αριθμούς από τον καλούντα. */
export type ProposedBank = Partial<Record<CheckedField, number>>;

export type Change = {
  bank_id: string;
  field: CheckedField;
  /** `null` όταν ο πίνακας δεν είχε τιμή. */
  old: number | null;
  next: number;
  delta: number | null;
};

/**
 * Το «από» ενός επιτοκίου, όπως γράφεται στον πίνακα: «2.40-4.70» → 2,40,
 * «3,40» → 3,40. Το εύρος κρατά το ΧΑΜΗΛΟΤΕΡΟ, γιατί αυτό δείχνει η οθόνη
 * («από 2,40%») και αυτό συγκρίνεται με ό,τι επιστρέφει η αναζήτηση.
 */
export function fromRate(text: string | number | null | undefined): number | null {
  if (text == null) return null;
  const m = String(text).replace(',', '.').match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const v = parseFloat(m[0]);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

/** Ποια πεδία της πρότασης διαφέρουν από τη γραμμή. Ισότητα στο εκατοστό. */
export function diffBank(current: CurrentBank, proposed: ProposedBank): Change[] {
  const out: Change[] = [];
  const fields: CheckedField[] = [...RATE_FIELDS, ...SPREAD_FIELDS, 'max_ltv'];
  for (const f of fields) {
    const next = proposed[f];
    if (next == null || !Number.isFinite(next)) continue;
    const raw = current[f];
    const old = typeof raw === 'number' ? Math.round(raw * 100) / 100 : fromRate(raw);
    if (old != null && Math.abs(old - next) < 0.005) continue;
    out.push({ bank_id: current.bank_id, field: f, old, next, delta: old == null ? null : Math.round((next - old) * 100) / 100 });
  }
  return out;
}

/** Το κλειδί με το οποίο μια κρατημένη αλλαγή αναγνωρίζει τον εαυτό της στην επόμενη εκτέλεση. */
export const changeKey = (c: { bank_id: string; field: string; next: number }): string =>
  `${c.bank_id}:${c.field}:${c.next.toFixed(2)}`;

export type Decision = { apply: Change[]; hold: Change[] };

/**
 * Τι εφαρμόζεται και τι περιμένει.
 *
 * ΜΙΚΡΗ ΜΕΤΑΒΟΛΗ, Ή ΠΡΩΤΗ ΤΙΜΗ ΣΕ ΚΕΝΟ ΠΕΔΙΟ: εφαρμόζεται. ΜΕΓΑΛΗ ΜΕΤΑΒΟΛΗ:
 * κρατιέται — εκτός αν η ίδια ακριβώς τιμή είχε κρατηθεί σε προηγούμενη,
 * ανεξάρτητη εκτέλεση (`confirmed`), οπότε δύο περάσματα συμφώνησαν και
 * εφαρμόζεται. Μια τιμή που άλλαξε ανάμεσα στα δύο περάσματα ΔΕΝ επιβεβαιώνει
 * τίποτα: ξεκινά από την αρχή.
 */
export function decide(changes: Change[], confirmed: ReadonlySet<string>, holdAbove: Record<CheckedField, number> = HOLD_ABOVE): Decision {
  const apply: Change[] = [], hold: Change[] = [];
  for (const c of changes) {
    const big = c.delta != null && Math.abs(c.delta) > holdAbove[c.field];
    if (!big || confirmed.has(changeKey(c))) apply.push(c); else hold.push(c);
  }
  return { apply, hold };
}

/** Το ελάχιστο πλήθος τραπεζών για να θεωρηθεί ένα πέρασμα αξιόπιστο. */
export const MIN_BANKS = 3;
