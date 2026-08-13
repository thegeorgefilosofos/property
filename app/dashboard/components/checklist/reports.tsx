'use client'
// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΤΡΕΙΣ ΕΞΑΓΩΓΕΣ ΤΩΝ ΕΚΚΡΕΜΟΤΗΤΩΝ
// ─────────────────────────────────────────────────────────────────────────
// Βιβλίο εργασίας για υπολογισμούς, αναφορά για ανάγνωση, και πρωτόκολλο
// παράδοσης που υπογράφεται. Τρεις αναγνώστες, τρεις εντελώς διαφορετικές
// ερωτήσεις — γι' αυτό δεν είναι η ίδια λίστα σε τρεις μορφές.
// ═══════════════════════════════════════════════════════════════════════════
import { downloadWorkbook } from '../xlsxStyle'
import { fdLong, ABSENT, ABSENT_DATE, ABSENT_SHORT } from '@/components/Theme'
import { reportHead, reportHeader, reportSection, reportRow, reportKpi, reportDisclaimer, openReport, rEur, rSigned, rPct, rEsc, rDate } from '../reportPdf'
import { reportAccent, brandRootVars, brandLogoImg, brandName, escHtml as esc, type ReportBranding } from '@/lib/reportBranding'
import { printFontFaces } from '@/lib/print/fonts'
import { INK, INK_FAINT, INK_MUTED, PAPER, PAPER_ALT, RULE } from '@/lib/print/ink'
import { costVariance } from '@/lib/checklist/obligationTasks'
import { WHO_LABEL } from '@/lib/accounting/dossier'
import { athensToday } from '@/lib/core/time'
import { CATEGORIES, PRIORITIES, STATUSES, RECURRING_OPTIONS, type ChecklistItem } from './model'
import { fmtDate, isOverdue, daysUntil, getCat, getPri, getStatusMeta } from './calc'

