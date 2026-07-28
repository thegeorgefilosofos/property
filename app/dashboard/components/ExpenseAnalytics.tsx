'use client';

import { useMemo, useState } from 'react';
import { T, Card, EmptyState } from '@/components/Theme';
import { Receipt, CreditCard } from 'lucide-react';

interface Expense {
  id: string; amount: number; category: string; expense_group: string | null;
  date: string; paid_by: string | null; payment_method: string | null;
  cashback_amount: number | null; discount_amount: number | null;
  vat_amount: number | null; is_recurring: boolean; paid: boolean;
}

interface Props { expenses: Expense[]; }

const MONTHS_S = ['Ιαν','Φεβ','Μαρ','Απρ','Μάι','Ιούν','Ιούλ','Αύγ','Σεπ','Οκτ','Νοέ','Δεκ'];

const GROUP_LABELS: Record<string, string> = {
  fixed: 'Πάγιες', renovation: 'Ανακαίνιση', appliances: 'Συσκευές',
  appliance_lease: 'Leasing συσκευών', vehicle_lease: 'Leasing οχημάτων',
  commercial: 'Εμπορικό', broker: 'Μεσιτικά', legal: 'Νομικά',
  travel: 'Μετακινήσεις', exhibition: 'Εκθέσεις', tax: 'Φόροι',
  maintenance: 'Συντήρηση', other: 'Άλλα',
};

// ── Παλέτα: μία διαβάθμιση του accent προς ουδέτερο (καμία «ουράνια-τόξο» χρωματολογία).
// Καθαρή, ήρεμη, premium· το χρώμα δείχνει ιεραρχία μεγέθους, όχι θόρυβο.
function ramp(i: number, n: number): string {
  if (n <= 1) return 'var(--accent)';
  const w = Math.round(84 - (i / (n - 1)) * 60); // 84% → 24% accent, υπόλοιπο ουδέτερο
  return `color-mix(in srgb, var(--accent) ${w}%, var(--text-tertiary))`;
}

