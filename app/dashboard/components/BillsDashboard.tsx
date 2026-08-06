'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { NumberInput, TextInput, CustomSelect, DatePicker, Toggle } from './UIComponents';
import BillsPDFExport from './BillsPDFExport';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import { T, fe, Btn, EmptyState, Skeleton, SkeletonKPIs, fp } from '@/components/Theme';
import { notifyError } from '@/components/toastBus';
import { saved, savedData } from '@/components/dbWrite';
import type { BillsRow, BillsHistoryRow } from '@/lib/supabase/tables';
import { planBillPayment } from '@/lib/expenses/pay';
import { Receipt, CalendarDays } from 'lucide-react';
import { sortBills, BILL_SORT_LABELS, type BillSort } from '@/lib/billing/parse';
import { PAID_BY_OPTIONS, SHARED_SCOPES, ownerShareAmount, paidByLabel } from '@/lib/expenses/sharing';
import { athensToday, daysUntil } from '@/lib/core/time';
import { deriveMonthlyByCategory, monthlyTotals, averageMonthly } from '@/lib/bills/monthlyHistory';

const MONTHS_GR =['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος','Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος'];

// Κατηγορία λογαριασμού → ομάδα/κατηγορία Δαπανών (ίδια λογική με scan/τράπεζα).
// ΤΟ BILL_GROUP ΕΦΥΓΕ. Ήταν αντίγραφο του EXPENSE_MAP (lib/billing/parse.ts)
// με μία διαφορά: του έλειπε το κλειδί `other`, οπότε ο λογαριασμός «Άλλο»
// έπεφτε σε fallback `fixed` και γινόταν εκπεστέος. Η ταξινόμηση ζει τώρα
// στο lib/expenses/pay.ts (billCategory), με tests.

const fmtDateGR = (iso: string) => iso ? new Date(iso).toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

// Ο λογαριασμός ΕΙΝΑΙ η γραμμή του πίνακα `bills`, όχι μια δεύτερη περιγραφή
// της. Η χειρόγραφη εκδοχή που ζούσε εδώ είχε μείνει πίσω κατά τέσσερις στήλες
// (paid_by, share_percent, share_note, paid_at) — γι' αυτό η οθόνη τις διάβαζε
// με `(b as any).paid_by`, δηλαδή παρακάμπτοντας τον τύπο που η ίδια όρισε.
type BillEntry = BillsRow;
interface Props { propertyId: string; userId: string; propertyName?: string; propertyAddress?: string; }

const CATEGORIES = [
  { value: 'electricity', label: 'Ρεύμα',                       icon: 'bolt',                    color: '#f9ab00' },
  { value: 'common',      label: 'Κοινόχρηστα',                  icon: 'building',                color: 'var(--text-secondary)' },
  { value: 'internet',    label: 'Διαδίκτυο και τηλεόραση',       icon: 'wifi',                    color: 'var(--accent)' },
  { value: 'water',       label: 'Νερό',                         icon: 'drop',                    color: '#12b5cb' },
  { value: 'gas',         label: 'Αέριο και θέρμανση',            icon: 'flame',                   color: '#d93025' },
  { value: 'insurance',   label: 'Ασφάλεια',                     icon: 'shield',                  color: '#00897b' },
  { value: 'security',    label: 'Συναγερμός',                    icon: 'lock',                    color: '#9334e6' },
  { value: 'streaming',   label: 'Συνδρομές',                     icon: 'device-tv',               color: '#a142f4' },
  { value: 'enfia',       label: 'ΕΝΦΙΑ',                        icon: 'landmark',                color: 'var(--text-tertiary)' },
  { value: 'dimotika',    label: 'Δημοτικά Τέλη',               icon: 'building-community',      color: 'var(--text-tertiary)' },
  { value: 'cleaning',    label: 'Καθαρισμός',                   icon: 'sparkles',                color: '#7cb342' },
  { value: 'garden',      label: 'Κήπος',                        icon: 'plant',                   color: '#188038' },
  { value: 'pool',        label: 'Πισίνα',                       icon: 'pool',                    color: '#039be5' },
  { value: 'elevator',    label: 'Ανελκυστήρας',                 icon: 'elevator',                color: '#7e57c2' },
  { value: 'ac_service',  label: 'Σέρβις Κλιματιστικού',         icon: 'air-conditioning',        color: '#4fc3f7' },
  { value: 'renovation',  label: 'Ανακαίνιση / Επισκευή',        icon: 'hammer',                  color: '#e8710a' },
  { value: 'pest',        label: 'Απεντόμωση',                   icon: 'bug',                     color: '#795548' },
  { value: 'other',       label: 'Άλλο',                         icon: 'package',                 color: '#babdc2' },
];

const CAT_OPTIONS = CATEGORIES.map(c => ({ value: c.value, label: c.label }));
const VAT_OPTIONS = [
  { value: '6',  label: 'ΦΠΑ 6% (Ρεύμα, Αέριο)' },
  { value: '13', label: 'ΦΠΑ 13%'                },
  { value: '24', label: 'ΦΠΑ 24% (Γενικό)'       },
  { value: '0',  label: 'Χωρίς ΦΠΑ'              },
];
/**
 * Οι περίοδοι που μπορεί να διαλέξει ο χρήστης.
 *
 * Η ΧΡΟΝΙΑ ΗΤΑΝ ΚΑΡΦΩΜΕΝΗ ΣΤΟ 2026. Δύο συνέπειες, καμία ορατή σε δοκιμή:
 *   • Την 1η Ιανουαρίου 2027 η λίστα θα εξακολουθούσε να προσφέρει μόνο μήνες
 *     του 2026 — δηλαδή κάθε νέος λογαριασμός θα έπαιρνε λάθος περίοδο, ή ο
 *     χρήστης θα κατέφευγε στο «Προσαρμοσμένο» για κάθε μήνα.
 *   • Ήδη σήμερα, όποιος καταχωρεί περσινό λογαριασμό δεν έβρισκε τον μήνα του.
 *
 * Τώρα η λίστα χτίζεται από τη ΣΗΜΕΡΙΝΗ χρονιά: πέρσι, φέτος, του χρόνου. Ο
 * τρέχων μήνας μπαίνει πρώτος, γιατί αυτόν καταχωρεί ο κόσμος στο 90% των
 * περιπτώσεων· η υπόλοιπη σειρά είναι χρονολογική, νεότερα πρώτα.
 */
function periodOptions(today: Date): { value: string; label: string }[] {
  const y = today.getFullYear();
  const all: string[] = [];
  for (const year of [y + 1, y, y - 1]) {
    for (let m = 11; m >= 0; m--) all.push(`${MONTHS_GR[m]} ${year}`);
  }
  const current = `${MONTHS_GR[today.getMonth()]} ${y}`;
  const ordered = [current, ...all.filter(p => p !== current)];
  return [
    { value: '', label: '— Επιλογή περιόδου —' },
    ...ordered.map(p => ({ value: p, label: p })),
    { value: 'custom', label: 'Προσαρμοσμένο' },
  ];
}
const PERIOD_OPTIONS = periodOptions(new Date());
// ΤΙ ΕΦΥΓΕ ΑΠΟ ΕΔΩ ΚΑΙ ΓΙΑΤΙ. Υπήρχε πίνακας MARKET_BENCHMARKS με δέκα καρφωμένα
// ποσά (ρεύμα 45, κοινόχρηστα 40, ίντερνετ 25…) που παρουσιαζόταν στον χρήστη ως
// «Μέσος Όρος Αγοράς»: σε σειρά γραφήματος, σε ειδοποίηση «30%+ πάνω από τον μέσο
// όρο αγοράς», και σε στήλη του Excel. Δεν προερχόταν από κανένα δεδομένο.
//
// Ένας ιδιοκτήτης με δίκλινο στην Κοζάνη και ένας με ρετιρέ στο Κολωνάκι έβλεπαν
// τον ίδιο «μέσο όρο». Όποιος το καταλάβει μία φορά, σταματά να πιστεύει ΚΑΙ τα
// σωστά νούμερα της οθόνης — και έχει δίκιο.
//
// Η αντικατάσταση είναι ο ΔΙΚΟΣ ΤΟΥ μέσος όρος δωδεκαμήνου ανά κατηγορία: αληθινό
// δεδομένο, και πιο χρήσιμο, γιατί η ερώτηση που κάνει ο ιδιοκτήτης δεν είναι
// «πληρώνω περισσότερα από την Ελλάδα;» αλλά «πληρώνω περισσότερα από ό,τι
// συνήθως;». Όταν δεν υπάρχει αρκετό ιστορικό, ΔΕΝ δείχνουμε σύγκριση.
const MIN_MONTHS_FOR_BASELINE = 3;

