'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CustomSelect, DatePicker, NumberInput, TextInput, Textarea, Toggle } from './UIComponents';
import ExpenseAnalytics from './ExpenseAnalytics';
import { Spinner, ExportButton } from '@/components/Theme';
import { downloadCsv, csvEur, csvDate } from './exportCsv';
import { SHARED_SCOPES, ownerShareAmount, PAID_BY_OPTIONS } from '@/lib/expenses/sharing';
import { annuityMonthly } from '@/lib/loans/recommend';
import { reportAccent, brandRootVars, brandLogoImg, brandName, useReportBranding, type ReportBranding } from '@/lib/reportBranding';

// ─── Types ────────────────────────────────────────────────────────────────────
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
  share_percent: number | null; share_note: string | null;
  travel_type: string | null; travel_destination: string | null;
  exhibition_name: string | null; exhibition_booth_cost: number | null;
  floor_type: string | null;
  appliance_lease_months: number | null; appliance_lease_monthly: number | null;
}

interface Budget { group: string; amount: number; }

// ─── Constants ────────────────────────────────────────────────────────────────
const EXPENSE_GROUPS: Record<string, { label: string; categories: string[]; taxDeductible: boolean }> = {
  fixed:          { label: 'Πάγιες Δαπάνες',           taxDeductible: true,  categories: ['Ρεύμα','Νερό','Φυσικό Αέριο','Internet','Τηλέφωνο','Κοινόχρηστα','Ασφάλεια Κτιρίου','Ασφάλεια Περιεχομένου','ΕΝΦΙΑ','Χαρτόσημο','Δημοτικά Τέλη','Τέλη Καθαριότητας','Διαχείριση Πολυκατοικίας','Λογιστής/Φοροτεχνικός','Σύστημα Συναγερμού','Φύλαξη/Security','Parking Μηνιαίο','Άλλη Πάγια'] },
  renovation:     { label: 'Ανακαίνιση & Βελτιώσεις',   taxDeductible: false, categories: ['Βαφές & Χρώματα','Πλακάκια','Ξυλουργικά','Υδραυλικά','Ηλεκτρολογικά','Κλιματισμός','Θέρμανση','Μόνωση','Παράθυρα/Πόρτες','Αλουμίνια','Πατώματα (γενικά)','Παρκέ (τοποθέτηση)','Επισκευή Παρκέ','Λαμινέιτ','Μάρμαρο/Γρανίτης','Πλακάκια Δαπέδου','Οροφή/Γύψος','Κήπος/Εξωτερικοί Χώροι','Πισίνα','Τζάκι','Σοφίτα/Πατάρι','Γκαράζ','Ανελκυστήρας','Πρόσοψη Κτιρίου','Στέγη','Αποχέτευση','Άλλη Ανακαίνιση'] },
  appliances:     { label: 'Συσκευές & Έπιπλα',          taxDeductible: false, categories: ['Ψυγείο','Πλυντήριο Ρούχων','Στεγνωτήριο','Πλυντήριο Πιάτων','Φούρνος Κουζίνας','Εστίες/Κεραμικές','Απορροφητήρας','Φούρνος Μικροκυμάτων','Κλιματιστικό','Αντλία Θερμότητας','Boiler/Ηλιακός','Θερμοσίφωνας','Τηλεόραση','Soundbar/Ηχοσύστημα','Ηλεκτρική Σκούπα','Robot Σκούπα','Αφυγραντήρας','Καθαριστής Αέρα','Έπιπλα Σαλόνι','Καναπές/Πολυθρόνα','Κρεβάτι/Στρώμα','Ντουλάπα','Έπιπλα Κουζίνας','Νεροχύτης/Μπαταρία','Έπιπλα Μπάνιου','Ντους/Μπανιέρα','Λεκάνη/Καζανάκι','Φωτιστικά','Κουρτίνες/Ρολά','Χαλί','Smart Home Συσκευές','Smart Lock','Κάμερα Ασφαλείας','Doorbell','Άλλη Συσκευή/Έπιπλο'] },
  appliance_lease:{ label: 'Leasing Συσκευών',           taxDeductible: true,  categories: ['Leasing Κλιματιστικού','Leasing Ψυγείου','Leasing Πλυντηρίου','Leasing Τηλεόρασης','Leasing Φωτοβολταϊκών','Leasing Αντλίας Θερμότητας','Leasing Άλλης Συσκευής'] },
  maintenance:    { label: 'Συντήρηση',                   taxDeductible: true,  categories: ['Καθαρισμός Κλιματιστικού','Συντήρηση Ηλιακού','Συντήρηση Αντλίας Θερμότητας','Συντήρηση Φωτοβολταϊκών','Αποφράξεις','Απεντόμωση','Μυοκτονία','Αποστείρωση','Καθαρισμός Δεξαμενής','Έλεγχος Ηλεκτρολογικής Εγκατάστασης','Τεχνικός Έλεγχος','Γενική Συντήρηση','Επισκευή Στέγης','Κηπουρός','Καθαρισμός Πισίνας','Καθαριότητα','Συντήρηση Ασανσέρ','Υδραυλικός','Ηλεκτρολόγος','Άλλη Συντήρηση'] },
  vehicle_lease:  { label: 'Leasing Οχημάτων',            taxDeductible: true,  categories: ['Leasing Αυτοκινήτου','Leasing Βαν/Φορτηγού','Leasing Μοτοσυκλέτας','Leasing Ηλεκτρικού Οχήματος','Leasing Άλλου Οχήματος'] },
  commercial:     { label: 'Εμπορικό/Επαγγελματικό',      taxDeductible: true,  categories: ['Πινακίδες/Branding','Εξοπλισμός Καταστήματος','Ταμειακή Μηχανή','POS Terminal','Σύστημα Ασφαλείας','Κάμερες CCTV','Ντεκόρ Βιτρίνας','Ράφια/Έπιπλα Κατ/τος','Ψυγείο Βιτρίνα','Επαγγελματική Κουζίνα','Εξοπλισμός Γραφείου','Εκτυπωτής/Scanner','Server/IT Εξοπλισμός','Συνδρομή Software','Άδεια Λειτουργίας','Πυρασφάλεια','Άλλο Εμπορικό'] },
  broker:         { label: 'Μεσιτικές Δαπάνες',           taxDeductible: true,  categories: ['Μεσιτεία Ενοικίασης','Μεσιτεία Πώλησης','Μεσιτεία Αγοράς','Διαφήμιση Ακινήτου','Φωτογράφηση/Video','Αγγελίες (Spitogatos κλπ)','Έλεγχος Ενοικιαστή','Άλλη Μεσιτική Δαπάνη'] },
  legal:          { label: 'Νομικά & Διοικητικά',          taxDeductible: true,  categories: ['Συμβολαιογράφος','Δικηγόρος','Μηχανικός/Τοπογράφος','Ενεργειακός Επιθεωρητής (ΠΕΑ)','Άδεια Δόμησης','Άδεια Ανακαίνισης','Πολεοδομικά/Τακτοποίηση','Κτηματολόγιο','Εγγραφή Υποθήκης','Άρση Υποθήκης','Νομική Γνωμοδότηση','Φορολογικός Έλεγχος','Άλλο Νομικό'] },
  travel:         { label: 'Μετακινήσεις & Ταξίδια',       taxDeductible: false, categories: ['Αεροπορικά Εισιτήρια','Τρένο','Ακτοπλοϊκά','ΚΤΕΛ/Λεωφορείο','Ταξί/Uber','Ενοικίαση Αυτοκινήτου','Καύσιμα','Διόδια/Parking','Ξενοδοχείο','Airbnb/Διαμονή','Ημερήσια Αποζημίωση','Άλλη Μετακίνηση'] },
  exhibition:     { label: 'Εκθέσεις & Events',            taxDeductible: false, categories: ['Περίπτερο Έκθεσης','Εγγραφή/Είσοδος Έκθεσης','Μεταφορά Εκθεμάτων','Διαφημιστικό Υλικό','Προσωπικό Έκθεσης','Catering Έκθεσης','Σεμινάριο/Επιμόρφωση','Συνέδριο Κλάδου','Άλλο Έκθεσης'] },
  tax:            { label: 'Φόροι & Τέλη',                  taxDeductible: false, categories: ['Φόρος Μεταβίβασης','ΦΠΑ Ακινήτου','Φόρος Κληρονομιάς','Τέλος Χαρτοσήμου','Τέλη Μεταγραφής','Εισφορά Δήμου','Άλλος Φόρος'] },
  other:          { label: 'Άλλες Δαπάνες',                taxDeductible: false, categories: ['Αποθήκευση/Μεταφορά','Καθαρισμός (εφάπαξ)','Φωτογράφηση Ακινήτου','Home Staging','Δώρα/Φιλοξενία','Αναλώσιμα','Misc','Άλλο'] },
};

// Βασικές ομάδες που χρειάζεται ένας ιδιοκτήτης ακινήτου. Οι υπόλοιπες
// (επαγγελματικές/σπάνιες) κρύβονται πίσω από «Περισσότερες κατηγορίες» ώστε το
// πιο χρησιμοποιούμενο tab να μη μοιάζει με σουπερμάρκετ.
const CORE_GROUPS = new Set(['fixed', 'maintenance', 'renovation', 'appliances', 'legal', 'tax', 'other']);

// Premium, cohesive παλέτα (μουτ), ίδια με ExpenseAnalytics, χωρίς νέον/θόρυβο.
const GROUP_COLORS: Record<string, string> = {
  fixed:'#1a73e8', maintenance:'#5f6368', renovation:'#7e57c2',
  appliances:'#00897b', appliance_lease:'#3949ab', vehicle_lease:'#00acc1',
  commercial:'#5e35b1', broker:'#26a69a', legal:'#8e24aa',
  travel:'#43a047', exhibition:'#6d4c41', tax:'#e8710a', other:'#9aa0a6',
};

const PAYMENT_METHODS = [
  { value: 'cash',             label: 'Μετρητά',                       hasCashback: false, hasInstallments: false, interestRate: 0 },
  { value: 'cash_black',       label: 'Αδήλωτα',                       hasCashback: false, hasInstallments: false, interestRate: 0 },
  { value: 'family',           label: 'Γονείς/Συγγενείς/Φίλοι',        hasCashback: false, hasInstallments: false, interestRate: 0 },
  { value: 'debit_cb',         label: 'Χρεωστική με Cashback',          hasCashback: true,  hasInstallments: false, interestRate: 0 },
  { value: 'debit_no_cb',      label: 'Χρεωστική χωρίς Cashback',       hasCashback: false, hasInstallments: false, interestRate: 0 },
  { value: 'credit_free',      label: 'Πιστωτική, Άτοκες Δόσεις',     hasCashback: false, hasInstallments: true,  interestRate: 0 },
  { value: 'credit_interest',  label: 'Πιστωτική, Έντοκες Δόσεις',    hasCashback: false, hasInstallments: true,  interestRate: 18 },
  { value: 'klarna',           label: 'Klarna',                         hasCashback: false, hasInstallments: true,  interestRate: 0 },
  { value: 'tbi',              label: 'TBI Bank',                       hasCashback: false, hasInstallments: true,  interestRate: 12 },
  { value: 'snappi',           label: 'Snappi BNPL',                    hasCashback: true,  hasInstallments: true,  interestRate: 0 },
  { value: 'kotsovolos',       label: 'Κωτσόβολος Πλάνο',              hasCashback: false, hasInstallments: true,  interestRate: 0 },
  { value: 'plaisio4',         label: 'Πλαίσιο x4',                    hasCashback: false, hasInstallments: true,  interestRate: 0 },
  { value: 'local_store',      label: 'Δόσεις Τοπικού Καταστήματος',    hasCashback: false, hasInstallments: true,  interestRate: 0 },
  { value: 'promissory',       label: 'Έντοκα Γραμμάτια',              hasCashback: false, hasInstallments: true,  interestRate: 8 },
  { value: 'bank_transfer',    label: 'Τραπεζική Μεταφορά',             hasCashback: false, hasInstallments: false, interestRate: 0 },
  { value: 'check',            label: 'Επιταγή',                        hasCashback: false, hasInstallments: false, interestRate: 0 },
];

// Το μοντέλο διαμοιρασμού (PAID_BY_OPTIONS, SHARED_SCOPES, ownerShareAmount) ζει
// σε καθαρή, δοκιμασμένη βιβλιοθήκη: '@/lib/expenses/sharing'.

const VAT_RATES       = [{ value:'0',label:'0%' },{ value:'6',label:'6%' },{ value:'13',label:'13%' },{ value:'24',label:'24%' }];
const RECURRING_FREQ  = [{ value:'monthly',label:'Μηνιαία' },{ value:'quarterly',label:'Τριμηνιαία' },{ value:'biannual',label:'Εξαμηνιαία' },{ value:'annual',label:'Ετήσια' }];
const SORT_OPTIONS    = [{ value:'date_desc',label:'Ημερομηνία (νεότερο)' },{ value:'date_asc',label:'Ημερομηνία (παλαιότερο)' },{ value:'amount_desc',label:'Ποσό (υψηλότερο)' },{ value:'amount_asc',label:'Ποσό (χαμηλότερο)' }];

const INSTALLMENT_METHODS = PAYMENT_METHODS.filter(p => p.hasInstallments).map(p => p.value);
const CASHBACK_METHODS    = PAYMENT_METHODS.filter(p => p.hasCashback).map(p => p.value);

const fmtEur = (n: number) => `${n.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const fmtEur0 = (n: number) => `${n.toLocaleString('el-GR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;
const fmtD = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('el-GR', { day:'2-digit', month:'2-digit', year:'numeric' }) : '—';

// HTML-escape helper for dynamic values interpolated into the print/PDF HTML that is
// passed to window.open(...).document.write, prevents stored-XSS via user/tenant/DB fields.
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string));

const bestPayment = (a: number) =>
  a >= 2000 ? 'Πιστωτική με άτοκες δόσεις, μέγιστη ρευστότητα' :
  a >= 500  ? 'Χρεωστική με Cashback ή Πιστωτική Άτοκες' :
  a >= 100  ? 'Χρεωστική με Cashback' : 'Μετρητά ή Χρεωστική';

const CAT_COLORS = ['#1a73e8','#00897b','#7e57c2','#5f6368','#00acc1','#3949ab','#8e24aa','#43a047','#e8710a','#6d4c41'];
const CAT_COLOR_MAP: Record<string,string> = {};
let colorIdx = 0;
function getCatColor(cat: string) {
  if (!CAT_COLOR_MAP[cat]) { CAT_COLOR_MAP[cat] = CAT_COLORS[colorIdx % CAT_COLORS.length]; colorIdx++; }
  return CAT_COLOR_MAP[cat];
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const cardStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 12,
  padding: 20,
  marginBottom: 16,
};

const labelStyle: React.CSSProperties = {
  fontSize: 10, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--text-secondary)',
  display: 'block', marginBottom: 6, fontWeight: 500, fontFamily: "'Inter', sans-serif",
};

