'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import TabFinances  from './components/TabFinances';
import TabBoundary  from './components/TabBoundary';
import { STATUSES, readStatus, writeStatus, statusLabel as statusLabelOf, isShortTerm, isLet, type PropertyStatus } from '@/lib/property/status';
import { tabDecision, type OwnerContext, type LegalForm } from '@/lib/property/visibility';
import { HAS_BUSINESS } from '@/lib/accounting/dossier';
import AmaStrip from './components/AmaStrip';
import TabCalendar  from './components/TabCalendar';
import TabRentROI   from './components/TabRentROI';
import TabPricing   from './components/TabPricing';
import TabSettings  from './components/TabSettings';
import TabReferral  from './components/TabReferral';
import TabTenant    from './components/TabTenant';
import TabLoan      from './components/TabLoan';
import TabAccounting from './components/TabAccounting';
import TabInventory from './components/TabInventory';
import TabContacts  from './components/TabContacts';
import TabChecklist from './components/TabChecklist';
import TabDocuments from './components/TabDocuments';
import TabComparison from './components/TabComparison';
import TabPlan from './components/TabPlan';
import TabClients from './components/TabClients';
import PortfolioTab from './components/PortfolioTab';
import AddPropertyWizard from './components/AddPropertyWizard';
import DocumentScan from './components/DocumentScan';
import WelcomeOnboarding from './components/WelcomeOnboarding';
import { useAppPreferences } from './components/useAppPreferences';
import { CommandPalette, type CommandItem } from './components/CommandPalette';
import { T, SkeletonKPIs, Skeleton, Spinner, EmptyState, Btn, TierBadge, KPIGrid, SecHdr, type KPIItem } from '@/components/Theme';
import { Building2, Receipt, ListChecks, FileText } from 'lucide-react';
import { confirmDialog } from '@/components/ConfirmDialog';
import { notifyError } from '@/components/Toast';
import PropertyAssistant from './components/PropertyAssistant';
import MonthlyFeedbackNudge from './components/MonthlyFeedbackNudge';
import { resolveRent, resolveValue, computeYields, propertyDetailsComplete } from '@/lib/billing/propertyFacts';
import PaymentLinks from './components/PaymentLinks';
import { printPropertyStatement } from './components/statement';
import { useReportBranding } from '@/lib/reportBranding';
import { computeInsights } from '@/lib/insights/engine';
import { annuityMonthly } from '@/lib/loans/recommend';
import { LOAN_COLUMNS, toLoanViews, type LoanView } from '@/lib/loans/shape';
import { stayTotal } from '@/lib/clients/clients';
import { clearHistory as clearAssistantHistory } from './components/assistantPersona';
import { clearLocalPersonalData } from '@/lib/localPrivacy';
import { consolidateRentTax, taxShareOf, consolidationSummary, CONSOLIDATION_NOTE } from '@/lib/billing/consolidate';
import UpgradeModal from './components/UpgradeModal';
import FeatureLock, { LockBadge } from './components/FeatureLock';
import { PLANS } from '@/lib/billing/plans';
import { effectivePlan, isTabAllowed, isTabPurchasable, canAddProperty, planAtLeast, type EntitlementInput } from '@/lib/billing/entitlements';
import { isTabVisible, hiddenTabCount, reveal, sanitizeRevealed, coreTabs, CORE_TABS, type DisclosureSignals } from '@/lib/nav/disclosure';
import AthensNow from './components/AthensNow';
import CashHero from './components/CashHero';
import AgendaPanel from './components/AgendaPanel';
import { cashPosition } from '@/lib/home/cash';
import { buildAgenda, type SetupLike as SetupStep } from '@/lib/home/agenda';
import { computeObligations, type OblMaint } from './components/obligations';
import { taxProfileOf } from '@/lib/tax/greekTaxCalendar';
import PortalShare from './components/PortalShare';
import OccupancyPanel from './components/OccupancyPanel';
import BillingNudge from './components/BillingNudge';
import { athensToday } from '@/lib/core/time';

interface Property {
  id: string; user_id: string; name: string; prop_type: string | null;
  address: string | null; postal_code: string | null; sqm: number | null; ownership: string | null;
  value: number | null; obj_value: number | null; purchase_price: number | null;
  purchase_date: string | null; target_rent: number | null; enfia: number | null;
  insurance_amount: number | null; insurance_company: string | null;
  insurance_expiry: string | null; pea_class: string | null; year_built: number | null;
  atak: string | null; floor: number | string | null; heating: string | null;
  parking_spaces: number | null; storage_sqm: number | null; bedrooms: number | null;
  rental_mode: string | null; client_id: string | null; co_owners: string[] | null;
  notes: string | null; status_detail: string | null; created_at: string;
}
// ΤΑ ΠΕΔΙΑ ΠΟΥ ΛΕΙΠΑΝ. Οι δύο τύποι περιέγραφαν λιγότερα από όσα διαβάζει η
// οθόνη, οπότε κάθε χρήση των υπολοίπων περνούσε από `as any` — δεκατέσσερα
// σημεία, το καθένα μια θέση όπου ένα λάθος όνομα στήλης δεν θα το έπιανε
// τίποτα. Ό,τι ζητά το ερώτημα, δηλώνεται εδώ.
interface Expense  { id:string; amount:number; date:string; category:string; description:string;
                     paid?:boolean|null; expense_group?:string|null; payment_method?:string|null; }
interface Bill     { id:string; type:string; amount:number; avg_amount:number|null; paid:boolean;
                     due_date?:string|null; name?:string|null; }
interface Task     { id:string; title:string; due_date:string|null; priority:string; completed:boolean; }
interface Tenant   { monthly_rent:number|null; lease_end:string|null; }

// Κατάσταση ακινήτου: μία κλιμακωτή ράμπα από το μπλε της landing (var(--accent),
// #1a73e8) — 7 ομοιογενείς αποχρώσεις, από βαθύ προς ανοιχτό, στη λογική σειρά των
// καταστάσεων. Τυποποιημένο, μονοχρωματικό, premium (όχι φανάρι πολλών χρωμάτων).
// Οι ετικέτες και οι κανόνες της κατάστασης ζουν στο lib/property/status.ts.
// Υπήρχαν ΔΥΟ στήλες για το ίδιο πράγμα (status_detail και rental_mode) που
// μπορούσαν να διαφωνήσουν, και κάθε οθόνη έλυνε τη διαφωνία με δικό της κανόνα.
// Εδώ μένει μόνο η όψη: μία απόχρωση ανά κατάσταση.
const STATUS_COLORS: Record<PropertyStatus,string> = {
  rent_long: '#0b57d0',
  rent_short:'#1a73e8',
  vacant:    '#3385ec',
  own_use:   '#4d97ef',
  renovation:'#66a8f2',
  for_sale:  '#80baf6',
  disputed:  '#99cbf9',
};
const PROP_TYPE_LABELS: Record<string,string> = {
  apartment:'Διαμέρισμα', house:'Μονοκατοικία', studio:'Στούντιο',
  maisonette:'Μεζονέτα', office:'Γραφείο', shop:'Κατάστημα',
  warehouse:'Αποθήκη', land:'Οικόπεδο', parking:'Parking',
  storage:'Αποθήκη Κτιρίου', villa:'Βίλα', other:'Άλλο',
};
const PROP_TYPES = ['apartment','house','studio','maisonette','office','shop','warehouse','land','parking','storage','villa','other'];
const FLOOR_OPTS = ['Υπόγειο','Ημιυπόγειο','Ισόγειο','Υπερυψωμένο ισόγειο','Ημιώροφος','1ος','2ος','3ος','4ος','5ος','6ος','7ος και άνω','Δώμα / Ρετιρέ'];

const HEATING_LABELS: Record<string,string> = {
  central_gas:'Κεντρική (αέριο)', autonomous_gas:'Αυτόνομη (αέριο)', oil:'Πετρέλαιο',
  heat_pump:'Αντλία θερμότητας', electric:'Ηλεκτρική', pellet:'Pellet / Ξύλο',
  ac_only:'Κλιματιστικά', none:'Χωρίς θέρμανση', other:'Άλλο',
};

const NAV_ITEMS = [
  { id:'portfolio',  label:'Χαρτοφυλάκιο' },
  { id:'overview',   label:'Επισκόπηση' },
  { id:'calendar',   label:'Ημερολόγιο' },
  { id:'finances',   label:'Δαπάνες' },
  { id:'accounting', label:'Λογιστική' },
  { id:'loan',       label:'Δάνειο' },
  { id:'tenant',     label:'Ενοικιαστής' },
  { id:'clients',    label:'Πελάτης' },
  { id:'inventory',  label:'Έπιπλα / Εξοπλισμός' },
  { id:'documents',  label:'Αρχείο' },
  { id:'checklist',  label:'Εκκρεμότητες' },
  { id:'roi',        label:'Απόδοση' },
  { id:'referral',   label:'Πρόγραμμα Πρόσκλησης' },
  { id:'settings',   label:'Λογαριασμός' },
];
const NAV_LABEL: Record<string,string> = NAV_ITEMS.reduce((a,i)=>{a[i.id]=i.label;return a;},{} as Record<string,string>);

// Εικονίδια πλοήγησης, καθαρή, γρήγορη οπτική αναγνώριση (ακόμη κι από άπειρο μάτι).
const NAV_ICON: Record<string,string> = {
  portfolio: 'M4 5h6v6H4z|M14 5h6v6h-6z|M4 15h6v4H4z|M14 13h6v6h-6z',
  overview:  'M3 9.5 12 3l9 6.5|M5 10v10h14V10',
  comparison:'M4 20V10|M10 20V4|M16 20v-7|M20 20H2',
  bills:     'M5 3h14v18l-3-2-2 2-2-2-2 2-3-2V3|M9 8h6|M9 12h6',
  expenses:  'M3 12h4l3 8 4-16 3 8h4',
  finances:  'M3 12h4l3 8 4-16 3 8h4',
  accounting:'M4 3h16v18H4z|M8 7h8|M8 11h8|M8 15h5|M16 19l1.5 1.5L21 17',
  calendar:  'M3 5h18v16H3z|M3 9h18|M8 3v4|M16 3v4',
  tenant:    'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  plan:      'M5 21V4|M5 4h11l-2.5 3.5L16 11H5',

  roi:       'M3 17l6-6 4 4 8-8|M21 7v6h-6',
  pricing:   'M20 12V7H4v10h10|M4 11h16|M16 19l2 2 4-4',
  loan:      'M3 21h18|M5 21V10l7-5 7 5v11|M9 21v-6h6v6',
  inventory: 'M21 16V8l-9-5-9 5v8l9 5 9-5z|M3.3 7 12 12l8.7-5|M12 22V12',
  checklist: 'M9 11l3 3L22 4|M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  contacts:  'M4 4h16v16H4z|M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z|M6 16c0-2 4-2 4-2s4 0 4 2|M15 8h3|M15 12h3',
  documents: 'M4 4h6l2 3h8v13H4z',
  clients:   'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M9 11a4 4 0 0 0 0-8 4 4 0 0 0 0 8z|M23 21v-2a4 4 0 0 0-3-3.87|M16 3.13a4 4 0 0 1 0 7.75',
  settings:  'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 2h-5l-.3 2.6a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L3 11a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.3 2.4h5l.3-2.6a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6a7 7 0 0 0 .1-1z',
  referral:  'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M19 8v6|M22 11h-6',
};

// Ομαδοποιημένη πλοήγηση, λιγότερο «σουπερμάρκετ», πιο ξεκάθαρη λογική.
// Επαφές/Αρχείο/Εκκρεμότητες/Απογραφή ενσωματώθηκαν στην Επισκόπηση. Η Σύγκριση
// και οι Ρυθμίσεις μένουν αυτόνομες. Καμία ομάδα «Το ακίνητο»/«Σύστημα».
// Δομή πλοήγησης (ίδια για ιδιώτη/επαγγελματία· αλλάζει μόνο η κεφαλίδα «Ακίνητά
// μου» / «Χαρτοφυλάκιό μου» και το πότε ενεργοποιείται η «Σύγκριση ακινήτων»).
const NAV_GROUPS: { label: string; ids: string[] }[] = [
  // Το Χαρτοφυλάκιο ΕΛΕΙΠΕ εντελώς από το μενού. Αποδιδόταν μόνο όταν
  // nav==='portfolio', και κανένα κουμπί δεν έθετε ποτέ αυτή την τιμή: ο μόνος
  // δρόμος ήταν το ⌘K. Δηλαδή σε tablet ή κινητό ήταν απρόσιτο — ενώ το
  // PROFESSIONAL_CORE_TABS το δηλώνει βασική καρτέλα του επαγγελματία, μαζί με
  // τους Πελάτες που ΕΙΝΑΙ στο μενού. Η μεγάλη εικόνα του χαρτοφυλακίου μπαίνει
  // πρώτη, πριν από το Ημερολόγιο. Ο ιδιώτης δεν το βλέπει: δεν είναι βασικό
  // για το προφίλ του και δεν είναι καν αγοράσιμο, άρα τα φίλτρα το κόβουν.
  { label: '',                    ids: ['portfolio'] },
  { label: '',                    ids: ['calendar'] },
  { label: 'Οικονομικά',          ids: ['finances','accounting','loan'] },
  { label: 'Μίσθωση',             ids: ['tenant','clients'] },
  { label: 'Εργαλεία',            ids: ['inventory','documents','checklist'] },
  { label: '',                    ids: ['roi'] },
  { label: '',                    ids: ['referral'] },
  { label: '',                    ids: ['settings'] },
];

// Καρτέλες που ΔΕΝ περνούν από τη σταδιακή αποκάλυψη (lib/nav/disclosure.ts).
// Ο κανόνας τους είναι η ίδια η κατάσταση του ακινήτου, και η μηχανή ορατότητας τον
// ξέρει ήδη: όταν αυτή τις ανάβει, είναι ακριβώς αυτό που χρειάζεται ο χρήστης τώρα.
// Αν περνούσαν κι από την αποκάλυψη, ο ιδιοκτήτης ενός κενού ακινήτου δεν θα έβλεπε
// ποτέ το «Σχέδιο»: θα έπρεπε πρώτα να επισκεφθεί μια καρτέλα που δεν εμφανίζεται.
//
// Οι τρεις που προστέθηκαν είχαν ΤΟΝ ΙΔΙΟ κανόνα γραμμένο και στα δύο αρχεία:
// Τιμολόγηση (βραχυχρόνια), Αποδόσεις (εκμισθώνεται), Σύγκριση (δύο ακίνητα).
// Το αντίγραφο στην αποκάλυψη έφυγε — εδώ δηλώνεται ότι την απόφαση την παίρνει
// η κατάσταση. Η εμφάνιση δεν αλλάζει: οι δύο κανόνες έλεγαν το ίδιο πράγμα, και
// η πλοήγηση τους συνδύαζε ούτως ή άλλως με «και».
const SELF_DISCLOSING = new Set(['roi']);   // plan/pricing/comparison συγχωνεύτηκαν στην Απόδοση και στον Πελάτη

const ic = (d: string) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d.split('|').map((p,i)=><path key={i} d={p}/>)}</svg>;

// ── Κάτω μπάρα κινητού ────────────────────────────────────────────────────
// ΔΕΝ είναι χειρόγραφη λίστα. Παράγεται από τις CORE_TABS, δηλαδή από την ΙΔΙΑ
// δήλωση προτεραιότητας που χρησιμοποιεί και η σταδιακή αποκάλυψη.
//
// ΓΙΑΤΙ ΑΛΛΑΞΕ: η μπάρα είναι το πιο προσβάσιμο σημείο σε κινητό — τέσσερις
// προορισμοί σε ένα άγγιγμα, όλα τα υπόλοιπα δύο. Η χειρόγραφη λίστα έδινε
// θέση στο «Αρχείο», που δεν είναι καν βασική καρτέλα, ενώ έστελνε τη
// «Λογιστική» κάτω από το «Μενού» — την καρτέλα που ο ίδιος ο ορισμός των
// CORE_TABS περιγράφει ως «ο λόγος που έψαξε λύση». Η ιεράρχηση έλεγε ένα
// πράγμα και η οθόνη έκανε άλλο.
//
// Το «Αρχείο» δεν χάνεται: μένει ένα άγγιγμα πιο μακριά, και η ΚΑΤΑΓΡΑΦΗ
// εγγράφου — που είναι η πραγματική δουλειά στο κινητό — γίνεται ούτως ή άλλως
// από τη γρήγορη καταχώρηση με φωτογραφία και από τον βοηθό, όχι από εδώ.
//
// Παράγοντάς τη, τα ονόματα και τα εικονίδια δεν ξαναγράφονται: έρχονται από
// NAV_LABEL/NAV_ICON. Πριν, το ίδιο εικονίδιο υπήρχε δύο φορές στο αρχείο.
const BOTTOM_NAV = [
  ...CORE_TABS
    .filter(id => id !== 'settings')   // ο λογαριασμός ανήκει στο μενού, όχι στη μπάρα
    .slice(0, 4)
    .map(id => ({ id, label: NAV_LABEL[id], icon: ic(NAV_ICON[id]) })),
  { id:'more', label:'Μενού', icon: ic('M4 6h16|M4 12h16|M4 18h16') },
];

const fmt = (n:number|null|undefined, decimals=0) =>
  n == null ? '—' : n.toLocaleString('el-GR', { minimumFractionDigits:decimals, maximumFractionDigits:decimals });
const fmtEur = (n:number|null|undefined) => n == null ? '—' : `${fmt(n)} €`;

// MD3 form styles
const mdInput: React.CSSProperties = {
  width:'100%', padding:'10px 16px', height:T.h.lg, borderRadius:6,
  border:'1px solid var(--border-default)', background:'var(--bg-surface)',
  color:'var(--text-primary)', fontSize:14, fontFamily: T.font.sans,
  letterSpacing:'0.25px', outline:'none', boxSizing:'border-box', transition:'border-color 0.15s',
};
const mdLabel: React.CSSProperties = {
  display:'block', fontFamily: T.font.sans, fontSize:12, fontWeight:500,
  letterSpacing:'0.5px', textTransform:'uppercase', color:'var(--text-secondary)', marginBottom:6,
};
const focusInput = (e: React.FocusEvent<HTMLInputElement|HTMLSelectElement>) => {
  e.target.style.borderColor = 'var(--accent)'; e.target.style.borderWidth = '2px'; e.target.style.padding = '9px 15px';
};
const blurInput = (e: React.FocusEvent<HTMLInputElement|HTMLSelectElement>) => {
  e.target.style.borderColor = 'var(--border-default)'; e.target.style.borderWidth = '1px'; e.target.style.padding = '10px 16px';
};

