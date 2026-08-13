import { declarationDeadline } from '@/lib/tax/leaseDeclaration';
import {
  taxObligationsHorizon, taxEventSource, taxObligationNotes,
  TAX_EVENT_CATEGORY, type PropertyTaxProfile, type TaxObligation,
} from '@/lib/tax/greekTaxCalendar';
import type { Who } from '@/lib/accounting/dossier';
import type { StatusRow } from '@/lib/property/status';

// ═══════════════════════════════════════════════════════════════════════════
// obligations.ts, οι υποχρεώσεις του ιδιοκτήτη στην Επισκόπηση.
//
// ΤΙ ΑΛΛΑΞΕ ΚΑΙ ΓΙΑΤΙ
// Εδώ ζούσαν ΔΕΥΤΕΡΑ αντίγραφα των θεσμικών προθεσμιών: «ΕΝΦΙΑ 31 Μαΐου» και
// «Ε1 30 Ιουνίου». Το Ημερολόγιο έλεγε «τέλος Μαρτίου» και «15 Ιουλίου». Ο ίδιος
// χρήστης, δύο οθόνες, δύο ημερομηνίες για τον ίδιο φόρο — και δύο εγγραφές στο
// ημερολόγιο αν πάταγε και τα δύο κουμπιά. Τα αντίγραφα ΣΒΗΣΤΗΚΑΝ: οι θεσμικές
// προθεσμίες έρχονται πλέον από το `lib/tax/greekTaxCalendar.ts`, με το ίδιο
// κλειδί γεγονότος (`tax:<id>`) που γράφει και το Ημερολόγιο.
//
// ΤΙ ΜΕΝΕΙ ΔΙΚΟ ΤΟΥ ΑΡΧΕΙΟΥ — και είναι το πολύτιμο κομμάτι
// Οι ημερομηνίες που ΔΕΝ τις ξέρει το κράτος εκ των προτέρων, γιατί βγαίνουν από
// τα δικά του δεδομένα: η προθεσμία της Δήλωσης Μίσθωσης από την ημερομηνία
// υπογραφής, η λήξη της ασφάλισης, η λήξη του μισθωτηρίου, οι συντηρήσεις.
//
// ΠΟΙΟΣ ΓΡΑΦΕΙ ΣΤΟ ΗΜΕΡΟΛΟΓΙΟ (πεδίο `source`)
// Κάθε υποχρέωση φέρει το κλειδί ταυτότητάς της στο `calendar_events.source`.
// Όπου το κλειδί είναι `null`, το γεγονός το γράφει η καρτέλα που ΚΑΤΕΧΕΙ το
// δεδομένο (Ασφάλιση, Ενοικιαστής, Απογραφή) — εδώ μόνο εμφανίζεται. Έτσι το ίδιο
// γεγονός δεν μπαίνει δύο φορές με δύο κλειδιά.
// ═══════════════════════════════════════════════════════════════════════════

export type OblCategory = 'tax' | 'financial' | 'contract' | 'tenant' | 'reminder' | 'maintenance';
export type OblTone = 'negative' | 'warning' | 'info' | 'positive';

export interface Obligation {
  id: string;
  /**
   * Το κλειδί ταυτότητας στο `calendar_events.source`, ή `null` όταν το γεγονός
   * το γράφει άλλη καρτέλα (και θα ήταν διπλότυπο αν το γράφαμε κι εμείς).
   */
  source: string | null;
  title: string;
  date: string;        // ISO (YYYY-MM-DD)
  daysUntil: number;
  tone: OblTone;
  category: OblCategory;
  note: string;
  priority: 'low' | 'medium' | 'high';
  /** Ποιος το κάνει. Ίδιο λεξιλόγιο με τον φάκελο του λογιστή (WHO_LABEL). */
  who: Who;
  /** Μόνο στις θεσμικές: πόσο σίγουρη είναι η ημερομηνία. */
  confidence?: TaxObligation['confidence'];
  /** Μόνο στις θεσμικές: η επίσημη πηγή για επιβεβαίωση. */
  officialUrl?: string;
}

/** Το ακίνητο όπως το βλέπει αυτή η μηχανή. Κληρονομεί το `StatusRow` ώστε το
 *  φορολογικό προφίλ να βγαίνει από την ΜΙΑ κατάσταση του ακινήτου
 *  (`taxProfileOf`), χωρίς δεύτερη ερμηνεία του `rental_mode`. */
