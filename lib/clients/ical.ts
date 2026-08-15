// ═══════════════════════════════════════════════════════════════════════════
// iCal (ICS) parser για εισαγωγή κρατήσεων/διαμονών από Airbnb/Booking κ.λπ.
// Καθαρή λογική, χωρίς React/δίκτυο. Το κατέβασμα του URL γίνεται αλλού
// (edge function ή paste), εδώ μόνο η ανάλυση.
// ═══════════════════════════════════════════════════════════════════════════

import { nightsBetween } from '../core/greek';

export interface ICalEvent {
  uid: string;
  start: string;   // YYYY-MM-DD (check-in)
  end: string;     // YYYY-MM-DD (check-out, exclusive όπως το δίνει το Airbnb)
  summary: string;
  /**
   * `true` όταν το γεγονός φέρει `STATUS:CANCELLED` (RFC 5545 §3.8.1.11).
   *
   * ΔΕΝ ΕΙΝΑΙ Ο ΣΥΝΗΘΗΣ ΤΡΟΠΟΣ. Airbnb και Booking απλώς ΣΒΗΝΟΥΝ το γεγονός από
   * τη ροή, και αυτό το πιάνει η αντιπαραβολή του συγχρονισμού. Το πεδίο υπάρχει
   * για όσα ημερολόγια το στέλνουν σωστά (Google, iCloud, ξενοδοχειακά PMS): εκεί
   * η ακύρωση φαίνεται αμέσως, χωρίς να χρειαστεί να λείψει από τον επόμενο γύρο.
   */
  cancelled: boolean;
}

// Ξεδίπλωμα διπλωμένων γραμμών (RFC 5545: συνέχεια με κενό/tab στην αρχή).
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const lines: string[] = [];
  for (const l of raw) {
    if ((l.startsWith(' ') || l.startsWith('\t')) && lines.length) lines[lines.length - 1] += l.slice(1);
    else lines.push(l);
  }
  return lines;
}

function toIsoDate(val: string): string {
  const m = val.match(/(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

export function parseICal(text: string): ICalEvent[] {
  const events: ICalEvent[] = [];
  let cur: Partial<ICalEvent> | null = null;
  for (const line of unfold(text || '')) {
    const t = line.trim();
    if (t === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (t === 'END:VEVENT') {
      if (cur && cur.start && cur.end && cur.end > cur.start) {
        events.push({ uid: (cur.uid || `${cur.start}_${cur.end}`).trim(), start: cur.start, end: cur.end, summary: (cur.summary || '').trim(), cancelled: cur.cancelled === true });
      }
      cur = null; continue;
    }
    if (!cur) continue;
    const idx = t.indexOf(':');
    if (idx < 0) continue;
    const key = t.slice(0, idx).toUpperCase();
    const val = t.slice(idx + 1);
    if (key.startsWith('DTSTART')) cur.start = toIsoDate(val);
    else if (key.startsWith('DTEND')) cur.end = toIsoDate(val);
    else if (key === 'SUMMARY') cur.summary = val.replace(/\\,/g, ',').replace(/\\n/gi, ' ').replace(/\\/g, '');
    else if (key === 'UID') cur.uid = val;
    else if (key === 'STATUS') cur.cancelled = val.trim().toUpperCase() === 'CANCELLED';
  }
  return events;
}

/** Ενδεικτικό κανάλι από την πηγή (URL ή summary). */
export function guessChannel(source: string): 'airbnb' | 'booking' | 'other' {
  const s = (source || '').toLowerCase();
  if (s.includes('airbnb')) return 'airbnb';
  if (s.includes('booking')) return 'booking';
  return 'other';
}

/** Είναι το event πραγματική κράτηση ή απλό «μπλοκάρισμα» ημερομηνιών; (ενδεικτικό) */
export function isBlocked(summary: string): boolean {
  const s = (summary || '').toLowerCase();
  return s.includes('not available') || s.includes('blocked') || s.includes('unavailable') || s.includes('μη διαθέσιμο');
}

/** Νύχτες διαμονής: υπολογίζεται ΜΙΑ φορά, στο lib/core/greek.ts. */
export { nightsBetween };

// ── Μετατροπή σε προσχέδια διαμονών για εισαγωγή ────────────────────────────
export interface StayDraft {
  property_id: string;
  check_in: string;   // YYYY-MM-DD
  check_out: string;  // YYYY-MM-DD
  nights: number;
  channel: 'airbnb' | 'booking' | 'other';
  blocked: boolean;   // απλό μπλοκάρισμα ημερομηνιών (όχι κράτηση)
  uid: string;
}

/** Κλειδί ταυτοποίησης διαμονής (για αποφυγή διπλοεγγραφών κατά την εισαγωγή). */
export function stayKey(propertyId: string, checkIn: string, checkOut: string): string {
  return `${propertyId}|${checkIn}|${checkOut}`;
}

/**
 * Μετατρέπει events iCal σε προσχέδια διαμονών για συγκεκριμένο ακίνητο/κανάλι.
 * Αγνοεί events με μηδενικές νύχτες. Δεν αφαιρεί διπλότυπα εδώ (γίνεται με stayKey
 * απέναντι στις υπάρχουσες διαμονές, στο σημείο εισαγωγής).
 */
export function icalToStayDrafts(
  events: ICalEvent[],
  opts: { propertyId: string; channel: 'airbnb' | 'booking' | 'other' }
): StayDraft[] {
  const out: StayDraft[] = [];
  for (const e of events) {
    const nights = nightsBetween(e.start, e.end);
    if (nights <= 0) continue;
    out.push({
      property_id: opts.propertyId,
      check_in: e.start,
      check_out: e.end,
      nights,
      channel: opts.channel,
      blocked: isBlocked(e.summary),
      uid: e.uid,
    });
  }
  return out;
}
