'use client'
// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΤΡΕΙΣ ΕΞΑΓΩΓΕΣ ΤΗΣ ΑΠΟΓΡΑΦΗΣ
// ─────────────────────────────────────────────────────────────────────────
// Μία λίστα για τον μισθωτή, μία έκθεση για τον ασφαλιστή, ένα φύλλο για
// υπολογισμούς. Η ίδια απογραφή, τρεις αναγνώστες με εντελώς διαφορετική
// ερώτηση ο καθένας.
//
// ΟΠΟΥ ΛΕΙΠΕΙ ΝΟΥΜΕΡΟ, ΤΟ ΛΕΕΙ. Η έκθεση προς τον ασφαλιστή γράφει ρητά για
// πόσα αντικείμενα λείπει το κόστος αντικατάστασης: ένα ελλιπές άθροισμα που
// παρουσιάζεται ως πλήρες είναι υπασφάλιση που φαίνεται μόνο μετά τη ζημιά.
// ═══════════════════════════════════════════════════════════════════════════
import { downloadTableXlsx } from '../exportCsv'
import { reportHead, reportHeader, reportSection, reportRow, reportKpi, reportDisclaimer, openReport, rEur, rPct, rEsc } from '../reportPdf'
import { ENERGY_MODE_LABEL } from '@/lib/property/energy'
import { NOT_TAX_DEPRECIATION_NOTE } from '@/lib/inventory/depreciation'
import { ABSENT, ABSENT_DATE } from '@/components/Theme'
import { INK, INK_FAINT, INK_MUTED, PAPER_ALT, RULE } from '@/lib/print/ink'
import { INVENTORY_CATEGORIES, type InventoryItem, type InventoryRepair } from './model'
import {
  calcCurrentValue, calcDepreciationPct, calcAgeDisplay, calcMonthlyKwh, calcMonthlyCost,
  hasEnergy, fmtDate,
} from './calc'

// Κάρτες με φωτογραφία: ο ασφαλιστής κοιτάζει ΤΙ είναι το αντικείμενο, όχι
// γραμμές πίνακα. Δύο ανά σειρά και καμία δεν κόβεται στη μέση στο τύπωμα.
const INSURANCE_CSS = `
  .kpis{grid-template-columns:repeat(3,1fr)}
  .cards{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:22px}
  .c{border:1px solid ${RULE};border-radius:10px;overflow:hidden;display:flex;break-inside:avoid}
  .ph{width:120px;flex-shrink:0;background:${PAPER_ALT}}
  .ph img{width:120px;height:100%;min-height:120px;object-fit:cover;display:block}
  .noph{width:120px;height:120px;display:flex;align-items:center;justify-content:center;color:${INK_FAINT};font-size: 11px;text-align:center}
  .cb{padding:10px 12px;flex:1;min-width:0}
  .nm{font-size:13px;font-weight:600;color:${INK};margin-bottom:2px}
  .mt{font-size: 11px;color:${INK_MUTED};margin-bottom:6px}
  .sn{font-size: 11px;color:${INK_MUTED};font-family:'Roboto Mono',monospace;margin-bottom:6px}
  .crow{display:flex;justify-content:space-between;font-size:11px;padding:2px 0;border-top:1px solid ${RULE};color:${INK_MUTED}}
  .crow span:last-child{font-variant-numeric:tabular-nums;font-weight:600;color:${INK}}
`