// Η στήλη `category` δέχεται κενό στη βάση. Χωρίς αυτό στον τύπο, κάθε κλήση
// χρειαζόταν `!` ή cast — δηλαδή η υπόσχεση «πάντα υπάρχει» που η βάση δεν δίνει.
// Η ΑΡΧΙΚΗ ΦΟΡΜΑ, ΜΙΑ ΦΟΡΑ. Ήταν γραμμένη δύο φορές, ολόκληρη: στην αρχική
// κατάσταση και στο καθάρισμα μετά την αποθήκευση. Ένα πεδίο που προστίθεται
// στη μία και ξεχνιέται στην άλλη μένει με την παλιά του τιμή στην επόμενη
// καταχώριση — δηλαδή ο επόμενος λογαριασμός γεννιέται με ξένα στοιχεία.
const EMPTY_FORM = {
  category: 'electricity', name: '', amount: '', kwh: '',
  period: '', date_from: '', due_date: '', recurring: true,
  notes: '', vat_rate: '6', ert: '', etmear: '', dimotika_amt: '',
  paid_by: 'owner', share_percent: '', share_note: '',
};
type BillForm = typeof EMPTY_FORM;

/** Οι τρεις όψεις του γραφήματος, δηλωμένες μία φορά και ως τύπος. */
const CHART_VIEWS = [
  { id: 'area',     label: 'Τάση'       },
  { id: 'bar',      label: 'Μηνιαίο'    },
  { id: 'category', label: 'Κατηγορίες' },
] as const;
type ChartView = typeof CHART_VIEWS[number]['id'];

const cat = (v: string | null) => CATEGORIES.find(c => c.value === v) || CATEGORIES[CATEGORIES.length - 1];

const CatIcon = ({ name, size = 14, color }: { name: string; size?: number; color?: string }) => {
  const icons: Record<string, string> = {
    bolt:                'M13 2L4.5 13.5H11L10 22L19.5 10.5H13Z',
    building:            'M3 21h18M5 21V7l8-4 8 4v14M9 21V15h6v6',
    wifi:                'M12 18h.01M8.5 14.5A5.5 5.5 0 0 1 12 13a5.5 5.5 0 0 1 3.5 1.5M5 11a9 9 0 0 1 14 0',
    drop:                'M12 2S5 11 5 15a7 7 0 0 0 14 0c0-4-7-13-7-13z',
    flame:               'M8.5 14c.5-2 2-4 3.5-6 1.5 2 3 4 3.5 6a3.5 3.5 0 0 1-7 0z',
    shield:              'M12 3l8 4v5c0 5-3.5 9.7-8 11-4.5-1.3-8-6-8-11V7l8-4z',
    lock:                'M5 11V7a7 7 0 0 1 14 0v4M3 11h18v10H3z',
    'device-tv':         'M21 7H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1zM9 21h6',
    landmark:            'M3 21h18M6 21V11M18 21V11M12 21V5M3 11l9-7 9 7',
    'building-community':'M3 21h18M5 21V9l7-4 7 4v12',
    sparkles:            'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z',
    plant:               'M12 22V12M12 12C12 7 7 4 7 4s0 5 5 8M12 12c0-5 5-8 5-8s0 5-5 8',
    pool:                'M2 12h20M2 17h20M5 7l7 5 7-5',
    elevator:            'M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM9 8l3-3 3 3M9 16l3 3 3-3',
    'air-conditioning':  'M9 6h6M9 18h6M3 12h18M6 8l-3 4 3 4M18 8l3 4-3 4',
    hammer:              'M9.5 14.5L3 21M14.5 9.5l2-2M14 5l5 5-8.5 8.5-5-5L14 5z',
    bug:                 'M8 2l1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3.003 3.003 0 1 1 6 0v1M12 20c-3.3 0-6-2.7-6-6v-3a6 6 0 0 1 12 0v3c0 3.3-2.7 6-6 6zM12 20v2M8.5 18.5l-1 1.5M15.5 18.5l1 1.5',
    package:             'M21 8l-9-6-9 6v8l9 6 9-6V8zM3 8l9 6 9-6M12 14v8',
  };
  const d = icons[name] || icons.package;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <path d={d}/>
    </svg>
  );
};

/** Ό,τι χρειάζεται η εξαγωγή από μια κατηγορία — τυπωμένο, όχι `any[]`. */
interface CategoryTotals { label: string; monthly: number; benchmark: number; count?: number }

