// ═══════════════════════════════════════════════════════════════════════════
// printRentCertificate — ετήσια «Βεβαίωση Ενοικίου» (A4 PDF): επίσημη βεβαίωση
// του εκμισθωτή προς τον μισθωτή για τα καταβληθέντα μισθώματα ενός έτους.
// Branded, XSS-ασφαλές (esc σε όλα τα κείμενα), χωρίς εξαρτήσεις.
// ═══════════════════════════════════════════════════════════════════════════
import { reportAccent, brandLogoImg, brandName, brandContactLine, type ReportBranding } from '@/lib/reportBranding'

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

const eur2 = (n: number) => n.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const esc = (s: string) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c))

export function printRentCertificate(c: RentCertificateCtx): void {
  const accent = reportAccent(c.branding)
  const today = new Date().toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' })
  const tenant = (c.tenantName || '').trim() || 'ο μισθωτής'
  const afmLine = (c.tenantAfm || '').trim() ? ` (ΑΦΜ ${esc(String(c.tenantAfm).trim())})` : ''

  const rows = c.months.length
    ? c.months.map(m => `<tr>
        <td style="padding:9px 0;border-bottom:1px solid #f1f3f4;font-size:13px;color:#3c4043">${esc(m.label)}</td>
        <td style="padding:9px 0;border-bottom:1px solid #f1f3f4;text-align:right;font-family:'Roboto Mono',monospace;font-size:13px;color:#202124">${esc(eur2(m.amount))}</td>
      </tr>`).join('')
    : `<tr><td colspan="2" style="color:#80868b;font-size:12px;padding:12px 0">Δεν υπάρχουν εισπραγμένα μισθώματα για το ${c.year}.</td></tr>`

  const html = `<!doctype html><html lang="el"><head><meta charset="utf-8">
<title>Βεβαίωση Ενοικίου ${esc(String(c.year))}, ${esc(c.propName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&family=Roboto+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',system-ui,sans-serif;color:#202124;background:#fff;padding:40px;max-width:820px;margin:0 auto}
  @media print{body{padding:0}@page{margin:16mm}}
  h1{font-size:22px;font-weight:800;letter-spacing:-.02em}
  .muted{color:#5f6368}
  .sec{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#5f6368;margin:26px 0 12px;padding-bottom:8px;border-bottom:1px solid #e8eaed;display:flex;align-items:center;gap:8px}
  .dot{width:6px;height:6px;border-radius:50%;background:${accent};display:inline-block}
  table{width:100%;border-collapse:collapse}
</style></head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid ${accent};padding-bottom:18px">
    <div style="display:flex;align-items:center;gap:10px">
      ${brandLogoImg(c.branding, 34) || `<div style="width:34px;height:34px;border-radius:9px;background:${accent};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:17px">P</div>`}
      <div><div style="font-size:16px;font-weight:700">${brandName(c.branding)}</div><div class="muted" style="font-size:11px">Βεβαίωση Ενοικίου</div>${brandContactLine(c.branding) ? `<div class="muted" style="font-size:10px;margin-top:2px">${brandContactLine(c.branding)}</div>` : ''}</div>
    </div>
    <div style="text-align:right"><div class="muted" style="font-size:11px">Ημερομηνία</div><div style="font-size:13px;font-weight:600">${esc(today)}</div></div>
  </div>

  <div style="margin:22px 0">
    <h1>Βεβαίωση Ενοικίου ${esc(String(c.year))}</h1>
    <div class="muted" style="font-size:13px;margin-top:4px">${[c.propName, c.address].filter(Boolean).map(x => esc(String(x))).join(' · ')}</div>
  </div>

  <p style="font-size:13.5px;line-height:1.7;color:#3c4043;margin-bottom:6px">
    Βεβαιώνεται ότι <strong>${esc(tenant)}</strong>${afmLine} κατέβαλε για τη μίσθωση του ανωτέρω ακινήτου, κατά το έτος ${esc(String(c.year))}, το συνολικό ποσό των <strong>${esc(eur2(c.total))}</strong>, όπως αναλύεται παρακάτω.
  </p>

  <div class="sec"><span class="dot"></span> Ανάλυση καταβληθέντων μισθωμάτων</div>
  <table>
    ${rows}
    <tr>
      <td style="padding:12px 0;border-top:2px solid #e8eaed;font-size:14px;font-weight:700;color:#202124">Σύνολο ${esc(String(c.year))}</td>
      <td style="padding:12px 0;border-top:2px solid #e8eaed;text-align:right;font-family:'Roboto Mono',monospace;font-size:15px;font-weight:700;color:${accent}">${esc(eur2(c.total))}</td>
    </tr>
  </table>

  <div style="display:flex;justify-content:space-between;margin-top:60px;gap:40px">
    <div style="flex:1;text-align:center"><div style="border-top:1px solid #9aa0a6;padding-top:8px;font-size:12px;color:#5f6368">Ο εκμισθωτής</div></div>
    <div style="flex:1;text-align:center"><div style="border-top:1px solid #9aa0a6;padding-top:8px;font-size:12px;color:#5f6368">Ο μισθωτής</div></div>
  </div>

  <div style="margin-top:34px;padding-top:14px;border-top:1px solid #e8eaed;color:#80868b;font-size:10px;line-height:1.6">
    ${c.branding?.companyName ? esc(brandName(c.branding)) + ' · ' : ''}Η βεβαίωση δημιουργήθηκε από το Property OS με βάση τα καταχωρημένα, εισπραγμένα μισθώματα. Για τη χρήση της σε δηλώσεις/δικαστικές διαδικασίες, επιβεβαίωσε τα στοιχεία με τον λογιστή ή τον δικηγόρο σου.
  </div>
  <script>window.onload=function(){setTimeout(function(){window.print()},350)}</script>
</body></html>`

  const w = window.open('', '_blank')
  if (!w) { alert('Επίτρεψε τα αναδυόμενα παράθυρα για να δημιουργηθεί η βεβαίωση.'); return }
  w.document.write(html)
  w.document.close()
}
