// ═══════════════════════════════════════════════════════════════════════════
// printPropertyStatement, επαγγελματική εκτυπώσιμη «Αναφορά Ακινήτου» (PDF/A4).
//
// Σχεδίαση: ασπρόμαυρο, λιτό, σαν επίσημο λογιστικό/κρατικό έγγραφο — χωρίς
// χρώματα ή θόρυβο φόντου. Το ΜΟΝΑΔΙΚΟ σημείο χρώματος είναι το σήμα του brand
// (λογότυπο + λεπτή γραμμή «επιστολόχαρτου»), που για συνδρομητή «Επαγγελματία»
// γίνεται αυτόματα το δικό του χρώμα. Αριθμοί με δύο δεκαδικά, δεξιά στοιχισμένοι
// (tabular). Ολοκληρωμένη: ταυτότητα ακινήτου, μίσθωση, απόδοση, φορολογική εικόνα.
// Ιδανικό για κοινοποίηση σε συνιδιοκτήτες, λογιστές, δικηγόρους, διαχειριστές.
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
  ownership?: number | null;        // ποσοστό ιδιοκτησίας (%)
  coOwners?: string[] | null;       // ονόματα συνιδιοκτητών (όταν < 100%)
  shortTerm?: boolean;              // βραχυχρόνια (Airbnb/Booking) vs μακροχρόνια
  monthlyRent: number;
  annualRent: number;
  grossYield: number;
  netYield: number;
  expensesYTD: number;
  categories: [string, number][];   // [όνομα κατηγορίας, ποσό]
  branding?: ReportBranding | null;
}

