// ═══════════════════════════════════════════════════════════════════════════
// pdfReport — ΠΡΑΓΜΑΤΙΚΟ (server/client-generated) PDF για επίσημα, τραπεζικού
// επιπέδου έγγραφα. Σε αντίθεση με το reportPdf.ts (που ανοίγει window.print),
// εδώ παράγεται αληθινό vector PDF μέσω pdfmake: εγγυημένη σελιδοποίηση,
// ενσωματωμένη γραμματοσειρά (Roboto — πλήρη ελληνικά + €), per-page footer με
// αρ. εγγράφου, ημ/ώρα έκδοσης, «Σελίδα X / Y», σημείωση γνησιότητας και QR
// επαλήθευσης. Ίδια ασπρόμαυρη, λιτή γλώσσα σχεδίασης με τα υπόλοιπα έγγραφα·
// ΜΟΝΑΔΙΚΟ έγχρωμο στοιχείο το σήμα του brand.
//
// Ο builder (buildDocDefinition) είναι ΚΑΘΑΡΟΣ — δεν αγγίζει window/pdfmake —
// ώστε να ελέγχεται και σε Node. Η generateReportPdf φορτώνει pdfmake δυναμικά
// στον browser και κατεβάζει το αρχείο.
// ═══════════════════════════════════════════════════════════════════════════
import { reportAccent, type ReportBranding } from '@/lib/reportBranding';

