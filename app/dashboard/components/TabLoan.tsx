'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Calculator, Building2, Home, Wrench, Leaf, ChevronDown, ChevronUp,
  ExternalLink, Check, AlertTriangle, Star, RefreshCw, Plus, Trash2,
  DollarSign, Save, TrendingUp, Users, Briefcase, ShieldCheck, Zap,
  Calendar, ArrowRight, PieChart, Percent, X, BookOpen, FileText, Award
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
type LoanType = 'purchase'|'first_home'|'renovation'|'energy'|'investment'|'auction'|'construction'|'commercial'|'land'|'refinance'
type RateType = 'fixed'|'variable'|'mixed'
type BorrowerType = 'individual'|'professional'|'company'|'young'|'family'|'senior'|'military'|'abroad'
interface SavedLoan { id:string; property_id:string; user_id:string; bank:string; loan_type:LoanType; amount:number; property_value:number; rate:number; rate_type:RateType; years:number; start_date:string; status:string; notes:string }
interface AmortRow { month:number; payment:number; principal:number; interest:number; balance:number; totalInterestPaid:number }

// ─── Live Market Data ─────────────────────────────────────────────────────────
// ⚠️ ΣΗΜΑΝΤΙΚΟ: Ενημέρωσε αυτές τις τιμές κάθε φορά που αλλάζουν τα επιτόκια ΕΚΤ
// Πηγή: https://www.bankofgreece.gr | https://www.ecb.europa.eu
const MARKET = {
  euribor_3m: 2.18,
  euribor_1m: 2.05,
  ecb_rate:   2.40,
  last_update: 'Ιούνιος 2026',
  source_url: 'https://www.bankofgreece.gr',
}

// ─── Banks — πραγματικά επιτόκια vresdaneio.gr & bank websites Απρίλιος/Ιούνιος 2026
const BANKS = [
  {
    id:'eurobank', name:'Eurobank', color:'#00549f',
    fixed3:'2.50-2.90', fixed5:'3.40-3.50', fixed10:'3.80-3.90', fixed15:'4.10-4.20', fixed20:'4.10-4.20',
    variable_spread_min:0.60, variable_spread_max:2.45, fixed_min:2.50,
    max_ltv:90, max_years:35, max_amount:500000, max_age:75, min_amount:20000,
    green_discount:0.20, spiti_mou:true,
    features:['Spread από 0.60% (χαμηλότερο αγοράς)','Χωρίς έξοδα έγκρισης','Νομικός+Τεχνικός δωρεάν (750€)','Προέγκριση 48ω','Υπογραφή gov.gr','Εκταμίευση σε 10 εργ. ημέρες'],
    programs:['Σπίτι μου ΙΙ','Αναβαθμίζω','Εξοικονομώ'],
    note:'Χαμηλότερο spread αγοράς',
    fees:'Χωρίς έξοδα εξέτασης',
    url:'https://www.eurobank.gr/el/retail/proionta-upiresies/proionta/daneia/stegastika',
  },
  {
    id:'ethniki', name:'Εθνική Τράπεζα', color:'#003087',
    fixed3:'2.90-3.20', fixed5:'3.50', fixed10:'3.70', fixed15:'4.20', fixed20:'4.20',
    variable_spread_min:1.60, variable_spread_max:2.85, fixed_min:2.80,
    max_ltv:90, max_years:35, max_amount:500000, max_age:75, min_amount:30000,
    green_discount:0.25, spiti_mou:true,
    features:['Έως 90% LTV','Σταθερό 3-30 χρόνια','Χωρίς έξοδα αίτησης','Ενεργειακή αναβάθμιση -0.25%','Τρίτεκνοι: extra επιδότηση 50%'],
    programs:['Σπίτι μου ΙΙ','Αναβαθμίζω','Εξοικονομώ 2025'],
    note:'Υψηλότερο LTV 90%',
    fees:'Χωρίς έξοδα εξέτασης αιτήματος',
    url:'https://www.nbg.gr/el/idiwtes/daneia/stegastika-daneia',
  },
  {
    id:'alpha', name:'Alpha Bank', color:'#cc0000',
    fixed3:'2.80', fixed5:'3.40', fixed10:'3.80', fixed15:'4.10', fixed20:'4.20',
    variable_spread_min:1.80, variable_spread_max:2.20, fixed_min:2.50,
    max_ltv:90, max_years:35, max_amount:300000, max_age:75, min_amount:25000,
    green_discount:0.10, spiti_mou:true,
    features:['Σταθερό 2.50% για νέους (3ετία)','90% LTV','Χάρις 2 χρόνια','Χωρίς έξοδα αίτησης','Estia Ανακαίνιση','Κλάση A/A+: -0.25%'],
    programs:['Σπίτι μου ΙΙ','Alpha Πρώτη Κατοικία','Estia Ανακαίνιση'],
    note:'Ειδικό πρόγραμμα νέων 2.50%',
    fees:'Χωρίς έξοδα εξέτασης',
    url:'https://www.alpha.gr/el/idiotika/daneia/stegastika-daneia',
  },
  {
    id:'piraeus', name:'Τράπεζα Πειραιώς', color:'#ff6600',
    fixed3:'2.40-4.70', fixed5:'2.40-4.70', fixed10:'2.40-4.70', fixed15:'2.40-4.70', fixed20:'2.40-4.70',
    variable_spread_min:1.40, variable_spread_max:2.45, fixed_min:2.40,
    max_ltv:90, max_years:35, max_amount:500000, max_age:75, min_amount:20000,
    green_discount:0.15, spiti_mou:true,
    features:['Πράσινα: spread 1.25%','Euribor 1M βάση','Online εκτίμηση ακινήτου','Ψηφιακή διαδικασία','Γρήγορη εκταμίευση'],
    programs:['Σπίτι μου ΙΙ','Αναβαθμίζω','Εξοικονομώ'],
    note:'Καλύτερο για πράσινα δάνεια',
    fees:'Έξοδα φακέλου από 300€',
    url:'https://www.piraeusbank.gr/el/idiwtes/proionta-upiresies/stegastika-daneia',
  },
  {
    id:'optima', name:'Optima Bank', color:'#8b1a1a',
    fixed3:'3.90', fixed5:'3.50-4.00', fixed10:'3.40-3.90', fixed15:'4.30-4.80', fixed20:'4.30-4.80',
    variable_spread_min:2.00, variable_spread_max:3.00, fixed_min:2.90,
    max_ltv:75, max_years:30, max_amount:300000, max_age:75, min_amount:20000,
    green_discount:0.10, spiti_mou:false,
    features:['Γρήγορη έγκριση','Premium εξυπηρέτηση','Σταθερό + κυμαινόμενο','Αναχρηματοδότηση'],
    programs:['Ανακαινίζω','Εξοικονομώ'],
    note:'Premium εξυπηρέτηση',
    fees:'Τιμολόγιο κατά περίπτωση',
    url:'https://www.optimabank.gr/individuals/daneia/stegastiko-daneio/',
  },
  {
    id:'credia', name:'CrediaBank', color:'#2d6a4f',
    fixed3:'3.00-3.30', fixed5:'3.60-3.90', fixed10:'4.00-4.20', fixed15:'4.30-4.60', fixed20:'4.50-4.70',
    variable_spread_min:1.60, variable_spread_max:2.70, fixed_min:2.60,
    max_ltv:80, max_years:30, max_amount:250000, max_age:70, min_amount:15000,
    green_discount:0.10, spiti_mou:true,
    features:['Μικρά ποσά αποδεκτά','Ευέλικτοι όροι','Γρήγορη εξέταση','Σπίτι μου ΙΙ'],
    programs:['Σπίτι μου ΙΙ','Εξοικονομώ'],
    note:'Ευελιξία & μικρά ποσά',
    fees:'Κατά περίπτωση',
    url:'https://www.crediabank.gr',
  },
  {
    id:'attica', name:'Attica Bank', color:'#1a4a8a',
    fixed3:'3.20-3.60', fixed5:'3.70-4.00', fixed10:'4.00-4.30', fixed15:'4.40-4.70', fixed20:'4.50-4.80',
    variable_spread_min:1.80, variable_spread_max:2.90, fixed_min:3.00,
    max_ltv:75, max_years:30, max_amount:200000, max_age:70, min_amount:15000,
    green_discount:0.10, spiti_mou:false,
    features:['Ευέλικτοι όροι αποπληρωμής','Γρήγορη εξέταση','Ανακαινίσεις & μικρές αγορές'],
    programs:['Εξοικονομώ'],
    note:'Ευέλικτοι όροι',
    fees:'Κατά περίπτωση',
    url:'https://www.atticabank.gr',
  },
]

// ─── Custom bank template (για χρήστη που βάζει δική του τράπεζα)
const CUSTOM_BANK_TEMPLATE = {
  id:'custom', name:'Άλλη Τράπεζα', color:'#5a5a70',
  fixed3:'—', fixed5:'—', fixed10:'—', fixed15:'—', fixed20:'—',
  variable_spread_min:0, variable_spread_max:0, fixed_min:0,
  max_ltv:80, max_years:30, max_amount:500000, max_age:75, min_amount:10000,
  green_discount:0, spiti_mou:false,
  features:['Βάλε τα στοιχεία στο Calculator'],
  programs:[], note:'Προσαρμοσμένη τράπεζα', fees:'—', url:'',
}

