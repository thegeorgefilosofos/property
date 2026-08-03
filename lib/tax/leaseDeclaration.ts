// ═══════════════════════════════════════════════════════════════════════════
// leaseDeclaration — «Δήλωση Πληροφοριακών Στοιχείων Μίσθωσης Ακίνητης
// Περιουσίας» (myAADE).
//
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ ΑΥΤΟ
// Ο πραγματικός πόνος του ιδιοκτήτη ΔΕΝ είναι το κλικ της υποβολής. Είναι ότι:
//   • ξεχνά την προθεσμία και πληρώνει πρόστιμο,
//   • φτάνει στη φόρμα και του λείπει το ΑΤΑΚ ή το ΑΦΜ του μισθωτή,
//   • συμπληρώνει λάθος ΑΦΜ και η δήλωση απορρίπτεται,
//   • δεν θυμάται τι δήλωσε πέρσι.
//
// Αυτό το αρχείο λύνει ακριβώς αυτά: ελέγχει ΠΡΙΝ πάει ο χρήστης στο myAADE,
// με πραγματικούς κανόνες εγκυρότητας, και του λέει τι λείπει και πού να το βρει.
//
// ΤΙ ΔΕΝ ΚΑΝΕΙ — και γιατί
// Δεν υποβάλλει. Η ΑΑΔΕ δεν εκθέτει δημόσιο API για τη δήλωση μίσθωσης (το
// myDATA αφορά παραστατικά, όχι μισθώσεις). Ο μόνος «αυτόματος» δρόμος θα ήταν
// αυτοματισμός browser με τα διαπιστευτήρια Taxisnet του χρήστη — κάτι που δεν
// υλοποιούμε: δεν ζητάμε ποτέ κωδικούς Taxisnet.
//
// Καθαρές συναρτήσεις, μηδενικές εξαρτήσεις, πλήρως δοκιμάσιμο.
// ═══════════════════════════════════════════════════════════════════════════

import { isValidAfm } from '../core/greek';

// ── Κανόνες που αλλάζουν με τον νόμο — ΜΙΑ θέση για ενημέρωση ───────────────
// Αν αλλάξει η νομοθεσία, αλλάζει ΜΟΝΟ αυτό το μπλοκ.
export const RULES = {
  /** Προθεσμία υποβολής: έως το τέλος του επόμενου μήνα από την έναρξη της μίσθωσης. */
  deadline: { kind: 'end-of-next-month' as const, label: 'έως το τέλος του επόμενου μήνα από την έναρξη' },
  /** Πόσες ημέρες πριν τη λήξη προειδοποιούμε. */
  warnDaysBefore: 10,
  /** Επίσημη σελίδα υποβολής. */
  portalUrl: 'https://www.aade.gr/polites/misthoseis-akiniton',
  /** Πηγή για επαλήθευση — δείχνεται στον χρήστη, δεν το «λέμε» εμείς. */
  source: 'ΑΑΔΕ — Μισθώσεις ακινήτων (myAADE)',
} as const;

// ── Είσοδοι (όλα προαιρετικά· ο έλεγχος λέει τι λείπει) ─────────────────────
export interface LeaseDeclarationInput {
  owner?:    { name?: string | null; afm?: string | null; doy?: string | null };
  property?: { name?: string | null; atak?: string | null; address?: string | null; postalCode?: string | null;
               city?: string | null; sqm?: number | null; floor?: string | null; type?: string | null;
               ownershipPct?: number | null };
  tenant?:   { fullName?: string | null; afm?: string | null; idDocType?: string | null; idDocNumber?: string | null;
               email?: string | null; phone?: string | null };
  lease?:    { start?: string | null; end?: string | null; monthlyRent?: number | null;
               use?: string | null; furnished?: boolean | null };
  /** Σημερινή ημερομηνία ISO (ένεση για ντετερμινιστικά τεστ). */
  today?: string;
}

export type FieldStatus = 'ok' | 'missing' | 'invalid';
export interface DeclField {
  key: string;
  /** Ετικέτα όπως εμφανίζεται στη φόρμα του myAADE. */
  label: string;
  value: string;
  status: FieldStatus;
  required: boolean;
  /** Τι ακριβώς φταίει / πού το βρίσκει ο χρήστης. */
  hint?: string;
  /** Σε ποια καρτέλα του app διορθώνεται. */
  fixIn?: 'property' | 'tenant' | 'settings';
}

