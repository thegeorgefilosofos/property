'use client';

import { useState, useMemo } from 'react';
import { NumberInput, CustomSelect, Toggle } from './UIComponents';
import { useBillsSettings } from './BillsSettings';

// ─── ΔΕΗ Ιούνιος 2026 — Πραγματικές τιμές ────────────────────────────────────
// Πηγή: bestenergydeals.gr, 3 Ιουνίου 2026
const LAST_UPDATED = 'Ιούνιος 2026';
const RAAYEY_URL = 'https://energycost.gr/%CF%85%CF%80%CE%BF%CE%BB%CE%BF%CE%B3%CE%B9%CF%83%CE%BC%CF%8C%CF%82-%CF%84%CE%B9%CE%BC%CE%AE%CF%82-%CE%B2%CE%AC%CF%83%CE%B5%CE%B9-%CE%BA%CE%B1%CF%84%CE%B1%CE%BD%CE%AC%CE%BB%CF%89%CF%83%CE%B7%CF%82-2/';

const PROVIDERS = [
  {
    value: 'dei', label: 'ΔΕΗ', color: '#0066cc', url: 'https://www.dei.gr',
    tariffs: [
      // ΠΡΑΣΙΝΑ (κυμαινόμενα)
      { id: 'dei_prasino', name: 'Γ1 Πράσινο', badge: '🟢 ΠΡΑΣΙΝΟ', type: 'variable',
        kwh_day: 0.1440, kwh_night: null, fixed: 5.00, fixed_ebill: 3.50, vat: 6,
        desc: 'Κυμαινόμενο — Ειδικό Οικιακό (Γ1). Απαιτεί e-bill + πάγια εντολή για πάγιο 3.50€.' },
      { id: 'dei_prasino_n', name: 'Γ1Ν Πράσινο Νυχτερινό', badge: '🟢 ΠΡΑΣΙΝΟ', type: 'variable',
        kwh_day: 0.1440, kwh_night: 0.1160, fixed: 5.00, fixed_ebill: 3.50, vat: 6,
        desc: 'Κυμαινόμενο με νυχτερινή ζώνη (23:00-07:00). Ιδανικό για πλυντήρια/θερμοσίφωνα νύχτα.' },
      // ΚΙΤΡΙΝΟ (κυμαινόμενο)
      { id: 'dei_kitrino', name: 'myHome 4All', badge: '🟡 ΚΙΤΡΙΝΟ', type: 'variable',
        kwh_day: 0.1370, kwh_night: null, fixed: 5.00, fixed_ebill: 3.50, vat: 6,
        kwh_tier2: 0.1870, tier2_threshold: 500,
        desc: 'Κυμαινόμενο. 0.137€ για 0-500kWh, 0.187€ για >500kWh. Ευελιξία χωρίς δέσμευση.' },
      // ΜΠΛΕ (σταθερά)
      { id: 'dei_mple_entertwo', name: 'myHome EnterTwo', badge: '🔵 ΜΠΛΕ', type: 'fixed',
        kwh_day: 0.1450, kwh_night: 0.0950, fixed: 5.00, fixed_ebill: 3.50, vat: 6,
        desc: 'Σταθερό 24 μήνες με νυχτερινή ζώνη. Ιδανικό για υψηλή νυχτερινή κατανάλωση.' },
      { id: 'dei_mple_online', name: 'myHome Online', badge: '🔵 ΜΠΛΕ', type: 'fixed',
        kwh_day: 0.1420, kwh_night: null, fixed: 5.00, fixed_ebill: 3.50, vat: 6,
        desc: 'Σταθερό online. Απαιτεί e-bill + πάγια εντολή.' },
      { id: 'dei_maxima', name: 'myHome Maxima', badge: '🔵 ΜΠΛΕ', type: 'fixed',
        kwh_day: 0.1320, kwh_night: null, kwh_tier2: 0.1220, tier2_threshold: 600,
        fixed: 5.00, fixed_ebill: 3.50, vat: 6,
        desc: 'Σταθερό κλιμακωτό. 0.132€ (0-600kWh), 0.122€ (>600kWh). Ιδανικό μεγάλη κατανάλωση.' },
      { id: 'dei_plan', name: 'myHome Plan', badge: '🔵 ΜΠΛΕ', type: 'fixed_monthly',
        flat_monthly: 60.00, fixed: 0, vat: 6,
        desc: 'Flat 60€/μήνα. Ιδανικό για 2.500-4.500 kWh/έτος. Νέο προϊόν Ιουνίου 2026.' },
      { id: 'dei_dynamic', name: 'myHome Dynamic', badge: '⚡ ΔΥΝΑΜΙΚΟ', type: 'dynamic',
        kwh_day: 0, kwh_night: null, fixed: 5.00, vat: 6,
        desc: 'Ωριαία τιμολόγηση χονδρεμπορικής. Απαιτεί έξυπνο μετρητή (smart meter).' },
    ]
  },
  {
    value: 'heron', label: 'Ήρων', color: '#e85d04', url: 'https://www.heron.gr',
    tariffs: [
      { id: 'heron_value_special', name: 'Protergia Οικιακό Value Special', badge: '🟢 ΠΡΑΣΙΝΟ', type: 'variable',
        kwh_day: 0.1642, kwh_night: null, fixed: 7.00, vat: 6,
        desc: 'Κυμαινόμενο. Έκπτωση συνέπειας 7 λεπτά/kWh. Τιμή Ιουνίου 2026.' },
      { id: 'heron_stable', name: 'Ήρων Σταθερό Οικιακό', badge: '🔵 ΜΠΛΕ', type: 'fixed',
        kwh_day: 0.1480, kwh_night: null, fixed: 7.20, vat: 6,
        desc: 'Σταθερό τιμολόγιο. Χωρίς εκπλήξεις στον λογαριασμό.' },
      { id: 'heron_ena', name: 'E.NA (Virtual Net Metering)', badge: '☀️ VNM', type: 'vnm',
        kwh_day: 0.1290, kwh_night: null, fixed: 7.00, vat: 6,
        desc: 'Συμμετοχή σε κοινό φωτοβολταϊκό. Χαμηλότερη τιμή + περιβαλλοντικό όφελος.' },
    ]
  },
  {
    value: 'protergia', label: 'Protergia', color: '#7c3aed', url: 'https://www.protergia.gr',
    tariffs: [
      { id: 'prot_value', name: 'Protergia Value', badge: '🟢 ΠΡΑΣΙΝΟ', type: 'variable',
        kwh_day: 0.1580, kwh_night: null, fixed: 6.80, vat: 6,
        desc: 'Κυμαινόμενο οικιακό.' },
      { id: 'prot_fix', name: 'Protergia Fix', badge: '🔵 ΜΠΛΕ', type: 'fixed',
        kwh_day: 0.1520, kwh_night: null, fixed: 7.00, vat: 6,
        desc: 'Σταθερό 12 μήνες.' },
    ]
  },
  {
    value: 'volterra', label: 'Volterra', color: '#059669', url: 'https://www.volterra.gr',
    tariffs: [
      { id: 'volt_easy', name: 'Volterra Easy', badge: '🟢 ΠΡΑΣΙΝΟ', type: 'variable',
        kwh_day: 0.1610, kwh_night: null, fixed: 6.50, vat: 6,
        desc: 'Κυμαινόμενο.' },
      { id: 'volt_stable', name: 'Volterra Stable', badge: '🔵 ΜΠΛΕ', type: 'fixed',
        kwh_day: 0.1490, kwh_night: null, fixed: 7.00, vat: 6,
        desc: 'Σταθερό 24 μήνες.' },
    ]
  },
  {
    value: 'nrg', label: 'NRG', color: '#dc2626', url: 'https://www.nrg.gr',
    tariffs: [
      { id: 'nrg_now', name: 'NRG Now Οικιακό', badge: '🟢 ΠΡΑΣΙΝΟ', type: 'variable',
        kwh_day: 0.1595, kwh_night: null, fixed: 6.90, vat: 6,
        desc: 'Κυμαινόμενο οικιακό.' },
    ]
  },
  {
    value: 'zenith', label: 'Zenith (ZeniΘ)', color: '#0891b2', url: 'https://www.zenith.gr',
    tariffs: [
      { id: 'zen_start', name: 'Power Home Start', badge: '🟢 ΠΡΑΣΙΝΟ', type: 'variable',
        kwh_day: 0.1595, kwh_night: null, fixed: 6.80, vat: 6,
        desc: 'Κυμαινόμενο.' },
    ]
  },
  {
    value: 'elin', label: 'Elin', color: '#ca8a04', url: 'https://www.elin.gr',
    tariffs: [
      { id: 'elin_home', name: 'Elin Home', badge: '🟢 ΠΡΑΣΙΝΟ', type: 'variable',
        kwh_day: 0.1598, kwh_night: null, fixed: 7.10, vat: 6,
        desc: 'Κυμαινόμενο οικιακό.' },
    ]
  },
];

