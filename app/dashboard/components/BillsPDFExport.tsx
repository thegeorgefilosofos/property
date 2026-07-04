'use client';

// ─────────────────────────────────────────────────────────────────────────────
// BillsPDFExport — Επαγγελματική Αναφορά Λογαριασμών (Έκδοση 2.0)
//
// Τι αλλάζει σε σχέση με την προηγούμενη έκδοση:
// • Πλήρης δομή εγγράφου: Εξώφυλλο-κεφαλίδα → Executive Summary → Εκκρεμότητες
//   → Επερχόμενες λήξεις 30 ημερών → Πληρωμένοι → Κατανομή ανά κατηγορία
//   → Ιστορικό 12μήνου με στατιστικά → Μεθοδολογία & υπογραφή.
// • Σωστή σελιδοποίηση Α4: κάθε ενότητα δεν «σπάει» στη μέση (break-inside:avoid),
//   επαναλαμβανόμενες κεφαλίδες πινάκων ανά σελίδα (thead display:table-header-group).
// • Καθαρή τυπογραφία εγγράφου (Inter + Roboto Mono), διακριτική χρυσή ταυτότητα.
// • Όλα τα δεδομένα χρήστη περνούν από esc() — προστασία από stored-XSS.
// ─────────────────────────────────────────────────────────────────────────────

const fe = (n: number, d = 2) => `${n.toLocaleString('el-GR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`;
const todayStr = () => new Date().toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' });

// SECURITY: ονόματα/σημειώσεις/πεδία ακινήτου προέρχονται από τον χρήστη και
// παρεμβάλλονται σε HTML string — escape για αποφυγή stored-XSS.
const esc = (v: unknown) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

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
  electricity: { label: 'Ρεύμα',                 color: '#b45309' },
  common:      { label: 'Κοινόχρηστα',            color: '#4f46e5' },
  internet:    { label: 'Internet',                color: '#1d4ed8' },
  water:       { label: 'Νερό',                   color: '#0e7490' },
  gas:         { label: 'Αέριο / Θέρμανση',       color: '#b91c1c' },
  insurance:   { label: 'Ασφάλεια',               color: '#047857' },
  security:    { label: 'Security / Συναγερμός',   color: '#c2410c' },
  streaming:   { label: 'Streaming',               color: '#be185d' },
  enfia:       { label: 'ΕΝΦΙΑ',                  color: '#475569' },
  dimotika:    { label: 'Δημοτικά Τέλη',          color: '#64748b' },
  taxes:       { label: 'Φόροι',                  color: '#475569' },
  cleaning:    { label: 'Καθαρισμός',              color: '#4d7c0f' },
  garden:      { label: 'Κήπος',                  color: '#15803d' },
  pool:        { label: 'Πισίνα',                 color: '#0369a1' },
  elevator:    { label: 'Ανελκυστήρας',           color: '#7c3aed' },
  ac_service:  { label: 'Σέρβις Κλιματιστικού',    color: '#0284c7' },
  renovation:  { label: 'Ανακαίνιση',             color: '#a16207' },
  pest:        { label: 'Απεντόμωση',             color: '#57534e' },
  other:       { label: 'Άλλο',                   color: '#64748b' },
};

