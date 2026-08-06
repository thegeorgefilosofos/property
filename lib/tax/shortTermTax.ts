// ═══════════════════════════════════════════════════════════════════════════
// Φορολογία βραχυχρόνιας μίσθωσης: σύνοψη ανά έτος από τα ΠΡΑΓΜΑΤΙΚΑ δεδομένα
// διαμονών (client_stays). Ενώνει την υπάρχουσα, δατοσημασμένη λογική:
//   • rentalIncomeTax  → κλίμακα φόρου εισοδήματος από ενοίκια, ΤΟΥ ΕΤΟΥΣ
//   • climateLevyForNights → Τέλος Ανθεκτικότητας στην Κλιματική Κρίση (ΤΑΚΚ)
// Καθαρή λογική (χωρίς React/δίκτυο), δοκιμάσιμη. Οι εκτιμήσεις είναι ενδεικτικές
// και προϋποθέτουν επιβεβαίωση από λογιστή.
//
// ΤΟ `grossRevenue` ΕΙΝΑΙ ΠΡΑΓΜΑΤΙΚΑ ΑΚΑΘΑΡΙΣΤΟ ΤΩΡΑ. Πριν, διάβαζε το
// `client_stays.total` — το πεδίο που ο εισαγωγέας email γέμιζε ρητά με **payout**
// — και το ονόμαζε grossRevenue, ενώ ο φάκελος του λογιστή έλεγε στον χρήστη
// «δήλωσε τα ΑΚΑΘΑΡΙΣΤΑ». Πλέον περνά από το lib/clients/stayAmounts.ts:
// ακαθάριστο = τι πλήρωσε ο επισκέπτης − τέλος ανθεκτικότητας (που δεν είναι
// έσοδό του), και η προμήθεια της πλατφόρμας μένει ΕΞΩ ως δαπάνη.
// Οι ιστορικές γραμμές απροσδιόριστης βάσης μετρώνται ΧΩΡΙΣΤΑ
// (`unresolvedCount`/`unresolvedAmount`) ώστε η οθόνη να μη δείχνει βεβαιότητα
// που δεν υπάρχει.
// ═══════════════════════════════════════════════════════════════════════════
import {
  declarableGross, declarableGrossOrTotal, platformFee, collectedLevy as levyOfStay,
  isDeclared, type StayAmountLike,
} from '@/lib/clients/stayAmounts';
import {
  climateLevyForNights, climateLevyRates, isHighSeasonMonth,
  rentalIncomeTax, rentalBracketsForYear, municipalAccommodationTax,
} from '@/lib/billing/greekTax';

export interface PropertyTaxMeta { sqm?: number | null; isHouse?: boolean; propertyCount?: number; individual?: boolean; rentsPaidViaBank?: boolean }

export interface TaxStay extends StayAmountLike {
  channel?: string | null;
  declared_at?: string | null;
}

