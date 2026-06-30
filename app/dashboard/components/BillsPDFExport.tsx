'use client';

const fe = (n: number, d = 2) => `${n.toLocaleString('el-GR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`;
const todayStr = () => new Date().toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' });

const T = {
  radius: { card: 14, inner: 10, badge: 6, btn: 10, pill: 100 },
  font: { sans: "Inter, 'Google Sans', sans-serif", mono: "'JetBrains Mono', monospace" },
};

interface BillEntry {
  id: string; category: string; name: string; amount: number;
  period?: string; due_date?: string; paid: boolean; recurring: boolean;
  vat_rate?: number; kwh?: number; notes?: string;
}

interface BillsData {
  propertyName: string; propertyAddress: string; bills: BillEntry[];
  totalMonthly: number; totalAnnual: number; avgMonthly: number;
  historyTotals: number[];
}

const CAT: Record<string, { label: string; color: string }> = {
  electricity: { label: 'Ρεύμα',            color: '#f59e0b' },
  common:      { label: 'Κοινόχρηστα',       color: '#6366f1' },
  internet:    { label: 'Internet',           color: '#3b82f6' },
  water:       { label: 'Νερό',              color: '#06b6d4' },
  gas:         { label: 'Αέριο/Θέρμανση',    color: '#ef4444' },
  insurance:   { label: 'Ασφάλεια',          color: '#10b981' },
  security:    { label: 'Ασφάλεια',          color: '#f97316' },
  streaming:   { label: 'Streaming',          color: '#ec4899' },
  enfia:       { label: 'ΕΝΦΙΑ',             color: '#64748b' },
  dimotika:    { label: 'Δημοτικά Τέλη',     color: '#94a3b8' },
  taxes:       { label: 'Φόροι',             color: '#64748b' },
  cleaning:    { label: 'Καθαρισμός',         color: '#84cc16' },
  garden:      { label: 'Κήπος',             color: '#22c55e' },
  pool:        { label: 'Πισίνα',            color: '#0ea5e9' },
  elevator:    { label: 'Ανελκυστήρας',      color: '#a78bfa' },
  ac_service:  { label: 'Σέρβις Κλιματιστικού', color: '#38bdf8' },
  renovation:  { label: 'Ανακαίνιση',        color: '#d97706' },
  pest:        { label: 'Απεντόμωση',        color: '#78716c' },
  other:       { label: 'Άλλο',              color: '#94a3b8' },
};

