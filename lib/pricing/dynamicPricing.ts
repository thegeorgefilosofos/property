// ═══════════════════════════════════════════════════════════════════════════
// Δυναμική τιμολόγηση (Dynamic Pricing) για βραχυχρόνια μίσθωση στην Ελλάδα.
// Καθαρή, διαφανής, ΕΞΗΓΗΣΙΜΗ λογική (χωρίς React/δίκτυο, δοκιμάσιμη). Κάθε
// προτεινόμενη τιμή προκύπτει από πολλαπλασιαστές που φαίνονται αναλυτικά:
//   τελική = βάση × εποχικότητα × ημέρα εβδομάδας × αργία/ζήτηση × lead time × πληρότητα
// Τίποτα δεν είναι «μαύρο κουτί». Τα σήματα βασίζονται σε πραγματικά δεδομένα
// (ιστορικό διαμονών, κλεισμένες ημερομηνίες) και στη γνωστή ελληνική εποχικότητα.
// ═══════════════════════════════════════════════════════════════════════════

export interface PricingStay {
  check_in?: string | null;
  check_out?: string | null;
  nights?: number | null;
  nightly_rate?: number | null;
  total?: number | null;
}

export interface PricingOptions {
  base: number;                 // βασική τιμή/νύχτα (€)
  min?: number;                 // κατώτατο όριο (guardrail)
  max?: number;                 // ανώτατο όριο (guardrail)
  stays?: PricingStay[];        // ιστορικό διαμονών (για blend με πραγματικότητα)
  bookedDates?: Set<string>;    // ημερομηνίες ήδη κλεισμένες (YYYY-MM-DD)
  today?: string;               // YYYY-MM-DD (για υπολογισμό lead time)
  weekendPremium?: number;      // προσαρμογή Παρ/Σαβ (default 0.18 = +18%)
}

/**
 * Ένας πολλαπλασιαστής της τιμής, με ΤΗΝ ΠΗΓΗ ΤΟΥ.
 *
 * Το `source` δεν είναι διακόσμηση. Ο πίνακας «Λεπτομέρεια ημέρας» έδειχνε
 * σωστά κάθε πολλαπλασιαστή ονομαστικά, αλλά ο χρήστης δεν μπορούσε να ξέρει
 * ποιος βγαίνει από ημερολόγιο (αργία, ημέρα εβδομάδας), ποιος από τα δικά του
 * δεδομένα (κλεισμένες ημερομηνίες) και ποιος από παραδοχή μας (εποχικότητα).
 * Η διάκριση είναι όλη η διαφορά μεταξύ μέτρησης και εικασίας.
 */
export interface PriceFactor { label: string; mult: number; source: string }

export interface DayPrice {
  date: string;
  dow: number;                  // 0=Κυρ ... 6=Σαβ
  base: number;
  price: number;                // τελική προτεινόμενη (στρογγυλή)
  factors: PriceFactor[];       // αναλυτική ανάλυση πολλαπλασιαστών
  season: Season;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName?: string;
  booked: boolean;
}

export type Season = 'peak' | 'high' | 'mid' | 'low';

export const SEASON_LABELS: Record<Season, string> = {
  peak: 'Αιχμή', high: 'Υψηλή', mid: 'Μεσαία', low: 'Χαμηλή',
};

// ── Εποχικότητα ελληνικού τουρισμού ανά μήνα (0=Ιαν ... 11=Δεκ) ──────────────
// Πολλαπλασιαστής βάσης. Καλοκαίρι αιχμή, ενδιάμεσες shoulder, χειμώνας χαμηλά.
const MONTH_MULT = [0.78, 0.78, 0.86, 1.00, 1.14, 1.34, 1.68, 1.80, 1.32, 1.04, 0.82, 0.92];
function monthSeason(m: number): Season {
  const x = MONTH_MULT[m];
  if (x >= 1.45) return 'peak';
  if (x >= 1.10) return 'high';
  if (x >= 0.95) return 'mid';
  return 'low';
}

