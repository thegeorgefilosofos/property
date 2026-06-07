'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CustomSelect, DatePicker, NumberInput, TextInput, Textarea, Toggle } from './UIComponents';
import ExpenseAnalytics from './ExpenseAnalytics';

interface Expense {
  id: string; property_id: string; user_id: string;
  description: string; amount: number; category: string;
  expense_group: string | null; date: string; paid_by: string | null;
  payment_method: string | null; installments: number | null;
  amount_upfront: number | null; amount_per_installment: number | null;
  cashback_pct: number | null; cashback_amount: number | null;
  original_price: number | null; discount_amount: number | null;
  vat_rate: number | null; vat_amount: number | null;
  energy_class: string | null; serial_number: string | null;
  warranty_months: number | null; purchase_year: number | null;
  model_sku: string | null; store_vendor: string | null;
  is_recurring: boolean; recurring_frequency: string | null;
  notes: string | null; paid: boolean;
  vehicle_lease_model: string | null; vehicle_lease_months: number | null;
  vehicle_lease_monthly: number | null; vehicle_lease_type: string | null;
  vehicle_lease_count: number | null;
  broker_commission_pct: number | null; broker_commission_amount: number | null;
  travel_type: string | null; travel_destination: string | null;
  exhibition_name: string | null; exhibition_booth_cost: number | null;
  floor_type: string | null;
  appliance_lease_months: number | null; appliance_lease_monthly: number | null;
}

const EXPENSE_GROUPS: Record<string, { label: string; icon: string; categories: string[] }> = {
  fixed:{label:'Πάγιες Δαπάνες',icon:'📌',categories:['Ρεύμα','Νερό','Φυσικό Αέριο','Internet','Τηλέφωνο','Κοινόχρηστα','Ασφάλεια Κτιρίου','Ασφάλεια Περιεχομένου','ΕΝΦΙΑ','Χαρτόσημο','Δημοτικά Τέλη','Τέλη Καθαριότητας','Διαχείριση Πολυκατοικίας','Λογιστής/Φοροτεχνικός','Σύστημα Συναγερμού','Φύλαξη/Security','Parking Μηνιαίο','Άλλη Πάγια']},
  renovation:{label:'Ανακαίνιση & Βελτιώσεις',icon:'🔨',categories:['Βαφές & Χρώματα','Πλακάκια','Ξυλουργικά','Υδραυλικά','Ηλεκτρολογικά','Κλιματισμός','Θέρμανση','Μόνωση','Παράθυρα/Πόρτες','Αλουμίνια','Πατώματα (γενικά)','Παρκέ (τοποθέτηση)','Επισκευή Παρκέ','Λαμινέιτ','Μάρμαρο/Γρανίτης','Πλακάκια Δαπέδου','Οροφή/Γύψος','Κήπος/Εξωτερικοί Χώροι','Πισίνα','Τζάκι','Σοφίτα/Πατάρι','Γκαράζ','Ανελκυστήρας','Πρόσοψη Κτιρίου','Στέγη','Αποχέτευση','Άλλη Ανακαίνιση']},
  appliances:{label:'Συσκευές & Έπιπλα',icon:'🏠',categories:['Ψυγείο','Πλυντήριο Ρούχων','Στεγνωτήριο','Πλυντήριο Πιάτων','Φούρνος Κουζίνας','Εστίες/Κεραμικές','Απορροφητήρας','Φούρνος Μικροκυμάτων','Κλιματιστικό','Αντλία Θερμότητας','Boiler/Ηλιακός','Θερμοσίφωνας','Τηλεόραση','Soundbar/Ηχοσύστημα','Ηλεκτρική Σκούπα','Robot Σκούπα','Αφυγραντήρας','Καθαριστής Αέρα','Έπιπλα Σαλόνι','Καναπές/Πολυθρόνα','Κρεβάτι/Στρώμα','Ντουλάπα','Έπιπλα Κουζίνας','Νεροχύτης/Μπαταρία','Έπιπλα Μπάνιου','Ντους/Μπανιέρα','Λεκάνη/Καζανάκι','Φωτιστικά','Κουρτίνες/Ρολά','Χαλί','Εικόνες/Διακόσμηση','Smart Home Συσκευές','Smart Lock','Κάμερα Ασφαλείας','Doorbell','Άλλη Συσκευή/Έπιπλο']},
  appliance_lease:{label:'Leasing Συσκευών',icon:'🔄',categories:['Leasing Κλιματιστικού','Leasing Ψυγείου','Leasing Πλυντηρίου','Leasing Τηλεόρασης','Leasing Φωτοβολταϊκών','Leasing Αντλίας Θερμότητας','Leasing Άλλης Συσκευής']},
  maintenance:{label:'Συντήρηση',icon:'🔧',categories:['Καθαρισμός Κλιματιστικού','Συντήρηση Ηλιακού','Συντήρηση Αντλίας Θερμότητας','Συντήρηση Φωτοβολταϊκών','Αποφράξεις','Απεντόμωση','Μυοκτονία','Αποστείρωση','Καθαρισμός Δεξαμενής','Έλεγχος Ηλεκτρολογικής Εγκατάστασης','Τεχνικός Έλεγχος','Γενική Συντήρηση','Επισκευή Στέγης','Άλλη Συντήρηση']},
  vehicle_lease:{label:'Leasing Οχημάτων',icon:'🚗',categories:['Leasing Αυτοκινήτου','Leasing Βαν/Φορτηγού','Leasing Μοτοσυκλέτας','Leasing Ηλεκτρικού Οχήματος','Leasing Άλλου Οχήματος']},
  commercial:{label:'Εμπορικό/Επαγγελματικό',icon:'🏪',categories:['Πινακίδες/Branding','Εξοπλισμός Καταστήματος','Ταμειακή Μηχανή','POS Terminal','Σύστημα Ασφαλείας','Κάμερες CCTV','Ντεκόρ Βιτρίνας','Ράφια/Έπιπλα Κατ/τος','Ψυγείο Βιτρίνα','Επαγγελματική Κουζίνα','Εξοπλισμός Γραφείου','Εκτυπωτής/Scanner','Server/IT Εξοπλισμός','Συνδρομή Software','Άδεια Λειτουργίας','Πυρασφάλεια','Άλλο Εμπορικό']},
  broker:{label:'Μεσιτικές Δαπάνες',icon:'🤝',categories:['Μεσιτεία Ενοικίασης','Μεσιτεία Πώλησης','Μεσιτεία Αγοράς','Διαφήμιση Ακινήτου','Φωτογράφηση/Video','Αγγελίες (Spitogatos κλπ)','Έλεγχος Ενοικιαστή','Άλλη Μεσιτική Δαπάνη']},
  legal:{label:'Νομικά & Διοικητικά',icon:'⚖️',categories:['Συμβολαιογράφος','Δικηγόρος','Μηχανικός/Τοπογράφος','Ενεργειακός Επιθεωρητής (ΠΕΑ)','Άδεια Δόμησης','Άδεια Ανακαίνισης','Πολεοδομικά/Τακτοποίηση','Κτηματολόγιο','Εγγραφή Υποθήκης','Άρση Υποθήκης','Νομική Γνωμοδότηση','Φορολογικός Έλεγχος','Άλλο Νομικό']},
  travel:{label:'Μετακινήσεις & Ταξίδια',icon:'✈️',categories:['Αεροπορικά Εισιτήρια','Τρένο','Ακτοπλοϊκά','ΚΤΕΛ/Λεωφορείο','Ταξί/Uber','Ενοικίαση Αυτοκινήτου','Καύσιμα','Διόδια/Parking','Ξενοδοχείο','Airbnb/Διαμονή','Ημερήσια Αποζημίωση','Άλλη Μετακίνηση']},
  exhibition:{label:'Εκθέσεις & Events',icon:'🎪',categories:['Περίπτερο Έκθεσης','Εγγραφή/Είσοδος Έκθεσης','Μεταφορά Εκθεμάτων','Διαφημιστικό Υλικό','Προσωπικό Έκθεσης','Catering Έκθεσης','Έξοδα Networking Event','Σεμινάριο/Επιμόρφωση','Συνέδριο Κλάδου','Άλλο Έκθεσης']},
  tax:{label:'Φόροι & Τέλη',icon:'📊',categories:['Φόρος Μεταβίβασης','ΦΠΑ Ακινήτου','Φόρος Κληρονομιάς','Τέλος Χαρτοσήμου','Τέλη Μεταγραφής','Εισφορά Δήμου','Άλλος Φόρος']},
  other:{label:'Άλλες Δαπάνες',icon:'📦',categories:['Αποθήκευση/Μεταφορά','Καθαρισμός (εφάπαξ)','Φωτογράφηση Ακινήτου','Home Staging','Δώρα/Φιλοξενία','Αναλώσιμα','Misc','Άλλο']},
};

