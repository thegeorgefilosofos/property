'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Trash2, Receipt } from 'lucide-react'

type Expense = {
  id: string; description: string; amount: number;
  category: string; date: string; property_id: string;
}
const CATS = ['Συντήρηση','Επισκευή','Φόρος','Ασφάλεια','Διαχείριση','Άλλο']

export default function TabExpenses({ propertyId, userId }: { propertyId: string; userId: string }) {
  const supabase = createClient()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ description:'', amount:'', category:'Συντήρηση', date:'' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [propertyId])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('expenses').select('*')
      .eq('property_id', propertyId).order('date', { ascending: false })
    setExpenses(data || [])
    setLoading(false)
  }

  async function add() {
    if (!form.description || !form.amount || !form.date) return
    setSaving(true)
    await supabase.from('expenses').insert({
      property_id: propertyId, user_id: userId,
      description: form.description, amount: parseFloat(form.amount),
      category: form.category, date: form.date,
    })
    setForm({ description:'', amount:'', category:'Συντήρηση', date:'' })
    await load()
    setSaving(false)
  }

  async function del(id: string) {
    await supabase.from('expenses').delete().eq('id', id)
    setExpenses(p => p.filter(e => e.id !== id))
  }

  const total = expenses.reduce((s, e) => s + e.amount, 0)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label:'Σύνολο', val:`€${total.toLocaleString('el-GR',{minimumFractionDigits:2})}` },
          { label:'Εγγραφές', val: expenses.length.toString() },
          { label:'Μ.Ο./μήνα', val:`€${(total/12).toFixed(0)}` },
        ].map(s => (
          <div key={s.label} className="bg-[#12121f] border border-[#242438] rounded-lg p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-[#9090a8]">{s.label}</p>
            <p className="font-serif text-xl text-[#b8953e] mt-1">{s.val}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#12121f] border border-[#242438] rounded-lg p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[#b8953e] mb-4">Νέα Δαπάνη</p>
        <div className="grid grid-cols-2 gap-3">
          <input placeholder="Περιγραφή" value={form.description}
            onChange={e=>setForm(f=>({...f,description:e.target.value}))}
            className="col-span-2 bg-[#08080d] border border-[#242438] rounded px-3 py-2 text-[#e2e2f0] text-sm focus:outline-none focus:border-[#b8953e]" />
          <input type="number" placeholder="Ποσό €" value={form.amount}
            onChange={e=>setForm(f=>({...f,amount:e.target.value}))}
            className="bg-[#08080d] border border-[#242438] rounded px-3 py-2 text-[#e2e2f0] text-sm focus:outline-none focus:border-[#b8953e]" />
          <input type="date" value={form.date}
            onChange={e=>setForm(f=>({...f,date:e.target.value}))}
            className="bg-[#08080d] border border-[#242438] rounded px-3 py-2 text-[#e2e2f0] text-sm focus:outline-none focus:border-[#b8953e]" />
          <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}
            className="bg-[#08080d] border border-[#242438] rounded px-3 py-2 text-[#e2e2f0] text-sm focus:outline-none focus:border-[#b8953e]">
            {CATS.map(c=><option key={c}>{c}</option>)}
          </select>
          <button onClick={add} disabled={saving}
            className="bg-[#b8953e] hover:bg-[#d4af6a] text-[#08080d] font-mono text-xs uppercase tracking-widest rounded py-2 transition-colors disabled:opacity-50">
            {saving ? '...' : 'Προσθήκη'}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {loading ? <p className="font-mono text-xs text-[#5a5a70]">Φόρτωση...</p>
          : expenses.length === 0 ? (
            <div className="text-center py-12">
              <Receipt className="mx-auto mb-2 text-[#5a5a70]" size={28}/>
              <p className="font-mono text-xs text-[#5a5a70] uppercase tracking-widest">Καμία δαπάνη ακόμα</p>
            </div>
          ) : expenses.map(e => (
            <div key={e.id} className="flex items-center justify-between bg-[#12121f] border border-[#242438] rounded-lg px-4 py-3 group">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[9px] uppercase tracking-widest text-[#b8953e] bg-[#b8953e]/10 px-2 py-0.5 rounded">{e.category}</span>
                <span className="text-sm text-[#e2e2f0]">{e.description}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-mono text-xs text-[#9090a8]">{e.date}</span>
                <span className="font-mono text-sm text-[#e2e2f0]">€{e.amount.toFixed(2)}</span>
                <button onClick={()=>del(e.id)} className="opacity-0 group-hover:opacity-100 text-[#5a5a70] hover:text-red-400 transition-all">
                  <Trash2 size={13}/>
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}