// ═══════════════════════════════════════════════════════════════════════════
// Αναφορές διαμονών (καθαρή λογική): έσοδα ανά κανάλι, έσοδα ανά μήνα,
// πληρότητα. Χωρίς React/Supabase. Δοκιμάσιμο.
//
// ΤΑ ΕΣΟΔΑ ΕΙΝΑΙ ΤΟ ΔΗΛΩΤΕΟ ΑΚΑΘΑΡΙΣΤΟ, όχι το `total`. Δες
// lib/clients/stayAmounts.ts: το τέλος ανθεκτικότητας δεν είναι έσοδο του
// ιδιοκτήτη και η προμήθεια της πλατφόρμας δεν μειώνει το έσοδο. Κάθε
// συγκεντρωτικό επιστρέφει ΚΑΙ πόσες γραμμές είναι απροσδιόριστες, ώστε η οθόνη
// να μη δείχνει ένα νούμερο σαν βέβαιο όταν δεν είναι.
//
// Η ΠΛΗΡΟΤΗΤΑ ΕΙΧΕ ΛΑΘΟΣ ΠΑΡΟΝΟΜΑΣΤΗ. Διαιρούσε με 365 ημέρες, οπότε ένα
// εποχιακό εξοχικό με γεμάτο καλοκαίρι εμφανιζόταν στο «16%» — αριθμός που δεν
// σημαίνει τίποτα, γιατί το ακίνητο δεν ήταν ποτέ στην αγορά τον Ιανουάριο.
// Παρονομαστής είναι πλέον οι ΔΙΑΘΕΣΙΜΕΣ ημέρες: το παράθυρο λειτουργίας όπως
// το δείχνουν τα δικά του δεδομένα (από τον πρώτο έως τον τελευταίο μήνα με
// κράτηση, ολόκληροι μήνες). Δεν μαντεύουμε πόσο ήταν διαθέσιμο εκτός αυτού.
// Και δίνεται δεύτερο νούμερο, η πληρότητα υψηλής περιόδου — τους τρεις
// καλύτερους συνεχόμενους μήνες, βρεμένους από τα δεδομένα, όχι από ημερολόγιο
// που αποφασίσαμε εμείς.
// ═══════════════════════════════════════════════════════════════════════════
import { stayNights, STAY_CHANNEL_LABELS, type StayChannel } from './clients';
import {
  declarableGrossOrTotal, declarableGross, platformFee, collectedLevy,
  type StayAmountLike,
} from './stayAmounts';

export interface ReportStay extends StayAmountLike {
  property_id?: string | null;
  channel?: string | null;
}

const nightsOf = (s: ReportStay) => s.nights ?? stayNights(s.check_in, s.check_out);

export interface ChannelRow {
  channel: string; label: string; revenue: number; nights: number; count: number;
  /** Πόσες από αυτές τις διαμονές έχουν απροσδιόριστη βάση ποσού. */
  unresolved: number;
  platformFees: number;
}

/** Ακαθάριστα/νύχτες/πλήθος ανά κανάλι (Airbnb/Booking/Απευθείας/Άλλο), φθίνουσα σειρά. */
export function revenueByChannel(stays: ReportStay[]): ChannelRow[] {
  const m = new Map<string, ChannelRow>();
  for (const s of stays) {
    const ch = (s.channel || 'other') as string;
    const label = STAY_CHANNEL_LABELS[ch as StayChannel] || 'Άλλο';
    const row = m.get(ch) || { channel: ch, label, revenue: 0, nights: 0, count: 0, unresolved: 0, platformFees: 0 };
    row.revenue += declarableGrossOrTotal(s);
    row.nights += nightsOf(s) || 0;
    row.count += 1;
    if (declarableGross(s) == null) row.unresolved += 1;
    row.platformFees += platformFee(s);
    m.set(ch, row);
  }
  return [...m.values()].sort((a, b) => b.revenue - a.revenue);
}

