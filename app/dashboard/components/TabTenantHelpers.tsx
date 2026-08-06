'use client';

import { daysUntil } from '@/lib/core/time';
import {
  NumberInput, CustomSelect, DatePicker as UIDatePicker,
  Toggle, TextInput, Textarea, ServiceBySelect as UIServiceBySelect,
  SegmentControl, FREQ_OPTIONS,
} from './UIComponents';
import { T, feAuto, Btn } from '@/components/Theme';
import { createClient } from '@/lib/supabase/client';
import { rentDueOccurrence, applyExdate } from '@/lib/calendar/rentDue';

// ─── Re-exports for TabTenant ─────────────────────────────────────────────────
export { Toggle, NumberInput, TextInput, Textarea, FREQ_OPTIONS };
export { CustomSelect as SelectField };
export { UIDatePicker as DateField };
export { UIServiceBySelect as ServiceBySelect };
export { SegmentControl };

// ─── Colors (shared) ─────────────────────────────────────────────────────────
export const C = {
  bg:'var(--bg-base)', card:'var(--bg-surface)', card2:'var(--bg-elevated)',
  border:'var(--border-subtle)', border2:'var(--border-default)',
  gold:'var(--accent)', goldBg:'var(--accent-dim)',
  green:'var(--positive)', red:'var(--negative)', amber:'var(--warning)',
  text:'var(--text-primary)', muted:'var(--text-secondary)', dim:'var(--text-tertiary)',
};

// ─── Types ────────────────────────────────────────────────────────────────────
export type ServiceBy = 'owner' | 'tenant' | 'split';
export type LeaseType = 'monthly' | 'biannual' | 'annual' | '18months' | '24months' | '36months' | 'custom';
export type LeaseCategory = 'residential' | 'commercial';
export type PaymentFreq = 'monthly' | 'bimonthly' | 'quarterly';
export type IdDocType = 'Αστυνομική Ταυτότητα' | 'Διαβατήριο' | 'Στρατιωτική Ταυτότητα' | 'Φοιτητικό Πάσο' | 'Άλλο';

/**
 * ΜΙΑ γραμμή στο «Τι πληρώνεις εσύ, τι ο ενοικιαστής».
 *
 * ΤΙ ΑΝΤΙΚΑΤΕΣΤΗΣΕ: πέντε προκαθορισμένα μηχανήματα (κλιματιστικό, ηλιακός,
 * αντλία θερμότητας, φωτοβολταϊκά, απεντόμωση) με τριάδα πεδίων το καθένα, εννέα
 * πεδία μετρητών (kWh, πάροχοι, τιμολόγια, όρια), έξι στάθμευσης, έναν
 * διαμορφωτή streaming με έξι υπηρεσίες και έναν καθαρισμού με προεπιλογή
 * 15 €/ώρα. Σύνολο ~40 πεδία για να απαντηθεί μία ερώτηση: ποιος πληρώνει τι.
 *
 * ΓΙΑΤΙ ΕΛΕΥΘΕΡΕΣ ΓΡΑΜΜΕΣ: ο κατάλογος συσκευών ήταν ο κατάλογος ενός
 * serviced-apartment operator. Ο ιδιοκτήτης που έχει καυστήρα και τίποτε άλλο
 * έβλεπε τέσσερα μηχανήματα που δεν έχει, και δεν έβλεπε το δικό του.
 *
 * ΓΙΑΤΙ ΔΕΝ ΥΠΑΡΧΕΙ «ΑΠΟΤΕΛΕΣΜΑ»: ο παλιός διαμορφωτής έβγαζε «Αποτέλεσμα/μήνα»
 * σε πράσινο, δηλαδή περιθώριο κέρδους από τη μετακύλιση υπηρεσιών στον μισθωτή.
 * Εδώ υπάρχει κόστος και υπάρχει ποιος το πληρώνει. Τίποτε άλλο.
 */
export interface ServiceLine {
  /** Τι είναι, με τα λόγια του χρήστη. */
  name: string;
  /** Μηνιαίο κόστος σε ευρώ. */
  cost: number;
  /** Ποιος το πληρώνει. `split` σημαίνει μισά-μισά. */
  payer: ServiceBy;
}

