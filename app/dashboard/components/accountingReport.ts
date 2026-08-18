// ═══════════════════════════════════════════════════════════════════════════
// printAccountingReport — επαγγελματική, εκτυπώσιμη «Λογιστική Αναφορά» (A4 PDF).
//
// Σχεδίαση: ΑΣΠΡΟΜΑΥΡΟ, λιτό, σαν επίσημο λογιστικό έγγραφο — καμία διακοσμητική
// χρωματική νότα. Χρήματα πάντα με δύο δεκαδικά και σύμβολο («1.234,56 €»),
// αρνητικά με σφιχτό πρόσημο («−751,00 €»), ποσοστά «18,00%». XSS-ασφαλές (rEsc).
//
// ΤΥΠΟΓΡΑΦΙΑ, ΚΕΝΑ ΚΑΙ ΣΤΟΙΧΙΣΗ ΕΡΧΟΝΤΑΙ ΑΠΟ ΤΟ `reportPdf.ts`. Το αρχείο αυτό
// κρατούσε δικό του αντίγραφο του φύλλου στυλ, και είχε αποκλίνει: το σήμα
// τυπωνόταν σκούρο γκρι πάνω σε σχεδόν μαύρο πλακίδιο — αόρατο — ενώ κάθε άλλο
// έγγραφο το τυπώνει λευκό πάνω στο χρώμα του brand. Εδώ μένει μόνο ό,τι είναι
// πραγματικά ΑΥΤΗΣ της αναφοράς: η στήλη κατάστασης της συμφωνίας ενοικίων.
// ═══════════════════════════════════════════════════════════════════════════
import { type ReportBranding } from '@/lib/reportBranding'
import type { IncomeStatement, TaxProvision } from '@/lib/accounting/statement'
import { issueDocument } from '@/lib/documents/issue'
import { generateReportPdf, pEur, pSigned, type PdfReportModel, type PdfSection, type PdfRow } from '@/lib/pdf/pdfReport'
import type { createClient } from '@/lib/supabase/client'
import { INK, INK_MUTED } from '@/lib/print/ink';
import {
  reportHead, reportHeader, reportSection, reportKpi, reportDisclaimer,
  openReport, rEsc, rEur, rSigned, rDate,
} from './reportPdf';

export interface ReconLite { label: string; paid: number; expected: number; statusLabel: string; statusColor: string }

export interface AccountingReportCtx {
  propName: string
  address?: string
  year: number
  regimeLabel: string
  statement: IncomeStatement
  provision: TaxProvision
  reconciliation: ReconLite[]
  expectedTotal: number
  collectedTotal: number
  outstanding: number
  /**
   * Ο ΕΝΦΙΑ είναι αυτόματη εκτίμηση, όχι ποσό από εκκαθαριστικό.
   *
   * Η οθόνη το έλεγε ήδη· το ΧΑΡΤΙ δεν το έλεγε. Ο λογιστής έβλεπε γραμμή
   * «ΕΝΦΙΑ 438 €» δίπλα σε αριθμό εγγράφου και κωδικό QR επαλήθευσης, χωρίς
   * κανένα σημάδι ότι το νούμερο το έβγαλε μοντέλο από την αξία και τα
   * τετραγωνικά — και η εκτίμηση μπορεί να πέσει έξω πάνω από το διπλάσιο,
   * γιατί η κλίμακα δεικτοδοτείται από την ΑΝΤΙΚΕΙΜΕΝΙΚΗ τιμή ζώνης και εδώ
   * τροφοδοτείται με την εμπορική αξία ανά τετραγωνικό.
   */
  enfiaEstimated?: boolean
  branding?: ReportBranding | null
}

// Η στήλη κατάστασης της συμφωνίας ενοικίων και το κενό κάτω από τον υπότιτλο:
// τα μόνα δύο πράγματα αυτού του εγγράφου που δεν τα έχει κανένα άλλο. Το κενό
// υπάρχει επειδή εδώ ο υπότιτλος ακολουθείται κατευθείαν από τα πλακίδια, χωρίς
// ενδιάμεση επικεφαλίδα ενότητας που να το δίνει μόνη της.
const RECON_CSS = `
  .kpis{margin-top:24px}
  td.st,th.st{text-align:right;font-size:11px;font-weight:700;color:${INK_MUTED};white-space:nowrap}
  .recon-note{font-size:12px;color:${INK_MUTED};margin-bottom:8px}
  .recon-note strong{color:${INK};font-weight:700}
`

