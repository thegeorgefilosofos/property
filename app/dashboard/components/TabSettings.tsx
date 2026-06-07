'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import NotificationSettings from './NotificationSettings'

type S = {
  owner_name:string; owner_afm:string; owner_phone:string; owner_email:string;
  electricity_provider:string; water_provider:string; internet_provider:string; internet_plan:string;
  property_manager:string; property_manager_phone:string;
  insurance_company:string; insurance_policy:string; insurance_expiry:string; notes:string;
}
const INIT:S = {
  owner_name:'',owner_afm:'',owner_phone:'',owner_email:'',
  electricity_provider:'',water_provider:'',internet_provider:'',internet_plan:'',
  property_manager:'',property_manager_phone:'',
  insurance_company:'',insurance_policy:'',insurance_expiry:'',notes:''
}

export default function TabSettings({ propertyId, userId }: { propertyId:string; userId:string }) {
  const supabase = createClient()
  const [s, setS] = useState<S>(INIT)
  const [saved, setSaved] = useState(false)

  useEffect(()=>{ load() },[propertyId])

  async function load() {
    const { data } = await supabase.from('property_settings').select('*').eq('property_id',propertyId).maybeSingle()
    if (data) setS(data)
  }

  async function save() {
    await supabase.from('property_settings').upsert({ ...s, property_id:propertyId, user_id:userId },{ onConflict:'property_id' })
    setSaved(true); setTimeout(()=>setSaved(false),2000)
  }

  const Box = ({ title, children }: { title:string; children:React.ReactNode }) => (
    <div className="bg-[#12121f] border border-[#242438] rounded-lg p-5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-[#b8953e] mb-4">{title}</p>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  )

  const F = ({ k, lbl, type='text', full=false }: { k:keyof S; lbl:string; type?:string; full?:boolean }) => (
    <div className={`flex flex-col gap-1${full?' col-span-2':''}`}>
      <label className="font-mono text-[9px] uppercase tracking-widest text-[#5a5a70]">{lbl}</label>
      <input type={type} value={s[k]} onChange={e=>setS(p=>({...p,[k]:e.target.value}))}
        className="bg-[#08080d] border border-[#242438] rounded px-3 py-2 text-[#e2e2f0] text-sm focus:outline-none focus:border-[#b8953e]"/>
    </div>
  )

  return (
    <div className="space-y-5">
      <Box title="Ιδιοκτήτης">
        <F k="owner_name" lbl="Ονοματεπώνυμο" full/>
        <F k="owner_afm" lbl="ΑΦΜ"/>
        <F k="owner_phone" lbl="Τηλέφωνο"/>
        <F k="owner_email" lbl="Email" type="email" full/>
      </Box>

      <Box title="Πάροχοι">
        <F k="electricity_provider" lbl="Ρεύμα"/>
        <F k="water_provider" lbl="Νερό"/>
        <F k="internet_provider" lbl="Internet"/>
        <F k="internet_plan" lbl="Πρόγραμμα"/>
      </Box>

      <Box title="Διαχείριση & Ασφάλεια">
        <F k="property_manager" lbl="Διαχειριστής"/>
        <F k="property_manager_phone" lbl="Τηλ. Διαχειριστή"/>
        <F k="insurance_company" lbl="Ασφαλιστική"/>
        <F k="insurance_policy" lbl="Αρ. Πολίτικής"/>
        <F k="insurance_expiry" lbl="Λήξη Ασφάλισης" type="date" full/>
      </Box>

      <div className="bg-[#12121f] border border-[#242438] rounded-lg p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[#b8953e] mb-3">Σημειώσεις</p>
        <textarea value={s.notes} onChange={e=>setS(p=>({...p,notes:e.target.value}))} rows={4}
          className="w-full bg-[#08080d] border border-[#242438] rounded px-3 py-2 text-[#e2e2f0] text-sm focus:outline-none focus:border-[#b8953e] resize-none"/>
      </div>

      <button onClick={save}
        className="w-full bg-[#b8953e] hover:bg-[#d4af6a] text-[#08080d] font-mono text-xs uppercase tracking-widest rounded py-3 transition-colors">
        {saved ? '✓ Αποθηκεύτηκε' : 'Αποθήκευση Ρυθμίσεων'}
      </button>

      {/* Notifications */}
      <NotificationSettings userId={userId}/>
    </div>
  )
}