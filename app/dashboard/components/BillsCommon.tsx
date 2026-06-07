'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { NumberInput, CustomSelect, TextInput, Toggle, DatePicker } from './UIComponents';

const MONTHS_GR = ['Ιαν','Φεβ','Μαρ','Απρ','Μαΐ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
const fe = (n:number,d=2)=>`${n.toLocaleString('el-GR',{minimumFractionDigits:d,maximumFractionDigits:d})} €`;

const MGMT_TYPES = [
  {value:'traditional',label:'Παραδοσιακός Διαχειριστής (εθελοντής ή αμειβόμενος)'},
  {value:'office',label:'Γραφείο Διαχείρισης Πολυκατοικίας'},
  {value:'billys',label:'Billys (Ψηφιακός ~3€/μήνα)'},
  {value:'comfy',label:'Comfy (~5€/μήνα)'},
  {value:'mycondo',label:'My Condo (~4€/μήνα)'},
  {value:'none',label:'Χωρίς Διαχειριστή'},
];
const MGMT_COSTS:any = {
  traditional:{monthly:0,desc:'Παραδοσιακός Διαχειριστής — συνήθως ένοικος/ιδιοκτήτης. Μπορεί να είναι εθελοντής (0€) ή να λαμβάνει μικρή αμοιβή.'},
  office:{monthly:0,desc:'Γραφείο Διαχείρισης — επαγγελματική εταιρεία. Ορίσε εσύ την αμοιβή (συνήθως €20-50/μήνα).'},
  billys:{monthly:3,desc:'Billys — ψηφιακή διαχείριση, αυτόματες ειδοποιήσεις, πληρωμές online.'},
  comfy:{monthly:5,desc:'Comfy — ψηφιακή πλατφόρμα, app για ιδιοκτήτες & ενοίκους.'},
  mycondo:{monthly:4,desc:'My Condo — ελληνική πλατφόρμα, διαχείριση κτηρίου & επικοινωνία.'},
  none:{monthly:0,desc:'Αυτοδιαχείριση από τους ιδιοκτήτες.'},
};

interface Props{propertyId:string;userId?:string}

export default function BillsCommon({propertyId,userId=''}:Props){
  const supabase=createClient();
  const card:React.CSSProperties={background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:'12px',padding:'20px',marginBottom:'16px'};
  const g2:React.CSSProperties={display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:'12px'};
  const g3:React.CSSProperties={display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'12px',marginBottom:'12px'};
  const saveTimer=useRef<any>(null);

  // State
  const [mgmtType,setMgmtType]=useState('traditional');
  const [mgmtCost,setMgmtCost]=useState('');
  const [mgmtDueDay,setMgmtDueDay]=useState('25');
  const [fundBalance,setFundBalance]=useState('');
  const [fundMyPct,setFundMyPct]=useState('');
  const [fundMonthly,setFundMonthly]=useState('');
  const [extraReason,setExtraReason]=useState('');
  const [extraAmount,setExtraAmount]=useState('');
  const [extraDate,setExtraDate]=useState('');
  const [extras,setExtras]=useState<{reason:string;amount:string;date:string}[]>([]);
  const [history,setHistory]=useState<string[]>(Array(12).fill(''));

  // Load from Supabase
  useEffect(()=>{
    (async()=>{
      const {data}=await supabase.from('bills_settings').select('data').eq('property_id',propertyId).eq('section','common').maybeSingle();
      if(data?.data){
        const d=data.data as any;
        if(d.mgmtType) setMgmtType(d.mgmtType);
        if(d.mgmtCost!==undefined) setMgmtCost(d.mgmtCost);
        if(d.mgmtDueDay) setMgmtDueDay(d.mgmtDueDay);
        if(d.fundBalance!==undefined) setFundBalance(d.fundBalance);
        if(d.fundMyPct!==undefined) setFundMyPct(d.fundMyPct);
        if(d.fundMonthly!==undefined) setFundMonthly(d.fundMonthly);
        if(d.extras) setExtras(d.extras);
        if(d.history) setHistory(d.history);
      }
    })();
  },[propertyId]);

  // Debounced save
  const save=useCallback((patch:any)=>{
    if(saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(async()=>{
      await supabase.from('bills_settings').upsert({
        property_id:propertyId,user_id:userId,section:'common',
        data:patch,updated_at:new Date().toISOString(),
      },{onConflict:'property_id,section'});
    },800);
  },[propertyId,userId]);

  const upd=(patch:any)=>{
    const state={mgmtType,mgmtCost,mgmtDueDay,fundBalance,fundMyPct,fundMonthly,extras,history,...patch};
    save(state);
  };

  const sMgmt=(v:string)=>{setMgmtType(v);upd({mgmtType:v});};
  const sMgmtCost=(v:string)=>{setMgmtCost(v);upd({mgmtCost:v});};
  const sMgmtDay=(v:string)=>{setMgmtDueDay(v);upd({mgmtDueDay:v});};
  const sFundBal=(v:string)=>{setFundBalance(v);upd({fundBalance:v});};
  const sFundPct=(v:string)=>{setFundMyPct(v);upd({fundMyPct:v});};
  const sFundM=(v:string)=>{setFundMonthly(v);upd({fundMonthly:v});};
  const sHist=(i:number,v:string)=>{const n=[...history];n[i]=v;setHistory(n);upd({history:n});};

  const addExtra=()=>{
    if(!extraReason||!extraAmount) return;
    const n=[...extras,{reason:extraReason,amount:extraAmount,date:extraDate}];
    setExtras(n);upd({extras:n});
    setExtraReason('');setExtraAmount('');setExtraDate('');
  };
  const delExtra=(i:number)=>{const n=extras.filter((_,j)=>j!==i);setExtras(n);upd({extras:n});};

  const mgmtMonthly=parseFloat(mgmtCost)||MGMT_COSTS[mgmtType]?.monthly||0;
  const monthlyAvg=history.filter(v=>v).length>0?history.reduce((s,v)=>s+(parseFloat(v)||0),0)/history.filter(v=>v).length:0;
  const totalCommon=mgmtMonthly+(parseFloat(fundMonthly)||0)+monthlyAvg;
  const maxH=Math.max(...history.map(v=>parseFloat(v)||0),1);
  const currentMonth=new Date().getMonth();

  return(
    <div style={{fontFamily:'Inter,sans-serif'}}>
      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'10px',marginBottom:'16px'}}>
        {[
          {label:'Διαχείριση/μήνα',value:mgmtMonthly>0?fe(mgmtMonthly):'Δωρεάν',color:'var(--accent)'},
          {label:'Ταμείο/μήνα',value:parseFloat(fundMonthly)>0?fe(parseFloat(fundMonthly)):'—',color:'var(--info)'},
          {label:'Μ.Ο. Κοινοχρήστων',value:monthlyAvg>0?fe(monthlyAvg):'—',color:'var(--warning)'},
        ].map((k,i)=>(
          <div key={i} style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:'12px',padding:'14px 16px'}}>
            <div style={{fontSize:'18px',fontWeight:700,color:k.color,fontFamily:"'JetBrains Mono',monospace",marginBottom:'4px'}}>{k.value}</div>
            <div style={{fontSize:'9px',color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.1em'}}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Management */}
      <div style={card}>
        <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'16px',paddingBottom:'10px',borderBottom:'1px solid var(--border-subtle)'}}>
          <span style={{fontSize:'16px'}}>🏛</span>
          <span style={{fontSize:'12px',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.04em'}}>Διαχείριση Κτηρίου</span>
        </div>
        <div style={g3}>
          <CustomSelect label="Τύπος Διαχείρισης" value={mgmtType} onChange={sMgmt} options={MGMT_TYPES}/>
          <NumberInput label="Μηνιαίο Κόστος (€)" value={mgmtCost} onChange={sMgmtCost} suffix="€" step={5}/>
          <NumberInput label="Ημέρα Χρέωσης" value={mgmtDueDay} onChange={sMgmtDay} suffix="η" step={1}/>
        </div>
        <div style={{background:'var(--bg-elevated)',borderRadius:'8px',padding:'10px 14px',fontSize:'11px',color:'var(--text-secondary)',marginBottom:'14px'}}>
          {MGMT_COSTS[mgmtType]?.desc}
        </div>

        {/* Comparison grid */}
        <div style={{fontSize:'10px',fontWeight:600,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:'10px'}}>Σύγκριση Επιλογών Διαχείρισης</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'8px',marginBottom:'8px'}}>
          {[
            {key:'traditional',label:'Παραδοσιακός Διαχειριστής (εθελοντής ή αμειβόμενος)',cost:'Εθελοντής / Αμοιβή'},
            {key:'office',label:'Γραφείο Διαχείρισης Πολυκατοικίας',cost:'Με Χρέωση'},
            {key:'billys',label:'Billys (Ψηφιακός ~3€/μήνα)',cost:'3 €'},
            {key:'comfy',label:'Comfy (~5€/μήνα)',cost:'5 €'},
            {key:'mycondo',label:'My Condo (~4€/μήνα)',cost:'4 €'},
            {key:'none',label:'Χωρίς Διαχειριστή',cost:'Δωρεάν'},
          ].map(opt=>{
            const isCur=mgmtType===opt.key;
            return(
              <div key={opt.key} onClick={()=>sMgmt(opt.key)}
                style={{background:isCur?'rgba(212,175,66,0.1)':'var(--bg-elevated)',border:`1px solid ${isCur?'var(--accent)':'var(--border-subtle)'}`,borderRadius:'10px',padding:'12px',cursor:'pointer',textAlign:'center'}}>
                <div style={{fontSize:'16px',fontWeight:700,color:isCur?'var(--accent)':'var(--text-primary)',fontFamily:"'JetBrains Mono',monospace",marginBottom:'4px'}}>{opt.cost}</div>
                <div style={{fontSize:'9px',color:'var(--text-secondary)',lineHeight:1.4}}>{opt.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Building fund */}
      <div style={card}>
        <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'16px',paddingBottom:'10px',borderBottom:'1px solid var(--border-subtle)'}}>
          <span style={{fontSize:'16px'}}>🏦</span>
          <span style={{fontSize:'12px',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.04em'}}>Ταμείο Κτηρίου</span>
        </div>
        <div style={g3}>
          <NumberInput label="Υπόλοιπο Ταμείου (€)" value={fundBalance} onChange={sFundBal} suffix="€" step={100}/>
          <NumberInput label="Μερίδιό Μου %" value={fundMyPct} onChange={sFundPct} suffix="%" step={1}/>
          <NumberInput label="Μηνιαία Εισφορά (€)" value={fundMonthly} onChange={sFundM} suffix="€" step={5}/>
        </div>
        {fundBalance&&fundMyPct&&(
          <div style={{background:'var(--bg-elevated)',borderRadius:'8px',padding:'10px 14px',fontSize:'11px',color:'var(--text-secondary)'}}>
            Το μερίδιό σου στο ταμείο: <strong style={{color:'var(--accent)',fontFamily:"'JetBrains Mono',monospace"}}>{fe(parseFloat(fundBalance)*(parseFloat(fundMyPct)/100))}</strong>
          </div>
        )}
      </div>

      {/* Extra expenses */}
      <div style={card}>
        <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'16px',paddingBottom:'10px',borderBottom:'1px solid var(--border-subtle)'}}>
          <span style={{fontSize:'16px'}}>⚡</span>
          <span style={{fontSize:'12px',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.04em'}}>Έκτακτες Εισφορές</span>
        </div>
        <div style={{background:'var(--bg-elevated)',borderRadius:'10px',padding:'14px',marginBottom:'12px'}}>
          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr auto',gap:'8px',alignItems:'flex-end'}}>
            <TextInput label="Αιτία" value={extraReason} onChange={setExtraReason} placeholder="π.χ. Ανακαίνιση ταράτσας"/>
            <NumberInput label="Ποσό (€)" value={extraAmount} onChange={setExtraAmount} suffix="€" step={50}/>
            <DatePicker label="Ημερομηνία" value={extraDate} onChange={setExtraDate}/>
            <button onClick={addExtra} style={{background:'var(--accent)',color:'var(--bg-base)',border:'none',borderRadius:'8px',padding:'9px 16px',fontSize:'12px',fontWeight:700,cursor:'pointer',fontFamily:'Inter,sans-serif',marginBottom:'12px'}}>
              + Προσθήκη
            </button>
          </div>
        </div>
        {extras.map((e,i)=>(
          <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border-subtle)'}}>
            <div>
              <span style={{fontSize:'11px',fontWeight:600,color:'var(--text-primary)'}}>{e.reason}</span>
              {e.date&&<span style={{fontSize:'10px',color:'var(--text-tertiary)',marginLeft:'8px'}}>📅 {new Date(e.date).toLocaleDateString('el-GR')}</span>}
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
              <span style={{fontSize:'12px',fontWeight:700,color:'var(--negative)',fontFamily:"'JetBrains Mono',monospace"}}>{fe(parseFloat(e.amount))}</span>
              <button onClick={()=>delExtra(i)} style={{width:'22px',height:'22px',borderRadius:'5px',border:'1px solid var(--border-subtle)',background:'transparent',color:'var(--text-tertiary)',cursor:'pointer',fontSize:'11px'}}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* History */}
      <div style={card}>
        <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'16px',paddingBottom:'10px',borderBottom:'1px solid var(--border-subtle)'}}>
          <span style={{fontSize:'16px'}}>📊</span>
          <span style={{fontSize:'12px',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.04em'}}>Ιστορικό Κοινοχρήστων ανά Μήνα</span>
        </div>
        <div style={{display:'flex',gap:'5px',alignItems:'flex-end',height:'70px',marginBottom:'8px'}}>
          {MONTHS_GR.map((m,i)=>{
            const val=parseFloat(history[i])||0;
            const pct=val/maxH;
            const isCur=i===currentMonth;
            return(
              <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:'2px'}}>
                {val>0&&<div style={{fontSize:'7px',color:'var(--text-tertiary)',fontFamily:"'JetBrains Mono',monospace"}}>{Math.round(val)}</div>}
                <div style={{width:'100%',height:`${Math.max(pct*58,val>0?4:1)}px`,background:isCur?'var(--accent)':'var(--info)',borderRadius:'4px 4px 0 0',opacity:isCur?1:0.7}}/>
              </div>
            );
          })}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:'6px'}}>
          {MONTHS_GR.map((m,i)=>(
            <div key={i}>
              <label style={{fontSize:'8px',color:'var(--text-secondary)',display:'block',marginBottom:'3px',textAlign:'center'}}>{m}</label>
              <input type="number" value={history[i]} onChange={e=>sHist(i,e.target.value)} placeholder="€"
                style={{width:'100%',background:'var(--bg-base)',border:`1px solid ${i===currentMonth?'var(--accent)':'var(--border-subtle)'}`,borderRadius:'6px',padding:'6px 4px',color:'var(--text-primary)',fontSize:'11px',fontFamily:"'JetBrains Mono',monospace",outline:'none',textAlign:'center',boxSizing:'border-box'}}/>
            </div>
          ))}
        </div>
        {monthlyAvg>0&&(
          <div style={{marginTop:'12px',background:'var(--bg-elevated)',borderRadius:'8px',padding:'10px 14px',display:'flex',gap:'24px'}}>
            <div>
              <div style={{fontSize:'14px',fontWeight:700,color:'var(--accent)',fontFamily:"'JetBrains Mono',monospace"}}>{fe(monthlyAvg)}</div>
              <div style={{fontSize:'9px',color:'var(--text-secondary)',textTransform:'uppercase'}}>Μέσο Μηνιαίο</div>
            </div>
            <div>
              <div style={{fontSize:'14px',fontWeight:700,color:'var(--negative)',fontFamily:"'JetBrains Mono',monospace"}}>{fe(Math.max(...history.map(v=>parseFloat(v)||0)))}</div>
              <div style={{fontSize:'9px',color:'var(--text-secondary)',textTransform:'uppercase'}}>Ακριβότερος</div>
            </div>
            <div>
              <div style={{fontSize:'14px',fontWeight:700,color:'var(--warning)',fontFamily:"'JetBrains Mono',monospace"}}>{fe(monthlyAvg*12)}</div>
              <div style={{fontSize:'9px',color:'var(--text-secondary)',textTransform:'uppercase'}}>Ετήσιο Εκτιμώμενο</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}