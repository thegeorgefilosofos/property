// ═══════════════════════════════════════════════════════════════════════════
// printPropertyStatement — επαγγελματική εκτυπώσιμη «Αναφορά Ακινήτου» (A4 PDF).
//
// ΑΣΠΡΟΜΑΥΡΟ, λιτό, σαν επίσημο λογιστικό έγγραφο. ΜΟΝΑΔΙΚΟ σημείο χρώματος: το
// σήμα P (λογότυπο brand). Χρήματα με δύο δεκαδικά και «€», αρνητικά με σφιχτό
// «−», ποσοστά «18,00%». Ολοκληρωμένη: ταυτότητα, απόδοση, απολογισμός,
// φορολογική εικόνα, ανάλυση δαπανών. XSS-ασφαλές (rEsc).
//
// ΤΥΠΟΓΡΑΦΙΑ, ΚΕΝΑ ΚΑΙ ΣΤΟΙΧΙΣΗ ΕΡΧΟΝΤΑΙ ΑΠΟ ΤΟ `reportPdf.ts`, όπου ζουν και
// για τα άλλα επτά έγγραφα. Το αρχείο αυτό είχε δικό του αντίγραφο του φύλλου
// στυλ και δικό του αντίγραφο της επικεφαλίδας και των μορφοποιητών — και είχαν
// αποκλίνει. Εδώ μένει μόνο ό,τι είναι πραγματικά ΑΥΤΗΣ της αναφοράς: ο πίνακας
// ταυτότητας του ακινήτου.
// ═══════════════════════════════════════════════════════════════════════════
import { type ReportBranding } from '@/lib/reportBranding';
import { incomeStatement } from '@/lib/accounting/statement';
import { rentalBracketsForYear } from '@/lib/billing/greekTax';
import { ABSENT } from '@/lib/core/format';
import { INK, INK_MUTED, PAPER_ALT } from '@/lib/print/ink';
import {
  reportHead, reportHeader, reportSection, reportRow, reportKpi, reportDisclaimer,
  openReport, rEsc, rEur, rSigned, rPct, rDate,
} from './reportPdf';

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

const s = (v: unknown) => (v == null || v === '' ? '' : String(v));

// Ο πίνακας ταυτότητας του ακινήτου — δύο ζεύγη «ετικέτα / τιμή» ανά γραμμή.
// Δεν τον έχει κανένα άλλο έγγραφο, οπότε μένει εδώ και όχι στο κοινό φύλλο.
const IDENTITY_CSS = `
  .idt{table-layout:fixed}
  .idt td{padding:7px 14px 7px 0;font-size:12px;border-bottom:1px solid ${PAPER_ALT};vertical-align:top}
  .idt .k{color:${INK_MUTED};font-size:12px;width:20%;padding-right:12px}
  .idt .v{color:${INK};font-weight:600;width:30%}
  .idt .vlast{padding-right:0}
`;

