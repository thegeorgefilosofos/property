// ═══════════════════════════════════════════════════════════════════════════
// ΒΡΑΧΥΧΡΟΝΙΑ Ή ΜΑΚΡΟΧΡΟΝΙΑ — Η ΣΥΓΚΡΙΣΗ ΠΟΥ ΚΑΝΕΙ ΤΟ ΛΑΘΟΣ ΟΛΟΣ Ο ΚΟΣΜΟΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΛΑΘΟΣ, ΓΡΑΜΜΕΝΟ ΚΑΘΑΡΑ. Ο ιδιοκτήτης βλέπει «80 € τη νύχτα» και το
// πολλαπλασιάζει με 365. Βγάζει 29.200 € και το συγκρίνει με 700 × 12 = 8.400 €
// της μακροχρόνιας. Το συμπέρασμα είναι προφανές και είναι λάθος, γιατί από τα
// 29.200 λείπουν πέντε πράγματα:
//
//   1. Η ΠΛΗΡΟΤΗΤΑ. Κανένα ακίνητο δεν είναι γεμάτο 365 νύχτες.
//   2. ΤΟ ΤΕΛΟΣ ΑΝΘΕΚΤΙΚΟΤΗΤΑΣ. Δεν είναι έσοδο του ιδιοκτήτη: το εισπράττει
//      από τον επισκέπτη και το αποδίδει. Μπαίνει και στις δύο πλευρές και
//      φεύγει, αλλά ΜΕΙΩΝΕΙ το δηλωτέο ακαθάριστο.
//   3. Η ΠΡΟΜΗΘΕΙΑ ΤΗΣ ΠΛΑΤΦΟΡΜΑΣ. Είναι δαπάνη, και για το φυσικό πρόσωπο
//      ΔΕΝ εκπίπτει: φορολογείσαι σε ποσό που δεν εισέπραξες ποτέ.
//   4. ΤΑ ΛΕΙΤΟΥΡΓΙΚΑ. Καθαριότητα και αναλώσιμα ανά διανυκτέρευση, και ρεύμα,
//      νερό, ίντερνετ κάθε μήνα — που στη μακροχρόνια τα πληρώνει ο ενοικιαστής.
//   5. Ο ΦΟΡΟΣ, που ανεβαίνει κλιμάκιο. Τα 29.200 δεν φορολογούνται με τον
//      συντελεστή των 8.400.
//
// ΓΙΑΤΙ Η ΑΠΑΝΤΗΣΗ ΕΙΝΑΙ Η ΠΛΗΡΟΤΗΤΑ ΙΣΟΡΡΟΠΙΑΣ ΚΑΙ ΟΧΙ ΤΑ ΔΥΟ ΝΟΥΜΕΡΑ. Δύο
// καθαρά ποσά απαντούν στην ερώτηση ΓΙΑ ΤΗΝ ΠΛΗΡΟΤΗΤΑ ΠΟΥ ΜΑΝΤΕΨΕ Ο ΧΡΗΣΤΗΣ —
// και ακριβώς αυτήν δεν την ξέρει. Το νούμερο που αποφασίζει είναι το κατώφλι:
// «από ποια πληρότητα και πάνω αξίζει». Αυτό συγκρίνεται με ό,τι ξέρει για τη
// γειτονιά του, και δεν αλλάζει επειδή ήταν αισιόδοξος στην πρόβλεψη.
//
// ΤΙΠΟΤΑ ΔΕΝ ΕΠΙΝΟΕΙΤΑΙ. Οι συντελεστές του τέλους, η κλίμακα του φόρου, η
// τεκμαρτή έκπτωση και το τέλος παρεπιδημούντων έρχονται από το
// lib/billing/greekTax.ts, με πηγή ανά συντελεστή. Ό,τι δεν ξέρουμε (τιμή,
// πληρότητα, προμήθεια, λειτουργικά) το δίνει ο χρήστης.
// ═══════════════════════════════════════════════════════════════════════════
import {
  rentalIncomeTax, climateLevyForNights, municipalAccommodationTax,
} from '@/lib/billing/greekTax';
import { PRESUMPTIVE_DEDUCTION_RATE } from '@/lib/accounting/statement';