// ── Μορφοποίηση (ελληνικό κόμμα, 2 δεκαδικά, σφιχτό «−») ──────────────────────
export const pEur = (n: number | null | undefined): string =>
  `${(n ?? 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
export const pSigned = (n: number | null | undefined): string =>
  ((n ?? 0) < 0 ? `−${pEur(Math.abs(n ?? 0))}` : pEur(n ?? 0));
export const pPct = (n: number | null | undefined): string =>
  `${(n ?? 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
export const pDate = (d?: string | Date | null): string => {
  const t = d ? new Date(d) : new Date();
  return isNaN(t.getTime()) ? '' : t.toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' });
};
export const pDateTime = (d?: string | Date | null): string => {
  const t = d ? new Date(d) : new Date();
  return isNaN(t.getTime()) ? '' : t.toLocaleString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// ── Μοντέλο εγγράφου (ό,τι περνούν οι αναφορές) ──────────────────────────────
export type PdfRow = { label: string; value: string; kind?: 'normal' | 'sub' | 'result' | 'muted'; note?: string };
export type PdfChartPoint = { label: string; value: number };
export type PdfSection =
  | { type: 'rows'; title?: string; rows: PdfRow[] }
  | { type: 'kpis'; title?: string; items: { label: string; value: string }[] }
  | { type: 'table'; title?: string; head: string[]; align?: ('l' | 'r')[]; rows: string[][]; result?: string[] }
  | { type: 'chart'; title?: string; chart: 'bars' | 'line'; data: PdfChartPoint[]; unit?: 'eur' | 'pct' | 'num' }
  | { type: 'sign'; title?: string; signers: { role: string; name?: string; image?: string; place?: string; date?: string }[] }
  | { type: 'note'; title?: string; text: string };

export interface PdfDocMeta {
  id: string;                // αρ. εγγράφου, π.χ. PO-260721-4F7A2K
  issuedAt: string;          // ISO timestamp
  verifyUrl: string;         // δημόσιο URL επαλήθευσης
  asOfLabel?: string;        // default «Ημερομηνία έκδοσης»
  asOfValue?: string;        // default = pDate(issuedAt)
  note?: string;             // π.χ. «Χρήση 2025» / «Περίοδος αναφοράς»
}

export interface PdfReportModel {
  branding?: ReportBranding | null;
  docType: string;           // «Λογιστική αναφορά»
  title: string;             // «Λογιστική αναφορά ακινήτου»
  subtitle?: string;
  meta: PdfDocMeta;
  sections: PdfSection[];
  disclaimer?: string;
}

// ── Παλέτα (ασπρόμαυρο· accent μόνο στο σήμα) ─────────────────────────────────
const INK = '#111111';
const MUTE = '#6b7280';
const FAINT = '#9aa0a6';
const HAIR = '#eef0f2';
const RULE = '#111111';
const HEADRULE = '#d0d5dd';

const brandDisplayName = (b?: ReportBranding | null) => (b?.companyName?.trim() || 'Property OS');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any;

// Επικεφαλίδα ενότητας: κεφαλαία + λεπτή μαύρη γραμμή από κάτω.
function sectionTitle(title: string): Node[] {
  return [
    { text: title.toUpperCase(), bold: true, fontSize: 9, characterSpacing: 0.6, color: INK, margin: [0, 18, 0, 0] },
    { canvas: [{ type: 'line', x1: 0, y1: 3, x2: 515, y2: 3, lineWidth: 1, lineColor: RULE }], margin: [0, 3, 0, 8] },
  ];
}

// Πίνακας label/value (χωρίς κατακόρυφα πλαίσια, hairline ανά γραμμή).
function rowsTable(rows: PdfRow[]): Node {
  const body = rows.map(r => {
    const isSub = r.kind === 'sub', isRes = r.kind === 'result';
    const labelCell: Node = {
      text: r.note ? [{ text: r.label }, { text: '  ' + r.note, color: FAINT, fontSize: 9 }] : r.label,
      bold: isSub || isRes, color: isRes || isSub ? INK : '#374151', border: [false, false, false, true],
      borderColor: [HAIR, HAIR, HAIR, isRes ? RULE : HAIR], margin: [0, 4, 0, 4],
      fillColor: isSub ? '#fafafa' : undefined,
    };
    const valueCell: Node = {
      text: r.value, alignment: 'right', bold: isSub || isRes || r.kind !== 'muted',
      color: r.kind === 'muted' ? FAINT : INK, border: [false, false, false, true],
      borderColor: [HAIR, HAIR, HAIR, isRes ? RULE : HAIR], margin: [0, 4, 0, 4],
      fillColor: isSub ? '#fafafa' : undefined,
    };
    return [labelCell, valueCell];
  });
  return {
    table: { widths: ['*', 'auto'], body },
    layout: {
      defaultBorder: false,
      hLineWidth: (i: number, node: Node) => {
        // έντονη μαύρη γραμμή πάνω από «result»
        return 0.7;
      },
      hLineColor: () => HAIR,
      paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
    },
    margin: [0, 0, 0, 0],
  };
}

// Κάρτες KPI: ισοϋψείς, τιμές σε κοινή βάση, λεπτό γκρι πλαίσιο.
function kpisRow(items: { label: string; value: string }[]): Node {
  const cells = items.map(it => ({
    stack: [
      { text: it.label.toUpperCase(), fontSize: 7.5, characterSpacing: 0.4, color: FAINT, bold: true, lineHeight: 1.15 },
      { text: it.value, fontSize: 14, bold: true, color: INK, margin: [0, 6, 0, 0] },
    ],
    margin: [10, 9, 10, 9],
  }));
  return {
    table: { widths: items.map(() => '*'), body: [cells] },
    layout: {
      hLineWidth: () => 0.8, vLineWidth: () => 0.8, hLineColor: () => '#e5e7eb', vLineColor: () => '#e5e7eb',
      paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
    },
    margin: [0, 2, 0, 0],
  };
}

// Πίνακας πολλών στηλών με επικεφαλίδες.
function headedTable(head: string[], rows: string[][], align?: ('l' | 'r')[], result?: string[]): Node {
  const al = (i: number) => (align?.[i] === 'r' ? 'right' : 'left');
  const headRow = head.map((h, i) => ({
    text: h.toUpperCase(), fontSize: 8, bold: true, color: FAINT, alignment: al(i),
    border: [false, false, false, true], borderColor: [HEADRULE, HEADRULE, HEADRULE, HEADRULE], margin: [0, 0, 0, 6],
  }));
  const bodyRows = rows.map(r => r.map((c, i) => ({
    text: c, fontSize: 10.5, alignment: al(i), color: al(i) === 'right' ? INK : '#374151', bold: al(i) === 'right',
    border: [false, false, false, true], borderColor: [HAIR, HAIR, HAIR, HAIR], margin: [0, 4, 0, 4],
  })));
  const body = [headRow, ...bodyRows];
  if (result) {
    body.push(result.map((c, i) => ({
      text: c, fontSize: 10.5, alignment: al(i), color: INK, bold: true,
      border: [false, true, false, false], borderColor: [RULE, RULE, RULE, RULE], margin: [0, 7, 0, 2],
    })));
  }
  return {
    table: { widths: head.map((_, i) => (i === 0 ? '*' : 'auto')), body },
    layout: { defaultBorder: false, hLineWidth: () => 0.7, hLineColor: () => HAIR, paddingLeft: () => 0, paddingRight: (i: number) => (i === head.length - 1 ? 0 : 14), paddingTop: () => 0, paddingBottom: () => 0 },
  };
}

// Συμπαγής ετικέτα τιμής για γραφήματα (μικρός χώρος): 1.2k, 45%, 320.
function chartLabel(v: number, unit?: 'eur' | 'pct' | 'num'): string {
  if (unit === 'pct') return `${(v ?? 0).toLocaleString('el-GR', { maximumFractionDigits: 1 })} %`;
  const a = Math.abs(v);
  const s = a >= 1000 ? `${(v / 1000).toLocaleString('el-GR', { maximumFractionDigits: 1 })}k` : `${Math.round(v).toLocaleString('el-GR')}`;
  return unit === 'eur' ? `${s} €` : s;
}

// Ασπρόμαυρο διάγραμμα ράβδων (vector): μαύρη ράβδος σε ανοιχτόγκρι διαδρομή, με
// τιμή πάνω και ετικέτα κάτω από κάθε ράβδο. Ισοϋψές, καθαρό, χωρίς χρώμα.
function barsChart(data: PdfChartPoint[], unit?: 'eur' | 'pct' | 'num'): Node {
  const n = Math.max(1, data.length);
  const H = 92;
  const colW = Math.max(16, Math.floor(511 / n));
  const barW = Math.max(6, colW - 8);
  const barX = Math.floor((colW - barW) / 2);
  const max = Math.max(1, ...data.map(d => Math.abs(d.value || 0)));
  const cols = data.map(d => {
    const bh = Math.max(1, Math.round((Math.abs(d.value || 0) / max) * H));
    return {
      width: colW,
      stack: [
        { text: chartLabel(d.value || 0, unit), fontSize: 6.5, alignment: 'center', color: MUTE, margin: [0, 0, 0, 3] },
        { canvas: [
          { type: 'rect', x: barX, y: 0, w: barW, h: H, color: '#f3f4f6' },
          { type: 'rect', x: barX, y: H - bh, w: barW, h: bh, color: INK },
        ] },
        { text: d.label, fontSize: 6.5, alignment: 'center', color: FAINT, margin: [0, 4, 0, 0] },
      ],
    };
  });
  return { columns: cols, columnGap: 0, margin: [0, 4, 0, 2] };
}

// Ασπρόμαυρη γραμμή τάσης (sparkline, vector): πολυγραμμή + κουκκίδες σε βάση.
function lineChart(data: PdfChartPoint[], unit?: 'eur' | 'pct' | 'num'): Node {
  const n = data.length;
  if (n < 2) return barsChart(data, unit);
  const W = 511, H = 72;
  const vals = data.map(d => d.value || 0);
  const max = Math.max(...vals), min = Math.min(...vals, 0);
  const range = (max - min) || 1;
  const pts = data.map((d, i) => ({ x: Math.round((i / (n - 1)) * W), y: Math.round(H - ((( d.value || 0) - min) / range) * H) }));
  return {
    stack: [
      { canvas: [
        { type: 'line', x1: 0, y1: H, x2: W, y2: H, lineColor: '#e5e7eb', lineWidth: 0.5 },
        { type: 'polyline', lineColor: INK, lineWidth: 1.2, closePath: false, points: pts },
        ...pts.map(p => ({ type: 'ellipse', x: p.x, y: p.y, r1: 1.5, r2: 1.5, color: INK })),
      ] },
      { columns: [
        { text: `${data[0].label} · ${chartLabel(min, unit)}`, fontSize: 6.5, color: FAINT },
        { text: `${data[n - 1].label} · ${chartLabel(max, unit)}`, fontSize: 6.5, color: FAINT, alignment: 'right' },
      ], margin: [0, 4, 0, 0] },
    ],
    margin: [0, 4, 0, 2],
  };
}

// Μπλοκ υπογραφής(ών): ρόλος (κεφαλαία) + ενσωματωμένη υπογραφή (data:image) ή
// κενός χώρος, γραμμή, όνομα, τόπος/ημερομηνία. Για νομικά έγγραφα (e-signature).
function signNode(signers: { role: string; name?: string; image?: string; place?: string; date?: string }[]): Node {
  const cells = signers.map(s => ({
    width: '*',
    stack: [
      { text: s.role.toUpperCase(), fontSize: 8, bold: true, color: FAINT, characterSpacing: 0.5, margin: [0, 0, 0, 6] },
      (s.image && /^data:image\//.test(s.image))
        ? { image: s.image, fit: [150, 52], margin: [0, 0, 0, 2] }
        : { text: ' ', margin: [0, 0, 0, 42] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 165, y2: 0, lineWidth: 0.7, lineColor: RULE }] },
      { text: s.name || '', fontSize: 10, bold: true, color: INK, margin: [0, 4, 0, 0] },
      ...((s.place || s.date) ? [{ text: [s.place, s.date].filter(Boolean).join(', '), fontSize: 8.5, color: MUTE, margin: [0, 1, 0, 0] }] : []),
    ],
    margin: [0, 8, 22, 0],
  }));
  return { columns: cells, columnGap: 0 };
}

/** Καθαρός builder → pdfmake docDefinition. Ελέγξιμος και σε Node. */
export function buildDocDefinition(model: PdfReportModel): Node {
  const accent = reportAccent(model.branding);
  const name = brandDisplayName(model.branding);
  const contact = [model.branding?.phone?.trim(), model.branding?.email?.trim()].filter(Boolean).join(' · ');
  const asOfLabel = model.meta.asOfLabel ?? 'Ημερομηνία έκδοσης';
  const asOfValue = model.meta.asOfValue ?? pDate(model.meta.issuedAt);

  // Σήμα: λογότυπο (dataURL) ή έγχρωμο τετράγωνο με «P».
  const logo = model.branding?.logoUrl && /^data:image\//.test(model.branding.logoUrl) ? model.branding.logoUrl : '';
  const mark: Node = logo
    ? { image: logo, fit: [34, 34], width: 34 }
    : { table: { widths: [34], heights: [26], body: [[{ text: 'P', color: '#fff', bold: true, fontSize: 17, alignment: 'center', fillColor: accent, margin: [0, 4, 0, 0] }]] }, layout: 'noBorders' };

  const brandBlock: Node = {
    columns: [
      { width: 34, stack: [mark] },
      {
        width: '*', margin: [11, 0, 0, 0], stack: [
          { text: name, bold: true, fontSize: 13, color: INK },
          { text: model.docType, color: MUTE, fontSize: 10, margin: [0, 1, 0, 0] },
          ...(contact ? [{ text: contact, color: MUTE, fontSize: 9, margin: [0, 1, 0, 0] }] : []),
        ],
      },
    ],
  };

  const metaBlock: Node = {
    width: 'auto', alignment: 'right', stack: [
      { text: asOfLabel.toUpperCase(), fontSize: 7.5, characterSpacing: 0.5, color: FAINT, bold: true },
      { text: asOfValue, fontSize: 12, bold: true, color: INK, margin: [0, 2, 0, 0] },
      { text: 'Αρ. εγγράφου ' + model.meta.id, fontSize: 8.5, color: MUTE, margin: [0, 3, 0, 0] },
      ...(model.meta.note ? [{ text: model.meta.note, fontSize: 9, color: MUTE, margin: [0, 2, 0, 0] }] : []),
    ],
  };

  // Κενή διεύθυνση σημαίνει ότι το έγγραφο δεν μπήκε στο μητρώο. Τότε δεν
  // τυπώνεται ούτε κωδικός QR ούτε υπόσχεση επαλήθευσης: το χαρτί λέει μόνο
  // όσα μπορεί να στηρίξει.
  const qrBlock: Node = model.meta.verifyUrl ? {
    width: 58, alignment: 'right', stack: [
      { qr: model.meta.verifyUrl, fit: 52, foreground: INK, eccLevel: 'M' },
      { text: 'Επαλήθευση', fontSize: 6.5, color: FAINT, alignment: 'center', margin: [0, 3, 0, 0] },
    ],
  } : { width: 0, text: '' };

  const header: Node[] = [
    { columns: [brandBlock, metaBlock, qrBlock], columnGap: 16 },
    { canvas: [{ type: 'line', x1: 0, y1: 6, x2: 515, y2: 6, lineWidth: 2, lineColor: RULE }], margin: [0, 8, 0, 0] },
    { text: model.title, fontSize: 20, bold: true, color: INK, margin: [0, 16, 0, 2] },
    ...(model.subtitle ? [{ text: model.subtitle, color: MUTE, fontSize: 11, margin: [0, 0, 0, 2] }] : []),
  ];

  const content: Node[] = [...header];
  for (const s of model.sections) {
    if (s.title) content.push(...sectionTitle(s.title));
    if (s.type === 'rows') content.push(rowsTable(s.rows));
    else if (s.type === 'kpis') content.push(kpisRow(s.items));
    else if (s.type === 'table') content.push(headedTable(s.head, s.rows, s.align, s.result));
    else if (s.type === 'chart') content.push(s.chart === 'line' ? lineChart(s.data, s.unit) : barsChart(s.data, s.unit));
    else if (s.type === 'sign') content.push(signNode(s.signers));
    else if (s.type === 'note') content.push({ text: s.text, fontSize: 10.5, color: '#374151', lineHeight: 1.35, margin: [0, 2, 0, 0] });
  }

  if (model.disclaimer) {
    content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.7, lineColor: '#e5e7eb' }], margin: [0, 22, 0, 8] });
    content.push({ text: (model.branding?.companyName ? name + ' · ' : '') + model.disclaimer, fontSize: 8.5, color: FAINT, lineHeight: 1.45 });
  }
  // Το brand & η γνησιότητα μπαίνουν στο per-page footer — καμία επανάληψη colophon εδώ (πιο λιτό).

  const issuedStr = pDateTime(model.meta.issuedAt);
  return {
    pageSize: 'A4',
    pageMargins: [40, 44, 40, 62],
    info: { title: `${model.title} — ${name}`, author: name, creator: 'Property OS', subject: model.docType },
    content,
    defaultStyle: { font: 'Roboto', fontSize: 10.5, color: INK, lineHeight: 1.25 },
    footer: (currentPage: number, pageCount: number): Node => ({
      margin: [40, 8, 40, 0],
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#e5e7eb' }] },
        {
          columns: [
            { text: `Property OS · Αρ. εγγράφου ${model.meta.id} · Εκδόθηκε ${issuedStr}`, fontSize: 7.5, color: FAINT },
            { text: `Σελίδα ${currentPage} / ${pageCount}`, alignment: 'right', fontSize: 7.5, color: FAINT },
          ], margin: [0, 6, 0, 0],
        },
        ...(model.meta.verifyUrl
          ? [{ text: `Γνήσιο και επαληθεύσιμο έγγραφο: ${model.meta.verifyUrl}`, fontSize: 7, color: '#b6bcc4', margin: [0, 2, 0, 0] }]
          : []),
      ],
    }),
  };
}