export type Readiness = 'ready' | 'incomplete' | 'invalid';
export interface DeadlineInfo {
  /** ISO ημερομηνία λήξης προθεσμίας, ή null αν λείπει η έναρξη μίσθωσης. */
  due: string | null;
  daysLeft: number | null;
  state: 'unknown' | 'ok' | 'soon' | 'overdue';
  label: string;
}
export interface LeaseDeclaration {
  fields: DeclField[];
  readiness: Readiness;
  missing: DeclField[];
  invalid: DeclField[];
  deadline: DeadlineInfo;
  summary: string;
}

// ── Εργαλεία επικύρωσης ─────────────────────────────────────────────────────
const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '');

/**
 * Έλεγχος ΑΦΜ με τον πραγματικό αλγόριθμο της ΑΑΔΕ (mod 11). Πιάνει τα
 * τυπογραφικά λάθη που απορρίπτουν τη δήλωση.
 *
 * Δεν γράφεται εδώ: υπάρχει ΜΙΑ φορά, στο lib/core/greek.ts. (Το παλιό «κόψιμο»
 * όλων των επαναλαμβανόμενων ψηφίων ήταν περιττό: από τα 111111111…999999999
 * ΚΑΝΕΝΑ δεν περνά το άθροισμα ελέγχου· μόνο το 000000000 περνά, και το core
 * το απορρίπτει ρητά.)
 */
export { isValidAfm };

/** ΑΤΑΚ: 11 ψηφία (Αριθμός Ταυτότητας Ακινήτου). */
export function isValidAtak(atak: unknown): boolean {
  return digits(atak).length === 11;
}

/** Ταχυδρομικός κώδικας: 5 ψηφία. */
export function isValidPostalCode(tk: unknown): boolean {
  return digits(tk).length === 5;
}

