// ═══════════════════════════════════════════════════════════════════════════
// obligations.ts, Μηχανή Ελληνικών Θεσμικών/Φορολογικών Υποχρεώσεων.
// Ενοποιεί ΘΕΣΜΙΚΕΣ προθεσμίες (ΕΝΦΙΑ, Ε1/Ε2, Δήλωση Μίσθωσης) με δεδομένα
// ΑΛΛΩΝ tabs (ασφάλιση από Ρυθμίσεις, λήξη μίσθωσης από Ενοικιαστή) ώστε ο
// ιδιοκτήτης να μη χάνει καμία προθεσμία. Οι θεσμικές ημερομηνίες είναι
// ενδεικτικές (συχνά δίνονται παρατάσεις), γι' αυτό κάθε στοιχείο φέρει note.
// ═══════════════════════════════════════════════════════════════════════════

export type OblCategory = 'financial' | 'contract' | 'tenant' | 'reminder';
export type OblTone = 'negative' | 'warning' | 'info' | 'positive';

export interface Obligation {
  id: string;
  title: string;
  date: string;        // ISO (YYYY-MM-DD)
  daysUntil: number;
  tone: OblTone;
  category: OblCategory;
  note: string;
  priority: 'low' | 'medium' | 'high';
}

export interface OblProp {
  insurance_expiry?: string | null;
  insurance_company?: string | null;
  enfia?: number | null;
  pea_class?: string | null;
}
export interface OblTenant {
  lease_start?: string | null;
  lease_end?: string | null;
  monthly_rent?: number | null;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysBetween = (target: Date, from: Date) => Math.ceil((target.getTime() - from.getTime()) / 86400000);

// Επόμενη ετήσια εμφάνιση: αν η φετινή πέρασε >30 ημέρες, κύλησε στο επόμενο έτος.
function nextAnnual(now: Date, month: number, day: number): Date {
  let d = new Date(now.getFullYear(), month, day);
  if (daysBetween(d, now) < -30) d = new Date(now.getFullYear() + 1, month, day);
  return d;
}

function tone(days: number): OblTone {
  if (days < 0) return 'negative';
  if (days <= 30) return 'warning';
  if (days <= 90) return 'info';
  return 'positive';
}

export function computeObligations(prop: OblProp, tenant: OblTenant | null, now = new Date()): Obligation[] {
  const out: Obligation[] = [];
  const push = (id: string, title: string, date: Date, category: OblCategory, note: string, priority: Obligation['priority'] = 'medium') => {
    const du = daysBetween(date, now);
    out.push({ id, title, date: iso(date), daysUntil: du, tone: tone(du), category, note, priority });
  };

  // ── ΘΕΣΜΙΚΕΣ (ετήσιες) ────────────────────────────────────────────────
  // Φορολογική δήλωση Ε1/Ε2, τυπική λήξη τέλη Ιουνίου (συχνά παράταση Ιούλιο).
  push('e1', 'Φορολογική δήλωση (Ε1 και Ε2 ενοικίων)', nextAnnual(now, 5, 30), 'financial',
    'Υποβολή της δήλωσης εισοδήματος. Τα ενοίκια δηλώνονται στο έντυπο Ε2. Η προθεσμία συχνά παρατείνεται, επιβεβαίωσέ την στο myAADE.', 'high');

  // ΕΝΦΙΑ, εκκαθάριση και Α΄ δόση τυπικά τέλη Μαΐου (πληρωμή σε δόσεις έως Φεβ.).
  push('enfia', 'ΕΝΦΙΑ, εκκαθάριση και Α΄ δόση', nextAnnual(now, 4, 31), 'financial',
    prop.enfia ? `Εκτιμώμενος ετήσιος ΕΝΦΙΑ: ${Math.round(prop.enfia)} €, σε μηνιαίες δόσεις.` : 'Ο ΕΝΦΙΑ πληρώνεται σε μηνιαίες δόσεις, τυπικά έως τον Φεβρουάριο του επόμενου έτους.', 'high');

  // ── CROSS-TAB: Ασφάλιση (από Ρυθμίσεις) ───────────────────────────────
  if (prop.insurance_expiry) {
    const d = new Date(prop.insurance_expiry);
    if (!isNaN(d.getTime())) push('insurance', `Λήξη ασφάλισης${prop.insurance_company ? `, ${prop.insurance_company}` : ''}`, d, 'contract',
      'Ανανέωσε το ασφαλιστήριο πριν τη λήξη για να μη μείνει ακάλυπτο το ακίνητο.', 'medium');
  }

  // ── CROSS-TAB: Μίσθωση (από Ενοικιαστή) ───────────────────────────────
  if (tenant?.lease_end) {
    const d = new Date(tenant.lease_end);
    if (!isNaN(d.getTime())) push('lease_end', 'Λήξη σύμβασης μίσθωσης', d, 'contract',
      'Ξεκίνα συζήτηση ανανέωσης ή αναπροσαρμογής ενοικίου ~2 μήνες πριν.', 'high');
  }
  // Δήλωση Μίσθωσης στην ΑΑΔΕ, εντός του επόμενου μήνα από την έναρξη.
  if (tenant?.lease_start) {
    const start = new Date(tenant.lease_start);
    if (!isNaN(start.getTime())) {
      const deadline = new Date(start.getFullYear(), start.getMonth() + 1, Math.min(start.getDate() + 0, 28));
      const du = daysBetween(deadline, now);
      // Δείξ' το μόνο αν είναι πρόσφατη έναρξη ή επικείμενη προθεσμία.
      if (du >= -30 && du <= 60) push('lease_decl', 'Δήλωση Πληροφοριακών Στοιχείων Μίσθωσης (ΑΑΔΕ)', deadline, 'contract',
        'Κάθε νέα ή τροποποιημένη μίσθωση δηλώνεται ηλεκτρονικά στην ΑΑΔΕ εντός του επόμενου μήνα από την έναρξη.', 'high');
    }
  }

  return out.filter(o => o.daysUntil >= -45).sort((a, b) => a.date.localeCompare(b.date));
}

// Χαρτογράφηση σε κατηγορία calendar_events (για εγγραφή cross-tab στο Ημερολόγιο)
export const oblToCalendarCategory = (c: OblCategory): string =>
  c === 'financial' ? 'financial' : c === 'tenant' ? 'tenant' : c === 'contract' ? 'contract' : 'reminder';
