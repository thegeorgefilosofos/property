// ═══════════════════════════════════════════════════════════════════════════
// reportPdf — ΚΟΙΝΟ «λογιστικό» σύστημα για ΟΛΕΣ τις εκτυπώσιμες αναφορές (PDF).
//
// Ένα, ενιαίο, ΑΣΠΡΟΜΑΥΡΟ πρότυπο (Google-minimal, Inter, tabular numerals):
// ίδια τυπογραφία, κενά, ιεραρχία, στοίχιση και disclaimer παντού. ΜΟΝΑΔΙΚΟ
// σημείο χρώματος: το σήμα/λογότυπο του brand (ώστε ένας επαγγελματίας να
// βάζει τα δικά του διακριτικά). Χρήματα «1.234,56 €», αρνητικά σφιχτό «−»,
// ποσοστά «18,00%». XSS-ασφαλές (rEsc σε κάθε δυναμικό κείμενο).
// ═══════════════════════════════════════════════════════════════════════════
import { brandMarkSvg } from '@/components/BrandMark';
import { BRAND_MARK_INK } from '@/components/BrandMark';
import { reportAccent, brandLogoImg, brandName, brandContactLine, type ReportBranding } from '@/lib/reportBranding';
import { printFontFaces } from '@/lib/print/fonts';
import { notifyError } from '@/components/toastBus';
import { localDay } from '@/lib/core/time';
import { INK, INK_FAINT, INK_MUTED, PAPER, PAPER_ALT, RULE, RULE_SOFT } from '@/lib/print/ink';

export const rEsc = (v: unknown): string => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

// ── ΤΑ ΝΟΥΜΕΡΑ ΤΟΥ ΧΑΡΤΙΟΥ ΕΙΝΑΙ ΤΑ ΝΟΥΜΕΡΑ ΤΗΣ ΟΘΟΝΗΣ ────────────────────
//
// ΗΤΑΝ ΤΡΕΙΣ ΔΙΑΦΟΡΕΤΙΚΟΙ ΜΟΡΦΟΠΟΙΗΤΕΣ ΓΙΑ ΤΟ ΙΔΙΟ ΝΟΥΜΕΡΟ — `fe`/`fp` για την
// οθόνη, `rEur`/`rPct` εδώ για τις εκτυπώσεις, `pEur`/`pPct` στο `lib/pdf` για
// τα επίσημα PDF. Μετρημένα, οι δύο του χαρτιού διέφεραν από της οθόνης σε τρία
// πράγματα, και στα τρία ήταν οι ΛΑΘΟΣ:
//
//   ποσό      οθόνη «1.250,00 €» (άθραυστο κενό)  ·  χαρτί «1.250,00 €» (σπάει)
//   ποσοστό   οθόνη «12,50%»                       ·  χαρτί «12,50 %»
//   χαλασμένο οθόνη «0,00 €»                       ·  χαρτί «NaN €», «∞ €»
//
// Το άθραυστο κενό είναι ο λόγος που υπάρχει το `fe`: με κανονικό κενό, σε στενή
// στήλη πίνακα το «€» πέφτει μόνο του στην επόμενη γραμμή. Μια στήλη ποσών σε
// λογιστική κατάσταση είναι ΑΚΡΙΒΩΣ στενή στήλη πίνακα.
//
// Και το «NaN €» δεν τυπωνόταν σε πρόχειρη οθόνη: τυπωνόταν σε έγγραφο με
// αριθμό εγγράφου και κωδικό QR επαλήθευσης, που πάει σε λογιστή ή σε τράπεζα.
//
// Τα ονόματα μένουν (283 σημεία κλήσης, και «rEur» διαβάζεται σωστά μέσα σε
// συμβολοσειρά HTML) — η ΣΥΜΠΕΡΙΦΟΡΑ όμως ζει πλέον μία φορά, στο
// `lib/core/format.ts`, μαζί με τους ελέγχους της.
export { fe as rEur, fp as rPct, feSigned as rSigned } from '@/lib/core/format';

/**
 * Ημερομηνία εγγράφου, ολογράφως ο μήνας: «05 Ιουνίου 2026».
 *
 * Το `localDay` κρατά την ημερολογιακή ημέρα ΑΚΡΙΒΩΣ όπως γράφτηκε. Πριν, το
 * σκέτο `new Date('2026-01-01')` τυπωνόταν «31 Δεκεμβρίου 2025» σε κάθε ζώνη με
 * αρνητική απόκλιση — και ένα σημείο κλήσης είχε ήδη τη χειροκίνητη παράκαμψη
 * `rDate(p.paid_date + 'T00:00:00')`, που τώρα δεν χρειάζεται.
 */
export const rDate = (d?: string | Date | null): string => {
  const t = d ? localDay(d) : new Date();
  return isNaN(t.getTime()) ? '' : t.toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' });
};