/** Ακαθάριστα ανά μήνα (0..11) για συγκεκριμένο έτος, με βάση την ημερομηνία άφιξης. */
/**
 * Έσοδα ανά μήνα άφιξης.
 *
 * ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΔΙΟΡΘΩΘΗΚΕ, ΚΑΙ ΓΙΑΤΙ ΔΕΝ ΤΟ ΕΙΔΕ ΚΑΝΕΙΣ. Εδώ γραφόταν
 * `new Date(d)` και μετά `dt.getFullYear()` / `dt.getMonth()` — δηλαδή η
 * ημερομηνία διαβαζόταν σε UTC και ρωτιόταν σε ΤΟΠΙΚΗ ώρα. Το «2026-01-01»
 * είναι μεσάνυχτα UTC· σε ζώνη με ΑΡΝΗΤΙΚΗ απόκλιση (Νέα Υόρκη, UTC−5) γίνεται
 * 31 Δεκεμβρίου 2025 στα τοπικά. Η διαμονή της Πρωτοχρονιάς δεν έμπαινε στον
 * Δεκέμβριο — έπεφτε έξω από τη ΧΡΟΝΙΑ και εξαφανιζόταν εντελώς από το γράφημα.
 *
 * Στην Ελλάδα (UTC+2/+3) η απόκλιση είναι θετική, οπότε ΔΕΝ φαινόταν ποτέ. Και
 * ο κώδικας τρέχει στον περιηγητή του ΧΡΗΣΤΗ, όχι στον διακομιστή: ένας
 * ιδιοκτήτης που άνοιγε την εφαρμογή από την Αμερική έβλεπε άλλα νούμερα.
 *
 * Η λύση δεν είναι μετατροπή ζώνης: η στήλη είναι `date`, δηλαδή ΗΜΕΡΟΛΟΓΙΑΚΗ
 * ημέρα χωρίς ώρα. Διαβάζεται ως κείμενο, όπως ακριβώς γράφτηκε.
 */
export function revenueByMonth(stays: ReportStay[], year: number): number[] {
  const out = new Array(12).fill(0);
  for (const s of stays) {
    const d = s.check_in || s.check_out;
    const m = /^(\d{4})-(\d{2})-\d{2}/.exec(d || '');
    if (!m || Number(m[1]) !== year) continue;
    const idx = Number(m[2]) - 1;
    if (idx < 0 || idx > 11) continue;
    out[idx] += declarableGrossOrTotal(s);
  }
  return out;
}

/** Νύχτες που πέφτουν εντός του διαστήματος [from, to) για μία διαμονή. */
export function nightsInRange(s: ReportStay, from: string, to: string): number {
  if (!s.check_in || !s.check_out) return 0;
  const a = Math.max(new Date(s.check_in).getTime(), new Date(from).getTime());
  const b = Math.min(new Date(s.check_out).getTime(), new Date(to).getTime());
  if (isNaN(a) || isNaN(b) || b <= a) return 0;
  return Math.round((b - a) / 86400000);
}

const MONTH_DAYS = (year: number, m: number) => new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
const pad2 = (x: number) => String(x).padStart(2, '0');

/** Νύχτες ανά ημερολογιακό μήνα (12 τιμές, 0=Ιαν) που πέφτουν εντός του έτους. */
export function nightsByMonth(stays: ReportStay[], year: number): number[] {
  const out = new Array(12).fill(0);
  for (let m = 0; m < 12; m++) {
    const from = `${year}-${pad2(m + 1)}-01`;
    const to = m === 11 ? `${year + 1}-01-01` : `${year}-${pad2(m + 2)}-01`;
    out[m] = stays.reduce((s, st) => s + nightsInRange(st, from, to), 0);
  }
  return out;
}

export interface PeakOccupancy {
  /** 0=Ιανουάριος. Το παράθυρο είναι συνεχόμενο, [fromMonth..toMonth]. */
  fromMonth: number; toMonth: number;
  days: number; bookedNights: number; pct: number;
}

export interface YearOccupancy {
  bookedNights: number;
  /** Παράθυρο λειτουργίας: ολόκληροι μήνες, από τον πρώτο έως τον τελευταίο με κράτηση. */
  openFromMonth: number | null;
  openToMonth: number | null;
  /** ΔΙΑΘΕΣΙΜΕΣ ημέρες — ο παρονομαστής. 0 όταν δεν υπάρχει καμία κράτηση. */
  availableDays: number;
  /** Κομμένη στο 100 για τις οθόνες που τη ζωγραφίζουν ως μπάρα. */
  pct: number;
  /** Η ΑΚΑΤΕΡΓΑΣΤΗ αναλογία. Ξεπερνά το 100 μόνο με επικαλυπτόμενες ή
   *  διπλοκαταχωρημένες κρατήσεις — που είναι πρόβλημα δεδομένων, όχι επιτυχία. */
  rawPct: number;
  /** Οι νύχτες ξεπερνούν τις διαθέσιμες ημέρες: κάπου υπάρχει διπλή κράτηση. */
  overbooked: boolean;
  /** Πληρότητα υψηλής περιόδου (τρεις καλύτεροι συνεχόμενοι μήνες). */
  peak: PeakOccupancy | null;
  nightsByMonth: number[];
}

/**
 * Πληρότητα έτους με παρονομαστή τις διαθέσιμες ημέρες, όχι τις 365.
 *
 * ΤΙ ΘΕΩΡΟΥΜΕ ΔΙΑΘΕΣΙΜΟ. Τους μήνες από τον πρώτο έως τον τελευταίο με έστω
 * μία κράτηση, ολόκληρους. Είναι μετρημένο, όχι υποθετικό: αν το ακίνητο είχε
 * κρατήσεις Ιούνιο και Σεπτέμβριο, ήταν στην αγορά και τον Ιούλιο και τον
 * Αύγουστο — άρα οι κενές μέρες τους μετρούν εναντίον της πληρότητας, σωστά.
 * Έξω από αυτό το παράθυρο δεν ξέρουμε τίποτα και δεν προσποιούμαστε ότι ξέρουμε.
 */
