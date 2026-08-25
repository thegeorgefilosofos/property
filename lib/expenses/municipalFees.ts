// ═══════════════════════════════════════════════════════════════════════════
// ΔΗΜΟΤΙΚΑ ΤΕΛΗ: ΔΩΔΕΚΑ ΚΟΥΤΑΚΙΑ ΓΙΝΟΝΤΑΙ ΔΥΟ ΑΡΙΘΜΟΙ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΖΗΤΟΥΣΕ Η ΟΘΟΝΗ. Δώδεκα πεδία «€», ένα ανά μήνα, συμπληρωμένα με το χέρι
// από δώδεκα λογαριασμούς ρεύματος. Είκοσι τέσσερα πατήματα τον χρόνο για
// αριθμούς που ήδη υπάρχουν μέσα στην εφαρμογή: κάθε λογαριασμός ρεύματος
// καταχωρείται ως δαπάνη, με ημερομηνία και ποσό.
//
// ΤΙ ΞΕΡΟΥΜΕ ΠΡΑΓΜΑΤΙΚΑ. Τα δημοτικά τέλη δεν είναι ξεχωριστός λογαριασμός:
// ταξιδεύουν ΜΕΣΑ στον λογαριασμό ρεύματος, ως σταθερό ποσοστό του. Ο χρήστης
// το μετρά ΜΙΑ φορά, από έναν πραγματικό λογαριασμό (σύνολο και σκέλος τελών),
// και από εκεί και πέρα κάθε μήνας βγαίνει μόνος του.
//
// ── ΤΙ ΔΕΝ ΚΑΝΟΥΜΕ ────────────────────────────────────────────────────────
// ΔΕΝ γράφουμε μηδέν σε μήνα χωρίς λογαριασμό. Το «0,00 €» σημαίνει «δεν
// πλήρωσα δημοτικά τέλη τον Μάρτιο», ενώ η αλήθεια είναι «δεν έχει καταχωρηθεί
// λογαριασμός ρεύματος για τον Μάρτιο». Ο μέσος όρος που θα έβγαινε από
// μηδενικά θα ήταν λάθος προς τα κάτω και θα κατέβαινε στον προϋπολογισμό.
//
// ΔΕΝ κρύβουμε ότι ο αριθμός είναι παράγωγος. Καθε μήνας φέρει την προέλευσή
// του: μετρημένος από τον χρήστη, υπολογισμένος από ποσοστό, ή άγνωστος.
//
// ΔΕΝ σιωπούμε όταν το ποσοστό είναι απίθανο. Στην Ελλάδα τα δημοτικά τέλη
// κινούνται τυπικά στο 3% έως 6% του λογαριασμού· ένα 40% σημαίνει ότι κάποιος
// έγραψε λάθος πεδίο και η οθόνη οφείλει να το πει πριν πολλαπλασιάσει.
// ═══════════════════════════════════════════════════════════════════════════

/** Τυπικό εύρος στην Ελλάδα. Πηγή: ο ίδιος ο λογαριασμός κάθε νοικοκυριού. */
export const TYPICAL_SHARE = { min: 3, max: 6 } as const;

/** Πάνω από αυτό, κάτι έχει γραφτεί λάθος και δεν πολλαπλασιάζουμε σιωπηλά. */
const IMPLAUSIBLE_SHARE = 25;

export interface FeeShare {
  /** Το ποσοστό επί τοις εκατό, ή `null` όταν δεν έχει μετρηθεί. */
  pct: number | null;
  /** Μέσα στο αναμενόμενο εύρος; Το ρωτά η οθόνη για να προειδοποιήσει. */
  typical: boolean;
  /** Τόσο εκτός που δεν αξίζει να πολλαπλασιαστεί. */
  implausible: boolean;
}

/**
 * Το ποσοστό των δημοτικών τελών, από έναν πραγματικό λογαριασμό.
 *
 * Το σκέλος των τελών ΔΕΝ μπορεί να ξεπερνά το σύνολο: όταν συμβαίνει, ο
 * χρήστης έγραψε τα δύο ποσά ανάποδα και δεν επιστρέφουμε ποσοστό.
 */