// Alert hooks
function useInventoryAlerts(propertyId: string | null, userId: string | null) {
  const [alertCount, setAlertCount] = useState(0);
  const supabase = createClient();
  useEffect(() => {
    if (!propertyId || !userId) return;
    const check = async () => {
      const { data: items } = await supabase.from('inventory_items').select('warranty_expiry, condition, purchase_date').eq('property_id', propertyId);
      const { data: schedules } = await supabase.from('inventory_maintenance').select('next_due').eq('property_id', propertyId);
      if (!items) return;
      let count = 0; const now = Date.now();
      items.forEach(item => {
        if (item.condition === 'Κακή' || item.condition === 'Εκτός Λειτουργίας') count++;
        if (item.warranty_expiry) { const days = Math.ceil((new Date(item.warranty_expiry).getTime() - now) / 86400000); if (days >= 0 && days <= 90) count++; }
        if (item.purchase_date) { const years = (now - new Date(item.purchase_date).getTime()) / (1000*60*60*24*365); if (years >= 10) count++; }
      });
      (schedules||[]).forEach(s => { const days = Math.ceil((new Date(s.next_due).getTime() - now) / 86400000); if (days < 0) count++; });
      setAlertCount(count);
    };
    check();
  }, [propertyId]);
  return alertCount;
}

function useChecklistAlerts(propertyId: string | null) {
  const [alertCount, setAlertCount] = useState(0);
  const supabase = createClient();
  useEffect(() => {
    if (!propertyId) return;
    const check = async () => {
      const { data } = await supabase.from('checklist_items').select('due_date, status, priority').eq('property_id', propertyId).neq('status', 'done').neq('status', 'skipped');
      if (!data) return;
      const now = new Date(); let count = 0;
      data.forEach(item => {
        if (item.due_date && new Date(item.due_date) < now) count++;
        else if (item.priority === 'critical' && item.status === 'pending') count++;
      });
      setAlertCount(count);
    };
    check();
  }, [propertyId]);
  return alertCount;
}