// Κοινό, λιτό disclaimer (ίδιο σε print & επίσημο PDF) — νομικά επαρκές, χωρίς φλυαρία.
const DISCLAIMER = 'Ενημερωτικό έγγραφο, όχι επίσημη φορολογική δήλωση. Τα ποσά είναι ενδεικτικά· επιβεβαίωσέ τα με τον λογιστή σου ή στο myAADE.'

/** Ό,τι πρέπει να διαβάσει ο λογιστής πριν πιστέψει τα νούμερα. */
const disclaimerOf = (c: AccountingReportCtx): string => c.enfiaEstimated
  ? `${DISCLAIMER} Ο ΕΝΦΙΑ είναι αυτόματη εκτίμηση από την αξία και τα τ.μ., όχι ποσό από εκκαθαριστικό.`
  : DISCLAIMER

export function printAccountingReport(c: AccountingReportCtx): void {
  // Γραμμή κατάστασης αποτελεσμάτων: κανονική / υποσύνολο (έντονο) / αποτέλεσμα
  // (λογιστική γραμμή με μαύρη άνω γραμμή). Αρνητικά με σφιχτό «−».
  const stRow = (label: string, amount: number, kind: string, negative?: boolean) => {
    const isSub = kind === 'subtotal', isRes = kind === 'result'
    const display = negative ? `−${rEur(Math.abs(amount))}` : rSigned(amount)
    const cls = isRes ? 'result' : isSub ? 'sub' : ''
    return `<tr class="${cls}"><td>${rEsc(label)}</td><td class="n">${rEsc(display)}</td></tr>`
  }

  const reconRows = c.reconciliation.length
    ? c.reconciliation.map(r => `<tr>
        <td>${rEsc(r.label)}</td>
        <td class="n">${rEsc(rEur(r.paid))} / ${rEsc(rEur(r.expected))}</td>
        <td class="st">${rEsc(r.statusLabel)}</td>
      </tr>`).join('')
    : `<tr><td colspan="3" class="empty">Δεν υπάρχουν καταχωρημένα ενοίκια για το ${rEsc(String(c.year))}.</td></tr>`

  const html = reportHead(`Λογιστική αναφορά · ${c.propName} ${c.year}`, RECON_CSS)
    + `<body><div class="page">`
    + reportHeader(c.branding, 'Λογιστική αναφορά', {
        rightValue: rDate(), rightNote: `Χρήση ${c.year}`,
      })
    + `
  <h1>${rEsc(c.propName)}</h1>
  <div class="sub">${[c.regimeLabel, `Χρήση ${c.year}`, c.address].filter(Boolean).map(x => rEsc(String(x))).join(' · ')}</div>

  <div class="kpis">
    ${reportKpi('Μεικτά έσοδα', rEur(c.statement.grossIncome))}
    ${reportKpi('Φόρος εισοδήματος', rEur(c.statement.incomeTax))}
    ${reportKpi('Καθαρό αποτέλεσμα', rSigned(c.statement.netProfit))}
    ${reportKpi('Πρόβλεψη φόρου / μήνα', rEur(c.provision.monthly))}
  </div>

  ${reportSection(`Κατάσταση αποτελεσμάτων ${c.year}`)}
  <table><tbody>${c.statement.lines.map(l => stRow(l.label, l.amount, l.kind, l.negative)).join('')}</tbody></table>

  ${reportSection('Πρόβλεψη φόρου')}
  <table><tbody>
    ${stRow('Φόρος εισοδήματος (έτους)', c.provision.incomeTax, 'row')}
    ${c.provision.propertyTaxes > 0 ? stRow('Φόροι και τέλη ακινήτου (έτους)', c.provision.propertyTaxes, 'row') : ''}
    ${stRow('Σύνολο προς πρόβλεψη', c.provision.annualTaxTotal, 'subtotal')}
    ${stRow('Ισόποσα ανά μήνα', c.provision.monthly, 'row')}
    ${stRow('Για να προλάβεις έως το τέλος του έτους (ανά μήνα)', c.provision.perRemainingMonth, 'result')}
  </tbody></table>

  ${reportSection(`Συμφωνία ενοικίων ${c.year}`)}
  <div class="recon-note">Εισπράχθηκαν <strong>${rEsc(rEur(c.collectedTotal))}</strong> από ${rEsc(rEur(c.expectedTotal))}${c.outstanding > 0 ? `. Ανείσπρακτα <strong>${rEsc(rEur(c.outstanding))}</strong>` : ''}.</div>
  <table>
    <thead><tr><th>Περίοδος</th><th class="n">Εισπράχθηκε / Αναμενόμενο</th><th class="st">Κατάσταση</th></tr></thead>
    <tbody>${reconRows}</tbody>
  </table>

  ${reportDisclaimer(disclaimerOf(c), c.branding)}
</div></body></html>`

  openReport(html)
}

