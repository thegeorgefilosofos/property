// ═══════════════════════════════════════════════════════════════════════════
// printRentCertificate — ετήσια «Βεβαίωση Ενοικίου» (A4 PDF): επίσημη βεβαίωση
// του εκμισθωτή προς τον μισθωτή για τα καταβληθέντα μισθώματα ενός έτους.
//
// Χτισμένη πάνω στο ΚΟΙΝΟ ΑΣΠΡΟΜΑΥΡΟ σύστημα αναφορών (./reportPdf): ίδια
// τυπογραφία (Inter, tabular numerals), κενά και disclaimer με τις άλλες
// αναφορές. ΜΟΝΑΔΙΚΟ σημείο χρώματος: το σήμα/λογότυπο του brand (το χειρίζεται
// το reportHeader). Χρήματα «1.234,56 €». XSS-ασφαλές (rEsc σε κάθε δυναμικό
// κείμενο), χωρίς εξαρτήσεις.
// ═══════════════════════════════════════════════════════════════════════════
import { reportHead, reportHeader, reportSection, reportRow, reportDisclaimer, openReport, rEur, rEsc } from './reportPdf'
import type { ReportBranding } from '@/lib/reportBranding'
import { issueDocument } from '@/lib/documents/issue'
import { generateReportPdf, pEur, type PdfReportModel, type PdfSection, type PdfRow } from '@/lib/pdf/pdfReport'
import type { createClient } from '@/lib/supabase/client'
import { INK_FAINT } from '@/lib/print/ink';

export interface RentCertMonth { label: string; amount: number }
export interface RentCertificateCtx {
  year: number
  propName: string
  address?: string | null
  tenantName?: string | null
  tenantAfm?: string | null
  months: RentCertMonth[]   // μόνο οι εισπραγμένοι μήνες
  total: number
  branding?: ReportBranding | null
}

export function printRentCertificate(c: RentCertificateCtx): void {
  const title = `Βεβαίωση Ενοικίου ${c.year}`
  const docTitle = [title, c.propName].filter(Boolean).map(x => String(x)).join(' · ')
  const tenant = (c.tenantName || '').trim() || 'ο μισθωτής'
  const afmLine = (c.tenantAfm || '').trim() ? ` (ΑΦΜ ${rEsc(String(c.tenantAfm).trim())})` : ''
  const subtitle = [c.propName, c.address].filter(Boolean).map(x => rEsc(String(x))).join(' · ')

  const monthRows = c.months.length
    ? c.months.map(m => reportRow(m.label, rEur(m.amount))).join('')
    : `<tr><td colspan="2" class="empty">Δεν υπάρχουν εισπραγμένα μισθώματα για το ${rEsc(String(c.year))}.</td></tr>`
  const totalRow = reportRow(`Σύνολο ${c.year}`, rEur(c.total), 'result')

  const html = reportHead(docTitle)
    + `<body><div class="page">`
    + reportHeader(c.branding, 'Βεβαίωση Ενοικίου', { rightNote: `Περίοδος αναφοράς: ${c.year}` })
    + `<h1>${rEsc(title)}</h1>`
    + (subtitle ? `<div class="sub">${subtitle}</div>` : '')
    + `<p class="note" style="font-size:13px;line-height:1.7;margin-top:14px">`
    +   `Βεβαιώνεται ότι <strong>${rEsc(tenant)}</strong>${afmLine} κατέβαλε για τη μίσθωση του ανωτέρω ακινήτου, `
    +   `κατά το έτος ${rEsc(String(c.year))}, το συνολικό ποσό των <strong>${rEsc(rEur(c.total))}</strong>, όπως αναλύεται παρακάτω.`
    + `</p>`
    + reportSection('Ανάλυση καταβληθέντων μισθωμάτων')
    + `<table><tbody>${monthRows}${totalRow}</tbody></table>`
    + `<div style="display:flex;justify-content:space-between;margin-top:56px;gap:40px">`
    +   `<div style="flex:1;text-align:center"><div class="muted" style="border-top:1px solid ${INK_FAINT};padding-top:8px;font-size:12px">Ο εκμισθωτής</div></div>`
    +   `<div style="flex:1;text-align:center"><div class="muted" style="border-top:1px solid ${INK_FAINT};padding-top:8px;font-size:12px">Ο μισθωτής</div></div>`
    + `</div>`
    + reportDisclaimer('Η βεβαίωση συντάχθηκε με βάση τα καταχωρημένα, εισπραγμένα μισθώματα. Για τη χρήση της σε δηλώσεις/δικαστικές διαδικασίες, επιβεβαίωσε τα στοιχεία με τον λογιστή ή τον δικηγόρο σου.', c.branding)
    + `</div></body></html>`

  openReport(html)
}