const g2: React.CSSProperties = { display:'grid', gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:12, marginBottom:12 };
const g4: React.CSSProperties = { display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:12, marginBottom:12 };

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, paddingBottom:8, borderBottom:'1px solid var(--border-subtle)' }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:'var(--text-tertiary)', display:'inline-block', flexShrink:0 }} />
      <span style={{ fontSize:10, fontWeight:500, letterSpacing:'0.5px', textTransform:'uppercase' as const, color:'var(--text-secondary)', fontFamily:"'Inter', sans-serif" }}>
        {label}
      </span>
    </div>
  );
}

function InfoRow({ label, value, color = 'var(--text-primary)' }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ height:40, background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:4, padding:'0 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
      <span style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:"'Inter', sans-serif" }}>{label}</span>
      <span style={{ fontSize:14, fontWeight:700, color, fontFamily:"'Roboto Mono', monospace", fontVariantNumeric:'tabular-nums' }}>{value}</span>
    </div>
  );
}

// ─── Blank form ───────────────────────────────────────────────────────────────
const blank = () => ({
  description:'', amount:'', category:'', expense_group:'fixed',
  date: new Date().toISOString().split('T')[0],
  paid_by:'owner', payment_method:'cash',
  installments:'', amount_upfront:'', amount_per_installment:'',
  cashback_pct:'', cashback_amount:'', original_price:'', discount_amount:'',
  vat_rate:'24', vat_amount:'', is_recurring:false, recurring_frequency:'monthly',
  notes:'', paid:true, store_vendor:'', interest_rate:'', attachment_url:'',
  share_percent:'', share_note:'',
});

function expenseToForm(e: Expense) {
  return {
    description:e.description||'', amount:String(e.amount||''),
    category:e.category||'', expense_group:e.expense_group||'fixed',
    date:e.date||new Date().toISOString().split('T')[0],
    paid_by:e.paid_by||'owner', payment_method:e.payment_method||'cash',
    installments:String(e.installments||''), amount_upfront:String(e.amount_upfront||''),
    amount_per_installment:String(e.amount_per_installment||''),
    cashback_pct:String(e.cashback_pct||''), cashback_amount:String(e.cashback_amount||''),
    original_price:String(e.original_price||''), discount_amount:String(e.discount_amount||''),
    vat_rate:String(e.vat_rate||'24'), vat_amount:String(e.vat_amount||''),
    is_recurring:e.is_recurring||false, recurring_frequency:e.recurring_frequency||'monthly',
    notes:e.notes||'', paid:e.paid??true, store_vendor:e.store_vendor||'', interest_rate:'', attachment_url:(e as any).attachment_url||'',
    share_percent:String(e.share_percent??''), share_note:e.share_note||'',
  };
}

