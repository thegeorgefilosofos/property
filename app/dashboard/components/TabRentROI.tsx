'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type Props = {
  propertyId: string
  userId: string
  propertyValue: number
  ownershipPct: number
}

function calcTax(grossRent: number, electronic: boolean) {
  const reduction = electronic ? grossRent * 0.05 : 0
  const taxable = grossRent - reduction
  let tax = 0
  if (taxable <= 12000)      tax = taxable * 0.15
  else if (taxable <= 14000) tax = 12000 * 0.15 + (taxable - 12000) * 0.25
  else if (taxable <= 35000) tax = 12000 * 0.15 + 2000 * 0.25 + (taxable - 14000) * 0.35
  else                        tax = 12000 * 0.15 + 2000 * 0.25 + 21000 * 0.35 + (taxable - 35000) * 0.45
  return { taxable, tax, reduction }
}

export default function TabRentROI({ propertyId, userId, propertyValue, ownershipPct }: Props) {
  const supabase = createClient()
  const [config, setConfig] = useState({ target_rent:'', actual_rent:'', tenant_name:'', lease_start:'', lease_end:'', deposit:'' })
  const [electronic, setElectronic] = useState(true)
  const [expenses, setExpenses] = useState(0)
  const [saved, setSaved] = useState(false)

  useEffect(()=>{ loadData() },[propertyId])

  async function loadData() {
    const { data: rc } = await supabase.from('rent_config').select('*').eq('property_id',propertyId).single()
    if (rc) setConfig(rc)
    const { data: exp } = await supabase.from('expenses').select('amount').eq('property_id',propertyId)
    setExpenses((exp||[]).reduce((s:number,e:any)=>s+e.amount,0))
  }

  async function save() {
    await supabase.from('rent_config').upsert({ ...config, property_id:propertyId, user_id:userId },{ onConflict:'property_id' })
    setSaved(true); setTimeout(()=>setSaved(false),2000)
  }

  const actualRent = parseFloat(config.actual_rent)||0
  const annualRent = actualRent * 12
  const { taxable, tax, reduction } = calcTax(annualRent, electronic)
  const netIncome = annualRent - expenses
  const afterTax = netIncome - tax
  const myValue = propertyValue * (ownershipPct/100)
  const grossYield = myValue > 0 ? (annualRent/myValue)*100 : 0
  const netYield = myValue > 0 ? (afterTax/myValue)*100 : 0

  const Row = ({ label, val, color='text-[#e2e2f0]' }: { label:string; val:string; color?:string }) => (
    <div className="flex justify-between items-center py-2.5 border-b border-[#242438]/50 last:border-0">
      <span className="font-mono text-[10px] uppercase tracking-widest text-[#9090a8]">{label}</span>
      <span className={`font-mono text-sm ${color}`}>{val}</span>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="bg-[#12121f] border border-[#242438] rounded-lg p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[#b8953e] mb-4">Στοιχεία Μίσθωσης</p>
        <div className="grid grid-cols-2 gap-3">
          {([
            ['target_rent','Στόχος €/μήνα','number'],
            ['actual_rent','Πραγματικό €/μήνα','number'],
            ['tenant_name','Ενοικιαστής','text'],
            ['deposit','Εγγύηση €','number'],
            ['lease_start','Έναρξη','date'],
            ['lease_end','Λήξη','date'],
          ] as [keyof typeof config, string, string][]).map(([k,lbl,type])=>(
            <div key={k} className="flex flex-col gap-1">
              <label className="font-mono text-[9px] uppercase tracking-widest text-[#5a5a70]">{lbl}</label>
              <input type={type} value={config[k]} onChange={e=>setConfig(f=>({...f,[k]:e.target.value}))}
                className="bg-[#08080d] border border-[#242438] rounded px-3 py-2 text-[#e2e2f0] text-sm focus:outline-none focus:border-[#b8953e]"/>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button onClick={()=>setElectronic(p=>!p)}
            className={`w-10 h-5 rounded-full transition-colors relative ${electronic?'bg-[#b8953e]':'bg-[#242438]'}`}>
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${electronic?'left-5':'left-0.5'}`}/>
          </button>
          <span className="font-mono text-xs text-[#9090a8]">Ηλεκτρονική πληρωμή <span className="text-[#b8953e]">(−5%)</span></span>
        </div>
        <button onClick={save}
          className="mt-4 w-full bg-[#b8953e] hover:bg-[#d4af6a] text-[#08080d] font-mono text-xs uppercase tracking-widest rounded py-2 transition-colors">
          {saved?'✓ Αποθηκεύτηκε':'Αποθήκευση'}
        </button>
      </div>

      <div className="bg-[#12121f] border border-[#242438] rounded-lg p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[#b8953e] mb-2">P&L — Ετήσιο</p>
        <Row label="Ακαθάριστο Ενοίκιο" val={`€${annualRent.toLocaleString('el-GR')}`}/>
        {reduction > 0 && <Row label="Έκπτωση 5% ηλ. πληρωμή" val={`-€${reduction.toFixed(0)}`} color="text-green-400"/>}
        <Row label="Φορολογητέο" val={`€${taxable.toFixed(0)}`}/>
        <Row label="Δαπάνες" val={`-€${expenses.toLocaleString('el-GR')}`} color="text-red-400"/>
        <Row label="Φόρος" val={`-€${tax.toFixed(0)}`} color="text-red-400"/>
        <Row label="Καθαρό μετά φόρου" val={`€${afterTax.toFixed(0)}`} color={afterTax>=0?'text-[#b8953e]':'text-red-400'}/>
        <Row label="Καθαρό/μήνα" val={`€${(afterTax/12).toFixed(0)}`} color={afterTax>=0?'text-green-400':'text-red-400'}/>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#12121f] border border-[#242438] rounded-lg p-4 text-center">
          <p className="font-mono text-[9px] uppercase tracking-widest text-[#9090a8] mb-1">Μεικτή Απόδοση</p>
          <p className="font-serif text-3xl text-[#b8953e]">{grossYield.toFixed(2)}%</p>
        </div>
        <div className="bg-[#12121f] border border-[#242438] rounded-lg p-4 text-center">
          <p className="font-mono text-[9px] uppercase tracking-widest text-[#9090a8] mb-1">Καθαρή Απόδοση</p>
          <p className="font-serif text-3xl text-[#b8953e]">{netYield.toFixed(2)}%</p>
        </div>
      </div>

      <div className="bg-[#0f0f1a] border border-[#242438] rounded-lg p-4">
        <p className="font-mono text-[9px] uppercase tracking-widest text-[#5a5a70] mb-2">Κλίμακα Ενοικίων 2026 — Ν.5246/2025</p>
        {[['€0–€12.000','15%'],['€12.001–€14.000','25% (νέο)'],['€14.001–€35.000','35%'],['Άνω €35.000','45%']].map(([r,p])=>(
          <div key={r} className="flex justify-between py-0.5">
            <span className="font-mono text-xs text-[#9090a8]">{r}</span>
            <span className="font-mono text-xs text-[#e2e2f0]">{p}</span>
          </div>
        ))}
        <p className="font-mono text-[9px] text-[#5a5a70] mt-2">Εκτίμηση — συμβουλευτείτε λογιστή.</p>
      </div>
    </div>
  )
}