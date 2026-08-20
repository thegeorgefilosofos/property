// ═══════════════════════════════════════════════════════════════════════════
// Ο ΕΝΟΙΚΙΑΣΤΗΣ: ΤΑ ΣΧΗΜΑΤΑ ΚΑΙ ΟΙ ΚΑΝΟΝΕΣ ΤΟΥΣ
// ─────────────────────────────────────────────────────────────────────────
// Δέκα οθόνες της καρτέλας ενοικιαστή μιλούν για τα ΙΔΙΑ πράγματα: μισθωτήριο,
// δόση, εγγύηση, φθορά, αίτημα συντήρησης. Όσο τα σχήματα ζούσαν μέσα στο ίδιο
// αρχείο με τις οθόνες, το αρχείο ήταν τρεις χιλιάδες γραμμές και κανείς δεν
// έβλεπε πού τελειώνει το «τι είναι ένας ενοικιαστής» και πού αρχίζει το «πώς
// φαίνεται». Εδώ είναι μόνο το πρώτο.
// ═══════════════════════════════════════════════════════════════════════════
import { athensToday } from '@/lib/core/time';
import { normalizePhone } from '@/lib/clients/clients';
import { instalmentPeriods, type InstalmentPeriod } from '@/lib/rent/frequency';
import { ABSENT_DATE } from '@/components/Theme';
// ΟΙ ΔΥΟ ΣΥΝΑΡΤΗΣΕΙΣ ΕΡΧΟΝΤΑΙ ΑΠΟ ΤΟ lib/, ΟΧΙ ΑΠΟ ΤΟ ΑΡΧΕΙΟ ΤΩΝ ΟΘΟΝΩΝ.
// Το TabTenantHelpers ξεκινά με 'use client'· αυτό εδώ είναι σχήματα και
// κανόνες, που πρέπει να διαβάζονται και από τον διακομιστή. Τιμή που έρχεται
// από module πελάτη φτάνει `undefined` στο SSR — χωρίς σφάλμα και χωρίς ίχνος.
import { serviceLinesFrom, servicesTenantCharge, type ServiceLine } from '@/lib/rent/services';
import {
  ID_DOCS,
  type LeaseType, type LeaseCategory, type PaymentFreq, type IdDocType,
} from './TabTenantHelpers';

