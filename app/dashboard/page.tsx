'use client';

import { BrandLogo } from '@/components/BrandMark'
import { useNavHistory } from './components/useNavHistory';
import { heatingLabel } from '@/lib/property/heating';
import { useEffect, useState, useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import { createClient } from '@/lib/supabase/client';
import * as propertyStore from '@/lib/data/properties';
import * as calendarStore from '@/lib/data/calendar';
import * as loanStore from '@/lib/data/loans';
import * as stayStore from '@/lib/data/stays';
import * as billStore from '@/lib/data/bills';
import * as rentStore from '@/lib/data/rent';
import * as checklist from '@/lib/data/checklist';
import * as tenantStore from '@/lib/data/tenants';
import * as expenseStore from '@/lib/data/expenses'
// Η απογραφή έχει ένα σπίτι: lib/data/inventory.
import * as inventory from '@/lib/data/inventory';
// Το προφίλ χρέωσης έχει ένα σπίτι: lib/data/billing.
import * as billing from '@/lib/data/billing';
import * as pushDevices from '@/lib/data/pushSubscriptions';
import { unsubscribeDevice, setDeviceNotify } from '@/lib/push/client';
import type { User } from '@supabase/supabase-js';
import TabBoundary  from './components/TabBoundary';
// ΟΙ ΚΑΡΤΕΛΕΣ ΚΑΤΕΒΑΙΝΟΥΝ ΟΤΑΝ ΑΝΟΙΞΟΥΝ. Το «γιατί», μετρημένο, στο lazyTabs.tsx.
import {
  TabFinances,
  TabCalendar,
  TabRentROI,
  TabPricing,
  TabSettings,
  TabReferral,
  TabTenant,
  TabLoan,
  TabAccounting,
  TabInventory,
  TabContacts,
  TabChecklist,
  TabDocuments,
  TabComparison,
  TabPlan,
  TabClients,
  PortfolioTab,
  AddPropertyWizard,
  DocumentScan,
  WelcomeOnboarding,
} from './components/lazyTabs';
import { STATUSES, readStatus, writeStatus, statusLabel as statusLabelOf, isShortTerm, isLet, type PropertyStatus } from '@/lib/property/status';
import { tabDecision, canCompare, type OwnerContext } from '@/lib/property/visibility';
import { LEGAL_FORMS, type LegalForm } from '@/lib/accounting/dossier';
import AmaStrip from './components/AmaStrip';
import { ASSISTANT_NAME } from '@/lib/assistant/identity';
import type { OpenerContext } from '@/lib/assistant/openers';
import { NAV_LABELS, navLabel } from '@/lib/nav/labels';
import { readLaunchShortcut } from '@/lib/nav/history';
import { mergeLedger, ledgerTotal } from '@/lib/expenses/ledger';
import StartPanel from './components/StartPanel';
import DemoPreview from './components/DemoPreview';
import { useAppPreferences } from './components/useAppPreferences';
import { CommandPalette, type CommandItem } from './components/CommandPalette';
import { T, Btn, Modal, SkeletonKPIs, Skeleton, Spinner, EmptyState, KPIGrid, SecHdr, fp, feOr, fd, type KPIItem } from '@/components/Theme';
import { FileText } from 'lucide-react';
import { confirmDialog } from '@/components/ConfirmDialog';
import { notifyError } from '@/components/Toast';
import PropertyAssistant from './components/PropertyAssistant';
import PropertySwitcher from './components/PropertySwitcher';
import MonthlyFeedbackNudge from './components/MonthlyFeedbackNudge';
import { resolveRent, resolveValue, computeYields, propertyDetailsComplete } from '@/lib/billing/propertyFacts';
import { printPropertyStatement } from './components/statement';
import { useReportBranding } from '@/lib/reportBranding';
import { computeInsights } from '@/lib/insights/engine';
import { annuityMonthly } from '@/lib/loans/recommend';
import { LOAN_COLUMNS, toLoanViews, type LoanView } from '@/lib/loans/shape';
import { stayTotal } from '@/lib/clients/clients';
import { clearHistory as clearAssistantHistory, planBriefing } from './components/assistantPersona';
import { clearLocalPersonalData } from '@/lib/localPrivacy';
import { consolidateRentTax, taxShareOf, consolidationSummary, CONSOLIDATION_NOTE } from '@/lib/billing/consolidate';
import UpgradeModal from './components/UpgradeModal';
import FeatureLock, { LockBadge } from './components/FeatureLock';
import { PLANS } from '@/lib/billing/plans';
import { effectivePlan, isTabAllowed, isTabPurchasable, canAddProperty, planAtLeast, trialState, type EntitlementInput } from '@/lib/billing/entitlements';
import { isTabVisible, hiddenTabCount, reveal, sanitizeRevealed, coreTabs, CORE_TABS, type DisclosureSignals } from '@/lib/nav/disclosure';
import AthensNow from './components/AthensNow';
import CashHero from './components/CashHero';
import RentReceived, { receivableLines } from './components/RentReceived';
import AgendaPanel from './components/AgendaPanel';
import AssistantStrip, { askAssistant } from './components/AssistantStrip';
import { cashPosition } from '@/lib/home/cash';
import { buildAgenda, type SetupLike as SetupStep } from '@/lib/home/agenda';
import { startPanel } from '@/lib/home/start';
import { computeObligations, type OblMaint } from './components/obligations';
import { taxProfileOf } from '@/lib/tax/greekTaxCalendar';
import PortalShare from './components/PortalShare';
import OccupancyPanel from './components/OccupancyPanel';
import BillingNudge from './components/BillingNudge';
import { athensToday, daysUntilOrNull, isoYear, isoMonth } from '@/lib/core/time';
// Το Αρχείο έχει ένα σπίτι: lib/data/documents.
import * as documents from '@/lib/data/documents';
import { saved, savedData } from '@/components/dbWrite';
import { logActivity } from '@/lib/activity';
import { useLoad } from '@/app/hooks/useLoad';

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
// Το `avg_amount` έφυγε: ΔΕΝ είναι στήλη κανενός πίνακα. Επειδή το ερώτημα
// κάνει `select('*')`, καμία 42703 δεν έσκαγε — απλώς ήταν πάντα undefined και
// το `b.avg_amount || b.amount` έδειχνε το ποσό του ΤΕΛΕΥΤΑΙΟΥ λογαριασμού κάτω
// από τον τίτλο «Μέσοι λογαριασμοί». Ο ιδιοκτήτης έβλεπε τον Ιανουάριο του
// ρεύματος, με τη θέρμανση μέσα και έχτιζε πάνω του ετήσιο προϋπολογισμό.
interface Bill     { id:string; type:string; amount:number; paid:boolean;
                     due_date?:string|null; name?:string|null; }
interface Task     { id:string; title:string; due_date:string|null; priority:string; completed:boolean; }
interface Tenant   { monthly_rent:number|null; lease_end:string|null; }
/** Το ενοίκιο και ο τρόπος είσπραξης, ανά ακίνητο του χαρτοφυλακίου. */
interface TenRow { property_id: string; monthly_rent: number | null; e_payment: boolean | null }
/** Ό,τι θέλει η Επισκόπηση από τον τρέχοντα μισθωτή, πέρα από το ενοίκιο. */
interface TenantFull { id?:string; lease_start:string|null; lease_end:string|null; e_payment?:boolean|null }

// ── Η ΡΑΜΠΑ ΤΗΣ ΚΑΤΑΣΤΑΣΗΣ, ΠΑΡΑΓΩΓΗ ΑΠΟ ΤΟ ΘΕΜΑ ────────────────────────────
// Επτά ομοιογενείς αποχρώσεις, από γεμάτο προς σβησμένο, στη λογική σειρά των
// καταστάσεων. Μονοχρωματικό, όχι φανάρι πολλών χρωμάτων.
//
// ΗΤΑΝ ΕΠΤΑ ΚΑΡΦΩΜΕΝΑ ΜΠΛΕ, χτισμένα γύρω από το accent του ΦΩΤΕΙΝΟΥ θέματος
// (#1a73e8). Στο σκοτεινό, το accent είναι #8ab4f8 και η ράμπα δεν το
// ακολουθούσε: η «Μακροχρόνια» έμενε βαθύ μπλε πάνω σε σκούρο φόντο και ήταν το
// ΜΟΝΟ σημασιολογικό χρώμα της εφαρμογής που δεν γύριζε με το θέμα.
//
// Το `color-mix` λύνει και τη φορά: στο φωτεινό η ανάμειξη με το φόντο δίνει πιο
// ανοιχτό, στο σκοτεινό πιο βαθύ. Η ΣΕΙΡΑ μένει η ίδια και στα δύο — «γεμάτο»
// προς «σβησμένο» — γιατί αυτό είναι το νόημα, όχι η συγκεκριμένη απόχρωση.
//
// Το κατώφλι είναι 40%: πιο κάτω η κουκκίδα χάνεται μέσα στην κάρτα.
//
// Οι ετικέτες και οι κανόνες της κατάστασης ζουν στο lib/property/status.ts:
// υπήρχαν ΔΥΟ στήλες για το ίδιο πράγμα (status_detail και rental_mode) που
// μπορούσαν να διαφωνήσουν. Εδώ μένει μόνο η όψη.
const statusShade = (weight: number) =>
  `color-mix(in srgb, var(--accent) ${weight}%, var(--bg-base))`;
const STATUS_COLORS: Record<PropertyStatus,string> = {
  rent_long: statusShade(100),
  rent_short:statusShade(90),
  vacant:    statusShade(80),
  own_use:   statusShade(70),
  renovation:statusShade(60),
  for_sale:  statusShade(50),
  disputed:  statusShade(40),
};
const PROP_TYPE_LABELS: Record<string,string> = {
  apartment:'Διαμέρισμα', house:'Μονοκατοικία', studio:'Στούντιο',
  maisonette:'Μεζονέτα', office:'Γραφείο', shop:'Κατάστημα',
  warehouse:'Αποθήκη', land:'Οικόπεδο', parking:'Parking',
  storage:'Αποθήκη κτιρίου', villa:'Βίλα', other:'Άλλο',
};


// Η ΣΕΙΡΑ ΕΙΝΑΙ ΤΟΥ ΜΕΝΟΥ, ΤΑ ΟΝΟΜΑΤΑ ΟΧΙ. Τα ονόματα ζουν στο lib/nav/labels.ts
// και τα διαβάζουν εξίσου ο βοηθός και η ατζέντα — αλλιώς η ίδια καρτέλα
// λεγόταν «Απόδοση» εδώ, «Αποδόσεις» στη Νόα και «Αποδόσεις» στην ατζέντα.
const NAV_ORDER = ['portfolio','overview','calendar','finances','accounting','loan',
  'tenant','pricing','clients','inventory','documents','checklist','roi','plan',
  'referral','settings'];
const NAV_ITEMS = NAV_ORDER.map(id => ({ id, label: navLabel(id) }));
const NAV_LABEL = NAV_LABELS;

// ═══ ΟΙ ΔΥΟ ΣΥΝΤΟΜΕΥΣΕΙΣ ΤΟΥ ΕΙΚΟΝΙΔΙΟΥ ΦΤΑΝΟΥΝ ΕΠΙΤΕΛΟΥΣ ΚΑΠΟΥ ═════════
//
// Το app/manifest.ts δηλώνει δύο συντομεύσεις για το μακρύ πάτημα στο εικονίδιο:
// «Σάρωση εγγράφου» (?action=scan) και «Δαπάνες» (?tab=finances). Ο πίνακας δεν
// διάβαζε ΚΑΝΕΝΑ κλειδί ερωτήματος, οπότε και οι δύο κατέληγαν στην Επισκόπηση:
// δύο υποσχέσεις γραμμένες στο λειτουργικό του χρήστη, καμία εκτελεσμένη. Ο
// ιδιοκτήτης που κρατά τον λογαριασμό της ΔΕΗ στο ένα χέρι πατούσε «Σάρωση» και
// έβλεπε αρχική οθόνη.
//
// ΓΙΑΤΙ ΕΔΩ ΚΑΙ ΟΧΙ ΣΕ EFFECT. Η συντόμευση είναι ψυχρή εκκίνηση: το λειτουργικό
// ανοίγει τη διεύθυνση από την αρχή, άρα η μετάφρασή της ανήκει στη φόρτωση της
// μονάδας, πριν αποδοθεί οτιδήποτε. Σε effect θα γινόταν μετά την πρώτη βαφή:
// ο χρήστης θα έβλεπε την Επισκόπηση για ένα καρέ και μετά την καρτέλα του.
//
// Η καρτέλα ζει στο hash (useNavHistory), γι' αυτό το `tab` ΜΕΤΑΦΡΑΖΕΤΑΙ σε hash
// αντί να διαβάζεται παράλληλα. Το `action` ανοίγει τη γρήγορη προσθήκη, που
// ούτως ή άλλως περιμένει επιλεγμένο ακίνητο.
function takeLaunchShortcut(): { scan: boolean } {
  if (typeof window === 'undefined') return { scan: false };
  const s = readLaunchShortcut(window.location.search, window.location.hash, NAV_ORDER);
  if (!s.consumed) return { scan: false };
  // Η διεύθυνση καθαρίζεται με replaceState: αλλιώς κάθε ανανέωση θα ξανάνοιγε
  // το παράθυρο σάρωσης και το «πίσω» θα κολλούσε στην ίδια συντόμευση.
  window.history.replaceState(null, '', window.location.pathname + s.search + (s.hash ?? window.location.hash));
  return { scan: s.scan };
}
const LAUNCH = takeLaunchShortcut();

// Εικονίδια πλοήγησης, καθαρή, γρήγορη οπτική αναγνώριση (ακόμη κι από άπειρο μάτι).
// Τέσσερα κλειδιά έφυγαν από εδώ: comparison, bills, expenses και contacts. Δεν
// αντιστοιχούσαν σε καμία καρτέλα του NAV_ITEMS και το `expenses` ήταν ακριβές
// αντίγραφο του `finances`. Ένα εικονίδιο χωρίς καρτέλα δεν αποδίδεται ποτέ,
// αλλά διαβάζεται από τον επόμενο σαν να υπάρχει η καρτέλα του.
const NAV_ICON: Record<string,string> = {
  portfolio: 'M4 5h6v6H4z|M14 5h6v6h-6z|M4 15h6v4H4z|M14 13h6v6h-6z',
  overview:  'M3 9.5 12 3l9 6.5|M5 10v10h14V10',
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
// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΜΕΝΟΥ ΕΙΝΑΙ ΜΙΑ ΛΙΣΤΑ. ΟΙ ΟΜΑΔΕΣ ΕΦΥΓΑΝ.
// ─────────────────────────────────────────────────────────────────────────
// ΗΤΑΝ ΟΚΤΩ ΟΜΑΔΕΣ ΚΑΙ ΔΥΟ ΟΝΟΜΑΤΑ. Εξι είχαν label: '' — δηλαδή δεν ήταν
// ομάδες, ήταν γραμμές. Δύο είχαν όνομα και πτύσσονταν. Ο χρήστης έβλεπε έξι
// ενότητες που μένουν πάντα ανοιχτές και δύο που παίζουν ακορντεόν μεταξύ
// τους, χωρίς να του έχει εξηγήσει κανείς τη διαφορά.
//
// ΚΑΙ ΟΙ ΟΜΑΔΕΣ ΔΕΝ ΜΠΟΡΟΥΣΑΝ ΝΑ ΓΕΜΙΣΟΥΝ. Το lib/property/visibility.ts τις
// αδειάζει εξ ορισμού: το `tenant` θέλει μακροχρόνια, τα `pricing`/`clients`
// βραχυχρόνια — αμοιβαία αποκλειόμενες. Η «Μίσθωση» έχει ΠΑΝΤΑ μία γραμμή,
// το πολύ δύο. Το `roi` και το `plan` δεν συνυπάρχουν ΠΟΤΕ (το λέει ήδη το
// παλιό σχόλιο: «ποτέ μαζί»). Μία ομάδα μπορούσε να φτάσει τρεις γραμμές.
//
// ΤΡΙΑ ΜΕΤΡΗΜΕΝΑ ΕΛΑΤΤΩΜΑΤΑ ΤΟΥ ΠΤΥΣΣΟΜΕΝΟΥ, ΚΑΙ ΤΑ ΤΡΙΑ ΣΙΩΠΗΛΑ:
//   1. Το έμβλημα της κλειστής ομάδας ήταν ΜΟΝΙΜΑ ΜΗΔΕΝ. Η `getBadge` απαντά
//      μόνο για `inventory` και `checklist` και κανένα από τα δύο δεν υπήρχε
//      ποτέ στα NAV_GROUPS. Η μοναδική αντιστάθμιση του «τι κρύβω» δεν
//      εμφανιζόταν ΠΟΤΕ.
//   2. Το ακορντεόν έκρυβε και την ΕΝΕΡΓΗ καρτέλα. Το φίλτρο κρατούσε ρητά το
//      `id===nav`, αλλά η απόδοση γινόταν μέσα σε `{open && items.map(...)}`:
//      με ανοιχτά τα «Οικονομικά» και τον χρήστη στον «Ενοικιαστή», η μπάρα
//      σταματούσε να δείχνει πού βρίσκεται.
//   3. Η αρχική τιμή ήταν 'Οικονομικά'. Δηλαδή την ΠΡΩΤΗ μέρα η μπάρα έκρυβε
//      τον «Ενοικιαστή» — τη μία γραμμή που δικαιολογεί τη συνδρομή.
//
// Το κέρδος χώρου ήταν 46px στην καλύτερη περίπτωση, με μόνιμο κόστος 88px
// κεφαλίδων και δύο επιπλέον στόχους αφής. Ο χώρος δεν τρωγόταν από τις
// καρτέλες· τρωγόταν από τη λίστα ακινήτων, που έφυγε στην πάνω μπάρα.
//
// ΤΑ ΤΡΙΑ ΜΠΛΟΚ. Το μόνο ερώτημα που ο χρήστης απαντά χωρίς να του το εξηγήσει
// κανείς είναι «αφορά το ακίνητο που γράφει η κεφαλίδα, ή τον λογαριασμό μου;».
// Πάνω ό,τι βλέπει ΟΛΑ τα ακίνητα, στη μέση οι οθόνες ΑΥΤΟΥ του ακινήτου, κάτω
// ό,τι είναι δικό μου. Χωρίζονται με μία γραμμή του ενός εικονοστοιχείου, όχι
// με κεφαλίδα των 44. Η ταξινόμηση κατά θέμα («Οικονομικά», «Μίσθωση») είναι
// ερώτηση βιβλιοθηκονόμου: κανείς δεν σκέφτεται «πάω στα Οικονομικά και μετά
// στις Δαπάνες» — σκέφτεται «Δαπάνες».
//
// Η «Επισκόπηση» ΑΠΟΚΤΑ ΓΡΑΜΜΗ, πρώτη. Είναι βασική καρτέλα, είναι ο
// προορισμός του «πίσω» και το καταφύγιο του `navSafe` και σε desktop ο μόνος
// της δρόμος ήταν το λογότυπο — κουμπί χωρίς καμία ένδειξη ότι είσαι εκεί.
// ═══════════════════════════════════════════════════════════════════════════
const NAV_GROUPS: { label: string; ids: string[] }[] = [
  // Η μεγάλη εικόνα: όλα τα ακίνητα μαζί. Μόνο ο επαγγελματίας τη φτάνει.
  { label: '', ids: ['portfolio'] },
  // ── Η ΣΕΙΡΑ ΕΙΝΑΙ ΑΦΗΓΗΣΗ, ΚΑΙ ΠΡΟΣΑΡΜΟΖΕΤΑΙ ΧΩΡΙΣ ΝΑ ΑΝΑΚΑΤΕΥΕΤΑΙ ─────────
  //
  //   πού είμαι → τι τρέχει → τι μπαίνει → τι βγαίνει → τι χρωστάω → τα χαρτιά
  //
  // Η ΠΑΛΙΑ ΣΕΙΡΑ ΕΒΑΖΕ ΤΑ ΕΞΟΔΑ ΠΡΙΝ ΤΟ ΕΣΟΔΟ. Ο ιδιοκτήτης δεν σκέφτεται
  // έτσι: πρώτα «πληρώθηκε το ενοίκιο;» και μετά «τι πλήρωσα». Ηταν σειρά
  // ιστορική, όχι σχεδιασμένη.
  //
  // ΚΑΙ ΓΙΑΤΙ ΔΕΝ ΑΛΛΑΖΕΙ Η ΣΕΙΡΑ ΑΝΑ ΚΑΤΑΣΤΑΣΗ. Το πιο δυνατό χαρακτηριστικό
  // μιας κάθετης μπάρας είναι η ΘΕΣΗ: μετά από μια βδομάδα το χέρι πάει στη
  // «Λογιστική» χωρίς να τη διαβάσει το μάτι. Μενού που ξαναδιατάσσεται όταν
  // αλλάζεις ακίνητο σβήνει ακριβώς αυτό.
  //
  // Δεν χρειάζεται κιόλας: οι καρτέλες που ΔΕΝ αφορούν την κατάσταση δεν
  // εμφανίζονται καθόλου (lib/property/visibility.ts), οπότε ο ΙΔΙΟΣ στατικός
  // πίνακας παράγει ΕΠΤΑ διαφορετικά μενού. Μετρημένο, εκτελώντας το
  // tabDecision για κάθε κατάσταση:
  //
  //   μακροχρόνια  Επισκόπηση · Ημερολόγιο · ΕΝΟΙΚΙΑΣΤΗΣ · Δαπάνες · Λογιστική
  //                · Δάνειο · Φάκελος · Απόδοση
  //   βραχυχρόνια  Επισκόπηση · Ημερολόγιο · ΒΡΑΧΥΧΡΟΝΙΑ · ΕΠΙΣΚΕΠΤΕΣ · Δαπάνες
  //                · Λογιστική · Δάνειο · Φάκελος · Απόδοση
  //   κενό         Επισκόπηση · Ημερολόγιο · ΑΞΙΟΠΟΙΗΣΗ · Δαπάνες · Λογιστική
  //                · Δάνειο · Φάκελος
  //   ιδιοχρησία   Επισκόπηση · Ημερολόγιο · Δαπάνες · Λογιστική · Δάνειο · Φάκελος
  //
  // Η τρίτη γραμμή είναι ΠΑΝΤΑ αυτό που η κατάσταση κάνει επείγον, χωρίς καμία
  // γραμμή να μετακινηθεί. Η «Απόδοση» κλείνει τη λίστα μόνο όπου υπάρχει
  // πραγματικό έσοδο· η «Αξιοποίηση» παίρνει τη θέση της εισοδηματικής όταν δεν
  // υπάρχει, γιατί τότε ΕΚΕΙΝΗ είναι η ερώτηση της ημέρας.
  { label: '', ids: ['overview','calendar','tenant','pricing','clients','plan',
                     'finances','accounting','loan','documents','roi'] },
  // Ο,τι είναι δικό μου και όχι του ακινήτου. Ο «Λογαριασμός» ΔΕΝ είναι εδώ:
  // η γραμμή του χρήστη στο υποσέλιδο είναι η μία του πόρτα.
  { label: '', ids: ['referral'] },
];


// Καρτέλες που ΔΕΝ περνούν από τη σταδιακή αποκάλυψη (lib/nav/disclosure.ts).
// Ο κανόνας τους είναι η ίδια η κατάσταση του ακινήτου και η μηχανή ορατότητας τον
// ξέρει ήδη: όταν αυτή τις ανάβει, είναι ακριβώς αυτό που χρειάζεται ο χρήστης τώρα.
// Αν περνούσαν κι από την αποκάλυψη, ο ιδιοκτήτης ενός κενού ακινήτου δεν θα έβλεπε
// ποτέ το «Σχέδιο»: θα έπρεπε πρώτα να επισκεφθεί μια καρτέλα που δεν εμφανίζεται.
//
// Οι τρεις που προστέθηκαν είχαν ΤΟΝ ΙΔΙΟ κανόνα γραμμένο και στα δύο αρχεία:
// Τιμολόγηση (βραχυχρόνια), Αποδόσεις (εκμισθώνεται), Σύγκριση (δύο ακίνητα).
// Το αντίγραφο στην αποκάλυψη έφυγε — εδώ δηλώνεται ότι την απόφαση την παίρνει
// η κατάσταση. Η εμφάνιση δεν αλλάζει: οι δύο κανόνες έλεγαν το ίδιο πράγμα και
// η πλοήγηση τους συνδύαζε ούτως ή άλλως με «και».
//
// ΤΟ ΣΥΝΟΛΟ ΕΙΧΕ ΜΕΙΝΕΙ ΜΕ ΕΝΑ ΜΕΛΟΣ, ΚΑΙ ΔΥΟ ΚΑΡΤΕΛΕΣ ΗΤΑΝ ΑΠΡΟΣΙΤΕΣ.
// Το σχόλιο έλεγε ότι η Τιμολόγηση και η Αξιοποίηση «συγχωνεύτηκαν» αλλού. Δεν
// συγχωνεύτηκαν: και οι δύο στέκουν στο μενού. Επειδή όμως έφυγαν από τους
// κανόνες σήματος της αποκάλυψης ΚΑΙ δεν μπήκαν εδώ, το `isTabVisible`
// επέστρεφε ψευδές μέχρι ο χρήστης «να τις έχει ήδη επισκεφθεί» — και ο μόνος
// δρόμος επίσκεψης ήταν το μενού, όπου δεν εμφανίζονταν.
//
// Δηλαδή: ο ιδιοκτήτης κενού ακινήτου δεν έβλεπε ΠΟΤΕ την Αξιοποίηση και ο
// ιδιοκτήτης με Airbnb δεν έβλεπε ΠΟΤΕ τη Βραχυχρόνια. Τα δύο εργαλεία που τους
// αφορούν περισσότερο από κάθε άλλο, γραμμένα και απρόσιτα — ακριβώς το σφάλμα
// που περιγράφει το σχόλιο τριάντα γραμμές πιο πάνω, ξαναζωντανό.
const SELF_DISCLOSING = new Set(['roi', 'pricing', 'plan']);

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
// Το «Αρχείο» δεν χάνεται: μένει ένα άγγιγμα πιο μακριά και η ΚΑΤΑΓΡΑΦΗ
// εγγράφου — που είναι η πραγματική δουλειά στο κινητό — γίνεται ούτως ή άλλως
// από τη γρήγορη καταχώρηση με φωτογραφία και από τον βοηθό, όχι από εδώ.
//
// Παράγοντάς τη, τα ονόματα και τα εικονίδια δεν ξαναγράφονται: έρχονται από
// NAV_LABEL/NAV_ICON. Πριν, το ίδιο εικονίδιο υπήρχε δύο φορές στο αρχείο.
const BOTTOM_NAV = [
  ...CORE_TABS
    .filter(id => id !== 'settings')   // ο λογαριασμός ζει στο υποσέλιδο της πλαϊνής μπάρας
    .slice(0, 4)
    .map(id => ({ id, label: NAV_LABEL[id], icon: ic(NAV_ICON[id]) })),
  { id:'more', label:'Μενού', icon: ic('M4 6h16|M4 12h16|M4 18h16') },
];

// ═══ ΔΥΟ ΤΥΠΟΙ ΠΟΣΟΥ ΣΤΗΝ ΙΔΙΑ ΕΦΑΡΜΟΓΗ, ΚΑΙ Ο ΕΝΑΣ ΕΒΓΑΖΕ ΠΑΥΛΑ ══════════
// Ο τοπικός `fmtEur` έγραφε ακέραια ευρώ («1.234 €») ενώ ο κοινός `fe` γράφει
// πάντα δύο δεκαδικά («1.234,50 €»): στην ΙΔΙΑ οθόνη, το πλακίδιο «Δαπάνες»
// στοιχιζόταν αλλού από το «Καθαρό αποτέλεσμα». Και για `null` επέστρεφε «—»,
// δηλαδή σύμβολο σε θέση ποσού, σε δεκαοκτώ σημεία της Επισκόπησης.
// Ο κοινός τύπος τα λύνει και τα δύο: `feOr` γράφει «0,00 €» για το άγνωστο.
const fmtEur = feOr;

// MD3 form styles

// Επιστρέφει και το ΠΛΗΘΟΣ αντικειμένων, όχι μόνο τις ειδοποιήσεις: το ερώτημα
// τα φέρνει ούτως ή άλλως και χωρίς αυτό η καρτέλα «Έπιπλα και εξοπλισμός»
// κρύβεται με τα δεδομένα μέσα (βλ. σχόλιο στο tabDecision).
function useInventoryAlerts(propertyId: string | null, userId: string | null) {
  const [alertCount, setAlertCount] = useState(0);
  const [itemCount, setItemCount] = useState(0);
  const supabase = createClient();
  useEffect(() => {
    if (!propertyId || !userId) return;
    const check = async () => {
      const items = await inventory.ofProperty<{ warranty_expiry: string | null; condition: string | null; purchase_date: string | null }>(supabase, propertyId, 'warranty_expiry,condition,purchase_date', userId);
      const { data: schedules } = await supabase.from('inventory_maintenance').select('next_due').eq('property_id', propertyId);
      if (!items) return;
      setItemCount(items.length);
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
  return { alertCount, itemCount };
}

function useChecklistAlerts(propertyId: string | null) {
  const [alertCount, setAlertCount] = useState(0);
  const supabase = createClient();
  useEffect(() => {
    if (!propertyId) return;
    const check = async () => {
      const data = await checklist.open<{ due_date: string | null; status: string | null; priority: string | null }>(
        supabase, propertyId, checklist.AGENDA_COLUMNS);
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

// Το CopyInventoryModal έφυγε ολόκληρο. Η αντιγραφή απογραφής από άλλο ακίνητο
// ζούσε σε ΔΥΟ σημεία: εδώ, ως modal που άνοιγε από κουμπί της καθολικής μπάρας,
// και μέσα στην ίδια την απογραφή, ως επιλογή που φαινόταν μόνο όταν δεν είχες
// κανένα αντικείμενο. Μία πράξη, δύο υλοποιήσεις, δύο διαφορετικές στιγμές
// εμφάνισης. Έμεινε εκείνη που ζει δίπλα στα δεδομένα που αντιγράφει.

// Ο ΚΑΝΟΝΑΣ ΔΕΝ ΚΡΕΜΕΤΑΙ ΠΛΕΟΝ ΑΠΟ ΤΗ ΔΙΑΤΥΠΩΣΗ ΤΗΣ ΕΤΙΚΕΤΑΣ.
// Ήταν `new Set(['Μηνιαίο Ενοίκιο', …])` και το φίλτρο έψαχνε το κείμενο που
// βλέπει ο χρήστης. Μια αλλαγή κεφαλαίου —«Μηνιαίο ενοίκιο»— και τα πλακίδια
// απόδοσης θα ξαναεμφανίζονταν σιωπηλά σε κενό ακίνητο, με ποσοστά βγαλμένα
// από ενοίκιο-στόχο που δεν εισπράχθηκε ποτέ. Κανένα τεστ δεν θα το έπιανε,
// γιατί τίποτα δεν θα είχε «σπάσει». Τώρα η σήμανση είναι δεδομένο του
// πλακιδίου (`incomeOnly`), όχι σύμπτωση κειμένου.

function OverviewTab({ prop, properties, userId, onNavigate, tabVisible }: { prop: Property;
  /** ΟΛΑ τα ακίνητα του χρήστη — χρειάζονται για τον φόρο: η κλίμακα των ενοικίων
   *  είναι προοδευτική στο σύνολο του φορολογούμενου, όχι ανά ακίνητο. */
  properties: Property[];
  // ΤΟ ΟΝΟΜΑ ΙΔΙΟΚΤΗΤΗ ΕΦΥΓΕ ΑΠΟ ΕΔΩ. Περνούσε ως prop μαζί με χειριστή
  // αποθήκευσης και ΚΑΝΕΝΑ από τα δύο δεν χρησιμοποιήθηκε ποτέ μέσα στο σώμα:
  // η οθόνη δεν το έδειχνε και δεν το άλλαζε. Το όνομα ζει στο
  // `property_settings.owner_name`, όπου το γράφει ο οδηγός προσθήκης ακινήτου
  // και το διαβάζουν τα επίσημα έγγραφα και η δήλωση μίσθωσης.
  userId: string; onNavigate: (tab: string) => void;
  /** Οδηγεί κάπου αυτό το βήμα; Βήμα που δείχνει σε καρτέλα η οποία δεν αφορά τον
   *  χρήστη είναι νεκρός σύνδεσμος: το πάτημα θα τον γύριζε στην Επισκόπηση. */
  tabVisible: (id: string) => boolean }) {
  const supabase = createClient();
  const branding = useReportBranding(userId);
  const { prefs } = useAppPreferences(prop.id);
  // ΤΟ ΕΤΟΣ ΕΒΓΑΙΝΕ ΑΠΟ ΤΟ ΡΟΛΟΙ ΤΟΥ ΠΕΡΙΗΓΗΤΗ, ΟΧΙ ΑΠΟ ΤΗΝ ΑΘΗΝΑ. Στις 31
  // Δεκεμβρίου, 19:00 Νέα Υόρκη, στην Αθήνα είναι ήδη 1η Ιανουαρίου: η ίδια
  // οθόνη έγραφε «Η χρονιά 2026» και φόρτωνε δαπάνες 2026, ενώ το ημερολόγιο
  // δίπλα της — που χρησιμοποιεί σωστά την `athensToday` — ήταν ήδη στο 2027.
  // Δύο πάνελ, μία οθόνη, δύο φορολογικά έτη. Ο Έλληνας ιδιοκτήτης στο εξωτερικό
  // δεν είναι ακραία περίπτωση· είναι μεγάλο κομμάτι του κοινού.
  const todayAthens = athensToday();
  const year = Number(todayAthens.slice(0, 4)); const month = Number(todayAthens.slice(5, 7));
  // Το στιγμιότυπο χρόνου μένει για όσα το θέλουν ως Date (insights, υποχρεώσεις):
  // εκείνα συγκρίνουν αποστάσεις, όχι ημερολογιακό έτος, οπότε η ζώνη δεν κρίνει.
  const now = new Date();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allExpenses, setAllExpenses] = useState<{ amount:number; date:string; category:string; is_recurring?:boolean; recurring_frequency?:string|null }[]>([]);
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
  // Το ΤΑΜΕΙΟ: περίοδοι ενοικίου και συντηρήσεις εξοπλισμού. Διαβάζονται ΕΔΩ και
  // όχι σε δικό τους panel, γιατί τροφοδοτούν την ΕΝΙΑΙΑ λίστα «τι χρειάζεται
  // τώρα» — αν κάθε κάρτα διάβαζε τα δικά της, θα ξαναγεννιόνταν τα διπλότυπα.
  const [rentPeriods, setRentPeriods] = useState<{ id:string|null; amount:number|null; due_date:string|null; paid:boolean|null; period_year:number|null; period_month:number|null }[]>([]);
  const [maint, setMaint] = useState<OblMaint[]>([]);
  /** Πότε καταγράφηκε η υποβολή της δήλωσης μίσθωσης· κλείνει την υποχρέωση. */
  const [leaseDeclaredAt, setLeaseDeclaredAt] = useState<string|null>(null);
  const [tenantFull, setTenantFull] = useState<TenantFull | null>(null);
  // Ενοίκια ΟΛΩΝ των ακινήτων (μισθωτήρια + ρυθμίσεις ενοικίου), για τον
  // προοδευτικό φόρο σε επίπεδο φορολογούμενου.
  // Ο ΤΡΟΠΟΣ ΕΙΣΠΡΑΞΗΣ ΤΑΞΙΔΕΥΕΙ ΜΑΖΙ ΜΕ ΤΟ ΕΝΟΙΚΙΟ.
  // Από 1/1/2026 (ν.5246/2025) η τεκμαρτή έκπτωση 5% προϋποθέτει είσπραξη μέσω
  // τραπέζης· με μετρητά ο φόρος υπολογίζεται στο 100% του ενοικίου. Ο χρήστης
  // το δηλώνει ήδη στην καρτέλα Ενοικιαστή (`tenants.e_payment`), αλλά η
  // Επισκόπηση δεν το ρωτούσε καν — έδινε πάντα την έκπτωση.
  const [portfolioRents, setPortfolioRents] = useState<{ property_id:string; monthly:number; viaBank:boolean }[]>([]);
  // Ο ΔΕΙΚΤΗΣ ΦΟΡΤΩΣΗΣ ΔΕΝ ΕΙΝΑΙ ΞΕΧΩΡΙΣΤΗ ΚΑΤΑΣΤΑΣΗ, ΕΙΝΑΙ ΕΡΩΤΗΣΗ. Ηταν
  // `setLoading(true)` στην πρώτη γραμμή της φόρτωσης: σύγχρονη γραφή μέσα σε
  // effect, δηλαδή δεύτερη απόδοση πριν καν φύγει το αίτημα. Η ερώτηση που ΟΝΤΩΣ
  // απαντά είναι «τα δεδομένα που κρατώ είναι αυτού του ακινήτου και αυτής της
  // χρονιάς;» και απαντιέται κατά την απόδοση. Με την αλλαγή ακινήτου γίνεται
  // αληθής ΑΜΕΣΩΣ, οπότε δεν φαίνεται ποτέ καρέ με τα νούμερα του προηγούμενου.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loading = loadedFor !== `${prop.id}|${year}`;
  /** Ανοιχτό παράθυρο είσπραξης ενοικίου από την κάρτα του Ταμείου. */
  const [receivingRent, setReceivingRent] = useState(false);

  const propIds = useMemo(() => properties.map(p => p.id), [properties]);

  const load = useCallback(async () => {
    const [exp,bil,{ data:tsk },ten,ci,iv,ln,hs,allExp,allTen,{ data:allRc },rp,{ data:mnt },{ data:decl }] = await Promise.all([
      expenseStore.ledger(supabase,prop.id,{ userId, from:`${year}-01-01`, columns:'*' }),
      billStore.ofProperty<Bill>(supabase,prop.id,'*',userId),
      // Δεν είναι πια πέντε για μια χωριστή κάρτα: τροφοδοτούν την ΕΝΙΑΙΑ
      // ατζέντα, που τις ταξινομεί μαζί με όλα τα υπόλοιπα κατά προθεσμία.
      supabase.from('maintenance_tasks').select('*').eq('property_id',prop.id).eq('user_id',userId).eq('completed',false).order('due_date').limit(60),
      tenantStore.currentAll<Tenant & TenantFull>(supabase,prop.id,'id,monthly_rent,lease_start,lease_end,e_payment',userId),
      checklist.open<{ due_date:string|null; status:string; priority:string }>(supabase,prop.id,checklist.AGENDA_COLUMNS,userId),
      inventory.ofProperty<{ name?:string|null; warranty_expiry:string|null; condition:string|null }>(supabase,prop.id,'name,warranty_expiry,condition',userId),
      loanStore.ofProperty(supabase,prop.id,userId),
      stayStore.ofProperty<{ check_in:string|null; check_out:string|null; total:number|null; nights:number|null; nightly_rate:number|null }>(supabase,prop.id,'check_in,check_out,total,nights,nightly_rate',userId),
      // Χωριστά: ΟΛΕΣ οι δαπάνες (κάθε έτους) για το γράφημα με επιλογή έτους.
      // Οι επαναλαμβανόμενες (πάγιες) προβάλλονται στους επόμενους μήνες/έτη.
      expenseStore.ledger(supabase,prop.id,{ userId, columns:'amount,date,category,is_recurring,recurring_frequency' }),
      // Μόνο πλήθη (head) για τα πλακίδια-σύνοψη Επαφές / Αρχείο.
      // ΟΛΟ το χαρτοφυλάκιο: ο φόρος ενοικίων είναι προοδευτικός στο ΣΥΝΟΛΟ (Ε1),
      // οπότε δεν αρκούν τα δεδομένα του επιλεγμένου ακινήτου. Ίδια σειρά
      // προτεραιότητας με το resolveRent: μισθωτήριο → actual → target → ακίνητο.
      tenantStore.ofUser<TenRow & tenantStore.TenantStatus>(supabase,userId,'monthly_rent,property_id,e_payment,status,move_out_date'),
      supabase.from('rent_config').select('property_id,actual_rent,target_rent').in('property_id',propIds).eq('user_id',userId),
      // ΤΟ ΤΑΜΕΙΟ. Μόνο οι ΑΠΛΗΡΩΤΕΣ περίοδοι — οι πληρωμένες είναι ιστορικό και
      // ζουν στον Ενοικιαστή. Ό,τι δεν εμφανίζεται, δεν κατεβαίνει.
      // ΚΑΙ ΤΟ `id`: με αυτό η κάρτα του Ταμείου εισπράττει επιτόπου, αντί να
      // στέλνει τον ιδιοκτήτη να ξαναβρεί τη δόση που μόλις του έδειξε.
      rentStore.ofProperty<{ id:string|null; amount:number|null; due_date:string|null; paid:boolean|null; period_year:number|null; period_month:number|null }>(supabase,prop.id,'id,amount,due_date,paid,period_year,period_month',userId,{ paid:false }),
      supabase.from('inventory_maintenance').select('task,item_name,next_due,est_cost').eq('property_id',prop.id),
      // ΠΟΤΕ ΚΑΤΑΓΡΑΦΗΚΕ Η ΔΗΛΩΣΗ ΜΙΣΘΩΣΗΣ. Η υποχρέωση εμφανιζόταν για ενενήντα
      // μέρες γύρω από την προθεσμία ασχέτως υποβολής, ενώ υποβάλλεται μία φορά.
      // Το LeaseDeclaration γράφει ήδη εδώ· έλειπε μόνο η ανάγνωση.
      supabase.from('activity_log').select('created_at')
        .eq('user_id',userId).eq('action','lease_declaration_submitted').eq('entity_id',prop.id)
        .order('created_at',{ascending:false}).limit(1),
    ]);
    setExpenses((exp||[]) as Expense[]); setBills(bil); setTasks(tsk||[]); setTenant(ten?.[0]||null);
    setRentPeriods(rp); setMaint((mnt||[]) as OblMaint[]); setTenantFull(ten?.[0]||null);
    setLeaseDeclaredAt((decl?.[0]?.created_at as string|undefined) ?? null);
    setChk(ci); setInv(iv); setLoans(ln); setHostStays(hs); setAllExpenses((allExp||[]) as { amount:number; date:string; category:string; is_recurring?:boolean; recurring_frequency?:string|null }[]);
    // ΑΚΡΙΒΩΣ οι στήλες του select('property_id,actual_rent,target_rent') — όχι
    // ολόκληρη η γραμμή του rent_config. Με `any` το `r.property_id` δεν
    // ελεγχόταν καν ως όνομα στήλης.
    // Το `property_id` είναι nullable στο σχήμα (rent_config.property_id uuid,
    // χωρίς NOT NULL — baseline.sql:2722 / RentConfigRow, tables.ts:1018), άρα ο
    // χάρτης συμπεραινόταν ως `Map<string|null, …>`. Η ορφανή ρύθμιση με κλειδί
    // `null` ΔΕΝ επιστρεφόταν ποτέ από το `get(p.id)` παρακάτω (το p.id είναι
    // πάντα string) — ο κίνδυνος είναι ότι ο τύπος του κλειδιού ΕΠΕΤΡΕΠΕ να
    // ρωτήσει κάποιος αργότερα με μια nullable τιμή και να πάρει τη ρύθμιση
    // λάθος ακινήτου. Το κλειδί δηλώνεται `string` και οι ορφανές πετιούνται.
    type RcRow = { property_id: string | null; actual_rent: number | null; target_rent: number | null };
    const rcById = new Map<string, RcRow>();
    ((allRc||[]) as RcRow[]).forEach(r => { if (r.property_id) rcById.set(r.property_id, r); });
    // Κρατάμε τον ΜΕΓΑΛΥΤΕΡΟ ενοικιαστή ανά ακίνητο, μαζί με τον τρόπο είσπραξής
    // ΤΟΥ: αλλιώς θα ζευγαρώναμε το ενοίκιο του ενός με τη δήλωση του άλλου.
    // `e_payment !== false` και όχι `=== true`: κενή στήλη σημαίνει «δεν το έχει
    // δηλώσει» και η προεπιλογή της ίδιας της φόρμας είναι τραπεζική είσπραξη.
    // ΚΑΙ ΜΟΝΟ ΟΣΟΙ ΜΕΝΟΥΝ ΑΚΟΜΗ. Εδώ δεν υπήρχε κανένα φίλτρο κατάστασης: το
    // ενοίκιο μισθωτή που έφυγε πέρσι έμπαινε στη φορολογική ενοποίηση όλου του
    // χαρτοφυλακίου και μαζί του ο τρόπος είσπραξής του.
    const tenById = new Map<string,{ monthly:number; viaBank:boolean }>();
    allTen.filter(t=>!tenantStore.hasLeft(t)).forEach(t=>{
      const v = Number(t.monthly_rent)||0;
      if (v > (tenById.get(t.property_id)?.monthly ?? 0)) tenById.set(t.property_id, { monthly: v, viaBank: t.e_payment !== false });
    });
    setPortfolioRents(properties.map(p => {
      const rc = rcById.get(p.id);
      const fromTenant = tenById.get(p.id);
      const monthly = fromTenant?.monthly || Number(rc?.actual_rent) || Number(rc?.target_rent) || Number(p.target_rent) || 0;
      // Χωρίς ενοικιαστή δεν υπάρχει δηλωμένος τρόπος είσπραξης: το ενοίκιο
      // είναι στόχος, όχι πραγματική είσπραξη και η προεπιλογή είναι τράπεζα.
      return { property_id: p.id, monthly, viaBank: fromTenant?.viaBank ?? true };
    }));
    setLoadedFor(`${prop.id}|${year}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prop.id, userId, year, propIds]);

  // Η ΣΗΜΑΙΑ ΦΟΡΤΩΣΗΣ ΜΠΑΙΝΕΙ ΜΕΣΑ ΣΤΗΝ ΑΛΥΣΙΔΑ, ΟΧΙ ΠΡΙΝ ΑΠΟ ΑΥΤΗΝ. Γραμμένη
  // στο σώμα του effect, προκαλεί δεύτερη απόδοση ΠΡΙΝ καν ξεκινήσει το αίτημα.
  // Μέσα στην ασύγχρονη συνάρτηση κάνει την ίδια δουλειά, χωρίς την επιπλέον
  // απόδοση και σταματά να ενοχλεί τον κανόνα set-state-in-effect.
  // Η πρώτη φόρτωση δεν ανήκει στο effect του καναλιού: δύο δουλειές, δύο σώματα.
  useLoad(load);

  useEffect(() => {
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

  // ── ΜΙΑ ΔΑΠΑΝΗ, ΕΝΑ ΣΥΝΟΛΟ, ΣΕ ΟΛΕΣ ΤΙΣ ΟΘΟΝΕΣ ──────────────────────────
  // Εδώ αθροίζονταν ΜΟΝΟ οι γραμμές του πίνακα `expenses`. Ο απλήρωτος
  // λογαριασμός όμως δεν έχει δαπάνη πίσω του — η δαπάνη γεννιέται στην πληρωμή.
  // Άρα το ίδιο ευρώ μετρούσε στις «Δαπάνες» και στη «Σύγκριση», δεν μετρούσε
  // εδώ, αλλά μετρούσε στο «Χρωστάω» της ΙΔΙΑΣ οθόνης, τετρακόσια εικονοστοιχεία
  // πιο πάνω. Το lib/expenses/ledger.ts γράφτηκε ακριβώς γι’ αυτό, με το σχόλιο
  // «τρεις οθόνες, τρία διαφορετικά σύνολα» — και η Επισκόπηση δεν το κάλεσε ποτέ.
  const ledger = useMemo(() => mergeLedger(bills, expenses), [bills, expenses]);
  // ΤΟ ΕΤΟΣ ΚΟΒΕΤΑΙ ΕΔΩ, ΓΙΑΤΙ ΤΟ ΕΡΩΤΗΜΑ ΤΩΝ ΛΟΓΑΡΙΑΣΜΩΝ ΔΕΝ ΤΟ ΚΟΒΕΙ.
  // Οι δαπάνες ζητούνται με `gte('date', 1η Ιανουαρίου)`· οι λογαριασμοί χωρίς
  // κανένα φίλτρο. Άρα το «ως σήμερα» του 2026 περιείχε και απλήρωτο λογαριασμό
  // του 2024. Το φίλτρο μπαίνει πάνω στο ημερολόγιο και όχι στο ερώτημα, ώστε να
  // χρησιμοποιεί ΤΗΝ ΙΔΙΑ ημερομηνία που μετρά το ίδιο το ημερολόγιο — ο
  // λογαριασμός χωρίς προθεσμία παίρνει την ημερομηνία δημιουργίας, κάτι που
  // ένα `gte('due_date')` στον διακομιστή θα το πετούσε σιωπηλά έξω.
  const entriesOfYear = useMemo(
    () => ledger.entries.filter(e => e.date.startsWith(`${year}-`)), [ledger.entries, year]);
  const totalExpYTD = ledgerTotal(entriesOfYear);
  // Οι λογαριασμοί που ΔΕΝ έχουν ακόμη δαπάνη από πίσω τους (απλήρωτοι): είναι
  // πραγματικό κόστος του έτους και λείπουν από τον πίνακα `expenses`.
  const unbilledOfYear = ledgerTotal(entriesOfYear.filter(e => !e.expenseId));
  // Οι πέντε μεγαλύτερες κατηγορίες του έτους, για την αναφορά PDF. Παράγονται
  // από το ΙΔΙΟ ημερολόγιο με το ποσό που τυπώνεται δίπλα τους — πριν έβγαιναν
  // από τον σκέτο πίνακα δαπανών, οπότε το άθροισμα των γραμμών δεν έβγαζε το
  // σύνολο που έγραφε η ίδια η αναφορά από πάνω.
  const catEntries = useMemo(() => {
    const m: Record<string, number> = {};
    entriesOfYear.forEach(e => { m[e.category] = (m[e.category] || 0) + e.amount; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [entriesOfYear]);
  // ΤΑΣΗ ΔΑΠΑΝΩΝ: ΙΔΙΟ ΔΙΑΣΤΗΜΑ, ΟΧΙ ΟΛΟΚΛΗΡΟ ΤΟ ΠΡΟΗΓΟΥΜΕΝΟ ΕΤΟΣ.
  // Πριν, το YTD (π.χ. δύο μήνες) συγκρινόταν με τους δώδεκα μήνες της περσινής
  // χρονιάς, οπότε κάθε Φεβρουάριο ο χρήστης διάβαζε «−78% σε σχέση με πέρσι» —
  // αριθμός που δεν έλεγε τίποτα για τη συμπεριφορά του, μόνο ότι ο χρόνος μόλις
  // ξεκίνησε. Τώρα συγκρίνονται Ιαν–τρέχων μήνας με Ιαν–ίδιο μήνα πέρσι.
  // Η ΧΡΟΝΙΑ ΚΑΙ Ο ΜΗΝΑΣ ΔΙΑΒΑΖΟΝΤΑΙ ΩΣ ΚΕΙΜΕΝΟ. Εδώ γραφόταν
  // `new Date(e.date).getFullYear()`: ανάγνωση σε UTC, ερώτηση σε τοπική ώρα.
  // Η δαπάνη της 1ης Ιανουαρίου έφευγε από τη χρονιά της για κάθε χρήστη σε
  // ζώνη με αρνητική απόκλιση — και ο κώδικας τρέχει στον περιηγητή ΤΟΥ.
  const expThisY = allExpenses.filter(e => isoYear(e.date) === year).reduce((s,e)=>s+e.amount,0);
  const expPrevSame = allExpenses.filter(e => isoYear(e.date) === year-1 && (isoMonth(e.date) ?? 13) <= month).reduce((s,e)=>s+e.amount,0);
  const expDeltaPct = expPrevSame > 0 ? Math.round((expThisY - expPrevSame)/expPrevSame*100) : null;
  // Διαχωρισμός πληρωμένων/εκκρεμών: το σύνολο (accrual) οδηγεί την απόδοση, αλλά
  // δείχνουμε ξεχωριστά τι έχει πληρωθεί και τι εκκρεμεί (π.χ. σαρωμένοι λογαριασμοί).
  // Single source of truth: ίδιος υπολογισμός ενοικίου/αξίας/απόδοσης παντού.
  const rent = resolveRent({ tenantRent: tenant?.monthly_rent, targetRent: prop.target_rent }).value;
  const propValue = resolveValue(prop.value, prop.obj_value).value;
  const { annualRent, grossYield, netYield } = computeYields(rent, propValue, totalExpYTD);
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
  // Ο ΥΠΟΛΟΓΙΣΜΟΣ ΤΟΥ ΓΡΑΦΗΜΑΤΟΣ ΕΦΥΓΕ ΜΑΖΙ ΜΕ ΤΟ ΓΡΑΦΗΜΑ: δύο κατάλογοι μηνών,
  // δώδεκα αθροίσματα, κατηγορίες επιλεγμένου μήνα και κατάλογος ετών — σαράντα
  // γραμμές που τροφοδοτούσαν δύο κάρτες οι οποίες έλεγαν ό,τι λέει ήδη ο
  // Προϋπολογισμός. Το `occMonths` μένει: το χρειάζεται η ετήσια προβολή πιο κάτω.
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

  // ── ΕΤΗΣΙΑ ΠΡΟΒΟΛΗ ΔΑΠΑΝΩΝ: ΧΩΡΙΣ ΕΤΗΣΙΟΠΟΙΗΣΗ ΤΩΝ ΕΦΑΠΑΞ ─────────────────
  // Πριν: `totalExpYTD / μήνας × 12`. Ο ΕΝΦΙΑ ή το συμβόλαιο που πληρώθηκε τον
  // Ιανουάριο πολλαπλασιαζόταν ×12, οπότε το «Καθαρό Αποτέλεσμα» έβγαινε βαθιά
  // αρνητικό έντεκα από τους δώδεκα μήνες — και ο χρήστης το διάβασε ως ζημιά.
  // Τώρα: κάθε δαπάνη μετριέται όσες φορές πραγματικά συμβαίνει μέσα στο έτος.
  // Οι εφάπαξ μία φορά, οι πάγιες (όπως τις σήμανε ο χρήστης) όσες φορές
  // επαναλαμβάνονται. Ίδια συνάρτηση occMonths με το γράφημα, ώστε το πλακίδιο
  // και οι μπάρες να λένε το ίδιο πράγμα.
  // ΤΟ ΠΛΑΚΙΔΙΟ ΕΛΕΓΕ ΔΥΟ ΝΟΥΜΕΡΑ ΑΠΟ ΔΥΟ ΠΗΓΕΣ.
  // Η τιμή έβγαινε ΜΟΝΟ από τον πίνακα `expenses`, ενώ ο υπότιτλος «X ως
  // σήμερα» από το ενιαίο ημερολόγιο (λογαριασμοί + δαπάνες). Αρκούσε ένας
  // απλήρωτος λογαριασμός για να γράφει το πλακίδιο «Δαπάνες 1.200,00 € ·
  // 1.800,00 € ως σήμερα»: το σύνολο του έτους μικρότερο από το μέχρι σήμερα.
  // Δηλαδή στη συνηθισμένη περίπτωση. Τώρα και τα δύο πατούν στο ημερολόγιο.
  const projectedExpYear = allExpenses.reduce((s,e) => s + e.amount * occMonths(e, year).length, 0) + unbilledOfYear;
  const recurringCount = allExpenses.filter(e => e.is_recurring && occMonths(e, year).length > 0).length;

  // ΜΕΣΟΣ ΟΡΟΣ ΑΝΑ ΤΥΠΟ ΛΟΓΑΡΙΑΣΜΟΥ, ΥΠΟΛΟΓΙΣΜΕΝΟΣ. Η κάρτα λεγόταν «Μέσοι
  // λογαριασμοί» και έδειχνε το ποσό του τελευταίου. Ο μέσος όρος βγαίνει από
  // τις γραμμές που ήδη έχουμε φορτώσει: καμία επιπλέον κλήση, καμία δεύτερη
  // πηγή και το πλήθος γράφεται δίπλα ώστε να φαίνεται σε τι στηρίζεται.
  const billAverages = useMemo(() => {
    const byType = new Map<string, { sum: number; count: number }>();
    for (const b of bills) {
      const key = b.type || b.name || 'Λογαριασμός';
      const cur = byType.get(key) || { sum: 0, count: 0 };
      byType.set(key, { sum: cur.sum + (b.amount || 0), count: cur.count + 1 });
    }
    return [...byType.entries()]
      .map(([type, { sum, count }]) => ({ type, avg: sum / count, count }))
      .sort((a, b) => b.avg - a.avg);
  }, [bills]);

  // ── Σύνοψη εκκρεμοτήτων για τα πλακίδια ────────────────────────────────────
  // ΑΦΑΙΡΕΘΗΚΕ ο πίνακας `alerts`: 25 γραμμές που κατασκεύαζαν επτά ειδοποιήσεις
  // από τη βάση (λογαριασμοί, εργασίες, checklist, εγγυήσεις, κατάσταση
  // εξοπλισμού) και ΔΕΝ αποδίδονταν πουθενά. Τη δουλειά της «τι χρειάζεται τώρα»
  // την κάνει το InsightsBoard (computeInsights) και το ObligationsPanel· αυτός
  // ο πίνακας ήταν τρίτη, αόρατη μηχανή που πλήρωνε ερωτήματα χωρίς αποδέκτη.
  // Μένουν μόνο τα μεγέθη που εμφανίζονται πραγματικά στα πλακίδια.
  // Ιδια πολιτική με τις άλλες οθόνες, γραμμένη μία φορά (lib/core/time).
  const daysUntil = daysUntilOrNull;
  const openChk = chk.length;

  // ── ΦΟΡΟΣ: ΕΝΑΣ ΦΟΡΟΛΟΓΟΥΜΕΝΟΣ, ΟΧΙ ΤΡΕΙΣ ────────────────────────────────
  // Πριν: rentalIncomeTax(annualRent) ανά ακίνητο. Ο ιδιοκτήτης τριών
  // διαμερισμάτων με 8.000 € έκαστο έβλεπε 3 × 1.140 € = 3.420 € αντί για τον
  // πραγματικό φόρο των 24.000 € (4.500 €) — υποεκτίμηση 1.080 €, με τίτλο
  // «Εκτιμώμενος Φόρος». Τώρα ο φόρος υπολογίζεται μία φορά στο σύνολο του
  // χαρτοφυλακίου και εμφανίζεται το μερίδιο αυτού του ακινήτου, με την εξήγηση
  // από κάτω. Το ενοίκιο του τρέχοντος ακινήτου έρχεται από το resolveRent, ώστε
  // ο φόρος να πατά πάνω στον ίδιο αριθμό που δείχνει το πλακίδιο.
  // ΧΩΡΙΣ ΧΕΙΡΟΚΙΝΗΤΗ ΑΠΟΜΝΗΜΟΝΕΥΣΗ. Το `useMemo` εδώ ΔΕΝ διατηρούνταν από τον
  // μεταγλωττιστή της React: το ανέφερε ρητά («existing memoization could not be
  // preserved») και, επειδή δεν μπορούσε να το κρατήσει, παρέλειπε τη
  // βελτιστοποίηση ΟΛΟΚΛΗΡΟΥ του component. Δηλαδή μια χειροκίνητη απομνημόνευση
  // που υποτίθεται ότι κερδίζει χρόνο κόστιζε τη βελτιστοποίηση των πάντων γύρω
  // της. Ο υπολογισμός είναι καθαρός και ο μεταγλωττιστής τον απομνημονεύει μόνος.
  const portfolioTax = consolidateRentTax(
    properties.map(p => {
      const row = portfolioRents.find(r => r.property_id === p.id);
      const monthly = p.id === prop.id ? rent : (row?.monthly ?? 0);
      // Για το ΤΡΕΧΟΝ ακίνητο η πηγή είναι ο φορτωμένος ενοικιαστής, που είναι
      // πιο πρόσφατος από τη λίστα χαρτοφυλακίου· για τα υπόλοιπα, η λίστα.
      const viaBank = p.id === prop.id ? (tenantFull?.e_payment !== false) : (row?.viaBank ?? true);
      return { id: p.id, annualRent: monthly * 12, shortTerm: isShortTerm(p), rentsPaidViaBank: viaBank };
    }),
  );
  const estTax = Math.round(taxShareOf(portfolioTax, prop.id));
  const taxNote = consolidationSummary(portfolioTax, fmtEur);
  // Εισπράττεται το ενοίκιο ΑΥΤΟΥ του ακινήτου μέσω τραπέζης; Κρίνει το κείμενο
  // δίπλα στον φόρο, όπως ο ίδιος έλεγχος κρίνει και το ποσό.
  const rentViaBank = tenantFull?.e_payment !== false;

  // ── ΤΟ ΤΑΜΕΙΟ ─────────────────────────────────────────────────────────────
  // Τι μου χρωστάνε (ληξιπρόθεσμες περίοδοι ενοικίου) και τι χρωστάω (απλήρωτοι
  // λογαριασμοί και δαπάνες). Η ΜΟΝΗ πηγή για τα «Εκκρεμείς δαπάνες», που πριν
  // ήταν χωριστό πλακίδιο πιο κάτω στην ίδια οθόνη.
  // ΑΠΟ ΤΟ ΙΔΙΟ ΗΜΕΡΟΛΟΓΙΟ ΜΕ ΤΟ ΠΛΑΚΙΔΙΟ ΤΩΝ ΔΑΠΑΝΩΝ, τετρακόσια εικονοστοιχεία
  // πιο κάτω. Εδώ περνούσαν οι ωμοί πίνακες `bills` και `expenses` και
  // προστίθεντο: η σάρωση παραστατικού γράφει ΚΑΙ λογαριασμό ΚΑΙ δαπάνη με
  // `bill_id` και οι δύο απλήρωτες, οπότε ένας λογαριασμός ΔΕΗ 84,50 € έβγαινε
  // 169,00 € — στο πρώτο νούμερο που βλέπει ο ιδιοκτήτης όταν ανοίγει το ακίνητο,
  // ενώ η ίδια οθόνη πιο κάτω έδειχνε το σωστό.
  //
  // ΧΩΡΙΣ ΦΙΛΤΡΟ ΕΤΟΥΣ, επίτηδες: ο απλήρωτος λογαριασμός του περασμένου
  // Δεκεμβρίου εξακολουθεί να είναι οφειλή τον Ιανουάριο.
  //
  // Το `due` πέφτει πίσω στην ημερομηνία της γραμμής, γιατί η σκέτη δαπάνη δεν
  // έχει προθεσμία: χωρίς αυτό, καμία απλήρωτη δαπάνη δεν θα μετρούσε ποτέ ως
  // ληξιπρόθεσμη.
  const cash = useMemo(() => cashPosition({
    rent: rentPeriods,
    payables: ledger.entries.map(e => ({
      amount: e.amount, due: e.due ?? e.date, paid: e.paid, label: e.title,
    })),
    today: todayIso,
  }), [rentPeriods, ledger, todayIso]);

  // Ποιες ληξιπρόθεσμες γραμμές ξέρουν τη δόση τους — δηλαδή ποιες εισπράττονται
  // από την ίδια την κάρτα. Χωρίς καμία τέτοια, το κουμπί δεν εμφανίζεται:
  // ενέργεια που δεν έχει τι να γράψει είναι ψεύτικη υπόσχεση.
  const receivableRent = useMemo(() => receivableLines(cash.owedToMe.lines), [cash]);

  // ── ΤΑ ΝΟΥΜΕΡΑ ΠΟΥ ΔΙΝΟΥΜΕ ΣΤΗ ΝΟΑ ───────────────────────────────────────
  // Ίδια δομή με αυτήν που φτιάχνει ο ίδιος ο βοηθός (PropertyAssistant), γιατί
  // την παράγει η ίδια μηχανή (lib/assistant/openers.ts) και ο κανόνας της είναι
  // ένας: κανένα νούμερο που δεν υπάρχει. Γι' αυτό `null` όσο φορτώνει — ο
  // χαιρετισμός τότε λέει «κοιτάζω τα στοιχεία σου», όχι «δεν έχεις τίποτα».
  //
  // Χωρίς useMemo: είναι εννέα αναθέσεις πεδίων σε ένα αντικείμενο — ο
  // μεταγλωττιστής του React το απομνημονεύει μόνος του και μια χειροκίνητη
  // απομνημόνευση εδώ τον εμποδίζει να βελτιστοποιήσει ΟΛΟ το component.
  const assistantCtx: OpenerContext | null = loading ? null : {
    propertyName: prop.name,
    monthlyRent: rent || undefined,
    propertyValue: propValue || undefined,
    expensesYtd: totalExpYTD || undefined,
    openTasks: openChk,
    overdueRent: cash.owedToMe.overdue || undefined,
    hasLoan: loans.length > 0,
    isShortTerm: isShortTerm(prop),
    propertyCount: properties.length || undefined,
  };

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
    // ΗΤΑΝ ΣΤΑΘΕΡΑ ΜΗΔΕΝ. Το `monthlyDebt` υπολογίζεται τρεις δεκάδες γραμμές
    // πιο πάνω και το δείχνει ήδη η ίδια οθόνη· ο σύμβουλος όμως έπαιρνε μηδέν
    // και μιλούσε για αποδόσεις σε ιδιοκτήτη που πληρώνει δόση.
    loanPayment: monthlyDebt,
  });

  // ── ΤΑ ΒΗΜΑΤΑ ΡΥΘΜΙΣΗΣ ────────────────────────────────────────────────────
  // Η ΒΑΡΥΤΗΤΑ ΔΕΝ ΕΙΝΑΙ ΓΝΩΜΗ: είναι πόσα ΑΛΛΑ ξεκλειδώνει το βήμα. Χωρίς αξία
  // και ενοίκιο δεν υπάρχει καμία απόδοση, κανένας φόρος και καμία σύγκριση —
  // γι’ αυτό 10. Η απογραφή βελτιώνει τις αποσβέσεις και τίποτα άλλο — γι’ αυτό 2.
  const setupSteps: SetupStep[] = ([
    // ΤΟ ΒΗΜΑ ΜΕ ΤΗ ΜΕΓΑΛΥΤΕΡΗ ΒΑΡΥΤΗΤΑ ΟΔΗΓΟΥΣΕ ΣΕ ΛΑΘΟΣ ΟΘΟΝΗ.
    // Έδειχνε στον «Λογαριασμό» (συνδρομή, ειδοποιήσεις, ασφάλεια), όπου δεν
    // υπάρχει ούτε πεδίο αξίας ούτε πεδίο ενοικίου. Ο νέος χρήστης πατούσε το
    // πρώτο πράγμα που του ζητά η εφαρμογή και προσγειωνόταν στη σελίδα
    // συνδρομής, χωρίς κανέναν τρόπο να ολοκληρώσει το βήμα από εκεί.
    // Τα πεδία ζουν στην «Επεξεργασία στοιχείων ακινήτου», που ως τώρα άνοιγε
    // μόνο από ένα μενού της πάνω μπάρας.
    { key:'details', weight:10, label:'Συμπλήρωσε αξία και ενοίκιο', hint:'Εμπορική ή αντικειμενική αξία και μηνιαίο ενοίκιο, για σωστές αποδόσεις', done: propertyDetailsComplete(prop, !!tenant), nav:'edit' },
    { key:'tenant',  weight:8, label:'Πρόσθεσε ενοικιαστή και ενοίκιο', hint:'Ξεκλείδωσε αποδόσεις και υπενθυμίσεις λήξης', done: !!tenant, nav:'tenant' },
    { key:'expense', weight:6, label:'Κατέγραψε την πρώτη δαπάνη', hint:'Παρακολούθησε κόστη και έκπτωση φόρου', done: expenses.length>0, nav:'finances' },
    { key:'bills',   weight:5, label:'Ρύθμισε ρεύμα και αέριο', hint:'Σύγκρινε παρόχους και βρες φθηνότερο τιμολόγιο', done: bills.length>0, nav:'finances' },
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
    () => computeObligations(prop, tenantFull, maint, now, taxProfileOf(prop), { leaseDeclaredAt }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prop, tenantFull, maint, todayIso, leaseDeclaredAt],
  );
  // ═══ ΔΥΟ ΛΙΣΤΕΣ «ΤΙ ΕΡΧΕΤΑΙ», Η ΜΙΑ ΚΑΤΩ ΑΠΟ ΤΗΝ ΑΛΛΗ ═══════════════════
  // Η ατζέντα στην κορυφή έλεγε «τι χρειάζεται τώρα». Τρεις ζώνες πιο κάτω, μια
  // κάρτα «Επόμενες Εργασίες» έδειχνε ΑΛΛΕΣ πέντε επερχόμενες δουλειές — από
  // άλλον πίνακα, με δική της ταξινόμηση, χωρίς να ξέρει η μία για την άλλη.
  // Ο χρήστης έπρεπε να διαβάσει δύο λίστες και να τις συγχωνεύσει στο μυαλό
  // του για να καταλάβει τι είναι πρώτο. Τώρα τις συγχωνεύει η μηχανή.
  const taskObligations = useMemo(
    () => tasks.filter(t => t.title).map(t => ({
      id: `task:${t.id}`,
      title: t.title,
      note: '',
      date: t.due_date || '',
      // NaN: η ατζέντα υπολογίζει μόνη της τις ημέρες από την ημερομηνία, με
      // ημερολόγιο Αθήνας. Δεν της δίνουμε δεύτερη, δική μας μέτρηση.
      daysUntil: Number.NaN,
      priority: t.priority === 'critical' ? 'critical' : t.priority === 'high' ? 'high' : 'medium',
    })),
    [tasks],
  );
  // ΧΩΡΙΣ useMemo, ΚΑΙ ΟΧΙ ΑΠΟ ΑΜΕΛΕΙΑ. Το `insights` παράγεται με απευθείας κλήση
  // σε κάθε απόδοση, άρα είναι ΠΑΝΤΑ νέος πίνακας: η χειροκίνητη απομνημόνευση
  // εδώ δεν γλίτωνε ποτέ ούτε μία εκτέλεση, κρατούσε μια σιωπηλή παράκαμψη του
  // κανόνα εξαρτήσεων και εμπόδιζε τον μεταγλωττιστή του React να απομνημονεύσει
  // ΟΛΟΚΛΗΡΟ το σημείο. Ιδιο σκεπτικό με το RentAdjustmentModal.
  const agendaAll =
    buildAgenda({ insights, obligations: [...obligations, ...taskObligations],
                  setup: setupSteps, today: todayIso,
                  horizonDays: prefs.agendaHorizonDays })
      // ── ΔΥΟ ΚΑΝΟΝΕΣ ΓΙΑ ΤΗΝ ΙΔΙΑ ΛΙΣΤΑ ────────────────────────────────
      // Τα βήματα ρύθμισης φιλτράρονται ήδη με `tabVisible` πριν μπουν εδώ
      // (βλ. setupSteps). Τα insights ΔΕΝ φιλτράρονταν καθόλου — και το
      // `navSafe` της σελίδας ρίχνει σιωπηλά στην Επισκόπηση όποιον πατήσει
      // κουμπί προς κρυφή καρτέλα. Δηλαδή ο χρήστης πατούσε «Απογραφή» και
      // κατέληγε στην αρχική, χωρίς κανένα μήνυμα, χωρίς να καταλάβει γιατί.
      //
      // Το πιο χαρακτηριστικό: το «Το ακίνητο είναι κενό» έδινε κουμπί προς
      // τις Αποδόσεις, που φαίνονται ΜΟΝΟ σε εκμισθωμένο ακίνητο. Οι δύο
      // συνθήκες αποκλείονται, άρα το κουμπί ήταν νεκρό κάθε φορά που
      // εμφανιζόταν. Ένας κανόνας, μία λίστα.
      .map(it => (it.action && !tabVisible(it.action.tab) ? { ...it, action: null } : it))
      // ── ΤΑ ΧΡΗΜΑΤΑ ΤΑ ΛΕΕΙ ΤΟ ΤΑΜΕΙΟ, ΟΧΙ Η ΑΤΖΕΝΤΑ ───────────────────
      // Το «Χρωστάω» του CashHero και το «Ν ληξιπρόθεσμοι λογαριασμοί» της
      // ατζέντας έδειχναν ΤΑ ΙΔΙΑ χρήματα, με τον ίδιο προορισμό (Δαπάνες),
      // η μία κάρτα κάτω απο την άλλη. Και η ατζέντα το έλεγε χειρότερα: η
      // στήλη προθεσμίας της έγραφε «χωρίς προθεσμία» — για λογαριασμούς,
      // δηλαδή για το είδος με την πιο συγκεκριμένη ημερομηνία που υπάρχει.
      //
      // Το επείγον δεν χάνεται: πέρασε εκεί που είναι το ποσό. Το
      // `cashSideNote` γράφει πλέον «2 εκκρεμότητες · 120,00 € ληξιπρόθεσμα,
      // η παλαιότερη 18 ημέρες πίσω», χρησιμοποιώντας το `overdue` που
      // υπολογιζόταν και δεν το τύπωνε καμία οθόνη.
      //
      // Η ατζέντα μένει για ό,τι ΔΕΝ είναι χρήματα μέσα-έξω: λήξεις μίσθωσης
      // και ασφάλισης, δηλώσεις, συντήρηση, βήματα ρύθμισης.
      .filter(it => it.key !== 'bills');
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
      {/* ── Η ΟΘΟΝΗ ΧΡΕΙΑΖΕΤΑΙ ΟΝΟΜΑ, ΚΑΙ ΑΣ ΜΗΝ ΤΟ ΔΕΙΧΝΕΙ ──────────────────
          Δώδεκα καρτέλες έχουν ορατό τίτλο μέσω `PageTitle`, δηλαδή `h1`. Η
          Επισκόπηση —η ΠΡΩΤΗ οθόνη που βλέπει ο χρήστης— δεν είχε κανένα: ο
          αναγνώστης οθόνης την ανακοίνωνε χωρίς όνομα και η πλοήγηση ανά
          επικεφαλίδα ξεκινούσε από `h2`. Το όνομα έρχεται από το
          `lib/nav/labels.ts`, την ίδια πηγή με το μενού και τη Νόα.
          Κρυφό ΟΠΤΙΚΑ, όχι από τον αναγνώστη: η μπάρα από πάνω δείχνει ήδη το
          ακίνητο και η οθόνη δεν αλλάζει ούτε ένα εικονοστοιχείο. */}
      <h1 className="sr-only">{navLabel('overview')}</h1>
      {/* Διακριτική υπενθύμιση: συμπλήρωσε στοιχεία τιμολόγησης πριν την επόμενη χρέωση. */}
      <BillingNudge userId={userId} onNavigate={onNavigate} />

      {/* ═══ Η ΚΕΦΑΛΙΔΑ ΠΟΥ ΕΛΕΙΠΕ ══════════════════════════════════════════
          Η οθόνη άνοιγε με ένα μοναχικό κουμπί «Αναφορά (PDF)» στοιχισμένο
          δεξιά, σε δική του γραμμή: μια ολόκληρη ζώνη ύψους για μια
          δευτερεύουσα ενέργεια, πάνω από το περιεχόμενο. Δεν υπήρχε πουθενά
          τίτλος — ο χρήστης δεν διάβαζε ΠΟΥΘΕΝΑ ποιο ακίνητο βλέπει ούτε τι
          μέρα είναι, ενώ κάθε ποσό από κάτω λέει «ως σήμερα». Τώρα: όνομα,
          κατάσταση, η ώρα Ελλάδας και η ενέργεια στη σειρά της. */}
      <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:16,flexWrap:'wrap',marginBottom:20}}>
        <div style={{minWidth:0}}>
          <AthensNow style={{fontFamily:T.font.sans,fontSize:11,fontWeight:600,color:'var(--text-tertiary)',letterSpacing:'0.02em',marginBottom:4,minHeight:15}}/>
          {/* Η ΤΑΥΤΟΤΗΤΑ ΤΟΥ ΑΚΙΝΗΤΟΥ ΛΕΓΕΤΑΙ ΜΙΑ ΦΟΡΑ, ΚΑΙ ΤΗ ΛΕΕΙ Η ΜΠΑΡΑ.
              Εδώ γραφόταν ξανά, εξήντα εικονοστοιχεία κάτω από την ίδια
              πρόταση: όνομα, τύπος, κατάσταση, διεύθυνση — τα ίδια τέσσερα
              πεδία, με δεύτερη μορφοποίηση και τρίτη φορά στην κάρτα
              «Στοιχεία ακινήτου» πιο κάτω. Η πρώτη οθόνη ξόδευε τον πιο ακριβό
              της χώρο για να επαναλάβει ό,τι μόλις είχε διαβαστεί και το
              Ταμείο — ο λόγος που ανοίγει κανείς την εφαρμογή — έπεφτε κάτω
              από τη γραμμή του ματιού.
              Μένει η ώρα Ελλάδας, που δεν τη λέει κανείς άλλος και που δίνει
              νόημα στο «ως σήμερα» κάθε ποσού από κάτω. */}
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
          style={{display:'inline-flex',alignItems:'center',gap:8,height:T.h.md,padding:'0 16px',borderRadius: T.radius.pill,border:'1px solid var(--border-default)',background:'transparent',color:'var(--text-secondary)',fontFamily: T.font.sans,fontSize:12,fontWeight:700,cursor:'pointer'}}
          onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.color='var(--text-primary)';}}
          onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--text-secondary)';}}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
          Αναφορά σε PDF
        </button>
      </div>


      {/* ═══ ΤΟ ΤΑΜΕΙΟ ══════════════════════════════════════════════════════
          Η οθόνη άνοιγε με «Μηνιαίο ενοίκιο · Μεικτή απόδοση · Καθαρή απόδοση»:
          τρεις αριθμοί που ο ιδιοκτήτης ξέρει απ' έξω και που δεν αλλάζουν από
          μήνα σε μήνα. Αυτό που ΔΕΝ ήξερε και είναι ο λόγος που ανοίγει την
          εφαρμογή, ήταν αν μπήκε το ενοίκιο και τι πρέπει να πληρώσει. */}
      {/* Η Νόα πριν από το Ταμείο, όχι πίσω από πλωτό κουμπί στη γωνία. Είναι
          μία γραμμή, όχι κάρτα: παρούσα, χωρίς να διεκδικεί τη θέση των ποσών. */}
      <AssistantStrip ctx={assistantCtx} />

      {/* ΤΟ «ΜΟΥ ΧΡΩΣΤΑΝΕ» ΜΟΝΟ ΣΕ ΜΑΚΡΟΧΡΟΝΙΑ.
          Το `isLet` περιλαμβάνει και τη βραχυχρόνια, όπου όμως: το ποσό
          τροφοδοτείται από τις δόσεις ενοικίου (`rent_payments`) ενώ τα έσοδα
          βραχυχρόνιας ζουν στα καταλύματα, άρα έδειχνε ΠΑΝΤΑ μηδέν· και το
          κουμπί οδηγεί στον Ενοικιαστή, καρτέλα που φαίνεται μόνο σε
          μακροχρόνια, άρα δεν πήγαινε πουθενά. Μισή κορυφή της πρώτης οθόνης,
          για ένα μόνιμο μηδέν με νεκρό κουμπί. Στη βραχυχρόνια το «Χρωστάω»
          παίρνει όλο το πλάτος, που είναι και η αλήθεια: η είσπραξη γίνεται
          από την πλατφόρμα. */}
      <CashHero cash={cash} showIncome={readStatus(prop) === 'rent_long'} onNavigate={onNavigate}
                onRecordRent={receivableRent.length ? () => setReceivingRent(true) : null} />

      {/* ΤΟ ΠΑΡΑΘΥΡΟ ΠΡΟΣΑΡΤΑΤΑΙ ΟΤΑΝ ΑΝΟΙΓΕΙ. Έτσι η ημερομηνία είσπραξης και ο
          τρόπος ξαναπαίρνουν τις προεπιλογές τους κάθε φορά, αντί να κουβαλούν
          την προηγούμενη επιλογή σε δόση άλλου μήνα. */}
      {receivingRent && (
        <RentReceived
          onClose={() => setReceivingRent(false)}
          lines={receivableRent}
          supabase={supabase}
          propertyId={prop.id}
          tenantId={tenantFull?.id ?? null}
          leaseViaBank={rentViaBank}
          today={todayIso}
          onSaved={() => { void load(); }}
        />
      )}

      {/* Μία λίστα «τι χρειάζεται τώρα», στη θέση των τεσσάρων που έλεγαν εν
          μέρει τα ίδια πράγματα. Η συγχώνευση γίνεται στο lib/home/agenda.ts. */}
      <AgendaPanel items={agenda} total={agendaAll.length} onNavigate={onNavigate} />

      {/* ═══ ΤΟ ΖΕΥΓΟΣ ΓΡΑΦΗΜΑΤΩΝ ΕΦΥΓΕ ΑΠΟ ΕΔΩ ══════════════════════════
          Οι ίδιες δύο εικόνες — δαπάνες ανά μήνα και κατανομή ανά κατηγορία —
          υπάρχουν στις Δαπάνες, στον Προϋπολογισμό, όπου ζουν και οι ΣΤΟΧΟΙ.
          Εκεί η μπάρα του μήνα έχει κάτι να συγκριθεί μαζί του· εδώ ήταν μια
          ωραία εικόνα χωρίς ερώτηση από πίσω της.

          ΓΙΑΤΙ ΕΦΥΓΕ ΑΥΤΟ ΚΑΙ ΟΧΙ ΤΟ ΑΛΛΟ. Η δουλειά αυτής της οθόνης είναι
          «τι χρειάζεται τώρα»: το Ταμείο και η ατζέντα. Ένα γράφημα δώδεκα
          μηνών απαντά σε άλλη ερώτηση — «πώς πήγε η χρονιά» — που είναι
          ερώτηση των Δαπανών. Και η περίληψή της μένει εδώ, στο πλακίδιο
          «Δαπάνες»: σύνολο έτους και ποσό ως σήμερα, μία γραμμή αντί για δύο
          κάρτες. Το βάθος είναι ένα κλικ μακριά, στη σωστή καρτέλα. */}

      <SecHdr label="Το ακίνητο" sub="Στοιχεία και πάγια κόστη" />
      <div className="grid-main">
        {/* ═══ ΔΕΚΑΤΡΕΙΣ ΣΕΙΡΕΣ ΔΙΠΛΑ ΣΕ ΠΕΝΤΕ ══════════════════════════════
            Ο πίνακας στοιχείων ήταν μία στήλη ζευγαριών σε πλέγμα τριών ίσων
            καρτών: γέμιζε δεκατρείς σειρές ενώ οι διπλανές κάρτες γέμιζαν πέντε
            και η σειρά τελείωνε με μισή κάρτα κείμενο και δυόμισι κάρτες κενό.
            Τα ίδια ζεύγη σε ΔΥΟ στήλες πέφτουν στις επτά σειρές και ζυγίζουν με
            το διπλανό — η ίδια πληροφορία, χωρίς το κενό. */}
        <div className="card">
          <div className="section-label"><span className="section-dot"/> Στοιχεία ακινήτου</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,230px),1fr))',columnGap:28}}>
            {([['Τύπος',PROP_TYPE_LABELS[prop.prop_type||'']||prop.prop_type],['Εμβαδόν',prop.sqm?`${prop.sqm} τ.μ.`:null],['Υπνοδωμάτια',prop.bedrooms?String(prop.bedrooms):null],['Διεύθυνση',prop.address],['ΑΤΑΚ',prop.atak],['Έτος κατασκευής',prop.year_built?String(prop.year_built):null],['Όροφος',prop.floor!=null?String(prop.floor):null],['Θέρμανση',heatingLabel(prop.heating)||null],['Ενεργειακή κλάση',prop.pea_class],['Θέσεις στάθμευσης',prop.parking_spaces?String(prop.parking_spaces):null],['Αποθήκη',prop.storage_sqm?`${prop.storage_sqm} τ.μ.`:null],['Αντικειμενική αξία',prop.obj_value?fmtEur(prop.obj_value):null],['Εκτιμώμενος ΕΝΦΙΑ',prop.enfia?fmtEur(prop.enfia):null]] as [string,string|null][]).filter(([,v])=>v).map(([k,v]) => (
              <div key={k} title={k==='ΑΤΑΚ'?'Αριθμός Ταυτότητας Ακινήτου, από το έντυπο Ε9':k==='Εκτιμώμενος ΕΝΦΙΑ'?'Ενιαίος Φόρος Ιδιοκτησίας Ακινήτων: ο ετήσιος φόρος περιουσίας':undefined}
                style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:14,padding:'8px 0',borderBottom:'1px solid var(--border-subtle)'}}>
                <span style={{fontFamily:T.font.sans,color:'var(--text-secondary)',fontSize:13,letterSpacing:'0.25px',whiteSpace:'nowrap'}}>{k}</span>
                {/* Το `textOverflow:'ellipsis'` δεν πυροδοτείται χωρίς
                    `whiteSpace:'nowrap'`: η τιμή τύλιγε σε δεύτερη σειρά και
                    έσπαγε τη γραμμή βάσης της ετικέτας δίπλα της, αντί να
                    κοπεί με τρεις τελείες όπως δήλωνε ο κώδικας. */}
                <span title={String(v)} style={{fontFamily:T.font.sans,color:'var(--text-primary)',fontSize:13,letterSpacing:'0.25px',textAlign:'right',minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="section-label"><span className="section-dot"/> Μέσοι λογαριασμοί</div>
          {billAverages.length===0
            ? <EmptyState icon={<FileText size={20}/>} title="Κανένας λογαριασμός ακόμη" hint="Πρόσθεσε ρεύμα, νερό και πάγια για να δεις μέσους όρους."/>
            : <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {billAverages.slice(0,5).map(b => (
                  <div key={b.type} style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:12}}>
                    <div style={{minWidth:0,fontFamily: T.font.sans,fontSize:13,color:'var(--text-secondary)',letterSpacing:'0.25px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {b.type}
                      {/* ΤΟ ΠΛΗΘΟΣ ΛΕΓΕΤΑΙ. Ένας «μέσος όρος» από έναν λογαριασμό δεν
                          είναι μέσος όρος και ο χρήστης πρέπει να ξέρει σε πόσα
                          στηρίζεται το νούμερο πριν χτίσει πάνω του προϋπολογισμό. */}
                      <span style={{color:'var(--text-tertiary)',fontSize:11}}> ({b.count})</span>
                    </div>
                    <div style={{fontFamily: T.font.mono,fontSize:13,color:'var(--text-primary)',fontVariantNumeric:'tabular-nums',flexShrink:0}}>{fmtEur(b.avg)}</div>
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
        const net = annualRent - projectedExpYear - estTax;   // μόνο για το σκέλος με έσοδα
        // ΜΙΑ ΖΩΝΗ ΑΡΙΘΜΩΝ, ΟΧΙ ΔΥΟ. Πιο πάνω υπήρχε δεύτερο πλέγμα «Η εικόνα
        // σήμερα» με «Μηνιαίο ενοίκιο», «Δαπάνες ως σήμερα» και τις δύο
        // αποδόσεις. Το «Μηνιαίο ενοίκιο × 12» ΕΙΝΑΙ τα ακαθάριστα έσοδα και οι
        // «Δαπάνες ως σήμερα» δίπλα στις «Δαπάνες όλο το έτος» διάβαζαν σαν το
        // ίδιο μέγεθος με δύο τιμές. Τώρα κάθε ποσό λέγεται μία φορά· ό,τι ήταν
        // χρήσιμο συμφραζόμενο (μηνιαίο, ως σήμερα) μπήκε ως υπότιτλος.
        // ΣΕ ΚΕΝΟ Ή ΙΔΙΟΧΡΗΣΙΑ ΔΕΝ ΥΠΑΡΧΟΥΝ ΕΣΟΔΑ, ΦΟΡΟΣ, ΟΥΤΕ «ΚΑΘΑΡΟ».
        // Έδειχνε τρία πλακίδια στο μηδέν και ένα «Καθαρό αποτέλεσμα» που ήταν
        // απλώς οι δαπάνες με μείον — δηλαδή το ίδιο νούμερο δύο φορές, με τα
        // άλλα δύο να λένε «δεν ξέρω» ντυμένα σαν μέτρηση. Μένει ό,τι ισχύει.
        const income = isLet(prop);
        const items: KPIItem[] = income ? [
          { label:'Έσοδα από ενοίκια', value:fmtEur(annualRent), sub:`${fmtEur(rent)} τον μήνα`,
            title:`Μηνιαίο ενοίκιο ${fmtEur(rent)} × 12.` },
          { label:'Δαπάνες', value:fmtEur(Math.round(projectedExpYear)),
            sub: [`${fmtEur(totalExpYTD)} ως σήμερα`, recurringCount>0 ? `${recurringCount} πάγιες` : null].filter(Boolean).join(' · '),
            title:`Οι δαπάνες που έχεις καταχωρήσει για το ${year}, μετρημένες όσες φορές πραγματικά συμβαίνουν: οι εφάπαξ (π.χ. ΕΝΦΙΑ, συμβόλαιο) μία φορά, οι πάγιες όσες φορές επαναλαμβάνονται. Δεν πολλαπλασιάζεται το σύνολο του έτους ×12.${expDeltaPct!=null?` Το ίδιο διάστημα του ${year-1}: ${expDeltaPct>0?'+':expDeltaPct<0?'−':''}${Math.abs(expDeltaPct)}%.`:''}` },
          { label:'Μερίδιο φόρου ενοικίου', value:fmtEur(estTax),
            title:portfolioTax.count>1
              ? `${CONSOLIDATION_NOTE} Συνολικός φόρος χαρτοφυλακίου ${fmtEur(Math.round(portfolioTax.totalTax))} σε ενοίκια ${fmtEur(Math.round(portfolioTax.totalAnnualRent))}.`
              // ΤΟ ΚΕΙΜΕΝΟ ΔΕΝ ΕΠΙΤΡΕΠΕΤΑΙ ΝΑ ΥΠΟΣΧΕΤΑΙ ΕΚΠΤΩΣΗ ΠΟΥ ΔΕΝ ΙΣΧΥΕΙ.
              // Έλεγε «με την τεκμαρτή έκπτωση 5%» χωρίς όρο, ενώ από 1/1/2026 η
              // έκπτωση χάνεται όταν το ενοίκιο εισπράττεται με μετρητά. Με το
              // νούμερο διορθωμένο και το κείμενο να ψεύδεται, ο χρήστης θα
              // νόμιζε ότι ο φόρος του ανέβηκε χωρίς λόγο.
              : rentViaBank
                ? `Προοδευτική κλίμακα ενοικίων ${year} με την τεκμαρτή έκπτωση 5%. Έχεις ένα ακίνητο με εισόδημα, οπότε ο φόρος του είναι όλος ο φόρος σου.`
                : `Προοδευτική κλίμακα ενοικίων ${year} ΧΩΡΙΣ την τεκμαρτή έκπτωση 5%: το ενοίκιο εισπράττεται με μετρητά και από 1/1/2026 η έκπτωση προϋποθέτει τραπεζική είσπραξη. Ο φόρος υπολογίζεται στο 100% του ενοικίου.` },
          // ΧΩΡΙΣ ΧΡΩΜΑΤΙΚΗ ΕΤΥΜΗΓΟΡΙΑ. Το πρόσημο το λέει ήδη το ίδιο το ποσό·
          // το πράσινο/κόκκινο απλώς το ξαναέλεγε και σε μια χρονιά με ΕΝΦΙΑ
          // έβαφε κόκκινο ένα ακίνητο που δουλεύει κανονικά.
          { label:'Καθαρό αποτέλεσμα', value:fmtEur(Math.round(net)),
            title:'Ακαθάριστα έσοδα μείον δαπάνες μείον το μερίδιο φόρου. Δεν περιλαμβάνει δόσεις δανείου.' },
        ] : [
          { label:'Δαπάνες', value:fmtEur(Math.round(projectedExpYear)),
            sub: [`${fmtEur(totalExpYTD)} ως σήμερα`, recurringCount>0 ? `${recurringCount} πάγιες` : null].filter(Boolean).join(' · '),
            title:`Οι δαπάνες που έχεις καταχωρήσει για το ${year}, μετρημένες όσες φορές πραγματικά συμβαίνουν.` },
          // Χωρίς εμπορική ΚΑΙ χωρίς αντικειμενική αξία, το πλακίδιο έγραφε
          // «0,00 €»: όχι μέτρηση, αλλά απουσία μέτρησης ντυμένη σαν μέτρηση.
          ...(propValue>0 ? [{ label:'Αξία ακινήτου', value: fmtEur(propValue),
            title: prop.value ? 'Εμπορική αξία, όπως την έχεις καταχωρήσει.' : 'Αντικειμενική αξία από το έντυπο Ε9, επειδή δεν έχει καταχωρηθεί εμπορική.' }] : []),
        ];
        // ΙΔΙΟ ΠΛΑΚΙΔΙΟ, ΟΧΙ ΙΔΙΑ ΒΑΡΥΤΗΤΑ. Τα τέσσερα παραπάνω είναι η αλυσίδα
        // που καταλήγει στο «Καθαρό αποτέλεσμα» — το συμπέρασμα της χρονιάς. Τα
        // από κάτω είναι συμφραζόμενα: υπάρχουν μόνο όταν υπάρχουν και δεν
        // μπαίνουν δίπλα στο συμπέρασμα σαν ισότιμα. Μπήκαν σε δεύτερο πλέγμα
        // αντί να χωθούν στο πρώτο, που τα ξεχείλωνε σε μια δεύτερη μισοάδεια
        // σειρά και ισοπέδωνε την ιεραρχία.
        const extra: KPIItem[] = [];
        if (loans.length > 0) extra.push({
          label:'Δόση δανείου / μήνα', value:fmtEur(Math.round(monthlyDebt)),
          sub: debtLtv>0 ? `δάνειο προς αξία ${fp(debtLtv)}` : undefined,
          title:'Εκτιμώμενη τοκοχρεολυτική δόση. ΔΕΝ αφαιρείται από το καθαρό αποτέλεσμα παραπάνω· το κεφάλαιο δεν είναι δαπάνη.' });
        // ── ΕΙΣΠΡΑΞΕΙΣ, ΟΧΙ ΕΣΟΔΑ. ΔΥΟ ΣΩΣΤΑ ΝΟΥΜΕΡΑ ΓΙΑ ΤΗΝ ΙΔΙΑ ΔΙΑΜΟΝΗ ──────
        // Ο επισκέπτης πληρώνει 1.000,00 €, η πλατφόρμα κρατά 150,00 € προμήθεια
        // και εισπράττει 50,00 € τέλος ανθεκτικότητας. Στον λογαριασμό μπαίνουν
        // 800,00 €· δηλωτέο ακαθάριστο είναι 950,00 €. Και τα δύο είναι σωστά,
        // απαντούν σε ΑΛΛΗ ερώτηση — και έλεγαν και τα δύο «έσοδα», σε δύο
        // καρτέλες της ίδιας εφαρμογής, χωρίς να το εξηγεί κανείς.
        //
        // Η ελληνική γλώσσα έχει ήδη τη διάκριση: «εισπράξεις» είναι ό,τι μπήκε
        // στο ταμείο, «έσοδα» είναι η φορολογική έννοια. Η Λογιστική λέει «Μεικτά
        // έσοδα» και εννοεί το δηλωτέο· εδώ είναι το ταμείο, άρα εισπράξεις. Μία
        // λέξη, καμία επιπλέον γραμμή και η αμφισημία φεύγει.
        if (hostStays.length > 0) extra.push({
          label:`Εισπράξεις φιλοξενίας ${year}`, value:fmtEur(Math.round(hostingYTD)),
          sub: [hostingNights>0?`${hostingNights} διανυκτερεύσεις`:null, nextArrival?`επόμενη άφιξη ${fd(nextArrival)}`:null].filter(Boolean).join(' · ') || undefined,
          title:`Ό,τι μπήκε στον λογαριασμό σου από διαμονές, από την καρτέλα «${navLabel('clients')}». Το ΔΗΛΩΤΕΟ ποσό είναι μεγαλύτερο, γιατί περιλαμβάνει την προμήθεια της πλατφόρμας: το βλέπεις στη Λογιστική ως «Μεικτά έσοδα».` });
        // ΟΙ «ΕΚΚΡΕΜΕΙΣ ΔΑΠΑΝΕΣ» ΕΦΥΓΑΝ ΑΠΟ ΕΔΩ. Είναι ακριβώς το «Χρωστάω» του
        // Ταμείου, στην κορυφή της ίδιας οθόνης — το ίδιο ποσό δύο φορές, με
        // διαφορετικό όνομα και σε απόσταση ενός scroll.
        return (
          <>
            {/* Το πλήθος στηλών ακολουθεί το πλήθος των πλακιδίων. Με σταθερό
                τέσσερα, το ακίνητο χωρίς έσοδα άπλωνε ένα ή δύο πλακίδια σε
                τέσσερις θέσεις και άφηνε τη μισή σειρά κενή. */}
            <KPIGrid columns={Math.min(4, Math.max(2, items.length))} items={items} />
            {/* Η απόδοση σε μία γραμμή αντί για δύο πλακίδια: είναι
                συμφραζόμενο του αποτελέσματος, όχι ισότιμο μέγεθος μαζί του. Η
                πλήρης ανάλυση ζει στις «Αποδόσεις», που είναι η καρτέλα της. */}
            <div style={{marginTop:-4,marginBottom:16,fontFamily: T.font.sans,fontSize:12,color:'var(--text-secondary)',lineHeight:1.7}}>
              {isLet(prop) && propValue>0 && (
                <div>
                  <strong style={{color:'var(--text-primary)',fontWeight:600}}>Απόδοση.</strong>{' '}
                  <span title="Ετήσιο ενοίκιο ως ποσοστό της αξίας του ακινήτου, προ δαπανών">μεικτή {fp(grossYield)}</span>
                  {' · '}
                  <span title="Ετήσιο ενοίκιο μείον δαπάνες, ως ποσοστό της αξίας του ακινήτου">καθαρή {fp(netYield)}</span>
                  {propValue>0 && ` · αξία ${fmtEur(propValue)}`}
                </div>
              )}
              {income && taxNote && (
                <div><strong style={{color:'var(--text-primary)',fontWeight:600}}>Πώς βγαίνει ο φόρος.</strong> {taxNote}</div>
              )}
            </div>
            {extra.length > 0 && <KPIGrid columns={Math.max(3, extra.length)} items={extra} />}
          </>
        );
      })()}

      {/* ── ΤΙ ΕΦΥΓΕ ΑΠΟ ΑΥΤΗ ΤΗ ΖΩΝΗ ────────────────────────────────────────
          «Είσπραξη και πληρωμές» (PaymentLinks): στατικός κατάλογος τριών
          παρόχων και επτά τραπεζών με εξωτερικούς συνδέσμους. Δεν έπαιρνε
          ΚΑΝΕΝΑ prop — δεν ήξερε καν ποιο ακίνητο βλέπεις — δεν έκανε τίποτα
          που δεν κάνει ο σελιδοδείκτης του περιηγητή και καταλάμβανε μόνιμη
          θέση στην πιο ακριβή οθόνη της εφαρμογής. Ό,τι αξίζει από αυτό ζει
          ήδη μέσα στην πύλη, ως «Σύνδεσμος πληρωμής» του ενοικιαστή.

          Η ΠΥΛΗ ΕΝΟΙΚΙΑΣΤΗ αποδιδόταν χωρίς καμία συνθήκη. Ο ιδιοκτήτης που
          μένει στο σπίτι του, ή το έχει κενό ή προς πώληση, έβλεπε μόνιμα
          κάρτα «Κοινοποίησε σύνδεσμο και δες αιτήματα βλάβης» — την ίδια
          στιγμή που η εφαρμογή του έκρυβε την καρτέλα «Ενοικιαστής» ως μη
          σχετική. Η μηχανή ορατότητας έλεγε ένα και η Επισκόπηση έκανε άλλο.
          Τώρα ακολουθεί τον ίδιο κανόνα με το διπλανό της πάνελ πληρότητας.

          Και η κεφαλίδα ενότητας έφυγε μαζί: με ένα στοιχείο κάθε φορά, ένας
          τίτλος «Διαχείριση και εργαλεία» ονομάτιζε ομάδα που δεν υπάρχει. */}
      {readStatus(prop) === 'rent_long' && <PortalShare propertyId={prop.id} userId={userId} />}
      <OccupancyPanel propertyId={prop.id} userId={userId} />

    </div>
  );
}

/** Η πλατφόρμα δεν αλλάζει όσο είναι ανοιχτή η σελίδα: καμία συνδρομή. */
const KBD_NEVER_CHANGES = () => () => {};

export default function Dashboard() {
  const supabase = createClient();
  // Ο χρήστης έρχεται από `supabase.auth.getUser()` — έχει δικό του τύπο. Με
  // `any` κανένα από τα ~30 σημεία που διαβάζουν `user.id`/`user.email`/
  // `user.created_at` δεν ελεγχόταν, ούτε το `user_metadata`.
  const [user, setUser] = useState<User | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selected, setSelected] = useState<Property | null>(null);
  // Η ΚΑΡΤΕΛΑ ΕΙΝΑΙ ΤΟΠΟΘΕΣΙΑ. Ήταν `useState`, οπότε η διεύθυνση έμενε
  // `/dashboard` όσο βαθιά κι αν πήγαινε ο χρήστης: το «πίσω» του περιηγητή τον
  // έβγαζε από την εφαρμογή αντί να τον γυρίσει καρτέλα, η ανανέωση τον πετούσε
  // στην Επισκόπηση και δεν μπορούσε να στείλει σύνδεσμο ούτε σελιδοδείκτη.
  // Ίδια διεπαφή — κανένα από τα είκοσι `setNav` δεν άλλαξε.
  const [nav, setNav] = useNavHistory('overview');
  // ΤΟ ΙΣΤΟΡΙΚΟ ΠΛΟΗΓΗΣΗΣ ΕΦΥΓΕ ΑΠΟ ΕΔΩ. Κρατούσε την προηγούμενη καρτέλα για
  // να τη δείχνει ο σύνδεσμος επιστροφής — τρία hooks και μια κατάσταση που
  // παρήγαγε κύκλους ανάμεσα σε καρτέλες που παραπέμπουν η μία στην άλλη.
  // Ο κανόνας του «πίσω» είναι πλέον ένας και σταθερός· βλ. `backTab` πιο κάτω.

  // Deep-link καρτέλα ενοικιαστή → Απογραφή/Παράδοση με προ-συμπληρωμένα στοιχεία.
  const [handoverIntent, setHandoverIntent] = useState<{tenantName?:string;tenantPhone?:string;type?:'check_in'|'check_out'}|null>(null);
  // ΤΟ ΑΚΟΡΝΤΕΟΝ ΕΦΥΓΕ ΜΑΖΙ ΜΕ ΤΙΣ ΟΜΑΔΕΣ. Εδώ ζούσαν δύο states —`openGroup` με
  // αρχική τιμή 'Οικονομικά' και ένας καθρέφτης `lastNav` που τα συγχρόνιζε
  // μέσα στην ίδια απόδοση για να μην τινάζεται η μπάρα. Δύο states, ένας
  // συγχρονισμός και ένα σχόλιο τεσσάρων γραμμών, για να ανοιγοκλείνουν δύο
  // ομάδες που δεν μπορούσαν να έχουν πάνω από τρεις γραμμές.
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
  // άσχετες με το ακίνητο και μετά μάζευε σε έξι. Ένα μενού που αναδιπλώνεται
  // μπροστά στα μάτια σου δεν διαβάζεται ως «φόρτωσε» — διαβάζεται ως χαλασμένο.
  const [navPrefsFailed, setNavPrefsFailed] = useState(false);
  const [navSignals, setNavSignals] = useState<DisclosureSignals>({});
  const [loading, setLoading] = useState(true);
  /** Η ανάγνωση ακινήτων απέτυχε — ΔΙΑΦΟΡΕΤΙΚΟ από «δεν έχει ακίνητα». */
  const [loadError, setLoadError] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [statusDropdown, setStatusDropdown] = useState(false);
  const [editProperty, setEditProperty] = useState<Property | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);  // συρόμενο μενού σε κινητό/tablet
  // Η ΑΛΛΑΓΗ ΑΚΙΝΗΤΟΥ ΑΛΛΑΖΕΙ ΟΛΗ ΤΗΝ ΟΘΟΝΗ ΚΑΙ ΔΕΝ ΑΝΑΚΟΙΝΩΝΟΤΑΝ. Οποιος
  // διαβάζει με αναγνώστη οθόνης άκουγε σιωπή: τα δεδομένα κάτω από τα δάχτυλά
  // του γίνονταν άλλου ακινήτου χωρίς καμία ένδειξη. Μία ήσυχη ζώνη το λέει.
  const [announce, setAnnounce] = useState('');
  const [cmdkOpen, setCmdkOpen] = useState(false);        // command palette (⌘K)
  // Ανοιχτή από την πρώτη απόδοση όταν το ζήτησε η συντόμευση του εικονιδίου. Το
  // παράθυρο ούτως ή άλλως περιμένει χρήστη και ακίνητο, που φορτώνονται μετά,
  // οπότε η αρχική τιμή δεν αλλάζει τίποτα στην πρώτη εικόνα — αλλάζει το ότι
  // δεν χρειάζεται δεύτερη απόδοση για να φανεί.
  const [quickAddOpen, setQuickAddOpen] = useState(LAUNCH.scan);// γρήγορη προσθήκη με φωτογραφία/σάρωση
  const [showWelcome, setShowWelcome] = useState(false);// καλωσόρισμα πρώτης χρήσης

  // ── Ο ΠΙΝΑΚΑΣ «ΑΠΟ ΠΟΥ ΞΕΚΙΝΑΣ» ─────────────────────────────────────────
  // Τα σήματα διαβάζονται ΜΙΑ φορά, μαζί με τα υπόλοιπα counts της εκκίνησης:
  // ο πίνακας δεν δικαιολογεί δικό του ερώτημα σε κάθε φόρτωση της Επισκόπησης.
  const [startSignals, setStartSignals] = useState({ documents: 0, taxEvents: 0 });
  const [startCollapsed, setStartCollapsed] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [scanDraftId, setScanDraftId] = useState<string|null>(null);// προσχέδιο από scan-to-create
  const [plan, setPlan] = useState<string>('free');       // τρέχον πακέτο συνδρομής (billing_profiles)
  const [compPlan, setCompPlan] = useState<string|null>(null);   // δωρεάν πρόσβαση: επίπεδο (π.χ. από referral)
  const [compUntil, setCompUntil] = useState<string|null>(null); // δωρεάν πρόσβαση: λήξη (ISO)
  // Η σφραγίδα της δοκιμής. Οσο λείπει, ισχύει η τοπική δοκιμή των 30 ημερών·
  // μόλις μπει, η πρόσβαση βγαίνει ΑΠΟΚΛΕΙΣΤΙΚΑ από τη συνδρομή.
  const [trialUsedAt, setTrialUsedAt] = useState<string|null>(null);
  // ΚΡΑΤΗΣΗ ΥΠΟΒΑΘΜΙΣΗΣ: το πακέτο που έχει πληρωθεί και κρατιέται ώς την
  // ανανέωση. Χωρίς αυτά τα δύο, ο πελάτης που ζήτησε να κατέβει έχανε την ίδια
  // ώρα ό,τι είχε πληρώσει για ολόκληρο τον μήνα.
  const [holdPlan, setHoldPlan] = useState<string|null>(null);
  // ΟΙ ΘΕΣΕΙΣ ΑΠΟ ΣΥΣΤΑΣΕΙΣ ΔΙΑΒΑΖΟΝΤΑΙ, ΚΑΙ ΔΕΝ ΔΙΑΒΑΖΟΝΤΑΝ. Η βάση τις μετρά
  // στο όριο ακινήτων από τον Αύγουστο· η οθόνη δεν τις ήξερε, οπότε ο χρήστης
  // που έφερνε φίλο έβλεπε το κουμπί «Προσθήκη ακινήτου» κλειστό ενώ η βάση θα
  // δεχόταν το επόμενο ακίνητο.
  const [bonusProps, setBonusProps] = useState<number|null>(null);
  const [bonusUntil, setBonusUntil] = useState<string|null>(null);
  const [holdUntil, setHoldUntil] = useState<string|null>(null);
  // ΤΟ ΟΝΟΜΑ ΙΔΙΟΚΤΗΤΗ ΕΙΧΕ ΔΥΟ ΣΤΗΛΕΣ ΚΑΙ ΚΑΝΕΝΑΝ ΑΝΑΓΝΩΣΤΗ ΕΔΩ.
  // Διαβαζόταν από το `billing_profiles.owner_name`, κρατιόταν σε κατάσταση και
  // περνούσε στην Επισκόπηση μαζί με χειριστή αποθήκευσης — που δεν
  // χρησιμοποιούσε κανένα από τα δύο. Το όνομα που ΟΝΤΩΣ τυπώνεται στα επίσημα
  // έγγραφα και στη δήλωση μίσθωσης ζει στο `property_settings.owner_name`,
  // γράφεται στον οδηγό προσθήκης ακινήτου και είναι η μία πηγή.
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
  // ΜΙΑ ΤΙΜΗ, ΜΙΑ ΚΑΤΑΣΤΑΣΗ. Εδώ κρατιόνταν ΔΥΟ states γεμισμένα απο την ίδια
  // στήλη της βάσης: το `taxForm` με τις τέσσερις μορφές και το `legalForm` με
  // τη δυαδική περίληψή του. Δύο εντολές ενημέρωσης για μια πληροφορία που
  // είναι μία — και δύο πράγματα που μπορούν να ξεσυγχρονιστούν. Η ορατότητα
  // παίρνει πλέον την πραγματική μορφή και κάνει τη σύμπτυξη μέσα της.
  const [taxForm, setTaxForm] = useState<LegalForm>('individual');
  const [isPartner, setIsPartner] = useState(false);      // ιδιότητα Συνεργάτη (referral_partners)
  const [showUpgrade, setShowUpgrade] = useState(false);  // modal ορίου ακινήτων
  // Η ΕΝΔΕΙΞΗ ΣΥΝΤΟΜΕΥΣΗΣ ΔΕΝ ΕΙΝΑΙ ΚΑΤΑΣΤΑΣΗ, ΕΙΝΑΙ ΙΔΙΟΤΗΤΑ ΤΗΣ ΣΥΣΚΕΥΗΣ.
  // Ήταν κατάσταση με προεπιλογή «Ctrl K» και ένα effect που την άλλαζε σε «⌘K»
  // μετά την πρώτη απόδοση: ο χρήστης του Mac έβλεπε το «Ctrl K» να αναβοσβήνει.
  // Το `useSyncExternalStore` δέχεται ξεχωριστή τιμή για τον διακομιστή, οπότε το
  // React ξέρει ότι η διαφορά είναι δηλωμένη και όχι ασυμφωνία ενυδάτωσης.
  const kbdHint = useSyncExternalStore(
    KBD_NEVER_CHANGES,
    () => (/Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '') ? '⌘K' : 'Ctrl K'),
    () => 'Ctrl K',
  );

  // Προσβασιμότητα: εφαρμογή αποθηκευμένων προτιμήσεων σε όλη την εφαρμογή.
  useEffect(() => {
    try {
      const r = document.documentElement;
      if (localStorage.getItem('po_reduce_motion') === '1') r.classList.add('a11y-reduce-motion');
      if (localStorage.getItem('po_large_text') === '1') r.classList.add('a11y-large-text');
    } catch { /* ignore */ }
  }, []);

  // Καθολικό ⌘K / Ctrl+K για άνοιγμα του command palette.
  //
  // ΚΑΙ ΤΟ ESCAPE, ΠΟΥ ΕΛΕΙΠΕ ΕΝΤΕΛΩΣ. Το συρόμενο μενού και το μενού
  // κατάστασης άνοιγαν με πληκτρολόγιο και ΔΕΝ έκλειναν με πληκτρολόγιο: ο
  // μόνος τρόπος ήταν κλικ πάνω σε ένα πέπλο που δεν εστιάζεται. Οποιος
  // πλοηγείται με Tab έμενε κλειδωμένος μέσα σε ένα μενού που είχε ανοίξει
  // μόνος του. Η μία συνδρομή στο πληκτρολόγιο κλείνει και τα δύο: το Escape
  // σημαίνει «πίσω» και δεν υπάρχει λόγος να το γράψει καθένα ξεχωριστά.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setCmdkOpen(v => !v); return; }
      if (e.key === 'Escape') { setSidebarOpen(false); setStatusDropdown(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { alertCount: inventoryAlerts, itemCount: inventoryItems } = useInventoryAlerts(selected?.id||null, user?.id||null);
  const checklistAlerts = useChecklistAlerts(selected?.id||null);

  // Δικαιώματα συνδρομής: το «ενεργό» πλάνο ορίζει τι βλέπεις (βασικό πλάνο,
  // ανυψωμένο από ενεργούς δωρεάν μήνες ή ιδιότητα Συνεργάτη).
  const ent: EntitlementInput = { plan, profileType, partner: isPartner, compPlan, compUntil, trialUsedAt, holdPlan, holdUntil, bonusProperties: bonusProps, bonusUntil, createdAt: user?.created_at ?? null };
  const effPlan = effectivePlan(ent);

  // ── ΤΟ ΠΕΡΙΕΧΟΜΕΝΟ ΤΟΥ ΠΙΝΑΚΑ ΥΠΟΔΟΧΗΣ ──────────────────────────────────
  // Η ΔΟΚΙΜΗ ΡΩΤΙΕΤΑΙ ΑΠΟ ΤΗΝ ΙΔΙΑ ΠΗΓΗ ΜΕ ΤΟ ΠΛΑΝΟ. Ένας δεύτερος υπολογισμός
  // «είναι σε δοκιμή;» εδώ θα διαφωνούσε με το `effectivePlan` την ημέρα που θα
  // άλλαζε ο ορισμός — και ο χρήστης θα έβλεπε πίνακα δοκιμής με πληρωμένο πλάνο.
  const trial = trialState(ent);
  const startState = startPanel({
    properties: properties.length,
    documents: startSignals.documents,
    taxEvents: startSignals.taxEvents,
    trialActive: trial.active,
    daysLeft: trial.daysLeft,
  });
  const toggleStartPanel = (next: boolean) => {
    setStartCollapsed(next);
    if (!user) return;
    void saved('Η προτίμηση του πίνακα δεν αποθηκεύτηκε', supabase.from('onboarding_progress')
      .upsert({ user_id: user.id, start_collapsed: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }));
  };

  // Ο τρόπος «Επαγγελματίας» απαιτεί το πλάνο Επαγγελματίας (agency). Χωρίς αυτό, ο
  // χρήστης βλέπει ΜΟΝΟ την εμπειρία «Ιδιώτη» — δεν εμφανίζονται καθόλου οι
  // επαγγελματικές καρτέλες (η αλλαγή τρόπου στις Ρυθμίσεις παραπέμπει σε αναβάθμιση).
  const proEligible = planAtLeast(effPlan, 'agency');
  const effProfileType: 'individual' | 'professional' = proEligible ? profileType : 'individual';

  // ── ΤΙ ΑΦΟΡΑ ΑΥΤΟΝ ΤΟΝ ΧΡΗΣΤΗ ────────────────────────────────────────────
  // Τα τρία κριτήρια, μαζεμένα σε ένα αντικείμενο: νομική μορφή και ΟΛΑ τα ακίνητα
  // (η κατάσταση του επιλεγμένου δίνεται χωριστά, ανά απόφαση). Καμία μαντεψιά εδώ —
  // η λογική ζει στο lib/property/visibility.ts.
  const ownerCtx: OwnerContext = useMemo(() => ({ legalForm: taxForm, properties }), [taxForm, properties]);

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
    // κρίνει το tabDecision και ήταν γραμμένη και στα δύο σημεία.
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
        // ίσως αποτύχει. Η ενεργή καρτέλα φαίνεται ούτως ή άλλως (id===nav) και
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
    if (user) void saved('Η προτίμηση μενού δεν αποθηκεύτηκε',
      supabase.from('onboarding_progress').upsert({ user_id: user.id, nav_show_all: v }, { onConflict: 'user_id' }));
  };
  const showAllTabs = () => setNavShowAllPref(true);

  const fetchProperties = useCallback(async (uid: string) => {
    // ΤΟ «ΔΕΝ ΔΙΑΒΑΣΤΗΚΕ» ΔΕΝ ΕΙΝΑΙ «ΔΕΝ ΕΧΕΙΣ ΤΙΠΟΤΑ».
    //
    // Το `error` πεταγόταν και το `data || []` έκανε την αποτυχία να μοιάζει με
    // κενό χαρτοφυλάκιο: ο ιδιοκτήτης τριών ακινήτων, με κακό δίκτυο ή ληγμένο
    // token, έβλεπε «Καλωσήρθες — πρόσθεσε το πρώτο σου ακίνητο». Το χειρότερο
    // δεν είναι η λάθος οθόνη· είναι ότι πιστεύει πως έχασε τα δεδομένα του.
    const { rows: props, error } = await propertyStore.listWithError<Property>(supabase, uid, { columns: '*', orderBy: 'created_at' });
    if (error) { setLoadError(true); return; }
    setLoadError(false);
    setProperties(props);
    if (props.length > 0 && !selected) setSelected(props[0]);
    else if (selected) setSelected(props.find(p => p.id === selected.id) || props[0] || null);
  }, [selected]);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.assign('/login'); return; }
      setUser(user);
      // Καταγραφή παραπομπής (referral) στην πρώτη σύνδεση, idempotent. Η RPC
      // αναλύει τον κωδικό στον κάτοχο, μπλοκάρει την αυτο-παραπομπή και γράφει
      // τον referrer, ώστε η σύσταση να προσμετράται σωστά στον συστήνοντα.
      const refBy = (user.user_metadata as { referred_by?: string } | null)?.referred_by;
      if (refBy) { supabase.rpc('redeem_referral', { p_code: String(refBy) }).then(() => {}); }
      // Ιδιότητα συνεργάτη (για το έμβλημα στο header), αν έχει κερδηθεί.
      supabase.from('referral_partners').select('user_id').eq('user_id', user.id).maybeSingle().then(({ data }) => setIsPartner(!!data));
      // Τρέχον πλάνο (για το όριο ακινήτων). Αν δεν υπάρχει προφίλ, δωρεάν.
      billing.profile<{ plan?: string|null; profile_type?: string|null; comp_plan?: string|null; comp_until?: string|null; trial_used_at?: string|null; hold_plan?: string|null; hold_until?: string|null; bonus_properties?: number|null; bonus_properties_until?: string|null; legal_form?: string|null }>(supabase, user.id, 'plan, profile_type, comp_plan, comp_until, trial_used_at, hold_plan, hold_until, bonus_properties, bonus_properties_until, legal_form').then((data) => { setPlan(data?.plan || 'free'); setProfileType(data?.profile_type === 'professional' ? 'professional' : 'individual'); setCompPlan((data as { comp_plan?: string|null } | null)?.comp_plan ?? null); setCompUntil((data as { comp_until?: string|null } | null)?.comp_until ?? null); setTrialUsedAt((data as { trial_used_at?: string|null } | null)?.trial_used_at ?? null); setHoldPlan((data as { hold_plan?: string|null } | null)?.hold_plan ?? null); setHoldUntil((data as { hold_until?: string|null } | null)?.hold_until ?? null); setBonusProps((data as { bonus_properties?: number|null } | null)?.bonus_properties ?? null); setBonusUntil((data as { bonus_properties_until?: string|null } | null)?.bonus_properties_until ?? null); const raw = (data as { legal_form?: string|null } | null)?.legal_form ?? '';
        setTaxForm(LEGAL_FORMS.includes(raw as LegalForm) ? raw as LegalForm : 'individual'); });
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
        // ΕΝΑ COUNT ΛΙΓΟΤΕΡΟ ΣΕ ΚΑΘΕ ΦΟΡΤΩΣΗ: ΕΦΥΓΕ ΤΟ cnt('contacts').
        // Γέμιζε το σήμα `hasContacts`, που έθρεφε τον κανόνα αποκάλυψης
        // 'contacts' — για καρτέλα που δεν υπάρχει ούτε στα NAV_GROUPS
        // (δεκατρείς κωδικοί) ούτε στο NAV_ORDER (δεκαέξι). Τα τρία σημεία που
        // διαβάζουν την αποκάλυψη διατρέχουν ΜΟΝΟ ids των NAV_GROUPS, άρα το
        // 'contacts' δεν ρωτήθηκε ποτέ. Οι Επαφές αποδίδονται ως ενότητα μέσα
        // στο Αρχείο και ο μόνος δρόμος στο nav==='contacts' (ο βοηθός) κρίνεται
        // από το tabDecision. Πέντε COUNT έγιναν τέσσερα, ίδια ακριβώς οθόνη.
        const [{ data: ob, error: obErr }, { count }, { count: docCount }, loanRes, invRes, taxEvents] = await Promise.all([
          supabase.from('onboarding_progress').select('welcomed, revealed_tabs, nav_show_all, start_collapsed').eq('user_id', user.id).maybeSingle(),
          cnt('user_properties'),
          cnt('property_documents'),
          cnt('loans'),
          cnt('inventory_items'),
          // Το τρίτο βήμα του πίνακα υποδοχής: «είδε τις προθεσμίες του». Το
          // σήμα δεν είναι επίσκεψη σε καρτέλα αλλά ΓΕΓΟΝΟΣ στο ημερολόγιό του —
          // μια επίσκεψη δεν αφήνει ίχνος και θα ζητούσε δικό της πεδίο, δηλαδή
          // δεύτερη αλήθεια για το ίδιο πράγμα.
          calendarStore.taxEventCount(supabase, user.id),
        ]);
        setStartSignals({ documents: docCount || 0, taxEvents: taxEvents });
        if (!ob?.welcomed && (count || 0) === 0) setShowWelcome(true);
        // Σταδιακή αποκάλυψη: τι έχει ήδη ανοίξει + τι δικαιολογούν τα δεδομένα.
        //
        // ΚΡΙΣΙΜΟ: το supabase-js ΔΕΝ πετά εξαίρεση σε σφάλμα ερωτήματος — γυρίζει
        // { data: null, error }. Το try/catch από κάτω δεν πιάνει τίποτα. Αν δεν
        // ελέγξουμε ρητά το `error`, ένα αποτυχημένο read (π.χ. η εφαρμογή ανέβηκε
        // πριν εφαρμοστεί το migration που προσθέτει τις στήλες) θα περνούσε ως
        // «διαβάστηκαν κενές προτιμήσεις» και θα ΕΚΡΥΒΕ καρτέλες αντί να ανοίξει
        // fail-open. Μόνο όταν το read πετύχει δηλώνουμε τις προτιμήσεις φορτωμένες.
        const rec = ob as { revealed_tabs?: unknown; nav_show_all?: boolean; start_collapsed?: boolean | null } | null;
        setStartCollapsed(!!rec?.start_collapsed);
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
    if (!await saved('Η κατάσταση του ακινήτου δεν άλλαξε',
      propertyStore.update(supabase, selected.id, writeStatus(status), user.id))) return;
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
    // ── ΟΤΑΝ ΣΒΗΝΕΙΣ ΞΕΝΟ ΑΚΙΝΗΤΟ, ΤΟ ΞΕΡΕΙΣ ΠΡΙΝ ΤΟ ΠΑΤΗΣΕΙΣ ─────────────
    // Ενα μέλος οργανισμού με δικαίωμα επεξεργασίας μπορεί να σβήσει ακίνητο
    // ΤΟΥ ΙΔΙΟΚΤΗΤΗ: η πολιτική org_del_properties το επιτρέπει ρητά. Ο
    // διάλογος έλεγε τα ίδια λόγια και στις δύο περιπτώσεις, σαν να ήταν δικό
    // του. Δεν αφαιρούμε το δικαίωμα που έδωσε ο ιδιοκτήτης· λέμε τι είναι.
    const mine = (properties.find(x => x.id === pid)?.user_id ?? user.id) === user.id;
    const ok = await confirmDialog(
      `Οριστική διαγραφή του ακινήτου «${name}»;\n\n`+
      `Θα διαγραφούν όλα τα συνδεδεμένα στοιχεία του (έσοδα, δαπάνες, λογαριασμοί, `+
      `ενοικιαστής, δάνεια, απογραφή, έγγραφα, διαμονές), μαζί με όσα θυμάται `+
      `η Νόα γι’ αυτό. Η ενέργεια δεν αναιρείται.`+
      (mine ? `` : `\n\nΤο ακίνητο δεν είναι δικό σου: ανήκει στον ιδιοκτήτη που σε πρόσθεσε στην ομάδα. Η διαγραφή γράφεται στο ημερολόγιό του με το όνομά σου.`),
      { tone: 'negative', confirmLabel: 'Οριστική διαγραφή' }
    );
    if (!ok) return;
    // ── Η ΓΡΑΜΜΗ ΕΛΕΓΧΟΥ ΓΡΑΦΕΤΑΙ ΠΡΙΝ, ΟΧΙ ΜΕΤΑ ────────────────────────
    // Μετά τη διαγραφή το ακίνητο δεν υπάρχει και η log_activity δεν μπορεί
    // πια να βρει τον ιδιοκτήτη του — άρα η γραμμή θα κατέληγε στο ημερολόγιο
    // του δράστη, που είναι ακριβώς το σφάλμα που κλείνει η μετανάστευση
    // 20260824080000. Το όνομα ταξιδεύει στα μεταδεδομένα, γιατί ο πίνακας
    // κρατά μόνο αναγνωριστικό και το αναγνωριστικό δεν λέει τίποτα σε άνθρωπο.
    await logActivity(supabase, 'property_deleted', 'property', pid, { name });
    setStatusDropdown(false);
    // ── ΤΟ ΚΑΘΑΡΙΣΜΑ ΕΦΥΓΕ ΑΠΟ ΕΔΩ ────────────────────────────────────────
    // Εδώ καθόταν χειρόγραφη λίστα είκοσι πέντε πινάκων και είκοσι πέντε
    // ερωτήματα διαγραφής με `allSettled` — δηλαδή χωρίς κανείς να κοιτάζει τι
    // απάντησαν. Η λίστα ξεχνούσε έξι πίνακες (ανάμεσά τους τον ενεργό σύνδεσμο
    // δήλωσης άφιξης, με τα στοιχεία ταυτότητας των επισκεπτών), περιλάμβανε
    // έναν που δεν έχει καν στήλη `property_id` και ίσχυε μόνο για όποιον
    // σβήνει ακίνητο ΑΠΟ ΑΥΤΗ ΤΗΝ ΟΘΟΝΗ.
    //
    // Το καθάρισμα είναι πλέον ιδιότητα της βάσης: ξένα κλειδιά με CASCADE όπου
    // ο τύπος τα επιτρέπει, σκανδάλη όπου δεν τα επιτρέπει ακόμη. Ισχύει για
    // κάθε καλούντα — οθόνη, edge function, διαγραφή λογαριασμού — και δεν
    // ξεχνά, γιατί δεν είναι λίστα που συντηρεί άνθρωπος.
    // Βλ. supabase/migrations/20260814090000_referential_integrity.sql
    //
    // Το ακίνητο είναι η τελευταία γραμμή που φεύγει. Αν μείνει, ο χρήστης το
    // βλέπει άδειο στη λίστα και νομίζει ότι κάτι χάλασε μόνο του.
    if (!await saved('Το ακίνητο δεν διαγράφηκε',
      propertyStore.remove(supabase, pid, user.id))) return;
    // Σβήσε τη συνομιλία/μνήμη του βοηθού για το συγκεκριμένο ακίνητο (τοπικά στον browser).
    try { clearAssistantHistory(pid); } catch {}
    if (selected?.id === pid) setSelected(null);
    await fetchProperties(user.id);
    if (wasLast) { setNav('overview'); setShowAddModal(true); }
  };
  const deleteProperty = () => { if (selected) deletePropertyById(selected.id, selected.name); };

  // Καθάρισμα demo με ένα κλικ: σβήνει τα δείγματα ακίνητα/πελάτες/διαμονές.

  // Κλείσιμο σάρωσης: αν ήταν προσχέδιο από scan-to-create και δεν αποθηκεύτηκε
  // τίποτα (κανένα έγγραφο), σβήσε το κενό ακίνητο ώστε να μη μένουν σκουπίδια.
  // ΟΣΟ ΔΙΑΒΑΖΕΤΑΙ ΤΟ ΕΓΓΡΑΦΟ, ΤΟ ΠΑΡΑΘΥΡΟ ΔΕΝ ΚΛΕΙΝΕΙ.
  // Το `closeQuickAdd` παρακάτω ΔΙΑΓΡΑΦΕΙ το κενό προσχέδιο ακινήτου. Όταν το
  // παράθυρο απέκτησε Escape και κλικ-στο-φόντο, απέκτησε και δύο τρόπους να
  // πατηθεί κατά λάθος στη μέση της αναγνώρισης — και να σβήσει το ακίνητο που
  // μόλις δημιουργήθηκε από τη «Σάρωσε…».
  const [scanBusy, setScanBusy] = useState(false);

  const closeQuickAdd = async () => {
    setQuickAddOpen(false);
    const draft = scanDraftId; setScanDraftId(null);
    if (draft && user) {
      const count = await documents.count(supabase, draft, user.id);
      if ((count || 0) === 0) {
        if (!await saved('Το κενό προσχέδιο δεν καθαρίστηκε',
          propertyStore.remove(supabase, draft, user.id))) return;
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
  // του id και καθαρίζονται από τις Ρυθμίσεις.
  const signOut = async () => {
    // ΠΡΩΤΑ η αποσύνδεση. Αν αποτύχει (π.χ. χαμένο δίκτυο), ο χρήστης παραμένει
    // συνδεδεμένος — και θα ήταν παράλογο να έχει ήδη χάσει τις συνομιλίες του
    // για μια αποσύνδεση που δεν έγινε. Το supabase-js επιστρέφει το σφάλμα ως
    // τιμή, δεν το πετά, οπότε το ελέγχουμε ρητά.
    // ΟΙ ΕΙΔΟΠΟΙΗΣΕΙΣ ΦΕΥΓΟΥΝ ΠΡΙΝ ΑΠΟ ΤΗ ΣΥΝΕΔΡΙΑ, ΚΑΙ ΕΙΝΑΙ Η ΣΩΣΤΗ ΣΕΙΡΑ.
    // Η συνδρομή push ανήκει στη ΣΥΣΚΕΥΗ, όχι στη συνεδρία: χωρίς αυτό το βήμα,
    // ο αποσυνδεδεμένος υπολογιστής θα συνέχιζε να δείχνει κάθε πρωί τις
    // προθεσμίες του προηγούμενου χρήστη — και σε κοινή συσκευή αυτό είναι
    // διαρροή, όχι ενόχληση. Το σβήσιμο της γραμμής ΘΕΛΕΙ τη συνεδρία που
    // πρόκειται να λήξει: μετά την αποσύνδεση, η RLS δεν θα το επέτρεπε ποτέ.
    try {
      const gone = await unsubscribeDevice();
      if (gone) await pushDevices.remove(supabase, gone);
      setDeviceNotify(false);
    } catch { /* η αποσύνδεση δεν σταματά για μια συνδρομή */ }

    const { error } = await supabase.auth.signOut();
    if (error) {
      // duration 0 = μένει ώσπου να το κλείσει ο χρήστης, ίδιο βάρος με το alert που
      // αντικατέστησε. Οι δύο προτάσεις ενώθηκαν σε μία παράγραφο: το toast δεν
      // αποδίδει αλλαγές γραμμής και το «\n\n» θα κολλούσε τις προτάσεις μεταξύ τους.
      notifyError('Δεν έγινε η αποσύνδεση. Δες τη σύνδεσή σου στο δίκτυο και δοκίμασε ξανά. Τα δεδομένα σου στη συσκευή δεν πειράχτηκαν.', { duration: 0 });
      return;
    }
    clearLocalPersonalData();
    try { navigator.serviceWorker?.controller?.postMessage('pos-clear-caches'); } catch { /* ignore */ }
    // ΠΛΗΡΗΣ ΦΟΡΤΩΣΗ, ΟΧΙ ΠΛΟΗΓΗΣΗ ΤΟΥ ROUTER: μετά την αποσύνδεση θέλουμε να
    // πεθάνει ΟΛΗ η μνήμη της εφαρμογής, όχι να μείνει ζωντανή με άδειο χρήστη.
    // Ως `assign` και όχι ως ανάθεση στο `href`: ίδια ακριβώς συμπεριφορά, αλλά
    // ο μεταγλωττιστής του React δεν το διαβάζει ως μεταβολή εξωτερικής τιμής.
    window.location.assign('/login');
  };

  // Ο χειροποίητος κύκλος είχε ΔΙΚΟ ΤΟΥ inline <style> με @keyframes spin — ακριβές
  // διπλότυπο του globals.css. Δύο ορισμοί της ίδιας κίνησης σημαίνει ότι μια αλλαγή
  // ταχύτητας στο ένα σημείο άφηνε το άλλο πίσω.
  // ΤΟ `!user` ΔΕΝ ΕΙΝΑΙ ΑΜΥΝΤΙΚΟ — ΤΟ ΑΠΟΚΑΛΥΨΕ Ο ΤΥΠΟΣ.
  // Με `useState<any>` περνούσαν αμέτρητα `user.id` στις καρτέλες παρακάτω
  // χωρίς κανέναν έλεγχο· ο σωστός τύπος έβγαλε 20 σφάλματα «possibly null».
  // Ο έλεγχος μπαίνει ΕΔΩ και όχι σε κάθε χρήση, γιατί εδώ είναι η αλήθεια:
  // το `init()` κάνει `setUser` ΠΡΙΝ το `fetchProperties` και όταν ο χρήστης
  // λείπει κάνει redirect στο /login ΧΩΡΙΣ `setLoading(false)` — άρα το
  // `loading===false` συνεπάγεται ήδη `user !== null` (μοναδικό
  // `setLoading(false)` αυτού του component: γραμμή 1340, στο τέλος του init·
  // το άλλο, στη γραμμή 449, ανήκει στο τοπικό `loading` του OverviewTab).
  // ΓΙ' ΑΥΤΟ ΤΟ `!user` ΔΕΝ ΑΛΛΑΖΕΙ ΣΥΜΠΕΡΙΦΟΡΑ: στο μονοπάτι του redirect το
  // `loading` μένει true και ο δείκτης φόρτωσης έδειχνε ήδη. Γράφεται εδώ,
  // στο υπάρχον gate, για να ΚΩΔΙΚΟΠΟΙΗΣΕΙ την αναλλοίωτη μία φορά και να
  // στενέψει τον τύπο για ΟΛΗ την απόδοση — αντί για 20 `!` ή cast στα σημεία
  // χρήσης, που θα σιώπαγαν τον έλεγχο αντί να τον ικανοποιήσουν.
  if (loading || !user) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'var(--bg-base)'}}>
      <Spinner size={48} label="Φόρτωση…" />
    </div>
  );

  const userInitials = user?.email?.substring(0,2).toUpperCase() || 'GF';
  const statusColor = selected ? STATUS_COLORS[readStatus(selected)] : 'var(--text-secondary)';
  const statusLabel = selected ? statusLabelOf(selected) : '';
  // Η `getBadge` έφυγε: απαντούσε μόνο για `inventory` και `checklist`, που δεν
  // είναι καρτέλες του μενού. Τα δύο πλήθη τα διαβάζει απευθείας η κάτω μπάρα.

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
  // μένουν ακέραια και επιστρέφουν τη στιγμή που το ακίνητο αλλάζει κατάσταση.
  const decide = (id: string) => tabDecision(id, ownerCtx, selected, { hasInventory: inventoryItems > 0 });

  // Ορατή στην πλοήγηση: ό,τι αφορά τον χρήστη — και, αν ζήτησε «δείξε τα όλα»,
  // και τα υπόλοιπα, αχνά και με τον λόγο ως tooltip.
  // Το «δείξε τα όλα» ανασταίνει ό,τι κρύβεται επειδή δεν χρειάζεται ΑΚΟΜΗ. ΔΕΝ
  // ανασταίνει ό,τι δεν ισχύει καθόλου για αυτό το ακίνητο: ο Ενοικιαστής σε
  // βραχυχρόνια, οι Αποδόσεις σε ιδιοχρησία. Εκεί το αχνό κουμπί δεν είναι
  // δυνατότητα που δεν έχει ανοίξει, είναι λάθος στην οθόνη.
  // ΨΕΥΔΟ-ΚΑΡΤΕΛΕΣ: δεν είναι οθόνες του μενού αλλά ΕΝΕΡΓΕΙΕΣ που ανοίγουν
  // παράθυρο πάνω από την τρέχουσα οθόνη — η σάρωση και η επεξεργασία των
  // στοιχείων του ακινήτου. Δεν περνούν από τη μηχανή ορατότητας γιατί δεν
  // εξαρτώνται από την κατάσταση: ισχύουν πάντα. Χωρίς αυτή τη γραμμή, το
  // φίλτρο της ατζέντας θα τις έκοβε ως «αόρατες καρτέλες».
  const PSEUDO_TABS = new Set(['scan', 'edit']);
  const navVisible = (id: string) => {
    if (PSEUDO_TABS.has(id)) return true;
    const d = decide(id); return d.visible || (showAllTabsPref && d.applies);
  };

  // Αν ο χρήστης βρίσκεται σε καρτέλα που μόλις έπαψε να τον αφορά (άλλαξε την
  // κατάσταση, διέγραψε ακίνητο), δεν τον αφήνουμε σε οθόνη που δεν ισχύει.
  // Παράγεται κατά την απόδοση, όχι σε effect: το effect θα έδειχνε για ένα καρέ
  // την παλιά οθόνη.
  const navSafe = navVisible(nav) ? nav : 'overview';

  // ── ΤΟ «ΠΙΣΩ» ΔΕΙΧΝΕΙ ΠΑΝΩ, ΟΧΙ ΠΙΣΩ ────────────────────────────────────
  //
  // Έδειχνε την ΠΡΟΗΓΟΥΜΕΝΗ καρτέλα που είχε επισκεφθεί ο χρήστης και αυτό
  // παρήγαγε πινγκ-πονγκ: από το Αρχείο ανοίγεις τα Έπιπλα, γυρνάς στο Αρχείο,
  // και το «πίσω» σου προτείνει ξανά τα Έπιπλα — δηλαδή εκεί που μόλις ήσουν και
  // έφυγες. Δύο καρτέλες που παραπέμπουν η μία στην άλλη κλειδώνουν τον χρήστη
  // σε κύκλο, χωρίς έξοδο προς τα πάνω.
  //
  // Το «πίσω» δεν είναι ιστορικό — αυτό το κάνει ήδη ο περιηγητής. Είναι ΕΞΟΔΟΣ
  // προς το επίπεδο από πάνω και το επίπεδο από πάνω είναι πάντα ένα: η
  // Επισκόπηση. Ένας κανόνας, καμία κατάσταση να συντηρηθεί, κανένας κύκλος.
  //
  // ΜΙΑ ΕΞΑΙΡΕΣΗ, ΚΑΙ ΔΕΝ ΕΙΝΑΙ ΙΣΤΟΡΙΚΟ: ΤΑ ΕΠΙΠΛΑ ΖΟΥΝ ΜΕΣΑ ΣΤΟΝ ΦΑΚΕΛΟ.
  // Ο κανόνας παραπάνω λέει «το πίσω δείχνει προς τα πάνω» και για τα Έπιπλα το
  // επίπεδο από πάνω ΔΕΝ είναι η Επισκόπηση: είναι ο Φάκελος ακινήτου, από όπου
  // και ανοίγουν. Πηγαίνοντας στην Επισκόπηση ο χρήστης έχανε δύο επίπεδα με μία
  // κίνηση και ξαναέμπαινε από την αρχή για να δει το επόμενο χαρτί.
  //
  // ΚΑΙ ΔΕΝ ΞΑΝΑΝΟΙΓΕΙ Ο ΚΥΚΛΟΣ ΠΟΥ ΕΚΛΕΙΣΕ. Ο κύκλος γεννιόταν από ΙΣΤΟΡΙΚΟ:
  // δύο καρτέλες που η καθεμία θυμόταν την άλλη. Εδώ η σχέση είναι σταθερή και
  // μονόδρομη — τα Έπιπλα δείχνουν στον Φάκελο, ο Φάκελος στην Επισκόπηση, η
  // Επισκόπηση πουθενά. Αλυσίδα, όχι βρόχος.
  const PARENT_TAB: Record<string, string> = { inventory: 'documents' };
  const backTab = PARENT_TAB[navSafe] ?? 'overview';
  const backLabel = navLabel(backTab);

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
  // Τώρα: η καρτέλα κρατιέται όταν στέκει και πέφτει στην Επισκόπηση μόνο όταν
  // πραγματικά δεν αφορά το νέο ακίνητο.
  const switchProperty = (p: Property) => {
    setSelected(p);
    setSidebarOpen(false);
    setAnnounce(`Ενεργό ακίνητο: ${p.name}`);
  };

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
    // Η ΝΟΑ ΕΛΕΙΠΕ ΑΠΟ ΤΗΝ ΠΑΛΕΤΑ ΕΝΤΟΛΩΝ. Ο μόνος δρόμος ήταν το πλωτό κουμπί,
    // δηλαδή το ποντίκι — και μπαίνει πρώτη, γιατί είναι ο συντομότερος δρόμος
    // προς οτιδήποτε άλλο στη λίστα.
    { id: 'act-ask', label: `Ρώτα τη ${ASSISTANT_NAME}`, hint: 'Βοηθός', keywords: 'noa βοηθός assistant ρώτα σάρωσε',
      action: () => askAssistant() },
    { id: 'act-add', label: 'Προσθήκη ακινήτου', hint: 'Ενέργεια', keywords: 'new property add', action: () => tryAddProperty() },
    { id: 'act-signout', label: 'Αποσύνδεση', hint: 'Ενέργεια', keywords: 'logout sign out exit', action: () => signOut() },
  ];

  return (
    <div className="app-shell">
      {/* Η ζώνη που ανακοινώνει την αλλαγή ενεργού ακινήτου. Κενή στην πρώτη
          απόδοση: μια ήσυχη ζώνη με περιεχόμενο από την αρχή διαβάζεται μαζί με
          τη σελίδα και χάνει τον λόγο ύπαρξής της. */}
      <p role="status" aria-live="polite" className="sr-only">{announce}</p>

      {/* Σκίαση πίσω από το συρόμενο μενού (μόνο κινητό/tablet).
          `aria-hidden`: είναι πέπλο, όχι χειριστήριο — δεν πρέπει να εστιάζεται
          ούτε να ανακοινώνεται. Ο δρόμος του πληκτρολογίου είναι το Escape, που
          μέχρι τώρα δεν υπήρχε καθόλου. */}
      <div aria-hidden className={`app-scrim ${sidebarOpen?'open':''}`} onClick={()=>setSidebarOpen(false)}/>
      <aside className={`app-sidebar ${sidebarOpen?'open':''}`}>
        {/* ΤΟ ΛΟΓΟΤΥΠΟ ΕΙΝΑΙ ΞΑΝΑ ΠΟΡΤΑ, ΚΑΙ ΤΩΡΑ ΔΕΝ ΕΙΝΑΙ Η ΜΟΝΗ.
            Είχε γίνει απλό σήμα επειδή ως μοναδικός δρόμος προς την Επισκόπηση
            δεν μπορούσε να πει «είσαι ήδη εδώ»: πλοήγηση χωρίς κατάσταση. Το
            πρόβλημα το έλυσε η γραμμή «Επισκόπηση», που υπάρχει πλέον πρώτη στο
            μενού με aria-current. Το σήμα μπορεί λοιπόν να ξαναγίνει πόρτα χωρίς
            να ξαναφέρει το ελάττωμα: όποιος θέλει να ξέρει πού βρίσκεται το
            διαβάζει στη γραμμή και όποιος έμαθε από κάθε άλλη εφαρμογή ότι το
            λογότυπο γυρίζει στην αρχή, το πατά και γυρίζει.

            Το `aria-label` λέει τον προορισμό και όχι το όνομα του προϊόντος:
            ένας αναγνώστης οθόνης που ανακοινώνει «PROPERWISE, κουμπί» δεν
            πληροφορεί κανέναν για το τι θα συμβεί. */}
        <button type="button" className="sidebar-logo" aria-label={`Πήγαινε στην ${navLabel('overview')}`}
          onClick={()=>{ setNav('overview'); setSidebarOpen(false); }}>
          <BrandLogo size={22} />
        </button>

        {/* Κεντρικό κουμπί: μια φωτογραφία → αυτόματη καταχώρηση παντού.
            Το εικονίδιο ήταν 20 μέσα σε δικό του γυάλινο πλαίσιο 42×42, με άλλη
            ακτίνα και τρεις δικές του εσωτερικές σκιές — κουτί μέσα σε κουτί.
            Πλέον είναι 18, στη ΙΔΙΑ στήλη με κάθε άλλο εικονίδιο της μπάρας. */}
        <button
          onClick={()=>{ setQuickAddOpen(true); setSidebarOpen(false); }}
          className="quick-add-btn"
          disabled={!selected}
          title={selected ? 'Φωτογράφισε ή ανέβασε λογαριασμό, πληρωμή, μισθωτήριο, ασφάλεια, έγγραφο, οτιδήποτε' : 'Πρόσθεσε πρώτα ένα ακίνητο'}>
          <span className="quick-add-icon" aria-hidden>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </span>
          <span className="quick-add-label">Σάρωσε έγγραφο</span>
        </button>

        {/* Η ΛΙΣΤΑ ΑΚΙΝΗΤΩΝ ΕΦΥΓΕ ΑΠΟ ΕΔΩ, ΣΤΗΝ ΠΑΝΩ ΜΠΑΡΑ.
            Απέδιδε ΚΑΘΕ ακίνητο ως γραμμή 46 εικονοστοιχείων. Με το πακέτο
            «Επαγγελματίας» (15 ακίνητα) αυτό είναι 908 εικονοστοιχεία ΠΑΝΩ από
            την πρώτη γραμμή πλοήγησης: σε οθόνη 900 ο χρήστης κυλούσε για να
            βρει τις «Δαπάνες», σε 768 δεν έβλεπε καμία καρτέλα χωρίς κύλιση.
            Δηλαδή όσο πιο πολλά πλήρωνε, τόσο χειρότερα δούλευε η εφαρμογή.
            Το ύψος του μενού δεν εξαρτάται πια από το πλήθος των ακινήτων.
            Βλ. components/PropertySwitcher.tsx. */}
        <div className="sidebar-nav" style={{flex:1}}>
          {NAV_GROUPS.map((group,gi) => {
            // Χωρίς διπλότυπα: τα εργαλεία (Απογραφή/Αρχείο/Εκκρεμότητες) είναι δωρεάν
            // και στα δύο προφίλ· εμφανίζονται όμως σε ΕΝΑ σημείο ανά προφίλ — στον
            // Ιδιώτη μέσα στην Επισκόπηση, στον Επαγγελματία στην πλαϊνή μπάρα.
            // Οι Επαφές δεν αναφέρονται εδώ γιατί ΔΕΝ είναι εργαλείο του μενού:
            // αποδίδονται ως ενότητα μέσα στο Αρχείο, όπου και ανήκουν.
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
              .filter(x => x.d.visible || (showAllTabsPref && x.d.applies));
            if (items.length === 0) return null;
            return (
            <div className="sidebar-section" key={gi}>
              {items.map(({ id, d }) => { const locked=!isTabAllowed(ent, id); return (
                // Η μη-σχετική καρτέλα (ορατή μόνο με «δείξε τα όλα») είναι αχνή και
                // λέει γιατί. Χωρίς λουκέτο και χωρίς έμβλημα: δεν της ζητάμε τίποτα,
                // την αφήνουμε στη θέση της για όποιον θέλει να ξέρει ότι υπάρχει.
                //
                // ΤΟ ΕΜΒΛΗΜΑ ΕΦΥΓΕ ΑΠΟ ΕΔΩ. Ηταν κόκκινος μετρητής που δεν
                // εμφανίστηκε ΠΟΤΕ: η `getBadge` απαντούσε μόνο για `inventory` και
                // `checklist` και κανένα από τα δύο δεν είναι καρτέλα του μενού.
                // Κώδικας που παραβίαζε και τον κανόνα του κόκκινου, για μια
                // περίπτωση που δεν υπήρχε.
                // ΤΟ `data-nav` ΕΙΝΑΙ ΓΙΑ ΤΟΝ ΕΛΕΓΧΟ, ΚΑΙ ΓΙ' ΑΥΤΟ ΔΕΝ ΕΙΝΑΙ ΠΕΡΙΤΤΟ.
                // Το σενάριο e2e ανοίγει ΚΑΘΕ καρτέλα και βεβαιώνεται ότι κατέβηκε
                // και αποδόθηκε. Χωρίς σταθερή λαβή θα έπρεπε να πατά ελληνικές
                // ετικέτες — που αλλάζουν με τον τύπο προφίλ («Πρόγραμμα
                // Συνεργατών» αντί για «Προσκλήσεις») και με κάθε διόρθωση
                // κειμένου, δηλαδή ο έλεγχος θα έσπαγε για λόγους άσχετους με
                // αυτό που ελέγχει.
                <button key={id} data-nav={id} className={`sidebar-item ${nav===id?'active':''}`} onClick={()=>{setNav(id);setSidebarOpen(false);}} disabled={!selected}
                  aria-current={nav===id ? 'page' : undefined}
                  style={d.visible ? undefined : { opacity: 0.45 }}
                  title={d.visible ? (locked ? 'Διαθέσιμο σε ανώτερο πακέτο' : undefined) : d.reason}>
                  <span className="sidebar-item-icon" aria-hidden>{ic(NAV_ICON[id]||'')}</span>
                  <span className="sidebar-item-label">{id==='referral' && effProfileType==='professional' ? 'Πρόγραμμα Συνεργατών' : NAV_LABEL[id]}</span>
                  {d.visible && locked && <LockBadge/>}
                </button>
              );})}
            </div>
          );})}

          {/* ΟΙ ΚΡΥΜΜΕΝΕΣ ΚΑΡΤΕΛΕΣ ΔΕΝ ΕΙΝΑΙ ΜΥΣΤΙΚΟ, ΚΑΙ Ο ΔΙΑΚΟΠΤΗΣ ΕΧΕΙ ΔΥΟ ΚΑΤΕΥΘΥΝΣΕΙΣ.
              Το κουμπί ήταν μονόδρομος: μόλις πατιόταν, το πλήθος των κρυμμένων
              γινόταν μηδέν και το ίδιο το κουμπί ΕΞΑΦΑΝΙΖΟΤΑΝ. Το μενού έμενε
              γεμάτο για πάντα, εκτός αν ο χρήστης μάντευε ότι η αναίρεση λέγεται
              «Απλοποιημένο μενού», βρίσκεται σε άλλη καρτέλα, μέσα σε πτυσσόμενη
              ενότητα. Τώρα η επιστροφή είναι στο ίδιο σημείο με τη μετάβαση. */}
          {(() => {
            // Μετρώνται μόνο όσες ΑΦΟΡΟΥΝ τον χρήστη: το «+3» δεν πρέπει να υπόσχεται
            // καρτέλες που, μόλις τις αποκαλύψει, θα του πουν ότι δεν τον αφορούν.
            const candidates = NAV_GROUPS.flatMap(g => g.ids)
              .filter(id => isTabPurchasable(effProfileType, id) && decide(id).visible
                         && id !== nav && !SELF_DISCLOSING.has(id));
            if (navShowAll) {
              // Χωρίς κρυμμένες, δεν υπάρχει τι να επαναφέρεις.
              if (hiddenTabCount(candidates, { ...disclosure, showAll: false }) === 0) return null;
              return (
                <button type="button" onClick={() => setNavShowAllPref(false)} className="sidebar-item" style={{ color: 'var(--text-tertiary)' }}
                  title="Κρύβει ξανά όσες καρτέλες δεν χρειάζεσαι αυτή τη στιγμή. Δεν χάνεται τίποτα: επανέρχονται με ένα κλικ.">
                  <span className="sidebar-item-icon" aria-hidden>{ic('M4 6h16|M4 12h10|M4 18h6')}</span>
                  <span className="sidebar-item-label">Λιγότερες καρτέλες</span>
                </button>
              );
            }
            const hidden = hiddenTabCount(candidates, disclosure);
            if (hidden === 0) return null;
            return (
              <button type="button" onClick={showAllTabs} className="sidebar-item" style={{ color: 'var(--text-tertiary)' }}
                title="Η εφαρμογή δείχνει πρώτα όσα χρειάζεσαι τώρα. Οι υπόλοιπες καρτέλες εμφανίζονται μόλις αποκτήσουν νόημα, ή τώρα με ένα κλικ.">
                <span className="sidebar-item-icon" aria-hidden>{ic('M4 6h16|M4 12h16|M4 18h16')}</span>
                <span className="sidebar-item-label">Όλες οι καρτέλες</span>
                <span style={{ marginLeft: 'auto', fontFamily: T.font.sans, fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>+{hidden}</span>
              </button>
            );
          })()}
        </div>
        {/* ΤΟ ΥΠΟΣΕΛΙΔΟ ΗΤΑΝ ΝΑΡΚΗ. Ολόκληρη η γραμμή του χρήστη ήταν ΕΝΑ κουμπί
            αποσύνδεσης και η μόνη ένδειξη ήταν η λέξη «Αποσύνδεση» γραμμένη
            ως υπότιτλος — δηλαδή ακριβώς εκεί όπου κάθε εφαρμογή γράφει το
            email σου. Οποιος πατούσε νομίζοντας «ο λογαριασμός μου» έβγαινε
            έξω. Η γραμμή πάει τώρα στον Λογαριασμό· η αποσύνδεση έχει δικό της
            κουμπί, με δικό της όνομα και δικό της στόχο αφής. */}
        <div className="sidebar-footer">
          <button className="user-row" onClick={()=>{setNav('settings');setSidebarOpen(false);}} title="Λογαριασμός και ρυθμίσεις">
            <span className="user-avatar" aria-hidden>{userInitials}</span>
            <span className="user-name">{user?.email?.split('@')[0]}</span>
          </button>
          <button className="sign-out-btn" onClick={signOut} aria-label="Αποσύνδεση" title="Αποσύνδεση">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>
          </button>
        </div>
      </aside>

      <main className="app-main">
        <header className="app-topbar">
          <button className="nav-toggle" onClick={()=>setSidebarOpen(v=>!v)} aria-label="Μενού">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          </button>
          {selected ? (
            <>
              <div style={{flex:1,minWidth:0}}>
                {/* ΤΟ ΚΟΥΜΠΙ ΚΑΤΑΣΤΑΣΗΣ ΕΠΕΦΤΕ ΠΑΝΩ ΣΤΟΝ ΦΑΚΟ ΣΕ ΚΙΝΗΤΟ.
                    Η γραμμή δεν τύλιγε και κανένα από τα δύο παιδιά της δεν
                    μπορούσε να συρρικνωθεί: ο επιλογέας ακινήτου φτάνει τα
                    46vw και το κουμπί κατάστασης γράφει ολόκληρο το
                    «Βραχυχρόνια μίσθωση». Στα 390 εικονοστοιχεία, με το μενού
                    αριστερά και τον φακό δεξιά, το άθροισμα ξεπερνά το πλάτος
                    και το πλεόνασμα ΔΕΝ κόβεται: ξεχειλίζει από πάνω του.

                    Το τύλιγμα δίνει στην κατάσταση δική της γραμμή αντί να της
                    κόψει το κείμενο. Η κατάσταση ορίζει ΠΟΙΕΣ καρτέλες
                    εμφανίζονται, οπότε ένα «Βραχυχρόνια μίσ…» θα ήταν χειρότερο
                    από μια γραμμή παραπάνω. Σε πλάτος που χωρά, τίποτα δεν
                    αλλάζει: το wrap ενεργοποιείται μόνο όταν δεν χωρά. */}
                <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:10,rowGap:8,minWidth:0}}>
                  {/* Ο ΤΙΤΛΟΣ ΗΤΑΝ ΝΕΚΡΟ <span>. Δίπλα του καθόταν ήδη ένα κουμπί
                      που ανοίγει μενού και 250 εικονοστοιχεία αριστερότερα η
                      πλαϊνή μπάρα ξανάλεγε το ίδιο όνομα με άλλη τελεία και άλλο
                      μέγεθος. Δύο σπίτια για ένα αντικείμενο· τώρα ένα και
                      κάνει και τη δουλειά. Δύο κουμπιά, δύο ερωτήσεις που δεν
                      μπερδεύονται: «ποιο ακίνητο» και «σε τι κατάσταση είναι». */}
                  <PropertySwitcher
                    items={properties.map(p => ({ id: p.id, name: p.name, status: statusLabelOf(p), address: p.address }))}
                    activeId={selected.id}
                    onSelect={(id)=>{ const p = properties.find(x=>x.id===id); if (p) switchProperty(p); }}
                    onAdd={()=>tryAddProperty()}
                    canAdd={canAddProperty(ent, properties.length)} />
                  {/* Ένα κουμπί: κατάσταση ακινήτου + εργαλεία (επεξεργασία, διαγραφή) στο ίδιο μενού. */}
                  <div style={{position:'relative',minWidth:0}}>
                    <button onClick={()=>setStatusDropdown(v=>!v)} title="Κατάσταση ακινήτου και εργαλεία (επεξεργασία, διαγραφή)" aria-haspopup="menu" aria-expanded={statusDropdown} style={{display:'flex',alignItems:'center',gap:7,height:T.h.sm,padding:'0 10px 0 12px',borderRadius:8,border:'1px solid var(--border-default)',background:statusDropdown?'var(--bg-hover)':'transparent',cursor:'pointer',fontFamily: T.font.sans,fontSize:12,fontWeight:500,color:'var(--text-primary)',transition:'background 0.15s'}} onMouseEnter={e=>{if(!statusDropdown)e.currentTarget.style.background='var(--bg-hover)'}} onMouseLeave={e=>{if(!statusDropdown)e.currentTarget.style.background='transparent'}}>
                      <div style={{width:6,height:6,borderRadius:'50%',background:statusColor}}/>{statusLabel}
                      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{opacity:0.65,marginLeft:1,transform:statusDropdown?'rotate(180deg)':'none',transition:'transform 0.15s'}}><path d="m6 9 6 6 6-6"/></svg>
                    </button>
                    {statusDropdown && (
                      <>
                      {/* Κλείσιμο με κλικ οπουδήποτε αλλού. Πέπλο, όχι κουμπί:
                          `aria-hidden` ώστε να μη μπει στη σειρά του Tab. Με
                          πληκτρολόγιο κλείνει με Escape. */}
                      <div aria-hidden onClick={()=>setStatusDropdown(false)} style={{position:'fixed',inset:0,zIndex:99}}/>
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
                                <span style={{display:'block',fontSize:12,color:'var(--text-tertiary)',fontWeight:400,marginTop:1,lineHeight:1.4}}>{hint}</span>
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
                  {[PROP_TYPE_LABELS[selected.prop_type||'']||selected.prop_type,selected.sqm?`${selected.sqm} τ.μ.`:null,selected.address,selected.postal_code?`ΤΚ ${selected.postal_code}`:null].filter(Boolean).join(' · ')}
                </div>
              </div>
              {/* Η «Αντιγραφή απογραφής» έφυγε από ΕΔΩ. Ήταν κουμπί στην καθολική
                  μπάρα του ακινήτου — chrome που ανήκει σε ΟΛΗ την εφαρμογή —
                  και εμφανιζόταν για μία μόνο καρτέλα. Ζει τώρα στο μενού της
                  ίδιας της απογραφής, μαζί με τις άλλες της ενέργειες. */}
              {/* ΤΟ ΜΕΤΑΛΛΙΟ ΙΔΙΟΤΗΤΑΣ ΕΦΥΓΕ ΑΠΟ ΕΔΩ, ΚΑΙ ΑΠΟ ΠΑΝΤΟΥ.
                  Ηταν ένα χτυπημένο «νόμισμα» με ανάγλυφη στεφάνη, ακτινική
                  διαβάθμιση και σπιτάκι μέσα, στην πιο ακριβή θέση της
                  εφαρμογής. Δεν έλεγε τίποτα που ο χρήστης να μη ξέρει: ότι
                  είναι ιδιώτης. Δεν πατιόταν, δεν άλλαζε, δεν προειδοποιούσε.
                  Και το σκεύωμα του μεταλλίου —γυαλάδες, στεφάνες, σκιές— ήταν
                  ξένο σώμα σε μια επίπεδη, ήσυχη διεπαφή. */}
              <button onClick={()=>setCmdkOpen(true)} title={`Αναζήτηση και γρήγορες ενέργειες (${kbdHint})`} aria-label="Αναζήτηση" style={{display:'flex',alignItems:'center',gap:8,height:T.h.md,padding:'0 10px 0 12px',borderRadius: T.radius.modal,border:'1px solid var(--border-default)',background:'transparent',color:'var(--text-secondary)',cursor:'pointer',marginRight:4,flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
                <span className="desktop-only" style={{fontSize:11,fontFamily: T.font.mono,color:'var(--text-tertiary)',border:'1px solid var(--border-subtle)',borderRadius:6,padding:'1px 5px'}}>{kbdHint}</span>
              </button>
            </>
          ) : (
            <><div style={{flex:1,fontFamily: T.font.sans,fontSize:14,color:'var(--text-secondary)'}}>Κανένα ακίνητο ακόμη</div></>
          )}
        </header>

        {!selected && loadError ? (
          <div className="app-content" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div style={{maxWidth:460,width:'100%',textAlign:'center'}}>
              <h1 style={{fontFamily: T.font.sans,fontSize:22,fontWeight:700,color:'var(--text-primary)',margin:'0 0 10px'}}>Δεν μπόρεσα να διαβάσω τα ακίνητά σου</h1>
              <p style={{fontFamily: T.font.sans,fontSize:14,color:'var(--text-secondary)',lineHeight:1.6,margin:'0 auto 20px',maxWidth:400}}>
                Τα δεδομένα σου είναι ασφαλή· απλώς δεν φορτώθηκαν τώρα. Συνήθως φταίει η σύνδεση.
              </p>
              <button onClick={()=>{ if(user) fetchProperties(user.id); }} style={{padding:'0 20px',height:T.h.md,borderRadius:T.radius.pill,background:'var(--accent)',border:'none',color:'var(--accent-text)',fontSize:14,fontWeight:600,fontFamily:T.font.sans,cursor:'pointer'}}>Δοκίμασε ξανά</button>
            </div>
          </div>
        ) : !selected ? (
          <div className="app-content" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div style={{maxWidth:560,width:'100%',textAlign:'center'}}>
              <div style={{width:64,height:64,borderRadius: T.radius.modal,background:'var(--accent-dim)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 20px'}}>
                <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5 12 3l9 6.5"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>
              </div>
              <h1 style={{fontFamily: T.font.sans,fontSize:28,fontWeight:700,letterSpacing:'-0.02em',color:'var(--text-primary)',margin:'0 0 8px'}}>Καλωσήρθες στο PROPERWISE</h1>
              <p style={{fontFamily: T.font.sans,fontSize:14,color:'var(--text-secondary)',lineHeight:1.6,margin:'0 auto 24px',maxWidth:420}}>Πρόσθεσε το πρώτο σου ακίνητο και ξεκλείδωσε αποδόσεις, δαπάνες, λογαριασμούς, φορολογία και διαχείριση ενοικιαστή, όλα σε ένα σημείο.</p>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,150px),1fr))',gap:12,marginBottom:28,textAlign:'left'}}>
                {[
                  {t:'Αποδόσεις και Φόρος 2026',d:'Μεικτή/καθαρή απόδοση, φόρος βάσει κλίμακας'},
                  {t:'Λογαριασμοί και Ενέργεια',d:'Σύγκριση 11 παρόχων ρεύματος/αερίου'},
                  {t:'Ενοικιαστής και Συμβόλαιο',d:'Πληρωμές, λήξεις, εγγύηση, ιστορικό'},
                ].map((f,i)=>(
                  <div key={i} style={{background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:12,padding:'14px 16px'}}>
                    <div style={{fontFamily: T.font.sans,fontSize:13,fontWeight:700,color:'var(--text-primary)',marginBottom:4}}>{f.t}</div>
                    <div style={{fontFamily: T.font.sans,fontSize:11,color:'var(--text-tertiary)',lineHeight:1.5}}>{f.d}</div>
                  </div>
                ))}
              </div>
              {/* Η ΜΟΝΑΔΙΚΗ ΧΡΗΣΗ ΤΟΥ ΠΑΛΙΟΥ `.btn`. Είχε δικό της ύψος, ακτίνα και
                  μέγεθος γραμματοσειράς, δηλαδή έμοιαζε με κουμπί άλλης
                  εφαρμογής δίπλα σε κάθε άλλο κουμπί της ίδιας οθόνης. */}
              <Btn variant="primary" onClick={() => tryAddProperty()}>Προσθήκη πρώτου ακινήτου</Btn>
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
              {/* Ο κανόνας ήταν ήδη γραμμένη αρχή — «η έξοδος είναι πάντα ένα
                  επίπεδο πάνω, δηλαδή η Επισκόπηση» — αλλά εφαρμοζόταν σε πέντε
                  καρτέλες από τις είκοσι δύο, γραμμένες με το χέρι. Δηλαδή στην
                  Αξιοποίηση, στη Λογιστική, στο Δάνειο, στις Δαπάνες, στην
                  Πρόσκληση και στον Λογαριασμό ο μόνος δρόμος πίσω ήταν η πλαϊνή
                  μπάρα — που σε κινητό είναι κλειστή.
                  Τώρα το ερώτημα δεν είναι «ποια καρτέλα το δείχνει» αλλά
                  «υπάρχει επίπεδο από πάνω;». Δεν υπάρχει σε δύο: στην ίδια την
                  Επισκόπηση και στο Χαρτοφυλάκιο που στέκει πάνω από αυτήν. */}
              {navSafe !== 'overview' && navSafe !== 'portfolio' && (
                <button onClick={()=>setNav(backTab)} title={`Πίσω: ${backLabel}`} aria-label={`Πίσω: ${backLabel}`}
                  style={{display:'inline-flex',alignItems:'center',gap:6,marginBottom:14,padding:'4px 4px 4px 0',border:'none',background:'transparent',color:'var(--text-tertiary)',fontFamily: T.font.sans,fontSize:13,fontWeight:600,cursor:'pointer'}}
                  onMouseEnter={e=>e.currentTarget.style.color='var(--text-primary)'} onMouseLeave={e=>e.currentTarget.style.color='var(--text-tertiary)'}>
                  <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                  {backLabel}
                </button>
              )}
              {navSafe==='portfolio' && (isTabAllowed(ent,'portfolio')
                ? <PortfolioTab properties={properties} userId={user.id} onSelectProperty={(id)=>{ const p=properties.find(x=>x.id===id); if(p){ setSelected(p); setNav('overview'); } }}/>
                : <FeatureLock title="Το χαρτοφυλάκιό σου με μια ματιά" benefit={`Συγκεντρωτική εικόνα του χαρτοφυλακίου, με έσοδα, αποδόσεις και εκκρεμότητες σε ένα σημείο. Ξεκλειδώνει με το πακέτο ${PLANS.agency.name}.`} requiredPlan="agency" currentPlanName={PLANS[effPlan].name} onManage={()=>setNav('settings')} />)}
              {/* ═══ Ο ΠΙΝΑΚΑΣ ΤΗΣ ΔΟΚΙΜΗΣ, ΠΑΝΩ ΑΠΟ ΤΑ ΠΑΝΤΑ ═══════════════
                  Ζει ΕΔΩ και όχι μέσα στην Επισκόπηση για δύο λόγους: είναι
                  πλαίσιο του λογαριασμού, όχι του ακινήτου (τα βήματά του
                  μετρούν ό,τι έχει ο ΧΡΗΣΤΗΣ) και η Επισκόπηση θα κουβαλούσε
                  έξι ακόμη props για κάτι που δεν την αφορά. */}
              {navSafe==='overview' && (
                <StartPanel state={startState} collapsed={startCollapsed} onToggle={toggleStartPanel}
                  onNavigate={(t)=> t==='scan' ? setQuickAddOpen(true) : setNav(t)}
                  onPreview={()=>setShowPreview(true)} onAsk={()=>askAssistant('', false)} />
              )}
              {/* ═══ ΤΟ `key` ΕΙΝΑΙ Ο ΔΙΑΚΟΠΤΗΣ ΤΗΣ ΚΟΥΡΣΑΣ ═══════════════════════
                  ΤΟ ΣΦΑΛΜΑ: αλλάζεις ακίνητο ενώ φορτώνει το προηγούμενο. Η
                  `load` δεν έχει ακύρωση και το component ΔΕΝ ξαναστηνόταν —
                  άρα οι δεκατρείς παράλληλες ερωτήσεις του παλιού ακινήτου
                  γύριζαν αργότερα και έγραφαν πάνω στις καινούργιες. Ο χρήστης
                  έβλεπε το όνομα, τη διεύθυνση και την κατάσταση του ακινήτου Β
                  με τις δαπάνες, τους λογαριασμούς, τον μισθωτή και τον
                  ΕΚΤΙΜΩΜΕΝΟ ΦΟΡΟ του ακινήτου Α. Χωρίς σφάλμα, χωρίς σπίνερ
                  και απολύτως πειστικά.

                  Με `key`, η αλλαγή ακινήτου δεν είναι ενημέρωση· είναι νέος
                  πίνακας. Ό,τι επιστρέψει από την προηγούμενη φόρτωση γράφει σε
                  component που δεν υπάρχει πια και η React το αγνοεί. Το ίδιο
                  ισχύει για κάθε καρτέλα που φορτώνει δικά της δεδομένα. */}
              {navSafe==='overview'  && <OverviewTab key={selected.id} prop={selected} properties={properties} userId={user.id} onNavigate={(t)=> t==='scan' ? setQuickAddOpen(true) : t==='edit' ? setEditProperty(selected) : setNav(t)} tabVisible={navVisible}/>}
              {nav==='finances'  && <TabFinances propertyId={selected.id} userId={user.id} propertyName={selected.name} profileType={effProfileType} legalForm={taxForm} onScan={()=>setQuickAddOpen(true)}/>}
              {nav==='calendar'  && <TabCalendar key={selected.id} propertyId={selected.id} userId={user.id} openTasks={checklistAlerts} onOpenTasks={()=>setNav('checklist')}/>}
              {/* ═══ Η ΒΡΑΧΥΧΡΟΝΙΑ ΣΤΕΚΕΤΑΙ ΜΟΝΗ ΤΗΣ ═══════════════════════════
                  Ζούσε μέσα στην καρτέλα «Πελάτης», που απαιτεί πακέτο
                  Επαγγελματία. Ο ιδιώτης με ακίνητο σε Airbnb δεν έφτανε ΠΟΤΕ
                  στη δυναμική τιμή ούτε στο «τι μου μένει» — τα δύο εργαλεία που
                  τον αφορούν περισσότερο από κάθε άλλο. Το πελατολόγιο μένει
                  επαγγελματικό εργαλείο· η βραχυχρόνια μίσθωση δεν είναι. */}
              {navSafe==='pricing'   && (<>
                <AmaStrip userId={user.id} propertyId={selected.id}/>
                <TabPricing propertyId={selected.id} userId={user.id} propertyName={selected.name} propertyRent={(selected.target_rent??undefined)} propertySqm={selected.sqm??undefined}/>
              </>)}
              {/* Η ΚΕΦΑΛΙΔΑ ΤΗΣ ΑΞΙΟΠΟΙΗΣΗΣ ΕΦΥΓΕ ΑΠΟ ΕΔΩ. Γραφόταν δύο φορές:
                  εδώ ως «ΑΞΙΟΠΟΙΗΣΗ ΑΚΙΝΗΤΟΥ / Κενό· πώς θα μισθωθεί…» και
                  αμέσως μετά μέσα στην καρτέλα ως «ΚΕΝΟ · Όνομα» πάνω από τον
                  δικό της τίτλο. Η κατάσταση εμφανιζόταν δύο φορές σε εξήντα
                  εικονοστοιχεία και ο υπότιτλος του PLAN_SUB έλεγε ό,τι λέει
                  ήδη ο τίτλος της καρτέλας με καλύτερα λόγια. Η επικεφαλίδα ζει
                  μέσα στο component, όπως σε κάθε άλλη καρτέλα. */}
              {navSafe==='plan'      && <TabPlan propertyId={selected.id} userId={user.id} status={readStatus(selected)} property={selected}/>}
              {navSafe==='tenant'    && <TabTenant key={selected.id} propertyId={selected.id} userId={user.id} plan={effPlan} onStartHandover={(tenantName,tenantPhone,type)=>{ setHandoverIntent({tenantName,tenantPhone,type}); setNav('inventory'); }}/>}
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
                  <TabRentROI key={selected.id} propertyId={selected.id} userId={user.id} propertyValue={selected.value??undefined} profileType={effProfileType} legalForm={taxForm} plan={effPlan}/>
                  {/* ═══ ΤΟ «ΣΧΕΔΙΟ» ΗΤΑΝ ΕΔΩ, ΚΑΙ ΔΕΝ ΤΟ ΕΒΛΕΠΕ ΚΑΝΕΙΣ ═══════════
                      Αποδιδόταν μέσα στην Απόδοση, με συνθήκη τις τέσσερις
                      καταστάσεις κενό / προς πώληση / ανακαίνιση / αμφισβητούμενο.
                      Μόνο που η Απόδοση φαίνεται ΑΚΡΙΒΩΣ στις δύο άλλες
                      καταστάσεις — μακροχρόνια και βραχυχρόνια — γιατί χωρίς
                      έσοδο δεν υπάρχει απόδοση να μετρηθεί. Οι δύο συνθήκες ήταν
                      αλληλοαποκλειόμενες: το Σχέδιο δεν εμφανίστηκε ποτέ σε
                      κανέναν χρήστη. Τετρακόσιες εβδομήντα οκτώ γραμμές
                      συμβουλευτικής, γραμμένες και απρόσιτες.

                      Τώρα στέκει μόνο του στο μενού, ακριβώς εκεί που λείπει. */}
                  {/* ΔΥΟ ΚΑΝΟΝΕΣ ΓΙΑ ΕΝΑ ΕΡΩΤΗΜΑ. Εδώ αρκούσε «πάνω από ένα
                      ακίνητο», ενώ η ίδια η εφαρμογή ορίζει τη σύγκριση ως δύο
                      ακίνητα ΙΔΙΟΥ ΤΥΠΟΥ (canCompare). Με διαμέρισμα και θέση
                      στάθμευσης, η οθόνη τύπωνε τίτλο και υπότιτλο «2 ακίνητα
                      δίπλα-δίπλα» και από κάτω η ίδια η σύγκριση απαντούσε
                      «δεν υπάρχουν δύο ακίνητα ίδιου τύπου». */}
                  {canCompare(properties) && (
                    <div style={{marginTop:T.sp.section}}>
                      <SecHdr label="Σε σχέση με τα υπόλοιπα ακίνητά σου" sub={`${properties.length} ακίνητα δίπλα-δίπλα`}/>
                      {isTabAllowed(ent,'comparison')
                        ? <TabComparison properties={properties} userId={user.id}/>
                        : <FeatureLock title="Σύγκρινε τα ακίνητά σου δίπλα-δίπλα" benefit={`Απόδοση, δαπάνες και πάροχοι όλων των ακινήτων σου σε έναν πίνακα, για να δεις καθαρά πού κερδίζεις και πού χρειάζεται να λάβεις αποφάσεις. Ξεκλειδώνει με το πακέτο ${PLANS.owner.name}.`} requiredPlan="owner" currentPlanName={PLANS[effPlan].name} onManage={()=>setNav('settings')} />}
                    </div>
                  )}
                </>
              )}
              {nav==='loan'      && <TabLoan key={selected.id} propertyId={selected.id} userId={user.id} propertyValue={selected.value??undefined} propertySqm={selected.sqm??undefined} propertyYearBuilt={selected.year_built??undefined} profileType={effProfileType}/>}
              {nav==='accounting'&& <TabAccounting key={selected.id} propertyId={selected.id} userId={user.id} profileType={effProfileType} legalForm={taxForm} plan={effPlan} onNavigate={(t)=>setNav(t)}/>}
              {navSafe==='inventory' && <TabInventory key={selected.id} propertyId={selected.id} userId={user.id} profileType={effProfileType} handoverIntent={handoverIntent} onIntentConsumed={()=>setHandoverIntent(null)} properties={properties}/>}
              {nav==='checklist' && <TabChecklist key={selected.id} propertyId={selected.id} userId={user.id} profileType={effProfileType}/>}
              {/* Ο ΕΛΕΓΧΟΣ ΤΟΥ ΑΜΑ ΕΙΝΑΙ ΕΞΩ ΑΠΟ ΤΟ FeatureLock, ΣΚΟΠΙΜΑ.
                  Ο ΑΜΑ που λείπει ή δεν αναγράφεται στην αγγελία κλείνει την
                  καταχώρηση — 12.145 στάλθηκαν για απενεργοποίηση το 2025. Κανείς
                  δεν πληρώνει συνδρομή για να μάθει ότι έχει πρόβλημα. Το CRM από
                  κάτω κλειδώνει· η προειδοποίηση ποτέ. */}
              {navSafe==='clients'   && (
                <>
                  <AmaStrip userId={user.id} propertyId={selected.id}/>
                  {isTabAllowed(ent,'clients')
                    ? <TabClients userId={user.id} onSelectProperty={(id)=>{ const p=properties.find(x=>x.id===id); if(p){ setSelected(p); setNav('overview'); } }}/>
                    : <FeatureLock title={`${navLabel('clients')} και υποψήφιοι`} benefit={`Οργάνωσε επισκέπτες, ιστορικό διαμονών και υποψήφιους σε ένα σημείο. Ξεκλειδώνει με το πακέτο ${PLANS.agency.name}.`} requiredPlan="agency" currentPlanName={PLANS[effPlan].name} onManage={()=>setNav('settings')} />}
                  {/* Η δυναμική τιμή ανά νύχτα αφορά ΜΟΝΟ βραχυχρόνια — δηλαδή
                      ακριβώς τους επισκέπτες αυτής της καρτέλας. Ως χωριστή
                      καρτέλα ήταν ένας προορισμός που κανείς δεν σκεφτόταν να
                      επισκεφθεί όταν όριζε τιμή. */}
                </>
              )}
              {/* Πάροχοι, τεχνικοί, τράπεζες: είναι στοιχεία ΤΟΥ ΑΚΙΝΗΤΟΥ, όπως
                  τα έγγραφά του. Δύο καρτέλες για «πού βρίσκω αυτό που χρειάζομαι
                  για το ακίνητο» ήταν μία παραπάνω. */}
              {/* ΤΟ «contacts» ΔΕΝ ΕΙΧΕ ΟΘΟΝΗ, ΚΑΙ Ο ΒΟΗΘΟΣ ΕΣΤΕΛΝΕ ΕΚΕΙ.
                  Μετά την ενοποίηση, οι Επαφές ζουν ΜΕΣΑ στο Αρχείο. Κανένας
                  κλάδος όμως δεν απέδιδε τίποτα για nav==='contacts': η Νόα
                  έγραφε [[go:contacts]] σε τέσσερις απαντήσεις, ο χρήστης
                  πατούσε και έβλεπε ΜΟΝΟ το κουμπί «Πίσω» πάνω από κενή οθόνη.
                  Ο κωδικός μένει ζωντανός —τον ξέρει το NAV_LABELS και τον
                  στέλνει ο βοηθός— και οδηγεί εκεί που όντως είναι οι επαφές. */}
              {(nav==='documents' || nav==='contacts') && (
                <>
                  <TabDocuments key={selected.id} propertyId={selected.id} userId={user.id} profileType={effProfileType}/>
                  {/* Η επικεφαλίδα ζει ΜΕΣΑ στο component, μαζί με τις ενέργειές
                      της. Εδώ γραφόταν δεύτερη φορά και από κάτω το ίδιο το
                      component τύπωνε τίτλο σελίδας με υπότιτλο που έλεγε την
                      ίδια πρόταση με άλλες λέξεις. */}
                  <div style={{marginTop:T.sp.section}}>
                    <TabContacts propertyId={selected.id} userId={user.id} embedded profileType={effProfileType} properties={properties}/>
                  </div>
                  {/* ΤΑ ΠΡΑΓΜΑΤΑ ΤΟΥ ΑΚΙΝΗΤΟΥ, ΜΑΖΙ ΜΕ ΤΑ ΧΑΡΤΙΑ ΚΑΙ ΤΟΥΣ
                      ΑΝΘΡΩΠΟΥΣ ΤΟΥ. Ο εξοπλισμός ήταν «εργαλείο» στην πλαϊνή
                      μπάρα, δίπλα στο Αρχείο, κάτω από ένα όνομα ομάδας που δεν
                      έλεγε τίποτα για κανένα από τα δύο. Εδώ είναι μία γραμμή
                      που οδηγεί στην πλήρη σελίδα, όχι δεύτερο αντίγραφό της. */}
                  {/* Ο ΣΥΝΔΕΣΜΟΣ ΕΜΦΑΝΙΖΟΤΑΝ ΧΩΡΙΣ ΚΑΜΙΑ ΣΥΝΘΗΚΗ.
                      Η καρτέλα του όμως φαίνεται μόνο σε μίσθωση: σε ιδιοχρησία,
                      κενό, ανακαίνιση, προς πώληση ή αμφισβητούμενο, ο χρήστης
                      διάβαζε τίτλο ενότητας και κάρτα «Άνοιγμα απογραφής» και
                      το πάτημα τον γύριζε σιωπηλά στην Επισκόπηση. Πέντε από τις
                      επτά καταστάσεις. Ίδιος κανόνας με το μενού, ένα σημείο. */}
                  {navVisible('inventory') && (
                  <div style={{marginTop:T.sp.section}}>
                    <SecHdr label={navLabel('inventory')} sub="Αξία, εγγυήσεις, συντήρηση και παράδοση"/>
                    <button onClick={()=>setNav('inventory')}
                      style={{display:'flex',alignItems:'center',gap:12,width:'100%',textAlign:'left',padding:'14px 16px',borderRadius:12,border:'1px solid var(--border-subtle)',background:'var(--bg-elevated)',cursor:'pointer',fontFamily:'inherit'}}>
                      <div style={{minWidth:0,flex:1}}>
                        <p style={{fontSize:14,fontWeight:500,color:'var(--text-primary)',marginBottom:2}}>Άνοιγμα απογραφής</p>
                        <p style={{fontSize:12,color:'var(--text-tertiary)',lineHeight:1.5}}>Ό,τι υπάρχει μέσα στο ακίνητο, με την αξία του, την εγγύησή του και το πρωτόκολλο παράδοσης.</p>
                      </div>
                      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M9 18l6-6-6-6"/></svg>
                    </button>
                  </div>
                  )}
                </>
              )}
              {nav==='referral'  && <TabReferral userId={user.id} plan={plan} profileType={effProfileType}/>}
              {nav==='settings'  && <TabSettings propertyId={selected.id} userId={user.id} profileType={effProfileType} onProfileChange={setProfileType}/>}
            </div>
            </TabBoundary>
          </>
        )}
      </main>

      {/* Κάτω μπάρα πλοήγησης, μόνο σε κινητό (≤768px, μέσω CSS) */}
      {selected && (
        <nav className="bottom-nav" aria-label="Κύρια πλοήγηση">
          {BOTTOM_NAV.map(item => {
            const isActive = item.id !== 'more' && nav === item.id;
            const onTap = item.id === 'more' ? () => setSidebarOpen(true) : () => setNav(item.id);
            const alerts = inventoryAlerts + checklistAlerts;
            const badge = item.id === 'more' && alerts > 0;
            return (
              // Η ΕΝΕΡΓΗ ΚΑΡΤΕΛΑ ΛΕΓΟΤΑΝ ΜΟΝΟ ΜΕ ΧΡΩΜΑ και η κόκκινη τελεία
              // ήταν σκέτη τελεία: δύο πληροφορίες που ο αναγνώστης οθόνης δεν
              // μπορούσε να μεταφέρει με κανέναν τρόπο. Το `aria-current` λέει
              // πού βρίσκεσαι και το σήμα αποκτά τον αριθμό του.
              <button key={item.id} className={`bottom-nav-item ${isActive?'active':''}`} onClick={onTap}
                aria-current={isActive ? 'page' : undefined} style={{position:'relative'}}>
                {badge && <span className="bottom-nav-badge"/>}
                {item.icon}
                <span>{item.label}</span>
                {badge && <span className="sr-only">{alerts === 1 ? '1 εκκρεμότητα' : `${alerts} εκκρεμότητες`}</span>}
              </button>
            );
          })}
        </nav>
      )}

      {/* Ήπια μηνιαία παρότρυνση για feedback (πρώτες μέρες του μήνα).
          ΓΙΑΤΙ ΖΗΤΑΕΙ ΚΑΙ `selected`: το κουμπί «Πες τη γνώμη σου» στέλνει το
          συμβάν `pos:open-feedback` και το ακούει ΜΟΝΟ ο βοηθός — ο οποίος
          αποδίδεται μόνο όταν υπάρχει επιλεγμένο ακίνητο. Χωρίς ακίνητο, ο
          χρήστης έβλεπε παρότρυνση, πατούσε το κύριο κουμπί της και δεν
          συνέβαινε απολύτως τίποτα. */}
      {user&&selected&&<MonthlyFeedbackNudge/>}

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
          canNavigate={navVisible}
          planBrief={planBriefing(effPlan, plan, trial.active ? trial.daysLeft : undefined)}
          onScan={()=>setQuickAddOpen(true)}
        />
      )}

      <CommandPalette open={cmdkOpen} onClose={()=>setCmdkOpen(false)} items={cmdItems} />

      {/* Η ΣΑΡΩΣΗ ΗΤΑΝ ΤΟ ΤΕΛΕΥΤΑΙΟ ΧΕΙΡΟΓΡΑΦΟ ΠΑΡΑΘΥΡΟ ΤΗΣ ΣΕΛΙΔΑΣ.
          Είχε ωμό `rgba(0,0,0,0.32)` για φόντο — πιο ανοιχτό από το T.scrim
          (0,55) που φοράει κάθε άλλο παράθυρο, οπότε η ΠΙΟ κεντρική ενέργεια
          της εφαρμογής σκοτείνιαζε λιγότερο από μια επιβεβαίωση διαγραφής.
          Ακτίνα 14 αντί 18, δικό του «×» σε κύκλο 34 εικονοστοιχείων, καμία
          αντίδραση στο Escape, καμία επιστροφή εστίασης και καμία κλειδαριά
          κύλισης: το φόντο κυλούσε πίσω από τον σαρωτή. */}
      {/* ΧΩΡΙΣ ΥΠΟΤΙΤΛΟ, ΓΙΑΤΙ ΤΟΝ ΕΧΕΙ ΗΔΗ ΤΟ ΠΕΡΙΕΧΟΜΕΝΟ. Το ίδιο το
          DocumentScan ανοίγει με «Πρόσθεσε ένα έγγραφο» και από κάτω τη γραμμή
          «Φωτογράφισε ή ανέβασε οτιδήποτε…». Ο υπότιτλος του παραθύρου έλεγε τα
          ίδια με άλλες λέξεις, δηλαδή δύο τίτλοι και δύο υπότιτλοι στη σειρά —
          και έμεναν και πάνω από την οθόνη επιτυχίας («Καταχωρήθηκε»), όπου δεν
          σαρώνει πια τίποτα. Ο τίτλος μένει: είναι το όνομα του παραθύρου δίπλα
          στο «×» και το μόνο που ακούει ο αναγνώστης οθόνης — το χειρόγραφο
          παράθυρο δεν είχε κανένα. */}
      <Modal open={!!(quickAddOpen&&user&&selected)} onClose={()=>{ if(!scanBusy) closeQuickAdd(); }} width={820}
        title="Σάρωση εγγράφου">
        {user&&selected&&<DocumentScan propertyId={selected.id} userId={user.id} onBusyChange={setScanBusy}
          onSaved={async()=>{setScanDraftId(null);await fetchProperties(user.id);}}/>}
      </Modal>

      {showWelcome&&user&&<WelcomeOnboarding userId={user.id}
        onAddProperty={()=>{ setShowWelcome(false); setShowAddModal(true); }}
        onScanCreate={async()=>{
          setShowWelcome(false);
          const data = await savedData<Property>('Το ακίνητο δεν δημιουργήθηκε',
            propertyStore.addFull<Property>(supabase, { user_id:user.id, name:'Νέο ακίνητο', prop_type:'apartment', status_detail:'vacant' }));
          await fetchProperties(user.id);
          if (!data) return;
          setSelected(data); setScanDraftId(data.id);
          setNav('overview'); setQuickAddOpen(true);
        }}
        onProfile={setProfileType}
        onClose={()=>setShowWelcome(false)} />}
      {/* ΤΟ ΠΑΡΑΔΕΙΓΜΑ ΔΕΝ ΓΡΑΦΕΙ ΤΙΠΟΤΑ. Ήταν ακίνητο μέσα στον λογαριασμό, με
          κουμπί καθαρισμού που έψαχνε λάθος όνομα και δεν εμφανιζόταν ποτέ. */}
      <DemoPreview open={showPreview} onClose={()=>setShowPreview(false)}
        onAddProperty={()=>{ setShowPreview(false); tryAddProperty(); }} />
      {showAddModal&&user&&<AddPropertyWizard userId={user.id} onClose={()=>setShowAddModal(false)} onSaved={async()=>{setShowAddModal(false);await fetchProperties(user.id);}}/>}
      {editProperty&&user&&<AddPropertyWizard userId={user.id} existing={editProperty} onClose={()=>setEditProperty(null)} onSaved={async()=>{setEditProperty(null);await fetchProperties(user.id);}}/>}
      {showUpgrade&&<UpgradeModal currentCount={properties.length} planId={effPlan} profileType={effProfileType} onClose={()=>setShowUpgrade(false)} onManage={()=>{setShowUpgrade(false);setNav('settings');}}/>}
    </div>
  );
}