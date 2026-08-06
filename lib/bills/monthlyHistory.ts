// ═══════════════════════════════════════════════════════════════════════════
// ΔΙΑΚΟΣΙΑ ΤΕΣΣΕΡΑ ΚΕΛΙΑ ΠΟΥ ΖΗΤΟΥΣΑΝ ΤΑ ΙΔΙΑ ΝΟΥΜΕΡΑ ΔΕΥΤΕΡΗ ΦΟΡΑ
// ─────────────────────────────────────────────────────────────────────────
// Η οθόνη των Συμβολαίων είχε πίνακα «Ιστορικό»: δεκαεπτά κατηγορίες επί δώδεκα
// μήνες, δηλαδή 204 πεδία αριθμού, με τη λεζάντα «Καταχώρησε τα ποσά από τους
// λογαριασμούς σου ανά μήνα».
//
// Τα ποσά ΗΤΑΝ ΗΔΗ καταχωρημένα. Δέκα εκατοστά πιο πάνω, στον ίδιο πίνακα, κάθε
// λογαριασμός έχει ποσό, κατηγορία, ημερομηνία λήξης και δήλωση αν είναι πάγιος.
// Το «ιστορικό» ζητούσε από τον χρήστη να ξαναγράψει με το χέρι ό,τι μόλις είχε
// γράψει — και μόνο τότε εμφανίζονταν τα γραφήματα. Όποιος δεν το έκανε έβλεπε
// «Μέσο μηνιαίο 0,00 €» για πάντα, δίπλα σε μια λίστα γεμάτη λογαριασμούς.
//
// Ο μήνας ενός λογαριασμού βγαίνει από τα δεδομένα του:
//   · Πάγιος: επαναλαμβάνεται με τον ρυθμό της περιόδου του, από τον μήνα λήξης
//     και μετά — και προς τα πίσω, γιατί ένας πάγιος που τρέχει τον Αύγουστο
//     έτρεχε και τον Ιούλιο.
//   · Εφάπαξ: μετράει ΜΟΝΟ στον μήνα που λήγει.
//
// Ό,τι έχει γραφτεί στο `bills_history` ΔΕΝ αγνοείται: αν ο χρήστης έχει
// συμπληρώσει έναν μήνα, η δική του τιμή υπερισχύει. Δεν σβήνουμε δουλειά που
// έγινε· σταματάμε μόνο να τη ζητάμε.
// ═══════════════════════════════════════════════════════════════════════════

export interface BillLike {
  category: string;
  amount: number;
  /** «YYYY-MM-DD» ή κενό. */
  due_date?: string | null;
  recurring?: boolean;
  /** 'monthly' | 'bimonthly' | 'quarterly' | 'biannual' | 'annual' | άλλο. */
  period?: string | null;
}

/** Κάθε πόσους μήνες επαναλαμβάνεται μια περίοδος. Άγνωστη περίοδος = μηνιαία. */
export const PERIOD_MONTHS: Record<string, number> = {
  monthly: 1, bimonthly: 2, quarterly: 3, biannual: 6, annual: 12,
};

function monthOf(iso: string | null | undefined, year: number): number | null {
  if (!iso || !/^\d{4}-\d{2}/.test(iso)) return null;
  if (Number(iso.slice(0, 4)) !== year) return null;
  const m = Number(iso.slice(5, 7));
  return m >= 1 && m <= 12 ? m - 1 : null;
}

/**
 * Οι μήνες του έτους στους οποίους βαραίνει ένας λογαριασμός (δείκτες 0 έως 11).
 *
 * Ο πάγιος απλώνεται και ΠΡΟΣ ΤΑ ΠΙΣΩ από τον μήνα του: ένα συμβόλαιο ίντερνετ
 * με λήξη τον Αύγουστο δεν ξεκίνησε τον Αύγουστο. Ο εφάπαξ μετράει μόνο εκεί που
 * λήγει — ένας ΕΝΦΙΑ του Μαΐου δεν είναι μηνιαίο έξοδο.
 */
export function monthsFor(bill: BillLike, year: number): number[] {
  const m = monthOf(bill.due_date, year);
  if (!bill.recurring) return m == null ? [] : [m];
  const step = PERIOD_MONTHS[(bill.period || 'monthly')] ?? 1;
  // Χωρίς ημερομηνία, ένας πάγιος τρέχει όλο τον χρόνο με τον ρυθμό του,
  // αγκυρωμένος στον Ιανουάριο.
  const anchor = m ?? 0;
  const out: number[] = [];
  for (let i = anchor % step; i < 12; i += step) out.push(i);
  return out;
}

/**
 * Τα μηνιαία σύνολα ανά κατηγορία, υπολογισμένα από τους ίδιους τους
 * λογαριασμούς. Το `stored` (ό,τι έχει γράψει ο χρήστης στο `bills_history`)
 * υπερισχύει όπου έχει τιμή μεγαλύτερη του μηδενός.
 */
export function deriveMonthlyByCategory(
  bills: BillLike[],
  year: number,
  stored?: Record<string, (string | number)[]> | null,
): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  const put = (cat: string, i: number, v: number) => {
    if (!out[cat]) out[cat] = Array(12).fill(0);
    out[cat][i] = Math.round((out[cat][i] + v) * 100) / 100;
  };

  for (const b of bills) {
    const amount = Number(b.amount);
    if (!Number.isFinite(amount) || amount === 0) continue;
    for (const i of monthsFor(b, year)) put(b.category || 'other', i, amount);
  }

  for (const [cat, arr] of Object.entries(stored || {})) {
    if (!Array.isArray(arr)) continue;
    for (let i = 0; i < 12; i++) {
      const v = typeof arr[i] === 'number' ? (arr[i] as number) : parseFloat(String(arr[i] ?? ''));
      if (Number.isFinite(v) && v > 0) {
        if (!out[cat]) out[cat] = Array(12).fill(0);
        out[cat][i] = Math.round(v * 100) / 100;
      }
    }
  }
  return out;
}

/** Το σύνολο κάθε μήνα, από όλες τις κατηγορίες. */
export function monthlyTotals(byCategory: Record<string, number[]>): number[] {
  const totals = Array(12).fill(0);
  for (const arr of Object.values(byCategory)) {
    for (let i = 0; i < 12; i++) totals[i] = Math.round((totals[i] + (arr[i] || 0)) * 100) / 100;
  }
  return totals;
}

/**
 * Ο μέσος όρος ΤΩΝ ΜΗΝΩΝ ΠΟΥ ΕΧΟΥΝ ΚΙΝΗΣΗ.
 *
 * Διαιρώντας διά δώδεκα, ένα ακίνητο με τρεις καταχωρημένους μήνες θα έδειχνε
 * μέσο όρο τέταρτο του πραγματικού — νούμερο που μοιάζει με μέτρηση και δεν είναι.
 */
export function averageMonthly(totals: number[]): number {
  const filled = totals.filter(t => t > 0);
  if (!filled.length) return 0;
  return Math.round((filled.reduce((s, t) => s + t, 0) / filled.length) * 100) / 100;
}
