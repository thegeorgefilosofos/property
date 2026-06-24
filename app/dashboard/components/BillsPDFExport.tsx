'use client';

const fe = (n: number, d = 2) => `${n.toLocaleString('el-GR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`;
const todayStr = () => new Date().toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' });

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
  internet:    { label: 'Internet/TV',        color: '#3b82f6' },
  water:       { label: 'Νερό',              color: '#06b6d4' },
  gas:         { label: 'Αέριο/Θέρμανση',   color: '#ef4444' },
  insurance:   { label: 'Ασφάλεια',          color: '#10b981' },
  security:    { label: 'Security',           color: '#f97316' },
  streaming:   { label: 'Streaming',          color: '#ec4899' },
  enfia:       { label: 'ΕΝΦΙΑ',             color: '#64748b' },
  dimotika:    { label: 'Δημοτικά Τέλη',    color: '#94a3b8' },
  cleaning:    { label: 'Καθαρισμός',         color: '#84cc16' },
  garden:      { label: 'Κήπος',             color: '#22c55e' },
  pool:        { label: 'Πισίνα',            color: '#0ea5e9' },
  elevator:    { label: 'Ανελκυστήρας',      color: '#a78bfa' },
  ac_service:  { label: 'Σέρβις Κλιματ.',   color: '#38bdf8' },
  renovation:  { label: 'Ανακαίνιση',        color: '#d97706' },
  pest:        { label: 'Απεντόμωση',        color: '#78716c' },
  other:       { label: 'Άλλο',              color: '#94a3b8' },
};

