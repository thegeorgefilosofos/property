'use client';

import { useState, useMemo, useEffect, useRef, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import NotificationSettings from './NotificationSettings';
import { NumberInput, CustomSelect, Toggle, DatePicker } from './UIComponents';
import { T, fe, PageTitle, InfoBanner, Btn } from '@/components/Theme';
import { AppPreferences, DEFAULT_PREFERENCES } from './useAppPreferences';
import { downloadCsv } from './exportCsv';
import { runE2Export } from './e2Export';
import Billing from './Billing';
import Referral from './Referral';

// ─── ΦΜΑ Data ─────────────────────────────────────────────────────────────────
const FMA_RATE = 0.03;
const NOTARY_BRACKETS = [
  { limit:120_000, rate:0.008, min:400 },
  { limit:384_000, rate:0.007, min:0 },
  { limit:Infinity,rate:0.0065,min:0 },
];
const LAWYER_BRACKETS = [
  { limit:44_020,    rate:0.01 },
  { limit:1_467_350, rate:0.005 },
  { limit:Infinity,  rate:0.003 },
];
const REGISTRATION_RATE = 0.005;
const BROKER_RATE = 0.02;

function calcNotary(v:number):number {
  let rem=v,tot=0,prev=0;
  for (const b of NOTARY_BRACKETS) {
    if (rem<=0) break;
    const taxable = b.limit===Infinity ? rem : Math.min(rem,b.limit-prev);
    tot += taxable*b.rate; rem-=taxable; prev=b.limit;
  }
  const br = NOTARY_BRACKETS.find(b=>v<=b.limit);
  return Math.max(tot, br?.min||0);
}
function calcLawyer(v:number):number {
  let rem=v,tot=0,prev=0;
  for (const b of LAWYER_BRACKETS) {
    if (rem<=0) break;
    const taxable = b.limit===Infinity ? rem : Math.min(rem,b.limit-prev);
    tot += taxable*b.rate; rem-=taxable; prev=b.limit;
  }
  return tot;
}

// ─── Tax brackets ─────────────────────────────────────────────────────────────
// Κλίμακα ενοικίων 2026: νέος ενδιάμεσος 25% στα 12.000–24.000 (βλ. lib/billing/greekTax).
const RENTAL_TAX = [
  { limit:12_000, rate:0.15 },
  { limit:24_000, rate:0.25 },
  { limit:35_000, rate:0.35 },
  { limit:Infinity,rate:0.45 },
];
function calcRentalTax(gross:number, deductible:number) {
  const taxable = Math.max(0, gross-deductible);
  let rem=taxable, tax=0, prev=0;
  const breakdown:{ label:string;taxable:number;tax:number }[]=[];
  for (const b of RENTAL_TAX) {
    if (rem<=0) break;
    const t=b.limit===Infinity?rem:Math.min(rem,b.limit-prev);
    const tx=t*b.rate;
    if (t>0) breakdown.push({ label:`${b.rate*100}%`, taxable:t, tax:tx });
    tax+=tx; rem-=t; prev=b.limit;
  }
  const eff = taxable>0 ? (tax/taxable)*100 : 0;
  return { tax, taxable, effectiveRate:eff, netAfterTax:gross-tax, breakdown, advance:tax*0.55 };
}

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
  const supabase = createClient();
  const [s, setS] = useState<S>(INIT);
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState<'settings'|'account'|'billing'|'prefs'|'fma'|'e2'>('settings');
  const [accountEmail, setAccountEmail] = useState('');
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setAccountEmail(data.user?.email || '')); }, []);

  // App preferences state
  const [prefs, setPrefs] = useState<AppPreferences>(DEFAULT_PREFERENCES);
  const [prefsSaved, setPrefsSaved] = useState(false);
  const prefsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // FMA state
  const [fmaMode, setFmaMode]             = useState<'buy'|'sell'>('buy');
  const [contractVal, setContractVal]     = useState('');
  const [objVal, setObjVal]               = useState('');
  const [isFirstHome, setIsFirstHome]     = useState(false);
  const [hasBroker, setHasBroker]         = useState(true);
  const [hasLawyer, setHasLawyer]         = useState(true);
  const [needsMortgage, setNeedsMortgage] = useState(false);
  const [mortgageAmt, setMortgageAmt]     = useState('');
  const [sellVal, setSellVal]             = useState('');
  const [origPrice, setOrigPrice]         = useState('');
  const [origYear, setOrigYear]           = useState('');
  const [sellBroker, setSellBroker]       = useState(true);
  const [sellLawyer, setSellLawyer]       = useState(false);

  // E2 state
  const [e2Rent, setE2Rent]           = useState('');
  const [e2Deductible, setE2Deductible] = useState('');
  const [e2Year, setE2Year]           = useState(String(new Date().getFullYear()-1));

  useEffect(() => { load(); }, [propertyId]);
  async function load() {
    const { data } = await supabase.from('property_settings').select('*').eq('property_id',propertyId).maybeSingle();
    if (data) setS(data);
  }
  async function save() {
    await supabase.from('property_settings').upsert({ ...s, property_id:propertyId, user_id:userId },{ onConflict:'property_id' });
    setSaved(true); setTimeout(()=>setSaved(false),2000);
  }

  // ── App preferences: load on mount, debounce-save on change ──
  useEffect(() => { loadPrefs(); }, [propertyId]);
  async function loadPrefs() {
    const { data } = await supabase.from('bills_settings').select('data')
      .eq('property_id',propertyId).eq('section','app_preferences').maybeSingle();
    if (data?.data) setPrefs(p => ({ ...p, ...data.data }));
    else setPrefs(DEFAULT_PREFERENCES);
  }
  function updatePrefs(partial: Partial<AppPreferences>) {
    setPrefs(prev => {
      const next = { ...prev, ...partial };
      if (prefsTimer.current) clearTimeout(prefsTimer.current);
      prefsTimer.current = setTimeout(async () => {
        await supabase.from('bills_settings').upsert({
          property_id: propertyId, user_id: String(userId),
          section: 'app_preferences', data: next, updated_at: new Date().toISOString(),
        }, { onConflict: 'property_id,section' });
        setPrefsSaved(true); setTimeout(()=>setPrefsSaved(false),1800);
      }, 800);
      return next;
    });
  }

  // FMA calculations
  const buyCalc = useMemo(() => {
    const cv=parseFloat(contractVal)||0, ov=parseFloat(objVal)||0;
    if (cv<=0&&ov<=0) return null;
    const taxBase=Math.max(cv,ov);
    let fma=0;
    if (isFirstHome) { const t=Math.max(0,taxBase-200_000); fma=t*FMA_RATE; }
    else { fma=taxBase*FMA_RATE; }
    const notary=calcNotary(taxBase), notaryVat=notary*0.24;
    const lawyer=hasLawyer?calcLawyer(taxBase):0, lawyerVat=lawyer*0.24;
    const broker=hasBroker?cv*BROKER_RATE:0, brokerVat=broker*0.24;
    const reg=taxBase*REGISTRATION_RATE;
    const mortg=needsMortgage?(parseFloat(mortgageAmt)||0)*0.01:0;
    const total=fma+notary+notaryVat+lawyer+lawyerVat+broker+brokerVat+reg+mortg;
    return { fma,notary,notaryVat,lawyer,lawyerVat,broker,brokerVat,reg,mortg,total,taxBase,cv };
  },[contractVal,objVal,isFirstHome,hasBroker,hasLawyer,needsMortgage,mortgageAmt]);

  const sellCalc = useMemo(() => {
    const sv=parseFloat(sellVal)||0;
    if (sv<=0) return null;
    const notary=calcNotary(sv), notaryVat=notary*0.24;
    const lawyer=sellLawyer?calcLawyer(sv):0, lawyerVat=lawyer*0.24;
    const broker=sellBroker?sv*BROKER_RATE:0, brokerVat=broker*0.24;
    const op=parseFloat(origPrice)||0, oy=parseInt(origYear)||0;
    const yrs=oy>0?new Date().getFullYear()-oy:0;
    const gain=op>0?sv-op:0;
    const gainTax=gain>0&&yrs<5?gain*0.15:0;
    const total=notary+notaryVat+lawyer+lawyerVat+broker+brokerVat+150+gainTax;
    return { notary,notaryVat,lawyer,lawyerVat,broker,brokerVat,gainTax,yrs,gain,total,net:sv-total,sv };
  },[sellVal,sellBroker,sellLawyer,origPrice,origYear]);

  // E2 calculation
  const e2Result = useMemo(() => {
    const g=parseFloat(e2Rent)||0;
    if (g<=0) return null;
    return calcRentalTax(g, parseFloat(e2Deductible)||0);
  },[e2Rent,e2Deductible]);

  // Shared styles
  const card = { background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:20 } as const;
  const cardGap = { ...card, marginBottom:16 };
  const lbl = { fontSize:9,textTransform:'uppercase',letterSpacing:'0.14em',color:'var(--text-tertiary)',display:'block',marginBottom:6,fontFamily:"'Inter',sans-serif" } as const;
  const inp = { background:'var(--bg-base)',border:'1px solid var(--border-subtle)',borderRadius:6,padding:'8px 12px',color:'var(--text-primary)',fontSize:13,width:'100%',outline:'none',boxSizing:'border-box',fontFamily:"'Inter',sans-serif" } as const;
  const sectionTitle = (t:string) => (
    <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:16,paddingBottom:10,
      borderBottom:'1px solid var(--border-subtle)' }}>
      <div style={{ width:6,height:6,borderRadius:'50%',background:'var(--accent)',flexShrink:0 }}/>
      <div style={{ fontFamily:"'Inter',sans-serif",fontSize:10,textTransform:'uppercase',
        letterSpacing:'0.06em',color:'var(--text-secondary)',fontWeight:700 }}>{t}</div>
    </div>
  );
  const statRow = (label:string, value:string, color='var(--text-primary)', bold=false) => (
    <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',
      padding:'8px 0',borderBottom:'1px solid var(--border-subtle)' }}>
      <span style={{ fontSize:12,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif" }}>{label}</span>
      <span style={{ fontSize:bold?15:13,fontWeight:bold?700:500,color,fontFamily:"'Inter', sans-serif",fontVariantNumeric:'tabular-nums' }}>{value}</span>
    </div>
  );

  const prefRow = (label:string, description:string|null, control:ReactNode) => (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,
      padding:'12px 0',borderBottom:'1px solid var(--border-subtle)' }}>
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:13,color:'var(--text-primary)',fontFamily:"'Inter',sans-serif" }}>{label}</div>
        {description && (
          <div style={{ fontSize:11,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif",marginTop:4,lineHeight:1.5 }}>{description}</div>
        )}
      </div>
      <div style={{ flexShrink:0 }}>{control}</div>
    </div>
  );

  // Nav tabs
  const NAV = [
    { id:'settings', label:'Ρυθμίσεις' },
    { id:'account',  label:'Λογαριασμός' },
    { id:'billing',  label:'Συνδρομή & Χρέωση' },
    { id:'prefs',    label:'Προτιμήσεις' },
    { id:'fma',      label:'ΦΜΑ, Αγορά / Πώληση' },
    { id:'e2',       label:'Ε2, Εισόδημα Ακινήτων' },
  ] as const;

  return (
    <div style={{ fontFamily:"'Inter',sans-serif", color:'var(--text-primary)' }}>

      <PageTitle title="Ρυθμίσεις" sub="Στοιχεία ακινήτου, προτιμήσεις εφαρμογής και φορολογικά εργαλεία"/>

      {/* Section nav */}
      <div style={{ display:'flex',gap:6,marginBottom:20 }}>
        {NAV.map(n => (
          <button key={n.id} onClick={()=>setActiveSection(n.id as any)}
            style={{ padding:'9px 18px',borderRadius:20,border:`1px solid ${activeSection===n.id?'var(--accent)':'var(--border-subtle)'}`,
              background:activeSection===n.id?'var(--accent-soft)':'transparent',
              color:activeSection===n.id?'var(--accent)':'var(--text-secondary)',cursor:'pointer',fontSize:12,
              fontFamily:"'Inter',sans-serif",fontWeight:500 }}>
            {n.label}
          </button>
        ))}
      </div>

      {/* ── ACCOUNT ── */}
      {activeSection==='account' && (
        <div>
          <div style={cardGap}>
            {sectionTitle('Λογαριασμός')}
            {statRow('Email', accountEmail || '—')}
            {statRow('Γλώσσα', 'Ελληνικά')}
            {statRow('Νόμισμα', 'Ευρώ (€)')}
            {prefRow('Εμφάνιση', 'Αλλάζεις φωτεινό/σκοτεινό θέμα από το εικονίδιο πάνω δεξιά.', <span style={{ fontSize:12, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif" }}>Πάνω δεξιά</span>)}
            <div style={{ marginTop:16 }}>
              <Btn variant="secondary" onClick={async()=>{ await supabase.auth.signOut(); window.location.href='/login'; }}>Αποσύνδεση</Btn>
            </div>
          </div>

          <div style={cardGap}>
            {sectionTitle('Συνδρομή')}
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap' }}>
              <div>
                <div style={{ display:'inline-flex',alignItems:'center',gap:8,background:'var(--positive-soft)',border:'1px solid var(--positive-border)',borderRadius:100,padding:'4px 12px' }}>
                  <span style={{ width:6,height:6,borderRadius:'50%',background:'var(--positive)' }}/>
                  <span style={{ fontSize:12,fontWeight:700,color:'var(--positive)',fontFamily:"'Inter',sans-serif" }}>Δωρεάν πλάνο</span>
                </div>
                <div style={{ fontSize:12,color:'var(--text-tertiary)',marginTop:8,fontFamily:"'Inter',sans-serif",lineHeight:1.5 }}>Το πρώτο σου ακίνητο είναι δωρεάν, για πάντα. Για περισσότερα: Ιδιοκτήτης 6,90 € τον μήνα (έως δεκαπέντε ακίνητα) ή Επαγγελματίας 19 € τον μήνα (απεριόριστα).</div>
              </div>
              <Btn variant="secondary" onClick={()=>setActiveSection('billing')}>Διαχείριση συνδρομής</Btn>
            </div>
          </div>

          <div style={cardGap}>
            {sectionTitle('Δεδομένα')}
            {prefRow('Εξαγωγή ρυθμίσεων ακινήτου', 'Κατέβασε τις αποθηκευμένες ρυθμίσεις αυτού του ακινήτου σε αρχείο CSV.',
              <Btn variant="secondary" onClick={()=>{
                const rows = Object.entries(s as Record<string,unknown>).map(([k,v]) => [k, v==null?'':String(v)]);
                downloadCsv(`rythmiseis_akinitou_${new Date().toISOString().slice(0,10)}`, ['Πεδίο','Τιμή'], rows);
              }}>Εξαγωγή CSV</Btn>
            )}
            <InfoBanner tone="info">Η πλήρης εξαγωγή όλων των δεδομένων (δαπάνες, λογαριασμοί, ενοικιαστές) γίνεται ανά tab από το κουμπί «Εξαγωγή CSV».</InfoBanner>
          </div>

          <Referral userId={userId} />
        </div>
      )}

      {/* ── BILLING ── */}
      {activeSection==='billing' && <Billing userId={userId} />}

      {/* ── SETTINGS ── */}
      {activeSection==='settings' && (
        <div className="space-y-5">
          {/* Owner */}
          <div style={cardGap}>
            {sectionTitle('Ιδιοκτήτης')}
            <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:12 }}>
              <div style={{ gridColumn:'1/3' }}>
                <label style={lbl}>Ονοματεπώνυμο</label>
                <input style={inp} value={s.owner_name} onChange={e=>setS(p=>({...p,owner_name:e.target.value}))}/>
              </div>
              {([['owner_afm','ΑΦΜ'],['owner_phone','Τηλέφωνο']] as [keyof S,string][]).map(([k,l])=>(
                <div key={k}><label style={lbl}>{l}</label><input style={inp} value={s[k]} onChange={e=>setS(p=>({...p,[k]:e.target.value}))}/></div>
              ))}
              <div style={{ gridColumn:'1/3' }}>
                <label style={lbl}>Email</label>
                <input type="email" style={inp} value={s.owner_email} onChange={e=>setS(p=>({...p,owner_email:e.target.value}))}/>
              </div>
            </div>
          </div>

          {/* Providers */}
          <div style={cardGap}>
            {sectionTitle('Πάροχοι')}
            <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:12 }}>
              {([['electricity_provider','Ρεύμα'],['water_provider','Νερό'],['internet_provider','Internet'],['internet_plan','Πρόγραμμα']] as [keyof S,string][]).map(([k,l])=>(
                <div key={k}><label style={lbl}>{l}</label><input style={inp} value={s[k]} onChange={e=>setS(p=>({...p,[k]:e.target.value}))}/></div>
              ))}
            </div>
          </div>

          {/* Management & Insurance */}
          <div style={cardGap}>
            {sectionTitle('Διαχείριση & Ασφάλεια')}
            <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:12 }}>
              {([['property_manager','Διαχειριστής'],['property_manager_phone','Τηλέφωνο Διαχειριστή'],['insurance_company','Ασφαλιστική'],['insurance_policy','Αρ. Πολίτικής']] as [keyof S,string][]).map(([k,l])=>(
                <div key={k}><label style={lbl}>{l}</label><input style={inp} value={s[k]} onChange={e=>setS(p=>({...p,[k]:e.target.value}))}/></div>
              ))}
              <div style={{ gridColumn:'1/3' }}>
                <label style={lbl}>Λήξη Ασφάλισης</label>
                <DatePicker value={s.insurance_expiry} onChange={v=>setS(p=>({...p,insurance_expiry:v}))}/>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div style={cardGap}>
            <label style={lbl}>Σημειώσεις</label>
            <textarea value={s.notes} onChange={e=>setS(p=>({...p,notes:e.target.value}))} rows={4}
              style={{ ...inp, resize:'none', height:'auto' }}/>
          </div>

          <button onClick={save}
            style={{ width:'100%',background:'var(--accent)',color:'var(--accent-text)',border:'none',borderRadius:8,
              padding:'12px',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:"'Inter',sans-serif",
              textTransform:'uppercase',letterSpacing:'0.1em' }}>
            {saved ? 'Αποθηκεύτηκε' : 'Αποθήκευση Ρυθμίσεων'}
          </button>

          <NotificationSettings userId={userId} propertyId={propertyId}/>
        </div>
      )}

      {/* ── ΠΡΟΤΙΜΗΣΕΙΣ & ΔΥΝΑΤΟΤΗΤΕΣ ── */}
      {activeSection==='prefs' && (
        <div className="space-y-5">
          <div style={{ marginBottom:16 }}>
            <InfoBanner tone="info">
              {prefs.rememberAcrossProperties
                ? 'Οι προτιμήσεις αποθηκεύονται αυτόματα και εφαρμόζονται σε όλα τα ακίνητά σου, καθώς η μνήμη είναι ενεργή.'
                : 'Οι προτιμήσεις αποθηκεύονται αυτόματα για αυτό το ακίνητο. Ενεργοποίησε τη μνήμη για να εφαρμόζονται σε όλα τα ακίνητα.'}
            </InfoBanner>
          </div>

          {/* Ειδοποιήσεις */}
          <div style={cardGap}>
            {sectionTitle('Ειδοποιήσεις')}
            {prefRow('Ζωντανές ειδοποιήσεις στην Επισκόπηση',
              'Εμφάνιση ζωντανών ειδοποιήσεων στην αρχική οθόνη επισκόπησης.',
              <Toggle on={prefs.liveNotifications} onChange={v=>updatePrefs({ liveNotifications:v })} size="sm"/>)}
            {prefRow('Ειδοποιήσεις λήξεων & προθεσμιών',
              'Υπενθυμίσεις για λήξεις ασφαλίσεων, μισθωτηρίων και φορολογικές προθεσμίες.',
              <Toggle on={prefs.deadlineAlerts} onChange={v=>updatePrefs({ deadlineAlerts:v })} size="sm"/>)}
          </div>

          {/* Αρχείο & Καταχωρήσεις */}
          <div style={cardGap}>
            {sectionTitle('Αρχείο & Καταχωρήσεις')}
            {prefRow('Αυτόματη πρόταση κατηγορίας βάσει παρόχου',
              'Πρόταση κατηγορίας δαπάνης αυτόματα, ανάλογα με τον πάροχο που επιλέγεις.',
              <Toggle on={prefs.autoSuggestCategory} onChange={v=>updatePrefs({ autoSuggestCategory:v })} size="sm"/>)}
            {prefRow('Επιβεβαίωση πριν τη διαγραφή',
              'Ερώτηση επιβεβαίωσης πριν τη διαγραφή καταχωρήσεων.',
              <Toggle on={prefs.confirmBeforeDelete} onChange={v=>updatePrefs({ confirmBeforeDelete:v })} size="sm"/>)}
          </div>

          {/* Εμφάνιση */}
          <div style={cardGap}>
            {sectionTitle('Εμφάνιση')}
            {prefRow('Συμπαγής προβολή',
              'Πυκνότερη διάταξη με λιγότερα κενά για περισσότερες πληροφορίες στην οθόνη.',
              <Toggle on={prefs.compactView} onChange={v=>updatePrefs({ compactView:v })} size="sm"/>)}
            {prefRow('Εμφάνιση έξυπνων συμβουλών',
              'Εμφάνιση χρήσιμων συμβουλών και υποδείξεων μέσα στην εφαρμογή.',
              <Toggle on={prefs.showSmartTips} onChange={v=>updatePrefs({ showSmartTips:v })} size="sm"/>)}
            {prefRow('Δεκαδικά στα ποσά',
              'Πλήθος δεκαδικών ψηφίων για την εμφάνιση των χρηματικών ποσών.',
              <div style={{ width:220 }}>
                <CustomSelect value={prefs.decimals}
                  onChange={v=>updatePrefs({ decimals: v as AppPreferences['decimals'] })}
                  options={[
                    { value:'0', label:'Χωρίς δεκαδικά (1.234 €)' },
                    { value:'2', label:'Δύο δεκαδικά (1.234,56 €)' },
                  ]}/>
              </div>)}
          </div>

          {/* Μνήμη & Δεδομένα */}
          <div style={cardGap}>
            {sectionTitle('Μνήμη & Δεδομένα')}
            {prefRow('Να θυμάται τις προτιμήσεις μου σε όλα τα ακίνητα',
              'Όταν είναι ενεργό, οι προτιμήσεις σου αποθηκεύονται και μεταφέρονται αυτόματα σε κάθε ακίνητο, ώστε να μη χρειάζεται να τις ρυθμίζεις ξανά.',
              <Toggle on={prefs.rememberAcrossProperties} onChange={v=>updatePrefs({ rememberAcrossProperties:v })} size="sm"/>)}
          </div>

          <div style={{ height:20,display:'flex',alignItems:'center',justifyContent:'flex-end' }}>
            {prefsSaved && (
              <span style={{ fontSize:11,color:'var(--positive)',fontFamily:"'Inter',sans-serif",
                display:'inline-flex',alignItems:'center',gap:6 }}>
                <span style={{ width:6,height:6,borderRadius:'50%',background:'var(--positive)' }}/>
                Αποθηκεύτηκε
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── ΦΜΑ CALCULATOR ── */}
      {activeSection==='fma' && (
        <div>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16 }}>
            <div style={{ fontSize:11,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif" }}>
              Φόρος Μεταβίβασης Ακινήτων, Εκτίμηση 2024
            </div>
            <div style={{ display:'flex',background:'var(--bg-base)',border:'1px solid var(--border-subtle)',borderRadius:8,padding:4,gap:4 }}>
              {(['buy','sell'] as const).map(m=>(
                <button key={m} onClick={()=>setFmaMode(m)}
                  style={{ height:30,padding:'0 16px',borderRadius:6,border:'none',
                    background:fmaMode===m?'var(--accent)':'transparent',
                    color:fmaMode===m?'var(--accent-text)':'var(--text-secondary)',cursor:'pointer',fontSize:12,
                    fontFamily:"'Inter',sans-serif",fontWeight:500 }}>
                  {m==='buy'?'Αγορά':'Πώληση'}
                </button>
              ))}
            </div>
          </div>

          {fmaMode==='buy' ? (
            <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:16 }}>
              <div style={{ display:'flex',flexDirection:'column',gap:14 }}>
                <div style={cardGap}>
                  {sectionTitle('Στοιχεία Ακινήτου')}
                  <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
                    <div><label style={lbl}>Συμβολαιογραφική Αξία (€)</label>
                      <input type="number" style={inp} value={contractVal} onChange={e=>setContractVal(e.target.value)} placeholder="για παράδειγμα 150000"/></div>
                    <div><label style={lbl}>Αντικειμενική Αξία (€)</label>
                      <input type="number" style={inp} value={objVal} onChange={e=>setObjVal(e.target.value)} placeholder="για παράδειγμα 120000"/></div>
                    {buyCalc && buyCalc.taxBase>=(parseFloat(objVal)||0) && parseFloat(objVal)>parseFloat(contractVal) && (
                      <div style={{ fontSize:11,color:'var(--warning)',background:'var(--warning-soft)',
                        border:'1px solid var(--warning-border)',borderRadius:8,padding:'8px 12px' }}>
                        ΦΜΑ υπολογίζεται επί αντικειμενικής ({fe(parseFloat(objVal))})
                      </div>
                    )}
                  </div>
                </div>
                <div style={cardGap}>
                  {sectionTitle('Επιλογές')}
                  <div style={{ display:'flex',flexDirection:'column',gap:14 }}>
                    {[
                      {label:'Πρώτη Κύρια Κατοικία (αφορολ. έως €200k)',on:isFirstHome,set:setIsFirstHome},
                      {label:'Μεσίτης (2% + ΦΠΑ)', on:hasBroker, set:setHasBroker},
                      {label:'Δικηγόρος', on:hasLawyer, set:setHasLawyer},
                      {label:'Στεγαστικό Δάνειο', on:needsMortgage, set:setNeedsMortgage},
                    ].map((opt,i)=>(
                      <div key={i} style={{ display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                        <span style={{ fontSize:12,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif" }}>{opt.label}</span>
                        <Toggle on={opt.on} onChange={opt.set} size="sm"/>
                      </div>
                    ))}
                    {needsMortgage && (
                      <div><label style={lbl}>Ποσό Δανείου (€)</label>
                        <input type="number" style={inp} value={mortgageAmt} onChange={e=>setMortgageAmt(e.target.value)}/></div>
                    )}
                    {isFirstHome && (
                      <div style={{ fontSize:11,color:'var(--positive)',background:'var(--positive-soft)',
                        border:'1px solid var(--positive-border)',borderRadius:8,padding:'8px 12px' }}>
                        Αφορολόγητο ποσό: έως €200.000. ΦΜΑ μόνο για το υπερβάλλον.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                {buyCalc ? (
                  <>
                    <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:10,marginBottom:14 }}>
                      <div style={{ ...card,textAlign:'center' }}>
                        <div style={{ fontSize:20,fontWeight:700,color:'var(--negative)',fontFamily:"'Inter', sans-serif",fontVariantNumeric:'tabular-nums',marginBottom:4 }}>{fe(buyCalc.total)}</div>
                        <div style={{ fontSize:9,textTransform:'uppercase',letterSpacing:'0.1em',color:'var(--text-secondary)' }}>Συνολικό Κόστος Αγοράς</div>
                      </div>
                      <div style={{ ...card,textAlign:'center' }}>
                        <div style={{ fontSize:20,fontWeight:700,color:'var(--warning)',fontFamily:"'Inter', sans-serif",fontVariantNumeric:'tabular-nums',marginBottom:4 }}>
                          {buyCalc.cv>0?((buyCalc.total/buyCalc.cv)*100).toFixed(1):'—'}%
                        </div>
                        <div style={{ fontSize:9,textTransform:'uppercase',letterSpacing:'0.1em',color:'var(--text-secondary)' }}>Επί Αξίας</div>
                      </div>
                    </div>
                    <div style={cardGap}>
                      {sectionTitle('Ανάλυση')}
                      {statRow(`ΦΜΑ 3%${isFirstHome?' (μειωμένο)':''}`, fe(buyCalc.fma), 'var(--negative)')}
                      {statRow('Συμβολαιογράφος', fe(buyCalc.notary))}
                      {statRow('ΦΠΑ Συμβολαιογράφου 24%', fe(buyCalc.notaryVat), 'var(--warning)')}
                      {buyCalc.lawyer>0 && statRow('Δικηγόρος', fe(buyCalc.lawyer))}
                      {buyCalc.lawyerVat>0 && statRow('ΦΠΑ Δικηγόρου 24%', fe(buyCalc.lawyerVat), 'var(--warning)')}
                      {buyCalc.broker>0 && statRow('Μεσίτης 2%', fe(buyCalc.broker))}
                      {buyCalc.brokerVat>0 && statRow('ΦΠΑ Μεσίτη 24%', fe(buyCalc.brokerVat), 'var(--warning)')}
                      {statRow('Τέλος Μεταγραφής 0.5%', fe(buyCalc.reg))}
                      {buyCalc.mortg>0 && statRow('Έξοδα Υποθήκης ~1%', fe(buyCalc.mortg))}
                      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:10 }}>
                        <span style={{ fontSize:14,fontWeight:700,fontFamily:"'Inter',sans-serif" }}>Σύνολο Εξόδων</span>
                        <span style={{ fontSize:18,fontWeight:700,color:'var(--negative)',fontFamily:"'Inter', sans-serif",fontVariantNumeric:'tabular-nums' }}>{fe(buyCalc.total)}</span>
                      </div>
                    </div>
                    <div style={{ ...card,border:'1px solid var(--accent)',background:'var(--accent-soft)' }}>
                      {sectionTitle('Συνολικό Κεφάλαιο')}
                      {statRow('Τίμημα Ακινήτου', fe(buyCalc.cv))}
                      {statRow('Έξοδα Αγοράς', fe(buyCalc.total), 'var(--negative)')}
                      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:10 }}>
                        <span style={{ fontSize:14,fontWeight:700,fontFamily:"'Inter',sans-serif" }}>Συνολικό Κεφάλαιο</span>
                        <span style={{ fontSize:22,fontWeight:700,color:'var(--accent)',fontFamily:"'Inter', sans-serif",fontVariantNumeric:'tabular-nums' }}>{fe(buyCalc.cv+buyCalc.total)}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ ...card,textAlign:'center',padding:48,color:'var(--text-tertiary)' }}>
                    <div style={{ fontSize:13,fontFamily:"'Inter',sans-serif" }}>Συμπλήρωσε την αξία του ακινήτου</div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:16 }}>
              <div style={{ display:'flex',flexDirection:'column',gap:14 }}>
                <div style={cardGap}>
                  {sectionTitle('Στοιχεία Πώλησης')}
                  <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
                    <div><label style={lbl}>Τιμή Πώλησης (€)</label>
                      <input type="number" style={inp} value={sellVal} onChange={e=>setSellVal(e.target.value)}/></div>
                    <div><label style={lbl}>Τιμή Αγοράς (€)</label>
                      <input type="number" style={inp} value={origPrice} onChange={e=>setOrigPrice(e.target.value)}/></div>
                    <div><label style={lbl}>Έτος Αγοράς</label>
                      <input type="number" style={inp} value={origYear} onChange={e=>setOrigYear(e.target.value)} placeholder="για παράδειγμα 2018"/></div>
                  </div>
                </div>
                <div style={cardGap}>
                  {sectionTitle('Επιλογές')}
                  <div style={{ display:'flex',flexDirection:'column',gap:14 }}>
                    <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                      <span style={{ fontSize:12,color:'var(--text-secondary)' }}>Μεσίτης (2% + ΦΠΑ)</span>
                      <Toggle on={sellBroker} onChange={setSellBroker} size="sm"/>
                    </div>
                    <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                      <span style={{ fontSize:12,color:'var(--text-secondary)' }}>Δικηγόρος</span>
                      <Toggle on={sellLawyer} onChange={setSellLawyer} size="sm"/>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                {sellCalc ? (
                  <>
                    <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:10,marginBottom:14 }}>
                      <div style={{ ...card,textAlign:'center' }}>
                        <div style={{ fontSize:18,fontWeight:700,color:'var(--negative)',fontFamily:"'Inter', sans-serif",fontVariantNumeric:'tabular-nums',marginBottom:4 }}>{fe(sellCalc.total)}</div>
                        <div style={{ fontSize:9,textTransform:'uppercase',letterSpacing:'0.1em',color:'var(--text-secondary)' }}>Έξοδα Πώλησης</div>
                      </div>
                      <div style={{ ...card,textAlign:'center',background:'var(--positive-soft)',borderColor:'var(--positive-border)' }}>
                        <div style={{ fontSize:18,fontWeight:700,color:'var(--positive)',fontFamily:"'Inter', sans-serif",fontVariantNumeric:'tabular-nums',marginBottom:4 }}>{fe(sellCalc.net)}</div>
                        <div style={{ fontSize:9,textTransform:'uppercase',letterSpacing:'0.1em',color:'var(--text-secondary)' }}>Καθαρά Έσοδα</div>
                      </div>
                    </div>
                    <div style={cardGap}>
                      {sectionTitle('Ανάλυση')}
                      {statRow('Συμβολαιογράφος', fe(sellCalc.notary))}
                      {statRow('ΦΠΑ Συμβολαιογράφου', fe(sellCalc.notaryVat), 'var(--warning)')}
                      {sellCalc.lawyer>0 && statRow('Δικηγόρος', fe(sellCalc.lawyer))}
                      {sellCalc.lawyerVat>0 && statRow('ΦΠΑ Δικηγόρου', fe(sellCalc.lawyerVat), 'var(--warning)')}
                      {sellCalc.broker>0 && statRow('Μεσίτης 2%', fe(sellCalc.broker))}
                      {sellCalc.brokerVat>0 && statRow('ΦΠΑ Μεσίτη', fe(sellCalc.brokerVat), 'var(--warning)')}
                      {statRow('Πιστοποιητικά & ΔΟΥ', fe(150))}
                      {sellCalc.gainTax>0 && statRow(`Φόρος Κέρδους 15% (${sellCalc.yrs}χρ κατοχή)`, fe(sellCalc.gainTax), 'var(--negative)')}
                      {sellCalc.gain>0 && sellCalc.gainTax===0 && (
                        <div style={{ fontSize:11,color:'var(--positive)',background:'var(--positive-soft)',border:'1px solid var(--positive-border)',borderRadius:8,padding:'8px 12px',margin:'4px 0' }}>
                          Κέρδος {fe(sellCalc.gain)}, Αφορολόγητο ({sellCalc.yrs} χρόνια κατοχής)
                        </div>
                      )}
                      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:10 }}>
                        <span style={{ fontSize:14,fontWeight:700,fontFamily:"'Inter',sans-serif" }}>Καθαρά Έσοδα</span>
                        <span style={{ fontSize:20,fontWeight:700,color:'var(--positive)',fontFamily:"'Inter', sans-serif",fontVariantNumeric:'tabular-nums' }}>{fe(sellCalc.net)}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ ...card,textAlign:'center',padding:48,color:'var(--text-tertiary)' }}>
                    <div style={{ fontSize:13,fontFamily:"'Inter',sans-serif" }}>Συμπλήρωσε την τιμή πώλησης</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Info notes */}
          <div style={{ ...cardGap,marginTop:14 }}>
            {sectionTitle('Σημαντικές Πληροφορίες')}
            <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',gap:10 }}>
              {[
                {title:'Πρώτη Κατοικία',desc:'Αφορολόγητο ΦΜΑ έως €200.000 για ανύπαντρους, έως €275.000 για έγγαμους.'},
                {title:'Νέα Ακίνητα (ΦΠΑ)',desc:'Ακίνητα με άδεια μετά το 2006: ΦΠΑ 24% αντί ΦΜΑ 3%. Απαλλαγή έως 31/12/2024.'},
                {title:'Κτηματολόγιο',desc:'Σε περιοχές με ενεργό κτηματολόγιο απαιτείται εγγραφή. Κόστος ~0.5% επί αξίας.'},
              ].map((n,i)=>(
                <div key={i} style={{ background:'var(--bg-base)',border:'1px solid var(--border-subtle)',borderRadius:8,padding:'12px 14px' }}>
                  <div style={{ fontSize:12,fontWeight:500,color:'var(--accent)',fontFamily:"'Inter',sans-serif",marginBottom:6 }}>{n.title}</div>
                  <div style={{ fontSize:11,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif",lineHeight:1.6 }}>{n.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Ε2 HELPER ── */}
      {activeSection==='e2' && (
        <div>
          <div style={{ ...cardGap,border:'1px solid var(--accent-border)',background:'var(--accent-soft)' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14 }}>
              {sectionTitle('Εκτίμηση Φόρου Εισοδήματος Ακινήτων')}
              <select value={e2Year} onChange={e=>setE2Year(e.target.value)}
                style={{ ...inp,width:'auto',height:36,padding:'0 12px',fontSize:12 }}>
                {[new Date().getFullYear()-1,new Date().getFullYear()-2,new Date().getFullYear()-3]
                  .map(y=><option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:12,marginBottom:16 }}>
              <div>
                <label style={lbl}>Ετήσια Μισθώματα {e2Year} (€)</label>
                <input type="number" style={inp} value={e2Rent} onChange={e=>setE2Rent(e.target.value)}
                  placeholder="για παράδειγμα 8400 (700€/μήνα × 12)"/>
              </div>
              <div>
                <label style={lbl}>Εκπιπτόμενες Δαπάνες (€)</label>
                <input type="number" style={inp} value={e2Deductible} onChange={e=>setE2Deductible(e.target.value)}
                  placeholder="από TabΔαπάνες"/>
              </div>
            </div>

            {e2Result ? (
              <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:16 }}>
                {/* Left: KPIs */}
                <div>
                  <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:10,marginBottom:14 }}>
                    {[
                      {label:'Ακαθάριστα',value:fe(e2Result.taxable+parseFloat(e2Deductible)||0),color:'var(--positive)'},
                      {label:'Φορολογητέο',value:fe(e2Result.taxable),color:'var(--warning)'},
                      {label:'Φόρος',value:fe(e2Result.tax),color:'var(--negative)'},
                      {label:'Καθαρό/μήνα',value:fe(e2Result.netAfterTax/12),color:'var(--accent)'},
                    ].map((k,i)=>(
                      <div key={i} style={{ background:'var(--bg-base)',border:'1px solid var(--border-subtle)',borderRadius:10,padding:'12px 14px' }}>
                        <div style={{ fontSize:15,fontWeight:700,color:k.color,fontFamily:"'Inter', sans-serif",fontVariantNumeric:'tabular-nums',marginBottom:3 }}>{k.value}</div>
                        <div style={{ fontSize:9,textTransform:'uppercase',letterSpacing:'0.1em',color:'var(--text-tertiary)' }}>{k.label}</div>
                      </div>
                    ))}
                  </div>
                  {/* Bracket breakdown */}
                  <div style={{ background:'var(--bg-base)',border:'1px solid var(--border-subtle)',borderRadius:10,padding:14 }}>
                    {sectionTitle('Κλιμάκωση')}
                    {e2Result.breakdown.map((b,i)=>(
                      <div key={i} style={{ marginBottom:10 }}>
                        <div style={{ display:'flex',justifyContent:'space-between',marginBottom:3 }}>
                          <span style={{ fontSize:11,color:'var(--text-secondary)' }}>{b.label}</span>
                          <span style={{ fontSize:12,fontWeight:600,color:'var(--negative)',fontFamily:"'Inter', sans-serif",fontVariantNumeric:'tabular-nums' }}>{fe(b.tax)}</span>
                        </div>
                        <div style={{ height:4,background:'var(--border-subtle)',borderRadius:2 }}>
                          <div style={{ height:'100%',width:`${(b.taxable/(e2Result.taxable||1))*100}%`,background:'var(--negative)',borderRadius:2 }}/>
                        </div>
                      </div>
                    ))}
                    <div style={{ display:'flex',justifyContent:'space-between',paddingTop:8,borderTop:'1px solid var(--border-subtle)' }}>
                      <span style={{ fontSize:11,color:'var(--text-secondary)' }}>Πραγματικός Συντελεστής</span>
                      <span style={{ fontSize:13,fontWeight:700,color:'var(--negative)',fontFamily:"'Inter', sans-serif",fontVariantNumeric:'tabular-nums' }}>
                        {e2Result.effectiveRate.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: E2 codes + deadlines */}
                <div>
                  <div style={{ background:'var(--bg-base)',border:'1px solid var(--border-subtle)',borderRadius:10,padding:14,marginBottom:14 }}>
                    {sectionTitle('Κωδικοί Ε2, Τι να γράψεις')}
                    {[
                      {code:'Κωδ. 101',label:'Ακαθάριστα Μισθώματα',value:fe(parseFloat(e2Rent)||0),color:'var(--positive)'},
                      {code:'Κωδ. 102',label:'Εκπιπτόμενες Δαπάνες',value:fe(parseFloat(e2Deductible)||0),color:'var(--info)'},
                      {code:'Κωδ. 103',label:'Καθαρό Φορολογητέο',value:fe(e2Result.taxable),color:'var(--warning)'},
                      {code:'Κωδ. 401',label:'Φόρος Εισοδήματος',value:fe(e2Result.tax),color:'var(--negative)'},
                      {code:'Προκαταβολή 55%',label:'Επόμενο έτος',value:fe(e2Result.advance),color:'var(--warning)'},
                    ].map((row,i)=>(
                      <div key={i} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border-subtle)' }}>
                        <div>
                          <span style={{ fontSize:9,fontWeight:700,color:'var(--accent)',fontFamily:"'Inter',sans-serif",marginRight:8 }}>{row.code}</span>
                          <span style={{ fontSize:11,color:'var(--text-secondary)' }}>{row.label}</span>
                        </div>
                        <span style={{ fontSize:12,fontWeight:600,color:row.color,fontFamily:"'Inter', sans-serif",fontVariantNumeric:'tabular-nums' }}>{row.value}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ background:'var(--bg-base)',border:'1px solid var(--border-subtle)',borderRadius:10,padding:14,marginBottom:14 }}>
                    {sectionTitle('Σημαντικές Προθεσμίες')}
                    {[
                      {label:'Υποβολή Ε1/Ε2',desc:'30 Ιουνίου κάθε χρόνο',color:'var(--accent)'},
                      {label:'Καταχώρηση Μισθωτηρίου',desc:'Εντός 30 ημερών από υπογραφή',color:'var(--negative)'},
                      {label:'Ηλεκτρονική Πληρωμή',desc:'Έκπτωση 5% αν πληρώσεις online',color:'var(--positive)'},
                    ].map((d,i)=>(
                      <div key={i} style={{ display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border-subtle)' }}>
                        <div>
                          <div style={{ fontSize:12,fontWeight:500,color:d.color,fontFamily:"'Inter',sans-serif" }}>{d.label}</div>
                          <div style={{ fontSize:11,color:'var(--text-secondary)' }}>{d.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <a href="https://www.aade.gr/polites/foroi/foros-eisodematos" target="_blank" rel="noopener noreferrer"
                    style={{ display:'flex',alignItems:'center',gap:6,padding:'10px 14px',
                      background:'var(--accent-soft)',border:'1px solid var(--accent-border)',
                      borderRadius:8,textDecoration:'none',color:'var(--accent)',fontSize:12,
                      fontFamily:"'Inter',sans-serif",fontWeight:500 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    AADE.gr, Φορολογία Ακινήτων
                  </a>
                </div>
              </div>
            ) : (
              <div style={{ textAlign:'center',padding:'32px',color:'var(--text-tertiary)' }}>
                <div style={{ fontSize:13,fontFamily:"'Inter',sans-serif",marginBottom:6 }}>
                  Συμπλήρωσε τα ετήσια μισθώματα για υπολογισμό
                </div>
                <div style={{ fontSize:11 }}>Φορολογική κλίμακα: 15% / 25% / 35% / 45%</div>
              </div>
            )}
          </div>

          <div style={cardGap}>
            {sectionTitle('Αναλυτική Κατάσταση Ε2 (για λογιστή)')}
            <div style={{ fontSize:12,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif",lineHeight:1.6,marginBottom:14 }}>
              Κατέβασε αρχείο CSV με μία γραμμή ανά ακίνητο (ΑΤΑΚ, διεύθυνση, ποσοστό συνιδιοκτησίας, είδος μίσθωσης, μήνες, ακαθάριστο εισόδημα) για το έτος {e2Year}. Έτοιμο για αποστολή στον λογιστή σου.
            </div>
            <Btn variant="primary" onClick={async()=>{ const n = await runE2Export(supabase, String(userId), Number(e2Year)); if (!n) alert('Δεν βρέθηκαν ακίνητα για εξαγωγή.'); }}>Εξαγωγή Ε2 (CSV)</Btn>
            <div style={{ marginTop:12 }}>
              <InfoBanner tone="warning">Το «είδος μίσθωσης», η «κατηγορία εισοδήματος», οι «μήνες» και το «ακαθάριστο» συμπληρώνονται αυτόματα ως εκτίμηση από τα δεδομένα του ακινήτου· το ΑΤΑΚ και το ΑΦΜ αντλούνται από όσα έχεις καταχωρήσει. Έλεγξέ τα πριν την υποβολή στην ΑΑΔΕ.</InfoBanner>
            </div>
          </div>

          <div style={{ fontSize:11,color:'var(--text-tertiary)',textAlign:'center',fontFamily:"'Inter',sans-serif",lineHeight:1.6 }}>
            Εκτίμηση βάσει ισχύουσας νομοθεσίας. Δεν αποτελεί επίσημη φορολογική συμβουλή. Συμβουλευτείτε λογιστή.
          </div>
        </div>
      )}
    </div>
  );
}