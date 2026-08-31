'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import * as properties from '@/lib/data/properties';
import * as tenantStore from '@/lib/data/tenants';
import * as rentStore from '@/lib/data/rent';
import { syncInstalments } from './rentInstalments';
import {
  s,
  fmt,
  fmtD,
  daysLeft,
  calcEnd,
  ServicesEditor,
  serviceLinesFrom,
  LEASE_LABELS,
  LEASE_CATEGORY_LABELS,
  ID_DOCS,
  syncTenantSchedule,
  type TenantScheduleInput,
} from './TabTenantHelpers';
import type { LeaseType, LeaseCategory, IdDocType, PaymentFreq } from './TabTenantHelpers';
import {
  ToggleField,
  NumberInput,
  TextInput,
  Textarea,
  CustomSelect as SelectField,
  DatePicker,
  InfoDot,
  fieldLabelStyle,
} from './UIComponents';
import {
  T,
  PageTitle,
  KPIGrid,
  InfoBanner,
  Badge,
  Btn,
  EmptyState,
  SecHdr,
  Modal,
  SideSheet,
  fe,
  fn,
  fp,
  Skeleton,
  SkeletonKPIs,
  ExportButton,
  type KPIItem,
  TT,
} from '@/components/Theme';
import {
  Users,
  SearchX,
  ChevronRight,
} from 'lucide-react';
import {
  notify,
  notifyOk,
  notifyError,
} from '@/components/Toast';
import { saved } from '@/components/dbWrite';
import { confirmDialog } from '@/components/ConfirmDialog';
import LeaseModal from './LeaseModal';
import LeaseDeclaration from './LeaseDeclaration';
import { downloadTableXlsx, csvDate } from './exportCsv';
import {
  useReportBranding,
} from '@/lib/reportBranding';
import { PRESUMPTIVE_DEDUCTION_RATE } from '@/lib/accounting/statement';
import {
  TENANT_FIELDS,
  formFields,
  missingCritical,
} from '@/lib/property/fields';
import { escHtml as esc } from '@/lib/reportBranding';
import { failed } from '@/lib/core/dbError';
// Το Αρχείο έχει ένα σπίτι: lib/data/documents.
import * as documents from '@/lib/data/documents';
import {
  PAYMENT_FREQ_LABELS,
  isPaymentFreq,
} from '@/lib/rent/frequency';
// Τα σχήματα και οι κανόνες τους ζουν χωριστά από τις οθόνες.
import {
  DEPOSIT_METHODS,
  FURNISHING_LABELS,
  isPastTenant,
  isIdDocType,
  todayISO,
  isFurnished,
  blank,
  hasMoreData,
  type Tenant,
  type RentPayment,
  type TenantDamage,
  type RentComp,
  type MaintenanceReq,
  type TabTenantProps,
  type Furnishing,
} from './TabTenantTypes';
// Τα μικρά κομμάτια που ξαναχρησιμοποιούνται σε όλες τις οθόνες της καρτέλας.
import {
  SectionTitle,
  ChipRow,
  Chip,
  AlertBar,
  whyOf,
  labelOf,
  FilePickRow,
  MissingCriticalBar,
  tenantFieldCtx,
  filledTenantIds,
} from './TabTenantParts';
// Οι οθόνες της καρτέλας, χωρισμένες σε «χρήματα» και «όλα τα υπόλοιπα».
import {
  PaymentsView,
  DepositView,
  RenewalView,
} from './TabTenantMoney';
import { DashboardView, CommView, LegalTaxView, DamagesView, MaintenanceView } from './TabTenantCare';
import { useLoad } from '@/app/hooks/useLoad';

// ─── Design tokens, shared source of truth (components/Theme) ────────────────

// ─── HTML escaping for values interpolated into document.write() templates ────

// ─── Main Export ──────────────────────────────────────────────────────────────
type DossierTab='overview'|'lease'|'condition'|'legal'|'comm'|'docs';