export interface OblProp extends StatusRow {
  insurance_expiry?: string | null;
  insurance_company?: string | null;
  enfia?: number | null;
  pea_class?: string | null;
}
export interface OblTenant {
  /** Χρειάζεται για το κλειδί που ΗΔΗ χρησιμοποιεί ο συγχρονισμός της μίσθωσης. */
  id?: string | null;
  lease_start?: string | null;
  lease_end?: string | null;
  monthly_rent?: number | null;
}
export interface OblMaint {
  task: string;
  item_name?: string | null;
  next_due: string;
  est_cost?: number | null;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromISO = (s: string) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const daysBetween = (target: Date, from: Date) => Math.ceil((target.getTime() - from.getTime()) / 86400000);

function tone(days: number): OblTone {
  if (days < 0) return 'negative';
  if (days <= 30) return 'warning';
  if (days <= 90) return 'info';
  return 'positive';
}

/** Πόσο πίσω κοιτάμε: μια προθεσμία που μόλις πέρασε πρέπει να φαίνεται, γιατί
 *  συνήθως προλαβαίνεις ακόμη (με πρόστιμο). Ο ίδιος αριθμός κόβει και το τελικό
 *  φιλτράρισμα, ώστε να μη λέει η μία γραμμή άλλα από την άλλη. */
const LOOKBACK_DAYS = 45;

export function computeObligations(
  prop: OblProp,
  tenant: OblTenant | null,
  maint: OblMaint[] = [],
  now = new Date(),
  profile: PropertyTaxProfile = 'owner',
): Obligation[] {
  const out: Obligation[] = [];
  const push = (o: Omit<Obligation, 'daysUntil' | 'tone' | 'date'> & { date: Date }) => {
    const du = daysBetween(o.date, now);
    out.push({ ...o, date: iso(o.date), daysUntil: du, tone: tone(du) });
  };

  // ── ΘΕΣΜΙΚΕΣ: ΜΙΑ ΠΗΓΗ, ΤΟ greekTaxCalendar ──────────────────────────────
  // Ο ορίζοντας (τρέχον έτος + οι προθεσμίες του επόμενου πριν τον νέο ΕΝΦΙΑ)
  // ορίζεται ΕΚΕΙ, όχι εδώ, ώστε να μη ξαναδιαφωνήσουν οι δύο οθόνες.
  const todayISO = iso(now);
  const cutoff = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - LOOKBACK_DAYS));
  const seenKind = new Set<string>();
  for (const t of taxObligationsHorizon(todayISO, profile)) {
    if (t.date < cutoff) continue;
    // Μία γραμμή ανά ΕΙΔΟΣ υποχρέωσης: η αμέσως επόμενη εμφάνιση. Αλλιώς οι
    // δώδεκα μηνιαίες δηλώσεις της βραχυχρόνιας θα έσπρωχναν έξω τα υπόλοιπα.
    if (seenKind.has(t.kind)) continue;
    seenKind.add(t.kind);
    // Το μόνο που προσθέτουμε στο κείμενο είναι ΔΙΚΟ ΤΟΥ δεδομένο: ο ΕΝΦΙΑ που
    // έχει καταχωρήσει ο ίδιος. Καμία εκτίμηση, κανένα δικό μας νούμερο.
    const own = (t.kind.startsWith('enfia') && prop.enfia)
      ? ` Ο ΕΝΦΙΑ που έχεις καταχωρήσει: ${Math.round(prop.enfia)} € τον χρόνο.`
      : '';
    push({
      id: t.id, source: taxEventSource(t.id), title: t.title, date: fromISO(t.date),
      category: 'tax', note: taxObligationNotes(t) + own,
      priority: t.confidence === 'statutory' ? 'high' : 'medium',
      who: t.who, confidence: t.confidence, officialUrl: t.official_url,
    });
  }

  // ── CROSS-TAB: Ασφάλιση (από Ρυθμίσεις) ───────────────────────────────
  // `source: null` — το γεγονός το γράφει η καρτέλα Ασφάλισης, από το ίδιο πεδίο
  // `insurance_expiry`. Δεύτερη εγγραφή εδώ θα ήταν διπλότυπο, όχι πληροφορία.
  if (prop.insurance_expiry) {
    const d = new Date(prop.insurance_expiry);
    if (!isNaN(d.getTime())) push({
      id: 'insurance', source: null, date: d, category: 'contract', priority: 'medium', who: 'owner',
      title: `Λήξη ασφάλισης${prop.insurance_company ? `, ${prop.insurance_company}` : ''}`,
      note: 'Ανανέωσε το ασφαλιστήριο πριν τη λήξη για να μη μείνει ακάλυπτο το ακίνητο.',
    });
  }

  // ── CROSS-TAB: Μίσθωση (από Ενοικιαστή) ───────────────────────────────
  // Το κλειδί είναι ΤΟ ΙΔΙΟ που χρησιμοποιεί ο συγχρονισμός της μίσθωσης
  // (`tenant:<id>:lease_end`, TabTenantHelpers). Ίδια ημερομηνία, ένα γεγονός.
  if (tenant?.lease_end) {
    const d = new Date(tenant.lease_end);
    if (!isNaN(d.getTime())) push({
      id: 'lease_end', source: tenant.id ? `tenant:${tenant.id}:lease_end` : null,
      date: d, category: 'contract', priority: 'high', who: 'owner',
      title: 'Λήξη σύμβασης μίσθωσης',
      note: 'Ξεκίνα συζήτηση ανανέωσης ή αναπροσαρμογής ενοικίου ~2 μήνες πριν.',
    });
  }
  // Δήλωση μίσθωσης στην ΑΑΔΕ — Η ΔΙΚΗ ΜΑΣ ημερομηνία, από τη δική του υπογραφή.
  if (tenant?.lease_start) {
    const start = new Date(tenant.lease_start);
    if (!isNaN(start.getTime())) {
      // ΜΙΑ πηγή αλήθειας με τη μηχανή της δήλωσης (lib/tax/leaseDeclaration):
      // τέλος του ΕΠΟΜΕΝΟΥ μήνα από την έναρξη — όχι «ίδια μέρα επόμενου μήνα»,
      // που έδειχνε προθεσμία έως και δύο εβδομάδες νωρίτερα από την πραγματική.
      const dISO = declarationDeadline(tenant.lease_start.slice(0, 10));
      const deadline = fromISO(dISO);
      const du = daysBetween(deadline, now);
      // Δείξ' το μόνο αν είναι πρόσφατη έναρξη ή επικείμενη προθεσμία.
      if (du >= -30 && du <= 60) push({
        id: 'lease_decl', source: 'obligations:lease_decl', date: deadline,
        category: 'contract', priority: 'high', who: 'owner',
        title: 'Δήλωση Πληροφοριακών Στοιχείων Μίσθωσης (ΑΑΔΕ)',
        note: 'Κάθε νέα ή τροποποιημένη μίσθωση δηλώνεται ηλεκτρονικά στην ΑΑΔΕ εντός του επόμενου μήνα από την έναρξη.',
      });
    }
  }

  // ── CROSS-TAB: Συντήρηση εξοπλισμού (από Απογραφή) ────────────────────
  // Μόνο ό,τι είναι σε καθυστέρηση ή επίκειται (≤60 ημ.) — για να μη γεμίζει το
  // panel. `source: null`: η Απογραφή γράφει η ίδια τις συντηρήσεις στο ημερολόγιο.
  maint.forEach((m, idx) => {
    const d = new Date(m.next_due);
    if (isNaN(d.getTime())) return;
    const du = daysBetween(d, now);
    if (du > 60) return;
    push({
      id: `maint_${idx}`, source: null, date: d, category: 'maintenance', who: 'owner',
      title: `Συντήρηση, ${m.task}${m.item_name ? `, ${m.item_name}` : ''}`,
      note: m.est_cost ? `Προγραμματισμένη εργασία συντήρησης εξοπλισμού. Εκτιμώμενο κόστος ${Math.round(m.est_cost)} €.` : 'Προγραμματισμένη εργασία συντήρησης εξοπλισμού.',
      priority: du < 0 ? 'high' : 'medium',
    });
  });

  return out.filter(o => o.daysUntil >= -LOOKBACK_DAYS).sort((a, b) => a.date.localeCompare(b.date));
}