function parseLocalDate(s: string): Date {
  if (!s) return new Date();
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const NBSP = ' ';
const fmtEur = (n: number) => `${Math.round(n).toLocaleString('el-GR')}${NBSP}€`;
const fmtEur2 = (n: number) => `${n.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${NBSP}€`;
const num = (n: number): React.CSSProperties => ({ fontFamily: T.font.sans, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' } as React.CSSProperties);

// ─── Shared styles ────────────────────────────────────────────────────────────
const SectionLabel = ({ label }: { label: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>
      {label}
    </span>
  </div>
);

// ─── Donut ──────────────────────────────────────────────────────────────────
function DonutChart({ data, size = 128 }: { data: { label: string; value: number; color: string }[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = size / 2 - 11, cx = size / 2, cy = size / 2, C = 2 * Math.PI * r;
  const sw = size * 0.11;
  if (!total) return (
    <div style={{ width: size, height: size, borderRadius: '50%', border: `${sw}px solid var(--border-subtle)`, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
      Κενό
    </div>
  );
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border-subtle)" strokeWidth={sw} />
      {data.filter(d => d.value > 0).map((d, i) => {
        const pct = d.value / total, dash = pct * C, gap = C - dash;
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={d.color}
            strokeWidth={sw} strokeLinecap="round" strokeDasharray={`${Math.max(dash - 2, 0.1)} ${gap + 2}`}
            strokeDashoffset={-offset * C} style={{ transition: 'stroke-dasharray 0.5s' }}
            transform={`rotate(-90 ${cx} ${cy})`} />
        );
        offset += pct; return el;
      })}
      <text x={cx} y={cy - 1} textAnchor="middle" fontSize={size * 0.145} fontWeight="700"
        fill="var(--text-primary)" fontFamily="'Inter', sans-serif" style={{ letterSpacing: '-0.02em' }}>
        {Math.round(total).toLocaleString('el-GR')}
      </text>
      <text x={cx} y={cy + size * 0.11} textAnchor="middle" fontSize={size * 0.075}
        fill="var(--text-tertiary)" fontFamily="'Inter', sans-serif">€ σύνολο</text>
    </svg>
  );
}

// ─── Οριζόντιες μπάρες κατάταξης (αντικαθιστά τις «τεντωμένες» κάθετες όταν υπάρχει 1 ομάδα) ───
function RankBars({ data, total }: { data: { label: string; value: number; color: string }[]; total: number }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {data.map((d, i) => {
        const pct = total > 0 ? (d.value / total) * 100 : 0;
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '112px 1fr auto', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ width: 8, height: 8, borderRadius: 3, background: d.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.label}</span>
            </div>
            <div style={{ height: 8, background: 'var(--border-subtle)', borderRadius: 100, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.max((d.value / max) * 100, d.value > 0 ? 2 : 0)}%`, background: d.color, borderRadius: 100, transition: 'width 0.5s cubic-bezier(.2,0,0,1)' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', ...num(d.value) }}>{fmtEur(d.value)}</span>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', ...num(pct), minWidth: 34, textAlign: 'right' }}>{pct.toFixed(0)}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Κάθετες μπάρες 12 μηνών (ουδέτερες· ο τρέχων μήνας διακριτικά με accent) ───
function MonthBars({ data, labels, currentIdx, height = 132 }: { data: number[]; labels: string[]; currentIdx: number; height?: number }) {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height, width: '100%' }}>
      {data.map((v, i) => {
        const isCur = i === currentIdx;
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end', minWidth: 0 }}>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', ...num(v), whiteSpace: 'nowrap', opacity: v > 0 ? 1 : 0 }}>
              {v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v)}
            </div>
            <div title={fmtEur(v)} style={{ width: '100%', maxWidth: 34, borderRadius: '4px 4px 0 0', height: `${Math.max((v / max) * 100, v > 0 ? 3 : 0)}%`, background: isCur ? 'var(--accent)' : 'var(--border-strong)', transition: 'height 0.45s cubic-bezier(.2,0,0,1)', minHeight: v > 0 ? 3 : 0 }} />
            <div style={{ fontSize: 9, color: isCur ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontWeight: isCur ? 700 : 400, fontFamily: T.font.sans, whiteSpace: 'nowrap' }}>{labels[i]}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Σωρευτική καμπύλη (ήρεμη, accent· όχι κόκκινο) ───
function Area({ data, height = 72 }: { data: number[]; height?: number }) {
  if (data.length < 2) return <div style={{ height, display: 'flex', alignItems: 'center', color: 'var(--text-tertiary)', fontSize: 11, fontFamily: T.font.sans }}>Χρειάζονται τουλάχιστον δύο μήνες</div>;
  const W = 300, max = Math.max(...data, 1);
  const pt = (v: number, i: number) => `${(i / (data.length - 1)) * (W - 16) + 8},${height - 8 - ((v / max) * (height - 16))}`;
  const pts = data.map((v, i) => pt(v, i)).join(' ');
  const fill = [`8,${height - 8}`, ...data.map((v, i) => pt(v, i)), `${W - 8},${height - 8}`].join(' ');
  const [lx, ly] = pt(data[data.length - 1], data.length - 1).split(',');
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="ea-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.16" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={fill} fill="url(#ea-area)" />
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={3.5} fill="var(--accent)" />
    </svg>
  );
}

// ─── Period filter ────────────────────────────────────────────────────────────
type Period = '3m' | '6m' | '12m' | 'ytd' | 'all';
const PERIODS: { value: Period; label: string }[] = [
  { value: '3m', label: '3 μήνες' }, { value: '6m', label: '6 μήνες' },
  { value: '12m', label: '12 μήνες' }, { value: 'ytd', label: 'Φέτος' }, { value: 'all', label: 'Όλα' },
];

function filterByPeriod(expenses: Expense[], period: Period): Expense[] {
  if (period === 'all') return expenses;
  const now = new Date(), cutoff = new Date();
  if (period === '3m') cutoff.setMonth(now.getMonth() - 3);
  if (period === '6m') cutoff.setMonth(now.getMonth() - 6);
  if (period === '12m') cutoff.setMonth(now.getMonth() - 12);
  if (period === 'ytd') cutoff.setFullYear(now.getFullYear(), 0, 1);
  return expenses.filter(e => parseLocalDate(e.date) >= cutoff);
}

// ─── KPI (ουδέτερος αριθμός· χρώμα μόνο ως διακριτικό σήμα εξοικονόμησης) ───
function KPICard({ label, value, hint, positive = false }: { label: string; value: string; hint?: string; positive?: boolean }) {
  return (
    <div className="po-fig-card" tabIndex={0} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '14px 16px', minWidth: 0 }}>
      <div className="po-fig" data-tone={positive ? 'positive' : undefined} style={{ fontSize: 17, fontWeight: 700, ...num(0), marginBottom: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' as const, fontFamily: T.font.sans, lineHeight: 1.3 }}>{label}</div>
      {hint && <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ExpenseAnalytics({ expenses }: Props) {
  const now = new Date(), thisYear = now.getFullYear(), thisMonth = now.getMonth();
  const [period, setPeriod] = useState<Period>('12m');
  const filtered = useMemo(() => filterByPeriod(expenses, period), [expenses, period]);
  const unpaid = expenses.filter(e => !e.paid);
  const unpaidTotal = unpaid.reduce((s, e) => s + e.amount, 0);

  const stats = useMemo(() => {
    const exp = filtered;
    const total = exp.reduce((s, e) => s + e.amount, 0);
    const totalCashback = exp.reduce((s, e) => s + (e.cashback_amount || 0), 0);
    const totalDiscount = exp.reduce((s, e) => s + (e.discount_amount || 0), 0);
    const totalVat = exp.reduce((s, e) => s + (e.vat_amount || 0), 0);
    const totalSavings = totalCashback + totalDiscount;
    const byOwner = exp.filter(e => !e.paid_by || e.paid_by === 'owner').reduce((s, e) => s + e.amount, 0);
    const byTenant = exp.filter(e => e.paid_by === 'tenant').reduce((s, e) => s + e.amount, 0);
    const bySplit = exp.filter(e => e.paid_by === 'split').reduce((s, e) => s + e.amount, 0);
    const byCompany = exp.filter(e => e.paid_by === 'company').reduce((s, e) => s + e.amount, 0);
    const byGroup: Record<string, number> = {};
    exp.forEach(e => { const g = e.expense_group || 'other'; byGroup[g] = (byGroup[g] || 0) + e.amount; });

    const monthlyLabels: string[] = [];
    const monthlyData: number[] = Array(12).fill(0);
    for (let i = 0; i < 12; i++) {
      const d = new Date(thisYear, thisMonth - 11 + i, 1);
      monthlyLabels.push(MONTHS_S[d.getMonth()]);
    }
    exp.forEach(e => {
      if (!e.date) return;
      const d = parseLocalDate(e.date);
      const monthsAgo = (thisYear - d.getFullYear()) * 12 + (thisMonth - d.getMonth());
      if (monthsAgo >= 0 && monthsAgo < 12) monthlyData[11 - monthsAgo] += e.amount;
    });

    const monthsWithData = monthlyData.filter(v => v > 0).length;
    const ytdData: number[] = [];
    let cum = 0;
    for (let m = 0; m <= thisMonth; m++) {
      const mTotal = expenses.filter(e => {
        if (!e.date) return false;
        const d = parseLocalDate(e.date);
        return d.getFullYear() === thisYear && d.getMonth() === m;
      }).reduce((s, e) => s + e.amount, 0);
      cum += mTotal; ytdData.push(cum);
    }

    const byPayment: Record<string, number> = {};
    exp.forEach(e => { if (e.payment_method) byPayment[e.payment_method] = (byPayment[e.payment_method] || 0) + e.amount; });
    const byCat: Record<string, number> = {};
    exp.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
    const topCat = Object.entries(byCat).sort(([, a], [, b]) => b - a)[0];
    const recurringTotal = exp.filter(e => e.is_recurring).reduce((s, e) => s + e.amount, 0);
    // Μέσος όρος ΜΟΝΟ στους μήνες με κίνηση (ρεαλιστικός, όχι /12 που «αραιώνει»)
    const avgMonthly = monthsWithData > 0 ? total / monthsWithData : 0;
    const projectedAnnual = avgMonthly * 12;
    const cashbackROI = total > 0 ? (totalCashback / total) * 100 : 0;
    const curMonthTotal = monthlyData[11] || 0;
    const prevMonthTotal = monthlyData[10] || 0;
    const momChange = prevMonthTotal > 0 ? ((curMonthTotal - prevMonthTotal) / prevMonthTotal) * 100 : 0;

    return {
      total, totalCashback, totalDiscount, totalVat, totalSavings, monthsWithData,
      byOwner, byTenant, bySplit, byCompany, byGroup, monthlyData, monthlyLabels,
      ytdData, byPayment, topCat, recurringTotal,
      avgMonthly, projectedAnnual, cashbackROI, curMonthTotal, prevMonthTotal, momChange,
    };
  }, [filtered, expenses, thisYear, thisMonth]);

  if (expenses.length === 0) return null;

  const payers = [
    { key: 'owner', label: 'Ιδιοκτήτης', value: stats.byOwner },
    { key: 'tenant', label: 'Ενοικιαστής', value: stats.byTenant },
    { key: 'split', label: 'Μοιρασμένα (50/50)', value: stats.bySplit },
    { key: 'company', label: 'Εταιρεία', value: stats.byCompany },
  ].filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  const paidByData = payers.map((p, i) => ({ ...p, color: ramp(i, payers.length) }));

  const groupData = Object.entries(stats.byGroup)
    .sort(([, a], [, b]) => b - a).slice(0, 8)
    .map(([k, v], i, arr) => ({ label: GROUP_LABELS[k] || k, value: v, color: ramp(i, arr.length) }));

  const pmLabels: Record<string, string> = {
    cash: 'Μετρητά', debit_cb: 'Χρεωστική με επιστροφή', debit_no_cb: 'Χρεωστική',
    credit_free: 'Πιστωτική άτοκα', credit_interest: 'Πιστωτική έντοκα',
    klarna: 'Klarna', tbi: 'TBI', snappi: 'Snappi', kotsovolos: 'Κωτσόβολος',
    plaisio4: 'Πλαίσιο x4', local_store: 'Τοπικό κατάστημα', promissory: 'Γραμμάτια',
    bank_transfer: 'Τραπεζική μεταφορά', check: 'Επιταγή', cash_black: 'Αδήλωτα', family: 'Οικογένεια',
  };

  // Μήνυμα σε σχέση με τον προηγούμενο μήνα, σε καθαρά ελληνικά, χωρίς «MoM».
  const momText = (() => {
    if (stats.prevMonthTotal <= 0) return null;
    if (stats.curMonthTotal <= 0) return { tone: 'muted', text: `Καμία δαπάνη ${MONTHS_S[thisMonth]} ακόμη. Τον ${MONTHS_S[thisMonth > 0 ? thisMonth - 1 : 11]} είχες ${fmtEur(stats.prevMonthTotal)}.` };
    const diff = stats.curMonthTotal - stats.prevMonthTotal;
    const pct = Math.abs(stats.momChange).toFixed(0);
    if (Math.abs(stats.momChange) < 3) return { tone: 'muted', text: `Σταθερά σε σχέση με τον προηγούμενο μήνα (${fmtEur(stats.curMonthTotal)}).` };
    return diff > 0
      ? { tone: 'up', text: `${pct}% περισσότερα από τον προηγούμενο μήνα (+${fmtEur(diff)}).` }
      : { tone: 'down', text: `${pct}% λιγότερα από τον προηγούμενο μήνα (−${fmtEur(Math.abs(diff))}).` };
  })();

  return (
    <div style={{ marginBottom: 20, fontFamily: T.font.sans }}>

      {/* Εκκρεμείς */}
      {unpaid.length > 0 && (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warning)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: T.font.sans }}>
            <strong>{unpaid.length}</strong> {unpaid.length === 1 ? 'δαπάνη μένει' : 'δαπάνες μένουν'} να εξοφληθούν
          </span>
          <span style={{ fontSize: 13, color: 'var(--text-tertiary)', ...num(unpaidTotal) }}>{fmtEur2(unpaidTotal)}</span>
        </div>
      )}

      {/* Header + περίοδος */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: T.font.sans }}>
            Ανάλυση δαπανών
          </span>
        </div>
        <div style={{ display: 'inline-flex', gap: 2, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 100, padding: 3 }}>
          {PERIODS.map(p => {
            const on = period === p.value;
            return (
              <button key={p.value} onClick={() => setPeriod(p.value)}
                style={{
                  padding: '6px 14px', borderRadius: 100, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: on ? 700 : 500, fontFamily: T.font.sans,
                  background: on ? 'var(--accent)' : 'transparent',
                  color: on ? 'var(--accent-text)' : 'var(--text-secondary)',
                  transition: 'background 0.15s, color 0.15s',
                }}>
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 14 }}>
        <KPICard label="Μέσος όρος τον μήνα" value={fmtEur(stats.avgMonthly)} hint={`σε ${stats.monthsWithData} ${stats.monthsWithData === 1 ? 'μήνα' : 'μήνες'} με κινήσεις`} />
        <KPICard label="Πρόβλεψη έτους" value={fmtEur(stats.projectedAnnual)} hint="με βάση τον ρυθμό σου" />
        <KPICard label="Πάγιες / επαναλαμβανόμενες" value={fmtEur(stats.recurringTotal)} />
        <KPICard label="Εξοικονόμηση" value={fmtEur(stats.totalSavings)} positive={stats.totalSavings > 0} hint={stats.totalSavings > 0 ? 'επιστροφές & εκπτώσεις' : undefined} />
        {stats.topCat && <KPICard label="Μεγαλύτερη κατηγορία" value={stats.topCat[0]} hint={fmtEur(stats.topCat[1])} />}
      </div>

      {/* Σε σχέση με τον προηγούμενο μήνα */}
      {momText && (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: momText.tone === 'up' ? 'var(--text-tertiary)' : momText.tone === 'down' ? 'var(--text-tertiary)' : 'var(--text-tertiary)' }} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>{momText.text}</span>
        </div>
      )}

      {/* Row 1: κατανομές + σωρευτική */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14, marginBottom: 14 }}>

        {/* Ανά πληρωτή */}
        <Card pad="md" gap={false}>
          <SectionLabel label="Ποιος πληρώνει" />
          <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
            <DonutChart data={paidByData} size={124} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              {paidByData.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 3, background: d.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', ...num(d.value), flexShrink: 0 }}>{fmtEur(d.value)}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Ανά ομάδα */}
        <Card pad="md" gap={false}>
          <SectionLabel label="Πού πάνε τα χρήματα" />
          {groupData.length > 0
            ? <RankBars data={groupData} total={stats.total} />
            : <EmptyState icon={<Receipt size={20} />} title="Καμία κίνηση στην περίοδο" hint="Άλλαξε περίοδο ή καταχώρησε δαπάνες για να δεις πού πάνε τα χρήματα." />}
        </Card>

        {/* Σωρευτικές έτους */}
        <Card pad="md" gap={false}>
          <SectionLabel label={`Σύνολο από την αρχή του ${thisYear}`} />
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', ...num(0), letterSpacing: '-0.02em' }}>
              {fmtEur(stats.ytdData[stats.ytdData.length - 1] || 0)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3, fontFamily: T.font.sans }}>
              Ιανουάριος έως {MONTHS_S[thisMonth]}
            </div>
          </div>
          <Area data={stats.ytdData} height={72} />
        </Card>
      </div>

      {/* Row 2: 12 μήνες + τρόποι πληρωμής */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 14, marginBottom: 14 }}>

        <Card pad="md" gap={false}>
          <SectionLabel label="Δαπάνες ανά μήνα" />
          <MonthBars data={stats.monthlyData} labels={stats.monthlyLabels} currentIdx={11} height={132} />
        </Card>

        <Card className="po-fig-card" tabIndex={0} pad="md" gap={false}>
          <SectionLabel label="Τρόποι πληρωμής" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(stats.byPayment).sort(([, a], [, b]) => b - a).slice(0, 6).map(([m, amt], i) => {
              const pct = stats.total > 0 ? (amt / stats.total) * 100 : 0;
              return (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{pmLabels[m] || m}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-primary)', ...num(amt), fontWeight: 500 }}>{fmtEur(amt)}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--border-subtle)', borderRadius: 100, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 100, transition: 'width 0.4s' }} />
                  </div>
                </div>
              );
            })}
            {Object.keys(stats.byPayment).length === 0 && (
              <EmptyState icon={<CreditCard size={20} />} title="Κανένας τρόπος πληρωμής" hint="Δήλωσε κάρτα ή μετρητά στις δαπάνες για να δεις κατανομή και επιστροφές χρημάτων." />
            )}
            {stats.totalCashback > 0 && (
              <div style={{ marginTop: 6, paddingTop: 10, borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>Επιστροφή χρημάτων (cashback)</span>
                <span className="po-fig" data-tone="positive" style={{ fontSize: 12, fontWeight: 600, ...num(0) }}>{fmtEur(stats.totalCashback)}</span>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