const y4 = (d?: string | null) => (d || '').slice(0, 4);
const addDay = (isoDate: string) => { const dt = new Date(isoDate + 'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate() + 1); return dt.toISOString().slice(0, 10); };

/**
 * Πόσες από τις διανυκτερεύσεις μιας διαμονής πέφτουν μέσα στο έτος, και πόσες
 * είναι συνολικά. Χρειάζεται ώστε ό,τι μοιράζεται ΑΝΑ ΔΙΑΝΥΚΤΕΡΕΥΣΗ να
 * μοιράζεται με τον ίδιο κανόνα και στις δύο πλευρές του λογαριασμού.
 */
function nightsSplit(s: TaxStay, year: number): { inYear: number; total: number } {
  if (!s.check_in) return { inYear: 0, total: 0 };
  const start = s.check_in.slice(0, 10);
  const end = s.check_out ? s.check_out.slice(0, 10) : null;
  const ys = String(year);
  if (end && end > start) {
    let d = start, guard = 0, inYear = 0, total = 0;
    while (d < end && guard++ < 400) {
      total++;
      if (d.slice(0, 4) === ys) inYear++;
      d = addDay(d);
    }
    return { inYear, total };
  }
  const n = Math.max(0, s.nights || 0);
  return { inYear: start.slice(0, 4) === ys ? n : 0, total: n };
}

/**
 * ΤΟ ΕΙΣΠΡΑΓΜΕΝΟ ΤΕΛΟΣ ΠΟΥ ΑΝΑΛΟΓΕΙ ΣΤΟ ΕΤΟΣ.
 *
 * Η διαμονή 28/12 → 5/1 χρεωνόταν το τέλος ΔΥΟ φορές. Οι διανυκτερεύσεις
 * μοιράζονταν σωστά στα δύο έτη (τέσσερις τον Δεκέμβριο, τέσσερις τον Ιανουάριο),
 * άρα και το ΟΦΕΙΛΟΜΕΝΟ τέλος. Το ΕΙΣΠΡΑΓΜΕΝΟ όμως αποδιδόταν ολόκληρο στο έτος
 * του check-in:
 *
 *   2025 → οφείλει 8, εισέπραξε 16 → διαφορά 0
 *   2026 → οφείλει 8, εισέπραξε  0 → διαφορά 8   ← χρεώνεται ξανά
 *
 * Και τα 8 € έμπαιναν στους φόρους του 2026 ως ακάλυπτο τέλος, μειώνοντας το
 * καθαρό ταμείο — για ποσό που ο επισκέπτης είχε ήδη πληρώσει.
 *
 * Ο κανόνας: το τέλος είναι ανά διανυκτέρευση, οπότε μοιράζεται όπως οι
 * διανυκτερεύσεις. Διαμονή που δεν αγγίζει το έτος συνεισφέρει μηδέν.
 */
export function collectedLevyForYear(stays: TaxStay[], year: number): number {
  let sum = 0;
  for (const s of stays) {
    const { inYear, total } = nightsSplit(s, year);
    if (!inYear || !total) continue;
    sum += levyOfStay(s) * (inYear / total);
  }
  return sum;
}

/** Διανυκτερεύσεις ανά μήνα (12 τιμές, 0=Ιαν) που πέφτουν εντός του έτους. */
export function nightsByMonthForYear(stays: TaxStay[], year: number): number[] {
  const out = new Array(12).fill(0);
  const ys = String(year);
  for (const s of stays) {
    if (!s.check_in) continue;
    const start = s.check_in.slice(0, 10);
    const end = s.check_out ? s.check_out.slice(0, 10) : null;
    if (end && end > start) {
      let d = start, guard = 0;
      while (d < end && guard++ < 400) {
        if (d.slice(0, 4) === ys) out[Number(d.slice(5, 7)) - 1]++;
        d = addDay(d);
      }
    } else if (start.slice(0, 4) === ys) {
      out[Number(start.slice(5, 7)) - 1] += Math.max(0, s.nights || 0);
    }
  }
  return out;
}

export interface TaxChannelRow { channel: string; revenue: number; nights: number; stays: number }
/** Ανάλυση ακαθαρίστων/νυχτών ανά κανάλι για το έτος (με βάση την ημερομηνία άφιξης). */
export function channelBreakdownForYear(stays: TaxStay[], year: number): TaxChannelRow[] {
  const m = new Map<string, TaxChannelRow>();
  for (const s of stays) {
    if (y4(s.check_in) !== String(year)) continue;
    const ch = (s.channel || 'other') as string;
    const row = m.get(ch) || { channel: ch, revenue: 0, nights: 0, stays: 0 };
    row.revenue += declarableGrossOrTotal(s);
    row.nights += s.nights ?? 0;
    row.stays += 1;
    m.set(ch, row);
  }
  return [...m.values()].sort((a, b) => b.revenue - a.revenue);
}

export interface ShortTermYearSummary {
  year: number;
  /** ΔΗΛΩΤΕΟ ΑΚΑΘΑΡΙΣΤΟ: τι πλήρωσε ο επισκέπτης − τέλος ανθεκτικότητας.
   *  Η προμήθεια της πλατφόρμας ΔΕΝ αφαιρείται (είναι δαπάνη, όχι μείωση εσόδου). */
  grossRevenue: number;
  totalNights: number;
  stayCount: number;
  nightsByMonth: number[];
  levy: number;            // ΤΑΚΚ που ΟΦΕΙΛΕΤΑΙ, από τις διανυκτερεύσεις και τους συντελεστές
  collectedLevy: number;   // ΤΑΚΚ που καταγράφηκε ως εισπραχθέν από τους επισκέπτες
  platformFees: number;    // ΔΑΠΑΝΗ (εκπίπτει) — δεν μειώνει το ακαθάριστο
  municipalTax: number;    // τέλος παρεπιδημούντων (0,5% ή 0 με εξαίρεση)
  municipalExempt: boolean;
  incomeTax: number;       // εκτιμώμενος φόρος εισοδήματος (κλίμακα ενοικίων)
  /** ΤΑΚΚ που ΔΕΝ φαίνεται να εισπράχθηκε από επισκέπτη και το πληρώνει ο ίδιος
   *  ο ιδιοκτήτης: `max(0, levy − collectedLevy)`. Δες τη σημείωση στα καθαρά. */
  levyShortfall: number;
  net: number;             // ακαθάριστα − φόρος − τέλος παρεπιδημούντων − ακάλυπτο ΤΑΚΚ
  effectiveRate: number;   // φόρος / ακαθάριστα
  /** Πόσες διαμονές έχουν ΑΠΡΟΣΔΙΟΡΙΣΤΗ βάση ποσού (ιστορικές, πριν τη διάσπαση
   *  σε ακαθάριστο/προμήθεια/τέλος). Όσο αυτό δεν είναι 0, το ακαθάριστο είναι
   *  εκτίμηση και το UI οφείλει να το λέει. */
  unresolvedCount: number;
  unresolvedAmount: number;
  /** Διαμονές χωρίς Δήλωση Βραχυχρόνιας Διαμονής (declared_at). */
  undeclaredCount: number;
  byChannel: TaxChannelRow[];
}

/** Πλήρης φορολογική σύνοψη βραχυχρόνιας για ένα έτος, από τις διαμονές.
 *  Το meta (εμβαδόν, τύπος, πλήθος ακινήτων) καθορίζει τη σωστή κλίμακα του
 *  Τέλους Ανθεκτικότητας (>80 τ.μ.) και την εξαίρεση του τέλους παρεπιδημούντων.
 *  Χωρίς meta, το τέλος παρεπιδημούντων θεωρείται 0 (τυπική εξαίρεση μικρού ιδιοκτήτη). */
export function shortTermYearSummary(stays: TaxStay[], year: number, meta?: PropertyTaxMeta): ShortTermYearSummary {
  const inYear = stays.filter(s => y4(s.check_in) === String(year));
  const nightsByMonth = nightsByMonthForYear(stays, year);
  const totalNights = nightsByMonth.reduce((a, b) => a + b, 0);
  const grossRevenue = inYear.reduce((sum, s) => sum + declarableGrossOrTotal(s), 0);
  const unresolved = inYear.filter(s => declarableGross(s) == null && declarableGrossOrTotal(s) > 0);
  const platformFees = inYear.reduce((sum, s) => sum + platformFee(s), 0);
  // ΟΧΙ `inYear.reduce(...)`. Το οφειλόμενο τέλος βγαίνει από τις διανυκτερεύσεις
  // που πέφτουν ΜΕΣΑ στο έτος (nightsByMonth), οπότε και το εισπραγμένο πρέπει να
  // μετρηθεί με τον ίδιο κανόνα. Με φιλτράρισμα κατά check-in, μια διαμονή που
  // περνά την Πρωτοχρονιά έδινε όλο το τέλος στο πρώτο έτος και τίποτα στο
  // δεύτερο — που το ξαναχρέωνε.
  const collectedLevy = collectedLevyForYear(stays, year);
  const levy = climateLevyForNights(nightsByMonth, meta?.sqm, meta?.isHouse);
  const municipalTax = meta ? municipalAccommodationTax(grossRevenue, meta) : 0;
  // Βραχυχρόνια φυσικού προσώπου χωρίς υπηρεσίες = εισόδημα από ακίνητη περιουσία:
  // εφαρμόζεται η τεκμαρτή έκπτωση 5% (άρθρο 39 παρ.4 ΚΦΕ) → φορολογείται το 95%.
  // Προϋπόθεση (από 1/1/2026): είσπραξη μέσω τραπέζης· με μετρητά φορολογείται το 100%.
  const taxableFactor = meta?.rentsPaidViaBank === false ? 1 : 0.95;
  // Η ΚΛΙΜΑΚΑ ΤΟΥ ΕΤΟΥΣ, ΟΧΙ ΠΑΝΤΑ ΤΟΥ 2026. Η συνάρτηση δέχεται `year` από
  // την πρώτη μέρα και το χρησιμοποιούσε παντού ΕΚΤΟΣ από τον φόρο — που είναι
  // το νούμερο για το οποίο υπάρχει.
  const incomeTax = rentalIncomeTax(grossRevenue * taxableFactor, rentalBracketsForYear(year));
  // ΤΟ ΤΕΛΟΣ ΑΝΘΕΚΤΙΚΟΤΗΤΑΣ ΦΕΥΓΕΙ ΑΚΡΙΒΩΣ ΜΙΑ ΦΟΡΑ — ΟΥΤΕ ΔΥΟ, ΟΥΤΕ ΚΑΜΙΑ.
  //
  // Ο αρχικός τύπος έγραφε `− levy` και το αφαιρούσε ΔΥΟ φορές: μία μέσα στο
  // ακαθάριστο (declarableGross = τι πλήρωσε ο επισκέπτης − τέλος) και μία ξανά
  // εδώ. Η πρώτη διόρθωση έσβησε απλώς το `− levy` — και άνοιξε την αντίθετη
  // τρύπα, γιατί το τέλος ΔΕΝ είναι πάντα ήδη έξω:
  //
  //   • Γραμμή με ρητή ανάλυση (gross_guest_paid + climate_levy): το τέλος έχει
  //     ήδη βγει από το ακαθάριστο, και ο επισκέπτης το πλήρωσε. Καμία αφαίρεση.
  //   • Ιστορική γραμμή απροσδιόριστης βάσης: το ακαθάριστο είναι το ωμό `total`
  //     με το τέλος ΜΕΣΑ, και δεν υπάρχει καταγεγραμμένη είσπραξη. Το τέλος
  //     οφείλεται στην ΑΑΔΕ και δεν έχει καλυφθεί: πρέπει να αφαιρεθεί.
  //   • Ο ιδιοκτήτης που δεν χρέωσε καθόλου το τέλος στους επισκέπτες: το οφείλει
  //     ούτως ή άλλως και το πληρώνει από την τσέπη του.
  //
  // Η διαφορά «οφειλόμενο − εισπραγμένο» καλύπτει και τις τρεις περιπτώσεις με
  // έναν κανόνα, και διορθώνεται μόνη της καθώς ο χρήστης συμπληρώνει τα ποσά.
  // Ποτέ αρνητική: αν εισέπραξε παραπάνω, δεν είναι κέρδος του — το αποδίδει.
  const levyShortfall = Math.max(0, levy - collectedLevy);
  const net = grossRevenue - incomeTax - municipalTax - levyShortfall;
  return {
    year, grossRevenue, totalNights, stayCount: inYear.length, nightsByMonth,
    levy, collectedLevy, platformFees,
    municipalTax, municipalExempt: municipalTax === 0,
    incomeTax, levyShortfall, net, effectiveRate: grossRevenue > 0 ? incomeTax / grossRevenue : 0,
    unresolvedCount: unresolved.length,
    unresolvedAmount: unresolved.reduce((sum, s) => sum + declarableGrossOrTotal(s), 0),
    undeclaredCount: inYear.filter(s => !isDeclared(s)).length,
    byChannel: channelBreakdownForYear(stays, year),
  };
}

// ── Η γραμμή που κανείς δεν επινοεί, κάτω από κάθε προτεινόμενη τιμή ─────────
//
// Ο οικοδεσπότης βλέπει «85 €/νύχτα» και νομίζει ότι εισπράττει 85 και δηλώνει
// 85. Κανένα από τα δύο δεν είναι αλήθεια, και η διαφορά είναι ακριβώς εκεί όπου
// γίνονται τα λάθη που πληρώνει: το τέλος ανθεκτικότητας δεν είναι έσοδό του
// (το κρατά για το κράτος), και η προμήθεια είναι δαπάνη που ΔΕΝ μειώνει το
// δηλωτέο έσοδο. Τίποτα εδώ δεν είναι επινοημένο: το τέλος βγαίνει από τους
// συντελεστές της ΑΑΔΕ (lib/billing/greekTax.ts, με πηγή), και η προμήθεια
// ΜΟΝΟ από το πραγματικό ιστορικό του χρήστη — αν δεν υπάρχει, μένει `null`
// και η οθόνη λέει ότι δεν την ξέρουμε.
export interface GuestPriceBreakdown {
  /** Τι πληρώνει ο επισκέπτης για τη νύχτα (η προτεινόμενη τιμή). */
  guestPrice: number;
  /** Τέλος ανθεκτικότητας της νύχτας. ΔΕΝ είναι έσοδο του ιδιοκτήτη. */
  climateLevy: number;
  highSeason: boolean;
  /** Ποσοστό προμήθειας από το ιστορικό του χρήστη· `null` = δεν το ξέρουμε. */
  platformFeeRate: number | null;
  /** Ποσό προμήθειας· `null` όταν δεν ξέρουμε το ποσοστό. ΔΑΠΑΝΗ. */
  platformFee: number | null;
  /** ΔΗΛΩΤΕΟ ΑΚΑΘΑΡΙΣΤΟ της νύχτας = τιμή − τέλος. */
  declarableGross: number;
  /** Τι μένει στον λογαριασμό· `null` όταν η προμήθεια είναι άγνωστη. */
  payout: number | null;
}

/**
 * Ανάλυση μιας τιμής/νύχτα σε: τιμή επισκέπτη, τέλος, προμήθεια, δηλωτέο ακαθάριστο.
 * @param date YYYY-MM-DD — καθορίζει υψηλή/χαμηλή περίοδο του τέλους.
 * @param platformFeeRate ποσοστό από το ιστορικό του χρήστη (0..1) ή null.
 */
export function guestPriceBreakdown(
  date: string,
  guestPrice: number,
  opts?: { sqm?: number | null; isHouse?: boolean; platformFeeRate?: number | null },
): GuestPriceBreakdown {
  const m = Math.max(0, Math.min(11, Number(date.slice(5, 7)) - 1));
  const high = isHighSeasonMonth(m);
  const rates = climateLevyRates(opts?.sqm, opts?.isHouse);
  const levy = high ? rates.high : rates.low;
  const price = Math.max(0, guestPrice);
  const gross = Math.max(0, price - levy);
  const rate = opts?.platformFeeRate != null && opts.platformFeeRate > 0 ? opts.platformFeeRate : null;
  const fee = rate != null ? Math.round(price * rate * 100) / 100 : null;
  return {
    guestPrice: price,
    climateLevy: levy,
    highSeason: high,
    platformFeeRate: rate,
    platformFee: fee,
    declarableGross: gross,
    payout: fee != null ? Math.max(0, gross - fee) : null,
  };
}

/** Έτη με καταγεγραμμένες διαμονές (για επιλογή έτους), φθίνουσα σειρά. */
export function yearsWithStays(stays: TaxStay[]): number[] {
  const s = new Set<number>();
  for (const st of stays) { const y = Number(y4(st.check_in)); if (y) s.add(y); }
  return [...s].sort((a, b) => b - a);
}