/** Οι νύχτες του χρόνου. Δίσεκτα έτη δεν αλλάζουν συμπέρασμα σε εκτίμηση. */
export const NIGHTS_PER_YEAR = 365;

export interface ShortVsLongInput {
  /** Μακροχρόνια: μηνιαίο μίσθωμα. */
  monthlyRent: number;
  /** Βραχυχρόνια: τι πληρώνει ο επισκέπτης ανά διανυκτέρευση, τέλος μέσα. */
  nightlyPrice: number;
  /** 0 ώς 100. */
  occupancyPct: number;
  sqm: number;
  isHouse: boolean;
  /** Όσο κρατά η πλατφόρμα, 0 ώς 100. */
  platformFeePct: number;
  /** Καθαριότητα και αναλώσιμα ανά διανυκτέρευση. */
  costPerNight: number;
  /** Ρεύμα, νερό, ίντερνετ ανά μήνα. Στη μακροχρόνια τα πληρώνει ο ενοικιαστής. */
  fixedPerMonth: number;
  /** Πότε γεμίζει το ακίνητο. Αλλάζει το τέλος ανθεκτικότητας, όχι τα έσοδα. */
  season: SeasonSpread;
}

export interface LongSide {
  gross: number;
  deduction: number;
  taxable: number;
  tax: number;
  net: number;
}

export interface ShortSide {
  nights: number;
  /** Τι πληρώνουν συνολικά οι επισκέπτες. */
  guestTotal: number;
  /** Τέλος Ανθεκτικότητας: εισπράττεται από τον επισκέπτη και αποδίδεται. */
  levy: number;
  /** Δηλωτέο ακαθάριστο = όσα πλήρωσαν οι επισκέπτες − τέλος. */
  gross: number;
  deduction: number;
  taxable: number;
  tax: number;
  /** Τέλος παρεπιδημούντων (0 για φυσικό πρόσωπο με έως δύο ακίνητα). */
  municipalTax: number;
  platformFee: number;
  /** Καθαριότητα/αναλώσιμα × νύχτες + πάγια × 12. */
  running: number;
  net: number;
}

export interface ShortVsLong {
  long: LongSide;
  short: ShortSide;
  /** Θετικό όταν κερδίζει η βραχυχρόνια. */
  difference: number;
  /**
   * Η πληρότητα (0 ώς 100) στην οποία οι δύο επιλογές δίνουν τα ίδια καθαρά.
   * `null` όταν η βραχυχρόνια δεν φτάνει τη μακροχρόνια ΟΥΤΕ με 100% πληρότητα.
   */
  breakEvenPct: number | null;
}

const cents = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
const pos = (n: number) => Math.max(0, Number.isFinite(n) ? n : 0);

/**
 * ΠΩΣ ΜΟΙΡΑΖΟΝΤΑΙ ΟΙ ΝΥΧΤΕΣ ΣΤΟΥΣ ΜΗΝΕΣ, ΚΑΙ ΓΙΑΤΙ ΤΟ ΡΩΤΑΜΕ.
 *
 * Το τέλος ανθεκτικότητας είναι ΤΕΤΡΑΠΛΑΣΙΟ στην υψηλή περίοδο (Απρίλιος ώς
 * Οκτώβριος): 8,00 € έναντι 2,00 € για διαμέρισμα. Η κατανομή δηλαδή δεν είναι
 * λεπτομέρεια — αλλάζει το τελικό ποσό κατά εκατοντάδες ευρώ.
 *
 * Η πρώτη εκδοχή μοίραζε ΠΑΝΤΑ ισομερώς και το έγραφε ως παραδοχή. Ήταν τίμιο,
 * αλλά ήταν και το μεγαλύτερο σφάλμα του εργαλείου: το ελληνικό εξοχικό δεν
 * νοικιάζεται τον Ιανουάριο, και σε αυτό ακριβώς το προφίλ το τέλος βγαίνει
 * σχεδόν διπλάσιο από αυτό που δείχναμε.
 *
 * Δύο επιλογές, καμία επινοημένη καμπύλη:
 *   • «όλο τον χρόνο» — ισομερώς στους δώδεκα, η ουδέτερη παραδοχή.
 *   • «κυρίως το καλοκαίρι» — γεμίζει πρώτα τους επτά μήνες της υψηλής περιόδου
 *     μέχρι τις ημέρες τους (214), και ό,τι περισσεύει πέφτει στους πέντε της
 *     χαμηλής. Δεν μαντεύει ποσοστά ανά μήνα: γεμίζει με τη σειρά.
 */