const catOf = (v: string) => CAT[v] || { label: v, color: '#94a3b8' };
const MONTHS = ['Ιαν','Φεβ','Μαρ','Απρ','Μαΐ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];

export default function BillsPDFExport({ data }: { data: BillsData }) {

  const handlePrint = () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const year = now.getFullYear();
    const overdue = data.bills.filter(b => !b.paid && b.due_date && new Date(b.due_date) < now);
    const maxH = Math.max(...(data.historyTotals || [1]), 1);

    // Category breakdown
    const byCat: Record<string, { label: string; color: string; monthly: number; count: number }> = {};
    data.bills.filter(b => b.recurring).forEach(b => {
      const c = catOf(b.category);
      if (!byCat[b.category]) byCat[b.category] = { ...c, monthly: 0, count: 0 };
      byCat[b.category].monthly += b.amount;
      byCat[b.category].count++;
    });

    // Bill rows
    const billRows = data.bills.map(b => {
      const c = catOf(b.category);
      const dl = b.due_date ? Math.ceil((new Date(b.due_date).getTime() - now.getTime()) / 86400000) : null;
      const isOd = dl !== null && dl < 0;
      const statusBg = b.paid ? '#e6f4ea' : isOd ? '#fce8e6' : '#fff8e1';
      const statusColor = b.paid ? '#137333' : isOd ? '#c5221f' : '#b45309';
      const statusText = b.paid ? 'Πληρώθηκε' : isOd ? 'Ληξιπρόθεσμος' : 'Εκκρεμεί';
      return [
        '<tr>',
        '<td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;vertical-align:middle">',
        '<div style="display:flex;align-items:center;gap:8px">',
        '<div style="width:8px;height:8px;border-radius:50%;background:' + c.color + ';flex-shrink:0"></div>',
        '<span style="font-size:9px;color:' + c.color + ';font-weight:600;background:' + c.color + '18;padding:2px 7px;border-radius:4px">' + c.label + '</span>',
        '</div></td>',
        '<td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-weight:600;color:#202124;font-size:11px">' + b.name + '</td>',
        '<td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:10px;color:#5f6368">' + (b.period || (b.due_date ? new Date(b.due_date).toLocaleDateString('el-GR') : '—')) + '</td>',
        '<td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:center">',
        '<span style="font-size:9px;font-weight:600;padding:2px 8px;border-radius:4px;background:' + (b.recurring ? 'rgba(26,115,232,0.1)' : 'rgba(128,134,139,0.1)') + ';color:' + (b.recurring ? '#1a73e8' : '#80868b') + '">' + (b.recurring ? 'Πάγιο' : 'Εφάπαξ') + '</span>',
        '</td>',
        '<td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:center">',
        '<span style="font-size:9px;font-weight:600;padding:2px 8px;border-radius:4px;background:' + statusBg + ';color:' + statusColor + '">' + statusText + '</span>',
        '</td>',
        '<td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-weight:700;text-align:right;font-family:Roboto Mono,monospace;font-size:12px;color:#202124">' + fe(b.amount) + '</td>',
        '</tr>',
      ].join('');
    }).join('');

    // Category rows
    const catRows = Object.entries(byCat).map(([, v]) => {
      const pct = data.totalMonthly > 0 ? (v.monthly / data.totalMonthly) * 100 : 0;
      return [
        '<tr>',
        '<td style="padding:8px 10px;border-bottom:1px solid #f1f5f9">',
        '<div style="display:flex;align-items:center;gap:8px">',
        '<div style="width:10px;height:10px;border-radius:50%;background:' + v.color + '"></div>',
        '<span style="font-size:11px;color:#202124;font-weight:500">' + v.label + '</span>',
        '</div></td>',
        '<td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;font-family:Roboto Mono,monospace;color:#202124">' + fe(v.monthly) + '/μήνα</td>',
        '<td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:right;color:#5f6368;font-family:Roboto Mono,monospace;font-size:10px">' + fe(v.monthly * 12) + '/έτος</td>',
        '<td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;min-width:140px">',
        '<div style="height:6px;background:#e8eaed;border-radius:3px;overflow:hidden">',
        '<div style="height:100%;width:' + pct.toFixed(0) + '%;background:' + v.color + ';border-radius:3px"></div>',
        '</div>',
        '<div style="font-size:9px;color:#5f6368;margin-top:2px;text-align:right">' + pct.toFixed(0) + '% του συνόλου</div>',
        '</td></tr>',
      ].join('');
    }).join('');

    // History bars
    const histBars = MONTHS.map((m, i) => {
      const val = data.historyTotals[i] || 0;
      const pct = val / maxH;
      const isCur = i === currentMonth;
      const barH = Math.max(pct * 60, val > 0 ? 4 : 1);
      const barColor = isCur ? '#d4af42' : val > data.avgMonthly * 1.2 ? '#c5221f' : '#1a73e8';
      return [
        '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">',
        val > 0 ? '<div style="font-size:7px;color:#5f6368;font-family:Roboto Mono,monospace">' + Math.round(val) + '</div>' : '<div style="height:12px"></div>',
        '<div style="width:100%;height:' + barH + 'px;background:' + barColor + ';border-radius:3px 3px 0 0;opacity:' + (isCur ? 1 : 0.75) + '"></div>',
        '<div style="font-size:7px;color:' + (isCur ? '#d4af42' : '#9aa0a6') + ';font-weight:' + (isCur ? 700 : 400) + '">' + m + '</div>',
        '</div>',
      ].join('');
    }).join('');

    const totalBills = data.bills.reduce((s, b) => s + b.amount, 0);

    const css = [
      '*{margin:0;padding:0;box-sizing:border-box}',
      'body{font-family:Roboto,sans-serif;background:#fff;color:#202124;font-size:11px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
      '.page{max-width:940px;margin:0 auto;padding:28px 32px}',
      '.hdr{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:16px;margin-bottom:24px;border-bottom:3px solid #1a73e8}',
      '.logo{font-family:Google Sans,sans-serif;font-size:22px;font-weight:700;color:#1a73e8}',
      '.logo span{color:#d4af42}',
      '.logo-sub{font-size:10px;color:#5f6368;margin-top:3px}',
      '.hdr-r{text-align:right}',
      '.hdr-title{font-family:Google Sans,sans-serif;font-size:18px;font-weight:500;color:#202124}',
      '.hdr-date{font-size:10px;color:#5f6368;margin-top:4px}',
      '.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}',
      '.kpi{background:#f8f9fa;border:1px solid #e8eaed;border-radius:10px;padding:12px 14px}',
      '.kpi-val{font-family:Roboto Mono,monospace;font-size:17px;font-weight:700;margin-bottom:3px}',
      '.kpi-lbl{font-family:Google Sans,sans-serif;font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:#5f6368}',
      '.sec{margin-bottom:24px}',
      '.sec-title{font-family:Google Sans,sans-serif;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#5f6368;padding-bottom:8px;border-bottom:1px solid #e8eaed;margin-bottom:12px;display:flex;align-items:center;gap:8px}',
      '.sec-title::before{content:"";display:inline-block;width:4px;height:14px;background:#d4af42;border-radius:2px;flex-shrink:0}',
      'table{width:100%;border-collapse:collapse}',
      'th{font-family:Google Sans,sans-serif;font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:#5f6368;padding:8px 10px;border-bottom:2px solid #e8eaed;text-align:left;background:#f8f9fa}',
      'tr:nth-child(even) td{background:#fafafa}',
      '.total-row td{background:#1a73e8!important;color:#fff;font-weight:700;padding:10px!important}',
      '.total-row .amt{color:#d4af42;font-family:Roboto Mono,monospace;font-size:14px;text-align:right}',
      '.alert{background:#fce8e6;border:1px solid rgba(197,34,31,0.3);border-left:4px solid #c5221f;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:10px;color:#c5221f;display:flex;align-items:flex-start;gap:8px}',
      '.footer{margin-top:28px;padding-top:10px;border-top:1px solid #e8eaed;display:flex;justify-content:space-between;font-size:9px;color:#9aa0a6}',
      '.footer .wm{color:#d4af42;font-weight:700}',
      '@media print{.page{padding:18px 22px}.sec{break-inside:avoid}}',
    ].join('');

    const html = [
      '<!DOCTYPE html><html lang="el"><head>',
      '<meta charset="UTF-8"><title>Λογαριασμοί — ' + data.propertyName + '</title>',
      '<link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Roboto:wght@400;500&family=Roboto+Mono:wght@500;700&display=swap" rel="stylesheet">',
      '<style>' + css + '</style>',
      '</head><body><div class="page">',

      // Header
      '<div class="hdr">',
      '<div><div class="logo">Property <span>OS</span></div><div class="logo-sub">Επαγγελματικό Εργαλείο Διαχείρισης Ακινήτων</div></div>',
      '<div class="hdr-r"><div class="hdr-title">Αναφορά Λογαριασμών & Παγίων</div>',
      '<div class="hdr-date">' + data.propertyName + (data.propertyAddress ? ' · ' + data.propertyAddress : '') + '</div>',
      '<div class="hdr-date">Εκδόθηκε: ' + todayStr() + '</div></div>',
      '</div>',

      // Alert
      overdue.length > 0 ? [
        '<div class="alert">',
        '<div style="width:6px;height:6px;border-radius:50%;background:#c5221f;flex-shrink:0;margin-top:2px"></div>',
        '<div>Ληξιπρόθεσμοι λογαριασμοί: <strong>' + overdue.map(b => b.name).join(', ') + '</strong>',
        ' — Σύνολο: <strong>' + fe(overdue.reduce((s, b) => s + b.amount, 0)) + '</strong></div>',
        '</div>',
      ].join('') : '',

      // KPIs
      '<div class="kpis">',
      '<div class="kpi"><div class="kpi-val" style="color:#d4af42">' + fe(data.totalMonthly) + '</div><div class="kpi-lbl">Πάγια / Μήνα</div></div>',
      '<div class="kpi"><div class="kpi-val" style="color:#c5221f">' + fe(data.totalAnnual) + '</div><div class="kpi-lbl">Εκτιμώμενο Ετήσιο</div></div>',
      '<div class="kpi"><div class="kpi-val" style="color:#1a73e8">' + fe(data.avgMonthly) + '</div><div class="kpi-lbl">Μέσο Μηνιαίο</div></div>',
      '<div class="kpi"><div class="kpi-val" style="color:#5f6368">' + data.bills.length + '</div><div class="kpi-lbl">Καταγεγραμμένοι</div></div>',
      '</div>',

      // Bills table
      '<div class="sec"><div class="sec-title">Αναλυτικοί Λογαριασμοί</div>',
      '<table><thead><tr>',
      '<th style="width:120px">Κατηγορία</th>',
      '<th>Ονομασία / Πάροχος</th>',
      '<th style="width:100px">Περίοδος</th>',
      '<th style="width:80px;text-align:center">Τύπος</th>',
      '<th style="width:100px;text-align:center">Κατάσταση</th>',
      '<th style="width:90px;text-align:right">Ποσό</th>',
      '</tr></thead><tbody>',
      billRows,
      '<tr class="total-row">',
      '<td colspan="5" style="font-family:Google Sans,sans-serif;font-size:12px">Σύνολο Λογαριασμών</td>',
      '<td class="amt">' + fe(totalBills) + '</td>',
      '</tr>',
      '</tbody></table></div>',

      // Category breakdown
      Object.keys(byCat).length > 0 ? [
        '<div class="sec"><div class="sec-title">Κατανομή ανά Κατηγορία</div>',
        '<table><thead><tr>',
        '<th>Κατηγορία</th>',
        '<th style="text-align:right">Μηνιαίο</th>',
        '<th style="text-align:right">Ετήσιο</th>',
        '<th style="width:180px">Ποσοστό</th>',
        '</tr></thead><tbody>' + catRows + '</tbody></table></div>',
      ].join('') : '',

      // History chart
      (data.historyTotals || []).some(v => v > 0) ? [
        '<div class="sec"><div class="sec-title">Ιστορικό ' + year + '</div>',
        '<div style="display:flex;gap:5px;align-items:flex-end;height:80px;margin-bottom:6px">' + histBars + '</div>',
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:12px;padding:12px 14px;background:#f8f9fa;border-radius:8px;border:1px solid #e8eaed">',
        '<div><div style="font-size:14px;font-weight:700;color:#d4af42;font-family:Roboto Mono,monospace">' + fe(data.avgMonthly) + '</div><div style="font-size:9px;color:#5f6368;text-transform:uppercase;margin-top:2px">Μέσο Μηνιαίο</div></div>',
        '<div><div style="font-size:14px;font-weight:700;color:#c5221f;font-family:Roboto Mono,monospace">' + fe(Math.max(...data.historyTotals)) + '</div><div style="font-size:9px;color:#5f6368;text-transform:uppercase;margin-top:2px">Ακριβότερος</div></div>',
        '<div><div style="font-size:14px;font-weight:700;color:#137333;font-family:Roboto Mono,monospace">' + fe(Math.min(...data.historyTotals.filter(v => v > 0).length > 0 ? data.historyTotals.filter(v => v > 0) : [0])) + '</div><div style="font-size:9px;color:#5f6368;text-transform:uppercase;margin-top:2px">Φθηνότερος</div></div>',
        '<div><div style="font-size:14px;font-weight:700;color:#1a73e8;font-family:Roboto Mono,monospace">' + fe(data.historyTotals.reduce((a, b) => a + b, 0)) + '</div><div style="font-size:9px;color:#5f6368;text-transform:uppercase;margin-top:2px">Σύνολο ' + year + '</div></div>',
        '</div></div>',
      ].join('') : '',

      // Footer
      '<div class="footer">',
      '<div>Δημιουργήθηκε από <span class="wm">Property OS</span> · propertyos-psi.vercel.app</div>',
      '<div>' + todayStr() + ' · Εμπιστευτικό έγγραφο</div>',
      '</div>',

      '</div>',
      '<script>window.onload=function(){setTimeout(function(){window.print()},600)}<\/script>',
      '</body></html>',
    ].join('');

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <button
      onClick={handlePrint}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: 'transparent', color: 'var(--text-secondary)',
        border: '1px solid var(--border-subtle)', borderRadius: 10,
        padding: '8px 16px', fontSize: 12, fontWeight: 600,
        cursor: 'pointer', fontFamily: "Inter,'Google Sans',sans-serif",
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
    >
      Εξαγωγή PDF
    </button>
  );
}
