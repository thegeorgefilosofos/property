// ═══════════════════════════════════════════════════════════════════════════
// printPropertyStatement — επαγγελματική εκτυπώσιμη «Αναφορά Ακινήτου» (A4 PDF).
//
// ΑΣΠΡΟΜΑΥΡΟ, λιτό, σαν επίσημο λογιστικό έγγραφο. ΜΟΝΑΔΙΚΟ σημείο χρώματος: το
// σήμα P (λογότυπο brand). Χρήματα με δύο δεκαδικά και «€», αρνητικά με σφιχτό
// «−», ποσοστά «18,00%». Ενιαία τυπογραφία/κενά/στοίχιση με τις άλλες αναφορές
// (Inter, tabular numerals). Ολοκληρωμένη: ταυτότητα, απόδοση, απολογισμός,
// φορολογική εικόνα, ανάλυση δαπανών. XSS-ασφαλές (esc).
// ═══════════════════════════════════════════════════════════════════════════
import { reportAccent, brandLogoImg, brandName, brandContactLine, type ReportBranding } from '@/lib/reportBranding';
import { incomeStatement } from '@/lib/accounting/statement';

export interface StatementCtx {
  propName: string;
  address?: string;
  postalCode?: string | null;
  propType: string;
  status?: string;
  year: number;
  propValue?: number;
  objValue?: number | null;
  enfia?: number | null;
  sqm?: number | null;
  bedrooms?: number | string | null;
  floor?: number | string | null;
  yearBuilt?: number | string | null;
  energyClass?: string | null;
  atak?: string | null;
  ownership?: number | null;
  coOwners?: string[] | null;
  shortTerm?: boolean;
  monthlyRent: number;
  annualRent: number;
  grossYield: number;
  netYield: number;
  expensesYTD: number;
  categories: [string, number][];
  branding?: ReportBranding | null;
}