const PAYMENT_METHODS=[
  {value:'cash',label:'💵 Μετρητά',hasCashback:false,hasInstallments:false,interestRate:0},
  {value:'cash_black',label:'🤫 Μαύρα (Αδήλωτα)',hasCashback:false,hasInstallments:false,interestRate:0},
  {value:'family',label:'👨‍👩‍👧 Γονείς/Συγγενείς/Φίλοι',hasCashback:false,hasInstallments:false,interestRate:0},
  {value:'debit_cb',label:'💳 Χρεωστική με Cashback',hasCashback:true,hasInstallments:false,interestRate:0},
  {value:'debit_no_cb',label:'💳 Χρεωστική χωρίς Cashback',hasCashback:false,hasInstallments:false,interestRate:0},
  {value:'credit_free',label:'💳 Πιστωτική — Άτοκες Δόσεις',hasCashback:false,hasInstallments:true,interestRate:0},
  {value:'credit_interest',label:'💳 Πιστωτική — Έντοκες Δόσεις',hasCashback:false,hasInstallments:true,interestRate:18},
  {value:'klarna',label:'🛍 Klarna',hasCashback:false,hasInstallments:true,interestRate:0},
  {value:'tbi',label:'🏦 TBI Bank',hasCashback:false,hasInstallments:true,interestRate:12},
  {value:'snappi',label:'⚡ Snappi BNPL',hasCashback:true,hasInstallments:true,interestRate:0},
  {value:'kotsovolos',label:'🔌 Κωτσόβολος Πλάνο',hasCashback:false,hasInstallments:true,interestRate:0},
  {value:'plaisio4',label:'🖥 Πλαίσιο ×4',hasCashback:false,hasInstallments:true,interestRate:0},
  {value:'local_store',label:'🏪 Δόσεις Τοπικού Καταστήματος',hasCashback:false,hasInstallments:true,interestRate:0},
  {value:'promissory',label:'📜 Έντοκα Γραμμάτια',hasCashback:false,hasInstallments:true,interestRate:8},
  {value:'bank_transfer',label:'🏦 Τραπεζική Μεταφορά',hasCashback:false,hasInstallments:false,interestRate:0},
  {value:'check',label:'📄 Επιταγή',hasCashback:false,hasInstallments:false,interestRate:0},
];

const PAID_BY_OPTIONS=[{value:'owner',label:'Ιδιοκτήτης'},{value:'tenant',label:'Ενοικιαστής'},{value:'split',label:'50/50'},{value:'company',label:'Εταιρεία'}];
const ENERGY_CLASSES=['A+++','A++','A+','A','B','C','D','E','F','G'];
const VAT_RATES=[{value:'0',label:'0%'},{value:'6',label:'6%'},{value:'13',label:'13%'},{value:'24',label:'24%'}];
const RECURRING_FREQ=[{value:'monthly',label:'Μηνιαία'},{value:'quarterly',label:'Τριμηνιαία'},{value:'biannual',label:'Εξαμηνιαία'},{value:'annual',label:'Ετήσια'}];
const TRAVEL_TYPES=[{value:'flight',label:'✈️ Αεροπορικό'},{value:'train',label:'🚂 Τρένο'},{value:'ferry',label:'⛴ Ακτοπλοϊκό'},{value:'bus',label:'🚌 Λεωφορείο'},{value:'car',label:'🚗 Αυτοκίνητο'}];
const FLOOR_TYPES=[{value:'parquet',label:'Παρκέ'},{value:'laminate',label:'Laminate'},{value:'tile',label:'Πλακάκι'},{value:'marble',label:'Μάρμαρο'},{value:'granite',label:'Γρανίτης'},{value:'carpet',label:'Μοκέτα'},{value:'other',label:'Άλλο'}];
const VEHICLE_LEASE_TYPES=[{value:'fixed',label:'Fixed (Σταθερές Δόσεις)'},{value:'flexible',label:'Flexible (Ευέλικτο)'},{value:'operating',label:'Λειτουργική Μίσθωση'},{value:'financial',label:'Χρηματοδοτική Μίσθωση'}];

const INSTALLMENT_METHODS=PAYMENT_METHODS.filter(p=>p.hasInstallments).map(p=>p.value);
const CASHBACK_METHODS=PAYMENT_METHODS.filter(p=>p.hasCashback).map(p=>p.value);
const FLOOR_GROUPS=['renovation'];

const fmtEur=(n:number)=>`${n.toLocaleString('el-GR',{minimumFractionDigits:2,maximumFractionDigits:2})} €`;
const fmtD=(d:string)=>d?new Date(d+'T00:00:00').toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'numeric'}):'—';

const CAT_COLORS=['var(--accent)','var(--info)','var(--positive)','var(--warning)','var(--negative)','#8B5CF6','#06B6D4','#EC4899','#F97316','#10B981'];
const CAT_COLOR_MAP:Record<string,string>={};
let colorIdx=0;
function getCatColor(cat:string){if(!CAT_COLOR_MAP[cat]){CAT_COLOR_MAP[cat]=CAT_COLORS[colorIdx%CAT_COLORS.length];colorIdx++;}return CAT_COLOR_MAP[cat];}

const bestPayment=(a:number)=>a>=2000?'💡 Πιστωτική Άτοκες Δόσεις — μέγιστη ρευστότητα':a>=500?'💡 Χρεωστική με Cashback ή Πιστωτική Άτοκες':a>=100?'💡 Χρεωστική με Cashback':'💡 Μετρητά ή Χρεωστική';

const blank=()=>({
  description:'',amount:'',category:'',expense_group:'fixed',
  date:new Date().toISOString().split('T')[0],
  paid_by:'owner',payment_method:'cash',
  installments:'',amount_upfront:'',amount_per_installment:'',
  cashback_pct:'',cashback_amount:'',original_price:'',discount_amount:'',
  vat_rate:'24',vat_amount:'',energy_class:'',serial_number:'',
  warranty_months:'',purchase_year:new Date().getFullYear().toString(),
  model_sku:'',store_vendor:'',is_recurring:false,recurring_frequency:'monthly',
  notes:'',paid:true,
  vehicle_lease_model:'',vehicle_lease_months:'',vehicle_lease_monthly:'',
  vehicle_lease_type:'fixed',vehicle_lease_count:'1',
  broker_commission_pct:'',broker_commission_amount:'',
  travel_type:'flight',travel_destination:'',
  exhibition_name:'',exhibition_booth_cost:'',
  floor_type:'parquet',appliance_lease_months:'',appliance_lease_monthly:'',
  interest_rate:'',
});