const catOf = (v: string) => CAT[v] || { label: v, color: '#64748b' };
const MONTHS_FULL = ['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος','Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος'];
const MONTHS_SH   = ['Ιαν','Φεβ','Μαρ','Απρ','Μαΐ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];

export default function BillsPDFExport({ data }: { data: BillsData }) {

  const handlePrint = () => {
    const now          = new Date();
    const currentMonth = now.getMonth();
    const year         = now.getFullYear();

    const daysTo = (d: string) => Math.ceil((new Date(d).getTime() - now.getTime()) / 86400000);

    const overdue   = data.bills.filter(b => !b.paid && b.due_date && daysTo(b.due_date) < 0);
    const dueSoon30 = data.bills
      .filter(b => !b.paid && b.due_date && daysTo(b.due_date!) >= 0 && daysTo(b.due_date!) <= 30)
      .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime());
    const paidBills   = data.bills.filter(b => b.paid);
    const unpaidBills = data.bills.filter(b => !b.paid);
    const unpaidSum   = unpaidBills.reduce((s, b) => s + b.amount, 0);
    const paidSum     = paidBills.reduce((s, b) => s + b.amount, 0);
    const paidPct     = data.bills.length > 0 ? Math.round((paidBills.length / data.bills.length) * 100) : 0;

    // Ιστορικό — στατιστικά
    const hist        = data.historyTotals || [];
    const monthsWith  = hist.map((v, i) => ({ v, i })).filter(x => x.v > 0);
    const maxMonth    = monthsWith.length ? monthsWith.reduce((a, b) => (b.v > a.v ? b : a)) : null;
    const minMonth    = monthsWith.length ? monthsWith.reduce((a, b) => (b.v < a.v ? b : a)) : null;
    const maxH        = Math.max(...(hist.length ? hist : [1]), 1);

    // Κατανομή ανά κατηγορία (πάγια)
    const byCat: Record<string, { label: string; color: string; monthly: number; count: number }> = {};
    data.bills.filter(b => b.recurring).forEach(b => {
      const c = catOf(b.category);
      if (!byCat[b.category]) byCat[b.category] = { ...c, monthly: 0, count: 0 };
      byCat[b.category].monthly += b.amount;
      byCat[b.category].count++;
    });
    const catEntries  = Object.entries(byCat).sort((a, b) => b[1].monthly - a[1].monthly);
    const topCategory = catEntries[0]?.[1] || null;

    // ── Γραμμή λογαριασμού ─────────────────────────────────────────────────
    const billRow = (b: BillEntry, i: number) => {
      const c        = catOf(b.category);
      const dl       = b.due_date ? daysTo(b.due_date) : null;
      const isOd     = dl !== null && dl < 0 && !b.paid;
      const stBg     = b.paid ? '#e8f3ec' : isOd ? '#fbe9e7' : '#fdf6e3';
      const stColor  = b.paid ? '#1e6b3a' : isOd ? '#b3261e' : '#8a6d1a';
      const stText   = b.paid ? 'Πληρώθηκε' : isOd ? 'Ληξιπρόθεσμος' : 'Εκκρεμεί';
      return `
        <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f8fafc'}">
          <td style="padding:8px 12px;border-bottom:1px solid #e8eaed">
            <span style="display:inline-flex;align-items:center;gap:6px;font-size:9.5px;font-weight:600;color:#334155">
              <span style="width:8px;height:8px;border-radius:2px;background:${c.color};display:inline-block"></span>${c.label}
            </span>
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #e8eaed;font-weight:600;color:#111827;font-size:10.5px">
            ${esc(b.name)}
            ${b.notes ? `<div style="font-weight:400;font-size:9px;color:#6b7280;margin-top:2px">${esc(b.notes)}</div>` : ''}
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #e8eaed;font-size:9.5px;color:#475569;white-space:nowrap">
            ${esc(b.period) || (b.due_date ? new Date(b.due_date).toLocaleDateString('el-GR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')}
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #e8eaed;text-align:center">
            <span style="font-size:9px;font-weight:600;padding:2px 8px;border-radius:4px;background:${b.recurring ? '#eef2ff' : '#f1f5f9'};color:${b.recurring ? '#3730a3' : '#475569'}">${b.recurring ? 'Πάγιο' : 'Εφάπαξ'}</span>
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #e8eaed;text-align:center">
            <span style="font-size:9px;font-weight:700;padding:3px 9px;border-radius:4px;background:${stBg};color:${stColor}">${stText}</span>
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #e8eaed;font-weight:700;text-align:right;font-family:'Roboto Mono',monospace;font-size:11px;color:#111827;white-space:nowrap">${fe(b.amount)}</td>
        </tr>`;
    };

    const billsTable = (bills: BillEntry[], sumLabel: string, sum: number) => `
      <table>
        <thead><tr>
          <th style="width:16%">Κατηγορία</th><th>Ονομασία / Πάροχος</th><th style="width:16%">Περίοδος / Λήξη</th>
          <th style="width:9%;text-align:center">Τύπος</th><th style="width:12%;text-align:center">Κατάσταση</th>
          <th style="width:12%;text-align:right">Ποσό</th>
        </tr></thead>
        <tbody>${bills.map((b, i) => billRow(b, i)).join('')}</tbody>
        <tfoot><tr>
          <td colspan="5" style="padding:9px 12px;text-align:right;font-size:10px;font-weight:700;color:#334155;border-top:2px solid #cbd5e1">${sumLabel}</td>
          <td style="padding:9px 12px;text-align:right;font-family:'Roboto Mono',monospace;font-size:12px;font-weight:700;color:#111827;border-top:2px solid #cbd5e1;white-space:nowrap">${fe(sum)}</td>
        </tr></tfoot>
      </table>`;

    // ── Γραμμή κατηγορίας ──────────────────────────────────────────────────
    const catRow = ([, v]: [string, typeof byCat[string]]) => {
      const pct = data.totalMonthly > 0 ? (v.monthly / data.totalMonthly) * 100 : 0;
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e8eaed">
            <span style="display:inline-flex;align-items:center;gap:8px;font-size:10.5px;color:#111827;font-weight:600">
              <span style="width:10px;height:10px;border-radius:3px;background:${v.color};display:inline-block"></span>${v.label}
            </span>
            <span style="font-size:9px;color:#94a3b8;margin-left:6px">(${v.count} ${v.count === 1 ? 'λογαριασμός' : 'λογαριασμοί'})</span>
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #e8eaed;text-align:right;font-weight:700;font-family:'Roboto Mono',monospace;color:#111827;font-size:11px;white-space:nowrap">${fe(v.monthly)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e8eaed;text-align:right;color:#64748b;font-family:'Roboto Mono',monospace;font-size:10px;white-space:nowrap">${fe(v.monthly * 12)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e8eaed;width:34%">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="flex:1;height:7px;background:#eef1f5;border-radius:4px;overflow:hidden">
                <div style="height:100%;width:${Math.min(pct, 100).toFixed(0)}%;background:${v.color};border-radius:4px"></div>
              </div>
              <span style="font-size:9.5px;color:#475569;font-family:'Roboto Mono',monospace;min-width:34px;text-align:right">${pct.toFixed(0)}%</span>
            </div>
          </td>
        </tr>`;
    };

    // ── Επερχόμενες λήξεις 30 ημερών ───────────────────────────────────────
    const dueSoonRow = (b: BillEntry) => {
      const dl = daysTo(b.due_date!);
      const urgency = dl <= 3 ? '#b3261e' : dl <= 7 ? '#b45309' : '#475569';
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e8eaed;font-weight:600;color:#111827;font-size:10.5px">${esc(b.name)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e8eaed;font-size:10px;color:#475569">${catOf(b.category).label}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e8eaed;font-size:10px;color:#475569;white-space:nowrap">${new Date(b.due_date!).toLocaleDateString('el-GR', { day: '2-digit', month: 'short' })}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e8eaed;text-align:center">
            <span style="font-size:9.5px;font-weight:700;color:${urgency}">${dl === 0 ? 'ΣΗΜΕΡΑ' : `σε ${dl} ημ.`}</span>
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #e8eaed;text-align:right;font-family:'Roboto Mono',monospace;font-weight:700;font-size:11px;color:#111827;white-space:nowrap">${fe(b.amount)}</td>
        </tr>`;
    };

    // ── Ιστόγραμμα 12 μηνών ────────────────────────────────────────────────
    const histBars = MONTHS_SH.map((m, i) => {
      const val   = hist[i] || 0;
      const pct   = val / maxH;
      const isCur = i === currentMonth;
      const barH  = Math.max(pct * 64, val > 0 ? 4 : 1);
      const color = isCur ? 'var(--accent)' : val > data.avgMonthly * 1.2 ? '#b3261e' : '#1e3a5f';
      return `
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;min-width:0">
          <div style="font-size:8.5px;font-family:'Roboto Mono',monospace;color:${isCur ? '#8a6508' : '#64748b'};font-weight:${isCur ? '700' : '400'};white-space:nowrap">${val > 0 ? fe(val, 0) : ''}</div>
          <div style="width:70%;display:flex;align-items:flex-end;height:64px">
            <div style="width:100%;height:${barH}px;background:${color};border-radius:3px 3px 0 0"></div>
          </div>
          <div style="font-size:9px;color:${isCur ? '#8a6508' : '#94a3b8'};font-weight:${isCur ? '700' : '400'}">${m}</div>
        </div>`;
    }).join('');

    // ── KPI κάρτα ──────────────────────────────────────────────────────────
    const kpi = (label: string, value: string, sub: string, accent = '#111827') => `
      <div style="border:1px solid #e2e8f0;border-radius:10px;padding:13px 15px;background:#ffffff">
        <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;margin-bottom:6px">${label}</div>
        <div style="font-size:19px;font-weight:700;color:${accent};font-family:'Roboto Mono',monospace;line-height:1">${value}</div>
        <div style="font-size:9px;color:#94a3b8;margin-top:5px">${sub}</div>
      </div>`;

    const html = `<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Αναφορά Λογαριασμών — ${esc(data.propertyName)} — ${todayStr()}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Roboto+Mono:wght@400;600;700&display=swap" rel="stylesheet"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    html{background:#eef1f5}
    body{font-family:'Inter',sans-serif;color:#111827;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    @page{size:A4;margin:16mm 14mm 18mm 14mm}
    .sheet{max-width:820px;margin:0 auto;padding:28px;background:#fff}
    @media print{
      html,body{background:#fff}
      .sheet{max-width:none;padding:0}
      .no-print{display:none !important}
      .card{box-shadow:none}
    }
    table{width:100%;border-collapse:collapse}
    thead{display:table-header-group}   /* επανάληψη κεφαλίδας σε κάθε σελίδα */
    tr{break-inside:avoid;page-break-inside:avoid}
    th{font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#64748b;padding:8px 12px;background:#f4f6f9;border-bottom:2px solid #dbe1e8;text-align:left}
    .card{border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px;background:#fff;break-inside:avoid;page-break-inside:avoid}
    .section-title{display:flex;align-items:center;gap:9px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.09em;color:#111827;padding:13px 18px;border-bottom:1px solid #e8eaed;background:#fff}
    .section-title .bar{width:4px;height:16px;border-radius:2px;background:var(--accent);flex-shrink:0}
    .muted{color:#94a3b8;font-weight:500;letter-spacing:0;text-transform:none;font-size:9.5px;margin-left:auto}
  </style>
</head>
<body>
<div class="sheet">

  <!-- Κουμπί εκτύπωσης (δεν εκτυπώνεται) -->
  <div class="no-print" style="display:flex;justify-content:flex-end;gap:10px;margin-bottom:16px">
    <button onclick="window.print()" style="background:#111827;color:#fff;border:none;border-radius:8px;padding:10px 22px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">
      Εκτύπωση / Αποθήκευση PDF
    </button>
  </div>

  <!-- ═══ Κεφαλίδα εγγράφου ═══ -->
  <div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px">
    <div style="background:#111827;color:#fff;padding:22px 26px;display:flex;justify-content:space-between;align-items:flex-start;gap:20px">
      <div>
        <div style="display:flex;align-items:center;gap:9px;margin-bottom:8px">
          <span style="width:10px;height:10px;border-radius:2px;background:var(--accent);display:inline-block"></span>
          <span style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.14em;color:#d9b24a">Property OS</span>
        </div>
        <div style="font-size:23px;font-weight:800;letter-spacing:-0.02em;line-height:1.15">${esc(data.propertyName)}</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:4px">${esc(data.propertyAddress)}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:#9ca3af;margin-bottom:4px">Αναφορά Λογαριασμών</div>
        <div style="font-size:12.5px;font-weight:700">${todayStr()}</div>
        <div style="font-size:9.5px;color:#9ca3af;margin-top:6px">Έτος αναφοράς ${year} · ${data.bills.length} ${data.bills.length === 1 ? 'εγγραφή' : 'εγγραφές'}</div>
      </div>
    </div>

    <!-- Executive Summary -->
    <div style="padding:16px 20px;background:#fafbfc">
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
        ${kpi('Μηνιαίο Κόστος', fe(data.totalMonthly), 'τρέχοντα πάγια / μήνα', '#8a6508')}
        ${kpi('Ετήσια Προβολή', fe(data.totalAnnual), 'εκτίμηση 12μήνου')}
        ${kpi('Μέσος Όρος ' + year, fe(data.avgMonthly), 'ανά μήνα με δεδομένα')}
        ${kpi('Εξοφλημένοι', paidPct + '%', paidBills.length + ' από ' + data.bills.length + ' λογαριασμούς', overdue.length > 0 ? '#b3261e' : '#1e6b3a')}
      </div>

      ${overdue.length > 0 ? `
      <div style="margin-top:12px;background:#fbe9e7;border:1px solid #f1c3bd;border-radius:8px;padding:10px 15px;font-size:11px;color:#8c1d18">
        <strong>Απαιτείται ενέργεια:</strong> ${overdue.length} ${overdue.length === 1 ? 'ληξιπρόθεσμος λογαριασμός' : 'ληξιπρόθεσμοι λογαριασμοί'} συνολικού ύψους <strong style="font-family:'Roboto Mono',monospace">${fe(overdue.reduce((s, b) => s + b.amount, 0))}</strong>.
      </div>` : `
      <div style="margin-top:12px;background:#e8f3ec;border:1px solid #bfdec9;border-radius:8px;padding:10px 15px;font-size:11px;color:#1e6b3a">
        Κανένας ληξιπρόθεσμος λογαριασμός κατά την ημερομηνία έκδοσης.
      </div>`}
      ${topCategory ? `
      <div style="margin-top:8px;font-size:10px;color:#64748b;padding:0 2px">
        Μεγαλύτερη κατηγορία δαπάνης: <strong style="color:#334155">${topCategory.label}</strong> — ${fe(topCategory.monthly)}/μήνα (${data.totalMonthly > 0 ? Math.round((topCategory.monthly / data.totalMonthly) * 100) : 0}% του συνόλου).
      </div>` : ''}
    </div>
  </div>

  <!-- ═══ 1. Εκκρεμείς & Ληξιπρόθεσμοι ═══ -->
  ${unpaidBills.length > 0 ? `
  <div class="card">
    <div class="section-title"><span class="bar" style="background:#b3261e"></span>1. Εκκρεμείς &amp; Ληξιπρόθεσμοι <span class="muted">${unpaidBills.length} ${unpaidBills.length === 1 ? 'λογαριασμός' : 'λογαριασμοί'}</span></div>
    ${billsTable(unpaidBills, 'Σύνολο εκκρεμών οφειλών', unpaidSum)}
  </div>` : ''}

  <!-- ═══ 2. Επερχόμενες λήξεις 30 ημερών ═══ -->
  ${dueSoon30.length > 0 ? `
  <div class="card">
    <div class="section-title"><span class="bar" style="background:#b45309"></span>2. Επερχόμενες Λήξεις — Επόμενες 30 Ημέρες <span class="muted">προγραμματισμός πληρωμών</span></div>
    <table>
      <thead><tr>
        <th>Λογαριασμός</th><th style="width:20%">Κατηγορία</th><th style="width:13%">Λήξη</th>
        <th style="width:13%;text-align:center">Προθεσμία</th><th style="width:14%;text-align:right">Ποσό</th>
      </tr></thead>
      <tbody>${dueSoon30.map(dueSoonRow).join('')}</tbody>
      <tfoot><tr>
        <td colspan="4" style="padding:9px 12px;text-align:right;font-size:10px;font-weight:700;color:#334155;border-top:2px solid #cbd5e1">Σύνολο επόμενων 30 ημερών</td>
        <td style="padding:9px 12px;text-align:right;font-family:'Roboto Mono',monospace;font-size:12px;font-weight:700;color:#111827;border-top:2px solid #cbd5e1;white-space:nowrap">${fe(dueSoon30.reduce((s, b) => s + b.amount, 0))}</td>
      </tr></tfoot>
    </table>
  </div>` : ''}

  <!-- ═══ 3. Κατανομή ανά κατηγορία ═══ -->
  ${catEntries.length > 0 ? `
  <div class="card">
    <div class="section-title"><span class="bar"></span>3. Κατανομή Πάγιων Δαπανών ανά Κατηγορία <span class="muted">μόνο επαναλαμβανόμενοι λογαριασμοί</span></div>
    <table>
      <thead><tr>
        <th>Κατηγορία</th><th style="width:15%;text-align:right">Μηνιαίο</th>
        <th style="width:15%;text-align:right">Ετήσιο</th><th>Ποσοστό συνόλου</th>
      </tr></thead>
      <tbody>${catEntries.map(catRow).join('')}</tbody>
      <tfoot><tr>
        <td style="padding:9px 12px;font-size:10px;font-weight:700;color:#334155;border-top:2px solid #cbd5e1">Σύνολο πάγιων</td>
        <td style="padding:9px 12px;text-align:right;font-family:'Roboto Mono',monospace;font-size:12px;font-weight:700;color:#111827;border-top:2px solid #cbd5e1;white-space:nowrap">${fe(data.totalMonthly)}</td>
        <td style="padding:9px 12px;text-align:right;font-family:'Roboto Mono',monospace;font-size:10.5px;color:#64748b;border-top:2px solid #cbd5e1;white-space:nowrap">${fe(data.totalAnnual)}</td>
        <td style="border-top:2px solid #cbd5e1"></td>
      </tr></tfoot>
    </table>
  </div>` : ''}

  <!-- ═══ 4. Ιστορικό 12μήνου ═══ -->
  ${hist.some(v => v > 0) ? `
  <div class="card">
    <div class="section-title"><span class="bar"></span>4. Ιστορικό Κόστους ${year} <span class="muted">τρέχων μήνας: ${MONTHS_FULL[currentMonth]}</span></div>
    <div style="padding:18px 18px 10px">
      <div style="display:flex;align-items:flex-end;gap:4px;border-bottom:2px solid #e8eaed;padding-bottom:0">
        ${histBars}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px">
        <div style="font-size:10px;color:#64748b">Μέσος όρος: <strong style="color:#1e3a5f;font-family:'Roboto Mono',monospace">${fe(data.avgMonthly)}</strong>/μήνα</div>
        ${maxMonth ? `<div style="font-size:10px;color:#64748b">Ακριβότερος μήνας: <strong style="color:#b3261e;font-family:'Roboto Mono',monospace">${MONTHS_SH[maxMonth.i]} — ${fe(maxMonth.v)}</strong></div>` : '<div></div>'}
        ${minMonth ? `<div style="font-size:10px;color:#64748b">Οικονομικότερος: <strong style="color:#1e6b3a;font-family:'Roboto Mono',monospace">${MONTHS_SH[minMonth.i]} — ${fe(minMonth.v)}</strong></div>` : '<div></div>'}
      </div>
      <div style="margin-top:10px;padding:8px 12px;background:#f8fafc;border-radius:6px;font-size:9px;color:#94a3b8">
        Χρωματισμός ράβδων: σκούρο μπλε = κανονικός μήνας · κόκκινο = πάνω από +20% του μέσου όρου · χρυσό = τρέχων μήνας.
      </div>
    </div>
  </div>` : ''}

  <!-- ═══ 5. Πληρωμένοι ═══ -->
  ${paidBills.length > 0 ? `
  <div class="card">
    <div class="section-title"><span class="bar" style="background:#1e6b3a"></span>5. Πληρωμένοι Λογαριασμοί <span class="muted">${paidBills.length} ${paidBills.length === 1 ? 'εγγραφή' : 'εγγραφές'}</span></div>
    ${billsTable(paidBills, 'Σύνολο εξοφλημένων', paidSum)}
  </div>` : ''}

  <!-- ═══ Μεθοδολογία & υπογραφή ═══ -->
  <div class="card" style="background:#fafbfc">
    <div style="padding:14px 18px">
      <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.09em;color:#94a3b8;margin-bottom:8px">Σημειώσεις &amp; Μεθοδολογία</div>
      <ul style="font-size:9.5px;color:#64748b;line-height:1.7;padding-left:16px">
        <li>Το «Μηνιαίο Κόστος» αθροίζει μόνο τους επαναλαμβανόμενους (πάγιους) λογαριασμούς· τα εφάπαξ ποσά εμφανίζονται στους αναλυτικούς πίνακες.</li>
        <li>Η «Ετήσια Προβολή» είναι εκτίμηση (μηνιαίο × 12) και δεν συνυπολογίζει εποχικότητα (για παράδειγμα θέρμανση χειμώνα).</li>
        <li>Τα ποσά καταχωρούνται από τον χρήστη και ενδέχεται να διαφέρουν από τα επίσημα παραστατικά των παρόχων.</li>
      </ul>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:18px;padding-top:14px;border-top:1px solid #e8eaed">
        <div style="font-size:9px;color:#94a3b8">
          Property OS · Αναφορά: ${todayStr()} · Εμπιστευτικό έγγραφο — μόνο για τον ιδιοκτήτη/διαχειριστή του ακινήτου
        </div>
        <div style="text-align:center">
          <div style="width:180px;border-bottom:1px solid #cbd5e1;height:26px"></div>
          <div style="font-size:8.5px;color:#94a3b8;margin-top:4px">Υπογραφή / Ημερομηνία</div>
        </div>
      </div>
    </div>
  </div>

</div>

<script>
  // Άνοιγμα διαλόγου εκτύπωσης αφού φορτώσουν οι γραμματοσειρές
  window.addEventListener('load', function () {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { setTimeout(function () { window.print(); }, 300); });
    } else {
      setTimeout(function () { window.print(); }, 800);
    }
  });
</script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
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