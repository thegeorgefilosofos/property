// ═══════════════════════════════════════════════════════════════════════════
// reportPdf — ΚΟΙΝΟ «λογιστικό» σύστημα για ΟΛΕΣ τις εκτυπώσιμες αναφορές (PDF).
//
// Ένα, ενιαίο, ΑΣΠΡΟΜΑΥΡΟ πρότυπο (Google-minimal, Inter, tabular numerals):
// ίδια τυπογραφία, κενά, ιεραρχία, στοίχιση και disclaimer παντού. ΜΟΝΑΔΙΚΟ
// σημείο χρώματος: το σήμα/λογότυπο του brand (ώστε ένας επαγγελματίας να
// βάζει τα δικά του διακριτικά). Χρήματα «1.234,56 €», αρνητικά σφιχτό «−»,
// ποσοστά «18,00%». XSS-ασφαλές (rEsc σε κάθε δυναμικό κείμενο).
// ═══════════════════════════════════════════════════════════════════════════
import { reportAccent, brandLogoImg, brandName, brandContactLine, type ReportBranding } from '@/lib/reportBranding';
import { printFontFaces } from '@/lib/print/fonts';
import { notifyError } from '@/components/toastBus';

export const rEsc = (v: unknown): string => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
export const rEur = (n: number | null | undefined): string => `${(n ?? 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
export const rSigned = (n: number | null | undefined): string => ((n ?? 0) < 0 ? `−${rEur(Math.abs(n ?? 0))}` : rEur(n ?? 0));
export const rPct = (n: number | null | undefined): string => `${(n ?? 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
export const rDate = (d?: string | Date | null): string => { const t = d ? new Date(d) : new Date(); return isNaN(t.getTime()) ? '' : t.toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' }); };

// Ενιαίο CSS — ίδιο για κάθε αναφορά.
export const REPORT_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',system-ui,Arial,sans-serif;color:#111;background:#fff;font-size:12.5px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{max-width:760px;margin:0 auto;padding:40px}
  @media print{.page{padding:16mm 15mm}@page{margin:0}}
  .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:16px}
  .brand{display:flex;align-items:center;gap:11px}
  .mark{width:34px;height:34px;border-radius:8px;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:17px}
  .bname{font-size:15px;font-weight:700;color:#111}
  .muted{color:#6b7280}
  .asof-l{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#8a8f98;font-weight:600}
  h1{font-size:22px;font-weight:700;letter-spacing:-.01em;margin:22px 0 3px}
  .sub{color:#6b7280;font-size:12px;margin-bottom:6px}
  .sec{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#111;margin:26px 0 10px;padding-bottom:6px;border-bottom:1px solid #111;break-after:avoid}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  .kpi{border:1px solid #e5e7eb;border-radius:10px;padding:13px 15px;display:flex;flex-direction:column}
  .kl{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#8a8f98;font-weight:700;line-height:1.3;min-height:2.7em;margin-bottom:6px}
  .kv{font-size:18px;font-weight:700;color:#111;font-variant-numeric:tabular-nums;letter-spacing:-.01em;margin-top:auto}
  table{width:100%;border-collapse:collapse;break-inside:avoid}
  td{padding:8px 4px;text-align:left;font-size:12.5px;color:#374151}
  tbody tr td{border-bottom:1px solid #eef0f2}
  td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:600;color:#111}
  td.np{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;color:#8a8f98;font-size:11.5px;padding-left:18px}
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
`;

/** <head> με γραμματοσειρά Inter + κοινό CSS. Το title μπαίνει ξεσκαρταρισμένο. */
export function reportHead(title: string): string {
  return `<!doctype html><html lang="el"><head><meta charset="utf-8"><title>${rEsc(title)}</title>`
    + printFontFaces()
    + `<style>${REPORT_CSS}</style></head>`;
}

/** Επικεφαλίδα εγγράφου: σήμα brand (μόνο αυτό έγχρωμο) + δεξιά ημ. έκδοσης. */
export function reportHeader(branding: ReportBranding | null | undefined, reportType: string, opts: { rightLabel?: string; rightValue?: string; rightNote?: string } = {}): string {
  const accent = reportAccent(branding);
  const mark = brandLogoImg(branding, 34) || `<div class="mark" style="background:${accent}">P</div>`;
  const contact = brandContactLine(branding);
  const rl = opts.rightLabel ?? 'Ημερομηνία έκδοσης';
  const rv = opts.rightValue ?? rDate();
  return `<div class="top">
    <div class="brand">${mark}<div>
      <div class="bname">${brandName(branding)}</div>
      <div class="muted" style="font-size:11px">${rEsc(reportType)}</div>
      ${contact ? `<div class="muted" style="font-size:10px;margin-top:2px">${contact}</div>` : ''}
    </div></div>
    <div style="text-align:right">
      <div class="asof-l">${rEsc(rl)}</div>
      <div style="font-size:13px;font-weight:600;margin-top:2px">${rEsc(rv)}</div>
      ${opts.rightNote ? `<div class="muted" style="font-size:10px;margin-top:3px">${rEsc(opts.rightNote)}</div>` : ''}
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
    + `<div class="colo">Σχεδιάστηκε και δημιουργήθηκε από το <b>Property OS</b></div></div>`;
}

/** Ανοίγει παράθυρο εκτύπωσης με το πλήρες HTML (auto-print). */
export function openReport(bodyHtml: string): void {
  const w = window.open('', '_blank');
  if (!w) { notifyError('Επίτρεψε τα αναδυόμενα παράθυρα για να δημιουργηθεί η αναφορά.'); return; }
  w.document.write(bodyHtml + `<script>window.onload=function(){setTimeout(function(){window.print()},350)}</script>`);
  w.document.close();
}