// ─── State Programs — ΜΟΝΟ ενεργά εντός 2026 ή επερχόμενα ────────────────────
// Πηγές: greece20.gov.gr, ypen.gov.gr, exoikonomo2025.gov.gr, dovaluegreece.gr
const STATE_PROGRAMS = [
  {
    id:'spiti_mou_2', name:'Σπίτι μου ΙΙ', icon:'🏠', color:'#34d399', status:'active',
    type:'Κρατικό — Επιδότηση επιτοκίου 50%',
    desc:'Χρηματοδότηση έως 190.000€ για πρώτη κατοικία. Το Ταμείο Ανάκαμψης καλύπτει άτοκα το 50% — η τράπεζα το υπόλοιπο 50% με επιδοτούμενο επιτόκιο.',
    max_amount:190000, max_prop_value:250000, max_ltv:90, max_sqm:150,
    age_min:25, age_max:50, duration:'3-30 χρόνια',
    deadline:'31/08/2026 — τελευταία ημέρα συμβασιοποίησης',
    deadline_urgent: true,
    total_budget:'2 δισ. ευρώ (ΤΑΑ + Τράπεζες)',
    criteria:['Ηλικία 25-50 ετών','Πρώτη & κύρια κατοικία στην Ελλάδα','Εισόδημα ≤ 40.000€ (ατομικό)','Εισόδημα ≤ 50.000€ (οικογένεια)','Συμβολαιογρ. αξία ≤ 250.000€','Έως 150 τ.μ.','Δεν κατέχεις άλλη κατοικία'],
    how_it_works:'50% δανείου = Ταμείο Ανάκαμψης (άτοκο) · 50% = τράπεζα (χαμηλό επιτόκιο) · Επιδότηση 50% στο τραπεζικό επιτόκιο → πολύ χαμηλή τελική δόση',
    extra:'Τρίτεκνοι/Πολύτεκνοι + γονείς 2 παιδιών (Δήμοι Ορεστιάδας/Διδυμοτείχου/Σουφλίου): επιπλέον 50% επιδότηση επιτοκίου',
    savings_example:'Δάνειο 150.000€ × 25χρ → εξοικονόμηση ~45.000€ τόκων έναντι κανονικού δανείου',
    url:'https://greece20.gov.gr/home-loans/',
    banks:['Εθνική','Alpha','Eurobank','Πειραιώς','Optima','CrediaBank'],
  },
  {
    id:'anavathmizo', name:'Αναβαθμίζω το Σπίτι μου', icon:'⚡', color:'#a78bfa', status:'active',
    type:'Κρατικό — Δάνειο ενεργειακής αναβάθμισης',
    desc:'Δάνειο έως 25.000€ με επιδοτούμενο επιτόκιο από Ταμείο Ανάκαμψης για ενεργειακή αναβάθμιση κατοικίας',
    max_amount:25000, max_prop_value:null, max_ltv:null, max_sqm:null,
    age_min:18, age_max:null, duration:'3-15 χρόνια',
    deadline:'31/08/2026',
    deadline_urgent: true,
    total_budget:'80 εκ. ευρώ',
    criteria:['Μόνιμη κατοικία','ΠΕΑ πριν και μετά παρέμβαση','Αναβάθμιση ≥3 ενεργειακές κατηγορίες','Εξοικονόμηση >30% πρωτογενούς ενέργειας'],
    how_it_works:'Δάνειο για παρεμβάσεις ενεργειακής αναβάθμισης (κουφώματα, μόνωση, θέρμανση, ΑΠΕ) με επιδοτούμενο επιτόκιο από ΤΑΑ',
    extra:'Αυξημένη επιδότηση για ΑμεΑ, τρίτεκνους, πολύτεκνους, νέους',
    savings_example:'Εξοικονόμηση ενέργειας + χαμηλό επιτόκιο δανείου = διπλό όφελος',
    url:'https://greece20.gov.gr/home-loans/',
    banks:['Εθνική','Alpha','Eurobank','Πειραιώς','CrediaBank'],
  },
  {
    id:'exoikonomo_2025', name:'Εξοικονομώ 2025', icon:'🌿', color:'#34d399', status:'active',
    type:'Επιδότηση ενεργειακής αναβάθμισης — ΤΑΑ',
    desc:'Επιδότηση για ενεργειακή αναβάθμιση κατοικίας. Deadline ολοκλήρωσης εργασιών: 30/06/2026 (ΤΕΕ ζητά παράταση έως 31/12/2026)',
    max_amount:null, max_prop_value:null, max_ltv:null, max_sqm:null,
    age_min:18, age_max:null, duration:'Εφάπαξ επιδότηση',
    deadline:'30/06/2026 — ολοκλήρωση εργασιών (αναμένεται παράταση)',
    deadline_urgent: true,
    total_budget:'Ταμείο Ανάκαμψης ΕΕ',
    criteria:['Εξοικονόμηση >30% πρωτογενούς ενέργειας','Αναβάθμιση ≥3 ενεργειακές κατηγορίες','ΠΕΑ πριν και μετά','Νόμιμη κατοικία στην Ελλάδα'],
    how_it_works:'Επιδότηση παρεμβάσεων ενεργειακής αναβάθμισης: κουφώματα, μόνωση, θέρμανση, φωτοβολταϊκά, ηλιακοί θερμοσίφωνες',
    extra:'Ειδικά αυξημένα κίνητρα για ΑμεΑ, τρίτεκνους, πολύτεκνους, νέους',
    savings_example:'Μείωση λογαριασμών ενέργειας + επιδότηση κόστους αναβάθμισης',
    url:'https://exoikonomo2025.gov.gr/',
    banks:['Εθνική','Alpha','Eurobank','Πειραιώς'],
  },
  {
    id:'exoikonomo_2026', name:'Εξοικονομώ 2026', icon:'🍃', color:'#60a5fa', status:'upcoming',
    type:'Επερχόμενο — 2ο εξάμηνο 2026',
    desc:'Νέος κύκλος με €1.2 δισ. από Κοινωνικό Κλιματικό Ταμείο ΕΕ (2026-2032) — αναμένονται λεπτομέρειες',
    max_amount:null, max_prop_value:null, max_ltv:null, max_sqm:null,
    age_min:18, age_max:null, duration:'Αναμένεται',
    deadline:'Αναμένεται 2ο εξάμηνο 2026',
    deadline_urgent: false,
    total_budget:'1,2 δισ. ευρώ — 62.000 κατοικίες',
    criteria:['Χωρίς εισοδηματικό κριτήριο αποκλεισμού','Ιδιοκτήτες (πλήρης κυριότητα / ψιλή / επικαρπία)','Ενοικιαστές με μίσθωση ≥7 ετών','Φυσικά πρόσωπα σε όλη την Ελλάδα'],
    how_it_works:'Επιδότηση έως 80% για 62.000 κατοικίες. Χρηματοδότηση 2026-2032 από Κοινωνικό Κλιματικό Ταμείο ΕΕ. Λεπτομέρειες αναμένονται.',
    extra:'⚠️ Ανακοίνωση αναμένεται — μη δεσμευτείς ακόμα. Παρακολούθα το exoikonomo2025.gov.gr',
    savings_example:'Επιδότηση έως 80% κόστους αναβάθμισης — η μεγαλύτερη στην ιστορία',
    url:'https://selectra.gr/energeia/energeia-epidomata/exoikonomo',
    banks:['Αναμένεται — πιθανά όλες οι τράπεζες'],
  },
  {
    id:'anakainizo_noikazo', name:'Ανακαινίζω & Νοικιάζω', icon:'🔑', color:'#fb923c', status:'active',
    type:'Επιδότηση ανακαίνισης + εγγυημένο ενοίκιο ΟΠΕΚΑ',
    desc:'40% επιδότηση ανακαίνισης + εγγυημένο ενοίκιο αγοράς για 5 χρόνια από ΟΠΕΚΑ. Ιδανικό για κενά ακίνητα.',
    max_amount:15000, max_prop_value:null, max_ltv:null, max_sqm:null,
    age_min:18, age_max:null, duration:'5 χρόνια δέσμευση',
    deadline:'Τρέχον πρόγραμμα — χωρίς συγκεκριμένη λήξη',
    deadline_urgent: false,
    total_budget:'Τρέχον',
    criteria:['Κενό ακίνητο ≥3 χρόνια','Κόστος ανακαίνισης €5.000-€40.000','Τεχνική επιθεώρηση ΥΠΕΚΑ','Μίσθωση σε ωφελούμενους ΟΠΕΚΑ','Δέσμευση 5ετίας'],
    how_it_works:'Επιδοτείς 40% ανακαίνισης + υποχρεωτική ενοικίαση σε ωφελούμενους ΟΠΕΚΑ στην τιμή αγοράς για 5 χρόνια',
    extra:'Εγγυημένο εισόδημα από κράτος — ιδανικό για επενδυτές που θέλουν σίγουρο ενοίκιο',
    savings_example:'Κενό ακίνητο → επιδοτούμενη ανακαίνιση + εγγυημένο εισόδημα 5 χρόνια',
    url:'https://www.opeka.gr',
    banks:['Εθνική','Πειραιώς','Eurobank'],
  },
  {
    id:'gefyra_3', name:'Γέφυρα 3', icon:'🌉', color:'#d4af42', status:'active',
    type:'Επιδότηση δόσης — ευάλωτοι δανειολήπτες',
    desc:'Επιδότηση 50% αύξησης δόσης για ευάλωτους δανειολήπτες λόγω ανόδου Euribor. Πλατφόρμα: gefyra3.gr',
    max_amount:null, max_prop_value:null, max_ltv:null, max_sqm:null,
    age_min:18, age_max:null, duration:'12 μήνες',
    deadline:'Τρέχον — ελέγξτε dovaluegreece.gr για ενεργές αιτήσεις',
    deadline_urgent: false,
    total_budget:'Χρηματοδοτείται από τράπεζες',
    criteria:['Βεβαίωση "οικονομικά ασθενέστερου οφειλέτη"','Στεγαστικό κυμαινόμενου επιτοκίου','Εξασφάλιση στην πρώτη κατοικία','Υποβολή αίτησης μέσω gefyra3.gr'],
    how_it_works:'Επιδότηση 50% της αύξησης δόσης λόγω ανόδου ΕΚΤ επιτοκίων (βάση 30/06/2022) για 12 μήνες',
    extra:'Αφορά ευάλωτους: ανέργους, μισθωτούς χαμηλού εισοδήματος, συνταξιούχους με οικονομικές δυσκολίες',
    savings_example:'Δάνειο 70.000€: αύξηση 80€/μήνα → επιδότηση 40€/μήνα × 12 = 480€/χρόνο',
    url:'https://dovaluegreece.gr/programma-epidotisis-dosis-logo-ayxisis-epitokion-gefyra-3',
    banks:['Όλες οι τράπεζες'],
  },
]

const LOAN_TYPES: Record<LoanType,{label:string;icon:React.ReactNode;desc:string;typical_rate:string;typical_ltv:number;notes:string;docs:string[]}> = {
  purchase:     {label:'Αγορά κατοικίας',       icon:<Home size={13}/>,       desc:'Αγορά παλαιάς ή νέας κατοικίας',        typical_rate:'2.60-3.80%', typical_ltv:80, notes:'Πιο διαδεδομένος τύπος', docs:['Ταυτότητα','Εκκαθαριστικό 2χρ','Μισθοδοτικές 3μ','Ε9','Συμβόλαιο/Προσύμφωνο','ΑΤΑΚ']},
  first_home:   {label:'Πρώτη κατοικία',        icon:<Star size={13}/>,       desc:'Αγορά πρώτης κατοικίας — Σπίτι μου ΙΙ', typical_rate:'1.00-2.00%', typical_ltv:90, notes:'Ηλικία 25-50, εισόδημα ≤40.000€, deadline 31/08/2026', docs:['Ταυτότητα','Εκκαθαριστικό 2χρ','Μισθοδοτικές','Υπ. Δήλωση πρώτης κατοικίας','Ε9 μηδενικό']},
  renovation:   {label:'Ανακαίνιση',            icon:<Wrench size={13}/>,     desc:'Χρηματοδότηση ανακαίνισης κατοικίας',   typical_rate:'3.00-4.50%', typical_ltv:70, notes:'Χωρίς εγγύηση ακινήτου σε μικρά ποσά', docs:['Ταυτότητα','Εκκαθαριστικό','Τίτλος ιδιοκτησίας','Προσφορές εργολάβων','Άδεια δόμησης εφόσον απαιτείται']},
  energy:       {label:'Ενεργειακή αναβάθμιση', icon:<Leaf size={13}/>,       desc:'Πράσινα δάνεια με μειωμένο spread',     typical_rate:'2.40-3.50%', typical_ltv:80, notes:'Έκπτωση -0.10-0.25% για κλάση Α/Α+', docs:['ΠΕΑ πριν παρέμβαση','Ταυτότητα','Φορολογικά','Τίτλος ακινήτου','Προσφορά αναδόχου']},
  investment:   {label:'Επενδυτικό ακίνητο',    icon:<TrendingUp size={13}/>, desc:'Αγορά ακινήτου για εκμετάλλευση',       typical_rate:'3.00-4.50%', typical_ltv:70, notes:'Υψηλότερο spread — εισόδημα ενοικίου προσμετράται', docs:['Ταυτότητα','Φορολογικά 3χρ','Αποδεικτικά ενοικίων','Ε2','Τίτλοι']},
  auction:      {label:'Πλειστηριασμός',         icon:<Building2 size={13}/>,  desc:'Αγορά σε ηλεκτρονικό πλειστηριασμό',   typical_rate:'2.80-4.00%', typical_ltv:70, notes:'Γρήγορη εκταμίευση — ελέγξτε βάρη ακινήτου', docs:['Ταυτότητα','Φορολογικά','Απόσπασμα πλειστηριασμού','Νομικός έλεγχος τίτλων','Ασφάλεια']},
  construction: {label:'Ανέγερση κατοικίας',    icon:<Building2 size={13}/>,  desc:'Χρηματοδότηση κατασκευής νέας κατοικίας', typical_rate:'3.00-4.50%', typical_ltv:75, notes:'Εκταμίευση σε φάσεις — απαιτείται άδεια δόμησης', docs:['Άδεια δόμησης','Αρχιτεκτονικά σχέδια','Σύμβαση εργολάβου','Ταυτότητα','Φορολογικά','Τίτλος οικοπέδου']},
  commercial:   {label:'Επαγγελματικό ακίνητο', icon:<Briefcase size={13}/>,  desc:'Γραφεία, καταστήματα, αποθήκες',       typical_rate:'3.50-5.00%', typical_ltv:65, notes:'Υψηλότερο spread — δαπάνη φορολογικά εκπιπτόμενη', docs:['Ταυτότητα/Καταστατικό','Ισολογισμοί 3χρ','ΔΟΥ','Τίτλος','Σύμβαση μίσθωσης']},
  land:         {label:'Αγορά οικοπέδου',        icon:<Home size={13}/>,       desc:'Αγορά οικοπέδου ή αγροτεμαχίου',      typical_rate:'3.50-5.00%', typical_ltv:60, notes:'Χαμηλότερο LTV — υψηλότερος κίνδυνος τράπεζας', docs:['Ταυτότητα','Φορολογικά','Τοπογραφικό','Αποδεικτικό αρτιότητας','Συμβόλαιο']},
  refinance:    {label:'Αναχρηματοδότηση',       icon:<RefreshCw size={13}/>,  desc:'Μεταφορά υπάρχοντος δανείου σε άλλη τράπεζα', typical_rate:'2.60-3.80%', typical_ltv:80, notes:'Εξοικονόμηση από χαμηλότερο επιτόκιο', docs:['Ταυτότητα','Φορολογικά','Πίνακας αποπληρωμής','Τίτλος ακινήτου','Πιστ. ιστορικό']},
}

const BORROWER_PROFILES: Record<BorrowerType,{label:string;icon:React.ReactNode;income_ratio:number;notes:string;special:string}> = {
  individual:  {label:'Μισθωτός',              icon:<Users size={12}/>,        income_ratio:0.35, notes:'Δόση ≤35% μηνιαίου εισοδήματος',        special:''},
  professional:{label:'Ελεύθ. Επαγγελματίας', icon:<Briefcase size={12}/>,    income_ratio:0.40, notes:'2 χρόνια φορολογικά απαραίτητα',         special:'Μέση 2ετίας για εισόδημα'},
  company:     {label:'Εταιρεία',              icon:<Building2 size={12}/>,    income_ratio:0.40, notes:'Ισολογισμοί + αποφάσεις ΔΣ',             special:'Εγγύηση φυσικού προσώπου'},
  young:       {label:'Νέος 25-40 ετών',       icon:<Star size={12}/>,         income_ratio:0.35, notes:'Σπίτι μου ΙΙ — πολύ χαμηλό επιτόκιο',   special:'Ηλικία 25-50 για Σπίτι μου ΙΙ'},
  family:      {label:'Οικογένεια/Πολύτεκνη', icon:<Home size={12}/>,         income_ratio:0.40, notes:'Συν-δανειολήπτες → υψηλότερο εισόδημα', special:'Τρίτεκνοι: extra 50% επιδότηση'},
  senior:      {label:'50+ ετών',              icon:<ShieldCheck size={12}/>,  income_ratio:0.30, notes:'Max ηλικία 75 — σύντομη διάρκεια',       special:'Ηλικία + χρόνια ≤75'},
  military:    {label:'Ένοπλες Δυνάμεις',      icon:<Award size={12}/>,        income_ratio:0.40, notes:'Ειδικά προγράμματα ΤΑΠ-ΟΙΚ',             special:'Ταμείο Αλληλοβοηθείας Στρατού'},
  abroad:      {label:'Κάτοικος Εξωτερικού',   icon:<ExternalLink size={12}/>, income_ratio:0.35, notes:'Εισόδημα ξένης χώρας — επιπλέον έγγραφα', special:'LTV συνήθως έως 70%'},
}

