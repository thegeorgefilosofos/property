'use client';

import { useMemo, useState } from 'react';

interface Expense {
  id: string; amount: number; category: string; expense_group: string | null;
  date: string; paid_by: string | null; payment_method: string | null;
  cashback_amount: number | null; discount_amount: number | null;
  vat_amount: number | null; is_recurring: boolean; paid: boolean;
}

interface Props { expenses: Expense[]; }

const MONTHS_S = ['Ιαν','Φεβ','Μαρ','Απρ','Μαϊ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];

const GROUP_LABELS: Record<string, string> = {
  fixed: 'Πάγιες', renovation: 'Ανακαίνιση', appliances: 'Συσκευές',
  appliance_lease: 'Leasing Συσκ.', vehicle_lease: 'Leasing Οχημ.',
  commercial: 'Εμπορικό', broker: 'Μεσιτικά', legal: 'Νομικά',
  travel: 'Μετακινήσεις', exhibition: 'Εκθέσεις', tax: 'Φόροι',
  maintenance: 'Συντήρηση', other: 'Άλλα',
};

const GROUP_COLORS: Record<string, string> = {
  fixed: '#D4AF42', renovation: '#5B8DEF', appliances: '#34D97B',
  appliance_lease: '#8B5CF6', vehicle_lease: '#F59E0B',
  commercial: '#EC4899', broker: '#06B6D4', legal: '#F97316',
  travel: '#10B981', exhibition: '#A78BFA', tax: '#EF4444',
  maintenance: '#FB923C', other: '#6B7280',
};

function parseLocalDate(s: string): Date {
  if (!s) return new Date();
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const fmtEur = (n: number) => `${n.toLocaleString('el-GR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;
const fmtEur2 = (n: number) => `${n.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

// ─── Shared styles ────────────────────────────────────────────────────────────
const cardStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 12,
  padding: 16,
};

const SectionLabel = ({ label }: { label: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
    <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', flexShrink: 0 }} />
    <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.5px', textTransform: 'uppercase' as const, color: 'var(--text-secondary)', fontFamily: "'Google Sans', sans-serif" }}>
      {label}
    </span>
  </div>
);

// ─── Donut Chart ──────────────────────────────────────────────────────────────
function DonutChart({ data, size = 110 }: { data: { label: string; value: number; color: string }[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: "'Roboto', sans-serif" }}>
      Κενό
    </div>
  );
  let offset = 0;
  const r = size / 2 - 10, cx = size / 2, cy = size / 2, C = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border-subtle)" strokeWidth={size * 0.12} />
      {data.filter(d => d.value > 0).map((d, i) => {
        const pct = d.value / total, dash = pct * C, gap = C - dash;
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={d.color}
            strokeWidth={size * 0.12} strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset * C} style={{ transition: 'stroke-dasharray 0.5s' }}
            transform={`rotate(-90 ${cx} ${cy})`} />
        );
        offset += pct; return el;
      })}
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={size * 0.11} fontWeight="700"
        fill="var(--text-primary)" fontFamily="'Roboto Mono', monospace">
        {fmtEur(total).replace(' €', '')}
      </text>
      <text x={cx} y={cy + 4 + size * 0.1} textAnchor="middle" fontSize={size * 0.07}
        fill="var(--text-secondary)" fontFamily="'Roboto', sans-serif">€</text>
    </svg>
  );
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────
function BarChart({ data, height = 100 }: { data: { label: string; value: number; color?: string }[]; height?: number }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height, width: '100%' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, height: '100%', justifyContent: 'flex-end' }}>
          <div style={{ fontSize: 8, color: 'var(--text-secondary)', fontFamily: "'Roboto Mono', monospace", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
            {d.value > 0 ? fmtEur(d.value).replace(' €', '') : ''}
          </div>
          <div style={{ width: '100%', borderRadius: '3px 3px 0 0', height: `${Math.max((d.value / max) * 80, d.value > 0 ? 4 : 0)}%`, background: d.color || 'var(--accent)', opacity: d.value > 0 ? 1 : 0.15, transition: 'height 0.4s', minHeight: d.value > 0 ? '3px' : '0' }} />
          <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: "'Google Sans', sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{d.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Trend Line ───────────────────────────────────────────────────────────────
function TrendLine({ data, height = 60, color = 'var(--accent)' }: { data: number[]; height?: number; color?: string }) {
  if (data.length < 2) return null;
  const W = 300, max = Math.max(...data, 1);
  const pt = (v: number, i: number) => `${(i / (data.length - 1)) * (W - 20) + 10},${height - 10 - ((v / max) * (height - 20))}`;
  const pts = data.map((v, i) => pt(v, i)).join(' ');
  const fill = [`10,${height - 10}`, ...data.map((v, i) => pt(v, i)), `${W - 10},${height - 10}`].join(' ');
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={fill} fill="url(#tg)" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((v, i) => { const [x, y] = pt(v, i).split(','); return v > 0 ? <circle key={i} cx={x} cy={y} r={3} fill={color} /> : null; })}
    </svg>
  );
}

