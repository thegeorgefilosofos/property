// ═══════════════════════════════════════════════════════════════════════════
// Φορολογία βραχυχρόνιας μίσθωσης: σύνοψη ανά έτος από τα ΠΡΑΓΜΑΤΙΚΑ δεδομένα
// διαμονών (client_stays). Ενώνει την υπάρχουσα, δατοσημασμένη λογική:
//   • rentalIncomeTax  → κλίμακα φόρου εισοδήματος από ενοίκια (2026)
//   • climateLevyForNights → Τέλος Ανθεκτικότητας στην Κλιματική Κρίση (ΤΑΚΚ)
// Καθαρή λογική (χωρίς React/δίκτυο), δοκιμάσιμη. Οι εκτιμήσεις είναι ενδεικτικές
// και προϋποθέτουν επιβεβαίωση από λογιστή.
// ═══════════════════════════════════════════════════════════════════════════
import { stayTotal } from '@/lib/clients/clients';
import { climateLevyForNights, rentalIncomeTax } from '@/lib/billing/greekTax';

export interface TaxStay {
  check_in?: string | null;
  check_out?: string | null;
  nights?: number | null;
  nightly_rate?: number | null;
  total?: number | null;
  channel?: string | null;
}

const y4 = (d?: string | null) => (d || '').slice(0, 4);
const addDay = (isoDate: string) => { const dt = new Date(isoDate + 'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate() + 1); return dt.toISOString().slice(0, 10); };

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
/** Ανάλυση εσόδων/νυχτών ανά κανάλι για το έτος (με βάση την ημερομηνία άφιξης). */
export function channelBreakdownForYear(stays: TaxStay[], year: number): TaxChannelRow[] {
  const m = new Map<string, TaxChannelRow>();
  for (const s of stays) {
    if (y4(s.check_in) !== String(year)) continue;
    const ch = (s.channel || 'other') as string;
    const row = m.get(ch) || { channel: ch, revenue: 0, nights: 0, stays: 0 };
    row.revenue += stayTotal(s);
    row.nights += s.nights ?? 0;
    row.stays += 1;
    m.set(ch, row);
  }
  return [...m.values()].sort((a, b) => b.revenue - a.revenue);
}

export interface ShortTermYearSummary {
  year: number;
  grossRevenue: number;    // μεικτά έσοδα (άθροισμα διαμονών με άφιξη μέσα στο έτος)
  totalNights: number;
  stayCount: number;
  nightsByMonth: number[];
  levy: number;            // ΤΑΚΚ (τέλος ανθεκτικότητας)
  incomeTax: number;       // εκτιμώμενος φόρος εισοδήματος (κλίμακα ενοικίων)
  net: number;             // μεικτά − φόρος − ΤΑΚΚ
  effectiveRate: number;   // φόρος / μεικτά
  byChannel: TaxChannelRow[];
}

/** Πλήρης φορολογική σύνοψη βραχυχρόνιας για ένα έτος, από τις διαμονές.
 *  Το sqm καθορίζει τη σωστή κλίμακα του Τέλους Ανθεκτικότητας (>80 τ.μ.). */
export function shortTermYearSummary(stays: TaxStay[], year: number, sqm?: number | null): ShortTermYearSummary {
  const inYear = stays.filter(s => y4(s.check_in) === String(year));
  const nightsByMonth = nightsByMonthForYear(stays, year);
  const totalNights = nightsByMonth.reduce((a, b) => a + b, 0);
  const grossRevenue = inYear.reduce((sum, s) => sum + stayTotal(s), 0);
  const levy = climateLevyForNights(nightsByMonth, sqm);
  const incomeTax = rentalIncomeTax(grossRevenue);
  const net = grossRevenue - incomeTax - levy;
  return {
    year, grossRevenue, totalNights, stayCount: inYear.length, nightsByMonth,
    levy, incomeTax, net, effectiveRate: grossRevenue > 0 ? incomeTax / grossRevenue : 0,
    byChannel: channelBreakdownForYear(stays, year),
  };
}

/** Έτη με καταγεγραμμένες διαμονές (για επιλογή έτους), φθίνουσα σειρά. */
export function yearsWithStays(stays: TaxStay[]): number[] {
  const s = new Set<number>();
  for (const st of stays) { const y = Number(y4(st.check_in)); if (y) s.add(y); }
  return [...s].sort((a, b) => b - a);
}