const PROCESS_STEPS = [
  {step:'1', title:'Προέλεγχος & Τειρεσίας',   time:'1-2 ημέρες', desc:'Βεβαιώσου ότι δεν έχεις αρνητική εγγραφή στον Τειρεσία. Ζήτα αρχική εκτίμηση από e-stegastiko.gr ή απευθείας τράπεζα.'},
  {step:'2', title:'Επιλογή Ακινήτου',          time:'—',          desc:'Βρες ακίνητο, διαπραγματεύσου τιμή. Ζήτα τίτλους ιδιοκτησίας και ΑΤΑΚ από τον πωλητή.'},
  {step:'3', title:'Αίτηση Δανείου',            time:'1 ημέρα',    desc:'Υποβολή αίτησης σε 2-3 τράπεζες ταυτόχρονα. Έτσι θα έχεις πολλαπλές προσφορές για σύγκριση.'},
  {step:'4', title:'Αξιολόγηση & Έγκριση',     time:'5-15 ημέρες',desc:'Η τράπεζα ελέγχει πιστοληπτική ικανότητα, εισόδημα, ακίνητο. Τεχνικός και νομικός έλεγχος.'},
  {step:'5', title:'Υπογραφή Σύμβασης',         time:'1 ημέρα',    desc:'Υπογραφή σύμβασης δανείου (gov.gr ή τράπεζα). Εγγραφή υποθήκης στο υποθηκοφυλακείο.'},
  {step:'6', title:'Εκταμίευση',                time:'1-5 ημέρες', desc:'Ποσό πιστώνεται. Ολοκλήρωση αγοράς με συμβολαιογράφο.'},
]

const GLOSSARY = [
  {term:'LTV (Loan-to-Value)',        def:'Ποσοστό δανείου επί αξίας ακινήτου. LTV 80% = δανείζεσαι 80%, φέρνεις 20% ίδια κεφάλαια.'},
  {term:'Euribor',                   def:'Euro Interbank Offered Rate — βασικό επιτόκιο αναφοράς. Κυμαινόμενα = Euribor 1M ή 3M + spread.'},
  {term:'Spread',                    def:'Περιθώριο κέρδους τράπεζας — σταθερό για όλη τη διάρκεια. Κυμαινόμενο επιτόκιο = Euribor + Spread.'},
  {term:'ΠΕΑ',                       def:'Πιστοποιητικό Ενεργειακής Απόδοσης. Κλάσεις Α+ (καλύτερο) έως G. Απαραίτητο για ενεργειακά προγράμματα.'},
  {term:'DTI Ratio',                 def:'Debt-to-Income — δόση/εισόδημα. Οι τράπεζες δέχονται συνήθως ≤35-40%.'},
  {term:'Τοκοχρεολύσιο',            def:'Μηνιαία δόση = κεφάλαιο + τόκος. Το κεφάλαιο αυξάνεται και ο τόκος μειώνεται κάθε μήνα.'},
  {term:'Υποθήκη',                   def:'Εμπράγματη ασφάλεια επί ακινήτου υπέρ τράπεζας. Εγγράφεται στο υποθηκοφυλακείο.'},
  {term:'ΑΤΑΚ',                      def:'Αριθμός Ταυτότητας Ακινήτου — μοναδικός κωδικός στο Κτηματολόγιο.'},
  {term:'Τειρεσίας',                 def:'Σύστημα συγκέντρωσης αθετήσεων πληρωμής — ελέγχεται από κάθε τράπεζα κατά την αξιολόγηση.'},
  {term:'Περίοδος χάριτος',          def:'Αρχική περίοδος που πληρώνεις μόνο τόκους, χωρίς αποπληρωμή κεφαλαίου (συνήθως 1-2 χρόνια).'},
  {term:'Πρόωρη αποπληρωμή',         def:'Κυμαινόμενα: συνήθως χωρίς κόστος. Σταθερά: ενδέχεται πρόστιμο — διάβασε τη σύμβαση.'},
  {term:'Stress test τράπεζας',      def:'Υποθετικός υπολογισμός της δόσης σε περίπτωση ανόδου επιτοκίου — χρησιμοποιήσου το εργαλείο μας.'},
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function calcMonthly(amount:number,annualRate:number,years:number):number {
  if(amount<=0||years<=0)return 0
  if(annualRate===0)return amount/(years*12)
  const r=annualRate/100/12,n=years*12
  return amount*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1)
}
function calcAmortization(amount:number,annualRate:number,years:number):AmortRow[] {
  const rows:AmortRow[]=[],r=annualRate/100/12,monthly=calcMonthly(amount,annualRate,years)
  let balance=amount,totalInterest=0
  for(let i=1;i<=years*12;i++){
    const interest=balance*r,principal=monthly-interest
    totalInterest+=interest;balance=Math.max(0,balance-principal)
    rows.push({month:i,payment:monthly,principal,interest,balance,totalInterestPaid:totalInterest})
  }
  return rows
}
const fmtEur=(n:number)=>n.toLocaleString('el-GR',{style:'currency',currency:'EUR',maximumFractionDigits:0})
const fmtPct=(n:number)=>`${n.toFixed(2)}%`
const fmtPct1=(n:number)=>`${n.toFixed(1)}%`