// ─── Period filter ────────────────────────────────────────────────────────────
type Period = '3m' | '6m' | '12m' | 'ytd' | 'all';
const PERIODS: { value: Period; label: string }[] = [
  { value: '3m', label: '3Μ' }, { value: '6m', label: '6Μ' },
  { value: '12m', label: '12Μ' }, { value: 'ytd', label: 'Φέτος' }, { value: 'all', label: 'Όλα' },
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

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KPICard({ label, value, color, small = false }: { label: string; value: string; color: string; small?: boolean }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: small ? 12 : 15, fontWeight: 700, color, fontFamily: "'Roboto Mono', monospace", marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      <div style={{ fontSize: 9, color: 'var(--text-secondary)', letterSpacing: '0.5px', textTransform: 'uppercase' as const, fontFamily: "'Google Sans', sans-serif", lineHeight: 1.3 }}>{label}</div>
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

    const maxVal = Math.max(...monthlyData);
    const topMonthIdx = maxVal > 0 ? monthlyData.lastIndexOf(maxVal) : -1;
    const topMonthLabel = topMonthIdx >= 0 ? monthlyLabels[topMonthIdx] : '—';

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
    const avgMonthly = total / 12;
    const projectedAnnual = avgMonthly * 12;
    const cashbackROI = total > 0 ? (totalCashback / total) * 100 : 0;
    const curMonthTotal = monthlyData[11] || 0;
    const prevMonthTotal = monthlyData[10] || 0;
    const momChange = prevMonthTotal > 0 ? ((curMonthTotal - prevMonthTotal) / prevMonthTotal) * 100 : 0;

    return {
      total, totalCashback, totalDiscount, totalVat, totalSavings,
      byOwner, byTenant, bySplit, byCompany, byGroup, monthlyData, monthlyLabels,
      ytdData, byPayment, topCat, topMonthLabel, topMonthIdx, recurringTotal,
      avgMonthly, projectedAnnual, cashbackROI, curMonthTotal, prevMonthTotal, momChange,
    };
  }, [filtered, expenses, thisYear, thisMonth]);

  if (expenses.length === 0) return null;

  const paidByData = [
    { label: 'Ιδιοκτήτης', value: stats.byOwner, color: 'var(--warning)' },
    { label: 'Ενοικιαστής', value: stats.byTenant, color: 'var(--info)' },
    { label: '50/50', value: stats.bySplit, color: 'var(--accent)' },
    { label: 'Εταιρεία', value: stats.byCompany, color: 'var(--positive)' },
  ].filter(d => d.value > 0);

  const groupData = Object.entries(stats.byGroup)
    .sort(([, a], [, b]) => b - a).slice(0, 8)
    .map(([k, v]) => ({ label: GROUP_LABELS[k] || k, value: v, color: GROUP_COLORS[k] || 'var(--text-secondary)' }));

  const monthBarData = stats.monthlyData.map((v, i) => ({
    label: stats.monthlyLabels[i], value: v,
    color: i === stats.topMonthIdx ? 'var(--negative)' : i === 11 ? 'var(--accent)' : 'var(--border-default)',
  }));

  const pmLabels: Record<string, string> = {
    cash: 'Μετρητά', debit_cb: 'Χρεωστ. (CB)', debit_no_cb: 'Χρεωστική',
    credit_free: 'Πιστ. Άτοκες', credit_interest: 'Πιστ. Έντοκες',
    klarna: 'Klarna', tbi: 'TBI', snappi: 'Snappi', kotsovolos: 'Κωτσόβολος',
    plaisio4: 'Πλαίσιο x4', local_store: 'Τοπικό Κατ.', promissory: 'Γραμμάτια',
    bank_transfer: 'Τραπεζική Μεταφ.', check: 'Επιταγή', cash_black: 'Αδήλωτα', family: 'Οικογένεια',
  };

  return (
    <div style={{ marginBottom: 20, fontFamily: "'Roboto', sans-serif" }}>

      {/* Unpaid alert */}
      {unpaid.length > 0 && (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderLeft: '3px solid var(--negative)', borderRadius: 10, padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--negative)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--negative)', fontFamily: "'Google Sans', sans-serif" }}>
            {unpaid.length} εκκρεμείς δαπάνες
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>— {fmtEur2(unpaidTotal)} αναμένουν εξόφληση</span>
        </div>
      )}

      {/* Header + period filter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: "'Google Sans', sans-serif" }}>
            Ανάλυση Δαπανών
          </span>
        </div>
        <div style={{ display: 'flex', gap: 3, background: 'var(--bg-surface)', borderRadius: 8, padding: 3 }}>
          {PERIODS.map(p => (
            <button key={p.value} onClick={() => setPeriod(p.value)}
              style={{
                padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 500, fontFamily: "'Google Sans', sans-serif",
                background: period === p.value ? 'var(--accent)' : 'transparent',
                color: period === p.value ? '#fff' : 'var(--text-secondary)',
                transition: 'all 0.15s',
              }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,minmax(0,1fr))', gap: 10, marginBottom: 14 }}>
        <KPICard label="Μέση Μηνιαία" value={fmtEur(stats.avgMonthly)} color="var(--text-primary)" />
        <KPICard label="Εκτιμ. Ετήσιο" value={fmtEur(stats.projectedAnnual)} color="var(--negative)" />
        <KPICard label="Επαναλαμβαν." value={fmtEur(stats.recurringTotal)} color="var(--info)" />
        <KPICard label="Εξοικονόμηση" value={fmtEur(stats.totalSavings)} color="var(--positive)" />
        <KPICard label="Κορυφαία Κατηγορία" value={stats.topCat ? stats.topCat[0] : '—'} color="var(--accent)" small />
        <KPICard label="Ακριβότερος Μήνας" value={stats.topMonthLabel} color="var(--warning)" small />
      </div>

      {/* MoM */}
      {stats.prevMonthTotal > 0 && (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: "'Roboto', sans-serif" }}>
            {MONTHS_S[thisMonth]}: <strong style={{ color: 'var(--accent)', fontFamily: "'Roboto Mono', monospace" }}>{fmtEur(stats.curMonthTotal)}</strong>
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: "'Roboto', sans-serif" }}>
            {MONTHS_S[thisMonth > 0 ? thisMonth - 1 : 11]}: <strong style={{ fontFamily: "'Roboto Mono', monospace", color: 'var(--text-primary)' }}>{fmtEur(stats.prevMonthTotal)}</strong>
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: stats.momChange > 0 ? 'var(--negative)' : 'var(--positive)', fontFamily: "'Roboto Mono', monospace" }}>
            {stats.momChange > 0 ? '+' : ''}{stats.momChange.toFixed(1)}% MoM
          </span>
        </div>
      )}

      {/* Row 1: donuts + YTD */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 14, marginBottom: 14 }}>

        {/* By payer */}
        <div style={cardStyle}>
          <SectionLabel label="Κατανομή ανά Πληρωτή" />
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <DonutChart data={paidByData} size={110} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              {paidByData.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, fontSize: 11, color: 'var(--text-secondary)', fontFamily: "'Roboto', sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: "'Roboto Mono', monospace", flexShrink: 0 }}>{fmtEur(d.value)}</div>
                </div>
              ))}
              {stats.total > 0 && (
                <div style={{ marginTop: 4, paddingTop: 6, borderTop: '1px solid var(--border-subtle)', fontSize: 10, color: 'var(--text-secondary)', fontFamily: "'Roboto', sans-serif" }}>
                  Ιδιοκτ.: <strong style={{ color: 'var(--warning)' }}>{((stats.byOwner / stats.total) * 100).toFixed(0)}%</strong>
                  {stats.byTenant > 0 && <> · Ενοικ.: <strong style={{ color: 'var(--info)' }}>{((stats.byTenant / stats.total) * 100).toFixed(0)}%</strong></>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* By group */}
        <div style={cardStyle}>
          <SectionLabel label="Κατανομή ανά Ομάδα" />
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <DonutChart data={groupData} size={110} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 120, overflowY: 'auto', minWidth: 0 }}>
              {groupData.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, fontSize: 10, color: 'var(--text-secondary)', fontFamily: "'Roboto', sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.label}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: d.color, fontFamily: "'Roboto Mono', monospace", flexShrink: 0 }}>{((d.value / stats.total) * 100).toFixed(0)}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* YTD cumulative */}
        <div style={cardStyle}>
          <SectionLabel label={`Σωρευτικές ${thisYear}`} />
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--negative)', fontFamily: "'Roboto Mono', monospace", letterSpacing: '-0.5px' }}>
              {fmtEur(stats.ytdData[stats.ytdData.length - 1] || 0)}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2, fontFamily: "'Roboto', sans-serif" }}>
              YTD (Ιαν – {MONTHS_S[thisMonth]})
            </div>
          </div>
          <TrendLine data={stats.ytdData} height={70} color="var(--negative)" />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: "'Roboto', sans-serif" }}>Ιαν</span>
            <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: "'Roboto', sans-serif" }}>{MONTHS_S[thisMonth]}</span>
          </div>
        </div>
      </div>

      {/* Row 2: monthly bars + payment methods */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14 }}>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <SectionLabel label="Δαπάνες Τελευταίων 12 Μηνών" />
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: "'Roboto Mono', monospace" }}>
              Μέγιστο: <strong style={{ color: 'var(--negative)' }}>{fmtEur(Math.max(...stats.monthlyData))}</strong>
            </div>
          </div>
          <BarChart data={monthBarData} height={110} />
        </div>

        <div style={cardStyle}>
          <SectionLabel label="Τρόποι Πληρωμής" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(stats.byPayment).sort(([, a], [, b]) => b - a).slice(0, 6).map(([m, amt], i) => {
              const pct = stats.total > 0 ? (amt / stats.total) * 100 : 0;
              return (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: "'Roboto', sans-serif" }}>{pmLabels[m] || m}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-primary)', fontFamily: "'Roboto Mono', monospace", fontWeight: 500 }}>{fmtEur(amt)}</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--border-subtle)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width 0.4s' }} />
                  </div>
                </div>
              );
            })}
            {stats.totalCashback > 0 && (
              <div style={{ marginTop: 6, paddingTop: 8, borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'var(--positive)', fontFamily: "'Roboto', sans-serif" }}>Cashback ROI</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--positive)', fontFamily: "'Roboto Mono', monospace" }}>{stats.cashbackROI.toFixed(2)}%</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: group bars */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <SectionLabel label="Δαπάνες ανά Ομάδα" />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {groupData.slice(0, 5).map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: "'Roboto', sans-serif" }}>{d.label}</span>
              </div>
            ))}
          </div>
        </div>
        <BarChart data={groupData} height={100} />
      </div>
    </div>
  );
}