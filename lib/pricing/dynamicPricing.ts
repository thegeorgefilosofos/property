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

export interface PriceFactor { label: string; mult: number }

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
const MONTH_MULT = [0.80, 0.80, 0.88, 1.00, 1.12, 1.30, 1.55, 1.60, 1.28, 1.05, 0.85, 0.92];
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

/** Προτεινόμενη βάση από το ιστορικό: μέση ADR εκτός αιχμής (πιο συντηρητική). */
export function suggestBase(stays: PricingStay[]): number {
  const adr = realizedAdr(stays);
  return adr > 0 ? Math.round(adr) : 0;
}

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

  // 1) Εποχικότητα (blend με πραγματική ADR του μήνα αν υπάρχουν δεδομένα)
  let seasonMult = MONTH_MULT[m];
  factors.push({ label: `Εποχή (${SEASON_LABELS[monthSeason(m)]})`, mult: seasonMult });

  // 2) Ημέρα εβδομάδας (Παρ/Σαβ premium, Κυρ/Δευ ελαφριά έκπτωση)
  const wknd = opts.weekendPremium ?? 0.18;
  let dowMult = 1;
  const isWeekend = dow === 5 || dow === 6;
  if (isWeekend) dowMult = 1 + wknd;
  else if (dow === 0 || dow === 1) dowMult = 0.95;
  if (dowMult !== 1) factors.push({ label: isWeekend ? 'Σαββατοκύριακο' : 'Καθημερινή', mult: dowMult });

  // 3) Αργία / υψηλή ζήτηση
  const holidayName = holidayFor(date);
  const holidayMult = holidayName ? 1.25 : 1;
  if (holidayName) factors.push({ label: holidayName, mult: holidayMult });

  // 4) Lead time (last-minute)
  const lm = leadMult(date, opts.today, opts.bookedDates);
  if (lm !== 1) factors.push({ label: 'Last minute', mult: lm });

  // 5) Πληρότητα γύρω από την ημερομηνία
  const occ = occupancyMult(date, opts.bookedDates);
  if (occ !== 1) factors.push({ label: 'Ζήτηση περιόδου', mult: occ });

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

// ── Προβολή εσόδων & κέρδος έναντι σταθερής τιμής ───────────────────────────
// Εκτιμώμενη πληρότητα ανά εποχή (ενδεικτική· ρεαλιστική για ελληνική αγορά).
export const OCC_BY_SEASON: Record<Season, number> = { peak: 0.90, high: 0.72, mid: 0.52, low: 0.32 };

export interface Projection {
  availableNights: number;   // διαθέσιμες νύχτες στο διάστημα (μη κλεισμένες)
  expectedNights: number;    // αναμενόμενες κρατημένες νύχτες (εκτίμηση)
  occPct: number;            // εκτιμώμενη πληρότητα %
  projRevenue: number;       // προβλεπόμενα έσοδα με δυναμική τιμή
  flatRevenue: number;       // προβλεπόμενα έσοδα με σταθερή τιμή (βάση)
  uplift: number;            // διαφορά (€) υπέρ της δυναμικής
  upliftPct: number;         // % βελτίωση
}

/** Προβολή εσόδων στο διάστημα, με εκτιμώμενη πληρότητα ανά εποχή. */
export function projectRevenue(rows: DayPrice[], base: number): Projection {
  const avail = rows.filter(r => !r.booked);
  let exp = 0, proj = 0, flat = 0;
  for (const r of avail) {
    const o = OCC_BY_SEASON[r.season];
    exp += o; proj += r.price * o; flat += base * o;
  }
  const uplift = Math.round(proj - flat);
  return {
    availableNights: avail.length,
    expectedNights: Math.round(exp),
    occPct: avail.length ? Math.round((exp / avail.length) * 100) : 0,
    projRevenue: Math.round(proj),
    flatRevenue: Math.round(flat),
    uplift,
    upliftPct: flat > 0 ? Math.round((uplift / flat) * 100) : 0,
  };
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