export function printPropertyStatement(c: StatementCtx): void {
  // Η ΑΝΑΦΟΡΑ ΕΙΧΕ ΕΤΟΣ ΣΤΟΝ ΤΙΤΛΟ ΚΑΙ ΚΛΙΜΑΚΑ ΑΛΛΗΣ ΧΡΟΝΙΑΣ. Δύο σειρές πιο
  // κάτω τυπώνεται «Φόρος εισοδήματος (κλίμακα {c.year})», ενώ ο υπολογισμός
  // έπαιρνε πάντα την προεπιλογή — τη νέα κλίμακα. Μια αναφορά του 2025, δηλαδή
  // αυτή που εκτυπώνεται τώρα για τη δήλωση, έβγαζε 700 € λιγότερο φόρο σε
  // 20.000 € ενοίκια και το έλεγε «κλίμακα 2025». Η κλίμακα ακολουθεί το έτος.
  const st = incomeStatement({
    regime: 'individual_longterm', grossIncome: c.annualRent,
    brackets: rentalBracketsForYear(c.year),
  });
  const tax = st.incomeTax;
  const net = c.annualRent - c.expensesYTD - tax;
  const preTax = c.annualRent - c.expensesYTD;
  const effRate = c.annualRent > 0 ? (tax / c.annualRent) * 100 : 0;
  const own = c.ownership != null && c.ownership > 0 && c.ownership <= 100 ? c.ownership : null;
  const totalCat = c.categories.reduce((sum, [, v]) => sum + v, 0);
  const cats = [...c.categories].sort((a, b) => b[1] - a[1]);
  const leaseType = c.shortTerm ? 'Βραχυχρόνια (Airbnb / Booking)' : 'Μακροχρόνια';
  const rentLabel = c.shortTerm ? 'Μηνιαίο έσοδο (εκτίμηση)' : 'Μηνιαίο ενοίκιο';

  const addr = [s(c.address), c.postalCode ? `Τ.Κ. ${s(c.postalCode)}` : ''].filter(Boolean).join(' · ');
  const info: [string, string][] = ([
    ['Διεύθυνση', addr], ['Τύπος', s(c.propType)], ['Εμβαδόν', c.sqm ? `${s(c.sqm)} τ.μ.` : ''],
    ['Υπνοδωμάτια', s(c.bedrooms)], ['Όροφος', s(c.floor)], ['Έτος κατασκευής', s(c.yearBuilt)],
    ['Ενεργειακή κλάση', s(c.energyClass)], ['ΑΤΑΚ', s(c.atak)], ['Κατάσταση', s(c.status)],
    ['Είδος μίσθωσης', leaseType], ['Ποσοστό ιδιοκτησίας', own != null ? rPct(own) : ''],
    ['Αντικειμενική αξία', c.objValue ? rEur(c.objValue) : ''],
  ] as [string, string][]).filter(([, v]) => v !== '');

  const infoRows = (() => {
    let out = '';
    for (let i = 0; i < info.length; i += 2) {
      const a = info[i], b = info[i + 1];
      out += `<tr><td class="k">${rEsc(a[0])}</td><td class="v">${rEsc(a[1])}</td>`
        + `<td class="k">${b ? rEsc(b[0]) : ''}</td><td class="v vlast">${b ? rEsc(b[1]) : ''}</td></tr>`;
    }
    return out;
  })();

  const coOwnersLine = own != null && own < 100 && c.coOwners && c.coOwners.filter(Boolean).length
    ? `<div class="note"><span class="muted">Συνιδιοκτήτες:</span> ${rEsc(c.coOwners.filter(Boolean).join(', '))}</div>` : '';

  const catRows = cats.length
    ? cats.map(([name, amt]) => `<tr><td>${rEsc(name)}</td><td class="n">${rEsc(rEur(amt))}</td><td class="np">${rEsc(rPct(totalCat > 0 ? (amt / totalCat) * 100 : 0))}</td></tr>`).join('')
      + `<tr class="result"><td>Σύνολο δαπανών</td><td class="n">${rEsc(rEur(totalCat))}</td><td class="np">${rEsc(totalCat > 0 ? rPct(100) : '')}</td></tr>`
    : `<tr><td colspan="3" class="empty">Δεν έχουν καταχωρηθεί δαπάνες για το ${rEsc(String(c.year))}.</td></tr>`;

  const subtitle = [c.propType, c.sqm ? `${c.sqm} τ.μ.` : '', leaseType, c.status].filter(Boolean).map(x => rEsc(String(x))).join(' · ');
  const ownerShare = own != null && own < 100
    ? `<div class="note"><span class="muted">Αναλογία ιδιοκτήτη (${rEsc(rPct(own))}):</span> έσοδα <strong class="tnum">${rEsc(rEur(c.annualRent * own / 100))}</strong> · καθαρό αποτέλεσμα <strong class="tnum">${rEsc(rSigned(net * own / 100))}</strong></div>` : '';
  const disclaimer = `Η παρούσα αναφορά έχει ενημερωτικό χαρακτήρα και δεν αποτελεί επίσημο φορολογικό ή λογιστικό έγγραφο. Ο εκτιμώμενος φόρος υπολογίζεται με την προοδευτική κλίμακα ενοικίων ${c.year} και την τεκμαρτή έκπτωση δαπανών 5% (μακροχρόνια μίσθωση φυσικού προσώπου)${c.shortTerm ? ', ενώ στη βραχυχρόνια προστίθενται κατά περίπτωση τέλος ανθεκτικότητας κλιματικής κρίσης και τέλος παρεπιδημούντων' : ''}. Πριν από κάθε υποβολή, επιβεβαίωσε τα ποσά με τον λογιστή σου ή την ΑΑΔΕ.`;

  const html = reportHead(`Αναφορά ακινήτου · ${c.propName}`, IDENTITY_CSS)
    + `<body><div class="page">`
    + reportHeader(c.branding, 'Αναφορά ακινήτου', {
        rightValue: rDate(), rightNote: `Περίοδος αναφοράς: ${c.year}`,
      })
    + `
  <h1>${rEsc(c.propName)}</h1>
  ${subtitle ? `<div class="sub">${subtitle}</div>` : ''}

  ${reportSection('Στοιχεία ακινήτου')}
  <table class="idt"><colgroup><col style="width:17%"><col style="width:33%"><col style="width:17%"><col style="width:33%"></colgroup>${infoRows}</table>
  ${coOwnersLine}

  ${reportSection('Σύνοψη απόδοσης')}
  <div class="kpis">
    ${reportKpi(rentLabel, rEur(c.monthlyRent))}
    ${reportKpi('Μεικτή απόδοση', rPct(c.grossYield))}
    ${reportKpi('Καθαρή απόδοση', rPct(c.netYield))}
    ${reportKpi('Αξία ακινήτου', c.propValue ? rEur(c.propValue) : ABSENT)}
  </div>

  ${reportSection(`Ετήσιος απολογισμός ${c.year}`)}
  <table><tbody>
    ${reportRow('Ακαθάριστα έσοδα (ενοίκια)', rEur(c.annualRent))}
    ${reportRow('Συνολικές δαπάνες', `−${rEur(c.expensesYTD)}`)}
    ${reportRow('Καθαρό αποτέλεσμα προ φόρου', rSigned(preTax), 'sub')}
    ${reportRow('Φόρος εισοδήματος', `−${rEur(tax)}`)}
    ${reportRow('Καθαρό αποτέλεσμα', rSigned(net), 'result')}
  </tbody></table>
  ${ownerShare}

  ${reportSection(`Φορολογική εικόνα ${c.year}`)}
  <table><tbody>
    ${reportRow('Ακαθάριστο εισόδημα ενοικίων', rEur(st.grossIncome))}
    ${reportRow('Τεκμαρτή έκπτωση δαπανών (5%)', `−${rEur(st.presumptiveDeduction)}`)}
    ${reportRow('Φορολογητέο εισόδημα', rEur(st.taxableIncome), 'sub')}
    ${reportRow(`Φόρος εισοδήματος (κλίμακα ${c.year})`, rEur(tax))}
    ${reportRow('Πραγματικός συντελεστής φόρου', rPct(effRate))}
  </tbody></table>

  ${reportSection(`Ανάλυση δαπανών ${c.year}`)}
  <table>
    <thead><tr><th>Κατηγορία</th><th class="n">Ποσό</th><th class="np">Ποσοστό</th></tr></thead>
    <tbody>${catRows}</tbody>
  </table>

  ${reportDisclaimer(disclaimer, c.branding)}
</div></body></html>`;

  openReport(html);
}
