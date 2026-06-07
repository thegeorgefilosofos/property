'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CustomSelect, NumberInput, TextInput, DatePicker, Textarea, Toggle } from './UIComponents';
import RentComparables from './RentComparables';
import RentROIReport from './RentROIReport';

interface Props {
  propertyId: string; userId: string;
  propertyValue?: number; ownershipPct?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PROPERTY_TYPES = [
  {value:'apartment',label:'Κατοικία / Διαμέρισμα'},
  {value:'house',label:'Μονοκατοικία / Βίλα'},
  {value:'commercial',label:'Επαγγελματικός Χώρος'},
  {value:'parking',label:'Parking / Γκαράζ'},
  {value:'storage',label:'Αποθήκη'},
  {value:'land',label:'Αγροτεμάχιο / Οικόπεδο'},
  {value:'industrial',label:'Βιομηχανικό / Εργοστάσιο'},
  {value:'airbnb',label:'Airbnb / Βραχυχρόνια Μίσθωση'},
  {value:'mixed',label:'Μεικτή Χρήση'},
];

const CONSTRUCTION_TYPES = [
  {value:'pre1960',label:'Προπολεμικό (έως 1960)'},
  {value:'60s70s',label:'Δεκαετίες 60-70'},
  {value:'80s',label:'Δεκαετία 80'},
  {value:'90s',label:'Δεκαετία 90'},
  {value:'2000s',label:'2000-2010'},
  {value:'2010s',label:'2010-2020'},
  {value:'modern',label:'Νεόδμητο 2020+'},
];

const LOAN_TYPES = [
  {value:'mortgage',label:'Στεγαστικό Δάνειο'},
  {value:'spiti_mou',label:'Σπίτι Μου ΙΙ (50% άτοκο)'},
  {value:'investment',label:'Επενδυτικό Δάνειο'},
  {value:'renovation',label:'Δάνειο Ανακαίνισης'},
  {value:'green',label:'Πράσινο Δάνειο (Φωτοβολταϊκά / Αντλία Θερμότητας)'},
  {value:'bridge',label:'Bridge Loan'},
  {value:'promissory',label:'Γραμμάτια'},
  {value:'other',label:'Άλλο'},
];

const COMPANY_HQ = [
  {value:'none',label:'Φυσικό Πρόσωπο'},
  {value:'greece',label:'Εταιρεία — Ελλάδα'},
  {value:'eu',label:'Εταιρεία — Ευρωπαϊκή Ένωση (π.χ. Κύπρος, Βουλγαρία)'},
  {value:'uk',label:'Εταιρεία — Ηνωμένο Βασίλειο'},
  {value:'uae',label:'Εταιρεία — Ηνωμένα Αραβικά Εμιράτα'},
  {value:'usa',label:'Εταιρεία — Ηνωμένες Πολιτείες Αμερικής'},
  {value:'israel',label:'Εταιρεία — Ισραήλ'},
  {value:'asia',label:'Εταιρεία — Ασία (Σιγκαπούρη / Χονγκ Κονγκ)'},
];

const FLOORS = Array.from({length:15},(_,i)=>({
  value:String(i),
  label:i===0?'Ισόγειο':i===1?'1ος Όροφος':i===2?'2ος Όροφος':i===3?'3ος Όροφος':`${i}ος Όροφος`
}));

const DURATION_UNITS = [
  {value:'days',label:'Μέρες'},
  {value:'months',label:'Μήνες'},
  {value:'years',label:'Χρόνια'},
];

const GREEK_MARKETS = [
  {value:'Κεντρικός Τομέας Αθηνών',label:'Αττική — Κεντρικός Τομέας Αθηνών'},
  {value:'Βόρειος Τομέας Αθηνών',label:'Αττική — Βόρειος Τομέας Αθηνών (Μαρούσι, Κηφισιά)'},
  {value:'Νότιος Τομέας Αθηνών',label:'Αττική — Νότιος Τομέας Αθηνών (Γλυφάδα, Βούλα)'},
  {value:'Δυτικός Τομέας Αθηνών',label:'Αττική — Δυτικός Τομέας Αθηνών (Περιστέρι)'},
  {value:'Πειραιάς',label:'Αττική — Πειραιάς και Νήσοι'},
  {value:'Ανατολική Αττική',label:'Αττική — Ανατολική Αττική (Παλλήνη, Ραφήνα)'},
  {value:'Δυτική Αττική',label:'Αττική — Δυτική Αττική (Ελευσίνα)'},
  {value:'Θεσσαλονίκη',label:'Κεντρική Μακεδονία — Θεσσαλονίκη'},
  {value:'Καλαμαριά',label:'Κεντρική Μακεδονία — Καλαμαριά / Πυλαία'},
  {value:'Ημαθία',label:'Κεντρική Μακεδονία — Ημαθία (Βέροια)'},
  {value:'Κιλκίς',label:'Κεντρική Μακεδονία — Κιλκίς'},
  {value:'Πέλλα',label:'Κεντρική Μακεδονία — Πέλλα (Έδεσσα)'},
  {value:'Πιερία',label:'Κεντρική Μακεδονία — Πιερία (Κατερίνη)'},
  {value:'Σέρρες',label:'Κεντρική Μακεδονία — Σέρρες'},
  {value:'Χαλκιδική',label:'Κεντρική Μακεδονία — Χαλκιδική'},
  {value:'Γρεβενά',label:'Δυτική Μακεδονία — Γρεβενά'},
  {value:'Καστοριά',label:'Δυτική Μακεδονία — Καστοριά'},
  {value:'Κοζάνη',label:'Δυτική Μακεδονία — Κοζάνη'},
  {value:'Φλώρινα',label:'Δυτική Μακεδονία — Φλώρινα'},
  {value:'Δράμα',label:'Ανατολική Μακεδονία & Θράκη — Δράμα'},
  {value:'Έβρος',label:'Ανατολική Μακεδονία & Θράκη — Έβρος (Αλεξανδρούπολη)'},
  {value:'Καβάλα',label:'Ανατολική Μακεδονία & Θράκη — Καβάλα'},
  {value:'Θάσος',label:'Ανατολική Μακεδονία & Θράκη — Θάσος'},
  {value:'Ξάνθη',label:'Ανατολική Μακεδονία & Θράκη — Ξάνθη'},
  {value:'Ροδόπη',label:'Ανατολική Μακεδονία & Θράκη — Ροδόπη (Κομοτηνή)'},
  {value:'Άρτα',label:'Ήπειρος — Άρτα'},
  {value:'Θεσπρωτία',label:'Ήπειρος — Θεσπρωτία (Ηγουμενίτσα)'},
  {value:'Ιωάννινα',label:'Ήπειρος — Ιωάννινα'},
  {value:'Πρέβεζα',label:'Ήπειρος — Πρέβεζα'},
  {value:'Καρδίτσα',label:'Θεσσαλία — Καρδίτσα'},
  {value:'Λάρισα',label:'Θεσσαλία — Λάρισα'},
  {value:'Μαγνησία',label:'Θεσσαλία — Μαγνησία (Βόλος)'},
  {value:'Σποράδες',label:'Θεσσαλία — Σποράδες'},
  {value:'Τρίκαλα',label:'Θεσσαλία — Τρίκαλα'},
  {value:'Αιτωλοακαρνανία',label:'Δυτική Ελλάδα — Αιτωλοακαρνανία (Αγρίνιο)'},
  {value:'Αχαΐα',label:'Δυτική Ελλάδα — Αχαΐα (Πάτρα)'},
  {value:'Ηλεία',label:'Δυτική Ελλάδα — Ηλεία (Πύργος)'},
  {value:'Βοιωτία',label:'Στερεά Ελλάδα — Βοιωτία (Λιβαδειά)'},
  {value:'Εύβοια',label:'Στερεά Ελλάδα — Εύβοια (Χαλκίδα)'},
  {value:'Ευρυτανία',label:'Στερεά Ελλάδα — Ευρυτανία (Καρπενήσι)'},
  {value:'Φθιώτιδα',label:'Στερεά Ελλάδα — Φθιώτιδα (Λαμία)'},
  {value:'Φωκίδα',label:'Στερεά Ελλάδα — Φωκίδα (Άμφισσα)'},
  {value:'Αργολίδα',label:'Πελοπόννησος — Αργολίδα (Ναύπλιο)'},
  {value:'Αρκαδία',label:'Πελοπόννησος — Αρκαδία (Τρίπολη)'},
  {value:'Κορινθία',label:'Πελοπόννησος — Κορινθία'},
  {value:'Λακωνία',label:'Πελοπόννησος — Λακωνία (Σπάρτη)'},
  {value:'Μεσσηνία',label:'Πελοπόννησος — Μεσσηνία (Καλαμάτα)'},
  {value:'Ζάκυνθος',label:'Ιόνια Νησιά — Ζάκυνθος'},
  {value:'Κέρκυρα',label:'Ιόνια Νησιά — Κέρκυρα'},
  {value:'Κεφαλληνία',label:'Ιόνια Νησιά — Κεφαλληνία και Ιθάκη'},
  {value:'Λευκάδα',label:'Ιόνια Νησιά — Λευκάδα'},
  {value:'Λέσβος',label:'Βόρειο Αιγαίο — Λέσβος (Μυτιλήνη)'},
  {value:'Λήμνος',label:'Βόρειο Αιγαίο — Λήμνος'},
  {value:'Σάμος',label:'Βόρειο Αιγαίο — Σάμος'},
  {value:'Χίος',label:'Βόρειο Αιγαίο — Χίος'},
  {value:'Ικαρία',label:'Βόρειο Αιγαίο — Ικαρία'},
  {value:'Μύκονος',label:'Νότιο Αιγαίο — Μύκονος'},
  {value:'Σαντορίνη',label:'Νότιο Αιγαίο — Σαντορίνη (Θήρα)'},
  {value:'Ρόδος',label:'Νότιο Αιγαίο — Ρόδος'},
  {value:'Κως',label:'Νότιο Αιγαίο — Κως'},
  {value:'Πάρος',label:'Νότιο Αιγαίο — Πάρος'},
  {value:'Νάξος',label:'Νότιο Αιγαίο — Νάξος'},
  {value:'Σύρος',label:'Νότιο Αιγαίο — Σύρος (Ερμούπολη)'},
  {value:'Μήλος',label:'Νότιο Αιγαίο — Μήλος'},
  {value:'Τήνος',label:'Νότιο Αιγαίο — Τήνος'},
  {value:'Άνδρος',label:'Νότιο Αιγαίο — Άνδρος'},
  {value:'Κάλυμνος',label:'Νότιο Αιγαίο — Κάλυμνος'},
  {value:'Κάρπαθος',label:'Νότιο Αιγαίο — Κάρπαθος'},
  {value:'Κέα-Κύθνος',label:'Νότιο Αιγαίο — Κέα - Κύθνος'},
  {value:'Ηράκλειο',label:'Κρήτη — Ηράκλειο'},
  {value:'Λασίθι',label:'Κρήτη — Λασίθι (Άγιος Νικόλαος)'},
  {value:'Ρέθυμνο',label:'Κρήτη — Ρέθυμνο'},
  {value:'Χανιά',label:'Κρήτη — Χανιά'},
];

// ─── Tax ─────────────────────────────────────────────────────────────────────
// @ts-ignore
function calcRentTax(gross:number,electronic:boolean,ownerAge:number,children:number){
  const reduction=electronic?gross*0.05:0;
  const taxable=gross-reduction;
  let tax=0;
  if(ownerAge<=25){if(taxable<=20000)tax=0;else tax=calcBaseTax(taxable-20000);}
  else if(ownerAge<=30){if(taxable<=10000)tax=taxable*0.09;else tax=10000*0.09+calcBaseTax(taxable-10000);}
  else tax=calcBaseTax(taxable);
  const effectiveRate=gross>0?(tax/gross)*100:0;
  // @ts-ignore
  const electronicSaving=electronic?calcRentTax(gross,false,ownerAge,children).tax-tax:0;
  return{taxable,tax,reduction,effectiveRate,electronicSaving};
}
function calcBaseTax(t:number):number{
  if(t<=12000)return t*0.15;
  if(t<=14000)return 12000*0.15+(t-12000)*0.25;
  if(t<=35000)return 12000*0.15+2000*0.25+(t-14000)*0.35;
  return 12000*0.15+2000*0.25+21000*0.35+(t-35000)*0.45;
}
function toMonths(val:string,unit:string):number{
  const n=parseFloat(val)||0;
  if(unit==='days')return n/30;
  if(unit==='years')return n*12;
  return n;
}

// ─── Formatters ───────────────────────────────────────────────────────────────
const fe=(n:number,d=2)=>`${n.toLocaleString('el-GR',{minimumFractionDigits:d,maximumFractionDigits:d})} €`;
const fp=(n:number,d=2)=>`${n.toFixed(d)}%`;

// ─── Shared UI ────────────────────────────────────────────────────────────────
const card:React.CSSProperties={background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:'12px',padding:'20px',marginBottom:'16px'};
const g2:React.CSSProperties={display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:'12px'};
const g3:React.CSSProperties={display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'12px',marginBottom:'12px'};
const g4:React.CSSProperties={display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:'12px',marginBottom:'12px'};

function SH({label,icon}:{label:string;icon:string}){
  return(
    <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'16px',paddingBottom:'10px',borderBottom:'1px solid var(--border-subtle)'}}>
      <span style={{fontSize:'16px'}}>{icon}</span>
      <span style={{fontSize:'12px',fontWeight:700,color:'var(--text-primary)',letterSpacing:'0.04em',textTransform:'uppercase'}}>{label}</span>
    </div>
  );
}