// ─── Constants ────────────────────────────────────────────────────────────────
export const LEASE_LABELS: Record<LeaseType, string> = {
  monthly:'Μηνιαίο', biannual:'Εξάμηνο', annual:'Ετήσιο',
  '18months':'18 Μήνες', '24months':'24 Μήνες', '36months':'36 Μήνες', custom:'Προσαρμοσμένο',
};
export const LEASE_MONTHS: Record<LeaseType, number | null> = {
  monthly:1, biannual:6, annual:12, '18months':18, '24months':24, '36months':36, custom:null,
};
export const LEASE_CATEGORY_LABELS: Record<LeaseCategory, string> = {
  residential:'Κατοικία', commercial:'Επαγγελματική',
};
// Τέλος χαρτοσήμου επαγγελματικής μίσθωσης (3,6% επί του μισθώματος).
export const COMMERCIAL_STAMP_DUTY = 0.036;
// Ελάχιστη νόμιμη διάρκεια μίσθωσης (μήνες) ανά τύπο.
// Εδώ κάθονταν τρεις σταθερές που δεν διάβαζε κανείς: η ελάχιστη διάρκεια
// μίσθωσης (36 μήνες και για τα δύο είδη, δηλαδή ούτε καν διέκρινε), οι
// ετικέτες «ποιος πληρώνει τη συντήρηση», και μια λίστα κατηγοριών χρέωσης.
// Και οι τρεις έμοιαζαν με κανόνες της εφαρμογής χωρίς να είναι.
export const ID_DOCS: IdDocType[] = [
  'Αστυνομική Ταυτότητα', 'Διαβατήριο', 'Στρατιωτική Ταυτότητα', 'Φοιτητικό Πάσο', 'Άλλο',
];
export const MONTHS_FULL = ['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος','Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος'];
export const MONTHS_S = ['Ιαν','Φεβ','Μαρ','Απρ','Μαϊ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
// ═══════════════════════════════════════════════════════════════════════════
// ΔΕΙΚΤΗΣ ΤΙΜΩΝ ΚΑΤΑΝΑΛΩΤΗ (ΔΤΚ) — ΔΕΔΟΜΕΝΟ ΜΕ ΠΗΓΗ, ΟΧΙ ΣΤΑΘΕΡΑ ΣΕ .tsx
//
// ΤΟ ΠΡΟΒΛΗΜΑ ΠΟΥ ΛΥΝΕΙ: ο πίνακας ζούσε καρφωμένος μέσα στο TabTenant.tsx, η
// τελευταία εγγραφή ήταν του 2025, και υπήρχε fallback `?? 2.8` για κάθε έτος που
// έλειπε. Πάνω σε αυτό το νούμερο παραγόταν ΕΠΙΣΗΜΟ ΕΓΓΡΑΦΟ προς τον ενοικιαστή
// («όπως ανακοινώθηκε από την ΕΛΣΤΑΤ»), με γραμμές υπογραφής και επίκληση του
// άρθρου 288 ΑΚ. Δηλαδή ο χρήστης έστελνε σε άλλον άνθρωπο κρατικό στοιχείο που
// δεν ήταν κρατικό στοιχείο.
//
// Ο ΚΑΝΟΝΑΣ ΤΩΡΑ: κάθε τιμή έχει έτος και πηγή. Έτος χωρίς τιμή ΔΕΝ έχει τιμή —
// δεν κληρονομεί, δεν μαντεύεται. Χωρίς τιμή για το έτος που ζητά ο χρήστης, η
// εκτύπωση της ειδοποίησης απενεργοποιείται και του ζητάμε το ποσοστό.
// Πρότυπο: RENTAL_TAX_BRACKETS_2026 στο lib/billing/greekTax.ts.
// ═══════════════════════════════════════════════════════════════════════════

/** Μέση ετήσια μεταβολή ΔΤΚ (%), ανά έτος. Πηγή στο `CPI_SOURCE`. */
export const CPI_BY_YEAR: Readonly<Record<number, number>> = {
  2015: 0.0, 2016: 0.0, 2017: 1.1, 2018: 0.8, 2019: 0.5, 2020: -1.3,
  2021: 0.6, 2022: 9.3, 2023: 4.2, 2024: 2.8, 2025: 2.5,
};
/** Από πού προέρχονται τα νούμερα. Φαίνεται στην οθόνη ΚΑΙ μέσα στο έγγραφο. */
export const CPI_SOURCE = 'ΕΛΣΤΑΤ, μέση ετήσια μεταβολή Δείκτη Τιμών Καταναλωτή';
export const CPI_SOURCE_URL = 'https://www.statistics.gr/el/statistics/-/publication/DKT87/-';
/** Πότε επιβεβαιώθηκε τελευταία ο πίνακας από την πηγή (ISO). */
export const CPI_CONFIRMED_AT = '2026-07-30';
/** Το πιο πρόσφατο έτος με ΠΡΑΓΜΑΤΙΚΗ τιμή. */
export const CPI_LATEST_YEAR = Math.max(...Object.keys(CPI_BY_YEAR).map(Number));

/** Το ποσοστό του έτους, ή `null` όταν δεν το ξέρουμε. ΠΟΤΕ fallback. */
export const cpiFor = (year: number): number | null =>
  Object.prototype.hasOwnProperty.call(CPI_BY_YEAR, year) ? CPI_BY_YEAR[year] : null;

/** «τελευταία επιβεβαίωση: 30/07/2026» — ίδια φράση σε οθόνη και έγγραφο. */
export const cpiConfirmedLabel = (): string =>
  `${CPI_SOURCE} · τελευταία επιβεβαίωση ${new Date(CPI_CONFIRMED_AT + 'T00:00:00').toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
export const fmt = (n: number | null | undefined) =>
  n == null ? '—' : feAuto(n);
export const fmtD = (d: string | null) =>
  !d ? '—' : new Date(d).toLocaleDateString('el-GR', { day:'2-digit', month:'2-digit', year:'numeric' });
export const daysLeft = (end: string | null) =>
  !end ? null : daysUntil(end);
export const leaseSt = (d: number | null) => {
  if (d == null) return null;
  if (d < 0)   return { label:'Έληξε',    color:'var(--negative)', bg:'var(--negative-dim)' };
  if (d <= 30) return { label:`${d} ημ.`, color:'var(--warning)',  bg:'var(--warning-dim)'  };
  if (d <= 90) return { label:`${d} ημ.`, color:'var(--accent)',   bg:'var(--accent-dim)'   };
  return                { label:'Ενεργό',  color:'var(--positive)', bg:'var(--positive-dim)' };
};
export const calcEnd = (start: string, type: LeaseType, days: number): string => {
  if (!start) return '';
  const d = new Date(start);
  if (type === 'custom') { d.setDate(d.getDate() + days); }
  else { d.setMonth(d.getMonth() + (LEASE_MONTHS[type] || 1)); }
  return d.toISOString().split('T')[0];
};

// ─── Shared styles ────────────────────────────────────────────────────────────
export const s = {
  card:     { background:'var(--bg-surface)',  border:'1px solid var(--border-subtle)',  borderRadius:'14px', padding:'16px', marginBottom:'16px' } as React.CSSProperties,
  cardGold: { background:'var(--bg-surface)',  border:'1px solid var(--border-accent)',  borderRadius:'14px', padding:'16px', marginBottom:'16px' } as React.CSSProperties,
  sec:      { fontSize:'10px', fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase' as const, color:'var(--text-secondary)', marginBottom:'14px', display:'flex', alignItems:'center', gap:'8px' },
  dot:      (c='var(--accent)') => ({ width:'6px', height:'6px', borderRadius:'50%', background:c, flexShrink:0 } as React.CSSProperties),
  divider:  { borderTop:'1px solid var(--border-subtle)', margin:'18px 0' } as React.CSSProperties,
  g2:       { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap:'14px' } as React.CSSProperties,
  g3:       { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap:'14px' } as React.CSSProperties,
  g4:       { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap:'14px' } as React.CSSProperties,
  badge:    (color: string, bg: string) => ({ display:'inline-flex', alignItems:'center', padding:'3px 9px', borderRadius:'100px', fontSize:'10px', letterSpacing:'0.08em', textTransform:'uppercase' as const, color, background:bg, border:`1px solid color-mix(in srgb, ${color} 20%, transparent)` } as React.CSSProperties),
  tabBtn:   (a: boolean) => ({ padding:'9px 18px', fontSize:'11px', fontWeight: a ? 600 : 400, letterSpacing:'0.04em', cursor:'pointer', border:'none', background:'transparent', color: a ? 'var(--accent)' : 'var(--text-secondary)', borderBottom:`2px solid ${a ? 'var(--accent)' : 'transparent'}`, fontFamily:T.font.sans, transition:'all 0.15s', whiteSpace:'nowrap' as const } as React.CSSProperties),
  kpi:      { background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:'16px', padding:'14px 16px', textAlign:'center' as const } as React.CSSProperties,
  kpiV:     { fontSize:'22px', fontWeight:700, letterSpacing:'-0.5px', lineHeight:1, fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' } as React.CSSProperties,
  kpiL:     { fontSize:'9px', letterSpacing:'0.1em', textTransform:'uppercase' as const, color:'var(--text-secondary)', marginTop:'5px' } as React.CSSProperties,
  th:       { fontSize:'9px', letterSpacing:'0.12em', textTransform:'uppercase' as const, color:'var(--text-secondary)', padding:'8px 12px', borderBottom:'1px solid var(--border-subtle)', textAlign:'left' as const, fontWeight:400 } as React.CSSProperties,
  td:       { padding:'10px 12px', borderBottom:'1px solid var(--border-subtle)', color:'var(--text-primary)', fontSize:'12px', verticalAlign:'middle' as const } as React.CSSProperties,
  tdM:      { padding:'10px 12px', borderBottom:'1px solid var(--border-subtle)', color:'var(--text-secondary)', fontSize:'12px', verticalAlign:'middle' as const } as React.CSSProperties,
  btnGold:  { background:'var(--accent)', color:'var(--accent-text)', border:'none', borderRadius:'10px', padding:'9px 18px', fontSize:'12px', letterSpacing:'0.04em', fontFamily:T.font.sans, cursor:'pointer', fontWeight:700 } as React.CSSProperties,
  btnGhost: { background:'transparent', color:'var(--text-secondary)', border:'1px solid var(--border-default)', borderRadius:'10px', padding:'8px 14px', fontSize:'11px', fontFamily:T.font.sans, cursor:'pointer' } as React.CSSProperties,
  btnSm:    { background:'var(--bg-elevated)', color:'var(--accent)', border:'1px solid var(--border-accent)', borderRadius:'10px', padding:'6px 12px', fontSize:'10px', fontFamily:T.font.sans, cursor:'pointer', fontWeight:600 } as React.CSSProperties,
  btnDng:   { background:'transparent', color:'var(--negative)', border:'1px solid var(--negative-dim)', borderRadius:'10px', padding:'6px 12px', fontSize:'10px', fontFamily:T.font.sans, cursor:'pointer' } as React.CSSProperties,
};

// ═══════════════════════════════════════════════════════════════════════════
// «ΤΙ ΠΛΗΡΩΝΕΙΣ ΕΣΥ, ΤΙ Ο ΕΝΟΙΚΙΑΣΤΗΣ» — ελεύθερες γραμμές
// ═══════════════════════════════════════════════════════════════════════════

/** Παλιά μορφή της στήλης `streaming` (πριν γίνει ελεύθερες γραμμές). */
interface LegacyStreamRow { name?: unknown; cost_owner?: unknown; charged_tenant?: unknown; included?: unknown; cost?: unknown; payer?: unknown }
/** Παλιά μορφή της στήλης `cleaning`. */
interface LegacyCleaning { total_owner?: unknown; total_tenant?: unknown }

const num = (v: unknown): number => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '')); return Number.isFinite(n) && n > 0 ? n : 0; };

/**
 * Διαβάζει τις γραμμές υπηρεσιών, ΚΑΙ από τα παλιά δεδομένα.
 *
 * ΓΙΑΤΙ ΜΕΤΑΤΡΟΠΗ ΚΑΙ ΟΧΙ ΝΕΑ ΣΤΗΛΗ: τα υπάρχοντα δεδομένα ζουν στις στήλες
 * `streaming` (πίνακας υπηρεσιών) και `cleaning` (μία ρύθμιση καθαρισμού). Καμία
 * μετάπτωση σε βάση χωρίς αντίγραφα: η παλιά μορφή διαβάζεται και αποδίδει
 * γραμμές, η νέα γράφεται από πάνω. Ένας ιδιοκτήτης που είχε συμπληρώσει
 * Netflix 13,99 € χρεωμένο στον μισθωτή βλέπει «Netflix · 13,99 € · Ενοικιαστής».
 */
export function serviceLinesFrom(rawServices: unknown, rawCleaning: unknown): ServiceLine[] {
  const out: ServiceLine[] = [];
  if (Array.isArray(rawServices)) {
    for (const r of rawServices as LegacyStreamRow[]) {
      const name = String(r?.name ?? '').trim();
      if (!name) continue;
      // Νέα μορφή: έχει `cost` + `payer`.
      if (r?.cost !== undefined || r?.payer !== undefined) {
        const payer = r.payer === 'tenant' || r.payer === 'split' ? r.payer : 'owner';
        out.push({ name, cost: num(r.cost), payer });
        continue;
      }
      // Παλιά μορφή: κόστος ιδιοκτήτη + χρέωση ενοικιαστή + «included».
      if (r?.included === false) continue;   // δεν παρεχόταν καθόλου
      const own = num(r.cost_owner), ten = num(r.charged_tenant);
      out.push({ name, cost: Math.max(own, ten), payer: ten > 0 && own > 0 ? 'split' : ten > 0 ? 'tenant' : 'owner' });
    }
  }
  const cl = rawCleaning as LegacyCleaning | null | undefined;
  if (cl && (num(cl.total_owner) > 0 || num(cl.total_tenant) > 0)) {
    const own = num(cl.total_owner), ten = num(cl.total_tenant);
    out.push({ name: 'Καθαρισμός', cost: Math.max(own, ten), payer: ten > 0 && own > 0 ? 'split' : ten > 0 ? 'tenant' : 'owner' });
  }
  return out;
}

/** Πόσο επιβαρύνεται ο ΕΝΟΙΚΙΑΣΤΗΣ τον μήνα από τις γραμμές υπηρεσιών. */
export const servicesTenantCharge = (lines: readonly ServiceLine[] | null | undefined): number =>
  (lines || []).reduce((a, l) => a + (l.payer === 'tenant' ? num(l.cost) : l.payer === 'split' ? num(l.cost) / 2 : 0), 0);

/** Πόσο επιβαρύνεται ο ΙΔΙΟΚΤΗΤΗΣ τον μήνα. */
export const servicesOwnerCost = (lines: readonly ServiceLine[] | null | undefined): number =>
  (lines || []).reduce((a, l) => a + (l.payer === 'owner' ? num(l.cost) : l.payer === 'split' ? num(l.cost) / 2 : 0), 0);

/**
 * Ο επεξεργαστής των γραμμών. Τρεις στήλες: περιγραφή, κόστος, ποιος.
 * Χωρίς προκαθορισμένες συσκευές, χωρίς προεπιλεγμένες τιμές, χωρίς «κέρδος».
 */
export function ServicesEditor({ value, onChange }: { value: ServiceLine[] | null; onChange: (v: ServiceLine[]) => void }) {
  const lines = value || [];
  const upd = (i: number, patch: Partial<ServiceLine>) => onChange(lines.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const add = () => onChange([...lines, { name: '', cost: 0, payer: 'owner' }]);
  const del = (i: number) => onChange(lines.filter((_, idx) => idx !== i));
  const tenant = servicesTenantCharge(lines);
  const owner = servicesOwnerCost(lines);

  return (
    <div>
      {lines.length === 0 && (
        <div style={{ fontSize:'12px', color:'var(--text-secondary)', fontFamily:T.font.sans, lineHeight:1.6, marginBottom:'12px' }}>
          Μία γραμμή για κάθε πάγιο που συμφωνήσατε: καθαρισμός, συντήρηση καυστήρα,
          συνδρομή τηλεόρασης, internet. Ό,τι χρεώνεται στον ενοικιαστή προστίθεται
          αυτόματα στη μηνιαία δόση.
        </div>
      )}
      <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginBottom:'12px' }}>
        {lines.map((l, i) => (
          <div key={i} className="svc-cost-row" style={{
            display:'grid', gridTemplateColumns:'minmax(0,1fr) 120px 200px auto',
            alignItems:'end', gap:'12px', padding:'12px 14px',
            background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:'10px',
          }}>
            <TextInput label="Περιγραφή" value={l.name} onChange={v => upd(i, { name: v })} placeholder="Παράδειγμα: Συντήρηση καυστήρα" />
            <NumberInput label="Κόστος τον μήνα" value={l.cost ? String(l.cost) : ''} onChange={v => upd(i, { cost: parseFloat(v) || 0 })} suffix="€" step={0.01} />
            <UIServiceBySelect label="Ποιος πληρώνει" value={l.payer} onChange={v => upd(i, { payer: v })} />
            <button type="button" onClick={() => del(i)} title="Αφαίρεση γραμμής"
              style={{ ...s.btnDng, height:T.h.lg, whiteSpace:'nowrap' as const }}>Αφαίρεση</button>
          </div>
        ))}
      </div>
      <Btn variant="secondary" onClick={add}>Προσθήκη γραμμής</Btn>
      {lines.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap:'8px', marginTop:'14px', padding:'12px', background:'var(--bg-elevated)', borderRadius:'10px', border:'1px solid var(--border-subtle)' }}>
          {[
            { label:'Πληρώνεις εσύ / μήνα', val:fmt(owner) },
            { label:'Πληρώνει ο ενοικιαστής / μήνα', val:fmt(tenant) },
          ].map(({ label, val }) => (
            <div key={label} style={{ textAlign:'center' }}>
              <div style={{ fontSize:'15px', fontWeight:700, color:'var(--text-primary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{val}</div>
              <div style={{ fontSize:'9px', color:'var(--text-secondary)', letterSpacing:'0.1em', textTransform:'uppercase', marginTop:'3px' }}>{label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CustomSelect re-export (named for TabTenant compatibility) ───────────────
export { CustomSelect };

// ═══════════════════════════════════════════════════════════════════════════
// ΧΡΟΝΟΔΙΑΓΡΑΜΜΑ ΜΙΣΘΩΣΗΣ, συγχρονισμός με Ημερολόγιο + Λίστα Εργασιών
// ---------------------------------------------------------------------------
// Idempotent upsert σε calendar_events + checklist_items με ΣΤΑΘΕΡΟ κλειδί
// ανά εγγραφή, ώστε κανένα διπλότυπο σε επαναλαμβανόμενα ανοίγματα του tab.
//   • calendar_events → κλειδί στη στήλη `source`  (π.χ. tenant:<id>:rent_due)
//   • checklist_items → κλειδί στη στήλη `template_id` (ίδια σύμβαση)
// Το σχήμα insert ταιριάζει ακριβώς με BillsGas/BillsInsurance/TabChecklist.
// ═══════════════════════════════════════════════════════════════════════════
type SupaClient = ReturnType<typeof createClient>;

export interface TenantScheduleInput {
  id: string;
  full_name?: string | null;
  lease_start?: string | null;
  lease_end?: string | null;
  monthly_rent?: number | null;
  deposit_amount?: number | null;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Μετατόπιση ISO ημερομηνίας κατά n ημέρες (θετικό/αρνητικό). */
export const shiftISO = (iso: string, days: number): string => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return isoOf(d);
};

/** Επόμενη ετήσια επέτειος (μήνας/ημέρα) του anchor, από σήμερα και μετά. */
export const nextAnniversaryISO = (anchor: string): string => {
  const a = new Date(anchor + 'T00:00:00');
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let y = now.getFullYear();
  let cand = new Date(y, a.getMonth(), a.getDate());
  if (cand < now) { y += 1; cand = new Date(y, a.getMonth(), a.getDate()); }
  return isoOf(cand);
};

/** Επόμενη ημέρα-λήξης ενοικίου (dueDay του μήνα) από σήμερα. */
export const nextRentDueISO = (dueDay: number): string => {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const day = Math.min(Math.max(1, dueDay || 1), 28);
  let cand = new Date(now.getFullYear(), now.getMonth(), day);
  if (cand < now) cand = new Date(now.getFullYear(), now.getMonth() + 1, day);
  return isoOf(cand);
};

/**
 * Παράγει τις επιθυμητές εγγραφές ημερολογίου/εργασιών για τη μίσθωση.
 * Καθαρή συνάρτηση (χωρίς I/O) ώστε να είναι εύκολα ελέγξιμη.
 */
export function tenantScheduleRows(
  t: TenantScheduleInput, propertyId: string, userId: string,
  opts: { rentDueDay?: number } = {},
) {
  const name = (t.full_name || 'ενοικιαστή').trim();
  const key = (suffix: string) => `tenant:${t.id}:${suffix}`;
  const events: Record<string, unknown>[] = [];
  const tasks: Record<string, unknown>[] = [];

  const evBase = { property_id: propertyId, user_id: userId, status: 'pending' as const };
  const ckBase = {
    property_id: propertyId, user_id: userId, status: 'pending' as const, completed: false,
    note: null as string | null, estimated_cost: 0, actual_cost: 0, sort_order: 0,
  };

  // 1) Μηνιαία λήξη πληρωμής ενοικίου (επαναλαμβανόμενο, με υπενθύμιση).
  if (t.monthly_rent && t.monthly_rent > 0) {
    events.push({
      ...evBase, source: key('rent_due'), category: 'rent_due',
      title: `Λήξη πληρωμής ενοικίου, ${name}`,
      event_date: nextRentDueISO(opts.rentDueDay ?? 1),
      amount: t.monthly_rent, priority: 'medium', recurring: true, recurring_interval: 'monthly',
      notes: 'Μηνιαία υπενθύμιση είσπραξης ενοικίου. Κατέγραψε την πληρωμή στην καρτέλα «Ενοικιαστής → Πληρωμές».',
    });
  }

  // 2) Λήξη μίσθωσης + ειδοποιήσεις 60/30 ημέρες πριν.
  if (t.lease_end) {
    events.push({
      ...evBase, source: key('lease_end'), category: 'lease_end',
      title: `Λήξη μίσθωσης, ${name}`, event_date: t.lease_end,
      amount: null, priority: 'high', recurring: false, recurring_interval: null,
      notes: 'Λήξη συμβολαίου μίσθωσης. Ανανέωση ή διαδικασία αποχώρησης.',
    });
    events.push({
      ...evBase, source: key('lease_end_60'), category: 'lease_end',
      title: `Λήξη μίσθωσης σε 60 ημέρες, ${name}`, event_date: shiftISO(t.lease_end, -60),
      amount: null, priority: 'medium', recurring: false, recurring_interval: null,
      notes: 'Ξεκίνα διαπραγμάτευση ανανέωσης μίσθωσης εγκαίρως.',
    });
    events.push({
      ...evBase, source: key('lease_end_30'), category: 'lease_end',
      title: `Λήξη μίσθωσης σε 30 ημέρες, ${name}`, event_date: shiftISO(t.lease_end, -30),
      amount: null, priority: 'high', recurring: false, recurring_interval: null,
      notes: 'Κρίσιμο: απόφαση ανανέωσης ή αποχώρησης εντός 30 ημερών.',
    });
    // 3) Επιστροφή εγγύησης στη λήξη.
    if (t.deposit_amount && t.deposit_amount > 0) {
      events.push({
        ...evBase, source: key('deposit_return'), category: 'deposit',
        title: `Επιστροφή εγγύησης, ${name}`, event_date: t.lease_end,
        amount: t.deposit_amount, priority: 'medium', recurring: false, recurring_interval: null,
        notes: 'Επιστροφή εγγύησης στη λήξη, μετά από έλεγχο για φθορές.',
      });
    }
  }

  // 4) Επέτειος αναπροσαρμογής ΔΤΚ (ετήσια, από lease_start).
  if (t.lease_start && t.monthly_rent && t.monthly_rent > 0) {
    events.push({
      ...evBase, source: key('rent_adjust'), category: 'rent_adjustment',
      title: `Αναπροσαρμογή ενοικίου (ΔΤΚ), ${name}`, event_date: nextAnniversaryISO(t.lease_start),
      amount: null, priority: 'low', recurring: true, recurring_interval: 'yearly',
      notes: 'Ετήσια αναπροσαρμογή μισθώματος βάσει ΔΤΚ (ΕΛΣΤΑΤ). Δες «Αναπροσαρμογή Ενοικίου».',
    });
  }

  // 5) Οι πέντε προκαθορισμένες «ετήσιες συντηρήσεις» (κλιματιστικό, ηλιακός,
  //    αντλία θερμότητας, φωτοβολταϊκά, απεντόμωση) έφυγαν μαζί με τα 15 πεδία
  //    τους. Ό,τι συντηρείται πραγματικά μπαίνει πλέον ως γραμμή στο «Τι πληρώνεις
  //    εσύ, τι ο ενοικιαστής» ή ως εργασία στη Λίστα Εργασιών, όπου ο χρήστης
  //    γράφει τη δική του συσκευή αντί να διαλέγει από κατάλογο ξένων μηχανημάτων.

  // 6) ΑΑΔΕ «Δήλωση Πληροφοριακών Στοιχείων Μίσθωσης» (μία εκκρεμότητα).
  if (t.lease_start) {
    tasks.push({
      ...ckBase, template_id: key('aade_lease_decl'), category: 'legal', priority: 'high',
      recurring: 'none', due_date: shiftISO(t.lease_start, 30),
      description: `ΑΑΔΕ, Δήλωση Πληροφοριακών Στοιχείων Μίσθωσης για ${name}`,
    });
  }
  // 7) Υπενθύμιση ανανέωσης/αποχώρησης ως εργασία (legal).
  if (t.lease_end) {
    tasks.push({
      ...ckBase, template_id: key('lease_renew'), category: 'legal', priority: 'normal',
      recurring: 'none', due_date: shiftISO(t.lease_end, -45),
      description: `Απόφαση ανανέωσης ή αποχώρησης μίσθωσης, ${name}`,
    });
  }

  return { events, tasks };
}

/**
 * Συγχρονισμός μίσθωσης σε Ημερολόγιο + Εργασίες, idempotent.
 * mode='save' → ενημερώνει και ημερομηνίες/ποσά υπαρχόντων events (π.χ. αν άλλαξε
 * η λήξη). mode='open' → μόνο εισάγει ό,τι λείπει. Σφάλματα καταπίνονται (best-effort).
 */
export async function syncTenantSchedule(
  supabase: SupaClient, t: TenantScheduleInput, propertyId: string, userId: string,
  mode: 'save' | 'open' = 'open', opts: { rentDueDay?: number } = {},
): Promise<void> {
  if (!t?.id) return;
  try {
    const { events, tasks } = tenantScheduleRows(t, propertyId, userId, opts);
    const prefix = `tenant:${t.id}:`;

    // ── calendar_events ──
    const { data: exEv } = await supabase
      .from('calendar_events').select('id,source')
      .eq('property_id', propertyId).like('source', `${prefix}%`);
    const evById = new Map<string, string>();
    (exEv || []).forEach((r: { id: string; source: string | null }) => { if (r.source) evById.set(r.source, r.id); });
    const evInsert = events.filter(e => !evById.has(e.source as string));
    if (evInsert.length) await supabase.from('calendar_events').insert(evInsert);
    if (mode === 'save') {
      for (const e of events) {
        const id = evById.get(e.source as string);
        if (!id) continue;
        await supabase.from('calendar_events').update({
          event_date: e.event_date, amount: e.amount, title: e.title, notes: e.notes,
        }).eq('id', id);
      }
    }

    // ── checklist_items (dedup μέσω template_id) ──
    const { data: exCk } = await supabase
      .from('checklist_items').select('template_id')
      .eq('property_id', propertyId).like('template_id', `${prefix}%`);
    const haveCk = new Set((exCk || []).map((r: { template_id: string | null }) => r.template_id));
    const ckInsert = tasks.filter(tk => !haveCk.has(tk.template_id as string));
    if (ckInsert.length) await supabase.from('checklist_items').insert(ckInsert);
  } catch {
    /* best-effort: ο συγχρονισμός δεν πρέπει ποτέ να μπλοκάρει την αποθήκευση */
  }
}

/**
 * Auto-mark-paid: όταν καταγράφεται (ή αναιρείται) πληρωμή ενοικίου για έναν μήνα,
 * κλείνει/ανοίγει η αντίστοιχη εμφάνιση της μηνιαίας υπενθύμισης «rent_due» στο
 * Ημερολόγιο μέσω recurrence_exdates — ώστε το ημερολόγιο να μη «θυμίζει» ενοίκιο
 * που ήδη εισπράχθηκε. Ασφαλές & αντιστρέψιμο (best-effort, δεν μπλοκάρει).
 */
export async function setRentDueOccurrencePaid(
  supabase: SupaClient, tenantId: string, propertyId: string,
  year: number, month: number, paid: boolean,
): Promise<void> {
  if (!tenantId) return;
  try {
    const { data } = await supabase
      .from('calendar_events').select('id,event_date,recurrence_exdates')
      .eq('property_id', propertyId).eq('source', `tenant:${tenantId}:rent_due`).maybeSingle();
    const row = data as { id: string; event_date: string; recurrence_exdates: string[] | null } | null;
    if (!row?.event_date) return;
    const occ = rentDueOccurrence(row.event_date, year, month);
    const next = applyExdate(row.recurrence_exdates, occ, paid);
    if (!next) return; // no-op
    await supabase.from('calendar_events').update({ recurrence_exdates: next }).eq('id', row.id);
  } catch {
    /* best-effort */
  }
}