// ── Ορθόδοξο Πάσχα (Meeus, Ιουλιανό → Γρηγοριανό +13 για 1900-2099) ─────────
export function orthodoxEaster(year: number): string {
  const a = year % 4, b = year % 7, c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31); // 3=Μάρτιος, 4=Απρίλιος
  const day = ((d + e + 114) % 31) + 1;
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + 13);
  return dt.toISOString().slice(0, 10);
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (isoDate: string, n: number) => {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};

// ── Σταθερές ελληνικές αργίες/υψηλή ζήτηση (MM-DD) ──────────────────────────
const FIXED_HOLIDAYS: Record<string, string> = {
  '01-01': 'Πρωτοχρονιά',
  '01-06': 'Θεοφάνεια',
  '03-25': 'Εικοστή Πέμπτη Μαρτίου',
  '05-01': 'Εργατική Πρωτομαγιά',
  '08-15': 'Δεκαπενταύγουστος',
  '10-28': 'Επέτειος του Όχι',
  '12-25': 'Χριστούγεννα',
  '12-26': 'Σύναξη Θεοτόκου',
  '12-31': 'Παραμονή Πρωτοχρονιάς',
};

/** Επιστρέφει όνομα αργίας/περιόδου υψηλής ζήτησης για μια ημερομηνία, αλλιώς null. */
export function holidayFor(date: string): string | null {
  const mmdd = date.slice(5);
  if (FIXED_HOLIDAYS[mmdd]) return FIXED_HOLIDAYS[mmdd];
  // Εορταστική περίοδος Χριστουγέννων/Πρωτοχρονιάς (24 Δεκ έως 2 Ιαν)
  if (mmdd >= '12-24' || mmdd <= '01-02') return 'Εορτές';
  // Καρδιά Δεκαπενταύγουστου (12-17 Αυγ)
  if (mmdd >= '08-12' && mmdd <= '08-17') return 'Δεκαπενταύγουστος';
  // Ορθόδοξο Πάσχα: Μεγάλη Παρασκευή έως Δευτέρα του Πάσχα
  const y = Number(date.slice(0, 4));
  const easter = orthodoxEaster(y);
  if (date >= addDays(easter, -2) && date <= addDays(easter, 1)) return 'Πάσχα';
  return null;
}

// ── Blend με πραγματικό ιστορικό: μέση πραγματική τιμή/νύχτα (ADR) ───────────
export function realizedAdr(stays: PricingStay[]): number {
  let rev = 0, nights = 0;
  for (const s of stays) {
    const n = s.nights ?? nightsBetween(s.check_in, s.check_out);
    if (!n) continue;
    const total = s.total ?? (s.nightly_rate ? s.nightly_rate * n : 0);
    if (total > 0) { rev += total; nights += n; }
    else if (s.nightly_rate && s.nightly_rate > 0) { rev += s.nightly_rate * n; nights += n; }
  }
  return nights > 0 ? rev / nights : 0;
}

function nightsBetween(a?: string | null, b?: string | null): number {
  if (!a || !b) return 0;
  const x = new Date(a).getTime(), y = new Date(b).getTime();
  if (isNaN(x) || isNaN(y) || y <= x) return 0;
  return Math.round((y - x) / 86400000);
}

/** Προτεινόμενη βάση από το ιστορικό: μέση πραγματική ADR. */
export function suggestBase(stays: PricingStay[]): number {
  const adr = realizedAdr(stays);
  return adr > 0 ? Math.round(adr) : 0;
}

// ── ΤΙ ΕΦΥΓΕ ΑΠΟ ΕΔΩ, ΚΑΙ ΓΙΑΤΙ ────────────────────────────────────────────
//
// `suggestBaseFallback(rent, sqm)`: πρότεινε βάση χωρίς ίχνος ιστορικού, από
// `(ενοίκιο/30) × 2,2` και `τ.μ. × 1,6 €/νύχτα`, με `Math.max` ΠΡΟΣ ΤΑ ΠΑΝΩ.
// Καμία πηγή, κανένας γεωγραφικός διαχωρισμός: 60 τ.μ. στη Λάρισα έβγαζαν
// 96 €/νύχτα, ίδια με 60 τ.μ. στη Μύκονο. Και επειδή το UI το καλούσε πριν
// δείξει το EmptyState, ο χρήστης έβλεπε έναν αριθμό αντί για την ερώτηση.
// → Χωρίς ιστορικό δεν προτείνουμε καμία βάση. Μένει η βαθμονόμηση από τον
//   ανταγωνισμό, όπου τα νούμερα τα βάζει ο χρήστης από πραγματικές αγγελίες:
//   η μόνη τίμια πηγή που έχουμε για τοπική τιμή.
//
// `projectRevenue()` / `OCC_BY_SEASON`: δες το σχόλιο πριν από το
// `estimateSeasonalOccupancy`.