const ERT = 0.00856;
const ETMEAR = 0.0152;
const MONTHS_GR = ['Ιαν','Φεβ','Μαρ','Απρ','Μαΐ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
const fe = (n:number,d=2)=>`${n.toLocaleString('el-GR',{minimumFractionDigits:d,maximumFractionDigits:d})} €`;
const fk = (n:number)=>`${n.toFixed(4)} €`;

const badgeColor = (badge:string) => {
  if(badge?.includes('ΠΡΑΣΙΝΟ')) return {bg:'rgba(5,150,105,0.12)',color:'#059669',border:'rgba(5,150,105,0.3)'};
  if(badge?.includes('ΚΙΤΡΙΝΟ')) return {bg:'rgba(202,138,4,0.12)',color:'#ca8a04',border:'rgba(202,138,4,0.3)'};
  if(badge?.includes('ΜΠΛΕ')) return {bg:'rgba(37,99,235,0.12)',color:'#2563eb',border:'rgba(37,99,235,0.3)'};
  if(badge?.includes('VNM')) return {bg:'rgba(245,158,11,0.12)',color:'#f59e0b',border:'rgba(245,158,11,0.3)'};
  if(badge?.includes('ΔΥΝΑΜΙΚΟ')) return {bg:'rgba(139,92,246,0.12)',color:'#7c3aed',border:'rgba(139,92,246,0.3)'};
  return {bg:'var(--bg-elevated)',color:'var(--text-secondary)',border:'var(--border-subtle)'};
};

export default function BillsElectricity({propertyId,userId}:{propertyId:string;userId?:string}){
  const card:React.CSSProperties={background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:'12px',padding:'20px',marginBottom:'16px'};
  const g2:React.CSSProperties={display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:'12px'};
  const g3:React.CSSProperties={display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'12px',marginBottom:'12px'};
  const g4:React.CSSProperties={display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:'12px',marginBottom:'12px'};
  const currentMonth=new Date().getMonth();

  const [settings, updateSettings] = useBillsSettings(propertyId, userId||'', 'electricity', {
    provider: 'dei', tariffId: 'dei_prasino', useEbill: true, dimotika: '4.8',
    dimotikaCalcCons: '', dimotikaCalcAmt: '', showCustom: false,
    customKwh: '', customNight: '', customFixed: '',
    kwhHistory: [180,160,140,120,100,120,180,200,160,120,150,170].map(String),
    vnmEnabled: false, vnmCapital: '', vnmKwp: '', vnmSharedPct: '30',
    lastBillAmount: '', lastBillKwh: '',
  });

  const { provider, tariffId, useEbill, dimotika, dimotikaCalcCons, dimotikaCalcAmt,
    showCustom, customKwh, customNight, customFixed, kwhHistory,
    vnmEnabled, vnmCapital, vnmKwp, vnmSharedPct, lastBillAmount, lastBillKwh } = settings;

  const setProvider = (v: string) => updateSettings({ provider: v });
  const setTariffId = (v: string) => updateSettings({ tariffId: v });
  const setUseEbill = (v: boolean) => updateSettings({ useEbill: v });
  const setDimotika = (v: string) => updateSettings({ dimotika: v });
  const setDimotikaCalcCons = (v: string) => updateSettings({ dimotikaCalcCons: v });
  const setDimotikaCalcAmt = (v: string) => updateSettings({ dimotikaCalcAmt: v });
  const setShowCustom = (v: boolean | ((prev: boolean) => boolean)) => updateSettings({ showCustom: typeof v === 'function' ? v(settings.showCustom) : v });
  const setCustomKwh = (v: string) => updateSettings({ customKwh: v });
  const setCustomNight = (v: string) => updateSettings({ customNight: v });
  const setCustomFixed = (v: string) => updateSettings({ customFixed: v });
  const setKwhHistory = (v: string[]) => updateSettings({ kwhHistory: v });
  const setVnmEnabled = (v: boolean | ((prev: boolean) => boolean)) => updateSettings({ vnmEnabled: typeof v === 'function' ? v(settings.vnmEnabled) : v });
  const setVnmCapital = (v: string) => updateSettings({ vnmCapital: v });
  const setVnmKwp = (v: string) => updateSettings({ vnmKwp: v });
  const setVnmSharedPct = (v: string) => updateSettings({ vnmSharedPct: v });
  const setLastBillAmount = (v: string) => updateSettings({ lastBillAmount: v });
  const setLastBillKwh = (v: string) => updateSettings({ lastBillKwh: v });

  const provData=PROVIDERS.find(p=>p.value===provider)!;
  const tariff=(provData?.tariffs.find(t=>t.id===tariffId)||provData?.tariffs[0]) as any;
  const useNight=!!tariff?.kwh_night;

  const calc=useMemo(()=>{
    if(!tariff) return null;
    const kwh_day=parseFloat(customKwh)||tariff.kwh_day||0;
    const kwh_night=parseFloat(customNight)||tariff.kwh_night||0;
    const fixed_base=parseFloat(customFixed)||(useEbill&&tariff.fixed_ebill?tariff.fixed_ebill:tariff.fixed)||0;

    const avgKwh=kwhHistory.filter(k=>k).length>0
      ?kwhHistory.reduce((s,k)=>s+(parseFloat(k)||0),0)/kwhHistory.filter(k=>k).length:150;

    if(tariff.type==='fixed_monthly') return {
      total:tariff.flat_monthly,avgKwh,flat:true,
      predictedBill:tariff.flat_monthly,predictedKwh:Math.round(avgKwh),
      annualCost:tariff.flat_monthly*12,
      consumption:tariff.flat_monthly,ert:0,etmear:0,dimotikaAmt:0,vatAmt:0,fixed:0,
      consumptionPct:100,taxesPct:0,dimotikaPct:0,fixedPct:0,vatPct:0,
      annualKwh:avgKwh*12,
    };

    const dayKwh=useNight?avgKwh*0.65:avgKwh;
    const nightKwh=useNight?avgKwh*0.35:0;
    let consumption=dayKwh*kwh_day+nightKwh*kwh_night;
    if(tariff.tier2_threshold&&tariff.kwh_tier2){
      const t1=Math.min(dayKwh,tariff.tier2_threshold);
      const t2=Math.max(0,dayKwh-tariff.tier2_threshold);
      consumption=t1*kwh_day+t2*tariff.kwh_tier2+nightKwh*kwh_night;
    }
    const ert=avgKwh*ERT;
    const etmear=avgKwh*ETMEAR;
    const dimotikaAmt=consumption*(parseFloat(dimotika)||4.8)/100;
    const subtotal=consumption+ert+etmear+dimotikaAmt+fixed_base;
    const vatAmt=subtotal*(tariff.vat/100);
    const total=subtotal+vatAmt;
    const consumptionPct=total>0?(consumption/total)*100:0;
    const taxesPct=total>0?((ert+etmear)/total)*100:0;
    const dimotikaPct=total>0?(dimotikaAmt/total)*100:0;
    const fixedPct=total>0?(fixed_base/total)*100:0;
    const vatPct=total>0?(vatAmt/total)*100:0;
    const annualKwh=kwhHistory.reduce((s,k)=>s+(parseFloat(k)||0),0);
    const annualCost=total*12;
    const seasonalFactor=[1.1,1.0,0.9,0.8,0.85,1.1,1.4,1.5,1.2,0.9,1.0,1.1][(currentMonth+1)%12];
    const predictedKwh=Math.round(avgKwh*seasonalFactor);
    const predictedBill=total*(predictedKwh/avgKwh);
    const vnmKwpN=parseFloat(vnmKwp)||0;
    const vnmCap=parseFloat(vnmCapital)||0;
    const annualProd=vnmKwpN*1350;
    const yourProd=annualProd*(parseFloat(vnmSharedPct)/100);
    const vnmSaving=yourProd*kwh_day;
    const vnmMonthly=vnmSaving/12;
    const vnmPayback=vnmCap>0&&vnmSaving>0?vnmCap/vnmSaving:0;
    const vnmROI=vnmCap>0?(vnmSaving/vnmCap)*100:0;
    return{total,avgKwh,consumption,ert,etmear,dimotikaAmt,vatAmt,fixed:fixed_base,
      consumptionPct,taxesPct,dimotikaPct,fixedPct,vatPct,
      annualKwh,annualCost,predictedBill,predictedKwh,flat:false,
      vnmMonthly,vnmPayback,vnmROI,yourProd};
  },[tariff,customKwh,customNight,customFixed,useEbill,kwhHistory,dimotika,vnmKwp,vnmCapital,vnmSharedPct,useNight,currentMonth]);

  const maxKwh=Math.max(...kwhHistory.map(k=>parseFloat(k)||0),1);
  const provOptions=PROVIDERS.map(p=>({value:p.value,label:p.label}));
  const tariffOptions=(provData?.tariffs||[]).map(t=>({value:t.id,label:`${(t as any).badge} ${t.name}`}));
  const bc=badgeColor(tariff?.badge||'');

  return(
    <div style={{fontFamily:'Inter,sans-serif'}}>

      {/* ΡΑΑΕΥ Banner */}
      <div style={{background:'rgba(59,130,246,0.06)',border:'1px solid var(--info)',borderRadius:'10px',padding:'12px 16px',marginBottom:'16px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'12px'}}>
        <div>
          <div style={{fontSize:'10px',fontWeight:700,color:'var(--info)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:'2px'}}>Επίσημη Σύγκριση Τιμολογίων</div>
          <div style={{fontSize:'11px',color:'var(--text-secondary)'}}>ΡΑΑΕΥ energycost.gr — Ανεξάρτητη σύγκριση όλων των παρόχων ρεύματος</div>
        </div>
        <a href={RAAYEY_URL} target="_blank" rel="noopener noreferrer"
          style={{background:'var(--info)',color:'#fff',border:'none',borderRadius:'8px',padding:'8px 14px',fontSize:'11px',fontWeight:700,cursor:'pointer',fontFamily:'Inter,sans-serif',textDecoration:'none',whiteSpace:'nowrap'}}>
          Σύγκριση Τώρα →
        </a>
      </div>

      {/* KPIs */}
      {calc&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'16px'}}>
          {[
            {label:'Εκτιμ. Λογαριασμός/μήνα',value:fe(calc.total),color:'var(--accent)'},
            {label:'Μέση Κατανάλωση/μήνα',value:`${calc.avgKwh.toFixed(0)} kWh`,color:'var(--info)'},
            {label:'Ετήσιο Κόστος',value:fe(calc.annualCost),color:'var(--warning)'},
            {label:`Πρόβλεψη ${MONTHS_GR[(currentMonth+1)%12]}`,value:fe(calc.predictedBill),color:calc.predictedBill>calc.total?'var(--negative)':'var(--positive)'},
          ].map((k,i)=>(
            <div key={i} style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:'12px',padding:'14px 16px'}}>
              <div style={{fontSize:'18px',fontWeight:700,color:k.color,fontFamily:"'JetBrains Mono',monospace",marginBottom:'4px'}}>{k.value}</div>
              <div style={{fontSize:'9px',color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.1em'}}>{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Provider & Tariff Selection */}
      <div style={card}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px',paddingBottom:'10px',borderBottom:'1px solid var(--border-subtle)'}}>
          <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
            <span style={{fontSize:'16px'}}>⚡</span>
            <span style={{fontSize:'12px',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.04em'}}>Πάροχος & Τιμολόγιο</span>
          </div>
          <div style={{fontSize:'9px',color:'var(--text-tertiary)'}}>Τελ. ενημέρωση τιμών: {LAST_UPDATED}</div>
        </div>

        <div style={g2}>
          <CustomSelect label="Πάροχος Ρεύματος" value={provider} onChange={v=>{setProvider(v);const p=PROVIDERS.find(x=>x.value===v);if(p)setTariffId(p.tariffs[0].id);}} options={provOptions}/>
          <CustomSelect label="Τιμολόγιο" value={tariffId} onChange={setTariffId} options={tariffOptions}/>
        </div>

        {/* Tariff badge + description */}
        {tariff&&(
          <div style={{background:bc.bg,border:`1px solid ${bc.border}`,borderRadius:'10px',padding:'14px',marginBottom:'14px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'8px'}}>
              <span style={{fontSize:'12px',fontWeight:700,color:bc.color,background:`${bc.bg}`,padding:'3px 10px',borderRadius:'6px',border:`1px solid ${bc.border}`}}>{tariff.badge}</span>
              <span style={{fontSize:'13px',fontWeight:700,color:'var(--text-primary)'}}>{tariff.name}</span>
              <a href={provData.url} target="_blank" rel="noopener noreferrer" style={{fontSize:'10px',color:'var(--accent)',textDecoration:'none',marginLeft:'auto'}}>↗ Επίσημη σελίδα</a>
            </div>
            <div style={{fontSize:'11px',color:'var(--text-secondary)',lineHeight:1.5,marginBottom:'10px'}}>{tariff.desc}</div>
            {tariff.type!=='fixed_monthly'&&tariff.type!=='dynamic'&&(
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px'}}>
                <div>
                  <div style={{fontSize:'14px',fontWeight:700,color:bc.color,fontFamily:"'JetBrains Mono',monospace"}}>{fk(parseFloat(customKwh)||tariff.kwh_day)}</div>
                  <div style={{fontSize:'9px',color:'var(--text-secondary)',textTransform:'uppercase'}}>kWh Ημέρας</div>
                </div>
                {tariff.kwh_night&&(
                  <div>
                    <div style={{fontSize:'14px',fontWeight:700,color:'var(--info)',fontFamily:"'JetBrains Mono',monospace"}}>{fk(parseFloat(customNight)||tariff.kwh_night)}</div>
                    <div style={{fontSize:'9px',color:'var(--text-secondary)',textTransform:'uppercase'}}>kWh Νύχτας</div>
                  </div>
                )}
                {tariff.kwh_tier2&&(
                  <div>
                    <div style={{fontSize:'14px',fontWeight:700,color:'var(--warning)',fontFamily:"'JetBrains Mono',monospace"}}>{fk(tariff.kwh_tier2)}</div>
                    <div style={{fontSize:'9px',color:'var(--text-secondary)',textTransform:'uppercase'}}>kWh &gt;{tariff.tier2_threshold}</div>
                  </div>
                )}
                <div>
                  <div style={{fontSize:'14px',fontWeight:700,color:'var(--text-secondary)',fontFamily:"'JetBrains Mono',monospace"}}>{(parseFloat(customFixed)||(useEbill&&tariff.fixed_ebill?tariff.fixed_ebill:tariff.fixed)||0).toFixed(2)} €</div>
                  <div style={{fontSize:'9px',color:'var(--text-secondary)',textTransform:'uppercase'}}>Πάγιο/μήνα</div>
                </div>
                <div>
                  <div style={{fontSize:'14px',fontWeight:700,color:'var(--text-secondary)',fontFamily:"'JetBrains Mono',monospace"}}>{tariff.vat}%</div>
                  <div style={{fontSize:'9px',color:'var(--text-secondary)',textTransform:'uppercase'}}>ΦΠΑ</div>
                </div>
              </div>
            )}
            {tariff.type==='fixed_monthly'&&(
              <div style={{fontSize:'22px',fontWeight:700,color:bc.color,fontFamily:"'JetBrains Mono',monospace"}}>{tariff.flat_monthly.toFixed(2)} €/μήνα flat</div>
            )}
          </div>
        )}

        <div style={{display:'flex',gap:'20px',flexWrap:'wrap',marginBottom:'12px'}}>
          {tariff?.fixed_ebill&&<Toggle on={useEbill} onChange={setUseEbill} label={`e-bill + Πάγια Εντολή (πάγιο ${tariff.fixed_ebill.toFixed(2)}€)`} labelOff={`Κανονικό Πάγιο (${tariff.fixed?.toFixed(2)}€)`}/>}
        </div>
        {/* Dimotika smart calculator */}
        <div style={{background:'rgba(59,130,246,0.05)',border:'1px solid rgba(59,130,246,0.2)',borderRadius:'10px',padding:'14px',marginBottom:'12px'}}>
          <div style={{fontSize:'10px',fontWeight:600,color:'var(--info)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:'12px'}}>Δημοτικά Τέλη — Ορισμός Ποσοστού</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'12px',alignItems:'flex-end'}}>
            <NumberInput label="Ποσοστό % (αν το γνωρίζεις)" value={dimotika} onChange={setDimotika} suffix="%" step={0.1}/>
            <div>
              <div style={{fontSize:'9px',color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:'6px'}}>Υπολόγισε από λογαριασμό ρεύματος</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px',marginBottom:'6px'}}>
                <NumberInput label="Κατανάλωση λογ/σμού (€)" value={dimotikaCalcCons} onChange={setDimotikaCalcCons} suffix="€" step={1}/>
                <NumberInput label="Δημοτικά Τέλη (€)" value={dimotikaCalcAmt} onChange={setDimotikaCalcAmt} suffix="€" step={0.5}/>
              </div>
              {dimotikaCalcCons&&dimotikaCalcAmt&&parseFloat(dimotikaCalcCons)>0&&(
                <button onClick={()=>setDimotika((parseFloat(dimotikaCalcAmt)/parseFloat(dimotikaCalcCons)*100).toFixed(1))}
                  style={{background:'var(--info)',color:'#fff',border:'none',borderRadius:'6px',padding:'5px 12px',fontSize:'10px',fontWeight:700,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                  → Εφαρμογή {(parseFloat(dimotikaCalcAmt)/parseFloat(dimotikaCalcCons)*100).toFixed(1)}%
                </button>
              )}
            </div>
            <div style={{background:'var(--bg-base)',borderRadius:'8px',padding:'12px',textAlign:'center',border:`1px solid ${dimotika?'var(--info)':'var(--border-subtle)'}`}}>
              <div style={{fontSize:'24px',fontWeight:700,color:'var(--info)',fontFamily:"'JetBrains Mono',monospace"}}>{dimotika||'—'}{dimotika?'%':''}</div>
              <div style={{fontSize:'9px',color:'var(--text-secondary)',textTransform:'uppercase',marginTop:'4px'}}>Ενεργό ποσοστό</div>
              <div style={{fontSize:'9px',color:'var(--text-tertiary)',marginTop:'3px'}}>Αθήνα: ~5% · Τυπικό: 3-6%</div>
            </div>
          </div>
        </div>

        {/* Custom prices */}
        <button onClick={()=>setShowCustom(v=>!v)}
          style={{fontSize:'11px',color:'var(--accent)',background:'transparent',border:'none',cursor:'pointer',fontFamily:'Inter,sans-serif',padding:0,marginBottom:'4px'}}>
          {showCustom?'▲ Κλείσιμο':'▼ Χειροκίνητη καταχώρηση τιμών (αν το δικό σου πρόγραμμα διαφέρει)'}
        </button>
        {showCustom&&(
          <div style={{...g3,marginTop:'10px'}}>
            <NumberInput label="Τιμή kWh Ημέρας (€)" value={customKwh} onChange={setCustomKwh} suffix="€" step={0.001}/>
            <NumberInput label="Τιμή kWh Νύχτας (€)" value={customNight} onChange={setCustomNight} suffix="€" step={0.001}/>
            <NumberInput label="Πάγιο/μήνα (€)" value={customFixed} onChange={setCustomFixed} suffix="€" step={0.5}/>
          </div>
        )}
      </div>

      {/* kWh History */}
      <div style={card}>
        <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'16px',paddingBottom:'10px',borderBottom:'1px solid var(--border-subtle)'}}>
          <span style={{fontSize:'16px'}}>📊</span>
          <span style={{fontSize:'12px',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.04em'}}>Ιστορικό Κατανάλωσης kWh (12 μήνες)</span>
        </div>
        <div style={{position:'relative',display:'flex',gap:'6px',alignItems:'flex-end',height:'100px',marginBottom:'8px'}}>
          {calc&&maxKwh>0&&<div style={{position:'absolute',left:0,right:0,bottom:`${(calc.avgKwh/maxKwh)*80}px`,borderTop:'1px dashed var(--accent)',opacity:0.4,pointerEvents:'none',zIndex:1}}><span style={{position:'absolute',right:0,top:'-11px',fontSize:'8px',color:'var(--accent)',background:'var(--bg-surface)',padding:'0 3px'}}>μ.ο. {calc.avgKwh.toFixed(0)}</span></div>}
          {MONTHS_GR.map((m,i)=>{
            const kwh=parseFloat(kwhHistory[i])||0;
            const pct=kwh/maxKwh;
            const isCur=i===currentMonth;
            const isHigh=calc&&kwh>0&&kwh>calc.avgKwh*1.2;
            return(
              <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:'2px'}}>
                {kwh>0&&<div style={{fontSize:'7px',color:isHigh?'var(--negative)':'var(--text-tertiary)',fontFamily:"'JetBrains Mono',monospace"}}>{kwh}</div>}
                <div style={{width:'100%',height:`${Math.max(pct*80,kwh>0?4:1)}px`,background:isCur?'var(--accent)':isHigh?'rgba(239,68,68,0.7)':'var(--info)',borderRadius:'4px 4px 0 0',opacity:isCur?1:0.75,transition:'height 0.3s'}}/>
              </div>
            );
          })}
        </div>
        <div style={{display:'flex',gap:'6px',marginBottom:'14px'}}>
          {MONTHS_GR.map((m,i)=>(
            <div key={i} style={{flex:1,fontSize:'8px',color:i===currentMonth?'var(--accent)':'var(--text-tertiary)',textAlign:'center',fontWeight:i===currentMonth?700:400}}>{m}</div>
          ))}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:'6px'}}>
          {MONTHS_GR.map((m,i)=>(
            <div key={i}>
              <label style={{fontSize:'8px',color:'var(--text-secondary)',display:'block',marginBottom:'3px',textAlign:'center'}}>{m}</label>
              <input type="number" value={kwhHistory[i]} onChange={e=>{const n=[...kwhHistory];n[i]=e.target.value;setKwhHistory(n);}}
                style={{width:'100%',background:'var(--bg-base)',border:`1px solid ${i===currentMonth?'var(--accent)':'var(--border-subtle)'}`,borderRadius:'6px',padding:'6px 4px',color:'var(--text-primary)',fontSize:'11px',fontFamily:"'JetBrains Mono',monospace",outline:'none',textAlign:'center',boxSizing:'border-box'}}/>
            </div>
          ))}
        </div>
        {calc&&(
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'10px',marginTop:'14px'}}>
            {[
              {label:'Ετήσια Κατανάλωση',value:`${calc.annualKwh.toFixed(0)} kWh`,color:'var(--accent)'},
              {label:'Μέση Μηνιαία',value:`${calc.avgKwh.toFixed(0)} kWh`,color:'var(--info)'},
              {label:`Πρόβλεψη ${MONTHS_GR[(currentMonth+1)%12]}`,value:`${calc.predictedKwh} kWh`,color:'var(--warning)'},
            ].map((k,i)=>(
              <div key={i} style={{background:'var(--bg-elevated)',borderRadius:'8px',padding:'10px 12px'}}>
                <div style={{fontSize:'15px',fontWeight:700,color:k.color,fontFamily:"'JetBrains Mono',monospace"}}>{k.value}</div>
                <div style={{fontSize:'9px',color:'var(--text-secondary)',textTransform:'uppercase'}}>{k.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bill Breakdown */}
      {calc&&!calc.flat&&(
        <div style={card}>
          <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'16px',paddingBottom:'10px',borderBottom:'1px solid var(--border-subtle)'}}>
            <span style={{fontSize:'16px'}}>🧾</span>
            <span style={{fontSize:'12px',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.04em'}}>Ανάλυση Λογαριασμού</span>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px'}}>
            <div>
              {[
                {label:'Κατανάλωση (πραγματική)',value:fe(calc.consumption),pct:calc.consumptionPct,color:'var(--positive)'},
                {label:'ΕΡΤ',value:fe(calc.ert),pct:calc.taxesPct*0.36,color:'var(--warning)'},
                {label:'ΕΤΜΕΑΡ (ΑΠΕ)',value:fe(calc.etmear),pct:calc.taxesPct*0.64,color:'var(--warning)'},
                {label:`Δημοτικά Τέλη (${dimotika}%)`,value:fe(calc.dimotikaAmt),pct:calc.dimotikaPct,color:'var(--info)'},
                {label:'Πάγιο',value:fe(calc.fixed),pct:calc.fixedPct,color:'var(--text-secondary)'},
                {label:`ΦΠΑ ${tariff?.vat}%`,value:fe(calc.vatAmt),pct:calc.vatPct,color:'var(--text-tertiary)'},
              ].map((r,i)=>(
                <div key={i} style={{marginBottom:'10px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:'3px'}}>
                    <span style={{fontSize:'11px',color:'var(--text-secondary)'}}>{r.label}</span>
                    <span style={{fontSize:'11px',fontWeight:600,color:r.color,fontFamily:"'JetBrains Mono',monospace"}}>{r.value} ({r.pct.toFixed(1)}%)</span>
                  </div>
                  <div style={{height:'4px',background:'var(--bg-overlay)',borderRadius:'2px',overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${r.pct}%`,background:r.color,borderRadius:'2px'}}/>
                  </div>
                </div>
              ))}
              <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderTop:'2px solid var(--border-subtle)',marginTop:'8px'}}>
                <span style={{fontSize:'13px',fontWeight:700}}>Σύνολο</span>
                <span style={{fontSize:'16px',fontWeight:700,color:'var(--accent)',fontFamily:"'JetBrains Mono',monospace"}}>{fe(calc.total)}</span>
              </div>
              <div style={{fontSize:'10px',color:'var(--text-tertiary)',marginTop:'4px',fontFamily:"'JetBrains Mono',monospace"}}>
                Πραγματικό κόστος/kWh: {calc.avgKwh>0?(calc.total/calc.avgKwh).toFixed(4):'-'} €
              </div>
            </div>
            <div>
              <div style={{background:'var(--bg-elevated)',borderRadius:'10px',padding:'14px',marginBottom:'12px'}}>
                <div style={{fontSize:'10px',fontWeight:600,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:'10px'}}>Κατανομή Λογαριασμού</div>
                {[
                  {label:'Πραγματική Κατανάλωση',pct:calc.consumptionPct,color:'var(--positive)'},
                  {label:'Τέλη (ΕΡΤ+ΕΤΜΕΑΡ)',pct:calc.taxesPct,color:'var(--warning)'},
                  {label:'Δημοτικά Τέλη',pct:calc.dimotikaPct,color:'var(--info)'},
                  {label:'Πάγιο + ΦΠΑ',pct:calc.fixedPct+calc.vatPct,color:'var(--text-secondary)'},
                ].map((r,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'10px'}}>
                    <div style={{width:'8px',height:'8px',borderRadius:'50%',background:r.color,flexShrink:0}}/>
                    <div style={{flex:1,height:'5px',background:'var(--bg-overlay)',borderRadius:'2px',overflow:'hidden'}}>
                      <div style={{height:'100%',width:`${r.pct}%`,background:r.color,borderRadius:'2px'}}/>
                    </div>
                    <span style={{fontSize:'10px',fontWeight:600,color:r.color,fontFamily:"'JetBrains Mono',monospace",minWidth:'35px'}}>{r.pct.toFixed(1)}%</span>
                    <span style={{fontSize:'9px',color:'var(--text-secondary)',minWidth:'120px'}}>{r.label}</span>
                  </div>
                ))}
              </div>
              <div style={{background:calc.predictedBill>calc.total?'rgba(239,68,68,0.06)':'rgba(52,217,123,0.06)',border:`1px solid ${calc.predictedBill>calc.total?'var(--negative)':'var(--positive)'}`,borderRadius:'10px',padding:'14px'}}>
                <div style={{fontSize:'10px',fontWeight:600,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:'6px'}}>Πρόβλεψη {MONTHS_GR[(currentMonth+1)%12]}</div>
                <div style={{fontSize:'22px',fontWeight:700,color:calc.predictedBill>calc.total?'var(--negative)':'var(--positive)',fontFamily:"'JetBrains Mono',monospace"}}>{fe(calc.predictedBill)}</div>
                <div style={{fontSize:'10px',color:'var(--text-secondary)',marginTop:'4px'}}>~{calc.predictedKwh} kWh — εποχική πρόβλεψη</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Provider Comparison */}
      <div style={card}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px',paddingBottom:'10px',borderBottom:'1px solid var(--border-subtle)'}}>
          <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
            <span style={{fontSize:'16px'}}>🔄</span>
            <span style={{fontSize:'12px',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.04em'}}>Σύγκριση Παρόχων</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
            <span style={{fontSize:'9px',color:'var(--text-tertiary)'}}>Τελ. ενημέρωση: {LAST_UPDATED}</span>
            <a href={RAAYEY_URL} target="_blank" rel="noopener noreferrer"
              style={{fontSize:'10px',color:'var(--info)',textDecoration:'none',fontWeight:600}}>↗ ΡΑΑΕΥ</a>
          </div>
        </div>
        <div style={{fontSize:'9px',color:'var(--text-tertiary)',marginBottom:'12px'}}>
          Εκτίμηση βάσει μέσης κατανάλωσης {calc?.avgKwh.toFixed(0)||150} kWh/μήνα. Τιμές ενδεικτικές — επαλήθευσε στον πάροχο. Πάτα γραμμή για επιλογή.
        </div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'11px',minWidth:'700px'}}>
            <thead>
              <tr>
                {['Πάροχος','Τιμολόγιο','Τύπος','kWh Ημέρας','Εκτ. Μηνιαίο','Εκτ. Ετήσιο','Διαφορά'].map((h,i)=>(
                  <th key={i} style={{fontSize:'8px',letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-secondary)',padding:'6px 8px',borderBottom:'1px solid var(--border-subtle)',textAlign:'left',fontWeight:400}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PROVIDERS.flatMap(p=>p.tariffs.map(t=>{
                const tv=t as any;
                const isCur=tv.id===tariffId;
                const avgKwh=calc?.avgKwh||150;
                let tot=0;
                if(tv.type==='fixed_monthly'){tot=tv.flat_monthly;}
                else if(tv.type!=='dynamic'){
                  const dayK=avgKwh*0.65,nightK=avgKwh*0.35;
                  let cons=tv.kwh_night?(dayK*tv.kwh_day+nightK*tv.kwh_night):avgKwh*tv.kwh_day;
                  if(tv.kwh_tier2){
                    const t1=Math.min(avgKwh,tv.tier2_threshold||500);
                    const t2=Math.max(0,avgKwh-tv.tier2_threshold||0);
                    cons=t1*tv.kwh_day+t2*tv.kwh_tier2;
                  }
                  const ert=avgKwh*ERT,etm=avgKwh*ETMEAR,dim=cons*(parseFloat(dimotika)||4.8)/100;
                  const sub=cons+ert+etm+dim+(tv.fixed||0);
                  tot=sub*(1+tv.vat/100);
                }
                const diff=calc?(calc.total-tot)*12:0;
                const bc2=badgeColor(tv.badge||'');
                return(
                  <tr key={tv.id} onClick={()=>{setProvider(p.value);setTariffId(tv.id);}}
                    style={{cursor:'pointer',background:isCur?'rgba(212,175,66,0.08)':'transparent',transition:'background 0.15s'}}>
                    <td style={{padding:'8px 8px',fontWeight:isCur?700:400,color:isCur?'var(--accent)':'var(--text-primary)',whiteSpace:'nowrap'}}>
                      {p.label}{isCur?' ✓':''}
                    </td>
                    <td style={{padding:'8px 8px',color:'var(--text-secondary)',fontSize:'10px'}}>{tv.name}</td>
                    <td style={{padding:'8px 8px'}}>
                      <span style={{fontSize:'8px',fontWeight:700,padding:'2px 6px',borderRadius:'4px',background:bc2.bg,color:bc2.color,border:`1px solid ${bc2.border}`,whiteSpace:'nowrap'}}>{tv.badge}</span>
                    </td>
                    <td style={{padding:'8px 8px',fontFamily:"'JetBrains Mono',monospace",color:'var(--text-primary)',fontSize:'11px'}}>
                      {tv.type==='fixed_monthly'?`${tv.flat_monthly}€ flat`:tv.type==='dynamic'?'Ωριαίο':tv.kwh_day>0?`${tv.kwh_day.toFixed(4)} €`:'—'}
                    </td>
                    <td style={{padding:'8px 8px',fontWeight:600,color:isCur?'var(--accent)':'var(--text-primary)',fontFamily:"'JetBrains Mono',monospace"}}>
                      {tv.type==='dynamic'?'Μεταβλητό':fe(tot)}
                    </td>
                    <td style={{padding:'8px 8px',color:'var(--text-secondary)',fontFamily:"'JetBrains Mono',monospace",fontSize:'10px'}}>
                      {tv.type==='dynamic'?'—':fe(tot*12)}
                    </td>
                    <td style={{padding:'8px 8px',fontWeight:700,color:isCur?'var(--text-tertiary)':diff>0?'var(--positive)':diff<0?'var(--negative)':'var(--text-tertiary)',fontFamily:"'JetBrains Mono',monospace",fontSize:'11px'}}>
                      {isCur?'Τρέχον':tv.type==='dynamic'?'—':`${diff>0?'+':''}${fe(diff)}/έτος`}
                    </td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
        <div style={{marginTop:'10px',fontSize:'9px',color:'var(--text-tertiary)',padding:'8px',background:'var(--bg-elevated)',borderRadius:'6px'}}>
          ⚠️ Τιμές ενδεικτικές βάσει δημοσιευμένων τιμολογίων {LAST_UPDATED} — επαλήθευσε πάντα στον επίσημο ιστότοπο κάθε παρόχου ή στο ΡΑΑΕΥ energycost.gr
        </div>
      </div>

      {/* VNM Calculator */}
      <div style={card}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px',paddingBottom:'10px',borderBottom:'1px solid var(--border-subtle)'}}>
          <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
            <span style={{fontSize:'16px'}}>☀️</span>
            <span style={{fontSize:'12px',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.04em'}}>Virtual Net Metering — E.NA Ήρων</span>
          </div>
          <Toggle on={vnmEnabled} onChange={setVnmEnabled} label="Ενεργό" labelOff="Ανενεργό"/>
        </div>
        {!vnmEnabled?(
          <div style={{textAlign:'center',padding:'20px',color:'var(--text-tertiary)',fontSize:'11px'}}>
            <div style={{fontSize:'28px',marginBottom:'8px',opacity:0.4}}>☀️</div>
            Ενεργοποίησε για να υπολογίσεις την εξοικονόμηση από Virtual Net Metering (E.NA Ήρων).
            <div style={{fontSize:'10px',marginTop:'6px',lineHeight:1.5}}>
              Επενδύεις σε κοινό φωτοβολταϊκό σταθμό — η ενέργεια συμψηφίζεται αυτόματα με τον λογαριασμό σου.
            </div>
          </div>
        ):(
          <>
            <div style={g3}>
              <NumberInput label="Κεφάλαιο Επένδυσης (€)" value={vnmCapital} onChange={setVnmCapital} suffix="€" step={500}/>
              <NumberInput label="Ισχύς που Αγοράζεις (kWp)" value={vnmKwp} onChange={setVnmKwp} suffix="kWp" step={0.5}/>
              <NumberInput label="Μερίδιο Παραγωγής %" value={vnmSharedPct} onChange={setVnmSharedPct} suffix="%" step={5}/>
            </div>
            {calc&&parseFloat(vnmKwp)>0&&(
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'12px'}}>
                {[
                  {label:'Παραγωγή σου/έτος',value:`${calc.yourProd?.toFixed(0)||0} kWh`,color:'var(--positive)'},
                  {label:'Εξοικονόμηση/μήνα',value:fe(calc.vnmMonthly||0),color:'var(--positive)'},
                  {label:'Εξοικονόμηση/έτος',value:fe((calc.vnmMonthly||0)*12),color:'var(--positive)'},
                  {label:'Απόσβεση',value:calc.vnmPayback&&calc.vnmPayback>0?`${calc.vnmPayback.toFixed(1)} χρ`:'—',color:'var(--accent)'},
                ].map((k,i)=>(
                  <div key={i} style={{background:'rgba(52,217,123,0.06)',borderRadius:'10px',padding:'12px 14px',border:'1px solid rgba(52,217,123,0.25)'}}>
                    <div style={{fontSize:'16px',fontWeight:700,color:k.color,fontFamily:"'JetBrains Mono',monospace",marginBottom:'3px'}}>{k.value}</div>
                    <div style={{fontSize:'9px',color:'var(--text-secondary)',textTransform:'uppercase'}}>{k.label}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{background:'rgba(52,217,123,0.06)',border:'1px solid var(--positive)',borderRadius:'8px',padding:'12px 14px',fontSize:'11px',color:'var(--positive)',lineHeight:1.6}}>
              <strong>Πώς λειτουργεί:</strong> Αγοράζεις kWp σε κοινό Φ/Β σταθμό Ήρωνα. Ενέργεια → συμψηφισμός στον λογαριασμό σου.
              Απόδοση: ~{calc?.vnmROI?.toFixed(1)||0}% ετήσια. Απαιτεί τιμολόγιο E.NA της Ήρων.
            </div>
          </>
        )}
      </div>

      {/* Last Bill */}
      <div style={card}>
        <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'16px',paddingBottom:'10px',borderBottom:'1px solid var(--border-subtle)'}}>
          <span style={{fontSize:'16px'}}>📄</span>
          <span style={{fontSize:'12px',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.04em'}}>Καταχώρηση Τελευταίου Λογαριασμού</span>
        </div>
        <div style={g2}>
          <NumberInput label="Ποσό Λογαριασμού (€)" value={lastBillAmount} onChange={setLastBillAmount} suffix="€" step={1}/>
          <NumberInput label="Κατανάλωση (kWh)" value={lastBillKwh} onChange={setLastBillKwh} suffix="kWh" step={10}/>
        </div>
        {lastBillAmount&&lastBillKwh&&(
          <div style={{background:'var(--bg-elevated)',borderRadius:'8px',padding:'12px 14px',fontSize:'11px',color:'var(--text-secondary)'}}>
            Πραγματικό κόστος: <strong style={{color:'var(--accent)',fontFamily:"'JetBrains Mono',monospace"}}>{(parseFloat(lastBillAmount)/parseFloat(lastBillKwh)).toFixed(4)} €/kWh</strong> (συμπ. όλα τέλη)
            {calc&&<span> — Εκτίμηση app: <strong style={{color:'var(--info)',fontFamily:"'JetBrains Mono',monospace"}}>{(calc.total/calc.avgKwh).toFixed(4)} €/kWh</strong></span>}
          </div>
        )}
      </div>
    </div>
  );
}