// Χαρτογράφηση σε κατηγορία calendar_events (για εγγραφή cross-tab στο Ημερολόγιο).
// Οι φορολογικές προθεσμίες έχουν ΔΙΚΗ ΤΟΥΣ κατηγορία — δεν είναι «συμβόλαια» και
// δεν κρύβονται μέσα στα «οικονομικά», ώστε το φίλτρο του ημερολογίου να μπορεί να
// τις απομονώσει.
export const oblToCalendarCategory = (c: OblCategory): string =>
  c === 'tax' ? TAX_EVENT_CATEGORY
    : c === 'financial' ? 'financial'
    : c === 'tenant' ? 'tenant'
    : c === 'contract' ? 'contract'
    : c === 'maintenance' ? 'maintenance'
    : 'reminder';

/** Οι υποχρεώσεις που γράφει ΑΥΤΗ η οθόνη στο ημερολόγιο (οι υπόλοιπες ανήκουν
 *  στην καρτέλα που κατέχει το δεδομένο). Μία λίστα, ώστε το κουμπί, ο έλεγχος
 *  «προστέθηκε;» και η αφαίρεση να μιλούν για τα ΙΔΙΑ γεγονότα. */
// ΓΙΑΤΙ Η ΕΠΙΣΤΡΟΦΗ ΕΙΝΑΙ ΣΤΕΝΕΜΕΝΗ ΚΑΙ ΟΧΙ ΣΚΕΤΟ `Obligation[]`
// Το type predicate του filter στενεύει σωστά, αλλά μια δηλωμένη επιστροφή
// `Obligation[]` το ΣΒΗΝΕΙ: ο καλών ξαναέβλεπε `source: string | null` και το
// `.map(o => o.source)` έδινε πίνακα με πιθανά null — ακριβώς εκεί που το
// χρησιμοποιούμε ως κλειδί ταυτότητας στο ερώτημα του ημερολογίου.
export const calendarWritable = (
  obls: readonly Obligation[],
): (Obligation & { source: string })[] =>
  obls.filter((o): o is Obligation & { source: string } => !!o.source);