// ─── Types ────────────────────────────────────────────────────────────────────
// ΤΙ ΕΦΥΓΕ ΑΠΟ ΕΔΩ (και γιατί δεν διαβάζεται πια):
//   • deposit_invest_* / prepay_* — το app προέτρεπε τον ιδιοκτήτη να επενδύσει
//     χρήματα που είναι υποχρεωμένος να επιστρέψει ακέραια, με επινοημένο 4%.
//   • 15 πεδία πέντε προκαθορισμένων συντηρήσεων, 9 μετρητών, 3 «καλάθι υποδοχής»,
//     3 στάθμευσης χωρίς ενέργεια, all_inclusive (διπλό του furnishing='turnkey').
//   • nationality / phone_work / employer — δεν προκαλούσαν καμία ενέργεια.
// Οι στήλες μένουν στη βάση (καμία μετάπτωση, καμία απώλεια), απλώς δεν
// ζητούνται πια από τον χρήστη και δεν γράφονται.
export interface Tenant {
  id:string; property_id:string; user_id:string;
  full_name:string; email:string|null; phone:string|null;
  profession:string|null;
  afm:string|null; id_doc_type:IdDocType|null; id_doc_number:string|null; iban:string|null; notes:string|null;
  lease_type:LeaseType|null; lease_category:LeaseCategory|null; lease_start:string|null; lease_end:string|null; custom_lease_days:number|null;
  monthly_rent:number|null; payment_frequency:PaymentFreq|null;
  // ΑΝΑΠΡΟΣΑΡΜΟΓΗ ΜΕ ΜΕΛΛΟΝΤΙΚΗ ΙΣΧΥ, ΟΧΙ ΤΟ ΤΡΕΧΟΝ ΜΙΣΘΩΜΑ. Γράφεται από την
  // υπογεγραμμένη ειδοποίηση και περνά στο `monthly_rent` την ημερομηνία της,
  // με τη νυχτερινή `apply_due_rent_adjustments`.
  pending_rent:number|null; pending_rent_from:string|null;
  deposit_amount:number|null; deposit_returned:boolean; deposit_return_date:string|null;
  // `streaming` και `cleaning`: οι δύο στήλες όπου ζουν τα παλιά δεδομένα υπηρεσιών.
  // Διαβάζονται μέσω serviceLinesFrom() και γράφονται ως ServiceLine[] στο `streaming`.
  e_payment:boolean; streaming:ServiceLine[]|null; cleaning:unknown; extra_perks:string|null;
  parking_included:boolean; parking_extra:boolean; parking_extra_price:number|null;
  lease_doc_url:string|null; lease_doc_name:string|null; lease_doc_external_url:string|null;
  status:'active'|'past'|null; rent_due_day:number|null;
  deposit_method:string|null; deposit_paid_on:string|null; move_out_date:string|null;
  furnishing:string|null; rent_iban:string|null;
  created_at:string;
}
export interface RentPayment { id:string; tenant_id:string; property_id:string; user_id:string; period_month:number; period_year:number; amount:number; base_rent:number|null; services_charge:number|null; paid:boolean; paid_date:string|null; days_late:number|null; notes:string|null; method:string|null; receipt_url:string|null; receipt_doc_id:string|null; due_date:string|null; tenant_declared:boolean|null; tenant_declared_at:string|null; tenant_note:string|null; created_at:string; }
// Φθορές & επισκευές ανά ενοικιαστή (πίνακας tenant_damages).
export interface TenantDamage { id:string; tenant_id:string; property_id:string; user_id:string; occurred_on:string|null; description:string; cost:number|null; charged_to_tenant:boolean; repaired:boolean; repaired_on:string|null; notes:string|null; created_at:string; }
// Συγκρίσιμα αγοράς (rent_comparables) — μόνο τα πεδία που χρειάζεται η πρόταση.
export interface RentComp { id:string; property_id:string; title:string; area:string|null; sqm:number|null; rent:number|null; rent_per_sqm:number|null; listing_type:string|null; source:string|null; url:string|null; }
// Αιτήματα βλάβης (maintenance_requests) — από την πύλη ενοικιαστή προς τον ιδιοκτήτη.
export interface MaintenanceReq { id:string; property_id:string; user_id:string|null; tenant_id:string|null; title:string; description:string|null; contact:string|null; category:string|null; status:string|null; resolved_at:string|null; photos:string[]|null; assignee_name:string|null; assignee_contact:string|null; created_at:string; }
// Τρόποι καταβολής εγγύησης (ελληνικά, σταθερή σειρά).
export const DEPOSIT_METHODS = ['Μετρητά','Τραπεζική κατάθεση','Ηλεκτρονική πληρωμή'] as const;
// Παράγωγη κατάσταση: «προηγούμενος» αν σημειώθηκε αποχώρηση ή status='past'.
export const isPastTenant = (t:{status?:string|null;move_out_date?:string|null}) => t.status==='past' || !!t.move_out_date;

// Τρόποι πληρωμής ενοικίου (ελληνικά, σταθερή σειρά).
export const PAY_METHODS = ['Μετρητά','Τραπεζική κατάθεση','Ηλεκτρονική πληρωμή','Κάρτα'] as const;
export type PayMethod = typeof PAY_METHODS[number];

