'use client'

import { useState, useCallback, useMemo } from 'react'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import * as tenantStore from '@/lib/data/tenants'
import { CustomSelect, TextInput } from './UIComponents'
import { T, PageTitle, KPIGrid, Btn, EmptyState, Skeleton, SkeletonKPIs, fe, feRate, fn, pressable, Bar } from '@/components/Theme'
import { PackageOpen, SearchX, Archive } from 'lucide-react'
import { portfolioSummary, replacementSuggestion, NOT_TAX_DEPRECIATION_NOTE } from '@/lib/inventory/depreciation'
import type { FieldContext } from '@/lib/property/fields'
import { readStatus, statusLabel, type StatusRow } from '@/lib/property/status'
import { notifyError, notifyOk } from '@/components/Toast'
import { confirmDialog } from '@/components/confirmBus'
import { ActionMenu } from '@/components/ActionMenu'
import { failed } from '@/lib/core/dbError'
import type { InventoryItemsRow } from '@/lib/supabase/tables'
// Η απογραφή έχει ένα σπίτι: lib/data/inventory.
import * as inventory from '@/lib/data/inventory'
import * as calendar from '@/lib/data/calendar'

// ═══ Η ΑΠΟΓΡΑΦΗ ΣΕ ΕΝΝΕΑ ΑΡΧΕΙΑ, ΟΧΙ ΣΕ ΕΝΑ ══════════════════════════════
// Ήταν 2.497 γραμμές: ο τύπος του αντικειμένου, οι κατάλογοι, οι υπολογισμοί,
// έντεκα μικρά στοιχεία οθόνης, τρία παράθυρα, τρεις καρτέλες και οι εξαγωγές,
// όλα στο ίδιο σημείο. Ό,τι κι αν άλλαζε κανείς, φόρτωνε ολόκληρο το αρχείο.
//
// Ο ΔΙΑΧΩΡΙΣΜΟΣ ΕΓΙΝΕ ΚΑΤΑ ΑΝΤΙΚΕΙΜΕΝΟ ΕΥΘΥΝΗΣ, ΟΧΙ ΚΑΤΑ ΜΕΓΕΘΟΣ: το μοντέλο
// δεν εκτελεί τίποτα, οι υπολογισμοί δεν ξέρουν από οθόνη, τα μικρά στοιχεία
// δεν ξέρουν από βάση και κάθε παράθυρο στέκεται μόνο του. Εδώ μένει η σελίδα:
// τι φορτώνεται, τι αποθηκεύεται και ποια καρτέλα φαίνεται.
import { INVENTORY_CATEGORIES, type InventoryItem, type InventoryRepair, type InventoryHandover, type MaintenanceSchedule, type HandoverIntent, type InventoryPropertyOption, type TabInventoryProps, ROOM_PRESETS, STARTER_PACK } from './inventory/model'
import { calcCurrentValue, calcDepreciationPct, calcYearsLeft, calcAgeDisplay, calcMonthlyKwh, calcMonthlyCost, hasEnergy, fmtDate, daysUntil, warrantyStatus, needsAction } from './inventory/calc'
import { DOCS_BUCKET } from './inventory/storage'
import { InfoHint } from './InfoHint'
import { Badge, EnergyBadge, DepBar, ReplacementHint, InlineConditionEdit, OverflowMenu, SelectBox, BulkPicker, SectionLabel, QRModal, cardStyle, quietAction, IconEdit, IconRepair, IconQR, IconCal, IconTrash, type OverflowAction } from './inventory/Bits'
import { ItemFormModal } from './inventory/ItemFormModal'
import { RepairModal } from './inventory/RepairModal'
import { BulkImportModal } from './inventory/BulkImportModal'
import { HandoverTab } from './inventory/HandoverTab'
import { MaintenanceTab } from './inventory/MaintenanceTab'
import { inventoryExports } from './inventory/exports'
import { useLoad } from '@/app/hooks/useLoad';
import { toggleIn } from '@/lib/core/toggleSet';

export { INVENTORY_CATEGORIES }
export type { HandoverIntent }

const supabase = createSupabaseClient()

// ═══════════════════════════════════════════════════════════════════════════
// ΤΕΣΣΕΡΑ ΕΠΙΝΟΗΜΕΝΑ ΝΟΥΜΕΡΑ ΠΟΥ ΕΦΥΓΑΝ ΑΠΟ ΑΥΤΗ ΤΗΝ ΟΘΟΝΗ
//
// 1. «Ασφαλιστέα Αξία» = τρέχουσα × 1,1, ως KPI ισότιμο με πραγματικά νούμερα.
//    Η ασφαλιστέα αξία εξοπλισμού είναι κόστος ΑΝΤΙΚΑΤΑΣΤΑΣΗΣ ΜΕ ΚΑΙΝΟΥΡΓΙΟ, όχι
//    αποσβεσμένη αξία +10%. Όποιος ασφαλιζόταν με βάση αυτό ήταν υπασφαλισμένος
//    και θα το μάθαινε ΜΕΤΑ τη ζημιά. → Τώρα αθροίζονται μόνο τα ΔΗΛΩΜΕΝΑ κόστη
//    αντικατάστασης και λέγεται ρητά για πόσα αντικείμενα λείπει το νούμερο.
//
// 2. «Αναβάθμιση N συσκευών → X €/χρόνο» σε πράσινο πλαίσιο. Τρία επινοημένα
//    μαζί: σταθερά 0,5 (κάθε αντικατάσταση κόβει τη μισή κατανάλωση), η κλάση A
//    μετρημένη στα «κακά» και τιμή ρεύματος 0,22 €/kWh που σωζόταν σιωπηλά ως
//    δεδομένο σε κάθε άκυρη είσοδο — και χωρίς να αφαιρείται το κόστος αγοράς
//    («θα κερδίσεις 180 €/χρόνο» για συσκευή 1.200 €). → Μένει μόνο η ΜΕΤΡΗΣΗ:
//    τι κοστίζει η συσκευή τον μήνα, ΣΤΗΝ ΤΙΜΗ ΠΟΥ ΔΗΛΩΝΕΙ Ο ΛΟΓΑΡΙΑΣΜΟΣ ΣΟΥ.
//    Χωρίς τιμή δεν εμφανίζεται κόστος: εμφανίζονται kWh και ζητείται η τιμή.
//
// 3. «Απόσβεση» ως τίτλος σε επαγγελματία. Ο επαγγελματίας έχει ΝΟΜΙΜΟΥΣ
//    συντελεστές (ΚΦΕ άρθρο 24) που δεν είναι αυτοί. → Παντού «εκτιμώμενη
//    υπολειπόμενη αξία», με ρητή σημείωση και το μπλοκ «Χαρτοφυλακίου» έφυγε.
//
// 4. «Εξοικονόμηση από εκπτώσεις» σε πράσινο: δεν είναι εξοικονόμηση, είναι η
//    έκπτωση που πήρες κάποτε. Μαζί έφυγαν τα πέντε πεδία που το τροφοδοτούσαν.
//
// ΚΑΙ ΠΟΙΑ ΠΕΔΙΑ ΒΛΕΠΕΙ Ο ΧΡΗΣΤΗΣ: το αποφασίζει το lib/property/fields.ts, όχι
// αυτή η φόρμα. Απογραφή εξοπλισμού υπάρχει ΜΟΝΟ σε επιπλωμένο ακίνητο που
// νοικιάζεται· σε ιδιοχρησία ή κενό δεν υπάρχει εξοπλισμός να παραδοθεί.
// ═══════════════════════════════════════════════════════════════════════════



