// ═══════════════════════════════════════════════════════════════════════════
// Αναφορές πελατολογίου/διαμονών (καθαρή λογική): έσοδα ανά κανάλι, έσοδα ανά
// μήνα, πληρότητα (occupancy). Χωρίς React/Supabase. Δοκιμάσιμο.
// ═══════════════════════════════════════════════════════════════════════════
import { stayTotal, stayNights, STAY_CHANNEL_LABELS, type StayChannel } from './clients';

export interface ReportStay {
  property_id?: string | null;
  channel?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  nights?: number | null;
  total?: number | null;
  nightly_rate?: number | null;
}

const nightsOf = (s: ReportStay) => s.nights ?? stayNights(s.check_in, s.check_out);

export interface ChannelRow { channel: string; label: string; revenue: number; nights: number; count: number }

/** Έσοδα/νύχτες/πλήθος ανά κανάλι (Airbnb/Booking/Απευθείας/Άλλο), φθίνουσα σειρά εσόδων. */
export function revenueByChannel(stays: ReportStay[]): ChannelRow[] {
  const m = new Map<string, ChannelRow>();
  for (const s of stays) {
    const ch = (s.channel || 'other') as string;
    const label = STAY_CHANNEL_LABELS[ch as StayChannel] || 'Άλλο';
    const row = m.get(ch) || { channel: ch, label, revenue: 0, nights: 0, count: 0 };
    row.revenue += stayTotal(s);
    row.nights += nightsOf(s) || 0;
    row.count += 1;
    m.set(ch, row);
  }
  return [...m.values()].sort((a, b) => b.revenue - a.revenue);
}

/** Έσοδα ανά μήνα (0..11) για συγκεκριμένο έτος, με βάση την ημερομηνία άφιξης. */
export function revenueByMonth(stays: ReportStay[], year: number): number[] {
  const out = new Array(12).fill(0);
  for (const s of stays) {
    const d = s.check_in || s.check_out;
    if (!d) continue;
    const dt = new Date(d);
    if (isNaN(dt.getTime()) || dt.getFullYear() !== year) continue;
    out[dt.getMonth()] += stayTotal(s);
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

/** Πληρότητα (%) σε ένα διάστημα: κρατημένες νύχτες / συνολικές ημέρες διαστήματος. */
export function occupancyPct(stays: ReportStay[], from: string, to: string): number {
  const total = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
  if (!(total > 0)) return 0;
  const booked = stays.reduce((s, st) => s + nightsInRange(st, from, to), 0);
  return Math.min(100, Math.round((booked / total) * 1000) / 10);
}

/** Συγκεντρωτικά για ένα σετ διαμονών: συνολικά έσοδα, νύχτες, πλήθος. */
export function totals(stays: ReportStay[]): { revenue: number; nights: number; count: number } {
  return stays.reduce<{ revenue: number; nights: number; count: number }>((acc, s) => ({
    revenue: acc.revenue + stayTotal(s),
    nights: acc.nights + (nightsOf(s) || 0),
    count: acc.count + 1,
  }), { revenue: 0, nights: 0, count: 0 });
}