// ── Συχνότητα εξόφλησης: μία πηγή για τις επιλογές ΚΑΙ τις ετικέτες ─────────
// Οι τρεις τιμές ήταν γραμμένες κατευθείαν μέσα στο JSX του SelectField, ο
// οποίος επιστρέφει `string`. Το `v:any` του παλιού `sf` τις δεχόταν αδιάκριτα,
// οπότε η ένωση `PaymentFreq` δεν προστάτευε τίποτα: μια αλλαγή στο value ενός
// option (π.χ. 'bi-monthly') γραφόταν κανονικά στη στήλη `payment_frequency`
// (είναι `text`) και ξαναδιαβαζόταν στο `Tenant.payment_frequency:PaymentFreq`,
// δηλαδή ως τιμή της ένωσης που ΚΑΜΙΑ σύγκριση δεν πιάνει. Μία πηγή τώρα για
// τις επιλογές και τις ετικέτες, ώστε να μην μπορούν να αποκλίνουν.

// Ίδιος λόγος: ο SelectField των εγγράφων ταυτοποίησης έδινε `string` σε πεδίο
// `IdDocType|''`. Το κενό είναι έγκυρη τιμή («καμία επιλογή»).
export const isIdDocType = (v:string):v is IdDocType|'' => v==='' || ID_DOCS.some(d=>d===v);
export const todayISO = () => athensToday();
// Τελευταία ημέρα του ΕΠΟΜΕΝΟΥ μήνα από μια ημερομηνία (προθεσμία δήλωσης ΑΑΔΕ).
export const lastDayNextMonth = (iso:string) => {
  const d = new Date(iso+'T00:00:00'); if(isNaN(d.getTime())) return ABSENT_DATE;
  const last = new Date(d.getFullYear(), d.getMonth()+2, 0);
  return last.toLocaleDateString('el-GR', { day:'2-digit', month:'long', year:'numeric' });
};
export interface CommLog { id:string; tenant_id:string; type:'call'|'email'|'sms'|'meeting'|'note'; summary:string; date:string; outcome:string|null; }
import type { PlanId } from '@/lib/billing/plans';

export interface TabTenantProps { propertyId:string; userId:string; onStartHandover?:(tenantName:string,tenantPhone:string,type:'check_in'|'check_out')=>void; plan?:PlanId; }


// ─── Τύπος επίπλωσης ───────────────────────────────────────────────────────────
// Είναι η ΜΙΑ είσοδος που κρίνει αν υπάρχουν καθόλου παρεχόμενες υπηρεσίες. Το
// `all_inclusive` έφυγε: ήταν δεύτερος διακόπτης για το ίδιο πράγμα με το
// furnishing='turnkey', και οι δύο μπορούσαν να διαφωνήσουν.
export type Furnishing = 'empty' | 'furnished' | 'turnkey';
export const FURNISHING_LABELS: Record<Furnishing,string> = {
  empty:'Κενό', furnished:'Επιπλωμένο', turnkey:'Turn Key (όλα μέσα)',
};
/** Επιπλωμένο με οποιαδήποτε έννοια; Παλαιά δεδομένα χωρίς τιμή θεωρούνται γυμνά. */
export const isFurnished = (furnishing:string|null|undefined):boolean =>
  furnishing==='furnished' || furnishing==='turnkey';