// Copy Inventory Modal
function CopyInventoryModal({properties, currentPropertyId, userId, onClose, onCopied}: {
  properties: Property[]; currentPropertyId: string; userId: string; onClose: ()=>void; onCopied: ()=>void;
}) {
  const supabase = createClient();
  const [sourceId, setSourceId] = useState('');
  const [copying, setCopying] = useState(false);
  const [preview, setPreview] = useState<{name:string;category:string}[]>([]);
  const otherProperties = properties.filter(p => p.id !== currentPropertyId);
  useEffect(() => {
    if (!sourceId) { setPreview([]); return; }
    supabase.from('inventory_items').select('name,category').eq('property_id', sourceId).limit(5).then(({data})=>setPreview(data||[]));
  }, [sourceId]);
  const handleCopy = async () => {
    if (!sourceId) return; setCopying(true);
    const { data: sourceItems } = await supabase.from('inventory_items').select('*').eq('property_id', sourceId);
    if (sourceItems?.length) {
      const newItems = sourceItems.map(item => ({ ...item, id: undefined, property_id: currentPropertyId, user_id: userId, created_at: undefined, updated_at: undefined }));
      await supabase.from('inventory_items').insert(newItems);
    }
    setCopying(false); onCopied();
  };
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.32)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{background:'var(--bg-surface)',borderRadius:14,padding:24,width:'100%',maxWidth:480,display:'flex',flexDirection:'column',gap:16,boxShadow:'var(--shadow-xl)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <p style={{fontFamily: T.font.sans,fontSize:20,fontWeight:700,color:'var(--text-primary)',marginBottom:4}}>Αντιγραφή Απογραφής</p>
            <p style={{fontFamily: T.font.sans,fontSize:14,color:'var(--text-secondary)',letterSpacing:'0.25px'}}>Χρησιμοποίησε απογραφή άλλου ακινήτου ως βάση</p>
          </div>
          <button onClick={onClose} style={{width:40,height:T.h.lg,borderRadius:18,border:'none',background:'transparent',cursor:'pointer',color:'var(--text-secondary)',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center'}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        </div>
        {otherProperties.length === 0 ? (
          /* Το κενό <p style={{fontSize:32}}> ήταν νεκρή υποδοχή εικονιδίου: το primitive
             δεν δεχόταν icon, οπότε κάποιος άφησε τη θέση του και δεν την γέμισε ποτέ. */
          <EmptyState icon={<Building2 size={20}/>} title="Δεν υπάρχουν άλλα ακίνητα" hint="Η αντιγραφή απογραφής χρειάζεται δεύτερο ακίνητο ως πηγή." />
        ) : (
          <>
            <div>
              <p style={mdLabel}>Πηγή Απογραφής</p>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {otherProperties.map(p => (
                  <div key={p.id} onClick={()=>setSourceId(p.id)} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',borderRadius:12,border:`1px solid ${sourceId===p.id?'var(--accent)':'var(--border-default)'}`,background:sourceId===p.id?'var(--accent-dim)':'transparent',cursor:'pointer',transition:'all 0.2s'}}>
                    <div style={{width:8,height:8,borderRadius:'50%',background:STATUS_COLORS[readStatus(p)],flexShrink:0}}/>
                    <div>
                      <p style={{fontFamily: T.font.sans,fontSize:14,fontWeight:500,color:'var(--text-primary)'}}>{p.name}</p>
                      <p style={{fontFamily: T.font.sans,fontSize:12,color:'var(--text-secondary)'}}>{PROP_TYPE_LABELS[p.prop_type||'']||p.prop_type}{p.address?` · ${p.address}`:''}</p>
                    </div>
                    {sourceId===p.id&&<span style={{marginLeft:'auto',display:'inline-flex',color:'var(--accent)'}}><svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>}
                  </div>
                ))}
              </div>
            </div>
            {preview.length > 0 && (
              <div style={{padding:'12px 16px',background:'var(--bg-elevated)',borderRadius:12}}>
                <p style={{...mdLabel,marginBottom:8}}>Προεπισκόπηση ({preview.length}+ αντικείμενα)</p>
                {preview.map((item,i)=><div key={i} style={{display:'flex',justifyContent:'space-between',fontFamily: T.font.sans,fontSize:13,color:'var(--text-secondary)',marginBottom:4}}><span>{item.name}</span><span style={{color:'var(--text-tertiary)'}}>{item.category}</span></div>)}
              </div>
            )}
            <div style={{padding:'12px 16px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:12}}>
              <p style={{fontFamily: T.font.sans,fontSize:13,color:'var(--text-secondary)'}}>Τα αντικείμενα θα αντιγραφούν χωρίς ιστορικά επισκευών.</p>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={onClose} style={{height:T.h.lg,padding:'0 24px',borderRadius:18,border:'none',background:'transparent',color:'var(--accent)',fontFamily: T.font.sans,fontSize:14,fontWeight:500,cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.background='var(--accent-dim)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>Ακύρωση</button>
              <button onClick={handleCopy} disabled={!sourceId||copying} style={{height:T.h.lg,padding:'0 24px',borderRadius:18,border:'none',background:!sourceId||copying?'var(--bg-overlay)':'var(--accent)',color:!sourceId||copying?'var(--text-tertiary)':'var(--accent-text)',fontFamily: T.font.sans,fontSize:14,fontWeight:500,cursor:!sourceId||copying?'not-allowed':'pointer'}}>{copying?'Αντιγραφή…':'Αντιγραφή'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Overview Tab
// Ο ΚΑΝΟΝΑΣ ΔΕΝ ΚΡΕΜΕΤΑΙ ΠΛΕΟΝ ΑΠΟ ΤΗ ΔΙΑΤΥΠΩΣΗ ΤΗΣ ΕΤΙΚΕΤΑΣ.
// Ήταν `new Set(['Μηνιαίο Ενοίκιο', …])` και το φίλτρο έψαχνε το κείμενο που
// βλέπει ο χρήστης. Μια αλλαγή κεφαλαίου —«Μηνιαίο ενοίκιο»— και τα πλακίδια
// απόδοσης θα ξαναεμφανίζονταν σιωπηλά σε κενό ακίνητο, με ποσοστά βγαλμένα
// από ενοίκιο-στόχο που δεν εισπράχθηκε ποτέ. Κανένα τεστ δεν θα το έπιανε,
// γιατί τίποτα δεν θα είχε «σπάσει». Τώρα η σήμανση είναι δεδομένο του
// πλακιδίου (`incomeOnly`), όχι σύμπτωση κειμένου.
type OverviewKPI = KPIItem & { incomeOnly?: boolean };
// Οι καταστάσεις όπου το «Σχέδιο» είναι η ΚΥΡΙΑ δουλειά του ιδιοκτήτη — και οι
// μόνες όπου εμφανίζεται. Σε μισθωμένο ακίνητο δεν υπάρχει σχέδιο να φτιαχτεί:
// υπάρχει ενοίκιο να εισπραχθεί.
const PLAN_STATUSES = new Set(['vacant', 'for_sale', 'renovation', 'disputed']);
const PLAN_SUB: Record<string, string> = {
  vacant:     'Κενό — πώς θα μισθωθεί ή θα αξιοποιηθεί',
  for_sale:   'Προς πώληση — τιμή, χρονισμός, φόρος υπεραξίας',
  renovation: 'Σε ανακαίνιση — κόστος, χρονοδιάγραμμα, επιδοτήσεις',
  disputed:   'Νομική εκκρεμότητα — βήματα και προθεσμίες',
};


function OverviewTab({ prop, properties, userId, ownerName, onSaveOwnerName, onNavigate, onCleanDemo, profileType, tabVisible }: { prop: Property;
  /** ΟΛΑ τα ακίνητα του χρήστη — χρειάζονται για τον φόρο: η κλίμακα των ενοικίων
   *  είναι προοδευτική στο σύνολο του φορολογούμενου, όχι ανά ακίνητο. */
  properties: Property[];
  userId: string; ownerName?: string; onSaveOwnerName?: (n: string) => void | Promise<void>; onNavigate: (tab: string) => void; onCleanDemo?: () => void; profileType: 'individual'|'professional';
  /** Οδηγεί κάπου αυτό το βήμα; Βήμα που δείχνει σε καρτέλα η οποία δεν αφορά τον
   *  χρήστη είναι νεκρός σύνδεσμος: το πάτημα θα τον γύριζε στην Επισκόπηση. */
  tabVisible: (id: string) => boolean }) {
  const isDemo = (prop.name || '').startsWith('Demo —');
  const supabase = createClient();
  const branding = useReportBranding(userId);
  const { prefs } = useAppPreferences(prop.id);
  const now = new Date(); const year = now.getFullYear(); const month = now.getMonth() + 1;
  const [selMonth, setSelMonth] = useState(now.getMonth()); // 0-indexed, επιλεγμένος μήνας στο γράφημα δαπανών
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allExpenses, setAllExpenses] = useState<{ amount:number; date:string; category:string; is_recurring?:boolean; recurring_frequency?:string|null }[]>([]);
  const [chartYear, setChartYear] = useState(now.getFullYear()); // έτος γραφήματος δαπανών (προηγ./επόμενο)
  const [yearMenu, setYearMenu] = useState(false);
  const [bills, setBills] = useState<Bill[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [chk, setChk] = useState<{ due_date:string|null; status:string; priority:string }[]>([]);
  const [inv, setInv] = useState<{ name?:string|null; warranty_expiry:string|null; condition:string|null }[]>([]);
  // Οι στήλες `amount`/`rate` ΔΕΝ υπάρχουν στη βάση — υπολογίζονται από το
  // lib/loans/shape.ts. Ο τύπος εδώ περιγράφει ό,τι βλέπει η οθόνη, όχι ό,τι
  // επιστρέφει το ερώτημα.
  const [loans, setLoans] = useState<LoanView[]>([]);
  const [hostStays, setHostStays] = useState<{ check_in:string|null; check_out:string|null; total:number|null; nights:number|null; nightly_rate:number|null }[]>([]);
  const [contactCount, setContactCount] = useState(0);   // πλήθος επαφών (για το πλακίδιο-σύνοψη)
  const [docCount, setDocCount] = useState(0);           // πλήθος εγγράφων στο αρχείο
  // Το ΤΑΜΕΙΟ: περίοδοι ενοικίου και συντηρήσεις εξοπλισμού. Διαβάζονται ΕΔΩ και
  // όχι σε δικό τους panel, γιατί τροφοδοτούν την ΕΝΙΑΙΑ λίστα «τι χρειάζεται
  // τώρα» — αν κάθε κάρτα διάβαζε τα δικά της, θα ξαναγεννιόνταν τα διπλότυπα.
  const [rentPeriods, setRentPeriods] = useState<{ amount:number|null; due_date:string|null; paid:boolean|null; period_year:number|null; period_month:number|null }[]>([]);
  const [maint, setMaint] = useState<OblMaint[]>([]);
  const [tenantFull, setTenantFull] = useState<{ id?:string; lease_start:string|null; lease_end:string|null } | null>(null);
  // Ενοίκια ΟΛΩΝ των ακινήτων (μισθωτήρια + ρυθμίσεις ενοικίου), για τον
  // προοδευτικό φόρο σε επίπεδο φορολογούμενου.
  const [portfolioRents, setPortfolioRents] = useState<{ property_id:string; monthly:number }[]>([]);
  const [loading, setLoading] = useState(true);

  const propIds = useMemo(() => properties.map(p => p.id), [properties]);

  const load = useCallback(async () => {
    const [{ data:exp },{ data:bil },{ data:tsk },{ data:ten },{ data:ci },{ data:iv },{ data:ln },{ data:hs },{ data:allExp },{ count:cCount },{ count:dCount },{ data:allTen },{ data:allRc },{ data:rp },{ data:mnt }] = await Promise.all([
      supabase.from('expenses').select('*').eq('property_id',prop.id).eq('user_id',userId).gte('date',`${year}-01-01`),
      supabase.from('bills').select('*').eq('property_id',prop.id).eq('user_id',userId),
      supabase.from('maintenance_tasks').select('*').eq('property_id',prop.id).eq('user_id',userId).eq('completed',false).order('due_date').limit(5),
      supabase.from('tenants').select('id,monthly_rent,lease_start,lease_end').eq('property_id',prop.id).eq('user_id',userId).order('updated_at',{ascending:false}).limit(1),
      supabase.from('checklist_items').select('due_date,status,priority').eq('property_id',prop.id).neq('status','done').neq('status','skipped'),
      supabase.from('inventory_items').select('name,warranty_expiry,condition').eq('property_id',prop.id),
      supabase.from('loans').select(LOAN_COLUMNS).eq('property_id',prop.id).eq('user_id',userId),
      supabase.from('client_stays').select('check_in,check_out,total,nights,nightly_rate').eq('property_id',prop.id).eq('user_id',userId),
      // Χωριστά: ΟΛΕΣ οι δαπάνες (κάθε έτους) για το γράφημα με επιλογή έτους.
      // Οι επαναλαμβανόμενες (πάγιες) προβάλλονται στους επόμενους μήνες/έτη.
      supabase.from('expenses').select('amount,date,category,is_recurring,recurring_frequency').eq('property_id',prop.id).eq('user_id',userId),
      // Μόνο πλήθη (head) για τα πλακίδια-σύνοψη Επαφές / Αρχείο.
      supabase.from('contacts').select('id',{count:'exact',head:true}).eq('property_id',prop.id),
      supabase.from('property_documents').select('id',{count:'exact',head:true}).eq('property_id',prop.id),
      // ΟΛΟ το χαρτοφυλάκιο: ο φόρος ενοικίων είναι προοδευτικός στο ΣΥΝΟΛΟ (Ε1),
      // οπότε δεν αρκούν τα δεδομένα του επιλεγμένου ακινήτου. Ίδια σειρά
      // προτεραιότητας με το resolveRent: μισθωτήριο → actual → target → ακίνητο.
      supabase.from('tenants').select('monthly_rent,property_id').in('property_id',propIds).eq('user_id',userId),
      supabase.from('rent_config').select('property_id,actual_rent,target_rent').in('property_id',propIds).eq('user_id',userId),
      // ΤΟ ΤΑΜΕΙΟ. Μόνο οι ΑΠΛΗΡΩΤΕΣ περίοδοι — οι πληρωμένες είναι ιστορικό και
      // ζουν στον Ενοικιαστή. Ό,τι δεν εμφανίζεται, δεν κατεβαίνει.
      supabase.from('rent_payments').select('amount,due_date,paid,period_year,period_month').eq('property_id',prop.id).eq('user_id',userId).eq('paid',false),
      supabase.from('inventory_maintenance').select('task,item_name,next_due,est_cost').eq('property_id',prop.id),
    ]);
    setExpenses(exp||[]); setBills(bil||[]); setTasks(tsk||[]); setTenant(ten?.[0]||null);
    setRentPeriods(rp||[]); setMaint((mnt||[]) as OblMaint[]); setTenantFull(ten?.[0]||null);
    setChk(ci||[]); setInv(iv||[]); setLoans(toLoanViews(ln)); setHostStays(hs||[]); setAllExpenses(allExp||[]);
    setContactCount(cCount||0); setDocCount(dCount||0);
    const rcById = new Map((allRc||[]).map((r:any)=>[r.property_id, r]));
    const tenById = new Map<string,number>();
    (allTen||[]).forEach((t:any)=>{ const v = Number(t.monthly_rent)||0; if (v > (tenById.get(t.property_id)||0)) tenById.set(t.property_id, v); });
    setPortfolioRents(properties.map(p => {
      const rc:any = rcById.get(p.id);
      const monthly = tenById.get(p.id) || Number(rc?.actual_rent) || Number(rc?.target_rent) || Number(p.target_rent) || 0;
      return { property_id: p.id, monthly };
    }));
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prop.id, userId, year, propIds]);

  useEffect(() => {
    setLoading(true); load();
    // Real-time: κάθε αλλαγή σε άλλα tabs ενημερώνει ζωντανά την Επισκόπηση
    const ch = supabase.channel(`overview_${prop.id}`)
      .on('postgres_changes', { event:'*', schema:'public', table:'bills',             filter:`property_id=eq.${prop.id}` }, () => load())
      .on('postgres_changes', { event:'*', schema:'public', table:'expenses',          filter:`property_id=eq.${prop.id}` }, () => load())
      .on('postgres_changes', { event:'*', schema:'public', table:'tenants',           filter:`property_id=eq.${prop.id}` }, () => load())
      .on('postgres_changes', { event:'*', schema:'public', table:'maintenance_tasks', filter:`property_id=eq.${prop.id}` }, () => load())
      .on('postgres_changes', { event:'*', schema:'public', table:'checklist_items',   filter:`property_id=eq.${prop.id}` }, () => load())
      .on('postgres_changes', { event:'*', schema:'public', table:'loans',             filter:`property_id=eq.${prop.id}` }, () => load())
      .on('postgres_changes', { event:'*', schema:'public', table:'client_stays',       filter:`property_id=eq.${prop.id}` }, () => load())
      .on('postgres_changes', { event:'*', schema:'public', table:'inventory_items',     filter:`property_id=eq.${prop.id}` }, () => load())
      .on('postgres_changes', { event:'*', schema:'public', table:'contacts',            filter:`property_id=eq.${prop.id}` }, () => load())
      .on('postgres_changes', { event:'*', schema:'public', table:'property_documents',  filter:`property_id=eq.${prop.id}` }, () => load())
      .on('postgres_changes', { event:'*', schema:'public', table:'rent_payments',        filter:`property_id=eq.${prop.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prop.id, load]);

  const totalExpYTD = expenses.reduce((s,e)=>s+e.amount,0);
  // ΤΑΣΗ ΔΑΠΑΝΩΝ: ΙΔΙΟ ΔΙΑΣΤΗΜΑ, ΟΧΙ ΟΛΟΚΛΗΡΟ ΤΟ ΠΡΟΗΓΟΥΜΕΝΟ ΕΤΟΣ.
  // Πριν, το YTD (π.χ. δύο μήνες) συγκρινόταν με τους δώδεκα μήνες της περσινής
  // χρονιάς, οπότε κάθε Φεβρουάριο ο χρήστης διάβαζε «−78% σε σχέση με πέρσι» —
  // αριθμός που δεν έλεγε τίποτα για τη συμπεριφορά του, μόνο ότι ο χρόνος μόλις
  // ξεκίνησε. Τώρα συγκρίνονται Ιαν–τρέχων μήνας με Ιαν–ίδιο μήνα πέρσι.
  const monthOf = (d: string) => new Date(d).getMonth() + 1;
  const expThisY = allExpenses.filter(e => new Date(e.date).getFullYear() === year).reduce((s,e)=>s+e.amount,0);
  const expPrevSame = allExpenses.filter(e => new Date(e.date).getFullYear() === year-1 && monthOf(e.date) <= month).reduce((s,e)=>s+e.amount,0);
  const expDeltaPct = expPrevSame > 0 ? Math.round((expThisY - expPrevSame)/expPrevSame*100) : null;
  // Διαχωρισμός πληρωμένων/εκκρεμών: το σύνολο (accrual) οδηγεί την απόδοση, αλλά
  // δείχνουμε ξεχωριστά τι έχει πληρωθεί και τι εκκρεμεί (π.χ. σαρωμένοι λογαριασμοί).
  const paidExpYTD = expenses.filter(e => e.paid !== false).reduce((s,e)=>s+e.amount,0);
  const pendingExpYTD = totalExpYTD - paidExpYTD;
  // Single source of truth: ίδιος υπολογισμός ενοικίου/αξίας/απόδοσης παντού.
  const rent = resolveRent({ tenantRent: tenant?.monthly_rent, targetRent: prop.target_rent }).value;
  const propValue = resolveValue(prop.value, prop.obj_value).value;
  const { annualRent, grossYield, netYield } = computeYields(rent, propValue, totalExpYTD);
  const daysToExpiry = tenant?.lease_end ? Math.ceil((new Date(tenant.lease_end).getTime()-Date.now())/86400000) : null;
  // Δάνεια: εκτιμώμενη μηνιαία δόση και δείκτης δανείου προς αξία (η Επισκόπηση «ξέρει» πλέον τα δάνεια).
  const monthlyDebt = loans.reduce((s,l)=>s+annuityMonthly(l.amount||0,l.rate||0,l.years||0),0);
  const totalDebt = loans.reduce((s,l)=>s+(l.amount||0),0);
  const debtLtv = propValue>0 && totalDebt>0 ? (totalDebt/propValue)*100 : 0;
  // Έσοδα φιλοξενίας από το Πελατολόγιο (διαμονές συνδεδεμένες σε αυτό το ακίνητο): η
  // Επισκόπηση «ξέρει» πλέον τα πραγματικά έσοδα βραχυχρόνιας, όχι μόνο τον στόχο ενοικίου.
  const todayIso = athensToday();
  const hostingYTD = hostStays.filter(s=>((s.check_in||s.check_out||'').slice(0,4))===String(year)).reduce((sum,s)=>sum+stayTotal(s),0);
  const hostingNights = hostStays.filter(s=>((s.check_in||s.check_out||'').slice(0,4))===String(year)).reduce((sum,s)=>sum+(s.nights ?? 0),0);
  const nextArrival = hostStays.map(s=>s.check_in).filter((d): d is string => !!d && d>=todayIso).sort()[0] || null;
  const MONTHS = ['Ιαν','Φεβ','Μαρ','Απρ','Μαϊ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
  const MONTHS_LONG = ['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος','Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος'];
  // Γράφημα: δαπάνες του ΕΠΙΛΕΓΜΕΝΟΥ έτους (chartYear). Οι μη επαναλαμβανόμενες
  // μετρούν στον μήνα της ημερομηνίας τους· οι επαναλαμβανόμενες (πάγιες, μόνο
  // εφόσον ο χρήστης τις έχει σημάνει) προβάλλονται από την έναρξή τους και μετά,
  // ανάλογα με τη συχνότητα. Καμία εφεύρεση, μόνο ό,τι έχει καταχωρήσει ο χρήστης.
  const occMonths = (e: { date:string; is_recurring?:boolean; recurring_frequency?:string|null }, y: number): number[] => {
    const d = new Date(e.date); const sy = d.getFullYear(); const sm = d.getMonth();
    if (!e.is_recurring) return sy === y ? [sm] : [];
    if (y < sy) return [];
    const step = e.recurring_frequency === 'annual' ? 12 : e.recurring_frequency === 'biannual' ? 6 : e.recurring_frequency === 'quarterly' ? 3 : 1;
    const out: number[] = [];
    for (let m = 0; m < 12; m++) { const abs = (y - sy) * 12 + m - sm; if (abs >= 0 && abs % step === 0) out.push(m); }
    return out;
  };
  const monthlyExp = Array(12).fill(0);
  allExpenses.forEach(e => { occMonths(e, chartYear).forEach(m => { monthlyExp[m] += e.amount; }); });
  const maxExp = Math.max(...monthlyExp, 1);
  // Κατηγορίες τρέχοντος έτους (για την αναφορά PDF)
  const catMap: Record<string,number> = {};
  expenses.forEach(e => { catMap[e.category] = (catMap[e.category]||0) + e.amount; });
  const catEntries = Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
  // Κατηγορίες για τον επιλεγμένο μήνα του chartYear (πίνακας δεξιά από το γράφημα)
  const selCatMap: Record<string,number> = {};
  allExpenses.forEach(e => { if (occMonths(e, chartYear).includes(selMonth)) selCatMap[e.category] = (selCatMap[e.category]||0) + e.amount; });
  const selCatEntries = Object.entries(selCatMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const selMonthTotal = monthlyExp[selMonth] || 0;
  // Έτη για το dropdown: όσα έχουν δαπάνες + προηγούμενο/τρέχον/επόμενο, φθίνουσα.
  const chartYears = Array.from(new Set<number>([
    ...allExpenses.map(e => new Date(e.date).getFullYear()),
    now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1,
  ])).sort((a,b) => b - a);

  // ── ΕΤΗΣΙΑ ΠΡΟΒΟΛΗ ΔΑΠΑΝΩΝ: ΧΩΡΙΣ ΕΤΗΣΙΟΠΟΙΗΣΗ ΤΩΝ ΕΦΑΠΑΞ ─────────────────
  // Πριν: `totalExpYTD / μήνας × 12`. Ο ΕΝΦΙΑ ή το συμβόλαιο που πληρώθηκε τον
  // Ιανουάριο πολλαπλασιαζόταν ×12, οπότε το «Καθαρό Αποτέλεσμα» έβγαινε βαθιά
  // αρνητικό έντεκα από τους δώδεκα μήνες — και ο χρήστης το διάβασε ως ζημιά.
  // Τώρα: κάθε δαπάνη μετριέται όσες φορές πραγματικά συμβαίνει μέσα στο έτος.
  // Οι εφάπαξ μία φορά, οι πάγιες (όπως τις σήμανε ο χρήστης) όσες φορές
  // επαναλαμβάνονται. Ίδια συνάρτηση occMonths με το γράφημα, ώστε το πλακίδιο
  // και οι μπάρες να λένε το ίδιο πράγμα.
  const projectedExpYear = allExpenses.reduce((s,e) => s + e.amount * occMonths(e, year).length, 0);
  const recurringCount = allExpenses.filter(e => e.is_recurring && occMonths(e, year).length > 0).length;

  // ── Σύνοψη εκκρεμοτήτων για τα πλακίδια ────────────────────────────────────
  // ΑΦΑΙΡΕΘΗΚΕ ο πίνακας `alerts`: 25 γραμμές που κατασκεύαζαν επτά ειδοποιήσεις
  // από τη βάση (λογαριασμοί, εργασίες, checklist, εγγυήσεις, κατάσταση
  // εξοπλισμού) και ΔΕΝ αποδίδονταν πουθενά. Τη δουλειά της «τι χρειάζεται τώρα»
  // την κάνει το InsightsBoard (computeInsights) και το ObligationsPanel· αυτός
  // ο πίνακας ήταν τρίτη, αόρατη μηχανή που πλήρωνε ερωτήματα χωρίς αποδέκτη.
  // Μένουν μόνο τα μεγέθη που εμφανίζονται πραγματικά στα πλακίδια.
  const daysUntil = (d: string | null | undefined) => d ? Math.ceil((new Date(d).getTime() - now.getTime()) / 86400000) : null;
  const chkOverdue  = chk.filter(c => { const x = daysUntil(c.due_date); return x != null && x < 0; });
  const chkCritical = chk.filter(c => c.priority === 'critical' && c.status === 'pending');
  const warrantySoon = inv.filter(i => { const x = daysUntil(i.warranty_expiry); return x != null && x >= 0 && x <= 90; });
  const openChk = chk.length;
  const chkAttention = new Set([...chkOverdue, ...chkCritical]).size;

  // ── ΦΟΡΟΣ: ΕΝΑΣ ΦΟΡΟΛΟΓΟΥΜΕΝΟΣ, ΟΧΙ ΤΡΕΙΣ ────────────────────────────────
  // Πριν: rentalIncomeTax(annualRent) ανά ακίνητο. Ο ιδιοκτήτης τριών
  // διαμερισμάτων με 8.000 € έκαστο έβλεπε 3 × 1.140 € = 3.420 € αντί για τον
  // πραγματικό φόρο των 24.000 € (4.500 €) — υποεκτίμηση 1.080 €, με τίτλο
  // «Εκτιμώμενος Φόρος». Τώρα ο φόρος υπολογίζεται μία φορά στο σύνολο του
  // χαρτοφυλακίου και εμφανίζεται το μερίδιο αυτού του ακινήτου, με την εξήγηση
  // από κάτω. Το ενοίκιο του τρέχοντος ακινήτου έρχεται από το resolveRent, ώστε
  // ο φόρος να πατά πάνω στον ίδιο αριθμό που δείχνει το πλακίδιο.
  const portfolioTax = useMemo(() => consolidateRentTax(
    properties.map(p => {
      const monthly = p.id === prop.id ? rent : (portfolioRents.find(r => r.property_id === p.id)?.monthly ?? 0);
      return { id: p.id, annualRent: monthly * 12, shortTerm: isShortTerm(p) };
    }),
  ), [properties, portfolioRents, prop.id, rent]);
  const estTax = Math.round(taxShareOf(portfolioTax, prop.id));
  const taxNote = consolidationSummary(portfolioTax, fmtEur);

  // ── ΤΟ ΤΑΜΕΙΟ ─────────────────────────────────────────────────────────────
  // Τι μου χρωστάνε (ληξιπρόθεσμες περίοδοι ενοικίου) και τι χρωστάω (απλήρωτοι
  // λογαριασμοί και δαπάνες). Η ΜΟΝΗ πηγή για τα «Εκκρεμείς δαπάνες», που πριν
  // ήταν χωριστό πλακίδιο πιο κάτω στην ίδια οθόνη.
  const cash = useMemo(() => cashPosition({
    rent: rentPeriods,
    bills: bills.map(b => ({ amount:b.amount, due:b.due_date ?? null, paid:b.paid ?? null, label:b.name || b.type || 'Λογαριασμός' })),
    expenses: expenses.map(e => ({ amount:e.amount, due:e.date, paid:e.paid ?? null, label:e.description || e.category || 'Δαπάνη' })),
    today: todayIso,
  }), [rentPeriods, bills, expenses, todayIso]);

  // ── Έξυπνα insights: ο «σύμβουλος» διαβάζει τα δεδομένα και προτεραιοποιεί ──
  const insights = computeInsights({
    now: now.getTime(),
    property: prop, tenant, rent, propValue, grossYield, netYield,
    expensesYTD: totalExpYTD,
    expenses,
    bills: bills.map(b => ({ type:b.type, amount:b.amount, paid:b.paid, due_date:b.due_date })),
    tasks: tasks.map(t => ({ due_date: t.due_date })),
    checklist: chk,
    inventory: inv,
    loanPayment: 0,
  });

  // ── ΤΑ ΒΗΜΑΤΑ ΡΥΘΜΙΣΗΣ ────────────────────────────────────────────────────
  // Η ΒΑΡΥΤΗΤΑ ΔΕΝ ΕΙΝΑΙ ΓΝΩΜΗ: είναι πόσα ΑΛΛΑ ξεκλειδώνει το βήμα. Χωρίς αξία
  // και ενοίκιο δεν υπάρχει καμία απόδοση, κανένας φόρος και καμία σύγκριση —
  // γι' αυτό 10. Η απογραφή βελτιώνει τις αποσβέσεις και τίποτα άλλο — γι' αυτό 2.
  const setupSteps: SetupStep[] = ([
    { key:'details', weight:10, label:'Συμπλήρωσε αξία & ενοίκιο', hint:'Εμπορική ή αντικειμενική αξία και μηνιαίο ενοίκιο, για σωστές αποδόσεις', done: propertyDetailsComplete(prop, !!tenant), nav:'settings' },
    { key:'tenant',  weight:8, label:'Πρόσθεσε ενοικιαστή & ενοίκιο', hint:'Ξεκλείδωσε αποδόσεις και υπενθυμίσεις λήξης', done: !!tenant, nav:'tenant' },
    { key:'expense', weight:6, label:'Κατέγραψε την πρώτη δαπάνη', hint:'Παρακολούθησε κόστη και έκπτωση φόρου', done: expenses.length>0, nav:'finances' },
    { key:'bills',   weight:5, label:'Ρύθμισε ρεύμα & αέριο', hint:'Σύγκρινε παρόχους και βρες φθηνότερο τιμολόγιο', done: bills.length>0, nav:'finances' },
    { key:'pricing', weight:3, label:'Δες την προτεινόμενη τιμή σου', hint:'Δυναμική τιμή ανά νύχτα και φορολογική εικόνα βραχυχρόνιας μίσθωσης', done: hostStays.length>0, nav:'pricing' },
    { key:'inv',     weight:2, label:'Ξεκίνα την απογραφή', hint:'Εξοπλισμός, εγγυήσεις και αποσβέσεις', done: inv.length>0, nav:'inventory' },
    // Βήμα που δείχνει σε καρτέλα η οποία δεν αφορά τον χρήστη είναι νεκρός
    // σύνδεσμος: το πάτημα θα τον γύριζε στην Επισκόπηση.
  ] as SetupStep[]).filter(s => tabVisible(s.nav));

  // ── ΜΙΑ ΛΙΣΤΑ, ΟΧΙ ΤΕΣΣΕΡΙΣ ──────────────────────────────────────────────
  // Πριν, αυτή η οθόνη σέρβιρε τέσσερις ανεξάρτητες μηχανές συμβουλής τη μία
  // κάτω από την άλλη: InsightsBoard, ObligationsPanel, «Ρύθμιση ακινήτου» και,
  // ως πλακίδιο KPI, τη λήξη μίσθωσης. Η λήξη μίσθωσης εμφανιζόταν ΤΕΣΣΕΡΙΣ
  // φορές, η ασφάλεια δύο, τα ελλιπή στοιχεία δύο. Τώρα οι πηγές συγχωνεύονται
  // ανά ΘΕΜΑ (lib/home/agenda.ts) και βγαίνει μία σειρά προτεραιότητας.
  const obligations = useMemo(
    () => computeObligations(prop, tenantFull, maint, now, taxProfileOf(prop)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prop, tenantFull, maint, todayIso],
  );
  const agendaAll = useMemo(
    () => buildAgenda({ insights, obligations, setup: setupSteps, today: todayIso }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [insights, obligations, setupSteps, todayIso],
  );
  // Πέντε στην αρχική. Η πλήρης λίστα ζει στις «Εκκρεμότητες» — και η οθόνη το λέει.
  const agenda = agendaAll.slice(0, 5);

  if (loading) return (
    <div>
      <SkeletonKPIs n={5} />
      <div className="grid-main">
        <div className="card"><Skeleton w={140} h={11} style={{marginBottom:16}}/><Skeleton h={120} r={10}/></div>
        <div className="card"><Skeleton w={120} h={11} style={{marginBottom:16}}/><Skeleton h={120} r={10}/></div>
      </div>
      <div className="grid-3" style={{marginBottom:16}}>
        {[0,1,2].map(i=><div key={i} className="card"><Skeleton w={110} h={11} style={{marginBottom:16}}/><Skeleton h={90} r={10}/></div>)}
      </div>
    </div>
  );

  return (
    <div>
      {/* Διακριτική υπενθύμιση: συμπλήρωσε στοιχεία τιμολόγησης πριν την επόμενη χρέωση. */}
      <BillingNudge userId={userId} onNavigate={onNavigate} />

      {/* ═══ Η ΚΕΦΑΛΙΔΑ ΠΟΥ ΕΛΕΙΠΕ ══════════════════════════════════════════
          Η οθόνη άνοιγε με ένα μοναχικό κουμπί «Αναφορά (PDF)» στοιχισμένο
          δεξιά, σε δική του γραμμή: μια ολόκληρη ζώνη ύψους για μια
          δευτερεύουσα ενέργεια, πάνω από το περιεχόμενο. Δεν υπήρχε πουθενά
          τίτλος — ο χρήστης δεν διάβαζε ΠΟΥΘΕΝΑ ποιο ακίνητο βλέπει ούτε τι
          μέρα είναι, ενώ κάθε ποσό από κάτω λέει «ως σήμερα». Τώρα: όνομα,
          κατάσταση, η ώρα Ελλάδας, και η ενέργεια στη σειρά της. */}
      <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:16,flexWrap:'wrap',marginBottom:20}}>
        <div style={{minWidth:0}}>
          <AthensNow style={{fontFamily:T.font.sans,fontSize:11,fontWeight:600,color:'var(--text-tertiary)',letterSpacing:'0.02em',marginBottom:4,minHeight:15}}/>
          <h1 style={{fontSize:26,fontWeight:700,letterSpacing:'-0.02em',color:'var(--text-primary)',fontFamily:T.font.sans,lineHeight:1.15,margin:0,overflow:'hidden',textOverflow:'ellipsis'}}>{prop.name}</h1>
          <div style={{fontFamily:T.font.sans,fontSize:12,color:'var(--text-tertiary)',marginTop:4}}>
            {[PROP_TYPE_LABELS[prop.prop_type||'']||prop.prop_type||'Ακίνητο', statusLabelOf(prop), prop.address||null].filter(Boolean).join(' · ')}
          </div>
        </div>
        <button onClick={()=>printPropertyStatement({
          propName: prop.name, address: prop.address||undefined, postalCode: prop.postal_code||undefined,
          propType: PROP_TYPE_LABELS[prop.prop_type||'']||prop.prop_type||'Ακίνητο',
          status: statusLabelOf(prop), year, propValue: propValue||undefined,
          objValue: prop.obj_value!=null?Number(prop.obj_value):undefined, enfia: prop.enfia!=null?Number(prop.enfia):undefined,
          sqm: prop.sqm||undefined, bedrooms: prop.bedrooms!=null?prop.bedrooms:undefined,
          floor: prop.floor!=null?prop.floor:undefined, yearBuilt: prop.year_built!=null?prop.year_built:undefined,
          energyClass: prop.pea_class||undefined, atak: prop.atak||undefined,
          ownership: prop.ownership!=null?Number(prop.ownership):undefined,
          coOwners: Array.isArray(prop.co_owners)?prop.co_owners:undefined,
          shortTerm: isShortTerm(prop),
          monthlyRent: rent, annualRent, grossYield, netYield,
          expensesYTD: totalExpYTD, categories: catEntries, branding,
        })}
          style={{display:'inline-flex',alignItems:'center',gap:8,height:T.h.md,padding:'0 16px',borderRadius:100,border:'1px solid var(--border-default)',background:'transparent',color:'var(--text-secondary)',fontFamily: T.font.sans,fontSize:12,fontWeight:700,cursor:'pointer'}}
          onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.color='var(--text-primary)';}}
          onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--text-secondary)';}}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
          Αναφορά (PDF)
        </button>
      </div>

      {isDemo && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap', marginBottom:16, padding:'12px 16px', borderRadius:12, background:'var(--accent-soft)', border:'1px solid var(--accent-border)' }}>
          <div style={{ fontSize:13, color:'var(--text-secondary)' }}>
            <strong style={{ color:'var(--text-primary)' }}>Δείγμα (demo).</strong> Περιήγησε τα εργαλεία με έτοιμα δεδομένα. Όταν είσαι έτοιμος, καθάρισέ το και πρόσθεσε το δικό σου ακίνητο.
          </div>
          {onCleanDemo && <button onClick={onCleanDemo} style={{ background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:18, padding:'7px 16px', fontSize:13, fontWeight:600, fontFamily: T.font.sans, color:'var(--accent)', cursor:'pointer', whiteSpace:'nowrap' }}>Καθάρισε το demo</button>}
        </div>
      )}

      {/* ═══ ΤΟ ΤΑΜΕΙΟ ══════════════════════════════════════════════════════
          Η οθόνη άνοιγε με «Μηνιαίο ενοίκιο · Μεικτή απόδοση · Καθαρή απόδοση»:
          τρεις αριθμοί που ο ιδιοκτήτης ξέρει απ' έξω και που δεν αλλάζουν από
          μήνα σε μήνα. Αυτό που ΔΕΝ ήξερε, και είναι ο λόγος που ανοίγει την
          εφαρμογή, ήταν αν μπήκε το ενοίκιο και τι πρέπει να πληρώσει. */}
      <CashHero cash={cash} onNavigate={onNavigate} />

      {/* Μία λίστα «τι χρειάζεται τώρα», στη θέση των τεσσάρων που έλεγαν εν
          μέρει τα ίδια πράγματα. Η συγχώνευση γίνεται στο lib/home/agenda.ts. */}
      {prefs.liveNotifications && (
        <AgendaPanel items={agenda} total={agendaAll.length} onNavigate={onNavigate} />
      )}

      <SecHdr label="Ανάλυση δαπανών" sub="Πού πάνε τα χρήματα, μήνα με μήνα" />
      <div className="grid-main">
        <div className="card">
          <div className="section-label" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
            <span><span className="section-dot"/> Δαπάνες {chartYear} ανά μήνα</span>
            <div style={{position:'relative'}}>
              <button type="button" onClick={()=>setYearMenu(m=>!m)} title="Άλλαξε έτος"
                style={{display:'inline-flex',alignItems:'center',gap:5,height:26,padding:'0 8px 0 10px',borderRadius:8,border:'1px solid var(--border-default)',background:'var(--bg-surface)',color:'var(--text-secondary)',fontFamily: T.font.mono,fontSize:12,fontWeight:700,cursor:'pointer'}}>
                {chartYear}
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{transform:yearMenu?'rotate(180deg)':'none',transition:'transform 0.2s',opacity:0.8}}><path d="m6 9 6 6 6-6"/></svg>
              </button>
              {yearMenu && (
                <>
                  <div onClick={()=>setYearMenu(false)} style={{position:'fixed',inset:0,zIndex:40}}/>
                  <div style={{position:'absolute',top:'calc(100% + 4px)',right:0,zIndex:50,background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:10,boxShadow:'var(--elev-3)',padding:6,minWidth:120,maxHeight:220,overflowY:'auto'}}>
                    {chartYears.map(y => {
                      const sel = y===chartYear; const future = y>now.getFullYear();
                      return (
                        <button key={y} type="button" onClick={()=>{setChartYear(y);setYearMenu(false);}}
                          style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,width:'100%',padding:'8px 10px',borderRadius:8,border:'none',background:sel?'var(--accent-dim)':'transparent',color:sel?'var(--accent)':'var(--text-primary)',fontFamily: T.font.mono,fontSize:13,fontWeight:sel?700:500,cursor:'pointer',textAlign:'left'}}
                          onMouseEnter={e=>{if(!sel)e.currentTarget.style.background='var(--bg-hover)';}}
                          onMouseLeave={e=>{if(!sel)e.currentTarget.style.background='transparent';}}>
                          {y}
                          {future && <span style={{fontFamily: T.font.sans,fontSize:9,fontWeight:600,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.05em'}}>μελλοντικό</span>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
          <div style={{display:'flex',alignItems:'flex-end',gap:6,height:120}}>
            {monthlyExp.map((v,i) => {
              const active = i===selMonth;
              return (
              <button key={i} type="button" onClick={()=>setSelMonth(i)} title={`${MONTHS[i]}: ${fmtEur(v)}`} aria-pressed={active}
                style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4,cursor:'pointer',background:'transparent',border:'none',padding:0,height:'100%',justifyContent:'flex-end'}}>
                <div style={{width:'100%',height:`${maxExp>0?(v/maxExp)*100:0}%`,background:active?'linear-gradient(180deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 76%, #6ea8ff) 100%)':'var(--bg-hover)',borderRadius:'6px 6px 2px 2px',minHeight:v>0?4:0,transition:'height 0.45s cubic-bezier(.2,0,0,1)',boxShadow:active?'0 4px 10px -4px rgba(26,115,232,.4)':'none'}}/>
                <div style={{fontFamily: T.font.sans,fontSize:10,fontWeight:active?700:400,color:active?'var(--accent)':'var(--text-tertiary)'}}>{MONTHS[i]}</div>
              </button>
            );})}
          </div>
          {chartYear > now.getFullYear() && (
            <div style={{fontFamily: T.font.sans,fontSize:11,color:'var(--text-tertiary)',marginTop:10,lineHeight:1.5}}>
              Προβολή βάσει των επαναλαμβανόμενων (πάγιων) δαπανών που έχεις καταχωρήσει. Πρόσθεσε ή σήμανε πάγιες δαπάνες στις «Δαπάνες».
            </div>
          )}
        </div>
        <div className="card">
          <div className="section-label" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
            <span><span className="section-dot"/> Κατηγορίες Δαπανών · {MONTHS_LONG[selMonth]} {chartYear}</span>
            {selMonthTotal>0 && <span style={{fontFamily: T.font.mono,fontSize:12,color:'var(--text-secondary)',fontVariantNumeric:'tabular-nums'}}>{fmtEur(selMonthTotal)}</span>}
          </div>
          {selCatEntries.length===0
            ? <EmptyState icon={<Receipt size={20}/>} title={`Δεν υπάρχουν δαπάνες για ${MONTHS_LONG[selMonth]} ${chartYear}`} hint="Διάλεξε άλλον μήνα ή καταχώρησε δαπάνη στην καρτέλα «Δαπάνες»." />
            : <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {/* Η κουκκίδα είναι ουδέτερη: ο πίνακας `catColors` ήταν πέντε
                    πανομοιότυπες τιμές, δηλαδή πέντε φορές το ίδιο χρώμα με τη
                    μορφή «παλέτας κατηγοριών» που δεν υπήρχε. */}
                {selCatEntries.map(([cat,amt]) => (
                  <div key={cat} style={{display:'flex',alignItems:'center',gap:10}}>
                    <div style={{width:8,height:8,borderRadius:3,background:'var(--border-subtle)',flexShrink:0}}/>
                    <div style={{flex:1,fontFamily: T.font.sans,fontSize:13,color:'var(--text-secondary)',letterSpacing:'0.25px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{cat}</div>
                    <div style={{fontFamily: T.font.mono,fontSize:13,color:'var(--text-primary)',flexShrink:0,fontVariantNumeric:'tabular-nums'}}>{fmtEur(amt)}</div>
                  </div>
                ))}
              </div>
          }
        </div>
      </div>

      <SecHdr label="Το ακίνητο" sub="Στοιχεία, εργασίες και πάγια κόστη" />
      <div className="grid-3" style={{marginBottom:24}}>
        <div className="card">
          <div className="section-label"><span className="section-dot"/> Στοιχεία Ακινήτου</div>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <tbody>
              {[['Τύπος',PROP_TYPE_LABELS[prop.prop_type||'']||prop.prop_type],['Εμβαδόν',prop.sqm?`${prop.sqm} τετραγωνικά`:null],['Υπνοδωμάτια',prop.bedrooms?String(prop.bedrooms):null],['Διεύθυνση',prop.address],['ΑΤΑΚ',prop.atak],['Έτος Κατασκευής',prop.year_built?String(prop.year_built):null],['Όροφος',prop.floor!=null?String(prop.floor):null],['Θέρμανση',prop.heating?HEATING_LABELS[prop.heating]||prop.heating:null],['Ενεργειακή Κλάση',prop.pea_class],['Θέσεις Στάθμευσης',prop.parking_spaces?String(prop.parking_spaces):null],['Αποθήκη',prop.storage_sqm?`${prop.storage_sqm} τ.μ.`:null],['Αντικειμενική Αξία',prop.obj_value?fmtEur(prop.obj_value):null],['Εκτιμώμενος ΕΝΦΙΑ',prop.enfia?fmtEur(prop.enfia):null]].filter(([,v])=>v).map(([k,v],i) => (
                <tr key={i}>
                  <td title={k==='ΑΤΑΚ'?'Αριθμός Ταυτότητας Ακινήτου (από το Ε9)':k==='Εκτιμώμενος ΕΝΦΙΑ'?'Ενιαίος Φόρος Ιδιοκτησίας Ακινήτων: ετήσιος φόρος περιουσίας':undefined} style={{padding:'8px 0',fontFamily: T.font.sans,color:'var(--text-secondary)',width:110,fontSize:13,letterSpacing:'0.25px',borderBottom:'1px solid var(--border-subtle)'}}>{k}</td>
                  <td style={{padding:'8px 0',fontFamily: T.font.sans,color:'var(--text-primary)',fontSize:13,textAlign:'right',letterSpacing:'0.25px',borderBottom:'1px solid var(--border-subtle)'}}>{v as string}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="section-label"><span className="section-dot"/> Επόμενες Εργασίες</div>
          {tasks.length===0
            ? <EmptyState icon={<ListChecks size={20}/>} title="Δεν υπάρχουν εκκρεμείς εργασίες" hint="Οι επόμενες προθεσμίες και παραδόσεις θα εμφανιστούν εδώ." action={<Btn variant="secondary" onClick={()=>onNavigate('checklist')}>Νέα εκκρεμότητα</Btn>} />
            : <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {/* Η κουκκίδα ήταν `high ? A : medium ? A : A`: τρεις κλάδοι, ίδια
                    τιμή — προσποιούνταν ότι κωδικοποιεί προτεραιότητα. Τώρα είναι
                    ουδέτερη και η προτεραιότητα λέγεται με λέξεις, όπου υπάρχει. */}
                {tasks.map(t => (
                  <div key={t.id} style={{display:'flex',alignItems:'flex-start',gap:10}}>
                    <div style={{width:6,height:6,borderRadius:'50%',background:'var(--border-subtle)',marginTop:6,flexShrink:0}}/>
                    <div>
                      <div style={{fontFamily: T.font.sans,fontSize:13,color:'var(--text-primary)',lineHeight:'20px'}}>{t.title}</div>
                      <div style={{fontFamily: T.font.sans,fontSize:12,color:'var(--text-tertiary)',marginTop:2}}>
                        {[t.due_date ? new Date(t.due_date).toLocaleDateString('el-GR') : null,
                          t.priority==='high'||t.priority==='critical' ? 'υψηλή προτεραιότητα' : null].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>
        <div className="card">
          <div className="section-label"><span className="section-dot"/> Μέσοι Λογαριασμοί</div>
          {bills.length===0
            ? <EmptyState icon={<FileText size={20}/>} title="Δεν υπάρχουν λογαριασμοί" hint="Πρόσθεσε ρεύμα, νερό και πάγια για να δεις μέσο μηνιαίο κόστος." action={<Btn variant="secondary" onClick={()=>onNavigate('finances')}>Λογαριασμοί</Btn>} />
            : <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {bills.slice(0,5).map(b => (
                  <div key={b.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div style={{fontFamily: T.font.sans,fontSize:13,color:'var(--text-secondary)',letterSpacing:'0.25px'}}>{b.type}</div>
                    <div style={{fontFamily: T.font.mono,fontSize:13,color:'var(--text-primary)',fontVariantNumeric:'tabular-nums'}}>{fmtEur(b.avg_amount||b.amount)}</div>
                  </div>
                ))}
              </div>
          }
        </div>
      </div>

      {/* ═══ ΤΟ ΕΤΟΣ, ΣΤΗΝ ΙΔΙΑ ΓΛΩΣΣΑ ΜΕ ΤΟ ΣΗΜΕΡΑ ══════════════════════════
          Εδώ ζούσε ΤΡΙΤΟ σύστημα πλακιδίων (.po-fig-card, κεντραρισμένο, 20px
          τιμή) και από κάτω ΤΡΕΙΣ ζώνες με κεντραρισμένα ζευγάρια
          «ετικέτα — τιμή» χωρισμένες με γραμμούλες: δάνειο, φιλοξενία,
          πληρωμένα/εκκρεμή. Επτά νούμερα κρυμμένα σε μορφή που δεν
          χρησιμοποιείται πουθενά αλλού στην εφαρμογή και δεν διαβάζεται με μια
          ματιά. Είναι όλα το ίδιο πράγμα — αριθμός με ετικέτα — και πλέον
          δείχνουν έτσι. */}
      <SecHdr label={`Η χρονιά ${year}`} sub="Πού καταλήγει με ό,τι ξέρουμε σήμερα" />
      {(() => {
        const net = annualRent - projectedExpYear - estTax;
        // ΜΙΑ ΖΩΝΗ ΑΡΙΘΜΩΝ, ΟΧΙ ΔΥΟ. Πιο πάνω υπήρχε δεύτερο πλέγμα «Η εικόνα
        // σήμερα» με «Μηνιαίο ενοίκιο», «Δαπάνες ως σήμερα» και τις δύο
        // αποδόσεις. Το «Μηνιαίο ενοίκιο × 12» ΕΙΝΑΙ τα ακαθάριστα έσοδα, και οι
        // «Δαπάνες ως σήμερα» δίπλα στις «Δαπάνες όλο το έτος» διάβαζαν σαν το
        // ίδιο μέγεθος με δύο τιμές. Τώρα κάθε ποσό λέγεται μία φορά· ό,τι ήταν
        // χρήσιμο συμφραζόμενο (μηνιαίο, ως σήμερα) μπήκε ως υπότιτλος.
        const items: KPIItem[] = [
          { label:'Έσοδα από ενοίκια', value:fmtEur(annualRent), sub:`${fmtEur(rent)} τον μήνα`,
            title:`Μηνιαίο ενοίκιο ${fmtEur(rent)} × 12.` },
          { label:'Δαπάνες', value:fmtEur(Math.round(projectedExpYear)),
            sub: [`${fmtEur(totalExpYTD)} ως σήμερα`, recurringCount>0 ? `${recurringCount} πάγιες` : null].filter(Boolean).join(' · '),
            title:`Οι δαπάνες που έχεις καταχωρήσει για το ${year}, μετρημένες όσες φορές πραγματικά συμβαίνουν: οι εφάπαξ (π.χ. ΕΝΦΙΑ, συμβόλαιο) μία φορά, οι πάγιες όσες φορές επαναλαμβάνονται. Δεν πολλαπλασιάζεται το σύνολο του έτους ×12.${expDeltaPct!=null?` Το ίδιο διάστημα του ${year-1}: ${expDeltaPct>0?'+':expDeltaPct<0?'−':''}${Math.abs(expDeltaPct)}%.`:''}` },
          { label:'Μερίδιο φόρου ενοικίου', value:fmtEur(estTax),
            title:portfolioTax.count>1
              ? `${CONSOLIDATION_NOTE} Συνολικός φόρος χαρτοφυλακίου ${fmtEur(Math.round(portfolioTax.totalTax))} σε ενοίκια ${fmtEur(Math.round(portfolioTax.totalAnnualRent))}.`
              : `Προοδευτική κλίμακα ενοικίων ${year} με την τεκμαρτή έκπτωση 5%. Έχεις ένα ακίνητο με εισόδημα, οπότε ο φόρος του είναι όλος ο φόρος σου.` },
          // ΧΩΡΙΣ ΧΡΩΜΑΤΙΚΗ ΕΤΥΜΗΓΟΡΙΑ. Το πρόσημο το λέει ήδη το ίδιο το ποσό·
          // το πράσινο/κόκκινο απλώς το ξαναέλεγε, και σε μια χρονιά με ΕΝΦΙΑ
          // έβαφε κόκκινο ένα ακίνητο που δουλεύει κανονικά.
          { label:'Καθαρό αποτέλεσμα', value:fmtEur(Math.round(net)),
            title:'Ακαθάριστα έσοδα μείον δαπάνες μείον το μερίδιο φόρου. Δεν περιλαμβάνει δόσεις δανείου.' },
        ];
        // ΙΔΙΟ ΠΛΑΚΙΔΙΟ, ΟΧΙ ΙΔΙΑ ΒΑΡΥΤΗΤΑ. Τα τέσσερα παραπάνω είναι η αλυσίδα
        // που καταλήγει στο «Καθαρό αποτέλεσμα» — το συμπέρασμα της χρονιάς. Τα
        // από κάτω είναι συμφραζόμενα: υπάρχουν μόνο όταν υπάρχουν, και δεν
        // μπαίνουν δίπλα στο συμπέρασμα σαν ισότιμα. Μπήκαν σε δεύτερο πλέγμα
        // αντί να χωθούν στο πρώτο, που τα ξεχείλωνε σε μια δεύτερη μισοάδεια
        // σειρά και ισοπέδωνε την ιεραρχία.
        const extra: KPIItem[] = [];
        if (loans.length > 0) extra.push({
          label:'Δόση δανείου / μήνα', value:fmtEur(Math.round(monthlyDebt)),
          sub: debtLtv>0 ? `δάνειο προς αξία ${debtLtv.toFixed(0)}%` : undefined,
          title:'Εκτιμώμενη τοκοχρεολυτική δόση. ΔΕΝ αφαιρείται από το καθαρό αποτέλεσμα παραπάνω — το κεφάλαιο δεν είναι δαπάνη.' });
        if (hostStays.length > 0) extra.push({
          label:`Έσοδα φιλοξενίας ${year}`, value:fmtEur(Math.round(hostingYTD)),
          sub: [hostingNights>0?`${hostingNights} διανυκτερεύσεις`:null, nextArrival?`επόμενη άφιξη ${new Date(nextArrival).toLocaleDateString('el-GR')}`:null].filter(Boolean).join(' · ') || undefined,
          title:'Πραγματικά έσοδα από διαμονές επισκεπτών, από την καρτέλα «Επισκέπτες».' });
        // ΟΙ «ΕΚΚΡΕΜΕΙΣ ΔΑΠΑΝΕΣ» ΕΦΥΓΑΝ ΑΠΟ ΕΔΩ. Είναι ακριβώς το «Χρωστάω» του
        // Ταμείου, στην κορυφή της ίδιας οθόνης — το ίδιο ποσό δύο φορές, με
        // διαφορετικό όνομα και σε απόσταση ενός scroll.
        return (
          <>
            <KPIGrid columns={4} items={items} />
            {/* Η απόδοση σε μία γραμμή αντί για δύο πλακίδια: είναι
                συμφραζόμενο του αποτελέσματος, όχι ισότιμο μέγεθος μαζί του. Η
                πλήρης ανάλυση ζει στις «Αποδόσεις», που είναι η καρτέλα της. */}
            <div style={{marginTop:-4,marginBottom:16,fontFamily: T.font.sans,fontSize:11.5,color:'var(--text-secondary)',lineHeight:1.7}}>
              {isLet(prop) && propValue>0 && (
                <div>
                  <strong style={{color:'var(--text-primary)',fontWeight:600}}>Απόδοση.</strong>{' '}
                  <span title="Ετήσιο ενοίκιο ως ποσοστό της αξίας του ακινήτου, προ δαπανών">μεικτή {grossYield.toFixed(1)}%</span>
                  {' · '}
                  <span title="Ετήσιο ενοίκιο μείον δαπάνες, ως ποσοστό της αξίας του ακινήτου">καθαρή {netYield.toFixed(1)}%</span>
                  {propValue>0 && ` · αξία ${fmtEur(propValue)}`}
                </div>
              )}
              {taxNote && (
                <div><strong style={{color:'var(--text-primary)',fontWeight:600}}>Πώς βγαίνει ο φόρος.</strong> {taxNote}</div>
              )}
            </div>
            {extra.length > 0 && <KPIGrid columns={Math.max(3, extra.length)} items={extra} />}
          </>
        );
      })()}

      {/* Διαχείριση & Εργαλεία, δευτερεύουσες ενέργειες, κάτω από την οικονομική
          εικόνα. Ίδια κεφαλίδα ενότητας με τις υπόλοιπες — ήταν χειρόγραφη
          γραμμή με τα ίδια περίπου styles και μισό pixel διαφορά. */}
      <SecHdr label="Διαχείριση & εργαλεία" />
      <PortalShare propertyId={prop.id} userId={userId} />
      <OccupancyPanel propertyId={prop.id} userId={userId} longTermMonthly={rent} />
      <PaymentLinks />

      {/* Εργαλεία ακινήτου: ελαφριά πλακίδια-σύνοψη που ανοίγουν την εστιασμένη
          προβολή. Στο προφίλ «Ιδιώτης» ζουν ΕΔΩ (κάτω από Είσπραξη & Πληρωμές)·
          στο «Επαγγελματίας» ζουν στην πλαϊνή μπάρα (ομάδα «Εργαλεία»). Έτσι δεν
          υπάρχουν διπλότυπα — σε κάθε προφίλ εμφανίζονται σε ένα μόνο σημείο. */}
      {profileType==='individual' && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        <ToolTile title="Εκκρεμότητες" metric={openChk ? `${openChk} ανοιχτές` : 'Καμία εκκρεμότητα'} sub="Εργασίες, προθεσμίες, παραδόσεις" badge={chkAttention} onOpen={() => onNavigate('checklist')} />
        <ToolTile title="Επαφές" metric={contactCount ? `${contactCount} ${contactCount === 1 ? 'επαφή' : 'επαφές'}` : 'Πρόσθεσε επαφές'} sub="Πάροχοι, τράπεζες, τεχνικοί" onOpen={() => onNavigate('contacts')} />
        <ToolTile title="Αρχείο" metric={docCount ? `${docCount} ${docCount === 1 ? 'έγγραφο' : 'έγγραφα'}` : 'Ανέβασε έγγραφα'} sub="Συμβόλαια, λογαριασμοί, φωτογραφίες" onOpen={() => onNavigate('documents')} />
        <ToolTile title="Απογραφή" metric={inv.length ? `${inv.length} ${inv.length === 1 ? 'αντικείμενο' : 'αντικείμενα'}` : 'Κατέγραψε εξοπλισμό'} sub="Εξοπλισμός, εγγυήσεις, αποσβέσεις" badge={warrantySoon.length} onOpen={() => onNavigate('inventory')} />
      </div>
      )}
    </div>
  );
}

// Πλακίδιο-σύνοψη εργαλείου στην Επισκόπηση: ζωντανός αριθμός + ένα κλικ ανοίγει
// την πλήρη, εστιασμένη καρτέλα (αντί να φορτώνει βαρύ περιεχόμενο εδώ).
function ToolTile({ title, metric, sub, badge, onOpen }: { title: string; metric: string; sub: string; badge?: number; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="card tool-card" style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)' }}>{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {badge ? <span style={{ minWidth: 18, height: 18, borderRadius: 8, background: 'var(--negative)', color: 'var(--text-inverse)', fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{badge > 9 ? '9+' : badge}</span> : null}
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </div>
      </div>
      <span style={{ fontFamily: T.font.sans, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{metric}</span>
      <span style={{ fontFamily: T.font.sans, fontSize: 11, color: 'var(--text-tertiary)' }}>{sub}</span>
    </button>
  );
}

// Main Dashboard
export default function Dashboard() {
  const supabase = createClient();
  const [user, setUser] = useState<any>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selected, setSelected] = useState<Property | null>(null);
  const [nav, setNav] = useState('overview');
  // Deep-link καρτέλα ενοικιαστή → Απογραφή/Παράδοση με προ-συμπληρωμένα στοιχεία.
  const [handoverIntent, setHandoverIntent] = useState<{tenantName?:string;tenantPhone?:string;type?:'check_in'|'check_out'}|null>(null);
  // Ομαδοποιημένη πλοήγηση (accordion): ανοιχτή μένει η ομάδα του ενεργού tab.
  const [openGroup, setOpenGroup] = useState('Οικονομικά');
  useEffect(() => { const g = NAV_GROUPS.find(gr => gr.ids.includes(nav)); if (g?.label) setOpenGroup(g.label); }, [nav]);
  // Σταδιακή αποκάλυψη: ποιες καρτέλες έχει ήδη ανοίξει ο χρήστης και αν ζήτησε
  // να τις βλέπει όλες. Φορτώνονται από τη βάση ώστε να τον ακολουθούν παντού.
  const [revealedTabs, setRevealedTabs] = useState<string[]>([]);
  // Καθρέφτης του revealedTabs για σύγχρονη ανάγνωση/γράψιμο μέσα σε effect —
  // αποτρέπει το «τελευταίο γράψιμο κερδίζει» σε γρήγορη διαδοχή πλοηγήσεων.
  const revealedRef = useRef<string[]>([]);
  // Ζωντανός μόνο όσο είναι mounted το component. ΔΕΝ μηδενίζεται σε κάθε αλλαγή
  // καρτέλας (αυτό ακριβώς ακύρωνε τις ενημερώσεις πριν).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;   // το StrictMode τρέχει setup→cleanup→setup
    return () => { mountedRef.current = false; };
  }, []);
  const [navShowAll, setNavShowAll] = useState(false);
  const [navPrefsLoaded, setNavPrefsLoaded] = useState(false);
  // ΤΡΙΤΗ ΚΑΤΑΣΤΑΣΗ, ΞΕΧΩΡΙΣΤΗ ΑΠΟ ΤΟ «ΔΕΝ ΦΟΡΤΩΘΗΚΕ ΑΚΟΜΗ».
  // Το fail-open παρακάτω είναι σωστό για ΑΠΟΤΥΧΙΑ ανάγνωσης, αλλά το
  // navPrefsLoaded=false σήμαινε ταυτόχρονα «φορτώνει» ΚΑΙ «απέτυχε». Επειδή
  // ξεκινά false, κάθε φόρτωση της σελίδας περνούσε από κατάσταση «δείξε τα
  // πάντα»: η πλαϊνή μπάρα άνοιγε με δεκαεπτά καρτέλες, οι μισές αχνές και
  // άσχετες με το ακίνητο, και μετά μάζευε σε έξι. Ένα μενού που αναδιπλώνεται
  // μπροστά στα μάτια σου δεν διαβάζεται ως «φόρτωσε» — διαβάζεται ως χαλασμένο.
  const [navPrefsFailed, setNavPrefsFailed] = useState(false);
  const [navSignals, setNavSignals] = useState<DisclosureSignals>({});
  const [loading, setLoading] = useState(true);
  /** Η ανάγνωση ακινήτων απέτυχε — ΔΙΑΦΟΡΕΤΙΚΟ από «δεν έχει ακίνητα». */
  const [loadError, setLoadError] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCopyInventory, setShowCopyInventory] = useState(false);
  const [statusDropdown, setStatusDropdown] = useState(false);
  const [editProperty, setEditProperty] = useState<Property | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);  // συρόμενο μενού σε κινητό/tablet
  const [cmdkOpen, setCmdkOpen] = useState(false);        // command palette (⌘K)
  const [quickAddOpen, setQuickAddOpen] = useState(false);// γρήγορη προσθήκη με φωτογραφία/σάρωση
  const [showWelcome, setShowWelcome] = useState(false);// καλωσόρισμα πρώτης χρήσης
  const [scanDraftId, setScanDraftId] = useState<string|null>(null);// προσχέδιο από scan-to-create
  const [plan, setPlan] = useState<string>('free');       // τρέχον πλάνο συνδρομής (billing_profiles)
  const [compPlan, setCompPlan] = useState<string|null>(null);   // δωρεάν πρόσβαση: επίπεδο (π.χ. από referral)
  const [compUntil, setCompUntil] = useState<string|null>(null); // δωρεάν πρόσβαση: λήξη (ISO)
  const [ownerName, setOwnerName] = useState('');         // όνομα ιδιοκτήτη για προσφώνηση (billing_profiles.owner_name)
  const [profileType, setProfileType] = useState<'individual'|'professional'>('individual'); // τύπος προφίλ → οδηγεί το interface
  // ΝΟΜΙΚΗ ΜΟΡΦΗ (φυσικό / νομικό πρόσωπο): ένα από τα τρία κριτήρια ορατότητας.
  //
  // ΔΕΝ ΕΙΝΑΙ ΤΟ ΙΔΙΟ ΜΕ ΤΟ profile_type. Το «Επαγγελματίας» περιγράφει τον ρόλο
  // στην εφαρμογή (διαχειρίζεται ξένα ακίνητα)· η νομική μορφή περιγράφει τον
  // φορολογούμενο. Ένας μεσίτης μπορεί να είναι ατομική επιχείρηση και ένας
  // ιδιώτης με τρία ακίνητα να τα έχει σε ΙΚΕ. Η μαντεψιά από το ένα στο άλλο θα
  // έδειχνε ΕΦΚΑ και αποσβέσεις κτιρίου σε κάποιον που δεν έχει επιχείρηση.
  //
  // Η στήλη `legal_form` υπάρχει πλέον στο billing_profiles (migration
  // 20260729120000_legal_form.sql) και διαβάζεται παρακάτω. Οι τέσσερις τιμές της
  // βάσης διπλώνουν στις δύο που χρειάζεται η μηχανή ορατότητας: ό,τι έχει
  // επιχειρηματική δραστηριότητα (ατομική, Ο.Ε./Ε.Ε., εταιρεία) μετρά ως 'company'
  // εδώ, γιατί το ερώτημα που απαντά αυτό το πεδίο είναι «να δείξω ΕΦΚΑ, Ε3 και
  // απόσβεση κτιρίου;». Ο ΙΣΟΛΟΓΙΣΜΟΣ δεν κρίνεται από εδώ — κρέμεται από τα
  // βιβλία (`bookkeeping`), γιατί μια Ο.Ε. μπορεί να είναι απλογραφικά.
  // Αν λείπει ή είναι άγνωστη η τιμή, μένει το ασφαλές 'individual': κρύβει τα
  // εταιρικά αντί να τα εφευρίσκει σε κάποιον που δεν έχει επιχείρηση.
  const [legalForm, setLegalForm] = useState<LegalForm>('individual');
  const [isPartner, setIsPartner] = useState(false);      // ιδιότητα Συνεργάτη (referral_partners)
  const [showUpgrade, setShowUpgrade] = useState(false);  // modal ορίου ακινήτων
  const [kbdHint, setKbdHint] = useState('Ctrl K');       // ένδειξη συντόμευσης ανά πλατφόρμα (Mac → ⌘K)
  useEffect(() => {
    const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
    setKbdHint(mac ? '⌘K' : 'Ctrl K');
  }, []);

  // Προσβασιμότητα: εφαρμογή αποθηκευμένων προτιμήσεων σε όλη την εφαρμογή.
  useEffect(() => {
    try {
      const r = document.documentElement;
      if (localStorage.getItem('po_reduce_motion') === '1') r.classList.add('a11y-reduce-motion');
      if (localStorage.getItem('po_large_text') === '1') r.classList.add('a11y-large-text');
    } catch { /* ignore */ }
  }, []);

  // Καθολικό ⌘K / Ctrl+K για άνοιγμα του command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setCmdkOpen(v => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const inventoryAlerts = useInventoryAlerts(selected?.id||null, user?.id||null);
  const checklistAlerts = useChecklistAlerts(selected?.id||null);

  // Δικαιώματα συνδρομής: το «ενεργό» πλάνο ορίζει τι βλέπεις (βασικό πλάνο,
  // ανυψωμένο από ενεργούς δωρεάν μήνες ή ιδιότητα Συνεργάτη).
  const ent: EntitlementInput = { plan, profileType, partner: isPartner, compPlan, compUntil, createdAt: user?.created_at ?? null };
  const effPlan = effectivePlan(ent);

  // Ο τρόπος «Επαγγελματίας» απαιτεί το πλάνο Επαγγελματίας (agency). Χωρίς αυτό, ο
  // χρήστης βλέπει ΜΟΝΟ την εμπειρία «Ιδιώτη» — δεν εμφανίζονται καθόλου οι
  // επαγγελματικές καρτέλες (η αλλαγή τρόπου στις Ρυθμίσεις παραπέμπει σε αναβάθμιση).
  const proEligible = planAtLeast(effPlan, 'agency');
  const effProfileType: 'individual' | 'professional' = proEligible ? profileType : 'individual';

  // ── ΤΙ ΑΦΟΡΑ ΑΥΤΟΝ ΤΟΝ ΧΡΗΣΤΗ ────────────────────────────────────────────
  // Τα τρία κριτήρια, μαζεμένα σε ένα αντικείμενο: νομική μορφή και ΟΛΑ τα ακίνητα
  // (η κατάσταση του επιλεγμένου δίνεται χωριστά, ανά απόφαση). Καμία μαντεψιά εδώ —
  // η λογική ζει στο lib/property/visibility.ts.
  const ownerCtx: OwnerContext = useMemo(() => ({ legalForm, properties }), [legalForm, properties]);

  // «Δείξε μου τα πάντα»: ρητή επιλογή του χρήστη. Fail-open: αν οι προτιμήσεις δεν
  // διαβάστηκαν (σφάλμα δικτύου), δείχνουμε τα πάντα. Καλύτερα ένα γεμάτο μενού παρά
  // να «εξαφανιστούν» καρτέλες επειδή έπεσε ένα ερώτημα.
  // «Δείξε μου τα πάντα» ΜΟΝΟ όταν το ζήτησε ο χρήστης, ή όταν η ανάγνωση των
  // προτιμήσεων ΑΠΕΤΥΧΕ (fail-open: καλύτερα γεμάτο μενού παρά να «εξαφανιστούν»
  // καρτέλες επειδή έπεσε ένα ερώτημα). Όσο ΦΟΡΤΩΝΕΙ, δείχνουμε μόνο τις βασικές
  // — είναι εξ ορισμού σχετικές με κάθε ακίνητο, οπότε δεν μπορεί να είναι λάθος.
  const showAllTabsPref = navShowAll || navPrefsFailed;

  // ── Σταδιακή αποκάλυψη καρτελών ──────────────────────────────────────────
  const disclosure = useMemo(() => ({
    profileType: effProfileType,
    revealed: revealedTabs,
    showAll: showAllTabsPref,
    // Μόνο σήματα ΣΥΣΣΩΡΕΥΣΗΣ. Η κατάσταση του ακινήτου δεν περνά από εδώ: την
    // κρίνει το tabDecision, και ήταν γραμμένη και στα δύο σημεία.
    signals: { ...navSignals, openTasks: checklistAlerts },
  }), [effProfileType, revealedTabs, showAllTabsPref, navSignals, checklistAlerts]);

  // Κάθε επίσκεψη σε καρτέλα την αποκαλύπτει μόνιμα — από όπου κι αν ήρθε
  // (μενού, ⌘K, βοηθός, πλακίδιο Επισκόπησης). Ένα σημείο, καμία διαρροή.
  useEffect(() => {
    if (!navPrefsLoaded || !user) return;
    // Καταγράφουμε ΚΑΘΕ επίσκεψη σε μη-βασική καρτέλα, ακόμη κι όταν είναι ήδη
    // ορατή. Παλιότερα βγαίναμε νωρίς αν η καρτέλα φαινόταν — που με ενεργό το
    // «Δες όλες τις καρτέλες» ισχύει ΠΑΝΤΑ, οπότε τίποτα δεν καταγραφόταν και
    // επιστρέφοντας στο απλοποιημένο μενού ο χρήστης έχανε ό,τι χρησιμοποιούσε.
    if (coreTabs(effProfileType).includes(nav)) return;
    if (revealedRef.current.includes(nav)) return;

    // Ο ref είναι η πηγή για το γράψιμο και ενημερώνεται ΣΥΓΧΡΟΝΑ: δύο γρήγορες
    // πλοηγήσεις συσσωρεύουν αντί να γράφει η δεύτερη πάνω στην πρώτη (το state
    // δεν προλαβαίνει να ενημερωθεί μέσα σε ένα round-trip δικτύου).
    const next = reveal(revealedRef.current, nav);
    revealedRef.current = next;
    const tab = nav;
    supabase.from('onboarding_progress').upsert({ user_id: user.id, revealed_tabs: next }, { onConflict: 'user_id' })
      .then(({ error }) => {
        if (error) {
          // ΠΡΟΣΟΧΗ στην επαναφορά: μια αποτυχία ΔΕΝ επιτρέπεται να σβήσει καρτέλα
          // που μια μεταγενέστερη, ΕΠΙΤΥΧΗΜΕΝΗ εγγραφή έχει ήδη αποθηκεύσει. Ο ref
          // είναι κοινός, οπότε αφαιρούμε μόνο αν είναι ακόμη το ΤΕΛΕΥΤΑΙΟ στοιχείο
          // — δηλαδή αν καμία άλλη εγγραφή δεν πρόλαβε να το «κλειδώσει» από πίσω.
          const cur = revealedRef.current;
          if (cur[cur.length - 1] === tab) revealedRef.current = cur.slice(0, -1);
          return;
        }
        // Δημοσιεύουμε ΜΟΝΟ ό,τι επιβεβαιωμένα γράφτηκε (`next`), όχι τον τρέχοντα
        // ref: αυτός μπορεί να περιέχει καρτέλες με εγγραφή ακόμη σε πτήση, που
        // ίσως αποτύχει. Η ενεργή καρτέλα φαίνεται ούτως ή άλλως (id===nav), και
        // η δική της εγγραφή θα τη δημοσιεύσει μόλις επιβεβαιωθεί.
        if (mountedRef.current) {
          setRevealedTabs(prev => (prev.includes(tab) ? prev : [...prev, tab]));
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, navPrefsLoaded, user, effProfileType]);

  // Μία πηγή αλήθειας για το «απλοποιημένο μενού»: το κουμπί στην μπάρα και ο
  // διακόπτης στις Ρυθμίσεις γράφουν εδώ, ώστε η αλλαγή να φαίνεται αμέσως.
  const setNavShowAllPref = (v: boolean) => {
    setNavShowAll(v);
    if (user) supabase.from('onboarding_progress').upsert({ user_id: user.id, nav_show_all: v }, { onConflict: 'user_id' }).then(() => {});
  };
  const showAllTabs = () => setNavShowAllPref(true);

  const fetchProperties = useCallback(async (uid: string) => {
    // ΤΟ «ΔΕΝ ΔΙΑΒΑΣΤΗΚΕ» ΔΕΝ ΕΙΝΑΙ «ΔΕΝ ΕΧΕΙΣ ΤΙΠΟΤΑ».
    //
    // Το `error` πεταγόταν και το `data || []` έκανε την αποτυχία να μοιάζει με
    // κενό χαρτοφυλάκιο: ο ιδιοκτήτης τριών ακινήτων, με κακό δίκτυο ή ληγμένο
    // token, έβλεπε «Καλωσήρθες — πρόσθεσε το πρώτο σου ακίνητο». Το χειρότερο
    // δεν είναι η λάθος οθόνη· είναι ότι πιστεύει πως έχασε τα δεδομένα του.
    const { data, error } = await supabase.from('user_properties').select('*').eq('user_id', uid).order('created_at');
    if (error) { setLoadError(true); return; }
    setLoadError(false);
    const props = data || [];
    setProperties(props);
    if (props.length > 0 && !selected) setSelected(props[0]);
    else if (selected) setSelected(props.find(p => p.id === selected.id) || props[0] || null);
  }, [selected]);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = '/login'; return; }
      setUser(user);
      // Καταγραφή παραπομπής (referral) στην πρώτη σύνδεση, idempotent. Η RPC
      // αναλύει τον κωδικό στον κάτοχο, μπλοκάρει την αυτο-παραπομπή και γράφει
      // τον referrer, ώστε η σύσταση να προσμετράται σωστά στον συστήνοντα.
      const refBy = (user.user_metadata as any)?.referred_by;
      if (refBy) { supabase.rpc('redeem_referral', { p_code: String(refBy) }).then(() => {}); }
      // Ιδιότητα Συνεργάτη (για το έμβλημα στο header), αν έχει κερδηθεί.
      supabase.from('referral_partners').select('user_id').eq('user_id', user.id).maybeSingle().then(({ data }) => setIsPartner(!!data));
      // Τρέχον πλάνο (για το όριο ακινήτων). Αν δεν υπάρχει προφίλ, δωρεάν.
      supabase.from('billing_profiles').select('plan, owner_name, profile_type, comp_plan, comp_until, legal_form').eq('user_id', user.id).maybeSingle().then(({ data }) => { setPlan(data?.plan || 'free'); setOwnerName(data?.owner_name || ''); setProfileType(data?.profile_type === 'professional' ? 'professional' : 'individual'); setCompPlan((data as { comp_plan?: string|null } | null)?.comp_plan ?? null); setCompUntil((data as { comp_until?: string|null } | null)?.comp_until ?? null); setLegalForm(HAS_BUSINESS.has((data as { legal_form?: string|null } | null)?.legal_form ?? '') ? 'company' : 'individual'); });
      // Μετατροπή κερδισμένων μηνών referral σε ενεργή δωρεάν πρόσβαση (server-verified,
      // idempotent). Εφαρμόζεται για την επόμενη φόρτωση· δεν είναι gameable από τον client.
      supabase.rpc('sync_comp_from_referrals').then(() => {});
      // Αυτόματη αποδοχή προσκλήσεων οργανισμού για το email του χρήστη (idempotent).
      supabase.rpc('accept_org_invites_for_me').then(() => {});
      await fetchProperties(user.id);
      // Καλωσόρισμα πρώτης χρήσης: μόνο για νέο χρήστη (χωρίς ακίνητα) που δεν
      // έχει ξαναδεί το onboarding (πρόοδος στη βάση, όχι μόνο τοπικά).
      try {
        const cnt = (t: string) => supabase.from(t).select('id', { count: 'exact', head: true }).eq('user_id', user.id);
        const [{ data: ob, error: obErr }, { count }, { count: docCount }, loanRes, contactRes, invRes] = await Promise.all([
          supabase.from('onboarding_progress').select('welcomed, revealed_tabs, nav_show_all').eq('user_id', user.id).maybeSingle(),
          cnt('user_properties'),
          cnt('property_documents'),
          cnt('loans'),
          cnt('contacts'),
          cnt('inventory_items'),
        ]);
        if (!ob?.welcomed && (count || 0) === 0) setShowWelcome(true);
        // Σταδιακή αποκάλυψη: τι έχει ήδη ανοίξει + τι δικαιολογούν τα δεδομένα.
        //
        // ΚΡΙΣΙΜΟ: το supabase-js ΔΕΝ πετά εξαίρεση σε σφάλμα ερωτήματος — γυρίζει
        // { data: null, error }. Το try/catch από κάτω δεν πιάνει τίποτα. Αν δεν
        // ελέγξουμε ρητά το `error`, ένα αποτυχημένο read (π.χ. η εφαρμογή ανέβηκε
        // πριν εφαρμοστεί το migration που προσθέτει τις στήλες) θα περνούσε ως
        // «διαβάστηκαν κενές προτιμήσεις» και θα ΕΚΡΥΒΕ καρτέλες αντί να ανοίξει
        // fail-open. Μόνο όταν το read πετύχει δηλώνουμε τις προτιμήσεις φορτωμένες.
        const rec = ob as { revealed_tabs?: unknown; nav_show_all?: boolean } | null;
        if (obErr) {
          setNavPrefsFailed(true);    // → fail-open: φαίνονται ΟΛΕΣ οι καρτέλες
        } else {
          setNavPrefsFailed(false);
          const loadedTabs = sanitizeRevealed(rec?.revealed_tabs, NAV_ITEMS.map(i => i.id));
          revealedRef.current = loadedTabs;
          setRevealedTabs(loadedTabs);
          setNavShowAll(!!rec?.nav_show_all);
          setNavPrefsLoaded(true);
        }
        setNavSignals({
          hasLoan: (loanRes.count || 0) > 0,
          hasDocuments: (docCount || 0) > 0,
          hasContacts: (contactRes.count || 0) > 0,
          hasInventory: (invRes.count || 0) > 0,
          daysSinceSignup: user.created_at
            ? Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86400000)
            : 0,
        });
        // Ενεργοποίηση σύστασης: ο νέος χρήστης έχει ≥1 ακίνητο & ≥1 σαρωμένο
        // έγγραφο → η σύστασή του «κλειδώνει» (idempotent, μόνο τη δική του γραμμή).
        if ((count || 0) >= 1 && (docCount || 0) >= 1) supabase.rpc('mark_referral_activated').then(() => {});
      } catch {}
      setLoading(false);
    };
    init();
  }, []);

  // Προσθήκη ακινήτου με έλεγχο ορίου πλάνου: αν έφτασες το όριο, δείξε αναβάθμιση.
  const tryAddProperty = () => {
    if (canAddProperty(ent, properties.length)) setShowAddModal(true);
    else setShowUpgrade(true);
  };

  const updateStatus = async (status: PropertyStatus) => {
    if (!selected||!user) return;
    await supabase.from('user_properties').update(writeStatus(status)).eq('id', selected.id);
    setStatusDropdown(false);
    await fetchProperties(user.id);
  };

  // Οριστική διαγραφή του τρέχοντος ακινήτου μαζί με τα συνδεδεμένα δεδομένα του.
  // Αν ήταν το τελευταίο ακίνητο, ανοίγει αυτόματα η νέα καταχώρηση (ξεκινάς από την αρχή).
  const deletePropertyById = async (pid: string, name: string) => {
    if (!user) return;
    // Το `wasLast` διαβάζεται ΠΡΙΝ τον διάλογο: το native confirm πάγωνε τη σελίδα,
    // οπότε «πλήθος ακινήτων» σήμαινε πάντα «τη στιγμή του κλικ». Ο νέος διάλογος δεν
    // παγώνει τίποτα — αν το μετρούσαμε μετά το await και εν τω μεταξύ φορτωνόταν άλλο
    // ακίνητο, ο οδηγός «νέα καταχώρηση» θα άνοιγε (ή δεν θα άνοιγε) άστοχα.
    const wasLast = properties.length <= 1;
    const ok = await confirmDialog(
      `Οριστική διαγραφή του ακινήτου «${name}»;\n\n`+
      `Θα διαγραφούν όλα τα συνδεδεμένα στοιχεία του (έσοδα, δαπάνες, λογαριασμοί, `+
      `ενοικιαστής, δάνεια, απογραφή, έγγραφα, διαμονές), μαζί με όσα θυμάται `+
      `η Νόα γι' αυτό. Η ενέργεια δεν αναιρείται.`,
      { tone: 'negative', confirmLabel: 'Οριστική διαγραφή' }
    );
    if (!ok) return;
    setStatusDropdown(false);
    // Καθαρισμός συνδεδεμένων εγγραφών (best-effort· η RLS περιορίζει στα δικά σου).
    const childTables = ['expenses','calendar_events','bills','bills_history','bills_settings','checklist_items','tenants','tenant_comm_log','contacts','inventory_items','inventory_maintenance','inventory_handovers','loans','property_settings','rent_payments','rent_config','rent_comparables','property_documents','maintenance_tasks','maintenance_requests','portal_links','notification_preferences','client_stays','pricing_settings','ical_feeds'];
    await Promise.allSettled(childTables.map(t => supabase.from(t).delete().eq('property_id', pid)));
    await supabase.from('user_properties').delete().eq('id', pid).eq('user_id', user.id);
    // Σβήσε τη συνομιλία/μνήμη του βοηθού για το συγκεκριμένο ακίνητο (τοπικά στον browser).
    try { clearAssistantHistory(pid); } catch {}
    if (selected?.id === pid) setSelected(null);
    await fetchProperties(user.id);
    if (wasLast) { setNav('overview'); setShowAddModal(true); }
  };
  const deleteProperty = () => { if (selected) deletePropertyById(selected.id, selected.name); };

  // Καθάρισμα demo με ένα κλικ: σβήνει τα δείγματα ακίνητα/πελάτες/διαμονές.
  const cleanupDemo = async () => {
    if (!user) return;
    // Ίδιος λόγος με τη διαγραφή ακινήτου: το σύνολο των demo κλειδώνει ΠΡΙΝ τη
    // ερώτηση, ώστε να μη σβηστεί κάτι που δεν υπήρχε όταν ρωτήθηκε ο χρήστης.
    const demoProps = properties.filter(p => (p.name || '').startsWith('Demo —'));
    if (!(await confirmDialog('Να αφαιρεθούν τα δείγματα (demo) δεδομένα;', { tone: 'negative' }))) return;
    const childTables = ['expenses','calendar_events','bills','tenants','inventory_items','loans','property_settings','rent_comparables','property_documents','client_stays','pricing_settings','ical_feeds'];
    for (const p of demoProps) {
      await Promise.allSettled(childTables.map(t => supabase.from(t).delete().eq('property_id', p.id)));
      await supabase.from('user_properties').delete().eq('id', p.id).eq('user_id', user.id);
      try { clearAssistantHistory(p.id); } catch {}
    }
    // Σβήσε και τους demo πελάτες (και τις διαμονές τους μέσω cascade στη βάση).
    await supabase.from('clients').delete().eq('user_id', user.id).like('full_name', 'Demo —%');
    setSelected(null);
    await fetchProperties(user.id);
    setNav('overview');
  };

  // Κλείσιμο σάρωσης: αν ήταν προσχέδιο από scan-to-create και δεν αποθηκεύτηκε
  // τίποτα (κανένα έγγραφο), σβήσε το κενό ακίνητο ώστε να μη μένουν σκουπίδια.
  const closeQuickAdd = async () => {
    setQuickAddOpen(false);
    const draft = scanDraftId; setScanDraftId(null);
    if (draft && user) {
      const { count } = await supabase.from('property_documents').select('id', { count: 'exact', head: true }).eq('property_id', draft);
      if ((count || 0) === 0) {
        await supabase.from('user_properties').delete().eq('id', draft).eq('user_id', user.id);
        if (selected?.id === draft) setSelected(null);
        await fetchProperties(user.id);
      }
    }
  };

  // Υγιεινή αποσύνδεσης σε κοινόχρηστη συσκευή.
  //
  // Οι caches του service worker ΔΕΝ κρατούν προσωπικά δεδομένα (μόνο στατικά),
  // οπότε από μόνες τους δεν ήταν το πρόβλημα. Το πραγματικό ρίσκο είναι το
  // localStorage: οι συνομιλίες του βοηθού κρατούν έως 40 μηνύματα ανά ακίνητο
  // και μέσα τους περνούν ονόματα ενοικιαστών, ΑΦΜ και ποσά. Αυτά σβήνονται.
  // Οι «αναμνήσεις» μένουν: είναι ρητή επιλογή του χρήστη, κλειδωμένες στο δικό
  // του id, και καθαρίζονται από τις Ρυθμίσεις.
  const signOut = async () => {
    // ΠΡΩΤΑ η αποσύνδεση. Αν αποτύχει (π.χ. χαμένο δίκτυο), ο χρήστης παραμένει
    // συνδεδεμένος — και θα ήταν παράλογο να έχει ήδη χάσει τις συνομιλίες του
    // για μια αποσύνδεση που δεν έγινε. Το supabase-js επιστρέφει το σφάλμα ως
    // τιμή, δεν το πετά, οπότε το ελέγχουμε ρητά.
    const { error } = await supabase.auth.signOut();
    if (error) {
      // duration 0 = μένει ώσπου να το κλείσει ο χρήστης, ίδιο βάρος με το alert που
      // αντικατέστησε. Οι δύο προτάσεις ενώθηκαν σε μία παράγραφο: το toast δεν
      // αποδίδει αλλαγές γραμμής και το «\n\n» θα κολλούσε τις προτάσεις μεταξύ τους.
      notifyError('Δεν έγινε η αποσύνδεση — δες τη σύνδεσή σου στο δίκτυο και δοκίμασε ξανά. Τα δεδομένα σου στη συσκευή δεν πειράχτηκαν.', { duration: 0 });
      return;
    }
    clearLocalPersonalData();
    try { navigator.serviceWorker?.controller?.postMessage('pos-clear-caches'); } catch { /* ignore */ }
    window.location.href = '/login';
  };

  // Ο χειροποίητος κύκλος είχε ΔΙΚΟ ΤΟΥ inline <style> με @keyframes spin — ακριβές
  // διπλότυπο του globals.css. Δύο ορισμοί της ίδιας κίνησης σημαίνει ότι μια αλλαγή
  // ταχύτητας στο ένα σημείο άφηνε το άλλο πίσω.
  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'var(--bg-base)'}}>
      <Spinner size={48} label="Φόρτωση…" />
    </div>
  );

  const userInitials = user?.email?.substring(0,2).toUpperCase() || 'GF';
  const statusColor = selected ? STATUS_COLORS[readStatus(selected)] : 'var(--text-secondary)';
  const statusLabel = selected ? statusLabelOf(selected) : '';
  const getBadge = (id: string) => { if (id==='inventory'&&inventoryAlerts>0) return inventoryAlerts; if (id==='checklist'&&checklistAlerts>0) return checklistAlerts; return 0; };

  // ── ΜΙΑ ΑΠΟΦΑΣΗ ΟΡΑΤΟΤΗΤΑΣ, ΕΝΑ ΣΗΜΕΙΟ ───────────────────────────────────
  //
  // Πριν αποφάσιζαν ΔΥΟ φίλτρα που δεν ήξεραν το ένα το άλλο: το `isTabRelevant`
  // κοιτούσε μόνο τον τύπο προφίλ, το `tabFitsStatus` μόνο την κατάσταση του
  // ακινήτου. Κανένα δεν ήξερε πόσα ακίνητα έχει ο χρήστης ούτε αν είναι φυσικό ή
  // νομικό πρόσωπο — δύο από τα τρία κριτήρια που ορίζουν τι βλέπει ο καθένας.
  // Τώρα αποφασίζει ένα αρχείο, το lib/property/visibility.ts· εδώ μένει η όψη.
  //
  // ΔΥΟ ΕΡΩΤΗΣΕΙΣ ΠΟΥ ΔΕΝ ΜΠΕΡΔΕΥΟΝΤΑΙ:
  //   • «Με αφορά;»          → tabDecision — κρύβει, με γραμμένο λόγο
  //   • «Θέλει αναβάθμιση;»  → isTabAllowed / FeatureLock — κλειδώνει, δεν κρύβει
  // Καρτέλα που δεν σε αφορά ΔΕΝ γίνεται ποτέ upsell: το λουκέτο πάνω σε κάτι που
  // δεν θα χρειαστείς είναι υπόσχεση αξίας που δεν υπάρχει.
  //
  // ΔΕΝ ΔΙΑΓΡΑΦΕΤΑΙ ΤΙΠΟΤΑ. Οι καρτέλες φεύγουν από την πλοήγηση, τα δεδομένα
  // μένουν ακέραια, και επιστρέφουν τη στιγμή που το ακίνητο αλλάζει κατάσταση.
  const decide = (id: string) => tabDecision(id, ownerCtx, selected);

  // Ορατή στην πλοήγηση: ό,τι αφορά τον χρήστη — και, αν ζήτησε «δείξε τα όλα»,
  // και τα υπόλοιπα, αχνά και με τον λόγο ως tooltip.
  const navVisible = (id: string) => decide(id).visible || showAllTabsPref;

  // Αν ο χρήστης βρίσκεται σε καρτέλα που μόλις έπαψε να τον αφορά (άλλαξε την
  // κατάσταση, διέγραψε ακίνητο), δεν τον αφήνουμε σε οθόνη που δεν ισχύει.
  // Παράγεται κατά την απόδοση, όχι σε effect: το effect θα έδειχνε για ένα καρέ
  // την παλιά οθόνη.
  const navSafe = navVisible(nav) ? nav : 'overview';

  // ── ΑΛΛΑΓΗ ΑΚΙΝΗΤΟΥ ΧΩΡΙΣ ΝΑ ΧΑΝΕΤΑΙ Η ΘΕΣΗ ────────────────────────────────
  //
  // Κάθε αλλαγή ακινήτου έκανε `setNav('overview')`. Ο ιδιοκτήτης με τρία ακίνητα
  // που ήθελε να δει τις Δαπάνες και των τριών, έκανε έξι κλικ αντί για τρία:
  // ακίνητο → Επισκόπηση (αθέλητα) → Δαπάνες, ξανά και ξανά. Η μία κίνηση που
  // ζητούσε («δείξε μου το επόμενο») τον πήγαινε κάπου που δεν ζήτησε.
  //
  // Η επαναφορά ήταν και περιττή: το `navSafe` παραπάνω ήδη γυρίζει στην
  // Επισκόπηση όταν η καρτέλα δεν ισχύει για το επιλεγμένο ακίνητο (κενό ακίνητο
  // δεν έχει Απόδοση, μη μισθωμένο δεν έχει Ενοικιαστή). Δηλαδή ο μηδενισμός δεν
  // προστάτευε από τίποτα· απλώς πετούσε τη θέση του χρήστη σε κάθε περίπτωση,
  // ενώ ο έλεγχος έτρεχε ούτως ή άλλως.
  //
  // Τώρα: η καρτέλα κρατιέται όταν στέκει, και πέφτει στην Επισκόπηση μόνο όταν
  // πραγματικά δεν αφορά το νέο ακίνητο.
  const switchProperty = (p: Property) => { setSelected(p); setSidebarOpen(false); };

  // Εντολές command palette: μετάβαση σε tab, εναλλαγή ακινήτου, γρήγορες ενέργειες
  const cmdItems: CommandItem[] = [
    ...NAV_ITEMS.filter(item => isTabPurchasable(effProfileType, item.id) && navVisible(item.id)).map(item => ({
      id: `nav-${item.id}`, label: item.label, hint: 'Μετάβαση', group: 'Πλοήγηση',
      keywords: item.id, action: () => { if (selected) setNav(item.id); },
    })),
    ...properties.map(p => ({
      id: `prop-${p.id}`, label: p.name, hint: 'Ακίνητο', group: 'Ακίνητα',
      keywords: `${p.address||''} ${PROP_TYPE_LABELS[p.prop_type||'']||''}`,
      // Η καρτέλα ΔΕΝ μηδενίζεται στην αλλαγή ακινήτου — δες switchProperty.
      action: () => switchProperty(p),
    })),
    { id: 'act-add', label: 'Προσθήκη ακινήτου', hint: 'Ενέργεια', keywords: 'new property add', action: () => tryAddProperty() },
    { id: 'act-signout', label: 'Αποσύνδεση', hint: 'Ενέργεια', keywords: 'logout sign out exit', action: () => signOut() },
  ];

  return (
    <div className="app-shell">
      {/* Σκίαση πίσω από το συρόμενο μενού (μόνο κινητό/tablet) */}
      <div className={`app-scrim ${sidebarOpen?'open':''}`} onClick={()=>setSidebarOpen(false)}/>
      {/* Sidebar */}
      <aside className={`app-sidebar ${sidebarOpen?'open':''}`}>
        <div className="sidebar-logo" role="button" tabIndex={0}
          onClick={()=>{ setNav('overview'); setSidebarOpen(false); }}
          onKeyDown={e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); setNav('overview'); setSidebarOpen(false); } }}
          title="Αρχική, Επισκόπηση">
          <div className="sidebar-logo-mark">P</div>
          <span className="sidebar-logo-text">Property OS</span>
          <span className="sidebar-logo-badge">Beta</span>
        </div>

        {/* Κεντρικό κουμπί: μια φωτογραφία → αυτόματη καταχώρηση παντού.
            Η ορατότητα είναι εγγυημένη από το .quick-add-btn (αδιαφανές
            background-color που βάφεται πάντα, ανεξάρτητα από τη διαβάθμιση). */}
        <button
          onClick={()=>{ setQuickAddOpen(true); setSidebarOpen(false); }}
          className="quick-add-btn"
          disabled={!selected}
          title={selected ? 'Φωτογράφισε ή ανέβασε λογαριασμό, πληρωμή, μισθωτήριο, ασφάλεια, έγγραφο, οτιδήποτε' : 'Πρόσθεσε πρώτα ένα ακίνητο'}>
          <span className="quick-add-icon" aria-hidden>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </span>
          <span className="quick-add-label">Σάρωσε έγγραφο</span>
        </button>

        <div className="sidebar-section">
          <div className="sidebar-section-label">{effProfileType==='professional' ? 'Χαρτοφυλάκιό μου' : 'Ακίνητά μου'}</div>
          {properties.map(p => (
            <div key={p.id} role="button" tabIndex={0} aria-pressed={selected?.id===p.id} className={`prop-item ${selected?.id===p.id?'active':''}`} onClick={()=>switchProperty(p)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();switchProperty(p);}}}>
              <div className="prop-item-dot" style={{background:STATUS_COLORS[readStatus(p)]}}/>
              <span className="prop-item-name">{p.name}</span>
              <button className="prop-item-del" title="Διαγραφή ακινήτου και όλων των δεδομένων του" aria-label={`Διαγραφή ακινήτου ${p.name}`}
                onClick={e=>{ e.stopPropagation(); deletePropertyById(p.id, p.name); }}
                onKeyDown={e=>{ e.stopPropagation(); }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
          ))}
          <button onClick={()=>tryAddProperty()}
            style={{display:'flex',alignItems:'center',gap:12,padding:'0 16px',height:T.h.lg,borderRadius:18,border:'none',background:'transparent',cursor:'pointer',width:'calc(100% - 16px)',margin:'2px 8px',fontFamily: T.font.sans,fontSize:14,color:'var(--accent)',textAlign:'left'}}
            onMouseEnter={e=>e.currentTarget.style.background='var(--accent-dim)'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <span style={{fontSize:18,lineHeight:1}}>+</span> Προσθήκη ακινήτου
          </button>
        </div>
        <div className="sidebar-nav" style={{flex:1}}>
          {NAV_GROUPS.map((group,gi) => {
            // Χωρίς διπλότυπα: τα εργαλεία (Απογραφή/Αρχείο/Εκκρεμότητες/Επαφές) είναι
            // δωρεάν και στα δύο προφίλ· εμφανίζονται όμως σε ΕΝΑ σημείο ανά προφίλ —
            // στον Ιδιώτη μέσα στην Επισκόπηση, στον Επαγγελματία στην πλαϊνή μπάρα.
            if (group.label==='Εργαλεία' && effProfileType!=='professional') return null;
            // ΤΡΙΑ ΦΙΛΤΡΑ, ΤΡΕΙΣ ΔΙΑΦΟΡΕΤΙΚΕΣ ΕΡΩΤΗΣΕΙΣ:
            //   1. Θα το φτάσει ποτέ με πλάνο του προφίλ του; (αλλιώς ούτε λουκέτο)
            //   2. Έχει ήδη νόημα να το δει τώρα; (σταδιακή αποκάλυψη, συν η ενεργή
            //      καρτέλα ώστε να μη «φεύγει» κάτω από τα πόδια του)
            //   3. Τον αφορά; (κατάσταση, πλήθος ακινήτων, νομική μορφή)
            // Το τρίτο κρατά και τον ΛΟΓΟ: με «δείξε τα όλα» η καρτέλα μένει αχνή και
            // ο λόγος γίνεται tooltip, αντί να εξαφανίζεται χωρίς εξήγηση.
            const items = group.ids
              .filter(id => isTabPurchasable(effProfileType, id)
                         && (id===nav || SELF_DISCLOSING.has(id) || isTabVisible(id, disclosure)))
              .map(id => ({ id, d: decide(id) }))
              .filter(x => x.d.visible || showAllTabsPref);
            if (items.length === 0) return null;
            const hasHeader = !!group.label;
            const open = !hasHeader || openGroup===group.label;
            // Μόνο οι σχετικές μετρούν στο έμβλημα της κλειστής ομάδας: η αχνή καρτέλα
            // δεν εμφανίζει έμβλημα, άρα δεν πρέπει να υπόσχεται και ειδοποιήσεις.
            const groupBadge = items.reduce((s,x)=>s+(x.d.visible?getBadge(x.id):0),0);
            return (
            <div className="sidebar-section" key={gi}>
              {hasHeader && (
                <button type="button" className={`sidebar-section-header ${open?'open':''}`} aria-expanded={open}
                  onClick={()=>setOpenGroup(cur=>cur===group.label?'':group.label)}>
                  <span>{group.label}</span>
                  {!open && groupBadge>0 && <span className="sidebar-section-badge">{groupBadge>9?'9+':groupBadge}</span>}
                  <span className="sidebar-section-chevron" aria-hidden style={{display:'inline-flex',transform:open?'rotate(90deg)':'none',transition:'transform .15s'}}><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg></span>
                </button>
              )}
              {open && items.map(({ id, d }) => { const badge=getBadge(id); const locked=!isTabAllowed(ent, id); return (
                // Η μη-σχετική καρτέλα (ορατή μόνο με «δείξε τα όλα») είναι αχνή και
                // λέει γιατί. Χωρίς λουκέτο και χωρίς έμβλημα: δεν της ζητάμε τίποτα,
                // την αφήνουμε στη θέση της για όποιον θέλει να ξέρει ότι υπάρχει.
                <button key={id} className={`sidebar-item ${nav===id?'active':''}`} onClick={()=>{setNav(id);setSidebarOpen(false);}} disabled={!selected}
                  style={d.visible ? undefined : { opacity: 0.45 }}
                  title={d.visible ? (locked ? 'Διαθέσιμο σε ανώτερο πλάνο' : undefined) : d.reason}>
                  <span className="sidebar-item-icon" aria-hidden>{ic(NAV_ICON[id]||'')}</span>
                  <span className="sidebar-item-label">{id==='referral' && effProfileType==='professional' ? 'Πρόγραμμα Συνεργατών' : NAV_LABEL[id]}</span>
                  {!d.visible ? null : locked ? <LockBadge/> : (badge>0&&<span style={{marginLeft:'auto',minWidth:20,height:20,borderRadius:10,background:'var(--negative)',color:'var(--text-inverse)',fontFamily: T.font.sans,fontSize:11,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 6px'}}>{badge>9?'9+':badge}</span>)}
                </button>
              );})}
            </div>
          );})}

          {/* Οι κρυμμένες καρτέλες δεν είναι μυστικό: λέμε πόσες είναι και ανοίγουν
              με ένα κλικ. Χωρίς αυτό, η σταδιακή αποκάλυψη γίνεται εξαφάνιση. */}
          {(() => {
            // Μετρώνται μόνο όσες ΑΦΟΡΟΥΝ τον χρήστη: το «+3» δεν πρέπει να υπόσχεται
            // καρτέλες που, μόλις τις αποκαλύψει, θα του πουν ότι δεν τον αφορούν.
            const hidden = hiddenTabCount(
              NAV_GROUPS.flatMap(g => (g.label==='Εργαλεία' && effProfileType!=='professional') ? [] : g.ids)
                        .filter(id => isTabPurchasable(effProfileType, id) && decide(id).visible
                                   && id !== nav && !SELF_DISCLOSING.has(id)),
              disclosure,
            );
            if (hidden === 0) return null;
            return (
              <button type="button" onClick={showAllTabs} className="sidebar-item" style={{ color: 'var(--text-tertiary)' }}
                title="Η εφαρμογή δείχνει πρώτα όσα χρειάζεσαι τώρα. Οι υπόλοιπες καρτέλες εμφανίζονται μόλις αποκτήσουν νόημα — ή όλες μαζί από εδώ.">
                <span className="sidebar-item-icon" aria-hidden>{ic('M4 6h16|M4 12h16|M4 18h16')}</span>
                <span className="sidebar-item-label">Δες όλες τις καρτέλες</span>
                <span style={{ marginLeft: 'auto', fontFamily: T.font.sans, fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>+{hidden}</span>
              </button>
            );
          })()}
        </div>
        <div className="sidebar-footer">
          <div className="user-row" role="button" tabIndex={0} aria-label="Αποσύνδεση" onClick={signOut} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();signOut();}}} title="Αποσύνδεση">
            <div className="user-avatar">{userInitials}</div>
            <div style={{flex:1,minWidth:0}}>
              <div className="user-name" style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{user?.email?.split('@')[0]}</div>
              <div className="user-email">Αποσύνδεση</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="app-main">
        <header className="app-topbar">
          <button className="nav-toggle" onClick={()=>setSidebarOpen(v=>!v)} aria-label="Μενού">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          </button>
          {selected ? (
            <>
              <div style={{flex:1}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontFamily: T.font.sans,fontSize:16,fontWeight:600,letterSpacing:'-0.01em',color:'var(--text-primary)'}}>{selected.name}</span>
                  {/* Ένα κουμπί: κατάσταση ακινήτου + εργαλεία (επεξεργασία, διαγραφή) στο ίδιο μενού. */}
                  <div style={{position:'relative'}}>
                    <button onClick={()=>setStatusDropdown(v=>!v)} title="Κατάσταση ακινήτου και εργαλεία (επεξεργασία, διαγραφή)" aria-haspopup="menu" aria-expanded={statusDropdown} style={{display:'flex',alignItems:'center',gap:7,height:T.h.sm,padding:'0 10px 0 12px',borderRadius:8,border:'1px solid var(--border-default)',background:statusDropdown?'var(--bg-hover)':'transparent',cursor:'pointer',fontFamily: T.font.sans,fontSize:12,fontWeight:500,color:'var(--text-primary)',transition:'background 0.15s'}} onMouseEnter={e=>{if(!statusDropdown)e.currentTarget.style.background='var(--bg-hover)'}} onMouseLeave={e=>{if(!statusDropdown)e.currentTarget.style.background='transparent'}}>
                      <div style={{width:6,height:6,borderRadius:'50%',background:statusColor}}/>{statusLabel}
                      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{opacity:0.65,marginLeft:1,transform:statusDropdown?'rotate(180deg)':'none',transition:'transform 0.15s'}}><path d="m6 9 6 6 6-6"/></svg>
                    </button>
                    {statusDropdown && (
                      <>
                      {/* Κλείσιμο με κλικ οπουδήποτε αλλού */}
                      <div onClick={()=>setStatusDropdown(false)} style={{position:'fixed',inset:0,zIndex:99}}/>
                      <div role="menu" style={{position:'absolute',top:'calc(100% + 8px)',left:0,maxHeight:'min(440px, calc(100vh - 96px))',overflowY:'auto',overscrollBehavior:'contain',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:10,padding:'6px 0',zIndex:100,minWidth:224,boxShadow:'var(--shadow-lg)'}}>
                        <div style={{fontFamily: T.font.sans,fontSize:11,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-tertiary)',padding:'6px 16px 4px'}}>Κατάσταση</div>
                        {STATUSES.map(({ key: k, label: v, hint }) => {
                          const active = readStatus(selected)===k;
                          return (
                            <button key={k} role="menuitem" onClick={()=>updateStatus(k)} style={{display:'flex',alignItems:'flex-start',gap:12,width:'100%',padding:'10px 16px',border:'none',background:'transparent',cursor:'pointer',fontFamily: T.font.sans,fontSize:14,fontWeight:active?600:400,color:'var(--text-primary)',textAlign:'left'}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                              <div style={{width:8,height:8,borderRadius:'50%',background:STATUS_COLORS[k],flexShrink:0,marginTop:4}}/>
                              {/* Η εξήγηση δεν είναι διακόσμηση: «Βραχυχρόνια»
                                  και «Μακροχρόνια» καθορίζουν ΠΟΙΑ εργαλεία
                                  εμφανίζονται, οπότε η επιλογή πρέπει να είναι
                                  συνειδητή και όχι μαντεψιά. */}
                              <span style={{flex:1,minWidth:0}}>
                                <span style={{display:'block'}}>{v}</span>
                                <span style={{display:'block',fontSize:11.5,color:'var(--text-tertiary)',fontWeight:400,marginTop:1,lineHeight:1.4}}>{hint}</span>
                              </span>
                              {active && <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>}
                            </button>
                          );
                        })}
                        <div style={{height:1,background:'var(--border-subtle)',margin:'6px 12px'}}/>
                        <div style={{fontFamily: T.font.sans,fontSize:11,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-tertiary)',padding:'6px 16px 4px'}}>Εργαλεία ακινήτου</div>
                        <button role="menuitem" onClick={()=>{setStatusDropdown(false);setEditProperty(selected);}} style={{display:'flex',alignItems:'center',gap:12,width:'100%',padding:'9px 16px',border:'none',background:'transparent',cursor:'pointer',fontFamily: T.font.sans,fontSize:14,color:'var(--text-primary)',textAlign:'left'}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                          Επεξεργασία στοιχείων
                        </button>
                        <button role="menuitem" onClick={deleteProperty} style={{display:'flex',alignItems:'center',gap:12,width:'100%',padding:'9px 16px',border:'none',background:'transparent',cursor:'pointer',fontFamily: T.font.sans,fontSize:14,color:'var(--negative)',textAlign:'left'}} onMouseEnter={e=>e.currentTarget.style.background='var(--negative-dim)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/></svg>
                          Διαγραφή ακινήτου
                        </button>
                      </div>
                      </>
                    )}
                  </div>
                </div>
                <div style={{fontFamily: T.font.sans,fontSize:12,color:'var(--text-secondary)',marginTop:2,letterSpacing:'0.4px'}}>
                  {[PROP_TYPE_LABELS[selected.prop_type||'']||selected.prop_type,selected.sqm?`${selected.sqm} τετραγωνικά`:null,selected.address,selected.postal_code?`ΤΚ ${selected.postal_code}`:null].filter(Boolean).join(' · ')}
                </div>
              </div>
              {navSafe==='inventory'&&properties.length>1&&(
                <button onClick={()=>setShowCopyInventory(true)} style={{height:T.h.md,padding:'0 16px',borderRadius:18,border:'1px solid var(--border-default)',background:'transparent',color:'var(--text-secondary)',fontFamily: T.font.sans,fontSize:13,fontWeight:500,cursor:'pointer',marginRight:8}} onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.color='var(--text-primary)'}} onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--text-secondary)'}}>Αντιγραφή Απογραφής</button>
              )}
              <button onClick={()=>setNav('referral')} title={isPartner?'Είσαι Συνεργάτης Property OS · Πρόγραμμα Συνεργατών':`Ιδιότητα: ${effProfileType==='professional'?'Επαγγελματίας':'Ιδιώτης'} · Πρόγραμμα ${effProfileType==='professional'?'Συνεργατών':'Πρόσκλησης'}`} aria-label="Η ιδιότητά μου και το πρόγραμμα πρόσκλησης" style={{display:'flex',alignItems:'center',height:T.h.md,padding:0,border:'none',background:'transparent',cursor:'pointer',marginRight:8,borderRadius:'50%',transition:'transform .15s'}} onMouseEnter={e=>e.currentTarget.style.transform='translateY(-1px)'} onMouseLeave={e=>e.currentTarget.style.transform='none'}>
                <TierBadge tier={isPartner?'partner':(effProfileType==='professional'?'agency':'owner')} showLabel={false} size={30} />
              </button>
              <button onClick={()=>setCmdkOpen(true)} title={`Αναζήτηση & γρήγορες ενέργειες (${kbdHint})`} aria-label="Αναζήτηση" style={{display:'flex',alignItems:'center',gap:8,height:T.h.md,padding:'0 10px 0 12px',borderRadius:18,border:'1px solid var(--border-default)',background:'transparent',color:'var(--text-secondary)',cursor:'pointer',marginRight:4}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
                <span className="desktop-only" style={{fontSize:11,fontFamily: T.font.mono,color:'var(--text-tertiary)',border:'1px solid var(--border-subtle)',borderRadius:6,padding:'1px 5px'}}>{kbdHint}</span>
              </button>
            </>
          ) : (
            <><div style={{flex:1,fontFamily: T.font.sans,fontSize:14,color:'var(--text-secondary)'}}>Δεν έχεις προσθέσει ακίνητο ακόμα</div></>
          )}
        </header>

        {!selected && loadError ? (
          <div className="app-content" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div style={{maxWidth:460,width:'100%',textAlign:'center'}}>
              <h1 style={{fontFamily: T.font.sans,fontSize:22,fontWeight:700,color:'var(--text-primary)',margin:'0 0 10px'}}>Δεν μπόρεσα να διαβάσω τα ακίνητά σου</h1>
              <p style={{fontFamily: T.font.sans,fontSize:14,color:'var(--text-secondary)',lineHeight:1.6,margin:'0 auto 20px',maxWidth:400}}>
                Τα δεδομένα σου είναι ασφαλή — απλώς δεν φορτώθηκαν τώρα. Συνήθως φταίει η σύνδεση.
              </p>
              <button onClick={()=>{ if(user) fetchProperties(user.id); }} style={{padding:'0 20px',height:T.h.md,borderRadius:T.radius.pill,background:'var(--accent)',border:'none',color:'var(--accent-text)',fontSize:13.5,fontWeight:600,fontFamily:T.font.sans,cursor:'pointer'}}>Δοκίμασε ξανά</button>
            </div>
          </div>
        ) : !selected ? (
          <div className="app-content" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div style={{maxWidth:560,width:'100%',textAlign:'center'}}>
              <div style={{width:64,height:64,borderRadius:18,background:'var(--accent-dim)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 20px'}}>
                <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5 12 3l9 6.5"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>
              </div>
              <h1 style={{fontFamily: T.font.sans,fontSize:28,fontWeight:700,letterSpacing:'-0.02em',color:'var(--text-primary)',margin:'0 0 8px'}}>Καλωσήρθες στο Property OS</h1>
              <p style={{fontFamily: T.font.sans,fontSize:14,color:'var(--text-secondary)',lineHeight:1.6,margin:'0 auto 24px',maxWidth:420}}>Πρόσθεσε το πρώτο σου ακίνητο και ξεκλείδωσε αποδόσεις, δαπάνες, λογαριασμούς, φορολογία και διαχείριση ενοικιαστή, όλα σε ένα σημείο.</p>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,150px),1fr))',gap:12,marginBottom:28,textAlign:'left'}}>
                {[
                  {t:'Αποδόσεις & Φόρος 2026',d:'Μεικτή/καθαρή απόδοση, φόρος βάσει κλίμακας'},
                  {t:'Λογαριασμοί & Ενέργεια',d:'Σύγκριση 11 παρόχων ρεύματος/αερίου'},
                  {t:'Ενοικιαστής & Συμβόλαιο',d:'Πληρωμές, λήξεις, εγγύηση, ιστορικό'},
                ].map((f,i)=>(
                  <div key={i} style={{background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:12,padding:'14px 16px'}}>
                    <div style={{fontFamily: T.font.sans,fontSize:13,fontWeight:700,color:'var(--text-primary)',marginBottom:4}}>{f.t}</div>
                    <div style={{fontFamily: T.font.sans,fontSize:11,color:'var(--text-tertiary)',lineHeight:1.5}}>{f.d}</div>
                  </div>
                ))}
              </div>
              <button className="btn btn-primary" onClick={()=>tryAddProperty()} style={{fontSize:14,height:44,padding:'0 28px'}}>+ Προσθήκη πρώτου ακινήτου</button>
            </div>
          </div>
        ) : (
          <>
            {/* ΚΑΘΕ ΚΑΡΤΕΛΑ ΣΕ ΔΙΚΟ ΤΗΣ ΔΙΧΤΥ.
                Είκοσι δύο καρτέλες ζουν σε ΕΝΑ δέντρο React. Χωρίς αυτό, ένα
                σφάλμα σε οποιαδήποτε ανέβαινε ως το boundary ΟΛΗΣ της διαδρομής
                και η εφαρμογή δεν άνοιγε καθόλου: ο ιδιοκτήτης έχανε ενοίκια,
                ημερολόγιο και έγγραφα επειδή κάπου αλλού κάτι βρήκε ένα null.
                Το `key` ξαναστήνει το δίχτυ σε κάθε αλλαγή καρτέλας, ώστε ένα
                σφάλμα σε μία να μην κρατά κλειδωμένες τις υπόλοιπες. */}
            <TabBoundary name={nav} key={nav}>
            <div className="app-content">
              {['contacts','documents','checklist','inventory'].includes(navSafe) && (
                <button onClick={()=>setNav('overview')} title="Πίσω στην Επισκόπηση" aria-label="Πίσω στην Επισκόπηση"
                  style={{display:'inline-flex',alignItems:'center',gap:6,marginBottom:14,padding:'4px 4px 4px 0',border:'none',background:'transparent',color:'var(--text-tertiary)',fontFamily: T.font.sans,fontSize:13,fontWeight:600,cursor:'pointer'}}
                  onMouseEnter={e=>e.currentTarget.style.color='var(--text-primary)'} onMouseLeave={e=>e.currentTarget.style.color='var(--text-tertiary)'}>
                  <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                  Επισκόπηση
                </button>
              )}
              {navSafe==='portfolio' && (isTabAllowed(ent,'portfolio')
                ? <PortfolioTab properties={properties} userId={user.id} onSelectProperty={(id)=>{ const p=properties.find(x=>x.id===id); if(p){ setSelected(p); setNav('overview'); } }}/>
                : <FeatureLock title="Το χαρτοφυλάκιό σου με μια ματιά" benefit="Συγκεντρωτική εικόνα όλων των ακινήτων σου, με έσοδα, αποδόσεις και εκκρεμότητες σε ένα σημείο. Ξεκλειδώνει με το πλάνο Επαγγελματίας." requiredPlan="agency" currentPlanName={PLANS[effPlan].name} onManage={()=>setNav('settings')} />)}
              {navSafe==='overview'  && <OverviewTab prop={selected} properties={properties} userId={user.id} ownerName={ownerName} onSaveOwnerName={async (n)=>{ setOwnerName(n); await supabase.from('billing_profiles').upsert({ user_id: user.id, owner_name: n.trim() || null }, { onConflict: 'user_id' }); }} onNavigate={(t)=> t==='scan' ? setQuickAddOpen(true) : setNav(t)} onCleanDemo={cleanupDemo} profileType={effProfileType} tabVisible={navVisible}/>}
              {nav==='finances'  && <TabFinances propertyId={selected.id} userId={user.id} propertyName={selected.name} propertyAddress={selected.address||''} profileType={effProfileType} plan={effPlan} onScan={()=>setQuickAddOpen(true)}/>}
              {nav==='calendar'  && <TabCalendar propertyId={selected.id} userId={user.id}/>}
              {navSafe==='tenant'    && <TabTenant propertyId={selected.id} userId={user.id} onStartHandover={(tenantName,tenantPhone,type)=>{ setHandoverIntent({tenantName,tenantPhone,type}); setNav('inventory'); }}/>}
              {/* ═══ ΑΠΟΔΟΣΗ — ΜΙΑ ΚΑΡΤΕΛΑ ΓΙΑ ΜΙΑ ΕΡΩΤΗΣΗ ═══════════════════════
                  Τρεις καρτέλες απαντούσαν στο ίδιο πράγμα από τρεις μεριές:
                  «Αποδόσεις» (πόσο αποδίδει ΑΥΤΟ), «Σύγκριση» (πόσο αποδίδει σε
                  σχέση με τα άλλα), «Σχέδιο» (τι να το κάνω). Ο ιδιοκτήτης δεν
                  σκέφτεται σε τρεις καρτέλες — σκέφτεται «αξίζει;».
                  Τώρα μία, με ενότητες που εμφανίζονται ΜΟΝΟ όταν έχουν νόημα:
                  το Σχέδιο μόνο σε κενό/προς πώληση/ανακαίνιση/νομική εκκρεμότητα,
                  η Σύγκριση μόνο με δεύτερο ακίνητο. Καμία υποκαρτέλα. */}
              {navSafe==='roi' && (
                <>
                  <TabRentROI propertyId={selected.id} userId={user.id} propertyValue={selected.value??undefined} profileType={effProfileType}/>
                  {PLAN_STATUSES.has(readStatus(selected)) && (
                    <div style={{marginTop:28}}>
                      <SecHdr label="Σχέδιο για αυτό το ακίνητο" sub={PLAN_SUB[readStatus(selected)]}/>
                      <TabPlan propertyId={selected.id} userId={user.id} status={readStatus(selected)} property={selected}/>
                    </div>
                  )}
                  {properties.length > 1 && (
                    <div style={{marginTop:28}}>
                      <SecHdr label="Σε σχέση με τα υπόλοιπα ακίνητά σου" sub={`${properties.length} ακίνητα δίπλα-δίπλα`}/>
                      {isTabAllowed(ent,'comparison')
                        ? <TabComparison properties={properties} userId={user.id}/>
                        : <FeatureLock title="Σύγκρινε τα ακίνητά σου δίπλα-δίπλα" benefit="Απόδοση, δαπάνες και πάροχοι όλων των ακινήτων σου σε έναν πίνακα, για να δεις καθαρά πού κερδίζεις και πού χρειάζεται να λάβεις αποφάσεις. Ξεκλειδώνει με το πλάνο Ιδιοκτήτης." requiredPlan="owner" currentPlanName={PLANS[effPlan].name} onManage={()=>setNav('settings')} />}
                    </div>
                  )}
                </>
              )}
              {nav==='loan'      && <TabLoan propertyId={selected.id} userId={user.id} propertyValue={selected.value??undefined} propertySqm={selected.sqm??undefined} propertyYearBuilt={selected.year_built??undefined} profileType={effProfileType}/>}
              {nav==='accounting'&& <TabAccounting propertyId={selected.id} userId={user.id} profileType={effProfileType} onNavigate={(t)=>setNav(t)}/>}
              {navSafe==='inventory' && <TabInventory propertyId={selected.id} userId={user.id} profileType={effProfileType} handoverIntent={handoverIntent} onIntentConsumed={()=>setHandoverIntent(null)} properties={properties}/>}
              {nav==='checklist' && <TabChecklist propertyId={selected.id} userId={user.id} profileType={effProfileType}/>}
              {/* Ο ΕΛΕΓΧΟΣ ΤΟΥ ΑΜΑ ΕΙΝΑΙ ΕΞΩ ΑΠΟ ΤΟ FeatureLock, ΣΚΟΠΙΜΑ.
                  Ο ΑΜΑ που λείπει ή δεν αναγράφεται στην αγγελία κλείνει την
                  καταχώριση — 12.145 στάλθηκαν για απενεργοποίηση το 2025. Κανείς
                  δεν πληρώνει συνδρομή για να μάθει ότι έχει πρόβλημα. Το CRM από
                  κάτω κλειδώνει· η προειδοποίηση ποτέ. */}
              {navSafe==='clients'   && (
                <>
                  <AmaStrip userId={user.id} propertyId={selected.id}/>
                  {isTabAllowed(ent,'clients')
                    ? <TabClients userId={user.id} onSelectProperty={(id)=>{ const p=properties.find(x=>x.id===id); if(p){ setSelected(p); setNav('overview'); } }}/>
                    : <FeatureLock title="Πελατολόγιο και υποψήφιοι (CRM)" benefit="Οργάνωσε πελάτες, ιστορικό διαμονών και υποψήφιους σε ένα σημείο. Ξεκλειδώνει με το πλάνο Επαγγελματίας." requiredPlan="agency" currentPlanName={PLANS[effPlan].name} onManage={()=>setNav('settings')} />}
                  {/* Η δυναμική τιμή ανά νύχτα αφορά ΜΟΝΟ βραχυχρόνια — δηλαδή
                      ακριβώς τους επισκέπτες αυτής της καρτέλας. Ως χωριστή
                      καρτέλα ήταν ένας προορισμός που κανείς δεν σκεφτόταν να
                      επισκεφθεί όταν όριζε τιμή. */}
                  <div style={{marginTop:28}}>
                    <SecHdr label="Τιμολόγηση ανά νύχτα" sub="Δυναμική τιμή και φορολογική εικόνα βραχυχρόνιας"/>
                    <TabPricing propertyId={selected.id} userId={user.id} propertyName={selected.name} propertyRent={(selected.target_rent??undefined)} propertySqm={selected.sqm??undefined}/>
                  </div>
                </>
              )}
              {/* Πάροχοι, τεχνικοί, τράπεζες: είναι στοιχεία ΤΟΥ ΑΚΙΝΗΤΟΥ, όπως
                  τα έγγραφά του. Δύο καρτέλες για «πού βρίσκω αυτό που χρειάζομαι
                  για το ακίνητο» ήταν μία παραπάνω. */}
              {nav==='documents' && (
                <>
                  <TabDocuments propertyId={selected.id} userId={user.id} profileType={effProfileType}/>
                  <div style={{marginTop:28}}>
                    <SecHdr label="Επαφές του ακινήτου" sub="Πάροχοι, τεχνικοί, τράπεζες, ασφαλιστές"/>
                    <TabContacts propertyId={selected.id} userId={user.id} profileType={effProfileType} properties={properties}/>
                  </div>
                </>
              )}
              {nav==='referral'  && <TabReferral userId={user.id} plan={plan} profileType={effProfileType}/>}
              {nav==='settings'  && <TabSettings propertyId={selected.id} userId={user.id} profileType={effProfileType} onProfileChange={setProfileType} navShowAll={navShowAll} onNavShowAllChange={setNavShowAllPref}/>}
            </div>
            </TabBoundary>
          </>
        )}
      </main>

      {/* Κάτω μπάρα πλοήγησης, μόνο σε κινητό (≤768px, μέσω CSS) */}
      {selected && (
        <nav className="bottom-nav">
          {BOTTOM_NAV.map(item => {
            const isActive = item.id !== 'more' && nav === item.id;
            const onTap = item.id === 'more' ? () => setSidebarOpen(true) : () => setNav(item.id);
            const badge = item.id === 'more' && (inventoryAlerts + checklistAlerts) > 0;
            return (
              <button key={item.id} className={`bottom-nav-item ${isActive?'active':''}`} onClick={onTap} style={{position:'relative'}}>
                {badge && <span className="bottom-nav-badge"/>}
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Ήπια μηνιαία παρότρυνση για feedback (πρώτες μέρες του μήνα) */}
      {user&&<MonthlyFeedbackNudge/>}

      {/* Βοηθός ακινήτου, ορατός σε ΚΑΘΕ καρτέλα, πλωτό κουμπί κάτω δεξιά */}
      {selected&&user&&(
        <PropertyAssistant
          propertyId={selected.id} userId={user.id}
          propContext={{
            name: selected.name,
            propType: PROP_TYPE_LABELS[selected.prop_type||'']||selected.prop_type||undefined,
            address: selected.address||undefined, value: selected.value||undefined,
            sqm: selected.sqm||undefined, status: statusLabelOf(selected),
            targetRent: selected.target_rent||undefined,
          }}
          allProperties={properties.map(p=>({
            name: p.name, propType: PROP_TYPE_LABELS[p.prop_type||'']||p.prop_type||undefined,
            value: p.value||undefined, targetRent: p.target_rent||undefined,
            sqm: p.sqm||undefined, status: statusLabelOf(p),
          }))}
          // Ο ΒΟΗΘΟΣ ΔΕΝ ΠΑΡΑΚΑΜΠΤΕΙ ΤΗΝ ΟΡΑΤΟΤΗΤΑ.
          // Το parseAction επικυρώνει το [[go:x]] μόνο απέναντι στον στατικό
          // NAV_MAP — τον κατάλογο ΟΛΩΝ των καρτελών. Χωρίς αυτόν τον έλεγχο, η
          // Νόα μπορούσε να στείλει τον ιδιοκτήτη ενός ιδιοκατοικούμενου
          // ακινήτου στην «Τιμολόγηση», δηλαδή σε οθόνη που η ίδια η εφαρμογή
          // έχει κρίνει ότι δεν τον αφορά.
          onNavigate={(tab)=>{ if (navVisible(tab)) setNav(tab); }}
          onScan={()=>setQuickAddOpen(true)}
        />
      )}

      <CommandPalette open={cmdkOpen} onClose={()=>setCmdkOpen(false)} items={cmdItems} />

      {quickAddOpen&&user&&selected&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.32)',zIndex:1000,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'24px 16px',overflowY:'auto'}}
          onClick={e=>{if(e.target===e.currentTarget)closeQuickAdd();}}>
          <div style={{background:'var(--bg-surface)',borderRadius:14,boxShadow:'var(--shadow-lg)',width:'100%',maxWidth:820,margin:'auto',padding:'28px 28px 32px',position:'relative'}}>
            <button onClick={()=>closeQuickAdd()} aria-label="Κλείσιμο"
              style={{position:'absolute',top:16,right:16,width:34,height:34,borderRadius:'50%',border:'none',background:'var(--bg-hover)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-secondary)'}}
              onMouseEnter={e=>e.currentTarget.style.background='var(--bg-elevated)'}
              onMouseLeave={e=>e.currentTarget.style.background='var(--bg-hover)'}>
              <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
            <DocumentScan propertyId={selected.id} userId={user.id} onSaved={async()=>{setScanDraftId(null);await fetchProperties(user.id);}}/>
          </div>
        </div>
      )}

      {showWelcome&&user&&<WelcomeOnboarding userId={user.id}
        onAddProperty={()=>{ setShowWelcome(false); setShowAddModal(true); }}
        onScanCreate={async()=>{
          setShowWelcome(false);
          const { data } = await supabase.from('user_properties').insert({ user_id:user.id, name:'Νέο ακίνητο', prop_type:'apartment', status_detail:'vacant' }).select('*').single();
          await fetchProperties(user.id);
          if (data) { setSelected(data); setScanDraftId(data.id); }
          setNav('overview'); setQuickAddOpen(true);
        }}
        onProfile={setProfileType}
        onDemoReady={async()=>{ setShowWelcome(false); await fetchProperties(user.id); setNav('pricing'); }}
        onClose={()=>setShowWelcome(false)} />}
      {showAddModal&&user&&<AddPropertyWizard userId={user.id} onClose={()=>setShowAddModal(false)} onSaved={async()=>{setShowAddModal(false);await fetchProperties(user.id);}}/>}
      {editProperty&&user&&<AddPropertyWizard userId={user.id} existing={editProperty} onClose={()=>setEditProperty(null)} onSaved={async()=>{setEditProperty(null);await fetchProperties(user.id);}}/>}
      {showCopyInventory&&user&&selected&&<CopyInventoryModal properties={properties} currentPropertyId={selected.id} userId={user.id} onClose={()=>setShowCopyInventory(false)} onCopied={()=>setShowCopyInventory(false)}/>}
      {showUpgrade&&<UpgradeModal currentCount={properties.length} planId={effPlan} profileType={effProfileType} onClose={()=>setShowUpgrade(false)} onManage={()=>{setShowUpgrade(false);setNav('settings');}}/>}
    </div>
  );
}