async function exportBillsExcel(bills: BillEntry[], historyTotals: number[], byCategory: CategoryTotals[], avgMonthly: number, propertyName: string) {
  const XLSX   = await import('xlsx');
  const wb     = XLSX.utils.book_new();
  const today  = new Date().toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' });
  const year   = new Date().getFullYear();
  const MONTHS_FULL = ['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος','Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος'];
  const MONTHS_SH   = ['Ιαν','Φεβ','Μαρ','Απρ','Μαΐ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];

  const now     = new Date();
  const totalM  = bills.filter(b => b.recurring).reduce((s, b) => s + b.amount, 0);
  const totalA  = totalM * 12;
  const unpaidA = bills.filter(b => !b.paid).reduce((s, b) => s + b.amount, 0);
  const paidA   = bills.filter(b => b.paid).reduce((s, b) => s + b.amount, 0);
  const overdue = bills.filter(b => !b.paid && b.due_date && new Date(b.due_date) < now);
  const dueSoon = bills.filter(b => !b.paid && b.due_date && (() => { const d = daysUntil(b.due_date!) ?? 0; return d >= 0 && d <= 7; })());
  const pending = bills.filter(b => !b.paid);
  const recurring = bills.filter(b => b.recurring);

  const summaryData: (string | number | null | undefined)[][] = [
    ['PROPERTY OS, ΑΝΑΦΟΡΑ ΛΟΓΑΡΙΑΣΜΩΝ & ΠΑΓΙΩΝ ΔΑΠΑΝΩΝ', null, null, null, null],
    [''],
    ['Ακίνητο', propertyName, null, 'Ημερομηνία Έκδοσης', today],
    ['Έτος Αναφοράς', year, null, 'Σύνολο Λογαριασμών', bills.length],
    [''],
    ['━━━ ΟΙΚΟΝΟΜΙΚΗ ΣΥΝΟΨΗ ━━━', null, null, null, null],
    ['Μηνιαίο Πάγιο Κόστος (€)', totalM, null, 'Εκτιμώμενο Ετήσιο Κόστος (€)', totalA],
    ['Εκκρεμείς Πληρωμές (€)', unpaidA, null, 'Πληρωμένοι Λογαριασμοί (€)', paidA],
    ['Μέσο Μηνιαίο (Ιστορικό) (€)', avgMonthly, null, 'Ληξιπρόθεσμοι', overdue.length],
    ['Λήγουν εντός 7 ημερών', dueSoon.length, null, 'Πάγιοι Λογαριασμοί', recurring.length],
    [''],
    ['━━━ ΚΑΤΑΝΟΜΗ ΑΝΑ ΚΑΤΗΓΟΡΙΑ ━━━', null, null, null, null],
    ['Κατηγορία', 'Λογαριασμοί', 'Μηνιαίο (€)', 'Ετήσιο (€)', 'Δικός σου μέσος όρος (€)', 'Απόκλιση %', '% Συνόλου'],
    ...[...byCategory]
      .sort((a, b) => b.monthly - a.monthly)
      .map(c => {
        const deviation = c.benchmark > 0 ? Math.round((c.monthly / c.benchmark - 1) * 100) : 0;
        const pctTotal  = totalM > 0 ? Math.round((c.monthly / totalM) * 100) : 0;
        return [c.label, c.count || 1, c.monthly, c.monthly * 12, c.benchmark || 0, deviation, pctTotal];
      }),
    [''],
    ['━━━ ΙΣΤΟΡΙΚΟ ΚΟΣΤΟΥΣ ' + year + ' ━━━', null, null, null, null, null, null, null, null, null, null, null, null, null],
    ['', ...MONTHS_SH, 'Σύνολο Έτους'],
    ['Κόστος (€)', ...historyTotals, historyTotals.reduce((a, b) => a + b, 0)],
    ['Σε σχέση με τον Μέσο Όρο', ...historyTotals.map(v => v > 0 ? Math.round((v / avgMonthly - 1) * 100) + '%' : fp(0)), null],
    [''],
    ['━━━ ΕΙΔΟΠΟΙΗΣΕΙΣ ━━━', null, null, null, null],
    overdue.length > 0 ? [`⚠ ${overdue.length} ΛΗΞΙΠΡΟΘΕΣΜΟΙ ΛΟΓΑΡΙΑΣΜΟΙ, ΑΜΕΣΗ ΕΝΕΡΓΕΙΑ`, null, null, `Σύνολο: ${fe(overdue.reduce((s,b)=>s+b.amount,0), 2)}`, null] : ['✓ Δεν υπάρχουν ληξιπρόθεσμοι λογαριασμοί'],
    dueSoon.length > 0 ? [`! ${dueSoon.length} λογαριασμοί λήγουν εντός 7 ημερών`, null, null, `Σύνολο: ${fe(dueSoon.reduce((s,b)=>s+b.amount,0), 2)}`, null] : [],
  ].filter(row => row.length > 0);

  const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
  ws1['!cols'] = [{ wch: 36 }, { wch: 14 }, { wch: 6 }, { wch: 30 }, { wch: 14 }, { wch: 12 }, { wch: 12 }];
  ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Σύνοψη');

  const headers2 = ['Κατηγορία','Ονομασία ή πάροχος','Ποσό (€)','ΦΠΑ %','Περίοδος','Ημερομηνία Λήξης','Τύπος','Κατάσταση','Ημέρες έως Λήξη','Κατανάλωση (kWh)','Σημειώσεις'];
  const detailRows: (string | number | null | undefined)[][] = [headers2, ...bills
    .sort((a, b) => {
      const ad = a.due_date ? new Date(a.due_date).getTime() : 9e12;
      const bd = b.due_date ? new Date(b.due_date).getTime() : 9e12;
      return ad - bd;
    })
    .map(b => {
      const days = b.due_date ? daysUntil(b.due_date) ?? 0 : null;
      return [
        cat(b.category).label,
        b.name || cat(b.category).label,
        b.amount,
        b.vat_rate || 0,
        b.period || '',
        b.due_date ? new Date(b.due_date).toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' }) : '',
        b.recurring ? 'Πάγιο' : 'Εφάπαξ',
        b.paid ? 'Πληρωμένο' : (days !== null && days < 0 ? 'ΛΗΞΙΠΡΟΘΕΣΜΟΣ' : 'Εκκρεμεί'),
        days !== null ? days : '',
        b.kwh || '',
        b.notes || '',
      ];
    })
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(detailRows);
  ws2['!cols'] = [{ wch: 18 }, { wch: 34 }, { wch: 12 }, { wch: 8 }, { wch: 16 }, { wch: 22 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 36 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Αναλυτικά');

  const pendingData: (string | number | null | undefined)[][] = [
    ['ΕΚΚΡΕΜΕΙΣ & ΛΗΞΙΠΡΟΘΕΣΜΟΙ ΛΟΓΑΡΙΑΣΜΟΙ', null, null, null, null, null],
    [`${pending.length} εκκρεμείς · ${overdue.length} ληξιπρόθεσμοι · Εξαγωγή: ${today}`, null, null, null, null, null],
    [''],
    ['Κατάσταση', 'Κατηγορία', 'Ονομασία ή πάροχος', 'Ποσό (€)', 'Ημερομηνία Λήξης', 'Ημέρες έως Λήξη'],
    ...pending
      .sort((a, b) => {
        const ad = a.due_date ? new Date(a.due_date).getTime() : 0;
        const bd = b.due_date ? new Date(b.due_date).getTime() : 0;
        return ad - bd;
      })
      .map(b => {
        const days = b.due_date ? daysUntil(b.due_date) ?? 0 : null;
        return [
          days !== null && days < 0 ? '⚠ ΛΗΞΙΠΡΟΘΕΣΜΟΣ' : days !== null && days <= 7 ? '! ΛΗΓΕΙ ΣΥΝΤΟΜΑ' : 'Εκκρεμεί',
          cat(b.category).label,
          b.name || cat(b.category).label,
          b.amount,
          b.due_date ? new Date(b.due_date).toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—',
          days !== null ? (days < 0 ? `${Math.abs(days)} ημέρες πριν` : days === 0 ? 'ΣΗΜΕΡΑ' : `σε ${days} ημέρες`) : '—',
        ];
      }),
    [''],
    ['ΣΥΝΟΛΟ ΕΚΚΡΕΜΩΝ', null, null, unpaidA, null, null],
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(pendingData);
  ws3['!cols'] = [{ wch: 18 }, { wch: 18 }, { wch: 34 }, { wch: 12 }, { wch: 22 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Εκκρεμείς');

  if (recurring.length > 0) {
    const recurData: (string | number | null | undefined)[][] = [
      ['ΠΑΓΙΑ ΚΟΣΤΗ, ΜΗΝΙΑΙΕΣ ΔΑΠΑΝΕΣ', null, null, null, null],
      [`Ακίνητο: ${propertyName} · Σύνολο: ${fe(totalM, 2)} / μήνα`, null, null, null, null],
      [''],
      ['Κατηγορία', 'Ονομασία ή πάροχος', 'Μηνιαίο (€)', 'Ετήσιο (€)', '% Συνόλου'],
      ...recurring
        .sort((a, b) => b.amount - a.amount)
        .map(b => [
          cat(b.category).label,
          b.name || cat(b.category).label,
          b.amount,
          b.amount * 12,
          totalM > 0 ? Math.round((b.amount / totalM) * 100) + '%' : '0%',
        ]),
      [''],
      ['ΣΥΝΟΛΟ', null, totalM, totalA, '100%'],
    ];
    const ws4 = XLSX.utils.aoa_to_sheet(recurData);
    ws4['!cols'] = [{ wch: 18 }, { wch: 34 }, { wch: 14 }, { wch: 14 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws4, 'Πάγια Κόστη');
  }

  const histData: (string | number | null | undefined)[][] = [
    ['ΙΣΤΟΡΙΚΟ ΚΟΣΤΟΥΣ ' + year, null, null, null],
    [`Ακίνητο: ${propertyName} · Μέσος Όρος: ${fe(avgMonthly, 2)} / μήνα`, null, null, null],
    [''],
    ['Μήνας', 'Κόστος (€)', 'Μέσος Όρος (€)', 'Απόκλιση (€)', 'Απόκλιση %'],
    ...MONTHS_FULL.map((m, i) => {
      const val     = historyTotals[i] || 0;
      const devAbs  = val > 0 ? val - avgMonthly : null;
      const devPct  = val > 0 && avgMonthly > 0 ? Math.round((val / avgMonthly - 1) * 100) : null;
      return [m, val > 0 ? val : '', avgMonthly, devAbs !== null ? devAbs : '', devPct !== null ? devPct + '%' : ''];
    }),
    [''],
    ['Σύνολο Έτους', historyTotals.reduce((a, b) => a + b, 0), null, null, null],
  ];
  const ws5 = XLSX.utils.aoa_to_sheet(histData);
  ws5['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws5, 'Ιστορικό');

  const filename = `λογαριασμοι_${propertyName.replace(/\s+/g, '_')}_${athensToday()}.xlsx`;
  XLSX.writeFile(wb, filename);
}

// Το recharts δίνει το περιεχόμενο του tooltip ως στοιχείο και το καλεί με
// δικά του props. Περιγράφονται εδώ όσα ΔΙΑΒΑΖΕΙ αυτό το tooltip, και τίποτα
// άλλο: μια πλήρης αντιγραφή των τύπων της βιβλιοθήκης θα ήταν τρίτο αντίγραφο
// που παλιώνει με την επόμενη αναβάθμιση.
interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: { name?: string; value?: number; color?: string }[];
}

const ChartTooltip = ({ active, payload, label }: ChartTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '10px 14px', fontSize: 12, fontFamily: T.font.sans }}>
      <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }}/>
          <span style={{ color: 'var(--text-secondary)' }}>{p.name}:</span>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(p.value ?? 0, 0)}</span>
        </div>
      ))}
    </div>
  );
};


