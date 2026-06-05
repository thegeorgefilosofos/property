'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import TabExpenses from './components/TabExpenses'
import TabBills from './components/TabBills'
import TabCalendar from './components/TabCalendar'
import TabRentROI from './components/TabRentROI'
import TabSettings from './components/TabSettings'

const G={
  bg:'#060610',sidebar:'#09091a',card:'#0e0e20',card2:'#111124',
  border:'#1a1a2e',border2:'#242440',gold:'#c9a84c',goldDim:'#7a5e28',
  text:'#e8e8f4',muted:'#6868a0',dim:'#32324a',
  green:'#3db87a',red:'#e05252',amber:'#d4842a',blue:'#4a7fd4',purple:'#8a60d0'
}
const M={fontFamily:"'IBM Plex Mono',monospace"}
const S={fontFamily:"'Playfair Display',Georgia,serif"}

const PROP_TYPES=[
  {v:'Κατοικία',i:'🏠'},{v:'Διαμέρισμα',i:'🏢'},{v:'Μαγαζί',i:'🏪'},
  {v:'Γραφείο',i:'💼'},{v:'Αποθήκη',i:'📦'},{v:'Χωράφι',i:'🌾'},
  {v:'Οικόπεδο',i:'📐'},{v:'Βιομηχανικό',i:'🏭'},{v:'Ξενοδοχείο',i:'🏨'},
  {v:'Γκαράζ',i:'🅿️'},{v:'Άλλο',i:'📋'},
]

const STATUSES=[
  {v:'vacant',l:'Κενό / Προς Ενοικίαση',c:G.amber,dot:'◉'},
  {v:'rented',l:'Ενοικιασμένο',c:G.green,dot:'◉'},
  {v:'own_use',l:'Ιδιοκατοίκηση',c:G.blue,dot:'◉'},
  {v:'renovation',l:'Ανακαίνιση',c:G.purple,dot:'◉'},
  {v:'for_sale',l:'Προς Πώληση',c:G.red,dot:'◉'},
  {v:'seasonal',l:'Εποχιακό',c:'#3ab8b8',dot:'◉'},
  {v:'disputed',l:'Νομικό Ζήτημα',c:G.red,dot:'⚠'},
]

const PEA=['A+++','A++','A+','A','Β+','Β','Γ','Δ','Ε','Ζ','Η']
const PEA_EFF:Record<string,number>={'A+++':100,'A++':90,'A+':80,'A':70,'Β+':60,'Β':50,'Γ':38,'Δ':26,'Ε':18,'Ζ':10,'Η':4}
const PEA_C=(c:string)=>['A+++','A++','A+','A'].includes(c)?G.green:['Β+','Β'].includes(c)?G.amber:G.red

const NAV_ITEMS=[
  {i:'overview',l:'Overview',icon:'⊞'},
  {i:'expenses',l:'Δαπάνες',icon:'↓'},
  {i:'bills',l:'Λογαριασμοί',icon:'⚡'},
  {i:'calendar',l:'Ημερολόγιο',icon:'◷'},
  {i:'roi',l:'Ενοίκιο & ROI',icon:'%'},
  {i:'settings',l:'Ρυθμίσεις',icon:'⚙'},
]

const MONTHS=['Ιαν','Φεβ','Μαρ','Απρ','Μαϊ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ']

type P={
  id:string;name:string;prop_type:string;address:string
  sqm:number;ownership:number;value:number;obj_value:number
  purchase_price:number;purchase_date:string;target_rent:number
  enfia:number;insurance_amount:number;pea_class:string
  year_built:number;atak:string;floor:string;notes:string
  status_detail:string;heating:string
}

const EF={
  name:'',prop_type:'Κατοικία',address:'',sqm:'',ownership:'100',
  value:'',obj_value:'',purchase_price:'',purchase_date:'',
  target_rent:'',enfia:'',year_built:'',floor:'',pea_class:'',
  atak:'',notes:'',heating:'',insurance_amount:''
}

function calcTax(g:number){
  if(g<=0)return 0
  const t=g*0.95
  if(t<=12000)return t*0.15
  if(t<=14000)return 1800+(t-12000)*0.25
  if(t<=35000)return 2300+(t-14000)*0.35
  return 9650+(t-35000)*0.45
}

function BarChart({data,h=70}:{data:{l:string,v:number}[],h?:number}){
  const max=Math.max(...data.map(d=>d.v),1)
  return(
    <div style={{display:'flex',alignItems:'flex-end',gap:4,height:h}}>
      {data.map((d,i)=>(
        <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
          <div style={{width:'100%',height:h-14,display:'flex',alignItems:'flex-end'}}>
            <div style={{width:'100%',background:d.v>0?G.gold:G.border,borderRadius:'2px 2px 0 0',height:`${(d.v/max)*100}%`,minHeight:d.v>0?2:0,transition:'height .3s ease'}}/>
          </div>
          <span style={{...M,fontSize:8,color:G.dim}}>{d.l}</span>
        </div>
      ))}
    </div>
  )
}

function StatusBadge({v}:{v:string}){
  const s=STATUSES.find(x=>x.v===v)||STATUSES[0]
  return(
    <span style={{...M,fontSize:9,padding:'3px 8px',borderRadius:3,border:`1px solid ${s.c}40`,color:s.c,background:`${s.c}12`,letterSpacing:'0.06em',display:'inline-flex',alignItems:'center',gap:4}}>
      <span style={{fontSize:7}}>{s.dot}</span>{s.l}
    </span>
  )
}