type SB = ReturnType<typeof createClient>

/**
 * Επίσημο, τραπεζικού επιπέδου true-PDF της «Βεβαίωσης Ενοικίου»: αληθινό vector
 * PDF (pdfmake) με αρ. εγγράφου, QR επαλήθευσης και per-page footer. Καταχωρείται
 * στο μητρώο εγγράφων ώστε να είναι επαληθεύσιμη δημόσια στο /verify/<id>.
 * Καθρεφτίζει πιστά την εκτυπώσιμη βεβαίωση (printRentCertificate).
 */
export async function downloadOfficialRentCertificate(c: RentCertificateCtx, o: { supabase: SB; userId: string }): Promise<void> {
  const tenant = (c.tenantName || '').trim() || 'ο μισθωτής'
  const afmPart = (c.tenantAfm || '').trim() ? ` (ΑΦΜ ${String(c.tenantAfm).trim()})` : ''
  const certifyText = `Βεβαιώνεται ότι ${tenant}${afmPart} κατέβαλε για τη μίσθωση του ακινήτου, κατά το έτος ${c.year}, το συνολικό ποσό των ${pEur(c.total)}, όπως αναλύεται παρακάτω.`

  // Ανάλυση μισθωμάτων: ίδια λογική με την εκτυπώσιμη — γραμμή ανά μήνα, μήνυμα
  // κενής κατάστασης αν δεν υπάρχουν εισπραγμένα, και τελική γραμμή «Σύνολο».
  const analysisRows: PdfRow[] = c.months.length
    ? c.months.map(m => ({ label: m.label, value: pEur(m.amount) }))
    : [{ label: `Δεν υπάρχουν εισπραγμένα μισθώματα για το ${c.year}.`, value: '', kind: 'muted' as const }]
  analysisRows.push({ label: `Σύνολο ${c.year}`, value: pEur(c.total), kind: 'result' })

  const sections: PdfSection[] = [
    { type: 'note', text: certifyText },
    { type: 'rows', title: 'Ανάλυση καταβληθέντων μισθωμάτων', rows: analysisRows },
    { type: 'note', title: 'Υπογραφές', text: 'Ο εκμισθωτής  ..................................        Ο μισθωτής  ..................................' },
  ]

  const subject = [c.propName, c.address].filter(Boolean).join(' · ')

  const issued = await issueDocument(o.supabase, {
    userId: o.userId, docType: 'Βεβαίωση ενοικίου',
    subject, period: `Έτος ${c.year}`,
    summary: { total: c.total, months: c.months.length },
  })

  const model: PdfReportModel = {
    branding: c.branding, docType: 'Βεβαίωση ενοικίου', title: `Βεβαίωση ενοικίου ${c.year}`,
    subtitle: subject,
    meta: { id: issued.id, issuedAt: issued.issuedAt, verifyUrl: issued.verifyUrl, note: `Έτος ${c.year}` },
    sections,
    disclaimer: 'Η βεβαίωση συντάχθηκε με βάση τα καταχωρημένα, εισπραγμένα μισθώματα. Για τη χρήση της σε δηλώσεις/δικαστικές διαδικασίες, επιβεβαίωσε τα στοιχεία με τον λογιστή ή τον δικηγόρο σου.',
  }
  await generateReportPdf(model, `Βεβαίωση_ενοικίου_${c.propName}_${c.year}`)
}
