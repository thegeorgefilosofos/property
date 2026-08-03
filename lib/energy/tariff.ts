// ═══════════════════════════════════════════════════════════════════════════
// ΕΝΑΣ ΤΥΠΟΣ ΓΙΑ ΤΟ ΚΟΣΤΟΣ ΤΟΥ ΡΕΥΜΑΤΟΣ.
//
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΛΥΝΕΙ ΑΥΤΟ ΤΟ ΑΡΧΕΙΟ:
// Στην ίδια οθόνη υπήρχαν ΔΥΟ υπολογισμοί για το ίδιο νούμερο. Ο ένας έβγαζε
// «το τιμολόγιό σου», ο άλλος «τα άλλα τιμολόγια», και διέφεραν σε τρία σημεία:
//
//   1. ΚΛΙΜΑΚΩΤΑ. Ο πρώτος χρέωνε ΟΛΕΣ τις ημερήσιες κιλοβατώρες με την τιμή της
//      πρώτης κλίμακας και ΜΕΤΑ πρόσθετε ξανά τις πάνω από το όριο με τη δεύτερη.
//      Το ίδιο ρεύμα πληρωνόταν δύο φορές.
//   2. ΗΛΕΚΤΡΟΝΙΚΟΣ ΛΟΓΑΡΙΑΣΜΟΣ. Ο δεύτερος έπαιρνε ΠΑΝΤΑ την εκπτωτική τιμή
//      του e-bill, ακόμη κι όταν ο χρήστης είχε δηλώσει ότι δεν το έχει. Η
//      σύγκριση υποσχόταν έκπτωση που ο χρήστης δεν δικαιούται.
//   3. ΝΥΧΤΕΡΙΝΗ ΖΩΝΗ. Στα κλιμακωτά, ο δεύτερος χρέωνε τις νυχτερινές
//      κιλοβατώρες και μέσα στην κλίμακα και ξεχωριστά.
//
// Δύο τύποι για το ίδιο πράγμα δεν είναι διπλός κώδικας. Είναι δύο απαντήσεις,
// και μόνο η μία μπορεί να είναι σωστή.
//
// ΤΙ ΜΠΑΙΝΕΙ ΣΤΗ ΣΥΓΚΡΙΣΗ ΚΑΙ ΤΙ ΟΧΙ:
// Στον λογαριασμό ρεύματος υπάρχουν χρεώσεις που ΔΕΝ τις ορίζει ο προμηθευτής:
// χρεώσεις δικτύου ΔΕΔΔΗΕ, δημοτικά τέλη, τέλος ΕΡΤ. Είναι ίδιες όποιον πάροχο
// κι αν διαλέξεις, οπότε δεν αλλάζουν ΠΟΤΕ την κατάταξη. Μένουν έξω, και το
// λέμε ρητά στην οθόνη. Το να τις βάζαμε μέσα θα φούσκωνε κάθε τιμολόγιο με το
// ίδιο ποσό και θα έκρυβε τη διαφορά που πραγματικά μετράει.
//
// Ο ΦΠΑ μένει ΜΕΣΑ, γιατί διαφέρει (6% οικιακό, 24% επαγγελματικό) και ο
// χρήστης πληρώνει το τελικό.
// ═══════════════════════════════════════════════════════════════════════════

/** Ρυθμιζόμενες χρεώσεις ανά κιλοβατώρα, κοινές για κάθε προμηθευτή. */
export const ERT = 0.00856;      // Ειδικό Ρυθμιστικό Τέλος
export const ETMEAR = 0.0152;    // Ειδικό Τέλος ΑΠΕ

export interface Tariff {
  id: string;
  name: string;
  badge: string;
  /** fixed | variable | fixed_monthly | dynamic | vnm */
  type: string;
  kwh_day: number;
  kwh_night?: number | null;
  kwh_tier2?: number;
  tier2_threshold?: number;
  flat_monthly?: number | null;
  flat_annual_kwh?: number;
  flat_overage_rate?: number;
  fixed: number;
  fixed_ebill?: number | null;
  /** 6 για οικιακά, 24 για επαγγελματικά. */
  vat: number;
  segment?: 'residential' | 'business';
}

export interface Usage {
  /** Μέση μηνιαία κατανάλωση σε κιλοβατώρες. */
  kwhMonthly: number;
  /** Ποσοστό της κατανάλωσης στη νυχτερινή ζώνη (0-100). */
  nightPct: number;
  /** Έχει ηλεκτρονικό λογαριασμό και πάγια εντολή; */
  ebill: boolean;
  /** Για δυναμικά τιμολόγια, όπου η τιμή δεν προκύπτει από τύπο. */
  manualMonthly?: number;
}

