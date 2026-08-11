'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import * as properties from '@/lib/data/properties';
import * as loanStore from '@/lib/data/loans';
// Οι ρυθμίσεις ανά ενότητα έχουν ένα σπίτι: lib/data/settings.
import * as settings from '@/lib/data/settings';
import * as stayStore from '@/lib/data/stays';
import * as billStore from '@/lib/data/bills';
import * as tenantStore from '@/lib/data/tenants';
import * as expenses from '@/lib/data/expenses'
import * as calendar from '@/lib/data/calendar'
import { TextInput } from './UIComponents';
import { T, TT, fe, feAuto, fp, fn, fixedCols, Skeleton, SkeletonKPIs, pressable } from '@/components/Theme';
import { waterMonthly } from '@/lib/energy/tariff';
import { monthAcc, monthGen } from '@/lib/core/months';
import { randomSuffix } from '@/lib/core/uploadPath';
import { notify } from '@/components/Toast';
import { saved } from '@/components/dbWrite';
import { forecastMonthEnd, categoryStatus, annualSummary, periodTrend, detectRecurring, RecurringCharge } from '@/lib/billing/budget';
import { rolloverNext, strWaterfall, investmentReturns } from '@/lib/billing/budgetPro';
import { incomeStatement } from '@/lib/accounting/statement';
import { annuityMonthly, interestForYear } from '@/lib/loans/recommend';
import { isActiveLoan } from '@/lib/loans/shape';
import { InfoDot } from './UIComponents';
import { KPI } from './LoanShared';
import BudgetImport from './BudgetImport';
import { mergeLedger, type LedgerBill, type LedgerExpense, type LedgerEntry } from '@/lib/expenses/ledger';
import { budgetBucket } from '@/lib/expenses/taxonomy';
import { subscriptionsMonthly } from '@/lib/expenses/subscriptions';
// Ο ΕΝΦΙΑ διαβάζεται από την ίδια απόφαση με την καρτέλα Υπηρεσίες.
import { enfiaInUse, estimateENFIA } from '@/lib/billing/enfia';
import { climateLevyRates, isHighSeasonMonth } from '@/lib/billing/greekTax';