// ── ΕΝΙΑΙΟ CSS — ΙΔΙΟ ΓΙΑ ΚΑΘΕ ΑΝΑΦΟΡΑ ────────────────────────────────────
//
// ΔΕΝ ΗΤΑΝ ΕΝΙΑΙΟ. Οκτώ έγγραφα περνούν από εδώ, αλλά τα δύο βαρύτερα — η
// «Αναφορά ακινήτου» (statement.ts) και η «Λογιστική αναφορά»
// (accountingReport.ts), αυτή που πάει στον λογιστή — είχαν αντιγράψει το φύλλο
// με το χέρι, δίπλα-δίπλα σε αυτό το αρχείο. Τρία αντίγραφα, και είχαν ήδη
// αποκλίνει σε πράγματα που φαίνονται στο χαρτί:
//
//   • Το σήμα της λογιστικής αναφοράς τυπωνόταν με ΣΚΟΥΡΟ ΓΚΡΙ ΓΡΑΜΜΑ ΠΑΝΩ ΣΕ
//     ΣΧΕΔΟΝ ΜΑΥΡΟ ΠΛΑΚΙΔΙΟ (`background:#111;color:#3a3a3a`), ενώ κάθε άλλο
//     έγγραφο το τυπώνει λευκό πάνω στο χρώμα του brand. Το «P» ήταν αόρατο.
//   • Οι κεφαλίδες πινάκων της δεν είχαν το `padding:0 4px 6px` — κάθονταν
//     αλλιώς πάνω από τη γραμμή απ' ό,τι σε κάθε άλλη αναφορά.
//   • Το κολοφώνιο έγραφε σκέτο «PROPERWISE» αντί για τη φράση των υπολοίπων.
//   • Η στήλη ποσοστού είχε `width:80px` στη μία και τίποτα στην άλλη.
//   • Τρεις αποχρώσεις γραμμής (#eef0f2, #d0d5dd, RULE) για δύο ρόλους.
//
// Ένας λογιστής που παίρνει τρία έγγραφα από την ΙΔΙΑ εφαρμογή τα διαβάζει ως
// τρία έγγραφα από τρεις εφαρμογές. Τώρα το φύλλο ζει μία φορά· ό,τι ανήκει
// πραγματικά σε ένα έγγραφο περνά ως `extraCss` στο `reportHead`.
export const REPORT_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',system-ui,Arial,sans-serif;color:${INK};background:${PAPER};font-size:13px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{max-width:760px;margin:0 auto;padding:40px}
  @media print{.page{padding:16mm 15mm}@page{margin:0}}
  .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid ${INK};padding-bottom:16px}
  .brand{display:flex;align-items:center;gap:11px}
  .mark{width:34px;height:34px;border-radius:8px;color:${BRAND_MARK_INK};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:17px}
  .bname{font-size:15px;font-weight:700;color:${INK}}
  .muted{color:${INK_MUTED}}
  .asof-l{font-size: 11px;letter-spacing:.06em;text-transform:uppercase;color:${INK_FAINT};font-weight:600}
  h1{font-size:22px;font-weight:700;letter-spacing:-.01em;margin:22px 0 3px}
  .sub{color:${INK_MUTED};font-size:12px;margin-bottom:6px}
  .sec{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${INK};margin:26px 0 10px;padding-bottom:6px;border-bottom:1px solid ${INK};break-after:avoid}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  .kpi{border:1px solid ${RULE};border-radius:10px;padding:13px 15px;display:flex;flex-direction:column}
  .kl{font-size: 11px;text-transform:uppercase;letter-spacing:.06em;color:${INK_FAINT};font-weight:700;line-height:1.3;min-height:2.7em;margin-bottom:6px}
  .kv{font-size:18px;font-weight:700;color:${INK};font-variant-numeric:tabular-nums;letter-spacing:-.01em;margin-top:auto}
  table{width:100%;border-collapse:collapse;break-inside:avoid}
  td{padding:8px 4px;text-align:left;font-size:13px;color:${INK_MUTED}}
  tbody tr td{border-bottom:1px solid ${RULE_SOFT}}
  td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:600;color:${INK}}
  td.np{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;color:${INK_FAINT};font-size:12px;padding-left:18px;width:80px}
  tr.sub td{font-weight:700;color:${INK};background:${PAPER_ALT}}
  tr.result td{font-weight:700;color:${INK};border-top:2px solid ${INK};border-bottom:none;padding-top:10px}
  th{font-size: 11px;text-transform:uppercase;letter-spacing:.05em;color:${INK_FAINT};font-weight:600;border-bottom:1px solid ${RULE};text-align:left;padding:0 4px 6px}
  th.n{text-align:right}th.np{text-align:right;padding-left:18px}
  td.empty{color:${INK_FAINT};font-size:12px;padding:12px 0}
  .note{margin-top:9px;font-size:12px;color:${INK_MUTED};line-height:1.55}
  .tnum{font-variant-numeric:tabular-nums}
  .disc{margin-top:32px;padding-top:12px;border-top:1px solid ${RULE};color:${INK_FAINT};font-size: 11px;line-height:1.6}
  .colo{margin-top:10px;font-size: 11px;letter-spacing:.02em;color:${INK_FAINT}}
  .colo b{font-weight:700;color:${INK_MUTED}}
