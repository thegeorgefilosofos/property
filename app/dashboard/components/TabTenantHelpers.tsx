'use client';

import { daysUntil } from '@/lib/core/time';
import {
  NumberInput, CustomSelect, DatePicker as UIDatePicker,
  Toggle, TextInput, Textarea, ServiceBySelect as UIServiceBySelect,
  SegmentControl, FREQ_OPTIONS,
} from './UIComponents';
import { T, feAuto, feOr, Btn, localDay, ABSENT_DATE } from '@/components/Theme';
import { createClient } from '@/lib/supabase/client';
import * as calendar from '@/lib/data/calendar';
import * as checklist from '@/lib/data/checklist';
import { rentDueOccurrence, applyExdate } from '@/lib/calendar/rentDue';
import { saved } from '@/components/dbWrite';

// ─── Re-exports for TabTenant ─────────────────────────────────────────────────
export { Toggle, NumberInput, TextInput, Textarea, FREQ_OPTIONS };
export { CustomSelect as SelectField };
export { UIDatePicker as DatePicker };
export { UIServiceBySelect as ServiceBySelect };
export { SegmentControl };

// ─── Types ────────────────────────────────────────────────────────────────────
// Ο τύπος και η λογική ζουν πλέον στο lib/rent/services.ts. Εδώ μένει μόνο
// επανεξαγωγή, ώστε οι δώδεκα οθόνες που τα εισάγουν να μην αλλάξουν γραμμή.
import { serviceLinesFrom, servicesTenantCharge, servicesOwnerCost, type ServiceBy, type ServiceLine } from '@/lib/rent/services';
export { serviceLinesFrom, servicesTenantCharge, servicesOwnerCost };
export type { ServiceBy, ServiceLine };
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
// ─── Helpers ──────────────────────────────────────────────────────────────────
export const fmt = (n: number | null | undefined) =>
  n == null ? feOr(null) : feAuto(n);
export const fmtD = (d: string | null) =>
  !d ? ABSENT_DATE : localDay(d).toLocaleDateString('el-GR', { day:'2-digit', month:'2-digit', year:'numeric' });
export const daysLeft = (end: string | null) =>
  !end ? null : daysUntil(end);