// Δύο δεκαδικά, ελληνικό κόμμα, σύμβολο «€». Αρνητικά με σφιχτό «−».
const eur = (n: number) => `${(n || 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const signed = (n: number) => (n < 0 ? `−${eur(Math.abs(n))}` : eur(n));
const pct = (n: number) => `${(n || 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const esc = (str: string) => str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
const s = (v: unknown) => (v == null || v === '' ? '' : String(v));

export function printPropertyStatement(c: StatementCtx): void {
  const accent = reportAccent(c.branding); // ΜΟΝΟ για το σήμα P
  const st = incomeStatement({ regime: 'individual_longterm', grossIncome: c.annualRent });
  const tax = st.incomeTax;
  const net = c.annualRent - c.expensesYTD - tax;
  const preTax = c.annualRent - c.expensesYTD;
  const effRate = c.annualRent > 0 ? (tax / c.annualRent) * 100 : 0;
  const own = c.ownership != null && c.ownership > 0 && c.ownership <= 100 ? c.ownership : null;
  const today = new Date().toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' });
  const totalCat = c.categories.reduce((sum, [, v]) => sum + v, 0);
  const cats = [...c.categories].sort((a, b) => b[1] - a[1]);
  const leaseType = c.shortTerm ? 'Βραχυχρόνια (Airbnb / Booking)' : 'Μακροχρόνια';
  const rentLabel = c.shortTerm ? 'Μηνιαίο έσοδο (εκτ.)' : 'Μηνιαίο ενοίκιο';

  const addr = [s(c.address), c.postalCode ? `Τ.Κ. ${s(c.postalCode)}` : ''].filter(Boolean).join(' · ');
  const info: [string, string][] = ([
    ['Διεύθυνση', addr], ['Τύπος', s(c.propType)], ['Εμβαδόν', c.sqm ? `${s(c.sqm)} τ.μ.` : ''],
    ['Υπνοδωμάτια', s(c.bedrooms)], ['Όροφος', s(c.floor)], ['Έτος κατασκευής', s(c.yearBuilt)],
    ['Ενεργειακή κλάση', s(c.energyClass)], ['ΑΤΑΚ', s(c.atak)], ['Κατάσταση', s(c.status)],
    ['Είδος μίσθωσης', leaseType], ['Ποσοστό ιδιοκτησίας', own != null ? pct(own) : ''],
    ['Αντικειμενική αξία', c.objValue ? eur(c.objValue) : ''],
  ] as [string, string][]).filter(([, v]) => v !== '');

  const infoRows = (() => {
    let out = '';
    for (let i = 0; i < info.length; i += 2) {
      const a = info[i], b = info[i + 1];
      out += `<tr><td class="k">${esc(a[0])}</td><td class="v">${esc(a[1])}</td>`
        + `<td class="k">${b ? esc(b[0]) : ''}</td><td class="v vlast">${b ? esc(b[1]) : ''}</td></tr>`;
    }
    return out;
  })();

  const coOwnersLine = own != null && own < 100 && c.coOwners && c.coOwners.filter(Boolean).length
    ? `<div class="note"><span class="muted">Συνιδιοκτήτες:</span> ${esc(c.coOwners.filter(Boolean).join(', '))}</div>` : '';

  const row = (label: string, value: string, cls = '') => `<tr class="${cls}"><td>${esc(label)}</td><td class="n">${esc(value)}</td></tr>`;
  const kpi = (label: string, value: string) => `<div class="kpi"><div class="kl">${esc(label)}</div><div class="kv">${esc(value)}</div></div>`;

  const catRows = cats.length
    ? cats.map(([name, amt]) => `<tr><td>${esc(name)}</td><td class="n">${esc(eur(amt))}</td><td class="np">${esc(pct(totalCat > 0 ? (amt / totalCat) * 100 : 0))}</td></tr>`).join('')
      + `<tr class="result"><td>Σύνολο δαπανών</td><td class="n">${esc(eur(totalCat))}</td><td class="np">${esc(totalCat > 0 ? pct(100) : '')}</td></tr>`
    : `<tr><td colspan="3" class="empty">Δεν έχουν καταχωρηθεί δαπάνες για το ${esc(String(c.year))}.</td></tr>`;

  const subtitle = [c.propType, c.sqm ? `${c.sqm} τ.μ.` : '', leaseType, c.status].filter(Boolean).map(x => esc(String(x))).join(' · ');
  const ownerShare = own != null && own < 100
    ? `<div class="note"><span class="muted">Αναλογία ιδιοκτήτη (${esc(pct(own))}):</span> έσοδα <strong class="tnum">${esc(eur(c.annualRent * own / 100))}</strong> · καθαρό αποτέλεσμα <strong class="tnum">${esc(signed(net * own / 100))}</strong></div>` : '';
  const disclaimer = `Η παρούσα αναφορά έχει ενημερωτικό χαρακτήρα και δεν αποτελεί επίσημο φορολογικό ή λογιστικό έγγραφο. Ο εκτιμώμενος φόρος υπολογίζεται με την προοδευτική κλίμακα ενοικίων ${c.year} και την τεκμαρτή έκπτωση δαπανών 5% (μακροχρόνια μίσθωση φυσικού προσώπου)${c.shortTerm ? ', ενώ στη βραχυχρόνια προστίθενται κατά περίπτωση τέλος ανθεκτικότητας κλιματικής κρίσης και τέλος παρεπιδημούντων' : ''}. Πριν από κάθε υποβολή, επιβεβαίωσε τα ποσά με τον λογιστή σου ή την ΑΑΔΕ.`;

  const html = `<!doctype html><html lang="el"><head><meta charset="utf-8">
<title>Αναφορά ακινήτου · ${esc(c.propName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',system-ui,Arial,sans-serif;color:#111;background:#fff;font-size:12.5px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{max-width:760px;margin:0 auto;padding:40px}
  @media print{.page{padding:16mm 15mm}@page{margin:0}}
  .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:16px}
  .brand{display:flex;align-items:center;gap:11px}
  .mark{width:34px;height:34px;border-radius:8px;background:${accent};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:17px}
  .bname{font-size:15px;font-weight:700;color:#111}
  .muted{color:#6b7280}
  .asof-l{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#8a8f98;font-weight:600}
  h1{font-size:22px;font-weight:700;letter-spacing:-.01em;margin:22px 0 3px}
  .sub{color:#6b7280;font-size:12px;margin-bottom:6px}
  .sec{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#111;margin:26px 0 10px;padding-bottom:6px;border-bottom:1px solid #111;break-after:avoid}
  table{width:100%;border-collapse:collapse;break-inside:avoid}
  .idt{table-layout:fixed}
  .idt td{padding:7px 14px 7px 0;font-size:12px;border-bottom:1px solid #f1f3f4;vertical-align:top}
  .idt .k{color:#6b7280;font-size:11.5px;white-space:nowrap;width:17%}
  .idt .v{color:#111;font-weight:600;width:33%}
  .idt .vlast{padding-right:0}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  .kpi{border:1px solid #e5e7eb;border-radius:10px;padding:13px 15px}
  .kl{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#8a8f98;font-weight:700;margin-bottom:7px}
  .kv{font-size:18px;font-weight:700;color:#111;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
  td{padding:8px 4px;text-align:left;font-size:12.5px;color:#374151}
  tbody tr td{border-bottom:1px solid #eef0f2}
  td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:600;color:#111}
  td.np{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;color:#8a8f98;font-size:11.5px;padding-left:18px;width:80px}
  tr.sub td{font-weight:700;color:#111;background:#fafafa}
  tr.result td{font-weight:700;color:#111;border-top:2px solid #111;border-bottom:none;padding-top:10px}
  th{font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:#8a8f98;font-weight:600;border-bottom:1px solid #d0d5dd;text-align:left;padding:0 4px 6px}
  th.n{text-align:right}th.np{text-align:right;padding-left:18px}
  td.empty{color:#8a8f98;font-size:12px;padding:12px 0}
  .note{margin-top:9px;font-size:11.5px;color:#374151;line-height:1.55}
  .tnum{font-variant-numeric:tabular-nums}
  .disc{margin-top:32px;padding-top:12px;border-top:1px solid #e5e7eb;color:#8a8f98;font-size:10px;line-height:1.6}
  .colo{margin-top:10px;font-size:9.5px;letter-spacing:.02em;color:#9aa0a6}
  .colo b{font-weight:700;color:#6b7280}
</style></head>
<body><div class="page">
  <div class="top">
    <div class="brand">
      ${brandLogoImg(c.branding, 34) || `<div class="mark">P</div>`}
      <div>
        <div class="bname">${brandName(c.branding)}</div>
        <div class="muted" style="font-size:11px">Αναφορά ακινήτου</div>
        ${brandContactLine(c.branding) ? `<div class="muted" style="font-size:10px;margin-top:2px">${brandContactLine(c.branding)}</div>` : ''}
      </div>
    </div>
    <div style="text-align:right">
      <div class="asof-l">Ημερομηνία έκδοσης</div>
      <div style="font-size:13px;font-weight:600;margin-top:2px">${esc(today)}</div>
      <div class="muted" style="font-size:10px;margin-top:3px">Περίοδος αναφοράς: ${esc(String(c.year))}</div>
    </div>
  </div>

  <h1>${esc(c.propName)}</h1>
  ${subtitle ? `<div class="sub">${subtitle}</div>` : ''}

  <div class="sec">Στοιχεία ακινήτου</div>
  <table class="idt"><colgroup><col style="width:17%"><col style="width:33%"><col style="width:17%"><col style="width:33%"></colgroup>${infoRows}</table>
  ${coOwnersLine}

  <div class="sec">Σύνοψη απόδοσης</div>
  <div class="kpis">
    ${kpi(rentLabel, eur(c.monthlyRent))}
    ${kpi('Μεικτή απόδοση', pct(c.grossYield))}
    ${kpi('Καθαρή απόδοση', pct(c.netYield))}
    ${kpi('Αξία ακινήτου', c.propValue ? eur(c.propValue) : '—')}
  </div>

  <div class="sec">Ετήσιος απολογισμός ${esc(String(c.year))}</div>
  <table><tbody>
    ${row('Ακαθάριστα έσοδα (ενοίκια)', eur(c.annualRent))}
    ${row('Συνολικές δαπάνες', `−${eur(c.expensesYTD)}`)}
    ${row('Καθαρό αποτέλεσμα προ φόρου', signed(preTax), 'sub')}
    ${row('Φόρος εισοδήματος', `−${eur(tax)}`)}
    ${row('Καθαρό αποτέλεσμα', signed(net), 'result')}
  </tbody></table>
  ${ownerShare}

  <div class="sec">Φορολογική εικόνα ${esc(String(c.year))}</div>
  <table><tbody>
    ${row('Ακαθάριστο εισόδημα ενοικίων', eur(st.grossIncome))}
    ${row('Τεκμαρτή έκπτωση δαπανών (5%)', `−${eur(st.presumptiveDeduction)}`)}
    ${row('Φορολογητέο εισόδημα', eur(st.taxableIncome), 'sub')}
    ${row(`Φόρος εισοδήματος (κλίμακα ${esc(String(c.year))})`, eur(tax))}
    ${row('Πραγματικός συντελεστής φόρου', pct(effRate))}
  </tbody></table>

  <div class="sec">Ανάλυση δαπανών ${esc(String(c.year))}</div>
  <table>
    <thead><tr><th>Κατηγορία</th><th class="n">Ποσό</th><th class="np">Ποσοστό</th></tr></thead>
    <tbody>${catRows}</tbody>
  </table>

  <div class="disc">${c.branding?.companyName ? brandName(c.branding) + ' · ' : ''}${disclaimer}<div class="colo">Σχεδιάστηκε και δημιουργήθηκε από το <b>Property OS</b></div></div>
  <script>window.onload=function(){setTimeout(function(){window.print()},350)}</script>
</div></body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Επίτρεψε τα αναδυόμενα παράθυρα για να δημιουργηθεί η αναφορά.'); return; }
  w.document.write(html);
  w.document.close();
}