// ─── Installment Calculator ───────────────────────────────────────────────────
function InstallmentCalc({ amount, installments, interestRate, startDate }: { amount:number; installments:number; interestRate:number; startDate:string }) {
  if (!amount || installments < 2) return null;
  const mr = interestRate / 100 / 12;
  const mp = mr > 0 ? amount * (mr * Math.pow(1+mr,installments)) / (Math.pow(1+mr,installments)-1) : amount / installments;
  const total = mp * installments;
  const interest = total - amount;
  const payoff = new Date(startDate+'T00:00:00'); payoff.setMonth(payoff.getMonth()+installments);
  const isInterestFree = interestRate === 0;
  return (
    <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderLeft:'3px solid var(--accent)', borderRadius:8, padding:'12px 14px', marginBottom:12 }}>
      <div style={{ ...labelStyle, marginBottom:10 }}>Ανάλυση Δόσεων</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:8, marginBottom:10 }}>
        {[
          { label:'Μηνιαία Δόση', value:fmtEur(mp), color:'var(--accent)' },
          { label:'Συνολικό Κόστος', value:fmtEur(total), color:isInterestFree?'var(--positive)':'var(--negative)' },
          { label:'Τόκοι', value:fmtEur(interest), color:interest>0?'var(--negative)':'var(--positive)' },
          { label:'Εξόφληση', value:payoff.toLocaleDateString('el-GR',{month:'long',year:'numeric'}), color:'var(--text-primary)' },
        ].map((k,i) => (
          <div key={i} style={{ background:'var(--bg-elevated)', borderRadius:6, padding:'8px 10px' }}>
            <div style={{ fontSize:12, fontWeight:700, color:k.color, fontFamily:"'Roboto Mono', monospace", fontVariantNumeric:'tabular-nums', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{k.value}</div>
            <div style={{ fontSize:9, color:'var(--text-secondary)', textTransform:'uppercase' as const, letterSpacing:'0.5px', fontFamily:"'Inter', sans-serif" }}>{k.label}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize:11, color:isInterestFree?'var(--positive)':'var(--warning)', fontFamily:"'Inter', sans-serif", lineHeight:1.5 }}>
        {isInterestFree ? 'Άτοκες δόσεις, δεν συμφέρει πρόωρη εξόφληση. Διατήρησε τη ρευστότητά σου.' : `Πρόωρη εξόφληση: εξοικονομείς ${fmtEur(interest)} σε τόκους.`}
      </div>
    </div>
  );
}

// ─── Contact Picker ───────────────────────────────────────────────────────────
function ContactPicker({ value, onChange, propertyId }: { value:string; onChange:(v:string)=>void; propertyId:string }) {
  const supabase = createClient();
  const [contacts, setContacts] = useState<{ id:string; full_name:string }[]>([]);
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    supabase.from('contacts').select('id,full_name').eq('property_id',propertyId)
      .then(({ data }: any) => setContacts(data||[]));
  }, [propertyId]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setShow(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={ref} style={{ position:'relative' }}>
      <div style={{ display:'flex', gap:6 }}>
        <div style={{ flex:1 }}><TextInput value={value} onChange={onChange} placeholder="π.χ. Αντικατάσταση ψυγείου Bosch" /></div>
        {contacts.length > 0 && (
          <button type="button" onClick={() => setShow(s=>!s)}
            style={{ padding:'0 12px', borderRadius:4, border:'1px solid var(--border-default)', background:show?'var(--accent-dim)':'var(--bg-surface)', color:show?'var(--accent)':'var(--text-secondary)', cursor:'pointer', fontSize:12, flexShrink:0, height:40, fontFamily:"'Inter', sans-serif" }}>
            Επαφές
          </button>
        )}
      </div>
      {show && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', right:0, background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:8, padding:8, zIndex:700, minWidth:220, maxHeight:200, overflowY:'auto', boxShadow:'var(--shadow-lg)' }}>
          {contacts.map(c => (
            <div key={c.id} onClick={() => { onChange(c.full_name); setShow(false); }}
              style={{ padding:'8px 10px', cursor:'pointer', borderRadius:6, fontSize:13, color:'var(--text-primary)', fontFamily:"'Inter', sans-serif" }}
              onMouseEnter={e => e.currentTarget.style.background='var(--bg-surface)'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
              {c.full_name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Receipt OCR with Claude Vision ──────────────────────────────────────────
function ReceiptOCR({ onExtracted }: { onExtracted: (data: Partial<ReturnType<typeof blank>>) => void }) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [preview, setPreview] = useState<string|null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scan = async (file: File) => {
    setScanning(true); setError(null);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((res, rej) => {
        reader.onload = () => res((reader.result as string).split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      setPreview(URL.createObjectURL(file));

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: file.type as any, data: base64 },
              },
              {
                type: 'text',
                text: `Ανάλυσε αυτή την απόδειξη/τιμολόγιο και εξάγαγε τα στοιχεία σε JSON. Απάντησε ΜΟΝΟ με JSON, χωρίς backticks:
{
  "description": "σύντομη περιγραφή αγοράς",
  "amount": αριθμός (τελικό ποσό με ΦΠΑ),
  "store_vendor": "όνομα καταστήματος/παρόχου",
  "date": "YYYY-MM-DD (ημερομηνία απόδειξης ή σήμερα αν δεν φαίνεται)",
  "vat_rate": αριθμός (0, 6, 13 ή 24),
  "vat_amount": αριθμός (ποσό ΦΠΑ ή null),
  "payment_method": "cash ή card ή null",
  "notes": "πρόσθετες πληροφορίες ή null"
}
Αν δεν μπορείς να διαβάσεις κάποιο πεδίο, βάλε null.`,
              },
            ],
          }],
        }),
      });

      const data = await response.json();
      const text = data.content?.[0]?.text || '';
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);

      const today = new Date().toISOString().split('T')[0];
      onExtracted({
        description: parsed.description || '',
        amount: parsed.amount ? String(parsed.amount) : '',
        store_vendor: parsed.store_vendor || '',
        date: parsed.date || today,
        vat_rate: parsed.vat_rate ? String(parsed.vat_rate) : '24',
        vat_amount: parsed.vat_amount ? String(parsed.vat_amount) : '',
        payment_method: parsed.payment_method === 'cash' ? 'cash' : parsed.payment_method === 'card' ? 'debit_no_cb' : 'cash',
        notes: parsed.notes || '',
      });
    } catch (err) {
      setError('Δεν μπόρεσα να διαβάσω την απόδειξη. Δοκίμασε ξανά με καθαρότερη εικόνα.');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:10, padding:'12px 16px', marginBottom:14 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: preview ? 12 : 0 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        <span style={{ fontSize:12, fontWeight:500, color:'var(--text-primary)', fontFamily:"'Inter', sans-serif" }}>
          Σάρωση Απόδειξης με AI
        </span>
        <span style={{ fontSize:10, color:'var(--accent)', background:'var(--accent-dim)', padding:'2px 8px', borderRadius:10, fontFamily:"'Inter', sans-serif", fontWeight:500 }}>
          Claude Vision
        </span>
        <div style={{ flex:1 }} />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={scanning}
          style={{ height:32, padding:'0 14px', borderRadius:20, border:'1px solid var(--accent)', background:scanning?'var(--bg-surface)':'var(--accent)', color:scanning?'var(--text-secondary)':'var(--accent-text)', fontSize:11, fontFamily:"'Inter', sans-serif", fontWeight:500, cursor:scanning?'not-allowed':'pointer', display:'flex', alignItems:'center', gap:6 }}>
          {scanning ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation:'spin 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              Ανάλυση...
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              Φωτογραφία Απόδειξης
            </>
          )}
        </button>
        <input ref={inputRef} type="file" accept="image/*" style={{ display:'none' }}
          onChange={e => { const f=e.target.files?.[0]; if(f) scan(f); e.target.value=''; }} />
      </div>
      {preview && !scanning && (
        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:8 }}>
          <img src={preview} alt="receipt" style={{ height:48, width:'auto', borderRadius:4, border:'1px solid var(--border-subtle)', objectFit:'cover' }} />
          <div style={{ fontSize:11, color:'var(--positive)', fontFamily:"'Inter', sans-serif" }}>
            Στοιχεία εξήχθησαν, ελέγξτε και συμπληρώστε
          </div>
        </div>
      )}
      {error && (
        <div style={{ fontSize:11, color:'var(--negative)', marginTop:8, fontFamily:"'Inter', sans-serif" }}>{error}</div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ─── Expense Form ─────────────────────────────────────────────────────────────
function ExpenseForm({
  form, sf, propertyId, onSave, onCancel, saving, isEdit = false,
}: {
  form: ReturnType<typeof blank>;
  sf: (k:string, v:any) => void;
  propertyId: string;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isEdit?: boolean;
}) {
  const hasInstallments = INSTALLMENT_METHODS.includes(form.payment_method);
  const hasCashback = CASHBACK_METHODS.includes(form.payment_method);
  const currentPM = PAYMENT_METHODS.find(p => p.value === form.payment_method);
  const effectiveRate = form.interest_rate ? parseFloat(form.interest_rate) : (currentPM?.interestRate||0);
  const isDeductible = EXPENSE_GROUPS[form.expense_group]?.taxDeductible;
  // Δείξε τις επαγγελματικές/σπάνιες ομάδες μόνο αν ζητηθεί ή αν επεξεργαζόμαστε
  // ήδη μια τέτοια εγγραφή (ώστε να μη «χαθεί» η κατηγορία της).
  const [showAllGroups, setShowAllGroups] = useState(!CORE_GROUPS.has(form.expense_group));
  const groupOptions = Object.entries(EXPENSE_GROUPS)
    .filter(([k]) => showAllGroups || CORE_GROUPS.has(k) || k === form.expense_group)
    .map(([k,v]) => ({ value:k, label:v.label }));

  return (
    <div style={{ ...cardStyle, border:`1px solid ${isEdit?'var(--accent)':'var(--border-accent)'}` }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div style={{ fontSize:11, fontWeight:500, color:'var(--accent)', textTransform:'uppercase', letterSpacing:'0.5px', fontFamily:"'Inter', sans-serif", display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ width:5, height:5, borderRadius:'50%', background:'var(--text-tertiary)', display:'inline-block' }} />
          {isEdit ? 'Επεξεργασία Δαπάνης' : 'Νέα Δαπάνη'}
        </div>
        {isDeductible !== undefined && (
          <span style={{ fontSize:10, fontWeight:500, color:isDeductible?'var(--positive)':'var(--text-tertiary)', background:isDeductible?'var(--positive-dim)':'var(--bg-surface)', padding:'3px 10px', borderRadius:20, fontFamily:"'Inter', sans-serif" }}>
            {isDeductible ? 'Εκπιπτόμενη δαπάνη' : 'Μη εκπιπτόμενη'}
          </span>
        )}
      </div>

      {/* Receipt OCR, only on new expense */}
      {!isEdit && (
        <ReceiptOCR onExtracted={data => {
          Object.entries(data).forEach(([k,v]) => { if(v!==undefined) sf(k,v); });
        }} />
      )}

      {/* Βασικά */}
      <div style={g4}>
        <div>
          <CustomSelect label="Ομάδα Δαπάνης" value={form.expense_group} onChange={v => sf('expense_group',v)}
            options={groupOptions} />
          {!showAllGroups && (
            <button type="button" onClick={() => setShowAllGroups(true)}
              style={{ marginTop: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 600 }}>
              + Περισσότερες κατηγορίες (επαγγελματικές)
            </button>
          )}
        </div>
        <CustomSelect label="Κατηγορία" value={form.category} onChange={v => sf('category',v)}
          options={(EXPENSE_GROUPS[form.expense_group]?.categories||[]).map(c => ({ value:c, label:c }))} />
        <DatePicker label="Ημερομηνία" value={form.date} onChange={v => sf('date',v)} />
        <CustomSelect label="Πληρώνει / Διαμοιρασμός" value={form.paid_by} onChange={v => sf('paid_by',v)} options={PAID_BY_OPTIONS} />
      </div>

      {/* Διαμοιρασμός — εμφανίζεται μόνο όταν η δαπάνη μοιράζεται */}
      {SHARED_SCOPES.has(form.paid_by) && (
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderLeft:'3px solid var(--accent)', borderRadius:8, padding:'12px 14px', marginBottom:12 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:12, alignItems:'end' }}>
            <NumberInput label="Το μερίδιό μου" value={form.share_percent} onChange={v => sf('share_percent',v)} placeholder="50" suffix="%" step={1} max={100} />
            <TextInput label="Μοιρασμένο με" value={form.share_note} onChange={v => sf('share_note',v)} placeholder="π.χ. αδερφός, γονείς, συνιδιοκτήτης" />
          </div>
          {form.amount && parseFloat(form.amount) > 0 && (
            <div style={{ marginTop:10, fontSize:12, color:'var(--text-secondary)', fontFamily:"'Inter', sans-serif" }}>
              Δικό σου μερίδιο: <strong style={{ color:'var(--text-primary)' }}>{fmtEur(parseFloat(form.amount) * (form.share_percent ? Math.max(0,Math.min(100,parseFloat(form.share_percent))) : 50) / 100)}</strong>
              <span style={{ color:'var(--text-tertiary)' }}> από {fmtEur(parseFloat(form.amount))} συνολικά</span>
            </div>
          )}
        </div>
      )}

      <div style={g2}>
        <div>
          <label style={labelStyle}>Περιγραφή</label>
          <ContactPicker value={form.description} onChange={v => sf('description',v)} propertyId={propertyId} />
        </div>
        <TextInput label="Κατάστημα / Πάροχος" value={form.store_vendor} onChange={v => sf('store_vendor',v)} placeholder="π.χ. Κωτσόβολος, ΔΕΗ" />
      </div>

      {/* Τιμή */}
      <SectionLabel label="Τιμή και ΦΠΑ" />
      <div style={g4}>
        <NumberInput label="Τελική Τιμή" value={form.amount} onChange={v => sf('amount',v)} suffix="€" step={0.01} />
        <NumberInput label="Αρχική Τιμή" value={form.original_price} onChange={v => sf('original_price',v)} suffix="€" step={0.01} />
        <CustomSelect label="Συντελεστής ΦΠΑ" value={form.vat_rate} onChange={v => sf('vat_rate',v)} options={VAT_RATES} />
        <div>
          <label style={labelStyle}><span title="Φόρος Προστιθέμενης Αξίας">ΦΠΑ</span> Ποσό</label>
          <div style={{ height:40, background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:4, padding:'0 16px', display:'flex', alignItems:'center', fontSize:14, color:'var(--text-primary)', fontFamily:"'Roboto Mono', monospace", fontVariantNumeric:'tabular-nums' }}>
            {form.vat_amount ? `${form.vat_amount} €` : '—'}
          </div>
        </div>
      </div>

      {form.discount_amount && parseFloat(form.discount_amount) > 0 && (
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderLeft:'3px solid var(--border-subtle)', borderRadius:8, padding:'10px 14px', marginBottom:12, fontSize:12, color:'var(--positive)', fontFamily:"'Inter', sans-serif" }}>
          Εξοικονόμηση: <strong>{form.discount_amount} €</strong>
          {form.original_price && form.amount && (
            <span style={{ marginLeft:8, color:'var(--text-secondary)' }}>
              ({(((parseFloat(form.original_price)-parseFloat(form.amount))/parseFloat(form.original_price))*100).toFixed(1)}% έκπτωση)
            </span>
          )}
        </div>
      )}

      {/* Πληρωμή */}
      <SectionLabel label="Τρόπος Πληρωμής" />
      <div style={g4}>
        <CustomSelect label="Τρόπος Πληρωμής" value={form.payment_method} onChange={v => sf('payment_method',v)}
          options={PAYMENT_METHODS.map(p => ({ value:p.value, label:p.label }))} />
        {hasInstallments && <>
          <NumberInput label="Αριθμός Δόσεων" value={form.installments} onChange={v => sf('installments',v)} suffix="δόσεις" />
          <NumberInput label="Άμεση Πληρωμή" value={form.amount_upfront} onChange={v => sf('amount_upfront',v)} suffix="€" step={0.01} />
          <NumberInput label="Επιτόκιο % (ετήσιο)" value={form.interest_rate} onChange={v => sf('interest_rate',v)} suffix="%" step={0.1} />
        </>}
        {hasCashback && !hasInstallments && <>
          <NumberInput label="Cashback %" value={form.cashback_pct} onChange={v => sf('cashback_pct',v)} suffix="%" step={0.1} max={100} />
          <div>
            <label style={labelStyle}><span title="Επιστροφή μέρους της αγοράς σε χρήμα">Cashback</span> Ποσό</label>
            <div style={{ height:40, background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:4, padding:'0 16px', display:'flex', alignItems:'center', fontSize:14, color:'var(--positive)', fontFamily:"'Roboto Mono', monospace", fontVariantNumeric:'tabular-nums' }}>
              {form.cashback_amount ? `+${form.cashback_amount} €` : '—'}
            </div>
          </div>
        </>}
      </div>

      {hasInstallments && form.amount && form.installments && parseInt(form.installments) >= 2 && (
        <InstallmentCalc amount={parseFloat(form.amount)} installments={parseInt(form.installments)} interestRate={effectiveRate} startDate={form.date} />
      )}

      {form.amount && parseFloat(form.amount) > 0 && !hasInstallments && (
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderLeft:'3px solid var(--border-subtle)', borderRadius:8, padding:'10px 14px', marginBottom:12, fontSize:12, color:'var(--text-secondary)', fontFamily:"'Inter', sans-serif" }}>
          <strong style={{ color:'var(--text-primary)' }}>Προτεινόμενος τρόπος:</strong> {bestPayment(parseFloat(form.amount))}
        </div>
      )}

      {/* Επιπλέον */}
      <SectionLabel label="Επιπλέον Στοιχεία" />
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:12, marginBottom:12, alignItems:'start' }}>
        <div>
          <label style={labelStyle}>Επαναλαμβανόμενη</label>
          <Toggle on={form.is_recurring} onChange={v => sf('is_recurring',v)} label="Ναι" labelOff="Όχι" />
        </div>
        {form.is_recurring && <CustomSelect label="Συχνότητα" value={form.recurring_frequency} onChange={v => sf('recurring_frequency',v)} options={RECURRING_FREQ} />}
        <div>
          <label style={labelStyle}>Εξοφλήθη</label>
          <Toggle on={form.paid} onChange={v => sf('paid',v)} label="Ναι" labelOff="Όχι" />
        </div>
      </div>
      <Textarea label="Σημειώσεις" value={form.notes} onChange={v => sf('notes',v)} placeholder="π.χ. Αγοράστηκε στα Black Friday, εγγύηση έως 05/2028..." />

      {/* Attachment URL */}
      <div style={{ marginTop:12 }}>
        <SectionLabel label="Συνημμένο Έγγραφο (URL)" />
        <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8 }}>
          <TextInput
            value={form.attachment_url||''}
            onChange={v => sf('attachment_url', v)}
            placeholder="https://drive.google.com/... ή https://dropbox.com/..."
          />
          {form.attachment_url && (
            <a href={form.attachment_url} target="_blank" rel="noopener noreferrer"
              style={{ height:40, padding:'0 16px', borderRadius:4, border:'1px solid var(--accent)', background:'var(--accent-dim)', color:'var(--accent)', display:'flex', alignItems:'center', fontSize:12, fontFamily:"'Inter', sans-serif", fontWeight:500, cursor:'pointer', textDecoration:'none', whiteSpace:'nowrap', gap:6 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              Άνοιγμα
            </a>
          )}
        </div>
        <div style={{ fontSize:10, color:'var(--text-tertiary)', marginTop:4, fontFamily:"'Inter', sans-serif" }}>
          Σύνδεσμος σε Google Drive, Dropbox, τιμολόγιο, ή άλλο έγγραφο
        </div>
      </div>

      <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:16 }}>
        <button onClick={onCancel} style={{ background:'transparent', color:'var(--text-secondary)', border:'1px solid var(--border-default)', borderRadius:20, padding:'8px 16px', fontSize:12, fontFamily:"'Inter', sans-serif", fontWeight:500, cursor:'pointer' }}>
          Ακύρωση
        </button>
        <button onClick={onSave} disabled={saving || !form.description || !form.amount}
          style={{ background:'var(--accent)', color:'var(--accent-text)', border:'none', borderRadius:20, padding:'9px 20px', fontSize:12, fontWeight:500, fontFamily:"'Inter', sans-serif", cursor:'pointer', opacity:saving?0.7:1 }}>
          {saving ? 'Αποθήκευση...' : isEdit ? 'Αποθήκευση Αλλαγών' : 'Καταχώρηση'}
        </button>
      </div>
    </div>
  );
}
// ─── Export helpers ───────────────────────────────────────────────────────────
async function exportExcel(expenses: Expense[], propertyName: string) {
  // Dynamic import SheetJS
  const XLSX = await import('xlsx');

  const today = new Date().toLocaleDateString('el-GR');
  const total = expenses.reduce((s,e) => s+e.amount, 0);
  const totalVat = expenses.reduce((s,e) => s+(e.vat_amount||0), 0);
  const totalCashback = expenses.reduce((s,e) => s+(e.cashback_amount||0), 0);
  const deductible = expenses.filter(e => EXPENSE_GROUPS[e.expense_group||'']?.taxDeductible).reduce((s,e) => s+e.amount, 0);
  const unpaid = expenses.filter(e => !e.paid).reduce((s,e) => s+e.amount, 0);

  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Summary ──────────────────────────────────────────────────────
  const byGroup: Record<string,{amount:number;count:number;vat:number}> = {};
  expenses.forEach(e => {
    const g = e.expense_group||'other';
    if (!byGroup[g]) byGroup[g] = { amount:0, count:0, vat:0 };
    byGroup[g].amount += e.amount;
    byGroup[g].count += 1;
    byGroup[g].vat += e.vat_amount||0;
  });

  const summaryData: (string|number)[][] = [
    ['Property OS, Κατάσταση Δαπανών', ''],
    ['Ακίνητο:', propertyName],
    ['Ημερομηνία εξαγωγής:', today],
    ['Σύνολο εγγραφών:', expenses.length],
    [''],
    ['ΟΙΚΟΝΟΜΙΚΗ ΣΥΝΟΨΗ', ''],
    ['Σύνολο Δαπανών', total],
    ['Εκπιπτόμενες Δαπάνες', deductible],
    ['Μη Εκπιπτόμενες Δαπάνες', total - deductible],
    ['Ποσοστό Εκπτώσεων (%)', total > 0 ? Math.round((deductible/total)*1000)/10 : 0],
    ['Σύνολο ΦΠΑ', totalVat],
    ['Συνολικό Cashback (εξοικονόμηση)', totalCashback],
    ['Εκτιμώμενος Φόρος 15%', Math.round(deductible*0.15*100)/100],
    ['Καθαρό αποτέλεσμα (εκτ.)', Math.round((total - deductible*0.15)*100)/100],
    ...(unpaid > 0 ? [['Εκκρεμείς πληρωμές', unpaid]] as (string|number)[][] : []),
    [''],
    ['ΚΑΤΑΝΟΜΗ ΑΝΑ ΟΜΑΔΑ ΔΑΠΑΝΗΣ', '', '', '', ''],
    ['Ομάδα Δαπάνης', 'Εκπιπτόμενη', 'Εγγραφές', 'Σύνολο (€)', 'ΦΠΑ (€)'],
    ...Object.entries(EXPENSE_GROUPS)
      .filter(([k]) => byGroup[k])
      .sort(([ka],[kb]) => (byGroup[kb]?.amount||0) - (byGroup[ka]?.amount||0))
      .map(([k,info]) => [
        info.label,
        info.taxDeductible ? 'ΝΑΙ' : 'ΟΧΙ',
        byGroup[k]?.count || 0,
        byGroup[k]?.amount || 0,
        byGroup[k]?.vat || 0,
      ]),
    ['ΣΥΝΟΛΟ', '', expenses.length, total, totalVat],
  ];

  const ws1 = XLSX.utils.aoa_to_sheet(summaryData);

  // Column widths for summary sheet
  ws1['!cols'] = [{ wch:40 }, { wch:18 }, { wch:10 }, { wch:16 }, { wch:14 }];

  // Style the header cell (SheetJS community doesn't support cell styles but we can set column widths)
  XLSX.utils.book_append_sheet(wb, ws1, 'Σύνοψη');

  // ── Sheet 2: Αναλυτικές Δαπάνες ─────────────────────────────────────────
  const headers = [
    'Ημερομηνία', 'Ομάδα', 'Κατηγορία', 'Περιγραφή',
    'Κατάστημα / Πάροχος', 'Πληρώνει', 'Τρόπος Πληρωμής', 'Δόσεις',
    'Ποσό (€)', 'ΦΠΑ %', 'ΦΠΑ (€)', 'Cashback (€)',
    'Εκπιπτόμενη', 'Επαναλαμβ.', 'Εξοφλήθη', 'Σημειώσεις',
  ];

  const detailRows: (string|number)[][] = [headers];

  // Group and sort
  Object.entries(EXPENSE_GROUPS).forEach(([gKey, gInfo]) => {
    const grpExp = expenses.filter(e => e.expense_group === gKey);
    if (grpExp.length === 0) return;
    const grpTotal = grpExp.reduce((s,e) => s+e.amount, 0);
    const grpVat = grpExp.reduce((s,e) => s+(e.vat_amount||0), 0);

    // Group header row
    detailRows.push([
      `▶ ${gInfo.label}`,
      gInfo.taxDeductible ? 'ΕΚΠΙΠΤΟΜΕΝΗ' : 'ΜΗ ΕΚΠΙΠΤΟΜΕΝΗ',
      `${grpExp.length} εγγραφές`,
      '', '', '', '', '',
      grpTotal,
      '', grpVat, '', '', '', '', '',
    ]);

    // Sort by date desc
    grpExp.sort((a,b) => b.date.localeCompare(a.date)).forEach(e => {
      detailRows.push([
        fmtD(e.date),
        gInfo.label,
        e.category,
        e.description,
        e.store_vendor||'',
        PAID_BY_OPTIONS.find(p=>p.value===e.paid_by)?.label||e.paid_by||'',
        PAYMENT_METHODS.find(p=>p.value===e.payment_method)?.label||e.payment_method||'',
        e.installments || '',
        e.amount,
        e.vat_rate || '',
        e.vat_amount || '',
        e.cashback_amount || '',
        gInfo.taxDeductible ? 'ΝΑΙ' : 'ΟΧΙ',
        e.is_recurring ? 'ΝΑΙ' : 'ΟΧΙ',
        e.paid ? 'ΝΑΙ' : 'ΕΚΚΡΕΜΕΙ',
        e.notes||'',
      ]);
    });

    // Subtotal row
    detailRows.push([
      `Υποσύνολο: ${gInfo.label}`,
      '', '', '', '', '', '', '',
      grpTotal,
      '', grpVat, '', '', '', '', '',
    ]);
    detailRows.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
  });

  // Grand total
  detailRows.push([
    'ΓΕΝΙΚΟ ΣΥΝΟΛΟ',
    '', '', '', '', '', '', '',
    total,
    '', totalVat, totalCashback, '', '', '', '',
  ]);

  const ws2 = XLSX.utils.aoa_to_sheet(detailRows);
  ws2['!cols'] = [
    { wch:12 }, // Ημερομηνία
    { wch:22 }, // Ομάδα
    { wch:24 }, // Κατηγορία
    { wch:32 }, // Περιγραφή
    { wch:22 }, // Κατάστημα
    { wch:14 }, // Πληρώνει
    { wch:26 }, // Τρόπος Πληρωμής
    { wch:8  }, // Δόσεις
    { wch:12 }, // Ποσό
    { wch:7  }, // ΦΠΑ %
    { wch:12 }, // ΦΠΑ €
    { wch:12 }, // Cashback
    { wch:12 }, // Εκπιπτ.
    { wch:10 }, // Επαναλ.
    { wch:10 }, // Εξοφλ.
    { wch:30 }, // Σημειώσεις
  ];

  XLSX.utils.book_append_sheet(wb, ws2, 'Αναλυτικές Δαπάνες');

  // ── Sheet 3: Φορολογική Ανάλυση ─────────────────────────────────────────
  const taxData: (string|number)[][] = [
    ['ΦΟΡΟΛΟΓΙΚΗ ΑΝΑΛΥΣΗ ΔΑΠΑΝΩΝ', ''],
    ['Ακίνητο:', propertyName],
    ['Ημερομηνία:', today],
    [''],
    ['Κατηγορία', 'Ποσό (€)'],
    ['Σύνολο Δαπανών', total],
    ['Εκπιπτόμενες (βάσει Ν. 4172/2013)', deductible],
    ['Μη Εκπιπτόμενες', total - deductible],
    [''],
    ['ΦΟΡΟΛΟΓΙΚΟΣ ΥΠΟΛΟΓΙΣΜΟΣ', ''],
    ['Φορολογητέο Εισόδημα (εκτ.)', deductible],
    ['Συντελεστής Φόρου Ενοικίων', '15%'],
    ['Εκτιμώμενος Φόρος', Math.round(deductible*0.15*100)/100],
    ['ΦΠΑ (ανακτήσιμο αν επαγγελματία)', totalVat],
    [''],
    ['ΑΝΑΛΥΣΗ ΑΝΑ ΟΜΑΔΑ', '', '', ''],
    ['Ομάδα', 'Εκπιπτόμενη (ΝΑΙ/ΟΧΙ)', 'Ποσό (€)', 'Εκτ. Φόρος (€)'],
    ...Object.entries(EXPENSE_GROUPS)
      .filter(([k]) => byGroup[k])
      .map(([k,info]) => [
        info.label,
        info.taxDeductible ? 'ΝΑΙ' : 'ΟΧΙ',
        byGroup[k]?.amount || 0,
        info.taxDeductible ? Math.round((byGroup[k]?.amount||0)*0.15*100)/100 : 0,
      ]),
    [''],
    ['ΣΗΜΕΙΩΣΗ: Εκτίμηση βάσει ελληνικής φορολογικής νομοθεσίας. Συμβουλευτείτε λογιστή.', ''],
  ];

  const ws3 = XLSX.utils.aoa_to_sheet(taxData);
  ws3['!cols'] = [{ wch:42 }, { wch:24 }, { wch:16 }, { wch:16 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Φορολογική Ανάλυση');

  // Write and download
  XLSX.writeFile(wb, `δαπανες_${propertyName.replace(/\s+/g,'_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
}


function exportPDF(expenses: Expense[], propertyName: string, branding?: ReportBranding | null) {
  const accent = reportAccent(branding);
  const today = new Date().toLocaleDateString('el-GR',{day:'2-digit',month:'long',year:'numeric'});
  const total = expenses.reduce((s,e)=>s+e.amount,0);
  const totalVat = expenses.reduce((s,e)=>s+(e.vat_amount||0),0);
  const totalCashback = expenses.reduce((s,e)=>s+(e.cashback_amount||0),0);
  const deductible = expenses.filter(e=>EXPENSE_GROUPS[e.expense_group||'']?.taxDeductible).reduce((s,e)=>s+e.amount,0);
  const unpaid = expenses.filter(e=>!e.paid).reduce((s,e)=>s+e.amount,0);
  const grouped: Record<string,Expense[]> = {};
  expenses.forEach(e=>{ const g=e.expense_group||'other'; if(!grouped[g])grouped[g]=[]; grouped[g].push(e); });
  const byGroup: Record<string,number> = {};
  expenses.forEach(e=>{ const g=e.expense_group||'other'; byGroup[g]=(byGroup[g]||0)+e.amount; });

  const w = window.open('','_blank','width=1100,height=850');
  if (!w) { alert('Επίτρεψε τα popups'); return; }

  const kpiHtml = (val: string, label: string, color: string) =>
    `<div class="kpi"><div class="kpi-v" style="color:${color}">${esc(val)}</div><div class="kpi-l">${label}</div></div>`;

  const groupTableRows = Object.entries(EXPENSE_GROUPS)
    .filter(([k])=>grouped[k]&&grouped[k].length>0)
    .map(([k,info])=>{
      const grpExp = (grouped[k]||[]).sort((a,b)=>b.date.localeCompare(a.date));
      const grpTotal = grpExp.reduce((s,e)=>s+e.amount,0);
      const grpColor = GROUP_COLORS[k]||'#1a73e8';
      const rows = grpExp.map(e=>`
        <tr>
          <td>${esc(fmtD(e.date))}</td>
          <td>${esc(e.category)}</td>
          <td>
            <div style="font-weight:500;color:#1a1a2e">${esc(e.description)}</div>
            ${e.store_vendor?`<div style="font-size:9px;color:#9aa0a6">${esc(e.store_vendor)}</div>`:''}
            ${e.is_recurring?`<span class="badge-tag" style="background:#e8f0fe;color:#1a73e8">${e.recurring_frequency==='monthly'?'Μηνιαία':e.recurring_frequency==='annual'?'Ετήσια':'Επαναλ.'}</span>`:''}
          </td>
          <td>${PAID_BY_OPTIONS.find(p=>p.value===e.paid_by)?.label||'—'}</td>
          <td style="font-size:9px">${PAYMENT_METHODS.find(p=>p.value===e.payment_method)?.label||'—'}${e.installments?`<br>${esc(e.installments)} δόσεις`:''}</td>
          <td class="mono right">${esc(e.vat_amount&&e.vat_amount>0?fmtEur(e.vat_amount):'—')}</td>
          <td class="center"><span class="badge-tag ${info.taxDeductible?'b-yes':'b-no'}">${info.taxDeductible?'ΝΑΙ':'ΟΧΙ'}</span></td>
          <td class="mono right" style="font-weight:600;color:${e.paid?'#1a1a2e':'#b45309'}">${esc(fmtEur(e.amount))}</td>
        </tr>`).join('');
      return `
        <tr class="g-header">
          <td colspan="8">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div style="display:flex;align-items:center;gap:8px">
                <div style="width:10px;height:10px;border-radius:2px;background:${grpColor};flex-shrink:0"></div>
                <strong>${info.label}</strong>
                <span style="font-size:9px;color:#5f6368;font-weight:400">${esc(grpExp.length)} εγγραφές</span>
                ${info.taxDeductible?'<span class="badge-tag b-yes">ΕΚΠΙΠΤΟΜΕΝΗ</span>':''}
              </div>
              <span style="font-family:\'Roboto Mono\',monospace;font-weight:700;color:#c5221f">${esc(fmtEur(grpTotal))}</span>
            </div>
          </td>
        </tr>
        ${rows}
        <tr class="g-sub">
          <td colspan="7" style="text-align:right;color:#5f6368;font-size:10px;padding-right:12px">Υποσύνολο ${info.label}</td>
          <td class="mono right" style="font-weight:700;color:#c5221f">${esc(fmtEur(grpTotal))}</td>
        </tr>`;
    }).join('');

  w.document.write(`<!DOCTYPE html><html lang="el"><head>
  <meta charset="UTF-8"><title>Κατάσταση Δαπανών, ${esc(propertyName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Roboto:wght@400;500&family=Roboto+Mono:wght@500;700&display=swap" rel="stylesheet">
  <style>${brandRootVars(branding)}
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Inter',sans-serif;background:#fff;color:#1a1a2e;font-size:10.5px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .page{padding:28px 32px;max-width:940px;margin:0 auto}
    /* Header */
    .hdr{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:14px;margin-bottom:20px;border-bottom:3px solid ${accent}}
    .logo{font-family:'Inter',sans-serif;font-size:22px;font-weight:700;color:${accent}}.logo span{color:var(--accent)}
    .logo-s{font-size:10px;color:#5f6368;margin-top:2px}
    .meta-r{text-align:right}.meta-title{font-family:'Inter',sans-serif;font-size:15px;font-weight:500;color:#1a1a2e}
    .meta-d{font-size:10px;color:#5f6368;margin-top:3px}
    /* Section titles */
    .sec-title{font-family:'Inter',sans-serif;font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:.5px;color:${accent};margin-bottom:10px;padding-bottom:5px;border-bottom:1px solid #e8eaed;display:flex;align-items:center;gap:5px}
    .sec-title::before{content:'';display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--accent);flex-shrink:0}
    .sec{margin-bottom:20px}
    /* KPIs */
    .kpi-row{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:16px}
    .kpi{background:#f8f9fa;border:1px solid #e8eaed;border-radius:8px;padding:11px 13px}
    .kpi-v{font-family:'Roboto Mono',monospace;font-size:15px;font-weight:700;margin-bottom:3px}
    .kpi-l{font-family:'Inter',sans-serif;font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:.4px;color:#5f6368;line-height:1.3}
    /* Summary grid */
    .sum-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
    .sum-box{background:#f8f9fa;border:1px solid #e8eaed;border-radius:8px;padding:13px 15px}
    .sum-box-title{font-family:'Inter',sans-serif;font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:.4px;color:#1a73e8;margin-bottom:9px}
    .sum-row{display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #f1f3f4}
    .sum-row:last-child{border:none}
    .sum-row-l{font-size:10px;color:#5f6368}
    .sum-row-v{font-family:'Roboto Mono',monospace;font-size:10px;font-weight:600}
    .sum-total{display:flex;justify-content:space-between;align-items:center;padding:8px 0 0;margin-top:6px;border-top:2px solid #e8eaed}
    /* Table */
    table{width:100%;border-collapse:collapse;font-size:9.5px}
    th{font-family:'Inter',sans-serif;font-size:8.5px;font-weight:500;text-transform:uppercase;letter-spacing:.4px;color:#5f6368;padding:7px 7px;border-bottom:2px solid #e8eaed;text-align:left;background:#f8f9fa;white-space:nowrap}
    th.right{text-align:right}th.center{text-align:center}
    td{padding:7px 7px;border-bottom:1px solid #f1f3f4;vertical-align:top;color:#3c4043}
    td.mono{font-family:'Roboto Mono',monospace}td.right{text-align:right}td.center{text-align:center}
    .g-header td{background:#eef2ff;border-top:2px solid #1a73e8;border-bottom:1px solid #c5cae9;padding:9px 10px;font-family:'Inter',sans-serif;font-size:10.5px}
    .g-sub td{background:#fafeff;border-top:1px solid #e8eaed;border-bottom:2px solid #e8eaed;padding:5px 7px;font-size:9.5px}
    .g-total td{background:#1a73e8;color:#fff;padding:9px 10px;font-family:'Inter',sans-serif;font-size:11px;font-weight:500}
    .g-total .mono{color:#fff;font-weight:700;font-size:13px}
    /* Badges */
    .badge-tag{display:inline-block;padding:2px 6px;border-radius:4px;font-size:8px;font-weight:500;font-family:'Inter',sans-serif}
    .b-yes{background:#e6f4ea;color:#137333}.b-no{background:#f1f3f4;color:#80868b}
    /* Footer */
    .footer{margin-top:24px;padding-top:10px;border-top:1px solid #e8eaed;display:flex;justify-content:space-between;align-items:center;font-size:9px;color:#9aa0a6}
    .disc{text-align:center;font-size:8.5px;color:#9aa0a6;margin-top:6px;font-style:italic}
    @media print{
      .page{padding:18px 22px}
      .g-header td,.g-total td{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    }
  </style></head><body><div class="page">

  <!-- Header -->
  <div class="hdr">
    <div>
      ${branding ? `${brandLogoImg(branding, 30)}<div class="logo">${brandName(branding)}</div>` : `<div class="logo">Property <span>OS</span></div>`}
      <div class="logo-s">Επαγγελματικό Εργαλείο Διαχείρισης Ακινήτων</div>
    </div>
    <div class="meta-r">
      <div class="meta-title">${esc(propertyName)}</div>
      <div class="meta-d">Κατάσταση Δαπανών &nbsp;·&nbsp; ${esc(today)}</div>
    </div>
  </div>

  <!-- KPIs -->
  <div class="sec">
    <div class="sec-title">Σύνοψη</div>
    <div class="kpi-row">
      ${kpiHtml(fmtEur(total),'Σύνολο Δαπανών','#c5221f')}
      ${kpiHtml(fmtEur(deductible),'Εκπιπτόμενες','#1a73e8')}
      ${kpiHtml(fmtEur(total-deductible),'Μη Εκπιπτόμενες','#c5221f')}
      ${kpiHtml(fmtEur(totalVat),'Σύνολο ΦΠΑ','#b45309')}
      ${kpiHtml(fmtEur(totalCashback),'Cashback','#137333')}
    </div>

    <!-- Summary boxes -->
    <div class="sum-grid">
      <div class="sum-box">
        <div class="sum-box-title">Κατανομή ανά Ομάδα Δαπάνης</div>
        ${Object.entries(byGroup).sort(([,a],[,b])=>b-a).map(([k,v])=>`
          <div class="sum-row">
            <div style="display:flex;align-items:center;gap:5px">
              <div style="width:7px;height:7px;border-radius:2px;background:${GROUP_COLORS[k]||'#666'};flex-shrink:0"></div>
              <span class="sum-row-l">${esc(EXPENSE_GROUPS[k]?.label||k)}</span>
            </div>
            <span class="sum-row-v">${esc(fmtEur(v))}</span>
          </div>`).join('')}
        <div class="sum-total">
          <span style="font-family:'Inter',sans-serif;font-size:10px;font-weight:500">Γενικό Σύνολο</span>
          <span style="font-family:'Roboto Mono',monospace;font-size:13px;font-weight:700;color:#c5221f">${esc(fmtEur(total))}</span>
        </div>
      </div>
      <div class="sum-box">
        <div class="sum-box-title">Φορολογική Ανάλυση</div>
        <div class="sum-row"><span class="sum-row-l">Εκπιπτόμενες δαπάνες</span><span class="sum-row-v" style="color:#137333">${esc(fmtEur(deductible))}</span></div>
        <div class="sum-row"><span class="sum-row-l">Μη εκπιπτόμενες δαπάνες</span><span class="sum-row-v" style="color:#c5221f">${esc(fmtEur(total-deductible))}</span></div>
        <div class="sum-row"><span class="sum-row-l">Ποσοστό εκπτώσεων</span><span class="sum-row-v" style="color:#1a73e8">${esc(total>0?((deductible/total)*100).toFixed(1):0)}%</span></div>
        <div class="sum-row"><span class="sum-row-l">Εκτ. φόρος ενοικίων (15%)</span><span class="sum-row-v" style="color:#b45309">${esc(fmtEur(deductible*0.15))}</span></div>
        <div class="sum-row"><span class="sum-row-l">Σύνολο ΦΠΑ</span><span class="sum-row-v" style="color:#b45309">${esc(fmtEur(totalVat))}</span></div>
        ${totalCashback>0?`<div class="sum-row"><span class="sum-row-l">Cashback (εξοικονόμηση)</span><span class="sum-row-v" style="color:#137333">+${esc(fmtEur(totalCashback))}</span></div>`:''}
        ${unpaid>0?`<div class="sum-row"><span class="sum-row-l" style="color:#b45309">Εκκρεμείς πληρωμές</span><span class="sum-row-v" style="color:#b45309">${esc(fmtEur(unpaid))}</span></div>`:''}
      </div>
    </div>
  </div>

  <!-- Detail table -->
  <div class="sec">
    <div class="sec-title">Αναλυτικές Δαπάνες ανά Ομάδα</div>
    <table>
      <thead>
        <tr>
          <th style="width:70px">Ημερομηνία</th>
          <th style="width:88px">Κατηγορία</th>
          <th>Περιγραφή</th>
          <th style="width:68px">Πληρώνει</th>
          <th style="width:86px">Πληρωμή</th>
          <th class="right" style="width:68px">ΦΠΑ</th>
          <th class="center" style="width:48px">Εκπιπτ.</th>
          <th class="right" style="width:78px">Ποσό</th>
        </tr>
      </thead>
      <tbody>
        ${groupTableRows}
        <tr class="g-total">
          <td colspan="7">Γενικό Σύνολο &nbsp;·&nbsp; ${esc(expenses.length)} εγγραφές</td>
          <td class="mono right">${esc(fmtEur(total))}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div>${branding?.companyName ? brandName(branding) : 'Property OS'} &nbsp;·&nbsp; Κατάσταση Δαπανών Ακινήτου</div>
    <div>${esc(today)}</div>
  </div>
  <div class="disc">Εκτίμηση βάσει ελληνικής φορολογικής νομοθεσίας. Δεν αποτελεί επίσημο φορολογικό έγγραφο. Συμβουλευτείτε λογιστή.</div>

  </div></body></html>`);
  w.document.close();
  setTimeout(()=>{ w.print(); }, 900);
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TabExpenses({ propertyId, userId }: { propertyId:string; userId:string }) {
  const supabase = createClient();
  const branding = useReportBranding(userId);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string|null>(null);
  const [form, setForm] = useState(blank());
  const [filterGroup, setFilterGroup] = useState('all');
  const [filterPaidBy, setFilterPaidBy] = useState('all');
  const [filterPaid, setFilterPaid] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('date_desc');
  const [ok, setOk] = useState<string|null>(null);
  const [showInsights, setShowInsights] = useState(true);
  const [hoveredNote, setHoveredNote] = useState<string|null>(null);
  const [notePos, setNotePos] = useState({ x:0, y:0 });

  // Quick-add state
  const [quickDesc, setQuickDesc] = useState('');
  const [quickAmt, setQuickAmt] = useState('');
  const [quickGroup, setQuickGroup] = useState('fixed');
  const [quickSaving, setQuickSaving] = useState(false);

  // Cross-tab data
  const [loanPayment, setLoanPayment] = useState<number>(0);
  const [billsTotal, setBillsTotal] = useState<number>(0);
  const [targetRent, setTargetRent] = useState<number>(0);
  const [insuranceExpiry, setInsuranceExpiry] = useState<string|null>(null);

  const sf = (k:string, v:any) => setForm(f => ({ ...f, [k]:v }));

  // Auto-calc effects
  useEffect(() => {
    if (CASHBACK_METHODS.includes(form.payment_method) && form.cashback_pct && form.amount)
      sf('cashback_amount', (parseFloat(form.amount)*parseFloat(form.cashback_pct)/100).toFixed(2));
  }, [form.amount, form.cashback_pct, form.payment_method]);

  useEffect(() => {
    if (form.amount && form.vat_rate) {
      const base = parseFloat(form.amount)/(1+parseFloat(form.vat_rate)/100);
      sf('vat_amount', (parseFloat(form.amount)-base).toFixed(2));
    }
  }, [form.amount, form.vat_rate]);

  useEffect(() => {
    if (form.installments && form.amount)
      sf('amount_per_installment', (parseFloat(form.amount)/parseInt(form.installments)).toFixed(2));
  }, [form.amount, form.installments]);

  useEffect(() => {
    if (form.original_price && form.amount && parseFloat(form.original_price) > parseFloat(form.amount))
      sf('discount_amount', (parseFloat(form.original_price)-parseFloat(form.amount)).toFixed(2));
  }, [form.original_price, form.amount]);

  useEffect(() => {
    if (!editingId) {
      const cats = EXPENSE_GROUPS[form.expense_group]?.categories||[];
      sf('category', cats[0]||'');
    }
  }, [form.expense_group]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('expenses').select('*')
      .eq('property_id', propertyId).eq('user_id', userId)
      .neq('category','tenant_extra')
      .order('date', { ascending:false });
    setExpenses(data||[]);
    setLoading(false);
  }, [propertyId, userId]);

  // ── Cross-tab data fetch (loan + bills + property) ──
  useEffect(() => {
    const fetchCrossData = async () => {
      const [{ data:loanRows }, { data:prop }] = await Promise.all([
        // Το δάνειο αποθηκεύεται ως ποσό/επιτόκιο/διάρκεια — η μηνιαία δόση
        // υπολογίζεται με την τοκοχρεολυτική φόρμουλα (ίδια πηγή με την Επισκόπηση),
        // αθροίζοντας όλα τα ενεργά δάνεια του ακινήτου.
        supabase.from('loans').select('amount,rate,years,status').eq('property_id', propertyId),
        supabase.from('user_properties').select('target_rent,insurance_expiry').eq('id', propertyId).single(),
      ]);
      if (loanRows) setLoanPayment(
        loanRows
          .filter((l:any)=>l.status!=='inactive'&&l.status!=='closed')
          .reduce((s:number,l:any)=>s+annuityMonthly(Number(l.amount)||0,Number(l.rate)||0,Number(l.years)||0),0)
      );
      if (prop) {
        setTargetRent(prop.target_rent||0);
        setInsuranceExpiry(prop.insurance_expiry||null);
      }
      // Bills: sum current month fixed bills
      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
      const { data:bills } = await supabase.from('bills')
        .select('amount,avg_amount').eq('property_id', propertyId);
      if (bills) setBillsTotal(bills.reduce((s:number,b:any) => s+(b.avg_amount||b.amount||0), 0));
    };
    fetchCrossData();
  }, [propertyId]);

  useEffect(() => { load(); }, [load]);
  const notify = (msg:string) => { setOk(msg); setTimeout(()=>setOk(null),3000); };

  // ── Quick-add save ──
  const quickSave = async () => {
    if (!quickDesc.trim() || !quickAmt) return;
    setQuickSaving(true);
    const cats = EXPENSE_GROUPS[quickGroup]?.categories||[];
    await supabase.from('expenses').insert({
      property_id:propertyId, user_id:userId,
      description:quickDesc.trim(), amount:parseFloat(quickAmt),
      category:cats[0]||'', expense_group:quickGroup,
      date:new Date().toISOString().split('T')[0],
      paid_by:'owner', payment_method:'cash', paid:true,
      is_recurring:false,
      energy_class:null, serial_number:null, warranty_months:null, purchase_year:null,
      model_sku:null, vehicle_lease_model:null, vehicle_lease_months:null,
      vehicle_lease_monthly:null, vehicle_lease_type:null, vehicle_lease_count:null,
      broker_commission_pct:null, broker_commission_amount:null,
      travel_type:null, travel_destination:null,
      exhibition_name:null, exhibition_booth_cost:null, floor_type:null,
      appliance_lease_months:null, appliance_lease_monthly:null,
      installments:null, amount_upfront:null, amount_per_installment:null,
      cashback_pct:null, cashback_amount:null, original_price:null, discount_amount:null,
      vat_rate:null, vat_amount:null, store_vendor:null, notes:null, recurring_frequency:null,
    });
    setQuickSaving(false);
    setQuickDesc(''); setQuickAmt('');
    notify('Γρήγορη καταχώρηση αποθηκεύτηκε');
    load();
  };

  // ── Recurring reminders, δαπάνες που δεν έχουν καταχωρηθεί αυτόν τον μήνα ──
  const recurringReminders = useMemo(() => {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    return expenses.filter(e => {
      if (!e.is_recurring || e.recurring_frequency !== 'monthly') return false;
      const hasThisMonth = expenses.some(e2 =>
        e2.description === e.description &&
        e2.expense_group === e.expense_group && (() => {
          const d = new Date(e2.date+'T00:00:00');
          return d.getMonth()===thisMonth && d.getFullYear()===thisYear;
        })()
      );
      // Only show if the original is from a previous month
      const orig = new Date(e.date+'T00:00:00');
      return !hasThisMonth && (orig.getMonth()!==thisMonth || orig.getFullYear()!==thisYear);
    }).filter((e,i,arr) => arr.findIndex(x=>x.description===e.description)===i); // dedupe
  }, [expenses]);

  // ── Warranty alerts ──
  const warrantyAlerts = useMemo(() => {
    const now = new Date();
    return expenses.filter(e => {
      if (!e.warranty_months || !e.date) return false;
      const purchaseDate = new Date(e.date+'T00:00:00');
      const expiryDate = new Date(purchaseDate);
      expiryDate.setMonth(expiryDate.getMonth() + e.warranty_months);
      const daysLeft = Math.ceil((expiryDate.getTime()-now.getTime())/86400000);
      return daysLeft >= 0 && daysLeft <= 90;
    }).map(e => {
      const purchaseDate = new Date(e.date+'T00:00:00');
      const expiryDate = new Date(purchaseDate);
      expiryDate.setMonth(expiryDate.getMonth() + (e.warranty_months||0));
      const daysLeft = Math.ceil((expiryDate.getTime()-new Date().getTime())/86400000);
      return { ...e, daysLeft, expiryDate };
    });
  }, [expenses]);

  const buildPayload = (f: typeof form) => {
    const n = (v:string) => v ? parseFloat(v) : null;
    const ni = (v:string) => v ? parseInt(v) : null;
    return {
      property_id:propertyId, user_id:userId,
      description:f.description, amount:parseFloat(f.amount),
      category:f.category, expense_group:f.expense_group,
      date:f.date, paid_by:f.paid_by||'owner',
      payment_method:f.payment_method||null,
      installments:ni(f.installments), amount_upfront:n(f.amount_upfront),
      amount_per_installment:n(f.amount_per_installment),
      cashback_pct:n(f.cashback_pct), cashback_amount:n(f.cashback_amount),
      original_price:n(f.original_price), discount_amount:n(f.discount_amount),
      vat_rate:n(f.vat_rate), vat_amount:n(f.vat_amount),
      store_vendor:f.store_vendor||null,
      is_recurring:f.is_recurring, recurring_frequency:f.is_recurring?f.recurring_frequency:null,
      notes:f.notes||null, paid:f.paid,
      share_percent: SHARED_SCOPES.has(f.paid_by) ? (f.share_percent ? parseFloat(f.share_percent) : 50) : null,
      share_note: SHARED_SCOPES.has(f.paid_by) ? (f.share_note || null) : null,
      attachment_url:(f as any).attachment_url||null,
      energy_class:null, serial_number:null, warranty_months:null, purchase_year:null,
      model_sku:null, vehicle_lease_model:null, vehicle_lease_months:null,
      vehicle_lease_monthly:null, vehicle_lease_type:null, vehicle_lease_count:null,
      broker_commission_pct:null, broker_commission_amount:null,
      travel_type:null, travel_destination:null,
      exhibition_name:null, exhibition_booth_cost:null, floor_type:null,
      appliance_lease_months:null, appliance_lease_monthly:null,
    };
  };

  const save = async () => {
    if (!form.description || !form.amount || !form.date) return;
    const selectedDate = new Date(form.date+'T00:00:00');
    const today = new Date(); today.setHours(0,0,0,0);
    if (selectedDate > today) {
      if (!window.confirm(`Η ημερομηνία ${fmtD(form.date)} είναι στο μέλλον. Συνέχεια;`)) return;
    }
    setSaving(true);
    const { error } = await supabase.from('expenses').insert(buildPayload(form));
    setSaving(false);
    if (error) { alert('Σφάλμα: '+error.message); return; }
    setShowForm(false); setForm(blank());
    notify('Η δαπάνη καταχωρήθηκε'); load();
  };

  const saveEdit = async (id:string, editForm: typeof form) => {
    setSaving(true);
    const p = buildPayload(editForm);
    delete (p as any).property_id; delete (p as any).user_id;
    const { error } = await supabase.from('expenses').update(p).eq('id',id);
    setSaving(false);
    if (error) { alert('Σφάλμα: '+error.message); return; }
    setEditingId(null); notify('Η δαπάνη ενημερώθηκε'); load();
  };

  const del = async (id:string) => {
    if (!confirm('Διαγραφή δαπάνης;')) return;
    await supabase.from('expenses').delete().eq('id',id);
    setExpenses(p => p.filter(e => e.id!==id));
    if (editingId===id) setEditingId(null);
  };

  const duplicate = async (e: Expense) => {
    const payload = buildPayload({
      ...expenseToForm(e),
      date: new Date().toISOString().split('T')[0],
      paid: false,
    });
    await supabase.from('expenses').insert(payload);
    notify('Δαπάνη αντιγράφηκε'); load();
  };

  // ── Filtered & sorted ──
  const processed = useMemo(() => {
    let list = [...expenses];
    if (filterGroup !== 'all') list = list.filter(e => e.expense_group === filterGroup);
    if (filterPaidBy !== 'all') list = list.filter(e => e.paid_by === filterPaidBy);
    if (filterPaid === 'paid') list = list.filter(e => e.paid);
    if (filterPaid === 'unpaid') list = list.filter(e => !e.paid);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        e.description.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        (e.store_vendor||'').toLowerCase().includes(q)
      );
    }
    if (sortBy === 'date_desc') list.sort((a,b) => b.date.localeCompare(a.date));
    if (sortBy === 'date_asc') list.sort((a,b) => a.date.localeCompare(b.date));
    if (sortBy === 'amount_desc') list.sort((a,b) => b.amount-a.amount);
    if (sortBy === 'amount_asc') list.sort((a,b) => a.amount-b.amount);
    return list;
  }, [expenses, filterGroup, filterPaidBy, filterPaid, search, sortBy]);

  // ── KPIs ──
  const total        = processed.reduce((s,e) => s+e.amount, 0);
  const totalCashback= processed.reduce((s,e) => s+(e.cashback_amount||0), 0);
  const totalVat     = processed.reduce((s,e) => s+(e.vat_amount||0), 0);
  const totalOwner   = processed.filter(e => !e.paid_by||e.paid_by==='owner').reduce((s,e) => s+e.amount, 0);
  const totalTenant  = processed.filter(e => e.paid_by==='tenant').reduce((s,e) => s+e.amount, 0);
  const totalMyShare = processed.reduce((s,e) => s + ownerShareAmount(e), 0);
  const hasShared    = processed.some(e => SHARED_SCOPES.has(e.paid_by||''));
  const deductible   = processed.filter(e => EXPENSE_GROUPS[e.expense_group||'']?.taxDeductible).reduce((s,e) => s+e.amount, 0);
  const unpaidTotal  = processed.filter(e => !e.paid).reduce((s,e) => s+e.amount, 0);

  // ── Year-over-year ──
  const yoyData = useMemo(() => {
    const thisYear = new Date().getFullYear();
    const lastYear = thisYear - 1;
    const thisYTD = expenses.filter(e => new Date(e.date+'T00:00:00').getFullYear()===thisYear).reduce((s,e)=>s+e.amount,0);
    const lastYTD = expenses.filter(e => new Date(e.date+'T00:00:00').getFullYear()===lastYear).reduce((s,e)=>s+e.amount,0);
    const change = lastYTD > 0 ? ((thisYTD-lastYTD)/lastYTD)*100 : null;
    return { thisYTD, lastYTD, change, thisYear, lastYear };
  }, [expenses]);

  // ── Cashback summary ──
  const cashbackStats = useMemo(() => {
    const thisYear = new Date().getFullYear();
    const ytdCashback = expenses.filter(e=>new Date(e.date+'T00:00:00').getFullYear()===thisYear).reduce((s,e)=>s+(e.cashback_amount||0),0);
    const cashbackCount = expenses.filter(e=>(e.cashback_amount||0)>0).length;
    const bestCashback = expenses.filter(e=>(e.cashback_amount||0)>0).sort((a,b)=>(b.cashback_amount||0)-(a.cashback_amount||0))[0];
    return { ytdCashback, cashbackCount, bestCashback };
  }, [expenses]);

  const groupOptions = [
    { value:'all', label:'Όλες οι Ομάδες' },
    ...Object.entries(EXPENSE_GROUPS).map(([k,v]) => ({ value:k, label:v.label })),
  ];
  const paidByOpts  = [{ value:'all',label:'Όλοι' }, ...PAID_BY_OPTIONS];
  const paidOpts    = [{ value:'all',label:'Όλες' },{ value:'paid',label:'Εξοφλημένες' },{ value:'unpaid',label:'Εκκρεμείς' }];

  // ── Inline Edit Row ──
  function InlineEdit({ expense }: { expense:Expense }) {
    const [ef, setEf] = useState(expenseToForm(expense));
    const sef = (k:string,v:any) => setEf(f=>({...f,[k]:v}));
    useEffect(() => {
      if (CASHBACK_METHODS.includes(ef.payment_method) && ef.cashback_pct && ef.amount)
        sef('cashback_amount',(parseFloat(ef.amount)*parseFloat(ef.cashback_pct)/100).toFixed(2));
    },[ef.amount,ef.cashback_pct,ef.payment_method]);
    useEffect(() => {
      if (ef.amount && ef.vat_rate) {
        const base=parseFloat(ef.amount)/(1+parseFloat(ef.vat_rate)/100);
        sef('vat_amount',(parseFloat(ef.amount)-base).toFixed(2));
      }
    },[ef.amount,ef.vat_rate]);
    useEffect(() => {
      if (ef.installments && ef.amount)
        sef('amount_per_installment',(parseFloat(ef.amount)/parseInt(ef.installments)).toFixed(2));
    },[ef.amount,ef.installments]);
    useEffect(() => {
      if (ef.original_price && ef.amount && parseFloat(ef.original_price)>parseFloat(ef.amount))
        sef('discount_amount',(parseFloat(ef.original_price)-parseFloat(ef.amount)).toFixed(2));
    },[ef.original_price,ef.amount]);
    return (
      <tr>
        <td colSpan={10} style={{ padding:0 }}>
          <div style={{ padding:'0 0 16px 0' }}>
            <ExpenseForm form={ef} sf={sef} propertyId={propertyId}
              onSave={() => saveEdit(expense.id, ef)}
              onCancel={() => setEditingId(null)}
              saving={saving} isEdit />
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div style={{ fontFamily:"'Inter', sans-serif", color:'var(--text-primary)', width:'100%', boxSizing:'border-box' }}>

      {/* Toast */}
      {ok && (
        <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderLeft:'3px solid var(--border-subtle)', borderRadius:8, padding:'10px 16px', marginBottom:14, color:'var(--positive)', fontSize:12, fontFamily:"'Inter', sans-serif" }}>
          {ok}
        </div>
      )}

      {/* Unpaid alert */}
      {unpaidTotal > 0 && (
        <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderLeft:'3px solid var(--warning)', borderRadius:8, padding:'10px 16px', marginBottom:14, display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:7, height:7, borderRadius:'50%', background:'var(--warning)', flexShrink:0 }} />
          <span style={{ fontSize:12, color:'var(--warning)', fontFamily:"'Inter', sans-serif", fontWeight:500 }}>
            {processed.filter(e=>!e.paid).length} εκκρεμείς δαπάνες, {fmtEur(unpaidTotal)} αναμένουν εξόφληση
          </span>
        </div>
      )}

      {/* Tooltip for notes */}
      {hoveredNote && (
        <div style={{ position:'fixed', left:notePos.x+14, top:notePos.y-8, background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:8, padding:'8px 12px', zIndex:9999, maxWidth:280, fontSize:12, color:'var(--text-primary)', fontFamily:"'Inter', sans-serif", lineHeight:1.5, boxShadow:'var(--shadow-lg)', pointerEvents:'none' }}>
          {hoveredNote}
        </div>
      )}

      {/* Recurring reminders */}
      {recurringReminders.length > 0 && (
        <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderLeft:'3px solid var(--accent)', borderRadius:8, padding:'10px 16px', marginBottom:12 }}>
          <div style={{ fontSize:10, fontWeight:500, color:'var(--accent)', textTransform:'uppercase' as const, letterSpacing:'0.5px', fontFamily:"'Inter', sans-serif", marginBottom:8 }}>
            Επαναλαμβανόμενες, εκκρεμείς αυτόν τον μήνα
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {recurringReminders.slice(0,6).map((e, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:8, background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:8, padding:'6px 12px' }}>
                <span style={{ fontSize:12, color:'var(--text-primary)', fontFamily:"'Inter', sans-serif" }}>{e.description}</span>
                <span style={{ fontSize:11, color:'var(--text-secondary)', fontFamily:"'Roboto Mono', monospace", fontVariantNumeric:'tabular-nums' }}>{fmtEur(e.amount)}</span>
                <button onClick={async () => {
                  await supabase.from('expenses').insert({
                    property_id:propertyId, user_id:userId,
                    description:e.description, amount:e.amount,
                    category:e.category, expense_group:e.expense_group,
                    date:new Date().toISOString().split('T')[0],
                    paid_by:e.paid_by||'owner', payment_method:e.payment_method||'cash',
                    is_recurring:true, recurring_frequency:e.recurring_frequency,
                    paid:false, vat_rate:e.vat_rate, store_vendor:e.store_vendor,
                    installments:null, amount_upfront:null, amount_per_installment:null,
                    cashback_pct:null, cashback_amount:null, original_price:null, discount_amount:null,
                    vat_amount:null, energy_class:null, serial_number:null, warranty_months:null,
                    purchase_year:null, model_sku:null, vehicle_lease_model:null, vehicle_lease_months:null,
                    vehicle_lease_monthly:null, vehicle_lease_type:null, vehicle_lease_count:null,
                    broker_commission_pct:null, broker_commission_amount:null,
                    travel_type:null, travel_destination:null, exhibition_name:null,
                    exhibition_booth_cost:null, floor_type:null, appliance_lease_months:null,
                    appliance_lease_monthly:null, notes:null,
                  });
                  notify('Καταχωρήθηκε'); load();
                }} style={{ height:24, padding:'0 8px', borderRadius:12, border:'none', background:'var(--accent)', color:'var(--accent-text)', fontSize:10, cursor:'pointer', fontFamily:"'Inter', sans-serif", fontWeight:500 }}>
                  + Καταχώρηση
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warranty alerts */}
      {warrantyAlerts.length > 0 && (
        <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderLeft:'3px solid var(--warning)', borderRadius:8, padding:'10px 16px', marginBottom:12 }}>
          <div style={{ fontSize:10, fontWeight:500, color:'var(--warning)', textTransform:'uppercase' as const, letterSpacing:'0.5px', fontFamily:"'Inter', sans-serif", marginBottom:8 }}>
            Εγγυήσεις που λήγουν σύντομα
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {warrantyAlerts.map((e, i) => (
              <div key={i} style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:8, padding:'6px 12px', fontSize:12, fontFamily:"'Inter', sans-serif" }}>
                <span style={{ color:'var(--text-primary)', fontWeight:500 }}>{e.description}</span>
                {', '}
                <span style={{ color:e.daysLeft<=14?'var(--negative)':'var(--warning)', fontWeight:500 }}>
                  {e.daysLeft===0?'Λήγει σήμερα':`${e.daysLeft} μέρες`}
                </span>
                <span style={{ color:'var(--text-tertiary)', marginLeft:4 }}>
                  ({e.expiryDate.toLocaleDateString('el-GR')})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--text-tertiary)', display:'inline-block' }} />
          <span style={{ fontSize:11, fontWeight:500, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.5px', fontFamily:"'Inter', sans-serif" }}>
            Δαπάνες Ακινήτου
          </span>
        </div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {/* Προϋπολογισμός & Φορολογική Ανάλυση: ζουν πλέον ως δικές τους ενότητες
              (Δαπάνες → Προϋπολογισμός, Συγκριτική Ανάλυση → Φορολογική Ανάλυση) —
              καμία διπλή είσοδος εδώ. */}
          <button onClick={() => exportExcel(processed, 'Ακίνητο')}
            style={{ height:36, padding:'0 14px', borderRadius:20, border:'1px solid var(--border-default)', background:'transparent', color:'var(--text-secondary)', cursor:'pointer', fontSize:12, fontFamily:"'Inter', sans-serif", fontWeight:500 }}>
            Εξαγωγή Excel
          </button>
          <button onClick={() => exportPDF(processed, 'Ακίνητο', branding)}
            style={{ height:36, padding:'0 14px', borderRadius:20, border:'1px solid var(--border-default)', background:'transparent', color:'var(--text-secondary)', cursor:'pointer', fontSize:12, fontFamily:"'Inter', sans-serif", fontWeight:500 }}>
            Εξαγωγή PDF
          </button>
          <button onClick={() => { setShowForm(v=>!v); setEditingId(null); }}
            style={{ height:36, padding:'0 18px', borderRadius:20, border:`1px solid ${showForm?'var(--border-default)':'var(--accent)'}`, background:showForm?'transparent':'var(--accent)', color:showForm?'var(--text-secondary)':'var(--accent-text)', cursor:'pointer', fontSize:12, fontFamily:"'Inter', sans-serif", fontWeight:500, whiteSpace:'nowrap' }}>
            {showForm ? 'Κλείσιμο' : '+ Νέα Δαπάνη'}
          </button>
        </div>
      </div>

      {/* ── Quick-add bar ── */}
      <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:10, padding:'10px 14px', marginBottom:14, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span style={{ fontSize:11, color:'var(--text-secondary)', fontFamily:"'Inter', sans-serif", fontWeight:500, flexShrink:0 }}>Γρήγορη καταχώρηση:</span>
        <input
          value={quickDesc} onChange={e=>setQuickDesc(e.target.value)}
          placeholder="Τί αγόρασες; (π.χ. Λογαριασμός ΔΕΗ)"
          onKeyDown={e=>{ if(e.key==='Enter'&&quickAmt) quickSave(); }}
          style={{ flex:3, minWidth:160, height:32, background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:4, padding:'0 10px', color:'var(--text-primary)', fontSize:13, fontFamily:"'Inter', sans-serif", outline:'none' }}
        />
        <input
          type="number" value={quickAmt} onChange={e=>setQuickAmt(e.target.value)}
          placeholder="Ποσό €"
          onKeyDown={e=>{ if(e.key==='Enter'&&quickDesc.trim()) quickSave(); }}
          style={{ flex:1, minWidth:90, height:32, background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:4, padding:'0 10px', color:'var(--text-primary)', fontSize:13, fontFamily:"'Roboto Mono', monospace", fontVariantNumeric:'tabular-nums', outline:'none' }}
        />
        <select value={quickGroup} onChange={e=>setQuickGroup(e.target.value)}
          style={{ flex:2, minWidth:130, height:32, background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:4, padding:'0 8px', color:'var(--text-primary)', fontSize:12, fontFamily:"'Inter', sans-serif", outline:'none' }}>
          {Object.entries(EXPENSE_GROUPS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={quickSave} disabled={quickSaving||!quickDesc.trim()||!quickAmt}
          style={{ height:32, padding:'0 16px', borderRadius:20, border:'none', background:'var(--accent)', color:'var(--accent-text)', fontSize:12, fontFamily:"'Inter', sans-serif", fontWeight:500, cursor:'pointer', flexShrink:0, opacity:quickSaving||!quickDesc.trim()||!quickAmt?0.5:1 }}>
          {quickSaving?'...':'Αποθήκευση'}
        </button>
        <span style={{ fontSize:10, color:'var(--text-tertiary)', fontFamily:"'Inter', sans-serif", flexShrink:0 }}>Enter</span>
      </div>

      {/* Add form */}
      {showForm && (
        <ExpenseForm form={form} sf={sf} propertyId={propertyId}
          onSave={save} onCancel={() => { setShowForm(false); setForm(blank()); }}
          saving={saving} />
      )}

      {/* KPI strip, premium, ήρεμο: ουδέτεροι αριθμοί, χρώμα μόνο όπου έχει νόημα */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,minmax(0,1fr))', gap:10, marginBottom:12 }}>
        {[
          { label:'Σύνολο δαπανών',      value:fmtEur(total),         accent:false, primary:true },
          hasShared
            ? { label:'Δικό μου μερίδιο', value:fmtEur(totalMyShare), accent:false }
            : { label:'Κόστος ιδιοκτήτη', value:fmtEur(totalOwner),   accent:false },
          { label:'Κόστος ενοικιαστή',  value:fmtEur(totalTenant),   accent:false },
          { label:'Εκπιπτόμενες',        value:fmtEur(deductible),    accent:deductible>0 },
          { label:'Συνολικό cashback',   value:fmtEur(totalCashback), accent:totalCashback>0 },
          { label:'Σύνολο ΦΠΑ',          value:fmtEur(totalVat),      accent:false },
        ].map((k,i) => (
          <div key={i} style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:'14px 16px' }}>
            <div style={{ fontSize:18, fontWeight:700, color: k.accent ? 'var(--positive)' : 'var(--text-primary)', fontFamily:"'Inter', sans-serif", fontVariantNumeric:'tabular-nums', letterSpacing:'-0.02em', marginBottom:5 }}>{k.value}</div>
            <div style={{ fontSize:10, fontWeight:500, letterSpacing:'0.04em', textTransform:'uppercase' as const, color:'var(--text-tertiary)', fontFamily:"'Inter', sans-serif" }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── YoY + Cashback summary row ── */}
      {(yoyData.lastYTD > 0 || cashbackStats.ytdCashback > 0) && (
        <div style={{ display:'grid', gridTemplateColumns:yoyData.lastYTD>0&&cashbackStats.ytdCashback>0?'1fr 1fr':'1fr', gap:10, marginBottom:12 }}>
          {yoyData.lastYTD > 0 && (
            <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:10, padding:'12px 16px', display:'flex', alignItems:'center', gap:16 }}>
              <div>
                <div style={{ fontSize:10, fontWeight:600, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.05em', fontFamily:"'Inter', sans-serif", marginBottom:6 }}>
                  Φέτος έναντι πέρσι, ίδια περίοδος
                </div>
                <div style={{ display:'flex', gap:18, alignItems:'baseline' }}>
                  <div>
                    <div style={{ fontSize:15, fontWeight:700, color:'var(--text-primary)', fontFamily:"'Inter', sans-serif", fontVariantNumeric:'tabular-nums', letterSpacing:'-0.02em' }}>{fmtEur(yoyData.thisYTD)}</div>
                    <div style={{ fontSize:10, color:'var(--text-tertiary)', fontFamily:"'Inter', sans-serif" }}>{yoyData.thisYear}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:15, fontWeight:700, color:'var(--text-secondary)', fontFamily:"'Inter', sans-serif", fontVariantNumeric:'tabular-nums', letterSpacing:'-0.02em' }}>{fmtEur(yoyData.lastYTD)}</div>
                    <div style={{ fontSize:10, color:'var(--text-tertiary)', fontFamily:"'Inter', sans-serif" }}>{yoyData.lastYear}</div>
                  </div>
                  {yoyData.change !== null && (
                    <div style={{ fontSize:13, fontWeight:600, color:yoyData.change>0?'var(--warning)':'var(--positive)', fontFamily:"'Inter', sans-serif", fontVariantNumeric:'tabular-nums' }}>
                      {yoyData.change>0?'+':'−'}{Math.abs(yoyData.change).toFixed(0)}%
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {cashbackStats.ytdCashback > 0 && (
            <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderLeft:'3px solid var(--border-subtle)', borderRadius:10, padding:'12px 16px' }}>
              <div style={{ fontSize:10, fontWeight:600, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.05em', fontFamily:"'Inter', sans-serif", marginBottom:6 }}>
                Επιστροφές χρημάτων φέτος
              </div>
              <div style={{ display:'flex', gap:16, alignItems:'baseline' }}>
                <div style={{ fontSize:16, fontWeight:700, color:'var(--positive)', fontFamily:"'Inter', sans-serif", fontVariantNumeric:'tabular-nums', letterSpacing:'-0.02em' }}>{fmtEur(cashbackStats.ytdCashback)}</div>
                <div style={{ fontSize:11, color:'var(--text-secondary)', fontFamily:"'Inter', sans-serif" }}>{cashbackStats.cashbackCount} αγορές</div>
                {cashbackStats.bestCashback && (
                  <div style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:"'Inter', sans-serif" }}>
                    Καλύτερη: {cashbackStats.bestCashback.description} (+{fmtEur(cashbackStats.bestCashback.cashback_amount||0)})
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Insights Panel ── */}
      {showInsights && expenses.length > 0 && (() => {
        const now = new Date();
        const MONTHS_GR = ['Ιαν','Φεβ','Μαρ','Απρ','Μαϊ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
        const thisMonth = now.getMonth();
        const thisYear = now.getFullYear();
        const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
        const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;

        const byMonth = (m: number, y: number) => expenses
          .filter(e => { const d=new Date(e.date+'T00:00:00'); return d.getMonth()===m&&d.getFullYear()===y; })
          .reduce((s,e)=>s+e.amount,0);

        const thisMonthTotal = byMonth(thisMonth, thisYear);
        const lastMonthTotal = byMonth(lastMonth, lastMonthYear);
        const momChange = lastMonthTotal > 0 ? ((thisMonthTotal-lastMonthTotal)/lastMonthTotal)*100 : 0;

        const ytdExpenses = expenses.filter(e => new Date(e.date+'T00:00:00').getFullYear()===thisYear);
        const ytdTotal = ytdExpenses.reduce((s,e)=>s+e.amount,0);
        const monthsElapsed = thisMonth + 1;
        const avgMonthly = monthsElapsed > 0 ? ytdTotal / monthsElapsed : 0;
        const projectedAnnual = avgMonthly * 12;

        // Top category this month
        const catMap: Record<string,number> = {};
        expenses.filter(e => { const d=new Date(e.date+'T00:00:00'); return d.getMonth()===thisMonth&&d.getFullYear()===thisYear; })
          .forEach(e => { catMap[e.category]=(catMap[e.category]||0)+e.amount; });
        const topCat = Object.entries(catMap).sort(([,a],[,b])=>b-a)[0];

        // Breakeven
        const totalMonthly = avgMonthly + loanPayment + billsTotal/12;
        const breakevenRent = Math.ceil(totalMonthly * 1.15);

        // Days since last expense
        const daysSinceLast = expenses[0]?.date
          ? Math.floor((now.getTime()-new Date(expenses[0].date+'T00:00:00').getTime())/86400000) : null;

        // Insurance
        const insuranceDays = insuranceExpiry
          ? Math.ceil((new Date(insuranceExpiry).getTime()-now.getTime())/86400000) : null;

        // Recurring
        const recurringExp = expenses.filter(e=>e.is_recurring);
        const recurringMonthly = recurringExp.reduce((s,e)=>{
          const f = e.recurring_frequency;
          return s + (f==='monthly'?e.amount : f==='quarterly'?e.amount/3 : f==='biannual'?e.amount/6 : f==='annual'?e.amount/12 : e.amount);
        },0);

        // Deductible ratio
        const deductibleAmt = expenses.filter(e=>EXPENSE_GROUPS[e.expense_group||'']?.taxDeductible).reduce((s,e)=>s+e.amount,0);
        const deductiblePct = ytdTotal>0 ? (deductibleAmt/ytdTotal)*100 : 0;

        // Build insight cards
        type Card = { icon:string; title:string; value:string; sub:string; accent:string; urgent?:boolean };
        const cards: Card[] = [];

        // Σε σχέση με τον προηγούμενο μήνα (χωρίς παραπλανητικό «-100%» όταν δεν έχει μπει τίποτα ακόμη)
        if (lastMonthTotal > 0) {
          if (thisMonthTotal <= 0) {
            cards.push({
              icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z',
              title: MONTHS_GR[thisMonth],
              value: 'Καμία δαπάνη ακόμη',
              sub: `Τον προηγούμενο μήνα είχες ${fmtEur(lastMonthTotal)}`,
              accent: 'var(--text-secondary)',
            });
          } else {
            const up = momChange > 0;
            cards.push({
              icon: up ? 'M13 17h8m0 0V9m0 8l-8-8-4 4-6-6' : 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
              title: `Σε σχέση με τον ${MONTHS_GR[lastMonth]}`,
              value: `${up?'+':'−'}${Math.abs(momChange).toFixed(0)}%`,
              sub: `${fmtEur(thisMonthTotal)} τώρα, ${fmtEur(lastMonthTotal)} τον προηγούμενο μήνα`,
              accent: up ? 'var(--negative)' : 'var(--positive)',
              urgent: momChange > 25,
            });
          }
        }

        // Πρόβλεψη έτους
        if (projectedAnnual > 0) {
          cards.push({
            icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z',
            title: 'Πρόβλεψη έτους',
            value: fmtEur(projectedAnnual),
            sub: `Με βάση ${monthsElapsed} ${monthsElapsed===1?'μήνα':'μήνες'}, μέσος όρος ${fmtEur(avgMonthly)} τον μήνα`,
            accent: 'var(--info)',
          });
        }

        // Ενοίκιο ισοσκελισμού
        if (totalMonthly > 0) {
          const ok = targetRent > 0 && breakevenRent <= targetRent;
          const bad = targetRent > 0 && breakevenRent > targetRent;
          cards.push({
            icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 0 0 1 1h3m10-11l2 2m-2-2v10a1 1 0 0 0-1 1h-3m-6 0a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1m-6 0h16',
            title: 'Ενοίκιο ισοσκελισμού',
            value: `${fmtEur(breakevenRent)}/μήνα`,
            sub: targetRent > 0 ? `Καλύπτει όλα τα έξοδα. Στόχος σου: ${fmtEur(targetRent)} (${ok?'εντός':'εκτός'})` : 'Το ενοίκιο που καλύπτει όλα τα έξοδα. Όρισε στόχο στις Ρυθμίσεις.',
            accent: bad ? 'var(--negative)' : ok ? 'var(--positive)' : 'var(--text-secondary)',
            urgent: bad,
          });
        }

        // Εκπιπτόμενες δαπάνες
        if (ytdTotal > 0) {
          cards.push({
            icon: 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z',
            title: 'Εκπιπτόμενες δαπάνες',
            value: `${deductiblePct.toFixed(0)}%`,
            sub: `${fmtEur(deductibleAmt)} εκπίπτουν. Εκτιμώμενο όφελος φόρου: ${fmtEur(deductibleAmt*0.15)}`,
            accent: 'var(--positive)',
          });
        }

        // Recurring
        if (recurringMonthly > 0) {
          cards.push({
            icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15',
            title: 'Πάγιες τον μήνα',
            value: fmtEur(recurringMonthly),
            sub: `${recurringExp.length} επαναλαμβανόμενες καταχωρήσεις`,
            accent: 'var(--accent)',
          });
        }

        // Top category
        if (topCat) {
          cards.push({
            icon: 'M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z',
            title: `Μεγαλύτερη κατηγορία, ${MONTHS_GR[thisMonth]}`,
            value: topCat[0],
            sub: `${fmtEur(topCat[1])} αυτόν τον μήνα`,
            accent: 'var(--warning)',
          });
        }

        // Alerts
        if (daysSinceLast && daysSinceLast > 30) {
          cards.push({
            icon: 'M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
            title: 'Υπενθύμιση',
            value: `${daysSinceLast} μέρες`,
            sub: 'Χωρίς νέα καταχώρηση δαπάνης',
            accent: 'var(--warning)',
            urgent: true,
          });
        }

        if (insuranceDays !== null && insuranceDays <= 60) {
          cards.push({
            icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
            title: insuranceDays < 0 ? 'Ασφάλεια Έληξε!' : 'Ασφάλεια Λήγει',
            value: insuranceDays < 0 ? 'Ληγμένη' : `${insuranceDays} μέρες`,
            sub: insuranceDays < 0 ? 'Ανανέωσε άμεσα' : 'Ανανέωσε έγκαιρα',
            accent: 'var(--negative)',
            urgent: true,
          });
        }

        if (loanPayment > 0) {
          cards.push({
            icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3z',
            title: 'Δόση δανείου',
            value: `${fmtEur(loanPayment)}/μήνα`,
            sub: 'Από την καρτέλα Δάνειο',
            accent: 'var(--text-secondary)',
          });
        }

        if (cards.length === 0) return null;

        return (
          <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:'16px 18px', marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ width:5, height:5, borderRadius:'50%', background:'var(--text-tertiary)', display:'inline-block' }} />
                <span style={{ fontSize:10, fontWeight:500, letterSpacing:'0.5px', textTransform:'uppercase' as const, color:'var(--text-secondary)', fontFamily:"'Inter', sans-serif" }}>
                  Αναλύσεις & Ειδοποιήσεις
                </span>
                {cards.some(c=>c.urgent) && (
                  <span style={{ fontSize:9, fontWeight:700, color:'var(--negative)', background:'var(--negative-soft)', padding:'2px 8px', borderRadius:10, fontFamily:"'Inter', sans-serif" }}>
                    {cards.filter(c=>c.urgent).length} επείγοντα
                  </span>
                )}
              </div>
              <button onClick={() => setShowInsights(false)}
                style={{ background:'transparent', border:'none', color:'var(--text-tertiary)', cursor:'pointer', fontSize:18, lineHeight:1, display:'flex', alignItems:'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))', gap:10 }}>
              {cards.map((card, i) => (
                <div key={i} style={{ background:card.urgent?'var(--warning-soft)':'var(--bg-surface)', border:`1px solid ${card.urgent?'var(--warning-border)':'var(--border-subtle)'}`, borderRadius:12, padding:'14px 16px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d={card.icon} />
                    </svg>
                    <span style={{ fontSize:10, fontWeight:600, color:'var(--text-secondary)', fontFamily:"'Inter', sans-serif", textTransform:'uppercase', letterSpacing:'0.05em', flex:1, minWidth:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {card.title}
                    </span>
                    {card.urgent && <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--warning)', flexShrink:0 }} />}
                  </div>
                  <div style={{ fontSize:18, fontWeight:700, color:'var(--text-primary)', fontFamily:"'Inter', sans-serif", fontVariantNumeric:'tabular-nums', letterSpacing:'-0.02em', marginBottom:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {card.value}
                  </div>
                  <div style={{ fontSize:11.5, color:'var(--text-tertiary)', fontFamily:"'Inter', sans-serif", lineHeight:1.45 }}>
                    {card.sub}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}


      {/* Analytics */}
      <ExpenseAnalytics expenses={expenses} />

      {/* Filters + Search */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr auto', gap:10, marginBottom:16, alignItems:'flex-end' }}>
        <div>
          <label style={labelStyle}>Αναζήτηση</label>
          <div style={{ position:'relative' }}>
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Περιγραφή, κατηγορία..."
              style={{ width:'100%', height:40, background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:4, padding:'0 36px 0 12px', color:'var(--text-primary)', fontSize:14, fontFamily:"'Inter', sans-serif", outline:'none', boxSizing:'border-box' as const }}
            />
            {search && (
              <button onClick={() => setSearch('')}
                style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'transparent', border:'none', cursor:'pointer', color:'var(--text-tertiary)', fontSize:14, display:'flex', alignItems:'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>
        </div>
        <CustomSelect label="Ομάδα" value={filterGroup} onChange={setFilterGroup} options={groupOptions} />
        <CustomSelect label="Πληρώνει" value={filterPaidBy} onChange={setFilterPaidBy} options={paidByOpts} />
        <CustomSelect label="Κατάσταση" value={filterPaid} onChange={setFilterPaid} options={paidOpts} />
        <CustomSelect label="Ταξινόμηση" value={sortBy} onChange={setSortBy} options={SORT_OPTIONS} />
      </div>

      {/* Toolbar: πλήθος + εξαγωγή */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:12, flexWrap:'wrap' }}>
        <div style={{ fontSize:12, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif" }}>{processed.length} δαπάνες</div>
        <ExportButton disabled={processed.length===0} onClick={() => {
          const pmLabel = (v:string|null) => PAYMENT_METHODS.find(p=>p.value===v)?.label || v || '';
          const paidByLabel = (v:string|null) => PAID_BY_OPTIONS.find(p=>p.value===v)?.label || v || '';
          downloadCsv(
            `dapanes_${new Date().toISOString().slice(0,10)}`,
            ['Ημερομηνία','Περιγραφή','Κατηγορία','Ομάδα','Ποσό (€)','Πληρώνει','Μερίδιό μου (€)','Μοιρασμένο με','Τρόπος Πληρωμής','ΦΠΑ (€)','Cashback (€)','Δόσεις','Πληρώθηκε','Κατάστημα','Σημειώσεις'],
            processed.map(e => [
              csvDate(e.date), e.description, e.category,
              EXPENSE_GROUPS[e.expense_group||'']?.label || e.expense_group || '',
              csvEur(e.amount), paidByLabel(e.paid_by),
              SHARED_SCOPES.has(e.paid_by||'') ? csvEur(ownerShareAmount(e)) : '',
              SHARED_SCOPES.has(e.paid_by||'') ? (e.share_note||'') : '',
              pmLabel(e.payment_method),
              csvEur(e.vat_amount), csvEur(e.cashback_amount), e.installments || '',
              e.paid ? 'Ναι' : 'Όχι', e.store_vendor || '', (e.notes||'').replace(/\n/g,' '),
            ])
          );
        }} />
      </div>

      {/* List */}
      {loading ? (
        <Spinner label="Φόρτωση…" />
      ) : processed.length === 0 ? (
        <div style={{ textAlign:'center', padding:64, color:'var(--text-tertiary)' }}>
          <div style={{ width:48, height:48, borderRadius:'50%', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"/></svg>
          </div>
          <div style={{ fontSize:13, fontWeight:500, color:'var(--text-secondary)', fontFamily:"'Inter', sans-serif" }}>
            {search ? `Δεν βρέθηκαν αποτελέσματα για «${search}»` : 'Δεν έχεις καταχωρίσει δαπάνες ακόμα'}
          </div>
          {!search && (
            <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:4, fontFamily:"'Inter', sans-serif" }}>
              Πρόσθεσε την πρώτη σου δαπάνη για να ξεκινήσει η παρακολούθηση εξόδων και αποδόσεων.
            </div>
          )}
        </div>
      ) : (
        <>
          {Object.entries(EXPENSE_GROUPS).map(([groupKey, groupInfo]) => {
            const groupExp = processed.filter(e => e.expense_group === groupKey);
            if (groupExp.length === 0) return null;
            const groupTotal = groupExp.reduce((s,e) => s+e.amount, 0);
            return (
              <div key={groupKey} style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, marginBottom:12, overflow:'hidden' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 18px', borderBottom:'1px solid var(--border-subtle)', background:'var(--bg-surface)' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:8, height:8, borderRadius:2, background:GROUP_COLORS[groupKey]||'var(--accent)', flexShrink:0 }} />
                    <span style={{ fontSize:12, fontWeight:500, color:'var(--text-primary)', fontFamily:"'Inter', sans-serif" }}>{groupInfo.label}</span>
                    <span style={{ fontSize:10, color:'var(--text-secondary)', background:'var(--bg-elevated)', padding:'2px 8px', borderRadius:4, fontFamily:"'Inter', sans-serif" }}>{groupExp.length}</span>
                    {groupInfo.taxDeductible && (
                      <span style={{ fontSize:9, color:'var(--positive)', background:'var(--positive-dim)', padding:'2px 8px', borderRadius:4, fontFamily:"'Inter', sans-serif", fontWeight:500 }}>Εκπιπτόμενη</span>
                    )}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', fontFamily:"'Inter', sans-serif", fontVariantNumeric:'tabular-nums', letterSpacing:'-0.01em' }}>{fmtEur(groupTotal)}</span>
                  </div>
                </div>
                <div style={{ overflowX:'auto' }}>
                  <div className="table-wrap">
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead>
                      <tr>
                        {['Ημερομηνία','Κατηγορία','Περιγραφή','Πληρώνει','Κατάστημα','Πληρωμή','ΦΠΑ','Επιστροφή','Ποσό',''].map((h,i) => (
                          <th key={i} title={h==='ΦΠΑ'?'Φόρος Προστιθέμενης Αξίας':h==='Επιστροφή'?'Cashback — επιστροφή χρημάτων':undefined} style={{ fontSize:10, letterSpacing:'0.5px', textTransform:'uppercase' as const, color:'var(--text-tertiary)', padding:'7px 10px', borderBottom:'1px solid var(--border-subtle)', textAlign:'left', fontWeight:500, fontFamily:"'Inter', sans-serif", whiteSpace:'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {groupExp.map(e => {
                        const pm = PAYMENT_METHODS.find(p => p.value===e.payment_method);
                        const paidByLabel = PAID_BY_OPTIONS.find(p => p.value===e.paid_by)?.label||e.paid_by;
                        const paidByColor = e.paid_by==='tenant'?'var(--text-secondary)':e.paid_by==='split'?'var(--text-secondary)':e.paid_by==='company'?'var(--text-secondary)':'var(--text-tertiary)';
                        const isEditing = editingId===e.id;
                        const freqLabel: Record<string,string> = { monthly:'Μηνιαία', quarterly:'Τριμην.', biannual:'Εξαμην.', annual:'Ετήσια' };
                        return (
                          <>
                            <tr key={e.id}
                              style={{ background:isEditing?'var(--bg-surface)':'transparent', transition:'background 0.15s' }}
                              onMouseEnter={ev => { if (!isEditing) ev.currentTarget.style.background='var(--bg-surface)'; }}
                              onMouseLeave={ev => { if (!isEditing) ev.currentTarget.style.background='transparent'; }}>
                              <td style={{ padding:'9px 10px', color:'var(--text-secondary)', fontSize:12, fontFamily:"'Inter', sans-serif", whiteSpace:'nowrap' }}>{fmtD(e.date)}</td>
                              <td style={{ padding:'9px 10px' }}>
                                <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:4, fontSize:10, fontWeight:500, fontFamily:"'Inter', sans-serif", background:`${getCatColor(e.category)}20`, color:getCatColor(e.category) }}>{e.category}</span>
                              </td>
                              <td style={{ padding:'9px 10px', maxWidth:200 }}>
                                <div
                                  style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', color:'var(--text-primary)', fontFamily:"'Inter', sans-serif", cursor:e.notes?'help':'default' }}
                                  onMouseEnter={ev => { if(e.notes){ setHoveredNote(e.notes); setNotePos({x:ev.clientX,y:ev.clientY}); } }}
                                  onMouseMove={ev => { if(e.notes) setNotePos({x:ev.clientX,y:ev.clientY}); }}
                                  onMouseLeave={() => setHoveredNote(null)}
                                >
                                  {e.description}
                                  {e.notes && <span style={{ marginLeft:5, fontSize:8, color:'var(--accent)' }}>●</span>}
                                </div>
                                <div style={{ display:'flex', gap:4, marginTop:2 }}>
                                  {e.is_recurring && <span style={{ fontSize:9, background:'var(--bg-hover)', color:'var(--text-secondary)', padding:'1px 6px', borderRadius:3, fontFamily:"'Inter', sans-serif" }}>{freqLabel[e.recurring_frequency||'']||'Επαναλ.'}</span>}
                                  {!e.paid && <span style={{ fontSize:9, background:'var(--warning-dim)', color:'var(--warning)', padding:'1px 6px', borderRadius:3, fontFamily:"'Inter', sans-serif" }}>Εκκρεμεί</span>}
                                  {SHARED_SCOPES.has(e.paid_by||'') && <span title={e.share_note?`Μοιρασμένο με ${e.share_note}`:'Μοιρασμένη δαπάνη'} style={{ fontSize:9, background:'var(--bg-hover)', color:'var(--text-secondary)', padding:'1px 6px', borderRadius:3, fontFamily:"'Inter', sans-serif" }}>μοιρασμένο · {e.share_percent!=null?e.share_percent:50}%</span>}
                                  {e.warranty_months && (() => {
                                    const exp = new Date(e.date+'T00:00:00'); exp.setMonth(exp.getMonth()+e.warranty_months);
                                    const days = Math.ceil((exp.getTime()-Date.now())/86400000);
                                    return days >= 0 && days <= 90 ? <span style={{ fontSize:9, background:'var(--warning-dim)', color:'var(--warning)', padding:'1px 6px', borderRadius:3, fontFamily:"'Inter', sans-serif" }}>Εγγ.{days}μ.</span> : null;
                                  })()}
                                </div>
                              </td>
                              <td style={{ padding:'9px 10px' }}><span style={{ fontSize:11, fontWeight:500, color:paidByColor, fontFamily:"'Inter', sans-serif" }}>{paidByLabel}</span></td>
                              <td style={{ padding:'9px 10px', color:'var(--text-secondary)', fontSize:12, fontFamily:"'Inter', sans-serif" }}>{e.store_vendor||'—'}</td>
                              <td style={{ padding:'9px 10px', color:'var(--text-secondary)', fontSize:11, fontFamily:"'Inter', sans-serif" }}>
                                <div>{pm?.label||'—'}</div>
                                {e.installments && <div style={{ fontSize:10, color:'var(--text-tertiary)' }}>{e.installments} δόσεις</div>}
                              </td>
                              <td style={{ padding:'9px 10px', fontFamily:"'Roboto Mono', monospace", fontVariantNumeric:'tabular-nums', color:'var(--text-secondary)', fontSize:12 }}>
                                {e.vat_amount ? fmtEur(e.vat_amount) : '—'}
                                {e.vat_rate && <div style={{ fontSize:10, color:'var(--text-tertiary)', fontFamily:"'Inter', sans-serif" }}>{e.vat_rate}%</div>}
                              </td>
                              <td style={{ padding:'9px 10px', fontFamily:"'Roboto Mono', monospace", fontVariantNumeric:'tabular-nums', color:'var(--positive)', fontSize:12 }}>{e.cashback_amount ? `+${fmtEur(e.cashback_amount)}` : '—'}</td>
                              <td style={{ padding:'9px 10px', fontFamily:"'Roboto Mono', monospace", fontVariantNumeric:'tabular-nums', fontWeight:700, color:e.paid?'var(--text-primary)':'var(--warning)', whiteSpace:'nowrap' }}>
                                {fmtEur(e.amount)}
                                {e.original_price && e.original_price > e.amount && <div style={{ fontSize:10, color:'var(--text-tertiary)', textDecoration:'line-through', fontWeight:400 }}>{fmtEur(e.original_price)}</div>}
                                {SHARED_SCOPES.has(e.paid_by||'') && <div style={{ fontSize:10, color:'var(--text-tertiary)', fontWeight:400 }} title="Το μερίδιό σου">εγώ: {fmtEur(ownerShareAmount(e))}</div>}
                              </td>
                              <td style={{ padding:'9px 10px' }}>
                                <div style={{ display:'flex', gap:3 }}>
                                  {/* Attachment link */}
                                  {(e as any).attachment_url && (
                                    <a href={(e as any).attachment_url} target="_blank" rel="noopener noreferrer"
                                      style={{ width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:6, border:'1px solid var(--accent)', background:'var(--accent-dim)', color:'var(--accent)', cursor:'pointer', textDecoration:'none' }}
                                      title="Άνοιγμα συνημμένου">
                                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                                    </a>
                                  )}
                                  <button onClick={() => setEditingId(isEditing?null:e.id)}
                                    style={{ width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:6, border:`1px solid ${isEditing?'var(--accent)':'var(--border-subtle)'}`, background:isEditing?'var(--accent-dim)':'transparent', color:isEditing?'var(--accent)':'var(--text-tertiary)', cursor:'pointer' }}
                                    onMouseEnter={ev=>{ev.currentTarget.style.background='var(--accent-dim)';ev.currentTarget.style.color='var(--accent)';ev.currentTarget.style.borderColor='var(--accent)';}}
                                    onMouseLeave={ev=>{if(!isEditing){ev.currentTarget.style.background='transparent';ev.currentTarget.style.color='var(--text-tertiary)';ev.currentTarget.style.borderColor='var(--border-subtle)';}}}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                  </button>
                                  <button onClick={() => duplicate(e)}
                                    style={{ width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:6, border:'1px solid var(--border-subtle)', background:'transparent', color:'var(--text-tertiary)', cursor:'pointer' }}
                                    onMouseEnter={ev=>{ev.currentTarget.style.background='var(--accent-dim)';ev.currentTarget.style.color='var(--accent)';ev.currentTarget.style.borderColor='var(--accent)';}}
                                    onMouseLeave={ev=>{ev.currentTarget.style.background='transparent';ev.currentTarget.style.color='var(--text-tertiary)';ev.currentTarget.style.borderColor='var(--border-subtle)';}}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                  </button>
                                  <button onClick={() => del(e.id)}
                                    style={{ width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:6, border:'1px solid var(--border-subtle)', background:'transparent', color:'var(--text-tertiary)', cursor:'pointer' }}
                                    onMouseEnter={ev=>{ev.currentTarget.style.background='var(--negative-soft)';ev.currentTarget.style.color='var(--negative)';ev.currentTarget.style.borderColor='var(--negative)';}}
                                    onMouseLeave={ev=>{ev.currentTarget.style.background='transparent';ev.currentTarget.style.color='var(--text-tertiary)';ev.currentTarget.style.borderColor='var(--border-subtle)';}}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {isEditing && <InlineEdit key={`edit-${e.id}`} expense={e} />}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              </div>
            );
          })}
          <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:10, padding:'12px 18px', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
            <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
              {[
                { label:'Σύνολο', value:fmtEur(total), color:'var(--text-primary)' },
                ...(hasShared?[{ label:'Δικό μου μερίδιο', value:fmtEur(totalMyShare), color:'var(--text-primary)' }]:[{ label:'Ιδιοκτήτης', value:fmtEur(totalOwner), color:'var(--text-primary)' }]),
                ...(totalTenant>0?[{ label:'Ενοικιαστής', value:fmtEur(totalTenant), color:'var(--text-primary)' }]:[]),
                ...(totalCashback>0?[{ label:'Επιστροφή', value:fmtEur(totalCashback), color:'var(--positive)' }]:[]),
                ...(totalVat>0?[{ label:'ΦΠΑ', value:fmtEur(totalVat), color:'var(--text-primary)' }]:[]),
                { label:'Εκπιπτόμενες', value:fmtEur(deductible), color:deductible>0?'var(--positive)':'var(--text-primary)' },
              ].map((item,i) => (
                <span key={i} style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:"'Inter', sans-serif" }}>
                  {item.label}: <strong style={{ color:item.color, fontFamily:"'Inter', sans-serif", fontVariantNumeric:'tabular-nums', letterSpacing:'-0.01em' }}>{item.value}</strong>
                </span>
              ))}
            </div>
            <span style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:"'Inter', sans-serif" }}>{processed.length} εγγραφές</span>
          </div>
        </>
      )}
    </div>
  );
}