// ── Πληρότητα γύρω από μια ημερομηνία (demand pace) ─────────────────────────
function occupancyMult(date: string, booked?: Set<string>): number {
  if (!booked || booked.size === 0) return 1;
  let cnt = 0, win = 0;
  for (let i = -3; i <= 3; i++) { win++; if (booked.has(addDays(date, i))) cnt++; }
  const ratio = cnt / win;               // 0..1 πληρότητα ±3 ημερών
  if (ratio >= 0.7) return 1.12;         // γεμίζει γρήγορα → ανέβασε
  if (ratio >= 0.4) return 1.05;
  return 1;
}

// ── Lead time: last-minute έκπτωση για να γεμίσουν κενές κοντινές ημέρες ─────
function leadMult(date: string, today?: string, booked?: Set<string>): number {
  if (!today) return 1;
  if (booked?.has(date)) return 1;       // ήδη κλεισμένη, χωρίς έκπτωση
  const diff = Math.round((new Date(date).getTime() - new Date(today).getTime()) / 86400000);
  if (diff < 0) return 1;
  if (diff <= 3) return 0.85;            // -15% (πολύ κοντά, κενό)
  if (diff <= 7) return 0.92;            // -8%
  if (diff <= 14) return 0.97;           // -3%
  return 1;
}

const round5 = (x: number) => Math.max(1, Math.round(x / 5) * 5);

/** Υπολογίζει προτεινόμενη τιμή για μία ημέρα, με πλήρη ανάλυση παραγόντων. */
export function priceForDate(date: string, opts: PricingOptions): DayPrice {
  const dow = new Date(date + 'T00:00:00Z').getUTCDay();
  const m = Number(date.slice(5, 7)) - 1;
  const factors: PriceFactor[] = [];

  // 1) Εποχικότητα. ΠΑΡΑΔΟΧΗ ΜΑΣ, και το λέει: ένας πίνακας ανά μήνα, ο ίδιος
  //    για Σαντορίνη και Ιωάννινα. Δεν έχουμε τοπικά δεδομένα εποχικότητας.
  const seasonMult = MONTH_MULT[m];
  factors.push({
    label: `Εποχή (${SEASON_LABELS[monthSeason(m)]})`, mult: seasonMult,
    source: 'παραδοχή της εφαρμογής για την ελληνική τουριστική εποχικότητα, ίδια για όλη τη χώρα',
  });

  // 2) Ημέρα εβδομάδας (Παρ/Σαβ premium, Κυρ/Δευ ελαφριά έκπτωση)
  const wknd = opts.weekendPremium ?? 0.18;
  let dowMult = 1;
  const isWeekend = dow === 5 || dow === 6;
  if (isWeekend) dowMult = 1 + wknd;
  else if (dow === 0 || dow === 1) dowMult = 0.95;
  if (dowMult !== 1) factors.push({
    label: isWeekend ? 'Σαββατοκύριακο' : 'Καθημερινή', mult: dowMult,
    source: isWeekend ? 'ημερολόγιο, και το premium που όρισες εσύ στις ρυθμίσεις' : 'ημερολόγιο (Κυριακή/Δευτέρα)',
  });

  // 3) Αργία (μεγαλύτερο premium στην αιχμή: μια αργία τον Αύγουστο αξίζει
  //    περισσότερο από μια αργία τον χειμώνα).
  const holidayName = holidayFor(date);
  const seasonNow = monthSeason(m);
  const holidayMult = holidayName ? (seasonNow === 'peak' ? 1.40 : seasonNow === 'high' ? 1.30 : 1.22) : 1;
  if (holidayName) factors.push({
    label: holidayName, mult: holidayMult,
    source: 'ελληνικό ημερολόγιο αργιών (το Πάσχα υπολογισμένο, όχι καρφωμένο)',
  });

  // 4) Lead time (last-minute)
  const lm = leadMult(date, opts.today, opts.bookedDates);
  if (lm !== 1) factors.push({
    label: 'Last minute', mult: lm,
    source: 'πόσες ημέρες απομένουν και η ημέρα είναι ακόμη κενή στα δικά σου δεδομένα',
  });

  // 5) Πληρότητα γύρω από την ημερομηνία. ΔΙΚΑ ΤΟΥ ΔΕΔΟΜΕΝΑ — γι' αυτό δεν
  //    λέγεται πια «Ζήτηση περιόδου»: δεδομένο ζήτησης δεν έχουμε, κλεισμένες
  //    ημερομηνίες έχουμε.
  const occ = occupancyMult(date, opts.bookedDates);
  if (occ !== 1) factors.push({
    label: 'Κλεισμένες γειτονικές ημέρες', mult: occ,
    source: 'οι δικές σου κρατήσεις ±3 ημέρες (χειροκίνητες και από iCal)',
  });

  let price = opts.base * seasonMult * dowMult * holidayMult * lm * occ;

  // Guardrails ιδιοκτήτη
  if (opts.min != null && opts.min > 0) price = Math.max(price, opts.min);
  if (opts.max != null && opts.max > 0) price = Math.min(price, opts.max);

  return {
    date, dow, base: opts.base, price: round5(price), factors,
    season: monthSeason(m), isWeekend,
    isHoliday: !!holidayName, holidayName: holidayName || undefined,
    booked: !!opts.bookedDates?.has(date),
  };
}

