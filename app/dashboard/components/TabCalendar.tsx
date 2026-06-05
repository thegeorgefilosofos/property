'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle2, Clock, AlertTriangle } from 'lucide-react'

type Task = { id:string; title:string; description:string; due_date:string; priority:string; completed:boolean }
const PRI: Record<string, { label:string; cls:string }> = {
  low:    { label:'Χαμηλή',  cls:'text-green-400 bg-green-400/10'   },
  medium: { label:'Μέτρια',  cls:'text-yellow-400 bg-yellow-400/10' },
  high:   { label:'Υψηλή',   cls:'text-red-400 bg-red-400/10'       },
}

export default function TabCalendar({ propertyId, userId }: { propertyId:string; userId:string }) {
  const supabase = createClient()
  const [tasks, setTasks] = useState<Task[]>([])
  const [form, setForm] = useState({ title:'', description:'', due_date:'', priority:'medium' })
  const [saving, setSaving] = useState(false)

  useEffect(()=>{ load() },[propertyId])

  async function load() {
    const { data } = await supabase.from('maintenance_tasks').select('*')
      .eq('property_id',propertyId).order('due_date')
    setTasks(data||[])
  }

  async function add() {
    if (!form.title||!form.due_date) return
    setSaving(true)
    await supabase.from('maintenance_tasks').insert({ ...form, completed:false, property_id:propertyId, user_id:userId })
    setForm({ title:'', description:'', due_date:'', priority:'medium' })
    await load(); setSaving(false)
  }

  async function toggle(t: Task) {
    await supabase.from('maintenance_tasks').update({ completed:!t.completed }).eq('id',t.id)
    setTasks(p=>p.map(x=>x.id===t.id?{...x,completed:!x.completed}:x))
  }

  const today = new Date().toISOString().split('T')[0]
  const overdue  = tasks.filter(t=>!t.completed && t.due_date < today)
  const upcoming = tasks.filter(t=>!t.completed && t.due_date >= today)
  const done     = tasks.filter(t=>t.completed)

  const TaskCard = ({ t }: { t: Task }) => (
    <div className={`flex items-start gap-3 bg-[#12121f] border rounded-lg px-4 py-3 ${t.completed?'border-[#242438]/30 opacity-50':'border-[#242438]'}`}>
      <button onClick={()=>toggle(t)} className="mt-0.5 shrink-0">
        {t.completed ? <CheckCircle2 size={17} className="text-[#b8953e]"/> : <Clock size={17} className="text-[#5a5a70]"/>}
      </button>
      <div className="flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm ${t.completed?'line-through text-[#5a5a70]':'text-[#e2e2f0]'}`}>{t.title}</span>
          <span className={`font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 rounded ${PRI[t.priority]?.cls}`}>{PRI[t.priority]?.label}</span>
        </div>
        {t.description && <p className="text-xs text-[#9090a8] mt-0.5">{t.description}</p>}
      </div>
      <span className="font-mono text-xs text-[#5a5a70] shrink-0">{t.due_date}</span>
    </div>
  )

  return (
    <div className="space-y-5">
      {overdue.length > 0 && (
        <div className="flex items-center gap-2 bg-red-950/20 border border-red-900/40 rounded-lg px-4 py-3">
          <AlertTriangle size={15} className="text-red-400"/>
          <p className="font-mono text-xs text-red-400">{overdue.length} εκπρόθεσμ{overdue.length===1?'η':'ες'}</p>
        </div>
      )}
      <div className="bg-[#12121f] border border-[#242438] rounded-lg p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[#b8953e] mb-4">Νέα Εργασία</p>
        <div className="grid grid-cols-2 gap-3">
          <input placeholder="Τίτλος" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}
            className="col-span-2 bg-[#08080d] border border-[#242438] rounded px-3 py-2 text-[#e2e2f0] text-sm focus:outline-none focus:border-[#b8953e]"/>
          <input placeholder="Περιγραφή (προαιρετικό)" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}
            className="col-span-2 bg-[#08080d] border border-[#242438] rounded px-3 py-2 text-[#e2e2f0] text-sm focus:outline-none focus:border-[#b8953e]"/>
          <input type="date" value={form.due_date} onChange={e=>setForm(f=>({...f,due_date:e.target.value}))}
            className="bg-[#08080d] border border-[#242438] rounded px-3 py-2 text-[#e2e2f0] text-sm focus:outline-none focus:border-[#b8953e]"/>
          <select value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))}
            className="bg-[#08080d] border border-[#242438] rounded px-3 py-2 text-[#e2e2f0] text-sm focus:outline-none focus:border-[#b8953e]">
            <option value="low">Χαμηλή</option>
            <option value="medium">Μέτρια</option>
            <option value="high">Υψηλή</option>
          </select>
          <button onClick={add} disabled={saving}
            className="col-span-2 bg-[#b8953e] hover:bg-[#d4af6a] text-[#08080d] font-mono text-xs uppercase tracking-widest rounded py-2 transition-colors disabled:opacity-50">
            {saving?'...':'Προσθήκη'}
          </button>
        </div>
      </div>
      {overdue.length > 0 && <div className="space-y-2"><p className="font-mono text-[10px] text-red-400 uppercase tracking-widest mb-2">Εκπρόθεσμες</p>{overdue.map(t=><TaskCard key={t.id} t={t}/>)}</div>}
      {upcoming.length > 0 && <div className="space-y-2"><p className="font-mono text-[10px] text-[#b8953e] uppercase tracking-widest mb-2">Επερχόμενες</p>{upcoming.map(t=><TaskCard key={t.id} t={t}/>)}</div>}
      {done.length > 0 && <div className="space-y-2"><p className="font-mono text-[10px] text-[#5a5a70] uppercase tracking-widest mb-2">Ολοκληρωμένες</p>{done.map(t=><TaskCard key={t.id} t={t}/>)}</div>}
    </div>
  )
}
