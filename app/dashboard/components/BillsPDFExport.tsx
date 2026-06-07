'use client';

import { useRef } from 'react';

const fe = (n: number, d = 2) => `${n.toLocaleString('el-GR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`;
const today = () => new Date().toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' });

interface BillEntry {
  id: string; category: string; name: string; amount: number;
  period?: string; due_date?: string; paid: boolean; recurring: boolean;
  vat_rate?: number; kwh?: number;
}

interface BillsData {
  propertyName: string;
  propertyAddress: string;
  bills: BillEntry[];
  totalMonthly: number;
  totalAnnual: number;
  avgMonthly: number;
  historyTotals: number[];
  electricitySettings?: any;
  providersSettings?: any;
  insuranceSettings?: any;
  servicesSettings?: any;
  commonSettings?: any;
}

const CATEGORIES: Record<string, { label: string; icon: string }> = {
  electricity: { label: 'Ρεύμα', icon: '⚡' },
  common: { label: 'Κοινόχρηστα', icon: '🏛' },
  internet: { label: 'Internet/TV', icon: '📶' },
  water: { label: 'Νερό', icon: '💧' },
  gas: { label: 'Αέριο/Θέρμανση', icon: '🔥' },
  insurance: { label: 'Ασφάλεια', icon: '🛡️' },
  security: { label: 'Security', icon: '🔒' },
  streaming: { label: 'Streaming', icon: '🎬' },
  enfia: { label: 'ΕΝΦΙΑ', icon: '🏛' },
  dimotika: { label: 'Δημοτικά Τέλη', icon: '🏙' },
  cleaning: { label: 'Καθαρισμός', icon: '🧹' },
  elevator: { label: 'Ανελκυστήρας', icon: '🛗' },
  other: { label: 'Άλλο', icon: '📦' },
};

interface Props {
  data: BillsData;
  trigger?: React.ReactNode;
}