function expenseToForm(e:Expense){
  return{
    description:e.description||'',amount:String(e.amount||''),
    category:e.category||'',expense_group:e.expense_group||'fixed',
    date:e.date||new Date().toISOString().split('T')[0],
    paid_by:e.paid_by||'owner',payment_method:e.payment_method||'cash',
    installments:String(e.installments||''),amount_upfront:String(e.amount_upfront||''),
    amount_per_installment:String(e.amount_per_installment||''),
    cashback_pct:String(e.cashback_pct||''),cashback_amount:String(e.cashback_amount||''),
    original_price:String(e.original_price||''),discount_amount:String(e.discount_amount||''),
    vat_rate:String(e.vat_rate||'24'),vat_amount:String(e.vat_amount||''),
    energy_class:e.energy_class||'',serial_number:e.serial_number||'',
    warranty_months:String(e.warranty_months||''),purchase_year:String(e.purchase_year||new Date().getFullYear()),
    model_sku:e.model_sku||'',store_vendor:e.store_vendor||'',
    is_recurring:e.is_recurring||false,recurring_frequency:e.recurring_frequency||'monthly',
    notes:e.notes||'',paid:e.paid??true,
    vehicle_lease_model:e.vehicle_lease_model||'',vehicle_lease_months:String(e.vehicle_lease_months||''),
    vehicle_lease_monthly:String(e.vehicle_lease_monthly||''),vehicle_lease_type:e.vehicle_lease_type||'fixed',
    vehicle_lease_count:String(e.vehicle_lease_count||'1'),
    broker_commission_pct:String(e.broker_commission_pct||''),broker_commission_amount:String(e.broker_commission_amount||''),
    travel_type:e.travel_type||'flight',travel_destination:e.travel_destination||'',
    exhibition_name:e.exhibition_name||'',exhibition_booth_cost:String(e.exhibition_booth_cost||''),
    floor_type:e.floor_type||'parquet',appliance_lease_months:String(e.appliance_lease_months||''),
    appliance_lease_monthly:String(e.appliance_lease_monthly||''),interest_rate:'',
  };
}

function SectionHeader({label}:{label:string}){
  return(
    <div style={{fontSize:'9px',letterSpacing:'0.16em',textTransform:'uppercase',color:'var(--accent)',display:'flex',alignItems:'center',gap:'8px',margin:'14px 0 8px'}}>
      <div style={{width:'4px',height:'4px',borderRadius:'50%',background:'var(--accent)'}}/>
      {label}
    </div>
  );
}

