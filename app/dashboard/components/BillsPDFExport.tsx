'use client';

import { useReportBranding } from '@/lib/reportBranding';
import {
  reportHead, reportHeader, reportSection, reportKpi, reportDisclaimer, openReport,
  rEur, rPct, rEsc, rDate,
} from './reportPdf';

// ─────────────────────────────────────────────────────────────────────────────
// BillsPDFExport — Επαγγελματική Αναφορά Λογαριασμών, στο ΚΟΙΝΟ ασπρόμαυρο
// «λογιστικό» σύστημα αναφορών (reportPdf). Ενιαία τυπογραφία/κενά/στοίχιση με
// τις υπόλοιπες εκτυπώσεις (Inter, tabular numerals). Μοναδικό σημείο χρώματος:
// το σήμα/λογότυπο του brand (το χειρίζεται το reportHeader).
//
// Δομή: κεφαλίδα → Σύνοψη (KPIs) → Εκκρεμείς/Ληξιπρόθεσμοι → Επερχόμενες λήξεις
// 30 ημερών → Κατανομή ανά κατηγορία → Ιστορικό 12μήνου → Πληρωμένοι →
// Σημειώσεις & μεθοδολογία → disclaimer. Χρήματα «1.234,56 €», ποσοστά «18,00%».
// Όλα τα δεδομένα χρήστη περνούν από rEsc() (προστασία από stored-XSS).
// ─────────────────────────────────────────────────────────────────────────────

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

// Ασπρόμαυρο: μόνο ετικέτες κατηγοριών (καμία χρωματική διάκριση).
const CAT: Record<string, string> = {
  electricity: 'Ρεύμα',
  common:      'Κοινόχρηστα',
  internet:    'Internet',
  water:       'Νερό',
  gas:         'Αέριο / Θέρμανση',
  insurance:   'Ασφάλεια',
  security:    'Security / Συναγερμός',
  streaming:   'Streaming',
  enfia:       'ΕΝΦΙΑ',
  dimotika:    'Δημοτικά Τέλη',
  taxes:       'Φόροι',
  cleaning:    'Καθαρισμός',
  garden:      'Κήπος',
  pool:        'Πισίνα',
  elevator:    'Ανελκυστήρας',
  ac_service:  'Σέρβις Κλιματιστικού',
  renovation:  'Ανακαίνιση',
  pest:        'Απεντόμωση',
  other:       'Άλλο',
};

