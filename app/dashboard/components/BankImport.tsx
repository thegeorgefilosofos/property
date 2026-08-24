'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import * as expenseStore from '@/lib/data/expenses'
import * as rentStore from '@/lib/data/rent'
import { Check, ArrowRight, Landmark, SearchX } from 'lucide-react'
import { readBankCsv, matchTransactions, legacyKeyOf, type BankTxn, type ExpectedRent, type RentMatch, type ExpenseSuggestion } from '@/lib/accounting/bankImport'
import { feAuto, T, ABSENT_DATE, EmptyState, Modal, Spinner } from '@/components/Theme'
import { athensToday } from '@/lib/core/time';
import { MONTHS_NOM } from '@/lib/core/months';
import type { RentPaymentsRow, BankTransactionsRow } from '@/lib/supabase/tables';
import { notifyError } from '@/components/Toast';
import { failed } from '@/lib/core/dbError';

// ΤΟ ΑΠΟΤΥΠΩΜΑ ΕΦΥΓΕ ΣΤΗ ΜΗΧΑΝΗ, ΔΙΠΛΑ ΣΤΗΝ ΑΝΑΓΝΩΣΗ ΤΟΥ ΑΡΧΕΙΟΥ. Ηταν εδώ
// `${date}|${amount}|${description}`: δύο αναλήψεις 50,00 από το ίδιο ΑΤΜ την
// ίδια ημέρα έδιναν ένα κλειδί και η δεύτερη χανόταν στο ignoreDuplicates,
// δηλαδή 50,00 λιγότερα έξοδα στο Ε2. Μόνο η `readBankCsv` βλέπει ολόκληρη τη
// γραμμή του αρχείου και τη σειρά της, οπότε μόνο εκείνη μπορεί να ξεχωρίσει
// δύο πραγματικά διαφορετικές κινήσεις. Εδώ διαβάζεται έτοιμο: `t.key`.

