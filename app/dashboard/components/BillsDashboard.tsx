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
import { T, fe, Spinner } from '@/components/Theme';

const MONTHS_GR =['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος','Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος'];

// Κατηγορία λογαριασμού → ομάδα/κατηγορία Δαπανών (ίδια λογική με scan/τράπεζα).
const BILL_GROUP: Record<string, { group: string; cat: string }> = {
  electricity:{group:'fixed',cat:'Ρεύμα'}, water:{group:'fixed',cat:'Νερό'}, gas:{group:'fixed',cat:'Φυσικό Αέριο'},
  internet:{group:'fixed',cat:'Internet'}, insurance:{group:'fixed',cat:'Ασφάλεια Κτιρίου'}, streaming:{group:'fixed',cat:'Άλλη Πάγια'},
  taxes:{group:'fixed',cat:'ΕΝΦΙΑ'}, municipal:{group:'fixed',cat:'Δημοτικά Τέλη'}, security:{group:'fixed',cat:'Σύστημα Συναγερμού'},
  common:{group:'fixed',cat:'Κοινόχρηστα'}, maintenance:{group:'maintenance',cat:'Γενική Συντήρηση'},
  elevator:{group:'maintenance',cat:'Συντήρηση Ασανσέρ'}, pool:{group:'maintenance',cat:'Καθαρισμός Πισίνας'},
  gardener:{group:'maintenance',cat:'Κηπουρός'}, cleaner:{group:'maintenance',cat:'Καθαριότητα'},
  plumber:{group:'maintenance',cat:'Υδραυλικός'}, electrician:{group:'maintenance',cat:'Ηλεκτρολόγος'},
};

const fmtDateGR = (iso: string) => iso ? new Date(iso).toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

interface BillEntry {
  id: string; property_id?: string; user_id?: string;
  category: string; name: string; amount: number;
  vat_rate?: number; period?: string; due_date: string;
  paid: boolean; recurring: boolean; notes?: string;
  kwh?: number; ert?: number; etmear?: number; dimotika?: number;
  created_at?: string;
}
interface Props { propertyId: string; userId: string; propertyName?: string; propertyAddress?: string; }

const CATEGORIES = [
  { value: 'electricity', label: 'Ρεύμα',                       icon: 'bolt',                    color: '#f59e0b' },
  { value: 'common',      label: 'Κοινόχρηστα',                  icon: 'building',                color: '#6366f1' },
  { value: 'internet',    label: 'Internet / Τηλεόραση',          icon: 'wifi',                    color: '#3b82f6' },
  { value: 'water',       label: 'Νερό',                         icon: 'drop',                    color: '#06b6d4' },
  { value: 'gas',         label: 'Αέριο / Θέρμανση',             icon: 'flame',                   color: '#ef4444' },
  { value: 'insurance',   label: 'Ασφάλεια',                     icon: 'shield',                  color: '#10b981' },
  { value: 'security',    label: 'Security / Συναγερμός',         icon: 'lock',                    color: '#f97316' },
  { value: 'streaming',   label: 'Streaming / Συνδρομές',         icon: 'device-tv',               color: '#ec4899' },
  { value: 'enfia',       label: 'ΕΝΦΙΑ',                        icon: 'landmark',                color: '#64748b' },
  { value: 'dimotika',    label: 'Δημοτικά Τέλη',               icon: 'building-community',      color: '#94a3b8' },
  { value: 'cleaning',    label: 'Καθαρισμός',                   icon: 'sparkles',                color: '#84cc16' },
  { value: 'garden',      label: 'Κήπος',                        icon: 'plant',                   color: '#22c55e' },
  { value: 'pool',        label: 'Πισίνα',                       icon: 'pool',                    color: '#0ea5e9' },
  { value: 'elevator',    label: 'Ανελκυστήρας',                 icon: 'elevator',                color: '#a78bfa' },
  { value: 'ac_service',  label: 'Σέρβις Κλιματιστικού',         icon: 'air-conditioning',        color: '#38bdf8' },
  { value: 'renovation',  label: 'Ανακαίνιση / Επισκευή',        icon: 'hammer',                  color: '#d97706' },
  { value: 'pest',        label: 'Απεντόμωση',                   icon: 'bug',                     color: '#78716c' },
  { value: 'other',       label: 'Άλλο',                         icon: 'package',                 color: '#94a3b8' },
];

const CAT_OPTIONS = CATEGORIES.map(c => ({ value: c.value, label: c.label }));
const VAT_OPTIONS = [
  { value: '6',  label: 'ΦΠΑ 6% (Ρεύμα, Αέριο)' },
  { value: '13', label: 'ΦΠΑ 13%'                },
  { value: '24', label: 'ΦΠΑ 24% (Γενικό)'       },
  { value: '0',  label: 'Χωρίς ΦΠΑ'              },
];
const PERIOD_OPTIONS = [
  { value: '', label: '— Επιλογή περιόδου —' },
  ...MONTHS_GR.map(m => ({ value: `${m} 2026`, label: `${m} 2026` })),
  { value: 'custom', label: 'Προσαρμοσμένο' },
];
const MARKET_BENCHMARKS: Record<string, number> = {
  electricity: 45, common: 40, internet: 25, water: 15, gas: 30,
  insurance: 18, security: 25, streaming: 20, enfia: 30, dimotika: 8,
};

const cat = (v: string) => CATEGORIES.find(c => c.value === v) || CATEGORIES[CATEGORIES.length - 1];

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

