// ═══════════════════════════════════════════════════════════════════════════
// printPropertyStatement, επαγγελματική εκτυπώσιμη «Αναφορά Ακινήτου» (PDF/A4).
//
// Σχεδίαση: ασπρόμαυρο, λιτό, σαν επίσημο λογιστικό/κρατικό έγγραφο — χωρίς
// χρώματα ή θόρυβο φόντου. Αριθμοί με δύο δεκαδικά, δεξιά στοιχισμένοι (tabular),
// καθαροί πίνακες με λεπτές γραμμές. Ιδανικό για κοινοποίηση σε συνιδιοκτήτες,
// λογιστές, δικηγόρους και ομάδες διαχείρισης.
// ═══════════════════════════════════════════════════════════════════════════
import { reportAccent, brandLogoImg, brandName, brandContactLine, type ReportBranding } from '@/lib/reportBranding';
import { incomeStatement } from '@/lib/accounting/statement';

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
  branding?: ReportBranding | null;
}

// Δύο δεκαδικά, διαχωριστικό χιλιάδων, ελληνικό κόμμα — π.χ. «1.234,50 €».
const eur = (n: number) => `${(n || 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const pct = (n: number) => `${(n || 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
// Αρνητικά με τυπογραφική παύλα (−), για λογιστική εμφάνιση χωρίς χρώμα.
const eurSigned = (n: number) => (n < 0 ? `− ${eur(Math.abs(n))}` : eur(n));
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

export function printPropertyStatement(c: StatementCtx): void {
  // Το ΜΟΝΑΔΙΚΟ σημείο χρώματος: το σήμα του brand + μια λεπτή γραμμή «επιστολόχαρτου».
  // Για συνδρομητές «Επαγγελματίας» γίνεται αυτόματα το δικό τους χρώμα (reportAccent),
  // αλλιώς το μπλε του Property OS. Τα δεδομένα μένουν αυστηρά ασπρόμαυρα (επίσημο έγγραφο).
  const accent = reportAccent(c.branding);
  // Φόρος με την κανονική μηχανή (κλίμακα 2026 + τεκμαρτή έκπτωση 5%), όχι flat 15%.
  const tax = incomeStatement({ regime: 'individual_longterm', grossIncome: c.annualRent }).incomeTax;
  const net = c.annualRent - c.expensesYTD - tax;
  const today = new Date().toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' });
  const totalCat = c.categories.reduce((s, [, v]) => s + v, 0);
  const cats = [...c.categories].sort((a, b) => b[1] - a[1]);

  // Γραμμή πίνακα «λογαριασμού»: ετικέτα αριστερά, ποσό δεξιά (tabular), προαιρετικά έντονη.
  const led = (label: string, value: string, opts: { strong?: boolean; top?: boolean } = {}) =>
    `<tr>
      <td style="padding:8px 0;${opts.top ? 'border-top:2px solid #111;' : 'border-bottom:1px solid #e5e7eb;'}color:${opts.strong ? '#111' : '#374151'};font-size:12.5px;${opts.strong ? 'font-weight:700;' : ''}">${esc(label)}</td>
      <td style="padding:8px 0;${opts.top ? 'border-top:2px solid #111;' : 'border-bottom:1px solid #e5e7eb;'}text-align:right;font-family:'Roboto Mono',monospace;font-variant-numeric:tabular-nums;font-size:${opts.strong ? 14 : 12.5}px;font-weight:${opts.strong ? 700 : 500};color:#111;white-space:nowrap;">${esc(value)}</td>
    </tr>`;

  // Πλακίδιο σύνοψης (ασπρόμαυρο, λεπτό περίγραμμα).
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

  const sub = [c.propType, c.sqm ? `${c.sqm} τ.μ.` : '', c.address, c.status].filter(Boolean).map(x => esc(String(x))).join(' · ');

  const html = `<!doctype html><html lang="el"><head><meta charset="utf-8">
<title>Αναφορά Ακινήτου — ${esc(c.propName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',system-ui,sans-serif;color:#111;background:#fff;padding:40px;max-width:820px;margin:0 auto;font-size:12.5px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  @media print{body{padding:0}@page{margin:16mm}}
  h1{font-size:22px;font-weight:700;letter-spacing:-.01em;color:#111}
  .muted{color:#6b7280}
  .sec{font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#374151;margin:26px 0 10px;padding-bottom:7px;border-bottom:1px solid #111}
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
    </div>
  </div>

  <div style="margin:22px 0 6px">
    <h1>${esc(c.propName)}</h1>
    ${sub ? `<div class="muted" style="font-size:12.5px;margin-top:5px">${sub}</div>` : ''}
  </div>

  <div class="sec">Σύνοψη</div>
  <table style="table-layout:fixed"><tr>
    ${kpi('Μηνιαίο ενοίκιο', eur(c.monthlyRent))}
    ${kpi('Μεικτή απόδοση', pct(c.grossYield))}
    ${kpi('Καθαρή απόδοση', pct(c.netYield))}
    ${kpi('Αξία ακινήτου', c.propValue ? eur(c.propValue) : '—')}
  </tr></table>

  <div class="sec">Ετήσιος απολογισμός ${esc(String(c.year))}</div>
  <table>
    ${led('Ακαθάριστα έσοδα (ενοίκια)', eur(c.annualRent))}
    ${led('Συνολικές δαπάνες', `− ${eur(c.expensesYTD)}`)}
    ${led(`Εκτιμώμενος φόρος εισοδήματος (κλίμακα ${esc(String(c.year))})`, `− ${eur(tax)}`)}
    ${led('Καθαρό αποτέλεσμα', eurSigned(net), { strong: true, top: true })}
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

  <div style="margin-top:36px;padding-top:14px;border-top:1px solid #d1d5db;color:#6b7280;font-size:10px;line-height:1.6">
    ${c.branding?.companyName ? esc(brandName(c.branding)) + ' · ' : ''}Η παρούσα αναφορά δημιουργήθηκε αυτόματα από το Property OS και έχει ενημερωτικό χαρακτήρα. Δεν αποτελεί επίσημο φορολογικό ή λογιστικό έγγραφο. Ο εκτιμώμενος φόρος υπολογίζεται με την προοδευτική κλίμακα ενοικίων ${esc(String(c.year))} και την τεκμαρτή έκπτωση 5% (μακροχρόνια μίσθωση φυσικού προσώπου). Επιβεβαίωση με λογιστή / ΑΑΔΕ.
  </div>
  <script>window.onload=function(){setTimeout(function(){window.print()},350)}</script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Επίτρεψε τα αναδυόμενα παράθυρα για να δημιουργηθεί η αναφορά.'); return; }
  w.document.write(html);
  w.document.close();
}
