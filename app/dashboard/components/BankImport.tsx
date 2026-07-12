'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Check, ArrowRight, Landmark } from 'lucide-react'
import { parseBankCsv, matchTransactions, type BankTxn, type ExpectedRent, type RentMatch, type ExpenseSuggestion } from '@/lib/accounting/bankImport'

const MONTHS = ['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος','Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος']
const eur = (n:number)=>Math.round(n).toLocaleString('el-GR')+' €'
const hashOf = (t:BankTxn)=>`${t.date}|${t.amount}|${t.description}`.slice(0,200)

// Εισαγωγή τραπεζικής κίνησης (CSV) και αντιστοίχιση σε ενοίκια/έξοδα. Καθαρό,
// minimal modal: επικόλληση ή αρχείο → ανάλυση → επιβεβαίωση → καταχώριση.
export default function BankImport({ propertyId, userId, year, onClose, onDone }:{ propertyId:string; userId:string; year:number; onClose:()=>void; onDone:()=>void }) {
  const supabase = createClient()
  const [text,setText] = useState('')
  const [step,setStep] = useState<'input'|'review'|'saving'>('input')
  const [rentMatches,setRentMatches] = useState<(RentMatch&{label:string;confirm:boolean})[]>([])
  const [expenses,setExpenses] = useState<(ExpenseSuggestion&{confirm:boolean})[]>([])
  const [skipped,setSkipped] = useState(0)
  const [error,setError] = useState('')
  const [savedMsg,setSavedMsg] = useState('')

  async function analyze(raw:string){
    setError('')
    const txns = parseBankCsv(raw)
    if(!txns.length){ setError('Δεν βρέθηκαν κινήσεις. Έλεγξε ότι το αρχείο έχει στήλες ημερομηνία, περιγραφή και ποσό.'); return }
    // Dedup: πέτα ό,τι έχει ξαναμπεί.
    const { data: existing } = await supabase.from('bank_transactions').select('dedup_hash').eq('user_id',userId)
    const seen = new Set((existing||[]).map((r:any)=>r.dedup_hash))
    const fresh = txns.filter(t=>!seen.has(hashOf(t)))
    setSkipped(txns.length - fresh.length)
    // Αναμενόμενα ενοίκια (ανεξόφλητα) του έτους.
    const { data: rp } = await supabase.from('rent_payments').select('id,period_year,period_month,amount,due_date,paid').eq('property_id',propertyId).eq('user_id',userId).eq('period_year',year)
    const expected:ExpectedRent[] = (rp||[]).filter((p:any)=>!p.paid).map((p:any)=>({ id:p.id, label:`${MONTHS[(p.period_month||1)-1]} ${p.period_year}`, amount:p.amount||0, dueDate:p.due_date||`${p.period_year}-${String(p.period_month).padStart(2,'0')}-01` }))
    const res = matchTransactions(fresh, expected)
    const labelById = new Map(expected.map(e=>[e.id,e.label]))
    setRentMatches(res.rentMatches.map(m=>({ ...m, label:labelById.get(m.rentId)||'Ενοίκιο', confirm:true })))
    setExpenses(res.expenseSuggestions.map(e=>({ ...e, confirm:false })))
    setStep('review')
  }

  async function save(){
    setStep('saving')
    try{
      const rows:any[] = []
      for(const m of rentMatches){ if(m.confirm){
        await supabase.from('rent_payments').update({ paid:true, paid_date:m.txn.date||null, method:'Τραπεζική κατάθεση' }).eq('id',m.rentId)
        rows.push({ user_id:userId, property_id:propertyId, txn_date:m.txn.date||null, description:m.txn.description, amount:m.txn.amount, dedup_hash:hashOf(m.txn) })
      }}
      const toAdd = expenses.filter(e=>e.confirm)
      if(toAdd.length){
        await supabase.from('expenses').insert(toAdd.map(e=>({ property_id:propertyId, user_id:userId, amount:e.amount, description:e.description.slice(0,120), date:e.txn.date||new Date().toISOString().slice(0,10), category:'Τραπεζική κίνηση' })))
        for(const e of toAdd) rows.push({ user_id:userId, property_id:propertyId, txn_date:e.txn.date||null, description:e.txn.description, amount:e.txn.amount, dedup_hash:hashOf(e.txn) })
      }
      if(rows.length) await supabase.from('bank_transactions').upsert(rows,{ onConflict:'user_id,dedup_hash', ignoreDuplicates:true })
      const nR = rentMatches.filter(m=>m.confirm).length
      setSavedMsg(`Καταχωρήθηκαν ${nR} ${nR===1?'ενοίκιο':'ενοίκια'} και ${toAdd.length} ${toAdd.length===1?'έξοδο':'έξοδα'}.`)
      onDone()
      setTimeout(onClose, 1400)
    }catch(_){ setError('Σφάλμα κατά την καταχώριση. Δοκίμασε ξανά.'); setStep('review') }
  }

  const field:React.CSSProperties = { width:'100%', minHeight:150, padding:'12px 14px', borderRadius:12, border:'1px solid var(--border-subtle)', background:'var(--bg-surface)', color:'var(--text-primary)', fontSize:13, fontFamily:"'Inter',sans-serif", lineHeight:1.5, resize:'vertical', outline:'none' }
  const row:React.CSSProperties = { display:'flex', alignItems:'center', gap:11, padding:'10px 12px', borderRadius:10, background:'var(--bg-surface)', border:'1px solid var(--border-subtle)' }

  function Box({ checked, onClick }:{ checked:boolean; onClick:()=>void }){
    return <button type="button" role="checkbox" aria-checked={checked} onClick={onClick} style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:18, height:18, borderRadius:6, border:`1.5px solid ${checked?'var(--accent)':'var(--border-default)'}`, background:checked?'var(--accent)':'var(--bg-elevated)', cursor:'pointer', flexShrink:0, padding:0 }}>{checked&&<Check size={12} style={{ color:'var(--accent-text)' }}/>}</button>
  }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'6vh 16px', overflowY:'auto' }}>
      <div onClick={e=>e.stopPropagation()} style={{ width:'min(100%, 560px)', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:18, boxShadow:'0 30px 80px -30px rgba(0,0,0,0.7)', overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'16px 18px', borderBottom:'1px solid var(--border-subtle)' }}>
          <Landmark size={17} style={{ color:'var(--accent)' }}/>
          <div style={{ flex:1 }}>
            <p style={{ fontSize:15, fontWeight:700, color:'var(--text-primary)', margin:0, fontFamily:"'Inter',sans-serif" }}>Εισαγωγή τραπεζικής κίνησης</p>
            <p style={{ fontSize:12, color:'var(--text-tertiary)', margin:'2px 0 0', fontFamily:"'Inter',sans-serif" }}>Αντιστοίχιση σε ενοίκια και έξοδα, με έγκρισή σου.</p>
          </div>
          <button onClick={onClose} aria-label="Κλείσιμο" style={{ width:30, height:30, borderRadius:8, border:'none', background:'var(--bg-surface)', color:'var(--text-secondary)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><X size={16}/></button>
        </div>

        <div style={{ padding:18 }}>
          {step==='input'&&(<>
            <p style={{ fontSize:12.5, color:'var(--text-secondary)', margin:'0 0 10px', fontFamily:"'Inter',sans-serif", lineHeight:1.55 }}>Επικόλλησε την κίνηση από το e-banking (CSV) ή ανέβασε αρχείο. Αναγνωρίζονται στήλες ημερομηνία, περιγραφή και ποσό (ή χρέωση/πίστωση).</p>
            <textarea value={text} onChange={e=>setText(e.target.value)} placeholder={'Ημερομηνία;Περιγραφή;Ποσό\n05/03/2026;Κατάθεση ενοικίου;800,00'} style={field}
              onFocus={e=>e.currentTarget.style.borderColor='var(--accent)'} onBlur={e=>e.currentTarget.style.borderColor='var(--border-subtle)'}/>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:12, flexWrap:'wrap' }}>
              <label style={{ fontSize:12.5, color:'var(--accent)', cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
                Άνοιγμα αρχείου CSV
                <input type="file" accept=".csv,text/csv,text/plain" style={{ display:'none' }} onChange={e=>{ const f=e.target.files?.[0]; if(f){ const r=new FileReader(); r.onload=()=>{ const v=String(r.result||''); setText(v); analyze(v) }; r.readAsText(f) } }}/>
              </label>
              <div style={{ flex:1 }}/>
              <button disabled={!text.trim()} onClick={()=>analyze(text)} style={{ display:'inline-flex', alignItems:'center', gap:7, height:38, padding:'0 18px', borderRadius:19, border:'none', background:text.trim()?'var(--accent)':'var(--bg-surface)', color:text.trim()?'var(--accent-text)':'var(--text-tertiary)', fontSize:13.5, fontWeight:600, cursor:text.trim()?'pointer':'default', fontFamily:"'Inter',sans-serif" }}>Ανάλυση<ArrowRight size={15}/></button>
            </div>
            {error&&<p style={{ fontSize:12.5, color:'var(--negative)', margin:'12px 0 0', fontFamily:"'Inter',sans-serif" }}>{error}</p>}
          </>)}

          {step==='review'&&(<>
            {rentMatches.length===0&&expenses.length===0?(
              <p style={{ fontSize:13, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif", padding:'8px 0' }}>Δεν βρέθηκαν νέες αντιστοιχίσεις.{skipped>0?` (${skipped} κινήσεις είχαν ήδη εισαχθεί.)`:''}</p>
            ):(<>
              {rentMatches.length>0&&(<>
                <p style={{ fontSize:11, fontWeight:600, letterSpacing:'0.5px', textTransform:'uppercase', color:'var(--text-tertiary)', margin:'0 0 8px', fontFamily:"'Inter',sans-serif" }}>Ενοίκια που εισπράχθηκαν</p>
                <div style={{ display:'flex', flexDirection:'column', gap:7, marginBottom:16 }}>
                  {rentMatches.map((m,i)=>(
                    <div key={i} style={row}>
                      <Box checked={m.confirm} onClick={()=>setRentMatches(a=>a.map((x,j)=>j===i?{...x,confirm:!x.confirm}:x))}/>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontSize:13, color:'var(--text-primary)', margin:0, fontFamily:"'Inter',sans-serif" }}>{m.label}</p>
                        <p style={{ fontSize:11.5, color:'var(--text-tertiary)', margin:'1px 0 0', fontFamily:"'Inter',sans-serif", overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.txn.date} · {m.txn.description}</p>
                      </div>
                      <span style={{ fontSize:13, fontWeight:600, color:'var(--positive)', fontVariantNumeric:'tabular-nums', fontFamily:"'Inter',sans-serif" }}>{eur(m.txn.amount)}</span>
                    </div>
                  ))}
                </div>
              </>)}
              {expenses.length>0&&(<>
                <p style={{ fontSize:11, fontWeight:600, letterSpacing:'0.5px', textTransform:'uppercase', color:'var(--text-tertiary)', margin:'0 0 8px', fontFamily:"'Inter',sans-serif" }}>Πιθανά έξοδα</p>
                <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                  {expenses.map((e,i)=>(
                    <div key={i} style={row}>
                      <Box checked={e.confirm} onClick={()=>setExpenses(a=>a.map((x,j)=>j===i?{...x,confirm:!x.confirm}:x))}/>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontSize:13, color:'var(--text-primary)', margin:0, fontFamily:"'Inter',sans-serif", overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.description}</p>
                        <p style={{ fontSize:11.5, color:'var(--text-tertiary)', margin:'1px 0 0', fontFamily:"'Inter',sans-serif" }}>{e.txn.date}</p>
                      </div>
                      <span style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', fontVariantNumeric:'tabular-nums', fontFamily:"'Inter',sans-serif" }}>{eur(e.amount)}</span>
                    </div>
                  ))}
                </div>
              </>)}
              {skipped>0&&<p style={{ fontSize:11.5, color:'var(--text-tertiary)', margin:'12px 0 0', fontFamily:"'Inter',sans-serif" }}>{skipped} κινήσεις παραλείφθηκαν (είχαν ήδη εισαχθεί).</p>}
            </>)}
            <div style={{ display:'flex', gap:10, marginTop:18, justifyContent:'flex-end' }}>
              <button onClick={()=>setStep('input')} style={{ height:38, padding:'0 16px', borderRadius:19, border:'1px solid var(--border-default)', background:'var(--bg-surface)', color:'var(--text-secondary)', fontSize:13.5, cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>Πίσω</button>
              <button disabled={!rentMatches.some(m=>m.confirm)&&!expenses.some(e=>e.confirm)} onClick={save} style={{ display:'inline-flex', alignItems:'center', gap:7, height:38, padding:'0 18px', borderRadius:19, border:'none', background:(rentMatches.some(m=>m.confirm)||expenses.some(e=>e.confirm))?'var(--accent)':'var(--bg-surface)', color:(rentMatches.some(m=>m.confirm)||expenses.some(e=>e.confirm))?'var(--accent-text)':'var(--text-tertiary)', fontSize:13.5, fontWeight:600, cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>Καταχώριση</button>
            </div>
            {error&&<p style={{ fontSize:12.5, color:'var(--negative)', margin:'12px 0 0', fontFamily:"'Inter',sans-serif" }}>{error}</p>}
          </>)}

          {step==='saving'&&(
            <p style={{ fontSize:13.5, color:'var(--text-secondary)', textAlign:'center', padding:'24px 0', fontFamily:"'Inter',sans-serif" }}>{savedMsg||'Καταχώριση…'}</p>
          )}
        </div>
      </div>
    </div>
  )
}