export default function BillsDashboard({ propertyId, userId, propertyName = 'Ακίνητό μου', propertyAddress = '' }: Props) {
  const supabase = createClient();
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear  = today.getFullYear();

  const [bills,    setBills]    = useState<BillEntry[]>([]);
  const [history,  setHistory]  = useState<Record<string, string[]>>(
    Object.fromEntries(CATEGORIES.map(c => [c.value, Array(12).fill('')]))
  );
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [billSort, setBillSort] = useState<BillSort>('received_desc');
  // Φίλτρο κατηγορίας πάνω στη ΜΙΑ λίστα. Πριν, για να δει κάποιος τη ΔΕΗ του
  // έπρεπε να διαλέξει καρτέλα «Ρεύμα» — που όμως δεν είχε τους λογαριασμούς
  // του, είχε σύγκριση τιμολογίων. Η κατηγορία είναι φίλτρο, όχι προορισμός.
  const [catFilter, setCatFilter] = useState<string>('all');
  const [chartView, setChartView] = useState<ChartView>('area');
  const [form, setForm] = useState<BillForm>(EMPTY_FORM);
  // Η φόρμα είναι ΟΛΗ κείμενο εκτός από δύο διακόπτες: τα ποσά μπαίνουν ως
// συμβολοσειρές και μετατρέπονται μία φορά, στην αποθήκευση.
type BillForm = typeof EMPTY_FORM;
const sf = <K extends keyof BillForm>(k: K, v: BillForm[K]) => setForm(f => ({ ...f, [k]: v }));

  const loadBills = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('bills').select('*').eq('property_id', propertyId).order('created_at', { ascending: false });
    if (!error && data) setBills(data);
    setLoading(false);
  }, [propertyId]);

  const loadHistory = useCallback(async () => {
    const { data, error } = await supabase.from('bills_history').select('*').eq('property_id', propertyId).eq('year', currentYear);
    if (!error && data) {
      const h = Object.fromEntries(CATEGORIES.map(c => [c.value, Array(12).fill('')]));
      (data as BillsHistoryRow[]).forEach(row => { if (row.category && h[row.category]) h[row.category][row.month] = (row.amount ?? 0) > 0 ? String(row.amount) : ''; });
      setHistory(h);
    }
  }, [propertyId, currentYear]);

  useEffect(() => {
    if (!propertyId) return;
    let mounted = true;

    loadBills();
    loadHistory();

    const channel = supabase
      .channel(`dashboard_bills_${propertyId}`)
      .on(
        'postgres_changes' as const,
        { event: '*', schema: 'public', table: 'bills', filter: `property_id=eq.${propertyId}` },
        () => { if (mounted) loadBills(); }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [propertyId, loadBills, loadHistory]);

  // Το `bills_history` ΔΙΑΒΑΖΕΤΑΙ αλλά δεν γράφεται πια από εδώ: ό,τι έχει
  // συμπληρώσει ο χρήστης μένει και υπερισχύει, νέα χειρόγραφη καταχώριση όμως
  // δεν ζητείται. Ήταν το ίδιο νούμερο, δεύτερη φορά, σε άλλο σχήμα.

  const addBill = async () => {
    if (!form.name || !form.amount) return;
    setSaving(true);
    const period = form.period === 'custom'
      ? (form.date_from && form.due_date ? `${fmtDateGR(form.date_from)}, ${fmtDateGR(form.due_date)}` : '')
      : form.period;
    const shared = SHARED_SCOPES.has(form.paid_by);
    const sharePercent = shared ? (form.share_percent ? parseFloat(form.share_percent) : 50) : null;
    const shareNote = shared ? (form.share_note || null) : null;
    const payload = {
      property_id: propertyId, user_id: userId,
      category: form.category, name: form.name, amount: parseFloat(form.amount),
      vat_rate: parseInt(form.vat_rate), period: period || null, due_date: form.due_date || null,
      paid: false, recurring: form.recurring, notes: form.notes || null,
      kwh: form.kwh ? parseFloat(form.kwh) : null,
      ert: form.ert ? parseFloat(form.ert) : null,
      etmear: form.etmear ? parseFloat(form.etmear) : null,
      dimotika: form.dimotika_amt ? parseFloat(form.dimotika_amt) : null,
      paid_by: form.paid_by, share_percent: sharePercent, share_note: shareNote,
    };
    const { data, error } = await supabase.from('bills').insert(payload).select().single();
    // ΧΩΡΙΣ ΑΥΤΟ ΤΟ ΣΚΕΛΟΣ, Η ΑΠΟΤΥΧΙΑ ΗΤΑΝ ΑΟΡΑΤΗ.
    // Το `if (!error && data)` δεν είχε else: σε σφάλμα ο κώδικας συνέχιζε στο
    // setForm(αρχικές τιμές) και setShowForm(false). Ο χρήστης είχε μόλις
    // πληκτρολογήσει όνομα, ποσό, ΦΠΑ, περίοδο, ημερομηνία λήξης, kWh, ΕΡΤ,
    // ΕΤΜΕΑΡ και δημοτικά — και τα έβλεπε να εξαφανίζονται χωρίς μήνυμα.
    if (error || !data) {
      notifyError('Ο λογαριασμός δεν αποθηκεύτηκε. Δοκίμασε ξανά — τα στοιχεία σου παραμένουν στη φόρμα.');
      setSaving(false);
      return;
    }
    if (data) {
      setBills(prev => [data, ...prev]);
      // Ο λογαριασμός σώθηκε ήδη. Αν λείψει η δαπάνη, ο χρήστης πρέπει να το
      // μάθει εδώ — αλλιώς λείπει από τα βιβλία και κανείς δεν ξέρει γιατί.
      if (payload.paid) {
        await saved('Ο λογαριασμός αποθηκεύτηκε, αλλά η δαπάνη δεν καταχωρήθηκε', supabase.from('expenses').insert({
          property_id: propertyId, user_id: userId, amount: parseFloat(form.amount),
          description: form.name, date: athensToday(),
          category: cat(form.category).label, expense_group: 'bills',
          paid_by: form.paid_by, share_percent: sharePercent, share_note: shareNote,
        }));
      }
    }
    setForm(EMPTY_FORM);
    setShowForm(false);
    setSaving(false);
  };

  const togglePaid = async (id: string) => {
    const bill = bills.find(b => b.id === id);
    if (!bill) return;
    const newPaid = !bill.paid;
    setBills(prev => prev.map(b => b.id === id ? { ...b, paid: newPaid } : b));
    // Η οθόνη άλλαξε πριν από τη βάση. Αν η βάση δεν ακολουθήσει, η οθόνη
    // γυρίζει πίσω — αλλιώς δείχνει πληρωμένο κάτι που δεν είναι.
    if (!await saved('Ο λογαριασμός δεν ενημερώθηκε', supabase.from('bills')
      .update({ paid: newPaid, paid_at: newPaid ? new Date().toISOString() : null }).eq('id', id))) {
      setBills(prev => prev.map(b => b.id === id ? { ...b, paid: bill.paid } : b));
      return;
    }

    // Cascade (undo-safe): το συνδεδεμένο έξοδο & γεγονός ημερολογίου ακολουθούν
    // την κατάσταση του λογαριασμού μέσω bill_id. Καμία διπλοεγγραφή.
    const expHit = await savedData<{ id: string }[]>('Η συνδεδεμένη δαπάνη δεν ενημερώθηκε',
      supabase.from('expenses').update({ paid: newPaid }).eq('bill_id', id).select('id'));
    await saved('Το γεγονός ημερολογίου δεν ενημερώθηκε',
      supabase.from('calendar_events').update({ status: newPaid ? 'paid' : 'pending' }).eq('bill_id', id));

    // Αν το σημειώνουμε πληρωμένο και ΔΕΝ υπάρχει συνδεδεμένο έξοδο, το
    // δημιουργούμε — από την ΙΔΙΑ απόφαση με την οθόνη Δαπανών.
    //
    // Το παλιό BILL_GROUP εδώ δεν είχε κλειδί `other` και έπεφτε σε
    // { group: 'fixed' }. Επειδή το 'fixed' εκπίπτει και το 'other' δεν
    // εκπίπτει, κάθε λογαριασμός «Άλλο» γινόταν σιωπηλά εκπεστέος.
    if (newPaid && (!expHit || !expHit.length)) {
      const plan = planBillPayment(bill as never, {
        propertyId, userId, nowIso: new Date().toISOString(), hasLinkedExpense: false,
      });
      if (plan.newExpense) {
        const { error } = await supabase.from('expenses').insert(plan.newExpense);
        if (error) notifyError('Ο λογαριασμός σημειώθηκε πληρωμένος, αλλά η δαπάνη δεν καταχωρήθηκε.');
      }
    }
  };

  const deleteBill = async (id: string) => {
    const gone = bills.find(b => b.id === id);
    setBills(prev => prev.filter(b => b.id !== id));
    // Η γραμμή έφυγε από την οθόνη. Αν δεν έφυγε από τη βάση, επιστρέφει —
    // αλλιώς ξαναεμφανίζεται μόνη της στην επόμενη φόρτωση.
    if (!await saved('Ο λογαριασμός δεν διαγράφηκε', supabase.from('bills').delete().eq('id', id)) && gone)
      setBills(prev => [gone, ...prev].sort((a, b) => (b.due_date || '').localeCompare(a.due_date || '')));
  };

  const calc = useMemo(() => {
    const totalMonthly = bills.filter(b => b.recurring).reduce((s, b) => s + b.amount, 0);
    const totalUnpaid  = bills.filter(b => !b.paid).reduce((s, b) => s + b.amount, 0);
    const totalPaid    = bills.filter(b => b.paid).reduce((s, b) => s + b.amount, 0);
    const overdue  = bills.filter(b => !b.paid && b.due_date && new Date(b.due_date) < today);
    const dueSoon  = bills.filter(b => !b.paid && b.due_date && new Date(b.due_date) >= today && new Date(b.due_date) <= new Date(today.getTime() + 7 * 86400000));
    const byCategory = CATEGORIES.map(c => ({
      ...c,
      monthly: bills.filter(b => b.category === c.value && b.recurring).reduce((s, b) => s + b.amount, 0),
      // Ο δικός του μέσος όρος από τους μήνες που ΕΧΟΥΝ στοιχεία. Κάτω από
      // MIN_MONTHS_FOR_BASELINE μένει 0, δηλαδή «καμία σύγκριση» — δεν εφευρίσκουμε βάση.
      benchmark: (() => {
        const vals = (deriveMonthlyByCategory(bills, currentYear, history)[c.value] || []).filter((v: number) => v > 0);
        if (vals.length < MIN_MONTHS_FOR_BASELINE) return 0;
        return vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
      })(),
    })).filter(c => c.monthly > 0);

    // ═══ ΤΟ ΙΣΤΟΡΙΚΟ ΔΕΝ ΖΗΤΙΕΤΑΙ ΠΙΑ, ΥΠΟΛΟΓΙΖΕΤΑΙ ═══════════════════════════
    // Ήταν άθροισμα 204 πεδίων που συμπλήρωνε ο χρήστης με το χέρι, ξαναγράφοντας
    // ποσά που είχε ήδη καταχωρίσει δέκα εκατοστά πιο πάνω. Όποιος δεν το έκανε
    // έβλεπε «Μέσο μηνιαίο 0,00 €» για πάντα, δίπλα σε λίστα γεμάτη λογαριασμούς.
    // Ό,τι έχει ήδη γραφτεί στο `bills_history` υπερισχύει — δεν σβήνουμε δουλειά
    // που έγινε, σταματάμε μόνο να τη ζητάμε.
    const monthlyByCat = deriveMonthlyByCategory(bills, currentYear, history);
    const historyTotals = monthlyTotals(monthlyByCat);
    const avgMonthly = averageMonthly(historyTotals) || totalMonthly;
    const maxHistory = Math.max(...historyTotals, totalMonthly, 1);

    const alerts: { type: 'danger' | 'warning' | 'info'; msg: string; bill?: string }[] = [];
    if (overdue.length > 0) {
      alerts.push({ type: 'danger', msg: `${overdue.length} ληξιπρόθεσμος/-οι: ${overdue.map(b => b.name).join(', ')}, Σύνολο: ${fe(overdue.reduce((s, b) => s + b.amount, 0), 0)}` });
    }
    dueSoon.forEach(b => {
      const daysLeft = b.due_date ? daysUntil(b.due_date) ?? 0 : null;
      const msg = daysLeft === 0 ? `"${b.name}" λήγει ΣΗΜΕΡΑ, ${fe(b.amount, 0)}`
                : daysLeft === 1 ? `"${b.name}" λήγει ΑΥΡΙΟ, ${fe(b.amount, 0)}`
                : `"${b.name}" σε ${daysLeft} ημέρες, ${fe(b.amount, 0)}`;
      alerts.push({ type: 'warning', msg, bill: b.id });
    });
    byCategory.forEach(c => {
      // Η ειδοποίηση υπέρβασης ορίου έφυγε μαζί με τον πίνακα ορίων: το όριο
      // ορίζεται στην καρτέλα «Προϋπολογισμός». Μένει η σύγκριση με τον ΔΙΚΟ ΤΟΥ
      // μέσο όρο, που δεν είναι στόχος αλλά μέτρηση.
      if (c.benchmark > 0 && c.monthly > c.benchmark * 1.3) alerts.push({ type: 'info', msg: `${c.label}: ${fe(c.monthly)} τον μήνα, πάνω από 30% σε σχέση με τον δικό σου μέσο όρο (${fe(c.benchmark)})` });
    });

    const areaData = MONTHS_GR.map((m, i) => {
      const obj: Record<string, string | number> = { month: m };
      CATEGORIES.filter(c => monthlyByCat[c.value]?.some((v: number) => v > 0)).forEach(c => {
        obj[c.label] = monthlyByCat[c.value]?.[i] || 0;
      });
      obj['Σύνολο'] = historyTotals[i];
      return obj;
    });

    const categoryData = byCategory.map(c => ({
      name: c.label, monthly: c.monthly, benchmark: c.benchmark, color: c.color,
      pct: c.benchmark > 0 ? Math.round((c.monthly / c.benchmark - 1) * 100) : 0,
    }));

    return { totalMonthly, totalUnpaid, totalPaid, overdue, dueSoon, byCategory, historyTotals, monthlyByCat, avgMonthly, maxHistory, alerts, areaData, categoryData };
  }, [bills, history, currentYear]);

  // Οι κατηγορίες που όντως υπάρχουν στους λογαριασμούς, με το πλήθος τους, στη
  // σειρά του καταλόγου (όχι σε σειρά εισαγωγής — αλλιώς χοροπηδούν τα κουμπιά).
  const presentCats = useMemo(() => CATEGORIES
    .map(c => ({ value: c.value, label: c.label, count: bills.filter(b => b.category === c.value).length }))
    .filter(c => c.count > 0), [bills]);

  const visibleBills = useMemo(
    () => catFilter === 'all' ? bills : bills.filter(b => b.category === catFilter),
    [bills, catFilter],
  );

  const secHdr = (label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontFamily: T.font.sans }}>{label}</span>
    </div>
  );

  // Σκελετός αντί για γυμνό spinner: το σχήμα (KPIs + λίστα λογαριασμών) είναι
  // σταθερό, οπότε η διάταξη δεν «πηδά» μόλις φτάσουν τα δεδομένα.
  if (loading) return (
    <>
      <SkeletonKPIs n={4} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{[0, 1, 2, 3].map(i => <Skeleton key={i} h={58} r={12} />)}</div>
    </>
  );

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {calc.alerts.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {(['danger','warning','info'] as const).map(type => {
            const group = calc.alerts.filter(a => a.type === type);
            if (group.length === 0) return null;
            const bg     = type === 'danger'  ? 'rgba(197,34,31,0.06)'  : type === 'warning' ? 'rgba(242,153,0,0.06)'  : 'rgba(26,115,232,0.05)';
            const border = type === 'danger'  ? 'rgba(197,34,31,0.2)'   : type === 'warning' ? 'rgba(242,153,0,0.2)'   : 'rgba(26,115,232,0.15)';
            const col    = type === 'danger'  ? 'var(--negative)'        : type === 'warning' ? 'var(--warning)'        : 'var(--accent)';
            const label  = type === 'danger'  ? 'Ληξιπρόθεσμα'          : type === 'warning' ? 'Προσεχείς πληρωμές'   : 'Πληροφορίες';
            return (
              <div key={type} style={{ background: bg, border: `1px solid ${border}`, borderRadius: T.radius.inner, padding: '12px 16px', marginBottom: 8 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: col, textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 8, fontFamily: T.font.sans }}>{label}</div>
                {group.map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: i > 0 ? 6 : 0, marginTop: i > 0 ? 6 : 0, borderTop: i > 0 ? `1px solid ${border}` : 'none' }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: col, flexShrink: 0 }}/>
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)', fontFamily: T.font.sans }}>{a.msg}</span>
                    {a.bill && (
                      <button onClick={() => togglePaid(a.bill!)}
                        style={{ fontSize: 10, color: 'var(--accent)', background: 'rgba(26,115,232,0.1)', border: '1px solid rgba(26,115,232,0.3)', borderRadius: T.radius.badge, padding: '4px 12px', cursor: 'pointer', fontFamily: T.font.sans, fontWeight: 700, whiteSpace: 'nowrap' as const, flexShrink: 0 }}>
                        Πληρώθηκε
                      </button>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Πάγια τον μήνα', value: fe(calc.totalMonthly), sub: `${fe(calc.totalMonthly * 12)} τον χρόνο`,             neg: false },
          { label: 'Εκκρεμείς',      value: fe(calc.totalUnpaid),  sub: `${bills.filter(b => !b.paid).length} λογαριασμοί`,     neg: calc.totalUnpaid > 0 },
          { label: 'Πληρωμένοι',     value: fe(calc.totalPaid),    sub: `${bills.filter(b => b.paid).length} λογαριασμοί`,      neg: false },
          // ΤΟ «ΜΕΣΟ ΜΗΝΙΑΙΟ» ΕΦΥΓΕ. Ήταν το τέταρτο πλακίδιο εδώ ΚΑΙ το πρώτο
          // από τα τρία κάτω από τον πίνακα ιστορικού: το ίδιο νούμερο, δύο
          // φορές στην ίδια οθόνη, με την ίδια ετικέτα.
        ].map((k, i) => (
          <div key={i} className="po-fig-card" tabIndex={0} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '16px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>{k.label}</div>
            <div className="po-fig" data-tone={k.neg ? 'negative' : undefined} style={{ fontSize: 22, fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginBottom: 6 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <BillsPDFExport userId={userId} data={{ propertyName, propertyAddress, bills, totalMonthly: calc.totalMonthly, totalAnnual: calc.totalMonthly * 12, avgMonthly: calc.avgMonthly, historyTotals: calc.historyTotals }}/>
          <button onClick={() => exportBillsExcel(bills, calc.historyTotals, calc.byCategory, calc.avgMonthly, propertyName)}
            style={{ padding: '8px 16px', borderRadius: T.radius.btn, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.font.sans, transition: 'all 0.15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-elevated)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}>
            Εξαγωγή σε Excel
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* ═══ ΤΟ BUDGET ΕΧΕΙ ΔΙΚΗ ΤΟΥ ΚΑΡΤΕΛΑ, ΔΙΠΛΑ ══════════════════════
              Εδώ υπήρχε κουμπί «Όρια Budget» που άνοιγε πίνακα με δεκαοκτώ πεδία
              ορίων ανά κατηγορία — ολόκληρος προϋπολογισμός, μέσα στην οθόνη των
              συμβολαίων, ενώ η καρτέλα «Προϋπολογισμός» είναι η ΑΜΕΣΩΣ διπλανή.
              Το ίδιο εργαλείο σε δύο σημεία σημαίνει δύο πιθανές απαντήσεις στο
              «πού ορίζω το όριό μου», και μία από τις δύο θα είναι λάθος. */}
          {!showForm ? (
            <button onClick={() => setShowForm(true)}
              style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: T.radius.pill, padding: '0 22px', height: T.h.md, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' as const }}>
              Προσθήκη λογαριασμού
            </button>
          ) : (
            <button onClick={() => setShowForm(false)}
              style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.btn, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.font.sans }}>
              Κλείσιμο
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--accent)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 18, fontFamily: T.font.sans }}>Νέος Λογαριασμός / Πάγιο</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 2fr 1fr 1.4fr', gap: 10, marginBottom: 12 }}>
            <CustomSelect label="Κατηγορία λογαριασμού" value={form.category} onChange={v => sf('category', v)} options={CAT_OPTIONS}/>
            <TextInput label="Ονομασία ή πάροχος" value={form.name} onChange={v => sf('name', v)} placeholder="Παράδειγμα: ΔΕΗ Πράσινο Ιουνίου"/>
            <NumberInput label="Ποσό" value={form.amount} onChange={v => sf('amount', v)} suffix="€" step={1}/>
            <CustomSelect label="Συντελεστής ΦΠΑ" value={form.vat_rate} onChange={v => sf('vat_rate', v)} options={VAT_OPTIONS}/>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: form.period === 'custom' ? '1fr 1fr 1fr auto 1fr' : '1fr 1fr auto 1fr', gap: 10, marginBottom: 12, alignItems: 'flex-start' }}>
            <CustomSelect label="Περίοδος" value={form.period} onChange={v => {
              sf('period', v);
              if (v !== 'custom') sf('date_from', '');
            }} options={PERIOD_OPTIONS}/>
            {form.period === 'custom' ? (
              <DatePicker label="Ημερομηνία έναρξης" value={form.date_from} onChange={v => sf('date_from', v)}/>
            ) : (
              <DatePicker label="Ημερομηνία λήξης" value={form.due_date} onChange={v => sf('due_date', v)}/>
            )}
            {form.period === 'custom' && (
              <DatePicker label="Ημερομηνία λήξης" value={form.due_date} onChange={v => sf('due_date', v)}/>
            )}
            <div style={{ paddingTop: 22 }}><Toggle on={form.recurring} onChange={v => sf('recurring', v)} label="Πάγιο" labelOff="Εφάπαξ"/></div>
            <TextInput label="Σημειώσεις" value={form.notes} onChange={v => sf('notes', v)} placeholder="Παράδειγμα: δόση…"/>
          </div>
          {form.category === 'electricity' && (
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 12, fontFamily: T.font.sans }}>Λεπτομέρειες Ρεύματος</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10, marginBottom: 10 }}>
                <NumberInput label="Κατανάλωση" value={form.kwh}         onChange={v => sf('kwh', v)}         suffix="kWh" step={0.01}/>
                <NumberInput label="ΕΡΤ"           value={form.ert}         onChange={v => sf('ert', v)}         suffix="€"   step={0.01}/>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10 }}>
                <NumberInput label="ΕΤΜΕΑΡ"        value={form.etmear}      onChange={v => sf('etmear', v)}      suffix="€"   step={0.01}/>
                <NumberInput label="Δημοτικά τέλη"      value={form.dimotika_amt} onChange={v => sf('dimotika_amt', v)} suffix="€"  step={0.01}/>
              </div>
            </div>
          )}
          {/* Διαμοιρασμός λογαριασμού — ίδιο μοντέλο με τις δαπάνες */}
          <div style={{ display: 'grid', gridTemplateColumns: SHARED_SCOPES.has(form.paid_by) ? '1.4fr 1fr 2fr' : '1.4fr', gap: 10, marginBottom: 12, alignItems: 'flex-start' }}>
            <CustomSelect label="Ποιος πληρώνει" value={form.paid_by} onChange={v => sf('paid_by', v)} options={PAID_BY_OPTIONS}/>
            {SHARED_SCOPES.has(form.paid_by) && <>
              <NumberInput label="Το μερίδιό μου" value={form.share_percent} onChange={v => sf('share_percent', v)} placeholder="50" suffix="%" step={1} max={100}/>
              <TextInput label="Μοιρασμένο με" value={form.share_note} onChange={v => sf('share_note', v)} placeholder="Παράδειγμα: συνιδιοκτήτης, ενοικιαστής"/>
            </>}
          </div>
          {SHARED_SCOPES.has(form.paid_by) && form.amount && parseFloat(form.amount) > 0 && (
            <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>
              Δικό σου μερίδιο: <strong style={{ color: 'var(--text-primary)' }}>{fe(ownerShareAmount({ amount: parseFloat(form.amount), paid_by: form.paid_by, share_percent: form.share_percent ? parseFloat(form.share_percent) : null }))}</strong>
              <span style={{ color: 'var(--text-tertiary)' }}> από {fe(parseFloat(form.amount))} συνολικά</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setShowForm(false)} style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-default)', borderRadius: T.radius.btn, padding: '9px 16px', fontSize: 12, cursor: 'pointer', fontFamily: T.font.sans }}>Ακύρωση</button>
            <button onClick={addBill} disabled={!form.name || !form.amount || saving}
              style={{ background: (!form.name || !form.amount || saving) ? 'var(--bg-elevated)' : 'var(--accent)', color: (!form.name || !form.amount || saving) ? 'var(--text-tertiary)' : 'var(--accent-text)', border: 'none', borderRadius: T.radius.btn, padding: '9px 20px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans }}>
              {saving ? 'Αποθήκευση…' : 'Προσθήκη'}
            </button>
          </div>
        </div>
      )}

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', flex: 1, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>Καταχωρημένα</span>
          {bills.length > 1 && (
            <div style={{ minWidth: 170 }}>
              <CustomSelect value={billSort} onChange={v => setBillSort(v as BillSort)}
                options={(Object.keys(BILL_SORT_LABELS) as BillSort[]).map(k => ({ value: k, label: BILL_SORT_LABELS[k] }))} />
            </div>
          )}
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', padding: '2px 10px', borderRadius: T.radius.pill, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{visibleBills.length===1?'1 εγγραφή':`${visibleBills.length} εγγραφές`}</span>
        </div>

        {/* Φίλτρο κατηγορίας: μόνο οι κατηγορίες που ΕΧΟΥΝ λογαριασμούς. Δεκαοκτώ
            κουμπιά από τα οποία τα δεκαπέντε δεν οδηγούν πουθενά είναι θόρυβος. */}
        {presentCats.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {[{ value: 'all', label: 'Όλα', count: bills.length }, ...presentCats].map(c => {
              const on = catFilter === c.value;
              return (
                <button key={c.value} type="button" onClick={() => setCatFilter(c.value)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: T.h.sm, padding: '0 13px', borderRadius: T.radius.pill, border: `1px solid ${on ? 'var(--accent)' : 'var(--border-default)'}`, background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--accent-text)' : 'var(--text-secondary)', fontSize: 11.5, fontWeight: on ? 700 : 500, fontFamily: T.font.sans, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background 0.15s, color 0.15s' }}>
                  {c.label}
                  <span style={{ fontSize: 10, opacity: 0.75, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{c.count}</span>
                </button>
              );
            })}
          </div>
        )}

        {bills.length === 0 ? (
          <EmptyState
            icon={<Receipt size={20} />}
            title="Κανένας λογαριασμός ακόμη"
            hint="Πρόσθεσε τα συμβόλαια παρόχων και τα πάγια έξοδα του ακινήτου: ρεύμα, κοινόχρηστα, διαδίκτυο, ασφάλεια."
            /* Το κουμπί «Προσθήκη λογαριασμού» στέκει ήδη στη γραμμή εργαλείων,
               τριάντα εικονοστοιχεία πιο πάνω, με το ίδιο ακριβώς κείμενο. */
          />
        ) : visibleBills.length === 0 ? (
          <EmptyState
            icon={<Receipt size={20} />}
            title={`Δεν βρέθηκαν λογαριασμοί στην κατηγορία «${cat(catFilter).label}»`}
            hint="Δες όλες τις κατηγορίες μαζί, ή πρόσθεσε τον πρώτο λογαριασμό αυτής."
            action={<Btn onClick={() => setCatFilter('all')}>Όλες οι κατηγορίες</Btn>}
          />
        ) : (
          (['overdue','upcoming','paid'] as const).map(group => {
            const groupBills = sortBills(visibleBills.filter(b => {
              const isOverdue = !b.paid && b.due_date && new Date(b.due_date) < today;
              if (group === 'overdue')  return isOverdue;
              if (group === 'paid')     return b.paid;
              return !isOverdue && !b.paid;
            }), billSort);
            if (groupBills.length === 0) return null;
            const cfg = {
              overdue:  { label: 'Ληξιπρόθεσμοι', color: 'var(--negative)' },
              upcoming: { label: 'Εκκρεμείς',      color: 'var(--warning)'  },
              paid:     { label: 'Πληρωμένοι',     color: 'var(--text-secondary)' },
            }[group];
            return (
              <div key={group} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: cfg.color, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8, paddingBottom: 4, borderBottom: `1px solid ${cfg.color}25`, fontFamily: T.font.sans }}>
                  {cfg.label} · {groupBills.length}
                </div>
                {groupBills.map(b => {
                  const c = cat(b.category);
                  const daysLeft = b.due_date ? daysUntil(b.due_date) ?? 0 : null;
                  return (
                    <div key={b.id} className="po-fig-card" tabIndex={0} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto auto auto auto', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-subtle)', opacity: b.paid ? 0.55 : 1 }}>
                      <button onClick={() => togglePaid(b.id)} style={{ width: 22, height: 22, borderRadius: T.radius.badge, border: `2px solid ${b.paid ? 'var(--accent)' : 'var(--border-default)'}`, background: b.paid ? 'var(--accent)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {b.paid && <svg width="10" height="10" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/></svg>}
                      </button>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' as const, marginBottom: 3 }}>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--text-tertiary)', flexShrink: 0 }}/>
                          <span style={{ fontSize: 12, fontWeight: 600, textDecoration: b.paid ? 'line-through' : 'none', color: b.paid ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>{b.name}</span>
                          {b.recurring && <span style={{ fontSize: 8, background: 'var(--bg-overlay)', color: 'var(--text-tertiary)', padding: '1px 6px', borderRadius: 3, fontWeight: 600, fontFamily: T.font.sans }}>ΠΑΓΙΟ</span>}
                          {SHARED_SCOPES.has(b.paid_by || '') && <span title={b.share_note ? `Μοιρασμένο με ${b.share_note} · μερίδιό μου ${fe(ownerShareAmount({ amount: b.amount, paid_by: b.paid_by, share_percent: b.share_percent }))}` : 'Μοιρασμένος λογαριασμός'} style={{ fontSize: 8, background: 'var(--bg-overlay)', color: 'var(--text-secondary)', padding: '1px 6px', borderRadius: 3, fontWeight: 600, fontFamily: T.font.sans }}>μοιρασμένο · {b.share_percent != null ? b.share_percent : 50}%</span>}
                          <span style={{ fontSize: 8, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: T.radius.pill, fontWeight: 600, border: '1px solid var(--border-subtle)', fontFamily: T.font.sans }}>{c.label}</span>
                          {b.vat_rate ? <span title="Φόρος Προστιθέμενης Αξίας" style={{ fontSize: 8, color: 'var(--text-tertiary)', background: 'var(--bg-overlay)', padding: '1px 6px', borderRadius: 3, fontFamily: T.font.sans }}>ΦΠΑ {b.vat_rate}%</span> : null}
                        </div>
                        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' as const }}>
                          {b.period && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>{b.period}</span>}
                          {b.kwh && <span title="Κιλοβατώρες — μονάδα κατανάλωσης ηλεκτρικής ενέργειας" style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{b.kwh} kWh</span>}
                          {b.due_date && <span style={{ fontSize: 10, fontFamily: T.font.sans, color: daysLeft !== null && daysLeft < 0 ? 'var(--negative)' : daysLeft !== null && daysLeft <= 7 ? 'var(--warning)' : 'var(--text-tertiary)' }}>
                            {daysLeft !== null && daysLeft < 0 ? `${Math.abs(daysLeft)} ημέρες καθυστέρηση` : daysLeft === 0 ? 'Λήγει σήμερα' : daysLeft !== null ? `σε ${daysLeft} ημέρες` : new Date(b.due_date).toLocaleDateString('el-GR')}
                          </span>}
                          {b.notes && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>· {b.notes}</span>}
                        </div>
                      </div>
                      <span className="po-fig" data-tone={b.paid ? undefined : 'accent'} style={{ fontSize: 15, fontWeight: 700, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' as const }}>{fe(b.amount, 2)}</span>
                      {!b.paid && (
                        <button onClick={() => togglePaid(b.id)} style={{ fontSize: 10, color: 'var(--accent)', background: 'rgba(26,115,232,0.1)', border: '1px solid var(--accent)', borderRadius: T.radius.badge, padding: '5px 12px', cursor: 'pointer', fontFamily: T.font.sans, whiteSpace: 'nowrap' as const, fontWeight: 600 }}>
                          Πληρώθηκε
                        </button>
                      )}
                      <button
                        title="Αντιγραφή λογαριασμού"
                        onClick={() => {
                          setForm({
                            category: b.category || 'electricity',
                            name: b.name || '',
                            amount: String(b.amount || ''),
                            kwh: String(b.kwh || ''),
                            period: '',
                            date_from: '',
                            due_date: '',
                            recurring: b.recurring || false,
                            notes: b.notes || '',
                            vat_rate: String(b.vat_rate || '6'),
                            ert: String(b.ert || ''),
                            etmear: String(b.etmear || ''),
                            dimotika_amt: String(b.dimotika || ''),
                            paid_by: b.paid_by || 'owner',
                            share_percent: String(b.share_percent ?? ''),
                            share_note: b.share_note || '',
                          });
                          setShowForm(true);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        style={{ width: 26, height: 26, borderRadius: T.radius.badge, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(26,115,232,0.08)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)'; }}>
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                      </button>
                      <button onClick={() => deleteBill(b.id)} style={{ width: 26, height: 26, borderRadius: T.radius.badge, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(197,34,31,0.1)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--negative)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)'; }}>
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      {(calc.historyTotals.some(v => v > 0) || calc.byCategory.length > 0) && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', flex: 1, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>Ανάλυση & Γραφήματα</span>
            <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: 3, gap: 2, border: '1px solid var(--border-subtle)' }}>
              {CHART_VIEWS.map(v => (
                <button key={v.id} onClick={() => setChartView(v.id)}
                  style={{ padding: '5px 12px', borderRadius: T.radius.badge + 2, border: 'none', background: chartView === v.id ? 'var(--accent)' : 'transparent', color: chartView === v.id ? 'var(--accent-text)' : 'var(--text-secondary)', fontSize: 11, fontWeight: chartView === v.id ? 700 : 400, cursor: 'pointer', transition: 'all 0.15s', fontFamily: T.font.sans }}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {chartView === 'area' && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12, fontFamily: T.font.sans }}>Τάση κόστους {currentYear}, μηνιαίο σύνολο vs μέσος όρος</div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={calc.areaData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="var(--accent)" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false}/>
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} tickFormatter={v => v > 0 ? `${v}€` : ''}/>
                  <Tooltip content={<ChartTooltip/>}/>
                  {calc.avgMonthly > 0 && <ReferenceLine y={calc.avgMonthly} stroke="var(--text-tertiary)" strokeDasharray="4 4" label={{ value: `μέσος όρος ${Math.round(calc.avgMonthly)}€`, position: 'right', fontSize: 9, fill: 'var(--text-tertiary)' }}/>}
                  <Area type="monotone" dataKey="Σύνολο" stroke="var(--accent)" strokeWidth={2} fill="url(#colorTotal)" dot={{ r: 3, fill: 'var(--accent)' }} activeDot={{ r: 5 }}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {chartView === 'bar' && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12, fontFamily: T.font.sans }}>Μηνιαίο κόστος, σύγκριση με μέσο όρο</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={calc.areaData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false}/>
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} tickFormatter={v => v > 0 ? `${v}€` : ''}/>
                  <Tooltip content={<ChartTooltip/>}/>
                  {calc.avgMonthly > 0 && <ReferenceLine y={calc.avgMonthly} stroke="var(--accent)" strokeDasharray="4 4"/>}
                  <Bar dataKey="Σύνολο" fill="rgba(26,115,232,0.7)" radius={[4, 4, 0, 0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {chartView === 'category' && calc.categoryData.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 14, fontFamily: T.font.sans }}>Κόστος ανά κατηγορία vs. μέσος όρος αγοράς</div>
              <ResponsiveContainer width="100%" height={Math.max(180, calc.categoryData.length * 44)}>
                <BarChart layout="vertical" data={calc.categoryData} margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" horizontal={false}/>
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}€`}/>
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-primary)' }} axisLine={false} tickLine={false} width={100}/>
                  <Tooltip content={<ChartTooltip/>}/>
                  <Bar dataKey="monthly" name="Τρέχον" radius={[0, 4, 4, 0]}>
                    {calc.categoryData.map((entry, index) => (
                      <Cell key={index} fill={entry.pct > 25 ? 'var(--negative)' : entry.color}/>
                    ))}
                  </Bar>
                  <Bar dataKey="benchmark" name="Ο δικός σου μέσος όρος" fill="var(--border-default)" fillOpacity={0.5} radius={[0, 4, 4, 0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── ΤΙ ΕΦΥΓΕ ΑΠΟ ΕΔΩ, ΚΑΙ ΓΙΑΤΙ ────────────────────────────────────
          Σε αυτό το σημείο υπήρχαν δύο κάρτες:

          «Έξυπνες Συμβουλές»: κείμενα που δεν έβγαιναν από τα δεδομένα του
          χρήστη αλλά από κατώφλια («αν το ρεύμα > 50 €, πες του για νυχτερινό
          τιμολόγιο») και ανέφεραν τιμές τρίτων σαν να ήταν προσφορά. Η σύγκριση
          παρόχων ΔΕΝ σβήστηκε — μετακινήθηκε στην ειδοποίηση της κορυφής
          (ExpenseSwitchAlert), που εμφανίζεται ΜΟΝΟ όταν υπάρχει πραγματική
          διαφορά, υπολογισμένη πάνω στην πραγματική κατανάλωση του χρήστη, και
          δεν εμφανίζεται καθόλου όταν δεν υπάρχουν στοιχεία να τη στηρίξουν.

          «Smart Insights»: έδειχνε «πάγια ανά τετραγωνικό» διαιρώντας με τον
          σταθερό αριθμό 35 — δηλαδή με τα τετραγωνικά κάποιου άλλου. Τα
          υπόλοιπα πλακίδιά της (μέσο μηνιαίο, εκκρεμείς) λέγονται ήδη στη
          γραμμή μετρικών από πάνω. */}

      {calc.historyTotals.some(v => v > 0) && (() => {
        const ytd       = calc.historyTotals.slice(0, currentMonth + 1).reduce((a, b) => a + b, 0);
        const projected = calc.avgMonthly * 12;
        const remaining = Math.max(0, projected - ytd);
        const pct       = projected > 0 ? Math.min((ytd / projected) * 100, 100) : 0;
        return (
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--text-secondary)', fontFamily: T.font.sans }}>Ετήσιος Απολογισμός {currentYear}</span>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginLeft: 'auto' }}>{MONTHS_GR[currentMonth]}, {currentYear}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 12, marginBottom: 14 }}>
              {[
                { label: 'Δαπάνες YTD',         value: fe(ytd, 0),       sub: `${currentMonth + 1} μήνες` },
                { label: 'Πρόβλεψη Έτους',       value: fe(projected, 0), sub: 'βάσει μέσου όρου'               },
                { label: 'Εκτιμώμενο Υπόλοιπο', value: fe(remaining, 0), sub: `${12 - currentMonth - 1} μήνες` },
              ].map((k, i) => (
                <div key={i}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6, fontFamily: T.font.sans }}>{k.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginBottom: 3 }}>{k.value}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>{k.sub}</div>
                </div>
              ))}
            </div>
            <div style={{ height: 6, background: 'var(--bg-overlay)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.5s' }}/>
            </div>
            <div className="po-fig-card" tabIndex={0} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
              <span>Ιαν</span>
              <span className="po-fig" data-tone="accent" style={{ fontWeight: 600 }}>{pct.toFixed(0)}% του έτους</span>
              <span>Δεκ</span>
            </div>
          </div>
        );
      })()}

      {/* ═══ ΔΙΑΚΟΣΙΑ ΤΕΣΣΕΡΑ ΠΕΔΙΑ ΠΟΥ ΖΗΤΟΥΣΑΝ ΤΑ ΙΔΙΑ ΝΟΥΜΕΡΑ ΔΕΥΤΕΡΗ ΦΟΡΑ ══
          Δεκαεπτά κατηγορίες επί δώδεκα μήνες, με τη λεζάντα «Καταχώρησε τα ποσά
          από τους λογαριασμούς σου ανά μήνα». Τα ποσά ήταν ΗΔΗ καταχωρημένα: κάθε
          λογαριασμός στη λίστα από πάνω έχει ποσό, κατηγορία, ημερομηνία και
          δήλωση αν είναι πάγιος. Τώρα το ιστορικό υπολογίζεται από αυτά και
          διαβάζεται· δεν συμπληρώνεται.

          Και το «Ημερολόγιο πληρωμών» έφυγε μαζί: ήταν οι ΙΔΙΟΙ λογαριασμοί, της
          ίδιας οθόνης, ξαναγραμμένοι ανά ημέρα του μήνα. */}
      {calc.historyTotals.some(t => t > 0) && (
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 }}>
        {secHdr(`Κόστος ανά μήνα, ${currentYear}`)}
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16, fontFamily: T.font.sans }}>
          Υπολογισμένο από τους λογαριασμούς σου. Οι πάγιοι μετρούν σε κάθε μήνα που τρέχουν, οι εφάπαξ μόνο στον μήνα τους.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 6, alignItems: 'end', height: 132 }}>
          {calc.historyTotals.map((t, i) => {
            const max = Math.max(...calc.historyTotals, 1);
            const isNow = i === currentMonth;
            return (
              <div key={i} title={`${MONTHS_GR[i]}: ${fe(t)}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 9.5, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: isNow ? 'var(--text-primary)' : 'var(--text-tertiary)', fontWeight: isNow ? 700 : 400 }}>{t > 0 ? Math.round(t) : ''}</span>
                <div style={{ width: '100%', height: `${max > 0 ? Math.max(2, (t / max) * 100) : 2}%`, background: isNow ? 'var(--accent)' : 'var(--bg-overlay)', borderRadius: '4px 4px 2px 2px', transition: 'height 0.4s' }}/>
                <span style={{ fontSize: 9.5, fontFamily: T.font.sans, color: isNow ? 'var(--accent)' : 'var(--text-tertiary)', fontWeight: isNow ? 700 : 400 }}>{MONTHS_GR[i].slice(0, 3)}</span>
              </div>
            );
          })}
        </div>
      </div>
      )}

    </div>
  );
}