export const leaseSt = (d: number | null) => {
  if (d == null) return null;
  if (d < 0)   return { label:'Έληξε',    color:'var(--negative)', bg:'var(--negative-dim)' };
  if (d <= 30) return { label:`${d} ημ.`, color:'var(--warning)',  bg:'var(--warning-dim)'  };
  if (d <= 90) return { label:`${d} ημ.`, color:'var(--accent)',   bg:'var(--accent-dim)'   };
  return                { label:'Ενεργό',  color:'var(--positive)', bg:'var(--positive-dim)' };
};
// Η ΛΗΞΗ ΤΗΣ ΜΙΣΘΩΣΗΣ ΕΧΑΝΕ ΜΙΑ ΜΕΡΑ ΣΤΗ ΘΕΡΙΝΗ ΩΡΑ.
// Το `new Date('2026-02-15')` είναι μεσάνυχτα UTC, αλλά τα `setMonth`/`setDate`
// δουλεύουν σε ΤΟΠΙΚΗ ώρα. Όταν το διάστημα περνά από χειμερινή σε θερινή, η
// τοπική ώρα κερδίζει μία ώρα και το αποτέλεσμα πέφτει στις 23:00 της
// προηγούμενης ημέρας σε UTC: μίσθωση 15 Φεβρουαρίου + 6 μήνες έληγε 14
// Αυγούστου αντί για 15. Σε σύμβαση με νομικές συνέπειες, μία μέρα μετράει.
// Όλα σε UTC, από την αρχή ως το τέλος.
//
// ΚΑΙ ΜΕΤΑ ΞΕΧΕΙΛΙΖΕ ΤΟΝ ΜΗΝΑ, ΕΝΩ ΤΟ ΣΧΟΛΙΟ ΑΠΟ ΠΑΝΩ ΔΙΑΒΕΒΑΙΩΝΕ ΟΤΙ ΕΚΛΕΙΣΕ.
// Το `setUTCMonth` ΔΕΝ συγκρατεί την ημέρα: όταν ο μήνας-στόχος έχει λιγότερες
// μέρες από την ημέρα έναρξης, ξεχειλίζει στον επόμενο. Μετρημένο:
//
//   31/08/2026 εξάμηνη  → «2027-03-03» αντί για 28/02/2027   (τρεις μέρες)
//   31/01/2026 μηνιαία  → «2026-03-03» αντί για 28/02/2026
//   31/10/2026 μηνιαία  → «2026-12-01» αντί για 30/11/2026
//   29/02/2024 ετήσια   → «2025-03-01» αντί για 28/02/2025
//
// Η τιμή ΓΡΑΦΕΤΑΙ στη βάση και από εκεί περνά στην `current_tenant_of`, στην
// πύλη του μισθωτή, στις υπενθυμίσεις λήξης και στο υπογεγραμμένο μισθωτήριο.
// Το UTC έλυσε τη ζώνη ώρας· δεν έλυσε την υπερχείλιση, και το σχόλιο έλεγε
// «όλα σε UTC, από την αρχή ως το τέλος» σαν να την είχε λύσει.
//
// Ο κανόνας του αστικού δικαίου είναι ρητός: μίσθωση που αρχίζει την τελευταία
// ημέρα ενός μήνα λήγει την ΤΕΛΕΥΤΑΙΑ ημέρα του μήνα-στόχου, όχι στις 3 του
// επόμενου. Οταν η ημέρα δεν υπάρχει, κρατιέται η τελευταία που υπάρχει.
export const calcEnd = (start: string, type: LeaseType, days: number): string => {
  if (!start) return '';
  const d = new Date(`${start}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  if (type === 'custom') { d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
  const months = LEASE_MONTHS[type] || 1;
  const day = d.getUTCDate();
  // Ημέρα 1 πρώτα: έτσι το `setUTCMonth` δεν έχει τίποτα να ξεχειλίσει. Μετά
  // κρατιέται η αρχική ημέρα, ή η τελευταία του μήνα αν εκείνη δεν υπάρχει.
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastOfTarget = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastOfTarget));
  return d.toISOString().slice(0, 10);
};

// ─── Shared styles ────────────────────────────────────────────────────────────
export const s = {
  card:     { background:'var(--bg-surface)',  border:'1px solid var(--border-subtle)',  borderRadius: T.radius.card, padding:'16px', marginBottom:'16px' } as React.CSSProperties,
  cardGold: { background:'var(--bg-surface)',  border:'1px solid var(--border-accent)',  borderRadius: T.radius.card, padding:'16px', marginBottom:'16px' } as React.CSSProperties,
  sec:      { fontSize:'10px', fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase' as const, color:'var(--text-secondary)', marginBottom:'14px', display:'flex', alignItems:'center', gap:'8px' },
  dot:      (c='var(--accent)') => ({ width:'6px', height:'6px', borderRadius:'50%', background:c, flexShrink:0 } as React.CSSProperties),
  divider:  { borderTop:'1px solid var(--border-subtle)', margin:'18px 0' } as React.CSSProperties,
  g2:       { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap:'14px' } as React.CSSProperties,
  g3:       { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap:'14px' } as React.CSSProperties,
  g4:       { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap:'14px' } as React.CSSProperties,
  badge:    (color: string, bg: string) => ({ display:'inline-flex', alignItems:'center', padding:'3px 9px', borderRadius: T.radius.pill, fontSize:'10px', letterSpacing:'0.08em', textTransform:'uppercase' as const, color, background:bg, border:`1px solid color-mix(in srgb, ${color} 20%, transparent)` } as React.CSSProperties),
  tabBtn:   (a: boolean) => ({ padding:'9px 18px', fontSize:'11px', fontWeight: a ? 600 : 400, letterSpacing:'0.04em', cursor:'pointer', border:'none', background:'transparent', color: a ? 'var(--accent)' : 'var(--text-secondary)', borderBottom:`2px solid ${a ? 'var(--accent)' : 'transparent'}`, fontFamily:T.font.sans, transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s', whiteSpace:'nowrap' as const } as React.CSSProperties),
  kpi:      { background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:'16px', padding:'14px 16px', textAlign:'center' as const } as React.CSSProperties,
  kpiV:     { fontSize:'22px', fontWeight:700, letterSpacing:'-0.5px', lineHeight:1, fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' } as React.CSSProperties,
  kpiL:     { fontSize:'9px', letterSpacing:'0.1em', textTransform:'uppercase' as const, color:'var(--text-secondary)', marginTop:'5px' } as React.CSSProperties,
  th:       { fontSize:'9px', letterSpacing:'0.12em', textTransform:'uppercase' as const, color:'var(--text-secondary)', padding:'8px 12px', borderBottom:'1px solid var(--border-subtle)', textAlign:'left' as const, fontWeight:400 } as React.CSSProperties,
  td:       { padding:'10px 12px', borderBottom:'1px solid var(--border-subtle)', color:'var(--text-primary)', fontSize:'12px', verticalAlign:'middle' as const } as React.CSSProperties,
  tdM:      { padding:'10px 12px', borderBottom:'1px solid var(--border-subtle)', color:'var(--text-secondary)', fontSize:'12px', verticalAlign:'middle' as const } as React.CSSProperties,
  // ── ΤΟ ΔΑΧΤΥΛΟ ─────────────────────────────────────────────────────────
  // Τα τέσσερα κουμπιά της καρτέλας ενοικιαστή είναι το πυκνότερο σημείο της
  // εφαρμογής: εξήντα δύο σημεία κλήσης σε τρία αρχεία. Το ύψος τους έβγαινε
  // αποκλειστικά από το padding — 26 ώς 33 εικονοστοιχεία, δηλαδή κάτω από
  // κάθε όριο αφής, στην οθόνη που ο ιδιοκτήτης ανοίγει από το κινητό όταν
  // τον παίρνει τηλέφωνο ο ενοικιαστής.
  //
  // Η διόρθωση είναι το ίδιο μοτίβο που ήδη έλυσε 148 σημεία στο κοινό `Btn`:
  // `minHeight` από την κλίμακα. Το `T.h.*` μεγαλώνει ΜΟΝΟ σε δείκτη αφής
  // (globals.css, `@media (pointer: coarse)`), οπότε στο ποντίκι δεν αλλάζει
  // τίποτα και οι πυκνοί πίνακες μένουν πυκνοί.
  btnGold:  { display:'inline-flex', alignItems:'center', justifyContent:'center', minHeight:T.h.md, background:'var(--accent)', color:'var(--accent-text)', border:'none', borderRadius:'10px', padding:'9px 18px', fontSize:'12px', letterSpacing:'0.04em', fontFamily:T.font.sans, cursor:'pointer', fontWeight:700 } as React.CSSProperties,
  btnGhost: { display:'inline-flex', alignItems:'center', justifyContent:'center', minHeight:T.h.sm, background:'transparent', color:'var(--text-secondary)', border:'1px solid var(--border-default)', borderRadius:'10px', padding:'8px 14px', fontSize:'11px', fontFamily:T.font.sans, cursor:'pointer' } as React.CSSProperties,
  btnSm:    { display:'inline-flex', alignItems:'center', justifyContent:'center', minHeight:T.h.sm, background:'var(--bg-elevated)', color:'var(--accent)', border:'1px solid var(--border-accent)', borderRadius:'10px', padding:'6px 12px', fontSize:'10px', fontFamily:T.font.sans, cursor:'pointer', fontWeight:600 } as React.CSSProperties,
  btnDng:   { display:'inline-flex', alignItems:'center', justifyContent:'center', minHeight:T.h.sm, background:'transparent', color:'var(--negative)', border:'1px solid var(--negative-dim)', borderRadius:'10px', padding:'6px 12px', fontSize:'10px', fontFamily:T.font.sans, cursor:'pointer' } as React.CSSProperties,
};

// ═══════════════════════════════════════════════════════════════════════════
// «ΤΙ ΠΛΗΡΩΝΕΙΣ ΕΣΥ, ΤΙ Ο ΕΝΟΙΚΙΑΣΤΗΣ» — ελεύθερες γραμμές
// ═══════════════════════════════════════════════════════════════════════════

/** Παλιά μορφή της στήλης `streaming` (πριν γίνει ελεύθερες γραμμές). */
/** Παλιά μορφή της στήλης `cleaning`. */

const num = (v: unknown): number => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '')); return Number.isFinite(n) && n > 0 ? n : 0; };




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
  const events: calendar.EventDraft[] = [];
  const tasks: Record<string, unknown>[] = [];

  // ΟΙ ΚΑΤΗΓΟΡΙΕΣ ΓΡΑΦΟΝΤΑΝ ΜΕ ΟΝΟΜΑΤΑ ΠΟΥ ΤΟ ΗΜΕΡΟΛΟΓΙΟ ΔΕΝ ΞΕΡΕΙ. Εδώ
  // αποθηκευόταν 'rent_due', 'lease_end', 'deposit', 'rent_adjustment' — καμία
  // από τις επτά κατηγορίες του ημερολογίου. Η οθόνη τις μετέφραζε στην
  // ΑΝΑΓΝΩΣΗ, με πίνακα ψευδωνύμων, δηλαδή έγραφε λάθος και διάβαζε σωστά.
  // Γράφονται πλέον κανονικά· ο πίνακας ψευδωνύμων μένει για τις παλιές γραμμές.
  const ckBase = {
    property_id: propertyId, user_id: userId, status: 'pending' as const, completed: false,
    note: null as string | null, estimated_cost: 0, actual_cost: 0, sort_order: 0,
  };

  // 1) Μηνιαία λήξη πληρωμής ενοικίου (επαναλαμβανόμενο, με υπενθύμιση).
  if (t.monthly_rent && t.monthly_rent > 0) {
    events.push({
      source: key('rent_due'), category: 'financial',
      title: `Λήξη πληρωμής ενοικίου, ${name}`,
      event_date: nextRentDueISO(opts.rentDueDay ?? 1),
      amount: t.monthly_rent, recurring: true, recurring_interval: 'monthly',
      notes: 'Μηνιαία υπενθύμιση είσπραξης ενοικίου. Κατέγραψε την πληρωμή στην καρτέλα «Ενοικιαστής», στις Πληρωμές».',
    });
  }

  // 2) Λήξη μίσθωσης + ειδοποιήσεις 60/30 ημέρες πριν.
  if (t.lease_end) {
    events.push({
      source: key('lease_end'), category: 'contract',
      title: `Λήξη μίσθωσης, ${name}`, event_date: t.lease_end,
      priority: 'high',
      notes: 'Λήξη συμβολαίου μίσθωσης. Ανανέωση ή διαδικασία αποχώρησης.',
    });
    events.push({
      source: key('lease_end_60'), category: 'contract',
      title: `Λήξη μίσθωσης σε 60 ημέρες, ${name}`, event_date: shiftISO(t.lease_end, -60),
      notes: 'Ξεκίνα διαπραγμάτευση ανανέωσης μίσθωσης εγκαίρως.',
    });
    events.push({
      source: key('lease_end_30'), category: 'contract',
      title: `Λήξη μίσθωσης σε 30 ημέρες, ${name}`, event_date: shiftISO(t.lease_end, -30),
      priority: 'high',
      notes: 'Κρίσιμο: απόφαση ανανέωσης ή αποχώρησης εντός 30 ημερών.',
    });
    // 3) Επιστροφή εγγύησης στη λήξη.
    if (t.deposit_amount && t.deposit_amount > 0) {
      events.push({
        source: key('deposit_return'), category: 'financial',
        title: `Επιστροφή εγγύησης, ${name}`, event_date: t.lease_end,
        amount: t.deposit_amount,
        notes: 'Επιστροφή εγγύησης στη λήξη, μετά από έλεγχο για φθορές.',
      });
    }
  }

  // 4) Επέτειος αναπροσαρμογής ΔΤΚ (ετήσια, από lease_start).
  if (t.lease_start && t.monthly_rent && t.monthly_rent > 0) {
    events.push({
      source: key('rent_adjust'), category: 'contract',
      title: `Αναπροσαρμογή ενοικίου (ΔΤΚ), ${name}`, event_date: nextAnniversaryISO(t.lease_start),
      priority: 'low', recurring: true, recurring_interval: 'yearly',
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
    // «Best-effort» σημαίνει ότι δεν μπλοκάρει την αποθήκευση του ενοικιαστή, όχι
    // ότι η αποτυχία μένει κρυφή: ένα ημερολόγιο που δεν γέμισε φαίνεται άδειο
    // χωρίς λόγο. Η `saved` λέει το γιατί και συνεχίζει.
    //
    // ΔΕΝ ΣΒΗΝΕΙ ΚΑΙ ΔΕΝ ΞΑΝΑΓΡΑΦΕΙ: η υπενθύμιση ενοικίου κουβαλά τις ημέρες
    // που ο χρήστης έχει σημειώσει ως πληρωμένες, και θα χάνονταν.
    await saved('Οι υπενθυμίσεις του ενοικιαστή δεν μπήκαν στο ημερολόγιο',
      calendar.upsertBySource(supabase, { propertyId, userId }, prefix, events, { refresh: mode === 'save' }));

    // ── checklist_items (dedup μέσω template_id) ──
    const haveCk = await checklist.templateIds(supabase, propertyId, userId, prefix);
    const ckInsert = tasks.filter(tk => !haveCk.has(tk.template_id as string));
    if (ckInsert.length) await saved('Οι εκκρεμότητες του ενοικιαστή δεν δημιουργήθηκαν',
      checklist.addMany(supabase, ckInsert));
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
    const ev = await calendar.bySource(supabase, propertyId, `tenant:${tenantId}:rent_due`, 'id,event_date,recurrence_exdates');
    if (!ev?.event_date || !ev.id) return;
    const occ = rentDueOccurrence(ev.event_date, year, month);
    const next = applyExdate(ev.recurrence_exdates as string[] | null, occ, paid);
    if (!next) return; // δεν άλλαξε τίποτα
    await saved('Η υπενθύμιση ενοικίου δεν ενημερώθηκε', calendar.update(supabase, ev.id, { recurrence_exdates: next }));
  } catch {
    /* best-effort */
  }
}