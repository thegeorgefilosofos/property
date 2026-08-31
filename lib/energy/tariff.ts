import { cents } from '@/lib/core/money'
// ═══════════════════════════════════════════════════════════════════════════
// ΕΝΑΣ ΤΥΠΟΣ ΓΙΑ ΤΟ ΚΟΣΤΟΣ ΤΟΥ ΡΕΥΜΑΤΟΣ.
//
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΛΥΝΕΙ ΑΥΤΟ ΤΟ ΑΡΧΕΙΟ:
// Στην ίδια οθόνη υπήρχαν ΔΥΟ υπολογισμοί για το ίδιο νούμερο. Ο ένας έβγαζε
// «το τιμολόγιό σου», ο άλλος «τα άλλα τιμολόγια» και διέφεραν σε τρία σημεία:
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
// κι αν διαλέξεις, οπότε δεν αλλάζουν ΠΟΤΕ την κατάταξη. Μένουν έξω και το
// λέμε ρητά στην οθόνη. Το να τις βάζαμε μέσα θα φούσκωνε κάθε τιμολόγιο με το
// ίδιο ποσό και θα έκρυβε τη διαφορά που πραγματικά μετράει.
//
// Ο ΦΠΑ μένει ΜΕΣΑ, γιατί ο χρήστης πληρώνει το τελικό. ΕΙΝΑΙ 6% ΚΑΙ ΣΤΑ ΔΥΟ:
// ο υπερμειωμένος συντελεστής της ενέργειας κρίνεται από το ΑΓΑΘΟ, όχι από τον
// πελάτη, βάσει του Κώδικα ΦΠΑ. Εδώ έγραφε «24% επαγγελματικό» και τα
// είκοσι έξι επαγγελματικά τιμολόγια του καταλόγου το φορούσαν, φουσκώνοντας
// κάθε επαγγελματική σύγκριση κατά περίπου 17%. Την αντίφαση την είχε ήδη μέσα
// του ο κατάλογος: τα επαγγελματικά της ΔΕΗ έγραφαν 6, όλων των άλλων 24.
// ═══════════════════════════════════════════════════════════════════════════

// ═══ ΜΙΑ ΧΡΕΩΣΗ ΠΟΥ ΔΕΝ ΥΠΑΡΧΕΙ, ΚΑΙ ΤΗΝ ΕΛΕΓΕ ΚΑΙ Η ΙΔΙΑ Η ΟΘΟΝΗ ══════════
//
// Εδώ καθόταν `ERT = 0.00856  // Ειδικό Ρυθμιστικό Τέλος`, προστιθέμενο σε κάθε
// τιμολόγιο και φορολογημένο με ΦΠΑ από πάνω. Τέτοια ρυθμιζόμενη χρέωση ανά
// κιλοβατώρα ΔΕΝ ΥΠΑΡΧΕΙ. Οι πραγματικές ανά-kWh χρεώσεις του λογαριασμού είναι
// χρεώσεις δικτύου, ΥΚΩ, ΕΤΜΕΑΡ, ΕΦΚ και το ειδικό τέλος 5‰. Το τέλος υπέρ ΕΡΤ
// είναι ΠΑΓΙΟ, 3,00 € τον μήνα ανά παροχή (ν.4324/2015): δεν εξαρτάται από την
// κατανάλωση και δεν πολλαπλασιάζεται με κιλοβατώρες.
//
// ΚΑΙ ΤΟ ΕΛΕΓΑΝ ΗΔΗ ΤΡΙΑ ΣΗΜΕΙΑ ΤΟΥ ΙΔΙΟΥ ΚΩΔΙΚΑ. Το σχόλιο είκοσι γραμμές πιο
// πάνω απαριθμεί το «τέλος ΕΡΤ» στα ΕΞΑΙΡΟΥΜΕΝΑ· το ίδιο λέει το
// lib/energy/freshness.ts και το ίδιο διαβάζει ο χρήστης στην οθόνη
// («Δεν περιλαμβάνονται … και τέλος ΕΡΤ»). Ο υπολογισμός ήταν ο μόνος που
// έλεγε το αντίθετο — και ήταν αυτός που έβγαζε τα νούμερα.
//
// ΤΟ ΝΟΥΜΕΡΟ ΠΡΟΔΙΔΕΙ ΤΗΝ ΠΡΟΕΛΕΥΣΗ ΤΟΥ: 0,00856 × 350 kWh ≈ 3,00 €. Το πάγιο
// τέλος ΕΡΤ «σπασμένο» σε κιλοβατώρες με υποτιθέμενη κατανάλωση 350 τον μήνα.
// Οποιος κατανάλωνε 800 kWh χρεωνόταν 6,85 € για τέλος που είναι 3,00 €, συν
// ΦΠΑ που δεν οφείλεται καν σε αυτό.