/** Προτεινόμενες τιμές για διάστημα ημερών ξεκινώντας από `from`. */
export function recommendPrices(from: string, days: number, opts: PricingOptions): DayPrice[] {
  const out: DayPrice[] = [];
  for (let i = 0; i < days; i++) out.push(priceForDate(addDays(from, i), opts));
  return out;
}

export interface PricingSummary {
  avg: number; min: number; max: number; peakCount: number; bookedCount: number;
}
export function summarize(rows: DayPrice[]): PricingSummary {
  const avail = rows.filter(r => !r.booked);
  const prices = avail.map(r => r.price);
  const avg = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
  return {
    avg,
    min: prices.length ? Math.min(...prices) : 0,
    max: prices.length ? Math.max(...prices) : 0,
    peakCount: rows.filter(r => r.season === 'peak').length,
    bookedCount: rows.filter(r => r.booked).length,
  };
}

/** Προτεινόμενα guardrails με βάση τη βάση (ενδεικτικά). */
export function suggestGuardrails(base: number): { min: number; max: number } {
  return { min: round5(base * 0.6), max: round5(base * 2.2) };
}

// ── ΠΛΗΡΟΤΗΤΑ ΑΝΑ ΕΠΟΧΗ — ΜΟΝΟ ΜΕΤΡΗΜΕΝΗ, Ή ΚΑΘΟΛΟΥ ───────────────────────
//
// ΤΙ ΕΦΥΓΕ ΚΑΙ ΓΙΑΤΙ. Εδώ ζούσαν δύο πράγματα που δεν άντεχαν έλεγχο:
//
// 1. `OCC_BY_SEASON = {peak:0.90, high:0.72, mid:0.52, low:0.32}`, με το σχόλιο
//    «ρεαλιστική για ελληνική αγορά». Καμία πηγή, κανένας γεωγραφικός
//    διαχωρισμός. Ένα διαμέρισμα στα Ιωάννινα έβλεπε 90% πληρότητα αιχμής.
//
// 2. `projectRevenue()` και το KPI «Εκτιμώμενο επιπλέον κέρδος». Ήταν
//    ΤΑΥΤΟΛΟΓΙΑ: `proj = Σ(τιμή × πληρότητα)` και `flat = Σ(βάση × πληρότητα)`,
//    όπου `τιμή = βάση × πολλαπλασιαστές` με μέσο όρο 1,123. Άρα το «κέρδος»
//    ήταν μαθηματικά αδύνατο να βγει αρνητικό: το app έλεγε «ανέβασε τις τιμές
//    12% και θα βγάλεις 12% περισσότερα, με την ίδια πληρότητα». Χειρότερα, η
//    στάθμιση χρησιμοποιούσε πληρότητα υψηλότερη ακριβώς στους μήνες με τους
//    μεγαλύτερους πολλαπλασιαστές, οπότε το ψεύτικο κέρδος διογκωνόταν.
//    Πρόβλεψη εσόδων χωρίς ελαστικότητα ζήτησης δεν είναι πρόβλεψη — και
//    ελαστικότητα ζήτησης δεν έχουμε. Μένει το εύρος τιμής, που είναι πρόταση
//    και το λέει.
//
// 3. Η ετικέτα «από το ιστορικό σου» με κατώφλι `stays.length >= 4` (~12 νύχτες)
//    και prior βάρους 20: το 62% της εκτίμησης ήταν ο επινοημένος prior. Η
//    ετικέτα έλεγε ψέματα για την προέλευση του αριθμού.
//
// ΤΙ ΜΕΝΕΙ. Πληρότητα ΜΟΝΟ από πραγματικές νύχτες, με κατώφλι, χωρίς prior. Κάτω
// από το κατώφλι επιστρέφεται `null` για την εποχή: το UI γράφει «δεν έχουμε
// αρκετό ιστορικό», που είναι η αλήθεια και είναι χρήσιμη.