export function inventoryExports({items,repairs,kwhPrice}:{items:InventoryItem[];repairs:InventoryRepair[];kwhPrice:number}) {
  const totalCurrent=items.reduce((s,i)=>s+calcCurrentValue(i),0)
  const totalRepairs=repairs.reduce((s,r)=>s+(r.cost||0),0)
  const electricItems=items.filter(hasEnergy)
  const totalMonthlyCost=electricItems.reduce((s,i)=>s+calcMonthlyCost(i,kwhPrice),0)
  // Η ασφαλιστέα αξία είναι ΜΟΝΟ ό,τι έχει δηλωθεί ως κόστος αντικατάστασης.
  // Το «τρέχουσα × 1,1» έφυγε από παντού: έβγαζε νούμερο για κάθε αντικείμενο,
  // ακόμη κι όταν κανείς δεν είχε πει πόσο κοστίζει σήμερα το καινούργιο.
  const declaredRepl=items.filter(i=>(i.replacement_cost||0)>0)
  const totalDeclaredRepl=declaredRepl.reduce((s,i)=>s+(i.replacement_cost||0),0)
  const missingRepl=items.length-declaredRepl.length
  // ΔΥΟ ΛΑΘΗ ΣΕ ΜΙΑ ΕΞΑΓΩΓΗ, ΚΑΙ ΤΑ ΔΥΟ ΑΘΟΡΥΒΑ:
  //
  //   1. Ήταν χειροποίητο .csv, ενώ οι άλλες δεκαεπτά εξαγωγές της εφαρμογής
  //      παράγουν προσεγμένο .xlsx. Ο παραλήπτης έπαιρνε άλλο πράγμα από την
  //      απογραφή και άλλο από όλα τα υπόλοιπα.
  //   2. Η προστασία από ένεση τύπου γινόταν με τη `csvSafe()`, που επέστρεφε
  //      το κείμενο ΑΥΤΟΥΣΙΟ — ένα αντικείμενο ονομασμένο «=1+1» έφευγε ως
  //      ζωντανός τύπος του Excel. Το σχόλιο δίπλα της έλεγε ότι εξουδετερώνει
  //      «=,+,-,@». Δεν εξουδετέρωνε τίποτα και το όνομα την έκανε να μοιάζει
  //      με άμυνα που υπάρχει.
  //
  // Το .xlsx γράφει συμβολοσειρές ως συμβολοσειρές — δεν υπάρχει ένεση τύπου
  // εξαρχής — και τα ποσά φεύγουν ως αριθμοί, οπότε η απογραφή αθροίζεται.
  const exportCSV=()=>{
    downloadTableXlsx('Απογραφή ακινήτου', {
      title: 'Απογραφή ακινήτου',
      headers:['Ονομασία','Κατηγορία','Δωμάτιο','Μάρκα','Μοντέλο','Σειριακός','Κατάσταση','Αξία αγοράς (€)','Εκτιμώμενη υπολειπόμενη αξία (€)','Ποσοστό υπολειπόμενης αξίας','Κόστος αντικατάστασης (€)','Ενεργειακή κλάση','Τρόπος μέτρησης','kWh ανά 100 κύκλους','Κύκλοι ανά μήνα','kWh ανά έτος','Watt','Ώρες ανά ημέρα','kWh ανά μήνα','Κόστος ρεύματος ανά μήνα (€)','Ηλικία','Ημερομηνία αγοράς','Λήξη εγγύησης','Σημειώσεις'],
      rows: items.map(i=>[i.name,i.category,i.room,i.brand,i.model,i.serial_number,i.condition,i.purchase_value||'',calcCurrentValue(i),Math.max(0,100-calcDepreciationPct(i)),i.replacement_cost||'',i.energy_class||'',i.energy_mode?ENERGY_MODE_LABEL[i.energy_mode]:'',i.kwh_per_100_cycles||'',i.cycles_per_month||'',i.annual_kwh||'',i.power_watts||'',i.daily_hours_use||'',hasEnergy(i)?calcMonthlyKwh(i):'',kwhPrice>0?calcMonthlyCost(i,kwhPrice):'',calcAgeDisplay(i.purchase_date),i.purchase_date,i.warranty_expiry,i.notes]),
    })
  }
  const exportPDF=()=>{
    const byCat=[...INVENTORY_CATEGORIES].map(cat=>{const ci=items.filter(i=>i.category===cat);return{cat,count:ci.length,val:ci.reduce((s,i)=>s+calcCurrentValue(i),0)}}).filter(x=>x.count>0)
    const catRows=byCat.sort((a,b)=>b.val-a.val).map(({cat,count,val})=>reportRow(`${cat} (${count})`,rEur(val))).join('')
    const detailRows=items.map(i=>`<tr><td><strong>${rEsc(i.name)}</strong>${i.brand?`<br><small class="muted">${rEsc(i.brand)} ${rEsc(i.model||'')}</small>`:''}</td><td>${rEsc(i.energy_class||ABSENT)}</td><td>${rEsc(i.condition)}</td><td class="n">${rEsc(rEur(i.purchase_value||0))}</td><td class="n">${rEsc(rEur(calcCurrentValue(i)))}</td><td class="n">${rEsc(rPct(Math.max(0,100-calcDepreciationPct(i))))}</td><td class="n">${rEsc(rEur(i.replacement_cost||0))}</td><td class="n">${rEsc(hasEnergy(i)?calcMonthlyKwh(i)+' kWh':ABSENT)}</td><td>${rEsc(i.warranty_expiry?fmtDate(i.warranty_expiry):ABSENT_DATE)}</td></tr>`).join('')
    const html = reportHead('Κατάσταση εξοπλισμού')
      + `<body><div class="page">`
      + reportHeader(null, 'Κατάσταση εξοπλισμού')
      + `<h1>Κατάσταση εξοπλισμού</h1>`
      + `<div class="sub">${rEsc(String(items.length))} αντικείμενα</div>`
      + reportSection('Σύνοψη')
      + `<div class="kpis">${reportKpi('Εκτιμώμενη υπολειπόμενη αξία', rEur(totalCurrent))}${reportKpi('Δηλωμένο κόστος αντικατάστασης', rEur(totalDeclaredRepl))}${reportKpi('Επισκευές', rEur(totalRepairs))}${electricItems.length>0&&kwhPrice>0?reportKpi('Ρεύμα/Μήνα', rEur(totalMonthlyCost)):''}</div>`
      + reportSection('Ανά κατηγορία')
      + `<table><tbody>${catRows}</tbody></table>`
      + reportSection('Αναλυτικός κατάλογος')
      + `<table><thead><tr><th>Αντικείμενο</th><th>Κλάση</th><th>Κατάσταση</th><th class="n">Αξία αγοράς</th><th class="n">Εκτιμώμενη υπολειπόμενη</th><th class="n">Ποσοστό που μένει</th><th class="n">Κόστος αντικατάστασης</th><th class="n">kWh/μήνα</th><th>Εγγύηση</th></tr></thead><tbody>${detailRows}</tbody></table>`
      + reportDisclaimer(`Η παρούσα κατάσταση έχει ενημερωτικό χαρακτήρα. Οι υπολειπόμενες αξίες προκύπτουν από γραμμική μείωση πάνω σε τυπική διάρκεια ζωής ανά κατηγορία και δεν αποτελούν επίσημη εκτίμηση. ${NOT_TAX_DEPRECIATION_NOTE} Το κόστος αντικατάστασης είναι όσο έχει δηλώσει ο ιδιοκτήτης· όπου λείπει, δεν συμπληρώνεται από εμάς.${missingRepl>0?` Λείπει σε ${missingRepl} από ${items.length} αντικείμενα.`:''}`)
      + `</div></body></html>`
    openReport(html)
  }
  // Εικονογραφημένη έκθεση για ασφαλιστική — μία «κάρτα» ανά αντικείμενο με φωτογραφία
  // και ΤΟ ΔΗΛΩΜΕΝΟ κόστος αντικατάστασης. Όπου λείπει, γράφεται «δεν δηλώθηκε»:
  // ο ασφαλιστής πρέπει να δει το κενό, όχι ένα νούμερο που φτιάξαμε εμείς.
  const insurableOf=(i:InventoryItem)=> (i.replacement_cost||0)>0?i.replacement_cost:0
  const totalInsurable=totalDeclaredRepl
  const exportInsurancePDF=()=>{
    const card=(i:InventoryItem)=>{const ph=i.photo_url||((i.photos||[]).filter(Boolean)[0]||'')
      return `<div class="c">
        <div class="ph">${ph?`<img src="${rEsc(ph)}"/>`:'<div class="noph">Χωρίς φωτογραφία</div>'}</div>
        <div class="cb"><div class="nm">${rEsc(i.name)}</div>
        <div class="mt">${rEsc([i.brand,i.model].filter(Boolean).join(' ')||i.category)}${i.room?` · ${rEsc(i.room)}`:''}</div>
        ${i.serial_number?`<div class="sn">Σειριακός ${rEsc(i.serial_number)}</div>`:''}
        <div class="crow"><span>Κατάσταση</span><span>${rEsc(i.condition)}</span></div>
        <div class="crow"><span>Αξία αγοράς</span><span>${rEsc(rEur(i.purchase_value||0))}</span></div>
        <div class="crow val"><span>Κόστος αντικατάστασης</span><span>${insurableOf(i)>0?rEsc(rEur(insurableOf(i))):'Δεν δηλώθηκε'}</span></div>
        </div></div>`}
    const html = reportHead('Έκθεση ασφάλισης περιεχομένου', INSURANCE_CSS)
      + `<body><div class="page">`
      + reportHeader(null, 'Έκθεση ασφάλισης περιεχομένου', {
          rightNote: `${items.length} ${items.length===1?'αντικείμενο':'αντικείμενα'} με φωτογραφική τεκμηρίωση`,
        })
      + `
    <h1>Ασφαλιστέο περιεχόμενο</h1>
    <div class="kpis" style="margin-top:20px">
      ${reportKpi('Δηλωμένο κόστος αντικατάστασης', rEur(totalInsurable))}
      ${reportKpi('Εκτιμώμενη υπολειπόμενη αξία', rEur(totalCurrent))}
      ${reportKpi(missingRepl>0?`Αντικείμενα, λείπει σε ${missingRepl}`:'Αντικείμενα', String(items.length))}
    </div>
    <div class="cards">${items.map(card).join('')}</div>
    ${reportDisclaimer(`Η ασφαλιστέα αξία εξοπλισμού είναι το κόστος ΑΝΤΙΚΑΤΑΣΤΑΣΗΣ ΜΕ ΚΑΙΝΟΥΡΓΙΟ, όχι η υπολειπόμενη αξία. Εδώ αθροίζονται μόνο τα ποσά που δήλωσε ο ιδιοκτήτης· ${missingRepl>0?`για ${missingRepl} από ${items.length} αντικείμενα δεν έχει δηλωθεί και ΔΕΝ έχουν υπολογιστεί — η κάλυψη πρέπει να συμπληρωθεί πριν την ασφάλιση.`:'έχει δηλωθεί για όλα τα αντικείμενα.'} Οι φωτογραφίες αποτελούν τεκμηρίωση του ιδιοκτήτη κατά την ημερομηνία έκδοσης.`)}
    </div></body></html>`
    openReport(html)
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // ΤΡΕΙΣ ΕΞΑΓΩΓΕΣ, ΟΧΙ ΤΡΕΙΣ ΚΑΡΤΕΣ ΥΨΟΥΣ ΔΙΑΚΟΣΙΩΝ ΕΙΚΟΝΟΣΤΟΙΧΕΙΩΝ
  // ─────────────────────────────────────────────────────────────────────────
  // Ήταν τρεις κάρτες σε πλέγμα. Η καθεμία έγραφε τον τίτλο της ΔΥΟ φορές (μία ως
  // επικεφαλίδα, μία ως ετικέτα του κουμπιού) και επαναλάμβανε το ΙΔΙΟ πλαίσιο
  // «N αντικείμενα · X €· ρεύμα Y €» — δηλαδή το ίδιο ζεύγος αριθμών τυπωνόταν
  // τρεις φορές στην ίδια οθόνη, κάτω από τη σειρά μετρικών που το έλεγε ήδη.
  //
  // Μια εξαγωγή είναι ενέργεια, όχι μετρική. Τρεις ενέργειες είναι τρεις γραμμές:
  // τι παράγει, για ποιον και ένα κουμπί. Το ύψος έπεσε από τρεις κάρτες συν ένα
  // πλαίσιο σε μία κάρτα τριών γραμμών.
  //
  // Η πρόταση για την υπασφάλιση ζει ΜΟΝΟ εδώ, στην περιγραφή της έκθεσης που
  // αφορά τον ασφαλιστή. Το ίδιο κείμενο υπήρχε και ως χωριστό πλαίσιο από κάτω.
  // ═══════════════════════════════════════════════════════════════════════════
  return [
    {key:'pdf',   label:'Κατάσταση εξοπλισμού σε PDF',           description:'Αξίες, ενεργειακές κλάσεις, ηλικία και εγγυήσεις, έτοιμη για εκτύπωση.', onClick:exportPDF},
    {key:'insur', label:'Έκθεση για τον ασφαλιστή',  description:missingRepl>0
      ? `Φωτογραφία και κόστος αντικατάστασης ανά αντικείμενο. Λείπει από ${missingRepl} στα ${items.length} και γράφεται ρητά: ελλιπές άθροισμα σημαίνει υπασφάλιση που φαίνεται μόνο μετά τη ζημιά.`
      : 'Φωτογραφία και κόστος αντικατάστασης ανά αντικείμενο, για όλα.', onClick:exportInsurancePDF},
    {key:'csv',   label:'Αναλυτικά δεδομένα σε Excel', description:'Όλα τα πεδία σε αρχείο για λογιστικά φύλλα.', onClick:exportCSV},
  ]
}