export type SeasonSpread = 'even' | 'high';

/** Ημέρες ανά μήνα, μη δίσεκτο έτος. Χρειάζονται ως ΧΩΡΗΤΙΚΟΤΗΤΑ, όχι ως βάρη. */
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const HIGH = [3, 4, 5, 6, 7, 8, 9];           // Απρίλιος ώς Οκτώβριος
const LOW = [0, 1, 2, 10, 11];                // Νοέμβριος ώς Μάρτιος
/** 214 νύχτες: όσες χωράνε στους επτά μήνες της υψηλής περιόδου. */
export const HIGH_SEASON_NIGHTS = HIGH.reduce((s, m) => s + DAYS_IN_MONTH[m], 0);

export function spreadNights(nights: number, season: SeasonSpread = 'even'): number[] {
  const n = pos(nights);
  if (season === 'even') return new Array(12).fill(n / 12);
  const out = new Array(12).fill(0);
  const inHigh = Math.min(n, HIGH_SEASON_NIGHTS);
  for (const m of HIGH) out[m] = inHigh / HIGH.length;
  const rest = n - inHigh;
  if (rest > 0) for (const m of LOW) out[m] = rest / LOW.length;
  return out;
}

/** Η μακροχρόνια πλευρά: ακαθάριστο, τεκμαρτή έκπτωση, φόρος, καθαρά. */
export function longTermSide(monthlyRent: number): LongSide {
  const gross = cents(pos(monthlyRent) * 12);
  const taxable = gross * (1 - PRESUMPTIVE_DEDUCTION_RATE);
  const tax = cents(rentalIncomeTax(taxable));
  return { gross, deduction: cents(gross - taxable), taxable: cents(taxable), tax, net: cents(gross - tax) };
}

/** Η βραχυχρόνια πλευρά, για δεδομένη πληρότητα. */
export function shortTermSide(i: ShortVsLongInput, occupancyPct = i.occupancyPct): ShortSide {
  const nights = (Math.min(100, pos(occupancyPct)) / 100) * NIGHTS_PER_YEAR;
  const price = pos(i.nightlyPrice);
  const guestTotal = nights * price;
  // Το τέλος ΟΦΕΙΛΕΤΑΙ ολόκληρο· δεν μπορεί όμως να ξεπεράσει όσα εισπράχθηκαν
  // στην αριθμητική της οθόνης, αλλιώς με τιμή 1 €/νύχτα θα έβγαινε αρνητικό
  // ακαθάριστο και ο πίνακας θα τύπωνε νούμερα που δεν υπάρχουν.
  const levy = Math.min(guestTotal, climateLevyForNights(spreadNights(nights, i.season), i.sqm, i.isHouse));
  const gross = cents(guestTotal - levy);
  const taxable = gross * (1 - PRESUMPTIVE_DEDUCTION_RATE);
  const tax = cents(rentalIncomeTax(taxable));
  // Η προμήθεια υπολογίζεται σε ΟΣΑ ΠΛΗΡΩΣΕ Ο ΕΠΙΣΚΕΠΤΗΣ, γιατί έτσι τη χρεώνουν
  // οι πλατφόρμες: πάνω στο σύνολο της κράτησης, όχι στο δηλωτέο ακαθάριστο.
  const platformFee = cents(guestTotal * (pos(i.platformFeePct) / 100));
  const running = cents(nights * pos(i.costPerNight) + 12 * pos(i.fixedPerMonth));
  // Φυσικό πρόσωπο με έως δύο ακίνητα: εξαιρείται, δηλαδή 0 €. Η παραδοχή
  // γράφεται στην οθόνη· η συνάρτηση καλείται ούτως ή άλλως, ώστε αν αλλάξει ο
  // κανόνας να αλλάξει σε ένα σημείο.
  const municipalTax = municipalAccommodationTax(gross, { individual: true, propertyCount: 1 });
  return {
    nights: Math.round(nights), guestTotal: cents(guestTotal), levy: cents(levy), gross,
    deduction: cents(gross - taxable), taxable: cents(taxable), tax,
    municipalTax, platformFee, running,
    net: cents(gross - tax - municipalTax - platformFee - running),
  };
}

