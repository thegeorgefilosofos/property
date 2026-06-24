'use client';

import { useState, useMemo, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { NumberInput, CustomSelect, TextInput, Toggle, DatePicker } from './UIComponents';
import { useBillsSettings } from './BillsSettings';

const MONTHS_GR = ['Ιαν','Φεβ','Μαρ','Απρ','Μαΐ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
const fe = (n: number, d = 2) => `${n.toLocaleString('el-GR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`;
const T = { font: { sans: "Inter,'Google Sans',sans-serif", mono: "'JetBrains Mono',monospace" } };
const FREQ = [
  { value: 'weekly',   label: 'Εβδομαδιαίος'  },
  { value: 'biweekly', label: 'Δεκαπενθήμερος'},
  { value: 'monthly',  label: 'Μηνιαίος'       },
  { value: 'seasonal', label: 'Εποχικός'        },
  { value: 'annual',   label: 'Ετήσιος'         },
];
const toMonthly = (cost: string, freq: string) => {
  const c = parseFloat(cost) || 0;
  const m: Record<string,number> = { weekly:4.33, biweekly:2, monthly:1, seasonal:1/3, annual:1/12 };
  return c * (m[freq] || 1);
};

const ZONE_TAX: Record<string,number> = {
  'under_500':2.00,'500_750':2.80,'750_1000':3.70,'1000_1250':4.50,
  '1250_1500':6.00,'1500_2000':7.60,'2000_2500':9.20,'2500_3000':11.10,
  '3000_3500':13.00,'3500_4000':14.50,'over_4000':16.00,
};
const ZONE_OPTIONS = [
  { value:'under_500',  label:'Κάτω από 500 €/τ.μ.'  },
  { value:'500_750',    label:'500 – 750 €/τ.μ.'      },
  { value:'750_1000',   label:'750 – 1.000 €/τ.μ.'   },
  { value:'1000_1250',  label:'1.000 – 1.250 €/τ.μ.' },
  { value:'1250_1500',  label:'1.250 – 1.500 €/τ.μ.' },
  { value:'1500_2000',  label:'1.500 – 2.000 €/τ.μ.' },
  { value:'2000_2500',  label:'2.000 – 2.500 €/τ.μ.' },
  { value:'2500_3000',  label:'2.500 – 3.000 €/τ.μ.' },
  { value:'3000_3500',  label:'3.000 – 3.500 €/τ.μ.' },
  { value:'3500_4000',  label:'3.500 – 4.000 €/τ.μ.' },
  { value:'over_4000',  label:'Άνω των 4.000 €/τ.μ.' },
];
const FLOOR_COEF: Record<string,number> = { basement:0.90,ground:1.00,first:1.01,second:1.02,third:1.03,fourth:1.04,fifth_plus:1.05 };
const FLOOR_OPTIONS = [
  { value:'basement',   label:'Υπόγειο'    },
  { value:'ground',     label:'Ισόγειο'    },
  { value:'first',      label:'1ος Όροφος' },
  { value:'second',     label:'2ος Όροφος' },
  { value:'third',      label:'3ος Όροφος' },
  { value:'fourth',     label:'4ος Όροφος' },
  { value:'fifth_plus', label:'5ος+ Όροφος'},
];
const AGE_COEF: Record<string,number> = { 'under_5':1.05,'5_10':1.00,'10_20':0.95,'20_25':0.90,'25_30':0.85,'over_30':0.75 };
const AGE_OPTIONS = [
  { value:'under_5',  label:'Κάτω από 5 χρόνια'},
  { value:'5_10',     label:'5–10 χρόνια'       },
  { value:'10_20',    label:'10–20 χρόνια'      },
  { value:'20_25',    label:'20–25 χρόνια'      },
  { value:'25_30',    label:'25–30 χρόνια'      },
  { value:'over_30',  label:'Άνω των 30 χρόνων' },
];
const ENFIA_DEADLINES = [
  { date:'2024-05-31',label:'1η Δόση'},{date:'2024-06-28',label:'2η Δόση'},
  { date:'2024-07-31',label:'3η Δόση'},{date:'2024-08-30',label:'4η Δόση'},
  { date:'2024-09-30',label:'5η Δόση'},{date:'2024-10-31',label:'6η Δόση'},
];
const REDUCTIONS = [
  { key:'main_residence', label:'Κύρια κατοικία (50%)',      pct:50 },
  { key:'three_children', label:'Τρίτεκνοι (25%)',           pct:25 },
  { key:'four_children',  label:'Πολύτεκνοι (50%)',          pct:50 },
  { key:'disability',     label:'Αναπηρία 80%+ (50%)',       pct:50 },
];
const SUPPL_BRACKETS = [
  {limit:100_000,rate:0},{limit:200_000,rate:0.001},{limit:300_000,rate:0.002},
  {limit:400_000,rate:0.005},{limit:500_000,rate:0.010},{limit:600_000,rate:0.015},
  {limit:700_000,rate:0.020},{limit:800_000,rate:0.025},{limit:900_000,rate:0.030},
  {limit:1_000_000,rate:0.033},{limit:Infinity,rate:0.035},
];

function calcENFIA(sqm:number,zone:string,floor:string,age:string,ownership:number,totalVal:number,reductions:string[]) {
  if (!sqm || !zone) return null;
  const basic = sqm*(ZONE_TAX[zone]||0)*(FLOOR_COEF[floor]||1)*(AGE_COEF[age]||1)*(ownership/100);
  let suppl = 0;
  if (totalVal > 100_000) { const b = SUPPL_BRACKETS.find(b => totalVal <= b.limit); if (b) suppl = totalVal * b.rate; }
  const total = basic + suppl;
  const maxRed = Math.max(0, ...reductions.map(r => REDUCTIONS.find(rd => rd.key===r)?.pct||0));
  const redAmt = total*(maxRed/100);
  const final = Math.max(0, total-redAmt);
  return { basic, suppl, total, redAmt, maxRed, final, installment: Math.ceil(final/6) };
}

const DEFAULTS = {
  enfiaAnnual:'', enfiaMonthly:'', enfiaSqm:'', enfiaZone:'', enfiaFloor:'second',
  enfiaAge:'10_20', enfiaOwnership:'100', enfiaTotalVal:'', enfiaReductions:[] as string[], enfiaShowCalc:true,
  dimotikaHistory: Array(12).fill('') as string[], lastBillTotal:'', lastBillDimotika:'',
  hasCleaning:false, cleaningContact:'', cleaningPhone:'', cleaningFreq:'monthly', cleaningCostPerVisit:'', cleaningHours:'', cleaningNotes:'',
  hasGarden:false, gardenContact:'', gardenPhone:'', gardenFreq:'monthly', gardenCost:'', gardenSqm:'', gardenNotes:'',
  hasPool:false, poolContact:'', poolPhone:'', poolWeeklyCost:'', poolChemicals:'', poolSeasonOpen:'', poolSeasonClose:'', poolNotes:'',
  hasAC:false, acContact:'', acPhone:'', acUnits:'1', acServiceCost:'', acLastService:'', acNotes:'',
  hasElevator:false, elevatorCompany:'', elevatorPhone:'', elevatorMonthly:'', elevatorLastInspection:'', elevatorNotes:'',
  hasPest:false, pestContact:'', pestPhone:'', pestCost:'', pestFreq:'annual', pestLastDate:'',
  otherServices:[] as {name:string;contact:string;phone:string;cost:string;freq:string}[],
};

interface Props { propertyId: string; userId?: string; }

export default function BillsServices({ propertyId, userId = '' }: Props) {
  const supabase = createClient();
  const [s, upd, loading] = useBillsSettings(propertyId, userId, 'services', DEFAULTS);

  const card:  React.CSSProperties = { background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:14, padding:20, marginBottom:16 };
  const g2:    React.CSSProperties = { display:'grid', gridTemplateColumns:'1fr 1fr',             gap:12, marginBottom:12 };
  const g3:    React.CSSProperties = { display:'grid', gridTemplateColumns:'1fr 1fr 1fr',         gap:12, marginBottom:12 };
  const g4:    React.CSSProperties = { display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr',     gap:12, marginBottom:12 };

  // ── Cross-tab: ΕΝΦΙΑ status from Checklist ──
  const [enfiaChecklist, setEnfiaChecklist] = useState<{ status: string; daysLeft: number | null } | null>(null);
  useEffect(() => {
    if (!propertyId) return;
    (async () => {
      try {
        const { data } = await supabase.from('checklist_items')
          .select('status,due_date')
          .eq('property_id', propertyId)
          .ilike('description', '%ΕΝΦΙΑ%')
          .order('due_date')
          .limit(1);
        if (data?.[0]) {
          const d = data[0].due_date;
          const days = d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null;
          setEnfiaChecklist({ status: data[0].status, daysLeft: days });
        }
      } catch (_) {}
    })();
  }, [propertyId]);

  const [newName,    setNewName]    = useState('');
  const [newContact, setNewContact] = useState('');
  const [newPhone,   setNewPhone]   = useState('');
  const [newCost,    setNewCost]    = useState('');
  const [newFreq,    setNewFreq]    = useState('monthly');

  const enfiaResult = useMemo(() => calcENFIA(
    parseFloat(s.enfiaSqm)||0, s.enfiaZone, s.enfiaFloor, s.enfiaAge,
    parseFloat(s.enfiaOwnership)||100, parseFloat(s.enfiaTotalVal)||0, s.enfiaReductions
  ), [s.enfiaSqm,s.enfiaZone,s.enfiaFloor,s.enfiaAge,s.enfiaOwnership,s.enfiaTotalVal,s.enfiaReductions]);

  const enfiaM = enfiaResult ? enfiaResult.final/12 : (parseFloat(s.enfiaMonthly)||(parseFloat(s.enfiaAnnual)/12)||0);
  const dimotikaAvg = s.dimotikaHistory.filter((v:string)=>v).length>0
    ? s.dimotikaHistory.reduce((sum:number,v:string)=>sum+(parseFloat(v)||0),0)/s.dimotikaHistory.filter((v:string)=>v).length : 0;
  const dimotikaPct = s.lastBillTotal&&s.lastBillDimotika&&parseFloat(s.lastBillTotal)>0
    ? (parseFloat(s.lastBillDimotika)/parseFloat(s.lastBillTotal))*100 : 0;

  const cleaningM = s.hasCleaning ? toMonthly(s.cleaningCostPerVisit, s.cleaningFreq) : 0;
  const gardenM   = s.hasGarden   ? toMonthly(s.gardenCost, s.gardenFreq)             : 0;
  const poolM     = s.hasPool     ? ((parseFloat(s.poolWeeklyCost)||0)*4.33+(parseFloat(s.poolChemicals)||0)) : 0;
  const acM       = s.hasAC       ? toMonthly(s.acServiceCost, 'annual')               : 0;
  const elevM     = s.hasElevator ? (parseFloat(s.elevatorMonthly)||0)                 : 0;
  const pestM     = s.hasPest     ? toMonthly(s.pestCost, s.pestFreq)                  : 0;
  const otherM    = s.otherServices.reduce((sum:number,o:any)=>sum+toMonthly(o.cost,o.freq), 0);
  const totalServices = enfiaM+dimotikaAvg+cleaningM+gardenM+poolM+acM+elevM+pestM+otherM;

  const today = new Date();
  const currentMonth = today.getMonth();
  const maxH = Math.max(...s.dimotikaHistory.map((v:string)=>parseFloat(v)||0), 1);
  const nextDeadline = ENFIA_DEADLINES.find(d => new Date(d.date) >= today);
  const daysToDeadline = nextDeadline ? Math.ceil((new Date(nextDeadline.date).getTime()-today.getTime())/86400000) : null;

  const toggleReduction = (key: string) => {
    const cur = s.enfiaReductions || [];
    upd({ enfiaReductions: cur.includes(key) ? cur.filter((r:string)=>r!==key) : [...cur, key] });
  };
  const addOther = () => {
    if (!newName||!newCost) return;
    upd({ otherServices:[...s.otherServices,{name:newName,contact:newContact,phone:newPhone,cost:newCost,freq:newFreq}] });
    setNewName(''); setNewContact(''); setNewPhone(''); setNewCost('');
  };
  const delOther = (i: number) => upd({ otherServices: s.otherServices.filter((_:any,j:number)=>j!==i) });
  const updHistory = (i: number, v: string) => { const n=[...s.dimotikaHistory]; n[i]=v; upd({ dimotikaHistory:n }); };

  if (loading) return (
    <div style={{ padding:40, textAlign:'center', color:'var(--text-tertiary)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.1em', fontFamily:T.font.sans }}>Φόρτωση...</div>
  );

  const secHdr = (label: string) => (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14, paddingBottom:8, borderBottom:'1px solid var(--border-subtle)' }}>
      <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)', flexShrink:0 }}/>
      <span style={{ fontSize:10, fontWeight:600, letterSpacing:'0.06em', textTransform:'uppercase' as const, color:'var(--text-secondary)', fontFamily:T.font.sans }}>{label}</span>
    </div>
  );

  return (
    <div style={{ fontFamily:T.font.sans, color:'var(--text-primary)' }}>

      {/* ── KPIs ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
        {[
          { label:'Υπηρεσίες / μήνα',  value:fe(totalServices),           color:'var(--text-primary)' },
          { label:'Υπηρεσίες / έτος',  value:fe(totalServices*12),         color:totalServices>0?'var(--negative)':'var(--text-primary)' },
          { label:'ΕΝΦΙΑ / μήνα',       value:enfiaM>0?fe(enfiaM):'—',     color:'var(--text-primary)' },
          { label:'Δημοτικά / μήνα',   value:dimotikaAvg>0?fe(dimotikaAvg):'—', color:'var(--text-primary)' },
        ].map((k,i) => (
          <div key={i} style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:14, padding:'16px 18px' }}>
            <div style={{ fontSize:10, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8, fontFamily:T.font.sans, fontWeight:600 }}>{k.label}</div>
            <div style={{ fontSize:22, fontWeight:700, color:k.color, fontFamily:T.font.mono }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* ── ΕΝΦΙΑ CALCULATOR ── */}
      <div style={{ ...card, borderTop:'3px solid var(--info)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--info)', flexShrink:0 }}/>
            <span style={{ fontSize:10, fontWeight:600, textTransform:'uppercase' as const, letterSpacing:'0.06em', color:'var(--text-secondary)', fontFamily:T.font.sans }}>ΕΝΦΙΑ 2024 — Υπολογιστής</span>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <span style={{ fontSize:10, color:'var(--warning)', background:'rgba(242,153,0,0.1)', padding:'2px 10px', borderRadius:10, fontFamily:T.font.sans, fontWeight:500, border:'1px solid rgba(242,153,0,0.2)' }}>Εκτίμηση</span>
            <a href="https://www.aade.gr" target="_blank" rel="noopener noreferrer" style={{ fontSize:11, color:'var(--accent)', fontFamily:T.font.sans, fontWeight:600, textDecoration:'none' }}>AADE.gr</a>
            <button onClick={()=>upd({enfiaShowCalc:!s.enfiaShowCalc})} style={{ fontSize:11, color:'var(--text-tertiary)', background:'transparent', border:'1px solid var(--border-subtle)', borderRadius:6, padding:'3px 10px', cursor:'pointer', fontFamily:T.font.sans }}>
              {s.enfiaShowCalc ? 'Απόκρυψη' : 'Εμφάνιση'}
            </button>
          </div>
        </div>

        {/* Cross-tab: ΕΝΦΙΑ from Checklist */}
        {enfiaChecklist && (
          <div style={{ background:enfiaChecklist.status==='done'?'rgba(52,168,83,0.07)':'rgba(26,115,232,0.06)', border:`1px solid ${enfiaChecklist.status==='done'?'rgba(52,168,83,0.25)':'rgba(26,115,232,0.2)'}`, borderRadius:8, padding:'9px 16px', marginBottom:14, display:'flex', alignItems:'center', gap:10, fontSize:12, fontFamily:T.font.sans }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:enfiaChecklist.status==='done'?'var(--positive)':'var(--info)', flexShrink:0 }}/>
            <span style={{ color:enfiaChecklist.status==='done'?'var(--positive)':'var(--text-secondary)', flex:1 }}>
              {enfiaChecklist.status==='done'
                ? 'ΕΝΦΙΑ ολοκληρωμένο στο Checklist'
                : enfiaChecklist.daysLeft!==null&&enfiaChecklist.daysLeft<=30
                  ? `ΕΝΦΙΑ στο Checklist — σε ${enfiaChecklist.daysLeft} ημέρες`
                  : 'ΕΝΦΙΑ εκκρεμεί στο Checklist'}
            </span>
            <span style={{ fontSize:10, color:'var(--text-tertiary)', background:'var(--bg-elevated)', padding:'2px 8px', borderRadius:20, whiteSpace:'nowrap' }}>Checklist</span>
          </div>
        )}

        {/* Deadline alert */}
        {nextDeadline && daysToDeadline !== null && daysToDeadline <= 30 && (
          <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderLeft:`3px solid ${daysToDeadline<=7?'var(--negative)':'var(--warning)'}`, borderRadius:8, padding:'8px 14px', marginBottom:14, fontSize:12, color:daysToDeadline<=7?'var(--negative)':'var(--warning)', fontFamily:T.font.sans, fontWeight:500 }}>
            {nextDeadline.label} ΕΝΦΙΑ — σε {daysToDeadline} ημέρες ({new Date(nextDeadline.date).toLocaleDateString('el-GR')})
          </div>
        )}

        {/* Deadline strip */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:6, marginBottom:16 }}>
          {ENFIA_DEADLINES.map((d,i) => {
            const isPast = new Date(d.date) < today;
            const isNext = d === nextDeadline;
            return (
              <div key={i} style={{ background:isNext?'rgba(212,175,66,0.08)':isPast?'var(--bg-surface)':'var(--bg-elevated)', border:`1px solid ${isNext?'var(--accent)':'var(--border-subtle)'}`, borderRadius:8, padding:'7px 8px', textAlign:'center', opacity:isPast?0.45:1 }}>
                <div style={{ fontSize:10, fontWeight:500, color:isNext?'var(--accent)':'var(--text-secondary)', fontFamily:T.font.sans }}>{d.label}</div>
                <div style={{ fontSize:9, color:'var(--text-tertiary)', fontFamily:T.font.mono, marginTop:2 }}>{new Date(d.date).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit'})}</div>
              </div>
            );
          })}
        </div>

        {s.enfiaShowCalc && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            {/* Left: inputs */}
            <div>
              <div style={g2}>
                <NumberInput label="Εμβαδόν (τ.μ.)" value={s.enfiaSqm} onChange={v=>upd({enfiaSqm:v})} suffix="τ.μ."/>
                <NumberInput label="Ποσοστό Ιδιοκτησίας (%)" value={s.enfiaOwnership} onChange={v=>upd({enfiaOwnership:v})} suffix="%" max={100}/>
              </div>
              <div style={{ marginBottom:12 }}>
                <CustomSelect label="Τιμή Ζώνης (€/τ.μ.)" value={s.enfiaZone} onChange={v=>upd({enfiaZone:v})} options={ZONE_OPTIONS}/>
              </div>
              <div style={g2}>
                <CustomSelect label="Όροφος" value={s.enfiaFloor} onChange={v=>upd({enfiaFloor:v})} options={FLOOR_OPTIONS}/>
                <CustomSelect label="Παλαιότητα" value={s.enfiaAge} onChange={v=>upd({enfiaAge:v})} options={AGE_OPTIONS}/>
              </div>
              <div style={{ marginBottom:14 }}>
                <NumberInput label="Συνολική Αξία Ακινήτων (€) — για Συμπληρωματικό Φόρο" value={s.enfiaTotalVal} onChange={v=>upd({enfiaTotalVal:v})} suffix="€"/>
              </div>
              <div style={{ fontSize:10, fontWeight:600, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8, fontFamily:T.font.sans }}>Μειώσεις</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {REDUCTIONS.map(r => (
                  <div key={r.key} onClick={()=>toggleReduction(r.key)}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:(s.enfiaReductions||[]).includes(r.key)?'rgba(52,168,83,0.08)':'var(--bg-elevated)', border:`1px solid ${(s.enfiaReductions||[]).includes(r.key)?'var(--positive)':'var(--border-subtle)'}`, borderRadius:8, cursor:'pointer' }}>
                    <div style={{ width:16, height:16, borderRadius:3, flexShrink:0, border:`2px solid ${(s.enfiaReductions||[]).includes(r.key)?'var(--positive)':'var(--border-default)'}`, background:(s.enfiaReductions||[]).includes(r.key)?'var(--positive)':'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {(s.enfiaReductions||[]).includes(r.key) && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    <span style={{ fontSize:12, color:'var(--text-primary)', fontFamily:T.font.sans, flex:1 }}>{r.label}</span>
                    <span style={{ fontSize:11, fontWeight:700, color:'var(--positive)', fontFamily:T.font.mono }}>-{r.pct}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: results */}
            <div>
              {enfiaResult && enfiaResult.final > 0 ? (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
                    {[
                      { label:'Τελικός ΕΝΦΙΑ', value:fe(enfiaResult.final), color:'var(--negative)' },
                      { label:'Δόση (~6 δόσεις)', value:fe(enfiaResult.installment), color:'var(--warning)' },
                    ].map((k,i) => (
                      <div key={i} style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:10, padding:'12px 14px' }}>
                        <div style={{ fontSize:10, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6, fontFamily:T.font.sans, fontWeight:600 }}>{k.label}</div>
                        <div style={{ fontSize:18, fontWeight:700, color:k.color, fontFamily:T.font.mono }}>{k.value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:10, padding:14, marginBottom:12 }}>
                    {[
                      { label:'Βασικός Φόρος',        value:enfiaResult.basic,    color:'var(--text-primary)' },
                      { label:'Συμπληρωματικός Φόρος', value:enfiaResult.suppl,   color:'var(--text-primary)' },
                      { label:`Μείωση ${enfiaResult.maxRed}%`, value:-enfiaResult.redAmt, color:'var(--positive)' },
                    ].map((row,i) => (
                      <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 0', borderBottom:'1px solid var(--border-subtle)' }}>
                        <span style={{ fontSize:11, color:'var(--text-secondary)', fontFamily:T.font.sans }}>{row.label}</span>
                        <span style={{ fontSize:12, fontWeight:700, color:row.color, fontFamily:T.font.mono }}>{row.value>0?'+':''}{fe(row.value)}</span>
                      </div>
                    ))}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingTop:10 }}>
                      <span style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', fontFamily:T.font.sans }}>Τελικός ΕΝΦΙΑ</span>
                      <span style={{ fontSize:18, fontWeight:700, color:'var(--negative)', fontFamily:T.font.mono }}>{fe(enfiaResult.final)}</span>
                    </div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6 }}>
                    {ENFIA_DEADLINES.map((d,i) => {
                      const isPast = new Date(d.date) < today;
                      return (
                        <div key={i} style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:8, padding:'8px 10px', opacity:isPast?0.45:1 }}>
                          <div style={{ fontSize:12, fontWeight:700, color:isPast?'var(--positive)':'var(--text-primary)', fontFamily:T.font.mono }}>{fe(enfiaResult.installment)}</div>
                          <div style={{ fontSize:9, color:'var(--text-secondary)', fontFamily:T.font.sans, marginTop:2 }}>{d.label}</div>
                          <div style={{ fontSize:9, color:'var(--text-tertiary)', fontFamily:T.font.mono }}>{new Date(d.date).toLocaleDateString('el-GR',{day:'2-digit',month:'short'})}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop:12, background:'rgba(26,115,232,0.06)', border:'1px solid rgba(26,115,232,0.15)', borderLeft:'3px solid var(--info)', borderRadius:8, padding:'10px 14px' }}>
                    <div style={{ fontSize:11, color:'var(--text-secondary)', fontFamily:T.font.sans, lineHeight:1.6 }}>
                      Ασφάλεια κατοικίας με κάλυψη φυσικών καταστροφών → μείωση ΕΝΦΙΑ 10-20% (Α.1005/2026).
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:10, padding:32, textAlign:'center' as const }}>
                  <div style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans, marginBottom:6 }}>Συμπλήρωσε εμβαδόν + τιμή ζώνης</div>
                  <div style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans }}>Η τιμή ζώνης βρίσκεται στο AADE.gr → Ε9</div>
                  <div style={{ marginTop:16, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, textAlign:'left' as const }}>
                    <NumberInput label="ΕΝΦΙΑ/έτος (χειροκίνητα)" value={s.enfiaAnnual} onChange={v=>upd({enfiaAnnual:v,enfiaMonthly:v?String((parseFloat(v)/12).toFixed(2)):''})} suffix="€" step={50}/>
                    <div style={{ background:'var(--bg-elevated)', borderRadius:8, padding:12, border:'1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize:16, fontWeight:700, color:'var(--info)', fontFamily:T.font.mono }}>{enfiaM>0?fe(enfiaM):'—'}</div>
                      <div style={{ fontSize:9, color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.06em', fontFamily:T.font.sans }}>Μηνιαία αναγωγή</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Δημοτικά Τέλη ── */}
      <div style={card}>
        {secHdr('Δημοτικά Τέλη')}
        <div style={{ background:'var(--bg-elevated)', borderRadius:10, padding:14, marginBottom:14, border:'1px solid var(--border-subtle)' }}>
          <div style={{ fontSize:10, fontWeight:600, color:'var(--text-secondary)', marginBottom:10, fontFamily:T.font.sans }}>Υπολογισμός ποσοστού από τελευταίο λογαριασμό ρεύματος</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto', gap:10, alignItems:'flex-end' }}>
            <NumberInput label="Σύνολο λογαριασμού (€)" value={s.lastBillTotal} onChange={v=>upd({lastBillTotal:v})} suffix="€" step={1}/>
            <NumberInput label="Δημοτικά στον λογαριασμό (€)" value={s.lastBillDimotika} onChange={v=>upd({lastBillDimotika:v})} suffix="€" step={0.5}/>
            <div style={{ background:'var(--bg-surface)', border:`1px solid ${dimotikaPct>0?'var(--accent)':'var(--border-subtle)'}`, borderRadius:10, padding:'12px 14px', textAlign:'center', marginBottom:12, minWidth:80 }}>
              <div style={{ fontSize:18, fontWeight:700, color:'var(--accent)', fontFamily:T.font.mono }}>{dimotikaPct>0?`${dimotikaPct.toFixed(1)}%`:'—'}</div>
              <div style={{ fontSize:9, color:'var(--text-secondary)', textTransform:'uppercase', fontFamily:T.font.sans }}>Ποσοστό</div>
            </div>
          </div>
        </div>
        <div style={{ fontSize:10, fontWeight:600, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10, fontFamily:T.font.sans }}>
          Ιστορικό Δημοτικών / μήνα — Μέσος όρος: {dimotikaAvg>0?fe(dimotikaAvg):'—'}
        </div>
        <div style={{ display:'flex', gap:5, alignItems:'flex-end', height:50, marginBottom:8 }}>
          {MONTHS_GR.map((m,i) => {
            const val = parseFloat(s.dimotikaHistory[i])||0;
            const pct = val/maxH;
            const isCur = i===currentMonth;
            return (
              <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:1 }}>
                {val>0 && <div style={{ fontSize:6, color:'var(--text-tertiary)', fontFamily:T.font.mono }}>{Math.round(val)}</div>}
                <div style={{ width:'100%', height:`${Math.max(pct*40,val>0?3:1)}px`, background:isCur?'var(--accent)':'var(--info)', borderRadius:'3px 3px 0 0', opacity:isCur?1:0.7 }}/>
              </div>
            );
          })}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:6 }}>
          {MONTHS_GR.map((m,i) => (
            <div key={i}>
              <label style={{ fontSize:8, color:'var(--text-secondary)', display:'block', marginBottom:3, textAlign:'center', fontFamily:T.font.sans }}>{m}</label>
              <input type="number" value={s.dimotikaHistory[i]} onChange={e=>updHistory(i,e.target.value)} placeholder="€"
                style={{ width:'100%', background:'var(--bg-elevated)', border:`1px solid ${i===currentMonth?'var(--accent)':'var(--border-subtle)'}`, borderRadius:6, padding:'5px 3px', color:'var(--text-primary)', fontSize:11, fontFamily:T.font.mono, outline:'none', textAlign:'center', boxSizing:'border-box' as const }}/>
            </div>
          ))}
        </div>
      </div>

      {/* ── Καθαρισμός ── */}
      <div style={card}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:s.hasCleaning?16:0, paddingBottom:s.hasCleaning?10:0, borderBottom:s.hasCleaning?'1px solid var(--border-subtle)':'none' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)', flexShrink:0 }}/>
            <span style={{ fontSize:10, fontWeight:600, textTransform:'uppercase' as const, letterSpacing:'0.06em', color:'var(--text-secondary)', fontFamily:T.font.sans }}>Συνεργείο Καθαρισμού</span>
          </div>
          <Toggle on={s.hasCleaning} onChange={v=>upd({hasCleaning:v})} label="Ενεργό" labelOff="Δεν έχω"/>
        </div>
        {s.hasCleaning && (
          <>
            <div style={g4}>
              <TextInput   label="Εταιρεία / Όνομα"         value={s.cleaningContact}      onChange={v=>upd({cleaningContact:v})}      placeholder="π.χ. Καθαρίστρια Μαρία"/>
              <TextInput   label="Τηλέφωνο"                  value={s.cleaningPhone}         onChange={v=>upd({cleaningPhone:v})}         placeholder="69xxxxxxxx"/>
              <CustomSelect label="Συχνότητα"                value={s.cleaningFreq}          onChange={v=>upd({cleaningFreq:v})}          options={FREQ}/>
              <NumberInput label="Κόστος ανά Επίσκεψη (€)"  value={s.cleaningCostPerVisit}  onChange={v=>upd({cleaningCostPerVisit:v})} suffix="€" step={5}/>
            </div>
            <div style={g2}>
              <NumberInput label="Ώρες ανά Επίσκεψη"  value={s.cleaningHours} onChange={v=>upd({cleaningHours:v})} suffix="ω" step={0.5}/>
              <TextInput   label="Σημειώσεις"          value={s.cleaningNotes} onChange={v=>upd({cleaningNotes:v})} placeholder="π.χ. κάθε Τετάρτη"/>
            </div>
            {cleaningM > 0 && (
              <div style={{ background:'var(--bg-elevated)', borderRadius:8, padding:'10px 14px', fontSize:11, color:'var(--text-secondary)', fontFamily:T.font.sans }}>
                Μηνιαίο: <strong style={{ color:'var(--accent)', fontFamily:T.font.mono }}>{fe(cleaningM)}</strong>
                {s.cleaningHours && s.cleaningCostPerVisit && (
                  <span style={{ marginLeft:12 }}>Ωριαίο: <strong style={{ color:'var(--info)', fontFamily:T.font.mono }}>{fe(parseFloat(s.cleaningCostPerVisit)/parseFloat(s.cleaningHours))}/ω</strong></span>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Κηπουρός ── */}
      <div style={card}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:s.hasGarden?16:0, paddingBottom:s.hasGarden?10:0, borderBottom:s.hasGarden?'1px solid var(--border-subtle)':'none' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)', flexShrink:0 }}/>
            <span style={{ fontSize:10, fontWeight:600, textTransform:'uppercase' as const, letterSpacing:'0.06em', color:'var(--text-secondary)', fontFamily:T.font.sans }}>Κηπουρός</span>
          </div>
          <Toggle on={s.hasGarden} onChange={v=>upd({hasGarden:v})} label="Ενεργό" labelOff="Δεν έχω"/>
        </div>
        {s.hasGarden && (
          <div style={g4}>
            <TextInput    label="Κηπουρός / Εταιρεία"       value={s.gardenContact} onChange={v=>upd({gardenContact:v})} placeholder="π.χ. Κηπουρός Νίκος"/>
            <TextInput    label="Τηλέφωνο"                    value={s.gardenPhone}   onChange={v=>upd({gardenPhone:v})}   placeholder="69xxxxxxxx"/>
            <CustomSelect label="Συχνότητα"                   value={s.gardenFreq}    onChange={v=>upd({gardenFreq:v})}    options={FREQ}/>
            <NumberInput  label="Κόστος ανά Επίσκεψη (€)"    value={s.gardenCost}    onChange={v=>upd({gardenCost:v})}   suffix="€" step={10}/>
          </div>
        )}
      </div>

      {/* ── Πισίνα ── */}
      <div style={card}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:s.hasPool?16:0, paddingBottom:s.hasPool?10:0, borderBottom:s.hasPool?'1px solid var(--border-subtle)':'none' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)', flexShrink:0 }}/>
            <span style={{ fontSize:10, fontWeight:600, textTransform:'uppercase' as const, letterSpacing:'0.06em', color:'var(--text-secondary)', fontFamily:T.font.sans }}>Πισίνα</span>
          </div>
          <Toggle on={s.hasPool} onChange={v=>upd({hasPool:v})} label="Ενεργό" labelOff="Δεν έχω"/>
        </div>
        {s.hasPool && (
          <>
            <div style={g4}>
              <TextInput   label="Εταιρεία Συντήρησης"       value={s.poolContact}      onChange={v=>upd({poolContact:v})}      placeholder="Pool Service"/>
              <TextInput   label="Τηλέφωνο"                   value={s.poolPhone}         onChange={v=>upd({poolPhone:v})}         placeholder="69xxxxxxxx"/>
              <NumberInput label="Εβδομαδιαίο Κόστος (€)"    value={s.poolWeeklyCost}    onChange={v=>upd({poolWeeklyCost:v})}   suffix="€" step={5}/>
              <NumberInput label="Χημικά / μήνα (€)"          value={s.poolChemicals}     onChange={v=>upd({poolChemicals:v})}    suffix="€" step={5}/>
            </div>
            <div style={g2}>
              <DatePicker label="Άνοιγμα Σεζόν"   value={s.poolSeasonOpen}  onChange={v=>upd({poolSeasonOpen:v})}/>
              <DatePicker label="Κλείσιμο Σεζόν"  value={s.poolSeasonClose} onChange={v=>upd({poolSeasonClose:v})}/>
            </div>
          </>
        )}
      </div>

      {/* ── Κλιματιστικά ── */}
      <div style={card}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:s.hasAC?16:0, paddingBottom:s.hasAC?10:0, borderBottom:s.hasAC?'1px solid var(--border-subtle)':'none' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)', flexShrink:0 }}/>
            <span style={{ fontSize:10, fontWeight:600, textTransform:'uppercase' as const, letterSpacing:'0.06em', color:'var(--text-secondary)', fontFamily:T.font.sans }}>Συντήρηση Κλιματιστικών</span>
          </div>
          <Toggle on={s.hasAC} onChange={v=>upd({hasAC:v})} label="Ενεργό" labelOff="Δεν έχω"/>
        </div>
        {s.hasAC && (
          <>
            <div style={g4}>
              <TextInput   label="Τεχνικός / Εταιρεία"          value={s.acContact}     onChange={v=>upd({acContact:v})}     placeholder="Τεχνικός Παναγιώτης"/>
              <TextInput   label="Τηλέφωνο"                      value={s.acPhone}        onChange={v=>upd({acPhone:v})}       placeholder="69xxxxxxxx"/>
              <NumberInput label="Αριθμός Κλιματιστικών"         value={s.acUnits}        onChange={v=>upd({acUnits:v})}       suffix="τεμ." step={1}/>
              <NumberInput label="Κόστος Σέρβις ανά Τεμάχιο (€)" value={s.acServiceCost} onChange={v=>upd({acServiceCost:v})} suffix="€" step={10}/>
            </div>
            <div style={g2}>
              <DatePicker label="Τελευταίο Σέρβις" value={s.acLastService} onChange={v=>upd({acLastService:v})}/>
              <TextInput  label="Σημειώσεις"        value={s.acNotes}      onChange={v=>upd({acNotes:v})}      placeholder="π.χ. Κάθε Απρίλιο"/>
            </div>
            {s.acServiceCost && s.acUnits && (
              <div style={{ background:'var(--bg-elevated)', borderRadius:8, padding:'10px 14px', fontSize:11, color:'var(--text-secondary)', fontFamily:T.font.sans }}>
                Ετήσιο σέρβις: <strong style={{ color:'var(--accent)', fontFamily:T.font.mono }}>{fe(parseFloat(s.acServiceCost)*parseInt(s.acUnits))}</strong>
                {' '}— Μηνιαία αναγωγή: <strong style={{ color:'var(--info)', fontFamily:T.font.mono }}>{fe(parseFloat(s.acServiceCost)*parseInt(s.acUnits)/12)}</strong>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Ανελκυστήρας ── */}
      <div style={card}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:s.hasElevator?16:0, paddingBottom:s.hasElevator?10:0, borderBottom:s.hasElevator?'1px solid var(--border-subtle)':'none' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)', flexShrink:0 }}/>
            <span style={{ fontSize:10, fontWeight:600, textTransform:'uppercase' as const, letterSpacing:'0.06em', color:'var(--text-secondary)', fontFamily:T.font.sans }}>Ανελκυστήρας</span>
          </div>
          <Toggle on={s.hasElevator} onChange={v=>upd({hasElevator:v})} label="Ενεργό" labelOff="Δεν έχω"/>
        </div>
        {s.hasElevator && (
          <>
            <div style={g4}>
              <TextInput   label="Εταιρεία Συντήρησης"     value={s.elevatorCompany}          onChange={v=>upd({elevatorCompany:v})}          placeholder="Otis, Schindler, KONE..."/>
              <TextInput   label="Τηλέφωνο"                 value={s.elevatorPhone}             onChange={v=>upd({elevatorPhone:v})}             placeholder="210xxxxxxx"/>
              <NumberInput label="Μηνιαία Συντήρηση (€)"   value={s.elevatorMonthly}           onChange={v=>upd({elevatorMonthly:v})}           suffix="€" step={5}/>
              <DatePicker  label="Τελευταία Επιθεώρηση"    value={s.elevatorLastInspection}    onChange={v=>upd({elevatorLastInspection:v})}/>
            </div>
            <TextInput label="Σημειώσεις" value={s.elevatorNotes} onChange={v=>upd({elevatorNotes:v})} placeholder="π.χ. Ετήσιος έλεγχος ΕΛΟΤ..."/>
          </>
        )}
      </div>

      {/* ── Απεντόμωση ── */}
      <div style={card}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:s.hasPest?16:0, paddingBottom:s.hasPest?10:0, borderBottom:s.hasPest?'1px solid var(--border-subtle)':'none' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)', flexShrink:0 }}/>
            <span style={{ fontSize:10, fontWeight:600, textTransform:'uppercase' as const, letterSpacing:'0.06em', color:'var(--text-secondary)', fontFamily:T.font.sans }}>Απεντόμωση</span>
          </div>
          <Toggle on={s.hasPest} onChange={v=>upd({hasPest:v})} label="Ενεργό" labelOff="Δεν έχω"/>
        </div>
        {s.hasPest && (
          <div style={g4}>
            <TextInput    label="Εταιρεία"                    value={s.pestContact} onChange={v=>upd({pestContact:v})} placeholder="Anticimex, Rentokil..."/>
            <TextInput    label="Τηλέφωνο"                    value={s.pestPhone}   onChange={v=>upd({pestPhone:v})}   placeholder="69xxxxxxxx"/>
            <NumberInput  label="Κόστος ανά Επέμβαση (€)"    value={s.pestCost}    onChange={v=>upd({pestCost:v})}    suffix="€" step={10}/>
            <CustomSelect label="Συχνότητα"                   value={s.pestFreq}    onChange={v=>upd({pestFreq:v})}    options={FREQ}/>
          </div>
        )}
      </div>

      {/* ── Άλλες Υπηρεσίες ── */}
      <div style={card}>
        {secHdr('Άλλες Υπηρεσίες')}
        <div style={{ background:'var(--bg-elevated)', borderRadius:10, padding:14, marginBottom:12, border:'1px solid var(--border-subtle)' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:10 }}>
            <TextInput label="Υπηρεσία"           value={newName}    onChange={setNewName}    placeholder="π.χ. Βαφή, Υδραυλικός..."/>
            <TextInput label="Επαφή / Εταιρεία"  value={newContact} onChange={setNewContact} placeholder="Όνομα ή Εταιρεία"/>
            <TextInput label="Τηλέφωνο"           value={newPhone}   onChange={setNewPhone}   placeholder="69xxxxxxxx"/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto', gap:10, alignItems:'flex-end' }}>
            <NumberInput  label="Κόστος (€)"  value={newCost}  onChange={setNewCost}  suffix="€" step={10}/>
            <CustomSelect label="Συχνότητα"   value={newFreq}  onChange={setNewFreq}  options={FREQ}/>
            <button onClick={addOther} style={{ background:'var(--accent)', color:'#000', border:'none', borderRadius:10, padding:'0 20px', height:38, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:T.font.sans, whiteSpace:'nowrap', marginBottom:12 }}>
              + Προσθήκη
            </button>
          </div>
        </div>
        {s.otherServices.map((o:any, i:number) => (
          <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0', borderBottom:'1px solid var(--border-subtle)' }}>
            <div>
              <span style={{ fontSize:12, fontWeight:600, color:'var(--text-primary)', fontFamily:T.font.sans }}>{o.name}</span>
              {o.contact && <span style={{ fontSize:10, color:'var(--text-tertiary)', marginLeft:8, fontFamily:T.font.sans }}>{o.contact}</span>}
              {o.phone   && <span style={{ fontSize:10, color:'var(--info)', marginLeft:8, fontFamily:T.font.sans }}>{o.phone}</span>}
              <span style={{ fontSize:9, color:'var(--text-tertiary)', marginLeft:8, fontFamily:T.font.sans }}>{FREQ.find(f=>f.value===o.freq)?.label}</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:12, fontWeight:600, color:'var(--accent)', fontFamily:T.font.mono }}>{fe(toMonthly(o.cost,o.freq))}/μήνα</span>
              <button onClick={()=>delOther(i)} style={{ width:24, height:24, borderRadius:6, border:'1px solid var(--border-subtle)', background:'transparent', color:'var(--text-tertiary)', cursor:'pointer', fontSize:12 }}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Σύνοψη ── */}
      {totalServices > 0 && (
        <div style={card}>
          {secHdr('Σύνοψη Υπηρεσιών')}
          {[
            { label:'ΕΝΦΙΑ',                amount:enfiaM      },
            { label:'Δημοτικά (μέσος όρος)',amount:dimotikaAvg },
            { label:'Καθαρισμός',           amount:cleaningM   },
            { label:'Κηπουρός',             amount:gardenM     },
            { label:'Πισίνα',               amount:poolM       },
            { label:'Κλιματιστικά',         amount:acM         },
            { label:'Ανελκυστήρας',         amount:elevM       },
            { label:'Απεντόμωση',           amount:pestM       },
            { label:'Άλλες Υπηρεσίες',      amount:otherM      },
          ].filter(r=>r.amount>0).map((r,i) => (
            <div key={i} style={{ marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ fontSize:11, color:'var(--text-secondary)', fontFamily:T.font.sans }}>{r.label}</span>
                <div>
                  <span style={{ fontSize:12, fontWeight:600, color:'var(--text-primary)', fontFamily:T.font.mono }}>{fe(r.amount)}/μήνα</span>
                  <span style={{ fontSize:10, color:'var(--text-tertiary)', marginLeft:10, fontFamily:T.font.mono }}>{fe(r.amount*12)}/έτος</span>
                </div>
              </div>
              <div style={{ height:4, background:'var(--border-subtle)', borderRadius:2, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${totalServices>0?r.amount/totalServices*100:0}%`, background:'var(--accent)', borderRadius:2 }}/>
              </div>
            </div>
          ))}
          <div style={{ display:'flex', justifyContent:'space-between', padding:'12px 0', borderTop:'2px solid var(--border-subtle)', marginTop:8 }}>
            <span style={{ fontSize:13, fontWeight:700, fontFamily:T.font.sans }}>Σύνολο Υπηρεσιών</span>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:20, fontWeight:700, color:'var(--text-primary)', fontFamily:T.font.mono }}>{fe(totalServices)}/μήνα</div>
              <div style={{ fontSize:12, color:'var(--text-tertiary)', fontFamily:T.font.mono }}>{fe(totalServices*12)}/έτος</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}