/** Η ΜΟΝΗ ρυθμιζόμενη ανά κιλοβατώρα που μπαίνει στη σύγκριση. Ιδια για κάθε
 *  προμηθευτή, όπως και οι υπόλοιπες· μπαίνει επειδή τα πακέτα «όλα μέσα» την
 *  απορροφούν στην τιμή τους και χωρίς αυτήν η σύγκριση των δύο μορφών θα
 *  έγερνε. Δες την επιφύλαξη στο data/price-sources.json. */
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
  /** 6 για ρεύμα και αέριο, οικιακά και επαγγελματικά. Κρίνει το αγαθό. */
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
 * καταλόγου και υπάρχει test που το επιβεβαιώνει. Αν κάποτε προστεθεί τέτοιο
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
    return { supply: cents(supply), regulated: 0, vat: cents(vat), total: cents(supply + vat), overage: cents(over), manual: false };
  }

  const fixed = (u.ebill && t.fixed_ebill != null) ? t.fixed_ebill : t.fixed;
  const supply = fixed + energyCharge(t, u);
  const regulated = Math.max(0, u.kwhMonthly) * ETMEAR;
  const vat = (supply + regulated) * vatRate;

  return {
    supply: cents(supply),
    regulated: cents(regulated),
    vat: cents(vat),
    total: cents(supply + regulated + vat),
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
      return { tariff: t, cost, isCurrent, diff: isCurrent ? 0 : cents(cost.total - currentCost) };
    })
    .sort((a, b) => a.cost.total - b.cost.total);
}

// ─────────────────────────────────────────────────────────────────────────────
// ΠΟΣΟ ΡΕΥΜΑ ΚΑΙΕΙ ΠΡΑΓΜΑΤΙΚΑ Ο ΧΡΗΣΤΗΣ
//
// ΤΟ ΣΦΑΛΜΑ: η οθόνη ξεκινούσε με 250 κιλοβατώρες τον μήνα ως προεπιλογή και
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

// ── ΝΕΡΟ: Ο ΜΗΝΙΑΙΟΣ ΑΠΟ ΤΟΝ ΛΟΓΑΡΙΑΣΜΟ ───────────────────────────────────
//
// Η ίδια διαίρεση ήταν γραμμένη τρεις φορές: στη σύνοψη της κάρτας παροχών, στον
// προϋπολογισμό και μέσα στο πεδίο του λογαριασμού. Και υπήρχε ΚΑΙ τέταρτο
// σημείο — ένα πεδίο «Μηνιαία αναγωγή» που ο χρήστης μπορούσε να γράψει με το
// χέρι, ενώ και οι δύο αναγνώστες το αγνοούσαν μόλις υπήρχε λογαριασμός.
//
// Ο λογαριασμός του νερού δεν είναι μηνιαίος στην Ελλάδα: η ΕΥΔΑΠ χρεώνει ανά
// δίμηνο, άλλες ΔΕΥΑ ανά τρίμηνο ή τετράμηνο. Η συχνότητα είναι μέρος του
// νούμερου, όχι λεπτομέρεια.

/** Τα πεδία της κάρτας παροχών που ορίζουν τον μηνιαίο του νερού. */
export interface WaterBilling {
  waterBiMonthly?: unknown;
  waterMonthly?: unknown;
  waterPeriodMonths?: unknown;
}

const num = (v: unknown) => parseFloat(String(v ?? '')) || 0;

/** Ο μηνιαίος του νερού: λογαριασμός διά τους μήνες της περιόδου χρέωσης. */
export function waterMonthly(v: WaterBilling): number {
  if (!v.waterBiMonthly) return num(v.waterMonthly);
  const months = parseInt(String(v.waterPeriodMonths ?? '2')) || 2;
  return num(v.waterBiMonthly) / months;
}

/** Η ίδια τιμή σε μορφή αποθήκευσης, ή κενό όταν δεν έχει δοθεί λογαριασμός. */
export function waterMonthlyText(bill: unknown, periodMonths: unknown): string {
  return bill ? waterMonthly({ waterBiMonthly: bill, waterPeriodMonths: periodMonths }).toFixed(2) : '';
}