// ─── Installment Calculator ───────────────────────────────────────────────────
function InstallmentCalc({amount,installments,interestRate,startDate}:{amount:number;installments:number;interestRate:number;startDate:string}){
  if(!amount||installments<2) return null;
  const mr=interestRate/100/12;
  const mp=mr>0?amount*(mr*Math.pow(1+mr,installments))/(Math.pow(1+mr,installments)-1):amount/installments;
  const total=mp*installments;
  const interest=total-amount;
  const start=startDate?new Date(startDate+'T00:00:00'):new Date();
  const payoff=new Date(start);payoff.setMonth(payoff.getMonth()+installments);
  const payoffStr=payoff.toLocaleDateString('el-GR',{month:'long',year:'numeric'});
  const isInterestFree=interestRate===0;
  return(
    <div style={{background:'rgba(212,175,66,0.06)',border:'1px solid var(--border-accent)',borderRadius:'10px',padding:'12px 14px',marginBottom:'10px'}}>
      <div style={{fontSize:'9px',fontWeight:700,color:'var(--accent)',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:'10px'}}>🧮 Ανάλυση Δόσεων</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'8px',marginBottom:'10px'}}>
        {[
          {label:'Μηνιαία Δόση',value:fmtEur(mp),color:'var(--accent)'},
          {label:'Συνολικό Κόστος',value:fmtEur(total),color:isInterestFree?'var(--positive)':'var(--negative)'},
          {label:'Τόκοι',value:fmtEur(interest),color:interest>0?'var(--negative)':'var(--positive)'},
          {label:'Εξόφληση',value:payoffStr,color:'var(--info)',small:true},
        ].map((k,i)=>(
          <div key={i} style={{background:'var(--bg-elevated)',borderRadius:'6px',padding:'8px 10px'}}>
            <div style={{fontSize:k.small?'10px':'13px',fontWeight:700,color:k.color,fontFamily:"'JetBrains Mono',monospace",marginBottom:'2px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{k.value}</div>
            <div style={{fontSize:'8px',color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.08em'}}>{k.label}</div>
          </div>
        ))}
      </div>
      <div style={{background:isInterestFree?'rgba(52,217,123,0.06)':'rgba(239,68,68,0.06)',border:`1px solid ${isInterestFree?'var(--positive)':'var(--negative)'}`,borderRadius:'7px',padding:'8px 12px',fontSize:'11px',color:isInterestFree?'var(--positive)':'var(--negative)'}}>
        {isInterestFree
          ?'✅ Άτοκες δόσεις — δεν συμφέρει πρόωρη εξόφληση. Διατήρησε τη ρευστότητά σου.'
          :`⚠️ Πρόωρη εξόφληση: εξοικονομείς ${fmtEur(interest)} σε τόκους. Συμφέρει αν το επιτόκιο (${interestRate}%) υπερβαίνει αυτό των savings σου.`}
      </div>
    </div>
  );
}

// ─── Inline Edit Form (εμφανίζεται κάτω από τη γραμμή) ───────────────────────
function InlineEditForm({expense,onSave,onCancel,supabase,propertyId,userId}:{
  expense:Expense;onSave:()=>void;onCancel:()=>void;supabase:any;propertyId:string;userId:string;
}){
  const [form,setForm]=useState(expenseToForm(expense));
  const [saving,setSaving]=useState(false);
  const ref=useRef<HTMLTableRowElement>(null);
  const sf=(k:string,v:any)=>setForm(f=>({...f,[k]:v}));

  useEffect(()=>{ref.current?.scrollIntoView({behavior:'smooth',block:'nearest'});},[]);

  useEffect(()=>{
    if(CASHBACK_METHODS.includes(form.payment_method)&&form.cashback_pct&&form.amount)
      sf('cashback_amount',(parseFloat(form.amount)*parseFloat(form.cashback_pct)/100).toFixed(2));
  },[form.amount,form.cashback_pct,form.payment_method]);

  useEffect(()=>{
    if(form.amount&&form.vat_rate){
      const base=parseFloat(form.amount)/(1+parseFloat(form.vat_rate)/100);
      sf('vat_amount',(parseFloat(form.amount)-base).toFixed(2));
    }
  },[form.amount,form.vat_rate]);

  useEffect(()=>{
    if(form.installments&&form.amount)
      sf('amount_per_installment',(parseFloat(form.amount)/parseInt(form.installments)).toFixed(2));
  },[form.amount,form.installments]);

  useEffect(()=>{
    if(form.original_price&&form.amount&&parseFloat(form.original_price)>parseFloat(form.amount))
      sf('discount_amount',(parseFloat(form.original_price)-parseFloat(form.amount)).toFixed(2));
  },[form.original_price,form.amount]);

  const hasInstallments=INSTALLMENT_METHODS.includes(form.payment_method);
  const hasCashback=CASHBACK_METHODS.includes(form.payment_method);
  const currentPM=PAYMENT_METHODS.find(p=>p.value===form.payment_method);
  const effectiveRate=form.interest_rate?parseFloat(form.interest_rate):(currentPM?.interestRate||0);

  const save=async()=>{
    if(!form.description||!form.amount) return;

    // Future date warning
    const selectedDate=new Date(form.date+'T00:00:00');
    const today=new Date();today.setHours(0,0,0,0);
    if(selectedDate>today){
      const ok=window.confirm(`⚠️ Η ημερομηνία ${fmtD(form.date)} είναι στο μέλλον.\n\nΕίσαι σίγουρος ότι θέλεις να καταγράψεις αυτή τη δαπάνη;`);
      if(!ok) return;
    }

    setSaving(true);
    const n=(v:string)=>v?parseFloat(v):null;
    const ni=(v:string)=>v?parseInt(v):null;
    const{error}=await supabase.from('expenses').update({
      description:form.description,amount:parseFloat(form.amount),
      category:form.category,expense_group:form.expense_group,
      date:form.date,paid_by:form.paid_by||'owner',
      payment_method:form.payment_method||null,
      installments:ni(form.installments),amount_upfront:n(form.amount_upfront),
      amount_per_installment:n(form.amount_per_installment),
      cashback_pct:n(form.cashback_pct),cashback_amount:n(form.cashback_amount),
      original_price:n(form.original_price),discount_amount:n(form.discount_amount),
      vat_rate:n(form.vat_rate),vat_amount:n(form.vat_amount),
      energy_class:form.energy_class||null,serial_number:form.serial_number||null,
      warranty_months:ni(form.warranty_months),purchase_year:ni(form.purchase_year),
      model_sku:form.model_sku||null,store_vendor:form.store_vendor||null,
      is_recurring:form.is_recurring,recurring_frequency:form.is_recurring?form.recurring_frequency:null,
      notes:form.notes||null,paid:form.paid,
      vehicle_lease_model:form.vehicle_lease_model||null,
      vehicle_lease_months:ni(form.vehicle_lease_months),vehicle_lease_monthly:n(form.vehicle_lease_monthly),
      vehicle_lease_type:form.vehicle_lease_type||null,vehicle_lease_count:ni(form.vehicle_lease_count),
      broker_commission_pct:n(form.broker_commission_pct),broker_commission_amount:n(form.broker_commission_amount),
      travel_type:form.travel_type||null,travel_destination:form.travel_destination||null,
      exhibition_name:form.exhibition_name||null,exhibition_booth_cost:n(form.exhibition_booth_cost),
      floor_type:FLOOR_GROUPS.includes(form.expense_group)?form.floor_type||null:null,
      appliance_lease_months:ni(form.appliance_lease_months),appliance_lease_monthly:n(form.appliance_lease_monthly),
    }).eq('id',expense.id);
    setSaving(false);
    if(error){alert('Σφάλμα: '+error.message);return;}
    onSave();
  };

  const g2:React.CSSProperties={display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'10px'};
  const g3:React.CSSProperties={display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px',marginBottom:'10px'};
  const g4:React.CSSProperties={display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:'10px',marginBottom:'10px'};

  return(
    <tr ref={ref}>
      <td colSpan={10} style={{padding:0}}>
        <div style={{background:'rgba(6,182,212,0.04)',border:'1px solid var(--info)',borderTop:'none',borderRadius:'0 0 10px 10px',padding:'16px 20px',animation:'slideDown 0.2s ease'}}>
          <style>{`@keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}`}</style>

          <div style={{fontSize:'10px',fontWeight:700,color:'var(--info)',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:'14px',display:'flex',alignItems:'center',gap:'8px'}}>
            <span style={{width:'4px',height:'4px',borderRadius:'50%',background:'var(--info)',display:'inline-block'}}/>
            Επεξεργασία: {expense.description}
          </div>

          {/* Βασικά */}
          <div style={g4}>
            <CustomSelect label="Ομάδα" value={form.expense_group} onChange={v=>sf('expense_group',v)}
              options={Object.entries(EXPENSE_GROUPS).map(([k,v])=>({value:k,label:`${v.icon} ${v.label}`}))}/>
            <CustomSelect label="Κατηγορία" value={form.category} onChange={v=>sf('category',v)}
              options={(EXPENSE_GROUPS[form.expense_group]?.categories||[]).map(c=>({value:c,label:c}))}/>
            <DatePicker label="Ημερομηνία" value={form.date} onChange={v=>sf('date',v)}/>
            <CustomSelect label="Πληρώνει" value={form.paid_by} onChange={v=>sf('paid_by',v)} options={PAID_BY_OPTIONS}/>
          </div>
          <div style={g2}>
            <TextInput label="Περιγραφή *" value={form.description} onChange={v=>sf('description',v)} placeholder="Περιγραφή"/>
            <TextInput label="Κατάστημα / Πάροχος" value={form.store_vendor} onChange={v=>sf('store_vendor',v)} placeholder="π.χ. Κωτσόβολος"/>
          </div>

          <SectionHeader label="Τιμή & ΦΠΑ"/>
          <div style={g4}>
            <NumberInput label="Τελική Τιμή *" value={form.amount} onChange={v=>sf('amount',v)} suffix="€" step={0.01}/>
            <NumberInput label="Αρχική Τιμή" value={form.original_price} onChange={v=>sf('original_price',v)} suffix="€" step={0.01}/>
            <CustomSelect label="ΦΠΑ %" value={form.vat_rate} onChange={v=>sf('vat_rate',v)} options={VAT_RATES}/>
            <div>
              <label style={{fontSize:'9px',letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--text-secondary)',display:'block',marginBottom:'5px'}}>ΦΠΑ Ποσό</label>
              <div style={{padding:'9px 12px',background:'var(--bg-base)',border:'1px solid var(--border-subtle)',borderRadius:'8px',fontSize:'13px',color:'var(--warning)',fontFamily:"'JetBrains Mono',monospace"}}>
                {form.vat_amount?`${form.vat_amount} €`:'—'}
              </div>
            </div>
          </div>

          <SectionHeader label="Τρόπος Πληρωμής"/>
          <div style={g4}>
            <CustomSelect label="Τρόπος Πληρωμής" value={form.payment_method} onChange={v=>sf('payment_method',v)}
              options={PAYMENT_METHODS.map(p=>({value:p.value,label:p.label}))}/>
            {hasInstallments&&<>
              <NumberInput label="Δόσεις" value={form.installments} onChange={v=>sf('installments',v)} suffix="δόσεις"/>
              <NumberInput label="Άμεση Πληρωμή" value={form.amount_upfront} onChange={v=>sf('amount_upfront',v)} suffix="€" step={0.01}/>
              <NumberInput label="Επιτόκιο %" value={form.interest_rate} onChange={v=>sf('interest_rate',v)} suffix="%" step={0.1}/>
            </>}
            {hasCashback&&!hasInstallments&&<>
              <NumberInput label="Cashback %" value={form.cashback_pct} onChange={v=>sf('cashback_pct',v)} suffix="%" step={0.1}/>
              <div>
                <label style={{fontSize:'9px',letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--text-secondary)',display:'block',marginBottom:'5px'}}>Cashback Ποσό</label>
                <div style={{padding:'9px 12px',background:'var(--bg-base)',border:'1px solid var(--border-subtle)',borderRadius:'8px',fontSize:'13px',color:'var(--positive)',fontFamily:"'JetBrains Mono',monospace"}}>
                  {form.cashback_amount?`+${form.cashback_amount} €`:'—'}
                </div>
              </div>
            </>}
          </div>

          {hasInstallments&&form.amount&&form.installments&&parseInt(form.installments)>=2&&(
            <InstallmentCalc amount={parseFloat(form.amount)} installments={parseInt(form.installments)} interestRate={effectiveRate} startDate={form.date}/>
          )}

          <SectionHeader label="Επιπλέον"/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:'10px',marginBottom:'10px',alignItems:'start'}}>
            <div>
              <label style={{fontSize:'9px',letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--text-secondary)',display:'block',marginBottom:'8px'}}>Επαναλαμβανόμενη</label>
              <Toggle on={form.is_recurring} onChange={v=>sf('is_recurring',v)} label="Ναι" labelOff="Όχι"/>
            </div>
            {form.is_recurring&&<CustomSelect label="Συχνότητα" value={form.recurring_frequency} onChange={v=>sf('recurring_frequency',v)} options={RECURRING_FREQ}/>}
            <div>
              <label style={{fontSize:'9px',letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--text-secondary)',display:'block',marginBottom:'8px'}}>Εξοφλήθη</label>
              <Toggle on={form.paid} onChange={v=>sf('paid',v)} label="Ναι" labelOff="Όχι"/>
            </div>
          </div>
          <Textarea label="Σημειώσεις" value={form.notes} onChange={v=>sf('notes',v)} placeholder="Σημειώσεις..."/>

          <div style={{display:'flex',gap:'10px',justifyContent:'flex-end',marginTop:'14px'}}>
            <button onClick={onCancel} style={{background:'transparent',color:'var(--text-secondary)',border:'1px solid var(--border-default)',borderRadius:'8px',padding:'8px 16px',fontSize:'11px',cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
              Ακύρωση
            </button>
            <button onClick={save} disabled={saving||!form.description||!form.amount}
              style={{background:'var(--info)',color:'#fff',border:'none',borderRadius:'8px',padding:'9px 20px',fontSize:'12px',fontWeight:700,cursor:'pointer',fontFamily:'Inter,sans-serif',opacity:saving?0.7:1}}>
              {saving?'Αποθήκευση...':'💾 Αποθήκευση Αλλαγών'}
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

export default function TabExpenses({propertyId,userId}:{propertyId:string;userId:string}){
  const supabase=createClient();
  const [expenses,setExpenses]=useState<Expense[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [showForm,setShowForm]=useState(false);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [form,setForm]=useState(blank());
  const [filterGroup,setFilterGroup]=useState('all');
  const [filterPaidBy,setFilterPaidBy]=useState('all');
  const [ok,setOk]=useState<string|null>(null);
  const sf=(k:string,v:any)=>setForm(f=>({...f,[k]:v}));

  useEffect(()=>{
    if(CASHBACK_METHODS.includes(form.payment_method)&&form.cashback_pct&&form.amount)
      sf('cashback_amount',(parseFloat(form.amount)*parseFloat(form.cashback_pct)/100).toFixed(2));
  },[form.amount,form.cashback_pct,form.payment_method]);

  useEffect(()=>{
    if(form.amount&&form.vat_rate){
      const base=parseFloat(form.amount)/(1+parseFloat(form.vat_rate)/100);
      sf('vat_amount',(parseFloat(form.amount)-base).toFixed(2));
    }
  },[form.amount,form.vat_rate]);

  useEffect(()=>{
    if(form.installments&&form.amount)
      sf('amount_per_installment',(parseFloat(form.amount)/parseInt(form.installments)).toFixed(2));
  },[form.amount,form.installments]);

  useEffect(()=>{
    if(form.original_price&&form.amount&&parseFloat(form.original_price)>parseFloat(form.amount))
      sf('discount_amount',(parseFloat(form.original_price)-parseFloat(form.amount)).toFixed(2));
  },[form.original_price,form.amount]);

  useEffect(()=>{
    if(form.broker_commission_pct&&form.amount)
      sf('broker_commission_amount',(parseFloat(form.amount)*parseFloat(form.broker_commission_pct)/100).toFixed(2));
  },[form.amount,form.broker_commission_pct]);

  useEffect(()=>{
    if(!editingId){
      const cats=EXPENSE_GROUPS[form.expense_group]?.categories||[];
      sf('category',cats[0]||'');
    }
  },[form.expense_group]);

  const load=useCallback(async()=>{
    setLoading(true);
    const{data}=await supabase.from('expenses').select('*')
      .eq('property_id',propertyId).eq('user_id',userId)
      .neq('category','tenant_extra')
      .order('date',{ascending:false});
    setExpenses(data||[]);
    setLoading(false);
  },[propertyId,userId]);

  useEffect(()=>{load();},[load]);
  const notify=(msg:string)=>{setOk(msg);setTimeout(()=>setOk(null),3000);};

  const save=async()=>{
    if(!form.description||!form.amount||!form.date) return;

    // Future date warning
    const selectedDate=new Date(form.date+'T00:00:00');
    const today=new Date();today.setHours(0,0,0,0);
    if(selectedDate>today){
      const confirmed=window.confirm(`⚠️ Η ημερομηνία ${fmtD(form.date)} είναι στο μέλλον.\n\nΕίσαι σίγουρος ότι θέλεις να καταγράψεις αυτή τη δαπάνη;`);
      if(!confirmed) return;
    }

    setSaving(true);
    const n=(v:string)=>v?parseFloat(v):null;
    const ni=(v:string)=>v?parseInt(v):null;
    const payload={
      property_id:propertyId,user_id:userId,
      description:form.description,amount:parseFloat(form.amount),
      category:form.category,expense_group:form.expense_group,
      date:form.date,paid_by:form.paid_by||'owner',
      payment_method:form.payment_method||null,
      installments:ni(form.installments),amount_upfront:n(form.amount_upfront),
      amount_per_installment:n(form.amount_per_installment),
      cashback_pct:n(form.cashback_pct),cashback_amount:n(form.cashback_amount),
      original_price:n(form.original_price),discount_amount:n(form.discount_amount),
      vat_rate:n(form.vat_rate),vat_amount:n(form.vat_amount),
      energy_class:form.energy_class||null,serial_number:form.serial_number||null,
      warranty_months:ni(form.warranty_months),purchase_year:ni(form.purchase_year),
      model_sku:form.model_sku||null,store_vendor:form.store_vendor||null,
      is_recurring:form.is_recurring,recurring_frequency:form.is_recurring?form.recurring_frequency:null,
      notes:form.notes||null,paid:form.paid,
      vehicle_lease_model:form.vehicle_lease_model||null,
      vehicle_lease_months:ni(form.vehicle_lease_months),vehicle_lease_monthly:n(form.vehicle_lease_monthly),
      vehicle_lease_type:form.vehicle_lease_type||null,vehicle_lease_count:ni(form.vehicle_lease_count),
      broker_commission_pct:n(form.broker_commission_pct),broker_commission_amount:n(form.broker_commission_amount),
      travel_type:form.travel_type||null,travel_destination:form.travel_destination||null,
      exhibition_name:form.exhibition_name||null,exhibition_booth_cost:n(form.exhibition_booth_cost),
      floor_type:FLOOR_GROUPS.includes(form.expense_group)?form.floor_type||null:null,
      appliance_lease_months:ni(form.appliance_lease_months),appliance_lease_monthly:n(form.appliance_lease_monthly),
    };
    const{error}=await supabase.from('expenses').insert(payload);
    setSaving(false);
    if(error){alert('Σφάλμα: '+error.message);return;}
    setShowForm(false);setForm(blank());
    notify('Η δαπάνη καταχωρήθηκε');load();
  };

  const del=async(id:string)=>{
    if(!confirm('Διαγραφή δαπάνης;'))return;
    await supabase.from('expenses').delete().eq('id',id);
    setExpenses(p=>p.filter(e=>e.id!==id));
    if(editingId===id)setEditingId(null);
  };

  const hasInstallments=INSTALLMENT_METHODS.includes(form.payment_method);
  const hasCashback=CASHBACK_METHODS.includes(form.payment_method);
  const currentPM=PAYMENT_METHODS.find(p=>p.value===form.payment_method);
  const effectiveRate=form.interest_rate?parseFloat(form.interest_rate):(currentPM?.interestRate||0);

  const filtered=expenses.filter(e=>{
    if(filterGroup!=='all'&&e.expense_group!==filterGroup)return false;
    if(filterPaidBy!=='all'&&e.paid_by!==filterPaidBy)return false;
    return true;
  });

  const total=filtered.reduce((s,e)=>s+e.amount,0);
  const totalCashback=filtered.reduce((s,e)=>s+(e.cashback_amount||0),0);
  const totalVat=filtered.reduce((s,e)=>s+(e.vat_amount||0),0);
  const totalOwner=filtered.filter(e=>!e.paid_by||e.paid_by==='owner').reduce((s,e)=>s+e.amount,0);
  const totalTenant=filtered.filter(e=>e.paid_by==='tenant').reduce((s,e)=>s+e.amount,0);

  const groupOptions=[{value:'all',label:'Όλες οι Ομάδες'},...Object.entries(EXPENSE_GROUPS).map(([k,v])=>({value:k,label:`${v.icon} ${v.label}`}))];
  const paidByOptions=[{value:'all',label:'Όλοι'},...PAID_BY_OPTIONS];

  const g2:React.CSSProperties={display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:'12px'};
  const g3:React.CSSProperties={display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'12px',marginBottom:'12px'};
  const g4:React.CSSProperties={display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:'12px',marginBottom:'12px'};

  return(
    <div style={{fontFamily:'Inter,sans-serif',color:'var(--text-primary)'}}>

      {ok&&<div style={{background:'var(--positive-dim)',border:'1px solid var(--positive)',borderRadius:'8px',padding:'10px 16px',marginBottom:'14px',color:'var(--positive)',fontSize:'12px'}}>✓ {ok}</div>}

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
        <div style={{fontSize:'13px',fontWeight:600,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.1em'}}>Δαπάνες Ακινήτου</div>
        <button onClick={()=>{setShowForm(v=>!v);setEditingId(null);}}
          style={{background:'var(--accent)',color:'var(--bg-base)',padding:'9px 20px',borderRadius:'8px',fontWeight:700,fontSize:'13px',border:'none',cursor:'pointer',whiteSpace:'nowrap'}}>
          {showForm?'✕ Κλείσιμο':'+ Νέα Δαπάνη'}
        </button>
      </div>

      {/* New expense form */}
      {showForm&&(
        <div style={{background:'var(--bg-surface)',border:'1px solid var(--border-accent)',borderRadius:'12px',padding:'22px',marginBottom:'20px'}}>
          <div style={{fontSize:'11px',fontWeight:600,color:'var(--accent)',marginBottom:'18px',display:'flex',alignItems:'center',gap:'8px'}}>
            <span style={{width:'4px',height:'4px',borderRadius:'50%',background:'var(--accent)',display:'inline-block'}}/>
            Νέα Δαπάνη
          </div>
          <div style={g4}>
            <CustomSelect label="Ομάδα Δαπάνης" value={form.expense_group} onChange={v=>sf('expense_group',v)}
              options={Object.entries(EXPENSE_GROUPS).map(([k,v])=>({value:k,label:`${v.icon} ${v.label}`}))}/>
            <CustomSelect label="Κατηγορία" value={form.category} onChange={v=>sf('category',v)}
              options={(EXPENSE_GROUPS[form.expense_group]?.categories||[]).map(c=>({value:c,label:c}))}/>
            <DatePicker label="Ημερομηνία" value={form.date} onChange={v=>sf('date',v)}/>
            <CustomSelect label="Πληρώνει" value={form.paid_by} onChange={v=>sf('paid_by',v)} options={PAID_BY_OPTIONS}/>
          </div>
          <div style={g2}>
            <TextInput label="Περιγραφή *" value={form.description} onChange={v=>sf('description',v)} placeholder="π.χ. Αντικατάσταση ψυγείου Bosch"/>
            <TextInput label="Κατάστημα / Πάροχος" value={form.store_vendor} onChange={v=>sf('store_vendor',v)} placeholder="π.χ. Κωτσόβολος, ΔΕΗ"/>
          </div>
          <SectionHeader label="Τιμή & ΦΠΑ"/>
          <div style={g4}>
            <NumberInput label="Τελική Τιμή *" value={form.amount} onChange={v=>sf('amount',v)} suffix="€" step={0.01}/>
            <NumberInput label="Αρχική Τιμή" value={form.original_price} onChange={v=>sf('original_price',v)} suffix="€" step={0.01}/>
            <CustomSelect label="Συντελεστής ΦΠΑ" value={form.vat_rate} onChange={v=>sf('vat_rate',v)} options={VAT_RATES}/>
            <div>
              <label style={{fontSize:'9px',letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--text-secondary)',display:'block',marginBottom:'5px'}}>ΦΠΑ Ποσό</label>
              <div style={{padding:'9px 12px',background:'var(--bg-base)',border:'1px solid var(--border-subtle)',borderRadius:'8px',fontSize:'13px',color:'var(--warning)',fontFamily:"'JetBrains Mono',monospace"}}>
                {form.vat_amount?`${form.vat_amount} €`:'—'}
              </div>
            </div>
          </div>
          {form.discount_amount&&parseFloat(form.discount_amount)>0&&(
            <div style={{background:'var(--positive-dim)',border:'1px solid var(--positive)',borderRadius:'8px',padding:'10px 14px',marginBottom:'12px',fontSize:'12px',color:'var(--positive)'}}>
              ✓ Εξοικονόμηση: <strong>{form.discount_amount} €</strong>
              {form.original_price&&form.amount&&<span style={{marginLeft:'8px'}}>({(((parseFloat(form.original_price)-parseFloat(form.amount))/parseFloat(form.original_price))*100).toFixed(1)}% έκπτωση)</span>}
            </div>
          )}
          <SectionHeader label="Τρόπος Πληρωμής"/>
          <div style={g4}>
            <CustomSelect label="Τρόπος Πληρωμής" value={form.payment_method} onChange={v=>sf('payment_method',v)}
              options={PAYMENT_METHODS.map(p=>({value:p.value,label:p.label}))}/>
            {hasInstallments&&<>
              <NumberInput label="Αριθμός Δόσεων" value={form.installments} onChange={v=>sf('installments',v)} suffix="δόσεις"/>
              <NumberInput label="Άμεση Πληρωμή" value={form.amount_upfront} onChange={v=>sf('amount_upfront',v)} suffix="€" step={0.01}/>
              <NumberInput label="Επιτόκιο % (ετήσιο)" value={form.interest_rate} onChange={v=>sf('interest_rate',v)} suffix="%" step={0.1}/>
            </>}
            {hasCashback&&!hasInstallments&&<>
              <NumberInput label="Cashback %" value={form.cashback_pct} onChange={v=>sf('cashback_pct',v)} suffix="%" step={0.1} max={100}/>
              <div>
                <label style={{fontSize:'9px',letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--text-secondary)',display:'block',marginBottom:'5px'}}>Cashback Ποσό</label>
                <div style={{padding:'9px 12px',background:'var(--bg-base)',border:'1px solid var(--border-subtle)',borderRadius:'8px',fontSize:'13px',color:'var(--positive)',fontFamily:"'JetBrains Mono',monospace"}}>
                  {form.cashback_amount?`+${form.cashback_amount} €`:'—'}
                </div>
              </div>
            </>}
          </div>
          {hasInstallments&&form.amount&&form.installments&&parseInt(form.installments)>=2&&(
            <InstallmentCalc amount={parseFloat(form.amount)} installments={parseInt(form.installments)} interestRate={effectiveRate} startDate={form.date}/>
          )}
          {form.amount&&parseFloat(form.amount)>0&&!hasInstallments&&(
            <div style={{background:'var(--info-dim)',border:'1px solid var(--info)',borderRadius:'8px',padding:'10px 14px',marginBottom:'12px',fontSize:'12px',color:'var(--info)'}}>
              {bestPayment(parseFloat(form.amount))}
            </div>
          )}
          <SectionHeader label="Επιπλέον Στοιχεία"/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:'12px',marginBottom:'12px',alignItems:'start'}}>
            <div>
              <label style={{fontSize:'9px',letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--text-secondary)',display:'block',marginBottom:'8px'}}>Επαναλαμβανόμενη</label>
              <Toggle on={form.is_recurring} onChange={v=>sf('is_recurring',v)} label="Ναι" labelOff="Όχι"/>
            </div>
            {form.is_recurring&&<CustomSelect label="Συχνότητα" value={form.recurring_frequency} onChange={v=>sf('recurring_frequency',v)} options={RECURRING_FREQ}/>}
            <div>
              <label style={{fontSize:'9px',letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--text-secondary)',display:'block',marginBottom:'8px'}}>Εξοφλήθη</label>
              <Toggle on={form.paid} onChange={v=>sf('paid',v)} label="Ναι" labelOff="Όχι"/>
            </div>
          </div>
          <Textarea label="Σημειώσεις" value={form.notes} onChange={v=>sf('notes',v)} placeholder="π.χ. Αγοράστηκε στα Black Friday, εγγύηση έως 05/2028..."/>
          <div style={{display:'flex',gap:'10px',justifyContent:'flex-end',marginTop:'16px'}}>
            <button onClick={()=>{setShowForm(false);setForm(blank());}} style={{background:'transparent',color:'var(--text-secondary)',border:'1px solid var(--border-default)',borderRadius:'8px',padding:'8px 14px',fontSize:'11px',fontFamily:'Inter,sans-serif',cursor:'pointer'}}>Ακύρωση</button>
            <button onClick={save} disabled={saving||!form.description||!form.amount}
              style={{background:'var(--accent)',color:'var(--accent-text)',border:'none',borderRadius:'8px',padding:'9px 18px',fontSize:'12px',fontWeight:700,fontFamily:'Inter,sans-serif',cursor:'pointer',opacity:saving?0.7:1}}>
              {saving?'Αποθήκευση...':'Καταχώρηση'}
            </button>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'10px',marginBottom:'16px'}}>
        {[
          {label:'Σύνολο Δαπανών',value:fmtEur(total),color:'var(--negative)'},
          {label:'Κόστος Ιδιοκτ.',value:fmtEur(totalOwner),color:'var(--warning)'},
          {label:'Κόστος Ενοικ.',value:fmtEur(totalTenant),color:'var(--info)'},
          {label:'Συνολικό Cashback',value:fmtEur(totalCashback),color:'var(--positive)'},
          {label:'Σύνολο ΦΠΑ',value:fmtEur(totalVat),color:'var(--accent)'},
        ].map((k,i)=>(
          <div key={i} style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:'10px',padding:'14px 16px',textAlign:'center'}}>
            <div style={{fontSize:'17px',fontWeight:700,color:k.color,fontFamily:"'JetBrains Mono',monospace",letterSpacing:'-0.5px',marginBottom:'5px'}}>{k.value}</div>
            <div style={{fontSize:'9px',letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-secondary)'}}>{k.label}</div>
          </div>
        ))}
      </div>

      <ExpenseAnalytics expenses={expenses}/>

      {/* Filters */}
      <div style={{display:'flex',gap:'10px',marginBottom:'16px',alignItems:'flex-end',flexWrap:'wrap'}}>
        <div style={{flex:2,minWidth:'200px'}}>
          <CustomSelect label="Ομάδα" value={filterGroup} onChange={v=>setFilterGroup(v)} options={groupOptions}/>
        </div>
        <div style={{flex:1,minWidth:'140px'}}>
          <CustomSelect label="Πληρώνει" value={filterPaidBy} onChange={setFilterPaidBy} options={paidByOptions}/>
        </div>
      </div>

      {/* List */}
      {loading?(
        <div style={{textAlign:'center',padding:'48px',color:'var(--text-tertiary)',fontSize:'12px',letterSpacing:'0.1em'}}>ΦΟΡΤΩΣΗ...</div>
      ):filtered.length===0?(
        <div style={{textAlign:'center',padding:'64px',color:'var(--text-tertiary)'}}>
          <div style={{fontSize:'32px',opacity:0.2,marginBottom:'12px'}}>📋</div>
          <div style={{fontSize:'12px',letterSpacing:'0.1em',textTransform:'uppercase'}}>Δεν υπάρχουν δαπάνες</div>
        </div>
      ):(
        <>
          {Object.entries(EXPENSE_GROUPS).map(([groupKey,groupInfo])=>{
            const groupExp=filtered.filter(e=>e.expense_group===groupKey);
            if(groupExp.length===0) return null;
            const groupTotal=groupExp.reduce((s,e)=>s+e.amount,0);
            return(
              <div key={groupKey} style={{background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:'12px',marginBottom:'12px',overflow:'hidden'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 18px',borderBottom:'1px solid var(--border-subtle)',background:'var(--bg-elevated)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                    <span style={{fontSize:'15px'}}>{groupInfo.icon}</span>
                    <span style={{fontSize:'12px',fontWeight:600,color:'var(--text-primary)'}}>{groupInfo.label}</span>
                    <span style={{fontSize:'10px',color:'var(--text-secondary)',background:'var(--bg-overlay)',padding:'2px 8px',borderRadius:'4px'}}>{groupExp.length}</span>
                  </div>
                  <span style={{fontSize:'13px',fontWeight:700,color:'var(--negative)',fontFamily:"'JetBrains Mono',monospace"}}>{fmtEur(groupTotal)}</span>
                </div>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12px'}}>
                  <thead>
                    <tr>
                      {['Ημ/νία','Κατηγορία','Περιγραφή','Πληρώνει','Κατάστημα','Πληρωμή','ΦΠΑ','Cashback','Τιμή',''].map((h,i)=>(
                        <th key={i} style={{fontSize:'8px',letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-secondary)',padding:'7px 10px',borderBottom:'1px solid var(--border-subtle)',textAlign:'left',fontWeight:400}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groupExp.map(e=>{
                      const pm=PAYMENT_METHODS.find(p=>p.value===e.payment_method);
                      const paidByLabel=PAID_BY_OPTIONS.find(p=>p.value===e.paid_by)?.label||e.paid_by;
                      const paidByColor=e.paid_by==='tenant'?'var(--info)':e.paid_by==='split'?'var(--accent)':'var(--warning)';
                      const isEditing=editingId===e.id;
                      return(
                        <>
                          <tr key={e.id}
                            style={{background:isEditing?'rgba(6,182,212,0.06)':'transparent',borderBottom:isEditing?'none':'undefined'}}
                            onMouseEnter={ev=>{if(!isEditing)ev.currentTarget.style.background='var(--bg-hover)';}}
                            onMouseLeave={ev=>{if(!isEditing)ev.currentTarget.style.background='transparent';}}>
                            <td style={{padding:'9px 10px',color:'var(--text-secondary)',fontSize:'11px'}}>{fmtD(e.date)}</td>
                            <td style={{padding:'9px 10px'}}>
                              <span style={{display:'inline-block',padding:'2px 7px',borderRadius:'4px',fontSize:'9px',fontWeight:600,letterSpacing:'0.05em',textTransform:'uppercase',background:`${getCatColor(e.category)}20`,color:getCatColor(e.category)}}>{e.category}</span>
                            </td>
                            <td style={{padding:'9px 10px',color:'var(--text-primary)',maxWidth:'200px'}}>
                              <div style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{e.description}</div>
                              {e.model_sku&&<div style={{fontSize:'10px',color:'var(--text-tertiary)'}}>{e.model_sku}</div>}
                              {e.energy_class&&<span style={{fontSize:'9px',background:'var(--positive-dim)',color:'var(--positive)',padding:'1px 5px',borderRadius:'3px',display:'inline-block'}}>Κλάση {e.energy_class}</span>}
                              {e.is_recurring&&<span style={{fontSize:'9px',background:'var(--info-dim)',color:'var(--info)',padding:'1px 5px',borderRadius:'3px',display:'inline-block',marginLeft:'3px'}}>↻</span>}
                            </td>
                            <td style={{padding:'9px 10px'}}><span style={{fontSize:'10px',fontWeight:600,color:paidByColor}}>{paidByLabel}</span></td>
                            <td style={{padding:'9px 10px',color:'var(--text-secondary)',fontSize:'11px'}}>{e.store_vendor||'—'}</td>
                            <td style={{padding:'9px 10px',color:'var(--text-secondary)',fontSize:'11px'}}>
                              <div>{pm?.label.replace(/^.+?\s/,'')||'—'}</div>
                              {e.installments&&<div style={{fontSize:'10px',color:'var(--text-tertiary)'}}>{e.installments} δόσεις</div>}
                            </td>
                            <td style={{padding:'9px 10px',color:'var(--warning)',fontSize:'11px',fontFamily:"'JetBrains Mono',monospace"}}>
                              {e.vat_amount?fmtEur(e.vat_amount):'—'}
                              {e.vat_rate&&<div style={{fontSize:'10px',color:'var(--text-tertiary)'}}>{e.vat_rate}%</div>}
                            </td>
                            <td style={{padding:'9px 10px',color:'var(--positive)',fontSize:'11px',fontFamily:"'JetBrains Mono',monospace"}}>
                              {e.cashback_amount?`+${fmtEur(e.cashback_amount)}`:'—'}
                            </td>
                            <td style={{padding:'9px 10px',fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:e.paid?'var(--text-primary)':'var(--warning)',whiteSpace:'nowrap'}}>
                              {fmtEur(e.amount)}
                              {!e.paid&&<div style={{fontSize:'9px',color:'var(--warning)'}}>ΕΚΚΡΕΜΕΙ</div>}
                              {e.original_price&&e.original_price>e.amount&&(
                                <div style={{fontSize:'10px',color:'var(--positive)',textDecoration:'line-through',fontWeight:400}}>{fmtEur(e.original_price)}</div>
                              )}
                            </td>
                            <td style={{padding:'9px 10px'}}>
                              <div style={{display:'flex',gap:'4px',alignItems:'center'}}>
                                {/* Edit button */}
                                <button
                                  onClick={()=>setEditingId(isEditing?null:e.id)}
                                  title={isEditing?'Κλείσιμο':'Επεξεργασία'}
                                  style={{
                                    width:'28px',height:'28px',display:'flex',alignItems:'center',justifyContent:'center',
                                    borderRadius:'6px',border:`1px solid ${isEditing?'var(--info)':'var(--border-subtle)'}`,
                                    background:isEditing?'rgba(6,182,212,0.12)':'transparent',
                                    color:isEditing?'var(--info)':'var(--text-tertiary)',
                                    cursor:'pointer',fontSize:'12px',transition:'all 0.15s',
                                  }}
                                  onMouseEnter={ev=>{ev.currentTarget.style.background='rgba(6,182,212,0.12)';ev.currentTarget.style.color='var(--info)';ev.currentTarget.style.borderColor='var(--info)';}}
                                  onMouseLeave={ev=>{if(!isEditing){ev.currentTarget.style.background='transparent';ev.currentTarget.style.color='var(--text-tertiary)';ev.currentTarget.style.borderColor='var(--border-subtle)';}}}
                                >
                                  {isEditing?'✕':'✎'}
                                </button>
                                {/* Delete button */}
                                <button
                                  onClick={()=>del(e.id)}
                                  title="Διαγραφή"
                                  style={{
                                    width:'28px',height:'28px',display:'flex',alignItems:'center',justifyContent:'center',
                                    borderRadius:'6px',border:'1px solid var(--border-subtle)',
                                    background:'transparent',color:'var(--text-tertiary)',
                                    cursor:'pointer',fontSize:'12px',transition:'all 0.15s',
                                  }}
                                  onMouseEnter={ev=>{ev.currentTarget.style.background='rgba(239,68,68,0.1)';ev.currentTarget.style.color='var(--negative)';ev.currentTarget.style.borderColor='var(--negative)';}}
                                  onMouseLeave={ev=>{ev.currentTarget.style.background='transparent';ev.currentTarget.style.color='var(--text-tertiary)';ev.currentTarget.style.borderColor='var(--border-subtle)';}}
                                >
                                  ✕
                                </button>
                              </div>
                            </td>
                          </tr>
                          {/* Inline edit form */}
                          {isEditing&&(
                            <InlineEditForm
                              key={`edit-${e.id}`}
                              expense={e}
                              supabase={supabase}
                              propertyId={propertyId}
                              userId={userId}
                              onSave={()=>{setEditingId(null);notify('Η δαπάνη ενημερώθηκε');load();}}
                              onCancel={()=>setEditingId(null)}
                            />
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}

          {/* Footer */}
          <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:'10px',padding:'12px 18px',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'12px'}}>
            <div style={{display:'flex',gap:'20px',flexWrap:'wrap'}}>
              <span style={{fontSize:'11px',color:'var(--text-secondary)'}}>Σύνολο: <strong style={{color:'var(--negative)',fontFamily:"'JetBrains Mono',monospace"}}>{fmtEur(total)}</strong></span>
              <span style={{fontSize:'11px',color:'var(--text-secondary)'}}>Ιδιοκτήτης: <strong style={{color:'var(--warning)',fontFamily:"'JetBrains Mono',monospace"}}>{fmtEur(totalOwner)}</strong></span>
              {totalTenant>0&&<span style={{fontSize:'11px',color:'var(--text-secondary)'}}>Ενοικιαστής: <strong style={{color:'var(--info)',fontFamily:"'JetBrains Mono',monospace"}}>{fmtEur(totalTenant)}</strong></span>}
              {totalCashback>0&&<span style={{fontSize:'11px',color:'var(--text-secondary)'}}>Cashback: <strong style={{color:'var(--positive)',fontFamily:"'JetBrains Mono',monospace"}}>+{fmtEur(totalCashback)}</strong></span>}
              {totalVat>0&&<span style={{fontSize:'11px',color:'var(--text-secondary)'}}>ΦΠΑ: <strong style={{color:'var(--accent)',fontFamily:"'JetBrains Mono',monospace"}}>{fmtEur(totalVat)}</strong></span>}
            </div>
            <span style={{fontSize:'11px',color:'var(--text-tertiary)'}}>{filtered.length} εγγραφές</span>
          </div>
        </>
      )}
    </div>
  );
}