async function exportBillsExcel(bills: BillEntry[], historyTotals: number[], byCategory: any[], avgMonthly: number, propertyName: string) {
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
  const dueSoon = bills.filter(b => !b.paid && b.due_date && (() => { const d = Math.ceil((new Date(b.due_date!).getTime() - now.getTime()) / 86400000); return d >= 0 && d <= 7; })());
  const pending = bills.filter(b => !b.paid);
  const recurring = bills.filter(b => b.recurring);

  const summaryData: (string | number | null | undefined)[][] = [
    ['PROPERTY OS — ΑΝΑΦΟΡΑ ΛΟΓΑΡΙΑΣΜΩΝ & ΠΑΓΙΩΝ ΔΑΠΑΝΩΝ', null, null, null, null],
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
    ['Κατηγορία', 'Λογαριασμοί', 'Μηνιαίο (€)', 'Ετήσιο (€)', 'Μέσος Όρος Αγοράς (€)', 'Απόκλιση %', '% Συνόλου'],
    ...byCategory
      .sort((a: any, b: any) => b.monthly - a.monthly)
      .map((c: any) => {
        const deviation = c.benchmark > 0 ? Math.round((c.monthly / c.benchmark - 1) * 100) : 0;
        const pctTotal  = totalM > 0 ? Math.round((c.monthly / totalM) * 100) : 0;
        return [c.label, c.count || 1, c.monthly, c.monthly * 12, c.benchmark || 0, deviation, pctTotal];
      }),
    [''],
    ['━━━ ΙΣΤΟΡΙΚΟ ΚΟΣΤΟΥΣ ' + year + ' ━━━', null, null, null, null, null, null, null, null, null, null, null, null, null],
    ['', ...MONTHS_SH, 'Σύνολο Έτους'],
    ['Κόστος (€)', ...historyTotals, historyTotals.reduce((a, b) => a + b, 0)],
    ['Σε σχέση με τον Μέσο Όρο', ...historyTotals.map(v => v > 0 ? Math.round((v / avgMonthly - 1) * 100) + '%' : '—'), null],
    [''],
    ['━━━ ΕΙΔΟΠΟΙΗΣΕΙΣ ━━━', null, null, null, null],
    overdue.length > 0 ? [`⚠ ${overdue.length} ΛΗΞΙΠΡΟΘΕΣΜΟΙ ΛΟΓΑΡΙΑΣΜΟΙ — ΑΜΕΣΗ ΕΝΕΡΓΕΙΑ`, null, null, `Σύνολο: ${overdue.reduce((s,b)=>s+b.amount,0).toFixed(2)} €`, null] : ['✓ Δεν υπάρχουν ληξιπρόθεσμοι λογαριασμοί'],
    dueSoon.length > 0 ? [`! ${dueSoon.length} λογαριασμοί λήγουν εντός 7 ημερών`, null, null, `Σύνολο: ${dueSoon.reduce((s,b)=>s+b.amount,0).toFixed(2)} €`, null] : [],
  ].filter(row => row.length > 0);

  const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
  ws1['!cols'] = [{ wch: 36 }, { wch: 14 }, { wch: 6 }, { wch: 30 }, { wch: 14 }, { wch: 12 }, { wch: 12 }];
  ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Σύνοψη');

  const headers2 = ['Κατηγορία','Ονομασία / Πάροχος','Ποσό (€)','ΦΠΑ %','Περίοδος','Ημερομηνία Λήξης','Τύπος','Κατάσταση','Ημέρες έως Λήξη','Κατανάλωση (kWh)','Σημειώσεις'];
  const detailRows: (string | number | null | undefined)[][] = [headers2, ...bills
    .sort((a, b) => {
      const ad = a.due_date ? new Date(a.due_date).getTime() : 9e12;
      const bd = b.due_date ? new Date(b.due_date).getTime() : 9e12;
      return ad - bd;
    })
    .map(b => {
      const days = b.due_date ? Math.ceil((new Date(b.due_date).getTime() - now.getTime()) / 86400000) : null;
      return [
        cat(b.category).label,
        b.name,
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
    ['Κατάσταση', 'Κατηγορία', 'Ονομασία / Πάροχος', 'Ποσό (€)', 'Ημερομηνία Λήξης', 'Ημέρες έως Λήξη'],
    ...pending
      .sort((a, b) => {
        const ad = a.due_date ? new Date(a.due_date).getTime() : 0;
        const bd = b.due_date ? new Date(b.due_date).getTime() : 0;
        return ad - bd;
      })
      .map(b => {
        const days = b.due_date ? Math.ceil((new Date(b.due_date).getTime() - now.getTime()) / 86400000) : null;
        return [
          days !== null && days < 0 ? '⚠ ΛΗΞΙΠΡΟΘΕΣΜΟΣ' : days !== null && days <= 7 ? '! ΛΗΓΕΙ ΣΥΝΤΟΜΑ' : 'Εκκρεμεί',
          cat(b.category).label,
          b.name,
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
      ['ΠΑΓΙΑ ΚΟΣΤΗ — ΜΗΝΙΑΙΕΣ ΔΑΠΑΝΕΣ', null, null, null, null],
      [`Ακίνητο: ${propertyName} · Σύνολο: ${totalM.toFixed(2)} € / μήνα`, null, null, null, null],
      [''],
      ['Κατηγορία', 'Ονομασία / Πάροχος', 'Μηνιαίο (€)', 'Ετήσιο (€)', '% Συνόλου'],
      ...recurring
        .sort((a, b) => b.amount - a.amount)
        .map(b => [
          cat(b.category).label,
          b.name,
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
    [`Ακίνητο: ${propertyName} · Μέσος Όρος: ${avgMonthly.toFixed(2)} € / μήνα`, null, null, null],
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

  const filename = `λογαριασμοι_${propertyName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, filename);
}

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '10px 14px', fontSize: 12, fontFamily: T.font.sans }}>
      <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }}/>
          <span style={{ color: 'var(--text-secondary)' }}>{p.name}:</span>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(p.value, 0)}</span>
        </div>
      ))}
    </div>
  );
};

const histInputStyle = (isCurrent: boolean): React.CSSProperties => ({
  width: '100%',
  background: isCurrent ? 'rgba(26,115,232,0.06)' : 'var(--bg-base)',
  border: `1px solid ${isCurrent ? 'var(--accent)' : 'var(--border-subtle)'}`,
  borderRadius: T.radius.badge,
  padding: '5px 3px',
  color: 'var(--text-primary)',
  fontSize: 11,
  fontFamily: T.font.mono,
  fontVariantNumeric: 'tabular-nums',
  outline: 'none',
  textAlign: 'center',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s',
});

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
  const [chartView, setChartView] = useState<'area' | 'bar' | 'category'>('area');
  const [budgets,   setBudgets]   = useState<Record<string, string>>({});
  const [showBudgets, setShowBudgets] = useState(false);
  const [form, setForm] = useState({
    category: 'electricity', name: '', amount: '', kwh: '',
    period: '', date_from: '', due_date: '', recurring: true,
    notes: '', vat_rate: '6', ert: '', etmear: '', dimotika_amt: '',
  });
  const sf = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

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
      data.forEach((row: any) => { if (h[row.category]) h[row.category][row.month] = row.amount > 0 ? String(row.amount) : ''; });
      setHistory(h);
    }
  }, [propertyId, currentYear]);

  const loadBudgets = useCallback(async () => {
    const { data } = await supabase.from('bills_settings').select('data').eq('property_id', propertyId).eq('section', 'budgets').maybeSingle();
    if (data?.data) setBudgets(data.data as Record<string, string>);
  }, [propertyId]);

  useEffect(() => {
    if (!propertyId) return;
    let mounted = true;

    loadBills();
    loadHistory();
    loadBudgets();

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
  }, [propertyId, loadBills, loadHistory, loadBudgets]);

  const saveHistoryCell = async (category: string, month: number, value: string) => {
    const amount = parseFloat(value) || 0;
    await supabase.from('bills_history').upsert(
      { property_id: propertyId, user_id: userId, category, month, year: currentYear, amount, updated_at: new Date().toISOString() },
      { onConflict: 'property_id,category,month,year' }
    );
  };

  const updateHistory = (category: string, month: number, value: string) => {
    setHistory(h => {
      const n = { ...h };
      n[category] = [...(n[category] || Array(12).fill(''))];
      n[category][month] = value;
      return n;
    });
    saveHistoryCell(category, month, value);
  };

  const saveBudgets = async (b: Record<string, string>) => {
    await supabase.from('bills_settings').upsert(
      { property_id: propertyId, user_id: userId, section: 'budgets', data: b, updated_at: new Date().toISOString() },
      { onConflict: 'property_id,section' }
    );
  };

  const addBill = async () => {
    if (!form.name || !form.amount) return;
    setSaving(true);
    const period = form.period === 'custom'
      ? (form.date_from && form.due_date ? `${fmtDateGR(form.date_from)} — ${fmtDateGR(form.due_date)}` : '')
      : form.period;
    const payload = {
      property_id: propertyId, user_id: userId,
      category: form.category, name: form.name, amount: parseFloat(form.amount),
      vat_rate: parseInt(form.vat_rate), period: period || null, due_date: form.due_date || null,
      paid: false, recurring: form.recurring, notes: form.notes || null,
      kwh: form.kwh ? parseFloat(form.kwh) : null,
      ert: form.ert ? parseFloat(form.ert) : null,
      etmear: form.etmear ? parseFloat(form.etmear) : null,
      dimotika: form.dimotika_amt ? parseFloat(form.dimotika_amt) : null,
    };
    const { data, error } = await supabase.from('bills').insert(payload).select().single();
    if (!error && data) {
      setBills(prev => [data, ...prev]);
      if (payload.paid) {
        try {
          await supabase.from('expenses').insert({
            property_id: propertyId, user_id: userId, amount: parseFloat(form.amount),
            description: form.name, date: new Date().toISOString().split('T')[0],
            category: cat(form.category).label, expense_group: 'bills',
          });
        } catch (_) {}
      }
    }
    setForm({ category: 'electricity', name: '', amount: '', kwh: '', period: '', date_from: '', due_date: '', recurring: true, notes: '', vat_rate: '6', ert: '', etmear: '', dimotika_amt: '' });
    setShowForm(false);
    setSaving(false);
  };

  const togglePaid = async (id: string) => {
    const bill = bills.find(b => b.id === id);
    if (!bill) return;
    const newPaid = !bill.paid;
    setBills(prev => prev.map(b => b.id === id ? { ...b, paid: newPaid } : b));
    await supabase.from('bills').update({ paid: newPaid, paid_at: newPaid ? new Date().toISOString() : null }).eq('id', id);

    // Cascade (undo-safe): το συνδεδεμένο έξοδο & γεγονός ημερολογίου ακολουθούν
    // την κατάσταση του λογαριασμού μέσω bill_id. Καμία διπλοεγγραφή.
    const { data: expHit } = await supabase.from('expenses').update({ paid: newPaid }).eq('bill_id', id).select('id');
    await supabase.from('calendar_events').update({ status: newPaid ? 'paid' : 'pending' }).eq('bill_id', id);

    // Αν το σημειώνουμε πληρωμένο και ΔΕΝ υπάρχει συνδεδεμένο έξοδο (π.χ.
    // χειροκίνητος λογαριασμός), δημιούργησέ το με τη σωστή ομάδα ώστε να μετρήσει.
    if (newPaid && (!expHit || !expHit.length)) {
      const g = BILL_GROUP[bill.category] || { group: 'fixed', cat: cat(bill.category).label };
      try {
        await supabase.from('expenses').insert({
          property_id: propertyId, user_id: userId, bill_id: id, amount: bill.amount,
          description: bill.name, date: new Date().toISOString().split('T')[0],
          category: g.cat, expense_group: g.group, paid_by: 'owner', paid: true,
        });
      } catch (_) {}
    }
  };

  const deleteBill = async (id: string) => {
    setBills(prev => prev.filter(b => b.id !== id));
    await supabase.from('bills').delete().eq('id', id);
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
      benchmark: MARKET_BENCHMARKS[c.value] || 0,
    })).filter(c => c.monthly > 0);

    const historyTotals = Array(12).fill(0).map((_, i) =>
      CATEGORIES.reduce((s, c) => s + (parseFloat(history[c.value]?.[i]) || 0), 0)
    );
    const filled    = historyTotals.filter(v => v > 0);
    const avgMonthly = filled.length > 0 ? filled.reduce((a, b) => a + b, 0) / filled.length : totalMonthly;
    const maxHistory = Math.max(...historyTotals, totalMonthly, 1);

    const alerts: { type: 'danger' | 'warning' | 'info'; msg: string; bill?: string }[] = [];
    if (overdue.length > 0) {
      alerts.push({ type: 'danger', msg: `${overdue.length} ληξιπρόθεσμος/-οι: ${overdue.map(b => b.name).join(', ')} — Σύνολο: ${fe(overdue.reduce((s, b) => s + b.amount, 0), 0)}` });
    }
    dueSoon.forEach(b => {
      const daysLeft = b.due_date ? Math.ceil((new Date(b.due_date).getTime() - today.getTime()) / 86400000) : null;
      const msg = daysLeft === 0 ? `"${b.name}" λήγει ΣΗΜΕΡΑ — ${fe(b.amount, 0)}`
                : daysLeft === 1 ? `"${b.name}" λήγει ΑΥΡΙΟ — ${fe(b.amount, 0)}`
                : `"${b.name}" σε ${daysLeft} ημέρες — ${fe(b.amount, 0)}`;
      alerts.push({ type: 'warning', msg, bill: b.id });
    });
    byCategory.forEach(c => {
      const budget = parseFloat(budgets[c.value] || '0');
      if (budget > 0 && c.monthly > budget) alerts.push({ type: 'warning', msg: `${c.label}: ${fe(c.monthly, 0)}/μήνα — υπέρβαση budget (${fe(budget, 0)})` });
      else if (c.benchmark > 0 && c.monthly > c.benchmark * 1.3) alerts.push({ type: 'info', msg: `${c.label}: ${fe(c.monthly, 0)}/μήνα — 30%+ πάνω από τον μέσο όρο αγοράς` });
    });

    const areaData = MONTHS_GR.map((m, i) => {
      const obj: any = { month: m };
      CATEGORIES.filter(c => history[c.value]?.some(v => parseFloat(v) > 0)).forEach(c => {
        obj[c.label] = parseFloat(history[c.value]?.[i]) || 0;
      });
      obj['Σύνολο'] = historyTotals[i];
      return obj;
    });

    const categoryData = byCategory.map(c => ({
      name: c.label, monthly: c.monthly, benchmark: c.benchmark, color: c.color,
      pct: c.benchmark > 0 ? Math.round((c.monthly / c.benchmark - 1) * 100) : 0,
    }));

    return { totalMonthly, totalUnpaid, totalPaid, overdue, dueSoon, byCategory, historyTotals, avgMonthly, maxHistory, alerts, areaData, categoryData };
  }, [bills, history, budgets]);

  const secHdr = (label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}/>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontFamily: T.font.sans }}>{label}</span>
    </div>
  );

  if (loading) return <Spinner label="Φόρτωση…" />;

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
            const col    = type === 'danger'  ? 'var(--negative)'        : type === 'warning' ? 'var(--warning)'        : 'var(--info)';
            const label  = type === 'danger'  ? 'Ληξιπρόθεσμα'          : type === 'warning' ? 'Προσεχείς Πληρωμές'   : 'Πληροφορίες';
            return (
              <div key={type} style={{ background: bg, border: `1px solid ${border}`, borderRadius: T.radius.inner, padding: '12px 16px', marginBottom: 8 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: col, textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 8, fontFamily: T.font.sans }}>{label}</div>
                {group.map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: i > 0 ? 6 : 0, marginTop: i > 0 ? 6 : 0, borderTop: i > 0 ? `1px solid ${border}` : 'none' }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: col, flexShrink: 0 }}/>
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)', fontFamily: T.font.sans }}>{a.msg}</span>
                    {a.bill && (
                      <button onClick={() => togglePaid(a.bill!)}
                        style={{ fontSize: 10, color: 'var(--positive)', background: 'rgba(52,168,83,0.1)', border: '1px solid rgba(52,168,83,0.3)', borderRadius: T.radius.badge, padding: '4px 12px', cursor: 'pointer', fontFamily: T.font.sans, fontWeight: 700, whiteSpace: 'nowrap' as const, flexShrink: 0 }}>
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
          { label: 'Πάγια / Μήνα',  value: fe(calc.totalMonthly, 0),  sub: fe(calc.totalMonthly * 12, 0) + '/έτος',              neg: false },
          { label: 'Εκκρεμείς',     value: fe(calc.totalUnpaid, 0),   sub: bills.filter(b => !b.paid).length + ' λογαριασμοί', neg: calc.totalUnpaid > 0 },
          { label: 'Πληρωμένοι',    value: fe(calc.totalPaid, 0),     sub: bills.filter(b => b.paid).length + ' λογαριασμοί',  neg: false },
          { label: 'Μέσο Μηνιαίο',  value: fe(calc.avgMonthly, 0),    sub: 'βάσει ιστορικού',                                  neg: false },
        ].map((k, i) => (
          <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '16px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.neg ? 'var(--negative)' : 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginBottom: 6 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <BillsPDFExport data={{ propertyName, propertyAddress, bills, totalMonthly: calc.totalMonthly, totalAnnual: calc.totalMonthly * 12, avgMonthly: calc.avgMonthly, historyTotals: calc.historyTotals }}/>
          <button onClick={() => exportBillsExcel(bills, calc.historyTotals, calc.byCategory, calc.avgMonthly, propertyName)}
            style={{ padding: '8px 16px', borderRadius: T.radius.btn, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.font.sans, transition: 'all 0.15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-elevated)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}>
            Excel
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowBudgets(s => !s)}
            style={{ padding: '8px 16px', borderRadius: T.radius.btn, border: `1px solid ${showBudgets ? 'var(--accent)' : 'var(--border-subtle)'}`, background: showBudgets ? 'rgba(26,115,232,0.1)' : 'transparent', color: showBudgets ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.font.sans, transition: 'all 0.15s' }}>
            Όρια Budget
          </button>
          {!showForm ? (
            <button onClick={() => setShowForm(true)}
              style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: T.radius.pill, padding: '0 22px', height: 38, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' as const }}>
              + Προσθήκη Λογαριασμού
            </button>
          ) : (
            <button onClick={() => setShowForm(false)}
              style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.btn, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.font.sans }}>
              Κλείσιμο
            </button>
          )}
        </div>
      </div>

      {showBudgets && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 }}>
          {secHdr('Όρια Budget ανά Κατηγορία')}
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 14, fontFamily: T.font.sans }}>Ορισμός μέγιστου αποδεκτού ποσού ανά κατηγορία</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
            {CATEGORIES.map(c => {
              const current = bills.filter(b => b.category === c.value && b.recurring).reduce((s, b) => s + b.amount, 0);
              const budget  = parseFloat(budgets[c.value] || '0');
              const over    = budget > 0 && current > budget;
              const near    = budget > 0 && current > budget * 0.8 && !over;
              return (
                <div key={c.value} style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '12px 14px', border: `1px solid ${over ? 'rgba(197,34,31,0.25)' : near ? 'rgba(242,153,0,0.25)' : 'var(--border-subtle)'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: c.color, flexShrink: 0 }}/>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans, flex: 1 }}>{c.label}</span>
                    {current > 0 && <span style={{ fontSize: 10, color: over ? 'var(--negative)' : near ? 'var(--warning)' : 'var(--text-tertiary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{current.toLocaleString('el-GR')}€</span>}
                  </div>
                  <NumberInput
                    label=""
                    value={budgets[c.value] || ''}
                    onChange={v => { const b = { ...budgets, [c.value]: v }; setBudgets(b); saveBudgets(b); }}
                    suffix="€"
                    step={5}
                  />
                  {over && <div style={{ fontSize: 10, color: 'var(--negative)', marginTop: 6, fontFamily: T.font.sans }}>Υπέρβαση κατά {(current - budget).toFixed(0)}€</div>}
                  {near && !over && <div style={{ fontSize: 10, color: 'var(--warning)', marginTop: 6, fontFamily: T.font.sans }}>Κοντά στο όριο</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showForm && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--accent)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 18, fontFamily: T.font.sans }}>Νέος Λογαριασμός / Πάγιο</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 2fr 1fr 1.4fr', gap: 10, marginBottom: 12 }}>
            <CustomSelect label="Κατηγορία Λογαριασμού" value={form.category} onChange={v => sf('category', v)} options={CAT_OPTIONS}/>
            <TextInput label="Ονομασία / Πάροχος" value={form.name} onChange={v => sf('name', v)} placeholder="για παράδειγμα ΔΕΗ Πράσινο Ιουνίου"/>
            <NumberInput label="Ποσό (€)" value={form.amount} onChange={v => sf('amount', v)} suffix="€" step={1}/>
            <CustomSelect label="Συντελεστής ΦΠΑ" value={form.vat_rate} onChange={v => sf('vat_rate', v)} options={VAT_OPTIONS}/>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: form.period === 'custom' ? '1fr 1fr 1fr auto 1fr' : '1fr 1fr auto 1fr', gap: 10, marginBottom: 12, alignItems: 'flex-start' }}>
            <CustomSelect label="Περίοδος" value={form.period} onChange={v => {
              sf('period', v);
              if (v !== 'custom') sf('date_from', '');
            }} options={PERIOD_OPTIONS}/>
            {form.period === 'custom' ? (
              <DatePicker label="Ημερομηνία Έναρξης" value={form.date_from} onChange={v => sf('date_from', v)}/>
            ) : (
              <DatePicker label="Ημερομηνία Λήξης" value={form.due_date} onChange={v => sf('due_date', v)}/>
            )}
            {form.period === 'custom' && (
              <DatePicker label="Ημερομηνία Λήξης" value={form.due_date} onChange={v => sf('due_date', v)}/>
            )}
            <div style={{ paddingTop: 22 }}><Toggle on={form.recurring} onChange={v => sf('recurring', v)} label="Πάγιο" labelOff="Εφάπαξ"/></div>
            <TextInput label="Σημειώσεις" value={form.notes} onChange={v => sf('notes', v)} placeholder="για παράδειγμα δόση..."/>
          </div>
          {form.category === 'electricity' && (
            <div style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: T.radius.inner, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--warning)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 12, fontFamily: T.font.sans }}>Λεπτομέρειες Ρεύματος</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10, marginBottom: 10 }}>
                <NumberInput label="Κατανάλωση (kWh)" value={(form as any)['kwh']}         onChange={v => sf('kwh', v)}         suffix="kWh" step={0.01}/>
                <NumberInput label="ΕΡΤ (€)"           value={(form as any)['ert']}         onChange={v => sf('ert', v)}         suffix="€"   step={0.01}/>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10 }}>
                <NumberInput label="ΕΤΜΕΑΡ (€)"        value={(form as any)['etmear']}      onChange={v => sf('etmear', v)}      suffix="€"   step={0.01}/>
                <NumberInput label="Δημοτικά Τέλη (€)"      value={(form as any)['dimotika_amt']} onChange={v => sf('dimotika_amt', v)} suffix="€"  step={0.01}/>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setShowForm(false)} style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-default)', borderRadius: T.radius.btn, padding: '9px 16px', fontSize: 12, cursor: 'pointer', fontFamily: T.font.sans }}>Ακύρωση</button>
            <button onClick={addBill} disabled={!form.name || !form.amount || saving}
              style={{ background: (!form.name || !form.amount || saving) ? 'var(--bg-elevated)' : 'var(--accent)', color: (!form.name || !form.amount || saving) ? 'var(--text-tertiary)' : 'var(--accent-text)', border: 'none', borderRadius: T.radius.btn, padding: '9px 20px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans }}>
              {saving ? 'Αποθήκευση...' : 'Προσθήκη'}
            </button>
          </div>
        </div>
      )}

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}/>
          <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', flex: 1, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>Λογαριασμοί & Πάγια</span>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', padding: '2px 10px', borderRadius: T.radius.pill, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{bills.length} εγγραφές</span>
        </div>
        {bills.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-tertiary)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Δεν υπάρχουν λογαριασμοί</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>Πρόσθεσε τα πάγια έξοδα του ακινήτου σου</div>
            <button onClick={() => setShowForm(true)} style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: T.radius.pill, padding: '0 22px', height: 38, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans }}>+ Προσθήκη Λογαριασμού</button>
          </div>
        ) : (
          (['overdue','upcoming','paid'] as const).map(group => {
            const groupBills = bills.filter(b => {
              const isOverdue = !b.paid && b.due_date && new Date(b.due_date) < today;
              if (group === 'overdue')  return isOverdue;
              if (group === 'paid')     return b.paid;
              return !isOverdue && !b.paid;
            });
            if (groupBills.length === 0) return null;
            const cfg = {
              overdue:  { label: 'Ληξιπρόθεσμοι', color: 'var(--negative)' },
              upcoming: { label: 'Εκκρεμείς',      color: 'var(--warning)'  },
              paid:     { label: 'Πληρωμένοι',     color: 'var(--positive)' },
            }[group];
            return (
              <div key={group} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: cfg.color, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8, paddingBottom: 4, borderBottom: `1px solid ${cfg.color}25`, fontFamily: T.font.sans }}>
                  {cfg.label} · {groupBills.length}
                </div>
                {groupBills.map(b => {
                  const c = cat(b.category);
                  const daysLeft = b.due_date ? Math.ceil((new Date(b.due_date).getTime() - today.getTime()) / 86400000) : null;
                  return (
                    <div key={b.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto auto auto auto', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-subtle)', opacity: b.paid ? 0.55 : 1 }}>
                      <button onClick={() => togglePaid(b.id)} style={{ width: 22, height: 22, borderRadius: T.radius.badge, border: `2px solid ${b.paid ? 'var(--positive)' : 'var(--border-default)'}`, background: b.paid ? 'var(--positive)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {b.paid && <svg width="10" height="10" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/></svg>}
                      </button>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' as const, marginBottom: 3 }}>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: c.color, flexShrink: 0 }}/>
                          <span style={{ fontSize: 12, fontWeight: 600, textDecoration: b.paid ? 'line-through' : 'none', color: b.paid ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>{b.name}</span>
                          {b.recurring && <span style={{ fontSize: 8, background: 'var(--bg-overlay)', color: 'var(--text-tertiary)', padding: '1px 6px', borderRadius: 3, fontWeight: 600, fontFamily: T.font.sans }}>ΠΑΓΙΟ</span>}
                          <span style={{ fontSize: 8, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: T.radius.pill, fontWeight: 600, border: '1px solid var(--border-subtle)', fontFamily: T.font.sans }}>{c.label}</span>
                          {b.vat_rate ? <span style={{ fontSize: 8, color: 'var(--text-tertiary)', background: 'var(--bg-overlay)', padding: '1px 6px', borderRadius: 3, fontFamily: T.font.sans }}>ΦΠΑ {b.vat_rate}%</span> : null}
                        </div>
                        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' as const }}>
                          {b.period && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>{b.period}</span>}
                          {b.kwh && <span style={{ fontSize: 10, color: 'var(--info)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{b.kwh} kWh</span>}
                          {b.due_date && <span style={{ fontSize: 10, fontFamily: T.font.sans, color: daysLeft !== null && daysLeft < 0 ? 'var(--negative)' : daysLeft !== null && daysLeft <= 7 ? 'var(--warning)' : 'var(--text-tertiary)' }}>
                            {daysLeft !== null && daysLeft < 0 ? `${Math.abs(daysLeft)} ημέρες καθυστέρηση` : daysLeft === 0 ? 'Λήγει σήμερα' : daysLeft !== null ? `σε ${daysLeft} ημέρες` : new Date(b.due_date).toLocaleDateString('el-GR')}
                          </span>}
                          {b.notes && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>· {b.notes}</span>}
                        </div>
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 700, color: b.paid ? 'var(--text-tertiary)' : 'var(--accent)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' as const }}>{fe(b.amount, 2)}</span>
                      {!b.paid && (
                        <button onClick={() => togglePaid(b.id)} style={{ fontSize: 10, color: 'var(--positive)', background: 'rgba(52,168,83,0.1)', border: '1px solid var(--positive)', borderRadius: T.radius.badge, padding: '5px 12px', cursor: 'pointer', fontFamily: T.font.sans, whiteSpace: 'nowrap' as const, fontWeight: 600 }}>
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
                            ert: String((b as any).ert || ''),
                            etmear: String(b.etmear || ''),
                            dimotika_amt: String(b.dimotika || ''),
                          });
                          setShowForm(true);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        style={{ width: 26, height: 26, borderRadius: T.radius.badge, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(26,115,232,0.08)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--info)'; }}
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
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}/>
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', flex: 1, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>Ανάλυση & Γραφήματα</span>
            <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: 3, gap: 2, border: '1px solid var(--border-subtle)' }}>
              {[{ id: 'area', label: 'Τάση' }, { id: 'bar', label: 'Μηνιαίο' }, { id: 'category', label: 'Κατηγορίες' }].map(v => (
                <button key={v.id} onClick={() => setChartView(v.id as any)}
                  style={{ padding: '5px 12px', borderRadius: T.radius.badge + 2, border: 'none', background: chartView === v.id ? 'var(--accent)' : 'transparent', color: chartView === v.id ? 'var(--accent-text)' : 'var(--text-secondary)', fontSize: 11, fontWeight: chartView === v.id ? 700 : 400, cursor: 'pointer', transition: 'all 0.15s', fontFamily: T.font.sans }}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {chartView === 'area' && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12, fontFamily: T.font.sans }}>Τάση κόστους {currentYear} — μηνιαίο σύνολο vs μέσος όρος</div>
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
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12, fontFamily: T.font.sans }}>Μηνιαίο κόστος — σύγκριση με μέσο όρο</div>
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
                      <Cell key={index} fill={entry.pct > 25 ? '#c5221f' : entry.color}/>
                    ))}
                  </Bar>
                  <Bar dataKey="benchmark" name="Μέσος Όρος Αγοράς" fill="var(--border-default)" fillOpacity={0.5} radius={[0, 4, 4, 0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {calc.byCategory.length > 0 && (() => {
        const advice: { type: 'tip' | 'warning' | 'saving'; title: string; body: string }[] = [];
        const elec     = calc.byCategory.find(c => c.value === 'electricity');
        const insur    = calc.byCategory.find(c => c.value === 'insurance');
        const internet = calc.byCategory.find(c => c.value === 'internet');
        if (elec && elec.monthly > 50)
          advice.push({ type: 'tip', title: 'Εξοικονόμηση ρεύματος', body: `Με ${fe(elec.monthly, 0)}/μήνα, αλλαγή σε νυχτερινή ζώνη (ΔΕΗ Γ1Ν) εξοικονομεί έως 15%. Ετήσια εξοικονόμηση: ~${fe(elec.monthly * 12 * 0.15, 0)}.` });
        if (!insur)
          advice.push({ type: 'warning', title: 'Δεν υπάρχει ασφάλεια κατοικίας', body: 'Υποχρεωτική για δανειολήπτες. Hellas Direct Basic από 8.90€/μήνα — καλύψεις πυρκαγιά + κλοπή.' });
        if (internet && internet.monthly > 25)
          advice.push({ type: 'saving', title: 'Εξοικονόμηση Internet', body: `Τρέχον: ${fe(internet.monthly, 0)}/μήνα. Ελέγξτε Inalan/Enterwave — fiber από 17€/μήνα χωρίς δέσμευση (ΕΕΤΤ 360°).` });
        if (calc.overdue.length > 0)
          advice.push({ type: 'warning', title: `${calc.overdue.length} ληξιπρόθεσμος/-οί λογαριασμός/-ιοί`, body: `Συνολικό εκκρεμές: ${fe(calc.overdue.reduce((s, b) => s + b.amount, 0), 0)}. Πλήρωσε σήμερα για αποφυγή προστίμων.` });
        if (calc.totalMonthly > 200)
          advice.push({ type: 'tip', title: 'Υψηλά πάγια έξοδα', body: `${fe(calc.totalMonthly, 0)}/μήνα είναι πάνω από τον μέσο όρο. Ετήσιο κόστος: ${fe(calc.totalMonthly * 12, 0)}. Εξετάστε αναθεώρηση παρόχων.` });
        if (advice.length === 0) return null;
        const colors = {
          tip:     { bg: 'rgba(26,115,232,0.06)',  border: 'rgba(26,115,232,0.2)',  color: 'var(--info)',     dot: 'var(--info)' },
          warning: { bg: 'rgba(197,34,31,0.06)',   border: 'rgba(197,34,31,0.2)',   color: 'var(--negative)', dot: 'var(--negative)' },
          saving:  { bg: 'rgba(52,168,83,0.06)',   border: 'rgba(52,168,83,0.2)',   color: 'var(--positive)', dot: 'var(--positive)' },
        };
        return (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 }}>
            {secHdr('Έξυπνες Συμβουλές')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {advice.map((a, i) => {
                const c = colors[a.type];
                return (
                  <div key={i} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: T.radius.inner, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot, flexShrink: 0, marginTop: 4 }}/>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: c.color, marginBottom: 3, fontFamily: T.font.sans }}>{a.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, fontFamily: T.font.sans }}>{a.body}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {calc.byCategory.length > 0 && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 }}>
          {secHdr('Smart Insights')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Πάγια ανά τετραγωνικό / μήνα',  value: calc.totalMonthly > 0 ? `${(calc.totalMonthly / 35).toFixed(2)} € ανά τετραγωνικό` : '—', sub: 'Μέσος όρος αγοράς ~3.50 € ανά τετραγωνικό', color: calc.totalMonthly > 0 && (calc.totalMonthly / 35) > 3.50 ? 'var(--negative)' : 'var(--positive)' },
              { label: 'Μέσο Μηνιαίο',           value: calc.avgMonthly > 0 ? `${Math.round(calc.avgMonthly)} €` : '—',             sub: 'βάσει ιστορικού',            color: 'var(--accent)'   },
              { label: 'Ακριβότερος μήνας',       value: Math.max(...calc.historyTotals) > 0 ? `${Math.round(Math.max(...calc.historyTotals))} €` : '—', sub: MONTHS_GR[calc.historyTotals.indexOf(Math.max(...calc.historyTotals))] || '—', color: 'var(--negative)' },
              { label: 'Εκκρεμείς',               value: calc.overdue.length > 0 ? `${calc.overdue.length} λογ/σμοί` : 'Εντάξει', sub: calc.totalUnpaid > 0 ? `${calc.totalUnpaid.toFixed(2)} €` : 'Καμία εκκρεμότητα', color: calc.overdue.length > 0 ? 'var(--negative)' : 'var(--positive)' },
            ].map((k, i) => (
              <div key={i} style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.card, padding: '14px 16px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: k.color, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>{k.value}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2, fontFamily: T.font.sans }}>{k.label}</div>
                <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>{k.sub}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 12, fontFamily: T.font.sans }}>Κατηγορίες vs. Μέσος Όρος Αγοράς</div>
          {calc.byCategory.map(c => {
            const pct    = c.benchmark > 0 ? (c.monthly / c.benchmark - 1) * 100 : 0;
            const isHigh = pct > 25;
            const barPct = c.benchmark > 0 ? Math.min(c.monthly / (c.benchmark * 2), 1) * 100 : 50;
            const budget = parseFloat(budgets[c.value] || '0');
            const overBudget = budget > 0 && c.monthly > budget;
            return (
              <div key={c.value} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: c.color, flexShrink: 0 }}/>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans }}>{c.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    {budget > 0 && <span style={{ fontSize: 9, color: overBudget ? 'var(--negative)' : 'var(--positive)', fontWeight: 700, fontFamily: T.font.sans }}>budget {fe(budget, 0)}</span>}
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(c.monthly, 0)}/μήνα</span>
                    {c.benchmark > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: isHigh ? 'var(--negative)' : pct < -10 ? 'var(--positive)' : 'var(--text-secondary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', width: 50, textAlign: 'right' as const }}>{pct > 0 ? '+' : ''}{pct.toFixed(0)}%</span>}
                    {c.benchmark > 0 && <span style={{ fontSize: 9, color: 'var(--text-tertiary)', width: 60, fontFamily: T.font.sans }}>μέσος όρος {fe(c.benchmark, 0)}</span>}
                  </div>
                </div>
                <div style={{ position: 'relative', height: 6, background: 'var(--bg-overlay)', borderRadius: 3 }}>
                  {c.benchmark > 0 && <div style={{ position: 'absolute', left: '50%', top: -2, width: 2, height: 10, background: 'var(--border-default)', borderRadius: 1 }}/>}
                  <div style={{ height: '100%', width: `${Math.min(barPct, 100)}%`, background: overBudget ? 'var(--negative)' : isHigh ? 'var(--negative)' : pct < -10 ? 'var(--positive)' : c.color, borderRadius: 3, transition: 'width 0.5s' }}/>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {calc.historyTotals.some(v => v > 0) && (() => {
        const ytd       = calc.historyTotals.slice(0, currentMonth + 1).reduce((a, b) => a + b, 0);
        const projected = calc.avgMonthly * 12;
        const remaining = Math.max(0, projected - ytd);
        const pct       = projected > 0 ? Math.min((ytd / projected) * 100, 100) : 0;
        return (
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}/>
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--text-secondary)', fontFamily: T.font.sans }}>Ετήσιος Απολογισμός {currentYear}</span>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginLeft: 'auto' }}>{MONTHS_GR[currentMonth]} — {currentYear}</span>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
              <span>Ιαν</span>
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{pct.toFixed(0)}% του έτους</span>
              <span>Δεκ</span>
            </div>
          </div>
        );
      })()}

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 }}>
        {secHdr(`Ιστορικό ${currentYear}`)}
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 14, fontFamily: T.font.sans }}>Καταχώρησε τα ποσά από τους λογαριασμούς σου ανά μήνα για να δεις τα γραφήματα.</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-secondary)', fontWeight: 400, fontSize: 9, textTransform: 'uppercase' as const, borderBottom: '1px solid var(--border-subtle)', width: 120, fontFamily: T.font.sans }}>Κατηγορία</th>
                {MONTHS_GR.map((m, i) => (
                  <th key={i} style={{ padding: '6px 4px', color: i === currentMonth ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: i === currentMonth ? 700 : 400, fontSize: 9, borderBottom: '1px solid var(--border-subtle)', textAlign: 'center', fontFamily: T.font.sans }}>{m}</th>
                ))}
                <th style={{ padding: '6px 8px', color: 'var(--text-secondary)', fontWeight: 400, fontSize: 9, borderBottom: '1px solid var(--border-subtle)', textAlign: 'right', fontFamily: T.font.sans }}>Σύνολο</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.filter(c => c.value !== 'other').map(c => {
                const rowTotal = history[c.value]?.reduce((s, v) => s + (parseFloat(v) || 0), 0) || 0;
                return (
                  <tr key={c.value}>
                    <td style={{ padding: '4px 8px', fontSize: 10, borderBottom: '1px solid var(--border-subtle)', whiteSpace: 'nowrap' as const }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: c.color, flexShrink: 0 }}/>
                        <span style={{ color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{c.label}</span>
                      </div>
                    </td>
                    {MONTHS_GR.map((_, i) => (
                      <td key={i} style={{ padding: '2px', borderBottom: '1px solid var(--border-subtle)' }}>
                        <input
                          type="number"
                          value={history[c.value]?.[i] || ''}
                          onChange={e => updateHistory(c.value, i, e.target.value)}
                          style={histInputStyle(i === currentMonth)}
                        />
                      </td>
                    ))}
                    <td style={{ padding: '4px 8px', fontWeight: 700, color: rowTotal > 0 ? 'var(--accent)' : 'var(--text-tertiary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid var(--border-subtle)', textAlign: 'right', fontSize: 11 }}>
                      {rowTotal > 0 ? fe(rowTotal, 0) : '—'}
                    </td>
                  </tr>
                );
              })}
              <tr style={{ background: 'var(--bg-elevated)' }}>
                <td style={{ padding: 8, fontWeight: 700, fontSize: 11, fontFamily: T.font.sans }}>Σύνολο</td>
                {calc.historyTotals.map((t, i) => (
                  <td key={i} style={{ padding: '5px 2px', fontWeight: 700, color: t > 0 ? (t > calc.avgMonthly * 1.2 ? 'var(--negative)' : 'var(--positive)') : 'var(--text-tertiary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', textAlign: 'center', fontSize: 10 }}>
                    {t > 0 ? Math.round(t) : '—'}
                  </td>
                ))}
                <td style={{ padding: 8, fontWeight: 700, color: 'var(--warning)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', textAlign: 'right', fontSize: 11 }}>
                  {fe(calc.historyTotals.reduce((a, b) => a + b, 0), 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10, marginTop: 16 }}>
          {[
            { label: 'Μέσο Μηνιαίο', value: calc.avgMonthly > 0 ? `${Math.round(calc.avgMonthly)} €` : '—', color: 'var(--accent)' },
            { label: 'Ακριβότερος',  value: Math.max(...calc.historyTotals) > 0 ? `${Math.round(Math.max(...calc.historyTotals))} €` : '—', color: 'var(--negative)' },
            { label: 'Φθηνότερος',   value: calc.historyTotals.filter(t => t > 0).length > 0 ? `${Math.round(Math.min(...calc.historyTotals.filter(t => t > 0)))} €` : '—', color: 'var(--positive)' },
          ].map((k, i) => (
            <div key={i} style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '10px 14px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: k.color, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
              <div style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, marginTop: 2, fontFamily: T.font.sans }}>{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 }}>
        {secHdr(`Ημερολόγιο Πληρωμών — ${MONTHS_GR[currentMonth]}`)}
        {bills.filter(b => b.due_date && new Date(b.due_date).getMonth() === currentMonth).length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-tertiary)', fontSize: 11, fontFamily: T.font.sans }}>Δεν υπάρχουν λογαριασμοί με ημερομηνία λήξης αυτόν τον μήνα</div>
        ) : (
          Array.from({ length: 31 }, (_, d) => d + 1).map(day => {
            const dayBills = bills.filter(b => {
              if (!b.due_date) return false;
              const d = new Date(b.due_date);
              return d.getMonth() === currentMonth && d.getDate() === day;
            });
            if (dayBills.length === 0) return null;
            const isToday = today.getDate() === day && today.getMonth() === currentMonth;
            return (
              <div key={day} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', alignItems: 'center' }}>
                <div style={{ width: 34, height: 34, borderRadius: T.radius.badge + 2, background: isToday ? 'var(--accent)' : 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: isToday ? 'var(--accent-text)' : 'var(--text-primary)', flexShrink: 0, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>
                  {day}
                </div>
                <div style={{ flex: 1 }}>
                  {dayBills.map(b => {
                    const c = cat(b.category);
                    return (
                      <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: c.color, flexShrink: 0 }}/>
                          <span style={{ fontSize: 11, color: b.paid ? 'var(--text-tertiary)' : 'var(--text-primary)', textDecoration: b.paid ? 'line-through' : 'none', fontFamily: T.font.sans }}>{b.name}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: b.paid ? 'var(--positive)' : 'var(--accent)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(b.amount, 2)}</span>
                          <span style={{ fontSize: 8, padding: '1px 6px', borderRadius: 3, background: b.paid ? 'rgba(52,168,83,0.1)' : 'rgba(197,34,31,0.1)', color: b.paid ? 'var(--positive)' : 'var(--negative)', fontFamily: T.font.sans }}>{b.paid ? 'Πληρώθηκε' : 'ΕΚΚΡΕΜΕΣ'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}