// Εισαγωγή τραπεζικής κίνησης (CSV) και αντιστοίχιση σε ενοίκια/έξοδα. Καθαρό,
// minimal modal: επικόλληση ή αρχείο → ανάλυση → επιβεβαίωση → καταχώρηση.
export default function BankImport({ propertyId, userId, year, onClose, onDone }:{ propertyId:string; userId:string; year:number; onClose:()=>void; onDone:()=>void }) {
  const supabase = createClient()
  const [text,setText] = useState('')
  const [step,setStep] = useState<'input'|'review'|'saving'>('input')
  const [rentMatches,setRentMatches] = useState<(RentMatch&{label:string;due:string|null;confirm:boolean})[]>([])
  const [expenses,setExpenses] = useState<(ExpenseSuggestion&{confirm:boolean})[]>([])
  // ΤΡΙΑ ΣΥΝΟΛΑ ΕΠΙΣΤΡΕΦΕΙ Η ΜΗΧΑΝΗ, ΔΥΟ ΔΙΑΒΑΖΕ Η ΟΘΟΝΗ. Οι πιστώσεις που δεν
  // δέσμευσαν ανεξόφλητο ενοίκιο έφταναν ως εδώ και πέθαιναν: καμία μεταβλητή,
  // κανένα JSX, κανένας μετρητής. Στο αντίγραφο που μετρήθηκε (μερική πληρωμή
  // 750,00, ενοίκιο ήδη σημειωμένο 800,00, εγγύηση 1.600,00) η matchTransactions
  // γύριζε τρεις αταίριαστες κινήσεις, 3.150,00 ευρώ, και η οθόνη έγραφε «Δεν
  // βρέθηκαν νέες αντιστοιχίσεις» στέλνοντας τον χρήστη να ελέγξει την περίοδο
  // του αρχείου: το λάθος δεν ήταν έλλειψη πληροφορίας, ήταν λάθος πληροφορία.
  const [unmatched,setUnmatched] = useState<BankTxn[]>([])
  const [unreadable,setUnreadable] = useState(0)
  const [skipped,setSkipped] = useState(0)
  const [error,setError] = useState('')
  const [savedMsg,setSavedMsg] = useState('')

  async function analyze(raw:string){
    setError(''); setUnmatched([]); setUnreadable(0)
    const { txns, unreadable:lost } = readBankCsv(raw)
    setUnreadable(lost)
    if(!txns.length){ setError(lost>0?`Δεν διαβάστηκε καμία κίνηση: ${lost} ${lost===1?'γραμμή δεν είχε':'γραμμές δεν είχαν'} αναγνωρίσιμο ποσό.`:'Δεν βρέθηκαν κινήσεις. Έλεγξε ότι το αρχείο έχει στήλες ημερομηνία, περιγραφή και ποσό.'); return }
    // Dedup: πέτα ό,τι έχει ξαναμπεί.
    // ΚΑΘΕ ΠΑΛΙΟ ΑΠΟΤΥΠΩΜΑ ΚΑΤΑΝΑΛΩΝΕΤΑΙ ΜΙΑ ΦΟΡΑ. Το uq_bank_txn_dedup αφήνει
    // το πολύ μία γραμμή ανά παλιό κλειδί, οπότε από δύο πανομοιότυπες γραμμές
    // του αρχείου η πρώτη μετρά ως ήδη εισαγμένη και η δεύτερη, που παλιότερα
    // χανόταν, περνά. Χωρίς την κατανάλωση θα έμενε χαμένη για πάντα.
    // ΤΟ ΣΦΑΛΜΑ ΔΕΝ ΕΠΙΤΡΕΠΕΤΑΙ ΝΑ ΠΕΡΑΣΕΙ ΣΙΩΠΗΛΑ. Το `error` αγνοούνταν: μια
    // αποτυχία του ερωτήματος έδινε `existing = null`, άρα ΚΕΝΟ σύνολο
    // αποτυπωμάτων, άρα κάθε γραμμή του αρχείου περνούσε ως καινούρια. Ο
    // χρήστης δεν έβλεπε λάθος — έβλεπε διπλές κινήσεις στα βιβλία του.
    const { data: existing, error: dedupErr } = await supabase.from('bank_transactions').select('dedup_hash').eq('user_id',userId)
    if (dedupErr) { notifyError(failed('Ο έλεγχος για διπλές κινήσεις δεν ολοκληρώθηκε', dedupErr)); return }
    const seen = new Set((existing||[]).map(r=>r.dedup_hash))
    const fresh = txns.filter(t=>!(seen.has(t.key) || seen.delete(legacyKeyOf(t))))
    setSkipped(txns.length - fresh.length)
    // Αναμενόμενα ενοίκια (ανεξόφλητα) του έτους.
    const rp = await rentStore.ofProperty(supabase,propertyId,`id,${rentStore.LEDGER_COLUMNS}`,userId,{ year })
    // ΟΙ ΤΥΠΟΙ ΤΩΝ ΓΡΑΜΜΩΝ ΥΠΑΡΧΟΥΝ ΗΔΗ, ΠΑΡΑΓΟΜΕΝΟΙ ΑΠΟ ΤΑ MIGRATIONS. Ήταν
    // γραμμένο `(p:any)` τρεις φορές: ένα ορθογραφικό σε όνομα στήλης θα περνούσε
    // μέχρι την οθόνη, και το `period_month` θα γινόταν σιωπηλά «undefined» μέσα
    // στην ετικέτα του μήνα.
    type Row = Pick<RentPaymentsRow, 'id' | 'period_year' | 'period_month' | 'amount' | 'due_date' | 'paid'>
    const expected:ExpectedRent[] = ((rp||[]) as Row[]).filter(p=>!p.paid).map(p=>({ id:p.id, label:`${MONTHS_NOM[(p.period_month||1)-1]} ${p.period_year}`, amount:p.amount||0, dueDate:p.due_date||`${p.period_year}-${String(p.period_month).padStart(2,'0')}-01` }))
    const res = matchTransactions(fresh, expected)
    // Η ΠΡΟΘΕΣΜΙΑ ΤΑΞΙΔΕΥΕΙ ΜΑΖΙ ΜΕ ΤΗΝ ΑΝΤΙΣΤΟΙΧΙΣΗ: χωρίς αυτήν, η καταχώρηση
    // της είσπραξης δεν μπορεί να πει πόσο άργησε ο μισθωτής.
    const byId = new Map(expected.map(e=>[e.id,e]))
    setRentMatches(res.rentMatches.map(m=>({ ...m, label:byId.get(m.rentId)?.label||'Ενοίκιο', due:byId.get(m.rentId)?.dueDate||null, confirm:true })))
    setExpenses(res.expenseSuggestions.map(e=>({ ...e, confirm:false })))
    setUnmatched(res.unmatched)
    setStep('review')
  }

  async function save(){
    setStep('saving')
    try{
      // Η γραμμή που γράφεται στον πίνακα κινήσεων, με τον τύπο του πίνακα.
      const rows: Pick<BankTransactionsRow, 'user_id'|'property_id'|'txn_date'|'description'|'amount'|'dedup_hash'>[] = []
      for(const m of rentMatches){ if(m.confirm){
        // Η ΕΙΣΠΡΑΞΗ ΠΕΡΝΑ ΑΠΟ ΤΟ ΣΤΡΩΜΑ, που γράφει ΚΑΙ τις ημέρες καθυστέρησης.
        // Εδώ γράφονταν τρεις στήλες από τις τέσσερις: μια δόση που εισπράχθηκε
        // δύο μήνες αργότερα καταγραφόταν με μηδέν ημέρες καθυστέρησης, και ο
        // λογιστής διάβαζε συνεπή μισθωτή που δεν ήταν.
        const { error } = await rentStore.markPaid(supabase, m.rentId, m.due, m.txn.date || athensToday(), 'Τραπεζική κατάθεση')
        if(error) throw error
        rows.push({ user_id:userId, property_id:propertyId, txn_date:m.txn.date||null, description:m.txn.description, amount:m.txn.amount, dedup_hash:m.txn.key })
      }}
      const toAdd = expenses.filter(e=>e.confirm)
      if(toAdd.length){
        const { error } = await expenseStore.insertFromBank(supabase, toAdd.map(e=>({
          ...expenseStore.row({ propertyId, userId }, { amount:e.amount, description:e.description.slice(0,120), date:e.txn.date||athensToday(), category:'Τραπεζική κίνηση' }),
          dedup_hash: e.txn.key,
        })))
        if(error) throw error
        for(const e of toAdd) rows.push({ user_id:userId, property_id:propertyId, txn_date:e.txn.date||null, description:e.txn.description, amount:e.txn.amount, dedup_hash:e.txn.key })
      }
      if(rows.length){ const { error } = await supabase.from('bank_transactions').upsert(rows,{ onConflict:'user_id,dedup_hash', ignoreDuplicates:true }); if(error) throw error }
      const nR = rentMatches.filter(m=>m.confirm).length
      setSavedMsg(`Καταχωρήθηκαν ${nR} ${nR===1?'ενοίκιο':'ενοίκια'} και ${toAdd.length} ${toAdd.length===1?'έξοδο':'έξοδα'}.`)
      onDone()
      setTimeout(onClose, 1400)
    }catch(_){ setError('Σφάλμα κατά την καταχώρηση. Δοκίμασε ξανά.'); setStep('review') }
  }

  const field:React.CSSProperties = { width:'100%', minHeight:104, padding:'11px 14px', borderRadius:T.radius.inner, border:'1px solid var(--border-default)', background:'var(--bg-surface)', color:'var(--text-primary)', fontSize:13, fontFamily:T.font.mono, lineHeight:'19px', resize:'vertical', outline:'none', transition:'border-color 0.14s' }
  const row:React.CSSProperties = { display:'flex', alignItems:'center', gap:12, padding:'10px 12px', borderRadius:T.radius.inner, background:'var(--bg-surface)', border:'1px solid var(--border-subtle)' }

  function Box({ checked, onClick }:{ checked:boolean; onClick:()=>void }){
    return <button type="button" role="checkbox" aria-checked={checked} onClick={onClick} style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:18, height:18, borderRadius:6, border:`1.5px solid ${checked?'var(--accent)':'var(--border-default)'}`, background:checked?'var(--accent)':'var(--bg-elevated)', cursor:'pointer', flexShrink:0, padding:0 }}>{checked&&<Check size={12} style={{ color:'var(--accent-text)' }}/>}</button>
  }

  // Η ίδια συνθήκη ήταν γραμμένη ΤΡΕΙΣ φορές στο κουμπί «Καταχώρηση» (disabled,
  // φόντο, χρώμα κειμένου) — τρία αντίγραφα που μπορούσαν να διαφωνήσουν.
  const canSave = rentMatches.some(m=>m.confirm) || expenses.some(e=>e.confirm)
  // ── ΔΕΝ ΚΛΕΙΝΕΙ ΟΣΟ ΚΑΤΑΧΩΡΕΙ ────────────────────────────────────────────
  // Το χειρόγραφο κέλυφος δεν άκουγε Escape· το Modal ακούει. Η `save()` γράφει
  // σε ΤΡΕΙΣ πίνακες στη σειρά (rent_payments, expenses, bank_transactions) και
  // μόνο στο τέλος λέει τι πέρασε. Ένα Escape στη μέση κλείνει το παράθυρο ενώ
  // οι εγγραφές τρέχουν: ο χρήστης δεν μαθαίνει ούτε πόσα καταχωρήθηκαν ούτε αν
  // κάτι απέτυχε, και ξαναδοκιμάζει στα τυφλά. Το κανονικό αυτόματο κλείσιμο
  // μετά την επιτυχία περνά κατευθείαν από το `onClose`, οπότε δεν εμποδίζεται.
  const requestClose = () => { if (step !== 'saving') onClose() }
  // Το αρχείο ανοίγει από <label>: το ίδιο το <input type="file"> είναι κρυμμένο.
  const filePicker = (
    <label style={{ fontSize:13, color:'var(--accent)', cursor:'pointer', fontFamily: T.font.sans }}>
      Άνοιγμα αρχείου CSV
      <input type="file" accept=".csv,text/csv,text/plain" style={{ display:'none' }} onChange={e=>{ const f=e.target.files?.[0]; if(f){ const r=new FileReader(); r.onload=()=>{ const v=String(r.result||''); setText(v); analyze(v) }; r.readAsText(f) } }}/>
    </label>
  )

  return (
    // ΤΟ ΠΑΡΑΘΥΡΟ ΗΤΑΝ ΧΕΙΡΟΓΡΑΦΟ: δικό του overlay με στοίχιση στην κορυφή
    // (padding 6vh) και δική του κεφαλίδα, χωρίς Escape, χωρίς επιστροφή
    // εστίασης, χωρίς κλείδωμα κύλισης — το φόντο κυλούσε κάτω από το παράθυρο.
    // Οι ενέργειες κάθε βήματος πέρασαν στο υποσέλιδο: ίδια θέση και στα δύο
    // βήματα, και δεν κυλούν μαζί με τη λίστα των κινήσεων.
    <Modal open onClose={requestClose} width={560}
      icon={<Landmark size={19}/>}
      title="Εισαγωγή τραπεζικής κίνησης"
      subtitle="Αντιστοίχισε αυτόματα τις κινήσεις σε ενοίκια και έξοδα, με τη δική σου έγκριση"
      footerInfo={step==='input' ? filePicker : undefined}
      footer={
        step==='input' ? (
          <button disabled={!text.trim()} onClick={()=>analyze(text)} style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'9px 18px', borderRadius:T.radius.btn, border:'none', background:text.trim()?'var(--accent)':'var(--bg-surface)', color:text.trim()?'var(--accent-text)':'var(--text-tertiary)', fontSize:12, fontWeight:700, cursor:text.trim()?'pointer':'default', fontFamily: T.font.sans }}>Ανάλυση<ArrowRight size={15}/></button>
        ) : step==='review' ? (<>
          <button onClick={()=>setStep('input')} style={{ padding:'9px 18px', borderRadius:T.radius.btn, border:'1px solid var(--border-default)', background:'var(--bg-surface)', color:'var(--text-secondary)', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily: T.font.sans }}>Πίσω</button>
          <button disabled={!canSave} onClick={save} style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'9px 18px', borderRadius:T.radius.btn, border:'none', background:canSave?'var(--accent)':'var(--bg-surface)', color:canSave?'var(--accent-text)':'var(--text-tertiary)', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily: T.font.sans }}>Καταχώρηση</button>
        </>) : undefined
      }>
      {step==='input'&&(<div>
        <p style={{ fontSize:13, color:'var(--text-secondary)', margin:'0 0 10px', fontFamily: T.font.sans, lineHeight:1.55 }}>Επικόλλησε την κίνηση από το e-banking (CSV) ή ανέβασε αρχείο. Αναγνωρίζονται στήλες ημερομηνία, περιγραφή και ποσό (ή χρέωση/πίστωση).</p>
        <textarea value={text} onChange={e=>setText(e.target.value)} placeholder={'Ημερομηνία;Περιγραφή;Ποσό\n05/03/2026;Κατάθεση ενοικίου;800,00'} style={field}
          onFocus={e=>e.currentTarget.style.borderColor='var(--accent)'} onBlur={e=>e.currentTarget.style.borderColor='var(--border-default)'}/>
        {error&&<p style={{ fontSize:13, color:'var(--negative)', margin:'12px 0 0', fontFamily: T.font.sans }}>{error}</p>}
      </div>)}

      {step==='review'&&(<div>
        {/* Η ΥΠΟΔΕΙΞΗ ΤΗΣ ΚΕΝΗΣ ΚΑΤΑΣΤΑΣΗΣ ΕΛΕΓΕ ΨΕΜΑΤΑ. Οσο οι αταίριαστες
            πιστώσεις ήταν αόρατες, η κατάσταση αυτή έβγαινε ΚΑΙ με γεμάτο
            αρχείο και έστελνε τον χρήστη να ελέγξει την περίοδο. Με το τρίτο
            τμήμα στη θέση του, βγαίνει μόνο όταν κάθε κίνηση είχε ήδη εισαχθεί,
            οπότε λέει ακριβώς αυτό. */}
        {rentMatches.length===0&&expenses.length===0&&unmatched.length===0?(
          <EmptyState icon={<SearchX size={20}/>} title="Δεν βρέθηκαν νέες αντιστοιχίσεις" hint={skipped>0?`${skipped} ${skipped===1?'κίνηση είχε':'κινήσεις είχαν'} ήδη εισαχθεί.`:'Καμία νέα κίνηση στο αρχείο.'}/>
        ):(<>
          {rentMatches.length>0&&(<>
            <p style={{ fontSize: 11, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text-secondary)', margin:'0 0 8px', fontFamily: T.font.sans }}>Ενοίκια που εισπράχθηκαν</p>
            <div style={{ display:'flex', flexDirection:'column', gap:7, marginBottom:16 }}>
              {rentMatches.map((m,i)=>(
                <div key={i} style={row}>
                  <Box checked={m.confirm} onClick={()=>setRentMatches(a=>a.map((x,j)=>j===i?{...x,confirm:!x.confirm}:x))}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:13, color:'var(--text-primary)', margin:0, fontFamily: T.font.sans }}>{m.label}</p>
                    <p style={{ fontSize:11, color:'var(--text-tertiary)', margin:'1px 0 0', fontFamily: T.font.sans, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.txn.date} · {m.txn.description}</p>
                  </div>
                  <span style={{ fontSize:13, fontWeight:600, color:'var(--positive)', fontVariantNumeric:'tabular-nums', fontFamily: T.font.sans }}>{feAuto(m.txn.amount)}</span>
                </div>
              ))}
            </div>
          </>)}
          {expenses.length>0&&(<>
            <p style={{ fontSize: 11, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text-secondary)', margin:'0 0 8px', fontFamily: T.font.sans }}>Πιθανά έξοδα</p>
            <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
              {expenses.map((e,i)=>(
                <div key={i} style={row}>
                  <Box checked={e.confirm} onClick={()=>setExpenses(a=>a.map((x,j)=>j===i?{...x,confirm:!x.confirm}:x))}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:13, color:'var(--text-primary)', margin:0, fontFamily: T.font.sans, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.description}</p>
                    <p style={{ fontSize:11, color:'var(--text-tertiary)', margin:'1px 0 0', fontFamily: T.font.sans }}>{e.txn.date}</p>
                  </div>
                  <span style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', fontVariantNumeric:'tabular-nums', fontFamily: T.font.sans }}>{feAuto(e.amount)}</span>
                </div>
              ))}
            </div>
          </>)}
          {/* ΜΟΝΟ ΑΝΑΓΝΩΣΗ, ΧΩΡΙΣ ΚΟΥΤΑΚΙ: δεν υπάρχει ενέργεια να προσφερθεί.
              Οι γραμμές αυτές ΔΕΝ γράφονται στο bank_transactions ούτε όταν ο
              χρήστης πατήσει «Καταχώρηση»: το dedup της ανάλυσης θα τις έκρυβε
              στην επόμενη εισαγωγή, δηλαδή το ίδιο σφάλμα με άλλο τρόπο. */}
          {unmatched.length>0&&(<>
            <p style={{ fontSize: 11, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text-secondary)', margin:'16px 0 8px', fontFamily: T.font.sans }}>Κινήσεις χωρίς αντιστοίχιση</p>
            <p style={{ fontSize:11, color:'var(--text-tertiary)', margin:'0 0 8px', fontFamily: T.font.sans, lineHeight:1.5 }}>Δεν ταιριάζουν σε ανεξόφλητο ενοίκιο του {year} και δεν καταχωρούνται από εδώ. Επανεμφανίζονται σε κάθε εισαγωγή, μέχρι να τακτοποιηθούν.</p>
            <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
              {unmatched.map((t,i)=>(
                <div key={i} style={row}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:13, color:'var(--text-primary)', margin:0, fontFamily: T.font.sans, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.description||'Χωρίς περιγραφή'}</p>
                    <p style={{ fontSize:11, color:'var(--text-tertiary)', margin:'1px 0 0', fontFamily: T.font.sans }}>{t.date||ABSENT_DATE}</p>
                  </div>
                  <span style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', fontVariantNumeric:'tabular-nums', fontFamily: T.font.sans }}>{feAuto(t.amount)}</span>
                </div>
              ))}
            </div>
          </>)}
          {skipped>0&&<p style={{ fontSize:11, color:'var(--text-tertiary)', margin:'12px 0 0', fontFamily: T.font.sans }}>{skipped} {skipped===1?'κίνηση παραλείφθηκε: είχε':'κινήσεις παραλείφθηκαν: είχαν'} ήδη εισαχθεί.</p>}
        </>)}
        {unreadable>0&&<p style={{ fontSize:11, color:'var(--text-tertiary)', margin:'12px 0 0', fontFamily: T.font.sans }}>{unreadable} {unreadable===1?'γραμμή του αρχείου δεν διαβάστηκε':'γραμμές του αρχείου δεν διαβάστηκαν'}: χωρίς αναγνωρίσιμο ποσό.</p>}
        {error&&<p style={{ fontSize:13, color:'var(--negative)', margin:'12px 0 0', fontFamily: T.font.sans }}>{error}</p>}
      </div>)}

      {step==='saving'&&(
        <Spinner size={20} label={savedMsg||'Καταχώρηση…'}/>
      )}
    </Modal>
  )
}