type SB = ReturnType<typeof createClient>

/**
 * Επίσημο, τραπεζικού επιπέδου true-PDF της Λογιστικής Αναφοράς: αληθινό vector
 * PDF (pdfmake) με αρ. εγγράφου, QR επαλήθευσης και per-page footer. Καταχωρείται
 * στο μητρώο εγγράφων ώστε να είναι επαληθεύσιμο δημόσια στο /verify/<id>.
 */
export async function downloadOfficialAccountingReport(c: AccountingReportCtx, o: { supabase: SB; userId: string }): Promise<void> {
  const s = c.statement, p = c.provision
  const stKind = (k: string): PdfRow['kind'] => (k === 'result' ? 'result' : k === 'subtotal' ? 'sub' : 'normal')

  const sections: PdfSection[] = [
    { type: 'kpis', title: 'Σύνοψη χρήσης', items: [
      { label: 'Μεικτά έσοδα', value: pEur(s.grossIncome) },
      { label: 'Φόρος εισοδήματος', value: pEur(s.incomeTax) },
      { label: 'Καθαρό αποτέλεσμα', value: pSigned(s.netProfit) },
      { label: 'Πρόβλεψη φόρου / μήνα', value: pEur(p.monthly) },
    ] },
    { type: 'rows', title: `Κατάσταση αποτελεσμάτων ${c.year}`, rows: s.lines.map(l => ({
      label: l.label,
      value: l.negative ? pSigned(-Math.abs(l.amount)) : pSigned(l.amount),
      kind: stKind(l.kind),
    })) },
    { type: 'rows', title: 'Πρόβλεψη φόρου', rows: [
      { label: 'Φόρος εισοδήματος (έτους)', value: pEur(p.incomeTax) },
      ...(p.propertyTaxes > 0 ? [{ label: 'Φόροι και τέλη ακινήτου (έτους)', value: pEur(p.propertyTaxes) }] : []),
      { label: 'Σύνολο προς πρόβλεψη', value: pEur(p.annualTaxTotal), kind: 'sub' as const },
      { label: 'Ισόποσα ανά μήνα', value: pEur(p.monthly) },
      { label: 'Για να προλάβεις έως το τέλος του έτους (ανά μήνα)', value: pEur(p.perRemainingMonth), kind: 'result' as const },
    ] },
    { type: 'note', title: `Συμφωνία ενοικίων ${c.year}`,
      text: `Εισπράχθηκαν ${rEur(c.collectedTotal)} από ${rEur(c.expectedTotal)}${c.outstanding > 0 ? `. Ανείσπρακτα ${rEur(c.outstanding)}` : ''}.` },
  ]
  if (c.reconciliation.length) {
    sections.push({ type: 'table', head: ['Περίοδος', 'Εισπράχθηκε / Αναμενόμενο', 'Κατάσταση'], align: ['l', 'r', 'r'],
      rows: c.reconciliation.map(r => [r.label, `${rEur(r.paid)} / ${rEur(r.expected)}`, r.statusLabel]) })
  }

  const issued = await issueDocument(o.supabase, {
    userId: o.userId, docType: 'Λογιστική αναφορά',
    // Ιδιος λόγος με το rentCertificate: το «αντικείμενο» είναι δημόσιο μέσω
    // της σελίδας επαλήθευσης, οπότε δεν κουβαλά τη διεύθυνση του ακινήτου.
    subject: c.propName,
    period: `Χρήση ${c.year}`,
    summary: { grossIncome: s.grossIncome, incomeTax: s.incomeTax, netProfit: s.netProfit, monthlyProvision: p.monthly, collected: c.collectedTotal, expected: c.expectedTotal },
  })

  const model: PdfReportModel = {
    branding: c.branding, docType: 'Λογιστική αναφορά', title: c.propName,
    subtitle: [c.regimeLabel, `Χρήση ${c.year}`, c.address].filter(Boolean).join(' · '),
    meta: { id: issued.id, issuedAt: issued.issuedAt, verifyUrl: issued.verifyUrl, note: `Χρήση ${c.year}` },
    sections, disclaimer: disclaimerOf(c),
  }
  await generateReportPdf(model, `Λογιστική_αναφορά_${c.propName}_${c.year}`)
}