export default function BillsPDFExport({ data, trigger }: Props) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const MONTHS_GR = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];
    const maxBar = Math.max(...(data.historyTotals || []), 1);
    const byCategory: Record<string, BillEntry[]> = {};
    data.bills.forEach(b => {
      if (!byCategory[b.category]) byCategory[b.category] = [];
      byCategory[b.category].push(b);
    });

    const html = `<!DOCTYPE html>
<html lang="el">
<head>
<meta charset="UTF-8"/>
<title>Σύνοψη Παγίων — ${data.propertyName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a2e; background: #fff; font-size: 11px; }
  
  /* Page setup */
  @page { margin: 20mm 15mm; size: A4; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }

  /* Header */
  .header { background: linear-gradient(135deg, #0c1b33 0%, #1a2f5a 100%); color: #fff; padding: 28px 32px; margin-bottom: 24px; border-radius: 8px; display: flex; justify-content: space-between; align-items: flex-start; }
  .header-left h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 4px; }
  .header-left .subtitle { font-size: 12px; opacity: 0.7; margin-bottom: 8px; }
  .header-left .address { font-size: 11px; opacity: 0.6; }
  .header-right { text-align: right; }
  .header-right .date { font-size: 10px; opacity: 0.6; margin-bottom: 4px; }
  .logo { font-size: 18px; font-weight: 800; color: #d4af42; letter-spacing: 1px; }

  /* KPI cards */
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
  .kpi { background: #f8f9fc; border: 1px solid #e8ecf4; border-radius: 8px; padding: 14px 16px; }
  .kpi-value { font-size: 18px; font-weight: 700; color: #1a2f5a; font-family: 'Courier New', monospace; margin-bottom: 3px; }
  .kpi-label { font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em; }
  .kpi.accent .kpi-value { color: #d4af42; }
  .kpi.positive .kpi-value { color: #059669; }
  .kpi.negative .kpi-value { color: #dc2626; }

  /* Section */
  .section { margin-bottom: 24px; }
  .section-title { font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 2px solid #e8ecf4; display: flex; align-items: center; gap: 8px; }
  .section-title::before { content: ''; display: block; width: 3px; height: 14px; background: #d4af42; border-radius: 2px; }

  /* Bills table */
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  th { background: #f1f5f9; color: #374151; font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; padding: 8px 10px; text-align: left; border-bottom: 2px solid #e2e8f0; }
  td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) td { background: #fafbfd; }
  .amount { font-family: 'Courier New', monospace; font-weight: 600; color: #1a2f5a; text-align: right; }
  .paid { color: #059669; font-size: 9px; background: #d1fae5; padding: 2px 6px; border-radius: 3px; white-space: nowrap; }
  .unpaid { color: #dc2626; font-size: 9px; background: #fee2e2; padding: 2px 6px; border-radius: 3px; white-space: nowrap; }
  .recurring { color: #6366f1; font-size: 9px; background: #ede9fe; padding: 2px 6px; border-radius: 3px; white-space: nowrap; }
  .cat-badge { font-size: 9px; color: #374151; background: #f1f5f9; padding: 2px 6px; border-radius: 3px; white-space: nowrap; }

  /* Category summary */
  .cat-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 24px; }
  .cat-card { background: #f8f9fc; border: 1px solid #e8ecf4; border-radius: 6px; padding: 10px 12px; }
  .cat-card-icon { font-size: 14px; margin-bottom: 4px; }
  .cat-card-label { font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; }
  .cat-card-amount { font-size: 14px; font-weight: 700; color: #1a2f5a; font-family: 'Courier New', monospace; }
  .cat-bar { height: 3px; background: #e2e8f0; border-radius: 2px; margin-top: 6px; overflow: hidden; }
  .cat-bar-fill { height: 100%; background: #d4af42; border-radius: 2px; }

  /* History chart */
  .history { margin-bottom: 24px; }
  .bars { display: flex; gap: 4px; align-items: flex-end; height: 60px; margin-bottom: 6px; }
  .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .bar { width: 100%; border-radius: 3px 3px 0 0; min-height: 2px; }
  .bar-label { font-size: 7px; color: #9ca3af; text-align: center; }
  .bar-val { font-size: 7px; color: #6b7280; font-family: 'Courier New', monospace; }

  /* Overdue alerts */
  .alert { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 6px; padding: 10px 14px; margin-bottom: 12px; font-size: 10px; color: #dc2626; }
  .alert-warn { background: #fffbeb; border-color: #fcd34d; color: #92400e; }

  /* Footer */
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e8ecf4; display: flex; justify-content: space-between; align-items: center; }
  .footer-left { font-size: 9px; color: #9ca3af; }
  .footer-right { font-size: 9px; color: #9ca3af; }
  .watermark { color: #d4af42; font-weight: 700; }

  /* Total row */
  .total-row td { background: #0c1b33 !important; color: #fff; font-weight: 700; border-bottom: none; }
  .total-row .amount { color: #d4af42; }

  /* Provider summary box */
  .provider-box { background: #f8f9fc; border: 1px solid #e8ecf4; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
  .provider-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .provider-item { border-bottom: 1px solid #e8ecf4; padding-bottom: 8px; }
  .provider-item:last-child { border-bottom: none; }
  .provider-key { font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 2px; }
  .provider-val { font-size: 11px; font-weight: 600; color: #1a2f5a; }
</style>
</head>
<body>

<!-- HEADER -->
<div class="header">
  <div class="header-left">
    <h1>Σύνοψη Παγίων & Λογαριασμών</h1>
    <div class="subtitle">${data.propertyName}</div>
    <div class="address">${data.propertyAddress}</div>
  </div>
  <div class="header-right">
    <div class="logo">Property OS</div>
    <div class="date">Εκδόθηκε: ${today()}</div>
    <div class="date">Έτος αναφοράς: ${new Date().getFullYear()}</div>
  </div>
</div>

<!-- KPIs -->
<div class="kpis">
  <div class="kpi accent">
    <div class="kpi-value">${fe(data.totalMonthly)}</div>
    <div class="kpi-label">Σύνολο Παγίων/Μήνα</div>
  </div>
  <div class="kpi negative">
    <div class="kpi-value">${fe(data.totalAnnual)}</div>
    <div class="kpi-label">Εκτιμώμενο Ετήσιο Κόστος</div>
  </div>
  <div class="kpi positive">
    <div class="kpi-value">${fe(data.avgMonthly)}</div>
    <div class="kpi-label">Μέσο Μηνιαίο (ιστορικό)</div>
  </div>
  <div class="kpi">
    <div class="kpi-value">${data.bills.length}</div>
    <div class="kpi-label">Καταχωρημένοι Λογαριασμοί</div>
  </div>
</div>

${data.bills.filter(b => !b.paid && b.due_date && new Date(b.due_date) < new Date()).length > 0 ? `
<div class="alert">⚠ Ληξιπρόθεσμοι λογαριασμοί: ${data.bills.filter(b => !b.paid && b.due_date && new Date(b.due_date) < new Date()).map(b => b.name).join(', ')}</div>
` : ''}

<!-- ΛΟΓΑΡΙΑΣΜΟΙ TABLE -->
<div class="section">
  <div class="section-title">Αναλυτικοί Λογαριασμοί & Πάγια</div>
  <table>
    <thead>
      <tr>
        <th>Κατηγορία</th>
        <th>Ονομασία</th>
        <th>Περίοδος</th>
        <th>Τύπος</th>
        <th>Κατάσταση</th>
        <th style="text-align:right">Ποσό</th>
      </tr>
    </thead>
    <tbody>
      ${data.bills.map(b => `
      <tr>
        <td><span class="cat-badge">${CATEGORIES[b.category]?.icon || ''} ${CATEGORIES[b.category]?.label || b.category}</span></td>
        <td style="font-weight:600;color:#1a2f5a">${b.name}</td>
        <td style="color:#6b7280">${b.period || (b.due_date ? new Date(b.due_date).toLocaleDateString('el-GR') : '—')}</td>
        <td>${b.recurring ? '<span class="recurring">Πάγιο</span>' : '<span class="cat-badge">Εφάπαξ</span>'}</td>
        <td>${b.paid ? '<span class="paid">✓ Πληρώθηκε</span>' : '<span class="unpaid">Εκκρεμεί</span>'}</td>
        <td class="amount">${fe(b.amount)}</td>
      </tr>`).join('')}
      <tr class="total-row">
        <td colspan="5" style="font-size:11px;letter-spacing:0.05em">ΣΥΝΟΛΟ</td>
        <td class="amount">${fe(data.bills.reduce((s, b) => s + b.amount, 0))}</td>
      </tr>
    </tbody>
  </table>
</div>

<!-- ΚΑΤΗΓΟΡΙΕΣ SUMMARY -->
${Object.keys(byCategory).length > 0 ? `
<div class="section">
  <div class="section-title">Ανάλυση ανά Κατηγορία</div>
  <div class="cat-summary">
    ${Object.entries(byCategory).map(([cat, bills]) => {
      const total = bills.filter(b => b.recurring).reduce((s, b) => s + b.amount, 0);
      if (total === 0) return '';
      const pct = data.totalMonthly > 0 ? (total / data.totalMonthly) * 100 : 0;
      return `<div class="cat-card">
        <div class="cat-card-icon">${CATEGORIES[cat]?.icon || '📦'}</div>
        <div class="cat-card-label">${CATEGORIES[cat]?.label || cat}</div>
        <div class="cat-card-amount">${fe(total)}/μήνα</div>
        <div style="font-size:9px;color:#9ca3af;margin-top:2px">${fe(total * 12)}/έτος · ${pct.toFixed(0)}% του συνόλου</div>
        <div class="cat-bar"><div class="cat-bar-fill" style="width:${Math.min(pct, 100)}%"></div></div>
      </div>`;
    }).join('')}
  </div>