// Δύο δεκαδικά, διαχωριστικό χιλιάδων, ελληνικό κόμμα — π.χ. «1.234,50 €».
const eur = (n: number) => `${(n || 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const pct = (n: number) => `${(n || 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const eurSigned = (n: number) => (n < 0 ? `− ${eur(Math.abs(n))}` : eur(n));
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
const s = (v: unknown) => (v == null || v === '' ? '' : String(v));

export function printPropertyStatement(c: StatementCtx): void {
  const accent = reportAccent(c.branding);
  // Φορολογική εικόνα με την κανονική μηχανή (κλίμακα 2026 + τεκμαρτή έκπτωση 5%
  // επί των ενοικίων φυσικού προσώπου) — όχι flat 15%.
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

  // ── Στοιχεία ταυτότητας ακινήτου (δύο στήλες, μόνο ό,τι υπάρχει) ────────────
  const addr = [s(c.address), c.postalCode ? `Τ.Κ. ${s(c.postalCode)}` : ''].filter(Boolean).join(' · ');
  const info: [string, string][] = ([
    ['Διεύθυνση', addr],
    ['Τύπος', s(c.propType)],
    ['Εμβαδόν', c.sqm ? `${s(c.sqm)} τ.μ.` : ''],
    ['Υπνοδωμάτια', s(c.bedrooms)],
    ['Όροφος', s(c.floor)],
    ['Έτος κατασκευής', s(c.yearBuilt)],
    ['Ενεργειακή κλάση', s(c.energyClass)],
    ['ΑΤΑΚ', s(c.atak)],
    ['Κατάσταση', s(c.status)],
    ['Είδος μίσθωσης', leaseType],
    ['Ποσοστό ιδιοκτησίας', own != null ? pct(own) : ''],
    ['Αντικειμενική αξία', c.objValue ? eur(c.objValue) : ''],
  ] as [string, string][]).filter(([, v]) => v !== '');

  const infoRows = (() => {
    let out = '';
    for (let i = 0; i < info.length; i += 2) {
      const a = info[i], b = info[i + 1];
      out += `<tr>
        <td style="padding:6px 10px 6px 0;color:#6b7280;font-size:11.5px;white-space:nowrap;vertical-align:top;border-bottom:1px solid #f1f3f4;">${esc(a[0])}</td>
        <td style="padding:6px 20px 6px 0;color:#111;font-size:12px;font-weight:600;vertical-align:top;border-bottom:1px solid #f1f3f4;">${esc(a[1])}</td>
        <td style="padding:6px 10px 6px 0;color:#6b7280;font-size:11.5px;white-space:nowrap;vertical-align:top;border-bottom:1px solid #f1f3f4;">${b ? esc(b[0]) : ''}</td>
        <td style="padding:6px 0;color:#111;font-size:12px;font-weight:600;vertical-align:top;border-bottom:1px solid #f1f3f4;">${b ? esc(b[1]) : ''}</td>
      </tr>`;
    }
    return out;
  })();

  const coOwnersLine = own != null && own < 100 && c.coOwners && c.coOwners.filter(Boolean).length
    ? `<div style="margin-top:9px;font-size:11.5px;color:#374151;"><span style="color:#6b7280;">Συνιδιοκτήτες:</span> ${esc(c.coOwners.filter(Boolean).join(', '))}</div>`
    : '';

  const led = (label: string, value: string, opts: { strong?: boolean; top?: boolean } = {}) =>
    `<tr>
      <td style="padding:8px 0;${opts.top ? 'border-top:2px solid #111;' : 'border-bottom:1px solid #e5e7eb;'}color:${opts.strong ? '#111' : '#374151'};font-size:12.5px;${opts.strong ? 'font-weight:700;' : ''}">${esc(label)}</td>
      <td style="padding:8px 0;${opts.top ? 'border-top:2px solid #111;' : 'border-bottom:1px solid #e5e7eb;'}text-align:right;font-family:'Roboto Mono',monospace;font-variant-numeric:tabular-nums;font-size:${opts.strong ? 14 : 12.5}px;font-weight:${opts.strong ? 700 : 500};color:#111;white-space:nowrap;">${esc(value)}</td>
    </tr>`;

  const kpi = (label: string, value: string) =>
    `<td style="border:1px solid #d1d5db;padding:12px 14px;vertical-align:top;">
      <div style="font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:7px;">${esc(label)}</div>
      <div style="font-family:'Roboto Mono',monospace;font-variant-numeric:tabular-nums;font-size:18px;font-weight:700;color:#111;">${esc(value)}</div>
    </td>`;

  const catRows = cats.length
    ? cats.map(([name, amt]) => `
      <tr>
        <td style="padding:7px 0;border-bottom:1px solid #eef0f2;font-size:12.5px;color:#374151;">${esc(name)}</td>
        <td style="padding:7px 0;border-bottom:1px solid #eef0f2;text-align:right;font-family:'Roboto Mono',monospace;font-variant-numeric:tabular-nums;font-size:12.5px;font-weight:500;color:#111;white-space:nowrap;">${esc(eur(amt))}</td>
        <td style="padding:7px 0 7px 18px;border-bottom:1px solid #eef0f2;text-align:right;font-family:'Roboto Mono',monospace;font-variant-numeric:tabular-nums;font-size:11.5px;color:#6b7280;white-space:nowrap;">${esc(pct(totalCat > 0 ? (amt / totalCat) * 100 : 0))}</td>
      </tr>`).join('') + `
      <tr>
        <td style="padding:9px 0;border-top:2px solid #111;font-size:12.5px;color:#111;font-weight:700;">Σύνολο δαπανών</td>
        <td style="padding:9px 0;border-top:2px solid #111;text-align:right;font-family:'Roboto Mono',monospace;font-variant-numeric:tabular-nums;font-size:13px;font-weight:700;color:#111;white-space:nowrap;">${esc(eur(totalCat))}</td>
        <td style="padding:9px 0 9px 18px;border-top:2px solid #111;text-align:right;font-family:'Roboto Mono',monospace;font-size:11.5px;color:#6b7280;white-space:nowrap;">${esc(totalCat > 0 ? pct(100) : '—')}</td>
      </tr>`
    : `<tr><td colspan="3" style="color:#6b7280;font-size:12px;padding:12px 0;">Δεν έχουν καταχωρηθεί δαπάνες για το ${esc(String(c.year))}.</td></tr>`;

  const subtitle = [c.propType, c.sqm ? `${c.sqm} τ.μ.` : '', leaseType, c.status].filter(Boolean).map(x => esc(String(x))).join(' · ');

  const html = `<!doctype html><html lang="el"><head><meta charset="utf-8">
<title>Αναφορά Ακινήτου · ${esc(c.propName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',system-ui,sans-serif;color:#111;background:#fff;padding:40px;max-width:820px;margin:0 auto;font-size:12.5px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  @media print{body{padding:0}@page{margin:16mm}}
  h1{font-size:22px;font-weight:700;letter-spacing:-.01em;color:#111}
  .muted{color:#6b7280}
  .sec{font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#374151;margin:24px 0 10px;padding-bottom:7px;border-bottom:1px solid #111}
  table{width:100%;border-collapse:collapse}
</style></head>
<body>
  <div style="height:3px;background:${accent};border-radius:3px;margin-bottom:20px"></div>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:16px;">
    <div style="display:flex;align-items:center;gap:11px">
      ${brandLogoImg(c.branding, 34) || `<div style="width:34px;height:34px;border-radius:8px;background:${accent};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:17px">P</div>`}
      <div>
        <div style="font-size:15px;font-weight:700;color:#111">${brandName(c.branding)}</div>
        <div class="muted" style="font-size:11px">Αναφορά Ακινήτου</div>
        ${brandContactLine(c.branding) ? `<div class="muted" style="font-size:10px;margin-top:2px">${brandContactLine(c.branding)}</div>` : ''}
      </div>
    </div>
    <div style="text-align:right">
      <div class="muted" style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;font-weight:700">Ημερομηνία έκδοσης</div>
      <div style="font-size:13px;font-weight:600;margin-top:2px">${esc(today)}</div>
      <div class="muted" style="font-size:10px;margin-top:3px">Περίοδος αναφοράς: ${esc(String(c.year))}</div>
    </div>
  </div>

  <div style="margin:22px 0 4px">
    <h1>${esc(c.propName)}</h1>
    ${subtitle ? `<div class="muted" style="font-size:12.5px;margin-top:5px">${subtitle}</div>` : ''}
  </div>

  <div class="sec">Στοιχεία ακινήτου</div>
  <table style="table-layout:fixed"><colgroup><col style="width:17%"><col style="width:33%"><col style="width:17%"><col style="width:33%"></colgroup>${infoRows}</table>
  ${coOwnersLine}

  <div class="sec">Σύνοψη απόδοσης</div>
  <table style="table-layout:fixed"><tr>
    ${kpi(rentLabel, eur(c.monthlyRent))}
    ${kpi('Μεικτή απόδοση', pct(c.grossYield))}
    ${kpi('Καθαρή απόδοση', pct(c.netYield))}
    ${kpi('Αξία ακινήτου', c.propValue ? eur(c.propValue) : '—')}
  </tr></table>

  <div class="sec">Ετήσιος απολογισμός ${esc(String(c.year))}</div>
  <table>
    ${led('Ακαθάριστα έσοδα (ενοίκια)', eur(c.annualRent))}
    ${led('Συνολικές δαπάνες', `− ${eur(c.expensesYTD)}`)}
    ${led('Καθαρό αποτέλεσμα προ φόρου', eurSigned(preTax))}
    ${led('Φόρος εισοδήματος', `− ${eur(tax)}`)}
    ${led('Καθαρό αποτέλεσμα', eurSigned(net), { strong: true, top: true })}
  </table>
  ${own != null && own < 100 ? `<div style="margin-top:9px;font-size:11.5px;color:#374151;line-height:1.55"><span style="color:#6b7280;">Αναλογία ιδιοκτήτη (${esc(pct(own))}):</span> έσοδα <strong style="font-family:'Roboto Mono',monospace;">${esc(eur(c.annualRent * own / 100))}</strong> · καθαρό αποτέλεσμα <strong style="font-family:'Roboto Mono',monospace;">${esc(eurSigned(net * own / 100))}</strong></div>` : ''}

  <div class="sec">Φορολογική εικόνα ${esc(String(c.year))}</div>
  <table>
    ${led('Ακαθάριστο εισόδημα ενοικίων', eur(st.grossIncome))}
    ${led('Τεκμαρτή έκπτωση δαπανών (5%)', `− ${eur(st.presumptiveDeduction)}`)}
    ${led('Φορολογητέο εισόδημα', eur(st.taxableIncome))}
    ${led(`Φόρος εισοδήματος (κλίμακα ${esc(String(c.year))})`, eur(tax))}
    ${led('Πραγματικός συντελεστής φόρου', pct(effRate))}
  </table>

  <div class="sec">Ανάλυση δαπανών ${esc(String(c.year))}</div>
  <table>
    <thead><tr>
      <th style="text-align:left;padding:0 0 6px;font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;font-weight:700;border-bottom:1px solid #d1d5db;">Κατηγορία</th>
      <th style="text-align:right;padding:0 0 6px;font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;font-weight:700;border-bottom:1px solid #d1d5db;">Ποσό</th>
      <th style="text-align:right;padding:0 0 6px 18px;font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;font-weight:700;border-bottom:1px solid #d1d5db;">Ποσοστό</th>
    </tr></thead>
    <tbody>${catRows}</tbody>
  </table>

  <div style="margin-top:34px;padding-top:14px;border-top:1px solid #d1d5db;color:#6b7280;font-size:10px;line-height:1.6">
    ${c.branding?.companyName ? esc(brandName(c.branding)) + ' · ' : ''}Η παρούσα αναφορά δημιουργήθηκε αυτόματα από το Property OS και έχει ενημερωτικό χαρακτήρα. Δεν αποτελεί επίσημο φορολογικό ή λογιστικό έγγραφο. Ο εκτιμώμενος φόρος υπολογίζεται με την προοδευτική κλίμακα ενοικίων ${esc(String(c.year))} και την τεκμαρτή έκπτωση 5% (μακροχρόνια μίσθωση φυσικού προσώπου)${c.shortTerm ? '· σε βραχυχρόνια μίσθωση ενδέχεται να προκύπτουν και τέλος ανθεκτικότητας / παρεπιδημούντων' : ''}. Επιβεβαίωση με λογιστή / ΑΑΔΕ.
  </div>
  <script>window.onload=function(){setTimeout(function(){window.print()},350)}</script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Επίτρεψε τα αναδυόμενα παράθυρα για να δημιουργηθεί η αναφορά.'); return; }
  w.document.write(html);
  w.document.close();
}