// Μήνες-παράθυρα εισφοράς μέχρι την προθεσμία: 0 αν λείπει ή έχει περάσει (σύγκριση
// ΗΜΕΡΑΣ)· τουλάχιστον 1 για μελλοντική προθεσμία, ακόμη κι αργότερα μέσα στον μήνα.
const parseLocalDate = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);   // τοπική ημερομηνία (όχι UTC) — χωρίς off-by-one στα όρια
};
// Κατηγορίες που θεωρούνται «σταθερές» (πάγιοι λογαριασμοί, χρεώνονται ολόκληρο
// τον μήνα) — δεν προβάλλονται γραμμικά. Οι υπόλοιπες συσσωρεύονται μέσα στον μήνα.
const FIXED_CATS = ['electricity', 'water', 'internet', 'heating', 'insurance', 'subscriptions', 'services', 'common'];
const ymOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
// Μικρογράφημα τάσης 12 μηνών ανά κατηγορία (από το φορτωμένο ιστορικό). Το σημείο
// του επιλεγμένου μήνα τονίζεται με γαλάζιο. Κρύβεται αν δεν υπάρχει καθόλου ιστορικό.
function Sparkline({ values, activeIndex }: { values: number[]; activeIndex: number }) {
  const w = 54, h = 14, pad = 2;
  if (values.every(v => !v)) return <span style={{ width: w, flexShrink: 0 }} aria-hidden="true" />;
  const max = Math.max(1, ...values);
  const n = values.length;
  const x = (i: number) => n <= 1 ? pad : pad + (i * (w - 2 * pad)) / (n - 1);
  const y = (v: number) => h - pad - (Math.max(0, v) / max) * (h - 2 * pad);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  // Καθαρή μονόχρωμη μικρογραφία τάσης — χωρίς έγχρωμη «κουκκίδα», ώστε οι γραμμές
  // των κατηγοριών να μένουν ομοιόμορφες και διακριτικές (καμία διακοσμητική χρώση).
  void activeIndex;
  return (
    <svg width={w} height={h} style={{ display: 'block', flexShrink: 0 }} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="color-mix(in srgb, var(--text-primary) 26%, transparent)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Ράβδοι εξόδων ανά μήνα — premium, στο ΓΑΛΑΖΙΟ της παλέτας μας (accent): απαλή κάθετη
// διαβάθμιση, στρογγυλεμένη κορυφή, baseline· στο πέρασμα του κέρσορα φωτίζεται, σηκώνεται
// (3D lift + glow) και δείχνει το ποσό. Οι κενοί μήνες μένουν διακριτικά «σβηστοί».
function MonthBars({ data, activeYm }: { data: { ym: string; label: string; value: number }[]; activeYm: string }) {
  const [hi, setHi] = useState<number | null>(null);
  const max = Math.max(1, ...data.map(d => d.value));
  const H = 84;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: H + 22, borderBottom: '1px solid var(--border-subtle)' }}>
      {data.map((d, i) => {
        const h = d.value > 0 ? Math.max(4, Math.round((d.value / max) * (H - 6))) : 0;
        const active = d.ym === activeYm, on = hi === i;
        const top = on ? 100 : active ? 92 : 62;
        const bot = on ? 66 : active ? 56 : 30;
        return (
          <div key={d.ym} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)} onTouchStart={() => setHi(i)} onTouchEnd={() => setHi(null)}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 0, cursor: 'default' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: 26, height: H, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              {on && d.value > 0 && (
                <div style={{ position: 'absolute', bottom: h + 8, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-overlay)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '3px 8px', fontSize: 11, fontWeight: 700, color: 'var(--accent)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', zIndex: 3 }}>{feAuto(d.value)}</div>
              )}
              <div style={{ width: '100%', height: Math.max(h, 3), borderRadius: '6px 6px 2px 2px', background: d.value > 0 ? `linear-gradient(180deg, color-mix(in srgb, var(--accent) ${top}%, transparent), color-mix(in srgb, var(--accent) ${bot}%, transparent))` : 'color-mix(in srgb, var(--text-primary) 8%, transparent)', transition: 'height 0.5s cubic-bezier(0.22,1,0.36,1), background 0.18s ease' }} />
            </div>
            <span style={{ fontSize: 9, color: on || active ? 'var(--accent)' : 'var(--text-tertiary)', fontFamily: T.font.sans, fontWeight: on || active ? 700 : 500, transition: 'color 0.15s' }}>{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// Δαχτυλίδι (donut) κατανομής — premium, στο ΓΑΛΑΖΙΟ μας: τόξα σε αποχρώσεις accent με
// στρογγυλά άκρα και μικρά κενά, ζωντανή αντίδραση (το τόξο/υπόμνημα που δείχνει ο
// κέρσορας ανοίγει, φωτίζεται με λάμψη) και κέντρο που δείχνει κατηγορία, ποσό και %.
function Donut({ slices }: { slices: { label: string; value: number }[] }) {
  const [hi, setHi] = useState<number | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return null;
  const sorted = slices.filter(s => s.value > 0).sort((a, b) => b.value - a.value);
  const MAX = 6;
  let segs = sorted;
  if (sorted.length > MAX) {
    const head = sorted.slice(0, MAX - 1);
    const rest = sorted.slice(MAX - 1).reduce((s, x) => s + x.value, 0);
    segs = [...head, { label: 'Λοιπά', value: rest }];
  }
  const r = 56, sw = 14, C = 2 * Math.PI * r;
  const GAP = segs.length > 1 ? 6 : 0;   // κενό μεταξύ τόξων (σε μονάδες περιμέτρου)
  const shade = (i: number, on: boolean) => `color-mix(in srgb, var(--accent) ${Math.min(100, Math.max(32, 94 - i * 13) + (on ? 6 : 0))}%, transparent)`;
  const active = hi != null ? segs[hi] : null;
  // ΤΑ ΞΕΚΙΝΗΜΑΤΑ ΤΩΝ ΤΟΞΩΝ ΥΠΟΛΟΓΙΖΟΝΤΑΙ ΠΡΙΝ ΤΗΝ ΑΠΟΔΟΣΗ. Ήταν συσσωρευτής
  // `let off` που άλλαζε ΜΕΣΑ στο .map(): τιμή που γράφεται αφού έχει ξεκινήσει
  // η απόδοση, δηλαδή αν η React διακόψει και ξαναρχίσει τη λίστα, τα τόξα
  // ξεκινούν από λάθος γωνία και το δαχτυλίδι βγαίνει με κενά ή επικαλύψεις.
  const starts = segs.reduce<number[]>((acc, sgm, i) =>
    [...acc, i === 0 ? 0 : acc[i - 1] + (segs[i - 1].value / total) * C], []);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 26, flexWrap: 'wrap' }}>
      <svg width="152" height="152" viewBox="0 0 152 152" style={{ flexShrink: 0, overflow: 'visible' }}>
        {/* Κανάλι δαχτυλιδιού */}
        <circle cx="76" cy="76" r={r} fill="none" stroke="color-mix(in srgb, var(--accent) 10%, transparent)" strokeWidth={sw} />
        <g transform="rotate(-90 76 76)">
          {segs.map((s, i) => {
            const on = hi === i;
            const raw = (s.value / total) * C;
            const len = Math.max(0.5, raw - GAP);
            const el = (
              <circle key={i} cx="76" cy="76" r={r} fill="none" stroke={shade(i, on)} strokeWidth={sw} strokeLinecap="round"
                strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`} strokeDashoffset={(-starts[i]).toFixed(2)}
                onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)}
                style={{ transition: 'stroke 0.18s ease', cursor: 'default' }} />
            );
            return el;
          })}
        </g>
        <text x="76" y="70" textAnchor="middle" style={{ fontSize: 9, fill: 'var(--text-tertiary)', fontFamily: T.font.sans, letterSpacing: '0.04em', transition: 'fill 0.15s' }}>{active ? active.label.slice(0, 16).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '') : 'ΣΥΝΟΛΟ'}</text>
        <text x="76" y="87" textAnchor="middle" style={{ fontSize: 16, fontWeight: 700, fill: active ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.num, transition: 'fill 0.15s' }}>{feAuto(active ? active.value : total)}</text>
        {active && <text x="76" y="101" textAnchor="middle" style={{ fontSize: 9, fill: 'var(--text-tertiary)', fontFamily: T.font.num }}>{Math.round((active.value / total) * 100)}%</text>}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 150 }}>
        {segs.map((s, i) => {
          const on = hi === i;
          return (
            <div key={i} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)}
              style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, fontFamily: T.font.sans, padding: '4px 8px', margin: '0 -8px', borderRadius: 8, background: on ? 'var(--bg-elevated)' : 'transparent', cursor: 'default', transition: 'background 0.15s' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: shade(i, on), flexShrink: 0, transition: 'background 0.15s' }} />
              <span style={{ flex: 1, minWidth: 0, color: on ? 'var(--text-primary)' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'color 0.15s' }}>{s.label}</span>
              <span style={{ color: 'var(--text-tertiary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>{feAuto(s.value)}</span>
              <span style={{ width: 34, textAlign: 'right', color: on ? 'var(--accent)' : 'var(--text-secondary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', fontWeight: 700, transition: 'color 0.15s' }}>{Math.round((s.value / total) * 100)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Επιτόπου επεξεργασία αριθμού (κλικ στο νούμερο → το αλλάζεις) ─────────────
// Δείχνει τη διαμορφωμένη τιμή· με κλικ γίνεται πεδίο, εστιάζει και επιλέγει το
// κείμενο. Enter/έξοδος εστίασης αποθηκεύει, Esc ακυρώνει. Ίδιο idiom παντού.
function InlineNumber({ raw, display, onCommit, width = 66, align = 'right', ariaLabel, big = false }: {
  raw: string; display: string; onCommit: (v: string) => void; width?: number; align?: 'left' | 'right'; ariaLabel?: string; big?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [hov, setHov] = useState(false);
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (editing) { ref.current?.focus(); ref.current?.select(); } }, [editing]);
  if (editing) {
    return (
      <span onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        <input ref={ref} value={draft} inputMode="decimal" aria-label={ariaLabel}
          onChange={e => setDraft(e.target.value.replace(/[^\d.,]/g, ''))}
          onKeyDown={e => { if (e.key === 'Enter') { onCommit(draft.trim().replace(',', '.')); setEditing(false); } else if (e.key === 'Escape') setEditing(false); }}
          onBlur={() => { onCommit(draft.trim().replace(',', '.')); setEditing(false); }}
          style={{ width, height: big ? 30 : 22, padding: '0 6px', textAlign: align, borderRadius: 6, border: '1px solid var(--border-accent)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: big ? 18 : 12, fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', outline: 'none' }} />
      </span>
    );
  }
  return (
    <button type="button" aria-label={ariaLabel}
      onClick={e => { e.stopPropagation(); setDraft(raw ?? ''); setEditing(true); }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'text', font: 'inherit', color: hov ? 'var(--accent)' : 'inherit', borderBottom: `1px dashed ${hov ? 'var(--border-accent)' : 'transparent'}`, transition: 'color 0.15s, border-color 0.15s', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>
      {display}
    </button>
  );
}

// Επιτόπου επεξεργασία κειμένου (μετονομασία κατηγορίας).
function InlineText({ value, onCommit, ariaLabel }: { value: string; onCommit: (v: string) => void; ariaLabel?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [hov, setHov] = useState(false);
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (editing) { ref.current?.focus(); ref.current?.select(); } }, [editing]);
  if (editing) {
    return (
      <input ref={ref} value={draft} aria-label={ariaLabel} maxLength={40}
        onChange={e => setDraft(e.target.value)}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === 'Enter') { const v = draft.trim(); if (v) onCommit(v); setEditing(false); } else if (e.key === 'Escape') setEditing(false); }}
        onBlur={() => { const v = draft.trim(); if (v && v !== value) onCommit(v); setEditing(false); }}
        style={{ width: 160, height: 26, padding: '0 7px', borderRadius: 6, border: '1px solid var(--border-accent)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, fontFamily: T.font.sans, outline: 'none' }} />
    );
  }
  return (
    <button type="button" aria-label={ariaLabel}
      onClick={e => { e.stopPropagation(); setDraft(value); setEditing(true); }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'text', fontSize: 12, fontWeight: 500, fontFamily: T.font.sans, color: 'var(--text-primary)', borderBottom: `1px dashed ${hov ? 'var(--border-accent)' : 'transparent'}`, transition: 'border-color 0.15s' }}>
      {value}
    </button>
  );
}

// ── Category definitions ──────────────────────────────────────────────────────
const CATS = [
  { key: 'electricity',  label: 'Ρεύμα',              default: 80  },
  { key: 'water',        label: 'Νερό',                default: 25  },
  { key: 'internet',     label: 'Internet και τηλεφωνία',default: 35 },
  { key: 'heating',      label: 'Θέρμανση',            default: 60  },
  { key: 'insurance',    label: 'Ασφάλεια',            default: 30  },
  // ΔΙΚΟΣ ΤΟΥΣ ΣΤΟΧΟΣ, ΓΙΑΤΙ ΔΙΚΗ ΤΟΥΣ ΣΥΜΠΕΡΙΦΟΡΑ. Οι συνδρομές ήταν στον
  // κουβά της ασφάλειας: μία υπέρβαση 20 € σε streaming κρυβόταν πίσω από ένα
  // ασφάλιστρο που δεν χρεώθηκε ακόμη αυτόν τον μήνα. Και είναι το μόνο πάγιο
  // που ΜΕΓΑΛΩΝΕΙ μόνο του, μια χρέωση τη φορά, χωρίς κανείς να το αποφασίσει.
  { key: 'subscriptions',label: 'Συνδρομές',           default: 25  },
  { key: 'services',     label: 'Υπηρεσίες, ΕΝΦΙΑ',  default: 50  },
  { key: 'common',       label: 'Κοινόχρηστα',         default: 40  },
  { key: 'maintenance',  label: 'Συντήρηση',           default: 20  },
  { key: 'other',        label: 'Λοιπές δαπάνες',      default: 50  },
] as const;


// Ποιος πληρώνει μια δαπάνη που εξαιρείται από τον προϋπολογισμό.
const PAYERS = ['Οικογένεια', 'Ενοικιαστής', 'Ασφαλιστική', 'Άλλος'] as const;

// Ο διαμοιρασμός δαπανών/λογαριασμών γίνεται πλέον ΑΝΑ ΕΓΓΡΑΦΗ (πεδίο
// «Πληρώνει / Διαμοιρασμός» στη δαπάνη ή τον λογαριασμό) — ΕΝΑ μοντέλο σε όλη
// την εφαρμογή. Ο προϋπολογισμός εδώ κρατά μόνο στόχους έναντι πραγματικών.

interface MonthItem { id: string; kind: 'bill' | 'expense'; label: string; amount: number; catKey: string }
// Κανόνας εξαίρεσης ανά εγγραφή: προαιρετικός λόγος (payer/note) και προαιρετικό
// μερικό ποσό (amount). Χωρίς amount → εξαιρείται όλη η εγγραφή· με amount →
// εξαιρείται μόνο αυτό το μέρος (π.χ. το κομμάτι που πλήρωσε κάποιος άλλος).
interface ExclRule { payer?: string; note?: string; amount?: number }
// Το σχήμα μιας προσαρμοσμένης κατηγορίας ΟΠΩΣ ΑΠΟΘΗΚΕΥΕΤΑΙ σε JSON κείμενο.
// Τα πεδία είναι προαιρετικά και άγνωστου τύπου επίτηδες: έρχονται από
// `JSON.parse` παλιάς εγγραφής, όχι από τη βάση, άρα δεν εγγυάται κανείς τίποτα.
// Ήταν `any`, που σήμαινε ότι το `c.labl` (τυπογραφικό) θα περνούσε αθόρυβα.
interface CustomCatRaw { key?: unknown; label?: unknown }

interface Props { propertyId: string; userId?: string; profileType?: 'individual' | 'professional'; }

export default function BillsBudget({ propertyId, userId = '', profileType = 'individual' }: Props) {
  const isPro = profileType === 'professional';
  const supabase  = createClient();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── State ──────────────────────────────────────────────────────────────────
  const initBudgets = (): Record<string, string> => {
    const b: Record<string, string> = { total: '390' };
    CATS.forEach(c => { b[c.key] = String(c.default); });
    return b;
  };

  const [budgets,      setBudgets]      = useState<Record<string, string>>(initBudgets);
  const [actuals,      setActuals]      = useState<Record<string, number>>({});
  // Ιστορικό ανά μήνα (YYYY-MM → σύνολο) και ανά μήνα/κατηγορία, από ΚΑΤΑΓΕΓΡΑΜΜΕΝΕΣ
  // εγγραφές (λογαριασμοί + λοιπές δαπάνες) — για πρόβλεψη, ετήσια εικόνα και τάσεις.
  const [monthTotals,  setMonthTotals]  = useState<Record<string, number>>({});
  const [catMonth,     setCatMonth]     = useState<Record<string, Record<string, number>>>({});
  // Έσοδα και δεσμευμένες εκροές (λογαριασμοί, δόση δανείου).
  const [income,       setIncome]       = useState(0);
  const [incomeYtd,    setIncomeYtd]    = useState(0);
  const [loanMonthly,  setLoanMonthly]  = useState(0);
  const [rentalMode,   setRentalMode]   = useState<'long_term' | 'short_term' | ''>('');
  // Χρειάζονται για τον ΣΩΣΤΟ συντελεστή ΤΑΚΚ: το υψηλό κλιμάκιο ισχύει μόνο
  // για μονοκατοικία άνω των 80 τ.μ.
  const [propSqm,      setPropSqm]      = useState<number | null>(null);
  const [propIsHouse,  setPropIsHouse]  = useState(false);
  const [strNights,    setStrNights]    = useState(0);
  // Έξυπνες προτάσεις αποθεματικών/φόρου (ΕΝΦΙΑ, φόρος, CapEx, κενές περίοδοι),
  // υπολογισμένες με τους κανονικούς μηχανισμούς του προϋπολογισμού.
  const [recurring,    setRecurring]    = useState<RecurringCharge[]>([]);
  const [weekActuals,  setWeekActuals]  = useState<Record<string, number>>({});
  const [monthItems,   setMonthItems]   = useState<MonthItem[]>([]);
  const [catBreakdown, setCatBreakdown] = useState<Record<string, { label: string; amount: number; date: string; paid: boolean; kind: 'bill' | 'expense' }[]>>({});
  const [openCats,     setOpenCats]     = useState<Set<string>>(new Set());
  // Απόδοση επένδυσης (μόνο επαγγελματίας) και πλήθος βραχυχρόνιων ακινήτων (μόνο ιδιώτης, όριο 3+).
  const [invReturns,   setInvReturns]   = useState<{ noi: number; preTaxCashFlow: number; capRatePct: number; cashOnCashPct: number } | null>(null);
  const [strPropCount, setStrPropCount] = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [hoverCat,     setHoverCat]     = useState<string | null>(null);
  const [delCatHover,  setDelCatHover]  = useState<string | null>(null);
  const [newCatName,   setNewCatName]   = useState('');
  const [hoverRec,     setHoverRec]     = useState<string | null>(null);
  const [hoverWeek,    setHoverWeek]    = useState<string | null>(null);
  const [exclAmtDraft, setExclAmtDraft] = useState<Record<string, string>>({});  // ό,τι πληκτρολογεί ο χρήστης στο μερικό ποσό εξαίρεσης
  const [addingCat,    setAddingCat]    = useState(false);   // εμφάνιση πεδίου «νέα κατηγορία» (inline)
  // Η μία σημείωση για την αλλαγή στα σύνολα. Διαβάζεται τεμπέλικα κατά την
  // αρχικοποίηση και όχι σε effect: η πρώτη απόδοση είναι πάντα ο σκελετός
  // (loading = true), οπότε δεν υπάρχει διαφορά server και client να συμφιλιωθεί.
  const [ledgerNoteSeen, setLedgerNoteSeen] = useState(() => {
    try { return localStorage.getItem('budget_ledger_note') === '1'; } catch { return true; }
  });
  const dismissLedgerNote = () => {
    setLedgerNoteSeen(true);
    try { localStorage.setItem('budget_ledger_note', '1'); } catch { /* ignore */ }
  };
  const [showSettings, setShowSettings] = useState(false);   // εμφάνιση ρυθμίσεων προϋπολογισμού (inline)
  const [demoBusy,     setDemoBusy]     = useState(false);   // δημιουργία/αφαίρεση δείγματος δεδομένων
  // Πλοήγηση μήνα: 0 = τρέχων, −1 = προηγούμενος … έως −12 (από το φορτωμένο ιστορικό).
  const [monthOffset,  setMonthOffset]  = useState(0);
  // Ελαχιστοποίηση ενοτήτων (μνήμη ανά ακίνητο).
  const [collapsed,    setCollapsed]    = useState<Set<string>>(new Set());
  // Προεπιλογή: όλες οι ενότητες κλειστές (μαζεμένες) — ο χρήστης ανοίγει ό,τι θέλει.
  useEffect(() => {
    try {
      const s = localStorage.getItem(`budget_collapsed_${propertyId}`);
      setCollapsed(new Set(s ? JSON.parse(s) : ['annual', 'week', 'recurring', 'income', 'exclusions', 'import', 'cats']));
    } catch { setCollapsed(new Set(['annual', 'week', 'recurring', 'income', 'exclusions', 'import', 'cats'])); }
  }, [propertyId]);
  const toggleCollapse = (key: string) => setCollapsed(prev => {
    const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key);
    try { localStorage.setItem(`budget_collapsed_${propertyId}`, JSON.stringify([...n])); } catch { /* ignore */ }
    return n;
  });

  // Η αντιστοίχιση κατηγορίας σε κουβά ζει πλέον στο κοινό λεξιλόγιο
  // (lib/expenses/taxonomy). Εδώ υπήρχε δικό της λεξικό με ΜΟΝΟ αγγλικά κλειδιά,
  // ενώ ο χρήστης καταχωρούσε «Υδραυλικός» και «Ρεύμα» στα ελληνικά: κάθε
  // χειροκίνητη δαπάνη προσγειωνόταν στις «Λοιπές», η Συντήρηση έδειχνε μηδέν.

  /** Ό,τι χρειάζεται το έσοδο βραχυχρόνιας: ποσό, νύχτες, τιμή, άφιξη. */
  type StayRow = { total: number | null; nights: number | null; nightly_rate: number | null; check_in: string | null };

  const loadData = useCallback(async () => {
    if (!propertyId) return;
    try {
      const now   = new Date();
      const y     = now.getFullYear();
      const m     = String(now.getMonth() + 1).padStart(2, '0');
      const start   = `${y}-${m}-01`;
      const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
      const dateEnd = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;      // τέλος τρέχοντος μήνα
      // Ιστορικό 13 μηνών (τρέχων + 12 πίσω) για πρόβλεψη/ετήσια εικόνα/τάσεις.
      const histStart = `${ymOf(new Date(y, now.getMonth() - 12, 1))}-01`;
      // Παράθυρο ανάγνωσης λογαριασμών: έναν χρόνο πιο πίσω από το ιστορικό.
      const wideStart = `${ymOf(new Date(y, now.getMonth() - 24, 1))}-01`;
      // Αρχή τρέχουσας εβδομάδας (Δευτέρα) — για το εβδομαδιαίο εργαλείο (σωστό και στα όρια μήνα).
      const dow       = (now.getDay() + 6) % 7;   // Δευτέρα = 0
      const weekStartD = new Date(y, now.getMonth(), now.getDate() - dow);
      const weekStart  = `${weekStartD.getFullYear()}-${String(weekStartD.getMonth() + 1).padStart(2, '0')}-${String(weekStartD.getDate()).padStart(2, '0')}`;

      // ── ΜΙΑ ΑΝΑΓΝΩΣΗ, ΜΙΑ ΑΛΗΘΕΙΑ ────────────────────────────────────────
      // ΠΡΙΝ: έξι ερωτήματα (λογαριασμοί και δαπάνες, επί μήνα/ιστορικό/εβδομάδα),
      // με τις συνδεδεμένες δαπάνες κρυμμένες μέσω .is('bill_id', null) για να μη
      // διπλομετρηθούν. Δύο συνέπειες, και οι δύο λάθος:
      //   • ο λογαριασμός μετρούσε με το ποσό του, όχι με ό,τι ΟΝΤΩΣ πληρώθηκε.
      //     Διόρθωνες τη δαπάνη σε 92 ευρώ και ο προϋπολογισμός έμενε στα 80.
      //   • οι λογαριασμοί φιλτράρονταν με created_at, δηλαδή με το πότε τους
      //     ΚΑΤΑΧΩΡΗΣΕΣ. Λογαριασμός Ιανουαρίου καταχωρημένος τον Φεβρουάριο
      //     χάλαγε δύο μήνες με μία κίνηση.
      // ΤΩΡΑ: μία ανάγνωση, συγχώνευση από τον ίδιο πυρήνα που τροφοδοτεί την
      // οθόνη Δαπάνες, και τα τρία παράθυρα κόβονται από την ίδια λίστα. Ό,τι
      // δείχνουν οι Δαπάνες, αθροίζει ο Προϋπολογισμός.
      const [budgetRes, settRes, allBillsRes, allExpRes] = await Promise.all([
        settings.section(supabase, propertyId, 'budgets', userId),
        settings.sections(supabase, propertyId, ['providers','insurance','services','common'], userId),
        // Ευρύτερο παράθυρο κατά έναν χρόνο: η ημερομηνία που ΜΕΤΡΑ για έναν
        // λογαριασμό (πληρωμή ή λήξη) δεν είναι το created_at, οπότε ένας
        // λογαριασμός καταχωρημένος νωρίτερα μπορεί να ανήκει μέσα στο παράθυρο.
        // Το τελικό κόψιμο γίνεται μετά τη συγχώνευση, όπου η ημερομηνία είναι μία.
        billStore.ofProperty(supabase, propertyId, billStore.LEDGER_COLUMNS, userId, { since: wideStart }),
        expenses.ledger(supabase, propertyId, { from: histStart }),
      ]);

      // ── Έσοδα + δεσμευμένες εκροές (για το «Ασφαλές διαθέσιμο») ──
      const [propRes, loansRes, tenantsRes, staysRes] = await Promise.all([
        properties.one(supabase, propertyId, 'rental_mode,target_rent,value,year_built,enfia,purchase_price,sqm,prop_type'),
        loanStore.ofProperty(supabase, propertyId, userId),
        tenantStore.currentAll<{ monthly_rent: number | null }>(supabase, propertyId, 'monthly_rent'),
        // Καταλύματα από την αρχή του έτους: το τρέχον μήνα για έσοδα μήνα, το σύνολο YTD
        // για ετησιοποίηση (πρόβλεψη φόρου βραχυχρόνιας χωρίς εποχική στρέβλωση).
        stayStore.ofProperty<StayRow>(supabase, propertyId, 'total,nights,nightly_rate,check_in', userId, { from: `${y}-01-01`, to: dateEnd }),
      ]);
      const rMode = (propRes?.rental_mode as 'long_term' | 'short_term' | undefined) ?? '';
      setRentalMode(rMode);
      setPropSqm(Number(propRes?.sqm) || null);
      // «Μονοκατοικία» κατά την έννοια του ΤΑΚΚ: ό,τι δεν είναι διαμέρισμα σε πολυκατοικία.
      setPropIsHouse(/house|maisonette|villa|μονοκατοικ|μεζονέτ|βίλα/i.test(String(propRes?.prop_type ?? '')));
      // Οι δύο σχήματα γραμμών, όπως ακριβώς τα ζητά το ερώτημα από πάνω. Ήταν
      // `any`, οπότε ένα λάθος όνομα στήλης (`nightlyRate` αντί για
      // `nightly_rate`) θα έδινε αθόρυβα μηδέν έσοδα αντί για σφάλμα.
      const stayGross = (st: StayRow) => Number(st.total) || (Number(st.nights) || 0) * (Number(st.nightly_rate) || 0);
      const staysAll  = staysRes;
      const staysMonth = staysAll.filter(st => String(st.check_in ?? '') >= start);
      // Έσοδα μήνα: βραχυχρόνια → άθροισμα καταλυμάτων του μήνα· μακροχρόνια → ενεργό
      // ενοίκιο (ή στόχος). Ιδιοκατοίκηση/χωρίς mode → 0 (κανένα «φανταστικό» έσοδο).
      let inc = 0;
      if (rMode === 'short_term') {
        inc = staysMonth.reduce((s, st) => s + stayGross(st), 0);
        setStrNights(staysMonth.reduce((s, st) => s + (Number(st.nights) || 0), 0));
      } else if (rMode === 'long_term') {
        // ΜΟΝΟ ενεργοί ενοικιαστές (όχι παλιοί/αποχωρήσαντες) — αλλιώς διπλασιάζεται το έσοδο.
        // Ο κανόνας «ποιος μένει τώρα» δεν ξαναγράφεται εδώ: το στρώμα επιστρέφει
        // ήδη μόνο όσους δεν έχουν φύγει, με τον ίδιο ορισμό σε κάθε οθόνη.
        const rentSum = tenantsRes.reduce((s, t) => s + (Number(t.monthly_rent) || 0), 0);
        inc = rentSum > 0 ? rentSum : (Number(propRes?.target_rent) || 0);
      }
      setIncome(Math.round(inc));
      // Έσοδα από την αρχή του έτους: βραχυχρόνια → πραγματικά καταλύματα YTD· μακροχρόνια
      // → αναμενόμενο ενοίκιο × μήνες που πέρασαν (δεν καταγράφουμε εισπράξεις εδώ).
      if (rMode === 'short_term') setIncomeYtd(Math.round(staysAll.reduce((s, st) => s + stayGross(st), 0)));
      else if (rMode === 'long_term') setIncomeYtd(Math.round(inc * (now.getMonth() + 1)));
      else setIncomeYtd(0);
      // Δόση δανείου: ζωντανός υπολογισμός από ενεργά δάνεια (όχι διπλομέτρηση).
      // Τα `amount`/`rate` ΔΕΝ είναι στήλες της βάσης — υπολογίζονται από το
      // loan_amount και το rate_type/fixed_rate/euribor/spread. Η μετάφραση
      // γίνεται ΜΙΑ φορά εδώ και τη μοιράζονται και οι τρεις καταναλωτές
      // παρακάτω (δόση, τόκοι έτους, υπόλοιπο κεφαλαίου).
      const activeLoans = loansRes.filter(isActiveLoan);
      const loanM = activeLoans
        .reduce((s: number, l) => s + annuityMonthly(l.amount, l.rate, Number(l.years) || 0), 0);
      setLoanMonthly(Math.round(loanM));

      // Κλειδιά προσαρμοσμένων κατηγοριών (c_*): αν μια δαπάνη έχει αποθηκευτεί σε custom
      // κατηγορία, την προσμετράμε εκεί (αλλιώς θα «έπεφτε» στις Λοιπές δαπάνες).
      const customKeys = new Set<string>();
      const catLabels: Record<string, string> = {};
      CATS.forEach(c => { catLabels[c.key] = c.label; });
      try { const arr = JSON.parse(String((budgetRes as { __custom?: string } | null)?.__custom ?? '[]')); if (Array.isArray(arr)) (arr as CustomCatRaw[]).forEach(c => { if (c?.key) { customKeys.add(String(c.key)); if (c?.label) catLabels[String(c.key)] = String(c.label); } }); } catch { /* ignore */ }
      // Μετονομασίες (override) βασικών/custom κατηγοριών — για σωστές ετικέτες στην ανάλυση.
      try { const o = JSON.parse(String((budgetRes as { __labels?: string } | null)?.__labels ?? '{}')); if (o && typeof o === 'object') Object.entries(o).forEach(([k, v]) => { if (v) catLabels[k] = String(v); }); } catch { /* ignore */ }
      // Προσαρμοσμένη κατηγορία του χρήστη μένει ως έχει· οτιδήποτε άλλο περνά
      // από το κοινό λεξιλόγιο, ελληνικά και αγγλικά μαζί.
      const catOf = (raw: string): string => { const r = String(raw ?? ''); return customKeys.has(r) ? r : budgetBucket(r); };
      const catLabelOf = (k: string): string => catLabels[k] ?? 'Λοιπές δαπάνες';
      // Εξαιρέσεις: δαπάνες/λογαριασμοί που ΔΕΝ μετράνε (ή μετράνε μερικώς) στον προϋπολογισμό.
      // Χωρίς 'amount' → εξαιρείται ΟΛΟ το ποσό· με 'amount' → εξαιρείται μόνο αυτό το μέρος
      // (π.χ. πλήρωσε 50 € ο ενοικιαστής και 50 € εγώ → εξαιρώ 50 €, μετρούν 50 €).
      let excluded: Record<string, ExclRule> = {};
      try { const o = JSON.parse(String((budgetRes as { __excluded?: string } | null)?.__excluded ?? '{}')); if (o && typeof o === 'object') excluded = o; } catch { /* ignore */ }
      const exclAmt = (id: string | null | undefined, full: number): number => {
        const e = id != null ? excluded[String(id)] : undefined;
        if (!e) return 0;
        const a = e.amount;
        return typeof a === 'number' && isFinite(a) && a >= 0 ? Math.min(a, Math.max(0, full)) : Math.max(0, full);
      };
      // Το ποσό που ΟΝΤΩΣ μετρά στον προϋπολογισμό (ολικό μείον το εξαιρούμενο μέρος).
      const counted = (id: string | null | undefined, full: number): number => Math.max(0, (full || 0) - exclAmt(id, full || 0));

      // ── Η ΕΝΙΑΙΑ ΛΙΣΤΑ ────────────────────────────────────────────────────
      const { entries: ledger } = mergeLedger(
        allBillsRes as LedgerBill[],
        allExpRes as unknown as LedgerExpense[],
      );
      // Ταυτότητα γραμμής για τις εξαιρέσεις. Προτεραιότητα στον λογαριασμό,
      // γιατί πριν τη συγχώνευση η γραμμή του μήνα ΗΤΑΝ ο λογαριασμός: όποιος
      // είχε εξαιρέσει κάτι, το κρατά εξαιρεμένο και μετά την αλλαγή.
      const idOf = (e: LedgerEntry): string => String(e.billId ?? e.expenseId ?? '');
      // Η εξαίρεση ισχύει με όποιο από τα δύο κλειδιά κι αν γράφτηκε.
      const countedEntry = (e: LedgerEntry): number => {
        const byBill = e.billId ? counted(e.billId, e.amount) : e.amount;
        const byExp = e.expenseId ? counted(e.expenseId, e.amount) : e.amount;
        return Math.min(byBill, byExp);
      };
      // Η ομάδα «συντήρηση» της παλιάς φόρμας υπερισχύει, γιατί ο χρήστης την
      // επέλεξε ρητά· αλλιώς αποφασίζει η κατηγορία.
      const bucketOf = (e: LedgerEntry): string =>
        e.group === 'maintenance' ? 'maintenance' : catOf(e.category);

      const inWindow = ledger.filter(e => e.date >= histStart && e.date <= dateEnd);
      const monthRows = inWindow.filter(e => e.date >= start);
      const weekRows = inWindow.filter(e => e.date >= weekStart);

      // Ιστορικά σύνολα ανά μήνα και ανά μήνα/κατηγορία — καθαρά από καταγεγραμμένες
      // εγγραφές (όχι εκτιμήσεις από ρυθμίσεις), ώστε τάση/ετήσιο να είναι έντιμα.
      const mTotals: Record<string, number> = {};
      const cMonth: Record<string, Record<string, number>> = {};
      inWindow.forEach(e => {
        const amt = countedEntry(e);
        if (amt <= 0) return;
        const ym = e.date.slice(0, 7);
        if (!ym) return;
        const key = bucketOf(e);
        mTotals[ym] = (mTotals[ym] ?? 0) + amt;
        (cMonth[ym] ??= {})[key] = (cMonth[ym][key] ?? 0) + amt;
      });
      setMonthTotals(mTotals);
      setCatMonth(cMonth);

      // ── Επαναλαμβανόμενες χρεώσεις / συνδρομές: ανάλυση 12μηνου ιστορικού ──
      // (καθαρός πυρήνας detectRecurring) — αναδεικνύει «κρυφές» συνδρομές και το
      // ετήσιο βάρος τους. Πλέον βλέπει και τους λογαριασμούς, όχι μόνο τις
      // χειροκίνητες δαπάνες: εκεί κρύβονται οι πραγματικές πάγιες χρεώσεις.
      setRecurring(detectRecurring(
        inWindow
          .filter(e => e.title.trim().length >= 3)
          .map(e => ({ date: e.date, amount: e.amount, description: e.title, category: bucketOf(e) })),
      ));

      // ── Εβδομαδιαίο εργαλείο: δαπάνες τρέχουσας εβδομάδας ανά κατηγορία ──
      const wk: Record<string, number> = {};
      weekRows.forEach(e => {
        const amt = countedEntry(e);
        if (amt <= 0) return;
        const k = bucketOf(e);
        wk[k] = (wk[k] ?? 0) + amt;
      });
      setWeekActuals(wk);

      if (budgetRes) {
        const saved = budgetRes;
        setBudgets(prev => { const n = { ...prev }; Object.entries(saved).forEach(([k, v]) => { if (k !== 'participants') n[k] = String(v); }); return n; });
      }

      const billActuals: Record<string, number> = {};
      // Στοιχεία του μήνα (λογαριασμοί + λοιπές δαπάνες) με id/ποσό/κατηγορία, για τη διαχείριση εξαιρέσεων.
      const items: MonthItem[] = [];
      // Ανάλυση ανά κατηγορία: οι επιμέρους πληρωμές (πάροχος/περιγραφή, ποσό, ημερομηνία).
      const bd: Record<string, { label: string; amount: number; date: string; paid: boolean; kind: 'bill' | 'expense' }[]> = {};
      // Οι γραμμές του μήνα, λογαριασμοί και δαπάνες μαζί. Άγνωστες κατηγορίες →
      // «Λοιπές δαπάνες»· δεν χάνεται τίποτα από το σύνολο. Εξαιρέσεις δεν μετρώνται.
      monthRows.forEach(e => {
        const key = bucketOf(e);
        const label = catLabelOf(key);
        const id = idOf(e);
        if (id) items.push({ id, kind: e.billId ? 'bill' : 'expense', label: e.title || label, amount: e.amount, catKey: key });
        const amt = countedEntry(e);
        if (amt <= 0) return;
        billActuals[key] = (billActuals[key] ?? 0) + amt;
        (bd[key] ??= []).push({ label: e.title || label, amount: amt, date: e.date, paid: e.paid, kind: e.billId ? 'bill' : 'expense' });
      });

      // Κατηγορίες με ΚΑΤΑΓΕΓΡΑΜΜΕΝΗ εγγραφή τον μήνα (ανεξάρτητα από εξαίρεση/ποσό):
      // αν ο χρήστης κατέγραψε π.χ. τον λογαριασμό Internet και μετά τον εξαίρεσε, ΔΕΝ
      // θέλει την εκτίμηση του παρόχου να τον ξαναβάζει — γι' αυτό ελέγχουμε «καταγράφηκε;»
      // και όχι το (μηδενισμένο από την εξαίρεση) billActuals.
      const recorded = new Set<string>(monthRows.map(bucketOf));

      const getSett = (sec: settings.Section) => settRes[sec];
      const prov = getSett('providers');
      if (prov) {
        if (!recorded.has('internet')) billActuals.internet = (parseFloat(String(prov.internetPrice)) || 0) + (prov.hasTV ? parseFloat(String(prov.tvPrice)) || 0 : 0);
        if (!recorded.has('water'))    billActuals.water    = waterMonthly(prov);
        if (!recorded.has('heating'))  billActuals.heating  = parseFloat(String(prov.heatingMonthly)) || 0;
      }
      const svc = getSett('services');
      if (svc && !recorded.has('services')) {
        // ΙΔΙΟ ΝΟΥΜΕΡΟ ΜΕ ΤΗΝ ΚΑΡΤΕΛΑ ΥΠΗΡΕΣΙΕΣ.
        //
        // Εδώ διαβαζόταν ΜΟΝΟ το χειροκίνητο ποσό. Όποιος χρησιμοποίησε τον
        // υπολογιστή ΕΝΦΙΑ (ζώνη, όροφος, παλαιότητα) και δεν πληκτρολόγησε
        // ξεχωριστά το ετήσιο, έβλεπε δεκάδες ευρώ τον μήνα στις Υπηρεσίες και
        // 0 € εδώ — για το ίδιο ακίνητο, την ίδια στιγμή. Ο κανόνας «το δηλωμένο
        // νικά την εκτίμηση» ζει τώρα σε ένα σημείο, στο lib/billing/enfia.ts.
        const enfia = enfiaInUse(
          svc.enfiaAnnual, svc.enfiaMonthly,
          estimateENFIA({
            sqm: parseFloat(String(svc.enfiaSqm)) || 0,
            zone: String(svc.enfiaZone || ''),
            floor: String(svc.enfiaFloor || 'second'),
            age: String(svc.enfiaAge || ''),
            ownership: parseFloat(String(svc.enfiaOwnership)) || 100,
            totalValue: parseFloat(String(svc.enfiaTotalVal)) || 0,
            propertyValue: parseFloat(String(svc.enfiaPropVal)) || 0,
            reductions: Array.isArray(svc.enfiaReductions) ? svc.enfiaReductions as string[] : [],
          })?.annual,
        ).monthly;
        const hist  = Array.isArray(svc.dimotikaHistory) ? svc.dimotikaHistory as string[] : [];
        const valid = hist.filter(v => parseFloat(v) > 0);
        billActuals.services = enfia + (valid.length ? valid.reduce((s, v) => s + parseFloat(v), 0) / valid.length : 0);
      }
      const ins = getSett('insurance');
      if (ins && !recorded.has('insurance')) billActuals.insurance = parseFloat(String(ins.insCustomPrice)) || 0;
      // ΟΙ ΣΥΝΔΡΟΜΕΣ ΔΕΝ ΜΕΤΡΙΟΝΤΑΝ ΠΟΥΘΕΝΑ. Ο χρήστης δήλωνε δεκαπέντε συνδρομές
      // στην ίδια ενότητα ρυθμίσεων, η καρτέλα έγραφε σωστά το σύνολό τους, και ο
      // Προϋπολογισμός έδειχνε μηδέν: διαβαζόταν ΜΟΝΟ το `insCustomPrice`, δηλαδή
      // το ασφάλιστρο. Κόστος που καταγράφεται και δεν αθροίζεται είναι χειρότερο
      // από κόστος που δεν καταγράφηκε, γιατί ο χρήστης νομίζει ότι το βλέπει.
      if (ins && !recorded.has('subscriptions')) billActuals.subscriptions = subscriptionsMonthly(ins);

      Object.values(bd).forEach(list => list.sort((a, b) => (a.date < b.date ? 1 : -1)));
      setActuals(billActuals);
      setMonthItems(items.sort((a, b) => b.amount - a.amount));
      setCatBreakdown(bd);

      // ── Έξυπνες προτάσεις αποθεματικών/φόρου (κανονικοί μηχανισμοί, χωρίς απόκλιση) ──
      // Πρόβλεψη φόρου: ετησιοποιημένα μεικτά έσοδα → statement.ts → taxProvision.
      const monthsElapsed = now.getMonth() + 1;
      const annualGross = rMode === 'short_term'
        ? (monthsElapsed > 0 ? Math.round(staysAll.reduce((s, st) => s + stayGross(st), 0) / monthsElapsed * 12) : 0)
        : rMode === 'long_term' ? Math.round(inc * 12) : 0;
      // Λειτουργικά έξοδα ετησιοποιημένα από ΚΑΤΑΓΕΓΡΑΜΜΕΝΟ YTD (ίδια βάση με τα έσοδα)
      // — όχι ένας «μονός» μήνας × 12 που θα στρέβλωνε τον φόρο επιχείρησης από μια αιχμή.
      const yStr2 = String(y) + '-';
      const ytdOpexRec = Object.entries(mTotals).filter(([ym]) => ym.startsWith(yStr2)).reduce((s, [, v]) => s + v, 0);
      const annualOpex = monthsElapsed > 0 && ytdOpexRec > 0
        ? Math.round(ytdOpexRec / monthsElapsed * 12)
        : Math.round(Object.values(billActuals).reduce((s, v) => s + v, 0) * 12);
      // Τόκοι δανείου έτους 1 (εκπίπτουν για επιχείρηση) — από τα ενεργά δάνεια.
      const loanInterestAnnual = activeLoans
        .reduce((s: number, l) => s + interestForYear(l.amount, l.rate, Number(l.years) || 0, 1), 0);
      const regime: 'individual_longterm' | 'individual_shortterm' | 'business' =
        isPro ? 'business' : rMode === 'short_term' ? 'individual_shortterm' : 'individual_longterm';
      let taxTargetAnnual = 0;
      if (annualGross > 0) {
        const stmt = incomeStatement({
          regime, grossIncome: annualGross,
          otherCashExpenses: annualOpex,
          ...(isPro ? { itemizedExpenses: annualOpex, loanInterest: Math.round(loanInterestAnnual) } : {}),
          loanPrincipal: Math.round(loanM * 12),
        });
        // Ιδιώτης: φόρος εισοδήματος. Επιχείρηση: φόρος + προκαταβολή (πραγματική ταμειακή
        // ανάγκη 1ου έτους) — ώστε το αποθεματικό να μην υπολείπεται.
        taxTargetAnnual = Math.round(stmt.incomeTax) + (isPro ? Math.round(stmt.advanceTax) : 0);
      }
      const propValue = Number(propRes?.value) || 0;

      // ── Απόδοση επένδυσης (μόνο επαγγελματίας) — NOI/cap rate/cash-on-cash από τον πυρήνα ──
      if (isPro && annualGross > 0 && (propValue > 0 || (Number(propRes?.purchase_price) || 0) > 0)) {
        const purchase = Number(propRes?.purchase_price) || propValue;
        const loanBalance = activeLoans.reduce((s: number, l) => s + l.amount, 0);
        const equity = Math.max(0, purchase - loanBalance);
        setInvReturns(investmentReturns({ annualIncome: annualGross, annualOpEx: annualOpex, annualLoanPayment: Math.round(loanM * 12), purchasePrice: purchase, equityInvested: equity }));
      } else {
        setInvReturns(null);
      }
      // ── Όριο 3+ βραχυχρόνιων (μόνο ιδιώτης) — προειδοποίηση επιχειρηματικής δραστηριότητας ──
      if (!isPro && userId) {
        setStrPropCount(await properties.countShortTerm(supabase, userId));
      } else {
        setStrPropCount(0);
      }
    } catch (_) {}
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, isPro, userId]);

  useEffect(() => {
    if (!propertyId) return;
    let mounted = true;
    loadData();
    const ch = supabase
      .channel(`budget_${propertyId}`)
      .on('postgres_changes' as const, { event: '*', schema: 'public', table: 'bills', filter: `property_id=eq.${propertyId}` }, () => { if (mounted) loadData(); })
      .on('postgres_changes' as const, { event: '*', schema: 'public', table: 'bills_settings', filter: `property_id=eq.${propertyId}` }, () => { if (mounted) loadData(); })
      .on('postgres_changes' as const, { event: '*', schema: 'public', table: 'expenses', filter: `property_id=eq.${propertyId}` }, () => { if (mounted) loadData(); })
      // Η κατάσταση `rtOk` κατέγραφε αν το κανάλι πραγματικού χρόνου συνδέθηκε,
      // αλλά καμία γραμμή σε ολόκληρο το repo δεν τη διάβαζε (0 αναγνώσεις σε
      // 1.755 γραμμές). Πλήρωνε ένα setState — άρα μία περιττή απόδοση όλου του
      // δέντρου του Προϋπολογισμού — σε κάθε αλλαγή κατάστασης του καναλιού, και
      // το κανάλι αλλάζει κατάσταση σε κάθε επανασύνδεση δικτύου. Καμία ένδειξη
      // στην οθόνη δεν άλλαζε. Διαγράφηκε αντί να κρυφτεί.
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [propertyId, loadData]);

  const saveBudgets = useCallback((data: Record<string, string>) => {
    if (!propertyId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      await saved('Οι στόχοι προϋπολογισμού δεν αποθηκεύτηκαν',
        settings.put(supabase, propertyId, userId, 'budgets', data));
      setSaving(false);
    }, 800);
  }, [propertyId, userId]);

  // ΔΥΟ ΑΛΛΑΓΕΣ ΣΤΟΝ ΙΔΙΟ ΚΥΚΛΟ ΕΧΑΝΑΝ Η ΜΙΑ ΤΗΝ ΑΛΛΗ. Και οι δύο συναρτήσεις
  // έγραφαν `{ ...budgets, … }` διαβάζοντας το `budgets` από το κλείσιμο της
  // απόδοσης. Δύο στόχοι που ευθυγραμμίζονται μαζί —ακριβώς ό,τι κάνει η
  // πρόταση «να τους ευθυγραμμίσω;»— κρατούσαν μόνο τον δεύτερο: ο πρώτος
  // γραφόταν πάνω σε παλιό στιγμιότυπο και εξαφανιζόταν χωρίς μήνυμα.
  //
  // Με τον ενημερωτή, κάθε αλλαγή ξεκινά από την ΤΕΛΕΥΤΑΙΑ κατάσταση. Η
  // αποθήκευση είναι ήδη με καθυστέρηση 800ms και ακυρώνει την προηγούμενη,
  // οπότε δύο κλήσεις στον ίδιο κύκλο καταλήγουν σε μία εγγραφή.
  const updateBudget = useCallback((key: string, val: string) => {
    setBudgets(prev => { const next = { ...prev, [key]: val }; saveBudgets(next); return next });
  }, [saveBudgets]);

  // ── Derived numbers ────────────────────────────────────────────────────────
  // Τιμή στόχου με σεβασμό στο ρητό 0 (μηδενικός στόχος ≠ «χωρίς στόχο») — μόνο
  // κενό/άκυρο πέφτει στην προεπιλογή.
  const budgetVal = (raw: string | undefined, def: number) => {
    const p = parseFloat(raw ?? '');
    return raw != null && raw.trim() !== '' && !isNaN(p) ? p : def;
  };
  // ── Προσαρμόσιμες κατηγορίες: ο χρήστης κρύβει όσες δεν χρειάζεται και προσθέτει δικές του.
  const parseArr = (s?: string): unknown[] => { try { const a: unknown = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
  const hiddenKeys: string[] = parseArr(budgets.__hidden).map(String);
  // Μετονομασίες βασικών κατηγοριών (οι custom κρατούν το όνομά τους στο __custom).
  const labelOverrides: Record<string, string> = (() => { try { const o = JSON.parse(budgets.__labels || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } })();
  const customCats: { key: string; label: string; default: number }[] = (parseArr(budgets.__custom) as CustomCatRaw[])
    .filter(c => !!c && !!c.key && !!c.label).map(c => ({ key: String(c.key), label: labelOverrides[String(c.key)] ?? String(c.label), default: 0 }));
  const activeCats: { key: string; label: string; default: number }[] = [
    ...CATS.filter(c => !hiddenKeys.includes(c.key)).map(c => ({ key: c.key as string, label: labelOverrides[c.key] ?? (c.label as string), default: c.default as number })),
    ...customCats,
  ];
  const hiddenBaseCats = CATS.filter(c => hiddenKeys.includes(c.key));
  const catDefault    = (key: string) => activeCats.find(c => c.key === key)?.default ?? 0;
  const catBudget     = (key: string) => budgetVal(budgets[key], catDefault(key));
  const masterBudget  = budgetVal(budgets.total, activeCats.reduce((s, c) => s + c.default, 0));
  // Υπερβάσεις ΤΡΕΧΟΝΤΟΣ μήνα (για τις ειδοποιήσεις email) — η προβολή/αλλαγή μήνα
  // χρησιμοποιεί ξεχωριστό displayOver, ώστε οι ειδοποιήσεις να μένουν στον τρέχοντα μήνα.
  const overBudget    = activeCats.filter(c => (actuals[c.key] || 0) > catBudget(c.key));

  // Προσθήκη/απόκρυψη/επαναφορά κατηγορίας (αποθηκεύεται στις ρυθμίσεις budgets).
  const persistCats = (patch: Record<string, string>) => {
    setBudgets(prev => { const next = { ...prev, ...patch }; saveBudgets(next); return next });
  };
  // Το toast «Αναίρεση» πέρασε στον κοινό host: το τοπικό ζούσε σε z-index 60, δηλαδή
  // ΚΑΤΩ από κάθε παράθυρο και sticky header, οπότε η αναίρεση συχνά δεν πατιόταν.
  // Η διάρκεια δηλώνεται ρητά 6000ms — η προεπιλογή (3200ms) είναι πολύ σύντομη για
  // να προλάβει ο χρήστης να αναιρέσει μια διαγραφή κατηγορίας ή μια εξαίρεση.
  const UNDO_MS = 6000;
  const addCategory = (label: string) => {
    const name = label.trim().slice(0, 40); if (!name) return;
    // Κανένα διπλότυπο: αν υπάρχει ήδη ενεργή κατηγορία με το ίδιο όνομα, επανάφερε/άφησέ την.
    const norm = (s: string) => s.trim().toLowerCase();
    if (activeCats.some(c => norm(c.label) === norm(name))) return;
    // Αν ταιριάζει με κρυμμένη βασική κατηγορία, απλώς επανάφερέ την (αντί για διπλότυπη custom).
    const hiddenMatch = hiddenBaseCats.find(c => norm(c.label) === norm(name));
    if (hiddenMatch) { restoreCategory(hiddenMatch.key); return; }
    // Ήταν `Date.now().toString(36)`: δύο κατηγορίες που προστίθενται μέσα στο
    // ίδιο χιλιοστό του δευτερολέπτου έπαιρναν το ΙΔΙΟ κλειδί, και η δεύτερη
    // αντικαθιστούσε την πρώτη. Και ήταν ακάθαρτη κλήση σε σώμα συστατικού.
    const key = `c_${randomSuffix(8)}`;
    persistCats({ __custom: JSON.stringify([...customCats.map(c => ({ key: c.key, label: c.label })), { key, label: name }]), [key]: '0' });
  };
  const removeCategory = (key: string) => {
    const label = activeCats.find(c => c.key === key)?.label ?? 'Κατηγορία';
    const snapHidden = budgets.__hidden, snapCustom = budgets.__custom;   // στιγμιότυπο για αναίρεση
    if (customCats.some(c => c.key === key)) persistCats({ __custom: JSON.stringify(customCats.filter(c => c.key !== key).map(c => ({ key: c.key, label: c.label }))) });
    else persistCats({ __hidden: JSON.stringify([...hiddenKeys, key]) });
    notify(`Η κατηγορία «${label}» αφαιρέθηκε`, { duration: UNDO_MS, action: { label: 'Αναίρεση', onClick: () => persistCats({ __hidden: snapHidden ?? '[]', __custom: snapCustom ?? '[]' }) } });
  };
  const restoreCategory = (key: string) => persistCats({ __hidden: JSON.stringify(hiddenKeys.filter(k => k !== key)) });

  // ── «Δείξε μου»: δείγμα μήνα ώστε ένας άδειος προϋπολογισμός να ζωντανέψει σε δευτερόλεπτα ──
  // Καταχωρεί ρεαλιστικές δείγμα-δαπάνες του τρέχοντος μήνα (με σωστές κατηγορίες) και κρατά
  // τα id τους στο __demo, ώστε να αφαιρούνται με ένα άγγιγμα. Σαφώς επισημασμένο ως δείγμα.
  const demoIds: string[] = (() => { try { const a = JSON.parse(budgets.__demo || '[]'); return Array.isArray(a) ? a.map(String) : []; } catch { return []; } })();
  const seedDemo = async () => {
    if (!propertyId || demoBusy) return;
    setDemoBusy(true);
    try {
      const now = new Date(), y = now.getFullYear(), mo = now.getMonth();
      const p2 = (n: number) => String(n).padStart(2, '0');
      const dim = new Date(y, mo + 1, 0).getDate();
      const day = (d: number) => `${y}-${p2(mo + 1)}-${p2(Math.min(d, now.getDate(), dim))}`;
      const samples = [
        { d: 8,  desc: 'ΔΕΗ',                 amount: 78.40, category: 'electricity', grp: 'other' },
        { d: 12, desc: 'ΕΥΔΑΠ',               amount: 21.30, category: 'water',       grp: 'other' },
        { d: 5,  desc: 'Vodafone',            amount: 34.90, category: 'internet',    grp: 'other' },
        { d: 15, desc: 'Φυσικό αέριο',        amount: 46.00, category: 'heating',     grp: 'other' },
        { d: 10, desc: 'Κοινόχρηστα',         amount: 40.00, category: 'common',      grp: 'other' },
        { d: 3,  desc: 'Ασφάλεια κατοικίας',  amount: 18.50, category: 'insurance',   grp: 'other' },
        { d: 18, desc: 'Υδραυλικός',          amount: 60.00, category: 'maintenance', grp: 'maintenance' },
        { d: 20, desc: 'Είδη καθαριότητας',   amount: 25.00, category: 'other',       grp: 'other' },
      ];
      const payload = samples.map(s => ({ property_id: propertyId, user_id: userId || null, amount: s.amount, date: day(s.d), description: s.desc, category: s.category, expense_group: s.grp, bill_id: null }));
      const { data, error } = await expenses.insertReturning(supabase, payload);
      if (!error && data) persistCats({ __demo: JSON.stringify((data as { id: string }[]).map(r => String(r.id))) });
      await loadData();
    } finally { setDemoBusy(false); }
  };
  const removeDemo = async () => {
    if (!propertyId || demoBusy || demoIds.length === 0) return;
    setDemoBusy(true);
    const gone = await saved('Τα δείγματα δεν διαγράφηκαν', expenses.remove(supabase, demoIds));
    if (gone) { persistCats({ __demo: '[]' }); await loadData(); }
    setDemoBusy(false);
  };

  // Μετονομασία κατηγορίας: custom → ενημέρωση __custom· βασική → override στο __labels.
  const renameCategory = (key: string, label: string) => {
    const name = label.trim().slice(0, 40); if (!name) return;
    if (customCats.some(c => c.key === key)) persistCats({ __custom: JSON.stringify(customCats.map(c => c.key === key ? { key: c.key, label: name } : { key: c.key, label: c.label })) });
    else persistCats({ __labels: JSON.stringify({ ...labelOverrides, [key]: name }) });
  };

  // ── Εξαιρέσεις: όσα δεν θέλεις να μετρούν (ολικά ή μερικά) στα στατιστικά/προϋπολογισμό ──
  const excludedMap: Record<string, ExclRule> = (() => { try { const o = JSON.parse(budgets.__excluded || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } })();
  const excludedCount = Object.keys(excludedMap).length;
  const excludeItem = (id: string) => persistCats({ __excluded: JSON.stringify({ ...excludedMap, [id]: excludedMap[id] || {} }) });
  const unexcludeItem = (id: string) => { const n = { ...excludedMap }; delete n[id]; persistCats({ __excluded: JSON.stringify(n) }); };
  // Ενημέρωση ενός πεδίου του κανόνα (λόγος/σημείωση/μερικό ποσό)· κενά πεδία καθαρίζονται
  // ώστε το αποθηκευμένο JSON να μένει λιτό.
  const patchExcl = (id: string, patch: ExclRule) => {
    const next: ExclRule = { ...(excludedMap[id] || {}), ...patch };
    if (!next.payer) delete next.payer;
    if (!next.note || !next.note.trim()) delete next.note;
    if (next.amount == null || !(next.amount > 0)) delete next.amount;
    persistCats({ __excluded: JSON.stringify({ ...excludedMap, [id]: next }) });
  };
  // Εξαιρούμενο/μετρούμενο μέρος μιας εγγραφής (για ζωντανή εμφάνιση στη λίστα εξαιρέσεων).
  const exclAmountOf = (id: string, full: number): number => {
    const e = excludedMap[id]; if (!e) return 0;
    const a = e.amount;
    return typeof a === 'number' && isFinite(a) && a >= 0 ? Math.min(a, Math.max(0, full)) : Math.max(0, full);
  };

  // ── Πρόβλεψη τέλους μήνα, ετήσια εικόνα, τάση (καθαρά, από τον πυρήνα) ─────────
  const _now         = new Date();
  const _day         = _now.getDate();
  const _daysInMonth = new Date(_now.getFullYear(), _now.getMonth() + 1, 0).getDate();
  const _curYm       = ymOf(_now);
  const _priorYms    = [1, 2, 3].map(k => ymOf(new Date(_now.getFullYear(), _now.getMonth() - k, 1)));
  // Πρόβλεψη ανά κατηγορία: σταθερές ως έχουν, μεταβλητές με γραμμική προβολή.
  const catForecast  = (key: string) =>
    FIXED_CATS.includes(key) ? (actuals[key] || 0) : forecastMonthEnd(0, actuals[key] || 0, _day, _daysInMonth);
  const fixedToDate    = FIXED_CATS.reduce((s, k) => s + (actuals[k] || 0), 0);
  const variableToDate = (actuals.maintenance || 0) + (actuals.other || 0);
  const forecastTotal  = forecastMonthEnd(fixedToDate, variableToDate, _day, _daysInMonth);
  // Κατηγορίες που, με τον τρέχοντα ρυθμό, θα ξεπεράσουν τον στόχο (χωρίς να είναι ήδη).
  const projectedOver  = activeCats.filter(c => categoryStatus(catBudget(c.key), actuals[c.key] || 0, catForecast(c.key)) === 'projected_over');

  // Ετήσια: πραγματικά YTD από καταγεγραμμένες εγγραφές (bills + λοιπές δαπάνες).
  const _yStr        = String(_now.getFullYear()) + '-';
  const ytdActual    = Object.entries(monthTotals).filter(([ym]) => ym.startsWith(_yStr)).reduce((s, [, v]) => s + v, 0);
  const annual       = annualSummary(masterBudget, ytdActual, _now.getMonth() + 1);
  // Τάση μήνα: τρέχον καταγεγραμμένο σύνολο έναντι μέσου όρου 3 προηγούμενων.
  const monthTrend   = periodTrend(monthTotals[_curYm] || 0, _priorYms.map(ym => monthTotals[ym] || 0));
  // Τάση ανά κατηγορία: ΚΑΤΑΓΕΓΡΑΜΜΕΝΟ τρέχον (όχι εκτιμήσεις παρόχων) έναντι
  // καταγεγραμμένου ιστορικού — ίδια βάση με τη μηνιαία τάση, ώστε να μη βγαίνει
  // ψεύτικο βελάκι από εκτίμηση σε πάγια κατηγορία που δεν έχει χρεωθεί ακόμη.
  const catTrend     = (key: string) => periodTrend(catMonth[_curYm]?.[key] || 0, _priorYms.map(ym => catMonth[ym]?.[key] || 0));
  // Σειρά 12 μηνών (παλαιότερος → τρέχων) ανά κατηγορία, για το μικρογράφημα τάσης.
  const _sparkYms    = Array.from({ length: 12 }, (_, i) => ymOf(new Date(_now.getFullYear(), _now.getMonth() - (11 - i), 1)));
  const catSpark     = (key: string) => _sparkYms.map(ym => catMonth[ym]?.[key] || 0);

  // ── Ετήσιο εργαλείο: ράβδοι ανά μήνα (ημερολογιακό έτος) + κατανομή ανά κατηγορία (YTD) ──
  const _curYear   = _now.getFullYear();
  const _yPrefix   = `${_curYear}-`;
  const yearBars   = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(_curYear, i, 1);
    return { ym: ymOf(d), label: d.toLocaleDateString('el-GR', { month: 'short' }).replace('.', ''), value: monthTotals[ymOf(d)] || 0 };
  });
  const catYtd     = activeCats
    .map(c => ({ label: c.label, value: Object.entries(catMonth).filter(([ym]) => ym.startsWith(_yPrefix)).reduce((s, [, m]) => s + (m[c.key] || 0), 0) }))
    .filter(x => x.value > 0);

  // ── Εβδομαδιαίο εργαλείο: δαπάνες αυτής της εβδομάδας ανά κατηγορία ──
  const weekCats   = activeCats.map(c => ({ label: c.label, value: weekActuals[c.key] || 0 })).filter(x => x.value > 0).sort((a, b) => b.value - a.value);
  const weekTotalV = weekCats.reduce((s, x) => s + x.value, 0);
  const weekMax    = Math.max(1, ...weekCats.map(c => c.value));

  // ── Rollover: αδιάθετο/υπέρβαση προηγούμενου μήνα μεταφέρεται στον τρέχοντα ──
  // Μόνο όταν υπάρχει καταγεγραμμένη δραστηριότητα τον προηγ. μήνα (αλλιώς «κενός»
  // μήνας θα έδειχνε ολόκληρο τον στόχο ως μεταφορά — παραπλανητικό).
  // Το rollover είναι ΕΠΙΛΟΓΗ του χρήστη (όχι δεδομένο) — κάποιοι θέλουν κάθε μήνα
  // «καθαρό» μηδενισμό, άλλοι σωρευτική μεταφορά. Ενεργοποιείται στους Στόχους.
  const rolloverOn    = budgets.rollover === 'true';
  const _prevYm       = _priorYms[0];
  const hasPrevMonth  = _prevYm in monthTotals;
  const carryIn       = hasPrevMonth ? rolloverNext(masterBudget, monthTotals[_prevYm] || 0).carryOut : 0;
  // «Πραγματικά διαθέσιμα» σε ΚΑΤΑΓΕΓΡΑΜΜΕΝΗ βάση και για τους δύο μήνες (η μεταφορά
  // υπολογίζεται από καταγεγραμμένα σύνολα) — αποφεύγει ανάμειξη με εκτιμήσεις παρόχων.
  const adjAvailable  = masterBudget + carryIn - (monthTotals[_curYm] || 0);
  // Η ΓΕΝΙΚΗ ΤΟΥ ΜΗΝΑ ΕΡΧΕΤΑΙ ΑΠΡΟΣΚΛΗΤΗ ΑΠΟ ΤΟΝ ΜΟΡΦΟΠΟΙΗΤΗ. Το
  // `toLocaleDateString('el-GR', { month: 'long' })` επιστρέφει «Ιουλίου», που
  // είναι σωστό σε ημερομηνία («1 Ιουλίου») και λάθος μόνο του: «Μεταφορά από
  // Ιουλίου». Το lib/core/months.ts κρατά και τις τρεις πτώσεις γι' αυτόν
  // ακριβώς τον λόγο.
  const _prevLabel    = monthAcc(new Date(_now.getFullYear(), _now.getMonth() - 1, 1).getMonth());

  // ── Επιλεγμένος μήνας προβολής (πλοήγηση) ────────────────────────────────────
  // Τρέχων μήνας: ζωντανά actuals (με εκτιμήσεις + πρόβλεψη). Παλαιότερος: ΚΑΤΑΓΕΓΡΑΜΜΕΝΑ
  // σύνολα ανά κατηγορία από το ήδη φορτωμένο 13μηνο ιστορικό — μηδέν νέα ερωτήματα.
  const isCurMonth      = monthOffset === 0;
  const viewDate        = new Date(_now.getFullYear(), _now.getMonth() + monthOffset, 1);
  const viewYm          = ymOf(viewDate);
  const viewActuals     = isCurMonth ? actuals : (catMonth[viewYm] || {});
  const viewActualTotal = activeCats.reduce((s, c) => s + (viewActuals[c.key] || 0), 0);
  const viewMonthLabel  = viewDate.toLocaleDateString('el-GR', { month: 'long', year: 'numeric' });
  const displayOver     = activeCats.filter(c => (viewActuals[c.key] || 0) > catBudget(c.key));
  const canGoNewer      = monthOffset < 0;
  const canGoOlder      = monthOffset > -12;

  // ── «Ασφαλές διαθέσιμο» (Monzo Left to Spend / owner draw) ────────────────────
  // Δεσμευμένοι λογαριασμοί = ΠΡΑΓΜΑΤΙΚΟΙ πάγιοι λογαριασμοί του μήνα (καταγεγραμμένοι
  // + εκτιμήσεις παρόχων), όχι απλώς οι προεπιλεγμένοι στόχοι — αλλιώς εμφανίζεται
  // «φανταστικό» κόστος σε άδειο ακίνητο. Εκροές = λογαριασμοί + δόση δανείου.
  const committedBills = fixedToDate;
  const monthlyCost    = committedBills + loanMonthly;
  const hasIncome      = income > 0;
  const isShortfall    = hasIncome && monthlyCost > income;

  // ── Έξυπνες παρατηρήσεις: 2–3 προτάσεις που «μιλούν» πάνω από τα γραφήματα ──
  // Καθαρά από τα δεδομένα, με προτεραιότητα: υπέρβαση → τάση → πρόβλεψη → μεγαλύτερη
  // δαπάνη → διαθέσιμο. Ουδέτερο ύφος, σωστά ελληνικά, χωρίς διακοσμητικό χρώμα.
  const insights: string[] = (() => {
    if (!isCurMonth) return [];
    const out: string[] = [];
    const totalActual = activeCats.reduce((s, c) => s + (actuals[c.key] || 0), 0);
    if (overBudget.length > 0) {
      const top = [...overBudget].sort((a, b) => ((actuals[b.key] || 0) - catBudget(b.key)) - ((actuals[a.key] || 0) - catBudget(a.key)))[0];
      out.push(`Η κατηγορία «${top.label}» έχει ξεπεράσει τον στόχο κατά ${feAuto((actuals[top.key] || 0) - catBudget(top.key))}.`);
    } else if (projectedOver.length > 0) {
      out.push(`Με τον τρέχοντα ρυθμό, η «${projectedOver[0].label}» θα ξεπεράσει τον στόχο πριν το τέλος του μήνα.`);
    }
    if (monthTrend.avgPrior > 0 && Math.abs(monthTrend.deltaPct) >= 8) {
      out.push(`Ο μήνας τρέχει ${Math.abs(monthTrend.deltaPct)}% ${monthTrend.direction === 'up' ? 'πάνω από' : 'κάτω από'} τον μέσο όρο του τριμήνου.`);
    }
    if (totalActual > 0 && masterBudget > 0 && out.length < 3) {
      const diff = forecastTotal - masterBudget;
      out.push(diff > 5
        ? `Πρόβλεψη τέλους μήνα ${feAuto(forecastTotal)}: ${feAuto(diff)} πάνω από τον στόχο.`
        : `Πρόβλεψη τέλους μήνα ${feAuto(forecastTotal)}: εντός στόχου κατά ${feAuto(Math.max(0, -diff))}.`);
    }
    const biggest = activeCats.map(c => ({ label: c.label, v: actuals[c.key] || 0 })).filter(x => x.v > 0).sort((a, b) => b.v - a.v)[0];
    if (biggest && out.length < 3) out.push(`Η μεγαλύτερη δαπάνη του μήνα είναι η «${biggest.label}» με ${feAuto(biggest.v)}.`);
    if (hasIncome && income - monthlyCost >= 0 && out.length < 3) out.push(`Μετά τα πάγια, σου μένουν ${feAuto(income - monthlyCost)} διαθέσιμα αυτόν τον μήνα.`);
    return out.slice(0, 3);
  })();

  // ── Προδραστικές προτάσεις: actionable, με ένα άγγιγμα εφαρμογή ──────────────
  // Ευθυγράμμιση στόχων με το πραγματικό μοτίβο των τελευταίων μηνών (ανέβασμα/μείωση)
  // και ευθυγράμμιση συνολικού στόχου με το άθροισμα κατηγοριών. Οι απορρίψεις θυμούνται
  // (__dismissed) ώστε να μην ενοχλούν ξανά. Η εφαρμογή δείχνει toast «Αναίρεση».
  const dismissedSug: string[] = (() => { try { const a = JSON.parse(budgets.__dismissed || '[]'); return Array.isArray(a) ? a.map(String) : []; } catch { return []; } })();
  const dismissSuggestion = (key: string) => persistCats({ __dismissed: JSON.stringify([...dismissedSug, key].slice(-60)) });
  const applyTarget = (k: string, val: number, msg: string) => { const prev = budgets[k]; updateBudget(k, String(val)); notify(msg, { duration: UNDO_MS, action: { label: 'Αναίρεση', onClick: () => updateBudget(k, prev ?? '') } }); };
  const targetSuggestions: { key: string; text: string; apply: () => void }[] = (() => {
    if (!isCurMonth) return [];
    const out: { key: string; text: string; apply: () => void }[] = [];
    const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);
    activeCats.forEach(c => {
      const target = catBudget(c.key);
      const hist = _priorYms.map(ym => catMonth[ym]?.[c.key]).filter((v): v is number => typeof v === 'number' && v > 0);
      if (hist.length < 2 || target <= 0) return;
      const avg = Math.round(hist.reduce((s, v) => s + v, 0) / hist.length);
      if (avg > target * 1.2) {
        const sv = round5(avg);
        const key = `raise:${c.key}:${sv}`;
        if (sv !== target && !dismissedSug.includes(key)) out.push({ key, text: `Η «${c.label}» ξεπερνά συστηματικά τον στόχο (μέσος όρος ${feAuto(avg)} τους τελευταίους μήνες). Να ανεβάσω τον στόχο στα ${feAuto(sv)};`, apply: () => applyTarget(c.key, sv, `Ο στόχος της «${c.label}» ενημερώθηκε`) });
      } else if (avg < target * 0.6) {
        const sv = round5(avg);
        const key = `lower:${c.key}:${sv}`;
        if (sv !== target && !dismissedSug.includes(key)) out.push({ key, text: `Η «${c.label}» μένει σταθερά κάτω από τον στόχο (μέσος όρος ${feAuto(avg)}). Να μειώσω τον στόχο στα ${feAuto(sv)} για πιο ρεαλιστικό προϋπολογισμό;`, apply: () => applyTarget(c.key, sv, `Ο στόχος της «${c.label}» ενημερώθηκε`) });
      }
    });
    const sumCats = activeCats.reduce((s, c) => s + catBudget(c.key), 0);
    if (sumCats > 0 && Math.abs(sumCats - masterBudget) > Math.max(20, masterBudget * 0.1)) {
      const key = `total:${Math.round(sumCats)}`;
      if (!dismissedSug.includes(key)) out.push({ key, text: `Ο συνολικός μηνιαίος στόχος (${feAuto(masterBudget)}) διαφέρει από το άθροισμα των κατηγοριών (${feAuto(sumCats)}). Να τους ευθυγραμμίσω;`, apply: () => applyTarget('total', Math.round(sumCats), 'Ο συνολικός στόχος ευθυγραμμίστηκε') });
    }
    return out.slice(0, 3);
  })();

  // ── Ειδοποιήσεις υπέρβασης (σύνδεση με το σύστημα υπενθυμίσεων) ──────────────
  // Όταν ενεργό και υπάρχει υπέρβαση, δημιουργείται ΕΝΑ εκκρεμές γεγονός ημερολογίου
  // (source 'budget') τον μήνα — το ημερήσιο cron το στέλνει email μέσω των προτιμήσεων
  // ειδοποιήσεων του χρήστη. Όταν λυθεί η υπέρβαση ή απενεργοποιηθεί, καθαρίζεται.
  const notifyOn  = budgets.notifyOverspend === 'true';
  const overKey   = overBudget.map(c => c.key).sort().join(',');
  // Το μέγεθος της υπέρβασης μπαίνει στις εξαρτήσεις ώστε ένα ποσό που μεγαλώνει
  // (ίδια κατηγορία) να ενημερώνει το αποθηκευμένο γεγονός, όχι μόνο η αλλαγή κατηγοριών.
  const overAmt   = Math.round(overBudget.reduce((s, c) => s + ((actuals[c.key] || 0) - catBudget(c.key)), 0));

  // ── Waterfall εσόδου βραχυχρόνιας: μεικτό → καθαρό (persona: short_term) ──────
  // Παραδοχές (προμήθεια/διαχείριση/φόρος) επεξεργάσιμες· εκτίμηση, όχι λογιστική.
  const isSTR          = rentalMode === 'short_term';
  const strPlatformPct = budgetVal(budgets.strPlatformPct, 15);
  const strMgmtPct     = budgetVal(budgets.strMgmtPct, 0);
  const strTaxPct      = budgetVal(budgets.strTaxPct, 15);
  // ── ΤΕΛΟΣ ΑΝΘΕΚΤΙΚΟΤΗΤΑΣ: ΜΙΑ πηγή ──────────────────────────────────────────
  // Εδώ καλούνταν τοπικό climateFeePerNight() του budgetPro.ts, που επέστρεφε
  // 1,50 €/νύχτα υψηλή περίοδο. Η πηγή αλήθειας (lib/billing/greekTax.ts) λέει
  // 8 € για διαμέρισμα και 15 € για μονοκατοικία >80 τ.μ. — πενταπλάσια ως
  // δεκαπλάσια διαφορά, στο ΙΔΙΟ ακίνητο, με το ίδιο νομικό όνομα στην οθόνη.
  //
  // Ο Προϋπολογισμός έδειχνε 30 € εκεί που η Λογιστική έδειχνε 160 €, και ο
  // οικοδεσπότης προγραμμάτιζε με 130 € λιγότερη οφειλή προς την ΑΑΔΕ τον μήνα.
  const climateFeeNight = isHighSeasonMonth(_now.getMonth())
    ? climateLevyRates(propSqm, propIsHouse).high
    : climateLevyRates(propSqm, propIsHouse).low;

  const waterfall      = isSTR && income > 0
    ? strWaterfall({ gross: income, platformFeePct: strPlatformPct, nights: strNights, climateFeePerNight: climateFeeNight, cleaningFee: 0, managementPct: strMgmtPct, incomeTaxPct: strTaxPct })
    : null;
  useEffect(() => {
    if (!propertyId || !userId || loading) return;
    let cancelled = false;
    (async () => {
      const y = _now.getFullYear(), mo = _now.getMonth();
      const p2 = (n: number) => String(n).padStart(2, '0');
      const mStart = `${y}-${p2(mo + 1)}-01`;
      const mEnd   = `${y}-${p2(mo + 1)}-${new Date(y, mo + 1, 0).getDate()}`;
      // Διαβάζουμε ΟΛΑ τα φετινομηνιάτικα 'budget' γεγονότα (όχι limit 1) ώστε τυχόν
      // διπλότυπα από ταυτόχρονες εγγραφές να καθαρίζονται αντί να μένουν να στέλνουν email.
      const ids = await calendar.ids(supabase, propertyId, { source: 'budget' }, { from: mStart, to: mEnd });
      if (cancelled) return;
      if (notifyOn && overBudget.length > 0) {
        const total = overBudget.reduce((s, c) => s + ((actuals[c.key] || 0) - catBudget(c.key)), 0);
        const title = `Υπέρβαση προϋπολογισμού: ${overBudget.map(c => c.label).join(', ')}`;
        if (ids.length > 0) {
          await saved('Η ειδοποίηση υπέρβασης δεν ενημερώθηκε',
            calendar.update(supabase, ids[0], { title, amount: Math.round(total) }));
          if (ids.length > 1 && !cancelled) await saved('Οι διπλές ειδοποιήσεις δεν καθαρίστηκαν',
            calendar.remove(supabase, ids.slice(1)));
        } else if (!cancelled) {
          await saved('Η ειδοποίηση υπέρβασης δεν δημιουργήθηκε', calendar.insert(supabase, [calendar.row({ propertyId, userId }, 'budget', {
            title, category: 'financial',
            event_date: `${y}-${p2(mo + 1)}-${p2(_now.getDate())}`, priority: 'high',
            amount: Math.round(total),
          })]));
        }
      } else if (ids.length > 0) {
        await saved('Η ειδοποίηση υπέρβασης δεν αφαιρέθηκε',
          calendar.remove(supabase, ids));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, userId, loading, notifyOn, overKey, overAmt]);

  // Κεφαλίδα ενότητας — ΟΛΗ η γραμμή είναι clickable (άνοιγμα/κλείσιμο), όχι μόνο το βελάκι.
  // Το ⓘ σταματά τη διάδοση ώστε να δείχνει επεξήγηση χωρίς να κλείνει την ενότητα.
  const secHdr = (label: string, key?: string, right?: React.ReactNode, info?: React.ReactNode) => {
    const shut = !!key && collapsed.has(key);
    const clickable = !!key;
    return (
      <div
        onClick={clickable ? () => toggleCollapse(key!) : undefined}
        onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCollapse(key!); } } : undefined}
        role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined} aria-expanded={clickable ? !shut : undefined}
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: shut ? 0 : 12, paddingBottom: shut ? 0 : 10, borderBottom: shut ? 'none' : '1px solid var(--border-subtle)', cursor: clickable ? 'pointer' : 'default', userSelect: 'none' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: T.font.sans }}>{label}</span>
        {info && <span onClick={e => e.stopPropagation()} style={{ display: 'inline-flex' }}>{info}</span>}
        <span style={{ flex: 1 }}/>
        {right}
        {key && (
          <span aria-hidden="true" style={{ display: 'flex', color: 'var(--text-tertiary)', padding: 4, margin: '-4px -4px -4px 0' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: shut ? 'rotate(-90deg)' : 'none', transition: 'transform 0.18s' }}><polyline points="6 9 12 15 18 9"/></svg>
          </span>
        )}
      </div>
    );
  };

  // Ενιαίος διακόπτης ρύθμισης (ίδιο idiom με τα toggles της εφαρμογής).
  // ΤΙ ΕΣΠΑΣΕ. Η κάρτα είναι η ίδια <button> που γυρίζει τη ρύθμιση, αλλά ο
  // βοηθός δεν είχε ΚΑΘΟΛΟΥ σημασιολογία διακόπτη: ούτε role="switch" ούτε
  // aria-checked. Και οι δύο ρυθμίσεις («Ειδοποίηση σε υπέρβαση», «Μεταφορά
  // υπολοίπου») ανακοινώνονταν ως απλά κουμπιά, δηλαδή ο αναγνώστης οθόνης δεν
  // έλεγε ποτέ αν είναι ανοιχτές. Ο δείκτης βαφόταν με ωμό #fff και η σκιά με
  // ωμό rgba — δύο παραβάσεις της παλέτας μέσα σε τρεις γραμμές. Δεν γίνεται
  // κοινό `Toggle`: το `Toggle` είναι <button>, και <button> μέσα σε <button>
  // είναι άκυρο HTML. Ευθυγραμμίστηκε αντ' αυτού με το `Toggle size="sm"`.
  const settingToggle = (settingKey: string, on: boolean, title: string, desc: string) => (
    <button type="button" role="switch" aria-checked={on} onClick={() => updateBudget(settingKey, on ? 'false' : 'true')}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--bg-elevated)', border: `1px solid ${on ? 'var(--border-accent)' : 'var(--border-subtle)'}`, borderRadius: T.radius.inner, cursor: 'pointer', textAlign: 'left', fontFamily: T.font.sans }}>
      <span style={{ position: 'relative', width: 36, height: 20, borderRadius: 20, background: on ? 'var(--accent)' : 'transparent', border: `2px solid ${on ? 'var(--accent)' : 'var(--border-default)'}`, flexShrink: 0, transition: 'background 0.2s, border-color 0.2s' }}>
        <span style={{ display: 'block', width: on ? 16 : 12, height: on ? 16 : 12, borderRadius: '50%', background: on ? 'var(--accent-text)' : 'var(--text-secondary)', position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: on ? 'calc(100% - 16px - 2px)' : 2, transition: `all 0.2s ${T.ease.standard}`, boxShadow: 'var(--elev-1)' }}/>
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>
        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{desc}</span>
      </span>
    </button>
  );

  // Σκελετός αντί για spinner: το σχήμα (KPIs + κάρτες κατηγοριών) είναι σταθερό,
  // οπότε η διάταξη δεν «πηδά» μόλις φτάσουν τα δεδομένα.
  if (loading) return <><SkeletonKPIs n={4} />{[0, 1, 2].map(i => <Skeleton key={i} h={70} r={12} style={{ marginBottom: 10 }} />)}</>;

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>Προϋπολογισμός</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
            <button onClick={() => canGoOlder && setMonthOffset(o => o - 1)} disabled={!canGoOlder} aria-label="Προηγούμενος μήνας"
              style={{ display: 'flex', border: 'none', background: 'transparent', cursor: canGoOlder ? 'pointer' : 'default', color: canGoOlder ? 'var(--text-secondary)' : 'var(--border-default)', padding: 2, margin: '0 -2px' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span style={{ minWidth: 96, textAlign: 'center', textTransform: 'capitalize' }}>{viewMonthLabel}</span>
            <button onClick={() => canGoNewer && setMonthOffset(o => o + 1)} disabled={!canGoNewer} aria-label="Επόμενος μήνας"
              style={{ display: 'flex', border: 'none', background: 'transparent', cursor: canGoNewer ? 'pointer' : 'default', color: canGoNewer ? 'var(--text-secondary)' : 'var(--border-default)', padding: 2, margin: '0 -2px' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            {!isCurMonth && <button onClick={() => setMonthOffset(0)} style={{ marginLeft: 4, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', fontSize: 10, fontWeight: 600, borderRadius: T.radius.pill, padding: '2px 9px', fontFamily: T.font.sans }}>Τρέχων</button>}
            <span style={{ marginLeft: 8, color: 'var(--text-tertiary)' }}>· {isPro ? 'Επιχείρηση' : 'Ιδιώτης'}</span>
            {saving && <span style={{ marginLeft: 10, color: 'var(--text-tertiary)', fontSize: 11 }}>· Αποθήκευση…</span>}
          </div>
        </div>
      </div>

      {/* Μία γραμμή, μία φορά. Τα σύνολα άλλαξαν και ο χρήστης δικαιούται να ξέρει
          γιατί — χωρίς πανό, χωρίς παράθυρο, χωρίς να ζητά κλικ για να συνεχίσει. */}
      {!ledgerNoteSeen && (monthItems.length > 0 || Object.keys(monthTotals).length > 0) && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12, fontFamily: T.font.sans, fontSize: 12, lineHeight: 1.6, color: 'var(--text-tertiary)' }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            Τα σύνολα μετρούν πλέον λογαριασμούς και δαπάνες μαζί, με το ποσό που όντως πληρώθηκε και στον μήνα που πληρώθηκε. Αν κάποιο νούμερο δείχνει αλλαγμένο, τώρα είναι το σωστό.
          </span>
          <button type="button" onClick={dismissLedgerNote}
            style={{ flexShrink: 0, appearance: 'none', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: T.font.sans, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Το κατάλαβα
          </button>
        </div>
      )}

      {/* «Δείξε μου» — δείγμα μήνα όταν ο προϋπολογισμός είναι άδειος */}
      {isCurMonth && demoIds.length === 0 && monthItems.length === 0 && Object.keys(monthTotals).length === 0 && (
        <div className="budget-rise" style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border-default)', borderRadius: T.radius.card, padding: 16, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans, marginBottom: 3 }}>Δες πώς λειτουργεί σε 10 δευτερόλεπτα</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>Θα προσθέσουμε ένα δείγμα δαπανών του μήνα, ώστε να ζωντανέψουν τα γραφήματα και οι κατηγορίες. Τα αφαιρείς με ένα άγγιγμα όποτε θες.</div>
          </div>
          <button type="button" onClick={seedDemo} disabled={demoBusy}
            style={{ height: T.h.md, padding: '0 18px', flexShrink: 0, borderRadius: T.radius.inner, border: '1px solid var(--border-accent)', background: 'var(--accent-dim)', color: 'var(--accent)', fontSize: 13, fontWeight: 600, fontFamily: T.font.sans, cursor: demoBusy ? 'default' : 'pointer', transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s' }}>
            {demoBusy ? 'Δημιουργία…' : 'Δείξε μου'}
          </button>
        </div>
      )}

      {/* Ενεργό δείγμα — διακριτική επισήμανση + αφαίρεση */}
      {demoIds.length > 0 && (
        <div className="budget-rise" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '11px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
          <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>Εμφανίζονται δείγματα δεδομένων για επίδειξη.</span>
          <button type="button" onClick={removeDemo} disabled={demoBusy}
            style={{ border: 'none', background: 'transparent', color: 'var(--accent)', fontSize: 12, fontWeight: 700, fontFamily: T.font.sans, cursor: demoBusy ? 'default' : 'pointer', padding: 0, flexShrink: 0 }}>
            {demoBusy ? 'Αφαίρεση…' : 'Αφαίρεση δείγματος'}
          </button>
        </div>
      )}

      {/* «Ασφαλές διαθέσιμο» — έσοδα − δεσμευμένα − εισφορές (Monzo Left to Spend) */}
      {isCurMonth && (hasIncome || monthlyCost > 0) && (() => {
        const safeRaw = income - monthlyCost;
        const val = hasIncome ? safeRaw : monthlyCost;
        const seg = (v: number) => income > 0 ? Math.max(0, Math.min(100, (v / income) * 100)) : 0;
        // ── ΤΑ ΣΚΕΛΗ ΠΟΥ ΥΠΑΡΧΟΥΝ ΠΡΑΓΜΑΤΙΚΑ ────────────────────────────────
        // Η υποσημείωση έγραφε «λογαριασμοί και δόση» ΠΑΝΤΑ, και τα σκέλη
        // γράφονταν ξανά από κάτω ως πλακίδια. Σε ακίνητο χωρίς δάνειο η φράση
        // υποσχόταν δόση που δεν υπάρχει, και όταν το μόνο σκέλος ήταν τα πάγια
        // το πλακίδιο «ΠΑΓΙΑ 51,34 €» καθόταν ακριβώς κάτω από το ίδιο 51,34 €
        // του τίτλου: ο ίδιος αριθμός, δύο φορές, με απόσταση μιας ανάσας.
        //
        // Τώρα η σύνθεση γράφεται μία φορά, από τα ΙΔΙΑ τα δεδομένα, και τα
        // πλακίδια εμφανίζονται μόνο όταν έχουν κάτι να σπάσουν.
        // ΟΙ ΣΥΝΔΡΟΜΕΣ ΕΙΝΑΙ ΗΔΗ ΜΕΣΑ ΣΤΟΥΣ ΛΟΓΑΡΙΑΣΜΟΥΣ. Το `FIXED_CATS` τις
        // περιέχει, άρα το `committedBills` τις έχει μετρήσει: γραμμένες και
        // χωριστά, τα σκέλη άθροιζαν παραπάνω από το ίδιο τους το σύνολο και η
        // πρόταση «πάγια, δόση δανείου και συνδρομές» υποσχόταν τρεις
        // προσθετέους που δεν προσθέτουν. Αφαιρούνται από τους λογαριασμούς
        // ώστε το άθροισμα των πλακιδίων να ΕΙΝΑΙ ο αριθμός από πάνω.
        const subsCost = actuals.subscriptions || 0;
        const parts = [
          { l: 'Λογαριασμοί',  v: committedBills - subsCost, sub: 'ρεύμα, νερό, θέρμανση, τηλέφωνο, ασφάλεια, κοινόχρηστα' },
          { l: 'Δόση δανείου', v: loanMonthly,               sub: 'τοκοχρεολύσιο του μήνα' },
          { l: 'Συνδρομές',    v: subsCost,                  sub: 'ό,τι χρεώνεται μόνο του' },
        ].filter(p => p.v !== 0);
        const listOf = (xs: string[]) => xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} και ${xs[xs.length - 1]}`;
        const composition = listOf(parts.map(p => p.l.toLowerCase()));
        return (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div className="po-fig-card" tabIndex={0}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: T.font.sans }}>{hasIncome ? (isPro ? 'Διαθέσιμη ταμειακή ροή' : 'Ασφαλές διαθέσιμο') : 'Μηνιαίο κόστος ακινήτου'}</span>
                  <InfoDot text={hasIncome ? (isPro ? 'Έσοδα μείον τους δεσμευμένους λογαριασμούς, τη δόση του δανείου και τις εισφορές των αποθεματικών. Δηλαδή η ελεύθερη ταμειακή ροή της δραστηριότητας κάθε μήνα.' : 'Έσοδα μείον τους δεσμευμένους λογαριασμούς, τη δόση του δανείου και τις μηνιαίες εισφορές των αποθεματικών. Το ποσό που μπορείς με ασφάλεια να αποσύρεις ή να διαθέσεις κάθε μήνα.') : 'Το άθροισμα των πάγιων λογαριασμών του μήνα και της δόσης του δανείου. Δηλαδή τι σου κοστίζει το ακίνητο κάθε μήνα.'} />
                </div>
                <div className="po-fig" data-tone={hasIncome ? (safeRaw < 0 ? 'negative' : 'accent') : undefined} style={{ fontSize: 28, fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1, letterSpacing: '-0.02em', transition: 'color 0.15s' }}>{feAuto(val)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6, fontFamily: T.font.sans }}>
                  {hasIncome
                    ? (composition ? `μετά από ${composition}` : 'χωρίς δεσμευμένα έξοδα')
                    : (parts.length > 1 ? composition : (parts[0]?.sub ?? ''))}
                </div>
              </div>
            </div>
            {/* ══════════════════════════════════════════════════════════════
                ΧΩΡΙΣ ΕΣΟΔΑ, ΤΟ ΚΟΥΤΙ ΕΙΧΕ ΕΝΑ ΝΟΥΜΕΡΟ ΚΑΙ ΤΡΙΑ ΤΕΤΑΡΤΑ ΚΕΝΟ.
                ────────────────────────────────────────────────────────────
                Η ανάλυση (μπάρα και σκέλη) εμφανιζόταν ΜΟΝΟ όταν είχε δηλωθεί
                εισόδημα, γιατί μοιράζει τα έσοδα. Ο ιδιοκτήτης που δεν έχει
                δηλώσει ενοίκιο έβλεπε «51,34 €» και «λογαριασμοί και δόση» σε
                πλαίσιο εκατόν είκοσι εικονοστοιχείων: ένα νούμερο που δεν λέει
                ΑΠΟ ΤΙ βγήκε, σε χώρο που θα το χωρούσε τρεις φορές.

                Τα ίδια σκέλη υπάρχουν και χωρίς έσοδα — απλώς δεν αφαιρούνται
                από κάτι. Μπαίνουν ως πλακίδια, και δίπλα τους η διαφορά από τον
                προηγούμενο μήνα: η μόνη σύγκριση που έχει νόημα όταν λείπει το
                εισόδημα, γιατί απαντά «ακρίβυνε ή έπεσε;».
                ══════════════════════════════════════════════════════════════ */}
            {!hasIncome && (() => {
              const prev  = monthTotals[_prevYm] || 0;
              // ΤΟ «ΕΝΑΝΤΙ» ΘΕΛΕΙ ΓΕΝΙΚΗ, ΚΑΙ Ο ΜΗΝΑΣ ΤΗΝ ΕΧΕΙ. Έγραφε «751,00 €
              // τον Ιούλιος»: ονομαστική μετά από πρόθεση, από τα πιο ορατά λάθη
              // σε ελληνικό κείμενο. Η αιτιατική και η γενική υπάρχουν ήδη στο
              // lib/core/months.ts ακριβώς γι' αυτό — απλώς δεν είχαν κληθεί εδώ.
              const tiles = [
                ...(parts.length > 1 ? parts : []),
                ...(prev > 0 ? [{ l: `Έναντι ${monthGen(Number(_prevYm.slice(5, 7)) - 1)}`,
                  v: monthlyCost - prev, sub: `από ${feAuto(prev)}` }] : []),
              ];
              if (tiles.length === 0) return null;
              return (
                <div {...fixedCols(Math.min(tiles.length, 4), 10)} style={{ marginTop: 16 }}>
                  {tiles.map(t => (
                    <div key={t.l} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                      borderRadius: T.radius.inner, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase',
                        letterSpacing: '0.06em', fontFamily: T.font.sans, whiteSpace: 'nowrap', overflow: 'hidden',
                        textOverflow: 'ellipsis' }}>{t.l}</div>
                      {/* Το μέγεθος είναι της κλίμακας (TT.kpi = 18 εδώ, 28 στο
                          κύριο νούμερο): τα πλακίδια στηρίζουν το σύνολο, δεν
                          ανταγωνίζονται μαζί του. */}
                      <div style={{ ...TT.kpi, fontSize: 18, marginTop: 4 }}>{feAuto(t.v)}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 3,
                        lineHeight: 1.4 }}>{t.sub}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
            {hasIncome && (
              <>
                <div style={{ display: 'flex', height: 8, borderRadius: 6, overflow: 'hidden', marginTop: 16, marginBottom: 10, background: 'var(--bg-overlay)' }}>
                  <div title="Λογαριασμοί" style={{ width: `${seg(committedBills)}%`, background: 'color-mix(in srgb, var(--text-primary) 32%, transparent)' }}/>
                  <div title="Δόση δανείου" style={{ width: `${seg(loanMonthly)}%`, background: 'color-mix(in srgb, var(--text-primary) 20%, transparent)' }}/>
                  <div title="Διαθέσιμο" style={{ flex: 1, background: safeRaw < 0 ? 'var(--negative)' : 'var(--accent)' }}/>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>
                  {[
                    { l: 'Έσοδα', v: income },
                    { l: 'Λογαριασμοί', v: committedBills },
                    { l: 'Δόση δανείου', v: loanMonthly },
                    { l: 'Διαθέσιμο', v: safeRaw },
                  ].filter(x => x.v !== 0).map(x => (
                    <span key={x.l} style={{ fontVariantNumeric: 'tabular-nums' }}>{x.l} <strong style={{ color: 'var(--text-primary)', fontFamily: T.font.num }}>{feAuto(x.v)}</strong></span>
                  ))}
                </div>
                {isShortfall && (
                  <div style={{ marginTop: 12, fontSize: 12, color: 'var(--negative)', fontFamily: T.font.sans }}>Τα δεσμευμένα έξοδα ξεπερνούν τα έσοδα κατά {feAuto(monthlyCost - income)}. Μείωσε τις εισφορές των αποθεματικών ή αναθεώρησε τους στόχους.</div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* Έσοδα / rent-roll — αναμενόμενα ή πραγματικά έσοδα ακινήτου (προσαρμόζεται στον τύπο μίσθωσης) */}
      {isCurMonth && income > 0 && (() => {
        const isSTRmode = rentalMode === 'short_term';
        const netFlow = income - monthlyCost;
        return (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16, marginBottom: 12 }}>
            {/* Ο ΤΙΤΛΟΣ ΛΕΕΙ ΤΟ ΙΔΙΟ ΜΕ ΤΑ ΠΛΑΚΙΔΙΑ ΑΠΟ ΚΑΤΩ. Έλεγε «Έσοδα» και στους
                δύο τρόπους, πάνω από τρία διαφορετικά πράγματα: εισπράξεις από
                διαμονές, αναμενόμενο ενοίκιο, και καθαρή ροή. Η λέξη «έσοδα» έχει
                φορολογικό νόημα και δεν είναι κανένα από τα τρία. */}
            {secHdr(isSTRmode ? 'Εισπράξεις' : 'Ενοίκιο', 'income', undefined,
              <InfoDot text={isSTRmode
                ? 'Ό,τι μπήκε στο ταμείο από τα καταλύματα: του μήνα, από την αρχή του έτους, διανυκτερεύσεις και μέση τιμή ανά βραδιά. Το ΔΗΛΩΤΕΟ ποσό είναι μεγαλύτερο, γιατί περιλαμβάνει την προμήθεια της πλατφόρμας: το βλέπεις στη Λογιστική ως «Μεικτά έσοδα».'
                : 'Αναμενόμενο ενοίκιο από τους ενεργούς μισθωτές: μηνιαίο, ετήσιο και η καθαρή ροή μετά τα μηνιαία κόστη. Είναι πρόβλεψη, όχι καταγεγραμμένες εισπράξεις· αυτές ζουν στους Μισθωτές και στη Λογιστική.'} />)}
            {!collapsed.has('income') && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 128px), 1fr))', gap: 8 }}>
                {isSTRmode ? (
                  <>
                    {/* ΕΙΣΠΡΑΞΕΙΣ, ΟΧΙ ΕΣΟΔΑ: εδώ αθροίζεται ό,τι μπήκε στο ταμείο
                        από τις διαμονές. Το ΔΗΛΩΤΕΟ ποσό είναι μεγαλύτερο, γιατί
                        περιλαμβάνει την προμήθεια της πλατφόρμας — και το λέει η
                        Λογιστική, ως «Μεικτά έσοδα». Δύο σωστά νούμερα για την
                        ίδια διαμονή· η λέξη ξεχωρίζει ποιο είναι ποιο. */}
                    <KPI label="Εισπράξεις μήνα" value={feAuto(income)}
                      title="Ό,τι μπήκε στο ταμείο από διαμονές αυτόν τον μήνα. Το δηλωτέο ποσό είναι μεγαλύτερο: το βλέπεις στη Λογιστική ως «Μεικτά έσοδα»." />
                    <KPI label="Από την αρχή έτους" value={feAuto(incomeYtd)} title="Εισπράξεις από διαμονές, από 1η Ιανουαρίου." />
                    <KPI label="Διανυκτερεύσεις" value={String(strNights)} />
                    <KPI label="Μέση τιμή ανά βραδιά" value={strNights > 0 ? feAuto(Math.round(income / strNights)) : fe(0)} />
                  </>
                ) : (
                  <>
                    <KPI label="Μηνιαίο ενοίκιο" value={feAuto(income)} />
                    <KPI label="Ετησίως" value={feAuto(income * 12)} />
                    <KPI label="Αναμενόμενα φέτος" value={feAuto(incomeYtd)} title="Μηνιαίο ενοίκιο × μήνες που πέρασαν φέτος (αναμενόμενα, όχι καταγεγραμμένες εισπράξεις)." />
                    <KPI label="Καθαρή ροή" value={`${netFlow < 0 ? '−' : ''}${feAuto(Math.abs(netFlow))}`} title="Αναμενόμενο ενοίκιο μείον μηνιαία κόστη (λογαριασμοί, δόση, αποθεματικά). Πρόβλεψη, όχι εισπράξεις." />
                  </>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Waterfall εσόδου βραχυχρόνιας — από μεικτό σε καθαρό (μόνο short_term) */}
      {isCurMonth && isSTR && waterfall && (() => {
        const rows = [
          { l: 'Μεικτό έσοδο', v: waterfall.gross, sub: false },
          { l: 'Προμήθεια πλατφόρμας', v: -waterfall.platformFee, sub: true },
          { l: 'Τέλος ανθεκτικότητας', v: -waterfall.climateFee, sub: true },
          ...(waterfall.management > 0 ? [{ l: 'Διαχείριση', v: -waterfall.management, sub: true }] : []),
          { l: 'Κράτηση φόρου (εκτίμηση)', v: -waterfall.taxReserve, sub: true },
        ];
        return (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: T.font.sans }}>Από μεικτό σε καθαρό</span>
              <InfoDot text="Ανάλυση του εσόδου βραχυχρόνιας μίσθωσης του μήνα: αφαιρούνται η προμήθεια της πλατφόρμας, το τέλος ανθεκτικότητας (ανά διανυκτέρευση), η τυχόν διαχείριση και η εκτιμώμενη κράτηση φόρου, για να δεις τι μένει πραγματικά. Πρόκειται για εκτίμηση· μπορείς να προσαρμόσεις τις παραδοχές στην επεξεργασία." />
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-tertiary)' }}>{strNights} διαν.</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rows.map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13, fontFamily: T.font.sans, color: r.sub ? 'var(--text-secondary)' : 'var(--text-primary)', fontWeight: r.sub ? 400 : 600 }}>
                  <span>{r.l}</span>
                  <span style={{ fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: r.v < 0 ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>{r.v < 0 ? '−' : ''}{feAuto(Math.abs(r.v))}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans }}>Καθαρό</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{feAuto(waterfall.net)}</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 12, fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
              <span>Καθαρό / διανυκτέρευση <strong style={{ color: 'var(--text-secondary)', fontFamily: T.font.num }}>{feAuto(waterfall.netPerNight)}</strong></span>
              <span>Περιθώριο <strong style={{ color: 'var(--text-secondary)', fontFamily: T.font.num }}>{waterfall.marginPct}%</strong></span>
            </div>
            {/* Παραδοχές — επιτόπου επεξεργασία (κλικ στο ποσοστό) */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
              <span>Προμήθεια πλατφόρμας <InfoDot text="Το ποσοστό προμήθειας της πλατφόρμας κράτησης (π.χ. Airbnb, Booking) επί του μεικτού εσόδου." /> <InlineNumber raw={budgets.strPlatformPct ?? '15'} display={`${fn(strPlatformPct, 0)}%`} onCommit={v => updateBudget('strPlatformPct', v)} width={44} ariaLabel="Προμήθεια πλατφόρμας %" /></span>
              <span>Διαχείριση <InlineNumber raw={budgets.strMgmtPct ?? '0'} display={`${fn(strMgmtPct, 0)}%`} onCommit={v => updateBudget('strMgmtPct', v)} width={44} ariaLabel="Διαχείριση %" /></span>
              <span>Συντελεστής φόρου <InlineNumber raw={budgets.strTaxPct ?? '15'} display={`${fn(strTaxPct, 0)}%`} onCommit={v => updateBudget('strTaxPct', v)} width={44} ariaLabel="Συντελεστής φόρου %" /></span>
            </div>
          </div>
        );
      })()}

      {displayOver.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {displayOver.map(cat => {
            const budget = catBudget(cat.key);
            const actual = viewActuals[cat.key] || 0;
            return (
              <div key={cat.key} className="po-fig-card" tabIndex={0} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: T.radius.inner, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans }}>{cat.label}</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>υπέρβαση</span>
                <span className="po-fig" data-tone="negative" style={{ fontSize: 12, fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>+{feAuto(actual - budget)}</span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>({feAuto(actual)} έναντι {feAuto(budget)})</span>
              </div>
            );
          })}
          {notifyOn && isCurMonth && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, paddingLeft: 2 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
              Θα λάβεις υπενθύμιση μέσω email και στο Ημερολόγιο.
            </div>
          )}
        </div>
      )}

      {/* Προβλεπόμενη υπέρβαση — με τον τρέχοντα ρυθμό (προειδοποίηση, όχι ήδη υπέρβαση) */}
      {isCurMonth && projectedOver.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: T.radius.inner, padding: '10px 16px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M23 6l-9.5 9.5-5-5L1 18"/><polyline points="17 6 23 6 23 12"/></svg>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>
            Με τον τρέχοντα ρυθμό, θα ξεπεραστεί ο στόχος σε: <strong style={{ color: 'var(--text-primary)' }}>{projectedOver.map(c => c.label).join(', ')}</strong>
          </span>
        </div>
      )}

      {/* Όριο 3+ βραχυχρόνιων (ΜΟΝΟ ιδιώτης) — νομικό κατώφλι επιχειρηματικής δραστηριότητας */}
      {!isPro && strPropCount >= 3 && (
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: T.radius.inner, padding: '10px 16px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>
            Έχεις <strong style={{ color: 'var(--text-primary)' }}>{strPropCount} βραχυχρόνια ακίνητα</strong>. Από 3 και πάνω, η δραστηριότητα θεωρείται επιχειρηματική και προκύπτουν υποχρεώσεις ΦΠΑ, ΕΦΚΑ και προκαταβολής φόρου. Συμβουλέψου τη Λογιστική και τον λογιστή σου.
          </span>
        </div>
      )}

      {/* Ο μήνας — μετρικές + πρόοδος σε ΕΝΑ πλαίσιο (χωρίς διπλότυπη κάρτα «Σύνολο») */}
      <div className="po-fig-card" tabIndex={0} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 128px), 1fr))', gap: 8, marginBottom: 12 }}>
          <KPI label="Στόχος τον μήνα" value={feAuto(masterBudget)} />
          <KPI label={isCurMonth ? 'Έως τώρα' : 'Σύνολο μήνα'} value={feAuto(viewActualTotal)} title={isCurMonth ? 'Καταγεγραμμένα του μήνα συν εκτιμήσεις παρόχων για πάγιες κατηγορίες που δεν έχουν χρεωθεί ακόμη.' : 'Καταγεγραμμένες δαπάνες αυτού του μήνα από το ιστορικό.'} />
          {isCurMonth
            ? <KPI label="Πρόβλεψη μήνα" value={feAuto(forecastTotal)} />
            : <KPI label="Έναντι στόχου" value={`${viewActualTotal <= masterBudget ? '−' : '+'}${feAuto(Math.abs(masterBudget - viewActualTotal))}`} />}
          <KPI label="Διαθέσιμο" value={feAuto(Math.max(0, masterBudget - viewActualTotal))} />
        </div>
        {(() => {
          const pct    = masterBudget > 0 ? Math.min((viewActualTotal / masterBudget) * 100, 100) : 0;
          const isOver = viewActualTotal > masterBudget;
          const col    = isOver ? 'var(--negative)' : 'color-mix(in srgb, var(--text-primary) 34%, transparent)';
          return (
            <>
              <div style={{ height: 6, background: 'var(--bg-overlay)', borderRadius: 3, overflow: 'hidden', marginBottom: 7 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 3, transition: 'width 0.6s ease' }}/>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 700 }}>{fp(pct)} χρησιμοποιήθηκε</span>
                {/* Το «Απομένει» φαίνεται ήδη στο πλακίδιο «Διαθέσιμο» — εδώ μόνο η υπέρβαση. */}
                <span className="po-fig" data-tone={isOver ? 'negative' : undefined}>{isOver ? `Υπέρβαση ${feAuto(viewActualTotal - masterBudget)}` : ''}</span>
              </div>
              {isCurMonth && rolloverOn && hasPrevMonth && carryIn !== 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>
                  Μεταφορά από τον {_prevLabel}: <strong className="po-fig" data-tone={carryIn > 0 ? undefined : 'negative'} style={{ fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{carryIn > 0 ? '+' : ''}{feAuto(carryIn)}</strong>
                  {' · '}πραγματικά διαθέσιμα <strong className="po-fig" data-tone={adjAvailable < 0 ? 'negative' : undefined} style={{ fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{feAuto(adjAvailable)}</strong>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* Απόδοση επένδυσης — ΜΟΝΟ επαγγελματίας (NOI/cap rate/cash-on-cash), δίπλα στα βασικά νούμερα */}
      {isPro && invReturns && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12, paddingBottom: 9, borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: T.font.sans }}>Απόδοση επένδυσης</span>
            <InfoDot text="NOI = καθαρά λειτουργικά έσοδα (χωρίς δόση δανείου). Ταμειακή ροή = NOI μείον δόση. Cap rate = NOI / τιμή αγοράς. Cash-on-cash = ταμειακή ροή / ίδια κεφάλαια. Ετησιοποιημένες εκτιμήσεις." />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 128px), 1fr))', gap: 8 }}>
            <KPI label="NOI / έτος" value={feAuto(invReturns.noi)} />
            <KPI label="Ταμειακή ροή" value={feAuto(invReturns.preTaxCashFlow)} />
            <KPI label="Cap rate" value={fp(invReturns.capRatePct)} />
            <KPI label="Cash-on-cash" value={fp(invReturns.cashOnCashPct)} />
          </div>
        </div>
      )}

      {/* Προτάσεις — προδραστικές, actionable (εφαρμογή με ένα άγγιγμα) */}
      {isCurMonth && targetSuggestions.length > 0 && (
        <div className="budget-rise" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-accent)', borderRadius: T.radius.card, padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: T.font.sans }}>Προτάσεις</span>
            <InfoDot text="Προτάσεις που προκύπτουν από το πραγματικό μοτίβο των δαπανών σου. Εφαρμόζεις με ένα άγγιγμα (με δυνατότητα αναίρεσης) ή τις απορρίπτεις για να μην ξαναεμφανιστούν." />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {targetSuggestions.map(s => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{s.text}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <button type="button" onClick={s.apply}
                    style={{ height: 28, padding: '0 12px', borderRadius: T.radius.inner, border: '1px solid var(--border-accent)', background: 'var(--accent-dim)', color: 'var(--accent)', fontSize: 12, fontWeight: 600, fontFamily: T.font.sans, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s' }}>
                    Εφαρμογή
                  </button>
                  <button type="button" aria-label="Απόρριψη" title="Απόρριψη" onClick={() => dismissSuggestion(s.key)}
                    style={{ display: 'inline-flex', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 3, margin: '-3px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Παρατηρήσεις — 2–3 έξυπνες προτάσεις πάνω από τα γραφήματα */}
      {isCurMonth && insights.length > 0 && (
        <div className="budget-rise" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2Z"/></svg>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: T.font.sans }}>Παρατηρήσεις</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {insights.map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'color-mix(in srgb, var(--text-primary) 40%, transparent)', flexShrink: 0, marginTop: 7 }} />
                <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ετήσια εικόνα — YTD και προβολή τέλους έτους από καταγεγραμμένες εγγραφές */}
      {(() => {
        const ytdPct = annual.ytdBudget > 0 ? Math.min((annual.ytdActual / annual.ytdBudget) * 100, 100) : 0;
        const ytdOver = annual.ytdActual > annual.ytdBudget;
        const ytdCol = ytdOver ? 'var(--negative)' : 'color-mix(in srgb, var(--text-primary) 34%, transparent)';
        const trDir = monthTrend.direction;
        const shut = collapsed.has('annual');
        const hasAnnualData = annual.ytdActual > 0 || Object.keys(monthTotals).length > 0;
        return (
          <div className="po-fig-card" tabIndex={0} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16, marginBottom: 12 }}>
            {secHdr('Ετήσια εικόνα', 'annual')}
            {!shut && !hasAnnualData && (
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.6 }}>
                Μόλις καταγραφούν οι πρώτες δαπάνες, εδώ θα εμφανίζεται η προβολή τέλους έτους, η πορεία από την αρχή του έτους και η κατανομή ανά κατηγορία.
              </div>
            )}
            {!shut && hasAnnualData && (
              <>
                {/* Προβολή τέλους έτους — κύριος αριθμός */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                  <span className="po-fig" data-tone={annual.onTrack ? undefined : 'negative'} style={{ fontSize: 24, fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1, letterSpacing: '-0.02em' }}>{feAuto(annual.projectedYearEnd)}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>προβολή τέλους έτους · στόχος <span style={{ fontFamily: T.font.num }}>{feAuto(annual.annualBudget)}</span></span>
                  <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, padding: '3px 10px', borderRadius: T.radius.pill, fontFamily: T.font.sans, color: annual.onTrack ? 'var(--text-secondary)' : 'var(--negative)', background: annual.onTrack ? 'var(--bg-elevated)' : 'var(--negative-dim)', border: `1px solid ${annual.onTrack ? 'var(--border-subtle)' : 'var(--negative-border)'}` }}>{annual.onTrack ? 'Εντός στόχου' : 'Εκτός στόχου'}</span>
                </div>
                {/* YTD — από την αρχή του έτους */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7, fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>
                  <span>Από την αρχή του έτους</span>
                  <span style={{ fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{feAuto(annual.ytdActual)} <span style={{ color: 'var(--text-tertiary)' }}>/ {feAuto(annual.ytdBudget)}</span></span>
                </div>
                <div style={{ height: 8, background: 'var(--bg-overlay)', borderRadius: 6, overflow: 'hidden', marginBottom: 7 }}>
                  <div style={{ height: '100%', width: `${ytdPct}%`, background: ytdCol, borderRadius: 6, transition: 'width 0.6s ease' }}/>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
                  <span className="po-fig" data-tone={annual.variance > 0 ? 'negative' : undefined}>{annual.variance > 0 ? `Υπέρβαση ${feAuto(annual.variance)} έναντι στόχου` : `Εντός στόχου κατά ${feAuto(-annual.variance)}`}</span>
                  {monthTrend.avgPrior > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-tertiary)' }}>
                      {trDir === 'flat'
                        ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: trDir === 'down' ? 'scaleY(-1)' : 'none' }}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>}
                      {trDir === 'flat' ? 'σταθερά' : `${monthTrend.deltaPct > 0 ? '+' : ''}${monthTrend.deltaPct}% έναντι τριμήνου`}
                    </span>
                  )}
                </div>
                {/* Ετήσιο εργαλείο: ράβδοι εξόδων ανά μήνα (με ήπια κατάσταση όταν δεν υπάρχει ιστορικό) */}
                <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, fontFamily: T.font.sans }}>Έξοδα ανά μήνα</div>
                  {yearBars.some(b => b.value > 0)
                    ? <MonthBars data={yearBars} activeYm={_curYm} />
                    : <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, padding: '14px 0' }}>Μόλις καταγραφούν έξοδα, θα δεις εδώ την πορεία ανά μήνα.</div>}
                </div>
                {/* Ετήσιο εργαλείο: κατανομή δαπανών ανά κατηγορία */}
                {catYtd.length > 0 && (
                  <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, fontFamily: T.font.sans }}>Κατανομή ανά κατηγορία</div>
                    <Donut slices={catYtd} />
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* Εβδομαδιαίο εργαλείο — δαπάνες αυτής της εβδομάδας ανά κατηγορία (μόνο τρέχων μήνας) */}
      {isCurMonth && weekTotalV > 0 && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16, marginBottom: 12 }}>
          {secHdr('Αυτή την εβδομάδα', 'week', <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{feAuto(weekTotalV)}</span>)}
          {!collapsed.has('week') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {weekCats.map(c => {
                const on = hoverWeek === c.label;
                return (
                <div key={c.label} onMouseEnter={() => setHoverWeek(c.label)} onMouseLeave={() => setHoverWeek(null)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 6px', margin: '0 -6px', borderRadius: T.radius.inner, background: on ? 'var(--bg-elevated)' : 'transparent', transition: 'background 0.15s' }}>
                  <span style={{ width: 120, flexShrink: 0, fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', fontFamily: T.font.sans, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                  <div style={{ flex: 1, height: 8, background: 'var(--bg-overlay)', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(c.value / weekMax) * 100}%`, background: `color-mix(in srgb, var(--accent) ${on ? 100 : 66}%, transparent)`, borderRadius: 6, transition: 'width 0.5s ease, background 0.18s' }} />
                  </div>
                  <span style={{ width: 62, textAlign: 'right', flexShrink: 0, fontSize: 13, fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: on ? 'var(--accent)' : 'var(--text-primary)', transition: 'color 0.15s' }}>{feAuto(c.value)}</span>
                </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Επιχειρηματικές υποχρεώσεις — ΜΟΝΟ επαγγελματίας (δεν αφορούν ιδιώτες) */}
      {isPro && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: T.font.sans }}>Επιχειρηματικές υποχρεώσεις</span>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.55 }}>
            Εκτός από τον φόρο εισοδήματος, ως επιχείρηση βαρύνεσαι με τις μηνιαίες εισφορές <strong style={{ color: 'var(--text-secondary)' }}>ΕΦΚΑ</strong>, την <strong style={{ color: 'var(--text-secondary)' }}>προκαταβολή φόρου</strong> για την επόμενη χρήση και, εφόσον παρέχεις υπηρεσίες, τον <strong style={{ color: 'var(--text-secondary)' }}>ΦΠΑ</strong>. Τα ακριβή ποσά υπολογίζονται στη Λογιστική.
          </span>
        </div>
      )}

      {/* Επαναλαμβανόμενες χρεώσεις / συνδρομές — ανάλυση 12μηνου ιστορικού δαπανών */}
      {recurring.length > 0 && (() => {
        const monthlyTotal = recurring.reduce((s, r) => s + r.monthlyEquivalent, 0);
        const annualTotal  = recurring.reduce((s, r) => s + r.annualCost, 0);
        const cadLabel = (c: RecurringCharge['cadence']) => c === 'monthly' ? 'μηνιαία' : c === 'bimonthly' ? 'διμηνιαία' : c === 'quarterly' ? 'τριμηνιαία' : c === 'yearly' ? 'ετήσια' : 'ακανόνιστη';
        return (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16, marginBottom: 12 }}>
            {secHdr('Επαναλαμβανόμενες χρεώσεις', 'recurring',
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{feAuto(monthlyTotal)}/μήνα · {feAuto(annualTotal)}/έτος</span>,
              <InfoDot text="Συνδρομές και πάγιες χρεώσεις που εντοπίζονται αυτόματα από τις καταγεγραμμένες δαπάνες σου, όταν ο ίδιος πάροχος επαναλαμβάνεται σε πολλούς μήνες. Δείχνει συχνότητα, τυπικό ποσό και ετήσιο κόστος, ώστε να εντοπίζεις εύκολα τις «κρυφές» συνδρομές." />)}
            {!collapsed.has('recurring') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {recurring.slice(0, 10).map(r => {
                  const hov = hoverRec === r.key;
                  return (
                    <div key={r.key} onMouseEnter={() => setHoverRec(r.key)} onMouseLeave={() => setHoverRec(null)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px', margin: '0 -8px', borderRadius: T.radius.inner, background: hov ? 'var(--bg-elevated)' : 'transparent', transition: 'background 0.15s' }}>
                      <div style={{ width: 3, height: 26, borderRadius: 3, background: 'color-mix(in srgb, var(--text-primary) 26%, transparent)', flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', fontFamily: T.font.sans, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 1 }}>{cadLabel(r.cadence)} · επόμενη {parseLocalDate(r.nextExpected).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })}</div>
                      </div>
                      <div style={{ textAlign: 'right', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: hov ? 'var(--accent)' : 'var(--text-primary)', transition: 'color 0.15s' }}>{feAuto(r.monthlyEquivalent)}<span style={{ fontSize: 9, fontWeight: 500, color: 'var(--text-tertiary)' }}>/μήνα</span></div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{feAuto(r.annualCost)}/έτος</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16, marginBottom: 12 }}>
        {secHdr('Ανά Κατηγορία', 'cats', undefined,
          <InfoDot text="Κάθε κατηγορία δείχνει τι έχεις ξοδέψει έναντι του στόχου. Κάνε κλικ στον στόχο για να τον αλλάξεις επιτόπου, ή στο όνομα για μετονομασία. Οι στόχοι αποθηκεύονται αυτόματα." />)}
        {!(collapsed.has('cats')) &&
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {activeCats.map(cat => {
            const budget  = catBudget(cat.key);
            const actual  = viewActuals[cat.key] || 0;
            const pct     = budget > 0 ? Math.min((actual / budget) * 100, 100) : 0;
            const isOver  = actual > budget && actual > 0;
            const projOver = isCurMonth && !isOver && categoryStatus(budget, actual, catForecast(cat.key)) === 'projected_over';
            const isWarn  = !isOver && !projOver && pct > 80;
            // Ομοιόμορφες, μονόχρωμες ράβδοι για ΟΛΕΣ τις κατηγορίες — καμία κόκκινη
            // ράβδος στην υπέρβαση· το «πόσο πάνω» λέγεται διακριτικά με μικρό αριθμό.
            const col     = 'color-mix(in srgb, var(--text-primary) 34%, transparent)';
            const tr      = catTrend(cat.key);

            const hov = hoverCat === cat.key;
            const bdItems = isCurMonth ? (catBreakdown[cat.key] || []) : [];
            const hasBd = bdItems.length > 0;
            const openCat = openCats.has(cat.key);
            const toggleCat = () => setOpenCats(s => { const n = new Set(s); n.has(cat.key) ? n.delete(cat.key) : n.add(cat.key); return n; });
            return (
              <div key={cat.key} className="po-fig-card" tabIndex={0}
                onMouseEnter={() => setHoverCat(cat.key)} onMouseLeave={() => setHoverCat(null)}
                style={{ borderRadius: T.radius.inner, padding: '6px 8px', margin: '0 -8px', background: hov ? 'var(--bg-elevated)' : 'transparent', transition: 'background 0.15s' }}>
                {/* Πατιέται ΜΟΝΟ όταν υπάρχει ανάλυση από κάτω. Χωρίς τη συνθήκη, η
                    γραμμή θα έμπαινε στη σειρά του Tab και θα ανακοινωνόταν ως κουμπί
                    ακόμη κι όταν το πάτημα δεν κάνει τίποτα — κενή υπόσχεση, που για
                    τον χρήστη πληκτρολογίου κοστίζει περισσότερο απ' ό,τι για τον
                    χρήστη ποντικιού: εκείνος τουλάχιστον βλέπει ότι δεν άνοιξε κάτι. */}
                <div {...(hasBd ? pressable(toggleCat) : {})} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5, cursor: hasBd ? 'pointer' : 'default' }}>
                  <div style={{ width: 3, height: 26, borderRadius: 3, background: hov ? 'var(--accent)' : col, flexShrink: 0, transition: 'background 0.15s' }}/>
                  <span onClick={e => e.stopPropagation()} style={{ display: 'inline-flex' }}><InlineText value={cat.label} onCommit={v => renameCategory(cat.key, v)} ariaLabel={`Μετονομασία «${cat.label}»`} /></span>
                  {<span title="Τάση 12 μηνών"><Sparkline values={catSpark(cat.key)} activeIndex={_sparkYms.indexOf(viewYm)} /></span>}
                  {isCurMonth && tr.avgPrior > 0 && tr.direction !== 'flat' && (
                    <span title={`Μέσος όρος τριμήνου: ${feAuto(tr.avgPrior)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, fontWeight: 700, fontFamily: T.font.num, color: 'var(--text-tertiary)' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: tr.direction === 'down' ? 'scaleY(-1)' : 'none' }}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                      {tr.deltaPct > 0 ? '+' : ''}{tr.deltaPct}%
                    </span>
                  )}
                  <span style={{ flex: 1 }}/>

                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                    {/* ΙΔΙΟ ΜΕΓΕΘΟΣ ΚΑΙ ΣΤΙΣ ΔΥΟ ΠΕΡΙΠΤΩΣΕΙΣ. Το «καμία δαπάνη» ήταν
                        παύλα σε 11 στιγμές δίπλα σε ποσό των 14: δύο διαφορετικά ύψη
                        στην ίδια στήλη, που δεν στοιχίζονται μεταξύ τους σε καμία
                        σειρά. Τώρα είναι ποσό, γράφεται 0,00 €, και η απουσία λέγεται
                        από το χρώμα και το βάρος. */}
                    <span style={{ fontSize: 14, fontWeight: actual > 0 ? 700 : 500, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: actual > 0 ? (hov ? 'var(--accent)' : 'var(--text-primary)') : 'var(--text-tertiary)', transition: 'color 0.15s' }}>{feAuto(actual > 0 ? actual : 0)}</span>
                    {/* Στόχος — κλικ για επιτόπου αλλαγή */}
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>/ <InlineNumber raw={budgets[cat.key] ?? String(cat.default)} display={feAuto(budget)} onCommit={v => updateBudget(cat.key, v)} width={58} ariaLabel={`Στόχος «${cat.label}»`} /></span>
                    {isOver && <span className="po-fig" data-tone="negative" title="Υπέρβαση του στόχου" style={{ fontSize: 10, fontWeight: 600, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>+{feAuto(actual - budget)}</span>}
                    {projOver && <span title="Με τον τρέχοντα ρυθμό θα ξεπεράσει τον στόχο" style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>προβλεπόμενη υπέρβαση</span>}
                    {isWarn && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{fp(pct)}</span>}
                  </div>
                  {/* Αφαίρεση κατηγορίας — εμφανίζεται στο πέρασμα του κέρσορα */}
                  <button type="button" title="Αφαίρεση κατηγορίας" aria-label={`Αφαίρεση «${cat.label}»`}
                    onClick={e => { e.stopPropagation(); removeCategory(cat.key); }}
                    onMouseEnter={() => setDelCatHover(cat.key)} onMouseLeave={() => setDelCatHover(null)}
                    style={{ width: 22, height: 22, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color: delCatHover === cat.key ? 'var(--negative)' : 'var(--text-tertiary)', cursor: 'pointer', transition: 'opacity 0.15s, color 0.15s', padding: 0, opacity: hov ? 1 : 0, pointerEvents: hov ? 'auto' : 'none' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                  {hasBd && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={hov ? 'var(--accent)' : 'var(--text-tertiary)'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: openCat ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s, stroke 0.15s' }} aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
                  )}
                </div>

                {(
                  <div style={{ marginLeft: 13 }}>
                    <div style={{ height: 4, background: 'var(--bg-overlay)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: hov ? 'var(--accent)' : col, borderRadius: 3, transition: 'width 0.5s ease, background 0.15s' }}/>
                    </div>
                  </div>
                )}

                {/* Ανάλυση κατηγορίας: πάροχος/περιγραφή, ποσό και ημερομηνία της κάθε πληρωμής */}
                {hasBd && openCat && (
                  <div style={{ marginLeft: 13, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {bdItems.map((it, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px', margin: '0 -8px', borderRadius: T.radius.inner }}>
                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: it.paid ? 'color-mix(in srgb, var(--text-primary) 40%, transparent)' : 'var(--border-default)', flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
                        {!it.paid && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>εκκρεμεί</span>}
                        {it.date && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{parseLocalDate(it.date).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })}</span>}
                        <span style={{ width: 58, textAlign: 'right', flexShrink: 0, fontSize: 12, fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{feAuto(it.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>}

        {!collapsed.has('cats') && (() => {
          const sumCats = activeCats.reduce((s, c) => s + catBudget(c.key), 0);
          const linkBtn = (label: string, on: boolean, onClick: () => void) => (
            <button type="button" onClick={onClick}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'transparent', color: on ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, fontFamily: T.font.sans, cursor: 'pointer', padding: 0, transition: 'color 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = on ? 'var(--accent)' : 'var(--text-secondary)'; }}>
              {label}
            </button>
          );
          return (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
              {/* Σύνολο + ενέργειες (χωρίς λειτουργία επεξεργασίας — όλα επιτόπου) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: 12, fontFamily: T.font.sans, color: 'var(--text-secondary)' }}>
                <span>Μηνιαίος στόχος <InlineNumber raw={budgets.total ?? String(Math.round(masterBudget))} display={feAuto(masterBudget)} onCommit={v => updateBudget('total', v)} width={70} ariaLabel="Συνολικός μηνιαίος στόχος" /></span>
                <span style={{ color: 'var(--text-tertiary)' }}>Άθροισμα κατηγοριών <strong style={{ fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{feAuto(sumCats)}</strong></span>
                <span style={{ flex: 1 }} />
                {linkBtn(addingCat ? 'Κλείσιμο' : '+ Προσθήκη κατηγορίας', addingCat, () => setAddingCat(v => !v))}
                {linkBtn('Ρυθμίσεις', showSettings, () => setShowSettings(v => !v))}
              </div>

              {addingCat && (
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <TextInput label="Νέα κατηγορία" value={newCatName} onChange={setNewCatName} placeholder="Παράδειγμα: Καθαριότητα, Φύλαξη…"
                      onKeyDown={e => { if (e.key === 'Enter' && newCatName.trim()) { addCategory(newCatName); setNewCatName(''); } }}/>
                  </div>
                  <button type="button" disabled={!newCatName.trim()}
                    onClick={() => { addCategory(newCatName); setNewCatName(''); }}
                    style={{ height: T.h.md, padding: '0 16px', borderRadius: T.radius.inner, border: '1px solid var(--border-default)', background: newCatName.trim() ? 'color-mix(in srgb, var(--text-primary) 88%, transparent)' : 'var(--bg-elevated)', color: newCatName.trim() ? 'var(--bg-surface)' : 'var(--text-tertiary)', fontSize: 13, fontWeight: 600, fontFamily: T.font.sans, cursor: newCatName.trim() ? 'pointer' : 'default', transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s', whiteSpace: 'nowrap' }}>
                    Προσθήκη
                  </button>
                </div>
              )}

              {hiddenBaseCats.length > 0 && (
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', fontFamily: T.font.sans, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Επαναφορά</span>
                  {hiddenBaseCats.map(c => (
                    <button key={c.key} type="button" title="Επαναφορά κατηγορίας" onClick={() => restoreCategory(c.key)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: T.radius.pill, border: '1px dashed var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500, fontFamily: T.font.sans, cursor: 'pointer' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-default)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      {labelOverrides[c.key] ?? c.label}
                    </button>
                  ))}
                </div>
              )}

              {showSettings && (
                <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 10 }}>
                  {settingToggle('notifyOverspend', notifyOn, 'Ειδοποίηση σε υπέρβαση', 'Ειδοποίηση όταν μια κατηγορία ξεπεράσει τον στόχο, μέσω των προτιμήσεων ειδοποιήσεων και του Ημερολογίου.')}
                  {settingToggle('rollover', rolloverOn, 'Μεταφορά υπολοίπου', 'Το αδιάθετο ή η υπέρβαση του μήνα μεταφέρεται στον επόμενο, αντί για μηδενισμό κάθε μήνα.')}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Εξαιρέσεις: όσα δεν θέλεις να μετρούν στα στατιστικά/προϋπολογισμό (τα πληρώνει άλλος ή απλώς εκτός) */}
      {isCurMonth && monthItems.length > 0 && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16, marginBottom: 12 }}>
          {secHdr('Εξαιρέσεις', 'exclusions',
            excludedCount > 0 ? <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{excludedCount} εκτός</span> : undefined,
            <InfoDot text="Απενεργοποίησε όσα δεν θέλεις να μετρούν στα στατιστικά και στον προϋπολογισμό: είτε γιατί τα πληρώνει κάποιος άλλος, είτε επειδή απλώς δεν θες να προσμετρώνται. Μπορείς να εξαιρέσεις ολόκληρη την εγγραφή ή μόνο ένα μέρος του ποσού (π.χ. το μισό το πλήρωσε άλλος) και προαιρετικά να σημειώσεις τον λόγο." />)}
          {!collapsed.has('exclusions') && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {monthItems.map((it, idx) => {
                const ex = excludedMap[it.id];
                const isEx = !!ex;
                const full = it.amount;
                const excl = exclAmountOf(it.id, full);            // πόσο εξαιρείται
                const cnt  = Math.max(0, full - excl);             // πόσο μετρά
                const partial = isEx && ex?.amount != null && ex.amount > 0 && ex.amount < full;
                const amtVal = exclAmtDraft[it.id] ?? (ex?.amount != null ? String(ex.amount) : '');
                return (
                  <div key={it.id} style={{ padding: '11px 0', borderTop: idx === 0 ? 'none' : '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: isEx ? 'var(--text-tertiary)' : 'var(--text-primary)', fontFamily: T.font.sans, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
                      {/* Ποσό: συνολικό· όταν εξαιρείται μερικώς, δείχνουμε διακριτικά πόσο μετρά */}
                      <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.2 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: isEx ? 'var(--text-tertiary)' : 'var(--text-primary)', textDecoration: isEx && !partial ? 'line-through' : 'none', textDecorationColor: 'var(--border-default)' }}>{feAuto(full)}</span>
                        {partial && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>μετρά {feAuto(cnt)}</span>}
                      </span>
                      {/* Διακόπτης «μετρά στον προϋπολογισμό» — off = εξαιρέθηκε.
                          ΓΙΑΤΙ ΜΕΝΕΙ ΧΕΙΡΟΓΡΑΦΟΣ. Το κοινό `Toggle` δένει την
                          aria-label με το ΟΡΑΤΟ κείμενο: `aria-label={label}` και
                          `{label && <span>{label}</span>}` στο ίδιο prop. Εδώ ο
                          διακόπτης επαναλαμβάνεται μία φορά ανά εγγραφή του μήνα
                          (δεκάδες γραμμές), οπότε το κοινό component θα τύπωνε
                          «Μετρά στον προϋπολογισμό» δίπλα σε ΚΑΘΕ γραμμή για να
                          κρατήσει την ετικέτα προσβασιμότητας. Η γεωμετρία και τα
                          χρώματα ευθυγραμμίστηκαν με το `Toggle size="sm"`
                          (36×20, δείκτης 12/16, περίγραμμα 2) ώστε να είναι
                          οπτικά ο ΙΔΙΟΣ διακόπτης· έφευγε πριν με ωμό #fff στον
                          δείκτη και ωμό rgba στη σκιά. */}
                      <button type="button" role="switch" aria-checked={!isEx} aria-label="Μετρά στον προϋπολογισμό"
                        onClick={() => { if (isEx) { unexcludeItem(it.id); setExclAmtDraft(d => { const n = { ...d }; delete n[it.id]; return n; }); } else { const snap = budgets.__excluded; excludeItem(it.id); notify(`Εξαιρέθηκε «${it.label}»`, { duration: UNDO_MS, action: { label: 'Αναίρεση', onClick: () => persistCats({ __excluded: snap ?? '{}' }) } }); } }}
                        style={{ position: 'relative', width: 36, height: 20, borderRadius: 20, background: isEx ? 'transparent' : 'var(--accent)', border: `2px solid ${isEx ? 'var(--border-default)' : 'var(--accent)'}`, cursor: 'pointer', flexShrink: 0, padding: 0, transition: 'background 0.2s, border-color 0.2s' }}>
                        <span style={{ display: 'block', width: isEx ? 12 : 16, height: isEx ? 12 : 16, borderRadius: '50%', background: isEx ? 'var(--text-secondary)' : 'var(--accent-text)', position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: isEx ? 2 : 'calc(100% - 16px - 2px)', transition: `all 0.2s ${T.ease.standard}`, boxShadow: 'var(--elev-1)' }} />
                      </button>
                    </div>
                    {isEx && (
                      <div style={{ marginTop: 10, padding: '12px 13px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, display: 'flex', flexDirection: 'column', gap: 11 }}>
                        {/* Λόγος: γρήγορες επιλογές (προαιρετικό) */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ width: 74, flexShrink: 0, fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>Λόγος</span>
                          {PAYERS.map(p => {
                            const sel = ex?.payer === p;
                            return (
                              <button key={p} type="button" onClick={() => patchExcl(it.id, { payer: sel ? '' : p })}
                                style={{ border: `1px solid ${sel ? 'var(--border-accent)' : 'var(--border-subtle)'}`, background: sel ? 'var(--accent-dim)' : 'transparent', color: sel ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: T.font.sans, padding: '3px 10px', borderRadius: T.radius.pill, transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s' }}
                                onMouseEnter={e => { if (!sel) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; } }}
                                onMouseLeave={e => { if (!sel) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; } }}>
                                {p}
                              </button>
                            );
                          })}
                        </div>
                        {/* Μερική εξαίρεση: πόσο από το ποσό να εξαιρεθεί (κενό = όλο) */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ width: 74, flexShrink: 0, fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>Εξαιρείται</span>
                          <div style={{ position: 'relative', width: 108 }}>
                            <input inputMode="decimal" value={amtVal}
                              onChange={e => { const raw = e.target.value.replace(/[^\d.,]/g, ''); setExclAmtDraft(d => ({ ...d, [it.id]: raw })); const n = parseFloat(raw.replace(',', '.')); patchExcl(it.id, { amount: isFinite(n) && n > 0 ? n : undefined }); }}
                              placeholder={`όλο (${feAuto(full)})`}
                              style={{ width: '100%', height: 28, padding: '0 22px 0 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', outline: 'none', transition: 'border-color 0.15s' }}
                              onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-accent)'; }}
                              onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)'; }} />
                            <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.num, pointerEvents: 'none' }}>€</span>
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
                            {partial ? <>από {feAuto(full)} · μετρά <span style={{ color: 'var(--text-secondary)', fontFamily: T.font.num }}>{feAuto(cnt)}</span></> : 'όλη η εγγραφή εξαιρείται'}
                          </span>
                        </div>
                        {/* Σημείωση: ελεύθερο κείμενο (προαιρετικό) */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 74, flexShrink: 0, fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>Σημείωση</span>
                          <input type="text" value={ex?.note ?? ''} maxLength={120}
                            onChange={e => patchExcl(it.id, { note: e.target.value })}
                            placeholder="Παράδειγμα: το μισό το πλήρωσε ο συγκάτοικος"
                            style={{ flex: 1, minWidth: 0, height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 12, fontFamily: T.font.sans, outline: 'none', transition: 'border-color 0.15s' }}
                            onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-accent)'; }}
                            onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)'; }} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ΕΝΑ ΚΛΙΚ ΛΙΓΟΤΕΡΟ. Το «Περισσότερα» έκρυβε δύο πράγματα: τα αποθεματικά
          και την εισαγωγή αρχείου. Τα αποθεματικά αφαιρέθηκαν από το προϊόν,
          οπότε έμεινε πτυσσόμενο πάνω από ΕΝΑ στοιχείο — δηλαδή ένα κλικ για να
          δεις κάτι που χωρούσε να φαίνεται. Η ίδια η ενότητα μαζεύει ήδη. */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16, marginTop: 12 }}>
        {secHdr('Εισαγωγή δεδομένων', 'import', undefined,
          <InfoDot text="Ανέβασε τραπεζικό αντίγραφο ή λίστα εξόδων (CSV ή Excel) και το εργαλείο αναγνωρίζει αυτόματα ημερομηνία, ποσό και κατηγορία. Ελέγχεις και διορθώνεις πριν την καταχώρηση, ώστε οι δαπάνες να μπαίνουν στον σωστό μήνα και στη σωστή κατηγορία." />)}
            {!collapsed.has('import') && (
          <BudgetImport propertyId={propertyId} userId={userId} cats={activeCats.map(c => ({ key: c.key, label: c.label }))} onImported={loadData} />
        )}
      </div>

    </div>
  );
}