// ─── Ανάλυση δόσης: βασικό ενοίκιο + χρέωση υπηρεσιών + στάθμευση ──────────────
export type SvcInput = { monthly_rent?:number|null; streaming?:ServiceLine[]|null; cleaning?:unknown; parking_extra?:boolean; parking_extra_price?:number|null };
export const tenantBaseRent = (t:SvcInput):number => Math.max(0, t.monthly_rent||0);
/** Οι γραμμές υπηρεσιών του ενοικιαστή, διαβασμένες και από τα παλιά δεδομένα. */
export const tenantLines = (t:SvcInput):ServiceLine[] => serviceLinesFrom(t.streaming, t.cleaning);
export function tenantServicesCharge(t:SvcInput):number{
  const park = t.parking_extra ? (t.parking_extra_price||0) : 0;
  return Math.max(0, servicesTenantCharge(tenantLines(t)) + park);
}
/** Ανάλυση για τη μηνιαία κατάσταση προς τον μισθωτή. */
export function tenantServiceLines(t:SvcInput):{label:string;amount:number}[]{
  const out:{label:string;amount:number}[]=[];
  for(const l of tenantLines(t)){
    const amt = l.payer==='tenant' ? l.cost : l.payer==='split' ? l.cost/2 : 0;
    if(amt>0) out.push({ label:l.payer==='split'?`${l.name} (μισά-μισά)`:l.name, amount:amt });
  }
  if(t.parking_extra && (t.parking_extra_price||0)>0) out.push({label:'Χώρος στάθμευσης',amount:t.parking_extra_price||0});
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΚΑΝΟΝΕΣ ΠΟΥ ΧΡΕΙΑΖΟΝΤΑΙ ΠΑΝΩ ΑΠΟ ΜΙΑ ΟΘΟΝΗ
// ─────────────────────────────────────────────────────────────────────────
// Στρογγυλοποίηση σε λεπτά, οι αναμενόμενες δόσεις, η κατάσταση μιας
// πληρωμής, η ανάγνωση αριθμού από OCR, ο διεθνής αριθμός για μήνυμα, η κενή
// φόρμα και η προειδοποίηση σύγκρισης. Καθένα τους καλείται από δύο ως τρεις
// οθόνες — γι' αυτό δεν μπορεί να ζει μέσα σε καμία από αυτές.
// ═══════════════════════════════════════════════════════════════════════════

// όποια κι αν είναι η συχνότητα, ο χρόνος κλείνει με δώδεκα μισθώματα.
// Δύο δεκαδικά, ΠΑΝΤΑ: ο πολλαπλασιασμός επί τρεις μήνες πάνω σε ενοίκιο με
// λεπτά (π.χ. 833,33) βγάζει 2499,9900000000002 σε κινητή υποδιαστολή.
export const r2=(n:number)=>Math.round(n*100)/100;

export function expectedPeriods(tenant:Tenant, rentDueDay:number):InstalmentPeriod[] {
  if(!tenant.lease_start||!tenant.monthly_rent||tenant.monthly_rent<=0) return [];
  const now=new Date(); now.setHours(0,0,0,0);
  // Όριο δημιουργίας: το νωρίτερο από αποχώρηση, λήξη μίσθωσης, ή τρέχων μήνας.
  const caps=[now];
  if(tenant.move_out_date){ const d=new Date(tenant.move_out_date+'T00:00:00'); if(!isNaN(d.getTime())) caps.push(d); }
  if(tenant.lease_end){ const d=new Date(tenant.lease_end+'T00:00:00'); if(!isNaN(d.getTime())) caps.push(d); }
  const last=caps.reduce((a,b)=>b<a?b:a);
  return instalmentPeriods({
    startISO: tenant.lease_start,
    lastYear: last.getFullYear(), lastMonth: last.getMonth()+1,
    freq: tenant.payment_frequency, dueDay: rentDueDay,
  });
}

export type PayStatus='paid'|'overdue'|'pending';
export function payStatus(p:RentPayment):PayStatus {
  if(p.paid) return 'paid';
  if(p.due_date && p.due_date<todayISO()) return 'overdue';
  return 'pending';
}

// Ανθεκτική μετατροπή αριθμού από OCR (χειρίζεται «1.200,50», «€», κενά).
export const numify=(v:unknown):number|undefined=>{
  if(typeof v==='number') return isFinite(v)?v:undefined;
  if(typeof v!=='string') return undefined;
  const raw=v.replace(/[€\s]/g,'');
  if(!/\d/.test(raw)) return undefined;
  const clean=/,\d{1,2}$/.test(raw)?raw.replace(/\./g,'').replace(',','.'):raw.replace(/,/g,'');
  const n=parseFloat(clean.replace(/[^0-9.\-]/g,''));
  return isFinite(n)?n:undefined;
};


// Διεθνής μορφή αριθμού για wa.me/viber (προσθέτει 30 σε 10ψήφιο ελληνικό κινητό).
export const msgDigits=(p?:string|null)=>{const d=normalizePhone(p);return d.length===10?'30'+d:d;};

// ─── Blank form ────────────────────────────────────────────────────────────────
// 78 → 31 κλειδιά. Ό,τι έφυγε είναι γραμμένο στο σχόλιο του `Tenant` πιο πάνω.
export const blank=()=>({
  full_name:'',email:'',phone:'',profession:'',afm:'',
  id_doc_type:'' as IdDocType|'',id_doc_number:'',iban:'',notes:'',
  lease_type:'annual' as LeaseType,lease_category:'' as LeaseCategory|'',lease_start:'',lease_end:'',custom_lease_days:365,
  monthly_rent:'',payment_frequency:'monthly' as PaymentFreq,rent_due_day:'1',rent_iban:'',e_payment:true,
  furnishing:'' as Furnishing|'',
  deposit_amount:'',deposit_method:'',deposit_paid_on:'',deposit_returned:false,deposit_return_date:'',
  services:null as ServiceLine[]|null,
  parking_included:false,parking_extra:false,parking_extra_price:'',
  extra_perks:'',
  lease_doc_external_url:'',
});

/**
 * Έχει ο ενοικιαστής συμπληρωμένα «σπάνια» πεδία;
 * Το «Περισσότερα» είναι κλειστό εξ ορισμού, αλλά δεν κρύβει δεδομένα που ΥΠΑΡΧΟΥΝ:
 * σε επεξεργασία ανοίγει, ώστε κανείς να μη νομίσει ότι χάθηκε κάτι που είχε γράψει.
 */
export const hasMoreData = (f:ReturnType<typeof blank>):boolean => !!(
  f.email||f.profession||f.iban||f.id_doc_type||f.id_doc_number||f.notes||
  f.deposit_method||f.deposit_paid_on||f.deposit_returned||
  f.parking_included||f.parking_extra||f.extra_perks||
  f.payment_frequency!=='monthly'
);

/**
 * Πόσο διαφέρουν τα συγκρίσιμα μεταξύ τους και από το δικό μας.
 *
 * ΓΙΑΤΙ ΤΟΠΙΚΗ ΚΑΙ ΟΧΙ ΤΟ `varianceWarning` ΤΟΥ visibility.ts: εκείνο δεν
 * εξάγεται (είναι module-private) και δέχεται `PropertyLike` με sqm/έτος/ΤΚ —
 * σχήμα ακινήτου, όχι αγγελίας. Ίδιο κατώφλι 1,6× και ίδια λογική «προειδοποιούμε
 * αντί να κρύβουμε». Αν το `varianceWarning` γίνει export, αυτή η συνάρτηση φεύγει.
 */
export function compsVarianceWarning(sqms:number[], mySqm:number|null):string|null {
  const reasons:string[]=[];
  if(sqms.length>=2){
    const min=Math.min(...sqms), max=Math.max(...sqms);
    if(max/min>=1.6) reasons.push(`τα συγκρίσιμα έχουν μεγέθη από ${Math.round(min)} έως ${Math.round(max)} τ.μ.`);
  }
  if(mySqm&&sqms.length){
    const avg=sqms.reduce((a,n)=>a+n,0)/sqms.length;
    const ratio=Math.max(avg/mySqm, mySqm/avg);
    if(ratio>=1.6) reasons.push(`το ακίνητό σου είναι ${Math.round(mySqm)} τ.μ. ενώ ο μέσος όρος τους είναι ${Math.round(avg)} τ.μ.`);
  }
  if(!reasons.length) return null;
  return `Προσοχή στη σύγκριση: ${reasons.join(' και ')}. Η τιμή ανά τ.μ. δεν είναι γραμμική στο μέγεθος· έλεγξε τις αγγελίες πριν στείλεις πρόταση.`;
}
