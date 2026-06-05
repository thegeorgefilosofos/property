'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Zap, Droplets, Wifi, Building2 } from 'lucide-react'

type Bill = { id:string; type:string; amount:number; due_date:string; paid:boolean; period:string }
const TYPES = [
  { key:'electricity', label:'Ρεύμα', Icon:Zap, color:'text-yellow-400' },
  { key:'water', label:'Νερό', Icon:Droplets, color:'text-blue-400' },
  { key:'internet', label:'Internet', Icon:Wifi, color:'text-purple-400' },
  { key:'common', label:'Κοινόχρηστα', Icon:Building2, color:'text-green-400' },
]

export default function TabBills({ propertyId, userId }: { propertyId:string; userId:string }) {
const supabase = createClient()
  const [bills, setBills] = useState<Bill[]>([])
  const [form, setForm] = useState({ type:'electricity', amount:'', due_date:'', period:'' })
  const [saving, setSaving] = useState(false)

  useEffect(()=>{ load() },[propertyId])

  async function load() {
    const { data } = await supabase.from('bills').select('*')
      .eq('property_id', propertyId).order('due_date',{ascending:false})
    setBills(data||[])
  }

  async function add() {
    if (!form.amount || !form.due_date) return
    setSaving(true)
    await supabase.from('bills').insert({ ...form, amount:parseFloat(form.amount), paid:false, property_id:propertyId, user_id:userId })
    setForm({ type:'electricity', amount:'', due_date:'', period:'' })
    await load(); setSaving(false)
  }

  async function toggle(b: Bill) {
    await supabase.from('bills').update({ paid:!b.paid }).eq('id',b.id)
    setBills(p=>p.map(x=>x.id===b.id?{...x,paid:!x.paid}:x))
  }

  const unpaid = bills.filter(b=>!b.paid).reduce((s,b)=>s+b.amount,0)

  return (
    <div className="space-y-5">
      {unpaid > 0 && (
        <div className="bg-red-950/30 border border-red-900/40 rounded-lg px-4 py-3 flex justify-between items-center">
          <p className="font-mono text-xs text-red-400 uppercase tracking-widest">Εκκρεμείς</p>
          <p className="font-serif text-lg text-red-400">€{unpaid.toFixed(2)}</p>
        </div>
      )}
      <div className="bg-[#12121f] border border-[#242438] rounded-lg p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[#b8953e] mb-4">Νέος Λογαριασμός</p>
        <div className="grid grid-cols-2 gap-3">
          <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}
            className="bg-[#08080d] border border-[#242438] rounded px-3 py-2 text-[#e2e2f0] text-sm focus:outline-none focus:border-[#b8953e]">
            {TYPES.map(t=><option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <input type="number" placeholder="Ποσό €" value={form.amount}
            onChange={e=>setForm(f=>({...f,amount:e.target.value}))}
            className="bg-[#08080d] border border-[#242438] rounded px-3 py-2 text-[#e2e2f0] text-sm focus:outline-none focus:border-[#b8953e]" />
          <input placeholder="Περίοδος π.χ. Ιούν 2025" value={form.period}
            onChange={e=>setForm(f=>({...f,period:e.target.value}))}
            className="bg-[#08080d] border border-[#242438] rounded px-3 py-2 text-[#e2e2f0] text-sm focus:outline-none focus:border-[#b8953e]" />
          <input type="date" value={form.due_date}
            onChange={e=>setForm(f=>({...f,due_date:e.target.value}))}
            className="bg-[#08080d] border border-[#242438] rounded px-3 py-2 text-[#e2e2f0] text-sm focus:outline-none focus:border-[#b8953e]" />
          <button onClick={add} disabled={saving}
            className="col-span-2 bg-[#b8953e] hover:bg-[#d4af6a] text-[#08080d] font-mono text-xs uppercase tracking-widest rounded py-2 transition-colors disabled:opacity-50">
            {saving?'...':'Προσθήκη'}
          </button>
        </div>
      </div>
      {TYPES.map(({ key, label, Icon, color }) => {
        const tb = bills.filter(b=>b.type===key)
        if (!tb.length) return null
        return (
          <div key={key} className="bg-[#12121f] border border-[#242438] rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#242438]">
              <Icon size={15} className={color}/>
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#9090a8]">{label}</span>
            </div>
            {tb.map(b=>(
              <div key={b.id} className="flex items-center justify-between px-4 py-3 border-b border-[#242438]/50 last:border-0">
                <div className="flex items-center gap-3">
                  <button onClick={()=>toggle(b)}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${b.paid?'bg-[#b8953e] border-[#b8953e]':'border-[#242438] hover:border-[#b8953e]'}`}>
                    {b.paid && <span className="text-[#08080d] text-[9px] font-bold">✓</span>}
                  </button>
                  <span className={`text-sm ${b.paid?'line-through text-[#5a5a70]':'text-[#e2e2f0]'}`}>{b.period||b.due_date}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-mono text-xs text-[#9090a8]">Λήξη: {b.due_date}</span>
                  <span className={`font-mono text-sm ${b.paid?'text-[#5a5a70]':'text-[#e2e2f0]'}`}>€{b.amount.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}