export function feeShare(billTotal: number, feesOnBill: number): FeeShare {
  const total = Number(billTotal), fees = Number(feesOnBill);
  if (!Number.isFinite(total) || !Number.isFinite(fees) || total <= 0 || fees <= 0 || fees > total) {
    return { pct: null, typical: false, implausible: false };
  }
  const pct = (fees / total) * 100;
  return {
    pct,
    typical: pct >= TYPICAL_SHARE.min && pct <= TYPICAL_SHARE.max,
    implausible: pct > IMPLAUSIBLE_SHARE,
  };
}

/** Μία δαπάνη, όσο χρειάζεται ο υπολογισμός. */
export interface FeeSourceRow { date: string; amount: number; category: string }

export type FeeOrigin = 'measured' | 'derived' | 'unknown';

export interface MonthFee {
  /** 0 = Ιανουάριος. */
  month: number;
  /** Το ποσό, ή `null` όταν δεν ξέρουμε. Ποτέ μηδέν στη θέση του άγνωστου. */
  amount: number | null;
  origin: FeeOrigin;
}

const ELECTRICITY = 'electricity';

/**
 * Τα δημοτικά τέλη κάθε μήνα του έτους.
 *
 * @param rows       Οι δαπάνες του ακινήτου. Διαβάζονται μόνο οι λογαριασμοί ρεύματος.
 * @param year       Η χρονιά που δείχνει η οθόνη.
 * @param share      Το μετρημένο ποσοστό.
 * @param overrides  Ο,τι έγραψε ο χρήστης με το χέρι, ανά μήνα. Υπερισχύει πάντα:
 *                   ένας πραγματικός λογαριασμός είναι ισχυρότερος από κάθε εκτίμηση.
 */
export function monthlyFees(
  rows: readonly FeeSourceRow[],
  year: number,
  share: FeeShare,
  overrides: readonly string[] = [],
): MonthFee[] {
  const electricityByMonth = new Array(12).fill(0);
  const hasBill = new Array(12).fill(false);
  for (const r of rows) {
    if ((r.category || '') !== ELECTRICITY) continue;
    const d = String(r.date || '');
    if (d.slice(0, 4) !== String(year)) continue;
    const m = Number(d.slice(5, 7)) - 1;
    if (!(m >= 0 && m < 12)) continue;
    const a = Number(r.amount);
    if (!Number.isFinite(a) || a <= 0) continue;
    electricityByMonth[m] += a;
    hasBill[m] = true;
  }

  const usable = share.pct != null && !share.implausible;
  return Array.from({ length: 12 }, (_, m) => {
    const typed = Number(String(overrides[m] ?? '').replace(',', '.'));
    if (Number.isFinite(typed) && typed > 0) return { month: m, amount: typed, origin: 'measured' as const };
    if (usable && hasBill[m]) {
      return { month: m, amount: electricityByMonth[m] * (share.pct as number) / 100, origin: 'derived' as const };
    }
    return { month: m, amount: null, origin: 'unknown' as const };
  });
}

/** Ο μέσος όρος ΤΩΝ ΓΝΩΣΤΩΝ μηνών. `null` όταν δεν ξέρουμε κανέναν. */
export function averageMonthly(months: readonly MonthFee[]): number | null {
  const known = months.filter(m => m.amount != null) as { amount: number }[];
  if (!known.length) return null;
  return known.reduce((s, m) => s + m.amount, 0) / known.length;
}

/** Η μία πρόταση που εξηγεί από πού βγήκαν τα ποσά. Κενή όταν δεν ξέρουμε τίποτα. */
export function feeOriginNote(months: readonly MonthFee[]): string {
  const measured = months.filter(m => m.origin === 'measured').length;
  const derived = months.filter(m => m.origin === 'derived').length;
  if (!measured && !derived) return '';
  const parts: string[] = [];
  if (derived) parts.push(`${derived} ${derived === 1 ? 'μήνας υπολογισμένος' : 'μήνες υπολογισμένοι'} από τους λογαριασμούς ρεύματος`);
  if (measured) parts.push(`${measured} ${measured === 1 ? 'γραμμένος' : 'γραμμένοι'} με το χέρι`);
  return parts.join(' · ');
}