// Χωρίς `profileType`: ο επαγγελματίας δεν βλέπει πια ΔΙΑΦΟΡΕΤΙΚΑ νούμερα αξίας.
// Έβλεπε τέσσερα επιπλέον κελιά κάτω από τον τίτλο «Απόσβεση», που είναι ακριβώς
// ο χρήστης για τον οποίο η λέξη σημαίνει κάτι νομικά διαφορετικό.
// ═══════════════════════════════════════════════════════════════════════════
// ΜΙΑ ΣΕΛΙΔΑ, ΜΙΑ ΙΕΡΑΡΧΙΑ
// ─────────────────────────────────────────────────────────────────────────
// Ήταν τρεις υποκαρτέλες: «Αντικείμενα», «Εγγυήσεις και Συντήρηση»,
// «Επισκόπηση». Τρία κλικ για να δεις την κατάσταση ενός σπιτιού με δέκα
// αντικείμενα και η ίδια πληροφορία σε δύο από τις τρεις: η εγγύηση που λήγει
// ήταν και στο «Χρειάζονται προσοχή» της Επισκόπησης και σε δική της ενότητα
// στη Φροντίδα· η κατάσταση του αντικειμένου ήταν και σήμα στην κάρτα του και
// γραμμή στη λίστα προσοχής.
//
// Τώρα η σελίδα διαβάζεται από πάνω προς τα κάτω σαν πρόταση:
//   τι πρέπει να κάνω → τι έχω → τι έχω προγραμματίσει → πού πάει το ρεύμα
//   και η αξία → τι έχω παραδώσει.
// Κάθε πράγμα λέγεται σε ΕΝΑ σημείο, εκείνο όπου μπορείς να το κάνεις.
// ═══════════════════════════════════════════════════════════════════════════
function AttentionCard({items,onEdit,onWarrantyReminder}:{items:InventoryItem[];onEdit:(i:InventoryItem)=>void;onWarrantyReminder:(i:InventoryItem)=>void}) {
  const [pushed,setPushed] = useState<Set<string>>(new Set())
  // ΜΙΑ ΛΙΣΤΑ, ΤΑΞΙΝΟΜΗΜΕΝΗ ΚΑΤΑ ΣΟΒΑΡΟΤΗΤΑ, ΧΩΡΙΣ ΧΡΩΜΑ.
  // Η σοβαρότητα φαίνεται από τη ΣΕΙΡΑ: πρώτα ό,τι χάλασε, μετά ό,τι γερνά,
  // τελευταία η εγγύηση που τρέχει. Μια κόκκινη κουκκίδα δεν προσθέτει τίποτα
  // που δεν λέει ήδη η θέση και σε όποιον δεν ξεχωρίζει χρώματα δεν λέει τίποτα.
  const attention = (() => {
    const out: {item:InventoryItem;label:string;kind:'cond'|'repl'|'warr'}[] = []
    const seen = new Set<string>()
    const add = (list:InventoryItem[], label:string, kind:'cond'|'repl'|'warr') =>
      list.forEach(i=>{ if(seen.has(i.id))return; out.push({item:i,label,kind}); seen.add(i.id) })
    add(items.filter(i=>i.condition==='Κακή'||i.condition==='Εκτός Λειτουργίας'), 'Κακή κατάσταση', 'cond')
    add(items.filter(i=>replacementSuggestion(i).suggested), 'Προτείνεται αντικατάσταση', 'repl')
    add(items.filter(i=>{const d=daysUntil(i.warranty_expiry);return d>=0&&d<=90}), 'Η εγγύηση λήγει σύντομα', 'warr')
    return out
  })()

  // ═══ ΚΑΡΤΑ ΠΛΗΡΟΥΣ ΠΛΑΤΟΥΣ ΓΙΑ ΝΑ ΠΕΙ ΟΤΙ ΔΕΝ ΣΥΜΒΑΙΝΕΙ ΤΙΠΟΤΑ ═══════════
  // Είχε εικονίδιο σε κύκλο 36 εικονοστοιχείων, τίτλο στα 14 και υπότιτλο που
  // απαριθμούσε τρία πράγματα που ΔΕΝ υπάρχουν: «καμία εγγύηση κοντά στη λήξη,
  // καμία κακή κατάσταση, καμία πρόταση αντικατάστασης». Τρεις αρνήσεις, ένα
  // κουτί, μηδέν πληροφορία· σε κινητό ένα ολόκληρο σκρολ πριν φανεί το
  // πρώτο αντικείμενο.
  //
  // ΚΑΙ ΤΟ ΚΥΡΙΟΤΕΡΟ: η ίδια η απουσία της κάρτας «Χρειάζονται προσοχή» ΕΙΝΑΙ το
  // μήνυμα. Οταν κάτι χρειάζεται προσοχή, εμφανίζεται και το βλέπεις. Οταν όχι,
  // δεν υπάρχει τίποτα να διαβάσεις.
  if(attention.length===0) return null

  return (
    <div style={cardStyle}>
      <SectionLabel label="Χρειάζονται προσοχή" right={<span style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',fontFamily:T.font.sans}}>{attention.length} {attention.length===1?'αντικείμενο':'αντικείμενα'}</span>}/>
      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        {attention.slice(0,6).map(({item,label,kind})=>(
          <div key={item.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 12px',background:'var(--bg-elevated)',borderRadius:T.radius.inner,border:'1px solid var(--border-subtle)'}}>
            <div style={{minWidth:0,flex:1}}>
              <p className="po-elide" style={{fontSize: 'var(--fs-base)',fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)'}}>{item.name}</p>
              <p className="po-elide-lines" style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',fontFamily:T.font.sans}}>
                {label}{item.room?` · ${item.room}`:''}
                {kind==='warr'&&item.warranty_expiry?` · ${fmtDate(item.warranty_expiry)}`:''}
                {kind==='repl'&&item.replacement_cost?` · ${fe(item.replacement_cost)}`:''}
              </p>
            </div>
            {/* ΜΙΑ ΕΝΕΡΓΕΙΑ ΑΝΑ ΓΡΑΜΜΗ, ΕΚΕΙΝΗ ΠΟΥ ΛΥΝΕΙ ΤΟ ΣΥΓΚΕΚΡΙΜΕΝΟ.
                Πριν, η γραμμή έδειχνε ένα σήμα κατάστασης, δηλαδή ξανάλεγε την
                αιτία που μόλις διαβάστηκε δίπλα και δεν πρόσφερε τίποτα να κάνεις. */}
            {kind==='warr'
              ? <button onClick={()=>{onWarrantyReminder(item);setPushed(p=>new Set(p).add(item.id))}} disabled={pushed.has(item.id)}
                  style={{flexShrink:0,padding:'0 12px',height:T.h.sm,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'var(--bg-surface)',color:pushed.has(item.id)?'var(--text-tertiary)':'var(--text-secondary)',fontSize:12,fontFamily:T.font.sans,fontWeight:500,cursor:pushed.has(item.id)?'default':'pointer',whiteSpace:'nowrap'}}>
                  {pushed.has(item.id)?'Στο ημερολόγιο':'Υπενθύμιση'}
                </button>
              : <button onClick={()=>onEdit(item)}
                  style={{flexShrink:0,padding:'0 12px',height:T.h.sm,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'var(--bg-surface)',color:'var(--text-secondary)',fontSize:12,fontFamily:T.font.sans,fontWeight:500,cursor:'pointer',whiteSpace:'nowrap'}}>
                  Άνοιγμα
                </button>}
          </div>
        ))}
      </div>
      {attention.length>6&&<p style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',fontFamily:T.font.sans,marginTop:10,textAlign:'center'}}>και {attention.length-6} ακόμη, με το φίλτρο «Προσοχή» παρακάτω</p>}
    </div>
  )
}

// Πού πάει η αξία και πού πάει το ρεύμα. Δύο κάρτες δίπλα δίπλα και ΜΟΝΟ όταν
// υπάρχει τι να δείξουν: χωρίς μετρημένη κατανάλωση δεν υπάρχει κάρτα ρεύματος.
function AnalysisCards({items,repairs,kwhPrice,kwhControl}:{items:InventoryItem[];repairs:InventoryRepair[];kwhPrice:number;kwhControl?:React.ReactNode}) {
  const totalRepairs = repairs.reduce((s,r)=>s+(r.cost||0),0)
  const electricItems = items.filter(hasEnergy)
  const byCategory = [...INVENTORY_CATEGORIES].map(cat=>{const ci=items.filter(i=>i.category===cat);return{cat,count:ci.length,val:ci.reduce((s,i)=>s+calcCurrentValue(i),0)}}).filter(x=>x.count>0)
  const maxVal = Math.max(...byCategory.map(x=>x.val),1)
  // ΚΑΤΑΝΟΜΗ ΧΩΡΙΣ ΤΙΠΟΤΑ ΝΑ ΚΑΤΑΝΕΜΗΘΕΙ. Οταν κανένα αντικείμενο δεν έχει
  // δηλωμένη τιμή αγοράς, η κάρτα τύπωνε τέσσερις γραμμές «0,00 €» με μπάρες
  // ίδιου μήκους: ένα γράφημα που δείχνει ότι όλα είναι ίσα με το μηδέν. Το
  // πλήθος ανά κατηγορία το λέει ήδη το πλακίδιο «Αντικείμενα» και το φίλτρο.
  const hasAnyValue = byCategory.some(x=>x.val>0)
  const topEnergy = [...electricItems].sort((a,b)=>calcMonthlyCost(b,kwhPrice)-calcMonthlyCost(a,kwhPrice)).slice(0,5)

  const categoriesCard = !hasAnyValue ? null : (
    <div style={cardStyle}>
      <SectionLabel label="Κατανομή αξίας ανά κατηγορία"/>
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        {byCategory.sort((a,b)=>b.val-a.val).map(({cat,count,val})=>(
          <div key={cat}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:10,marginBottom: 4}}>
              {/* ΤΟ ΠΛΗΘΟΣ ΔΕΝ ΚΟΒΕΤΑΙ ΜΑΖΙ ΜΕ ΤΟ ΟΝΟΜΑ. Ηταν φωλιασμένο μέσα στο
                  ίδιο κουτί με τα αποσιωπητικά, οπότε σε στενή οθόνη με μεγαλωμένο
                  κείμενο χανόταν το «(4)». Τώρα κόβεται μόνο η κατηγορία· ο αριθμός
                  των αντικειμένων μένει πάντα ορατός. */}
              <span style={{display:'flex',alignItems:'baseline',gap: 4,minWidth:0,fontSize:12,color:'var(--text-secondary)',fontFamily:T.font.sans}}>
                <span className="po-elide">{cat}</span>
                <span style={{color:'var(--text-tertiary)',fontSize: 'var(--fs-xs)',flexShrink:0}}>({count})</span>
              </span>
              <span style={{fontSize:12,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:600,flexShrink:0}}>{fe(val)}</span>
            </div>
            <Bar pct={(val/maxVal)*100} height={4} label={`Μερίδιο αξίας, ${cat}`}/>
          </div>
        ))}
      </div>
      {totalRepairs>0&&(
        <div style={{marginTop:14,paddingTop:12,borderTop:'1px solid var(--border-subtle)',display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:10}}>
          <span style={{fontSize:12,color:'var(--text-secondary)',fontFamily:T.font.sans}}>Επισκευές έως τώρα</span>
          <span style={{fontSize:12,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:600}}>{fe(totalRepairs)}</span>
        </div>
      )}
    </div>
  )

  if(electricItems.length===0) return categoriesCard
  return (
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,300px),1fr))',gap:16,alignItems:'start'}}>
      <div style={cardStyle}>
        <SectionLabel label="Κατανάλωση ρεύματος" right={kwhControl}/>
        {topEnergy.map(item=>{
          const mc=calcMonthlyCost(item,kwhPrice); const maxMc=calcMonthlyCost(topEnergy[0],kwhPrice)
          return (
            <div key={item.id} style={{marginBottom:10}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4,gap:8}}>
                <div style={{display:'flex',alignItems:'center',gap:6,minWidth:0}}>
                  {item.energy_class&&<EnergyBadge cls={item.energy_class}/>}
                  <span className="po-elide" style={{fontSize: 'var(--fs-xs)',color:'var(--text-primary)',fontFamily:T.font.sans}}>{item.name}</span>
                </div>
                <span style={{fontSize: 'var(--fs-xs)',fontFamily:T.font.num,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:700,flexShrink:0}}>{kwhPrice>0?`${fe(mc)} τον μήνα`:`${fn(calcMonthlyKwh(item),1)} kWh`}</span>
              </div>
              <Bar pct={maxMc>0?(mc/maxMc)*100:0} height={3} label={`Μερίδιο κατανάλωσης, ${item.name}`}/>
            </div>
          )
        })}
        {kwhPrice<=0&&(
          <p style={{marginTop:12,fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',fontFamily:T.font.sans,lineHeight:1.5}}>
            Δεν έχεις δηλώσει τιμή ανά κιλοβατώρα, οπότε δείχνουμε μόνο κατανάλωση. Γράψε την τιμή του λογαριασμού σου δίπλα.
          </p>
        )}
      </div>
      {categoriesCard}
    </div>
  )
}