// ─── Export functions ─────────────────────────────────────────────────────────
export async function exportChecklistExcel(items: ChecklistItem[]) {
  const XLSX = (await import('xlsx-js-style')).default
  const today = new Date().toLocaleDateString('el-GR')
  const wb = XLSX.utils.book_new()
  const done = items.filter(i => i.status === 'done').length
  const totalEst = items.reduce((s, i) => s + (i.estimated_cost || 0), 0)
  const totalAct = items.reduce((s, i) => s + (i.actual_cost || 0), 0)
  const totalVar = costVariance(totalEst, totalAct)
  const overdue = items.filter(i => isOverdue(i.due_date, i.status)).length

  const byCategory: Record<string, { count: number; done: number; est: number; act: number }> = {}
  items.forEach(i => {
    const k = i.category
    if (!byCategory[k]) byCategory[k] = { count: 0, done: 0, est: 0, act: 0 }
    byCategory[k].count++
    if (i.status === 'done') byCategory[k].done++
    byCategory[k].est += i.estimated_cost || 0
    byCategory[k].act += i.actual_cost || 0
  })

  // ── Sheet 1: Σύνοψη ──────────────────────────────────────────────────────
  const summaryData: (string | number)[][] = [
    ['Property OS, Εκκρεμότητες Ακινήτου', ''],
    ['Ημερομηνία εξαγωγής:', today],
    [''],
    ['ΓΕΝΙΚΗ ΣΥΝΟΨΗ', ''],
    ['Σύνολο εργασιών', items.length],
    ['Ολοκληρωμένα', done],
    ['Εκκρεμή', items.filter(i => i.status === 'pending').length],
    ['Σε εξέλιξη', items.filter(i => i.status === 'in_progress').length],
    ['Παραλειφθέντα', items.filter(i => i.status === 'skipped').length],
    ['Ληγμένα', overdue],
    ['Ποσοστό Ολοκλήρωσης (%)', items.length > 0 ? Math.round((done / items.length) * 100) : 0],
    [''],
    // Η ΑΠΟΚΛΙΣΗ ΓΡΑΦΕΤΑΙ ΜΟΝΟ ΟΤΑΝ ΥΠΑΡΧΟΥΝ ΚΑΙ ΤΑ ΔΥΟ ΝΟΥΜΕΡΑ. Πριν, το
    // actual_cost δεν είχε κανένα input και γραφόταν πάντα 0, άρα η «Απόκλιση»
    // ήταν δομικά −(εκτίμηση) — και έφτανε στον λογιστή σαν μέτρηση.
    ['ΟΙΚΟΝΟΜΙΚΗ ΣΥΝΟΨΗ', ''],
    ['Δική σου εκτίμηση (€)', totalEst || ''],
    ['Πληρωμένο με παραστατικό (€)', totalAct || ''],
    ['Απόκλιση (€)', totalVar === null ? 'Δεν υπολογίζεται χωρίς και τα δύο' : totalVar],
    ['Απόκλιση (%)', totalVar === null ? '' : Math.round((totalVar / totalEst) * 1000) / 10],
    [''],
    ['ΚΑΤΑΝΟΜΗ ΑΝΑ ΚΑΤΗΓΟΡΙΑ', '', '', '', '', ''],
    ['Κατηγορία', 'Εργασίες', 'Ολοκληρωμένες', 'Πρόοδος %', 'Εκτίμηση €', 'Με παραστατικό €'],
    ...CATEGORIES.filter(c => byCategory[c.id]).map(c => [
      c.label,
      byCategory[c.id].count,
      byCategory[c.id].done,
      Math.round((byCategory[c.id].done / byCategory[c.id].count) * 100),
      byCategory[c.id].est,
      byCategory[c.id].act,
    ]),
    ['ΣΥΝΟΛΟ', items.length, done, items.length > 0 ? Math.round((done / items.length) * 100) : 0, totalEst, totalAct],
    [''],
    ['ΚΑΤΑΝΟΜΗ ΑΝΑ ΠΡΟΤΕΡΑΙΟΤΗΤΑ', '', ''],
    ['Προτεραιότητα', 'Εργασίες', 'Ολοκληρωμένες'],
    ...PRIORITIES.map(p => [
      p.label,
      items.filter(i => i.priority === p.value).length,
      items.filter(i => i.priority === p.value && i.status === 'done').length,
    ]),
    [''],
    ['ΚΑΤΑΝΟΜΗ ΑΝΑ ΚΑΤΑΣΤΑΣΗ', ''],
    ['Κατάσταση', 'Εργασίες'],
    ...STATUSES.map(s => [s.label, items.filter(i => i.status === s.value).length]),
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(summaryData)
  ws1['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Σύνοψη')

  // ── Sheet 2: Αναλυτική Λίστα ─────────────────────────────────────────────
  // Η στήλη «Προϋπολογισμός €» έφυγε: το πεδίο `budget` δεν είχε ποτέ input και
  // γραφόταν πάντα 0, άρα ήταν μια στήλη μηδενικών με τίτλο που υπονοεί μέτρηση.
  // Στη θέση της μπαίνει «Παραστατικό»: ΓΙΑΤΙ ισχύει το πραγματικό κόστος.
  const headers = ['Κατηγορία', 'Περιγραφή', 'Προτεραιότητα', 'Κατάσταση', 'Προθεσμία', 'Επανάληψη', 'Ανατέθηκε σε', 'Ποιος το κάνει', 'Εκτίμηση €', 'Με παραστατικό €', 'Παραστατικό', 'Πηγή', 'Ετικέτες', 'Σημειώσεις']
  const detailRows: (string | number)[][] = [headers]

  CATEGORIES.forEach(cat => {
    const catItems = items.filter(i => i.category === cat.id)
    if (catItems.length === 0) return
    detailRows.push([cat.label, `${catItems.filter(i => i.status === 'done').length}/${catItems.length} ολοκληρωμένες`, '', '', '', '', '', '', catItems.reduce((s, i) => s + (i.estimated_cost || 0), 0), catItems.reduce((s, i) => s + (i.actual_cost || 0), 0), '', '', '', ''])

    catItems.sort((a, b) => {
      const pOrder = { critical: 0, high: 1, normal: 2, low: 3 }
      return pOrder[a.priority] - pOrder[b.priority]
    }).forEach(item => {
      detailRows.push([
        cat.label,
        item.description,
        getPri(item.priority).label,
        getStatusMeta(item.status).label,
        item.due_date ? fmtDate(item.due_date) : '',
        RECURRING_OPTIONS.find(r => r.value === item.recurring)?.label || '',
        item.assigned_contact_name || '',
        item._who ? WHO_LABEL[item._who] : '',
        item.estimated_cost || '',
        item.actual_cost || '',
        item._receipt ? item._receipt.name : '',
        item._src || '',
        (item._tags || []).join('; '),
        item.note || '',
      ])
    })
    detailRows.push(['', '', '', '', '', '', '', '', '', '', '', '', '', ''])
  })

  const ws2 = XLSX.utils.aoa_to_sheet(detailRows)
  ws2['!cols'] = [{ wch: 22 }, { wch: 40 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 20 }, { wch: 12 }, { wch: 16 }, { wch: 24 }, { wch: 34 }, { wch: 20 }, { wch: 36 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Αναλυτικά')

  // ── Sheet 3: Ληγμένα & Εκκρεμή (action list) ────────────────────────────
  const actionItems = items.filter(i => i.status !== 'done' && i.status !== 'skipped')
    .sort((a, b) => {
      if (isOverdue(a.due_date, a.status) && !isOverdue(b.due_date, b.status)) return -1
      if (!isOverdue(a.due_date, a.status) && isOverdue(b.due_date, b.status)) return 1
      const pOrder = { critical: 0, high: 1, normal: 2, low: 3 }
      return pOrder[a.priority] - pOrder[b.priority]
    })
  const actionHeaders = ['Κατάσταση', 'Κατηγορία', 'Περιγραφή', 'Προτεραιότητα', 'Προθεσμία', 'Ημέρες', 'Ανατέθηκε σε', 'Ποιος το κάνει', 'Δική σου εκτίμηση €']
  const actionRows: (string | number)[][] = [
    ['Property OS, Λίστα Εκκρεμών Ενεργειών', ''],
    [`${actionItems.length} εκκρεμή tasks · ${overdue} ληγμένα`, today],
    [''],
    actionHeaders,
    ...actionItems.map(item => {
      const d = daysUntil(item.due_date)
      return [
        getStatusMeta(item.status).label,
        getCat(item.category).label,
        item.description,
        getPri(item.priority).label,
        item.due_date ? fmtDate(item.due_date) : ABSENT_DATE,
        d !== null ? (d < 0 ? `${Math.abs(d)} πριν` : `${d} ημέρες`) : ABSENT_DATE,
        item.assigned_contact_name || ABSENT,
        item._who ? WHO_LABEL[item._who] : ABSENT_SHORT,
        item.estimated_cost || '',
      ]
    }),
  ]
  const ws3 = XLSX.utils.aoa_to_sheet(actionRows)
  ws3['!cols'] = [{ wch: 14 }, { wch: 22 }, { wch: 42 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 22 }, { wch: 20 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, ws3, 'Εκκρεμείς Ενέργειες')

  downloadWorkbook(wb, `Εκκρεμότητες ακινήτου ${athensToday()}`)
}

export function exportChecklistPDF(items: ChecklistItem[], branding?: ReportBranding | null) {
  const done = items.filter(i => i.status === 'done').length
  const totalEst = items.reduce((s, i) => s + (i.estimated_cost || 0), 0)
  const totalAct = items.reduce((s, i) => s + (i.actual_cost || 0), 0)
  const overdue = items.filter(i => isOverdue(i.due_date, i.status)).length
  const pct = items.length > 0 ? Math.round((done / items.length) * 100) : 0

  const grouped: Record<string, ChecklistItem[]> = {}
  items.forEach(i => { if (!grouped[i.category]) grouped[i.category] = []; grouped[i.category].push(i) })

  // ΟΙΚΟΝΟΜΙΚΗ ΣΥΝΟΨΗ, ΜΕ ΤΑ ΔΥΟ ΝΟΥΜΕΡΑ ΞΕΧΩΡΙΣΤΑ ΚΑΙ ΟΝΟΜΑΤΙΣΜΕΝΑ.
  // Η γραμμή «Απόκλιση» εμφανίζεται ΜΟΝΟ όταν υπάρχουν και εκτίμηση και
  // παραστατικό. Πριν, το πραγματικό κόστος ήταν πάντα 0 (κανένα input πουθενά),
  // άρα η απόκλιση ήταν πάντα −(εκτίμηση) και ταξίδευε στον λογιστή σαν μέτρηση.
  const totalVar = costVariance(totalEst, totalAct)
  const financialSection = (totalEst > 0 || totalAct > 0)
    ? reportSection('Οικονομική σύνοψη')
      + '<table><tbody>'
      + reportRow('Δική σου εκτίμηση', totalEst > 0 ? rEur(totalEst) : 'Δεν έχει δηλωθεί')
      + reportRow('Πληρωμένο με παραστατικό', totalAct > 0 ? rEur(totalAct) : 'Κανένα παραστατικό ακόμη')
      + (totalVar === null ? '' : reportRow('Απόκλιση', rSigned(totalVar), 'result'))
      + '</tbody></table>'
      + (totalVar === null
        ? '<div class="sub">Η απόκλιση υπολογίζεται όταν υπάρχει και εκτίμηση και σαρωμένο παραστατικό. Χωρίς παραστατικό δεν υπάρχει πραγματικό κόστος, υπάρχει άγνωστο.</div>'
        : '')
    : ''

  const groupSections = CATEGORIES.filter(c => grouped[c.id]?.length).map(cat => {
    const list = grouped[cat.id]
    const grpDone = list.filter(i => i.status === 'done').length
    const grpPct = Math.round((grpDone / list.length) * 100)
    const rows = list.map(item => {
      const pri = getPri(item.priority); const sm = getStatusMeta(item.status)
      const od = isOverdue(item.due_date, item.status)
      const isDone = item.status === 'done'
      const contact = item.assigned_contact_name
        ? `<div style="font-size:10px;color:${INK_FAINT};margin-top:2px">${rEsc(item.assigned_contact_name)}</div>` : ''
      const tags = (item._tags || []).length > 0
        ? `<div style="margin-top:3px">${(item._tags || []).map(t => `<span style="display:inline-block;padding:1px 6px;border:1px solid ${RULE};border-radius:3px;font-size:9px;color:${INK_MUTED};margin-right:3px">${rEsc(t)}</span>`).join('')}</div>` : ''
      return `<tr>
        <td>
          <div style="font-size:12px;${isDone ? `text-decoration:line-through;color:${INK_FAINT}` : `color:${INK}`}">${rEsc(item.description)}</div>
          ${contact}${tags}
        </td>
        <td>${rEsc(pri.label)}</td>
        <td>${rEsc(sm.label)}</td>
        <td class="np">${item.due_date ? rEsc(fmtDate(item.due_date)) : rEsc(ABSENT_DATE)}${od ? `<div style="font-size:9px;color:${INK_FAINT}">Εκπρόθεσμο</div>` : ''}</td>
        <td class="n">${rEsc(rEur(item.estimated_cost))}</td>
        <td class="n">${rEsc(rEur(item.actual_cost))}${item._receipt ? `<div style="font-size:9px;color:${INK_FAINT}">${rEsc(item._receipt.name)}</div>` : ''}</td>
      </tr>`
    }).join('')
    return reportSection(cat.label)
      + `<div class="sub">${rEsc(String(grpDone))}/${rEsc(String(list.length))} ολοκληρωμένα · πρόοδος ${rEsc(rPct(grpPct))}</div>`
      + `<table>
        <thead><tr>
          <th>Περιγραφή</th>
          <th>Προτεραιότητα</th>
          <th>Κατάσταση</th>
          <th class="np">Προθεσμία</th>
          <th class="n">Εκτίμηση</th>
          <th class="n">Με παραστατικό</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`
  }).join('')

  // Ο ΑΠΟΠΟΙΗΤΙΚΟΣ ΛΕΕΙ ΤΗΝ ΑΛΗΘΕΙΑ ΓΙΑ ΤΑ ΝΟΥΜΕΡΑ. Η στήλη «Εκτίμηση» είναι ό,τι
  // έγραψε ο ίδιος ο χρήστης, όχι πρόταση της εφαρμογής: τα 24 σταθερά κόστη των
  // προτύπων σβήστηκαν. Η στήλη «Με παραστατικό» έχει πίσω της αρχείο στο Αρχείο.
  const disclaimer = 'Οι φορολογικές προθεσμίες προέρχονται από το φορολογικό ημερολόγιο της εφαρμογής, με σύνδεσμο επίσημης πηγής σε κάθε γραμμή, και όπου η ημερομηνία ανακοινώνεται ετησίως το δηλώνει ρητά. Επιβεβαίωσέ τις στο myAADE ή με τον λογιστή σου. Η «Εκτίμηση» είναι ποσό που δήλωσες εσύ, χωρίς επαλήθευση. Η στήλη «Με παραστατικό» αντιστοιχεί σε σαρωμένο τιμολόγιο ή απόδειξη που βρίσκεται στο Αρχείο.'

  const html = reportHead('Εκκρεμότητες ακινήτου')
    + '<body><div class="page">'
    + reportHeader(branding, 'Εκκρεμότητες ακινήτου', { rightLabel: 'Ημερομηνία έκδοσης', rightValue: rDate(), rightNote: `Συνολική πρόοδος ${rPct(pct)}` })
    + '<h1>Εκκρεμότητες ακινήτου</h1>'
    + `<div class="sub">${rEsc(String(items.length))} εργασίες · ${rEsc(String(done))} ολοκληρωμένα · πρόοδος ${rEsc(rPct(pct))}</div>`
    + reportSection('Σύνοψη')
    + '<div class="kpis">'
    + reportKpi('Σύνολο εργασιών', String(items.length))
    + reportKpi('Ολοκληρωμένα', String(done))
    + reportKpi('Εκκρεμή', String(items.length - done))
    + reportKpi('Ληγμένα', String(overdue))
    + '</div>'
    + financialSection
    + groupSections
    + reportDisclaimer(disclaimer, branding)
    + '</div></body></html>'

  openReport(html)
}

// ─── Handover Protocol PDF (12 sections, auto-fill from cross-tab data) ───────
export interface TenantData { full_name?: string; phone?: string; afm?: string; lease_end?: string; email?: string }

export function exportHandoverProtocol(items: ChecklistItem[], type: 'checkin' | 'checkout', tenant?: TenantData, branding?: ReportBranding | null) {
  const accent = reportAccent(branding)
  const relevant = items.filter(i => i.category === type || (type === 'checkin' && i.category === 'legal'))
  const title = type === 'checkin' ? 'Πρωτόκολλο Παράδοσης Ακινήτου' : 'Πρωτόκολλο Αποχώρησης Ενοικιαστή'
  // ΕΝΑ ΕΠΙΣΗΜΟ ΕΓΓΡΑΦΟ ΜΕ ΔΥΟ ΜΟΡΦΕΣ ΗΜΕΡΟΜΗΝΙΑΣ. Το πρωτόκολλο παράδοσης
  // έγραφε τη σημερινή ως «09 Αυγούστου 2026» και τη λήξη μίσθωσης ως «9/8/2026»,
  // δύο γραμμές μακριά, μέσα στο ίδιο χαρτί που υπογράφουν δύο άνθρωποι. Και οι
  // δύο περνούν πλέον από το `fdLong`, την πλήρη μορφή χωρίς συντομογραφία —
  // αυτή ταιριάζει σε έγγραφο, όχι η αριθμητική.
  const today = fdLong(new Date())

  const tenantName = tenant?.full_name || '______________________________'
  const tenantPhone = tenant?.phone || '______________________________'
  const tenantAfm = tenant?.afm || '______________________________'
  const leaseEnd = tenant?.lease_end ? fdLong(tenant.lease_end) : '______________________________'

  const sectionHtml = (num: number, title: string, content: string) => `
    <div class="sec">
      <div class="sec-hdr"><div class="sec-num">${num}</div><div class="sec-title">${esc(title)}</div></div>
      <div class="sec-body">${content}</div>
    </div>`

  const fieldRow = (label: string, value = '', width = '100%') =>
    `<div class="field-row" style="width:${width}"><div class="field-label">${esc(label)}</div><div class="field-val">${value || ''}</div></div>`


  const rooms = ['Σαλόνι', 'Κουζίνα', 'Υπνοδωμάτιο 1', 'Υπνοδωμάτιο 2', 'Μπάνιο', 'WC', 'Χολ / Είσοδος', 'Αποθήκη / Βοηθητικός']
  const roomRows = rooms.map(r => `
    <tr>
      <td class="room-name">${esc(r)}</td>
      <td class="room-cell"><div class="rating-row">${['Άριστη','Καλή','Μέτρια','Κακή'].map(s => `<label class="rating-opt"><input type="checkbox"> ${esc(s)}</label>`).join('')}</div></td>
      <td class="room-notes"></td>
    </tr>`).join('')

  const taskRows = relevant.map(item => `
    <div class="task-row ${item.status === 'done' ? 'done' : ''}">
      <div class="task-cb ${item.status === 'done' ? 'task-cb-done' : ''}">${item.status === 'done' ? `<svg width="9" height="9" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" fill="none" stroke="${PAPER}" stroke-width="2.5" stroke-linecap="round"/></svg>` : ''}</div>
      <div class="task-label">${esc(item.description)}</div>
      ${item.assigned_contact_name ? `<div class="task-contact">${esc(item.assigned_contact_name)}</div>` : ''}
    </div>`).join('')

  const html = `<!DOCTYPE html><html lang="el"><head>
<meta charset="UTF-8"><title>${esc(title)}</title>
${printFontFaces()}
<style>
${brandRootVars(branding)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:${PAPER};color:${INK};font-size:11px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{max-width:900px;margin:0 auto;padding:28px 36px}

/* Header */
.hdr{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:14px;margin-bottom:24px;border-bottom:2px solid ${INK}}
.logo{font-family:'Inter',sans-serif;font-size:20px;font-weight:700;color:${INK}}.logo span{color:${INK}}
.logo-sub{font-size:10px;color:${INK_MUTED};margin-top:2px}
.hdr-right{text-align:right}
.hdr-title{font-family:'Inter',sans-serif;font-size:16px;font-weight:500;color:${INK}}
.hdr-meta{font-size:10px;color:${INK_MUTED};margin-top:4px}
.hdr-type{display:inline-block;padding:4px 14px;border-radius:20px;font-size:10px;font-weight:600;font-family:'Inter',sans-serif;margin-top:6px;background:${PAPER_ALT};border:1px solid ${RULE};color:${INK}}

/* Sections */
.sec{margin-bottom:20px;border:1px solid ${RULE};border-radius:10px;overflow:hidden;break-inside:avoid}
.sec-hdr{display:flex;align-items:center;gap:12px;padding:11px 16px;background:${PAPER_ALT};border-bottom:1px solid ${RULE};border-left:3px solid ${INK}}
.sec-num{width:26px;height:26px;border-radius:50%;background:${INK};color:${PAPER};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;font-family:'Inter',sans-serif;flex-shrink:0;letter-spacing:0}
.sec-title{font-family:'Inter',sans-serif;font-size:13px;font-weight:500;color:${INK}}
.sec-body{padding:14px 16px}

/* Field rows */
.field-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
.field-grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px}
.field-row{display:flex;flex-direction:column;gap:4px}
.field-label{font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:${INK_MUTED};font-family:'Inter',sans-serif}
.field-val{min-height:30px;border-bottom:2px solid ${RULE};padding:4px 0 3px;font-size:12px;color:${INK};font-family:'Inter', sans-serif;letter-spacing:0.02em}
.field-val.prefilled{color:${INK};font-weight:600;border-bottom-color:${INK}}
.field-area{min-height:56px;border:1px solid ${RULE};border-radius:6px;padding:8px;margin-top:4px;background:${PAPER_ALT}}

/* Checkbox rows */
.check-row{display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid ${PAPER_ALT}}
.check-row:last-child{border-bottom:none}
.cb{width:16px;height:16px;border:2px solid ${RULE};border-radius:3px;flex-shrink:0;display:flex;align-items:center;justify-content:center;margin-top:1px}
.cb-done{background:${INK};border-color:${INK}}
.check-label{font-size:12px;color:${INK_MUTED};flex:1;line-height:1.4}

/* Room table */
.room-table{width:100%;border-collapse:collapse;font-size:11px}
.room-table th{background:${PAPER_ALT};padding:7px 10px;border:1px solid ${RULE};text-align:left;font-family:'Inter',sans-serif;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:${INK_MUTED}}
.room-table td{padding:7px 10px;border:1px solid ${RULE};vertical-align:middle}
.room-name{font-weight:500;color:${INK};width:140px}
.room-cell{min-width:220px}
.room-notes{min-height:28px;min-width:160px}
.rating-row{display:flex;gap:10px}
.rating-opt{font-size:10px;color:${INK_MUTED};cursor:default}

/* Meter grid */
.meter-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.meter-card{border:1px solid ${RULE};border-radius:8px;padding:12px;background:${PAPER_ALT}}
.meter-title{font-family:'Inter',sans-serif;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:${INK_MUTED};margin-bottom:8px}
.meter-val{font-size:22px;font-weight:700;color:${INK};border-bottom:3px solid ${INK};padding-bottom:6px;margin-bottom:6px;font-family:'Roboto Mono',monospace;font-variant-numeric:tabular-nums;min-height:36px;letter-spacing:-0.5px}
.meter-unit{font-size:9px;color:${INK_FAINT};font-family:'Inter',sans-serif}
.meter-serial{font-size:10px;color:${INK_MUTED};margin-top:8px;border-top:1px solid ${RULE};padding-top:6px}

/* Key tracking */
.key-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.key-card{border:1px solid ${RULE};border-radius:8px;padding:10px;text-align:center}
.key-num{font-size:26px;font-weight:700;color:${INK};font-family:'Roboto Mono',monospace;font-variant-numeric:tabular-nums;min-height:38px;border-bottom:2px solid ${INK};margin-bottom:8px;letter-spacing:-1px}
.key-label{font-size:10px;color:${INK_MUTED};font-family:'Inter',sans-serif}

/* Appliance table */
.app-table{width:100%;border-collapse:collapse;font-size:11px}
.app-table th{background:${PAPER_ALT};padding:6px 10px;border:1px solid ${RULE};font-family:'Inter',sans-serif;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:${INK_MUTED};text-align:left}
.app-table td{padding:6px 10px;border:1px solid ${RULE}}
.app-cb{width:14px;height:14px;border:1.5px solid ${RULE};border-radius:2px;display:inline-block}
.app-include{text-align:center}

/* Tasks */
.task-row{display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid ${PAPER_ALT}}
.task-row:last-child{border-bottom:none}
.task-row.done .task-label{text-decoration:line-through;color:${INK_FAINT}}
.task-cb{width:16px;height:16px;border:1.5px solid ${RULE};border-radius:3px;flex-shrink:0;margin-top:1px;display:flex;align-items:center;justify-content:center}
.task-cb-done{background:${INK};border-color:${INK}}
.task-label{flex:1;font-size:12px;color:${INK_MUTED}}
.task-contact{font-size:10px;color:${INK_MUTED};background:${PAPER_ALT};padding:1px 7px;border-radius:20px;white-space:nowrap}

/* Damage */
.damage-box{border:1px solid ${RULE};border-radius:8px;min-height:100px;padding:12px;background:${PAPER_ALT}}
.photo-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:12px}
.photo-box{border:1px dashed ${RULE};border-radius:6px;height:80px;display:flex;align-items:center;justify-content:center;font-size:10px;color:${INK_FAINT};background:${PAPER_ALT}}

/* Signatures */
.sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:48px;margin-top:12px}
.sig-block{border-top:2px solid ${INK};padding-top:10px}
.sig-role{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${INK_MUTED};font-family:'Inter',sans-serif;margin-bottom:18px}
.sig-line{border-bottom:2px solid ${INK};margin-bottom:10px;height:48px}
.sig-detail{font-size:10px;color:${INK_MUTED};margin-bottom:4px}

/* Commons */
.commons-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.commons-row{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid ${PAPER_ALT}}
.commons-row:last-child{border-bottom:none}
.commons-dot{width:8px;height:8px;border-radius:50%;background:${INK_MUTED};flex-shrink:0}
.commons-label{font-size:12px;color:${INK_MUTED};flex:1}
.commons-val{font-size:11px;border-bottom:1px solid ${RULE};min-width:80px;padding-bottom:2px;font-family:'Inter', sans-serif}

/* Footer */
.footer{margin-top:28px;padding-top:10px;border-top:1px solid ${RULE};display:flex;justify-content:space-between;align-items:center;font-size:9px;color:${INK_FAINT}}
.notice{background:${PAPER_ALT};border:1px solid ${RULE};border-radius:8px;padding:10px 16px;font-size:10px;color:${INK_MUTED};margin-bottom:20px;display:flex;align-items:flex-start;gap:8px}

@media print{.sec{break-inside:avoid}.page{padding:18px 24px}}
</style></head><body>
<div class="page">

<div style="height:3px;background:${accent};border-radius:3px;margin-bottom:20px"></div>
<div class="hdr">
  <div>
    ${branding ? `${brandLogoImg(branding, 30)}<div class="logo">${brandName(branding)}</div>` : `<div class="logo">Property <span>OS</span></div>`}
    <div class="logo-sub">Επαγγελματικό εργαλείο διαχείρισης ακινήτων</div>
  </div>
  <div class="hdr-right">
    <div class="hdr-title">${esc(title)}</div>
    <div class="hdr-meta">Ημερομηνία: ${esc(today)}</div>
    <div class="hdr-type">${type === 'checkin' ? 'Παράδοση' : 'Αποχώρηση'}</div>
  </div>
</div>

<div class="notice"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" style="flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg><span>Αυτό το πρωτόκολλο αποτελεί νομικά δεσμευτικό αποδεικτικό παράδοσης/παραλαβής ακινήτου. Κρατήστε αντίγραφο και οι δύο πλευρές. Εκτυπώστε σε 2 αντίτυπα.</span></div>

${sectionHtml(1, 'Στοιχεία Ακινήτου και Συμβαλλομένων', `
  <div class="field-grid">
    ${fieldRow('Διεύθυνση Ακινήτου', '')}
    ${fieldRow('Διαμέρισμα / Όροφος', '')}
    ${fieldRow('Τ.Κ. / Πόλη', '')}
    ${fieldRow('Ημερομηνία Συναλλαγής', esc(today))}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px">
    <div style="background:${PAPER_ALT};border:1px solid ${RULE};border-radius:8px;padding:12px">
      <div style="font-family:'Inter',sans-serif;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:${INK_MUTED};margin-bottom:8px">Ιδιοκτήτης</div>
      <div class="field-row" style="margin-bottom:8px">${fieldRow('Ονοματεπώνυμο', '')}</div>
      <div class="field-grid">
        ${fieldRow('ΑΦΜ', '')}
        ${fieldRow('Τηλέφωνο', '')}
      </div>
    </div>
    <div style="background:${PAPER_ALT};border:1px solid ${RULE};border-radius:8px;padding:12px">
      <div style="font-family:'Inter',sans-serif;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:${INK_MUTED};margin-bottom:8px">Ενοικιαστής</div>
      <div class="field-row" style="margin-bottom:8px">${fieldRow('Ονοματεπώνυμο', `<span class="${tenantName !== '______________________________' ? 'prefilled' : ''}">${esc(tenantName)}</span>`)}</div>
      <div class="field-grid">
        ${fieldRow('ΑΦΜ', `<span class="${tenantAfm !== '______________________________' ? 'prefilled' : ''}">${esc(tenantAfm)}</span>`)}
        ${fieldRow('Τηλέφωνο', `<span class="${tenantPhone !== '______________________________' ? 'prefilled' : ''}">${esc(tenantPhone)}</span>`)}
      </div>
    </div>
  </div>
  <div class="field-grid" style="margin-top:10px">
    ${fieldRow('Διάρκεια Μίσθωσης', '')}
    ${fieldRow('Λήξη Μίσθωσης', `<span class="${leaseEnd !== '______________________________' ? 'prefilled' : ''}">${esc(leaseEnd)}</span>`)}
    ${fieldRow('Εγγύηση (€)', '')}
    ${fieldRow('Ενοίκιο / Μήνα (€)', '')}
  </div>
`)}

${sectionHtml(2, 'Κατάσταση Χώρων ανά Δωμάτιο', `
  <table class="room-table">
    <thead><tr>
      <th>Χώρος</th>
      <th>Κατάσταση</th>
      <th>Παρατηρήσεις</th>
    </tr></thead>
    <tbody>${roomRows}</tbody>
  </table>
`)}

${sectionHtml(3, 'Κατάσταση Τοίχων, Δαπέδων και Οροφής', `
  <table class="room-table">
    <thead><tr><th>Στοιχείο</th><th>Κατάσταση</th><th>Περιγραφή</th></tr></thead>
    <tbody>
      ${['Τοίχοι (βαφή/ταπετσαρία)', 'Δάπεδα (τύπος/κατάσταση)', 'Οροφή', 'Πόρτες εισόδου', 'Εσωτερικές πόρτες', 'Παράθυρα/Κουφώματα', 'Ρολά/Στόρια'].map(r => `<tr><td class="room-name">${esc(r)}</td><td class="room-cell"><div class="rating-row">${['Άριστη','Καλή','Μέτρια','Κακή'].map(s => `<label class="rating-opt"><input type="checkbox"> ${esc(s)}</label>`).join('')}</div></td><td class="room-notes"></td></tr>`).join('')}
    </tbody>
  </table>
`)}

${sectionHtml(4, 'Μετρητές Παροχών', `
  <div class="meter-grid">
    <div class="meter-card">
      <div class="meter-title">ΔΕΗ / Ρεύμα</div>
      <div class="meter-val"></div>
      <div class="meter-unit">kWh</div>
      <div class="meter-serial">Αριθμός σειράς: ____________________</div>
    </div>
    <div class="meter-card">
      <div class="meter-title">ΕΥΔΑΠ / Νερό</div>
      <div class="meter-val"></div>
      <div class="meter-unit">m³</div>
      <div class="meter-serial">Αριθμός σειράς: ____________________</div>
    </div>
    <div class="meter-card">
      <div class="meter-title">Φυσικό αέριο</div>
      <div class="meter-val"></div>
      <div class="meter-unit">m³</div>
      <div class="meter-serial">Αριθμός σειράς: ____________________</div>
    </div>
  </div>
  <div style="margin-top:12px">
    ${fieldRow('Αριθμός Παροχής ΔΕΗ', '')}
  </div>
`)}

${sectionHtml(5, 'Κλειδιά και Κλειδαριές', `
  <div class="key-grid">
    <div class="key-card">
      <div class="key-num"></div>
      <div class="key-label">Σετ κλειδιών εισόδου</div>
    </div>
    <div class="key-card">
      <div class="key-num"></div>
      <div class="key-label">Σετ κλειδιών κτιρίου</div>
    </div>
    <div class="key-card">
      <div class="key-num"></div>
      <div class="key-label">Σετ κλειδιών αποθήκης</div>
    </div>
    <div class="key-card">
      <div class="key-num"></div>
      <div class="key-label">Σετ κλειδιών parking</div>
    </div>
  </div>
  <div class="field-grid" style="margin-top:12px">
    ${fieldRow('Τύπος Κλειδαριάς', '')}
    ${fieldRow('Smart Lock / Κωδικός', '')}
    ${fieldRow('Αρ. Γραμματοκιβωτίου', '')}
    ${fieldRow('Κωδικός Συναγερμού', '')}
  </div>
`)}

${sectionHtml(6, 'Συσκευές και Έπιπλα', `
  <table class="app-table">
    <thead><tr><th>Είδος</th><th>Περιλαμβάνεται</th><th>Μάρκα / Μοντέλο</th><th>Κατάσταση</th><th>Εγγύηση</th></tr></thead>
    <tbody>
      ${['Ψυγείο', 'Πλυντήριο Ρούχων', 'Στεγνωτήριο', 'Πλυντήριο Πιάτων', 'Φούρνος / Κουζίνα', 'Κλιματιστικό', 'Boiler / Ηλιακός', 'Τηλεόραση', 'Πλυντήριο / Κάδοι', 'Επιπλωμένο (γενικά)', 'Άλλο'].map(s => `<tr><td>${esc(s)}</td><td class="app-include"><div class="app-cb"></div></td><td></td><td></td><td></td></tr>`).join('')}
    </tbody>
  </table>
`)}

${sectionHtml(7, 'Parking και Αποθήκη', `
  <div class="field-grid">
    ${fieldRow('Parking, Θέση Νο', '')}
    ${fieldRow('Parking, Τύπος', '')}
    ${fieldRow('Αποθήκη, Νο', '')}
    ${fieldRow('Αποθήκη, Όροφος', '')}
  </div>
  <div class="field-area"></div>
`)}

${sectionHtml(8, 'Κοινόχρηστοι Χώροι και Εγκαταστάσεις', `
  <div class="commons-grid">
    <div>
      ${['Ανελκυστήρας', 'Γεννήτρια / UPS', 'Σύστημα Ασφαλείας / CCTV', 'Πόρτα Εισόδου (αυτόματη)'].map(c => `<div class="commons-row"><div class="commons-dot"></div><div class="commons-label">${esc(c)}</div><div class="commons-val"></div></div>`).join('')}
    </div>
    <div>
      ${['Κολυμβητήριο', 'Κοινόχρηστο Πλυντήριο', 'Κοινόχρηστη Ταράτσα', 'Κάδοι Ανακύκλωσης'].map(c => `<div class="commons-row"><div class="commons-dot"></div><div class="commons-label">${esc(c)}</div><div class="commons-val"></div></div>`).join('')}
    </div>
  </div>
`)}

${sectionHtml(9, 'Λίστα Ελέγχου Εκκρεμοτήτων', `
  ${taskRows || `<div style="text-align:center;padding:20px;color:${INK_FAINT};font-size:12px">Δεν υπάρχουν tasks στην κατηγορία ${type === 'checkin' ? 'παράδοσης' : 'αποχώρησης'}</div>`}
`)}

${sectionHtml(10, 'Καταγεγραμμένες Ζημιές και Αποκλίσεις', `
  <div style="font-size:12px;color:${INK_MUTED};margin-bottom:10px">Καταγράψτε κάθε ζημιά, φθορά ή απόκλιση από την αρχική κατάσταση. Συνημμένα: φωτογραφίες με ημερομηνία.</div>
  <div class="damage-box"></div>
  <div class="photo-grid">
    ${Array(8).fill(0).map(() => `<div class="photo-box">Φωτογραφία</div>`).join('')}
  </div>
`)}

${sectionHtml(11, 'Λοιπές Συμφωνίες και Σημειώσεις', `
  <div class="damage-box" style="min-height:80px"></div>
  <div class="field-grid" style="margin-top:10px">
    ${fieldRow('Συμφωνημένη ημ. επιστροφής εγγύησης', '')}
    ${fieldRow('Εκκρεμή ποσά προς διακανονισμό', '')}
  </div>
`)}

${sectionHtml(12, 'Δηλώσεις και Υπογραφές', `
  <div style="padding:12px;background:${PAPER_ALT};border-radius:8px;border:1px solid ${RULE};font-size:11px;color:${INK_MUTED};line-height:1.6;margin-bottom:16px">
    Οι υπογράφοντες βεβαιώνουν ότι έχουν λάβει γνώση και αποδέχονται το σύνολο των παραπάνω καταγεγραμμένων στοιχείων. Η παρούσα αποτελεί αναπόσπαστο παράρτημα της μισθωτικής σύμβασης.
  </div>
  <div class="sig-grid">
    <div class="sig-block">
      <div class="sig-role">Ιδιοκτήτης</div>
      <div class="sig-line"></div>
      <div class="sig-detail">Ονοματεπώνυμο: ________________________________</div>
      <div class="sig-detail">ΑΦΜ: ________________________________</div>
      <div class="sig-detail">Τηλέφωνο: ________________________________</div>
    </div>
    <div class="sig-block">
      <div class="sig-role">Ενοικιαστής</div>
      <div class="sig-line"></div>
      <div class="sig-detail">Ονοματεπώνυμο: <strong>${tenantName !== '______________________________' ? esc(tenantName) : '________________________________'}</strong></div>
      <div class="sig-detail">ΑΦΜ: ${tenantAfm !== '______________________________' ? esc(tenantAfm) : '________________________________'}</div>
      <div class="sig-detail">Τηλέφωνο: ${tenantPhone !== '______________________________' ? esc(tenantPhone) : '________________________________'}</div>
    </div>
  </div>
`)}

<div class="footer">
  <div>${branding?.companyName ? brandName(branding) : 'Property OS'} · Πρωτόκολλο ${type === 'checkin' ? 'Παράδοσης' : 'Αποχώρησης'} · Αντίγραφο ___/2</div><div>Αρ. Αναφοράς: ${new Date().getTime().toString(36).toUpperCase().slice(-8)}</div>
  <div>${esc(today)}</div>
</div>

</div></body></html>`

  const win = window.open('', '_blank', 'width=1200,height=900')
  if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 900) }
}