/** Ελάχιστες πραγματικές νύχτες ανά εποχή για να βγει πληρότητα (≈ ένας μήνας). */
export const MIN_NIGHTS_FOR_OCCUPANCY = 24;

/**
 * Νύχτες ανά ΣΥΓΚΕΚΡΙΜΕΝΟ μήνα ('YYYY-MM'), όχι ανά μήνα-του-έτους.
 *
 * Η διάκριση δεν είναι λεπτομέρεια: αν αθροίσεις τρεις γεμάτους Αυγούστους σε
 * έναν «Αύγουστο» και διαιρέσεις με 31 ημέρες, βγάζεις 300% πληρότητα και το
 * κλειδώνεις στο 100%. Ο παρονομαστής πρέπει να μεγαλώνει μαζί με τα δεδομένα.
 */
function staysNightsByYearMonth(stays: PricingStay[]): Map<string, number> {
  const out = new Map<string, number>();
  const add = (key: string, n: number) => out.set(key, (out.get(key) || 0) + n);
  for (const s of stays) {
    if (s.check_in && s.check_out) {
      let d = s.check_in.slice(0, 10); const end = s.check_out.slice(0, 10); let g = 0;
      while (d < end && g++ < 400) { add(d.slice(0, 7), 1); d = addDays(d, 1); }
    } else if (s.check_in) {
      add(s.check_in.slice(0, 7), Math.max(0, s.nights ?? 0));
    }
  }
  return out;
}

export interface SeasonalOccupancy {
  /** Πληρότητα ανά εποχή στο [0,1], ή `null` όταν λείπει αρκετό ιστορικό. */
  occ: Record<Season, number | null>;
  /** Πόσες πραγματικές νύχτες μετρήθηκαν ανά εποχή (η απόδειξη του αριθμού). */
  nights: Record<Season, number>;
  /** Υπάρχει έστω μία εποχή με αρκετό ιστορικό; */
  any: boolean;
}

/**
 * Πληρότητα ανά εποχή ΜΟΝΟ από μετρημένες νύχτες.
 *
 * Παρονομαστής: οι ημέρες των μηνών που ανήκουν στην εποχή και έχουν έστω μία
 * κράτηση — δηλαδή οι μήνες που το ακίνητο αποδεδειγμένα ήταν στην αγορά. Κάτω
 * από `MIN_NIGHTS_FOR_OCCUPANCY` νύχτες, η εποχή επιστρέφει `null`: κανένα
 * prior, κανένα «ενδεικτικό» νούμερο που θα το διάβαζε ως μέτρηση.
 */