export default function Dashboard(){
  const supabase=createClient()
  const router=useRouter()
  const [user,setUser]=useState<any>(null)
  const [props,setProps]=useState<P[]>([])
  const [sel,setSel]=useState<P|null>(null)
  const [nav,setNav]=useState('overview')
  const [loading,setLoading]=useState(true)
  const [modal,setModal]=useState(false)
  const [editMode,setEditMode]=useState(false)
  const [form,setForm]=useState(EF)
  const [ef,setEf]=useState<any>({})
  const [saving,setSaving]=useState(false)
  const [expenses,setExpenses]=useState<any[]>([])
  const [bills,setBills]=useState<any[]>([])
  const [tasks,setTasks]=useState<any[]>([])
  const [rentCfg,setRentCfg]=useState<any>(null)
  const [statusDrop,setStatusDrop]=useState(false)

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{
      if(!session){router.push('/login');return}
      setUser(session.user)
      loadAll(session.user.id)
    })
  },[])

  async function loadAll(uid:string){
    const {data}=await supabase.from('user_properties').select('*').eq('user_id',uid).order('created_at')
    const list=data||[]
    setProps(list)
    if(list.length>0)await pick(list[0])
    setLoading(false)
  }

  async function pick(p:P){
    setSel(p);setNav('overview');setEditMode(false);setStatusDrop(false)
    const [e,b,t,r]=await Promise.all([
      supabase.from('expenses').select('*').eq('property_id',p.id),
      supabase.from('bills').select('*').eq('property_id',p.id),
      supabase.from('maintenance_tasks').select('*').eq('property_id',p.id).eq('completed',false),
      supabase.from('rent_config').select('*').eq('property_id',p.id).single()
    ])
    setExpenses(e.data||[]);setBills(b.data||[]);setTasks(t.data||[]);setRentCfg(r.data)
  }

  async function addProp(){
    if(!form.name||!form.address)return
    if(props.length>=15){alert('Μέγιστο 15');return}
    setSaving(true)
    const {data}=await supabase.from('user_properties').insert({
      user_id:user.id,name:form.name,prop_type:form.prop_type,address:form.address,
      sqm:+form.sqm||0,ownership:+form.ownership||100,value:+form.value||0,
      obj_value:+form.obj_value||0,purchase_price:+form.purchase_price||0,
      purchase_date:form.purchase_date||null,target_rent:+form.target_rent||0,
      enfia:+form.enfia||0,insurance_amount:+form.insurance_amount||0,
      year_built:+form.year_built||null,floor:form.floor,pea_class:form.pea_class,
      atak:form.atak,notes:form.notes,heating:form.heating,status_detail:'vacant',
    }).select().single()
    if(data){const np=[...props,data];setProps(np);pick(data)}
    setForm(EF);setModal(false);setSaving(false)
  }

  async function updateStatus(v:string){
    if(!sel)return
    await supabase.from('user_properties').update({status_detail:v}).eq('id',sel.id)
    const u={...sel,status_detail:v};setSel(u);setProps(ps=>ps.map(p=>p.id===sel.id?u:p))
    setStatusDrop(false)
  }

  async function saveEdit(){
    if(!sel)return
    setSaving(true)
    await supabase.from('user_properties').update(ef).eq('id',sel.id)
    const u={...sel,...ef};setSel(u);setProps(ps=>ps.map(p=>p.id===sel.id?u:p))
    setEditMode(false);setSaving(false);pick(u)
  }

  const icon=(t:string)=>PROP_TYPES.find(x=>x.v===t)?.i||'🏠'
  const totalExp=expenses.reduce((s,e)=>s+e.amount,0)
  const expByCat:Record<string,number>={}
  expenses.forEach(e=>{expByCat[e.category]=(expByCat[e.category]||0)+e.amount})

  const now=new Date()
  const thisMonth=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const monthlyExp:Record<string,number>={}
  expenses.forEach(e=>{const m=e.date?.slice(0,7)||'';if(m)monthlyExp[m]=(monthlyExp[m]||0)+e.amount})
  const last6=Array.from({length:6},(_,i)=>{
    const d=new Date(now.getFullYear(),now.getMonth()-5+i,1)
    const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    return{l:MONTHS[d.getMonth()],v:monthlyExp[k]||0}
  })

  const billAvgs:Record<string,number[]>={}
  bills.forEach(b=>{if(!billAvgs[b.type])billAvgs[b.type]=[];billAvgs[b.type].push(b.amount)})
  const billMeans=Object.entries(billAvgs).map(([k,v])=>({
    type:k,avg:v.reduce((a,b)=>a+b,0)/v.length,
    label:k==='electricity'?'Ρεύμα':k==='water'?'Νερό':k==='internet'?'Internet':'Κοιν.'
  }))

  const today=new Date().toISOString().split('T')[0]
  const upcoming=tasks.filter(t=>t.due_date>=today)
  const overdue=tasks.filter(t=>t.due_date<today)
  const myVal=sel?(sel.value||0)*((sel.ownership||100)/100):0
  const targetRent=sel?.target_rent||0
  const actualRent=rentCfg?.actual_rent||0
  const useRent=actualRent||targetRent
  const annualRent=useRent*12
  const tax=calcTax(annualRent)
  const netIncome=annualRent-totalExp-tax
  const grossYield=myVal>0?(annualRent/myVal*100).toFixed(1):'—'
  const netYield=myVal>0?(netIncome/myVal*100).toFixed(1):'—'
  const curMonthExp=monthlyExp[thisMonth]||0

  // UI helpers
  const inp=(val:string,key:string,type='text',ph='')=>(
    <input type={type} value={val} placeholder={ph}
      onChange={e=>setEf((f:any)=>({...f,[key]:e.target.value}))}
      style={{...M,background:G.bg,border:`1px solid ${G.border2}`,borderRadius:4,padding:'6px 10px',color:G.text,fontSize:11,outline:'none',width:'100%'}}/>
  )

  const sel2=(val:string,key:string,options:{v:string,l:string}[])=>(
    <select value={val} onChange={e=>setEf((f:any)=>({...f,[key]:e.target.value}))}
      style={{...M,background:G.card,border:`1px solid ${G.border2}`,borderRadius:4,padding:'6px 10px',color:G.text,fontSize:11,outline:'none',width:'100%',cursor:'pointer'}}>
      {options.map(o=><option key={o.v} value={o.v} style={{background:G.card}}>{o.l}</option>)}
    </select>
  )

  const field=(label:string,view:string,editKey?:string,type='text',options?:{v:string,l:string}[])=>(
    <div style={{marginBottom:10}}>
      <label style={{...M,fontSize:9,color:G.muted,letterSpacing:'0.1em',textTransform:'uppercase' as const,display:'block',marginBottom:4}}>{label}</label>
      {editMode&&editKey?(
        options?sel2(ef[editKey]??view,editKey,options):inp(ef[editKey]??'',editKey,type,view)
      ):(
        <span style={{...M,fontSize:12,color:G.text}}>{view||'—'}</span>
      )}
    </div>
  )

  const kpi=(label:string,value:string,sub?:string,color=G.gold,onClick?:()=>void)=>(
    <div onClick={onClick} style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:8,padding:'14px 16px',cursor:onClick?'pointer':'default',transition:'border-color .15s'}}>
      <p style={{...M,fontSize:9,color:G.muted,letterSpacing:'0.1em',textTransform:'uppercase' as const,margin:'0 0 6px'}}>{label}</p>
      <p style={{...S,fontSize:22,color,margin:0,lineHeight:1}}>{value}</p>
      {sub&&<p style={{...M,fontSize:9,color:G.dim,margin:'4px 0 0'}}>{sub}</p>}
    </div>
  )

  const panel=(title:string,children:React.ReactNode,action?:{l:string,fn:()=>void})=>(
    <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:8,overflow:'hidden'}}>
      <div style={{padding:'10px 16px',borderBottom:`1px solid ${G.border}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <span style={{...M,fontSize:9,color:G.gold,letterSpacing:'0.12em',textTransform:'uppercase' as const}}>{title}</span>
        {action&&<button onClick={action.fn} style={{...M,fontSize:9,color:G.muted,background:'transparent',border:'none',cursor:'pointer',letterSpacing:'0.08em',textTransform:'uppercase' as const}}>→ {action.l}</button>}
      </div>
      <div style={{padding:16}}>{children}</div>
    </div>
  )

  if(loading)return(
    <div style={{minHeight:'100vh',background:G.bg,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <p style={{...M,fontSize:10,color:G.dim,letterSpacing:'0.2em'}}>ΦΟΡΤΩΣΗ...</p>
    </div>
  )

  return(
    <div style={{minHeight:'100vh',background:G.bg,color:G.text,display:'flex',flexDirection:'column'}}>

      {/* TOP NAV */}
      <div style={{height:48,background:G.sidebar,borderBottom:`1px solid ${G.border}`,display:'flex',alignItems:'center',padding:'0 20px',gap:16,flexShrink:0}}>
        <span style={{...S,fontSize:16,color:G.gold,fontStyle:'italic',letterSpacing:'0.02em'}}>Property OS</span>
        <div style={{width:1,height:18,background:G.border}}/>
        <span style={{...M,fontSize:9,color:G.muted,letterSpacing:'0.1em',textTransform:'uppercase' as const}}>Beta</span>
        <div style={{flex:1}}/>
        {user&&<span style={{...M,fontSize:10,color:G.muted}}>{user.email}</span>}
        <button onClick={()=>supabase.auth.signOut().then(()=>router.push('/login'))}
          style={{...M,background:'transparent',border:`1px solid ${G.border}`,color:G.muted,borderRadius:4,padding:'5px 12px',fontSize:9,cursor:'pointer',letterSpacing:'0.08em',textTransform:'uppercase' as const}}>
          Έξοδος
        </button>
      </div>

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>

        {/* SIDEBAR */}
        <div style={{width:240,background:G.sidebar,borderRight:`1px solid ${G.border}`,display:'flex',flexDirection:'column',flexShrink:0,overflowY:'auto'}}>

          {/* Property list header */}
          <div style={{padding:'14px 16px',borderBottom:`1px solid ${G.border}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span style={{...M,fontSize:9,color:G.muted,letterSpacing:'0.1em',textTransform:'uppercase' as const}}>Ακίνητα {props.length}/15</span>
            <button onClick={()=>setModal(true)} disabled={props.length>=15}
              style={{...M,background:G.gold,color:G.bg,border:'none',borderRadius:4,padding:'4px 10px',fontSize:9,fontWeight:700,cursor:'pointer',letterSpacing:'0.08em',textTransform:'uppercase' as const,opacity:props.length>=15?0.5:1}}>
              + Νέο
            </button>
          </div>

          {/* Property items */}
          <div style={{flex:1}}>
            {props.length===0?(
              <div style={{padding:16,textAlign:'center' as const}}>
                <p style={{...M,fontSize:10,color:G.dim}}>Δεν υπάρχουν ακίνητα</p>
              </div>
            ):props.map(p=>{
              const st=STATUSES.find(s=>s.v===p.status_detail)||STATUSES[0]
              const isSelected=sel?.id===p.id
              return(
                <div key={p.id} onClick={()=>pick(p)}
                  style={{padding:'10px 16px',cursor:'pointer',borderBottom:`1px solid ${G.border}`,background:isSelected?G.card2:'transparent',borderLeft:isSelected?`2px solid ${G.gold}`:'2px solid transparent',transition:'all .15s'}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                    <span style={{fontSize:16}}>{icon(p.prop_type)}</span>
                    <span style={{...M,fontSize:11,color:isSelected?G.text:G.muted,fontWeight:isSelected?600:400,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{p.name}</span>
                  </div>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',paddingLeft:24}}>
                    <span style={{...M,fontSize:9,color:G.dim,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{p.address?.split(',')[0]}</span>
                    <span style={{...M,fontSize:8,color:st.c}}>● {st.l.split('/')[0].trim()}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Navigation */}
          {sel&&(
            <div style={{borderTop:`1px solid ${G.border}`,paddingTop:8,paddingBottom:8}}>
              {NAV_ITEMS.map(n=>(
                <button key={n.i} onClick={()=>setNav(n.i)}
                  style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'8px 16px',background:nav===n.i?G.card2:'transparent',border:'none',borderLeft:nav===n.i?`2px solid ${G.gold}`:'2px solid transparent',color:nav===n.i?G.text:G.muted,cursor:'pointer',textAlign:'left' as const,transition:'all .15s'}}>
                  <span style={{fontSize:14,minWidth:16,textAlign:'center' as const,color:nav===n.i?G.gold:G.dim}}>{n.icon}</span>
                  <span style={{...M,fontSize:10,letterSpacing:'0.06em'}}>{n.l}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* MAIN CONTENT */}
        <div style={{flex:1,overflowY:'auto',padding:24}}>

          {/* Empty state */}
          {props.length===0&&(
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:20}}>
              <span style={{fontSize:64}}>🏠</span>
              <p style={{...S,fontSize:28,color:G.text,margin:0}}>Καλωσήρθες στο <em style={{color:G.gold}}>Property OS</em></p>
              <p style={{...M,fontSize:11,color:G.muted}}>Πρόσθεσε το πρώτο σου ακίνητο από το sidebar</p>
            </div>
          )}

          {sel&&(
            <>
              {/* PROPERTY HEADER */}
              <div style={{marginBottom:20}}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:16,marginBottom:12}}>
                  <div style={{display:'flex',alignItems:'flex-start',gap:14}}>
                    <span style={{fontSize:40,lineHeight:1}}>{icon(sel.prop_type)}</span>
                    <div>
                      {editMode?(
                        <input value={ef.name??sel.name} onChange={e=>setEf((f:any)=>({...f,name:e.target.value}))}
                          style={{...S,fontSize:24,background:'transparent',border:`1px solid ${G.border2}`,borderRadius:4,color:G.text,padding:'2px 8px',outline:'none',marginBottom:4,width:320}}/>
                      ):(
                        <h1 style={{...S,fontSize:24,margin:'0 0 4px',color:G.text,fontWeight:700}}>{sel.name}</h1>
                      )}
                      <p style={{...M,fontSize:10,color:G.muted,margin:0}}>
                        {sel.address}{sel.floor?` · Όρ.${sel.floor}`:''}{sel.sqm?` · ${sel.sqm}τ.μ.`:''}{sel.year_built?` · ${sel.year_built}`:''}
                      </p>
                    </div>
                  </div>

                  {/* ACTION BUTTONS */}
                  <div style={{display:'flex',gap:8,alignItems:'center',flexShrink:0}}>

                    {/* STATUS DROPDOWN */}
                    <div style={{position:'relative'}}>
                      <button onClick={()=>setStatusDrop(d=>!d)}
                        style={{...M,display:'flex',alignItems:'center',gap:8,background:G.card,border:`1px solid ${G.border2}`,borderRadius:6,padding:'7px 12px',fontSize:9,cursor:'pointer',color:G.text,letterSpacing:'0.06em'}}>
                        <StatusBadge v={sel.status_detail}/>
                        <span style={{color:G.muted,fontSize:10}}>▾</span>
                      </button>
                      {statusDrop&&(
                        <div style={{position:'absolute',top:'calc(100% + 6px)',right:0,background:G.card,border:`1px solid ${G.border2}`,borderRadius:8,zIndex:50,minWidth:200,overflow:'hidden',boxShadow:'0 8px 24px rgba(0,0,0,0.5)'}}>
                          {STATUSES.map(s=>(
                            <button key={s.v} onClick={()=>updateStatus(s.v)}
                              style={{...M,width:'100%',display:'flex',alignItems:'center',gap:10,padding:'9px 14px',background:sel.status_detail===s.v?G.card2:'transparent',border:'none',cursor:'pointer',textAlign:'left' as const,fontSize:10,color:sel.status_detail===s.v?s.c:G.muted,letterSpacing:'0.06em',transition:'background .1s'}}>
                              <span style={{color:s.c,fontSize:8}}>{s.dot}</span>{s.l}
                              {sel.status_detail===s.v&&<span style={{marginLeft:'auto',color:s.c}}>✓</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {!editMode?(
                      <button onClick={()=>{setEf({...sel});setEditMode(true)}}
                        style={{...M,background:G.card,border:`1px solid ${G.border2}`,color:G.muted,borderRadius:6,padding:'7px 14px',fontSize:9,cursor:'pointer',letterSpacing:'0.08em',textTransform:'uppercase' as const,display:'flex',alignItems:'center',gap:6}}>
                        ✎ Επεξεργασία
                      </button>
                    ):(
                      <>
                        <button onClick={()=>setEditMode(false)}
                          style={{...M,background:'transparent',border:`1px solid ${G.border}`,color:G.muted,borderRadius:6,padding:'7px 12px',fontSize:9,cursor:'pointer',textTransform:'uppercase' as const}}>
                          Ακύρωση
                        </button>
                        <button onClick={saveEdit} disabled={saving}
                          style={{...M,background:G.gold,border:'none',color:G.bg,borderRadius:6,padding:'7px 16px',fontSize:9,fontWeight:700,cursor:'pointer',textTransform:'uppercase' as const,letterSpacing:'0.08em',opacity:saving?0.7:1}}>
                          {saving?'..':'✓ Αποθήκευση'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* OVERVIEW */}
              {nav==='overview'&&(
                <div style={{display:'flex',flexDirection:'column',gap:16}}>

                  {/* KPI ROW */}
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
                    {kpi('Αγοραία Αξία',`€${(sel.value||0).toLocaleString('el-GR')}`,`Δικό σου €${Math.round(myVal).toLocaleString('el-GR')}`)}
                    {kpi('Στόχος Ενοικίου',targetRent?`€${targetRent}/μήνα`:'—','',G.gold,()=>setNav('roi'))}
                    {kpi('Gross Yield',grossYield!=='—'?`${grossYield}%`:'—',annualRent?`€${annualRent.toLocaleString('el-GR')}/χρ.`:'',parseFloat(grossYield)>8?G.green:G.amber,()=>setNav('roi'))}
                    {kpi('Net Yield',netYield!=='—'?`${netYield}%`:'—','μετά φόρων 2026',parseFloat(netYield)>5?G.green:G.amber,()=>setNav('roi'))}
                  </div>

                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
                    {kpi('Δαπάνες YTD',`€${totalExp.toLocaleString('el-GR')}`,`${Object.keys(expByCat).length} κατηγορίες`,G.text,()=>setNav('expenses'))}
                    {kpi('Τρέχων Μήνας',`€${curMonthExp.toLocaleString('el-GR')}`,MONTHS[now.getMonth()],G.text,()=>setNav('expenses'))}
                    {kpi('Εκκρεμείς Εργασίες',String(upcoming.length+overdue.length),overdue.length>0?`⚠ ${overdue.length} εκπρόθεσμες`:'',overdue.length>0?G.red:G.text,()=>setNav('calendar'))}
                    {kpi('P&L Ετήσιο',`€${Math.round(netIncome).toLocaleString('el-GR')}`,netIncome>=0?'Θετικό':'Αρνητικό',netIncome>=0?G.green:G.red,()=>setNav('roi'))}
                  </div>

                  {/* CHARTS ROW */}
                  <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:16}}>
                    {panel('Δαπάνες ανά Μήνα',
                      <div>
                        <BarChart data={last6} h={80}/>
                        <div style={{display:'flex',justifyContent:'space-between',marginTop:8}}>
                          <span style={{...M,fontSize:9,color:G.dim}}>
                            Μ.Ο.: €{Math.round(last6.filter(d=>d.v>0).reduce((s,d)=>s+d.v,0)/Math.max(last6.filter(d=>d.v>0).length,1)).toLocaleString('el-GR')}/μήνα
                          </span>
                          <span style={{...M,fontSize:9,color:G.gold}}>Σύνολο: €{totalExp.toLocaleString('el-GR')}</span>
                        </div>
                      </div>,
                      {l:'Δαπάνες',fn:()=>setNav('expenses')}
                    )}

                    {panel('Κατανομή Κατηγοριών',
                      Object.keys(expByCat).length>0?(
                        <div>
                          {Object.entries(expByCat).sort(([,a],[,b])=>b-a).slice(0,5).map(([cat,amt],i)=>{
                            const colors=[G.gold,'#4a7fd4','#3db87a','#a070d0','#e09a2a']
                            const pct=totalExp>0?amt/totalExp*100:0
                            return(
                              <div key={cat} style={{marginBottom:8}}>
                                <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                                    <div style={{width:6,height:6,borderRadius:1,background:colors[i%colors.length],flexShrink:0}}/>
                                    <span style={{...M,fontSize:9,color:G.muted,textTransform:'uppercase' as const,letterSpacing:'0.06em'}}>{cat}</span>
                                  </div>
                                  <span style={{...M,fontSize:9,color:G.text}}>€{amt.toFixed(0)} <span style={{color:G.dim}}>({pct.toFixed(0)}%)</span></span>
                                </div>
                                <div style={{height:2,background:G.border,borderRadius:1}}>
                                  <div style={{height:'100%',background:colors[i%colors.length],borderRadius:1,width:`${pct}%`}}/>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ):(
                        <p style={{...M,fontSize:9,color:G.dim,textAlign:'center' as const,padding:'20px 0'}}>Δεν υπάρχουν δαπάνες</p>
                      ),
                      {l:'Δαπάνες',fn:()=>setNav('expenses')}
                    )}

                    {panel('Μ.Ο. Πάγιων',
                      billMeans.length>0?(
                        <div>
                          {billMeans.map(b=>(
                            <div key={b.type} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:`1px solid ${G.border}`}}>
                              <span style={{...M,fontSize:9,color:G.muted,textTransform:'uppercase' as const,letterSpacing:'0.06em'}}>{b.label}</span>
                              <span style={{...M,fontSize:10,color:G.text}}>€{b.avg.toFixed(0)}/μήνα</span>
                            </div>
                          ))}
                          <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${G.border}`,display:'flex',justifyContent:'space-between'}}>
                            <span style={{...M,fontSize:9,color:G.muted,textTransform:'uppercase' as const}}>Σύνολο</span>
                            <span style={{...M,fontSize:10,color:G.gold}}>€{billMeans.reduce((s,b)=>s+b.avg,0).toFixed(0)}/μήνα</span>
                          </div>
                        </div>
                      ):(
                        <p style={{...M,fontSize:9,color:G.dim,textAlign:'center' as const,padding:'20px 0'}}>Δεν υπάρχουν λογαριασμοί</p>
                      ),
                      {l:'Λογαριασμοί',fn:()=>setNav('bills')}
                    )}
                  </div>

                  {/* DETAILS + TASKS + ENERGY */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 280px',gap:16}}>

                    {panel('Στοιχεία Ακινήτου',
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 20px'}}>
                        <div>
                          {field('Τύπος',sel.prop_type,'prop_type','text',PROP_TYPES.map(p=>({v:p.v,l:`${p.i} ${p.v}`})))}
                          {field('Εμβαδόν τ.μ.',`${sel.sqm||'—'}`,'sqm','number')}
                          {field('Ιδιοκτησία %',`${sel.ownership||100}`,'ownership','number')}
                          {field('Αγοραία Αξία €',`${(sel.value||0).toLocaleString('el-GR')}`,'value','number')}
                          {field('Αντικειμενική €',sel.obj_value?`${sel.obj_value.toLocaleString('el-GR')}`:'—','obj_value','number')}
                        </div>
                        <div>
                          {field('Τιμή Αγοράς €',sel.purchase_price?`${sel.purchase_price.toLocaleString('el-GR')}`:'—','purchase_price','number')}
                          {field('Ημ. Αγοράς',sel.purchase_date||'—','purchase_date','date')}
                          {field('ΑΤΑΚ',sel.atak||'—','atak')}
                          {field('Έτος Κατ.',sel.year_built?String(sel.year_built):'—','year_built','number')}
                          {field('Θέρμανση',sel.heating||'—','heating','text',[
                            {v:'Αυτόνομο',l:'Αυτόνομο'},{v:'Κεντρικό',l:'Κεντρικό'},
                            {v:'Ηλεκτρικό',l:'Ηλεκτρικό'},{v:'Φυσικό αέριο',l:'Φυσικό αέριο'},
                            {v:'Αντλία θερμ.',l:'Αντλία θερμότητας'},{v:'Ηλιακό',l:'Ηλιακό'},
                          ])}
                        </div>
                      </div>
                    )}

                    {panel('Επόμενες Εργασίες',
                      <div>
                        {overdue.length>0&&(
                          <div style={{marginBottom:10,padding:'6px 10px',border:`1px solid ${G.red}30`,borderRadius:6,background:`${G.red}0a`}}>
                            <span style={{...M,fontSize:9,color:G.red,letterSpacing:'0.08em'}}>⚠ {overdue.length} ΕΚΠΡΟΘΕΣΜΕΣ ΕΡΓΑΣΙΕΣ</span>
                          </div>
                        )}
                        {upcoming.length===0&&overdue.length===0?(
                          <p style={{...M,fontSize:10,color:G.dim,textAlign:'center' as const,padding:'20px 0'}}>Δεν υπάρχουν εκκρεμείς εργασίες</p>
                        ):upcoming.slice(0,6).map(t=>(
                          <div key={t.id} style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'7px 0',borderBottom:`1px solid ${G.border}`}}>
                            <div>
                              <p style={{...M,fontSize:10,color:G.text,margin:'0 0 2px'}}>{t.title}</p>
                              <span style={{...M,fontSize:8,padding:'1px 6px',borderRadius:2,border:`1px solid ${t.priority==='high'?G.red:t.priority==='medium'?G.amber:G.border}40`,color:t.priority==='high'?G.red:t.priority==='medium'?G.amber:G.muted,letterSpacing:'0.06em',textTransform:'uppercase' as const}}>
                                {t.priority==='high'?'Υψηλή':t.priority==='medium'?'Μέτρια':'Χαμηλή'}
                              </span>
                            </div>
                            <span style={{...M,fontSize:9,color:G.dim,flexShrink:0}}>{t.due_date}</span>
                          </div>
                        ))}
                      </div>,
                      {l:'Ημερολόγιο',fn:()=>setNav('calendar')}
                    )}

                    {panel('Ενεργειακή Κλάση',
                      <div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:4,marginBottom:14}}>
                          {PEA.map(p=>{
                            const isSel=editMode?(ef.pea_class||sel.pea_class)===p:sel.pea_class===p
                            const c=PEA_C(p)
                            return(
                              <button key={p} onClick={()=>editMode&&setEf((f:any)=>({...f,pea_class:p}))}
                                style={{...M,fontSize:9,padding:'4px 2px',borderRadius:4,border:`1px solid ${isSel?c:G.border}`,color:isSel?c:G.dim,background:isSel?`${c}18`:'transparent',cursor:editMode?'pointer':'default',fontWeight:isSel?700:400,textAlign:'center' as const}}>
                                {p}
                              </button>
                            )
                          })}
                        </div>
                        {sel.pea_class?(
                          <>
                            <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                              <span style={{...M,fontSize:9,color:G.muted,textTransform:'uppercase' as const,letterSpacing:'0.08em'}}>Κλάση</span>
                              <span style={{...M,fontSize:20,color:PEA_C(sel.pea_class),fontWeight:700}}>{sel.pea_class}</span>
                            </div>
                            <div style={{height:5,background:G.border,borderRadius:3,overflow:'hidden',marginBottom:6}}>
                              <div style={{height:'100%',background:PEA_C(sel.pea_class),borderRadius:3,width:`${PEA_EFF[sel.pea_class]||0}%`,transition:'width .4s'}}/>
                            </div>
                            <div style={{...M,fontSize:8,color:G.dim,display:'flex',justifyContent:'space-between',marginBottom:12}}>
                              <span>Η</span><span>Α+++</span>
                            </div>
                            {(PEA_EFF[sel.pea_class]||0)<60&&(
                              <div style={{padding:'8px 10px',border:`1px solid ${G.amber}30`,borderRadius:6,background:`${G.amber}0a`}}>
                                <p style={{...M,fontSize:8,color:G.amber,letterSpacing:'0.07em',margin:'0 0 4px',textTransform:'uppercase' as const}}>Δυνατότητα βελτίωσης</p>
                                <p style={{...M,fontSize:9,color:G.muted,margin:0,lineHeight:1.5}}>
                                  {(PEA_EFF[sel.pea_class]||0)<30?'Κουφώματα, μόνωση, σύστημα θέρμανσης':
                                   (PEA_EFF[sel.pea_class]||0)<50?'Μόνωση οροφής, αναβάθμιση λέβητα':
                                   'Φωτισμός LED, θερμοστάτης, ηλιακός'}
                                </p>
                              </div>
                            )}
                          </>
                        ):(
                          <p style={{...M,fontSize:9,color:G.dim,textAlign:'center' as const}}>{editMode?'Επίλεξε κλάση παραπάνω':'Κλικ Επεξεργασία'}</p>
                        )}
                        {field('ΕΝΦΙΑ €/χρ.',sel.enfia?`€${sel.enfia}`:'—','enfia','number')}
                        {field('Ασφάλεια €/χρ.',sel.insurance_amount?`€${sel.insurance_amount}`:'—','insurance_amount','number')}
                      </div>
                    )}
                  </div>

                  {/* P&L STRIP */}
                  {panel('P&L — Ετήσιο Snapshot',
                    <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:1,background:G.border,borderRadius:6,overflow:'hidden'}}>
                      {[
                        {l:'Ακαθάριστο Ενοίκιο',v:`€${annualRent.toLocaleString('el-GR')}`,c:G.green},
                        {l:'Δαπάνες',v:`-€${totalExp.toLocaleString('el-GR')}`,c:G.red},
                        {l:'Φόρος (εκτ. 2026)',v:`-€${Math.round(tax).toLocaleString('el-GR')}`,c:G.amber},
                        {l:'Καθαρό Εισόδημα',v:`€${Math.round(netIncome).toLocaleString('el-GR')}`,c:netIncome>=0?G.green:G.red},
                        {l:'Καθαρό/μήνα',v:`€${Math.round(netIncome/12).toLocaleString('el-GR')}`,c:netIncome>=0?G.gold:G.red},
                      ].map(k=>(
                        <div key={k.l} onClick={()=>setNav('roi')} style={{background:G.card,padding:'12px 14px',cursor:'pointer'}}>
                          <p style={{...M,fontSize:9,color:G.muted,textTransform:'uppercase' as const,letterSpacing:'0.08em',margin:'0 0 6px'}}>{k.l}</p>
                          <p style={{...S,fontSize:17,color:k.c,margin:0}}>{k.v}</p>
                        </div>
                      ))}
                    </div>,
                    {l:'ROI & Φόρος',fn:()=>setNav('roi')}
                  )}
                </div>
              )}

              {nav==='expenses'&&<TabExpenses propertyId={sel.id} userId={user.id}/>}
              {nav==='bills'&&<TabBills propertyId={sel.id} userId={user.id}/>}
              {nav==='calendar'&&<TabCalendar propertyId={sel.id} userId={user.id}/>}
              {nav==='roi'&&<TabRentROI propertyId={sel.id} userId={user.id} propertyValue={sel.value||0} ownershipPct={sel.ownership||100}/>}
              {nav==='settings'&&<TabSettings propertyId={sel.id} userId={user.id}/>}
            </>
          )}
        </div>
      </div>

      {/* MODAL */}
      {modal&&(
        <div onClick={e=>e.target===e.currentTarget&&setModal(false)}
          style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.9)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,padding:16}}>
          <div style={{background:'#09091e',border:`1px solid ${G.border2}`,borderRadius:12,padding:28,width:'100%',maxWidth:580,maxHeight:'92vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <p style={{...S,fontSize:22,color:G.text,margin:0}}>Νέο Ακίνητο</p>
              <button onClick={()=>setModal(false)} style={{background:'transparent',border:'none',color:G.muted,fontSize:22,cursor:'pointer',lineHeight:1}}>✕</button>
            </div>

            <p style={{...M,fontSize:9,color:G.muted,textTransform:'uppercase' as const,letterSpacing:'0.12em',marginBottom:10}}>Τύπος Ακινήτου</p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:20}}>
              {PROP_TYPES.map(t=>(
                <button key={t.v} onClick={()=>setForm(f=>({...f,prop_type:t.v}))}
                  style={{background:form.prop_type===t.v?`${G.goldDim}33`:'transparent',border:`1px solid ${form.prop_type===t.v?G.gold:G.border}`,borderRadius:8,padding:'10px 6px',cursor:'pointer',display:'flex',flexDirection:'column' as const,alignItems:'center',gap:4,transition:'all .15s'}}>
                  <span style={{fontSize:20}}>{t.i}</span>
                  <span style={{...M,fontSize:9,color:form.prop_type===t.v?G.gold:G.muted,textTransform:'uppercase' as const,letterSpacing:'0.05em'}}>{t.v}</span>
                </button>
              ))}
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              {([
                {k:'name',l:'Τίτλος / Όνομα',p:'π.χ. Αρύββου 45',full:true},
                {k:'address',l:'Διεύθυνση',p:'Οδός, Πόλη, ΤΚ',full:true},
                {k:'sqm',l:'Εμβαδόν τ.μ.',p:'35',t:'number'},
                {k:'floor',l:'Όροφος',p:'0'},
                {k:'value',l:'Αγοραία Αξία €',p:'88000',t:'number'},
                {k:'obj_value',l:'Αντικειμενική Αξία €',p:'70000',t:'number'},
                {k:'purchase_price',l:'Τιμή Αγοράς €',p:'75000',t:'number'},
                {k:'purchase_date',l:'Ημ. Αγοράς',p:'',t:'date'},
                {k:'ownership',l:'Ποσοστό Ιδιοκτησίας %',p:'100',t:'number'},
                {k:'target_rent',l:'Στόχος Ενοικίου €/μήνα',p:'780',t:'number'},
                {k:'enfia',l:'ΕΝΦΙΑ €/χρόνο',p:'200',t:'number'},
                {k:'insurance_amount',l:'Ασφάλεια €/χρόνο',p:'150',t:'number'},
                {k:'year_built',l:'Έτος Κατασκευής',p:'1985',t:'number'},
                {k:'pea_class',l:'ΠΕΑ Ενεργ. Κλάση',p:'Β'},
                {k:'atak',l:'ΑΤΑΚ',p:''},
                {k:'heating',l:'Σύστημα Θέρμανσης',p:'Αυτόνομο'},
              ] as any[]).map((f:any)=>(
                <div key={f.k} style={{display:'flex',flexDirection:'column' as const,gap:5,gridColumn:f.full?'1/-1':'auto'}}>
                  <label style={{...M,fontSize:9,color:G.muted,textTransform:'uppercase' as const,letterSpacing:'0.08em'}}>{f.l}</label>
                  <input type={f.t||'text'} placeholder={f.p} value={(form as any)[f.k]}
                    onChange={e=>setForm((prev:any)=>({...prev,[f.k]:e.target.value}))}
                    style={{...M,background:G.bg,border:`1px solid ${G.border2}`,borderRadius:6,padding:'8px 12px',color:G.text,fontSize:11,outline:'none'}}/>
                </div>
              ))}
              <div style={{display:'flex',flexDirection:'column' as const,gap:5,gridColumn:'1/-1'}}>
                <label style={{...M,fontSize:9,color:G.muted,textTransform:'uppercase' as const,letterSpacing:'0.08em'}}>Σημειώσεις</label>
                <textarea value={form.notes} onChange={e=>setForm((f:any)=>({...f,notes:e.target.value}))} rows={2} placeholder="Οποιαδήποτε σημείωση..."
                  style={{...M,background:G.bg,border:`1px solid ${G.border2}`,borderRadius:6,padding:'8px 12px',color:G.text,fontSize:11,outline:'none',resize:'none' as const}}/>
              </div>
            </div>

            <div style={{display:'flex',gap:10,marginTop:20}}>
              <button onClick={()=>setModal(false)}
                style={{...M,flex:1,background:'transparent',border:`1px solid ${G.border}`,borderRadius:8,padding:11,color:G.muted,fontSize:10,cursor:'pointer',textTransform:'uppercase' as const,letterSpacing:'0.08em'}}>
                Ακύρωση
              </button>
              <button onClick={addProp} disabled={saving||!form.name||!form.address}
                style={{...M,flex:2,background:G.gold,border:'none',borderRadius:8,padding:11,color:G.bg,fontSize:10,fontWeight:700,letterSpacing:'0.1em',cursor:'pointer',textTransform:'uppercase' as const,opacity:saving||!form.name||!form.address?0.5:1}}>
                {saving?'ΑΠΟΘΗΚΕΥΣΗ...':'+ ΠΡΟΣΘΗΚΗ ΑΚΙΝΗΤΟΥ'}
              </button>
            </div>
            <p style={{...M,fontSize:9,color:G.dim,textAlign:'center' as const,marginTop:12,letterSpacing:'0.08em'}}>{props.length}/15 ακίνητα · {15-props.length} διαθέσιμα</p>
          </div>
        </div>
      )}
    </div>
  )
}