</div>
` : ''}

<!-- ΙΣΤΟΡΙΚΟ -->
${data.historyTotals && data.historyTotals.some(v => v > 0) ? `
<div class="section">
  <div class="section-title">Ιστορικό Παγίων ${new Date().getFullYear()}</div>
  <div class="bars">
    ${MONTHS_GR.map((m, i) => {
      const val = data.historyTotals[i] || 0;
      const pct = val / maxBar;
      const isCur = i === new Date().getMonth();
      return `<div class="bar-col">
        ${val > 0 ? `<div class="bar-val">${Math.round(val)}</div>` : '<div class="bar-val"></div>'}
        <div class="bar" style="height:${Math.max(pct * 50, val > 0 ? 4 : 1)}px;background:${isCur ? '#d4af42' : val > (data.avgMonthly * 1.2) ? '#ef4444' : '#6366f1'}"></div>
      </div>`;
    }).join('')}
  </div>
  <div style="display:flex;gap:4px">
    ${MONTHS_GR.map((m, i) => `<div class="bar-label" style="flex:1;font-weight:${i === new Date().getMonth() ? 700 : 400};color:${i === new Date().getMonth() ? '#d4af42' : '#9ca3af'}">${m}</div>`).join('')}
  </div>
  <div style="display:flex;gap:20px;margin-top:10px;padding:10px 14px;background:#f8f9fc;border-radius:6px;border:1px solid #e8ecf4">
    <div><div style="font-size:13px;font-weight:700;color:#d4af42;font-family:'Courier New',monospace">${fe(data.avgMonthly)}</div><div style="font-size:9px;color:#6b7280;text-transform:uppercase">Μέσο Μηνιαίο</div></div>
    <div><div style="font-size:13px;font-weight:700;color:#dc2626;font-family:'Courier New',monospace">${fe(Math.max(...data.historyTotals))}</div><div style="font-size:9px;color:#6b7280;text-transform:uppercase">Ακριβότερος Μήνας</div></div>
    <div><div style="font-size:13px;font-weight:700;color:#059669;font-family:'Courier New',monospace">${fe(data.historyTotals.filter(v => v > 0).length > 0 ? Math.min(...data.historyTotals.filter(v => v > 0)) : 0)}</div><div style="font-size:9px;color:#6b7280;text-transform:uppercase">Φθηνότερος Μήνας</div></div>
    <div><div style="font-size:13px;font-weight:700;color:#1a2f5a;font-family:'Courier New',monospace">${fe(data.historyTotals.reduce((a, b) => a + b, 0))}</div><div style="font-size:9px;color:#6b7280;text-transform:uppercase">Σύνολο ${new Date().getFullYear()}</div></div>
  </div>
</div>
` : ''}

<!-- FOOTER -->
<div class="footer">
  <div class="footer-left">
    Δημιουργήθηκε από <span class="watermark">Property OS</span> · propertyos-psi.vercel.app
  </div>
  <div class="footer-right">
    Εμπιστευτικό έγγραφο · ${today()}
  </div>
</div>


<script>
  window.onload = function() {
    setTimeout(function() { window.print(); }, 400);
  };
</script>
</body>
</html>`;

    // Blob URL approach - works everywhere without popups
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <button
      onClick={handlePrint}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '8px',
        background: '#0c1b33', color: '#d4af42',
        border: '1px solid #d4af42', borderRadius: '8px',
        padding: '9px 18px', fontSize: '12px', fontWeight: 700,
        cursor: 'pointer', fontFamily: 'Inter,sans-serif',
        transition: 'all 0.2s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#d4af42'; (e.currentTarget as HTMLButtonElement).style.color = '#0c1b33'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#0c1b33'; (e.currentTarget as HTMLButtonElement).style.color = '#d4af42'; }}
    >
      📄 Εξαγωγή PDF
    </button>
  );
}