/**
 * Η ΠΛΗΡΟΤΗΤΑ ΣΤΗΝ ΟΠΟΙΑ ΟΙ ΔΥΟ ΕΠΙΛΟΓΕΣ ΕΞΙΣΩΝΟΝΤΑΙ.
 *
 * Λύνεται με διχοτόμηση και όχι με τύπο, επειδή ο φόρος είναι κλιμακωτός: τα
 * καθαρά της βραχυχρόνιας είναι τμηματικά γραμμικά στην πληρότητα, με σπασίματα
 * σε κάθε όριο κλιμακίου. Η συνάρτηση είναι όμως ΑΥΞΟΥΣΑ (κάθε επιπλέον νύχτα
 * αφήνει το πολύ όσα και η προηγούμενη, ποτέ λιγότερα από μηδέν οριακά), οπότε
 * η διχοτόμηση συγκλίνει πάντα.
 *
 * Σαράντα επαναλήψεις φέρνουν το διάστημα από 100 μονάδες σε 1e-10, δηλαδή
 * πολύ κάτω από το δέκατο της μονάδας που τυπώνει η οθόνη.
 */
export function breakEvenOccupancy(i: ShortVsLongInput, targetNet: number): number | null {
  if (shortTermSide(i, 100).net < targetNet) return null;
  if (shortTermSide(i, 0).net >= targetNet) return 0;
  let lo = 0, hi = 100;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (shortTermSide(i, mid).net >= targetNet) hi = mid; else lo = mid;
  }
  return hi;
}

/**
 * ΤΑ ΚΑΘΑΡΑ ΣΕ ΟΛΟ ΤΟ ΕΥΡΟΣ ΤΗΣ ΠΛΗΡΟΤΗΤΑΣ.
 *
 * Η πληρότητα είναι η πιο αβέβαιη είσοδος της σελίδας και η μόνη που ο χρήστης
 * μαντεύει. Ένα νούμερο για μία μαντεψιά κρύβει το σχήμα της καμπύλης: πόσο
 * ευαίσθητο είναι το αποτέλεσμα, και πόσο κοστίζει να πέσει έξω κατά δέκα
 * μονάδες. Ο πίνακας το δείχνει ολόκληρο, χωρίς να ζητά τίποτα παραπάνω.
 */
export function netByOccupancy(i: ShortVsLongInput, steps: number[]): { pct: number; nights: number; net: number }[] {
  return steps.map(pct => {
    const s = shortTermSide(i, pct);
    return { pct, nights: s.nights, net: s.net };
  });
}

export function compareShortVsLong(i: ShortVsLongInput): ShortVsLong {
  const long = longTermSide(i.monthlyRent);
  const short = shortTermSide(i);
  return {
    long, short,
    difference: cents(short.net - long.net),
    breakEvenPct: breakEvenOccupancy(i, long.net),
  };
}
