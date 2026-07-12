// ═══════════════════════════════════════════════════════════════════════════
// printAccountingReport — επαγγελματική, branded εκτυπώσιμη «Λογιστική Αναφορά»
// (A4 PDF): κατάσταση αποτελεσμάτων + πρόβλεψη φόρου + συμφωνία ενοικίων. Καθαρό
// HTML παράθυρο εκτύπωσης, ιδανικό για τον λογιστή/τράπεζα. Χωρίς εξαρτήσεις.
// XSS-ασφαλές (όλα τα κείμενα περνούν από esc).
// ═══════════════════════════════════════════════════════════════════════════
import { reportAccent, brandLogoImg, brandName, brandContactLine, type ReportBranding } from '@/lib/reportBranding'
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

const eur = (n: number) => `${Math.round(n).toLocaleString('el-GR')} €`
const eur2 = (n: number) => n.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const esc = (s: string) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c))

export function printAccountingReport(c: AccountingReportCtx): void {
  const accent = reportAccent(c.branding)
  const today = new Date().toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' })

  const stRow = (label: string, value: string, kind: string, negative?: boolean) => {
    const strong = kind === 'subtotal' || kind === 'result'
    const color = kind === 'result' ? accent : '#202124'
    const top = kind === 'result' ? 'border-top:2px solid #e8eaed;' : 'border-bottom:1px solid #f1f3f4;'
    return `<tr><td style="padding:10px 0;${top}color:${strong ? '#202124' : '#5f6368'};font-size:${strong ? 14 : 13}px;font-weight:${strong ? 700 : 400}">${esc(label)}</td>
      <td style="padding:10px 0;${top}text-align:right;font-family:'Roboto Mono',monospace;font-size:${strong ? 15 : 13}px;font-weight:${strong ? 700 : 500};color:${color}">${negative ? '− ' : ''}${esc(value)}</td></tr>`
  }

  const kpi = (label: string, value: string, color = accent) =>
    `<div style="flex:1;min-width:120px;border:1px solid #e8eaed;border-radius:12px;padding:14px 16px">
      <div style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#80868b;font-weight:700;margin-bottom:8px">${esc(label)}</div>
      <div style="font-family:'Roboto Mono',monospace;font-size:20px;font-weight:700;color:${color}">${esc(value)}</div>
    </div>`

  const reconRows = c.reconciliation.length
    ? c.reconciliation.map(r => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #f1f3f4;font-size:13px;color:#3c4043">${esc(r.label)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f1f3f4;text-align:right;font-family:'Roboto Mono',monospace;font-size:12.5px;color:#5f6368">${esc(eur2(r.paid))} / ${esc(eur2(r.expected))}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f1f3f4;text-align:right;font-size:11px;font-weight:700;color:${r.statusColor}">${esc(r.statusLabel)}</td>
      </tr>`).join('')
    : `<tr><td colspan="3" style="color:#80868b;font-size:12px;padding:12px 0">Δεν υπάρχουν καταχωρημένα ενοίκια για το ${c.year}.</td></tr>`

  const html = `<!doctype html><html lang="el"><head><meta charset="utf-8">
<title>Λογιστική Αναφορά, ${esc(c.propName)} ${esc(String(c.year))}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&family=Roboto+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',system-ui,sans-serif;color:#202124;background:#fff;padding:40px;max-width:820px;margin:0 auto}
  @media print{body{padding:0}@page{margin:16mm}}
  h1{font-size:23px;font-weight:800;letter-spacing:-.02em}
  .muted{color:#5f6368}
  .sec{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#5f6368;margin:26px 0 12px;padding-bottom:8px;border-bottom:1px solid #e8eaed;display:flex;align-items:center;gap:8px}
  .dot{width:6px;height:6px;border-radius:50%;background:${accent};display:inline-block}
  table{width:100%;border-collapse:collapse}
</style></head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid ${accent};padding-bottom:18px">
    <div style="display:flex;align-items:center;gap:10px">
      ${brandLogoImg(c.branding, 34) || `<div style="width:34px;height:34px;border-radius:9px;background:${accent};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:17px">P</div>`}
      <div><div style="font-size:16px;font-weight:700">${brandName(c.branding)}</div><div class="muted" style="font-size:11px">Λογιστική Αναφορά</div>${brandContactLine(c.branding) ? `<div class="muted" style="font-size:10px;margin-top:2px">${brandContactLine(c.branding)}</div>` : ''}</div>
    </div>
    <div style="text-align:right"><div class="muted" style="font-size:11px">Ημερομηνία</div><div style="font-size:13px;font-weight:600">${esc(today)}</div></div>
  </div>

  <div style="margin:22px 0">
    <h1>${esc(c.propName)}</h1>
    <div class="muted" style="font-size:13px;margin-top:4px">${[c.regimeLabel, `Χρήση ${c.year}`, c.address].filter(Boolean).map(x => esc(String(x))).join(' · ')}</div>
  </div>

  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px">
    ${kpi('Μεικτά έσοδα', eur(c.statement.grossIncome), '#188038')}
    ${kpi('Φόρος εισοδήματος', eur(c.statement.incomeTax), '#e37400')}
    ${kpi('Καθαρό αποτέλεσμα', eur(c.statement.netProfit), c.statement.netProfit >= 0 ? '#188038' : '#c5221f')}
    ${kpi('Πρόβλεψη φόρου/μήνα', eur(c.provision.monthly))}
  </div>

  <div class="sec"><span class="dot"></span> Κατάσταση Αποτελεσμάτων ${esc(String(c.year))}</div>
  <table>${c.statement.lines.map(l => stRow(l.label, eur2(l.amount), l.kind, l.negative)).join('')}</table>

  <div class="sec"><span class="dot"></span> Πρόβλεψη Φόρου</div>
  <table>
    ${stRow('Φόρος εισοδήματος (έτους)', eur(c.provision.incomeTax), 'row')}
    ${c.provision.propertyTaxes > 0 ? stRow('Φόροι / τέλη ακινήτου (έτους)', eur(c.provision.propertyTaxes), 'row') : ''}
    ${stRow('Σύνολο προς πρόβλεψη', eur(c.provision.annualTaxTotal), 'subtotal')}
    ${stRow('Ισόποσα ανά μήνα', eur(c.provision.monthly), 'row')}
    ${stRow('Για να προλάβεις έως το τέλος του έτους (ανά μήνα)', eur(c.provision.perRemainingMonth), 'result')}
  </table>

  <div class="sec"><span class="dot"></span> Συμφωνία Ενοικίων ${esc(String(c.year))}</div>
  <div class="muted" style="font-size:12px;margin-bottom:8px">Εισπράχθηκαν <strong style="color:#188038">${esc(eur(c.collectedTotal))}</strong> από ${esc(eur(c.expectedTotal))}${c.outstanding > 0 ? ` · ανείσπρακτα <strong style="color:#c5221f">${esc(eur(c.outstanding))}</strong>` : ''}.</div>
  <table>${reconRows}</table>

  <div style="margin-top:38px;padding-top:14px;border-top:1px solid #e8eaed;color:#80868b;font-size:10px;line-height:1.6">
    ${c.branding?.companyName ? esc(brandName(c.branding)) + ' · ' : ''}Η αναφορά δημιουργήθηκε από το Property OS και έχει ενημερωτικό χαρακτήρα. Δεν αποτελεί επίσημο φορολογικό/λογιστικό έγγραφο. Ο φόρος υπολογίζεται με την προοδευτική κλίμακα ενοικίων 2026 και την ισχύουσα μεταχείριση (μακροχρόνια: τεκμαρτή έκπτωση 5%· βραχυχρόνια: φόρος στα μεικτά, με ΤΑΚΚ/τέλος παρεπιδημούντων όπου ισχύει). Τελική επιβεβαίωση με λογιστή/ΑΑΔΕ.
  </div>
  <script>window.onload=function(){setTimeout(function(){window.print()},350)}</script>
</body></html>`

  const w = window.open('', '_blank')
  if (!w) { alert('Επίτρεψε τα αναδυόμενα παράθυρα για να δημιουργηθεί η αναφορά.'); return }
  w.document.write(html)
  w.document.close()
}