function KPI({label,value,sub,color='var(--text-primary)',icon,badge,size='md'}:{label:string;value:string;sub?:string;color?:string;icon?:string;badge?:{text:string;color:string};size?:'sm'|'md'|'lg'}){
  const fs=size==='lg'?'22px':size==='md'?'18px':'14px';
  return(
    <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:'12px',padding:'14px 16px'}}>
      {icon&&<div style={{fontSize:'18px',marginBottom:'6px'}}>{icon}</div>}
      <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px',flexWrap:'wrap'}}>
        <div style={{fontSize:fs,fontWeight:700,color,fontFamily:"'JetBrains Mono',monospace",letterSpacing:'-0.5px'}}>{value}</div>
        {badge&&<span style={{fontSize:'9px',fontWeight:700,color:badge.color,background:`${badge.color}15`,padding:'2px 6px',borderRadius:'4px',whiteSpace:'nowrap'}}>{badge.text}</span>}
      </div>
      <div style={{fontSize:'9px',color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.1em',lineHeight:1.4}}>{label}</div>
      {sub&&<div style={{fontSize:'10px',color:'var(--text-tertiary)',marginTop:'3px'}}>{sub}</div>}
    </div>
  );
}

function Gauge({value,max=15,label,color='var(--accent)'}:{value:number;max?:number;label:string;color?:string}){
  const pct=Math.min(Math.max(value/max,0),1);
  const angle=pct*180-90;
  const r=44,cx=56,cy=56;
  const toRad=(a:number)=>a*Math.PI/180;
  const sx=cx+r*Math.cos(toRad(-90)),sy=cy+r*Math.sin(toRad(-90));
  const ex=cx+r*Math.cos(toRad(90)),ey=cy+r*Math.sin(toRad(90));
  const ax=cx+r*Math.cos(toRad(angle)),ay=cy+r*Math.sin(toRad(angle));
  const la=pct>0.5?1:0;
  return(
    <div style={{textAlign:'center'}}>
      <svg width="112" height="66" viewBox="0 0 112 66">
        <path d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`} fill="none" stroke="var(--bg-overlay)" strokeWidth="9" strokeLinecap="round"/>
        {value>0&&<path d={`M ${sx} ${sy} A ${r} ${r} 0 ${la} 1 ${ax} ${ay}`} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" style={{transition:'all 0.6s ease'}}/>}
        <circle cx={ax} cy={ay} r="4" fill={color}/>
        <text x={cx} y={cy+2} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--text-primary)" fontFamily="'JetBrains Mono',monospace">{value.toFixed(1)}%</text>
      </svg>
      <div style={{fontSize:'8px',color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.08em',marginTop:'-2px',maxWidth:'100px',margin:'0 auto'}}>{label}</div>
    </div>
  );
}

function InfoBox({type='info',children}:{type?:'info'|'warning'|'success'|'danger';children:React.ReactNode}){
  const c={info:'var(--info)',warning:'var(--warning)',success:'var(--positive)',danger:'var(--negative)'}[type];
  return(
    <div style={{background:`${c}0d`,border:`1px solid ${c}40`,borderRadius:'8px',padding:'10px 14px',fontSize:'11px',color:c,marginBottom:'10px',lineHeight:1.5}}>
      {children}
    </div>
  );
}

function Row({label,value,color='var(--text-primary)',bold=false}:{label:string;value:string;color?:string;bold?:boolean}){
  return(
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:'1px solid var(--border-subtle)',gap:'12px'}}>
      <span style={{fontSize:'11px',color:'var(--text-secondary)',flexShrink:0}}>{label}</span>
      <span style={{fontSize:bold?'14px':'12px',fontWeight:bold?700:600,color,fontFamily:"'JetBrains Mono',monospace",textAlign:'right'}}>{value}</span>
    </div>
  );
}

function ScoreBar({label,score,max=100,color}:{label:string;score:number;max?:number;color:string}){
  return(
    <div style={{marginBottom:'10px'}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'4px'}}>
        <span style={{fontSize:'10px',color:'var(--text-secondary)'}}>{label}</span>
        <span style={{fontSize:'11px',fontWeight:700,color,fontFamily:"'JetBrains Mono',monospace"}}>{score.toFixed(0)}/{max}</span>
      </div>
      <div style={{height:'6px',background:'var(--bg-overlay)',borderRadius:'3px',overflow:'hidden'}}>
        <div style={{height:'100%',width:`${Math.min(score/max*100,100)}%`,background:color,borderRadius:'3px',transition:'width 0.6s'}}/>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function TabRentROI({propertyId,userId,propertyValue=0,ownershipPct=100}:Props){
  const supabase=createClient();
  const [activeTab,setActiveTab]=useState<'overview'|'tax'|'airbnb'|'loan'|'scenario'>('overview');
  const [propType,setPropType]=useState('apartment');
  const [constructionType,setConstructionType]=useState('80s');
  const [floor,setFloor]=useState('2');
  const [companyHq,setCompanyHq]=useState('none');
  const [electronic,setElectronic]=useState(true);
  const [ownerAge,setOwnerAge]=useState('35');
  const [children,setChildren]=useState('0');
  const [expenses,setExpenses]=useState(0);
  const [saving,setSaving]=useState(false);
  const [savedOk,setSavedOk]=useState('');

  const [cfg,setCfg]=useState({
    target_rent:'',actual_rent:'',tenant_name:'',
    lease_start:'',lease_end:'',deposit:'',
    management_fee_pct:'',insurance_annual:'',maintenance_reserve:'',
    enfia_annual:'',is_insured:false,insurance_covers_disasters:false,
    commercial_value:'',objective_value:'',
  });
  const sc=(k:string,v:any)=>setCfg(f=>({...f,[k]:v}));

  const [loan,setLoan]=useState({
    bank_name:'',loan_type:'mortgage',original_amount:'',remaining_balance:'',
    interest_rate:'',monthly_payment:'',start_date:'',end_date:'',
    loan_term_months:'',paid_months:'',is_fixed_rate:true,notes:'',
    notary_cost:'',agent_fee_pct:'2',transfer_tax_pct:'3',
    renovation_loan:'',renovation_loan_rate:'',renovation_loan_months:'',
    green_loan:'',green_loan_desc:'',
    early_repayment:'',
  });
  const [loanId,setLoanId]=useState<string|null>(null);
  const sl=(k:string,v:any)=>setLoan(f=>({...f,[k]:v}));

  const [airbnb,setAirbnb]=useState({
    adr_low:'',adr_mid:'',adr_high:'',
    occ_low:'55',occ_mid:'70',occ_high:'85',
    dur_low:'4',dur_mid:'5',dur_high:'3',
    unit_low:'months',unit_mid:'months',unit_high:'months',
    platform_fee:'15',cleaning_cost:'50',cleaning_per_nights:'3',
    netflix:'0',spotify:'0',bike_count:'0',bike_cost:'200',
    welcome_basket:'20',welcome_per_booking:'true',
    pool_maintenance:'',garden_maintenance:'',balcony_plants:'',
    extra_services:'',damage_reserve:'200',
  });
  const sa=(k:string,v:any)=>setAirbnb(f=>({...f,[k]:v}));

  const [bench,setBench]=useState({
    etf_return:'7',euribor:'3.8',market_gross:'5',target_net:'3',
    market_label:'Κεντρικός Τομέας Αθηνών',
  });
  const sb=(k:string,v:string)=>setBench(f=>({...f,[k]:v}));

  const [sc2,setSc2]=useState({
    rent_change:'10',vacancy_months:'1',value_growth:'3',years:'10',
    inflation:'3',expense_growth:'2',sell_agent_pct:'2',sell_tax_pct:'3',
    reserve_pct:'5',building_depreciation_yrs:'40',equipment_depreciation_yrs:'5',
    auction_discount:'25',penalty_months:'2',
    mc_runs:'500',mc_rent_std:'15',mc_value_std:'20',
  });
  const ss=(k:string,v:string)=>setSc2(f=>({...f,[k]:v}));

  const load=useCallback(async()=>{
    const [{data:rc},{data:exp},{data:ln}]=await Promise.all([
      supabase.from('rent_config').select('*').eq('property_id',propertyId).single(),
      supabase.from('expenses').select('amount').eq('property_id',propertyId),
      supabase.from('loans').select('*').eq('property_id',propertyId).single(),
    ]);
    if(rc) setCfg(p=>({...p,
      target_rent:String(rc.target_rent||''),actual_rent:String(rc.actual_rent||''),
      tenant_name:rc.tenant_name||'',lease_start:rc.lease_start||'',
      lease_end:rc.lease_end||'',deposit:String(rc.deposit||''),
      management_fee_pct:String(rc.management_fee_pct||''),
      insurance_annual:String(rc.insurance||''),maintenance_reserve:String(rc.maintenance_reserve||''),
    }));
    if(exp) setExpenses((exp||[]).reduce((s:number,e:any)=>s+e.amount,0));
    if(ln){
      setLoanId(ln.id);
      setLoan(p=>({...p,
        bank_name:ln.bank_name||'',loan_type:ln.loan_type||'mortgage',
        original_amount:String(ln.original_amount||''),remaining_balance:String(ln.remaining_balance||''),
        interest_rate:String(ln.interest_rate||''),monthly_payment:String(ln.monthly_payment||''),
        start_date:ln.start_date||'',end_date:ln.end_date||'',
        loan_term_months:String(ln.loan_term_months||''),paid_months:String(ln.paid_months||''),
        is_fixed_rate:ln.is_fixed_rate??true,notes:ln.notes||'',
      }));
    }
  },[propertyId]);
  useEffect(()=>{load();},[load]);

  const saveConfig=async()=>{
    setSaving(true);
    const n=(v:string)=>parseFloat(v)||null;
    await supabase.from('rent_config').upsert({
      property_id:propertyId,user_id:userId,
      target_rent:n(cfg.target_rent),actual_rent:n(cfg.actual_rent),
      tenant_name:cfg.tenant_name||null,lease_start:cfg.lease_start||null,
      lease_end:cfg.lease_end||null,deposit:n(cfg.deposit),
      management_fee_pct:n(cfg.management_fee_pct),
      insurance:n(cfg.insurance_annual),maintenance_reserve:n(cfg.maintenance_reserve),
    },{onConflict:'property_id'});
    setSaving(false);setSavedOk('config');setTimeout(()=>setSavedOk(''),2500);
  };

  const saveLoan=async()=>{
    const n=(v:string)=>parseFloat(v)||null;
    const ni=(v:string)=>parseInt(v)||null;
    const payload={
      property_id:propertyId,user_id:userId,
      bank_name:loan.bank_name||null,loan_type:loan.loan_type,
      original_amount:n(loan.original_amount),remaining_balance:n(loan.remaining_balance),
      interest_rate:n(loan.interest_rate),monthly_payment:n(loan.monthly_payment),
      start_date:loan.start_date||null,end_date:loan.end_date||null,
      loan_term_months:ni(loan.loan_term_months),paid_months:ni(loan.paid_months),
      is_fixed_rate:loan.is_fixed_rate,notes:loan.notes||null,
    };
    if(loanId) await supabase.from('loans').update(payload).eq('id',loanId);
    else{const{data}=await supabase.from('loans').insert(payload).select().single();if(data)setLoanId(data.id);}
    setSavedOk('loan');setTimeout(()=>setSavedOk(''),2500);
  };

  // ── Core calc ──
  const calc=useMemo(()=>{
    const ar=parseFloat(cfg.actual_rent)||0;
    const tr=parseFloat(cfg.target_rent)||0;
    const dep=parseFloat(cfg.deposit)||0;
    const mgmt=(parseFloat(cfg.management_fee_pct)||0)/100*ar*12;
    const ins=parseFloat(cfg.insurance_annual)||0;
    const maint=parseFloat(cfg.maintenance_reserve)||0;
    const enfia=parseFloat(cfg.enfia_annual)||0;
    const annual=ar*12;
    const enfiaRed=cfg.is_insured&&cfg.insurance_covers_disasters
      ?(parseFloat(cfg.objective_value)||0)<=500000?enfia*0.20:enfia*0.10:0;
    const enfiaFinal=enfia-enfiaRed;
    const totalExp=expenses+mgmt+ins+maint+enfiaFinal;
    const age=parseInt(ownerAge)||35;
    const {taxable,tax,reduction,effectiveRate,electronicSaving}=calcRentTax(annual,electronic,age,parseInt(children)||0);
    const netIncome=annual-totalExp;
    const afterTax=netIncome-tax;
    const myVal=propertyValue*(ownershipPct/100);
    const commVal=parseFloat(cfg.commercial_value)||myVal;
    const objVal=parseFloat(cfg.objective_value)||myVal;
    const grossYield=myVal>0?(annual/myVal)*100:0;
    const netYield=myVal>0?(afterTax/myVal)*100:0;
    const capRate=myVal>0?(netIncome/myVal)*100:0;
    const payback=afterTax>0?myVal/afterTax:0;
    const breakeven=myVal>0?(totalExp+tax)/12:0;
    const occRate=ar>0&&tr>0?(ar/tr)*100:100;
    const gap=tr-ar;
    const today=new Date();
    const leaseEnd=cfg.lease_end?new Date(cfg.lease_end):null;
    const days=leaseEnd?Math.ceil((leaseEnd.getTime()-today.getTime())/86400000):null;
    const leaseStatus=!leaseEnd?'unknown':days!<0?'expired':days!<60?'critical':days!<180?'warning':'ok';
    const loanBal=parseFloat(loan.remaining_balance)||0;
    const loanRate=parseFloat(loan.interest_rate)||0;
    const loanPmt=parseFloat(loan.monthly_payment)||0;
    const annualDebt=loanPmt*12;
    const DSCR=annualDebt>0?netIncome/annualDebt:0;
    const LTV=myVal>0&&loanBal>0?(loanBal/myVal)*100:0;
    const equity=myVal-loanBal;
    const ic=loanBal>0&&loanRate>0?netIncome/(loanBal*loanRate/100):0;
    const cfDebt=afterTax-annualDebt;
    // Early repayment saving
    const earlyAmt=parseFloat(loan.early_repayment)||0;
    const pmts=parseInt(loan.loan_term_months)||0;
    const paid=parseInt(loan.paid_months)||0;
    const rem=pmts-paid;
    const mr=loanRate/100/12;
    const interestSaved=mr>0&&rem>0?earlyAmt*mr*rem/(1+mr):0;
    // Depreciation
    const depB=myVal*0.85/(parseFloat(sc2.building_depreciation_yrs)||40);
    const depE=myVal*0.05/(parseFloat(sc2.equipment_depreciation_yrs)||5);
    // Acquisition
    const agentFee=(parseFloat(loan.agent_fee_pct)||2)/100*myVal;
    const transTax=(parseFloat(loan.transfer_tax_pct)||3)/100*myVal;
    const notary=parseFloat(loan.notary_cost)||myVal*0.015;
    const totalAcq=myVal+agentFee+transTax+notary;
    const trueYield=totalAcq>0?(annual/totalAcq)*100:0;
    // Company
    const ctRates:{[k:string]:number}={none:effectiveRate,greece:22,eu:10,uk:25,uae:9,usa:21,israel:23,asia:17};
    const compRate=ctRates[companyHq]||effectiveRate;
    const compTax=netIncome*compRate/100;
    const afterTaxComp=netIncome-compTax;
    // Peak years
    const peakMap:{[k:string]:number}={pre1960:50,'60s70s':40,'80s':30,'90s':25,'2000s':20,'2010s':15,modern:30};
    const peakY=peakMap[constructionType]||30;
    const floorBonus=parseInt(floor)*0.5;
    // Property score
    const yieldScore=Math.min(grossYield/10*40,40);
    const locationScore=leaseStatus==='ok'?20:leaseStatus==='warning'?12:5;
    const finScore=afterTax>0?Math.min(20,20):0;
    const ltvScore=LTV>0?Math.max(0,20-LTV/5):20;
    const totalScore=Math.round(yieldScore+locationScore+finScore+ltvScore);
    const scoreColor=totalScore>=70?'var(--positive)':totalScore>=50?'var(--warning)':'var(--negative)';
    const scoreLabel=totalScore>=70?'Άριστο':totalScore>=50?'Καλό':totalScore>=30?'Μέτριο':'Χαμηλό';
    return{
      ar,tr,annual,dep,totalExp,taxable,tax,reduction,effectiveRate,electronicSaving,
      netIncome,afterTax,myVal,commVal,objVal,grossYield,netYield,capRate,payback,breakeven,
      occRate,gap,days,leaseStatus,loanBal,loanPmt,annualDebt,DSCR,LTV,equity,ic,cfDebt,
      interestSaved,depB,depE,agentFee,transTax,notary,totalAcq,trueYield,
      compRate,compTax,afterTaxComp,peakY,floorBonus,enfiaFinal,enfiaRed,mgmt,ins,maint,
      totalScore,scoreColor,scoreLabel,yieldScore,locationScore,finScore,ltvScore,
    };
  },[cfg,expenses,electronic,propertyValue,ownershipPct,loan,constructionType,floor,companyHq,ownerAge,children,sc2]);

  // ── Airbnb calc ──
  const abb=useMemo(()=>{
    const seasons=[
      {adr:parseFloat(airbnb.adr_low)||0,occ:parseFloat(airbnb.occ_low)/100,months:toMonths(airbnb.dur_low,airbnb.unit_low)},
      {adr:parseFloat(airbnb.adr_mid)||0,occ:parseFloat(airbnb.occ_mid)/100,months:toMonths(airbnb.dur_mid,airbnb.unit_mid)},
      {adr:parseFloat(airbnb.adr_high)||0,occ:parseFloat(airbnb.occ_high)/100,months:toMonths(airbnb.dur_high,airbnb.unit_high)},
    ];
    const pfee=parseFloat(airbnb.platform_fee)/100;
    let rev=0,nights=0;
    seasons.forEach(s=>{const d=s.months*30;const o=d*s.occ;rev+=o*s.adr;nights+=o;});
    const pCost=rev*pfee;
    const cleanings=Math.ceil(nights/Math.max(parseFloat(airbnb.cleaning_per_nights)||3,1));
    const cCost=cleanings*(parseFloat(airbnb.cleaning_cost)||0);
    const bikes=parseInt(airbnb.bike_count)||0;
    const bikeDepr=bikes>0?bikes*(parseFloat(airbnb.bike_cost)||200)/3:0;
    const bookings=Math.ceil(nights/3);
    const basket=airbnb.welcome_per_booking==='true'?bookings*(parseFloat(airbnb.welcome_basket)||0):(parseFloat(airbnb.welcome_basket)||0)*12;
    const extras=(parseFloat(airbnb.netflix)||0)+(parseFloat(airbnb.spotify)||0)+bikeDepr+basket
      +(parseFloat(airbnb.pool_maintenance)||0)+(parseFloat(airbnb.garden_maintenance)||0)
      +(parseFloat(airbnb.balcony_plants)||0)+(parseFloat(airbnb.damage_reserve)||200)
      +(parseFloat(airbnb.extra_services)||0);
    const net=rev-pCost-cCost-expenses-extras;
    const avgOcc=nights/(12*30)*100;
    const revPAR=rev/365;
    const adr=nights>0?rev/nights:0;
    return{rev,nights,pCost,cCost,net,avgOcc,revPAR,adr,extras,bookings,diff:net-calc.afterTax};
  },[airbnb,expenses,calc.afterTax]);

  // ── Scenario calc ──
  const scen=useMemo(()=>{
    const rc=parseFloat(sc2.rent_change)||0;
    const vm=parseFloat(sc2.vacancy_months)||0;
    const vg=parseFloat(sc2.value_growth)||0;
    const yrs=parseFloat(sc2.years)||10;
    const eg=parseFloat(sc2.expense_growth)||2;
    const sa=(parseFloat(sc2.sell_agent_pct)||2)/100;
    const st=(parseFloat(sc2.sell_tax_pct)||3)/100;
    const ad=(parseFloat(sc2.auction_discount)||25)/100;
    const newRent=calc.ar*(1+rc/100);
    const newAnnual=newRent*(12-vm);
    const {tax:nt}=calcRentTax(newAnnual,electronic,parseInt(ownerAge)||35,parseInt(children)||0);
    const newExp=calc.totalExp*Math.pow(1+eg/100,yrs);
    const newNet=newAnnual-newExp-nt;
    const futVal=calc.myVal*Math.pow(1+vg/100,yrs);
    const rentTotal=newNet*yrs;
    const capGain=futVal-calc.myVal;
    const total=rentTotal+capGain;
    const sellNow=calc.myVal*(1-sa-st);
    const sellFuture=futVal*(1-sa-st);
    const auctionVal=calc.myVal*(1-ad);
    const cagr=calc.myVal>0?(Math.pow(futVal/calc.myVal,1/yrs)-1)*100:0;
    const irr=calc.myVal>0?((total/calc.myVal)/yrs)*100:0;
    // Monte Carlo
    const runs=Math.min(parseInt(sc2.mc_runs)||500,1000);
    const rentStd=(parseFloat(sc2.mc_rent_std)||15)/100;
    const valStd=(parseFloat(sc2.mc_value_std)||20)/100;
    let mcResults:number[]=[];
    for(let i=0;i<runs;i++){
      const rVar=1+(rc/100)+(Math.random()-0.5)*rentStd*2;
      const vVar=vg/100+(Math.random()-0.5)*valStd*2;
      const mRent=calc.ar*rVar;
      const mAnnual=mRent*(12-vm);
      const {tax:mt}=calcRentTax(mAnnual,electronic,parseInt(ownerAge)||35,parseInt(children)||0);
      const mNet=(mAnnual-newExp-mt)*yrs;
      const mVal=calc.myVal*Math.pow(1+vVar,yrs);
      mcResults.push(mNet+(mVal-calc.myVal));
    }
    mcResults.sort((a,b)=>a-b);
    const mcP10=mcResults[Math.floor(runs*0.1)]||0;
    const mcP50=mcResults[Math.floor(runs*0.5)]||0;
    const mcP90=mcResults[Math.floor(runs*0.9)]||0;
    const mcPositive=mcResults.filter(r=>r>0).length/runs*100;
    const peakMap:{[k:string]:string}={
      pre1960:'Ιδανικό για πώληση ΤΩΡΑ — παλαιό κτήριο σε plateau, αξία καθορίζεται από οικόπεδο',
      '60s70s':'Αξία σε plateau — πουλήστε αν η τοποθεσία είναι prime, αλλιώς μετά από ανακαίνιση',
      '80s':'Ανακαίνιση αυξάνει αξία 15-25%. Ιδανικό timing: 2-3 χρόνια μετά ανακαίνιση',
      '90s':'Ακόμα σε άνοδο. Κρατήστε 5-7 χρόνια ή ανακαινίστε και πουλήστε',
      '2000s':'Καλό timing. Αξία σε σταθερή άνοδο για 10+ χρόνια ακόμα',
      '2010s':'Νέο — κρατήστε 15-20 χρόνια για μέγιστη απόδοση',
      modern:'Νεόδμητο — κρατήστε 20-30 χρόνια. Πώληση τώρα δεν συμφέρει',
    };
    return{newRent,newAnnual,newNet,futVal,rentTotal,capGain,total,sellNow,sellFuture,auctionVal,cagr,irr,
      mcP10,mcP50,mcP90,mcPositive,peakAdvice:peakMap[constructionType]||'Αναλύστε τοπική αγορά'};
  },[sc2,calc,electronic,ownerAge,children,constructionType]);

  const leaseColor={ok:'var(--positive)',warning:'var(--warning)',critical:'var(--negative)',expired:'var(--negative)',unknown:'var(--text-tertiary)'}[calc.leaseStatus];

  const TABS=[
    {id:'overview',label:'📊 Overview'},
    {id:'tax',label:'🧾 Φορολογία'},
    {id:'airbnb',label:'🛎 Airbnb'},
    {id:'loan',label:'🏦 Δάνειο'},
    {id:'scenario',label:'🔮 Σενάρια'},
  ] as const;

  return(
    <div style={{fontFamily:'Inter,sans-serif',color:'var(--text-primary)'}}>

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'16px',flexWrap:'wrap',gap:'10px'}}>
        <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
          <div style={{fontSize:'13px',fontWeight:600,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.1em'}}>Αποδόσεις & ROI</div>
          <RentROIReport propertyName="Ακίνητό μου" propertyAddress="" propertyType={propType} calc={calc} scen={scen} bench={bench} ownerAge={ownerAge} constructionType={constructionType} floor={floor} electronic={electronic}/>
        </div>
        <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
          <div style={{minWidth:'200px'}}><CustomSelect label="" value={propType} onChange={setPropType} options={PROPERTY_TYPES}/></div>
          <div style={{minWidth:'170px'}}><CustomSelect label="" value={constructionType} onChange={setConstructionType} options={CONSTRUCTION_TYPES}/></div>
          <div style={{minWidth:'150px'}}><CustomSelect label="" value={floor} onChange={setFloor} options={FLOORS}/></div>
        </div>
      </div>

      {/* Lease Banner */}
      {cfg.lease_end&&(
        <div style={{background:`${leaseColor}12`,border:`1px solid ${leaseColor}`,borderRadius:'10px',padding:'10px 16px',marginBottom:'16px',display:'flex',alignItems:'center',gap:'12px'}}>
          <span style={{fontSize:'18px'}}>{calc.leaseStatus==='ok'?'✅':calc.leaseStatus==='warning'?'⏰':'🚨'}</span>
          <span style={{fontSize:'12px',fontWeight:600,color:leaseColor}}>
            {calc.leaseStatus==='ok'&&`Μισθωτήριο ενεργό — λήγει σε ${calc.days} ημέρες`}
            {calc.leaseStatus==='warning'&&`⚠️ Λήγει σε ${calc.days} ημέρες — ανανέωση σύντομα`}
            {calc.leaseStatus==='critical'&&`🚨 Λήγει σε ${calc.days} ημέρες — άμεση ενέργεια!`}
            {calc.leaseStatus==='expired'&&`Το μισθωτήριο έχει λήξει πριν ${Math.abs(calc.days!)} ημέρες`}
            {cfg.tenant_name&&<span style={{fontWeight:400,color:'var(--text-secondary)',marginLeft:'8px'}}>— {cfg.tenant_name}</span>}
          </span>
        </div>
      )}

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'10px',marginBottom:'16px'}}>
        <KPI icon="📈" label="Μεικτή Απόδοση" value={fp(calc.grossYield)} color={calc.grossYield>=5?'var(--positive)':calc.grossYield>=3?'var(--warning)':'var(--negative)'} badge={calc.grossYield>=5?{text:'✓ ΚΑΛΟ',color:'var(--positive)'}:undefined}/>
        <KPI icon="💰" label="Καθαρή Απόδοση" value={fp(calc.netYield)} color={calc.netYield>=3?'var(--positive)':calc.netYield>=1.5?'var(--warning)':'var(--negative)'}/>
        <KPI icon="🏠" label="Κεφαλαιακή Απόδοση" value={fp(calc.capRate)} color="var(--accent)"/>
        <KPI icon="⏳" label="Περίοδος Απόσβεσης" value={calc.payback>0?`${calc.payback.toFixed(1)} χρ`:'—'} color="var(--info)"/>
        <KPI icon="💵" label="Καθαρό / Μήνα" value={fe(calc.afterTax/12)} color={calc.afterTax>0?'var(--positive)':'var(--negative)'}/>
      </div>

      {/* Gauges */}
      <div style={{...card,display:'flex',justifyContent:'space-around',padding:'16px',flexWrap:'wrap',gap:'8px'}}>
        <Gauge value={calc.grossYield} max={12} label="Μεικτή Απόδοση" color="var(--accent)"/>
        <Gauge value={calc.netYield} max={8} label="Καθαρή Απόδοση" color="var(--positive)"/>
        <Gauge value={calc.capRate} max={10} label="Κεφαλαιακή Απόδοση" color="var(--info)"/>
        <Gauge value={Math.min(calc.occRate,100)} max={100} label="Πληρότητα" color="var(--warning)"/>
        {calc.DSCR>0&&<Gauge value={Math.min(calc.DSCR*50,100)} max={100} label={`Κάλυψη Δανείου ${calc.DSCR.toFixed(2)}x`} color={calc.DSCR>=1.25?'var(--positive)':calc.DSCR>=1?'var(--warning)':'var(--negative)'}/>}
        {/* Score */}
        <div style={{textAlign:'center',minWidth:'100px'}}>
          <div style={{fontSize:'28px',fontWeight:700,color:calc.scoreColor,fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{calc.totalScore}</div>
          <div style={{fontSize:'11px',fontWeight:600,color:calc.scoreColor,marginBottom:'2px'}}>{calc.scoreLabel}</div>
          <div style={{fontSize:'8px',color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.08em'}}>Βαθμολογία /100</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:'4px',background:'var(--bg-elevated)',borderRadius:'10px',padding:'4px',marginBottom:'16px'}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id as any)}
            style={{flex:1,padding:'8px 4px',borderRadius:'7px',border:'none',cursor:'pointer',fontSize:'11px',fontWeight:600,fontFamily:'Inter,sans-serif',whiteSpace:'nowrap',
              background:activeTab===t.id?'var(--accent)':'transparent',
              color:activeTab===t.id?'var(--bg-base)':'var(--text-secondary)',transition:'all 0.2s'}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ OVERVIEW ══ */}
      {activeTab==='overview'&&(<>
        <div style={card}>
          <SH label="Στοιχεία Μίσθωσης" icon="📋"/>
          <div style={g4}>
            <NumberInput label="Στόχος Ενοικίου €/μήνα" value={cfg.target_rent} onChange={v=>sc('target_rent',v)} suffix="€" step={10}/>
            <NumberInput label="Πραγματικό Ενοίκιο €/μήνα" value={cfg.actual_rent} onChange={v=>sc('actual_rent',v)} suffix="€" step={10}/>
            <NumberInput label="Εγγύηση" value={cfg.deposit} onChange={v=>sc('deposit',v)} suffix="€" step={50}/>
            <NumberInput label="Προμήθεια Διαχείρισης %" value={cfg.management_fee_pct} onChange={v=>sc('management_fee_pct',v)} suffix="%" step={0.5}/>
          </div>
          <div style={g4}>
            <TextInput label="Ενοικιαστής" value={cfg.tenant_name} onChange={v=>sc('tenant_name',v)} placeholder="Ονοματεπώνυμο"/>
            <DatePicker label="Έναρξη Μίσθωσης" value={cfg.lease_start} onChange={v=>sc('lease_start',v)}/>
            <DatePicker label="Λήξη Μίσθωσης" value={cfg.lease_end} onChange={v=>sc('lease_end',v)}/>
            <NumberInput label="Ποινή Πρόωρης Αποχώρησης (μήνες)" value={sc2.penalty_months} onChange={v=>ss('penalty_months',v)} suffix="μήν"/>
          </div>
          <div style={g4}>
            <NumberInput label="Ετήσια Ασφάλεια Κατοικίας" value={cfg.insurance_annual} onChange={v=>sc('insurance_annual',v)} suffix="€" step={50}/>
            <NumberInput label="Αποθεματικό Συντήρησης/έτος" value={cfg.maintenance_reserve} onChange={v=>sc('maintenance_reserve',v)} suffix="€" step={100}/>
            <NumberInput label="ΕΝΦΙΑ/έτος" value={cfg.enfia_annual} onChange={v=>sc('enfia_annual',v)} suffix="€" step={10}/>
            <NumberInput label="Εμπορική Αξία" value={cfg.commercial_value} onChange={v=>sc('commercial_value',v)} suffix="€" step={1000}/>
          </div>
          <div style={g2}>
            <NumberInput label="Αντικειμενική Αξία" value={cfg.objective_value} onChange={v=>sc('objective_value',v)} suffix="€" step={1000}/>
            <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
              <div style={{display:'flex',gap:'16px',alignItems:'center',flexWrap:'wrap'}}>
                <Toggle on={electronic} onChange={setElectronic} label="Ηλεκτρονική Πληρωμή" labelOff="Μετρητά"/>
                {electronic&&calc.electronicSaving>0&&<span style={{fontSize:'11px',color:'var(--positive)',fontWeight:600}}>εξοικονόμηση {fe(calc.electronicSaving)}/έτος</span>}
              </div>
              <div style={{display:'flex',gap:'16px',alignItems:'center',flexWrap:'wrap'}}>
                <Toggle on={cfg.is_insured} onChange={v=>sc('is_insured',v)} label="Ασφαλισμένο" labelOff="Ανασφάλιστο"/>
                {cfg.is_insured&&<Toggle on={cfg.insurance_covers_disasters} onChange={v=>sc('insurance_covers_disasters',v)} label="Καλύπτει Φυσικές Καταστροφές" labelOff="Χωρίς κάλυψη"/>}
              </div>
            </div>
          </div>
          {cfg.is_insured&&cfg.insurance_covers_disasters&&<InfoBox type="success">✅ <strong>Μείωση ΕΝΦΙΑ {(parseFloat(cfg.objective_value)||0)<=500000?'20%':'10%'}:</strong> Εξοικονομείς {fe(calc.enfiaRed)}/έτος — Α.1005/2026. Αίτηση: myAADE.gov.gr → myPROPERTY.</InfoBox>}
          {calc.gap>0&&<InfoBox type="warning">⚠️ Το ενοίκιο είναι <strong>{fe(calc.gap)}/μήνα</strong> κάτω από τον στόχο ({fp(calc.occRate,0)} πληρότητα).</InfoBox>}
          <div style={{display:'flex',justifyContent:'flex-end'}}>
            <button onClick={saveConfig} disabled={saving} style={{background:'var(--accent)',color:'var(--bg-base)',border:'none',borderRadius:'8px',padding:'9px 20px',fontSize:'12px',fontWeight:700,cursor:'pointer',opacity:saving?0.7:1}}>
              {savedOk==='config'?'✓ Αποθηκεύτηκε':saving?'Αποθήκευση...':'Αποθήκευση'}
            </button>
          </div>
        </div>

        {/* P&L */}
        <div style={card}>
          <SH label="Ετήσια Κατάσταση Αποτελεσμάτων Χρήσης (P&L)" icon="📊"/>
          <Row label="Ακαθάριστο Ενοίκιο" value={fe(calc.annual)} color="var(--positive)"/>
          {calc.reduction>0&&<Row label="Έκπτωση Ηλεκτρονικής Πληρωμής (-5%)" value={`-${fe(calc.reduction)}`} color="var(--info)"/>}
          <Row label="Δαπάνες Ακινήτου (σύνολο)" value={`-${fe(calc.totalExp)}`} color="var(--warning)"/>
          {calc.mgmt>0&&<Row label="   ↳ Προμήθεια Διαχείρισης" value={`-${fe(calc.mgmt)}`} color="var(--text-tertiary)"/>}
          {calc.ins>0&&<Row label="   ↳ Ασφάλεια" value={`-${fe(calc.ins)}`} color="var(--text-tertiary)"/>}
          {calc.maint>0&&<Row label="   ↳ Αποθεματικό Συντήρησης" value={`-${fe(calc.maint)}`} color="var(--text-tertiary)"/>}
          {calc.enfiaFinal>0&&<Row label="   ↳ ΕΝΦΙΑ (μετά έκπτωση)" value={`-${fe(calc.enfiaFinal)}`} color="var(--text-tertiary)"/>}
          {expenses>0&&<Row label="   ↳ Λοιπές Δαπάνες" value={`-${fe(expenses)}`} color="var(--text-tertiary)"/>}
          <Row label="Καθαρό Εισόδημα (προ φόρου)" value={fe(calc.netIncome)} color="var(--accent)" bold/>
          <Row label="Φόρος Εισοδήματος" value={`-${fe(calc.tax)}`} color="var(--negative)"/>
          <Row label="Αποσβέσεις Κτηρίου/έτος" value={`-${fe(calc.depB)}`} color="var(--text-tertiary)"/>
          <Row label="Αποσβέσεις Εξοπλισμού/έτος" value={`-${fe(calc.depE)}`} color="var(--text-tertiary)"/>
          <Row label="Καθαρό Εισόδημα (μετά φόρου)" value={fe(calc.afterTax)} color={calc.afterTax>=0?'var(--positive)':'var(--negative)'} bold/>
          <Row label="Καθαρό / Μήνα" value={fe(calc.afterTax/12)} color={calc.afterTax>=0?'var(--positive)':'var(--negative)'} bold/>
        </div>

        {/* Score Card */}
        <div style={card}>
          <SH label="Βαθμολογία Ακινήτου" icon="⭐"/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px'}}>
            <div>
              <div style={{textAlign:'center',padding:'20px 0',borderRight:'1px solid var(--border-subtle)'}}>
                <div style={{fontSize:'56px',fontWeight:700,color:calc.scoreColor,fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{calc.totalScore}</div>
                <div style={{fontSize:'14px',fontWeight:700,color:calc.scoreColor,marginBottom:'4px'}}>{calc.scoreLabel}</div>
                <div style={{fontSize:'10px',color:'var(--text-secondary)'}}>συνολική βαθμολογία / 100</div>
              </div>
            </div>
            <div style={{paddingTop:'8px'}}>
              <ScoreBar label="Απόδοση (Yield)" score={calc.yieldScore} max={40} color="var(--accent)"/>
              <ScoreBar label="Μίσθωση & Πληρότητα" score={calc.locationScore} max={20} color="var(--info)"/>
              <ScoreBar label="Ταμειακή Ροή" score={calc.finScore} max={20} color="var(--positive)"/>
              <ScoreBar label="Μόχλευση (LTV)" score={calc.ltvScore} max={20} color="var(--warning)"/>
            </div>
          </div>
        </div>

        {/* Benchmarks */}
        <div style={card}>
          <SH label="Σύγκριση με Αγορά" icon="🎯"/>
          <div style={g4}>
            <CustomSelect label="Αγορά Αναφοράς" value={bench.market_label} onChange={v=>sb('market_label',v)} options={GREEK_MARKETS}/>
            <NumberInput label="Benchmark Gross Yield %" value={bench.market_gross} onChange={v=>sb('market_gross',v)} suffix="%" step={0.5}/>
            <NumberInput label="Στόχος Net Yield %" value={bench.target_net} onChange={v=>sb('target_net',v)} suffix="%" step={0.5}/>
            <NumberInput label="EURIBOR 3 Μηνών %" value={bench.euribor} onChange={v=>sb('euribor',v)} suffix="%" step={0.1}/>
          </div>
          <div style={{...g2,marginBottom:'0'}}>
            <NumberInput label="Σύγκριση ETF (π.χ. VUAA — απόδοση %/έτος)" value={bench.etf_return} onChange={v=>sb('etf_return',v)} suffix="%" step={0.5}/>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'12px',marginTop:'14px'}}>
            {[
              {label:`Gross Yield (${bench.market_label.split(' — ')[0]})`,value:fp(calc.grossYield),bench:`Benchmark: ${bench.market_gross}%`,good:calc.grossYield>=parseFloat(bench.market_gross)},
              {label:'Net Yield',value:fp(calc.netYield),bench:`Στόχος: >${bench.target_net}%`,good:calc.netYield>=parseFloat(bench.target_net)},
              {label:'Υπεραπόδοση vs EURIBOR',value:`+${fp(Math.max(calc.netYield-parseFloat(bench.euribor),0))}`,bench:`EURIBOR ${bench.euribor}%`,good:calc.netYield>parseFloat(bench.euribor)},
              {label:`Σύγκριση vs ETF (${bench.etf_return}%/έτος)`,value:calc.netYield>=parseFloat(bench.etf_return)?'Νικά το ETF':'Κάτω από ETF',bench:`Benchmark ${bench.etf_return}%`,good:calc.netYield>=parseFloat(bench.etf_return)},
              {label:'Breakeven Ενοίκιο',value:fe(calc.breakeven),bench:'Ελάχιστο για κερδοφορία',good:calc.ar>=calc.breakeven},
              {label:'Πραγματική Απόδοση (με κόστη απόκτησης)',value:fp(calc.trueYield),bench:`Αγορά: ${bench.market_gross}%`,good:calc.trueYield>=parseFloat(bench.market_gross)},
            ].map((b,i)=>(
              <div key={i} style={{background:'var(--bg-elevated)',borderRadius:'10px',padding:'14px',border:`1px solid ${b.good?'var(--positive)':'var(--warning)'}30`}}>
                <div style={{fontSize:'15px',fontWeight:700,color:b.good?'var(--positive)':'var(--warning)',fontFamily:"'JetBrains Mono',monospace",marginBottom:'4px'}}>{b.value}</div>
                <div style={{fontSize:'10px',fontWeight:600,color:'var(--text-primary)',marginBottom:'2px'}}>{b.label}</div>
                <div style={{fontSize:'9px',color:'var(--text-tertiary)'}}>{b.bench}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Acquisition */}
        <div style={card}>
          <SH label="Κρυφά Κόστη Απόκτησης" icon="💸"/>
          <div style={g3}>
            <NumberInput label="Αμοιβή Μεσίτη %" value={loan.agent_fee_pct} onChange={v=>sl('agent_fee_pct',v)} suffix="%" step={0.5}/>
            <NumberInput label="Φόρος Μεταβίβασης %" value={loan.transfer_tax_pct} onChange={v=>sl('transfer_tax_pct',v)} suffix="%" step={0.5}/>
            <NumberInput label="Συμβολαιογραφικά" value={loan.notary_cost} onChange={v=>sl('notary_cost',v)} suffix="€" step={100}/>
          </div>
          <div style={g4}>
            <KPI label="Αμοιβή Μεσίτη" value={fe(calc.agentFee)} color="var(--warning)"/>
            <KPI label="Φόρος Μεταβίβασης" value={fe(calc.transTax)} color="var(--negative)"/>
            <KPI label="Συμβολαιογραφικά" value={fe(calc.notary)} color="var(--warning)"/>
            <KPI label="Πραγματικό Κόστος Απόκτησης" value={fe(calc.totalAcq)} color="var(--negative)" sub={`Yield: ${fp(calc.trueYield)}`}/>
          </div>
        </div>

        {/* Company */}
        <div style={card}>
          <SH label="Ιδιοκτησία μέσω Εταιρείας" icon="🏢"/>
          <div style={g2}>
            <CustomSelect label="Έδρα / Δομή Ιδιοκτησίας" value={companyHq} onChange={setCompanyHq} options={COMPANY_HQ}/>
            <KPI label="Φορολογικός Συντελεστής" value={fp(calc.compRate,0)} color="var(--info)"/>
          </div>
          {companyHq!=='none'&&(
            <div style={g3}>
              <KPI label="Φόρος Εταιρείας" value={fe(calc.compTax)} color="var(--negative)"/>
              <KPI label="Καθαρό μέσω Εταιρείας" value={fe(calc.afterTaxComp)} color={calc.afterTaxComp>0?'var(--positive)':'var(--negative)'}/>
              <KPI label="Διαφορά vs Φυσικό Πρόσωπο" value={fe(calc.afterTaxComp-calc.afterTax)} color={calc.afterTaxComp>calc.afterTax?'var(--positive)':'var(--negative)'}/>
            </div>
          )}
          {companyHq==='eu'&&<InfoBox type="info">Κύπρος/Βουλγαρία: Συντελεστής ~10%. Απαιτεί πραγματική εγκατάσταση. Συμβουλευτείτε φοροτεχνικό.</InfoBox>}
          {companyHq==='uae'&&<InfoBox type="info">Ηνωμένα Αραβικά Εμιράτα: Εταιρικός φόρος 9% (Free Zone 0%). Χρειάζεται φορολογική κατοικία. Δεν ισχύει αυτόματα για ακίνητα Ελλάδας.</InfoBox>}
          {companyHq==='greece'&&<InfoBox type="warning">Ελληνική εταιρεία: Συντελεστής 22% + μέρισμα 5% = πραγματικό φορτίο ~26-27%. Συνήθως δεν συμφέρει για 1-2 ακίνητα.</InfoBox>}
          {companyHq==='usa'&&<InfoBox type="info">ΗΠΑ: Ομοσπονδιακός φόρος 21% + πολιτειακός. Σύνθετη δομή — απαιτείται Αμερικανός λογιστής.</InfoBox>}
          <InfoBox type="danger">⚠️ Πέραν των 3 ακινήτων σε Airbnb/βραχυχρόνια μίσθωση: Υποχρεωτική εγγραφή επιχείρησης στην ΑΑΔΕ.</InfoBox>
        </div>
        <RentComparables propertyId={propertyId} userId={userId} actualRent={calc.ar}/>
      </>)}

      {/* ══ TAX ══ */}
      {activeTab==='tax'&&(<>
        <div style={card}>
          <SH label="Φορολογικό Προφίλ Ιδιοκτήτη" icon="👤"/>
          <div style={g4}>
            <NumberInput label="Ηλικία Ιδιοκτήτη" value={ownerAge} onChange={setOwnerAge} suffix="ετών" step={1}/>
            <NumberInput label="Εξαρτώμενα Τέκνα" value={children} onChange={setChildren} suffix="τέκνα" step={1}/>
          </div>
          {parseInt(ownerAge)<=25&&<InfoBox type="success">🎉 <strong>Ηλικία ≤25 ετών:</strong> Μηδενικός φόρος έως €20.000 εισόδημα (Φ.Ε. 2026). Εξοικονόμηση έως <strong>{fe(Math.min(calc.taxable,20000)*0.15)}</strong> σε σχέση με κανονική κλίμακα.</InfoBox>}
          {parseInt(ownerAge)>=26&&parseInt(ownerAge)<=30&&<InfoBox type="success">💚 <strong>Ηλικία 26-30 ετών:</strong> Μειωμένος συντελεστής 9% στο bracket €10.000-€20.000 (Φ.Ε. 2026).</InfoBox>}
        </div>
        <div style={card}>
          <SH label="Φορολογική Ανάλυση Ενοικίων — Νόμος 5246/2025" icon="🧾"/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px'}}>
            <div>
              <Row label="Ακαθάριστο Ενοίκιο" value={fe(calc.annual)} color="var(--positive)"/>
              <Row label="Έκπτωση Ηλεκτρονικής Πληρωμής (-5%)" value={electronic?`-${fe(calc.reduction)}`:'—'} color="var(--info)"/>
              <Row label="Φορολογητέο Εισόδημα" value={fe(calc.taxable)} color="var(--warning)"/>
              <Row label="Φόρος" value={fe(calc.tax)} color="var(--negative)"/>
              <Row label="Πραγματικός Φορολογικός Συντελεστής" value={fp(calc.effectiveRate)} color="var(--negative)"/>
              <Row label="Καθαρό μετά φόρου" value={fe(calc.afterTax)} color={calc.afterTax>0?'var(--positive)':'var(--negative)'} bold/>
              {electronic&&calc.electronicSaving>0&&<InfoBox type="success">💡 Ηλεκτρονική πληρωμή: Εξοικονομείς <strong>{fe(calc.electronicSaving)}</strong>/έτος — <strong>{fe(calc.electronicSaving/12)}</strong>/μήνα.</InfoBox>}
            </div>
            <div>
              <div style={{fontSize:'10px',fontWeight:600,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:'12px'}}>Κλίμακα Φορολόγησης 2026</div>
              {[
                {range:'€0 – €12.000',rate:'15%',c:calc.taxable<=12000},
                {range:'€12.001 – €14.000',rate:'25%',c:calc.taxable>12000&&calc.taxable<=14000},
                {range:'€14.001 – €35.000',rate:'35%',c:calc.taxable>14000&&calc.taxable<=35000},
                {range:'Άνω των €35.000',rate:'45%',c:calc.taxable>35000},
              ].map((r,i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 14px',borderRadius:'8px',marginBottom:'6px',
                  background:r.c?'rgba(212,175,66,0.1)':'var(--bg-elevated)',border:r.c?'1px solid var(--accent)':'1px solid transparent'}}>
                  <span style={{fontSize:'11px',color:r.c?'var(--accent)':'var(--text-secondary)'}}>{r.range}</span>
                  <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                    <span style={{fontSize:'13px',fontWeight:700,color:r.c?'var(--accent)':'var(--text-primary)',fontFamily:"'JetBrains Mono',monospace"}}>{r.rate}</span>
                    {r.c&&<span style={{fontSize:'9px',color:'var(--accent)'}}>← εδώ</span>}
                  </div>
                </div>
              ))}
              <div style={{marginTop:'12px',fontSize:'9px',color:'var(--text-tertiary)',padding:'10px',background:'var(--bg-elevated)',borderRadius:'8px'}}>
                ⚠️ Εκτίμηση βάσει Ν.5246/2025. Τα εισοδήματα ενοικίων προστίθενται στο συνολικό εισόδημα. Συμβουλευτείτε λογιστή.
              </div>
            </div>
          </div>
        </div>
        <div style={card}>
          <SH label="ΕΝΦΙΑ 2026 — Εκπτώσεις και Μειώσεις" icon="🏛"/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px'}}>
            <div>
              {[
                'Μείωση 20%: Ασφαλισμένη κατοικία (αξία ≤€500.000) για σεισμό, πυρκαγιά και πλημμύρα',
                'Μείωση 10%: Ασφαλισμένη κατοικία αξία άνω €500.000',
                'Μείωση 50%: Κύρια κατοικία σε οικισμό ≤1.500 κατοίκων (αξία ≤€400.000)',
                'Απαλλαγή 2027: Οικισμοί ≤1.500 κατοίκων (περιορισμένη εφαρμογή)',
              ].map((t,i)=>(
                <div key={i} style={{fontSize:'11px',color:'var(--text-secondary)',marginBottom:'8px',padding:'8px 10px',background:'var(--bg-elevated)',borderRadius:'6px',lineHeight:1.4}}>✅ {t}</div>
              ))}
            </div>
            <div>
              {calc.enfiaRed>0
                ?<InfoBox type="success">💰 Εξοικονομείς <strong>{fe(calc.enfiaRed)}</strong>/έτος. Αίτηση: myAADE.gov.gr → myPROPERTY → "Μείωση ΕΝΦΙΑ Ασφαλισμένων Κατοικιών 2026".</InfoBox>
                :<InfoBox type="warning">Ενεργοποίησε "Ασφαλισμένο" και "Φυσικές Καταστροφές" στην καρτέλα Overview για να υπολογιστεί η μείωση.</InfoBox>}
              <InfoBox type="info">📋 Διαδικασία: myAADE → myPROPERTY → "Μείωση ΕΝΦΙΑ". Αίτηση μία φορά — αυτόματη ανάκτηση από ασφαλιστικές.</InfoBox>
            </div>
          </div>
        </div>
        <div style={card}>
          <SH label="Φορολόγηση Πολλαπλών Ακινήτων" icon="🏘"/>
          <div style={g2}>
            {[
              {title:'2-3 Ακίνητα — Συμβατική Μίσθωση',color:'var(--positive)',text:'Φυσικό πρόσωπο — κανονική φορολογική κλίμακα. Δεν θεωρείται επιχείρηση. Κάθε ενοίκιο προστίθεται στο ατομικό εισόδημα.'},
              {title:'3+ Ακίνητα — Airbnb / Βραχυχρόνια',color:'var(--negative)',text:'Υποχρεωτική εγγραφή επιχείρησης στην ΑΑΔΕ. Φόρος εισοδήματος επιχείρησης 22-29%. Πιθανό ΦΠΑ. Απαιτείται λογιστής.'},
              {title:'Ποινή Πρόωρης Αποχώρησης',color:'var(--warning)',text:`${sc2.penalty_months} μήνες ενοίκιο = ${fe(calc.ar*parseFloat(sc2.penalty_months))}. Αν ο ενοικιαστής φύγει πρόωρα δικαιούσαι εγγύηση (${fe(parseFloat(cfg.deposit)||0)}) και ποινή.`},
              {title:'Βλάβη / Κλοπή / Φθορά',color:'var(--info)',text:'Η εγγύηση καλύπτει φθορές πέραν φυσικής χρήσης. Η ασφάλεια κατοικίας καλύπτει κλοπή και βλάβες. Τεκμηρίωσε με φωτογραφίες πριν και μετά.'},
            ].map((t,i)=>(
              <div key={i} style={{background:'var(--bg-elevated)',borderRadius:'10px',padding:'14px',border:`1px solid ${t.color}30`}}>
                <div style={{fontSize:'11px',fontWeight:700,color:t.color,marginBottom:'8px'}}>{t.title}</div>
                <div style={{fontSize:'11px',color:'var(--text-secondary)',lineHeight:1.5}}>{t.text}</div>
              </div>
            ))}
          </div>
        </div>
      </>)}

      {/* ══ AIRBNB ══ */}
      {activeTab==='airbnb'&&(<>
        <div style={card}>
          <SH label="Airbnb / Βραχυχρόνια Μίσθωση — Υπολογιστής" icon="🛎"/>
          <div style={g3}>
            {[
              {season:'Χαμηλή Σεζόν',aKey:'adr_low',oKey:'occ_low',dKey:'dur_low',uKey:'unit_low',color:'var(--info)'},
              {season:'Μέση Σεζόν',aKey:'adr_mid',oKey:'occ_mid',dKey:'dur_mid',uKey:'unit_mid',color:'var(--warning)'},
              {season:'Υψηλή Σεζόν',aKey:'adr_high',oKey:'occ_high',dKey:'dur_high',uKey:'unit_high',color:'var(--positive)'},
            ].map((s,i)=>(
              <div key={i} style={{background:'var(--bg-elevated)',borderRadius:'10px',padding:'16px',border:`1px solid ${s.color}40`}}>
                <div style={{fontSize:'11px',fontWeight:700,color:s.color,marginBottom:'14px',textTransform:'uppercase',letterSpacing:'0.06em'}}>{s.season}</div>
                <NumberInput label="Μέση Τιμή ανά Νύχτα" value={(airbnb as any)[s.aKey]} onChange={(v:string)=>sa(s.aKey,v)} suffix="€" step={5}/>
                <NumberInput label="Πληρότητα %" value={(airbnb as any)[s.oKey]} onChange={(v:string)=>sa(s.oKey,v)} suffix="%" step={5}/>
                <div style={{marginBottom:'12px'}}>
                  <label style={{fontSize:'9px',letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--text-secondary)',display:'block',marginBottom:'5px'}}>Διάρκεια Σεζόν</label>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px'}}>
                    <input type="number" value={(airbnb as any)[s.dKey]} onChange={e=>sa(s.dKey,e.target.value)} step={0.5}
                      style={{background:'var(--bg-base)',border:'1px solid var(--border-subtle)',borderRadius:'8px',padding:'9px 12px',color:'var(--text-primary)',fontSize:'13px',fontFamily:"'JetBrains Mono',monospace",outline:'none',width:'100%',boxSizing:'border-box'}}/>
                    <CustomSelect label="" value={(airbnb as any)[s.uKey]} onChange={(v:string)=>sa(s.uKey,v)} options={DURATION_UNITS}/>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={g4}>
            <NumberInput label="Προμήθεια Πλατφόρμας %" value={airbnb.platform_fee} onChange={v=>sa('platform_fee',v)} suffix="%" step={1}/>
            <NumberInput label="Κόστος Καθαρισμού" value={airbnb.cleaning_cost} onChange={v=>sa('cleaning_cost',v)} suffix="€" step={5}/>
            <NumberInput label="Καθαρισμός ανά Χ Νύχτες" value={airbnb.cleaning_per_nights} onChange={v=>sa('cleaning_per_nights',v)} suffix="νύχτ" step={1}/>
            <NumberInput label="Αποθεματικό Φθορών/έτος" value={airbnb.damage_reserve} onChange={v=>sa('damage_reserve',v)} suffix="€" step={50}/>
          </div>
        </div>
        <div style={card}>
          <SH label="Επιπλέον Παροχές και Έξοδα" icon="🎁"/>
          <div style={g4}>
            <NumberInput label="Netflix (ετήσιο)" value={airbnb.netflix} onChange={v=>sa('netflix',v)} suffix="€" step={10}/>
            <NumberInput label="Spotify / Άλλες Συνδρομές" value={airbnb.spotify} onChange={v=>sa('spotify',v)} suffix="€" step={5}/>
            <NumberInput label="Welcome Basket (κόστος)" value={airbnb.welcome_basket} onChange={v=>sa('welcome_basket',v)} suffix="€" step={5}/>
            <NumberInput label="Άλλα Έξοδα Υπηρεσιών/έτος" value={airbnb.extra_services} onChange={v=>sa('extra_services',v)} suffix="€" step={50}/>
          </div>
          <div style={g4}>
            <NumberInput label="Ποδήλατα (αριθμός)" value={airbnb.bike_count} onChange={v=>sa('bike_count',v)} suffix="τεμ" step={1}/>
            <NumberInput label="Κόστος Ποδηλάτου ανά τεμάχιο" value={airbnb.bike_cost} onChange={v=>sa('bike_cost',v)} suffix="€" step={10}/>
            <NumberInput label="Συντήρηση Πισίνας/έτος" value={airbnb.pool_maintenance} onChange={v=>sa('pool_maintenance',v)} suffix="€" step={50}/>
            <NumberInput label="Κήπος / Ξεχορτάριασμα/έτος" value={airbnb.garden_maintenance} onChange={v=>sa('garden_maintenance',v)} suffix="€" step={20}/>
          </div>
          <div style={g2}>
            <NumberInput label="Φυτά Μπαλκονιού/έτος" value={airbnb.balcony_plants} onChange={v=>sa('balcony_plants',v)} suffix="€" step={10}/>
          </div>
          {parseInt(airbnb.bike_count)>0&&<InfoBox type="info">🚲 {airbnb.bike_count} ποδήλατα — Ετήσια απόσβεση 3ετίας: <strong>{fe(parseInt(airbnb.bike_count)*(parseFloat(airbnb.bike_cost)||200)/3)}</strong>. Αύξηση τιμής/νύχτα ~5-15% σε περιοχές χωρίς εύκολη μεταφορά.</InfoBox>}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
          <div style={card}>
            <SH label="Αποτελέσματα Airbnb" icon="📊"/>
            <Row label="Ακαθάριστα Έσοδα" value={fe(abb.rev)} color="var(--positive)"/>
            <Row label="Μέση Τιμή ανά Νύχτα (Average Daily Rate)" value={`${fe(abb.adr)}/νύχτα`} color="var(--accent)"/>
            <Row label="Έσοδα ανά Διαθέσιμη Νύχτα (RevPAR)" value={`${fe(abb.revPAR)}/νύχτα`} color="var(--info)"/>
            <Row label="Προμήθεια Πλατφόρμας" value={`-${fe(abb.pCost)}`} color="var(--warning)"/>
            <Row label={`Κόστος Καθαρισμών (${abb.bookings} bookings)`} value={`-${fe(abb.cCost)}`} color="var(--warning)"/>
            <Row label="Δαπάνες Ακινήτου" value={`-${fe(expenses)}`} color="var(--warning)"/>
            <Row label="Επιπλέον Παροχές και Φθορές" value={`-${fe(abb.extras)}`} color="var(--warning)"/>
            <Row label="Καθαρό Εισόδημα Airbnb" value={fe(abb.net)} color={abb.net>0?'var(--positive)':'var(--negative)'} bold/>
            <Row label="Μέση Ετήσια Πληρότητα" value={fp(abb.avgOcc)} color="var(--accent)"/>
          </div>
          <div style={card}>
            <SH label="Airbnb vs Μακροχρόνια Μίσθωση" icon="⚖️"/>
            <div style={{textAlign:'center',padding:'20px 0'}}>
              <div style={{fontSize:'13px',color:'var(--text-secondary)',marginBottom:'8px'}}>Διαφορά καθαρού εισοδήματος / έτος</div>
              <div style={{fontSize:'36px',fontWeight:700,fontFamily:"'JetBrains Mono',monospace",color:abb.diff>0?'var(--positive)':'var(--negative)',marginBottom:'8px'}}>
                {abb.diff>0?'+':''}{fe(abb.diff)}
              </div>
              <div style={{fontSize:'11px',color:'var(--text-secondary)',lineHeight:1.5}}>
                {abb.diff>0?`Το Airbnb αποδίδει ${fe(abb.diff)}/έτος περισσότερο`:`Η μακροχρόνια αποδίδει ${fe(Math.abs(abb.diff))}/έτος περισσότερο`}
              </div>
            </div>
            <div style={g2}>
              <KPI label="Airbnb Καθαρό/έτος" value={fe(abb.net)} color="var(--positive)"/>
              <KPI label="Μακροχρόνια Καθαρό/έτος" value={fe(calc.afterTax)} color="var(--accent)"/>
            </div>
            <InfoBox type="warning">⚠️ Airbnb: Αυξημένος χρόνος διαχείρισης, φθορές, ασταθές εισόδημα, υποχρέωση εγγραφής άνω των 3 ακινήτων. Η μακροχρόνια μίσθωση προσφέρει σταθερότητα.</InfoBox>
          </div>
        </div>
      </>)}

      {/* ══ LOAN ══ */}
      {activeTab==='loan'&&(<>
        <div style={card}>
          <SH label="Στοιχεία Δανείου" icon="🏦"/>
          <div style={g4}>
            <TextInput label="Τράπεζα / Ίδρυμα" value={loan.bank_name} onChange={v=>sl('bank_name',v)} placeholder="π.χ. Alpha Bank"/>
            <CustomSelect label="Τύπος Δανείου" value={loan.loan_type} onChange={v=>sl('loan_type',v)} options={LOAN_TYPES}/>
            <NumberInput label="Αρχικό Κεφάλαιο" value={loan.original_amount} onChange={v=>sl('original_amount',v)} suffix="€" step={1000}/>
            <NumberInput label="Υπόλοιπο Κεφαλαίου" value={loan.remaining_balance} onChange={v=>sl('remaining_balance',v)} suffix="€" step={1000}/>
          </div>
          <div style={g4}>
            <NumberInput label="Επιτόκιο % (ετήσιο)" value={loan.interest_rate} onChange={v=>sl('interest_rate',v)} suffix="%" step={0.1}/>
            <NumberInput label="Μηνιαία Δόση" value={loan.monthly_payment} onChange={v=>sl('monthly_payment',v)} suffix="€" step={10}/>
            <NumberInput label="Διάρκεια (μήνες)" value={loan.loan_term_months} onChange={v=>sl('loan_term_months',v)} suffix="μήν"/>
            <NumberInput label="Μήνες που Πληρώθηκαν" value={loan.paid_months} onChange={v=>sl('paid_months',v)} suffix="μήν"/>
          </div>
          <div style={g2}>
            <DatePicker label="Ημερομηνία Έναρξης" value={loan.start_date} onChange={v=>sl('start_date',v)}/>
            <DatePicker label="Ημερομηνία Λήξης" value={loan.end_date} onChange={v=>sl('end_date',v)}/>
          </div>
          <div style={{marginBottom:'12px'}}>
            <Toggle on={loan.is_fixed_rate} onChange={v=>sl('is_fixed_rate',v)} label="Σταθερό Επιτόκιο" labelOff="Κυμαινόμενο (EURIBOR + spread)"/>
          </div>
          <Textarea label="Σημειώσεις" value={loan.notes} onChange={v=>sl('notes',v)} placeholder="π.χ. EURIBOR 3M + 1.5%, ανατιμολόγηση κάθε 3 μήνες"/>
          <div style={{display:'flex',justifyContent:'flex-end',marginTop:'12px'}}>
            <button onClick={saveLoan} style={{background:'var(--accent)',color:'var(--bg-base)',border:'none',borderRadius:'8px',padding:'9px 20px',fontSize:'12px',fontWeight:700,cursor:'pointer'}}>
              {savedOk==='loan'?'✓ Αποθηκεύτηκε':'Αποθήκευση Δανείου'}
            </button>
          </div>
        </div>

        {/* Early repayment */}
        <div style={card}>
          <SH label="Πρόωρη Αποπληρωμή" icon="💳"/>
          <div style={g2}>
            <NumberInput label="Ποσό Πρόωρης Αποπληρωμής" value={loan.early_repayment} onChange={v=>sl('early_repayment',v)} suffix="€" step={1000}/>
            <KPI label="Εκτιμώμενη Εξοικονόμηση Τόκων" value={calc.interestSaved>0?fe(calc.interestSaved):'—'} color="var(--positive)" sub="Εκτίμηση βάσει υπολοίπου δανείου"/>
          </div>
          <InfoBox type="info">💡 Η πρόωρη αποπληρωμή συμφέρει αν το επιτόκιο δανείου υπερβαίνει την απόδοση εναλλακτικής επένδυσης (ETF, καταθέσεις). Ελέγξτε για πρόωρη εξόφληση στο συμβόλαιο.</InfoBox>
        </div>

        {/* Spiti Mou II */}
        <div style={card}>
          <SH label="Σπίτι Μου ΙΙ — Κρατικό Πρόγραμμα 2026" icon="🇬🇷"/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
            <div>
              {[
                {label:'Ηλικία Δικαιούχων',value:'25 έως 50 ετών'},
                {label:'Μέγιστο Δάνειο',value:'€190.000 (90% της αξίας)'},
                {label:'Μέγιστη Αξία Ακινήτου',value:'€250.000'},
                {label:'Άτοκο Ποσοστό',value:'50% (75% για τριτεκνούχους)'},
                {label:'Καταληκτική Ημ. Αίτησης',value:'31 Μαΐου 2026'},
                {label:'Καταληκτική Ημ. Σύμβασης',value:'31 Αυγούστου 2026'},
                {label:'Συνεργαζόμενες Τράπεζες',value:'Alpha, Εθνική, Πειραιώς, Eurobank κ.ά.'},
              ].map((r,i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border-subtle)',gap:'12px'}}>
                  <span style={{fontSize:'11px',color:'var(--text-secondary)',flexShrink:0}}>{r.label}</span>
                  <span style={{fontSize:'11px',fontWeight:600,color:'var(--text-primary)',textAlign:'right'}}>{r.value}</span>
                </div>
              ))}
            </div>
            <div>
              <InfoBox type="success">💡 <strong>Παράδειγμα:</strong> Δάνειο €162.000 — €81.000 άτοκο. Κανονική δόση ~€750/μήνα. Με Σπίτι Μου ΙΙ: ~€420/μήνα.</InfoBox>
              <InfoBox type="info">📋 <strong>Διαδικασία:</strong> 1) Βεβαίωση Επιλεξιμότητας στο stegasi.gov.gr — 2) Αίτηση σε τράπεζα — 3) Σύμβαση έως 31 Αυγούστου 2026.</InfoBox>
              <InfoBox type="warning">⚠️ Απαραίτητο: Να μην κατέχεις άλλο ακίνητο κατοικίας. Εισοδηματικά κριτήρια ισχύουν.</InfoBox>
            </div>
          </div>
        </div>

        {/* Green loans */}
        <div style={card}>
          <SH label="Πράσινα Δάνεια και Ενεργειακή Αναβάθμιση" icon="🌱"/>
          <div style={g3}>
            <NumberInput label="Δάνειο Ανακαίνισης / Ενεργειακό" value={loan.renovation_loan} onChange={v=>sl('renovation_loan',v)} suffix="€" step={1000}/>
            <NumberInput label="Επιτόκιο %" value={loan.renovation_loan_rate} onChange={v=>sl('renovation_loan_rate',v)} suffix="%" step={0.1}/>
            <NumberInput label="Διάρκεια (μήνες)" value={loan.renovation_loan_months} onChange={v=>sl('renovation_loan_months',v)} suffix="μήν" step={12}/>
          </div>
          <div style={g2}>
            <NumberInput label="Δάνειο Φωτοβολταϊκών / Αντλίας Θερμότητας" value={loan.green_loan} onChange={v=>sl('green_loan',v)} suffix="€" step={500}/>
            <TextInput label="Περιγραφή" value={loan.green_loan_desc} onChange={v=>sl('green_loan_desc',v)} placeholder="π.χ. Φωτοβολταϊκά 5kWp + αντλία θερμότητας"/>
          </div>
          <div style={g3}>
            {[
              {title:'Εξοικονομώ 2.0',text:'Επιδότηση 30-70% για ενεργειακή αναβάθμιση. Αλλαγή λέβητα, μόνωση, κουφώματα. Αξιολόγηση ΠΕΑ πριν και μετά.'},
              {title:'Φωτοβολταϊκά Στέγης',text:'Επιδότηση έως 50%. Αντλία θερμότητας: εξοικονόμηση ~60% στη θέρμανση. Απόσβεση 5-8 χρόνια.'},
              {title:'Ηλιακός Θερμοσίφωνας',text:'Κόστος €800-1.500. Εξοικονόμηση €150-300/έτος. Απόσβεση 4-6 χρόνια. Επιδότηση διαθέσιμη.'},
            ].map((t,i)=>(
              <div key={i} style={{background:'var(--bg-elevated)',borderRadius:'10px',padding:'12px',border:'1px solid rgba(52,217,123,0.3)'}}>
                <div style={{fontSize:'11px',fontWeight:700,color:'var(--positive)',marginBottom:'6px'}}>{t.title}</div>
                <div style={{fontSize:'10px',color:'var(--text-secondary)',lineHeight:1.5}}>{t.text}</div>
              </div>
            ))}
          </div>
        </div>

        {calc.loanBal>0&&(
          <div style={card}>
            <SH label="Ανάλυση Δανείου" icon="📊"/>
            <div style={g4}>
              <KPI label="Κάλυψη Δανείου (DSCR)" value={`${calc.DSCR.toFixed(2)}x`} color={calc.DSCR>=1.25?'var(--positive)':calc.DSCR>=1?'var(--warning)':'var(--negative)'} sub={calc.DSCR>=1.25?'Υγιές':calc.DSCR>=1?'Οριακό':'Κίνδυνος'}/>
              <KPI label="Δάνειο / Αξία (LTV)" value={fp(calc.LTV)} color={calc.LTV<=60?'var(--positive)':calc.LTV<=80?'var(--warning)':'var(--negative)'} sub={`Equity: ${fe(calc.equity)}`}/>
              <KPI label="Ταμειακή Ροή μετά Δάνειο" value={`${fe(calc.cfDebt/12)}/μήνα`} color={calc.cfDebt>0?'var(--positive)':'var(--negative)'}/>
              <KPI label="Κάλυψη Τόκων" value={`${calc.ic.toFixed(2)}x`} color={calc.ic>=2?'var(--positive)':calc.ic>=1?'var(--warning)':'var(--negative)'}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
              <div>
                <Row label="Αξία Ακινήτου" value={fe(calc.myVal)}/>
                <Row label="Υπόλοιπο Δανείου" value={fe(calc.loanBal)} color="var(--negative)"/>
                <Row label="Ίδια Κεφάλαια (Equity)" value={fe(calc.equity)} color="var(--positive)" bold/>
                <Row label="Ετήσια Εξυπηρέτηση Δανείου" value={fe(calc.annualDebt)} color="var(--warning)"/>
                <Row label="Ταμειακή Ροή μετά Δάνειο / έτος" value={fe(calc.cfDebt)} color={calc.cfDebt>0?'var(--positive)':'var(--negative)'} bold/>
              </div>
              <div>
                <div style={{height:'8px',background:'var(--bg-overlay)',borderRadius:'4px',overflow:'hidden',marginBottom:'6px'}}>
                  <div style={{height:'100%',width:`${Math.min(calc.LTV,100)}%`,background:calc.LTV<=60?'var(--positive)':calc.LTV<=80?'var(--warning)':'var(--negative)',borderRadius:'4px',transition:'width 0.6s'}}/>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'9px',color:'var(--text-tertiary)',marginBottom:'12px'}}>
                  <span>0%</span><span>60% ✓</span><span>80%</span><span>100%</span>
                </div>
                {calc.DSCR<1.25&&<InfoBox type={calc.DSCR<1?'danger':'warning'}>{calc.DSCR<1?'🚨 DSCR κάτω από 1: Το δάνειο δεν καλύπτεται από το ενοίκιο. Άμεση αξιολόγηση.':'⚠️ DSCR 1-1.25: Οριακή κάλυψη. Κενή περίοδος δημιουργεί πρόβλημα.'}</InfoBox>}
                <InfoBox type="info">Τραπεζικά Έξοδα: Εξέταση αιτήματος €0-300, αποτίμηση ακινήτου €200-400, έξοδα σύναψης 0.5-1%. Στο Σπίτι Μου ΙΙ: χωρίς έξοδο εξέτασης.</InfoBox>
              </div>
            </div>
          </div>
        )}

        <div style={card}>
          <SH label="Απόκτηση μέσω Πλειστηριασμού" icon="🔨"/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'12px'}}>
            <div>
              <Row label="Εκτιμώμενη Έκπτωση" value={`-${sc2.auction_discount}%`} color="var(--accent)"/>
              <Row label="Εκτιμώμενη Αξία Πλειστηριασμού" value={fe(calc.myVal*(1-(parseFloat(sc2.auction_discount)||25)/100))} color="var(--accent)"/>
              <Row label="Εξοικονόμηση έναντι Αγοράς" value={fe(calc.myVal*(parseFloat(sc2.auction_discount)||25)/100)} color="var(--positive)"/>
            </div>
            <div>
              <InfoBox type="warning">⚠️ Αγορά χωρίς πλήρη έλεγχο — πιθανά βάρη, υποθήκες, ενοικιαστές, κατάσταση ακινήτου. Απαιτείται δικηγόρος και συμβολαιογράφος.</InfoBox>
              <InfoBox type="info">Πλατφόρμα: eauction.gr. Κατάθεση εγγύησης 30% πριν τη δημοπρασία. Εξόφληση υπολοίπου εντός 1 μήνα.</InfoBox>
            </div>
          </div>
          <NumberInput label="Εκτιμώμενη Έκπτωση Πλειστηριασμού %" value={sc2.auction_discount} onChange={v=>ss('auction_discount',v)} suffix="%" step={5}/>
        </div>
      </>)}

      {/* ══ SCENARIO ══ */}
      {activeTab==='scenario'&&(<>
        <div style={card}>
          <SH label="Παράμετροι Σεναρίου — Όλα Επεξεργάσιμα" icon="🔮"/>
          <div style={g4}>
            <NumberInput label="Αύξηση Ενοικίου %" value={sc2.rent_change} onChange={v=>ss('rent_change',v)} suffix="%" step={1}/>
            <NumberInput label="Κενή Περίοδος (μήνες/έτος)" value={sc2.vacancy_months} onChange={v=>ss('vacancy_months',v)} suffix="μήν" step={0.5}/>
            <NumberInput label="Αύξηση Αξίας %/έτος" value={sc2.value_growth} onChange={v=>ss('value_growth',v)} suffix="%" step={0.5}/>
            <NumberInput label="Χρονικός Ορίζοντας (χρόνια)" value={sc2.years} onChange={v=>ss('years',v)} suffix="χρ" step={1}/>
          </div>
          <div style={g4}>
            <NumberInput label="Πληθωρισμός %/έτος" value={sc2.inflation} onChange={v=>ss('inflation',v)} suffix="%" step={0.5}/>
            <NumberInput label="Αύξηση Δαπανών %/έτος" value={sc2.expense_growth} onChange={v=>ss('expense_growth',v)} suffix="%" step={0.5}/>
            <NumberInput label="Αμοιβή Μεσίτη Πώλησης %" value={sc2.sell_agent_pct} onChange={v=>ss('sell_agent_pct',v)} suffix="%" step={0.5}/>
            <NumberInput label="Φόρος Μεταβίβασης Πώλησης %" value={sc2.sell_tax_pct} onChange={v=>ss('sell_tax_pct',v)} suffix="%" step={0.5}/>
          </div>
          <div style={g4}>
            <NumberInput label="Αποθεματικό Ασφαλείας %/έτος" value={sc2.reserve_pct} onChange={v=>ss('reserve_pct',v)} suffix="%" step={1}/>
            <NumberInput label="Απόσβεση Κτηρίου (χρόνια)" value={sc2.building_depreciation_yrs} onChange={v=>ss('building_depreciation_yrs',v)} suffix="χρ" step={1}/>
            <NumberInput label="Απόσβεση Εξοπλισμού (χρόνια)" value={sc2.equipment_depreciation_yrs} onChange={v=>ss('equipment_depreciation_yrs',v)} suffix="χρ" step={1}/>
            <NumberInput label="Έκπτωση Πλειστηριασμού %" value={sc2.auction_discount} onChange={v=>ss('auction_discount',v)} suffix="%" step={5}/>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'16px'}}>
          <div style={card}>
            <SH label="Νέα Εκτίμηση" icon="📈"/>
            <Row label="Νέο Ενοίκιο / Μήνα" value={fe(scen.newRent)} color="var(--positive)"/>
            <Row label="Ετήσιο Εισόδημα (με κενή περίοδο)" value={fe(scen.newAnnual)} color="var(--positive)"/>
            <Row label="Καθαρό μετά φόρου" value={fe(scen.newNet)} color={scen.newNet>0?'var(--positive)':'var(--negative)'}/>
            <Row label={`Αξία ακινήτου σε ${sc2.years} χρόνια`} value={fe(scen.futVal)} color="var(--accent)"/>
            <Row label="Υπεραξία" value={fe(scen.capGain)} color="var(--positive)"/>
            <Row label="Σύνολο Ενοικίων (μετά φόρου)" value={fe(scen.rentTotal)} color="var(--positive)"/>
            <Row label="Συνολική Απόδοση" value={fe(scen.total)} color="var(--positive)" bold/>
            <Row label="CAGR Αξίας Ακινήτου" value={fp(scen.cagr)} color="var(--info)"/>
            <Row label="Εσωτερικό Ποσοστό Απόδοσης (IRR)" value={fp(scen.irr)} color="var(--accent)"/>
          </div>
          <div style={card}>
            <SH label="Τώρα vs Σενάριο" icon="⚖️"/>
            {[
              {label:'Ενοίκιο/μήνα',now:fe(calc.ar),fut:fe(scen.newRent),up:scen.newRent>calc.ar},
              {label:'Καθαρό/έτος',now:fe(calc.afterTax),fut:fe(scen.newNet),up:scen.newNet>calc.afterTax},
              {label:'Αξία',now:fe(calc.myVal),fut:fe(scen.futVal),up:true},
              {label:'Μεικτή Απόδοση',now:fp(calc.grossYield),fut:fp(calc.myVal>0?(scen.newRent*12/calc.myVal)*100:0),up:calc.myVal>0&&(scen.newRent*12/calc.myVal*100)>calc.grossYield},
            ].map((r,i)=>(
              <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px',padding:'10px 0',borderBottom:'1px solid var(--border-subtle)',alignItems:'center'}}>
                <span style={{fontSize:'10px',color:'var(--text-secondary)'}}>{r.label}</span>
                <span style={{fontSize:'11px',color:'var(--text-tertiary)',fontFamily:"'JetBrains Mono',monospace"}}>{r.now}</span>
                <span style={{fontSize:'12px',fontWeight:700,color:r.up?'var(--positive)':'var(--negative)',fontFamily:"'JetBrains Mono',monospace"}}>→ {r.fut}</span>
              </div>
            ))}
            <div style={{marginTop:'16px',background:'var(--bg-elevated)',borderRadius:'10px',padding:'14px'}}>
              <div style={{fontSize:'11px',color:'var(--text-secondary)',marginBottom:'4px'}}>Συνολική Απόδοση σε {sc2.years} χρόνια</div>
              <div style={{fontSize:'26px',fontWeight:700,color:'var(--positive)',fontFamily:"'JetBrains Mono',monospace"}}>{fe(scen.total)}</div>
              <div style={{fontSize:'10px',color:'var(--text-tertiary)'}}>Ενοίκια + Υπεραξία</div>
            </div>
          </div>
        </div>

        {/* Monte Carlo */}
        <div style={card}>
          <SH label="Ανάλυση Πιθανοτήτων (Monte Carlo)" icon="🎲"/>
          <div style={g3}>
            <NumberInput label="Αριθμός Προσομοιώσεων" value={sc2.mc_runs} onChange={v=>ss('mc_runs',v)} suffix="runs" step={100}/>
            <NumberInput label="Μεταβλητότητα Ενοικίου %" value={sc2.mc_rent_std} onChange={v=>ss('mc_rent_std',v)} suffix="%" step={5}/>
            <NumberInput label="Μεταβλητότητα Αξίας %" value={sc2.mc_value_std} onChange={v=>ss('mc_value_std',v)} suffix="%" step={5}/>
          </div>
          <div style={g4}>
            <KPI label="Απαισιόδοξο (10ο εκατοστ.)" value={fe(scen.mcP10)} color="var(--negative)" sub="Κακό σενάριο"/>
            <KPI label="Βασικό (50ο εκατοστ.)" value={fe(scen.mcP50)} color="var(--accent)" sub="Πιθανότερο σενάριο"/>
            <KPI label="Αισιόδοξο (90ο εκατοστ.)" value={fe(scen.mcP90)} color="var(--positive)" sub="Καλό σενάριο"/>
            <KPI label="Πιθανότητα Κέρδους" value={fp(scen.mcPositive,0)} color={scen.mcPositive>=70?'var(--positive)':scen.mcPositive>=50?'var(--warning)':'var(--negative)'} sub={`σε ${sc2.mc_runs} προσομοιώσεις`}/>
          </div>
          <div style={{height:'8px',background:'var(--bg-overlay)',borderRadius:'4px',overflow:'hidden',marginTop:'4px'}}>
            <div style={{height:'100%',width:`${scen.mcPositive}%`,background:scen.mcPositive>=70?'var(--positive)':scen.mcPositive>=50?'var(--warning)':'var(--negative)',borderRadius:'4px',transition:'width 0.8s'}}/>
          </div>
          <InfoBox type="info" >Το Monte Carlo τρέχει {sc2.mc_runs} τυχαίες προσομοιώσεις αλλάζοντας ενοίκιο και αξία ακινήτου εντός της μεταβλητότητας που ορίζεις. Δίνει εικόνα του εύρους πιθανών αποτελεσμάτων.</InfoBox>
        </div>

        {/* Sell vs Hold */}
        <div style={card}>
          <SH label="Ανάλυση Ακινήτου και Βέλτιστος Χρόνος Πώλησης" icon="🏗"/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px'}}>
            <div>
              <div style={{fontSize:'11px',fontWeight:700,color:'var(--accent)',marginBottom:'10px'}}>
                {CONSTRUCTION_TYPES.find(c=>c.value===constructionType)?.label} — {FLOORS.find(f=>f.value===floor)?.label}
              </div>
              <InfoBox type={constructionType==='pre1960'||constructionType==='60s70s'?'warning':'info'}>
                📊 {scen.peakAdvice}
              </InfoBox>
              <div style={{marginTop:'12px'}}>
                {[
                  {label:'Εκτιμώμενος Ορίζοντας Κορύφωσης',value:`${calc.peakY} χρόνια από κατασκευή`},
                  {label:'Premium Ορόφου (εκτίμηση)',value:`+${calc.floorBonus.toFixed(1)}%`},
                  {label:'Εμπορική Αξία',value:fe(calc.commVal)},
                  {label:'Αντικειμενική Αξία',value:fe(calc.objVal)},
                  {label:'Διαφορά Εμπορική / Αντικειμενική',value:calc.objVal>0?fp((calc.commVal/calc.objVal-1)*100):'—'},
                ].map((r,i)=><Row key={i} label={r.label} value={r.value} color="var(--accent)"/>)}
              </div>
            </div>
            <div>
              <div style={{background:'rgba(239,68,68,0.06)',border:'1px solid var(--negative)',borderRadius:'10px',padding:'16px',marginBottom:'12px'}}>
                <div style={{fontSize:'12px',fontWeight:700,color:'var(--negative)',marginBottom:'10px'}}>Πώληση Τώρα</div>
                <Row label="Αξία Πώλησης" value={fe(calc.myVal)}/>
                <Row label={`Αμοιβή Μεσίτη (${sc2.sell_agent_pct}%)`} value={`-${fe(calc.myVal*(parseFloat(sc2.sell_agent_pct)/100))}`} color="var(--negative)"/>
                <Row label={`Φόρος Μεταβίβασης (${sc2.sell_tax_pct}%)`} value={`-${fe(calc.myVal*(parseFloat(sc2.sell_tax_pct)/100))}`} color="var(--negative)"/>
                <Row label="Καθαρά Χρήματα" value={fe(scen.sellNow)} color="var(--warning)" bold/>
              </div>
              <div style={{background:'rgba(52,217,123,0.06)',border:'1px solid var(--positive)',borderRadius:'10px',padding:'16px'}}>
                <div style={{fontSize:'12px',fontWeight:700,color:'var(--positive)',marginBottom:'10px'}}>Κράτα {sc2.years} Χρόνια</div>
                <Row label="Ενοίκια (καθαρά)" value={fe(scen.rentTotal)} color="var(--positive)"/>
                <Row label={`Αξία σε ${sc2.years} χρόνια`} value={fe(scen.futVal)} color="var(--positive)"/>
                <Row label="Καθαρά από Πώληση" value={fe(scen.sellFuture)} color="var(--positive)"/>
                <Row label="Συνολική Απόδοση" value={fe(scen.total)} color="var(--positive)" bold/>
              </div>
            </div>
          </div>
        </div>
      </>)}
    </div>
  );
}