export function yearOccupancy(stays: ReportStay[], year: number): YearOccupancy {
  return occupancyFromMonths(nightsByMonth(stays, year), year);
}

/**
 * Η ίδια πληρότητα, από ΕΤΟΙΜΟ πίνακα νυχτών ανά μήνα.
 *
 * ΓΙΑΤΙ ΥΠΑΡΧΕΙ. Το ίδιο πάνελ μετρούσε τις νύχτες με δύο κανόνες: εδώ μέσω
 * `nightsInRange`, που θέλει ΚΑΙ check_out, και στη φορολογική σύνοψη μέσω
 * `nightsByMonthForYear`, που πέφτει πίσω στο `s.nights`. Μια διαμονή χωρίς
 * καταχωρημένη αναχώρηση έβγαζε «0 νύχτες» στη λωρίδα και ταυτόχρονα τέλος
 * ανθεκτικότητας για πέντε — δύο αριθμοί δίπλα δίπλα που αναιρούν ο ένας τον
 * άλλον. Οποιος θέλει έναν μετρητή για όλη την οθόνη, περνά τον δικό του εδώ.
 */
export function occupancyFromMonths(nbm: number[], year: number): YearOccupancy {
  const booked = nbm.reduce((a, b) => a + b, 0);
  const months = nbm.map((v, i) => (v > 0 ? i : -1)).filter(i => i >= 0);
  if (months.length === 0) {
    return { bookedNights: 0, openFromMonth: null, openToMonth: null, availableDays: 0, pct: 0, rawPct: 0, overbooked: false, peak: null, nightsByMonth: nbm };
  }
  const from = months[0], to = months[months.length - 1];
  let availableDays = 0;
  for (let m = from; m <= to; m++) availableDays += MONTH_DAYS(year, m);
  const pct = availableDays > 0 ? Math.round((booked / availableDays) * 1000) / 10 : 0;

  // Υψηλή περίοδος: το καλύτερο συνεχόμενο τρίμηνο ΜΕΣΑ στο παράθυρο
  // λειτουργίας. Αν το παράθυρο είναι μικρότερο από τρεις μήνες, είναι όλο του.
  const span = to - from + 1;
  const win = Math.min(3, span);
  let best: PeakOccupancy | null = null;
  for (let start = from; start + win - 1 <= to; start++) {
    let nights = 0, days = 0;
    for (let m = start; m < start + win; m++) { nights += nbm[m]; days += MONTH_DAYS(year, m); }
    const p = days > 0 ? Math.round((nights / days) * 1000) / 10 : 0;
    if (!best || nights > best.bookedNights) best = { fromMonth: start, toMonth: start + win - 1, days, bookedNights: nights, pct: p };
  }
  return { bookedNights: booked, openFromMonth: from, openToMonth: to, availableDays,
           pct: Math.min(100, pct), rawPct: pct, overbooked: booked > availableDays,
           peak: best, nightsByMonth: nbm };
}

export interface StayTotals {
  /** Δηλωτέο ακαθάριστο. */
  revenue: number;
  nights: number;
  count: number;
  /** Διαμονές με απροσδιόριστη βάση ποσού (ιστορικές, πριν τη διάσπαση). */
  unresolved: number;
  /** Πόσα ευρώ από το `revenue` προέρχονται από αυτές τις γραμμές. */
  unresolvedAmount: number;
  platformFees: number;
  climateLevy: number;
  /** Αδήλωτες διαμονές (χωρίς declared_at). */
  undeclared: number;
}

/** Συγκεντρωτικά για ένα σετ διαμονών, με τη ρητή αβεβαιότητα ξεχωριστά. */
export function totals(stays: (ReportStay & { declared_at?: string | null })[]): StayTotals {
  return stays.reduce<StayTotals>((acc, s) => {
    const shown = declarableGrossOrTotal(s);
    const unknown = declarableGross(s) == null;
    return {
      revenue: acc.revenue + shown,
      nights: acc.nights + (nightsOf(s) || 0),
      count: acc.count + 1,
      unresolved: acc.unresolved + (unknown ? 1 : 0),
      unresolvedAmount: acc.unresolvedAmount + (unknown ? shown : 0),
      platformFees: acc.platformFees + platformFee(s),
      climateLevy: acc.climateLevy + collectedLevy(s),
      undeclared: acc.undeclared + ((s.declared_at || '').trim() ? 0 : 1),
    };
  }, { revenue: 0, nights: 0, count: 0, unresolved: 0, unresolvedAmount: 0, platformFees: 0, climateLevy: 0, undeclared: 0 });
}