function KPI({label,value,color='#e2e2f0',sub,icon}:{label:string;value:string;color?:string;sub?:string;icon?:React.ReactNode}) {
  return (
    <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:8,padding:'11px 13px'}}>
      <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:4}}>
        {icon&&<span style={{color,opacity:0.7}}>{icon}</span>}
        <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#4a4a60',textTransform:'uppercase',letterSpacing:'0.08em'}}>{label}</p>
      </div>
      <p style={{fontSize:15,fontFamily:'JetBrains Mono, monospace',color,fontWeight:700}}>{value}</p>
      {sub&&<p style={{fontSize:10,color:'#5a5a70',marginTop:2}}>{sub}</p>}
    </div>
  )
}
const inp:React.CSSProperties={width:'100%',background:'#08080d',border:'1px solid #242438',borderRadius:6,padding:'8px 10px',color:'#e2e2f0',fontSize:13,fontFamily:'JetBrains Mono, monospace',outline:'none',boxSizing:'border-box'}
const lbl:React.CSSProperties={fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#5a5a70',textTransform:'uppercase',letterSpacing:'0.08em',display:'block',marginBottom:5}

export default function TabLoan({propertyId,userId}:{propertyId:string;userId:string}) {
  const supabase=createClient()
  const [activeTab,setActiveTab]=useState<'calculator'|'banks'|'programs'|'advisor'|'guide'|'saved'>('calculator')

  // Calculator state
  const [loanAmount,setLoanAmount]=useState(150000)
  const [propertyValue,setPropertyValue]=useState(200000)
  const [rate,setRate]=useState(3.50)
  const [years,setYears]=useState(25)
  const [rateType,setRateType]=useState<RateType>('fixed')
  const [loanType,setLoanType]=useState<LoanType>('purchase')
  const [borrowerType,setBorrowerType]=useState<BorrowerType>('individual')
  const [startDate,setStartDate]=useState(new Date().toISOString().split('T')[0])
  const [fixedPeriod,setFixedPeriod]=useState<'3'|'5'|'10'|'15'|'20'>('5')
  const [monthlyIncome,setMonthlyIncome]=useState(2000)
  const [extraPayment,setExtraPayment]=useState(0)
  const [loanNotes,setLoanNotes]=useState('')

  // Bank selection — supports custom bank
  const [selectedBankId,setSelectedBankId]=useState('')
  const [customBankName,setCustomBankName]=useState('')
  const [showCustomBank,setShowCustomBank]=useState(false)

  // UI toggles
  const [showAmort,setShowAmort]=useState(false)
  const [showRefinance,setShowRefinance]=useState(false)
  const [showStress,setShowStress]=useState(false)
  const [showAfford,setShowAfford]=useState(false)
  const [showDocs,setShowDocs]=useState(false)
  const [showGlossary,setShowGlossary]=useState(false)
  const [filterGreen,setFilterGreen]=useState(false)
  const [filterSpiti,setFilterSpiti]=useState(false)

  // Refinance state
  const [remBalance,setRemBalance]=useState(100000)
  const [remYears,setRemYears]=useState(20)
  const [newRate,setNewRate]=useState(3.0)

  // Scenarios & saved
  const [scenarios,setScenarios]=useState<Array<{id:string;label:string;amount:number;rate:number;years:number;rateType:RateType}>>([])
  const [savedLoans,setSavedLoans]=useState<SavedLoan[]>([])
  const [saving,setSaving]=useState(false)
  const [savingCal,setSavingCal]=useState(false)

  useEffect(()=>{loadProp();loadSaved()},[propertyId])

  async function loadProp(){
    const{data}=await supabase.from('user_properties').select('value').eq('id',propertyId).maybeSingle()
    if(data?.value)setPropertyValue(data.value)
  }
  async function loadSaved(){
    const{data}=await supabase.from('loans').select('*').eq('property_id',propertyId).eq('user_id',userId).order('created_at',{ascending:false})
    setSavedLoans(data||[])
  }

  const effectiveRate=rateType==='variable'?MARKET.euribor_3m+rate:rate
  const monthly=calcMonthly(loanAmount,effectiveRate,years)
  const totalPayment=monthly*years*12
  const totalInterest=totalPayment-loanAmount
  const ltv=propertyValue>0?(loanAmount/propertyValue)*100:0
  const amortization=calcAmortization(loanAmount,effectiveRate,years)

  // Extra payment savings
  const extraSavings=extraPayment>0?(()=>{
    let bal=loanAmount,months=0,ti=0
    const m=monthly+extraPayment
    while(bal>0&&months<years*12){const int=bal*(effectiveRate/100/12);ti+=int;bal=bal*(1+effectiveRate/100/12)-m;months++}
    return{savedMonths:years*12-months,savedInterest:Math.max(0,totalInterest-ti)}
  })():null

  const currMonthly=calcMonthly(remBalance,effectiveRate,remYears)
  const newMonthly=calcMonthly(remBalance,newRate,remYears)
  const refinanceSaving=(currMonthly-newMonthly)*remYears*12

  const maxLoanByIncome=(()=>{
    const maxM=monthlyIncome*BORROWER_PROFILES[borrowerType].income_ratio
    const r=effectiveRate/100/12,n=years*12
    return r>0?maxM*(Math.pow(1+r,n)-1)/(r*Math.pow(1+r,n)):maxM*n
  })()

  const stressTests=[
    {label:'Βασικό',         rate:effectiveRate,     monthly:calcMonthly(loanAmount,effectiveRate,years)},
    {label:'Euribor +0.5%', rate:effectiveRate+0.5,  monthly:calcMonthly(loanAmount,effectiveRate+0.5,years)},
    {label:'Euribor +1%',   rate:effectiveRate+1,    monthly:calcMonthly(loanAmount,effectiveRate+1,years)},
    {label:'Euribor +2%',   rate:effectiveRate+2,    monthly:calcMonthly(loanAmount,effectiveRate+2,years)},
    {label:'Euribor +3%',   rate:effectiveRate+3,    monthly:calcMonthly(loanAmount,effectiveRate+3,years)},
    {label:'Worst case 6%', rate:6,                  monthly:calcMonthly(loanAmount,6,years)},
  ]

  const selectedBankName=selectedBankId==='custom'?customBankName:BANKS.find(b=>b.id===selectedBankId)?.name||''

  async function saveLoan(){
    if(!loanAmount||!rate||!years)return;setSaving(true)
    await supabase.from('loans').insert({property_id:propertyId,user_id:userId,bank:selectedBankName||'Μη καθορισμένη',loan_type:loanType,amount:loanAmount,property_value:propertyValue,rate:effectiveRate,rate_type:rateType,years,start_date:startDate,status:'active',notes:loanNotes})
    await loadSaved();setSaving(false)
  }
  async function saveToCalendar(){
    setSavingCal(true)
    const d=new Date(startDate),events=[]
    for(let i=0;i<Math.min(years*12,60);i++){
      const evDate=new Date(d.getFullYear(),d.getMonth()+i+1,d.getDate())
      events.push({property_id:propertyId,user_id:userId,title:`Δόση δανείου${selectedBankName?` - ${selectedBankName}`:''}`,category:'financial',event_date:evDate.toISOString().split('T')[0],amount:Math.round(monthly),priority:'high',status:'pending',recurring:true,recurring_interval:'monthly',notes:`Δάνειο ${fmtEur(loanAmount)} × ${years}χρ @ ${fmtPct(effectiveRate)}`,source:'manual'})
    }
    for(let i=0;i<events.length;i+=20)await supabase.from('calendar_events').insert(events.slice(i,i+20))
    setSavingCal(false);alert(`✓ ${Math.min(years*12,60)} δόσεις → Ημερολόγιο!`)
  }
  async function saveToExpenses(){
    await supabase.from('expenses').insert({property_id:propertyId,user_id:userId,description:`Δόση δανείου${selectedBankName?` - ${selectedBankName}`:''}`,amount:Math.round(monthly),category:'Δόση Δανείου',date:new Date().toISOString().split('T')[0]})
    alert('✓ Δόση → Δαπάνες!')
  }
  async function deleteLoan(id:string){if(!confirm('Διαγραφή;'))return;await supabase.from('loans').delete().eq('id',id);await loadSaved()}

  const tabs=[
    {id:'calculator',label:'Calculator',icon:<Calculator size={11}/>},
    {id:'banks',label:'Τράπεζες',icon:<Building2 size={11}/>},
    {id:'programs',label:'Κρατικά',icon:<Star size={11}/>},
    {id:'advisor',label:'Advisor',icon:<Zap size={11}/>},
    {id:'guide',label:'Οδηγός',icon:<BookOpen size={11}/>},
    {id:'saved',label:`Αποθηκευμένα${savedLoans.length>0?` (${savedLoans.length})`:''}`,icon:<Save size={11}/>},
  ]

  // ── JSX ────────────────────────────────────────────────────────────────────
  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>

      {/* Header */}
      <div style={{background:'rgba(212,175,66,0.05)',border:'1px solid rgba(212,175,66,0.15)',borderRadius:10,padding:'12px 16px',display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <Calculator size={16} color="#d4af42"/>
          <p style={{fontSize:12,color:'#d4af42',fontFamily:'JetBrains Mono, monospace',fontWeight:600}}>Εργαλείο Στεγαστικών Δανείων — Ελληνική Αγορά</p>
        </div>
        <div style={{display:'flex',gap:14,marginLeft:'auto',flexWrap:'wrap'}}>
          <span style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'#5a5a70'}}>Euribor 3M <span style={{color:'#60a5fa'}}>{fmtPct(MARKET.euribor_3m)}</span></span>
          <span style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'#5a5a70'}}>Euribor 1M <span style={{color:'#60a5fa'}}>{fmtPct(MARKET.euribor_1m)}</span></span>
          <span style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'#5a5a70'}}>ΕΚΤ <span style={{color:'#a78bfa'}}>{fmtPct(MARKET.ecb_rate)}</span></span>
          <a href={MARKET.source_url} target="_blank" rel="noreferrer" style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'#3a3a54',textDecoration:'none'}}>{MARKET.last_update}</a>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',background:'#12121f',border:'1px solid #242438',borderRadius:8,overflow:'hidden'}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id as any)} style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:5,padding:'9px 0',border:'none',borderRight:'1px solid #1e1e30',cursor:'pointer',fontSize:10,fontFamily:'JetBrains Mono, monospace',background:activeTab===t.id?'rgba(212,175,66,0.12)':'transparent',color:activeTab===t.id?'#d4af42':'#5a5a70',transition:'all 0.15s'}}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ═══════════ CALCULATOR ═══════════ */}
      {activeTab==='calculator'&&(
        <div style={{display:'flex',flexDirection:'column',gap:14}}>

          {/* Borrower + Loan type */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:14}}>
              <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:10}}>Τύπος Δανειολήπτη</p>
              <div style={{display:'flex',flexDirection:'column',gap:5}}>
                {(Object.entries(BORROWER_PROFILES) as [BorrowerType,any][]).map(([k,v])=>(
                  <button key={k} onClick={()=>setBorrowerType(k)} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',borderRadius:7,border:`1px solid ${borrowerType===k?'rgba(212,175,66,0.4)':'#1e1e30'}`,background:borrowerType===k?'rgba(212,175,66,0.08)':'transparent',cursor:'pointer',textAlign:'left'}}>
                    <span style={{color:borrowerType===k?'#d4af42':'#3a3a54',flexShrink:0}}>{v.icon}</span>
                    <div style={{flex:1}}>
                      <p style={{fontSize:11,fontFamily:'JetBrains Mono, monospace',color:borrowerType===k?'#d4af42':'#9090a8'}}>{v.label}</p>
                      <p style={{fontSize:9,color:'#3a3a54'}}>{v.notes}</p>
                    </div>
                    {v.special&&borrowerType===k&&<span style={{fontSize:8,color:'#34d399',fontFamily:'JetBrains Mono, monospace',background:'rgba(52,211,153,0.08)',padding:'2px 5px',borderRadius:4,flexShrink:0}}>{v.special}</span>}
                  </button>
                ))}
              </div>
            </div>

            <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:14}}>
              <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:10}}>Σκοπός Δανείου</p>
              <div style={{display:'flex',flexDirection:'column',gap:4}}>
                {(Object.entries(LOAN_TYPES) as [LoanType,any][]).map(([k,v])=>(
                  <button key={k} onClick={()=>setLoanType(k)} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',borderRadius:7,border:`1px solid ${loanType===k?'rgba(212,175,66,0.4)':'#1e1e30'}`,background:loanType===k?'rgba(212,175,66,0.08)':'transparent',cursor:'pointer',textAlign:'left'}}>
                    <span style={{color:loanType===k?'#d4af42':'#3a3a54',flexShrink:0}}>{v.icon}</span>
                    <div style={{flex:1}}>
                      <p style={{fontSize:11,fontFamily:'JetBrains Mono, monospace',color:loanType===k?'#d4af42':'#9090a8'}}>{v.label}</p>
                      <p style={{fontSize:9,color:'#3a3a54'}}>{v.typical_rate} · LTV {v.typical_ltv}%</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Info banner */}
          <div style={{background:'rgba(96,165,250,0.06)',border:'1px solid rgba(96,165,250,0.15)',borderRadius:8,padding:'9px 13px'}}>
            <p style={{fontSize:11,color:'#60a5fa',fontFamily:'JetBrains Mono, monospace'}}>💡 {LOAN_TYPES[loanType].notes} · LTV {LOAN_TYPES[loanType].typical_ltv}% · Επιτόκιο {LOAN_TYPES[loanType].typical_rate}</p>
          </div>

          {/* Main inputs */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16}}>
              <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:12}}>Στοιχεία Δανείου</p>
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                <div><label style={lbl}>Αξία Ακινήτου (€)</label><input style={inp} type="number" value={propertyValue} onChange={e=>setPropertyValue(Number(e.target.value))}/></div>
                <div>
                  <label style={lbl}>Ποσό Δανείου (€)</label>
                  <input style={inp} type="number" value={loanAmount} onChange={e=>setLoanAmount(Number(e.target.value))}/>
                  <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
                    <p style={{fontSize:10,color:ltv>90?'#f87171':ltv>80?'#fb923c':'#34d399',fontFamily:'JetBrains Mono, monospace'}}>LTV: {ltv.toFixed(1)}% {ltv>90?'⚠ Πολύ υψηλό':ltv>80?'⚠ Υψηλό':'✓ OK'}</p>
                    <p style={{fontSize:10,color:'#5a5a70',fontFamily:'JetBrains Mono, monospace'}}>Ίδια: {fmtEur(propertyValue-loanAmount)}</p>
                  </div>
                </div>
                <div><label style={lbl}>Διάρκεια (χρόνια)</label><input style={inp} type="number" min={3} max={35} value={years} onChange={e=>setYears(Number(e.target.value))}/></div>
                <div><label style={lbl}>Ημ/νία Έναρξης</label><input type="date" style={inp} value={startDate} onChange={e=>setStartDate(e.target.value)}/></div>

                {/* Bank selector with custom option */}
                <div>
                  <label style={lbl}>Τράπεζα</label>
                  <select style={{...inp,appearance:'none' as any}} value={selectedBankId} onChange={e=>{setSelectedBankId(e.target.value);setShowCustomBank(e.target.value==='custom')}}>
                    <option value="">— Επιλογή τράπεζας —</option>
                    {BANKS.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
                    <option value="custom">Άλλη τράπεζα (custom)</option>
                  </select>
                  {showCustomBank&&(
                    <input style={{...inp,marginTop:6}} type="text" placeholder="Όνομα τράπεζας π.χ. Παγκρήτια" value={customBankName} onChange={e=>setCustomBankName(e.target.value)}/>
                  )}
                </div>
              </div>
            </div>

            <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16}}>
              <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:12}}>Επιτόκιο</p>
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                <div>
                  <label style={lbl}>Τύπος</label>
                  <div style={{display:'flex',gap:6}}>
                    {(['fixed','variable','mixed'] as RateType[]).map(rt=>(
                      <button key={rt} onClick={()=>setRateType(rt)} style={{flex:1,padding:'7px 0',borderRadius:6,border:`1px solid ${rateType===rt?'#d4af42':'#242438'}`,background:rateType===rt?'rgba(212,175,66,0.1)':'transparent',color:rateType===rt?'#d4af42':'#5a5a70',fontSize:10,fontFamily:'JetBrains Mono, monospace',cursor:'pointer'}}>
                        {rt==='fixed'?'Σταθερό':rt==='variable'?'Κυμαινόμενο':'Μικτό'}
                      </button>
                    ))}
                  </div>
                </div>

                {(rateType==='fixed'||rateType==='mixed')&&(
                  <div>
                    <label style={lbl}>Διάρκεια σταθερού</label>
                    <div style={{display:'flex',gap:5}}>
                      {(['3','5','10','15','20'] as const).map(p=>(
                        <button key={p} onClick={()=>setFixedPeriod(p)} style={{flex:1,padding:'5px 0',borderRadius:5,border:`1px solid ${fixedPeriod===p?'#d4af42':'#242438'}`,background:fixedPeriod===p?'rgba(212,175,66,0.1)':'transparent',color:fixedPeriod===p?'#d4af42':'#5a5a70',fontSize:10,fontFamily:'JetBrains Mono, monospace',cursor:'pointer'}}>
                          {p}χρ
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label style={lbl}>{rateType==='variable'?'Spread (%)':'Επιτόκιο (%)'}</label>
                  <input style={inp} type="number" step={0.05} value={rate} onChange={e=>setRate(Number(e.target.value))}/>
                  {rateType==='variable'&&(
                    <div style={{marginTop:6,background:'rgba(96,165,250,0.06)',border:'1px solid rgba(96,165,250,0.15)',borderRadius:6,padding:'7px 10px'}}>
                      <p style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'#60a5fa'}}>Euribor 3M {fmtPct(MARKET.euribor_3m)} + spread {fmtPct(rate)} = <strong>{fmtPct(MARKET.euribor_3m+rate)}</strong></p>
                    </div>
                  )}
                </div>

                <div>
                  <label style={lbl}>Έκτακτη μηνιαία πληρωμή (€)</label>
                  <input style={inp} type="number" value={extraPayment} onChange={e=>setExtraPayment(Number(e.target.value))} placeholder="0"/>
                  {extraSavings&&extraPayment>0&&(
                    <div style={{marginTop:5,background:'rgba(52,211,153,0.06)',border:'1px solid rgba(52,211,153,0.15)',borderRadius:6,padding:'7px 10px'}}>
                      <p style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'#34d399'}}>Εξοικονομείς {Math.round(extraSavings.savedMonths/12)} χρόνια & {fmtEur(extraSavings.savedInterest)} τόκους</p>
                    </div>
                  )}
                </div>
                <div><label style={lbl}>Σημειώσεις</label><textarea style={{...inp,resize:'vertical' as any,minHeight:48}} placeholder="π.χ. Alpha Bank Πρώτη Κατοικία — αίτηση 10/06/2026" value={loanNotes} onChange={e=>setLoanNotes(e.target.value)}/></div>
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
            <KPI label="Μηνιαία Δόση" value={fmtEur(monthly)} color="#d4af42" icon={<DollarSign size={13}/>}/>
            <KPI label="Σύνολο Τόκων" value={fmtEur(totalInterest)} color="#f87171" icon={<TrendingUp size={13}/>} sub={`${((totalInterest/loanAmount)*100).toFixed(0)}% κεφαλαίου`}/>
            <KPI label="Συνολική Αποπληρωμή" value={fmtEur(totalPayment)} color="#e2e2f0" icon={<PieChart size={13}/>}/>
            <KPI label="LTV" value={`${ltv.toFixed(1)}%`} color={ltv>80?'#f87171':ltv>70?'#fb923c':'#34d399'} icon={<Percent size={13}/>} sub={`Ίδια: ${fmtEur(propertyValue-loanAmount)}`}/>
          </div>

          {/* Actions */}
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button onClick={saveLoan} disabled={saving} style={{display:'flex',alignItems:'center',gap:5,padding:'8px 14px',background:'rgba(212,175,66,0.1)',border:'1px solid rgba(212,175,66,0.3)',borderRadius:7,cursor:'pointer',color:'#d4af42',fontSize:11,fontFamily:'JetBrains Mono, monospace'}}>
              <Save size={12}/>{saving?'Αποθήκευση...':'Αποθήκευση Δανείου'}
            </button>
            <button onClick={saveToCalendar} disabled={savingCal} style={{display:'flex',alignItems:'center',gap:5,padding:'8px 14px',background:'rgba(96,165,250,0.1)',border:'1px solid rgba(96,165,250,0.3)',borderRadius:7,cursor:'pointer',color:'#60a5fa',fontSize:11,fontFamily:'JetBrains Mono, monospace'}}>
              <Calendar size={12}/>{savingCal?'...':'Δόσεις → Ημερολόγιο'}
            </button>
            <button onClick={saveToExpenses} style={{display:'flex',alignItems:'center',gap:5,padding:'8px 14px',background:'rgba(52,211,153,0.1)',border:'1px solid rgba(52,211,153,0.3)',borderRadius:7,cursor:'pointer',color:'#34d399',fontSize:11,fontFamily:'JetBrains Mono, monospace'}}>
              <ArrowRight size={12}/>Δόση → Δαπάνες
            </button>
            <button onClick={()=>setScenarios(s=>[...s,{id:Date.now().toString(),label:`Σενάριο ${s.length+1}`,amount:loanAmount,rate:effectiveRate,years,rateType}])} style={{display:'flex',alignItems:'center',gap:5,padding:'8px 14px',background:'rgba(167,139,250,0.1)',border:'1px solid rgba(167,139,250,0.3)',borderRadius:7,cursor:'pointer',color:'#a78bfa',fontSize:11,fontFamily:'JetBrains Mono, monospace'}}>
              <Plus size={12}/>Προσθήκη Σεναρίου
            </button>
          </div>

          {/* Scenarios */}
          {scenarios.length>0&&(
            <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16}}>
              <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:12}}>Σύγκριση Σεναρίων</p>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                  <thead><tr>{['Σενάριο','Ποσό','Επιτόκιο','Χρόνια','Δόση/μήνα','Σύν. τόκοι','Διαφορά',''].map(h=><th key={h} style={{padding:'6px 10px',textAlign:'left',fontFamily:'JetBrains Mono, monospace',fontSize:9,color:'#4a4a60',textTransform:'uppercase',borderBottom:'1px solid #1a1a2e'}}>{h}</th>)}</tr></thead>
                  <tbody>
                    {scenarios.map(s=>{
                      const m=calcMonthly(s.amount,s.rate,s.years),ti=m*s.years*12-s.amount,saved=totalInterest-ti
                      return(<tr key={s.id}><td style={{padding:'7px 10px',color:'#e2e2f0'}}>{s.label}</td><td style={{padding:'7px 10px',fontFamily:'JetBrains Mono, monospace',color:'#d4af42'}}>{fmtEur(s.amount)}</td><td style={{padding:'7px 10px',fontFamily:'JetBrains Mono, monospace',color:'#60a5fa'}}>{fmtPct(s.rate)}</td><td style={{padding:'7px 10px',color:'#5a5a70'}}>{s.years}χρ</td><td style={{padding:'7px 10px',fontFamily:'JetBrains Mono, monospace',color:'#34d399'}}>{fmtEur(m)}</td><td style={{padding:'7px 10px',fontFamily:'JetBrains Mono, monospace',color:'#f87171'}}>{fmtEur(ti)}</td><td style={{padding:'7px 10px',fontFamily:'JetBrains Mono, monospace',color:saved>0?'#34d399':'#f87171'}}>{saved>0?`-${fmtEur(saved)}`:fmtEur(-saved)}</td><td><button onClick={()=>setScenarios(p=>p.filter(x=>x.id!==s.id))} style={{background:'none',border:'none',cursor:'pointer',color:'#3a3a54'}}><Trash2 size={11}/></button></td></tr>)
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Collapsible tools */}
          {[
            {key:'afford',show:showAfford,setShow:setShowAfford,title:'Δανειοληπτική Ικανότητα',sub:'Max δάνειο & DTI Ratio βάσει εισοδήματος',
              content:(
                <div style={{marginTop:12}}>
                  <div style={{marginBottom:12}}><label style={lbl}>Μηνιαίο καθαρό εισόδημα (€)</label><input style={inp} type="number" value={monthlyIncome} onChange={e=>setMonthlyIncome(Number(e.target.value))}/></div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
                    <KPI label="Max δόση/μήνα" value={fmtEur(monthlyIncome*BORROWER_PROFILES[borrowerType].income_ratio)} color="#d4af42" sub={`${(BORROWER_PROFILES[borrowerType].income_ratio*100).toFixed(0)}% εισοδήματος`}/>
                    <KPI label="Max δάνειο" value={fmtEur(maxLoanByIncome)} color={maxLoanByIncome>=loanAmount?'#34d399':'#f87171'}/>
                    <KPI label="DTI Ratio" value={monthly>0?fmtPct1((monthly/monthlyIncome)*100):'—'} color={(monthly/monthlyIncome)>0.4?'#f87171':(monthly/monthlyIncome)>0.35?'#fb923c':'#34d399'} sub="Δόση / Εισόδημα"/>
                  </div>
                  {maxLoanByIncome<loanAmount&&<div style={{marginTop:10,background:'rgba(248,113,113,0.08)',border:'1px solid rgba(248,113,113,0.2)',borderRadius:7,padding:'8px 12px'}}><p style={{fontSize:11,color:'#f87171',fontFamily:'JetBrains Mono, monospace'}}>⚠ Το αιτούμενο ποσό υπερβαίνει το max κατά {fmtEur(loanAmount-maxLoanByIncome)} — μείωσε ποσό ή αύξησε εισόδημα/διάρκεια</p></div>}
                </div>
              )},
            {key:'stress',show:showStress,setShow:setShowStress,title:'Stress Test Επιτοκίου',sub:'Τι γίνεται αν ανέβει το Euribor;',
              content:(
                <div style={{marginTop:12,overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                    <thead><tr>{['Σενάριο','Επιτόκιο','Δόση/μήνα','Αύξηση/μήνα','Αύξηση/χρόνο'].map(h=><th key={h} style={{padding:'6px 10px',textAlign:'left',fontFamily:'JetBrains Mono, monospace',fontSize:9,color:'#4a4a60',textTransform:'uppercase',borderBottom:'1px solid #1a1a2e'}}>{h}</th>)}</tr></thead>
                    <tbody>
                      {stressTests.map((s,i)=>{const diff=s.monthly-stressTests[0].monthly;return(
                        <tr key={i} style={{borderBottom:'1px solid #0e0e1c',background:i===0?'rgba(212,175,66,0.04)':'transparent'}}>
                          <td style={{padding:'7px 10px',color:i===0?'#d4af42':'#e2e2f0',fontWeight:i===0?600:400}}>{s.label}</td>
                          <td style={{padding:'7px 10px',fontFamily:'JetBrains Mono, monospace',color:'#60a5fa'}}>{fmtPct(s.rate)}</td>
                          <td style={{padding:'7px 10px',fontFamily:'JetBrains Mono, monospace',color:i===0?'#d4af42':diff>400?'#f87171':diff>200?'#fb923c':'#e2e2f0'}}>{fmtEur(s.monthly)}</td>
                          <td style={{padding:'7px 10px',fontFamily:'JetBrains Mono, monospace',color:i===0?'#5a5a70':'#f87171'}}>{i===0?'—':`+${fmtEur(diff)}`}</td>
                          <td style={{padding:'7px 10px',fontFamily:'JetBrains Mono, monospace',color:i===0?'#5a5a70':'#f87171'}}>{i===0?'—':`+${fmtEur(diff*12)}`}</td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                  {rateType==='fixed'&&<div style={{marginTop:10,background:'rgba(52,211,153,0.06)',border:'1px solid rgba(52,211,153,0.15)',borderRadius:7,padding:'8px 12px'}}><p style={{fontSize:11,color:'#34d399',fontFamily:'JetBrains Mono, monospace'}}>✓ Σταθερό {fixedPeriod} χρόνια — προστατεύεσαι από αυξήσεις Euribor για {fixedPeriod} χρόνια</p></div>}
                </div>
              )},
            {key:'refinance',show:showRefinance,setShow:setShowRefinance,title:'Αξίζει Αναχρηματοδότηση;',sub:'Υπολόγισε αν συμφέρει να αλλάξεις τράπεζα',
              content:(
                <div style={{marginTop:12}}>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:12}}>
                    <div><label style={lbl}>Υπόλοιπο κεφάλαιο (€)</label><input style={inp} type="number" value={remBalance} onChange={e=>setRemBalance(Number(e.target.value))}/></div>
                    <div><label style={lbl}>Χρόνια που μένουν</label><input style={inp} type="number" value={remYears} onChange={e=>setRemYears(Number(e.target.value))}/></div>
                    <div><label style={lbl}>Νέο επιτόκιο (%)</label><input style={inp} type="number" step={0.05} value={newRate} onChange={e=>setNewRate(Number(e.target.value))}/></div>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
                    <KPI label="Τρέχουσα δόση" value={fmtEur(currMonthly)} color="#f87171"/>
                    <KPI label="Νέα δόση" value={fmtEur(newMonthly)} color="#34d399" sub={`Εξοικ. ${fmtEur(currMonthly-newMonthly)}/μήνα`}/>
                    <KPI label="Συνολική εξοικονόμηση" value={fmtEur(Math.max(0,refinanceSaving))} color={refinanceSaving>0?'#d4af42':'#f87171'} sub={refinanceSaving>0?'Αξίζει!':'Δεν αξίζει'}/>
                  </div>
                </div>
              )},
            {key:'amort',show:showAmort,setShow:setShowAmort,title:'Πίνακας Αποπληρωμής',sub:`${years*12} δόσεις αναλυτικά`,
              content:(
                <div style={{marginTop:12,overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                    <thead><tr>{['Μήνας','Δόση','Κεφάλαιο','Τόκος','Υπόλοιπο','Σύν. Τόκοι'].map(h=><th key={h} style={{padding:'6px 10px',textAlign:'right',fontFamily:'JetBrains Mono, monospace',fontSize:9,color:'#4a4a60',textTransform:'uppercase',borderBottom:'1px solid #1a1a2e'}}>{h}</th>)}</tr></thead>
                    <tbody>
                      {amortization.slice(0,24).map(row=>(
                        <tr key={row.month} style={{borderBottom:'1px solid #0e0e1c'}}>
                          <td style={{padding:'5px 10px',textAlign:'right',color:'#5a5a70',fontFamily:'JetBrains Mono, monospace'}}>{row.month}</td>
                          <td style={{padding:'5px 10px',textAlign:'right',color:'#d4af42',fontFamily:'JetBrains Mono, monospace'}}>{fmtEur(row.payment)}</td>
                          <td style={{padding:'5px 10px',textAlign:'right',color:'#34d399',fontFamily:'JetBrains Mono, monospace'}}>{fmtEur(row.principal)}</td>
                          <td style={{padding:'5px 10px',textAlign:'right',color:'#f87171',fontFamily:'JetBrains Mono, monospace'}}>{fmtEur(row.interest)}</td>
                          <td style={{padding:'5px 10px',textAlign:'right',color:'#e2e2f0',fontFamily:'JetBrains Mono, monospace'}}>{fmtEur(row.balance)}</td>
                          <td style={{padding:'5px 10px',textAlign:'right',color:'#5a5a70',fontFamily:'JetBrains Mono, monospace'}}>{fmtEur(row.totalInterestPaid)}</td>
                        </tr>
                      ))}
                      {amortization.length>24&&<tr><td colSpan={6} style={{padding:'8px 10px',textAlign:'center',color:'#3a3a54',fontSize:10,fontFamily:'JetBrains Mono, monospace'}}>... {amortization.length-24} ακόμα δόσεις</td></tr>}
                    </tbody>
                  </table>
                </div>
              )},
            {key:'docs',show:showDocs,setShow:setShowDocs,title:'Απαραίτητα Έγγραφα',sub:`Για: ${LOAN_TYPES[loanType].label}`,
              content:(
                <div style={{marginTop:12,display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <div>
                    <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',marginBottom:8}}>Βασικά έγγραφα</p>
                    {LOAN_TYPES[loanType].docs.map((d,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}><FileText size={11} color="#d4af42"/><span style={{fontSize:11,color:'#9090a8'}}>{d}</span></div>)}
                  </div>
                  <div>
                    <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#60a5fa',textTransform:'uppercase',marginBottom:8}}>Ανά δανειολήπτη</p>
                    {borrowerType==='professional'&&['Δηλώσεις 2χρ','Κατάσταση επαγγελματικής δραστηριότητας','ΔΟΥ άδεια'].map((d,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}><FileText size={11} color="#60a5fa"/><span style={{fontSize:11,color:'#9090a8'}}>{d}</span></div>)}
                    {borrowerType==='company'&&['Καταστατικό','Ισολογισμοί 3χρ','ΔΟΥ','Απόφαση ΔΣ'].map((d,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}><FileText size={11} color="#60a5fa"/><span style={{fontSize:11,color:'#9090a8'}}>{d}</span></div>)}
                    {borrowerType==='military'&&['Βεβαίωση υπηρεσίας','Μισθολογική κατάσταση','Φύλλο πορείας'].map((d,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}><FileText size={11} color="#60a5fa"/><span style={{fontSize:11,color:'#9090a8'}}>{d}</span></div>)}
                    {borrowerType==='abroad'&&['Αποδεικτικό φορολ. κατοικίας εξωτ.','Εισοδήματα ξένης χώρας','Μεταφρασμένα έγγραφα'].map((d,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}><FileText size={11} color="#60a5fa"/><span style={{fontSize:11,color:'#9090a8'}}>{d}</span></div>)}
                    {!['professional','company','military','abroad'].includes(borrowerType)&&<p style={{fontSize:11,color:'#3a3a54'}}>Μισθοδοτικές καταστάσεις + εκκαθαριστικό εισοδήματος</p>}
                  </div>
                </div>
              )},
          ].map(({key,show,setShow,title,sub,content})=>(
            <div key={key} style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16}}>
              <button onClick={()=>setShow((s:boolean)=>!s)} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',background:'none',border:'none',cursor:'pointer',padding:0}}>
                <div style={{textAlign:'left'}}>
                  <p style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em'}}>{title}</p>
                  <p style={{fontSize:11,color:'#5a5a70',marginTop:2}}>{sub}</p>
                </div>
                {show?<ChevronUp size={13} color="#5a5a70"/>:<ChevronDown size={13} color="#5a5a70"/>}
              </button>
              {show&&content}
            </div>
          ))}

          {/* Loan costs */}
          <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16}}>
            <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:12}}>Εκτιμώμενα Έξοδα Σύναψης Δανείου</p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:8}}>
              {[
                {label:'Συμβολαιογραφικά',    value:`${fmtEur(propertyValue*0.01)}-${fmtEur(propertyValue*0.02)}`, note:'1-2% εμπ. αξίας'},
                {label:'Φόρος μεταβίβασης',   value:fmtEur(propertyValue*0.03),  note:'3% (παλαιά ακίνητα)'},
                {label:'Εγγραφή υποθήκης',    value:fmtEur(loanAmount*0.005),    note:'~0.5% δανείου'},
                {label:'Νομικός+Τεχνικός',    value:'300-750€',                  note:'Τράπεζα ή δωρεάν'},
                {label:'Ασφάλεια κατοικίας',  value:'100-300€/έτος',             note:'Υποχρεωτική'},
                {label:'Ασφάλεια ζωής',       value:`${fmtEur(loanAmount*0.001)}-${fmtEur(loanAmount*0.003)}/έτος`, note:'Συχνά υποχρεωτική'},
                {label:'Σύνολο εξόδων',       value:`~${fmtEur(propertyValue*0.05)}`, note:'Εκτός δόσεων', hi:true},
                {label:'Συνολική επένδυση',   value:fmtEur(propertyValue-loanAmount+propertyValue*0.05), note:'Ίδια+έξοδα', hi:true},
              ].map((item:any)=>(
                <div key={item.label} style={{padding:'9px 12px',borderRadius:7,background:item.hi?'rgba(212,175,66,0.06)':'rgba(255,255,255,0.02)',border:`1px solid ${item.hi?'rgba(212,175,66,0.2)':'#1e1e30'}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div><p style={{fontSize:12,color:item.hi?'#d4af42':'#e2e2f0',fontWeight:item.hi?600:400}}>{item.label}</p><p style={{fontSize:10,color:'#5a5a70'}}>{item.note}</p></div>
                  <span style={{fontSize:12,fontFamily:'JetBrains Mono, monospace',color:item.hi?'#d4af42':'#60a5fa',fontWeight:item.hi?700:400}}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ BANKS ═══════════ */}
      {activeTab==='banks'&&(
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
            <button onClick={()=>setFilterGreen(f=>!f)} style={{display:'flex',alignItems:'center',gap:5,padding:'6px 12px',background:filterGreen?'rgba(52,211,153,0.1)':'transparent',border:`1px solid ${filterGreen?'rgba(52,211,153,0.4)':'#242438'}`,borderRadius:7,cursor:'pointer',color:filterGreen?'#34d399':'#5a5a70',fontSize:11,fontFamily:'JetBrains Mono, monospace'}}>
              <Leaf size={11}/>Πράσινα Δάνεια
            </button>
            <button onClick={()=>setFilterSpiti(f=>!f)} style={{display:'flex',alignItems:'center',gap:5,padding:'6px 12px',background:filterSpiti?'rgba(52,211,153,0.1)':'transparent',border:`1px solid ${filterSpiti?'rgba(52,211,153,0.4)':'#242438'}`,borderRadius:7,cursor:'pointer',color:filterSpiti?'#34d399':'#5a5a70',fontSize:11,fontFamily:'JetBrains Mono, monospace'}}>
              🏠 Σπίτι μου ΙΙ
            </button>
            <p style={{fontSize:10,color:'#3a3a54',fontFamily:'JetBrains Mono, monospace',marginLeft:'auto'}}>Δεδομένα: vresdaneio.gr · {MARKET.last_update}</p>
          </div>

          {/* Rate table */}
          <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16,overflowX:'auto'}}>
            <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:12}}>Σύγκριση Επιτοκίων ανά Διάρκεια Σταθερού — Απρίλιος/Ιούνιος 2026</p>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
              <thead>
                <tr style={{borderBottom:'1px solid #1a1a2e'}}>
                  {['Τράπεζα','3χρ','5χρ','10χρ','15χρ','20χρ','Κυμ. spread','Max LTV','Σπίτι μου ΙΙ'].map(h=>(
                    <th key={h} style={{padding:'7px 10px',textAlign:'left',fontFamily:'JetBrains Mono, monospace',fontSize:9,color:'#4a4a60',textTransform:'uppercase'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {BANKS.filter(b=>!filterSpiti||b.spiti_mou).map(bank=>(
                  <tr key={bank.id} style={{borderBottom:'1px solid #0e0e1c'}}>
                    <td style={{padding:'8px 10px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:7}}>
                        <span style={{width:10,height:10,borderRadius:2,background:bank.color,display:'inline-block',flexShrink:0}}/>
                        <span style={{fontSize:12,color:'#e2e2f0',fontWeight:500}}>{bank.name}</span>
                      </div>
                    </td>
                    {(['fixed3','fixed5','fixed10','fixed15','fixed20'] as const).map(k=>(
                      <td key={k} style={{padding:'8px 10px',fontFamily:'JetBrains Mono, monospace',fontSize:11,color:'#60a5fa'}}>{(bank as any)[k]}%</td>
                    ))}
                    <td style={{padding:'8px 10px',fontFamily:'JetBrains Mono, monospace',fontSize:11,color:'#34d399'}}>+{bank.variable_spread_min}-{bank.variable_spread_max}%</td>
                    <td style={{padding:'8px 10px',fontFamily:'JetBrains Mono, monospace',fontSize:11,color:bank.max_ltv>=90?'#34d399':'#d4af42'}}>{bank.max_ltv}%</td>
                    <td style={{padding:'8px 10px'}}>{bank.spiti_mou?<Check size={14} color="#34d399"/>:<X size={14} color="#3a3a54"/>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bank cards */}
          {BANKS.filter(b=>!filterSpiti||b.spiti_mou).map(bank=>{
            const effMin=rateType==='variable'?MARKET.euribor_3m+bank.variable_spread_min-(filterGreen?bank.green_discount:0):bank.fixed_min-(filterGreen?bank.green_discount:0)
            const myMonthly=calcMonthly(loanAmount,effMin,years)
            const myInterest=myMonthly*years*12-loanAmount
            return(
              <div key={bank.id} style={{background:'#12121f',border:'1px solid #242438',borderLeft:`4px solid ${bank.color}`,borderRadius:10,padding:16}}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:12}}>
                  <div style={{flex:1}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                      <p style={{fontSize:15,color:'#e2e2f0',fontWeight:700}}>{bank.name}</p>
                      <span style={{fontSize:9,padding:'2px 7px',borderRadius:4,background:`${bank.color}20`,color:bank.color,fontFamily:'JetBrains Mono, monospace',border:`1px solid ${bank.color}40`}}>{bank.note}</span>
                      {bank.spiti_mou&&<span style={{fontSize:9,padding:'2px 6px',borderRadius:4,background:'rgba(52,211,153,0.1)',color:'#34d399',fontFamily:'JetBrains Mono, monospace',border:'1px solid rgba(52,211,153,0.2)'}}>🏠 Σπίτι μου ΙΙ</span>}
                    </div>
                    <div style={{display:'flex',gap:20,flexWrap:'wrap'}}>
                      <div><p style={{fontSize:9,color:'#4a4a60',fontFamily:'JetBrains Mono, monospace',textTransform:'uppercase',marginBottom:2}}>Σταθερό 5χρ</p><p style={{fontSize:20,fontFamily:'JetBrains Mono, monospace',color:'#34d399',fontWeight:700}}>{bank.fixed5}%</p></div>
                      <div><p style={{fontSize:9,color:'#4a4a60',fontFamily:'JetBrains Mono, monospace',textTransform:'uppercase',marginBottom:2}}>Κυμ. spread από</p><p style={{fontSize:20,fontFamily:'JetBrains Mono, monospace',color:'#60a5fa',fontWeight:700}}>+{bank.variable_spread_min}%</p><p style={{fontSize:10,color:'#5a5a70',fontFamily:'JetBrains Mono, monospace'}}>σήμερα {fmtPct(MARKET.euribor_3m+bank.variable_spread_min)}</p></div>
                      <div><p style={{fontSize:9,color:'#4a4a60',fontFamily:'JetBrains Mono, monospace',textTransform:'uppercase',marginBottom:2}}>Δόση {Math.round(loanAmount/1000)}κ€/{years}χρ</p><p style={{fontSize:20,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',fontWeight:700}}>{fmtEur(myMonthly)}</p></div>
                      <div><p style={{fontSize:9,color:'#4a4a60',fontFamily:'JetBrains Mono, monospace',textTransform:'uppercase',marginBottom:2}}>Max LTV / Ποσό</p><p style={{fontSize:16,fontFamily:'JetBrains Mono, monospace',color:'#a78bfa',fontWeight:700}}>{bank.max_ltv}% / {Math.round(bank.max_amount/1000)}κ€</p><p style={{fontSize:10,color:'#5a5a70',fontFamily:'JetBrains Mono, monospace'}}>{bank.fees}</p></div>
                    </div>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:6,flexShrink:0,marginLeft:12}}>
                    {bank.url&&<a href={bank.url} target="_blank" rel="noreferrer" style={{display:'flex',alignItems:'center',gap:5,padding:'6px 12px',background:'transparent',border:'1px solid #242438',borderRadius:7,color:'#5a5a70',fontSize:10,fontFamily:'JetBrains Mono, monospace',textDecoration:'none'}}><ExternalLink size={11}/>Επίσκεψη</a>}
                    <button onClick={()=>{setSelectedBankId(bank.id);setShowCustomBank(false);setRate(rateType==='variable'?bank.variable_spread_min:bank.fixed_min);setActiveTab('calculator')}} style={{display:'flex',alignItems:'center',gap:5,padding:'6px 12px',background:'rgba(212,175,66,0.1)',border:'1px solid rgba(212,175,66,0.3)',borderRadius:7,color:'#d4af42',fontSize:10,fontFamily:'JetBrains Mono, monospace',cursor:'pointer'}}><Calculator size={11}/>Υπολόγισε</button>
                  </div>
                </div>
                <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:8}}>
                  {bank.features.map((f,i)=><span key={i} style={{fontSize:10,padding:'3px 8px',borderRadius:5,background:'rgba(255,255,255,0.03)',border:'1px solid #1e1e30',color:'#6b6b85',display:'flex',alignItems:'center',gap:4}}><Check size={9} color="#34d399"/>{f}</span>)}
                  {filterGreen&&bank.green_discount>0&&<span style={{fontSize:10,padding:'3px 8px',borderRadius:5,background:'rgba(52,211,153,0.08)',border:'1px solid rgba(52,211,153,0.2)',color:'#34d399',display:'flex',alignItems:'center',gap:4}}><Leaf size={9}/>Πράσινη έκπτωση -{fmtPct(bank.green_discount)}</span>}
                </div>
                <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                  {bank.programs.map(p=><span key={p} style={{fontSize:9,padding:'2px 7px',borderRadius:4,background:'rgba(167,139,250,0.08)',border:'1px solid rgba(167,139,250,0.2)',color:'#a78bfa',fontFamily:'JetBrains Mono, monospace'}}>{p}</span>)}
                </div>
              </div>
            )
          })}
          <div style={{background:'rgba(96,165,250,0.06)',border:'1px solid rgba(96,165,250,0.15)',borderRadius:8,padding:'10px 14px'}}>
            <p style={{fontSize:10,color:'#60a5fa',fontFamily:'JetBrains Mono, monospace'}}>ⓘ Επιτόκια βάσει vresdaneio.gr & σελίδων τραπεζών ({MARKET.last_update}). Η τελική τιμολόγηση εξαρτάται από το προφίλ δανειολήπτη και το ακίνητο. Για εξατομικευμένη προσφορά επισκεφθείτε e-stegastiko.gr ή την τράπεζα απευθείας.</p>
          </div>
        </div>
      )}

      {/* ═══════════ PROGRAMS ═══════════ */}
      {activeTab==='programs'&&(
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div style={{background:'rgba(212,175,66,0.06)',border:'1px solid rgba(212,175,66,0.2)',borderRadius:8,padding:'10px 14px'}}>
            <p style={{fontSize:10,color:'#d4af42',fontFamily:'JetBrains Mono, monospace'}}>⚠️ Εμφανίζονται μόνο προγράμματα που τρέχουν εντός 2026 ή είναι επερχόμενα. Τα στοιχεία επαληθεύτηκαν από greece20.gov.gr, ypen.gov.gr, exoikonomo2025.gov.gr, dovaluegreece.gr — {MARKET.last_update}.</p>
          </div>
          {STATE_PROGRAMS.map(prog=>(
            <div key={prog.id} style={{background:'#12121f',border:`1px solid ${prog.color}30`,borderLeft:`4px solid ${prog.color}`,borderRadius:10,padding:18}}>
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:14}}>
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                    <span style={{fontSize:22}}>{prog.icon}</span>
                    <div>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <p style={{fontSize:15,color:'#e2e2f0',fontWeight:700}}>{prog.name}</p>
                        <span style={{fontSize:9,padding:'2px 7px',borderRadius:4,background:prog.status==='active'?'rgba(52,211,153,0.15)':'rgba(96,165,250,0.15)',color:prog.status==='active'?'#34d399':'#60a5fa',fontFamily:'JetBrains Mono, monospace',border:`1px solid ${prog.status==='active'?'rgba(52,211,153,0.3)':'rgba(96,165,250,0.3)'}`}}>{prog.status==='active'?'Ενεργό':'Επερχόμενο'}</span>
                      </div>
                      <span style={{fontSize:9,padding:'2px 7px',borderRadius:4,background:`${prog.color}18`,color:prog.color,fontFamily:'JetBrains Mono, monospace',border:`1px solid ${prog.color}30`}}>{prog.type}</span>
                    </div>
                  </div>
                  <p style={{fontSize:12,color:'#9090a8',marginTop:4}}>{prog.desc}</p>
                </div>
                <a href={prog.url} target="_blank" rel="noreferrer" style={{display:'flex',alignItems:'center',gap:5,padding:'7px 12px',background:`${prog.color}15`,border:`1px solid ${prog.color}40`,borderRadius:7,color:prog.color,fontSize:10,fontFamily:'JetBrains Mono, monospace',textDecoration:'none',flexShrink:0}}><ExternalLink size={11}/>Επίσκεψη</a>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                <div>
                  <p style={{fontSize:9,color:'#4a4a60',fontFamily:'JetBrains Mono, monospace',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>Κριτήρια</p>
                  {prog.criteria.map((c,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}><Check size={11} color={prog.color}/><span style={{fontSize:11,color:'#9090a8'}}>{c}</span></div>)}
                </div>
                <div>
                  <p style={{fontSize:9,color:'#4a4a60',fontFamily:'JetBrains Mono, monospace',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>Στοιχεία</p>
                  {prog.max_amount&&<div style={{marginBottom:6}}><span style={{fontSize:9,color:'#4a4a60',fontFamily:'JetBrains Mono, monospace'}}>MAX ΠΟΣΟ </span><span style={{fontSize:14,color:prog.color,fontFamily:'JetBrains Mono, monospace',fontWeight:700}}>{fmtEur(prog.max_amount)}</span></div>}
                  {prog.max_prop_value&&<div style={{marginBottom:6}}><span style={{fontSize:9,color:'#4a4a60',fontFamily:'JetBrains Mono, monospace'}}>MAX ΑΞΙΑ </span><span style={{fontSize:13,color:'#60a5fa',fontFamily:'JetBrains Mono, monospace',fontWeight:600}}>{fmtEur(prog.max_prop_value)}</span></div>}
                  {prog.max_ltv&&<div style={{marginBottom:6}}><span style={{fontSize:9,color:'#4a4a60',fontFamily:'JetBrains Mono, monospace'}}>MAX LTV </span><span style={{fontSize:14,color:'#60a5fa',fontFamily:'JetBrains Mono, monospace',fontWeight:700}}>{prog.max_ltv}%</span></div>}
                  {(prog as any).max_sqm&&<div style={{marginBottom:6}}><span style={{fontSize:9,color:'#4a4a60',fontFamily:'JetBrains Mono, monospace'}}>MAX ΤΜ </span><span style={{fontSize:13,color:'#e2e2f0',fontFamily:'JetBrains Mono, monospace'}}>{(prog as any).max_sqm} τ.μ.</span></div>}
                  {(prog as any).age_max&&<div style={{marginBottom:6}}><span style={{fontSize:9,color:'#4a4a60',fontFamily:'JetBrains Mono, monospace'}}>ΗΛΙΚΙΑ </span><span style={{fontSize:13,color:'#e2e2f0',fontFamily:'JetBrains Mono, monospace'}}>{(prog as any).age_min}-{(prog as any).age_max} ετών</span></div>}
                  <div style={{marginBottom:6}}><span style={{fontSize:9,color:'#4a4a60',fontFamily:'JetBrains Mono, monospace'}}>ΔΙΑΡΚΕΙΑ </span><span style={{fontSize:11,color:'#e2e2f0'}}>{prog.duration}</span></div>
                  <div style={{marginBottom:6}}>
                    <span style={{fontSize:9,color:'#4a4a60',fontFamily:'JetBrains Mono, monospace'}}>DEADLINE </span>
                    <span style={{fontSize:11,fontFamily:'JetBrains Mono, monospace',color:(prog as any).deadline_urgent?'#f87171':'#34d399'}}>{prog.deadline}</span>
                  </div>
                  <div style={{marginBottom:6}}><span style={{fontSize:9,color:'#4a4a60',fontFamily:'JetBrains Mono, monospace'}}>ΠΡΟΫΠΟΛΟΓΙΣΜΟΣ </span><span style={{fontSize:11,color:'#d4af42'}}>{prog.total_budget}</span></div>
                </div>
              </div>
              {(prog as any).how_it_works&&<div style={{marginTop:10,background:'rgba(255,255,255,0.02)',border:'1px solid #1e1e30',borderRadius:7,padding:'8px 12px'}}><p style={{fontSize:10,color:'#6b6b85'}}>⚙ {(prog as any).how_it_works}</p></div>}
              {prog.extra&&<div style={{marginTop:8,background:`${prog.color}08`,border:`1px solid ${prog.color}20`,borderRadius:7,padding:'8px 12px'}}><p style={{fontSize:11,color:prog.color}}>⭐ {prog.extra}</p></div>}
              {prog.savings_example&&<div style={{marginTop:6,background:'rgba(52,211,153,0.05)',border:'1px solid rgba(52,211,153,0.15)',borderRadius:7,padding:'8px 12px'}}><p style={{fontSize:11,color:'#34d399'}}>📊 {prog.savings_example}</p></div>}
              <div style={{marginTop:10,display:'flex',gap:5,flexWrap:'wrap'}}>{prog.banks.map(b=><span key={b} style={{fontSize:10,padding:'2px 8px',borderRadius:4,background:'rgba(255,255,255,0.03)',border:'1px solid #1e1e30',color:'#6b6b85'}}>{b}</span>)}</div>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════ ADVISOR ═══════════ */}
      {activeTab==='advisor'&&(
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div style={{background:'rgba(167,139,250,0.06)',border:'1px solid rgba(167,139,250,0.15)',borderRadius:8,padding:'10px 14px',display:'flex',gap:10}}>
            <Zap size={14} color="#a78bfa" style={{flexShrink:0,marginTop:1}}/>
            <p style={{fontSize:11,color:'#a78bfa',fontFamily:'JetBrains Mono, monospace'}}>Βάσει των επιλογών σου στο Calculator, ο Advisor αναλύει και προτείνει την καλύτερη στρατηγική. Συμπλήρωσε πρώτα τον τύπο δανειολήπτη και σκοπό δανείου.</p>
          </div>

          {/* Eligibility */}
          <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16}}>
            <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:14}}>Έλεγχος Επιλεξιμότητας Προγραμμάτων</p>
            <div style={{display:'flex',flexDirection:'column',gap:7}}>
              {[
                {label:'Σπίτι μου ΙΙ (deadline 31/08/2026)',eligible:(borrowerType==='young'||borrowerType==='family')&&loanType==='first_home',reason:(borrowerType==='young'||borrowerType==='family')&&loanType==='first_home'?'✓ Πληροίς — ηλικία & πρώτη κατοικία':loanType!=='first_home'?'Άλλαξε σκοπό σε "Πρώτη κατοικία"':'Απαιτείται ηλικία 25-50 ετών',saving:loanAmount>0?`Εξοικονόμηση ~${fmtEur(totalInterest*0.45)} τόκων`:undefined},
                {label:'Αναβαθμίζω το Σπίτι μου',eligible:loanType==='energy',reason:loanType==='energy'?'✓ Κατάλληλος σκοπός δανείου':'Άλλαξε σκοπό σε "Ενεργειακή αναβάθμιση"',saving:loanType==='energy'?`Επιδοτούμενο επιτόκιο — εξοικονόμηση`:undefined},
                {label:'Εξοικονομώ 2025 (deadline 30/06/2026)',eligible:loanType==='energy',reason:loanType==='energy'?'✓ Κατάλληλο για ενεργειακή αναβάθμιση':'Μόνο για ενεργειακές παρεμβάσεις',saving:loanType==='energy'?`Επιδότηση κόστους αναβάθμισης`:undefined},
                {label:'Πράσινο Δάνειο (-0.15 έως -0.25%)',eligible:loanType==='energy'||loanType==='renovation',reason:loanType==='energy'||loanType==='renovation'?'✓ Κατάλληλο για πράσινα/ανακαίνιση':'Άλλαξε σε ενεργειακό ή ανακαίνιση',saving:loanType==='energy'||loanType==='renovation'?`Εξοικονόμηση ~${fmtEur(loanAmount*0.002*years)} τόκων`:undefined},
                {label:'Ένοπλες Δυνάμεις ΤΑΠ-ΟΙΚ',eligible:borrowerType==='military',reason:borrowerType==='military'?'✓ Δικαιούσαι ειδικό πρόγραμμα':'Μόνο για αξιωματικούς/υπαξιωματικούς',saving:borrowerType==='military'?'Χαμηλότερο επιτόκιο μέσω ΤΑΠ':undefined},
              ].map(item=>(
                <div key={item.label} style={{display:'flex',alignItems:'center',gap:12,padding:'9px 13px',background:item.eligible?'rgba(52,211,153,0.06)':'rgba(255,255,255,0.02)',border:`1px solid ${item.eligible?'rgba(52,211,153,0.2)':'#1e1e30'}`,borderRadius:8}}>
                  <div style={{width:22,height:22,borderRadius:'50%',background:item.eligible?'rgba(52,211,153,0.2)':'rgba(248,113,113,0.1)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    {item.eligible?<Check size={12} color="#34d399"/>:<X size={12} color="#f87171"/>}
                  </div>
                  <div style={{flex:1}}>
                    <p style={{fontSize:12,color:item.eligible?'#e2e2f0':'#5a5a70',fontWeight:item.eligible?500:400}}>{item.label}</p>
                    <p style={{fontSize:10,color:'#5a5a70'}}>{item.reason}</p>
                  </div>
                  {item.eligible&&item.saving&&<span style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'#34d399',background:'rgba(52,211,153,0.1)',padding:'3px 8px',borderRadius:5,whiteSpace:'nowrap'}}>{item.saving}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Best bank ranking */}
          <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16}}>
            <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:14}}>Κατάταξη Τραπεζών για Δάνειο {fmtEur(loanAmount)} / {years}χρ</p>
            {BANKS.slice().sort((a,b)=>{
              const ra=rateType==='variable'?MARKET.euribor_3m+a.variable_spread_min:a.fixed_min
              const rb=rateType==='variable'?MARKET.euribor_3m+b.variable_spread_min:b.fixed_min
              return ra-rb
            }).slice(0,4).map((bank,i)=>{
              const er=rateType==='variable'?MARKET.euribor_3m+bank.variable_spread_min:bank.fixed_min
              const myM=calcMonthly(loanAmount,er,years)
              const myI=myM*years*12-loanAmount
              return(
                <div key={bank.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 13px',marginBottom:6,background:i===0?'rgba(212,175,66,0.06)':'rgba(255,255,255,0.02)',border:`1px solid ${i===0?'rgba(212,175,66,0.2)':'#1e1e30'}`,borderRadius:8}}>
                  <span style={{fontSize:18}}>{'🥇🥈🥉4️⃣'[i*2]+'🥇🥈🥉4️⃣'[i*2+1]}</span>
                  <div style={{flex:1}}>
                    <p style={{fontSize:12,color:'#e2e2f0',fontWeight:600}}>{bank.name}</p>
                    <p style={{fontSize:10,color:'#5a5a70'}}>{bank.note} · {bank.fees}</p>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <p style={{fontSize:14,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',fontWeight:700}}>{fmtEur(myM)}/μήνα</p>
                    <p style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'#5a5a70'}}>Σύν. τόκοι: {fmtEur(myI)}</p>
                  </div>
                  <button onClick={()=>{setSelectedBankId(bank.id);setRate(rateType==='variable'?bank.variable_spread_min:bank.fixed_min);setActiveTab('calculator')}} style={{padding:'5px 10px',background:'rgba(212,175,66,0.1)',border:'1px solid rgba(212,175,66,0.3)',borderRadius:6,cursor:'pointer',color:'#d4af42',fontSize:10,fontFamily:'JetBrains Mono, monospace'}}>Επιλογή</button>
                </div>
              )
            })}
          </div>

          {/* Smart tips */}
          <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16}}>
            <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:12}}>Έξυπνες Συμβουλές</p>
            <div style={{display:'flex',flexDirection:'column',gap:7}}>
              {[
                ltv>80&&{icon:'⚠️',tip:'LTV >80% — σκέψου αύξηση ιδίων κεφαλαίων. Κάτω από 80% πετυχαίνεις καλύτερο spread.'},
                rateType==='variable'&&{icon:'📊',tip:`Κυμαινόμενο: αν Euribor ανέβει +2%, δόση σου → ${fmtEur(calcMonthly(loanAmount,MARKET.euribor_3m+rate+2,years))}/μήνα. Σκέψου σταθερό για ασφάλεια.`},
                years>25&&{icon:'💰',tip:`${years} χρόνια → ${fmtEur(totalInterest)} τόκοι. Με 20χρ: ${fmtEur(calcMonthly(loanAmount,effectiveRate,20)*20*12-loanAmount)} τόκοι. Εξοικονόμηση: ${fmtEur(Math.max(0,totalInterest-(calcMonthly(loanAmount,effectiveRate,20)*20*12-loanAmount)))}.`},
                extraPayment===0&&{icon:'💡',tip:`Έκτακτα +100€/μήνα: εξοικονομείς ${Math.round((()=>{let b=loanAmount,m=0;const pm=monthly+100;while(b>0&&m<years*12){b=b*(1+effectiveRate/100/12)-pm;m++}return years*12-m})()/12)} χρόνια και σημαντικούς τόκους. Χρησιμοποίησε το πεδίο "Έκτακτη πληρωμή".`},
                loanAmount>200000&&{icon:'🏦',tip:'Δάνειο >200.000€: διαπραγματεύσου spread απευθείας με τη διεύθυνση τράπεζας — συχνά κατεβαίνει 0.10-0.20%.'},
                loanType==='first_home'&&(borrowerType!=='young'&&borrowerType!=='family')&&{icon:'🏠',tip:'Σπίτι μου ΙΙ ισχύει έως 31/08/2026. Αν είσαι 25-50 ετών, η εξοικονόμηση είναι τεράστια — αξίζει να ελέγξεις επιλεξιμότητα.'},
              ].filter(Boolean).slice(0,5).map((tip:any,i)=>(
                <div key={i} style={{display:'flex',alignItems:'flex-start',gap:10,padding:'9px 12px',background:'rgba(255,255,255,0.02)',border:'1px solid #1e1e30',borderRadius:7}}>
                  <span style={{fontSize:16,flexShrink:0}}>{tip.icon}</span>
                  <p style={{fontSize:11,color:'#9090a8',lineHeight:1.5}}>{tip.tip}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ GUIDE ═══════════ */}
      {activeTab==='guide'&&(
        <div style={{display:'flex',flexDirection:'column',gap:12}}>

          {/* Process */}
          <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16}}>
            <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:16}}>Βήματα Διαδικασίας Δανείου</p>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {PROCESS_STEPS.map((step,i)=>(
                <div key={i} style={{display:'flex',gap:14,alignItems:'flex-start'}}>
                  <div style={{width:32,height:32,borderRadius:'50%',background:'rgba(212,175,66,0.15)',border:'1px solid rgba(212,175,66,0.3)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <span style={{fontSize:13,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',fontWeight:700}}>{step.step}</span>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                      <p style={{fontSize:13,color:'#e2e2f0',fontWeight:600}}>{step.title}</p>
                      {step.time!=='—'&&<span style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#5a5a70',background:'rgba(255,255,255,0.03)',padding:'2px 7px',borderRadius:4,border:'1px solid #1e1e30'}}>{step.time}</span>}
                    </div>
                    <p style={{fontSize:11,color:'#6b6b85',lineHeight:1.6}}>{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Special categories */}
          <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16}}>
            <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:14}}>Ειδικές Κατηγορίες Δανειοληπτών</p>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              {[
                {title:'Ένοπλες Δυνάμεις',icon:'🎖️',desc:'Ειδικά επιδοτούμενα δάνεια μέσω ΤΑΠ-ΟΙΚ. Χαμηλότερο επιτόκιο, ευνοϊκοί όροι για αξιωματικούς/υπαξιωματικούς.',url:'https://tap.gr'},
                {title:'Κάτοικοι Εξωτερικού',icon:'✈️',desc:'Επιπλέον έγγραφα (φορολ. κατοικία εξωτερικού, μεταφράσεις). LTV συνήθως ≤70%. Χρήσιμο: e-stegastiko.gr.',url:'https://e-stegastiko.gr/ellines-eksoterikou/'},
                {title:'Νέοι 25-50 ετών',icon:'⭐',desc:'Σπίτι μου ΙΙ: πολύ χαμηλό επιτόκιο, deadline 31/08/2026. Alpha Bank: σταθερό 2.50% για 3 χρόνια. Εθνική: 90% LTV.',url:'https://greece20.gov.gr/home-loans/'},
                {title:'Επαγγελματίες/Εταιρείες',icon:'💼',desc:'LTV 65-70%. Χρειάζονται ισολογισμοί 2-3 χρόνια. Υψηλότερο spread αλλά φορολογικά εκπιπτόμενο.',url:'https://e-stegastiko.gr/epaggelmaties/'},
              ].map(cat=>(
                <div key={cat.title} style={{background:'rgba(255,255,255,0.02)',border:'1px solid #1e1e30',borderRadius:8,padding:14}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}><span style={{fontSize:18}}>{cat.icon}</span><p style={{fontSize:12,color:'#e2e2f0',fontWeight:600}}>{cat.title}</p></div>
                  <p style={{fontSize:11,color:'#6b6b85',lineHeight:1.5,marginBottom:8}}>{cat.desc}</p>
                  <a href={cat.url} target="_blank" rel="noreferrer" style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:10,color:'#60a5fa',textDecoration:'none',fontFamily:'JetBrains Mono, monospace'}}><ExternalLink size={10}/>Περισσότερα</a>
                </div>
              ))}
            </div>
          </div>

          {/* Glossary */}
          <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16}}>
            <button onClick={()=>setShowGlossary(g=>!g)} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',background:'none',border:'none',cursor:'pointer',padding:0}}>
              <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em'}}>Γλωσσάρι Όρων Στεγαστικών Δανείων</p>
              {showGlossary?<ChevronUp size={13} color="#5a5a70"/>:<ChevronDown size={13} color="#5a5a70"/>}
            </button>
            {showGlossary&&(
              <div style={{marginTop:12,display:'flex',flexDirection:'column',gap:7}}>
                {GLOSSARY.map((item,i)=>(
                  <div key={i} style={{padding:'9px 12px',background:'rgba(255,255,255,0.02)',border:'1px solid #1e1e30',borderRadius:7}}>
                    <p style={{fontSize:12,color:'#d4af42',fontWeight:600,marginBottom:3}}>{item.term}</p>
                    <p style={{fontSize:11,color:'#9090a8',lineHeight:1.5}}>{item.def}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Useful links */}
          <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16}}>
            <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:12}}>Χρήσιμοι Σύνδεσμοι</p>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              {[
                {name:'greece20.gov.gr',desc:'Σπίτι μου ΙΙ — επίσημη πληροφόρηση',url:'https://greece20.gov.gr/home-loans/'},
                {name:'e-stegastiko.gr',desc:'Πλατφόρμα δανείων αδειοδοτημένη ΤτΕ',url:'https://e-stegastiko.gr'},
                {name:'vresdaneio.gr',desc:'Σύγκριση επιτοκίων όλων των τραπεζών',url:'https://vresdaneio.gr/epitokia/index.html'},
                {name:'exoikonomo2025.gov.gr',desc:'Εξοικονομώ 2025 — επίσημο πρόγραμμα',url:'https://exoikonomo2025.gov.gr/'},
                {name:'dovaluegreece.gr',desc:'Γέφυρα 3 — επιδότηση δόσης',url:'https://dovaluegreece.gr/programma-epidotisis-dosis-logo-ayxisis-epitokion-gefyra-3'},
                {name:'bankofgreece.gr',desc:'Επίσημα επιτόκια Τράπεζας Ελλάδος',url:'https://www.bankofgreece.gr'},
              ].map(link=>(
                <a key={link.name} href={link.url} target="_blank" rel="noreferrer" style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'rgba(255,255,255,0.02)',border:'1px solid #1e1e30',borderRadius:8,textDecoration:'none'}}>
                  <ExternalLink size={13} color="#60a5fa" style={{flexShrink:0}}/>
                  <div><p style={{fontSize:12,color:'#60a5fa',fontWeight:500}}>{link.name}</p><p style={{fontSize:10,color:'#5a5a70'}}>{link.desc}</p></div>
                </a>
              ))}
            </div>
          </div>

          <div style={{background:'rgba(248,113,113,0.06)',border:'1px solid rgba(248,113,113,0.15)',borderRadius:8,padding:'10px 14px'}}>
            <p style={{fontSize:10,color:'#f87171',fontFamily:'JetBrains Mono, monospace'}}>⚠ Disclaimer: Οι πληροφορίες είναι ενημερωτικές και δεν αποτελούν χρηματοοικονομική συμβουλή. Για εξατομικευμένη συμβουλή απευθυνθείτε σε πιστοποιημένο σύμβουλο ή τράπεζα. Τα επιτόκια και τα προγράμματα αλλάζουν — πάντα επαληθεύετε από τις επίσημες πηγές.</p>
          </div>
        </div>
      )}

      {/* ═══════════ SAVED ═══════════ */}
      {activeTab==='saved'&&(
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {savedLoans.length===0&&(
            <div style={{textAlign:'center',padding:'40px 0'}}>
              <Save size={28} color="#2a2a3e" style={{margin:'0 auto 10px'}}/>
              <p style={{fontSize:12,fontFamily:'JetBrains Mono, monospace',color:'#3a3a54'}}>Δεν υπάρχουν αποθηκευμένα δάνεια</p>
              <button onClick={()=>setActiveTab('calculator')} style={{marginTop:10,fontSize:11,color:'#d4af42',background:'none',border:'none',cursor:'pointer',fontFamily:'JetBrains Mono, monospace'}}>→ Πήγαινε στο Calculator</button>
            </div>
          )}
          {savedLoans.map(loan=>{
            const m=calcMonthly(loan.amount,loan.rate,loan.years)
            const ti=m*loan.years*12-loan.amount
            const ltv2=loan.property_value>0?(loan.amount/loan.property_value)*100:0
            const monthsElapsed=loan.start_date?Math.floor((Date.now()-new Date(loan.start_date).getTime())/(1000*60*60*24*30.44)):0
            return(
              <div key={loan.id} style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16}}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:12}}>
                  <div>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                      <p style={{fontSize:14,color:'#e2e2f0',fontWeight:600}}>{loan.bank}</p>
                      <span style={{fontSize:9,padding:'2px 6px',borderRadius:4,background:'rgba(52,211,153,0.1)',color:'#34d399',fontFamily:'JetBrains Mono, monospace',border:'1px solid rgba(52,211,153,0.2)'}}>{loan.status==='active'?'Ενεργό':'Ανενεργό'}</span>
                      <span style={{fontSize:9,padding:'2px 6px',borderRadius:4,background:'rgba(96,165,250,0.1)',color:'#60a5fa',fontFamily:'JetBrains Mono, monospace',border:'1px solid rgba(96,165,250,0.2)'}}>{LOAN_TYPES[loan.loan_type as LoanType]?.label||loan.loan_type}</span>
                    </div>
                    {loan.notes&&<p style={{fontSize:11,color:'#5a5a70'}}>{loan.notes}</p>}
                  </div>
                  <button onClick={()=>deleteLoan(loan.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#3a3a54',display:'flex'}}><Trash2 size={14}/></button>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8}}>
                  <KPI label="Ποσό" value={fmtEur(loan.amount)} color="#d4af42"/>
                  <KPI label="Επιτόκιο" value={fmtPct(loan.rate)} color="#60a5fa" sub={loan.rate_type==='variable'?'Κυμαινόμενο':'Σταθερό'}/>
                  <KPI label="Δόση/μήνα" value={fmtEur(m)} color="#34d399"/>
                  <KPI label="Σύν. τόκοι" value={fmtEur(ti)} color="#f87171"/>
                  <KPI label="LTV" value={`${ltv2.toFixed(1)}%`} color={ltv2>80?'#fb923c':'#34d399'}/>
                </div>
                {loan.start_date&&(
                  <div style={{marginTop:10,padding:'8px 12px',background:'rgba(255,255,255,0.02)',border:'1px solid #1e1e30',borderRadius:7,display:'flex',gap:16,flexWrap:'wrap'}}>
                    <span style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'#5a5a70'}}>Έναρξη: {loan.start_date}</span>
                    <span style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'#5a5a70'}}>Μήνες αποπληρωθέντες: ~{monthsElapsed}</span>
                    <span style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'#5a5a70'}}>Συνολική διάρκεια: {loan.years} χρόνια</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}