export function estimateSeasonalOccupancy(stays: PricingStay[]): SeasonalOccupancy {
  const seasons: Season[] = ['peak', 'high', 'mid', 'low'];
  const nights: Record<Season, number> = { peak: 0, high: 0, mid: 0, low: 0 };
  const openDays: Record<Season, number> = { peak: 0, high: 0, mid: 0, low: 0 };
  for (const [ym, n] of staysNightsByYearMonth(stays)) {
    if (n <= 0) continue;
    const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1;
    if (!(y > 0) || m < 0 || m > 11) continue;
    const se = monthSeason(m);
    nights[se] += n;
    openDays[se] += new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  }
  const occ = {} as Record<Season, number | null>;
  let any = false;
  for (const se of seasons) {
    if (nights[se] >= MIN_NIGHTS_FOR_OCCUPANCY && openDays[se] > 0) {
      occ[se] = Math.min(1, nights[se] / openDays[se]);
      any = true;
    } else occ[se] = null;
  }
  return { occ, nights, any };
}

// ── Κενές μέρες προς πλήρωση (actionable gaps) ──────────────────────────────
export interface Gap {
  start: string; end: string;   // end = τελευταία διαθέσιμη νύχτα (inclusive)
  nights: number;
  avgPrice: number;
  fillPrice: number;            // προτεινόμενη τιμή πλήρωσης (με έκπτωση)
  season: Season;
  soon: boolean;                // ξεκινά εντός 14 ημερών
  hard: boolean;                // δύσκολο κενό (κοντό & ανάμεσα σε κρατήσεις)
}

/** Εντοπίζει συνεχόμενα διαθέσιμα διαστήματα (κενά) προς πλήρωση, με προτεινόμενη τιμή. */
export function findGaps(rows: DayPrice[], today?: string): Gap[] {
  const gaps: Gap[] = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].booked) { i++; continue; }
    const startIdx = i;
    while (i < rows.length && !rows[i].booked) i++;
    const endIdx = i - 1;
    const run = rows.slice(startIdx, endIdx + 1);
    const prevBooked = startIdx > 0 && rows[startIdx - 1].booked;
    const nextBooked = endIdx < rows.length - 1 && rows[endIdx + 1].booked;
    const start = run[0].date, end = run[run.length - 1].date;
    const avg = Math.round(run.reduce((s, r) => s + r.price, 0) / run.length);
    const soon = today ? (new Date(start).getTime() - new Date(today).getTime()) / 86400000 <= 14 : false;
    const hard = run.length <= 3 && prevBooked && nextBooked;
    const disc = hard ? 0.82 : soon ? 0.90 : 0.95; // μεγαλύτερη έκπτωση σε δύσκολα/κοντινά κενά
    gaps.push({ start, end, nights: run.length, avgPrice: avg, fillPrice: Math.max(1, Math.round(avg * disc / 5) * 5), season: run[Math.floor(run.length / 2)].season, soon, hard });
  }
  return gaps;
}

// ── Ενδεικτικός πίνακας ανά μήνα (για τον AI βοηθό: γρήγορη αναφορά τιμών) ────
export interface MonthlyIndicative { month: number; season: Season; weekday: number; weekend: number }
/** Ενδεικτική τιμή καθημερινής/Σαββατοκύριακου ανά μήνα (χωρίς αργία/last minute). */
export function indicativeMonthly(base: number, weekendPremium = 0.18): MonthlyIndicative[] {
  const out: MonthlyIndicative[] = [];
  for (let m = 0; m < 12; m++) {
    const mm = MONTH_MULT[m];
    out.push({ month: m, season: monthSeason(m), weekday: round5(base * mm), weekend: round5(base * mm * (1 + weekendPremium)) });
  }
  return out;
}

/** Σύνολο κλεισμένων ημερομηνιών από διαμονές (για occupancy/pace). */
export function bookedDatesFromStays(stays: PricingStay[]): Set<string> {
  const s = new Set<string>();
  for (const st of stays) {
    if (!st.check_in || !st.check_out) continue;
    let d = st.check_in.slice(0, 10);
    const end = st.check_out.slice(0, 10);
    let guard = 0;
    while (d < end && guard++ < 400) { s.add(d); d = addDays(d, 1); }
  }
  return s;
}
