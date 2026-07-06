// ═══════════════════════════════════════════════════════════════════════════
// printPropertyStatement, επαγγελματική εκτυπώσιμη «Αναφορά Ακινήτου» (PDF).
// Ανοίγει καθαρό, branded παράθυρο εκτύπωσης (A4), ιδανικό για τράπεζα/λογιστή.
// Χωρίς εξαρτήσεις· ο χρήστης επιλέγει «Αποθήκευση ως PDF» από τον διάλογο.
// ═══════════════════════════════════════════════════════════════════════════

export interface StatementCtx {
  propName: string;
  address?: string;
  propType: string;
  status?: string;
  year: number;
  propValue?: number;
  sqm?: number;
  monthlyRent: number;
  annualRent: number;
  grossYield: number;
  netYield: number;
  expensesYTD: number;
  categories: [string, number][]; // [όνομα κατηγορίας, ποσό]
}

const eur = (n: number) => `${Math.round(n).toLocaleString('el-GR')} €`;
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

export function printPropertyStatement(c: StatementCtx): void {
  const tax = c.annualRent * 0.15;
  const net = c.annualRent - c.expensesYTD - tax;
  const today = new Date().toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' });
  const catMax = Math.max(1, ...c.categories.map(([, v]) => v));

  const row = (label: string, value: string, strong = false, color = '#202124') =>
    `<tr><td style="padding:9px 0;border-bottom:1px solid #e8eaed;color:#5f6368;font-size:13px">${esc(label)}</td>
     <td style="padding:9px 0;border-bottom:1px solid #e8eaed;text-align:right;font-family:'Roboto Mono',monospace;font-size:${strong ? 15 : 13}px;font-weight:${strong ? 700 : 500};color:${color}">${esc(value)}</td></tr>`;

  const kpi = (label: string, value: string, color = '#1a73e8') =>
    `<div style="flex:1;min-width:120px;border:1px solid #e8eaed;border-radius:12px;padding:14px 16px">
      <div style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#80868b;font-weight:700;margin-bottom:8px">${esc(label)}</div>
      <div style="font-family:'Roboto Mono',monospace;font-size:20px;font-weight:700;color:${color}">${esc(value)}</div>
    </div>`;

  const catRows = c.categories.length
    ? c.categories.map(([name, amt]) => `
      <div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:#3c4043;margin-bottom:4px">
          <span>${esc(name)}</span><span style="font-family:'Roboto Mono',monospace;font-weight:600">${esc(eur(amt))}</span>
        </div>
        <div style="height:6px;background:#f1f3f4;border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${Math.round((amt / catMax) * 100)}%;background:#1a73e8;border-radius:3px"></div>
        </div>
      </div>`).join('')
    : `<div style="color:#80868b;font-size:12px;padding:12px 0">Δεν έχουν καταχωρηθεί δαπάνες.</div>`;

  const html = `<!doctype html><html lang="el"><head><meta charset="utf-8">
<title>Αναφορά Ακινήτου, ${esc(c.propName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700;800&family=Roboto+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',system-ui,sans-serif;color:#202124;background:#fff;padding:40px;max-width:820px;margin:0 auto}
  @media print{body{padding:0}@page{margin:16mm}}
  h1{font-size:24px;font-weight:800;letter-spacing:-.02em}
  .muted{color:#5f6368}
  .sec{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#5f6368;margin:28px 0 12px;padding-bottom:8px;border-bottom:1px solid #e8eaed;display:flex;align-items:center;gap:8px}
  .dot{width:6px;height:6px;border-radius:50%;background:#1a73e8;display:inline-block}
  table{width:100%;border-collapse:collapse}
</style></head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1a73e8;padding-bottom:18px;margin-bottom:8px">
    <div style="display:flex;align-items:center;gap:10px">
      <div style="width:34px;height:34px;border-radius:9px;background:#1a73e8;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:17px">P</div>
      <div><div style="font-size:16px;font-weight:700">Property OS</div><div class="muted" style="font-size:11px">Αναφορά Ακινήτου</div></div>
    </div>
    <div style="text-align:right"><div class="muted" style="font-size:11px">Ημερομηνία</div><div style="font-size:13px;font-weight:600">${esc(today)}</div></div>
  </div>

  <div style="margin:22px 0">
    <h1>${esc(c.propName)}</h1>
    <div class="muted" style="font-size:13px;margin-top:4px">${[c.propType, c.sqm ? `${c.sqm} τ.μ.` : '', c.address, c.status].filter(Boolean).map(x => esc(String(x))).join(' · ')}</div>
  </div>

  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px">
    ${kpi('Μηνιαίο Ενοίκιο', eur(c.monthlyRent))}
    ${kpi('Μεικτή Απόδοση', `${c.grossYield.toFixed(1)}%`, '#188038')}
    ${kpi('Καθαρή Απόδοση', `${c.netYield.toFixed(1)}%`, '#188038')}
    ${kpi('Αξία Ακινήτου', c.propValue ? eur(c.propValue) : '—', '#202124')}
  </div>

  <div class="sec"><span class="dot"></span> Ετήσιος Απολογισμός ${esc(String(c.year))}</div>
  <table>
    ${row('Ακαθάριστα έσοδα (ενοίκια)', eur(c.annualRent), false, '#188038')}
    ${row('Συνολικές δαπάνες', `− ${eur(c.expensesYTD)}`, false, '#c5221f')}
    ${row('Εκτιμώμενος φόρος (15%)', `− ${eur(tax)}`, false, '#e37400')}
    ${row('Καθαρό αποτέλεσμα', `${net < 0 ? '− ' : ''}${eur(Math.abs(net))}`, true, net >= 0 ? '#188038' : '#c5221f')}
  </table>

  <div class="sec"><span class="dot"></span> Ανάλυση Δαπανών ${esc(String(c.year))}</div>
  ${catRows}

  <div style="margin-top:40px;padding-top:14px;border-top:1px solid #e8eaed;color:#80868b;font-size:10px;line-height:1.6">
    Η παρούσα αναφορά δημιουργήθηκε αυτόματα από το Property OS και έχει ενημερωτικό χαρακτήρα. Δεν αποτελεί επίσημο φορολογικό ή λογιστικό έγγραφο. Ο εκτιμώμενος φόρος υπολογίζεται ενδεικτικά στο 15% των ακαθάριστων εσόδων.
  </div>
  <script>window.onload=function(){setTimeout(function(){window.print()},350)}</script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Επίτρεψε τα αναδυόμενα παράθυρα για να δημιουργηθεί η αναφορά.'); return; }
  w.document.write(html);
  w.document.close();
}
