// ═══════════════════════════════════════════════════════════════════════════
// Πελατολόγιο (CRM) — καθαρή, δοκιμάσιμη λογική & ετικέτες. Χωρίς React/Supabase.
// Χρησιμοποιείται από το TabClients.tsx και από τα tests.
// ═══════════════════════════════════════════════════════════════════════════

export type ClientType = 'owner' | 'lead' | 'client';
export const CLIENT_TYPES: ClientType[] = ['owner', 'lead', 'client'];
export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  owner: 'Ιδιοκτήτης', lead: 'Υποψήφιος', client: 'Πελάτης',
};

export type Stage = 'lead' | 'viewing' | 'offer' | 'closed';
export const PIPELINE_STAGES: Stage[] = ['lead', 'viewing', 'offer', 'closed'];
export const STAGE_ORDER: Record<Stage, number> = { lead: 0, viewing: 1, offer: 2, closed: 3 };
export const STAGE_LABELS: Record<Stage, string> = {
  lead: 'Νέο', viewing: 'Επίσκεψη', offer: 'Προσφορά', closed: 'Έκλεισε',
};

/** Ελληνικό ΑΦΜ: 9 ψηφία, mod-11 checksum (βάρη 2^8..2^1 στα πρώτα 8 ψηφία). */
export function isValidAfm(afm: string): boolean {
  if (!/^\d{9}$/.test(afm) || afm === '000000000') return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += parseInt(afm[i], 10) * Math.pow(2, 8 - i);
  return (sum % 11) % 10 === parseInt(afm[8], 10);
}

export interface ClientLike { stage?: string | null; deal_value?: number | null; next_date?: string | null; }

/** Άθροισμα αξίας ανοιχτών ευκαιριών (αγνοεί «closed» και null). */
export function pipelineValue(clients: ClientLike[]): number {
  return clients.reduce((sum, c) =>
    sum + (c.stage !== 'closed' && typeof c.deal_value === 'number' ? c.deal_value : 0), 0);
}

/** Πλήθος ενεργειών που λήγουν σήμερα ή έχουν λήξει (μη κλεισμένες ευκαιρίες). */
export function dueActions(clients: ClientLike[], now: Date): number {
  const today = now.toISOString().slice(0, 10);
  return clients.filter(c => c.stage !== 'closed' && c.next_date != null && c.next_date <= today).length;
}

// ── Διαμονές / επισκέψεις (βραχυχρόνια & μακροχρόνια) ──────────────────────────
export type StayChannel = 'airbnb' | 'booking' | 'direct' | 'other';
export const STAY_CHANNELS: StayChannel[] = ['airbnb', 'booking', 'direct', 'other'];
export const STAY_CHANNEL_LABELS: Record<StayChannel, string> = {
  airbnb: 'Airbnb', booking: 'Booking', direct: 'Απευθείας', other: 'Άλλο',
};

export type NoteKind = 'note' | 'call' | 'email' | 'visit' | 'damage' | 'other';
export const NOTE_KINDS: NoteKind[] = ['note', 'call', 'email', 'visit', 'damage', 'other'];
export const NOTE_KIND_LABELS: Record<NoteKind, string> = {
  note: 'Σημείωση', call: 'Τηλεφώνημα', email: 'Email', visit: 'Επίσκεψη', damage: 'Φθορά', other: 'Άλλο',
};

export interface StayLike {
  check_in?: string | null; check_out?: string | null; nights?: number | null;
  nightly_rate?: number | null; total?: number | null; rating?: number | null;
  damages?: boolean | null; damage_cost?: number | null;
}

/** Διανυκτερεύσεις μεταξύ δύο ημερομηνιών (>= 0). Αν λείπει κάτι, 0. */
export function stayNights(checkIn?: string | null, checkOut?: string | null): number {
  if (!checkIn || !checkOut) return 0;
  const a = new Date(checkIn).getTime(), b = new Date(checkOut).getTime();
  if (isNaN(a) || isNaN(b) || b <= a) return 0;
  return Math.round((b - a) / 86400000);
}

/** Συνολικό ποσό διαμονής: total αν δόθηκε, αλλιώς nights × nightly_rate. */
export function stayTotal(s: StayLike): number {
  if (typeof s.total === 'number' && s.total > 0) return s.total;
  const n = s.nights ?? stayNights(s.check_in, s.check_out);
  return (n || 0) * (s.nightly_rate || 0);
}

export interface ClientStats {
  revenue: number; nights: number; stayCount: number;
  avgRating: number | null; lastVisit: string | null;
  hasDamage: boolean; damageTotal: number; adr: number;
}

/** Συγκεντρωτικά ανά πελάτη από τις διαμονές του (έσοδα, νύχτες, βαθμολογία, φθορές). */
export function clientStats(stays: StayLike[]): ClientStats {
  let revenue = 0, nights = 0, damageTotal = 0, hasDamage = false;
  let ratingSum = 0, ratingCount = 0, lastVisit: string | null = null;
  for (const s of stays) {
    const n = s.nights ?? stayNights(s.check_in, s.check_out);
    nights += n || 0;
    revenue += stayTotal(s);
    if (s.damages) { hasDamage = true; damageTotal += s.damage_cost || 0; }
    if (typeof s.rating === 'number') { ratingSum += s.rating; ratingCount++; }
    const d = s.check_out || s.check_in || null;
    if (d && (!lastVisit || d > lastVisit)) lastVisit = d;
  }
  return {
    revenue, nights, stayCount: stays.length,
    avgRating: ratingCount ? Math.round((ratingSum / ratingCount) * 10) / 10 : null,
    lastVisit, hasDamage, damageTotal,
    adr: nights > 0 ? Math.round(revenue / nights) : 0,
  };
}

/** Κανονικοποίηση τηλεφώνου για αναζήτηση (μόνο ψηφία, χωρίς κωδικό +30/0030). */
export function normalizePhone(p?: string | null): string {
  const digits = (p || '').replace(/\D/g, '');
  return digits.replace(/^(0030|30)(?=\d{10}$)/, '');
}

export interface SearchableClient { full_name?: string | null; phone?: string | null; afm?: string | null; email?: string | null; }
/** Ταιριάζει ο πελάτης στο ερώτημα (όνομα/τηλέφωνο/ΑΦΜ/email); Χρησιμοποιείται από UI & βοηθό. */
export function clientMatches(c: SearchableClient, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const qDigits = q.replace(/\D/g, '');
  if (qDigits.length >= 4 && normalizePhone(c.phone).includes(qDigits)) return true;
  if (qDigits.length >= 4 && (c.afm || '').includes(qDigits)) return true;
  return [c.full_name, c.email, c.afm, c.phone].some(v => (v || '').toLowerCase().includes(q));
}