const catOf = (v: string) => CAT[v] || { label: v, color: '#94a3b8' };
const MONTHS_FULL = ['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος','Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος'];
const MONTHS_SH   = ['Ιαν','Φεβ','Μαρ','Απρ','Μαΐ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];

export default function BillsPDFExport({ data }: { data: BillsData }) {

  const handlePrint = () => {
    const now          = new Date();
    const currentMonth = now.getMonth();
    const year         = now.getFullYear();
    const overdue      = data.bills.filter(b => !b.paid && b.due_date && new Date(b.due_date) < now);
    const dueSoon      = data.bills.filter(b => !b.paid && b.due_date && (() => {
      const d = Math.ceil((new Date(b.due_date!).getTime() - now.getTime()) / 86400000);
      return d >= 0 && d <= 7;
    })());
    const maxH         = Math.max(...(data.historyTotals || [1]), 1);
    const paidBills    = data.bills.filter(b => b.paid);
    const unpaidBills  = data.bills.filter(b => !b.paid);

    // Category breakdown
    const byCat: Record<string, { label: string; color: string; monthly: number; count: number }> = {};
    data.bills.filter(b => b.recurring).forEach(b => {
      const c = catOf(b.category);
      if (!byCat[b.category]) byCat[b.category] = { ...c, monthly: 0, count: 0 };
      byCat[b.category].monthly += b.amount;
      byCat[b.category].count++;
    });

    // Bill rows
    const billRow = (b: BillEntry, i: number) => {
      const c           = catOf(b.category);
      const dl          = b.due_date ? Math.ceil((new Date(b.due_date).getTime() - now.getTime()) / 86400000) : null;
      const isOd        = dl !== null && dl < 0;
      const statusBg    = b.paid ? '#e6f4ea' : isOd ? '#fce8e6' : '#fff8e1';
      const statusColor = b.paid ? '#137333' : isOd ? '#c5221f' : '#b45309';
      const statusText  = b.paid ? 'Πληρώθηκε' : isOd ? 'Ληξιπρόθεσμος' : 'Εκκρεμεί';
      const isEven      = i % 2 === 0;
      return `
        <tr style="background:${isEven ? '#ffffff' : '#f8fafc'}">
          <td style="padding:9px 12px;border-bottom:1px solid #e8eaed;vertical-align:middle">
            <span style="font-size:9px;font-weight:700;padding:3px 8px;border-radius:4px;background:${c.color}18;color:${c.color};letter-spacing:0.03em">${c.label}</span>
          </td>
          <td style="padding:9px 12px;border-bottom:1px solid #e8eaed;font-weight:600;color:#202124;font-size:11px">${b.name}</td>
          <td style="padding:9px 12px;border-bottom:1px solid #e8eaed;font-size:10px;color:#5f6368">${b.period || (b.due_date ? new Date(b.due_date).toLocaleDateString('el-GR', {day:'2-digit',month:'short',year:'numeric'}) : '—')}</td>
          <td style="padding:9px 12px;border-bottom:1px solid #e8eaed;text-align:center">
            <span style="font-size:9px;font-weight:600;padding:2px 8px;border-radius:4px;background:${b.recurring ? 'rgba(26,115,232,0.1)' : 'rgba(128,134,139,0.1)'};color:${b.recurring ? '#1a73e8' : '#80868b'}">${b.recurring ? 'Πάγιο' : 'Εφάπαξ'}</span>
          </td>
          <td style="padding:9px 12px;border-bottom:1px solid #e8eaed;text-align:center">
            <span style="font-size:9px;font-weight:700;padding:3px 9px;border-radius:4px;background:${statusBg};color:${statusColor}">${statusText}</span>
          </td>
          <td style="padding:9px 12px;border-bottom:1px solid #e8eaed;font-weight:700;text-align:right;font-family:'Roboto Mono',monospace;font-size:12px;color:#202124">${fe(b.amount)}</td>
        </tr>`;
    };

    const catRow = ([, v]: [string, typeof byCat[string]]) => {
      const pct = data.totalMonthly > 0 ? (v.monthly / data.totalMonthly) * 100 : 0;
      return `
        <tr>
          <td style="padding:9px 12px;border-bottom:1px solid #e8eaed">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:10px;height:10px;border-radius:50%;background:${v.color};flex-shrink:0"></div>
              <span style="font-size:11px;color:#202124;font-weight:500">${v.label}</span>
            </div>
          </td>
          <td style="padding:9px 12px;border-bottom:1px solid #e8eaed;text-align:right;font-weight:700;font-family:'Roboto Mono',monospace;color:#d4af42;font-size:13px">${fe(v.monthly)}<span style="font-size:9px;color:#80868b;font-weight:400;font-family:inherit"> / μήνα</span></td>
          <td style="padding:9px 12px;border-bottom:1px solid #e8eaed;text-align:right;color:#5f6368;font-family:'Roboto Mono',monospace;font-size:10px">${fe(v.monthly * 12)} / έτος</td>
          <td style="padding:9px 12px;border-bottom:1px solid #e8eaed;min-width:160px">
            <div style="height:6px;background:#e8eaed;border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${pct.toFixed(0)}%;background:${v.color};border-radius:3px"></div>
            </div>
            <div style="font-size:9px;color:#80868b;margin-top:3px;text-align:right">${pct.toFixed(0)}% του συνόλου</div>
          </td>
        </tr>`;
    };

    // History bars
    const histBars = MONTHS_SH.map((m, i) => {
      const val      = data.historyTotals[i] || 0;
      const pct      = val / maxH;
      const isCur    = i === currentMonth;
      const barH     = Math.max(pct * 60, val > 0 ? 4 : 1);
      const barColor = isCur ? '#d4af42' : val > data.avgMonthly * 1.2 ? '#c5221f' : '#1a73e8';
      return `
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1">
          <div style="font-size:9px;font-family:'Roboto Mono',monospace;color:${isCur ? '#d4af42' : '#5f6368'};font-weight:${isCur ? '700' : '400'}">${val > 0 ? fe(val,0) : ''}</div>
          <div style="width:100%;display:flex;align-items:flex-end;height:60px">
            <div style="width:100%;height:${barH}px;background:${barColor};border-radius:3px 3px 0 0;opacity:${isCur ? 1 : 0.7}"></div>
          </div>
          <div style="font-size:9px;color:${isCur ? '#d4af42' : '#80868b'};font-weight:${isCur ? '700' : '400'}">${m}</div>
          ${isCur ? '<div style="width:6px;height:6px;border-radius:50%;background:#d4af42;margin-top:-2px"></div>' : ''}
        </div>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Αναφορά Λογαριασμών — ${data.propertyName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto+Mono:wght@400;700&display=swap" rel="stylesheet"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter',sans-serif;background:#f8fafc;color:#202124;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    @page{margin:20mm 15mm;size:A4}
    @media print{body{background:#fff}.no-print{display:none}}
    table{width:100%;border-collapse:collapse}
    th{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#5f6368;padding:8px 12px;background:#f8fafc;border-bottom:2px solid #e8eaed;text-align:left}
    .section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#202124;padding:14px 20px 10px;border-bottom:1px solid #e8eaed;background:#fff}
    .card{background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08),0 1px 2px rgba(0,0,0,0.04);margin-bottom:16px}
  </style>
</head>
<body style="padding:24px">

  <!-- No Print Button -->
  <div class="no-print" style="text-align:right;margin-bottom:16px">
    <button onclick="window.print()" style="background:#d4af42;color:#000;border:none;border-radius:8px;padding:10px 24px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">
      Εκτύπωση / Αποθήκευση PDF
    </button>
  </div>

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);color:#fff;border-radius:16px;padding:28px 32px;margin-bottom:20px;position:relative;overflow:hidden">
    <div style="position:absolute;top:-40px;right:-40px;width:200px;height:200px;border-radius:50%;background:rgba(212,175,66,0.08)"></div>
    <div style="position:absolute;bottom:-60px;right:60px;width:160px;height:160px;border-radius:50%;background:rgba(212,175,66,0.05)"></div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;position:relative">
      <div>
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:rgba(212,175,66,0.8);margin-bottom:6px">Property OS — Αναφορά Λογαριασμών</div>
        <div style="font-size:26px;font-weight:700;letter-spacing:-0.02em;margin-bottom:4px">${data.propertyName}</div>
        <div style="font-size:13px;color:rgba(255,255,255,0.6)">${data.propertyAddress}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-bottom:4px">Ημερομηνία Έκδοσης</div>
        <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.9)">${todayStr()}</div>
        <div style="margin-top:8px;font-size:10px;color:rgba(212,175,66,0.7)">${data.bills.length} λογαριασμοί · ${year}</div>
      </div>
    </div>

    <!-- KPI row -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:24px;position:relative">
      ${[
        { label: 'Μηνιαίο Κόστος',   value: fe(data.totalMonthly),   sub: 'τρέχον', accent: '#d4af42' },
        { label: 'Ετήσιο Κόστος',    value: fe(data.totalAnnual),    sub: 'εκτίμηση', accent: '#60a5fa' },
        { label: 'Μέσος Όρος / Μήνα',value: fe(data.avgMonthly),    sub: `${year}`, accent: '#34d399' },
        { label: 'Ληξιπρόθεσμοι',    value: String(overdue.length), sub: 'λογαριασμοί', accent: overdue.length > 0 ? '#f87171' : '#34d399' },
      ].map(k => `
        <div style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:14px 16px">
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.06em;color:rgba(255,255,255,0.5);margin-bottom:6px">${k.label}</div>
          <div style="font-size:20px;font-weight:700;color:${k.accent};font-family:'Roboto Mono',monospace;line-height:1">${k.value}</div>
          <div style="font-size:9px;color:rgba(255,255,255,0.4);margin-top:4px">${k.sub}</div>
        </div>`).join('')}
    </div>

    ${overdue.length > 0 ? `
    <div style="margin-top:14px;background:rgba(197,34,31,0.15);border:1px solid rgba(197,34,31,0.3);border-radius:8px;padding:10px 16px;display:flex;align-items:center;gap:10px;position:relative">
      <div style="width:8px;height:8px;border-radius:50%;background:#f87171;flex-shrink:0"></div>
      <span style="font-size:11px;color:#fca5a5;font-weight:500">${overdue.length} ληξιπρόθεσμοι λογαριασμοί — άμεση ενέργεια απαιτείται</span>
    </div>` : ''}
    ${dueSoon.length > 0 ? `
    <div style="margin-top:8px;background:rgba(217,119,6,0.15);border:1px solid rgba(217,119,6,0.3);border-radius:8px;padding:10px 16px;display:flex;align-items:center;gap:10px;position:relative">
      <div style="width:8px;height:8px;border-radius:50%;background:#fbbf24;flex-shrink:0"></div>
      <span style="font-size:11px;color:#fde68a;font-weight:500">${dueSoon.length} λογαριασμοί λήγουν εντός 7 ημερών</span>
    </div>` : ''}
  </div>

  <!-- Bills by status -->
  ${unpaidBills.length > 0 ? `
  <div class="card">
    <div class="section-title" style="color:#c5221f;border-left:3px solid #c5221f">Εκκρεμείς & Ληξιπρόθεσμοι Λογαριασμοί</div>
    <table>
      <thead><tr>
        <th>Κατηγορία</th><th>Ονομασία / Πάροχος</th><th>Περίοδος / Ημερομηνία Λήξης</th>
        <th style="text-align:center">Τύπος</th><th style="text-align:center">Κατάσταση</th>
        <th style="text-align:right">Ποσό</th>
      </tr></thead>
      <tbody>${unpaidBills.map((b,i) => billRow(b,i)).join('')}</tbody>
    </table>
  </div>` : ''}

  ${paidBills.length > 0 ? `
  <div class="card">
    <div class="section-title" style="color:#137333;border-left:3px solid #137333">Πληρωμένοι Λογαριασμοί</div>
    <table>
      <thead><tr>
        <th>Κατηγορία</th><th>Ονομασία / Πάροχος</th><th>Περίοδος / Ημερομηνία Λήξης</th>
        <th style="text-align:center">Τύπος</th><th style="text-align:center">Κατάσταση</th>
        <th style="text-align:right">Ποσό</th>
      </tr></thead>
      <tbody>${paidBills.map((b,i) => billRow(b,i)).join('')}</tbody>
    </table>
  </div>` : ''}

  <!-- Category breakdown -->
  ${Object.keys(byCat).length > 0 ? `
  <div class="card">
    <div class="section-title">Κατανομή Δαπανών ανά Κατηγορία</div>
    <table>
      <thead><tr>
        <th>Κατηγορία</th><th style="text-align:right">Μηνιαίο</th>
        <th style="text-align:right">Ετήσιο</th><th>Ποσοστό</th>
      </tr></thead>
      <tbody>${Object.entries(byCat).sort((a,b) => b[1].monthly - a[1].monthly).map(catRow).join('')}</tbody>
    </table>
  </div>` : ''}

  <!-- History chart -->
  ${data.historyTotals && data.historyTotals.some(v => v > 0) ? `
  <div class="card">
    <div class="section-title">Ιστορικό Κόστους — ${year}</div>
    <div style="padding:20px 20px 8px">
      <div style="display:flex;align-items:flex-end;gap:6px;height:100px;border-bottom:2px solid #e8eaed">
        ${histBars}
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:10px">
        <div style="font-size:10px;color:#80868b">Μέσος Όρος: <strong style="color:#1a73e8;font-family:'Roboto Mono',monospace">${fe(data.avgMonthly)}</strong></div>
        <div style="font-size:10px;color:#80868b">Τρέχων Μήνας: <strong style="color:#d4af42;font-family:'Roboto Mono',monospace">${MONTHS_FULL[new Date().getMonth()]} ${year}</strong></div>
      </div>
    </div>
  </div>` : ''}

  <!-- Footer -->
  <div style="text-align:center;padding:16px 0;border-top:1px solid #e8eaed;margin-top:8px">
    <div style="font-size:10px;color:#80868b">Property OS · Αναφορά παράχθηκε: ${todayStr()} · Εμπιστευτικό έγγραφο</div>
  </div>

</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 800);
    }
  };

  return (
    <button
      onClick={handlePrint}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 16px', borderRadius: 10,
        background: 'transparent',
        border: '1px solid var(--border-default)',
        color: 'var(--text-secondary)',
        fontSize: 12, fontWeight: 600, cursor: 'pointer',
        fontFamily: "Inter, 'Google Sans', sans-serif",
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
      title="Εξαγωγή σε PDF"
    >
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/>
      </svg>
      Εξαγωγή PDF
    </button>
  );
}