`;

/**
 * `<head>` με γραμματοσειρά Inter + κοινό CSS. Το title μπαίνει ξεσκαρταρισμένο.
 *
 * ΤΟ `extraCss` ΥΠΑΡΧΕΙ ΓΙΑ ΝΑ ΜΗΝ ΞΑΝΑΓΡΑΦΤΕΙ ΤΟ ΦΥΛΛΟ. Η «Αναφορά ακινήτου»
 * και η «Λογιστική αναφορά» είχαν αντιγράψει ολόκληρο το `REPORT_CSS` με το
 * χέρι — τριάντα γραμμές η καθεμία — επειδή η καθεμία χρειαζόταν τρεις δικές
 * της κλάσεις. Τα τρία αντίγραφα απέκλιναν σιωπηλά (βλ. τη σημείωση στο
 * `REPORT_CSS`). Ό,τι είναι πραγματικά ενός εγγράφου μπαίνει εδώ, ΜΕΤΑ το κοινό
 * φύλλο· ό,τι το χρειάζονται δύο, ανεβαίνει στο κοινό.
 */
export function reportHead(title: string, extraCss = ''): string {
  return `<!doctype html><html lang="el"><head><meta charset="utf-8"><title>${rEsc(title)}</title>`
    + printFontFaces()
    + `<style>${REPORT_CSS}${extraCss}</style></head>`;
}

/** Επικεφαλίδα εγγράφου: σήμα brand (μόνο αυτό έγχρωμο) + δεξιά ημ. έκδοσης. */
export function reportHeader(branding: ReportBranding | null | undefined, reportType: string, opts: { rightLabel?: string; rightValue?: string; rightNote?: string } = {}): string {
  const accent = reportAccent(branding);
  const mark = brandLogoImg(branding, 34)
    || `<div class="mark" style="background:${accent};color:#fff">${brandMarkSvg(22, '#ffffff')}</div>`;
  const contact = brandContactLine(branding);
  const rl = opts.rightLabel ?? 'Ημερομηνία έκδοσης';
  const rv = opts.rightValue ?? rDate();
  return `<div class="top">
    <div class="brand">${mark}<div>
      <div class="bname">${brandName(branding)}</div>
      <div class="muted" style="font-size:11px">${rEsc(reportType)}</div>
      ${contact ? `<div class="muted" style="font-size: 11px;margin-top:2px">${contact}</div>` : ''}
    </div></div>
    <div style="text-align:right">
      <div class="asof-l">${rEsc(rl)}</div>
      <div style="font-size:13px;font-weight:600;margin-top:2px">${rEsc(rv)}</div>
      ${opts.rightNote ? `<div class="muted" style="font-size: 11px;margin-top:3px">${rEsc(opts.rightNote)}</div>` : ''}
    </div>
  </div>`;
}

export const reportSection = (title: string): string => `<div class="sec">${rEsc(title)}</div>`;

/** Γραμμή πίνακα label/value. cls: '' | 'sub' | 'result'. */
export const reportRow = (label: string, value: string, cls = ''): string =>
  `<tr class="${cls}"><td>${rEsc(label)}</td><td class="n">${rEsc(value)}</td></tr>`;

export const reportKpi = (label: string, value: string): string =>
  `<div class="kpi"><div class="kl">${rEsc(label)}</div><div class="kv">${rEsc(value)}</div></div>`;

export function reportDisclaimer(text: string, branding?: ReportBranding | null): string {
  return `<div class="disc">${branding?.companyName ? brandName(branding) + ' · ' : ''}${rEsc(text)}`
    + `<div class="colo">Σχεδιάστηκε και δημιουργήθηκε από το <b>PROPERWISE</b></div></div>`;
}

/** Ανοίγει παράθυρο εκτύπωσης με το πλήρες HTML (auto-print). */
export function openReport(bodyHtml: string): void {
  const w = window.open('', '_blank');
  if (!w) { notifyError('Επίτρεψε τα αναδυόμενα παράθυρα για να δημιουργηθεί η αναφορά.'); return; }
  w.document.write(bodyHtml + `<script>window.onload=function(){setTimeout(function(){window.print()},350)}</script>`);
  w.document.close();
}