async function loadPdfMake(): Promise<Node> {
  const pdfMakeMod: Node = await import('pdfmake/build/pdfmake');
  const vfsMod: Node = await import('pdfmake/build/vfs_fonts');
  const pdfMake: Node = pdfMakeMod.default || pdfMakeMod;
  pdfMake.vfs = vfsMod.vfs || (vfsMod.default && (vfsMod.default.vfs || vfsMod.default)) || (vfsMod.pdfMake && vfsMod.pdfMake.vfs);
  return pdfMake;
}

/** Client-side: φορτώνει pdfmake δυναμικά και κατεβάζει το αρχείο. */
export async function generateReportPdf(model: PdfReportModel, filename: string): Promise<void> {
  const pdfMake = await loadPdfMake();
  const safe = filename.replace(/\.pdf$/i, '') + '.pdf';
  pdfMake.createPdf(buildDocDefinition(model)).download(safe);
}

/** Ίδιο PDF, αλλά ως Blob — για αρχειοθέτηση στα έγγραφα του ακινήτου. */
export async function reportPdfBlob(model: PdfReportModel): Promise<Blob> {
  const pdfMake = await loadPdfMake();
  return new Promise<Blob>((resolve, reject) => {
    try { pdfMake.createPdf(buildDocDefinition(model)).getBlob((b: Blob) => resolve(b)); }
    catch (e) { reject(e instanceof Error ? e : new Error('pdf')); }
  });
}