const catLabel = (v: string) => CAT[v] || v;
const MONTHS_FULL = ['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος','Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος'];
const MONTHS_SH   = ['Ιαν','Φεβ','Μαρ','Απρ','Μαΐ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];

export default function BillsPDFExport({ data, userId }: { data: BillsData; userId?: string }) {
  const branding = useReportBranding(userId);

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
    const overdueSum  = overdue.reduce((s, b) => s + b.amount, 0);

    // Ιστορικό, στατιστικά
    const hist        = data.historyTotals || [];
    const monthsWith  = hist.map((v, i) => ({ v, i })).filter(x => x.v > 0);
    const maxMonth    = monthsWith.length ? monthsWith.reduce((a, b) => (b.v > a.v ? b : a)) : null;
    const minMonth    = monthsWith.length ? monthsWith.reduce((a, b) => (b.v < a.v ? b : a)) : null;
    const maxH        = Math.max(...(hist.length ? hist : [1]), 1);

    // Κατανομή ανά κατηγορία (πάγια)
    const byCat: Record<string, { label: string; monthly: number; count: number }> = {};
    data.bills.filter(b => b.recurring).forEach(b => {
      if (!byCat[b.category]) byCat[b.category] = { label: catLabel(b.category), monthly: 0, count: 0 };
      byCat[b.category].monthly += b.amount;
      byCat[b.category].count++;
    });
    const catEntries  = Object.entries(byCat).sort((a, b) => b[1].monthly - a[1].monthly);
    const topCategory = catEntries[0]?.[1] || null;
    const topPct      = topCategory && data.totalMonthly > 0 ? (topCategory.monthly / data.totalMonthly) * 100 : 0;

    // ── Γραμμή λογαριασμού ─────────────────────────────────────────────────
    const billRow = (b: BillEntry) => {
      const dl     = b.due_date ? daysTo(b.due_date) : null;
      const isOd   = dl !== null && dl < 0 && !b.paid;
      const stText = b.paid ? 'Πληρώθηκε' : isOd ? 'Ληξιπρόθεσμος' : 'Εκκρεμεί';
      const period = rEsc(b.period) || (b.due_date ? rDate(b.due_date) : '—');
      return `<tr>
        <td>${rEsc(catLabel(b.category))}</td>
        <td style="font-weight:600;color:#111">${rEsc(b.name)}${b.notes ? `<div style="font-weight:400;font-size:11px;color:#8a8f98;margin-top:2px">${rEsc(b.notes)}</div>` : ''}</td>
        <td>${period}</td>
        <td>${b.recurring ? 'Πάγιο' : 'Εφάπαξ'}</td>
        <td>${stText}</td>
        <td class="n">${rEur(b.amount)}</td>
      </tr>`;
    };

    const billsTable = (bills: BillEntry[], sumLabel: string, sum: number) => `
      <table>
        <thead><tr>
          <th>Κατηγορία</th><th>Ονομασία / πάροχος</th><th>Περίοδος / λήξη</th>
          <th>Τύπος</th><th>Κατάσταση</th><th class="n">Ποσό</th>
        </tr></thead>
        <tbody>
          ${bills.map(billRow).join('')}
          <tr class="result"><td colspan="5">${rEsc(sumLabel)}</td><td class="n">${rEur(sum)}</td></tr>
        </tbody>
      </table>`;

    // ── Γραμμή κατηγορίας ──────────────────────────────────────────────────
    const catRow = ([, v]: [string, { label: string; monthly: number; count: number }]) => {
      const p = data.totalMonthly > 0 ? (v.monthly / data.totalMonthly) * 100 : 0;
      return `<tr>
        <td>${rEsc(v.label)} <span style="color:#8a8f98;font-size:11px">(${v.count} ${v.count === 1 ? 'λογαριασμός' : 'λογαριασμοί'})</span></td>
        <td class="n">${rEur(v.monthly)}</td>
        <td class="n">${rEur(v.monthly * 12)}</td>
        <td class="np">${rPct(p)}</td>
      </tr>`;
    };

    // ── Επερχόμενες λήξεις 30 ημερών ───────────────────────────────────────
    const dueSoonRow = (b: BillEntry) => {
      const dl = daysTo(b.due_date!);
      return `<tr>
        <td style="font-weight:600;color:#111">${rEsc(b.name)}</td>
        <td>${rEsc(catLabel(b.category))}</td>
        <td>${rDate(b.due_date!)}</td>
        <td>${dl === 0 ? 'Σήμερα' : `σε ${dl} ημ.`}</td>
        <td class="n">${rEur(b.amount)}</td>
      </tr>`;
    };

    // ── Ιστόγραμμα 12 μηνών (μόνο διαβαθμίσεις του γκρι) ────────────────────
    const histBars = MONTHS_SH.map((m, i) => {
      const val   = hist[i] || 0;
      const p     = val / maxH;
      const isCur = i === currentMonth;
      const barH  = Math.max(p * 64, val > 0 ? 4 : 1);
      const shade = isCur ? '#111' : '#c7ccd3';
      return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;min-width:0">
        <div style="font-size:8px;font-variant-numeric:tabular-nums;color:${isCur ? '#111' : '#8a8f98'};font-weight:${isCur ? '700' : '400'};white-space:nowrap">${val > 0 ? rEur(val) : ''}</div>
        <div style="width:70%;display:flex;align-items:flex-end;height:64px">
          <div style="width:100%;height:${barH}px;background:${shade};border-radius:3px 3px 0 0"></div>
        </div>
        <div style="font-size:9px;color:${isCur ? '#111' : '#8a8f98'};font-weight:${isCur ? '700' : '400'}">${m}</div>
      </div>`;
    }).join('');

    const html = reportHead(`Αναφορά Λογαριασμών · ${data.propertyName}`)
      + `<body><div class="page">`
      + reportHeader(branding, 'Αναφορά Λογαριασμών', {
          rightNote: `Έτος αναφοράς ${year} · ${data.bills.length} ${data.bills.length === 1 ? 'εγγραφή' : 'εγγραφές'}`,
        })
      + `<h1>${rEsc(data.propertyName)}</h1>`
      + `<div class="sub">${rEsc(data.propertyAddress)}</div>`

      // ── Σύνοψη ────────────────────────────────────────────────────────────
      + reportSection('Σύνοψη')
      + `<div class="kpis">`
        + reportKpi('Μηνιαίο κόστος', rEur(data.totalMonthly))
        + reportKpi('Ετήσια προβολή', rEur(data.totalAnnual))
        + reportKpi(`Μέσος όρος ${year}`, rEur(data.avgMonthly))
        + reportKpi('Εξοφλημένοι', rPct(paidPct))
      + `</div>`
      + (overdue.length > 0
          ? `<div class="note"><strong>Απαιτείται ενέργεια:</strong> ${overdue.length} ${overdue.length === 1 ? 'ληξιπρόθεσμος λογαριασμός' : 'ληξιπρόθεσμοι λογαριασμοί'} συνολικού ύψους <strong class="tnum">${rEur(overdueSum)}</strong>.</div>`
          : `<div class="note">Κανένας ληξιπρόθεσμος λογαριασμός κατά την ημερομηνία έκδοσης.</div>`)
      + (topCategory
          ? `<div class="note">Μεγαλύτερη κατηγορία δαπάνης: <strong>${rEsc(topCategory.label)}</strong> · <span class="tnum">${rEur(topCategory.monthly)}</span> / μήνα (${rPct(topPct)} του συνόλου).</div>`
          : '')
      + `<div class="note tnum">${paidBills.length} από ${data.bills.length} ${data.bills.length === 1 ? 'λογαριασμός' : 'λογαριασμοί'} εξοφλημένοι.</div>`

      // ── 1. Εκκρεμείς & Ληξιπρόθεσμοι ──────────────────────────────────────
      + (unpaidBills.length > 0
          ? reportSection(`1. Εκκρεμείς & ληξιπρόθεσμοι (${unpaidBills.length} ${unpaidBills.length === 1 ? 'λογαριασμός' : 'λογαριασμοί'})`)
            + billsTable(unpaidBills, 'Σύνολο εκκρεμών οφειλών', unpaidSum)
          : '')

      // ── 2. Επερχόμενες λήξεις 30 ημερών ───────────────────────────────────
      + (dueSoon30.length > 0
          ? reportSection('2. Επερχόμενες λήξεις · επόμενες 30 ημέρες')
            + `<table>
                <thead><tr>
                  <th>Λογαριασμός</th><th>Κατηγορία</th><th>Λήξη</th><th>Προθεσμία</th><th class="n">Ποσό</th>
                </tr></thead>
                <tbody>
                  ${dueSoon30.map(dueSoonRow).join('')}
                  <tr class="result"><td colspan="4">Σύνολο επόμενων 30 ημερών</td><td class="n">${rEur(dueSoon30.reduce((s, b) => s + b.amount, 0))}</td></tr>
                </tbody>
              </table>`
          : '')

      // ── 3. Κατανομή ανά κατηγορία ─────────────────────────────────────────
      + (catEntries.length > 0
          ? reportSection('3. Κατανομή πάγιων δαπανών ανά κατηγορία')
            + `<table>
                <thead><tr>
                  <th>Κατηγορία</th><th class="n">Μηνιαίο</th><th class="n">Ετήσιο</th><th class="np">Ποσοστό</th>
                </tr></thead>
                <tbody>
                  ${catEntries.map(catRow).join('')}
                  <tr class="result"><td>Σύνολο πάγιων</td><td class="n">${rEur(data.totalMonthly)}</td><td class="n">${rEur(data.totalAnnual)}</td><td class="np">${rPct(100)}</td></tr>
                </tbody>
              </table>`
          : '')

      // ── 4. Ιστορικό 12μήνου ───────────────────────────────────────────────
      + (hist.some(v => v > 0)
          ? reportSection(`4. Ιστορικό κόστους ${year} · τρέχων μήνας ${MONTHS_FULL[currentMonth]}`)
            + `<div style="display:flex;align-items:flex-end;gap:4px;border-bottom:1px solid #d0d5dd;padding-bottom:0;margin-top:6px">${histBars}</div>
               <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px">
                 <div class="note" style="margin-top:0">Μέσος όρος: <strong class="tnum">${rEur(data.avgMonthly)}</strong> / μήνα</div>
                 ${maxMonth ? `<div class="note" style="margin-top:0">Ακριβότερος μήνας: <strong class="tnum">${MONTHS_SH[maxMonth.i]}, ${rEur(maxMonth.v)}</strong></div>` : '<div></div>'}
                 ${minMonth ? `<div class="note" style="margin-top:0">Οικονομικότερος: <strong class="tnum">${MONTHS_SH[minMonth.i]}, ${rEur(minMonth.v)}</strong></div>` : '<div></div>'}
               </div>
               <div class="note" style="font-size:10px;color:#8a8f98">Οι ράβδοι απεικονίζουν το μηνιαίο κόστος· ο τρέχων μήνας εμφανίζεται με έντονη μαύρη ράβδο.</div>`
          : '')

      // ── 5. Πληρωμένοι ─────────────────────────────────────────────────────
      + (paidBills.length > 0
          ? reportSection(`5. Πληρωμένοι λογαριασμοί (${paidBills.length} ${paidBills.length === 1 ? 'εγγραφή' : 'εγγραφές'})`)
            + billsTable(paidBills, 'Σύνολο εξοφλημένων', paidSum)
          : '')

      // ── Σημειώσεις & μεθοδολογία ──────────────────────────────────────────
      + reportSection('Σημειώσεις & μεθοδολογία')
      + `<div class="note">Το «Μηνιαίο κόστος» αθροίζει μόνο τους επαναλαμβανόμενους (πάγιους) λογαριασμούς· τα εφάπαξ ποσά εμφανίζονται στους αναλυτικούς πίνακες.</div>`
      + `<div class="note">Η «Ετήσια προβολή» είναι εκτίμηση (μηνιαίο × 12) και δεν συνυπολογίζει εποχικότητα (π.χ. θέρμανση χειμώνα).</div>`
      + `<div class="note">Τα ποσά καταχωρούνται από τον χρήστη και ενδέχεται να διαφέρουν από τα επίσημα παραστατικά των παρόχων.</div>`

      + reportDisclaimer(`Αναφορά: ${rDate()} · Εμπιστευτικό έγγραφο, μόνο για τον ιδιοκτήτη/διαχειριστή του ακινήτου.`, branding)
      + `</div></body></html>`;

    openReport(html);
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
        fontFamily: "Inter, 'Inter', sans-serif",
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
