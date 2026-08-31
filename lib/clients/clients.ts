// ═══════════════════════════════════════════════════════════════════════════
// Πελατολόγιο (CRM) — καθαρή, δοκιμάσιμη λογική & ετικέτες. Χωρίς React/Supabase.
// Χρησιμοποιείται από το TabClients.tsx και από τα tests.
// ═══════════════════════════════════════════════════════════════════════════

import { isValidAfm, nightsBetween, normalizePhone } from '../core/greek';
import { athensToday } from '../core/time'

export type ClientType = 'owner' | 'lead' | 'client';
export const CLIENT_TYPES: ClientType[] = ['owner', 'lead', 'client'];
export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  owner: 'Ιδιοκτήτης', lead: 'Υποψήφιος', client: 'Πελάτης',
};

// ═══ ΤΟ PIPELINE ΕΧΕΙ ΒΑΣΗ ΚΑΙ ΛΟΓΙΚΗ, ΔΕΝ ΕΧΕΙ ΟΘΟΝΗ ═══════════════════════
//
// Οι στήλες `stage`, `deal_value` και `next_date` υπάρχουν στον πίνακα
// `clients`, με CHECK constraint στα τέσσερα στάδια. Οι ετικέτες, η σειρά και
// οι δύο συναθροίσεις από κάτω είναι γραμμένες και δοκιμασμένες. ΚΑΜΙΑ ΟΘΟΝΗ
// ΔΕΝ ΤΑ ΑΠΟΔΙΔΕΙ: η καρτέλα Πελατών δείχνει επαφές, διαμονές και σημειώσεις.
//
// ΜΕΝΟΥΝ ΕΠΙΤΗΔΕΣ. Δεν είναι νεκρός κώδικας από αμέλεια· είναι μισοχτισμένη
// λειτουργία με σχήμα βάσης από πίσω. Ο φύλακας νεκρών εξαγωγών τα μετρά ως
// «μόνο με τεστ» και σωστά κάνει, αλλά η διαγραφή λογικής για χάρη ενός
// αριθμού είναι ακριβώς αυτό που απαγορεύει η σημείωση του ορίου.
//
// ΤΙ ΛΕΙΠΕΙ ΓΙΑ ΝΑ ΖΗΣΕΙ: μια στήλη σταδίου στην καρτέλα Πελατών, ένα πεδίο
// αξίας και μια ημερομηνία επόμενης ενέργειας. Τίποτα δεν υπόσχεται pipeline
// σε καμία οθόνη, οπότε κανείς δεν περιμένει κάτι που δεν παίρνει.
export type Stage = 'lead' | 'viewing' | 'offer' | 'closed';
export const PIPELINE_STAGES: Stage[] = ['lead', 'viewing', 'offer', 'closed'];
export const STAGE_ORDER: Record<Stage, number> = { lead: 0, viewing: 1, offer: 2, closed: 3 };
export const STAGE_LABELS: Record<Stage, string> = {
  lead: 'Νέο', viewing: 'Επίσκεψη', offer: 'Προσφορά', closed: 'Έκλεισε',
};

/**
 * Ελληνικό ΑΦΜ (mod-11 της ΑΑΔΕ) και κανονικοποίηση τηλεφώνου.
 *
 * Δεν γράφονται εδώ: υπάρχουν ΜΙΑ φορά στο lib/core/greek.ts. Πριν από αυτό, ο
 * ίδιος ΑΦΜ γραμμένος «094 014 201» ήταν έγκυρος στη Μίσθωση και άκυρος στους
 * Πελάτες — ίδιο νούμερο, δύο απαντήσεις, ανάλογα με την οθόνη.
 */
export { isValidAfm, normalizePhone };

export interface ClientLike { stage?: string | null; deal_value?: number | null; next_date?: string | null; }

/** Άθροισμα αξίας ανοιχτών ευκαιριών (αγνοεί «closed» και null). */
export function pipelineValue(clients: ClientLike[]): number {
  return clients.reduce((sum, c) =>
    sum + (c.stage !== 'closed' && typeof c.deal_value === 'number' ? c.deal_value : 0), 0);
}

/** Πλήθος ενεργειών που λήγουν σήμερα ή έχουν λήξει (μη κλεισμένες ευκαιρίες). */
export function dueActions(clients: ClientLike[], now: Date): number {
  // Ελληνική ημερομηνία: αλλιώς μια ενέργεια που λήγει σήμερα εμφανιζόταν ως
  // ληγμένη τα ξημερώματα.
  const today = athensToday(now);
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
  note: 'Σημείωση', call: 'Τηλεφώνημα', email: 'Ηλεκτρονικό ταχυδρομείο', visit: 'Επίσκεψη', damage: 'Φθορά', other: 'Άλλο',
};

export interface StayLike {
  check_in?: string | null; check_out?: string | null; nights?: number | null;
  nightly_rate?: number | null; total?: number | null; rating?: number | null;
  damages?: boolean | null; damage_cost?: number | null;
}

/**
 * Διανυκτερεύσεις διαμονής (>= 0). Αν λείπει κάτι, 0.
 *
 * Είναι ΤΟ ΙΔΙΟ πράγμα με το `nightsBetween` — κρατά το δικό του όνομα επειδή
 * έτσι το διαβάζουν οι οθόνες των Πελατών, αλλά ΔΕΝ ξαναϋπολογίζει: οι νύχτες
 * είναι η βάση για τα έσοδα, το ΑΔΡ και το τέλος ανθεκτικότητας και δύο
 * υπολογισμοί θα ήταν δύο διαφορετικά νούμερα για την ίδια διαμονή.
 */
export const stayNights = nightsBetween;

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
    // ═══ ΛΕΠΤΑ, ΟΠΩΣ ΚΑΘΕ ΑΛΛΟ ΠΟΣΟ ΤΗΣ ΕΦΑΡΜΟΓΗΣ ═══════════════════════════
    // Στρογγύλευε σε ΑΚΕΡΑΙΑ ευρώ και το πλακίδιο το τύπωνε με δύο δεκαδικά:
    // 950,00 € σε 8 νύχτες έγραφε «118,75 €» στο μυαλό του χρήστη και
    // «119,00 €» στην οθόνη, με το βομβίδιο δίπλα να λέει «δηλωτέο ακαθάριστο
    // διά τις νύχτες». Ο ιδιοκτήτης κάνει τη διαίρεση και δεν βγαίνει.
    //
    // ΤΟ ΑΚΕΡΑΙΟ ΕΙΝΑΙ ΣΩΣΤΟ ΑΛΛΟΥ, ΚΑΙ ΜΕΝΕΙ ΕΚΕΙ: το `suggestBase` της
    // τιμολόγησης στρογγυλεύει επίτηδες, γιατί προτείνει ΤΙΜΗ και κανείς δεν
    // βάζει το δωμάτιό του 118,75. Εδώ δεν προτείνεται τίποτα· μετριέται.
    adr: nights > 0 ? Math.round((revenue / nights) * 100) / 100 : 0,
  };
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