const isIsoDate = (s: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ''));
const fmtDate = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };
const eur = (n: number) => `${n.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Ημέρες μεταξύ δύο ISO ημερομηνιών (UTC, χωρίς ώρες). */
function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.UTC(+fromIso.slice(0, 4), +fromIso.slice(5, 7) - 1, +fromIso.slice(8, 10));
  const b = Date.UTC(+toIso.slice(0, 4), +toIso.slice(5, 7) - 1, +toIso.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

/** Τελευταία ημέρα του ΕΠΟΜΕΝΟΥ μήνα από την έναρξη της μίσθωσης. */
export function declarationDeadline(leaseStartIso: string): string {
  const y = +leaseStartIso.slice(0, 4), m = +leaseStartIso.slice(5, 7);
  // Ημέρα 0 του μήνα m+2 = τελευταία ημέρα του μήνα m+1.
  const d = new Date(Date.UTC(y, m + 1, 0));
  return d.toISOString().slice(0, 10);
}

function buildDeadline(leaseStart: string | null | undefined, today: string): DeadlineInfo {
  if (!leaseStart || !isIsoDate(leaseStart)) {
    return { due: null, daysLeft: null, state: 'unknown', label: 'Συμπλήρωσε την έναρξη μίσθωσης για να υπολογιστεί η προθεσμία.' };
  }
  const due = declarationDeadline(leaseStart);
  const daysLeft = daysBetween(today, due);
  if (daysLeft < 0) {
    return { due, daysLeft, state: 'overdue',
      label: `Η προθεσμία έληξε στις ${fmtDate(due)} (πριν ${Math.abs(daysLeft)} ${Math.abs(daysLeft) === 1 ? 'ημέρα' : 'ημέρες'}). Η εκπρόθεσμη δήλωση υποβάλλεται κανονικά, αλλά επισύρει πρόστιμο.` };
  }
  if (daysLeft <= RULES.warnDaysBefore) {
    return { due, daysLeft, state: 'soon',
      label: `Προθεσμία σε ${daysLeft} ${daysLeft === 1 ? 'ημέρα' : 'ημέρες'} — έως ${fmtDate(due)}.` };
  }
  return { due, daysLeft, state: 'ok', label: `Προθεσμία έως ${fmtDate(due)} (σε ${daysLeft} ημέρες).` };
}

// ── Η μηχανή ────────────────────────────────────────────────────────────────
export function buildLeaseDeclaration(input: LeaseDeclarationInput): LeaseDeclaration {
  const today = input.today && isIsoDate(input.today) ? input.today : new Date().toISOString().slice(0, 10);
  const o = input.owner ?? {}, p = input.property ?? {}, t = input.tenant ?? {}, l = input.lease ?? {};
  const F: DeclField[] = [];

  const txt = (v: unknown) => String(v ?? '').trim();
  const add = (f: Omit<DeclField, 'status'> & { status?: FieldStatus }) => F.push({ ...f, status: f.status ?? 'ok' });

  /** Απλό υποχρεωτικό πεδίο κειμένου. */
  const req = (key: string, label: string, raw: unknown, fixIn: DeclField['fixIn'], hint: string) => {
    const value = txt(raw);
    add({ key, label, value, required: true, fixIn, status: value ? 'ok' : 'missing', hint: value ? undefined : hint });
  };
  /** Υποχρεωτικό με επικύρωση. */
  // Ο ελεγκτής παίρνει `string`, όχι `unknown`: του δίνεται πάντα το ήδη
  // κανονικοποιημένο `value`, ποτέ η ακατέργαστη τιμή.
  const reqValid = (key: string, label: string, raw: unknown, ok: (v: string) => boolean, fixIn: DeclField['fixIn'], missHint: string, badHint: string) => {
    const value = txt(raw);
    if (!value) return add({ key, label, value, required: true, fixIn, status: 'missing', hint: missHint });
    add({ key, label, value, required: true, fixIn, status: ok(value) ? 'ok' : 'invalid', hint: ok(value) ? undefined : badHint });
  };

  // ── Εκμισθωτής ────────────────────────────────────────────────────────────
  req('owner_name', 'Ονοματεπώνυμο εκμισθωτή', o.name, 'settings', 'Συμπλήρωσέ το στις Ρυθμίσεις → Στοιχεία τιμολόγησης.');
  reqValid('owner_afm', 'ΑΦΜ εκμισθωτή', o.afm, isValidAfm, 'settings',
    'Συμπλήρωσέ το στις Ρυθμίσεις → Στοιχεία τιμολόγησης.',
    'Το ΑΦΜ δεν περνά τον έλεγχο εγκυρότητας της ΑΑΔΕ. Έλεγξε τα 9 ψηφία — με λάθος ΑΦΜ η δήλωση απορρίπτεται.');

  // ── Ακίνητο ───────────────────────────────────────────────────────────────
  reqValid('atak', 'ΑΤΑΚ ακινήτου', p.atak, isValidAtak, 'property',
    'Το ΑΤΑΚ το βρίσκεις στη δήλωση Ε9 ή στο εκκαθαριστικό ΕΝΦΙΑ.',
    'Το ΑΤΑΚ έχει 11 ψηφία. Έλεγξέ το στο Ε9 ή στο εκκαθαριστικό ΕΝΦΙΑ.');
  req('address', 'Διεύθυνση ακινήτου', p.address, 'property', 'Συμπλήρωσε τη διεύθυνση στα στοιχεία του ακινήτου.');
  reqValid('postal_code', 'Ταχυδρομικός κώδικας', p.postalCode, isValidPostalCode, 'property',
    'Συμπλήρωσε τον ΤΚ στα στοιχεία του ακινήτου.', 'Ο ΤΚ πρέπει να έχει 5 ψηφία.');
  const sqm = Number(p.sqm) || 0;
  add({ key: 'sqm', label: 'Επιφάνεια (τ.μ.)', value: sqm > 0 ? String(sqm) : '', required: true, fixIn: 'property',
        status: sqm > 0 ? 'ok' : 'missing', hint: sqm > 0 ? undefined : 'Συμπλήρωσε τα τετραγωνικά στα στοιχεία του ακινήτου.' });
  add({ key: 'floor', label: 'Όροφος', value: txt(p.floor), required: false, fixIn: 'property',
        status: 'ok', hint: txt(p.floor) ? undefined : 'Προαιρετικό, αλλά το ζητά η φόρμα για διαμερίσματα.' });

  // ── Μισθωτής ──────────────────────────────────────────────────────────────
  req('tenant_name', 'Ονοματεπώνυμο μισθωτή', t.fullName, 'tenant', 'Συμπλήρωσέ το στην καρτέλα Ενοικιαστής.');
  reqValid('tenant_afm', 'ΑΦΜ μισθωτή', t.afm, isValidAfm, 'tenant',
    'Ζήτησέ το από τον μισθωτή — χωρίς αυτό δεν υποβάλλεται η δήλωση.',
    'Το ΑΦΜ του μισθωτή δεν περνά τον έλεγχο εγκυρότητας. Ζήτησέ το ξανά — με λάθος ΑΦΜ η δήλωση απορρίπτεται.');

  // ── Μίσθωση ───────────────────────────────────────────────────────────────
  const start = txt(l.start), end = txt(l.end);
  add({ key: 'lease_start', label: 'Έναρξη μίσθωσης', value: start ? fmtDate(start) : '', required: true, fixIn: 'tenant',
        status: !start ? 'missing' : isIsoDate(start) ? 'ok' : 'invalid',
        hint: !start ? 'Συμπλήρωσε την ημερομηνία έναρξης στην καρτέλα Ενοικιαστής.' : isIsoDate(start) ? undefined : 'Μη έγκυρη ημερομηνία.' });
  const endBad = !!(start && end && isIsoDate(start) && isIsoDate(end) && daysBetween(start, end) <= 0);
  add({ key: 'lease_end', label: 'Λήξη μίσθωσης', value: end ? fmtDate(end) : '', required: true, fixIn: 'tenant',
        status: !end ? 'missing' : endBad ? 'invalid' : 'ok',
        hint: !end ? 'Συμπλήρωσε την ημερομηνία λήξης στην καρτέλα Ενοικιαστής.' : endBad ? 'Η λήξη πρέπει να είναι μετά την έναρξη.' : undefined });
  const rent = Number(l.monthlyRent) || 0;
  add({ key: 'rent', label: 'Μηνιαίο μίσθωμα', value: rent > 0 ? eur(rent) : '', required: true, fixIn: 'tenant',
        status: rent > 0 ? 'ok' : 'missing', hint: rent > 0 ? undefined : 'Συμπλήρωσε το μηνιαίο μίσθωμα στην καρτέλα Ενοικιαστής.' });
  add({ key: 'use', label: 'Χρήση ακινήτου', value: txt(l.use) || 'Κατοικία', required: true, fixIn: 'property', status: 'ok' });

  // ── Ετυμηγορία ────────────────────────────────────────────────────────────
  const missing = F.filter(f => f.required && f.status === 'missing');
  const invalid = F.filter(f => f.status === 'invalid');
  const readiness: Readiness = invalid.length ? 'invalid' : missing.length ? 'incomplete' : 'ready';
  const deadline = buildDeadline(start || null, today);

  let summary: string;
  if (readiness === 'invalid') {
    summary = invalid.length === 1
      ? `Ένα στοιχείο είναι λάθος και θα απορριφθεί η δήλωση: ${invalid[0].label}.`
      : `${invalid.length} στοιχεία είναι λάθος και θα απορριφθεί η δήλωση.`;
  } else if (readiness === 'incomplete') {
    summary = missing.length === 1
      ? `Λείπει ένα στοιχείο: ${missing[0].label}.`
      : `Λείπουν ${missing.length} στοιχεία για να υποβάλεις τη δήλωση.`;
  } else {
    summary = deadline.state === 'overdue'
      ? 'Όλα τα στοιχεία είναι πλήρη και έγκυρα. Η προθεσμία έχει περάσει — υπόβαλε το συντομότερο.'
      : 'Όλα τα στοιχεία είναι πλήρη και έγκυρα. Μπορείς να υποβάλεις τη δήλωση.';
  }

  return { fields: F, readiness, missing, invalid, deadline, summary };
}

/** Κείμενο για αντιγραφή/εκτύπωση, στη σειρά της φόρμας του myAADE. */
export function declarationSheet(d: LeaseDeclaration, title = 'Δήλωση Πληροφοριακών Στοιχείων Μίσθωσης'): string {
  const w = Math.max(...d.fields.map(f => f.label.length));
  const lines = d.fields
    .filter(f => f.value)
    .map(f => `${f.label.padEnd(w, ' ')}  ${f.value}`);
  return [title, '─'.repeat(title.length), ...lines,
    '', d.deadline.due ? `Προθεσμία: ${fmtDate(d.deadline.due)}` : '', `Πηγή: ${RULES.source}`]
    .filter(Boolean).join('\n');
}
