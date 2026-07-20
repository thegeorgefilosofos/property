// ═══════════════════════════════════════════════════════════════════════════
// printAccountingReport — επαγγελματική, εκτυπώσιμη «Λογιστική Αναφορά» (A4 PDF).
//
// Σχεδίαση: ΑΣΠΡΟΜΑΥΡΟ, λιτό, σαν επίσημο λογιστικό έγγραφο — καμία διακοσμητική
// χρωματική νότα. Χρήματα πάντα με δύο δεκαδικά και σύμβολο («1.234,56 €»),
// αρνητικά με σφιχτό πρόσημο («−751,00 €»), ποσοστά «18,00%». Ενιαία
// τυπογραφία/κενά/στοίχιση με την «Αναφορά απόδοσης». XSS-ασφαλές (esc).
// ═══════════════════════════════════════════════════════════════════════════
import { brandLogoImg, brandName, brandContactLine, type ReportBranding } from '@/lib/reportBranding'
import type { IncomeStatement, TaxProvision } from '@/lib/accounting/statement'

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
  branding?: ReportBranding | null
}

// Χρήματα: δύο δεκαδικά + «€» (ελληνικό κόμμα). Αρνητικά με σφιχτό «−» (χωρίς κενό).
const eur = (n: number) => `${(n || 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const signed = (n: number) => (n < 0 ? `−${eur(Math.abs(n))}` : eur(n))
const pct = (n: number) => `${(n || 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
const esc = (str: string) => String(str).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch))