export interface CostBreakdown {
  /** Πάγιο + χρέωση ενέργειας. Αυτό ΜΟΝΟ ορίζει ο προμηθευτής. */
  supply: number;
  /** Ρυθμιζόμενες χρεώσεις ανά κιλοβατώρα. Ίδιες παντού. */
  regulated: number;
  vat: number;
  /** Το σύνολο που συγκρίνεται και εμφανίζεται. */
  total: number;
  /** Χρέωση υπέρβασης πακέτου, ισομοιρασμένη στον μήνα. 0 όταν δεν υπάρχει. */
  overage: number;
  /** true όταν το ποσό δεν προκύπτει από τύπο (δυναμικό τιμολόγιο). */
  manual: boolean;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Χρέωση υπέρβασης για πακέτα «όλα μέσα» με ετήσιο όριο κιλοβατωρών.
 * Ισομοιράζεται στους δώδεκα μήνες, ώστε να μπαίνει κατευθείαν σε μηνιαίο ποσό.
 * Η ανοχή 5% είναι η συνήθης πρακτική της αγοράς και δηλώνεται ρητά εδώ αντί να
 * κρύβεται μέσα σε έναν πολλαπλασιασμό.
 */
const overageMonthly = (t: Tariff, kwhMonthly: number): number => {
  if (!t.flat_annual_kwh || !t.flat_overage_rate) return 0;
  const projectedAnnual = kwhMonthly * 12;
  const allowance = t.flat_annual_kwh * 1.05;
  if (projectedAnnual <= allowance) return 0;
  return ((projectedAnnual - allowance) * t.flat_overage_rate) / 12;
};

/**
 * Η χρέωση ενέργειας, χωρίς πάγιο και χωρίς ρυθμιζόμενα.
 *
 * ΚΛΙΜΑΚΩΤΑ ΚΑΙ ΝΥΧΤΕΡΙΝΗ ΖΩΝΗ ΔΕΝ ΣΥΝΥΠΑΡΧΟΥΝ σε κανένα τιμολόγιο του
 * καταλόγου, και υπάρχει test που το επιβεβαιώνει. Αν κάποτε προστεθεί τέτοιο
 * τιμολόγιο, το test σπάει και κάποιος πρέπει να αποφασίσει συνειδητά πώς
 * συνδυάζονται, αντί να βγάλει σιωπηλά λάθος νούμερο ο κώδικας.
 */
function energyCharge(t: Tariff, u: Usage): number {
  const kwh = Math.max(0, u.kwhMonthly);
  if (kwh === 0) return 0;

  if (t.kwh_tier2 && t.tier2_threshold) {
    const tier1 = Math.min(kwh, t.tier2_threshold);
    const tier2 = Math.max(0, kwh - t.tier2_threshold);
    return tier1 * t.kwh_day + tier2 * t.kwh_tier2;
  }

  const nightPct = Math.min(100, Math.max(0, u.nightPct));
  const nightKwh = t.kwh_night ? kwh * (nightPct / 100) : 0;
  const dayKwh = kwh - nightKwh;
  return dayKwh * t.kwh_day + nightKwh * (t.kwh_night ?? t.kwh_day);
}

/**
 * Το μηνιαίο κόστος ενός τιμολογίου για μια συγκεκριμένη κατανάλωση.
 * Ο ΜΟΝΑΔΙΚΟΣ τύπος: τον καλεί και η κάρτα «το τιμολόγιό σου» και η σύγκριση.
 */
export function monthlyCost(t: Tariff, u: Usage): CostBreakdown {
  const vatRate = (t.vat ?? 6) / 100;
  const zero: CostBreakdown = { supply: 0, regulated: 0, vat: 0, total: 0, overage: 0, manual: false };

  // Δυναμικό τιμολόγιο: η τιμή ακολουθεί τη χονδρεμπορική ανά ώρα και ΔΕΝ
  // προκύπτει από τύπο. Το να δείξουμε εκτίμηση θα ήταν μαντεψιά με το ύφος
  // υπολογισμού. Δείχνουμε ό,τι δήλωσε ο χρήστης, ή τίποτα.
  if (t.type === 'dynamic') {
    const m = u.manualMonthly ?? 0;
    return { ...zero, supply: m, total: m, manual: true };
  }

  if (t.type === 'fixed_monthly') {
    const over = overageMonthly(t, u.kwhMonthly);
    const supply = (t.flat_monthly || 0) + over;
    // Στα πακέτα «όλα μέσα» τα ρυθμιζόμενα περιλαμβάνονται στην τιμή πακέτου.
    const vat = supply * vatRate;
    return { supply: r2(supply), regulated: 0, vat: r2(vat), total: r2(supply + vat), overage: r2(over), manual: false };
  }

  const fixed = (u.ebill && t.fixed_ebill != null) ? t.fixed_ebill : t.fixed;
  const supply = fixed + energyCharge(t, u);
  const regulated = Math.max(0, u.kwhMonthly) * (ERT + ETMEAR);
  const vat = (supply + regulated) * vatRate;

  return {
    supply: r2(supply),
    regulated: r2(regulated),
    vat: r2(vat),
    total: r2(supply + regulated + vat),
    overage: 0,
    manual: false,
  };
}

export interface Ranked<T extends Tariff> {
  tariff: T;
  cost: CostBreakdown;
  isCurrent: boolean;
  /** Διαφορά από το τρέχον τιμολόγιο. Αρνητικό σημαίνει φθηνότερο. */
  diff: number;
}

/**
 * Κατάταξη τιμολογίων για μια κατανάλωση, φθηνότερο πρώτο.
 *
 * Τα δυναμικά μένουν έξω από την κατάταξη: δεν έχουν συγκρίσιμη τιμή και το να
 * τα βάζαμε με μηδέν θα τα έδειχνε ως «φθηνότερα από όλα».
 */
export function compareTariffs<T extends Tariff>(
  tariffs: T[], u: Usage, currentId: string | null, currentCost: number,
): Ranked<T>[] {
  return tariffs
    .filter(t => t.type !== 'dynamic')
    .map(t => {
      const cost = monthlyCost(t, u);
      const isCurrent = t.id === currentId;
      return { tariff: t, cost, isCurrent, diff: isCurrent ? 0 : r2(cost.total - currentCost) };
    })
    .sort((a, b) => a.cost.total - b.cost.total);
}

// ─────────────────────────────────────────────────────────────────────────────
// ΠΟΣΟ ΡΕΥΜΑ ΚΑΙΕΙ ΠΡΑΓΜΑΤΙΚΑ Ο ΧΡΗΣΤΗΣ
//
// ΤΟ ΣΦΑΛΜΑ: η οθόνη ξεκινούσε με 250 κιλοβατώρες τον μήνα ως προεπιλογή, και
// αυτός ο αριθμός έφτανε ως το τέλος. Ο χρήστης έβλεπε «θα κερδίσεις 14 ευρώ
// τον μήνα» υπολογισμένο πάνω σε κατανάλωση που δεν ήταν η δική του. Το
// δωδεκάμηνο ιστορικό που είχε συμπληρώσει αποθηκευόταν και δεν διαβαζόταν ποτέ.
//
// Η ΑΡΧΗ: καλύτερα να ζητήσεις έναν αριθμό παρά να τον μαντέψεις. Μια σύγκριση
// πάνω σε μαντεψιά δεν είναι λιγότερο χρήσιμη, είναι επιβλαβής, γιατί οδηγεί σε
// αλλαγή παρόχου με λάθος κριτήριο.
// ─────────────────────────────────────────────────────────────────────────────

export type UsageSource = 'history' | 'bills' | 'manual' | 'unknown';

export interface UsageEstimate {
  kwhMonthly: number;
  source: UsageSource;
  /** Πόσους μήνες πραγματικών δεδομένων βρήκαμε. */
  months: number;
  /** Μπορούμε να δείξουμε σύγκριση με αυτά τα δεδομένα; */
  reliable: boolean;
}

/**
 * Η μέση μηνιαία κατανάλωση, από τα δεδομένα του ίδιου του χρήστη.
 *
 * Σειρά προτεραιότητας: το δωδεκάμηνο που συμπλήρωσε, μετά οι κιλοβατώρες από
 * τους καταχωρημένους λογαριασμούς, μετά ό,τι έγραψε στο πεδίο. Αν δεν υπάρχει
 * τίποτα, επιστρέφει `unknown` και η οθόνη οφείλει να ζητήσει τον αριθμό αντί να
 * δείξει σύγκριση.
 *
 * Ένας μήνας δεν φτάνει για να πεις «η κατανάλωσή σου»: ο Ιούλιος με κλιματιστικό
 * και ο Απρίλιος δεν μοιάζουν. Κάτω από τρεις μήνες το σημειώνουμε ως μη αξιόπιστο
 * και το λέμε στην οθόνη, χωρίς να κρύψουμε τη σύγκριση.
 */
export function estimateUsage(
  history: (number | string | null | undefined)[] | undefined,
  billsKwh: (number | null | undefined)[] | undefined,
  manual: number | null | undefined,
): UsageEstimate {
  const clean = (arr: readonly (number | string | null | undefined)[] | undefined): number[] =>
    (arr ?? [])
      .map(v => (typeof v === 'number' ? v : parseFloat(String(v ?? ''))))
      .filter(n => Number.isFinite(n) && n > 0);

  const h = clean(history);
  if (h.length > 0) {
    return {
      kwhMonthly: Math.round(h.reduce((s, n) => s + n, 0) / h.length),
      source: 'history', months: h.length, reliable: h.length >= 3,
    };
  }

  const b = clean(billsKwh);
  if (b.length > 0) {
    return {
      kwhMonthly: Math.round(b.reduce((s, n) => s + n, 0) / b.length),
      source: 'bills', months: b.length, reliable: b.length >= 3,
    };
  }

  const m = typeof manual === 'number' ? manual : parseFloat(String(manual ?? ''));
  if (Number.isFinite(m) && m > 0) {
    return { kwhMonthly: Math.round(m), source: 'manual', months: 0, reliable: true };
  }

  return { kwhMonthly: 0, source: 'unknown', months: 0, reliable: false };
}