export default function TabTenant({ propertyId, userId, onStartHandover, plan='free' }:TabTenantProps) {
  const supabase=createClient();
  const branding=useReportBranding(userId);
  // Ψηφιακό μισθωτήριο: σύνταξη, υπογραφή και των δύο μερών, επαληθεύσιμο PDF.
  const [leaseOpen,setLeaseOpen]=useState(false);
  const [declOpen,setDeclOpen]=useState(false);
  // Η υπενθύμιση «Λήξη σύμβασης μίσθωσης» (Υποχρεώσεις) ανοίγει το μισθωτήριο
  // κατευθείαν για ανανέωση — ίδιο μοτίβο event με τον βοηθό.
  useEffect(()=>{
    const open=()=>setLeaseOpen(true);
    window.addEventListener('pos:lease',open);
    return ()=>window.removeEventListener('pos:lease',open);
  },[]);
  const [tenants,setTenants]=useState<Tenant[]>([]);
  const [payments,setPayments]=useState<RentPayment[]>([]);
  const [damages,setDamages]=useState<TenantDamage[]>([]);
  const [comps,setComps]=useState<RentComp[]>([]);
  const [maint,setMaint]=useState<MaintenanceReq[]>([]);
  // Τα τ.μ. ΤΟΥ ΔΙΚΟΥ ΜΑΣ ακινήτου και πόσα ακίνητα έχει ο χρήστης. Το πρώτο κρίνει
  // αν υπάρχει πρόταση αγοράς, το δεύτερο αν ο φόρος ανά ακίνητο είναι υποεκτίμηση.
  const [propSqm,setPropSqm]=useState<number|null>(null);
  const [propertyCount,setPropertyCount]=useState(1);
  // Ο ΔΕΙΚΤΗΣ ΦΟΡΤΩΣΗΣ ΔΕΝ ΕΙΝΑΙ ΞΕΧΩΡΙΣΤΗ ΚΑΤΑΣΤΑΣΗ, ΕΙΝΑΙ ΕΡΩΤΗΣΗ. Ηταν
  // `setLoading(true)` στην πρώτη γραμμή της φόρτωσης: σύγχρονη γραφή μέσα σε
  // effect, δηλαδή δεύτερη απόδοση πριν καν φύγει το αίτημα. Η ερώτηση που ΟΝΤΩΣ
  // απαντά είναι «τα δεδομένα που κρατώ είναι αυτού του ακινήτου;» και απαντιέται
  // κατά την απόδοση, χωρίς καμία γραφή. Με την αλλαγή ακινήτου γίνεται αληθής
  // ΑΜΕΣΩΣ, οπότε δεν υπάρχει καρέ με τα νούμερα του προηγούμενου.
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const loading = loadedFor !== propertyId
  const [saving,setSaving]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  // Το in-flow banner επιτυχίας (state + helper + JSX) αφαιρέθηκε υπέρ του κοινού
  // toast: ήταν ΠΑΝΤΑ πράσινο, ακόμη και για ουδέτερα («Διαγράφηκε») ή για σφάλματα
  // επικύρωσης και έσπρωχνε το περιεχόμενο προς τα κάτω κάθε φορά που εμφανιζόταν.

  const [search,setSearch]=useState('');
  const [segment,setSegment]=useState<'current'|'past'|'overdue'|'all'>('current');

  // Φόρμα (modal)
  const [isForm,setIsForm]=useState(false);
  const [editId,setEditId]=useState<string|null>(null);
  const [form,setForm]=useState(blank());
  // ΤΙ ΕΚΡΥΒΕ ΤΟ `(k:string,v:any)`: ΚΑΙ τα δύο ορίσματα. Ένα `sf('lease_ends',…)`
  // πρόσθετε σιωπηλά νέο κλειδί στη φόρμα αντί να γράψει το υπάρχον και ένα
  // `sf('custom_lease_days','365')` έβαζε κείμενο σε αριθμητικό πεδίο. Τώρα το
  // κλειδί πρέπει να ανήκει στη φόρμα και η τιμή στον τύπο ΕΚΕΙΝΟΥ του πεδίου.
  type TenantForm=ReturnType<typeof blank>;
  const sf=<K extends keyof TenantForm>(k:K,v:TenantForm[K])=>setForm(f=>({...f,[k]:v}));
  // Έγγραφα που ανέβηκαν μέσα από τη φόρμα (property-files + property_documents).
  const [formDocs,setFormDocs]=useState<{id:string;file_name:string;tag:'id'|'lease'}[]>([]);
  const [docBusy,setDocBusy]=useState(false);
  // «Περισσότερα»: ΚΛΕΙΣΤΟ εξ ορισμού. Κλειδωμένο δεν είναι — μόνο μαζεμένο.
  const [moreOpen,setMoreOpen]=useState(false);

  // Ντοσιέ (drawer)
  const [openId,setOpenId]=useState<string|null>(null);
  const [dossierTab,setDossierTab]=useState<DossierTab>('overview');

  // Η ΛΗΞΗ ΒΓΑΙΝΕΙ ΑΠΟ ΤΗΝ ΕΝΑΡΞΗ ΚΑΙ ΤΟΝ ΤΥΠΟ, ΚΑΤΑ ΤΗΝ ΑΠΟΔΟΣΗ. Ηταν effect:
  // ο χρήστης που διάλεγε «τριετία» έβλεπε για ένα καρέ την ΠΑΛΙΑ ημερομηνία
  // λήξης δίπλα στον νέο τύπο, σε φόρμα που καταλήγει σε συμφωνητικό.
  const leaseKey=`${form.lease_start}|${form.lease_type}|${form.custom_lease_days}`;
  const [leaseSeen,setLeaseSeen]=useState(leaseKey);
  if(leaseKey!==leaseSeen){
    setLeaseSeen(leaseKey);
    if(form.lease_start&&form.lease_type&&form.lease_type!=='custom')
      sf('lease_end',calcEnd(form.lease_start,form.lease_type as LeaseType,form.custom_lease_days));
  }

  const fetch_=useCallback(async()=>{
    const list=await tenantStore.ofProperty<Tenant>(supabase,propertyId,'*',userId);
    const[pd,{data:dd},{data:cd},{data:md},own,pc]=await Promise.all([
      rentStore.ofProperty<RentPayment>(supabase,propertyId,'*',userId),
      supabase.from('tenant_damages').select('*').eq('property_id',propertyId).eq('user_id',userId).order('occurred_on',{ascending:false}),
      supabase.from('rent_comparables').select('id,property_id,title,area,sqm,rent,rent_per_sqm,listing_type,source,url').eq('property_id',propertyId),
      supabase.from('maintenance_requests').select('*').eq('user_id',userId).eq('property_id',propertyId).order('created_at',{ascending:false}),
      properties.one<{ sqm: number }>(supabase, propertyId, 'sqm', userId),
      // ΤΟ ΠΛΗΘΟΣ ΑΚΙΝΗΤΩΝ ΚΡΙΝΕΙ ΦΟΡΟΛΟΓΙΚΗ ΠΡΟΕΙΔΟΠΟΙΗΣΗ. Με τον ανύπαρκτο
      // πίνακα το count γύριζε null → propertyCount πάντα 1 → ο ιδιοκτήτης με
      // τρία ακίνητα ΔΕΝ έβλεπε ποτέ ότι ο φόρος είναι προοδευτικός στο
      // ΑΘΡΟΙΣΜΑ και ότι το ποσό εδώ είναι μικρότερο από το πραγματικό.
      properties.count(supabase, userId),
    ]);
    setTenants(list); setPayments(pd); setDamages((dd||[]) as TenantDamage[]); setComps((cd||[]) as RentComp[]); setMaint((md||[]) as MaintenanceReq[]);
    const sq=Number((own as {sqm?:number|null}|null)?.sqm);
    setPropSqm(Number.isFinite(sq)&&sq>0?sq:null);
    setPropertyCount(Math.max(1, pc||1));
    setLoadedFor(propertyId);
  },[propertyId,userId]);

  useLoad(fetch_);

  // Συγχρονισμός ημερολογίου/εργασιών για τους τρέχοντες ενοικιαστές (idempotent).
  // Η ΣΗΜΑΙΑ ΚΡΑΤΑΕΙ ΤΟ ΑΚΙΝΗΤΟ, ΟΧΙ ΕΝΑ ΝΑΙ. Ήταν `useRef(false)` που γινόταν
  // `true` μία φορά και δεν επανερχόταν ποτέ: ο συγχρονισμός έτρεχε για το πρώτο
  // ακίνητο της συνεδρίας και για κανένα άλλο. Ο ιδιοκτήτης δύο ακινήτων έβλεπε
  // τις δόσεις ενοικίου του ενός στο ημερολόγιο και του άλλου πουθενά, ώσπου να
  // ανανεώσει τη σελίδα με ανοιχτό το δεύτερο.
  const syncedFor=React.useRef<string|null>(null);
  useEffect(()=>{
    if(loading||syncedFor.current===propertyId) return;
    syncedFor.current=propertyId;
    tenants.filter(t=>!isPastTenant(t)&&t.id).forEach(t=>{
      syncTenantSchedule(supabase,t,propertyId,userId,'open',{rentDueDay:t.rent_due_day??1});
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[loading,propertyId]);

  // ── Παράγωγα ────────────────────────────────────────────────────────────────
  const todayS=todayISO();
  const overdueByTenant=useMemo(()=>{
    const m=new Map<string,{count:number;amount:number}>();
    payments.filter(p=>!p.paid&&p.due_date&&p.due_date<todayS).forEach(p=>{
      const e=m.get(p.tenant_id)||{count:0,amount:0}; e.count++; e.amount+=p.amount; m.set(p.tenant_id,e);
    });
    return m;
  },[payments,todayS]);
  // Δηλωμένες-από-μισθωτή πληρωμές ανά ενοικιαστή (αναμένουν επιβεβαίωση είσπραξης).
  const declaredByTenant=useMemo(()=>{
    const m=new Map<string,number>();
    payments.filter(p=>!p.paid&&p.tenant_declared).forEach(p=>m.set(p.tenant_id,(m.get(p.tenant_id)||0)+1));
    return m;
  },[payments]);

  const currentTenants=useMemo(()=>tenants.filter(t=>!isPastTenant(t)),[tenants]);
  const pastTenants=useMemo(()=>tenants.filter(isPastTenant),[tenants]);

  const kpis=useMemo<KPIItem[]>(()=>{
    const currentRent=currentTenants.reduce((a,t)=>a+(t.monthly_rent||0),0);
    const arrears=[...overdueByTenant.values()].reduce((a,e)=>a+e.amount,0);
    const arrearsCount=[...overdueByTenant.values()].reduce((a,e)=>a+e.count,0);
    const depositHeld=currentTenants.filter(t=>!t.deposit_returned).reduce((a,t)=>a+(t.deposit_amount||0),0);
    return [
      { label:'Τρέχον Μηνιαίο Ενοίκιο', value:fe(currentRent), tone:'neutral' },
      { label:'Ληξιπρόθεσμη Οφειλή', value:fe(arrears), tone:arrears>0?'negative':'neutral', sub:arrearsCount>0?`${fn(arrearsCount)} δόσεις`:'καμία οφειλή' },
      { label:'Εγγύηση σε Κατοχή', value:fe(depositHeld), tone:'neutral' },
      { label:'Προηγούμενοι Ενοικιαστές', value:fn(pastTenants.length), tone:'neutral' },
    ];
  },[currentTenants,pastTenants,overdueByTenant]);

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return tenants.filter(t=>{
      if(segment==='current'&&isPastTenant(t)) return false;
      if(segment==='past'&&!isPastTenant(t)) return false;
      if(segment==='overdue'&&!overdueByTenant.has(t.id)) return false;
      if(q){
        const hay=`${t.full_name} ${t.afm||''} ${t.phone||''}`.toLowerCase();
        if(!hay.includes(q)) return false;
      }
      return true;
    });
  },[tenants,search,segment,overdueByTenant]);

  // ── Φόρμα ────────────────────────────────────────────────────────────────────
  const openAdd=()=>{ setForm(blank()); setEditId(null); setFormDocs([]); setMoreOpen(false); setError(null); setIsForm(true); };
  // Κλείσιμο φόρμας με προστασία από ακούσια απώλεια δεδομένων.
  // Έγινε async γιατί ο κοινός διάλογος επιστρέφει Promise. Μετά τη μετατροπή σε
  // κοινό Modal δένεται σε ΤΕΣΣΕΡΑ σημεία: κλικ στο φόντο, το «×» της κεφαλίδας,
  // το Escape και το κουμπί «Ακύρωση» του υποσέλιδου. Κανένα δεν περιμένει
  // σύγχρονη επιστροφή, οπότε η υπογραφή είναι ασφαλής. Ο ConfirmHost ζει στη
  // ρίζα του layout με z-index 10000: δεν είναι απόγονος αυτού του φόντου, άρα
  // κανένα κλικ του δεν ξαναπυροδοτεί το closeForm και ο δίαυλος έτσι κι αλλιώς
  // απορρίπτει δεύτερη ταυτόχρονη ερώτηση.
  //
  // ΜΗ ΚΛΕΙΣΕΙΣ ΟΣΟ ΑΠΟΘΗΚΕΥΕΙ. Το χειρόγραφο παράθυρο είχε μία μόνο έξοδο που
  // δεν φρουρούνταν (κλικ στο φόντο). Το Modal πρόσθεσε δύο ακόμη — Escape και
  // «×» — και το Escape είναι ακριβώς το πλήκτρο που πατάει κανείς όσο περιμένει.
  // Η αποθήκευση κάνει ΤΡΕΙΣ διαδοχικές εγγραφές (ενοικιαστής, σύνδεση εγγράφων,
  // συγχρονισμός ημερολογίου)· αν η φόρμα φύγει στη μέση, ο χρήστης δεν βλέπει
  // ποτέ το μήνυμα σφάλματος αν κάποια αποτύχει και νομίζει ότι ακύρωσε.
  const closeForm=async()=>{
    if(saving) return;
    const dirty = !!(form.full_name.trim()||form.afm||form.phone||form.email||form.monthly_rent);
    if(dirty && !(await confirmDialog('Κλείσιμο χωρίς αποθήκευση; Τα στοιχεία που συμπλήρωσες θα χαθούν.'))) return;
    setError(null); setIsForm(false);
  };

  // ── ΚΛΕΙΣΙΜΟ ΝΤΟΣΙΕ ──────────────────────────────────────────────────────────
  // ΤΟ ΝΤΟΣΙΕ ΔΕΝ ΚΛΕΙΝΕΙ ΟΤΑΝ ΕΧΕΙ ΑΛΛΗ ΕΠΙΚΑΛΥΨΗ ΑΠΟ ΠΑΝΩ ΤΟΥ.
  // Το χειρόγραφο πλαϊνό φύλλο ΔΕΝ άκουγε Escape, όπως δεν άκουγαν και τα
  // παράθυρα που ανοίγουν μέσα του («Σήμανση ως πληρωμένο», «Αίτημα πληρωμής»,
  // «Σάρωση απόδειξης» της PaymentsView και η φόρμα ενοικιαστή). Τώρα ακούν
  // ΟΛΑ και ο listener του καθενός κρέμεται στο ίδιο `document`: ένα Escape
  // πάνω στο «Σήμανση ως πληρωμένο» έκλεινε ΚΑΙ το παράθυρο ΚΑΙ ολόκληρο το
  // ντοσιέ, πετώντας τον χρήστη πίσω στη λίστα ενοικιαστών.
  //
  // Ο listener του ντοσιέ στήνεται ΠΡΩΤΟΣ (προσαρτάται πρώτο), άρα τρέχει πριν
  // από του παραθύρου — ένα stopPropagation από μέσα δεν θα προλάβαινε. Μετράμε
  // λοιπόν πόσες επικαλύψεις είναι ανοιχτές τη στιγμή του συμβάντος: το ίδιο το
  // SideSheet γράφει role="dialog", όπως και κάθε Modal, ενώ ο ConfirmHost
  // γράφει role="alertdialog". Πάνω από μία σημαίνει ότι το Escape ανήκει στην
  // επάνω επικάλυψη, όχι σε εμάς. Το React δεν έχει προλάβει να αποδώσει, οπότε
  // η μέτρηση δείχνει ακόμη την πραγματική στοίβα.
  //
  // Καλύπτει και τις άλλες δύο εξόδους του SideSheet (κλικ στο φόντο, «×»):
  // εκεί δεν αλλάζει τίποτα, γιατί μια ανοιχτή επικάλυψη τα σκεπάζει ούτως ή
  // άλλως και το κλικ δεν φτάνει ποτέ σε αυτά.
  const closeDossier=()=>{
    if(isForm) return;
    if(document.querySelectorAll('[role="dialog"],[role="alertdialog"]').length>1) return;
    setOpenId(null);
  };
  const openEditForm=(t:Tenant)=>{
    const n=(v:number|null)=>v?.toString()||'';
    const f:ReturnType<typeof blank>={
      full_name:t.full_name||'',email:t.email||'',phone:t.phone||'',
      profession:t.profession||'',afm:t.afm||'',
      id_doc_type:(t.id_doc_type as IdDocType)||'',id_doc_number:t.id_doc_number||'',iban:t.iban||'',notes:t.notes||'',
      lease_type:t.lease_type||'annual',lease_category:t.lease_category||'',lease_start:t.lease_start?.split('T')[0]||'',lease_end:t.lease_end?.split('T')[0]||'',custom_lease_days:t.custom_lease_days||365,
      monthly_rent:n(t.monthly_rent),payment_frequency:t.payment_frequency||'monthly',rent_due_day:String(Math.min(Math.max(1,t.rent_due_day||1),28)),rent_iban:t.rent_iban||'',e_payment:t.e_payment??true,
      furnishing:(t.furnishing as Furnishing)||'',
      deposit_amount:n(t.deposit_amount),deposit_method:t.deposit_method||'',deposit_paid_on:t.deposit_paid_on?.split('T')[0]||'',deposit_returned:t.deposit_returned||false,deposit_return_date:t.deposit_return_date?.split('T')[0]||'',
      // Οι παλιές στήλες `streaming`/`cleaning` διαβάζονται και γίνονται γραμμές.
      services:serviceLinesFrom(t.streaming,t.cleaning),
      parking_included:t.parking_included||false,parking_extra:t.parking_extra||false,parking_extra_price:n(t.parking_extra_price),
      extra_perks:t.extra_perks||'',
      lease_doc_external_url:t.lease_doc_external_url||'',
    };
    // «Περισσότερα» ανοίγει μόνο αν ο χρήστης έχει όντως δεδομένα εκεί μέσα.
    setForm(f); setFormDocs([]); setMoreOpen(hasMoreData(f));
    setEditId(t.id); setIsForm(true);
    // Επαναφόρτωση των εγγράφων που έχουν ήδη ανέβει για ΑΥΤΟΝ τον ενοικιαστή
    // (ταυτότητα, μισθωτήρια — και προηγούμενα με τον ίδιο ενοικιαστή).
    documents.ofSupplier<{id:string;file_name:string|null;title:string|null}>(supabase,propertyId,'tenant:'+t.id,'id,file_name,title',userId)
      .then(rows=>{ setFormDocs(rows.map(d=>({ id:d.id, file_name:d.file_name||'έγγραφο', tag:(d.title||'').startsWith('Έγγραφο ταυτοποίησης')?'id':'lease' as 'id'|'lease' }))); });
  };

  // Ανέβασμα εγγράφου φόρμας (ταυτοποίηση ή μισθωτήριο) — ίδιο μοτίβο με το
  // property-files/property_documents που χρησιμοποιείται στη σάρωση/αρχειοθέτηση.
  const uploadFormDoc=async(file:File,tag:'id'|'lease')=>{
    setDocBusy(true); setError(null);
    try{
      const safe=file.name.replace(/[^\w.\-]+/g,'_');
      const path=`${userId}/${propertyId}/document/${Date.now()}_${safe}`;
      const{error:upErr}=await supabase.storage.from('property-files').upload(path,file,{upsert:false,contentType:file.type||undefined});
      if(upErr){ setError(failed('Το αρχείο δεν ανέβηκε', upErr)); setDocBusy(false); return; }
      const label=tag==='id'?'Έγγραφο ταυτοποίησης':'Μισθωτήριο / έγγραφο';
      const title=`${label} · ${form.full_name.trim()||file.name}`.slice(0,200);
      const ins=await documents.add(supabase,propertyId,userId,{kind:'document',category:'tenant',supplier:editId?('tenant:'+editId):null,title,doc_date:todayISO(),file_path:path,file_name:file.name,mime:file.type||null,size_bytes:file.size});
      if(ins.error){ setError(failed('Το έγγραφο δεν καταχωρήθηκε', ins.error)); setDocBusy(false); return; }
      if(ins.id) setFormDocs(prev=>[...prev,{id:ins.id as string,file_name:file.name,tag}]);
      notifyOk('Το έγγραφο ανέβηκε');
    }catch{ setError('Σφάλμα ανεβάσματος εγγράφου'); }
    setDocBusy(false);
  };

  /** Η γραμμή που επεξεργάζεται, για όσα δεν ζουν στη φόρμα (εκκρεμής αναπροσαρμογή). */
  const editRow=editId?tenants.find(t=>t.id===editId):undefined;

  const save=async()=>{
    if(!form.full_name.trim()){setError('Το ονοματεπώνυμο είναι υποχρεωτικό');return;}
    if(!form.lease_category){setError('Ο τύπος μίσθωσης (κατοικία ή επαγγελματική) είναι υποχρεωτικός');return;}
    setSaving(true);setError(null);
    const n=(v:string)=>v?Math.max(0,parseFloat(v)):null;
    const dueDay=Math.min(Math.max(1,parseInt(form.rent_due_day)||1),28);
    // Οι γραμμές υπηρεσιών γράφονται στην ΥΠΑΡΧΟΥΣΑ στήλη `streaming` (καμία
    // μετάπτωση σχήματος) και η παλιά `cleaning` καθαρίζεται, ώστε να μη διαβαστεί
    // δεύτερη φορά ως χωριστή γραμμή «Καθαρισμός».
    const svcLines=(form.services||[]).filter(l=>l.name.trim()).map(l=>({ name:l.name.trim(), cost:Math.max(0,l.cost||0), payer:l.payer }));
    const payload={
      property_id:propertyId,user_id:userId,full_name:form.full_name.trim(),
      email:form.email||null,phone:form.phone||null,
      profession:form.profession||null,afm:form.afm||null,
      id_doc_type:form.id_doc_type||null,id_doc_number:form.id_doc_number||null,iban:form.iban||null,notes:form.notes||null,
      lease_type:form.lease_type||null,lease_category:form.lease_category||null,lease_start:form.lease_start||null,lease_end:form.lease_end||null,custom_lease_days:form.custom_lease_days||null,
      monthly_rent:n(form.monthly_rent),payment_frequency:form.payment_frequency||null,rent_due_day:dueDay,rent_iban:form.rent_iban?.trim()||null,
      furnishing:form.furnishing||null,
      deposit_amount:n(form.deposit_amount),deposit_method:form.deposit_method||null,deposit_paid_on:form.deposit_paid_on||null,deposit_returned:form.deposit_returned,deposit_return_date:form.deposit_return_date||null,
      e_payment:form.e_payment,streaming:svcLines,cleaning:null,extra_perks:form.extra_perks||null,
      parking_included:form.parking_included,parking_extra:form.parking_extra,parking_extra_price:n(form.parking_extra_price),
      lease_doc_external_url:form.lease_doc_external_url||null,
      // ΤΟ ΧΕΡΙ ΥΠΕΡΙΣΧΥΕΙ ΤΟΥ ΡΑΝΤΕΒΟΥ. Με εκκρεμή αναπροσαρμογή και χειροκίνητη
      // αλλαγή του ενοικίου, οι δύο τιμές συγκρούονται: αφημένο το ραντεβού θα
      // επανέγραφε τη νέα τιμή μια νύχτα, χωρίς να το έχει ζητήσει κανείς. Το
      // πεδίο το γράφει ο ίδιος που υπέγραψε την ειδοποίηση και η οθόνη το λέει
      // δίπλα στο πεδίο πριν πατηθεί η αποθήκευση.
      ...(editRow?.pending_rent!=null && n(form.monthly_rent)!==editRow.monthly_rent
        ? { pending_rent:null, pending_rent_from:null } : {}),
    };
    const{data:savedRow,error:err}=await(editId
      ?tenantStore.updateReturning(supabase,editId,payload)
      :tenantStore.addReturning(supabase,propertyId,userId,payload));
    if(err){
      const msg=err.message||'Άγνωστο σφάλμα';
      // Μετάφραση των συχνών αιτιών σε σαφές ελληνικό μήνυμα.
      //
      // ΤΟ ΜΗΝΥΜΑ ΤΟ ΔΙΑΒΑΖΕΙ ΙΔΙΟΚΤΗΤΗΣ ΑΚΙΝΗΤΟΥ, ΟΧΙ ΠΡΟΓΡΑΜΜΑΤΙΣΤΗΣ.
      //
      // Εδώ έγραφε «Τρέξε το τελευταίο SQL (SETUP_ALL.sql) στο Supabase και
      // δοκίμασε ξανά»: οδηγία που ο χρήστης δεν μπορεί να εκτελέσει, για αρχείο
      // που ήταν ρητά παρωχημένο και πλέον δεν υπάρχει καθόλου. Το ίδιο και η
      // επόμενη γραμμή, που του ζητούσε να «τρέξει τις πολιτικές ασφαλείας».
      //
      // Ενα σφάλμα σχήματος ή δικαιωμάτων είναι ΔΙΚΟ ΜΑΣ λάθος. Το λέμε, λέμε
      // ότι τα στοιχεία του δεν χάθηκαν και κρατάμε την τεχνική λεπτομέρεια για
      // όποιον μπορεί να κάνει κάτι μ’ αυτήν.
      const friendly=/column|schema cache|does not exist/i.test(msg)
        ? `Η αποθήκευση απέτυχε από δικό μας σφάλμα, όχι από κάτι που έκανες. Τα στοιχεία που έγραψες μένουν στην οθόνη. Τεχνική λεπτομέρεια: ${msg}`
        : /row-level security|violates row-level/i.test(msg)
        ? `Η αποθήκευση απέτυχε λόγω δικαιωμάτων, από δικό μας σφάλμα. Τα στοιχεία που έγραψες μένουν στην οθόνη. Τεχνική λεπτομέρεια: ${msg}`
        : `Η αποθήκευση απέτυχε: ${msg}`;
      setError(friendly);setSaving(false);return;
    }
    // Ο ενοικιαστής αποθηκεύτηκε. Οι επόμενες δευτερεύουσες ενέργειες (σύνδεση
    // εγγράφων, συγχρονισμός ημερολογίου) δεν πρέπει ΠΟΤΕ να μπλοκάρουν το κλείσιμο
    // της φόρμας ή την ανανέωση — αλλιώς η καρτέλα θα «κολλούσε» με το ρελ. να γυρίζει.
    const savedTenant=(savedRow||null) as unknown as (TenantScheduleInput&{rent_due_day?:number|null})|null;
    if(savedTenant?.id && !editId && formDocs.length){
      await saved('Τα έγγραφα δεν συνδέθηκαν με τον ενοικιαστή',
        documents.update(supabase,formDocs.map(d=>d.id),{supplier:'tenant:'+savedTenant.id}));
    }
    if(savedTenant?.id) await syncTenantSchedule(supabase,savedTenant,propertyId,userId,'save',{rentDueDay:dueDay});
    // ── ΚΑΙ ΟΙ ΔΟΣΕΙΣ, ΠΟΥ ΔΕΝ ΕΙΝΑΙ ΤΟ ΙΔΙΟ ΠΡΑΓΜΑ ─────────────────────
    // Το `syncTenantSchedule` από πάνω γεμίζει ΗΜΕΡΟΛΟΓΙΟ και εκκρεμότητες.
    // Οι ίδιες οι δόσεις — ο πίνακας από τον οποίο βγαίνει η ταμειακή θέση, η
    // οφειλή, η Πύλη ενοικιαστή και το Ε2 — γεννιούνταν ΜΟΝΟ μέσα στην οθόνη
    // των εισπράξεων. Οποιος καταχωρούσε ενοικιαστή και γύριζε στην Επισκόπηση
    // έβλεπε μηδέν, χωρίς κανένα σφάλμα να το εξηγεί.
    if(savedRow){
      const { error:instErr } = await syncInstalments(supabase, savedRow as unknown as Tenant, propertyId, userId);
      // ΤΟ ΣΦΑΛΜΑ ΛΕΓΕΤΑΙ, ΑΛΛΑ ΔΕΝ ΑΚΥΡΩΝΕΙ ΤΗΝ ΑΠΟΘΗΚΕΥΣΗ: ο ενοικιαστής
      // έχει ήδη γραφτεί και μια σιωπηλή αποτυχία εδώ είναι ακριβώς το
      // μηδενικό που δεν εξηγείται.
      if(instErr) notifyError(`Ο ενοικιαστής αποθηκεύτηκε, αλλά οι δόσεις ενοικίου δεν δημιουργήθηκαν. ${instErr}`);
    }
    setSaving(false);setIsForm(false);
    notifyOk(editId?'Αποθηκεύτηκε':'Ενοικιαστής προστέθηκε');
    await fetch_();
  };

  const markMovedOut=async(t:Tenant)=>{
    if(!(await confirmDialog(`Σήμανση αποχώρησης για «${t.full_name}»; Θα μεταφερθεί στους προηγούμενους ενοικιαστές.`))) return;
    if(!await saved('Η αποχώρηση δεν καταχωρήθηκε', tenantStore.markPast(supabase,t.id,todayISO()))) return;
    notify('Ο ενοικιαστής μεταφέρθηκε στο ιστορικό'); fetch_();
  };
  const delTenant=async(t:Tenant)=>{
    if(!(await confirmDialog(`Οριστική διαγραφή «${t.full_name}»; Θα διαγραφούν και οι πληρωμές/φθορές του.`,{tone:'negative',confirmLabel:'Οριστική διαγραφή'}))) return;
    // Η ΣΕΙΡΑ ΕΧΕΙ ΣΗΜΑΣΙΑ: πρώτα τα εξαρτημένα, τελευταίος ο ενοικιαστής. Αν
    // κάποιο βήμα αποτύχει, σταματάμε — αλλιώς μένουν ορφανές πληρωμές που δεν
    // φαίνονται πουθενά και εξακολουθούν να μετράνε σε αθροίσματα.
    if(!await saved('Οι πληρωμές του ενοικιαστή δεν διαγράφηκαν', rentStore.removeOfTenant(supabase,t.id))) return;
    if(!await saved('Οι φθορές του ενοικιαστή δεν διαγράφηκαν', supabase.from('tenant_damages').delete().eq('tenant_id',t.id))) return;
    if(!await saved('Ο ενοικιαστής δεν διαγράφηκε', tenantStore.remove(supabase,t.id))) return;
    if(openId===t.id) setOpenId(null);
    notify('Διαγράφηκε'); fetch_();
  };

  // ── Έγγραφο μισθωτηρίου (PDF) ────────────────────────────────────────────────
  const uploadPDF=async(t:Tenant,file:File)=>{
    setUploading(true);
    const path=`${userId}/${t.id}/${file.name}`;
    const{error:upErr}=await supabase.storage.from('lease-documents').upload(path,file,{upsert:true});
    if(upErr){setError(failed('Το αρχείο δεν ανέβηκε', upErr));setUploading(false);return;}
    // Το αρχείο ανέβηκε ήδη. Αν δεν καταγραφεί το όνομά του, ο ενοικιαστής δεν
    // έχει συμβόλαιο πουθενά στην οθόνη — και το αρχείο υπάρχει, αόρατο.
    if(!await saved('Το συμβόλαιο ανέβηκε, αλλά δεν συνδέθηκε με τον ενοικιαστή',tenantStore.update(supabase,t.id,{lease_doc_name:file.name}))){setUploading(false);return;}
    setUploading(false);notifyOk('Το PDF ανέβηκε');fetch_();
  };
  const openLeaseDoc=async(t:Tenant)=>{
    if(!t.lease_doc_name) return;
    const path=`${userId}/${t.id}/${t.lease_doc_name}`;
    const{data,error:e}=await supabase.storage.from('lease-documents').createSignedUrl(path,60*60);
    if(e||!data?.signedUrl){setError('Δεν ήταν δυνατό το άνοιγμα του PDF.');return;}
    window.open(data.signedUrl,'_blank','noopener,noreferrer');
  };

  // ── Εξαγωγή μητρώου μισθωτών ────────────────────────────────────────────────
  // Το ενοίκιο και η εγγύηση περνούσαν από τη `csvEur()` και έφταναν ως κείμενο:
  // το μητρώο δεν αθροιζόταν σε καμία στήλη.
  const exportRoster=()=>{
    downloadTableXlsx(`Μητρώο μισθωτών ${todayISO()}`, {
      title: 'Μητρώο μισθωτών',
      headers: ['Ονοματεπώνυμο','Κατάσταση','ΑΦΜ','Τηλέφωνο','Ηλεκτρονικό ταχυδρομείο','Είδος μίσθωσης','Έναρξη','Λήξη','Αποχώρηση','Ημέρα πληρωμής','Μηνιαίο ενοίκιο (€)','Εγγύηση (€)','Τρόπος εγγύησης','Ημερομηνία καταβολής εγγύησης','Επεστράφη'],
      rows: [...tenants].map(t=>[
        t.full_name, isPastTenant(t)?'Προηγούμενος':'Τρέχων', t.afm||'', t.phone||'', t.email||'',
        t.lease_category?LEASE_CATEGORY_LABELS[t.lease_category]:'', csvDate(t.lease_start), csvDate(t.lease_end), csvDate(t.move_out_date),
        t.rent_due_day||'', t.monthly_rent ?? '', t.deposit_amount ?? '', t.deposit_method||'', csvDate(t.deposit_paid_on), t.deposit_returned?'ΝΑΙ':'',
      ]),
    });
  };

  // Σκελετός αντί για spinner: η οθόνη έχει γνωστό σχήμα (σειρά KPIs + πλέγμα καρτών
  // ενοικιαστών), οπότε ο χώρος δεσμεύεται από την αρχή αντί να «πέφτει» μέσα ξαφνικά.
  if(loading) return (
    <>
      <SkeletonKPIs n={4} />
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,340px),1fr))', gap:14 }}>
        {[0,1,2].map(i=><Skeleton key={i} h={210} r={14}/>)}
      </div>
    </>
  );

  const dc=openId?tenants.find(t=>t.id===openId)||null:null;
  const dcPayments=dc?payments.filter(p=>p.tenant_id===dc.id):[];
  const dcDamages=dc?damages.filter(d=>d.tenant_id===dc.id):[];
  const dcMaint=dc?maint.filter(m=>m.tenant_id===dc.id):[];
  const dcOverdue=dc?(overdueByTenant.get(dc.id)||{count:0,amount:0}):{count:0,amount:0};

  // Ιστορικό ενοικιαστών: πορεία ενοικίου στον χρόνο (χρονολογικά).
  const rentHistory=[...tenants].filter(t=>t.monthly_rent).sort((a,b)=>(a.lease_start||'').localeCompare(b.lease_start||''));

  const statusBadge=(t:Tenant)=>{
    if(overdueByTenant.has(t.id)) return <Badge tone="negative">Ληξιπρόθεσμο</Badge>;
    if(isPastTenant(t)) return <Badge tone="neutral">Προηγούμενος</Badge>;
    const d=daysLeft(t.lease_end);
    if(d!=null&&d<0) return <Badge tone="warning">Έληξε</Badge>;
    return <Badge tone="positive">Τρέχων</Badge>;
  };

  const DTABS:{id:DossierTab;label:string;badge?:number}[]=dc?[
    {id:'overview',label:'Επισκόπηση'},
    {id:'lease',label:'Μίσθωση και Εγγύηση',badge:(dcOverdue.count+(declaredByTenant.get(dc.id)||0))||undefined},
    {id:'condition',label:'Φθορές και Βλάβες',badge:(dcDamages.filter(d=>!d.repaired).length+dcMaint.filter(m=>m.status!=='done').length)||undefined},
    {id:'legal',label:'Νομικά και Φόρος'},
    {id:'comm',label:'Επικοινωνία'},
    {id:'docs',label:'Έγγραφα'},
  ]:[];

  // ── ΠΟΙΑ ΠΕΔΙΑ ΒΛΕΠΕΙ Η ΦΟΡΜΑ, ΤΩΡΑ ────────────────────────────────────────
  // Μία κλήση στο μητρώο, τρία επίπεδα: `core` φαίνεται, `more` πίσω από κουμπί,
  // `hidden` δεν υπάρχει. Η μόνη είσοδος που αλλάζει ζωντανά είναι η επίπλωση.
  const formCtx=tenantFieldCtx(isFurnished(form.furnishing), propertyCount);
  const formPlan=formFields(TENANT_FIELDS, formCtx);
  const coreIds=new Set(formPlan.core.map(d=>d.id));
  const moreIds=new Set(formPlan.more.map(d=>d.id));
  const show=(id:string)=>coreIds.has(id);
  const more=(id:string)=>moreIds.has(id);
  const moreFields=formPlan.more;
  const formMissing=missingCritical(TENANT_FIELDS, formCtx, filledTenantIds({
    full_name:form.full_name.trim()||null, afm:form.afm||null, lease_category:form.lease_category||null,
    lease_start:form.lease_start||null, monthly_rent:form.monthly_rent?parseFloat(form.monthly_rent):null,
    rent_iban:form.rent_iban||null,
  }));

  return (
    <div style={{ fontFamily:T.font.sans, color:'var(--text-primary)' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {error&&<div style={{ background:'var(--negative-dim)', border:'1px solid var(--negative-border)', borderLeft:'3px solid var(--negative)', borderRadius:T.radius.inner, padding:'11px 18px', marginBottom:14, color:'var(--negative)', fontSize:13, fontFamily:T.font.sans, fontWeight:500, display:'flex', justifyContent:'space-between', alignItems:'center' }}><span>{error}</span><button onClick={()=>setError(null)} style={{ background:'none', border:'none', color:'var(--negative)', cursor:'pointer', fontSize:18, lineHeight:1, padding:0 }}>×</button></div>}

      <PageTitle title="Ενοικιαστής" sub="Τρέχουσα και προηγούμενες μισθώσεις, με πλήρη φάκελο ανά ενοικιαστή"
        right={tenants.length>0?<>
          <ExportButton onClick={exportRoster}/>
          {/* Η ίδια ενέργεια λεγόταν «Μισθωτήριο» εδώ και «Σύνταξη μισθωτηρίου» στην
              κενή κατάσταση. Ο χρήστης μαθαίνει το ένα όνομα και συναντά το άλλο. */}
          <Btn variant="secondary" onClick={()=>setLeaseOpen(true)}>Σύνταξη μισθωτηρίου</Btn>
          <Btn variant="secondary" onClick={()=>setDeclOpen(true)}>Δήλωση μίσθωσης</Btn>
          <Btn variant="primary" onClick={openAdd}>Νέος ενοικιαστής</Btn>
        </>:undefined}/>

      <KPIGrid items={kpis}/>

      <div style={{ display:'flex', gap:10, flexWrap:'wrap' as const, alignItems:'center', marginBottom:16 }}>
        {/* ΤΟ ΚΕΙΜΕΝΟ ΔΕΝ ΧΩΡΟΥΣΕ ΚΑΙ ΚΟΒΟΤΑΝ ΣΤΗ ΜΕΣΗ ΛΕΞΗΣ: ο χρήστης διάβαζε
            «Αναζήτηση ονόματος, ΑΦΜ, τηλεφύ». Ένα πεδίο που δεν μπορεί να δείξει
            ούτε τη δική του οδηγία δεν εμπνέει εμπιστοσύνη για τα υπόλοιπα.
            Η υπόδειξη λέει τώρα μόνο ΤΙ ψάχνεται — που είναι και η χρήσιμη
            πληροφορία — και το «Αναζήτηση» μετακόμισε στην ετικέτα για τον
            αναγνώστη οθόνης, όπου ανήκει. */}
        <input value={search} onChange={e=>setSearch(e.target.value)}
          className="po-field field-wide" aria-label="Αναζήτηση ενοικιαστή" placeholder="Όνομα, ΑΦΜ ή τηλέφωνο"
          style={{ background:'var(--bg-base)', border:'1px solid var(--border-default)', borderRadius:10, padding:'10px 14px', color:'var(--text-primary)', fontSize:14, height:T.h.lg, maxWidth:280, flex:'1 1 220px', outline:'none', boxSizing:'border-box', fontFamily:T.font.sans }}/>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' as const }}>
          {/* «Όλοι», «Τρέχων», «Προηγούμενοι»: δύο πληθυντικοί και ένας ενικός, σε
              τρία διπλανά κουμπιά που φιλτράρουν ΛΙΣΤΑ. Το «Τρέχων» είναι σωστό
              στη σήμανση ΕΝΟΣ ενοικιαστή — και εκεί μένει· εδώ μετρά πόσοι. */}
          {([['all','Όλοι'],['current','Τρέχοντες'],['past','Προηγούμενοι']] as [typeof segment,string][]).map(([v,l])=>(
            <button key={v} onClick={()=>setSegment(v)} style={{ height:T.h.lg, padding:'0 14px', borderRadius: T.radius.modal, border:`1px solid ${segment===v?'var(--accent)':'var(--border-subtle)'}`, background:segment===v?'var(--accent-soft)':'transparent', color:segment===v?'var(--accent)':'var(--text-secondary)', cursor:'pointer', fontSize:12, fontFamily:T.font.sans, fontWeight:500, whiteSpace:'nowrap' as const }}>{l}</button>
          ))}
        </div>
      </div>

      {tenants.length===0?(
        <EmptyState icon={<Users size={20}/>} title="Κανένας ενοικιαστής ακόμη" hint="Πρόσθεσε τον ενοικιαστή του ακινήτου για πλήρη παρακολούθηση μίσθωσης, ενοικίων, εγγύησης, φθορών και ανανέωσης." action={<div className="act-center" style={{ display:'flex', gap:8, flexWrap:'wrap' as const, justifyContent:'center' }}><Btn variant="primary" onClick={openAdd}>Νέος ενοικιαστής</Btn><Btn variant="secondary" onClick={()=>setLeaseOpen(true)}>Σύνταξη μισθωτηρίου</Btn></div>}/>
      ):(
        <>
          {filtered.length===0?(
            <EmptyState icon={<SearchX size={20}/>} title="Δεν βρέθηκαν ενοικιαστές" hint="Άλλαξε φίλτρο ή αναζήτηση."/>
          ):(
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap:14 }}>
              {filtered.map(t=>{
                const od=overdueByTenant.get(t.id);
                const d=daysLeft(t.lease_end);
                return (
                  <div key={t.id} role="button" tabIndex={0}
                    onClick={()=>{setOpenId(t.id);setDossierTab('overview');}}
                    onKeyDown={e=>{ if((e.key==='Enter'||e.key===' ')&&e.target===e.currentTarget){e.preventDefault();setOpenId(t.id);setDossierTab('overview');} }}
                    style={{ background:'var(--bg-surface)', border:`1px solid ${od?'var(--negative-border)':'var(--border-subtle)'}`, borderRadius:T.radius.card, padding:16, display:'flex', flexDirection:'column', gap:12, cursor:'pointer', outline:'none' }}>
                    <div style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
                      <div style={{ minWidth:0, flex:1 }}>
                        <div style={{ fontSize:15, fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{t.full_name}</div>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:3, flexWrap:'wrap' as const }}>
                          <span style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans }}>{t.lease_start||t.lease_end?`${fmtD(t.lease_start)} έως ${fmtD(t.lease_end)}`:'χωρίς περίοδο μίσθωσης'}</span>
                          {t.afm&&<span style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.mono }}>ΑΦΜ {t.afm}</span>}
                        </div>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8, flexShrink:0 }}>
                        {statusBadge(t)}
                        {(declaredByTenant.get(t.id)||0)>0&&<Badge tone="accent">Δηλωμένη πληρωμή</Badge>}
                        <button title="Διαγραφή" onClick={e=>{e.stopPropagation();delTenant(t);}}
                          style={{ background:'none', border:'none', borderRadius:8, width:26, height:26, display:'inline-flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'var(--text-tertiary)', padding:0 }}>
                          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                        </button>
                      </div>
                    </div>
                    <div style={{ background:'var(--bg-base)', boxShadow:'var(--well-inset)', borderRadius:12, padding:12, display:'flex' }}>
                      {([
                        { l:'Μηνιαίο ενοίκιο', v:fmt(t.monthly_rent), strong:true },
                        { l:'Εγγύηση', v:fmt(t.deposit_amount) },
                        { l:'Ληξιπρόθεσμη οφειλή', v:fmt(od?od.amount:0), neg:!!od },
                      ] as {l:string;v:string;strong?:boolean;neg?:boolean}[]).map((m,i)=>(
                        <div key={i} style={{ flex:1, minWidth:0, paddingLeft:i?12:0, borderLeft:i?'1px solid var(--border-subtle)':'none' }}>
                          <div style={{ fontSize: 11, fontWeight:600, textTransform:'uppercase' as const, letterSpacing:'0.05em', color:'var(--text-tertiary)', marginBottom:4, whiteSpace:'nowrap' as const, overflow:'hidden', textOverflow:'ellipsis' }}>{m.l}</div>
                          <div style={{ fontSize:13, fontWeight:700, fontFamily:T.font.num, fontVariantNumeric:'tabular-nums', color:m.neg?'var(--negative)':m.strong?'var(--text-primary)':'var(--text-secondary)' }}>{m.v}</div>
                        </div>
                      ))}
                    </div>
                    {/* ΤΟ ΡΑΝΤΕΒΟΥ ΤΗΣ ΑΝΑΠΡΟΣΑΡΜΟΓΗΣ ΛΕΓΕΤΑΙ. Το «Μηνιαίο ενοίκιο» από
                        πάνω δείχνει το ποσό που ΙΣΧΥΕΙ σήμερα· χωρίς αυτή τη γραμμή, η
                        υπογεγραμμένη ειδοποίηση θα ζούσε μόνο σε ένα PDF και η αλλαγή
                        θα εμφανιζόταν μια νύχτα χωρίς εξήγηση. */}
                    {!isPastTenant(t)&&t.pending_rent!=null&&t.pending_rent_from&&<div style={{ fontSize:11, color:'var(--text-secondary)', fontFamily:T.font.sans }}>Αναπροσαρμογή σε {fmt(t.pending_rent)} από {fmtD(t.pending_rent_from)}</div>}
                    {!isPastTenant(t)&&d!=null&&d>=0&&d<=60&&<div style={{ fontSize:11, color:'var(--warning)', fontFamily:T.font.sans }}>Λήξη μίσθωσης σε {fn(d)} ημέρες</div>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Ιστορικό ενοικιαστών: πορεία ενοικίου ανά μίσθωση */}
          {(segment==='past'||segment==='all')&&rentHistory.length>=2&&(
            <div style={{ marginTop:24 }}>
              <SecHdr label="Ιστορικό ενοικιαστών" sub="Πορεία μηνιαίου ενοικίου ανά μίσθωση"/>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {rentHistory.map((t,i)=>{
                  const prev=i>0?rentHistory[i-1].monthly_rent||0:0;
                  const cur=t.monthly_rent||0;
                  const diff=prev>0?cur-prev:0;
                  return (
                    <div key={t.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:'10px 14px', flexWrap:'wrap' as const }}>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', fontFamily:T.font.sans }}>{t.full_name}</div>
                        <div style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans }}>{fmtD(t.lease_start)} έως {fmtD(t.move_out_date||t.lease_end)}</div>
                      </div>
                      <div style={{ textAlign:'right' as const }}>
                        <span style={{ fontSize:14, fontWeight:700, fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', color:'var(--text-primary)' }}>{fmt(cur)}</span>
                        {diff!==0&&<span style={{ marginLeft:8, fontSize:11, fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', color:'var(--text-secondary)' }}>{diff>0?'+':''}{fmt(diff)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Ντοσιέ — κοινό SideSheet ───────────────────────────────────────────
          Ήταν χειρόγραφο πλαϊνό φύλλο: δικό του scrim, δικό του πλάτος 980, δικό
          του «‹ Πίσω» πάνω αριστερά (τα άλλα δύο ντοσιέ της εφαρμογής είχαν «×»
          πάνω δεξιά) και ούτε Escape ούτε κλείδωμα κύλισης του φόντου. Το
          κουμπί επιστροφής ΔΕΝ χάθηκε — το «×» του SideSheet κάνει ακριβώς την
          ίδια δουλειά (setOpenId(null)) στη θέση που το έχουν και τα υπόλοιπα.

          ΟΙ ΚΑΡΤΕΛΕΣ ΜΕΝΟΥΝ ΣΤΗΝ ΚΕΦΑΛΙΔΑ. Στο χειρόγραφο ήταν τρίτη σταθερή
          λωρίδα με flexShrink:0· το SideSheet έχει δύο σταθερές ζώνες (κεφαλίδα,
          υποσέλιδο) και μία που κυλά. Μέσα στο `children` οι έξι καρτέλες θα
          έφευγαν προς τα πάνω με την κύλιση — γι' αυτό μπαίνουν στο `header`.

          zIndex: ήταν 900 ενώ η φόρμα 950. Τώρα και τα δύο είναι 1000 από τα
          primitives, αλλά η φόρμα αποδίδεται ΜΕΤΑ σε αυτό το ίδιο επίπεδο, άρα
          εξακολουθεί να ζωγραφίζεται από πάνω.

          ΓΙΑΤΙ ΤΟ onClose ΕΙΝΑΙ ΦΡΟΥΡΗΜΕΝΟ: βλέπε `closeDossier` παραπάνω. Η
          φόρμα ΔΕΝ είναι η μόνη επικάλυψη που ανοίγει πάνω στο ντοσιέ — τα τρία
          παράθυρα της PaymentsView («Σήμανση ως πληρωμένο», «Αίτημα πληρωμής»,
          «Σάρωση απόδειξης») ζουν κι αυτά μέσα του και ένας φρουρός μόνο για
          το `isForm` θα άφηνε ένα Escape πάνω τους να κλείσει ολόκληρο το
          ντοσιέ. */}
      {dc&&(
        <SideSheet open onClose={closeDossier} size="xl"
          ariaLabel={`Ντοσιέ ενοικιαστή: ${dc.full_name}`}
          header={<>
            <div style={{ display:'flex', alignItems:'flex-start', gap:14, flexWrap:'wrap' as const }}>
              <div style={{ minWidth:0, flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' as const }}>
                  <span style={{ fontSize:20, fontWeight:700, color:'var(--text-primary)' }}>{dc.full_name}</span>
                  {statusBadge(dc)}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:5, flexWrap:'wrap' as const }}>
                  {dc.profession&&<span style={{ fontSize:12, color:'var(--text-tertiary)' }}>{dc.profession}</span>}
                  {dc.email&&<span style={{ fontSize:12, color:'var(--text-secondary)' }}>{dc.email}</span>}
                  {dc.phone&&<span style={{ fontSize:12, color:'var(--text-secondary)' }}>{dc.phone}</span>}
                </div>
              </div>
              <div style={{ display:'flex', gap:8, flexShrink:0, flexWrap:'wrap' as const, justifyContent:'flex-end' }}>
                <Btn variant="secondary" onClick={()=>openEditForm(dc)}>Επεξεργασία</Btn>
                {onStartHandover&&<Btn variant="secondary" onClick={()=>onStartHandover(dc.full_name||'', dc.phone||'', isPastTenant(dc)?'check_out':'check_in')}>Πρωτόκολλο παράδοσης</Btn>}
                {!isPastTenant(dc)&&<Btn variant="secondary" onClick={()=>markMovedOut(dc)}>Αποχώρησε</Btn>}
              </div>
            </div>

            {/* Καρτέλες ενότητας */}
            <div style={{ display:'flex', marginTop:12, marginBottom:-18, overflowX:'auto' as const, scrollbarWidth:'none' as const }}>
              {DTABS.map(tb=>(
                <button key={tb.id} onClick={()=>setDossierTab(tb.id)} style={{ ...s.tabBtn(dossierTab===tb.id), display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                  {tb.label}
                  {(tb.badge??0)>0&&<span style={{ minWidth:18, height:18, borderRadius:8, background:'var(--negative)', color:'var(--text-inverse)', fontSize: 11, fontWeight:700, display:'inline-flex', alignItems:'center', justifyContent:'center', padding:'0 4px' }}>{tb.badge}</span>}
                </button>
              ))}
            </div>
          </>}>
          {dossierTab==='overview'&&(
            <>
              {isPastTenant(dc)&&<InfoBanner tone="neutral">Προηγούμενος ενοικιαστής{dc.move_out_date?`: αποχώρηση ${fmtD(dc.move_out_date)}`:''}. Ο φάκελος διατηρείται για το ιστορικό του ακινήτου.</InfoBanner>}
              <DashboardView tenant={dc} payments={dcPayments} propertyCount={propertyCount}/>
            </>
          )}
          {dossierTab==='lease'&&(
            <div style={{ display:'flex', flexDirection:'column' }}>
              <div>
                <InfoBanner tone="info">Περιμένεις το ενοίκιο κάθε μήνα την <strong>{fn(Math.min(Math.max(1,dc.rent_due_day||1),28))}η</strong> ημέρα. Οι μηνιαίες δόσεις δημιουργούνται αυτόματα από την έναρξη της μίσθωσης.</InfoBanner>
                <PaymentsView tenant={dc} propertyId={propertyId} userId={userId} payments={dcPayments} onRefresh={fetch_} plan={plan}/>
              </div>
              <div style={{ borderTop:'1px solid var(--border-subtle)', marginTop:28, paddingTop:28 }}><DepositView tenant={dc} payments={dcPayments} damages={dcDamages} onReturned={fetch_}/></div>
              <div style={{ borderTop:'1px solid var(--border-subtle)', marginTop:28, paddingTop:28 }}><RenewalView tenant={dc} userId={userId} comps={comps} sqm={propSqm}/></div>
            </div>
          )}
          {dossierTab==='condition'&&(
            <div style={{ display:'flex', flexDirection:'column' }}>
              <DamagesView tenant={dc} propertyId={propertyId} userId={userId} damages={dcDamages} onRefresh={fetch_}/>
              <div style={{ borderTop:'1px solid var(--border-subtle)', marginTop:28, paddingTop:28 }}><MaintenanceView tenant={dc} propertyId={propertyId} userId={userId} requests={dcMaint} others={dc?maint.filter(m=>m.tenant_id!==dc.id):maint} onRefresh={fetch_}/></div>
            </div>
          )}
          {dossierTab==='legal'&&<LegalTaxView tenant={dc} propertyCount={propertyCount}/>}
          {dossierTab==='comm'&&<CommView tenant={dc} propertyId={propertyId} userId={userId}/>}
          {dossierTab==='docs'&&(
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap:16 }}>
              <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
                <SectionTitle>Μισθωτήριο (PDF)</SectionTitle>
                {dc.lease_doc_name?(
                  <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-accent)', borderRadius:T.radius.inner, padding:20 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, gap:10 }}>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', fontFamily:T.font.sans, overflow:'hidden', textOverflow:'ellipsis' }}>{dc.lease_doc_name}</div>
                        <div style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans }}>Ανεβασμένο συμβόλαιο</div>
                      </div>
                      <button style={s.btnDng} onClick={async()=>{if(!dc.lease_doc_name)return;await supabase.storage.from('lease-documents').remove([`${userId}/${dc.id}/${dc.lease_doc_name}`]);if(!await saved('Το συμβόλαιο δεν αποσυνδέθηκε',tenantStore.update(supabase,dc.id,{lease_doc_url:null,lease_doc_name:null})))return;notify('PDF διαγράφηκε');fetch_();}}>Διαγραφή</button>
                    </div>
                    <button onClick={()=>openLeaseDoc(dc)} style={{ ...s.btnGold, display:'inline-block', marginBottom:10 }}>Άνοιγμα PDF</button>
                    <div style={{ marginTop:10 }}>
                      <label style={{ ...s.btnSm, cursor:'pointer', display:'inline-block' }}>
                        {uploading?'Ανέβασμα…':'Αντικατάσταση PDF'}
                        <input type="file" accept=".pdf" style={{ display:'none' }} onChange={e=>{const f=e.target.files?.[0];if(f)uploadPDF(dc,f);}} disabled={uploading}/>
                      </label>
                    </div>
                  </div>
                ):(
                  <div style={{ border:'2px dashed var(--border-default)', borderRadius:T.radius.inner, padding:'40px 28px', textAlign:'center' as const }}>
                    <div style={{ fontSize:13, color:'var(--text-secondary)', fontFamily:T.font.sans, marginBottom:18 }}>Ανέβασε το μισθωτήριο σε μορφή PDF</div>
                    <label style={{ ...s.btnGold, cursor:'pointer', display:'inline-block', padding:'11px 28px' }}>
                      {uploading?'Ανέβασμα…':'Επιλογή PDF'}
                      <input type="file" accept=".pdf" style={{ display:'none' }} onChange={e=>{const f=e.target.files?.[0];if(f)uploadPDF(dc,f);}} disabled={uploading}/>
                    </label>
                  </div>
                )}
              </div>
              <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
                <SectionTitle>Εξωτερικός σύνδεσμος</SectionTitle>
                {dc.lease_doc_external_url?(
                  <div>
                    <div style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans, marginBottom:14, wordBreak:'break-all' as const, lineHeight:1.6 }}>{dc.lease_doc_external_url}</div>
                    <a href={dc.lease_doc_external_url} target="_blank" rel="noopener noreferrer" style={{ ...s.btnGold, display:'inline-block', textDecoration:'none' }}>Άνοιγμα συνδέσμου</a>
                  </div>
                ):(
                  <div style={{ fontSize:13, color:'var(--text-tertiary)', fontFamily:T.font.sans, lineHeight:1.7 }}>Δεν έχει οριστεί εξωτερικός σύνδεσμος. Πρόσθεσέ τον από την «Επεξεργασία», στα «Έγγραφα» (Google Drive, Dropbox κ.ά.).</div>
                )}
              </div>
            </div>
          )}
        </SideSheet>
      )}

      {/* ── Φόρμα — κοινό Modal ───────────────────────────────────────────────
          Ήταν χειρόγραφο: το ίδιο το φόντο κυλούσε (alignItems:'flex-start' +
          overflowY στο overlay), οπότε ο τίτλος «Νέος ενοικιαστής» και το κουμπί
          αποθήκευσης έφευγαν από την οθόνη μόλις άνοιγες τα «Περισσότερα». Το
          Modal κυλά ΜΟΝΟ το σώμα (maxHeight 92dvh): κεφαλίδα και ενέργειες
          μένουν πάντα στη θέση τους.
          Το «Ακύρωση» ΔΕΝ χάθηκε — μετακόμισε από την κεφαλίδα στο υποσέλιδο,
          δίπλα στην αποθήκευση, όπου στέκουν οι δύο ενέργειες μαζί· η κεφαλίδα
          έχει πλέον το «×» του Modal, που καλεί το ίδιο closeForm (άρα και την
          ίδια προστασία από ακούσια απώλεια δεδομένων). */}
      {isForm&&(
        <Modal open onClose={closeForm} size="lg"
          title={editId?'Επεξεργασία ενοικιαστή':'Νέος ενοικιαστής'}
          subtitle="Ζητάμε μόνο ό,τι έχει νόημα για αυτή τη μίσθωση. Κάθε πεδίο λέει γιατί."
          footer={<>
            {/* Και τα δύο κουμπιά κλειδώνουν όσο γράφει: το «Ακύρωση» δεν
                επιτρέπεται να εξαφανίσει τη φόρμα στη μέση της αποθήκευσης
                (ίδιος φρουρός με το closeForm, ώστε να μη μοιάζει ενεργό). */}
            <button style={s.btnGhost} onClick={closeForm} disabled={saving}>Ακύρωση</button>
            <button style={s.btnGold} onClick={save} disabled={saving}>{saving?'Αποθήκευση…':editId?'Αποθήκευση αλλαγών':'Προσθήκη ενοικιαστή'}</button>
          </>}>
          {/* ΕΝΑ παιδί, όχι τριάντα. Το σώμα του Modal είναι flex column με
              gap 20· η φόρμα έχει ~30 αδέλφια πρώτου επιπέδου με δικά τους,
              ρυθμισμένα περιθώρια (6/12/16 και τα `s.divider`), οπότε το gap θα
              πρόσθετε ~600px κενού και θα διέλυε τον ρυθμό των ενοτήτων. */}
          <div>
            {/* ── ΤΙ ΛΕΙΠΕΙ ΓΙΑ ΤΗ ΔΗΛΩΣΗ ─────────────────────────────────── */}
            <MissingCriticalBar missing={formMissing}/>

            {/* ── ΠΟΙΟΣ ΕΙΝΑΙ ────────────────────────────────────────────── */}
            <SectionTitle>Ποιος είναι ο ενοικιαστής</SectionTitle>
            <div className="form-row form-row-3">
              {show('tenant.full_name')&&<TextInput label={`${labelOf('tenant.full_name')} *`} labelInfo={whyOf('tenant.full_name')} value={form.full_name} onChange={v=>sf('full_name',v)}/>}
              {show('tenant.afm')&&<TextInput label={labelOf('tenant.afm')} labelInfo={whyOf('tenant.afm')} value={form.afm} onChange={v=>sf('afm',v)}/>}
              {show('tenant.phone')&&<TextInput label={labelOf('tenant.phone')} labelInfo={whyOf('tenant.phone')} value={form.phone} onChange={v=>sf('phone',v)}/>}
            </div>

            <div style={s.divider}/>
            {/* ── Η ΜΙΣΘΩΣΗ ────────────────────────────────────────────────── */}
            {/* ══ Ο ΑΣΤΕΡΙΣΚΟΣ ΗΤΑΝ ΚΟΚΚΙΝΟΣ ΚΑΙ ΔΕΝ ΕΔΕΙΧΝΕ ΠΟΥΘΕΝΑ ═══════════
                Καθόταν πάνω στον τίτλο μιας ενότητας με πέντε χειριστήρια, οπότε
                δεν έλεγε ΠΟΙΟ είναι υποχρεωτικό. Και η μπάρα στην κορυφή τα
                ονομάζει ήδη ένα προς ένα, με τη διατύπωση του μητρώου: το ίδιο
                μήνυμα δύο φορές, η μία χωρίς περιεχόμενο. Το χρώμα ήταν και
                παράβαση του κανόνα: κόκκινο σημαίνει σφάλμα, όχι «συμπλήρωσέ το». */}
            <SectionTitle>Η μίσθωση</SectionTitle>
            {show('tenant.lease_category')&&(
              <>
                <ChipRow label={labelOf('tenant.lease_category')} info={whyOf('tenant.lease_category')}>
                  {(Object.keys(LEASE_CATEGORY_LABELS) as LeaseCategory[]).map(lc=>(
                    <Chip key={lc} on={form.lease_category===lc} onClick={()=>sf('lease_category',lc)}>{LEASE_CATEGORY_LABELS[lc]}</Chip>
                  ))}
                </ChipRow>
              </>
            )}
            {show('tenant.lease_type')&&(
              <>
                <ChipRow label={labelOf('tenant.lease_type')} info={whyOf('tenant.lease_type')}>
                  {(Object.keys(LEASE_LABELS) as LeaseType[]).map(lt=>(
                    <Chip key={lt} on={form.lease_type===lt} onClick={()=>sf('lease_type',lt)}>{LEASE_LABELS[lt]}</Chip>
                  ))}
                </ChipRow>
              </>
            )}
            <div className="form-row form-row-3">
              {show('tenant.lease_start')&&<DatePicker label={labelOf('tenant.lease_start')} labelInfo={whyOf('tenant.lease_start')} value={form.lease_start} onChange={v=>sf('lease_start',v)}/>}
              {/* Η ΛΗΞΗ ΕΙΧΕ ΤΟ «ΓΙΑΤΙ» ΤΗΣ ΕΝΑΡΞΗΣ. Δύο πεδία δίπλα δίπλα, το
                  ίδιο κείμενο πίσω από τα δύο κυκλάκια· το ένα από τα δύο
                  έλεγε πράγμα που δεν αφορούσε το πεδίο του. */}
              {show('tenant.lease_end')&&<DatePicker label={labelOf('tenant.lease_end')} labelInfo={whyOf('tenant.lease_end')} value={form.lease_end} onChange={v=>sf('lease_end',v)}/>}
              {form.lease_type==='custom'&&<NumberInput label="Ημέρες" value={String(form.custom_lease_days)} onChange={v=>sf('custom_lease_days',parseInt(v)||0)} suffix="ημ."/>}
            </div>

            <div style={s.divider}/>
            {/* ── ΤΟ ΕΝΟΙΚΙΟ ───────────────────────────────────────────────── */}
            <SectionTitle>Το ενοίκιο</SectionTitle>
            <div className="form-row form-row-3">
              {show('tenant.rent')&&<NumberInput label={labelOf('tenant.rent')} labelInfo={whyOf('tenant.rent')} value={form.monthly_rent} onChange={v=>sf('monthly_rent',v)} suffix="€"/>}
              {show('tenant.rent_due_day')&&<SelectField label={labelOf('tenant.rent_due_day')} labelInfo={whyOf('tenant.rent_due_day')} value={form.rent_due_day} onChange={v=>sf('rent_due_day',v)} options={Array.from({length:28},(_,i)=>({value:String(i+1),label:`${i+1}η`}))}/>}
              {/* Ο ΔΙΑΚΟΠΤΗΣ ΗΤΑΝ ΑΛΛΟΥ, ΚΑΙ ΜΕ ΑΛΛΗ ΕΤΙΚΕΤΑ. Καθόταν δίπλα στο
                  IBAN με ΚΕΦΑΛΑΙΑ ετικέτα, στημένος με το χέρι, ανάμεσα σε πεδία
                  με πεζή. Εδώ είναι το τρίτο πεδίο της σειράς του ενοικίου, με
                  το ίδιο `ToggleField` που χρησιμοποιεί η υπόλοιπη εφαρμογή. */}
              {show('tenant.rent_iban')&&<ToggleField label="Είσπραξη σε τράπεζα" labelInfo={whyOf('tenant.rent_iban')} on={form.e_payment} onChange={v=>sf('e_payment',v)}/>}
            </div>
            {/* Ο,τι θα συμβεί μόνο του, λέγεται πριν συμβεί — και μαζί τι το ακυρώνει. */}
            {editRow?.pending_rent!=null&&editRow.pending_rent_from&&(
              <div style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans, lineHeight:1.55, marginBottom:6 }}>
                Εκκρεμεί αναπροσαρμογή σε {fmt(editRow.pending_rent)} από {fmtD(editRow.pending_rent_from)}, από υπογεγραμμένη ειδοποίηση. Αλλαγή του ενοικίου εδώ την ακυρώνει.
              </div>
            )}
            {show('tenant.rent_iban')&&(
              <>
                <div className="form-row form-row-3" style={{ marginTop:14 }}>
                  {/* Το IBAN είναι το μόνο πεδίο της φόρμας που κουβαλά είκοσι
                      επτά χαρακτήρες: παίρνει ρητά δύο στήλες αντί να απλωθεί σε
                      όλο το πλάτος ή να στριμωχτεί σε μία. */}
                  <div className="form-span-2">
                    <TextInput label={labelOf('tenant.rent_iban')} value={form.rent_iban} onChange={v=>sf('rent_iban',v)} placeholder="GR..."/>
                  </div>
                </div>
                {!form.e_payment&&(
                  <div style={{ marginTop:14 }}>
                    <AlertBar level="warning" text={`Με είσπραξη σε μετρητά χάνεται η τεκμαρτή έκπτωση ${fp((PRESUMPTIVE_DEDUCTION_RATE*100))} και ο φόρος υπολογίζεται στο 100% των ακαθάριστων.`}/>
                  </div>
                )}
              </>
            )}

            <div style={s.divider}/>
            {/* ── ΕΓΓΥΗΣΗ ──────────────────────────────────────────────────── */}
            <SectionTitle info={whyOf('tenant.deposit')}>{labelOf('tenant.deposit')}</SectionTitle>
            {show('tenant.deposit')&&(
              <div className="form-row form-row-3">
                <NumberInput ariaLabel={labelOf('tenant.deposit')} value={form.deposit_amount} onChange={v=>sf('deposit_amount',v)} suffix="€"/>
              </div>
            )}

            <div style={s.divider}/>
            {/* ── ΤΙ ΠΑΡΕΧΕΙΣ ──────────────────────────────────────────────── */}
            <SectionTitle info={whyOf('tenant.furnishing')}>{labelOf('tenant.furnishing')}</SectionTitle>
            <ChipRow groupLabel={labelOf('tenant.furnishing')}>
              {(Object.keys(FURNISHING_LABELS) as Furnishing[]).map(fv=>(
                <Chip key={fv} on={form.furnishing===fv} onClick={()=>sf('furnishing',form.furnishing===fv?'':fv)}>{FURNISHING_LABELS[fv]}</Chip>
              ))}
            </ChipRow>

            {/* Οι παρεχόμενες υπηρεσίες υπάρχουν ΜΟΝΟ σε επιπλωμένο — το λέει το μητρώο */}
            {show('tenant.services')&&(
              <div style={{ marginTop:18 }}>
                <SectionTitle info={whyOf('tenant.services')}>Τι πληρώνεις εσύ, τι ο ενοικιαστής</SectionTitle>
                <ServicesEditor value={form.services} onChange={v=>sf('services',v)}/>
              </div>
            )}
            {!isFurnished(form.furnishing)&&(form.services||[]).length>0&&(
              <div style={{ marginTop:14 }}>
                <AlertBar level="info" text={`Έχεις ${(form.services||[]).length} καταχωρημένες γραμμές υπηρεσιών από προηγούμενη ρύθμιση. Δεν εμφανίζονται σε γυμνό διαμέρισμα, αλλά διατηρούνται· άλλαξε την επίπλωση σε «Επιπλωμένο» για να τις δεις.`}/>
              </div>
            )}

            <div style={s.divider}/>
            {/* ── ΧΑΡΤΙΑ ───────────────────────────────────────────────────── */}
            <SectionTitle info={whyOf('tenant.lease_doc')}>{labelOf('tenant.lease_doc')}</SectionTitle>
            <div className="form-row form-row-3" style={{ marginBottom:14 }}>
              <div className="form-span-2">
                <TextInput label="Εξωτερικός σύνδεσμος" value={form.lease_doc_external_url} onChange={v=>sf('lease_doc_external_url',v)} placeholder="drive.google.com/…"/>
              </div>
            </div>
            <FilePickRow label="Υπογεγραμμένο μισθωτήριο" hint="PDF ή εικόνα, αποθηκεύεται στον χώρο εγγράφων του ακινήτου"
              busy={docBusy} onPick={f=>uploadFormDoc(f,'lease')} docs={formDocs.filter(d=>d.tag==='lease')}/>

            {/* ── ΠΕΡΙΣΣΟΤΕΡΑ: σπάνια αλλά υπαρκτά, κλειστά εξ ορισμού ─────── */}
            {moreFields.length>0&&(
              <>
                <div style={s.divider}/>
                {/* ΤΟ ΑΝΟΙΓΜΑ ΕΙΧΕ ΔΙΚΟ ΤΟΥ ΣΧΗΜΑ, ΚΑΙ ΗΤΑΝ ΤΟ ΜΟΝΑΔΙΚΟ ΤΗΣ ΕΦΑΡΜΟΓΗΣ.
                    Κουμπί σε όλο το πλάτος, με περίγραμμα σαν πεδίο· δεξιά
                    ένα «+» ή «−» αντί για το βελάκι που ανοίγει κάθε άλλη λίστα
                    σε δώδεκα οθόνες. Και από κάτω μια πρόταση που εξηγούσε τι
                    είναι μέσα, μόνιμα ορατή μόλις άνοιγε. Πλέον είναι η ΙΔΙΑ
                    γραμμή που ανοίγει με παντού: ετικέτα, μέτρημα, βελάκι — και
                    η εξήγηση στο κυκλάκι της. */}
                <button type="button" onClick={()=>setMoreOpen(o=>!o)} aria-expanded={moreOpen} aria-label="Περισσότερα πεδία"
                  className="acc-toggle" style={{ display:'flex', alignItems:'center', gap:10, width:'100%', minHeight:44, background:'none', border:'none', cursor:'pointer', textAlign:'left' as const, padding:0, fontFamily:T.font.sans }}>
                  <span style={{ ...TT.label, fontSize:11, color:'var(--text-secondary)', flex:1, minWidth:0, display:'flex', alignItems:'center' }}>
                    Περισσότερα
                    <InfoDot text="Τίποτα εδώ δεν είναι υποχρεωτικό για τη δήλωση. Είναι όσα χρειάζονται σπάνια και γι’ αυτό δεν στέκονται μπροστά σου."/>
                  </span>
                  <span style={{ ...TT.caption, color:'var(--text-tertiary)', fontVariantNumeric:'tabular-nums' }}>{fn(moreFields.length)} πεδία</span>
                  <ChevronRight aria-hidden size={15} style={{ flexShrink:0, color:'var(--text-tertiary)', transform:moreOpen?'rotate(90deg)':'none', transition:'transform .18s' }}/>
                </button>
                {moreOpen&&(
                  <div style={{ marginTop:14 }}>

                    {/* ΕΝΤΕΚΑ ΠΕΔΙΑ, ΕΝΤΕΚΑ ΠΛΗΡΗ ΠΛΑΤΗ, ΤΟ ΕΝΑ ΚΑΤΩ ΑΠΟ ΤΟ ΑΛΛΟ.
                        Κάθε πεδίο εδώ ήταν τυλιγμένο σε δικό του `<div>` με
                        `marginBottom:16`, δηλαδή μία στήλη σε όλο το πλάτος του
                        παραθύρου για να δεχτεί ένα επάγγελμα ή μια συχνότητα.
                        Μετρημένο στο παράθυρο: 1.030 εικονοστοιχεία πλάτος για
                        πεδία που ζητούν 200· ύψος που ξεπερνούσε τρεις
                        οθόνες. Πλέον είναι οι ΙΔΙΕΣ σειρές τριών στηλών με την
                        υπόλοιπη φόρμα: ίδια πλάτη, ίδιες αφετηρίες, ίδια
                        απόσταση. Το «Περισσότερα» έπαψε να είναι άλλη φόρμα. */}
                    {/* ΤΡΙΑ ΚΑΙ ΤΡΙΑ, ΟΧΙ ΤΕΣΣΕΡΑ ΚΑΙ ΔΥΟ. Τα τέσσερα πρώτα πεδία
                        ήταν σε ΜΙΑ σειρά τριών στηλών, οπότε το τέταρτο («Συχνότητα
                        εξόφλησης») έπεφτε μόνο του σε δεύτερη σειρά με δύο τρύπες
                        δίπλα του· ο τύπος με τον αριθμό εγγράφου έμεναν δύο σε
                        τρεις στήλες. Οι σειρές γράφονται πλέον ΓΕΜΑΤΕΣ: τρία και
                        τρία, το ίδιο σχήμα δύο φορές. */}
                    <div className="form-row form-row-3" style={{ marginBottom:14 }}>
                      {more('tenant.email')&&<TextInput label={labelOf('tenant.email')} labelInfo={whyOf('tenant.email')} value={form.email} onChange={v=>sf('email',v)} type="email"/>}
                      {more('tenant.profession')&&<TextInput label={labelOf('tenant.profession')} labelInfo={whyOf('tenant.profession')} value={form.profession} onChange={v=>sf('profession',v)} placeholder="Μηχανικός"/>}
                      {more('tenant.iban')&&<TextInput label={labelOf('tenant.iban')} labelInfo={whyOf('tenant.iban')} value={form.iban} onChange={v=>sf('iban',v)} placeholder="GR00 0000 0000 0000…"/>}
                    </div>

                    <div className="form-row form-row-3" style={{ marginBottom:14 }}>
                      {more('tenant.payment_frequency')&&<SelectField label={labelOf('tenant.payment_frequency')} labelInfo={whyOf('tenant.payment_frequency')} value={form.payment_frequency} onChange={v=>{ if(isPaymentFreq(v)) sf('payment_frequency',v); }} options={(Object.keys(PAYMENT_FREQ_LABELS) as PaymentFreq[]).map(k=>({value:k,label:PAYMENT_FREQ_LABELS[k]}))}/>}
                      {more('tenant.id_doc')&&<SelectField label="Τύπος εγγράφου" labelInfo={whyOf('tenant.id_doc')} value={form.id_doc_type} onChange={v=>{ if(isIdDocType(v)) sf('id_doc_type',v); }} options={ID_DOCS.map(d=>({value:d,label:d}))} placeholder="Επιλογή…"/>}
                      {more('tenant.id_doc')&&<TextInput label="Αριθμός εγγράφου" value={form.id_doc_number} onChange={v=>sf('id_doc_number',v)}/>}
                    </div>

                    {more('tenant.id_doc')&&(
                      <FilePickRow label="Σαρωμένη ταυτότητα ή διαβατήριο" hint="PDF ή εικόνα" busy={docBusy} onPick={f=>uploadFormDoc(f,'id')} docs={formDocs.filter(d=>d.tag==='id')}/>
                    )}

                    {/* Η ΕΠΙΣΤΡΟΦΗ ΕΙΝΑΙ ΤΕΤΑΡΤΟ ΠΕΔΙΟ, ΚΑΙ ΓΙ᾽ ΑΥΤΟ ΠΑΙΡΝΕΙ ΔΙΚΗ
                        ΤΗΣ ΣΕΙΡΑ. Μέσα στην τριάδα της καταβολής έκανε «3+1» μόλις
                        άναβε ο διακόπτης: μία ημερομηνία μόνη της κάτω από τρία
                        πεδία, με δύο τρύπες δεξιά της. */}
                    <div className="form-row form-row-3" style={{ marginBottom:14 }}>
                      {more('tenant.deposit_method')&&<SelectField label={labelOf('tenant.deposit_method')} labelInfo={whyOf('tenant.deposit_method')} value={form.deposit_method} onChange={v=>sf('deposit_method',v)} options={DEPOSIT_METHODS.map(m=>({value:m,label:m}))} placeholder="Επιλογή…"/>}
                      {more('tenant.deposit_paid_on')&&<DatePicker label={labelOf('tenant.deposit_paid_on')} labelInfo={whyOf('tenant.deposit_paid_on')} value={form.deposit_paid_on} onChange={v=>sf('deposit_paid_on',v)}/>}
                      {more('tenant.deposit_returned')&&<ToggleField label={labelOf('tenant.deposit_returned')} labelInfo={whyOf('tenant.deposit_returned')} on={form.deposit_returned} onChange={v=>sf('deposit_returned',v)}/>}
                    </div>
                    {more('tenant.deposit_returned')&&form.deposit_returned&&(
                      <div className="form-row form-row-3" style={{ marginBottom:14 }}>
                        <DatePicker label="Ημερομηνία επιστροφής" value={form.deposit_return_date} onChange={v=>sf('deposit_return_date',v)}/>
                      </div>
                    )}

                    {/* ΔΥΟ ΔΙΑΚΟΠΤΕΣ ΧΩΡΙΣ ΘΕΜΑ. Το «Περιλαμβάνεται στο ενοίκιο»
                        και το «Χρεώνεται ξεχωριστά» στέκονταν μόνα τους, χωρίς
                        να λέει τίποτα ΤΙ περιλαμβάνεται: το μητρώο το ξέρει
                        («Χώρος στάθμευσης») και το γράφει η ετικέτα της σειράς. */}
                    {more('tenant.parking')&&(
                      <>
                        <div style={{ ...fieldLabelStyle, marginBottom:0 }}><span>{labelOf('tenant.parking')}<InfoDot text={whyOf('tenant.parking')||''}/></span></div>
                        <div className="form-row form-row-3" style={{ marginBottom:14 }}>
                          <ToggleField label="Περιλαμβάνεται στο ενοίκιο" on={form.parking_included} onChange={v=>sf('parking_included',v)}/>
                          <ToggleField label="Χρεώνεται ξεχωριστά" on={form.parking_extra} onChange={v=>sf('parking_extra',v)}/>
                          {form.parking_extra&&<NumberInput label="Μηνιαία τιμή" value={form.parking_extra_price} onChange={v=>sf('parking_extra_price',v)} suffix="€"/>}
                        </div>
                      </>
                    )}

                    {/* ΔΥΟ ΠΛΑΙΣΙΑ ΕΛΕΥΘΕΡΟΥ ΚΕΙΜΕΝΟΥ, ΤΟ ΕΝΑ ΚΑΤΩ ΑΠΟ ΤΟ ΑΛΛΟ, ΣΕ
                        ΠΛΗΡΕΣ ΠΛΑΤΟΣ: τριακόσια εικονοστοιχεία ύψος στο τέλος μιας
                        φόρμας που μόλις μαζεύτηκε. Είναι το ίδιο είδος πεδίου με το
                        ίδιο ύψος, οπότε στέκονται δίπλα δίπλα και το κάτω άκρο της
                        φόρμας γίνεται μία ευθεία. Σε στενή οθόνη ξαναπέφτουν το ένα
                        κάτω από το άλλο, όπως κάθε άλλη σειρά. */}
                    <div className="form-row form-row-2">
                      {more('tenant.extra_perks')&&(
                        <Textarea label={labelOf('tenant.extra_perks')} labelInfo={whyOf('tenant.extra_perks')} value={form.extra_perks} onChange={v=>sf('extra_perks',v)} placeholder="Αποθήκη, κήπος, κοινόχρηστο πλυντήριο…"/>
                      )}
                      {more('tenant.notes')&&(
                        <Textarea label={labelOf('tenant.notes')} labelInfo={whyOf('tenant.notes')} value={form.notes} onChange={v=>sf('notes',v)}/>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
            {/* Σφάλμα αποθήκευσης — ΜΕΣΑ στη φόρμα, ώστε να είναι πάντα ορατό (η
                φόρμα είναι overlay· ένα σφάλμα στο body από κάτω δεν θα φαινόταν). */}
            {error&&(
              <div role="alert" style={{ marginTop:24, background:'var(--negative-dim)', border:'1px solid var(--negative-border)', borderLeft:'3px solid var(--negative)', borderRadius:T.radius.inner, padding:'12px 16px', color:'var(--negative)', fontSize:13, fontFamily:T.font.sans, fontWeight:500, display:'flex', gap:12, alignItems:'flex-start', justifyContent:'space-between' }}>
                <span style={{ lineHeight:1.55, wordBreak:'break-word' as const }}>{error}</span>
                <button onClick={()=>setError(null)} style={{ background:'none', border:'none', color:'var(--negative)', cursor:'pointer', fontSize:18, lineHeight:1, padding:0, flexShrink:0 }}>×</button>
              </div>
            )}
            {/* ΜΙΑ φόρμα, χωρίς βήματα: όσα πεδία έμειναν χωρούν σε μία οθόνη και
                τα σπάνια είναι πίσω από το «Περισσότερα». Οι δύο καρτέλες υπήρχαν
                επειδή τα 88 πεδία δεν χωρούσαν αλλιώς.
                Οι δύο ενέργειες («Ακύρωση», αποθήκευση) ζουν πλέον στο υποσέλιδο
                του Modal, που δεν κυλά μαζί με τα πεδία. */}
          </div>
        </Modal>
      )}

      <LeaseDeclaration open={declOpen} onClose={()=>setDeclOpen(false)} propertyId={propertyId} userId={userId} supabase={supabase} />
      <LeaseModal open={leaseOpen} onClose={()=>setLeaseOpen(false)} userId={userId} supabase={supabase} branding={branding} propertyId={propertyId} />
    </div>
  );
}