export function printAccountingReport(c: AccountingReportCtx): void {
  const today = new Date().toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' })

  // Γραμμή κατάστασης αποτελεσμάτων: κανονική / υποσύνολο (έντονο) / αποτέλεσμα
  // (λογιστική γραμμή με μαύρη άνω γραμμή). Αρνητικά με σφιχτό «−».
  const stRow = (label: string, amount: number, kind: string, negative?: boolean) => {
    const isSub = kind === 'subtotal', isRes = kind === 'result'
    const display = negative ? `−${eur(Math.abs(amount))}` : signed(amount)
    const cls = isRes ? 'result' : isSub ? 'sub' : ''
    return `<tr class="${cls}"><td>${esc(label)}</td><td class="n">${esc(display)}</td></tr>`
  }

  const kpi = (label: string, value: string) =>
    `<div class="kpi"><div class="kl">${esc(label)}</div><div class="kv">${esc(value)}</div></div>`

  const reconRows = c.reconciliation.length
    ? c.reconciliation.map(r => `<tr>
        <td>${esc(r.label)}</td>
        <td class="n">${esc(eur(r.paid))} / ${esc(eur(r.expected))}</td>
        <td class="st">${esc(r.statusLabel)}</td>
      </tr>`).join('')
    : `<tr><td colspan="3" class="empty">Δεν υπάρχουν καταχωρημένα ενοίκια για το ${esc(String(c.year))}.</td></tr>`

  const brandMark = brandLogoImg(c.branding, 34) || `<div class="mark">P</div>`
  const contact = brandContactLine(c.branding)

  const disclaimer = `Η παρούσα αναφορά δημιουργήθηκε από το Property OS και έχει ενημερωτικό χαρακτήρα. Δεν αποτελεί επίσημο φορολογικό ή λογιστικό έγγραφο. Ο φόρος υπολογίζεται με την προοδευτική κλίμακα ενοικίων ${c.year} και την ισχύουσα φορολογική μεταχείριση: στη μακροχρόνια μίσθωση εφαρμόζεται τεκμαρτή έκπτωση δαπανών 5%, ενώ στη βραχυχρόνια ο φόρος υπολογίζεται επί των μεικτών εσόδων, με τέλος ανθεκτικότητας κλιματικής κρίσης και τέλος παρεπιδημούντων όπου ισχύουν. Πριν από κάθε υποβολή, επιβεβαίωσε τα ποσά με τον λογιστή σου ή την ΑΑΔΕ.`

  const html = `<!doctype html><html lang="el"><head><meta charset="utf-8">
<title>Λογιστική αναφορά · ${esc(c.propName)} ${esc(String(c.year))}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',system-ui,Arial,sans-serif;color:#111;background:#fff;font-size:12.5px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{max-width:760px;margin:0 auto;padding:40px}
  @media print{.page{padding:16mm 15mm}@page{margin:0}}
  .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:16px}
  .brand{display:flex;align-items:center;gap:11px}
  .mark{width:34px;height:34px;border-radius:8px;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:17px}
  .bname{font-size:15px;font-weight:700;color:#111}
  .muted{color:#6b7280}
  .asof-l{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#8a8f98;font-weight:600}
  h1{font-size:22px;font-weight:700;letter-spacing:-.01em;margin:22px 0 3px}
  .sub{color:#6b7280;font-size:12px;margin-bottom:22px}
  .sec{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#111;margin:26px 0 10px;padding-bottom:6px;border-bottom:1px solid #111;break-after:avoid}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:4px}
  .kpi{border:1px solid #e5e7eb;border-radius:10px;padding:13px 15px}
  .kl{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#8a8f98;font-weight:700;margin-bottom:7px}
  .kv{font-size:18px;font-weight:700;color:#111;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
  table{width:100%;border-collapse:collapse;break-inside:avoid}
  td,th{padding:8px 4px;text-align:left;font-size:12.5px}
  td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:600;color:#111}
  tbody tr td{border-bottom:1px solid #eef0f2;color:#374151}
  tr.sub td{font-weight:700;color:#111;background:#fafafa}
  tr.result td{font-weight:700;color:#111;border-top:2px solid #111;border-bottom:none;padding-top:10px}
  th{font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:#8a8f98;font-weight:600;border-bottom:1px solid #d0d5dd}
  td.st{text-align:right;font-size:11px;font-weight:700;color:#374151;white-space:nowrap}
  td.empty{color:#8a8f98;font-size:12px;padding:12px 0}
  .recon-note{font-size:12px;color:#374151;margin-bottom:8px}
  .recon-note strong{color:#111;font-weight:700}
  .disc{margin-top:32px;padding-top:12px;border-top:1px solid #e5e7eb;color:#8a8f98;font-size:10px;line-height:1.6}
</style></head>
<body><div class="page">
  <div class="top">
    <div class="brand">
      ${brandMark}
      <div>
        <div class="bname">${brandName(c.branding)}</div>
        <div class="muted" style="font-size:11px">Λογιστική αναφορά</div>
        ${contact ? `<div class="muted" style="font-size:10px;margin-top:2px">${contact}</div>` : ''}
      </div>
    </div>
    <div style="text-align:right">
      <div class="asof-l">Ημερομηνία έκδοσης</div>
      <div style="font-size:13px;font-weight:600;margin-top:2px">${esc(today)}</div>
      <div class="muted" style="font-size:10px;margin-top:3px">Χρήση ${esc(String(c.year))}</div>
    </div>
  </div>

  <h1>${esc(c.propName)}</h1>
  <div class="sub">${[c.regimeLabel, `Χρήση ${c.year}`, c.address].filter(Boolean).map(x => esc(String(x))).join(' · ')}</div>

  <div class="kpis">
    ${kpi('Μεικτά έσοδα', eur(c.statement.grossIncome))}
    ${kpi('Φόρος εισοδήματος', eur(c.statement.incomeTax))}
    ${kpi('Καθαρό αποτέλεσμα', signed(c.statement.netProfit))}
    ${kpi('Πρόβλεψη φόρου / μήνα', eur(c.provision.monthly))}
  </div>

  <div class="sec">Κατάσταση αποτελεσμάτων ${esc(String(c.year))}</div>
  <table><tbody>${c.statement.lines.map(l => stRow(l.label, l.amount, l.kind, l.negative)).join('')}</tbody></table>

  <div class="sec">Πρόβλεψη φόρου</div>
  <table><tbody>
    ${stRow('Φόρος εισοδήματος (έτους)', c.provision.incomeTax, 'row')}
    ${c.provision.propertyTaxes > 0 ? stRow('Φόροι και τέλη ακινήτου (έτους)', c.provision.propertyTaxes, 'row') : ''}
    ${stRow('Σύνολο προς πρόβλεψη', c.provision.annualTaxTotal, 'subtotal')}
    ${stRow('Ισόποσα ανά μήνα', c.provision.monthly, 'row')}
    ${stRow('Για να προλάβεις έως το τέλος του έτους (ανά μήνα)', c.provision.perRemainingMonth, 'result')}
  </tbody></table>

  <div class="sec">Συμφωνία ενοικίων ${esc(String(c.year))}</div>
  <div class="recon-note">Εισπράχθηκαν <strong>${esc(eur(c.collectedTotal))}</strong> από ${esc(eur(c.expectedTotal))}${c.outstanding > 0 ? `. Ανείσπρακτα <strong>${esc(eur(c.outstanding))}</strong>` : ''}.</div>
  <table>
    <thead><tr><th>Περίοδος</th><th class="n">Εισπράχθηκε / Αναμενόμενο</th><th class="st">Κατάσταση</th></tr></thead>
    <tbody>${reconRows}</tbody>
  </table>

  <div class="disc">${c.branding?.companyName ? esc(brandName(c.branding)) + ' · ' : ''}${disclaimer}</div>
  <script>window.onload=function(){setTimeout(function(){window.print()},350)}</script>
</div></body></html>`

  const w = window.open('', '_blank')
  if (!w) { alert('Επίτρεψε τα αναδυόμενα παράθυρα για να δημιουργηθεί η αναφορά.'); return }
  w.document.write(html)
  w.document.close()
}