// Το ιστορικό παραδόσεων, με το κουμπί που το ανοίγει πάνω του.
function HandoverCard({handovers,onOpenHandover}:{handovers:InventoryHandover[];onOpenHandover:()=>void}) {
  return (
    <div style={cardStyle}>
      {/* ΤΟ «ΤΙ ΕΙΝΑΙ ΑΥΤΟ» ΠΗΓΕ ΣΤΟ ΚΥΚΛΑΚΙ. Χωρίς πρωτόκολλα, η κάρτα ήταν μια
          επικεφαλίδα, ένα κουμπί και μία πρόταση εξήγησης: το κουμπί λέει ήδη την
          κίνηση («Νέο πρωτόκολλο») και η εξήγηση κρατούσε δική της γραμμή σε κάθε
          φόρτωση, για πάντα. Τώρα διαβάζεται με πάτημα, από όποιον τη θέλει. */}
      <SectionLabel label="Παραδόσεις και παραλαβές" right={<span style={{display:'inline-flex',alignItems:'center',gap:8}}>
        <InfoHint label="Τι είναι το πρωτόκολλο παράδοσης">Καταγραφή της κατάστασης του εξοπλισμού στην είσοδο και στην έξοδο του ενοικιαστή. Είναι η απόδειξη για την εγγύηση.</InfoHint>
        <button onClick={onOpenHandover} style={{padding:'0 12px',height:28,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'var(--bg-elevated)',color:'var(--text-secondary)',fontSize:12,fontFamily:T.font.sans,fontWeight:500,cursor:'pointer'}}>{handovers.length>0?'Άνοιγμα':'Νέο πρωτόκολλο'}</button>
      </span>}/>
      {handovers.length===0
        ? null
        :<div style={{display:'flex',flexDirection:'column',gap:6}}>
          {[...handovers].sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()).slice(0,4).map(h=>{
            const snap=h.items_snapshot||[]; const bad=snap.filter(s=>s.condition_at_handover==='Κακή'||s.condition_at_handover==='Εκτός Λειτουργίας').length
            return (
              <div key={h.id} {...pressable(onOpenHandover)} style={{display:'flex',alignItems:'center',gap:12,padding:'9px 12px',background:'var(--bg-elevated)',borderRadius:T.radius.inner,border:'1px solid var(--border-subtle)',cursor:'pointer'}}>
                <Badge label={h.handover_type==='check_in'?'Είσοδος':'Έξοδος'} color="var(--text-secondary)"/>
                <div style={{minWidth:0,flex:1}}>
                  <p className="po-elide" style={{fontSize: 'var(--fs-base)',fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)'}}>{h.tenant_name}</p>
                  <p style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',fontFamily:T.font.sans}}>{fmtDate(h.handover_date)} · {snap.length} αντικείμενα</p>
                </div>
                {bad>0&&<span style={{fontSize: 'var(--fs-xs)',color:'var(--text-secondary)',fontFamily:T.font.sans,flexShrink:0}}>{bad} με φθορά</span>}
              </div>
            )
          })}
          {handovers.length>4&&<p style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',fontFamily:T.font.sans,textAlign:'center',marginTop:4}}>και {handovers.length-4} ακόμη</p>}
        </div>
      }
    </div>
  )
}


type SortKey = 'name'|'value'|'energy'|'age'|'depreciation'

function ItemsTab({items,kwhPrice,onAdd,onEdit,onDelete,onRepair,onQR,onUpdateCondition,onWarrantyReminder,onBulkDelete,onBulkRoom}:{
  items:InventoryItem[];kwhPrice:number
  onAdd:()=>void;onEdit:(i:InventoryItem)=>void;onDelete:(id:string)=>void
  onRepair:(i:InventoryItem)=>void;onQR:(i:InventoryItem)=>void
  onUpdateCondition:(id:string,c:string)=>void
  onWarrantyReminder:(i:InventoryItem)=>void
  onBulkDelete:(ids:string[])=>void;onBulkRoom:(ids:string[],room:string)=>void
}) {
  const [selectMode,setSelectMode] = useState(false)
  const [selected,setSelected] = useState<Set<string>>(new Set())
  const toggleSel = (id:string) => setSelected(p=>{return toggleIn(p, id)})
  const exitSelect = () => {setSelectMode(false);setSelected(new Set())}
  const [filterCat,setFilterCat] = useState('Όλες')
  const [filterRoom,setFilterRoom] = useState('Όλα')
  const [search,setSearch] = useState('')
  const [viewMode,setViewMode] = useState<'grid'|'list'>('grid')
  const [sortKey,setSortKey] = useState<SortKey>('name')
  const [sortDir,setSortDir] = useState<'asc'|'desc'>('asc')
  const [showNeedsAction,setShowNeedsAction] = useState(false)
  const allRooms = [...new Set(items.map(i=>i.room).filter(Boolean))]
  const actionCount = items.filter(needsAction).length
  // ΤΟ ΚΛΕΙΔΙ ΤΑΞΙΝΟΜΗΣΗΣ ΥΠΟΛΟΓΙΖΕΤΑΙ ΜΙΑ ΦΟΡΑ ΑΝΑ ΑΝΤΙΚΕΙΜΕΝΟ, ΟΧΙ ΑΝΑ ΣΥΓΚΡΙΣΗ.
  // Πριν, ο συγκριτής καλούσε `calcCurrentValue` / `calcMonthlyCost` μέσα του,
  // δηλαδή O(n log n) φορές — και όλο αυτό ξανά σε κάθε απόδοση, άρα σε κάθε
  // πλήκτρο της αναζήτησης. Τώρα: n υπολογισμοί, μέσα σε useMemo.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const kept = items.filter(item=>{
      if(showNeedsAction&&!needsAction(item)) return false
      if(filterCat!=='Όλες'&&item.category!==filterCat) return false
      if(filterRoom!=='Όλα'&&item.room!==filterRoom) return false
      if(q&&!item.name.toLowerCase().includes(q)&&!(item.brand||'').toLowerCase().includes(q)) return false
      return true
    })
    // Το όνομα συγκρίνεται ως κείμενο, όλα τα άλλα ως αριθμοί. Δύο ξεχωριστές
    // διαδρομές, ώστε ο τύπος να μη χρειάζεται να είναι `any` για να χωρέσουν.
    const dir = sortDir==='asc' ? 1 : -1
    if(sortKey==='name') return [...kept].sort((a,b)=>dir*a.name.localeCompare(b.name))
    const num=(i:InventoryItem):number =>
      sortKey==='value'        ? calcCurrentValue(i)
    : sortKey==='energy'       ? calcMonthlyCost(i,kwhPrice)
    : sortKey==='age'          ? (i.purchase_date?new Date(i.purchase_date).getTime():0)
    :                            calcDepreciationPct(i)
    return kept
      .map(item=>({ item, key: num(item) }))
      .sort((a,b)=>dir*(a.key-b.key))
      .map(d=>d.item)
  }, [items, showNeedsAction, filterCat, filterRoom, search, sortKey, sortDir, kwhPrice])
  const itemActions = (item:InventoryItem):OverflowAction[] => [
    {label:'Επεξεργασία',icon:IconEdit,onClick:()=>onEdit(item)},
    {label:'Επισκευές και ιστορικό',icon:IconRepair,onClick:()=>onRepair(item)},
    {label:'Κωδικός QR',icon:IconQR,onClick:()=>onQR(item)},
    ...(item.warranty_expiry?[{label:'Υπενθύμιση εγγύησης',icon:IconCal,onClick:()=>onWarrantyReminder(item)}]:[]),
    // Ο διάλογος είναι ασύγχρονος και ζει σε global host, όχι μέσα στο μενού: το
    // μενού προλαβαίνει να κλείσει πριν απαντήσει ο χρήστης, αλλά η υπόσχεση δεν
    // εξαρτάται από τον κόμβο του κουμπιού, άρα η διαγραφή εκτελείται κανονικά.
    {label:'Διαγραφή',icon:IconTrash,danger:true,onClick:async()=>{ if(await confirmDialog(`Διαγραφή «${item.name}»;`,{tone:'negative'})) onDelete(item.id) }},
  ]
  // ═══ ΤΕΣΣΕΡΑ ΧΕΙΡΙΣΤΗΡΙΑ, ΜΙΑ ΓΡΑΜΜΗ ΒΑΣΗΣ ══════════════════════════════
  // Τρία από τα τέσσερα φίλτρα δεν είχαν ετικέτα από πάνω και το τέταρτο είχε
  // («Ταξινόμηση»): μόνο αυτό κατέβαινε κατά το ύψος της ετικέτας και έσπαγε τη
  // γραμμή, με το κουμπί κατεύθυνσης να ακολουθεί.
  //
  // Η λύση δεν είναι τέσσερις ετικέτες αλλά καμία: οι δύο γείτονες λένε ήδη τι
  // κάνουν μέσα από την προεπιλογή τους («Ολες οι κατηγορίες», «Ολα τα
  // δωμάτια»). Η ταξινόμηση μιλά τώρα το ίδιο ιδίωμα, «Κατά όνομα», «Κατά
  // αξία», οπότε η ετικέτα περισσεύει και η γραμμή ισιώνει.
  const SORT_LABELS:Record<SortKey,string> = {name:'Κατά όνομα',value:'Κατά αξία',energy:'Κατά ρεύμα τον μήνα',age:'Κατά ηλικία',depreciation:'Κατά υπολειπόμενη αξία'}
  // Οι μαζικές ενέργειες δρουν ΜΟΝΟ σε ό,τι είναι επιλεγμένο ΚΑΙ ορατό στα τρέχοντα φίλτρα.
  const visIds = filtered.filter(i=>selected.has(i.id)).map(i=>i.id)

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
        {/* ΤΟ minWidth ΗΤΑΝ 180 ΚΑΙ Η ΥΠΟΔΕΙΞΗ ΘΕΛΕΙ 167 ΣΥΝ ΤΑ ΠΕΡΙΘΩΡΙΑ. Η πρώτη
            σάρωση της καρτέλας το έπιασε κομμένο στα 430 και στα 1024: το πεδίο
            έπεφτε στα 158 και το «Αντικείμενο ή μάρκα» έχανε το τέλος του. */}
        <div style={{flex:1,minWidth:210}}><TextInput ariaLabel="Αναζήτηση αντικειμένου" value={search} onChange={setSearch} placeholder="Αντικείμενο ή μάρκα" aria-label="Αναζήτηση απογραφής"/></div>
        {/* ΤΑ ΠΛΑΤΗ ΒΓΑΙΝΟΥΝ ΑΠΟ ΤΟ ΚΕΙΜΕΝΟ, ΚΑΙ ΤΟ ΚΕΙΜΕΝΟ ΕΙΝΑΙ ΕΛΛΗΝΙΚΟ.
            Το «Όλες οι κατηγορίες» και το «Όλα τα δωμάτια» είναι οι ΠΡΟΕΠΙΛΟΓΕΣ,
            δηλαδή αυτό που βλέπει ο χρήστης πριν αγγίξει τίποτα — και δεν
            χωρούσαν στα 150 και στα 140. Η ταξινόμηση έγραφε το πρόθεμα
            «Ταξινόμηση:» μέσα σε κάθε επιλογή· το πρόθεμα είναι ετικέτα και το
            CustomSelect έχει ήδη ετικέτα. */}
        <div style={{width:210}}><CustomSelect ariaLabel="Κατηγορία" value={filterCat} onChange={setFilterCat} options={['Όλες',...[...INVENTORY_CATEGORIES].filter(c=>items.some(i=>i.category===c))].map(c=>({value:c,label:c==='Όλες'?'Όλες οι κατηγορίες':c}))}/></div>
        {allRooms.length>0&&<div style={{width:190}}><CustomSelect ariaLabel="Δωμάτιο" value={filterRoom} onChange={setFilterRoom} options={[{value:'Όλα',label:'Όλα τα δωμάτια'},...allRooms.map(r=>({value:r,label:r}))]}/></div>}
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <div style={{width:212}}><CustomSelect ariaLabel="Ταξινόμηση" value={sortKey} onChange={v=>setSortKey(v as SortKey)} options={(Object.keys(SORT_LABELS) as SortKey[]).map(k=>({value:k,label:SORT_LABELS[k]}))}/></div>
          <button title={sortDir==='asc'?'Αύξουσα':'Φθίνουσα'} aria-label="Κατεύθυνση ταξινόμησης" onClick={()=>setSortDir(d=>d==='asc'?'desc':'asc')} style={{width:T.h.md,height:T.h.md,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'var(--bg-elevated)',color:'var(--text-secondary)',cursor:'pointer',fontFamily:T.font.sans,fontSize:14,flexShrink:0,display:'inline-flex',alignItems:'center',justifyContent:'center'}}><svg aria-hidden="true" width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{sortDir==='asc'?<path d="M12 19V5M5 12l7-7 7 7"/>:<path d="M12 5v14M19 12l-7 7-7-7"/>}</svg></button>
        </div>
        {actionCount>0&&<button onClick={()=>setShowNeedsAction(v=>!v)} title="Προβολή μόνο όσων χρειάζονται προσοχή" style={{padding:'0 12px',height:T.h.md,borderRadius:T.radius.pill,fontSize:12,cursor:'pointer',fontFamily:T.font.sans,fontWeight:500,border:`1px solid ${showNeedsAction?'var(--warning-border)':'var(--border-subtle)'}`,background:showNeedsAction?'var(--warning-soft)':'var(--bg-elevated)',color:showNeedsAction?'var(--warning)':'var(--text-secondary)',display:'flex',alignItems:'center',gap:6,whiteSpace:'nowrap'}}>
          Προσοχή <span style={{background:showNeedsAction?'var(--warning)':'var(--text-tertiary)',color:'var(--text-inverse)',borderRadius:T.radius.inner,padding:'0 6px',fontSize: 'var(--fs-xs)',fontWeight:700}}>{actionCount}</span>
        </button>}
        <button onClick={()=>selectMode?exitSelect():setSelectMode(true)} title="Επιλογή πολλών αντικειμένων" style={{padding:'0 12px',height:T.h.lg,borderRadius:T.radius.pill,fontSize:12,cursor:'pointer',fontFamily:T.font.sans,fontWeight:500,border:`1px solid ${selectMode?'var(--accent-border)':'var(--border-subtle)'}`,background:selectMode?'var(--accent-soft)':'var(--bg-elevated)',color:selectMode?'var(--accent)':'var(--text-secondary)',display:'flex',alignItems:'center',gap:6,whiteSpace:'nowrap'}}>
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
          {selectMode?'Ακύρωση':'Επιλογή'}
        </button>
        {/* 32 το κουμπί, 3 το γέμισμα, 1 το περίγραμμα: η ομάδα βγαίνει 40, όσο
            και οι επιλογείς δίπλα της. Με γέμισμα 2 έβγαινε 38. */}
        <div style={{display:'flex',border:'1px solid var(--border-subtle)',borderRadius:T.radius.pill,overflow:'hidden',padding: 4,background:'var(--bg-elevated)'}}>
          {(['grid','list'] as const).map(m=>(
            <button key={m} onClick={()=>setViewMode(m)} style={{height:T.h.sm,padding:'0 14px',fontSize:12,fontFamily:T.font.sans,cursor:'pointer',border:'none',borderRadius:T.radius.pill,background:viewMode===m?'var(--accent)':'transparent',color:viewMode===m?'var(--accent-text)':'var(--text-secondary)',fontWeight:viewMode===m?500:400,transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s'}}>{m==='grid'?'Κάρτες':'Λίστα'}</button>
          ))}
        </div>
      </div>
      {selectMode?(
        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',padding:'10px 14px',background:'var(--accent-soft)',border:'1px solid var(--accent-border)',borderRadius:T.radius.card}}>
          <SelectBox checked={filtered.length>0&&visIds.length===filtered.length} indeterminate={visIds.length>0&&visIds.length<filtered.length} onChange={()=>{const all=visIds.length===filtered.length;setSelected(all?new Set():new Set(filtered.map(i=>i.id)))}} label="Επιλογή όλων"/>
          <span style={{fontSize: 'var(--fs-base)',fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)'}}>{visIds.length} επιλεγμένα</span>
          <div style={{flex:1}}/>
          <BulkPicker label="Δωμάτιο" icon={<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M4 21V7l8-4v18M20 21V11l-8-4"/></svg>} options={ROOM_PRESETS} onPick={r=>{if(visIds.length){onBulkRoom(visIds,r);exitSelect()}}}/>
          <button onClick={async()=>{ /* Ρητό στιγμιότυπο ΠΡΙΝ την ερώτηση: ο διάλογος δεν παγώνει πια τη σελίδα, άρα φίλτρο και επιλογή μπορούν να αλλάξουν όσο περιμένουμε απάντηση. Διαγράφονται ακριβώς όσα ανακοίνωσε το μήνυμα. */
            const ids=visIds
            if(ids.length && await confirmDialog(`Διαγραφή ${ids.length} αντικειμένων;`,{tone:'negative'})){ onBulkDelete(ids); exitSelect() } }} disabled={visIds.length===0} style={{display:'inline-flex',alignItems:'center',gap:6,height:T.h.sm,padding:'0 12px',borderRadius:T.radius.pill,fontSize: 'var(--fs-base)',fontWeight:500,fontFamily:T.font.sans,cursor:visIds.length?'pointer':'not-allowed',border:'1px solid var(--negative-border)',background:visIds.length?'var(--negative-dim)':'var(--bg-elevated)',color:visIds.length?'var(--negative)':'var(--text-tertiary)'}}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>
            Διαγραφή
          </button>
        </div>
      ):(
        <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:8,borderBottom:'1px solid var(--border-subtle)',paddingBottom:8}}>
          <span style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',fontFamily:T.font.sans}}>{filtered.length} {filtered.length===1?'αντικείμενο':'αντικείμενα'}</span>
          {/* ΕΔΩ ΛΕΓΕΤΑΙ ΜΙΑ ΦΟΡΑ Ο,ΤΙ ΛΕΓΟΤΑΝ ΣΕ ΚΑΘΕ ΚΑΡΤΑ. */}
          <InfoHint label="Τι δείχνουν τα ποσά">Το ποσό κάθε αντικειμένου είναι η εκτιμώμενη τρέχουσα αξία του: η τιμή αγοράς μειωμένη με την ηλικία του, πάνω στην ωφέλιμη ζωή της κατηγορίας. Η μπάρα δείχνει πόσο μένει από αυτήν την αξία. {NOT_TAX_DEPRECIATION_NOTE}</InfoHint>
        </div>
      )}
      {filtered.length===0?(
        <EmptyState
          icon={items.length===0?<PackageOpen size={20}/>:<SearchX size={20}/>}
          title={items.length===0?'Δεν έχεις καταχωρήσει αντικείμενα':'Δεν βρέθηκαν αποτελέσματα'}
          hint={items.length===0?'Πρόσθεσε το πρώτο αντικείμενο για να ξεκινήσεις.':'Δοκίμασε διαφορετικά φίλτρα ή αναζήτηση.'}
          action={items.length===0?<Btn variant="primary" onClick={onAdd}>Νέο αντικείμενο</Btn>:undefined}
        />
      ):viewMode==='grid'?(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:14}}>
          {filtered.map(item=>{
            const curVal=calcCurrentValue(item); const depPct=calcDepreciationPct(item); const left=calcYearsLeft(item)
            // Δύο ερωτήματα, όχι ένα: «ξέρουμε πόσο κόστισε;» και «ξέρουμε πότε
            // αγοράστηκε;». Το πρώτο κρίνει αν υπάρχει ποσό, το δεύτερο αν
            // επιτρέπεται να μιλήσουμε για υπολειπόμενη αξία και χρόνια.
            const hasValue=(item.purchase_value||0)>0; const hasDate=!!item.purchase_date
            const mc=calcMonthlyCost(item,kwhPrice)
            const photos=(item.photos||[]).filter(Boolean); const displayPhoto=item.photo_url||(photos[0]||'')
            const ws=item.warranty_expiry?warrantyStatus(item.warranty_expiry):null
            const repl=replacementSuggestion(item)
            const sel=selected.has(item.id)
            return (
              <div key={item.id} {...pressable(()=>selectMode?toggleSel(item.id):onEdit(item))} style={{background:'var(--surface-raised)',border:`1px solid ${sel?'var(--accent)':'var(--border-raised)'}`,boxShadow:sel?'0 0 0 1px var(--accent)':'var(--highlight-inset), var(--elev-1)',borderRadius:T.radius.card,overflow:'hidden',display:'flex',flexDirection:'column',transition: 'background-color 0.2s, border-color 0.2s, color 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s',cursor:'pointer'}}
                onMouseEnter={e=>{if(sel)return;(e.currentTarget as HTMLDivElement).style.boxShadow='var(--shadow-md)';(e.currentTarget as HTMLDivElement).style.borderColor='var(--border-default)'}}
                onMouseLeave={e=>{if(sel)return;(e.currentTarget as HTMLDivElement).style.boxShadow='none';(e.currentTarget as HTMLDivElement).style.borderColor='var(--border-subtle)'}}
              >
                <div style={{height:118,background:'var(--bg-elevated)',position:'relative',overflow:'hidden',flexShrink:0}}>
                  {displayPhoto
                    ?<img src={displayPhoto} style={{width:'100%',height:'100%',objectFit:'cover'}} alt=""/>
                    :<div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',opacity:0.18}}>
                      <svg aria-hidden="true" width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
                    </div>
                  }
                  {selectMode
                    ?<div style={{position:'absolute',top:8,left:8,background:'rgba(0,0,0,0.35)',borderRadius:8,padding: 4,backdropFilter:'blur(4px)'}} onClick={e=>e.stopPropagation()}><SelectBox checked={sel} onChange={()=>toggleSel(item.id)} label={`Επιλογή ${item.name}`}/></div>
                    :<>
                      <div style={{position:'absolute',top:8,left:8}} onClick={e=>e.stopPropagation()}>
                        <InlineConditionEdit item={item} onUpdate={onUpdateCondition}/>
                      </div>
                      <div style={{position:'absolute',top:8,right:8}}>
                        <OverflowMenu dark actions={itemActions(item)}/>
                      </div>
                    </>}
                  {(item.energy_class||photos.length>1)&&<div style={{position:'absolute',bottom:8,left:8,display:'flex',gap:4,alignItems:'center'}}>
                    {item.energy_class&&<EnergyBadge cls={item.energy_class}/>}
                    {photos.length>1&&<span style={{padding:'2px 6px',borderRadius:6,background:'rgba(0,0,0,0.6)',color:'var(--on-media)',fontSize: 'var(--fs-xs)',fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums'}}>+{photos.length-1}</span>}
                  </div>}
                </div>
                <div style={{padding:'12px 14px',display:'flex',flexDirection:'column',gap:8,flex:1}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10}}>
                    <div style={{minWidth:0}}>
                      <p className="po-elide" style={{fontSize:14,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)',marginBottom:2,lineHeight:1.3}}>{item.name}</p>
                      <p className="po-elide" style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',fontFamily:T.font.sans}}>{item.category}{item.room?` · ${item.room}`:''}</p>
                    </div>
                    {/* ΤΟ «0,00 €» ΕΦΥΓΕ ΑΠΟ ΤΗ ΘΕΣΗ ΤΗΣ ΑΠΑΝΤΗΣΗΣ. Ενα αντικείμενο
                        χωρίς δηλωμένη τιμή αγοράς δεν αξίζει μηδέν: δεν ξέρουμε πόσο
                        αξίζει. Και η ετικέτα «ΤΡΕΧΟΥΣΑ ΑΞΙΑ» γραφόταν σε κάθε μία από
                        τις δεκατρείς κάρτες· λέγεται μόνο όταν υπάρχει ποσό να
                        ονομαστεί. */}
                    {/* Η ΕΤΙΚΕΤΑ ΕΦΥΓΕ ΑΠΟ ΚΑΘΕ ΚΑΡΤΑ. Μετρήθηκε: «ΤΡΕΧΟΥΣΑ ΑΞΙΑ»
                        ×11 σε μία οθόνη με δεκατρία αντικείμενα. Το ποσό σε ευρώ
                        δίπλα στο όνομα ενός επίπλου δεν χρειάζεται να συστηθεί
                        έντεκα φορές· λέγεται μία, στο κυκλάκι πάνω από το πλέγμα. */}
                    {hasValue && (
                      <p style={{fontSize:14,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',fontWeight:700,color:'var(--text-primary)',lineHeight:1.2,flexShrink:0}}>{fe(curVal)}</p>
                    )}
                  </div>
                  <DepBar pct={depPct} left={left} hasData={hasDate} hasValue={hasValue} compact/>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,minHeight:15}}>
                    <div style={{minWidth:0,overflow:'hidden'}}>
                      {repl.suggested
                        ?<ReplacementHint item={item} compact/>
                        :ws&&<span style={{fontSize: 'var(--fs-xs)',color:ws.color,fontFamily:T.font.sans}}>Εγγύηση {ws.label}</span>}
                    </div>
                    {mc>0&&<span title="Εκτιμώμενο κόστος ρεύματος ανά μήνα" style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',fontFamily:T.font.num,fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap',flexShrink:0}}>{fe(mc)}/μήνα</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ):(
        <div style={{overflowX:'auto',margin:'0 -4px',WebkitOverflowScrolling:'touch'}}>
        <div style={{display:'flex',flexDirection:'column',gap:1,background:'var(--surface-raised)',borderRadius:T.radius.card,border:'1px solid var(--border-raised)',boxShadow:'var(--highlight-inset), var(--elev-1)',overflow:'hidden',minWidth:560}}>
          <div style={{display:'grid',gridTemplateColumns:`${selectMode?'32px ':''}minmax(0,2fr) 130px 96px 90px 44px`,gap:10,padding:'10px 16px',borderBottom:'2px solid var(--border-subtle)',background:'var(--bg-elevated)'}}>
            {selectMode&&<div/>}
            {['Αντικείμενο','Κατάσταση','Αξία','Ρεύμα/μήνα',''].map(h=><p key={h} style={{fontSize: 'var(--fs-xs)',color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:500,fontFamily:T.font.sans}}>{h}</p>)}
          </div>
          {filtered.map(item=>{
            const curVal=calcCurrentValue(item); const mc=calcMonthlyCost(item,kwhPrice); const age=calcAgeDisplay(item.purchase_date)
            // Ιδιος κανόνας με τις κάρτες: χωρίς τιμή αγοράς δεν υπάρχει ποσό.
            const hasValue=(item.purchase_value||0)>0; const hasDate=!!item.purchase_date
            const sel=selected.has(item.id)
            return (
              <div key={item.id} {...pressable(()=>selectMode?toggleSel(item.id):onEdit(item))} style={{display:'grid',gridTemplateColumns:`${selectMode?'32px ':''}minmax(0,2fr) 130px 96px 90px 44px`,gap:10,padding:'11px 16px',background:sel?'var(--accent-soft)':'var(--bg-surface)',borderBottom:'1px solid var(--border-subtle)',alignItems:'center',transition:'background 0.15s',cursor:'pointer'}}
                onMouseEnter={e=>{if(!sel)(e.currentTarget as HTMLDivElement).style.background='var(--bg-elevated)'}}
                onMouseLeave={e=>{if(!sel)(e.currentTarget as HTMLDivElement).style.background='var(--bg-surface)'}}
              >
                {selectMode&&<div onClick={e=>e.stopPropagation()}><SelectBox checked={sel} onChange={()=>toggleSel(item.id)} label={`Επιλογή ${item.name}`}/></div>}
                <div style={{minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <p className="po-elide" style={{fontSize: 'var(--fs-base)',fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)'}}>{item.name}</p>
                    {item.energy_class&&<EnergyBadge cls={item.energy_class}/>}
                  </div>
                  <p className="po-elide" style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',fontFamily:T.font.sans,margin:'2px 0 4px'}}>{item.category}{item.room?` · ${item.room}`:''}{age?` · ${age}`:''}</p>
                  <DepBar pct={calcDepreciationPct(item)} left={calcYearsLeft(item)} hasData={hasDate} hasValue={hasValue} compact/>
                  {replacementSuggestion(item).suggested&&<div style={{marginTop:4}}><ReplacementHint item={item} compact/></div>}
                </div>
                <div onClick={e=>e.stopPropagation()}><InlineConditionEdit item={item} onUpdate={onUpdateCondition}/></div>
                {hasValue
                  ? <p style={{fontSize: 'var(--fs-base)',fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:700}}>{fe(curVal)}</p>
                  : <p style={{fontSize:12,fontFamily:T.font.sans,color:'var(--text-tertiary)'}}>Χωρίς αξία</p>}
                <div>{mc>0&&<p style={{fontSize:12,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:700}}>{fe(mc)}</p>}</div>
                <div style={{display:'flex',justifyContent:'flex-end'}}><OverflowMenu actions={itemActions(item)}/></div>
              </div>
            )
          })}
        </div>
        </div>
      )}
    </div>
  )
}

// ΟΙ ΕΓΓΥΗΣΕΙΣ ΔΕΝ ΕΧΟΥΝ ΔΙΚΗ ΤΟΥΣ ΕΝΟΤΗΤΑ ΠΙΑ.
// Ήταν λίστα με τρία υπο-τμήματα: «λήγουν σε 90 ημέρες», «έχουν λήξει», «σε
// ισχύ». Δηλαδή η ίδια λίστα αντικειμένων, τρεις φορές, φιλτραρισμένη με
// ημερομηνία — δίπλα στη λίστα αντικειμένων που ήδη δείχνει την εγγύηση ως σήμα
// σε κάθε κάρτα. Ό,τι είχε αξία κρατήθηκε και μπήκε εκεί που ανήκει:
//   · «λήγει σύντομα» → μία γραμμή στο «Χρειάζονται προσοχή», με το κουμπί που
//     βάζει την υπενθύμιση στο ημερολόγιο·
//   · η απόδειξη → στο μενού του κάθε αντικειμένου, δίπλα στην επεξεργασία·
//   · «σε ισχύ» → δεν είναι εργασία, είναι κατάσταση και τη λέει η κάρτα.

// ═══════════════════════════════════════════════════════════════════════════

// Αύξων αριθμός σποράς, αντί για `Date.now()`: η γραφή γίνεται πλέον ΚΑΤΑ ΤΗΝ
// ΑΠΟΔΟΣΗ και η απόδοση πρέπει να είναι καθαρή. Δύο κλήσεις στην ίδια στιγμή
// θα έδιναν την ίδια σφραγίδα και το πρωτόκολλο δεν θα ξανάνοιγε.
let seedCounter = 0
const seedSerial = () => ++seedCounter

export default function TabInventory({propertyId,userId,profileType='individual',embedded,handoverIntent,onIntentConsumed,properties=[]}:TabInventoryProps & {embedded?:boolean;handoverIntent?:HandoverIntent|null;onIntentConsumed?:()=>void;properties?:InventoryPropertyOption[]}) {
  // ΔΥΟ ΣΕΛΙΔΕΣ, ΟΧΙ ΤΕΣΣΕΡΙΣ ΥΠΟΚΑΡΤΕΛΕΣ. Η απογραφή είναι μία σελίδα που
  // διαβάζεται από πάνω προς τα κάτω. Το πρωτόκολλο παράδοσης είναι χωριστή
  // εργασία με δικό της βήμα-βήμα, οπότε μένει δική του σελίδα.
  const [page,setPage] = useState<'main'|'handover'>('main')
  const [handoverSeed,setHandoverSeed] = useState<(HandoverIntent&{n:number})|null>(null)
  // Deep-link από την καρτέλα ενοικιαστή: άνοιξε κατευθείαν τη «Παράδοση» σε νέο
  // πρωτόκολλο με προ-συμπληρωμένα στοιχεία. ΚΑΤΑ ΤΗΝ ΑΠΟΔΟΣΗ, όχι σε effect:
  // ως effect, η οθόνη έδειχνε πρώτα την κύρια σελίδα της απογραφής και μετά
  // πηδούσε στην παράδοση. Η React το ονομάζει «adjusting state when a prop
  // changes» και είναι ακριβώς αυτή η περίπτωση.
  const [intentSeen,setIntentSeen] = useState<HandoverIntent|null>(null)
  if(handoverIntent && handoverIntent!==intentSeen){
    setIntentSeen(handoverIntent)
    setPage('handover')
    setHandoverSeed({...handoverIntent,n:seedSerial()})
    onIntentConsumed?.()
  }
  const [items,setItems] = useState<InventoryItem[]>([])
  const [repairs,setRepairs] = useState<InventoryRepair[]>([])
  const [handovers,setHandovers] = useState<InventoryHandover[]>([])
  const [schedules,setSchedules] = useState<MaintenanceSchedule[]>([])
  // ΚΑΜΙΑ ΠΡΟΕΠΙΛΟΓΗ 0,22 €/kWh. Ήταν σταθερά που (α) πολλαπλασίαζε κάθε συσκευή
  // και (β) ΓΡΑΦΟΤΑΝ ΣΤΗ ΒΑΣΗ ως δήλωση του χρήστη σε κάθε άκυρη είσοδο. Η τιμή
  // έρχεται από τον λογαριασμό ρεύματος που το app ήδη διαβάζει (bills_electricity)
  // ή από ρητή δήλωση. Όσο λείπει, δείχνουμε kWh και όχι ευρώ.
  const [kwhPrice,setKwhPrice] = useState(0)
  const [kwInput,setKwInput] = useState('')
  // Ο ΔΕΙΚΤΗΣ ΦΟΡΤΩΣΗΣ ΔΕΝ ΕΙΝΑΙ ΞΕΧΩΡΙΣΤΗ ΚΑΤΑΣΤΑΣΗ, ΕΙΝΑΙ ΕΡΩΤΗΣΗ. Ηταν
  // `setLoading(true)` στην πρώτη γραμμή της φόρτωσης: σύγχρονη γραφή μέσα σε
  // effect, δηλαδή δεύτερη απόδοση πριν καν φύγει το αίτημα. Η ερώτηση που ΟΝΤΩΣ
  // απαντά είναι «τα δεδομένα που κρατώ είναι αυτού του ακινήτου;» και απαντιέται
  // κατά την απόδοση, χωρίς καμία γραφή. Με την αλλαγή ακινήτου γίνεται αληθής
  // ΑΜΕΣΩΣ, οπότε δεν υπάρχει καρέ με τα νούμερα του προηγούμενου.
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const loading = loadedFor !== propertyId
  const [showItemForm,setShowItemForm] = useState(false)
  // Χειροκίνητο άνοιγμα: όλα τα πεδία ορατά από την πρώτη στιγμή.
  const [formManual,setFormManual] = useState(false)
  const [editingItem,setEditingItem] = useState<InventoryItem|null>(null)
  const [repairItem,setRepairItem] = useState<InventoryItem|null>(null)
  const [qrItem,setQrItem] = useState<InventoryItem|null>(null)
  const [showBulkImport,setShowBulkImport] = useState(false)
  // Η επίπλωση δηλώνεται στην καρτέλα του ενοικιαστή (tenants.furnishing). Δεν τη
  // ξαναρωτάμε εδώ — «τίποτα με το χέρι δύο φορές».
  const [furnishing,setFurnishing] = useState<string|null>(null)

  const fetchData = useCallback(async()=>{
    const [iR,rR,hR,sR,bR,psR] = await Promise.all([
      inventory.ofProperty<InventoryItem>(supabase,propertyId,'*',userId),
      supabase.from('inventory_repairs').select('*').eq('user_id',userId).order('repair_date',{ascending:false}),
      supabase.from('inventory_handovers').select('*').eq('property_id',propertyId).order('created_at',{ascending:false}),
      supabase.from('inventory_maintenance').select('*').eq('property_id',propertyId).order('next_due'),
      // Ο πίνακας `bills_electricity` ΔΕΝ ΥΠΑΡΧΕΙ (μόνο bills/bills_history/
      // bills_settings). Το ερώτημα απορριπτόταν ολόκληρο, άρα η εναλλακτική
      // πηγή τιμής kWh ήταν πάντα κενή και ο χρήστης έβλεπε άδειο πεδίο ακόμη
      // κι όταν είχε καταχωρήσει τιμή στο μισθωτήριο. Η τιμή ζει στο tenants.
      //
      // ΔΥΟ ΕΡΩΤΗΜΑΤΑ ΕΓΙΝΑΝ ΕΝΑ και τα δύο έλεγαν `.limit(1)` χωρίς καμία σειρά
      // και χωρίς κανένα φίλτρο κατάστασης: έπαιρναν όποια γραμμή ερχόταν πρώτη,
      // ακόμη κι ενός μισθωτή που έφυγε πέρσι.
      tenantStore.currentAll<{ kwh_price?: number | null; furnishing?: string | null }>(supabase,propertyId,'kwh_price,furnishing',userId),
      // Η ΤΙΜΗ ΤΟΥ ΑΚΙΝΗΤΟΥ, που είναι και η μόνη που μπορεί να γράψει ο χρήστης.
      // Το `property_settings.kwh_price` προστέθηκε με migration· ως τότε η
      // αποθήκευση αποτύγχανε σιωπηλά και εδώ διαβαζόταν δύο φορές η ίδια στήλη
      // του μισθωτηρίου, μόνο για να μη χαλάσει η σειρά του Promise.all.
      supabase.from('property_settings').select('kwh_price').eq('property_id',propertyId).limit(1),
    ])
    setFurnishing(bR[0]?.furnishing ?? null)
    // Καμία εγγραφή κατά την ανάγνωση: οι υπενθυμίσεις ημερολογίου δημιουργούνται
    // ΜΟΝΟ με ρητή ενέργεια του χρήστη (κουμπί «Ημερολόγιο»), όχι αυτόματα σε κάθε load.
    setItems(iR.map(i=>({...i,photos:i.photos||[]})))
    if(rR.data)setRepairs(rR.data)
    if(hR.data)setHandovers(hR.data as InventoryHandover[])
    if(sR.data)setSchedules(sR.data)
    const savedKwh=(psR.data?.[0] as {kwh_price?:number}|undefined)?.kwh_price||bR.find(t=>t.kwh_price!=null)?.kwh_price
    if(savedKwh){setKwhPrice(savedKwh);setKwInput(String(savedKwh))}
    setLoadedFor(propertyId)
  },[propertyId,userId])

  useLoad(fetchData)

  const saveKwh=async(price:number)=>{
    // Ο μοναδικός περιορισμός είναι `UNIQUE (property_id)` — ΜΟΝΟ αυτόν δέχεται
    // το on conflict. Το προηγούμενο `'property_id,user_id'` δεν αντιστοιχούσε
    // σε κανέναν, οπότε η Postgres έριχνε 42P10 και η τιμή δεν αποθηκευόταν ποτέ.
    const {error}=await supabase.from('property_settings')
      .upsert({property_id:propertyId,user_id:userId,kwh_price:price},{onConflict:'property_id'})
    // Το σφάλμα ΔΙΑΒΑΖΕΤΑΙ. Ο Supabase δεν πετά ποτέ — επιστρέφει {data,error} —
    // οπότε χωρίς αυτόν τον έλεγχο η αποτυχία ήταν κυριολεκτικά αόρατη.
    if(error){notifyError(failed('Η τιμή ρεύματος δεν αποθηκεύτηκε',error));return}
    notifyOk('Η τιμή ρεύματος αποθηκεύτηκε')
  }
  const handleSaveItem=async(data:Partial<InventoryItem>)=>{
    // Γράφονται ΜΟΝΟ τα πεδία που ζητάει πλέον η φόρμα. Οι στήλες που έμειναν στη
    // βάση (provenance, discount_pct, smart_device, standby_watts…) δεν αγγίζονται:
    // τα παλιά δεδομένα μένουν ακέραια, απλώς δεν παράγονται καινούργια.
    const payload={name:data.name||'',category:data.category||'Λοιπά',room:data.room||'',brand:data.brand||'',model:data.model||'',serial_number:data.serial_number||'',condition:data.condition||'Καλή',notes:data.notes||'',photo_url:data.photo_url||'',photos:data.photos||[],purchase_value:data.purchase_value||0,purchase_date:data.purchase_date||null,warranty_expiry:data.warranty_expiry||null,energy_class:data.energy_class||'',power_watts:data.power_watts||0,daily_hours_use:data.daily_hours_use||0,replacement_cost:data.replacement_cost||0,receipt_doc_url:data.receipt_doc_url||null,receipt_doc_name:data.receipt_doc_name||null}
    if(editingItem){const {error}=await inventory.update(supabase,editingItem.id,payload);if(error)notifyError(failed('Το αντικείμενο δεν αποθηκεύτηκε',error))
      // Καθάρισε την ΠΑΛΙΑ απόδειξη αν αντικαταστάθηκε/αφαιρέθηκε (αποφυγή orphan στο storage).
      else{const oldDoc=editingItem.receipt_doc_url;if(oldDoc&&oldDoc!==payload.receipt_doc_url&&!/^https?:\/\//.test(oldDoc))await supabase.storage.from(DOCS_BUCKET).remove([oldDoc])}}
    else{const {error}=await inventory.add(supabase,propertyId,userId,[payload]);if(error)notifyError(failed('Το αντικείμενο δεν καταχωρήθηκε',error))}
    setShowItemForm(false);setEditingItem(null);fetchData()
  }
  // Καθαρισμός συνημμένων αποδείξεων (private bucket) ώστε να μη μένουν orphan αρχεία.
  const cleanupDocs=async(its:InventoryItem[])=>{const paths=its.map(i=>i.receipt_doc_url).filter((p):p is string=>!!p&&!/^https?:\/\//.test(p));if(paths.length)await supabase.storage.from(DOCS_BUCKET).remove(paths)}
  const handleDelete=async(id:string)=>{const it=items.find(i=>i.id===id);const {error}=await inventory.remove(supabase,id);if(error){notifyError(failed('Το αντικείμενο δεν διαγράφηκε',error));return};if(it)await cleanupDocs([it]);fetchData()}
  // ΤΡΙΑ ΓΡΑΨΙΜΑΤΑ ΠΟΥ ΔΕΝ ΔΙΑΒΑΖΑΝ ΤΟ ΣΦΑΛΜΑ ΤΟΥΣ. Ο Supabase δεν πετά ποτέ
  // εξαίρεση — επιστρέφει {data,error}. Χωρίς έλεγχο, η επισκευή που απορρίφθηκε
  // από RLS, η κατάσταση που δεν αποθηκεύτηκε και το δωμάτιο που δεν άλλαξε
  // φαίνονταν στην οθόνη σαν να έγιναν: η μία επειδή ακολουθούσε επαναφόρτωση που
  // απλώς δεν έφερνε τίποτα νέο, η άλλη επειδή η οθόνη ενημερωνόταν αισιόδοξα.
  const handleAddRepair=async(data:Partial<InventoryRepair>)=>{
    if(!repairItem)return
    const {error}=await supabase.from('inventory_repairs').insert({...data,item_id:repairItem.id,user_id:userId})
    if(error){notifyError(failed('Η επισκευή δεν καταχωρήθηκε',error));return}
    fetchData()
  }
  const handleUpdateCondition=async(id:string,condition:string)=>{
    const prevCondition=items.find(i=>i.id===id)?.condition
    setItems(prev=>prev.map(i=>i.id===id?{...i,condition}:i))
    const {error}=await inventory.update(supabase,id,{condition})
    // Επαναφορά της οθόνης στην πραγματικότητα: αλλιώς ο χρήστης βλέπει «Κακή»,
    // φεύγει, γυρίζει και το αντικείμενο είναι πάλι «Καλή» χωρίς εξήγηση.
    if(error){setItems(prev=>prev.map(i=>i.id===id&&prevCondition?{...i,condition:prevCondition}:i));notifyError(failed('Η κατάσταση δεν αποθηκεύτηκε',error))}
  }
  const handleBulkDelete=async(ids:string[])=>{if(!ids.length)return;const its=items.filter(i=>ids.includes(i.id));const {error}=await inventory.removeMany(supabase,ids);if(error){notifyError(failed('Τα αντικείμενα δεν διαγράφηκαν',error));return}await cleanupDocs(its);fetchData()}
  const handleBulkRoom=async(ids:string[],room:string)=>{
    if(!ids.length)return
    const {error}=await inventory.updateMany(supabase,ids,{room})
    if(error){notifyError(failed('Το δωμάτιο δεν αποθηκεύτηκε',error));return}
    fetchData()
  }
  const [cloning,setCloning] = useState(false)
  const otherProps = properties.filter(p=>p.id!==propertyId).map(p=>({id:p.id,label:p.address||p.nickname||p.name||'Ακίνητο'}))
  const insertStarterPack = async() => {
    setCloning(true)
    const rows=STARTER_PACK.map(s=>({name:s.name,category:s.category,room:s.room,condition:'Καλή',brand:'',model:'',serial_number:'',notes:'',photo_url:'',photos:[],purchase_value:0}))
    const {error}=await inventory.add(supabase,propertyId,userId,rows)
    setCloning(false)
    if(error){notifyError(failed('Τα αντικείμενα του πακέτου δεν προστέθηκαν',error));return}
    fetchData()
  }
  const cloneFromProperty = async(sourceId:string) => {
    setCloning(true)
    const data=await inventory.ofProperty<InventoryItemsRow>(supabase,sourceId,'*',String(userId))
    if(data.length===0){setCloning(false);notifyError('Το ακίνητο δεν έχει αντικείμενα προς αντιγραφή.');return}
    // Η αντιγραφή κρατά ό,τι δεν ανήκει στο ακίνητο-πηγή: το κλειδί, οι σφραγίδες
    // χρόνου και ο δεσμός ακινήτου ξαναγράφονται από το στρώμα.
    const rows=data.map(({id,created_at,updated_at,property_id,user_id,...rest})=>rest)
    const {error}=await inventory.add(supabase,propertyId,userId,rows)
    setCloning(false)
    if(error){notifyError(failed('Η αντιγραφή από το άλλο ακίνητο δεν ολοκληρώθηκε',error));return}
    fetchData()
  }
  // ═══ ΜΙΑ ΥΠΕΝΘΥΜΙΣΗ ΕΓΓΥΗΣΗΣ, ΕΝΑ ΣΗΜΕΙΟ ═══════════════════════════════════
  // Η ΙΔΙΑ ενέργεια υπήρχε δύο φορές, γραμμένη δύο φορές: εδώ, ως «Υπενθύμιση
  // εγγύησης» στο μενού του αντικειμένου και μέσα στην ενότητα Εγγυήσεων ως
  // κουμπί «Ημερολόγιο» με δικό της αντίγραφο του ίδιου insert. Ίδια εγγραφή,
  // διαφορετικά μηνύματα, καμία από τις δύο δεν ήξερε τι είχε κάνει η άλλη.
  //
  // Και καμία δεν κοίταζε αν η υπενθύμιση υπάρχει ήδη: δύο πατήματα, δύο εγγραφές
  // ημερολογίου για την ίδια εγγύηση, δύο email την ίδια μέρα. Τώρα η ενέργεια
  // ζει εδώ, μία φορά και ρωτάει πρώτα.
  const handleWarrantyReminder=async(item:InventoryItem):Promise<boolean>=>{
    if(!item.warranty_expiry){notifyError('Το αντικείμενο δεν έχει ημερομηνία λήξης εγγύησης.');return false}
    const title=`Εγγύηση: ${item.name}`
    if(await calendar.exists(supabase,propertyId,{source:'inventory',title,eventDate:item.warranty_expiry})){notifyOk(`Η υπενθύμιση για «${item.name}» υπάρχει ήδη στο ημερολόγιο.`);return true}
    const {error}=await calendar.insert(supabase,[calendar.row({propertyId,userId},'inventory',{title,notes:`Λήγει ${fmtDate(item.warranty_expiry)}`,event_date:item.warranty_expiry,category:'maintenance',priority:daysUntil(item.warranty_expiry)<=30?'high':'medium'})])
    if(error){notifyError(failed('Δεν μπόρεσα να προσθέσω την υπενθύμιση',error));return false}
    // ΗΤΑΝ notifyError: μήνυμα ΕΠΙΤΥΧΙΑΣ σε κόκκινο toast. Ο χρήστης νόμιζε ότι απέτυχε
    // και το ξαναπατούσε, φτιάχνοντας διπλές εγγραφές ημερολογίου.
    notifyOk(`Προστέθηκε υπενθύμιση εγγύησης στο ημερολόγιο για «${item.name}».`)
    return true
  }
  const exportActions = inventoryExports({items,repairs,kwhPrice})
  // ΔΥΟ ΕΞΑΓΩΓΕΣ CSV ΤΩΝ ΙΔΙΩΝ ΔΕΔΟΜΕΝΩΝ ΔΕΝ ΥΠΑΡΧΟΥΝ ΠΙΑ. Η κεφαλίδα είχε
  // δική της, με εννέα στήλες· το μενού έχει την πλήρη, με είκοσι. Ο χρήστης
  // κατέβαζε «την απογραφή» και έπαιρνε άλλο αρχείο ανάλογα με το πού πάτησε.

  // ═══ ΠΟΙΟΣ ΒΛΕΠΕΙ ΑΠΟΓΡΑΦΗ ΕΞΟΠΛΙΣΜΟΥ ═══════════════════════════════════
  // Ένα κενό διαμέρισμα, μια ιδιοχρησία ή ένα γυμνό ενοίκιο δεν έχουν εξοπλισμό να
  // παραδώσουν. Η βραχυχρόνια είναι εξ ορισμού επιπλωμένη (δεν νοικιάζεται γυμνό
  // διαμέρισμα ανά νύχτα)· στη μακροχρόνια το κρίνει η δήλωση επίπλωσης της
  // καρτέλας ενοικιαστή. ΔΙΧΤΥ ΑΣΦΑΛΕΙΑΣ: αν υπάρχουν ήδη αντικείμενα, η καρτέλα
  // εμφανίζεται ΠΑΝΤΑ — δεν κρύβουμε ποτέ δεδομένα που ο χρήστης έχει καταχωρήσει.
  // ΤΟ CAST ΕΚΡΥΒΕ ΤΟ ΛΑΘΟΣ. Ήταν `(properties as StatusRow[]).find((p:any)=>…)`:
  // το StatusRow ΔΕΝ έχει `id`, οπότε το cast ήταν άκυρο και το `any` το έκρυβε.
  // Ο σωστός τύπος λέει και τα δύο — ό,τι χρειάζεται η κατάσταση και το κλειδί.
  const propRow = (properties as (StatusRow & { id: string })[]).find(p => p?.id === propertyId) || null
  const status = readStatus(propRow)
  const declaredFurnished = status==='rent_short' || furnishing==='furnished' || furnishing==='turnkey'
  const fieldCtx: FieldContext = {
    status, business: profileType==='professional', doubleEntry: false,
    propertyCount: properties.length||1, furnished: declaredFurnished||items.length>0,
  }
  const inventoryApplies = declaredFurnished || items.length>0
  // ══ Η ΦΟΡΜΑ ΑΝΟΙΓΕ ΧΩΡΙΣ ΟΥΤΕ ΕΝΑ ΠΕΔΙΟ ═══════════════════════════════════
  //
  // ΤΙ ΕΒΛΕΠΕ Ο ΧΡΗΣΤΗΣ. Η κενή κατάσταση λέει «Το ακίνητο δεν έχει δηλωθεί
  // επιπλωμένο» και δίνει κουμπί «Πρόσθεσε ένα αντικείμενο». Το κουμπί άνοιγε
  // παράθυρο με τίτλο «Νέο αντικείμενο», την κάρτα της φωτογραφίας, την
  // επικεφαλίδα «ΑΓΟΡΑ» και ΤΙΠΟΤΑ ΑΛΛΟ: ούτε όνομα, ούτε κατηγορία, ούτε
  // κατάσταση, ούτε ποσό. Και από κάτω κουμπί «Αποθήκευση», που δεν είχε τι να
  // αποθηκεύσει.
  //
  // ΓΙΑΤΙ. Κάθε πεδίο της απογραφής κρίνεται με το `equipped`, δηλαδή
  // «μισθώνεται ΚΑΙ είναι επιπλωμένο». Το `furnished` εδώ βγαίνει από το τι
  // έχει δηλωθεί στην καρτέλα Ενοικιαστή ή από το αν υπάρχουν ήδη αντικείμενα:
  // με μηδέν αντικείμενα και χωρίς δήλωση επίπλωσης είναι ψευδές, οπότε το
  // μητρώο δεν επέστρεφε κανένα πεδίο και κάθε `Field` αποδιδόταν κενό.
  //
  // Η ΔΙΟΡΘΩΣΗ. Το γκρίζωμα της ΛΙΣΤΑΣ είναι σωστό: χωρίς επίπλωση δεν υπάρχει
  // απογραφή να δείξεις. Η ΦΟΡΜΑ όμως είναι άλλο πράγμα: όποιος την ανοίγει
  // δηλώνει με την πράξη του ότι υπάρχει εξοπλισμός να καταγραφεί, αλλιώς δεν
  // θα πατούσε «Πρόσθεσε ένα αντικείμενο». Το παράθυρο παίρνει το ίδιο
  // περιβάλλον με τη σημαία της επίπλωσης ανοιχτή· η καρτέλα κρατά το δικό της.
  const formCtx: FieldContext = { ...fieldCtx, furnished: true }

  const overdueCount=schedules.filter(s=>daysUntil(s.next_due)<0).length
  const warnCount=schedules.filter(s=>{const d=daysUntil(s.next_due);return d>=0&&d<=30}).length
  // ═══ ΤΑ ΤΕΣΣΕΡΑ ΝΟΥΜΕΡΑ ΤΗΣ ΑΠΟΓΡΑΦΗΣ ════════════════════════════════════
  // Υπολογίζονται ΕΔΩ, μία φορά και εμφανίζονται ΕΔΩ, μία φορά: η σειρά μετρικών
  // στέκει πάνω από τις υποκαρτέλες και φαίνεται σε όλες τους. Καμία υποκαρτέλα
  // δεν έχει πια δικό της πλέγμα μετρικών.
  const invSummary=portfolioSummary(items)
  const totalValue=items.reduce((s,i)=>s+calcCurrentValue(i),0)
  const categoryCount=new Set(items.map(i=>i.category)).size
  const electricItems=items.filter(hasEnergy)
  const monthlyKwh=electricItems.reduce((s,i)=>s+calcMonthlyKwh(i),0)
  const monthlyCost=electricItems.reduce((s,i)=>s+calcMonthlyCost(i,kwhPrice),0)
  const declaredRepl=items.filter(i=>(i.replacement_cost||0)>0)
  const declaredReplTotal=declaredRepl.reduce((s,i)=>s+(i.replacement_cost||0),0)

  // Ο έλεγχος τιμής kWh ζει εκεί που έχει νόημα — στην ενότητα κατανάλωσης ρεύματος, όχι στο header.
  const kwhControl=(
    <div title="kWh = κιλοβατώρα· τιμή ρεύματος σε € ανά kWh, για τον υπολογισμό κόστους" style={{display:'inline-flex',alignItems:'center',height:28,background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:T.radius.pill,overflow:'hidden'}}>
      <span style={{padding:'0 8px',fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',borderRight:'1px solid var(--border-subtle)',alignSelf:'stretch',display:'flex',alignItems:'center',whiteSpace:'nowrap',letterSpacing:'0.5px',textTransform:'uppercase',fontFamily:T.font.sans}}>€/kWh</span>
      <input type="text" inputMode="decimal" value={kwInput} placeholder="" aria-label="Τιμή ρεύματος σε ευρώ ανά kWh, από τον λογαριασμό σου"
        onChange={e=>{const raw=e.target.value.replace(',','.');setKwInput(raw);if(/^\d*\.?\d*$/.test(raw)&&raw!=='')setKwhPrice(parseFloat(raw)||0)}}
        onFocus={e=>{e.target.select()}}
        onBlur={()=>{const n=parseFloat(kwInput);if(isNaN(n)||n<=0){setKwInput('');setKwhPrice(0)}else{setKwInput(String(n));setKwhPrice(n);saveKwh(n)}}}
        style={{width:52,background:'transparent',border:'none',outline:'none',padding:'0 8px',fontSize:12,color:'var(--text-primary)',fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',textAlign:'right'}}
      />
    </div>
  )

  return (
    <div style={{minWidth:0,width:'100%'}}>
      {(showItemForm||editingItem)&&<ItemFormModal item={editingItem} startManual={formManual} onSave={handleSaveItem} onClose={()=>{setShowItemForm(false);setEditingItem(null);setFormManual(false)}} propertyId={propertyId} ctx={formCtx} kwhPrice={kwhPrice}/>}
      {repairItem&&<RepairModal item={repairItem} repairs={repairs} onAdd={handleAddRepair} onClose={()=>setRepairItem(null)} propertyId={propertyId} userId={userId}/>}
      {qrItem&&<QRModal item={qrItem} onClose={()=>setQrItem(null)}/>}
      {showBulkImport&&<BulkImportModal propertyId={propertyId} userId={userId} onImported={fetchData} onClose={()=>setShowBulkImport(false)}/>}

      {!embedded && <PageTitle
        title="Έπιπλα και εξοπλισμός"
        /* Ο ΥΠΟΤΙΤΛΟΣ ΕΛΕΓΕ ΞΑΝΑ ΤΟΝ ΤΙΤΛΟ. «Διαχείριση εξοπλισμού» κάτω από το
           «Έπιπλα και εξοπλισμός» είναι η ίδια λέξη δύο φορές συν ένα ρήμα που
           δεν λέει τίποτα: κάθε καρτέλα διαχειρίζεται αυτό που ονομάζει.
           Μένουν τα τέσσερα πράγματα που ΚΡΑΤΑ η καρτέλα και δεν φαίνονται
           από το όνομά της. */
        sub="Αξία, εγγυήσεις, κατανάλωση και παράδοση"
        /* ΕΝΑ ΚΟΥΜΠΙ, ΚΑΙ ΕΝΑ ΜΕΝΟΥ. Ήταν τρία κουμπιά στην κεφαλίδα και άλλες
           τρεις εξαγωγές σε δική τους κάρτα στο τέλος της σελίδας — έξι ενέργειες
           για μια οθόνη που έχει ΜΙΑ κύρια: πρόσθεσε αντικείμενο. */
        right={<>
          <ActionMenu label="Περισσότερα" items={[
            // ══ Η ΜΑΖΙΚΗ ΕΙΣΑΓΩΓΗ ΠΡΟΣΦΕΡΟΤΑΝ, Η ΜΕΜΟΝΩΜΕΝΗ ΟΧΙ ══════════════
            // Οταν η απογραφή δεν έχει ανοίξει ακόμη, το «Νέο αντικείμενο» δεν
            // εμφανίζεται (θέλει `items.length>0`) και η κενή κατάσταση με τους
            // δύο δρόμους δεν φτάνει ποτέ. Εμενε ένα μενού που πρότεινε να
            // επικολλήσεις ΟΛΟΚΛΗΡΗ λίστα, χωρίς να υπάρχει πουθενά τρόπος να
            // βάλεις ΕΝΑ αντικείμενο. Και η καρτέλα λέγεται «Επιπλα και
            // εξοπλισμός»: ένας λέβητας ή ένα κλιματιστικό υπάρχουν και σε
            // ακίνητο που δεν νοικιάζεται επιπλωμένο.
            //
            // Μπαίνει ΜΟΝΟ όταν λείπει, δηλαδή όσο δεν φαίνεται το κύριο κουμπί:
            // αλλιώς θα ήταν η ίδια ενέργεια δύο φορές στην ίδια κεφαλίδα.
            ...(items.length===0
              ? [{key:'single',label:'Μεμονωμένη εισαγωγή',description:'Πρόσθεσε ένα αντικείμενο με το χέρι.',onClick:()=>{setEditingItem(null);setFormManual(true);setShowItemForm(true)}}]
              : []),
            {key:'bulk',label:'Μαζική εισαγωγή',description:'Επικόλλησε λίστα ή αρχείο και μπαίνουν όλα μαζί.',onClick:()=>setShowBulkImport(true)},
            {key:'hand',label:'Πρωτόκολλο παράδοσης',description:'Κατάσταση εξοπλισμού στην είσοδο ή στην έξοδο του ενοικιαστή.',onClick:()=>setPage('handover'),disabled:items.length===0},
            // Η αντιγραφή ζούσε ΚΑΙ ως κουμπί στην καθολική μπάρα του ακινήτου
            // (με δικό της modal) ΚΑΙ ως επιλογή στην άδεια κατάσταση εδώ. Δύο
            // δρόμοι για την ίδια πράξη, ο ένας ορατός μόνο όταν δεν έχεις τίποτα.
            ...otherProps.map(op=>({key:`clone${op.id}`,label:`Αντιγραφή από «${op.label}»`,description:'Προσθέτει τα αντικείμενα του άλλου ακινήτου σε αυτό.',onClick:()=>cloneFromProperty(op.id),busy:cloning})),
            ...exportActions.map(a=>({...a,disabled:items.length===0})),
          ]}/>
          {/* Με άδεια απογραφή, το «Νέο αντικείμενο» λέγεται από την κενή κατάσταση.
              Εδώ εμφανιζόταν και στα δύο σημεία, σε απόσταση μιας ματιάς. */}
          {items.length>0&&<Btn variant="primary" onClick={()=>{setEditingItem(null);setShowItemForm(true)}}>Νέο αντικείμενο</Btn>}
        </>}
      />}

      {/* ═══ ΟΤΑΝ Η ΑΠΟΓΡΑΦΗ ΔΕΝ ΑΦΟΡΑ ΑΥΤΟ ΤΟ ΑΚΙΝΗΤΟ ═════════════════════════
          Δεν δείχνουμε άδεια φόρμα 28 πεδίων σε κάποιον που μένει στο σπίτι του ή
          που το έχει κλειστό. Λέμε ΓΙΑΤΙ δεν την βλέπει και πού δηλώνεται η
          επίπλωση — δεν του ζητάμε να το ξαναδηλώσει εδώ. */}
      {!loading && !inventoryApplies && (
        <EmptyState
          icon={<Archive size={20}/>}
          /* Ο ΤΙΤΛΟΣ ΕΒΑΖΕ ΤΗΝ ΚΑΤΑΣΤΑΣΗ ΣΤΗ ΘΕΣΗ ΤΟΥ ΟΝΟΜΑΤΟΣ: «Δεν υπάρχει
             απογραφή εξοπλισμού σε ακίνητο «Κενό»» — σαν να λέγεται «Κενό» το
             ακίνητο. Το «Κενό» είναι κατάσταση και λέγεται ως κατάσταση, μέσα
             στην εξήγηση. Επίσης ήταν χειρόγραφη κενή κατάσταση, τυλιγμένη σε
             κάρτα: δύο παρεκκλίσεις από τις σαράντα πέντε άλλες της εφαρμογής,
             σε μία οθόνη. Τώρα είναι το κοινό EmptyState. */
          title={status==='rent_long' ? 'Το ακίνητο δεν έχει δηλωθεί επιπλωμένο' : 'Η απογραφή ξεκινά με τη μίσθωση'}
          /* ═══ Η ΥΠΟΔΕΙΞΗ ΕΙΝΑΙ Ο ΔΡΟΜΟΣ, ΟΧΙ ΤΟ ΔΟΚΙΜΙΟ ══════════════════════
             Ηταν τρεις προτάσεις, 275 χαρακτήρες, δύο γραμμές πέρα πέρα σε
             οθόνη 1.500 — και οι δύο πρώτες εξηγούσαν σε τι χρησιμεύει η
             απογραφή σε κάποιον που μόλις διάβασε στον τίτλο ότι δεν τον
             αφορά. Ο τίτλος λέει ΤΙ συμβαίνει· η υπόδειξη λέει ΤΙ ΝΑ ΚΑΝΕΙ,
             σε μία γραμμή. Ο,τι έμενε ήταν ήδη γραμμένο δύο φορές. */
          hint={status==='rent_long'
            ? 'Δήλωσε την επίπλωση στην καρτέλα «Ενοικιαστής» και η απογραφή ανοίγει εδώ.'
            : `Το ακίνητο είναι σε κατάσταση «${statusLabel(propRow)}». Η απογραφή ανοίγει μόλις μπει σε μίσθωση.`}
          /* Η ΚΕΝΗ ΚΑΤΑΣΤΑΣΗ ΕΣΤΕΛΝΕ ΑΛΛΟΥ ΚΑΙ ΤΕΛΕΙΩΝΕ ΕΚΕΙ. Οποιος έχει έναν
             λέβητα ή ένα κλιματιστικό να καταγράψει τώρα δεν έχει λόγο να
             περάσει πρώτα από την καρτέλα ενοικιαστή. Το πρώτο αντικείμενο
             ανοίγει την απογραφή, οπότε ο δρόμος λέγεται εδώ που ρωτιέται. */
          action={<Btn onClick={()=>{setEditingItem(null);setFormManual(true);setShowItemForm(true)}}>Πρόσθεσε ένα αντικείμενο</Btn>}
        />
      )}

      {!loading&&inventoryApplies&&(items.length===0
        ? <div className="card" style={{textAlign:'center',padding:'clamp(40px,7vw,68px) 24px',marginTop:8}}>
            {handoverSeed&&(
              <div style={{display:'flex',alignItems:'center',gap:10,textAlign:'left',maxWidth:520,margin:'0 auto 24px',padding:'12px 16px',background:'var(--accent-soft)',border:'1px solid var(--accent-border)',borderRadius:T.radius.inner}}>
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                <p style={{fontSize: 'var(--fs-base)',color:'var(--text-secondary)',fontFamily:T.font.sans,lineHeight:1.5}}>Για το πρωτόκολλο παράδοσης{handoverSeed.tenantName?<> του <strong style={{color:'var(--text-primary)'}}>{handoverSeed.tenantName}</strong></>:''} πρόσθεσε πρώτα τον εξοπλισμό του ακινήτου, μετά θα καταγράφεις την κατάστασή του σε κάθε παράδοση/παραλαβή.</p>
              </div>
            )}
            <div style={{width:64,height:64,borderRadius: T.radius.modal,background:'var(--accent-soft)',border:'1px solid var(--accent-border)',color:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 18px'}}>
              <svg aria-hidden="true" width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M21 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2"/><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M10 12h4"/></svg>
            </div>
            <p style={{fontSize:20,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)',letterSpacing:'-0.01em',marginBottom:8}}>{handoverSeed?'Πρόσθεσε εξοπλισμό πρώτα':'Ξεκίνησε την καταγραφή'}</p>
            {/* ═══ ΔΥΟ ΔΡΟΜΟΙ, ΚΑΙ Ο ΔΕΥΤΕΡΟΣ ΕΙΝΑΙ ΤΟ ΧΕΡΙ ══════════════════════
                ΤΙ ΕΛΕΙΠΕ. Το μόνο κύριο κουμπί έλεγε «Φωτογράφισε αντικείμενο»
                και όποιος δεν είχε τι να φωτογραφήσει —παλιό έπιπλο, καναπές,
                τραπέζι— δεν έβλεπε πουθενά δρόμο. Η χειροκίνητη συμπλήρωση
                υπήρχε, αλλά κρυμμένη ΜΕΣΑ στο παράθυρο της φωτογραφίας: για να
                τη βρεις έπρεπε πρώτα να πατήσεις κάτι που δεν σε αφορούσε.

                ΤΙ ΕΦΥΓΕ. Τρεις κάρτες που εξηγούσαν τι κάνει η απογραφή. Η
                πρώτη επαναλάμβανε το κύριο κουμπί και οι τρεις μαζί
                επαναλάμβαναν λέξη προς λέξη τον υπότιτλο από πάνω τους: αξία,
                εγγυήσεις, κατανάλωση. Μια οθόνη που λέει το ίδιο πράγμα τρεις
                φορές δεν πείθει περισσότερο, κουράζει.

                ΤΙ ΜΕΝΕΙ. Δύο δρόμοι στο ίδιο βάρος, γιατί δύο είναι — και από
                κάτω, πιο ήσυχα, οι τρεις συντομεύσεις για όποιον έχει ήδη
                λίστα, πρότυπο ή δεύτερο ακίνητο. Η ιεραρχία λέγεται με το
                μέγεθος και τη θέση, όχι με πλαίσια. */}
            <p style={{fontSize: 'var(--fs-base)',color:'var(--text-secondary)',fontFamily:T.font.sans,maxWidth:430,margin:'0 auto 26px',lineHeight:1.6}}>Έπιπλα, συσκευές και εξοπλισμός σε ένα μητρώο: αξία, εγγυήσεις και κατανάλωση ρεύματος.</p>
            <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap',marginBottom:20}}>
              {/* Η φωτογραφία μπροστά: το AI διαβάζει μάρκα, μοντέλο, αξία και
                  εγγύηση, οπότε είναι ο συντομότερος δρόμος όταν υπάρχει ετικέτα. */}
              <Btn variant="primary" onClick={()=>{setEditingItem(null);setFormManual(false);setShowItemForm(true)}}>Με φωτογραφία</Btn>
              <Btn onClick={()=>{setEditingItem(null);setFormManual(true);setShowItemForm(true)}}>Με το χέρι</Btn>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'center',flexWrap:'wrap',alignItems:'center'}}>
              <button onClick={()=>setShowBulkImport(true)} style={quietAction}>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
                Μαζική εισαγωγή
              </button>
              <button onClick={insertStarterPack} disabled={cloning} style={{...quietAction,cursor:cloning?'wait':'pointer'}}>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg>
                {cloning?'Δημιουργία…':`Πρότυπο επιπλωμένου (${STARTER_PACK.length})`}
              </button>
              {otherProps.length>0&&<BulkPicker label="Αντιγραφή από ακίνητο" icon={<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>} options={otherProps.map(p=>p.label)} onPick={label=>{const p=otherProps.find(x=>x.label===label);if(p)cloneFromProperty(p.id)}}/>}
            </div>
          </div>
        : page==='handover' ? null : (
            // ΚΑΝΕΝΑ ΜΗΔΕΝΙΚΟ ΠΛΑΚΙΔΙΟ. Ρεύμα εμφανίζεται μόνο όταν υπάρχει
            // μετρημένη κατανάλωση, κόστος αντικατάστασης μόνο όταν έχει δηλωθεί
            // έστω μία φορά. Ένα πλακίδιο που γράφει «0,00 €» δεν λέει «δεν
            // υπάρχει μέτρηση», λέει «μετρήσαμε μηδέν» — και είναι ψέμα.
            <KPIGrid items={[
              {label:'Αντικείμενα',value:fn(items.length),sub:`${categoryCount} ${categoryCount===1?'κατηγορία':'κατηγορίες'}`},
              // ΤΟ ΙΔΙΟ ΠΛΑΚΙΔΙΟ ΕΣΠΑΖΕ ΤΟΝ ΚΑΝΟΝΑ ΠΟΥ ΓΡΑΦΕΙ ΑΠΟ ΠΑΝΩ ΤΟΥ. Οταν
              // κανένα αντικείμενο δεν έχει δηλωμένη τιμή αγοράς, το άθροισμα
              // είναι μηδέν και το πλακίδιο τύπωνε «0,00 €» με υπότιτλο
              // «εκτίμηση, όχι φορολογική απόσβεση»: ανακοίνωνε αποτέλεσμα
              // εκτίμησης εκεί που δεν έγινε καμία εκτίμηση. Εμφανίζεται μόνο
              // όταν υπάρχει έστω μία τιμή αγοράς να αθροιστεί.
              ...(invSummary.totalOriginal>0?[{label:'Εκτιμώμενη υπολειπόμενη αξία',value:fe(totalValue),
                sub:`από ${fe(invSummary.totalOriginal)} αξία αγοράς, μένει το ${Math.max(0,100-invSummary.avgDepreciatedPct)}%`}]:[]),
              ...(electricItems.length>0?[kwhPrice>0
                ? {label:'Ρεύμα ανά μήνα',value:fe(monthlyCost),sub:`${fn(monthlyKwh,1)} κιλοβατώρες, στα ${feRate(kwhPrice)} ανά κιλοβατώρα`}
                : {label:'Ρεύμα ανά μήνα',value:`${fn(monthlyKwh,1)} kWh`,sub:'δήλωσε τιμή ανά κιλοβατώρα για κόστος'}]:[]),
              ...(declaredRepl.length>0?[{label:'Κόστος αντικατάστασης',value:fe(declaredReplTotal),
                sub:declaredRepl.length<items.length
                  ? `δηλωμένο σε ${declaredRepl.length} από ${items.length} αντικείμενα`
                  : 'δηλωμένο σε όλα τα αντικείμενα'}]:[]),
            ]}/>
          )
      )}

      {!loading && items.length>0 && page==='handover' && (
        <div style={{marginTop:8}}>
          <button onClick={()=>setPage('main')} style={{display:'inline-flex',alignItems:'center',gap:6,height:T.h.sm,padding:'0 12px',marginBottom:16,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'var(--bg-elevated)',color:'var(--text-secondary)',fontSize: 'var(--fs-base)',fontFamily:T.font.sans,cursor:'pointer'}}>
            <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            Πίσω στα έπιπλα και τον εξοπλισμό
          </button>
          <HandoverTab items={items} handovers={handovers} propertyId={propertyId} userId={userId} onSaved={fetchData} seed={handoverSeed}/>
        </div>
      )}

      {/* ═══ ΜΙΑ ΣΕΛΙΔΑ, ΔΙΑΒΑΖΕΤΑΙ ΑΠΟ ΠΑΝΩ ΠΡΟΣ ΤΑ ΚΑΤΩ ══════════════════
          τι πρέπει να κάνω · τι έχω · τι έχω προγραμματίσει · πού πάει η αξία
          και το ρεύμα · τι έχω παραδώσει. Καμία υποκαρτέλα, κανένα κλικ για να
          δεις την κατάσταση ενός σπιτιού με δέκα αντικείμενα. */}
      {(loading || items.length > 0) && page==='main' && (
        <div style={{display:'flex',flexDirection:'column',gap:28,marginTop:24}}>
          {loading
            ?<><SkeletonKPIs n={4}/><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:14}}>{[0,1,2,3,4,5].map(i=><Skeleton key={i} h={180} r={14}/>)}</div></>
            :<>
              <AttentionCard items={items} onEdit={item=>{setEditingItem(item);setShowItemForm(true)}} onWarrantyReminder={handleWarrantyReminder}/>
              <ItemsTab items={items} kwhPrice={kwhPrice} onAdd={()=>{setEditingItem(null);setShowItemForm(true)}} onEdit={item=>{setEditingItem(item);setShowItemForm(true)}} onDelete={handleDelete} onRepair={item=>setRepairItem(item)} onQR={item=>setQrItem(item)} onUpdateCondition={handleUpdateCondition} onWarrantyReminder={handleWarrantyReminder} onBulkDelete={handleBulkDelete} onBulkRoom={handleBulkRoom}/>
              <MaintenanceTab items={items} schedules={schedules} propertyId={propertyId} userId={userId} onSaved={fetchData}/>
              <AnalysisCards items={items} repairs={repairs} kwhPrice={kwhPrice} kwhControl={kwhControl}/>
              <HandoverCard handovers={handovers} onOpenHandover={()=>setPage('handover')}/>
            </>}
        </div>
      )}
    </div>
  )
}