// ═══════════════════════════════════════════════════════════════════════════
// Η ΝΕΑ ΓΡΑΜΜΗ ΜΕΣΑ ΣΤΟΝ ΠΙΝΑΚΑ, ΓΡΑΜΜΕΝΗ ΑΠΟ ΜΗΧΑΝΗ
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ. Ο μηνιαίος δείκτης ζει σε πίνακα μέσα στον κώδικα, όχι σε βάση:
// είναι οκτώ αριθμοί που μπαίνουν σε υπογεγραμμένες ειδοποιήσεις, και τους
// θέλουμε τυπωμένους στο ίδιο commit με τον έλεγχό τους. Ο αυτόματος έλεγχος
// όμως πρέπει να μπορεί να προσθέσει γραμμή — αλλιώς κάθε μήνα χρειάζεται χέρι.
//
// ΓΙΑΤΙ ΕΙΝΑΙ ΞΕΧΩΡΙΣΤΗ ΣΥΝΑΡΤΗΣΗ ΚΑΙ ΟΧΙ ΤΡΕΙΣ ΓΡΑΜΜΕΣ ΜΕΣΑ ΣΤΟ SCRIPT. Επειδή
// γράφει πηγαίο αρχείο. Ένα λάθος εδώ δεν βγάζει σφάλμα: βγάζει έναν πίνακα με
// χαμένη γραμμή ή με λάθος ποσοστό, που περνά τα τεστ και φτάνει στην παραγωγή.
// Ως καθαρή συνάρτηση κειμένου, δοκιμάζεται.
//
// ΤΙ ΔΕΝ ΚΑΝΕΙ. Δεν αποφασίζει. Δεν ελέγχει αν το ποσοστό είναι λογικό, δεν
// ξέρει από ΕΛΣΤΑΤ, δεν διαβάζει PDF. Παίρνει έναν μήνα και έναν αριθμό που
// έχουν ήδη επαληθευτεί αλλού, και τα βάζει στη σωστή θέση.
// ═══════════════════════════════════════════════════════════════════════════

/** Πόσοι μήνες ανά σειρά, όπως είναι γραμμένος ο πίνακας στο χέρι. */
const PER_LINE = 4;

export type TableResult =
  | { ok: true; source: string }
  | { ok: false; reason: string };

/**
 * Το `lib/market/cpi.ts` με μία γραμμή παραπάνω και φρέσκια ημερομηνία ελέγχου.
 *
 * Η μορφή του πίνακα διατηρείται (τέσσερις μήνες ανά σειρά), ώστε το pull
 * request να δείχνει μία γραμμή αλλαγμένη και όχι αναδιάταξη ολόκληρου μπλοκ.
 *
 * @param src    το αρχείο, όπως είναι
 * @param ym     ο μήνας, «YYYY-MM»
 * @param pct    η απλή δωδεκάμηνη μεταβολή, σε μονάδες τοις εκατό
 * @param today  η ημερομηνία του ελέγχου, «YYYY-MM-DD»
 */
export function withIndexRow(src: string, ym: string, pct: number, today: string): TableResult {
  if (!/^\d{4}-\d{2}$/.test(ym)) return { ok: false, reason: `άκυρος μήνας: ${ym}` };
  if (!Number.isFinite(pct)) return { ok: false, reason: `άκυρο ποσοστό: ${pct}` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return { ok: false, reason: `άκυρη ημερομηνία: ${today}` };

  const open = src.indexOf('export const RENT_INDEX');
  const brace = open < 0 ? -1 : src.indexOf('{', open);
  const close = brace < 0 ? -1 : src.indexOf('};', brace);
  if (close < 0) return { ok: false, reason: 'ο πίνακας RENT_INDEX δεν βρέθηκε' };

  const entries = new Map<string, string>();
  for (const m of src.slice(brace + 1, close).matchAll(/'(\d{4}-\d{2})':\s*(-?\d+(?:\.\d+)?)/g)) {
    entries.set(m[1], m[2]);
  }
  if (entries.size === 0) return { ok: false, reason: 'ο πίνακας RENT_INDEX είναι άδειος' };
  if (entries.has(ym)) return { ok: false, reason: `ο μήνας ${ym} υπάρχει ήδη στον πίνακα` };

  entries.set(ym, String(pct));
  const rows = [...entries].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `'${k}': ${v}`);
  const lines: string[] = [];
  for (let i = 0; i < rows.length; i += PER_LINE) lines.push('  ' + rows.slice(i, i + PER_LINE).join(', ') + ',');

  const patched = src.slice(0, brace + 1) + '\n' + lines.join('\n') + '\n' + src.slice(close);

  // Η ημερομηνία ελέγχου είναι ό,τι διαβάζει ο φύλακας φρεσκάδας. Αν δεν
  // ανανεωθεί, ο πίνακας μεγαλώνει και το build σταματά ως μπαγιάτικο.
  const stamped = patched.replace(/CPI_CONFIRMED_AT = '[\d-]+'/, `CPI_CONFIRMED_AT = '${today}'`);
  if (stamped === patched) return { ok: false, reason: 'η σταθερά CPI_CONFIRMED_AT δεν βρέθηκε' };

  return { ok: true, source: stamped };
}
