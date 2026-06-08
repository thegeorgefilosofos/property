// TabLoanData.tsx — Shared constants, types, helpers
// Sources: vresdaneio.gr, greece20.gov.gr, ypen.gov.gr, ΑΑΔΕ, bankofgreece.gr, ECB

// ─── Types ────────────────────────────────────────────────────────────────────
export type LoanType = 'purchase'|'first_home'|'renovation'|'energy'|'investment'|'auction'|'construction'|'commercial'|'land'|'refinance'
export type RateType = 'fixed'|'variable'|'mixed'
export type BorrowerType = 'individual'|'professional'|'company'|'young'|'family'|'senior'|'military'|'abroad'
export interface MarketRates { euribor_3m:number; euribor_1m:number; ecb_rate:number; updated_at:string }
export interface SavedLoan { id:string; property_id:string; user_id:string; bank:string; loan_type:LoanType; amount:number; property_value:number; rate:number; rate_type:RateType; years:number; start_date:string; status:string; notes:string }
export interface LoanScenario { id:string; label:string; amount:number; rate:number; years:number; rateType:RateType }
export interface AmortRow { month:number; payment:number; principal:number; interest:number; balance:number; totalInterestPaid:number }

// Euribor history for chart (monthly, Jan 2020 – Jun 2026)
// Source: ECB Statistical Data Warehouse
export const EURIBOR_HISTORY = [
  // 2020
  {date:'2020-01',val:-0.37},{date:'2020-04',val:-0.25},{date:'2020-07',val:-0.42},{date:'2020-10',val:-0.49},
  // 2021
  {date:'2021-01',val:-0.54},{date:'2021-04',val:-0.54},{date:'2021-07',val:-0.55},{date:'2021-10',val:-0.55},
  // 2022 — άνοδος ΕΚΤ
  {date:'2022-01',val:-0.55},{date:'2022-04',val:-0.50},{date:'2022-07',val:0.28},{date:'2022-10',val:1.71},
  // 2023
  {date:'2023-01',val:2.59},{date:'2023-04',val:3.27},{date:'2023-07',val:3.71},{date:'2023-10',val:3.97},
  // 2024
  {date:'2024-01',val:3.89},{date:'2024-04',val:3.88},{date:'2024-07',val:3.57},{date:'2024-10',val:3.08},
  // 2025
  {date:'2025-01',val:2.66},{date:'2025-04',val:2.40},{date:'2025-07',val:2.25},{date:'2025-10',val:2.20},
  // 2026
  {date:'2026-01',val:2.19},{date:'2026-04',val:2.18},{date:'2026-06',val:2.18},
]

// Fallback (updated manually when ECB changes)
export const MARKET_FALLBACK: MarketRates = {
  euribor_3m:2.18, euribor_1m:2.05, ecb_rate:2.40,
  updated_at:'2026-06-08T00:00:00Z',
}

// Real rates from vresdaneio.gr April/June 2026
export const BANKS = [
  {
    id:'eurobank', name:'Eurobank', color:'#00549f',
    fixed3:'2.50-2.90', fixed5:'3.40-3.50', fixed10:'3.80-3.90', fixed15:'4.10-4.20', fixed20:'4.10-4.20',
    variable_spread_min:0.60, variable_spread_max:2.45, fixed_min:2.50,
    max_ltv:90, max_years:35, max_amount:500000, max_age:75, min_amount:20000,
    green_discount:0.20, spiti_mou:true,
    features:['Spread 0.60% (χαμηλότερο αγοράς)','Χωρίς έξοδα έγκρισης','Νομικός+Τεχνικός δωρεάν','Προέγκριση 48ω','gov.gr υπογραφή','Εκταμίευση 10 εργ. ημ.'],
    programs:['Σπίτι μου ΙΙ','Αναβαθμίζω','Εξοικονομώ'],
    fees:'Χωρίς έξοδα εξέτασης', note:'Χαμηλότερο spread αγοράς',
    url:'https://www.eurobank.gr/el/retail/proionta-upiresies/proionta/daneia/stegastika',
  },
  {
    id:'ethniki', name:'Εθνική Τράπεζα', color:'#003087',
    fixed3:'2.90-3.20', fixed5:'3.50', fixed10:'3.70', fixed15:'4.20', fixed20:'4.20',
    variable_spread_min:1.60, variable_spread_max:2.85, fixed_min:2.80,
    max_ltv:90, max_years:35, max_amount:500000, max_age:75, min_amount:30000,
    green_discount:0.25, spiti_mou:true,
    features:['Έως 90% LTV','Σταθερό 3-30 χρόνια','Χωρίς έξοδα αίτησης','Ενεργ. -0.25%','Τρίτεκνοι: +50%'],
    programs:['Σπίτι μου ΙΙ','Αναβαθμίζω','Εξοικονομώ 2025'],
    fees:'Χωρίς έξοδα εξέτασης', note:'Υψηλότερο LTV 90%',
    url:'https://www.nbg.gr/el/idiwtes/daneia/stegastika-daneia',
  },
  {
    id:'alpha', name:'Alpha Bank', color:'#cc0000',
    fixed3:'2.80', fixed5:'3.40', fixed10:'3.80', fixed15:'4.10', fixed20:'4.20',
    variable_spread_min:1.80, variable_spread_max:2.20, fixed_min:2.50,
    max_ltv:90, max_years:35, max_amount:300000, max_age:75, min_amount:25000,
    green_discount:0.10, spiti_mou:true,
    features:['2.50% για νέους (3ετία)','90% LTV','Χάρις 2 χρόνια','Χωρίς έξοδα','Estia Ανακαίνιση'],
    programs:['Σπίτι μου ΙΙ','Alpha Πρώτη Κατοικία','Estia Ανακαίνιση'],
    fees:'Χωρίς έξοδα εξέτασης', note:'Πρόγραμμα νέων 2.50%',
    url:'https://www.alpha.gr/el/idiotika/daneia/stegastika-daneia',
  },
  {
    id:'piraeus', name:'Τράπεζα Πειραιώς', color:'#ff6600',
    fixed3:'2.40-4.70', fixed5:'2.40-4.70', fixed10:'2.40-4.70', fixed15:'2.40-4.70', fixed20:'2.40-4.70',
    variable_spread_min:1.40, variable_spread_max:2.45, fixed_min:2.40,
    max_ltv:90, max_years:35, max_amount:500000, max_age:75, min_amount:20000,
    green_discount:0.15, spiti_mou:true,
    features:['Πράσινα spread 1.25%','Euribor 1M βάση','Online εκτίμηση','Ψηφιακή διαδικασία'],
    programs:['Σπίτι μου ΙΙ','Αναβαθμίζω','Εξοικονομώ'],
    fees:'Έξοδα φακέλου από 300€', note:'Καλύτερο για πράσινα',
    url:'https://www.piraeusbank.gr/el/idiwtes/proionta-upiresies/stegastika-daneia',
  },
  {
    id:'optima', name:'Optima Bank', color:'#8b1a1a',
    fixed3:'3.90', fixed5:'3.50-4.00', fixed10:'3.40-3.90', fixed15:'4.30-4.80', fixed20:'4.30-4.80',
    variable_spread_min:2.00, variable_spread_max:3.00, fixed_min:2.90,
    max_ltv:75, max_years:30, max_amount:300000, max_age:75, min_amount:20000,
    green_discount:0.10, spiti_mou:false,
    features:['Γρήγορη έγκριση','Premium εξυπηρέτηση','Σταθερό+κυμαινόμενο','Αναχρηματοδότηση'],
    programs:['Ανακαινίζω','Εξοικονομώ'],
    fees:'Τιμολόγιο κατά περίπτωση', note:'Premium εξυπηρέτηση',
    url:'https://www.optimabank.gr/individuals/daneia/stegastiko-daneio/',
  },
  {
    id:'credia', name:'CrediaBank', color:'#2d6a4f',
    fixed3:'3.00-3.30', fixed5:'3.60-3.90', fixed10:'4.00-4.20', fixed15:'4.30-4.60', fixed20:'4.50-4.70',
    variable_spread_min:1.60, variable_spread_max:2.70, fixed_min:2.60,
    max_ltv:80, max_years:30, max_amount:250000, max_age:70, min_amount:15000,
    green_discount:0.10, spiti_mou:true,
    features:['Μικρά ποσά','Ευέλικτοι όροι','Γρήγορη εξέταση','Σπίτι μου ΙΙ'],
    programs:['Σπίτι μου ΙΙ','Εξοικονομώ'],
    fees:'Κατά περίπτωση', note:'Ευελιξία & μικρά ποσά',
    url:'https://www.crediabank.gr',
  },
  {
    id:'attica', name:'Attica Bank', color:'#1a4a8a',
    fixed3:'3.20-3.60', fixed5:'3.70-4.00', fixed10:'4.00-4.30', fixed15:'4.40-4.70', fixed20:'4.50-4.80',
    variable_spread_min:1.80, variable_spread_max:2.90, fixed_min:3.00,
    max_ltv:75, max_years:30, max_amount:200000, max_age:70, min_amount:15000,
    green_discount:0.10, spiti_mou:false,
    features:['Ευέλικτοι όροι','Γρήγορη εξέταση'],
    programs:['Εξοικονομώ'],
    fees:'Κατά περίπτωση', note:'Ευέλικτοι όροι',
    url:'https://www.atticabank.gr',
  },
]

export const STATE_PROGRAMS = [
  {
    id:'spiti_mou_2', name:'Σπίτι μου ΙΙ', icon:'🏠', color:'#34d399', status:'active',
    type:'Κρατικό — Επιδότηση επιτοκίου 50%',
    desc:'Χρηματοδότηση έως 190.000€ για πρώτη κατοικία. 50% άτοκο από Ταμείο Ανάκαμψης.',
    max_amount:190000, max_prop_value:250000, max_ltv:90, max_sqm:150,
    age_min:25, age_max:50, duration:'3-30 χρόνια',
    deadline:'31/08/2026', deadline_urgent:true,
    total_budget:'2 δισ. ευρώ',
    criteria:['Ηλικία 25-50 ετών','Πρώτη & κύρια κατοικία','Εισόδημα ≤ 40.000€ / 50.000€ (οικογένεια)','Αξία ≤ 250.000€','Έως 150 τ.μ.'],
    how_it_works:'50% = Ταμείο Ανάκαμψης (άτοκο) · 50% = τράπεζα με επιδοτούμενο επιτόκιο',
    extra:'Τρίτεκνοι/Πολύτεκνοι + γονείς 2 παιδιών (Έβρος): επιπλέον 50% επιδότηση',
    savings_example:'Δάνειο 150.000€ × 25χρ → εξοικονόμηση ~45.000€ τόκων',
    url:'https://greece20.gov.gr/home-loans/',
    banks:['Εθνική','Alpha','Eurobank','Πειραιώς','Optima','CrediaBank'],
  },
  {
    id:'anavathmizo', name:'Αναβαθμίζω το Σπίτι μου', icon:'⚡', color:'#a78bfa', status:'active',
    type:'Κρατικό — Δάνειο ενεργειακής αναβάθμισης',
    desc:'Δάνειο έως 25.000€ με επιδοτούμενο επιτόκιο από ΤΑΑ',
    max_amount:25000, max_prop_value:null, max_ltv:null, max_sqm:null,
    age_min:18, age_max:null, duration:'3-15 χρόνια',
    deadline:'31/08/2026', deadline_urgent:true,
    total_budget:'80 εκ. ευρώ',
    criteria:['ΠΕΑ πριν και μετά','Αναβάθμιση ≥3 ενεργειακές κατηγορίες','Εξοικονόμηση >30%'],
    how_it_works:'Δάνειο για ενεργειακές παρεμβάσεις με επιδοτούμενο επιτόκιο',
    extra:'Αυξημένη επιδότηση για ΑμεΑ, τρίτεκνους, πολύτεκνους',
    savings_example:'Εξοικονόμηση ενέργειας + χαμηλό επιτόκιο = διπλό όφελος',
    url:'https://greece20.gov.gr/home-loans/',
    banks:['Εθνική','Alpha','Eurobank','Πειραιώς','CrediaBank'],
  },
  {
    id:'exoikonomo_2025', name:'Εξοικονομώ 2025', icon:'🌿', color:'#34d399', status:'active',
    type:'Επιδότηση ενεργειακής αναβάθμισης',
    desc:'Deadline 30/06/2026 — ΤΕΕ ζητά παράταση έως 31/12/2026',
    max_amount:null, max_prop_value:null, max_ltv:null, max_sqm:null,
    age_min:18, age_max:null, duration:'Εφάπαξ',
    deadline:'30/06/2026 (αναμένεται παράταση)', deadline_urgent:true,
    total_budget:'Ταμείο Ανάκαμψης ΕΕ',
    criteria:['Εξοικονόμηση >30%','Αναβάθμιση ≥3 κατηγορίες','ΠΕΑ πριν και μετά'],
    how_it_works:'Επιδότηση κουφωμάτων, μόνωσης, θέρμανσης, φωτοβολταϊκών',
    extra:'Ειδικά κίνητρα για ΑμεΑ, τρίτεκνους, πολύτεκνους, νέους',
    savings_example:'Μείωση λογαριασμών + επιδότηση κόστους',
    url:'https://exoikonomo2025.gov.gr/',
    banks:['Εθνική','Alpha','Eurobank','Πειραιώς'],
  },
  {
    id:'exoikonomo_2026', name:'Εξοικονομώ 2026', icon:'🍃', color:'#60a5fa', status:'upcoming',
    type:'Επερχόμενο — 2ο εξάμηνο 2026',
    desc:'Νέος κύκλος €1.2 δισ. — επιδότηση έως 80%, 62.000 κατοικίες',
    max_amount:null, max_prop_value:null, max_ltv:null, max_sqm:null,
    age_min:18, age_max:null, duration:'Αναμένεται',
    deadline:'2ο εξάμηνο 2026', deadline_urgent:false,
    total_budget:'1,2 δισ. ευρώ',
    criteria:['Χωρίς εισοδηματικό κριτήριο','Ιδιοκτήτες / Ενοικιαστές ≥7 ετών'],
    how_it_works:'Επιδότηση έως 80% — λεπτομέρειες αναμένονται',
    extra:'⚠️ Μη δεσμευτείς ακόμα — παρακολούθα exoikonomo2025.gov.gr',
    savings_example:'Επιδότηση έως 80% κόστους αναβάθμισης',
    url:'https://selectra.gr/energeia/energeia-epidomata/exoikonomo',
    banks:['Αναμένεται'],
  },
  {
    id:'anakainizo_noikazo', name:'Ανακαινίζω & Νοικιάζω', icon:'🔑', color:'#fb923c', status:'active',
    type:'Επιδότηση ανακαίνισης + εγγυημένο ενοίκιο ΟΠΕΚΑ',
    desc:'40% επιδότηση + εγγυημένο ενοίκιο 5 χρόνια',
    max_amount:15000, max_prop_value:null, max_ltv:null, max_sqm:null,
    age_min:18, age_max:null, duration:'5 χρόνια',
    deadline:'Τρέχον', deadline_urgent:false,
    total_budget:'Τρέχον',
    criteria:['Κενό ακίνητο ≥3 χρόνια','€5.000-€40.000','Μίσθωση ΟΠΕΚΑ','Δέσμευση 5ετίας'],
    how_it_works:'40% επιδότηση ανακαίνισης + ενοίκιο αγοράς από ΟΠΕΚΑ για 5 χρόνια',
    extra:'Εγγυημένο εισόδημα — ιδανικό για επενδυτές',
    savings_example:'Κενό ακίνητο → ανακαίνιση + εγγυημένο εισόδημα',
    url:'https://www.opeka.gr',
    banks:['Εθνική','Πειραιώς','Eurobank'],
  },
  {
    id:'gefyra_3', name:'Γέφυρα 3', icon:'🌉', color:'#d4af42', status:'active',
    type:'Επιδότηση δόσης — ευάλωτοι δανειολήπτες',
    desc:'Επιδότηση 50% αύξησης δόσης λόγω ανόδου Euribor',
    max_amount:null, max_prop_value:null, max_ltv:null, max_sqm:null,
    age_min:18, age_max:null, duration:'12 μήνες',
    deadline:'Τρέχον — ελέγξτε dovaluegreece.gr', deadline_urgent:false,
    total_budget:'Χρηματοδοτείται από τράπεζες',
    criteria:['Βεβαίωση ευάλωτου οφειλέτη','Κυμαινόμενο δάνειο','Εξασφάλιση πρώτης κατοικίας'],
    how_it_works:'50% αύξησης δόσης λόγω ΕΚΤ (βάση 30/06/2022) για 12 μήνες',
    extra:'Για ανέργους, χαμηλά εισοδήματα, συνταξιούχους',
    savings_example:'Αύξηση 80€/μήνα → επιδότηση 40€ × 12 = 480€/χρόνο',
    url:'https://dovaluegreece.gr/programma-epidotisis-dosis-logo-ayxisis-epitokion-gefyra-3',
    banks:['Όλες οι τράπεζες'],
  },
]

export const TAX_DATA = {
  fma_rate:0.03,
  fma_exemption:{single:200000,married:250000,child1:25000,child2:25000,child3:30000,max_sqm:120},
  rental_tax:[
    {from:0,to:12000,rate:0.15,label:'έως 12.000€ → 15%'},
    {from:12000,to:24000,rate:0.25,label:'12.001-24.000€ → 25% (νέος 2026)'},
    {from:24000,to:Infinity,rate:0.35,label:'άνω 24.000€ → 35%'},
  ],
  rental_expense_deduction:0.05,
  vat_new_buildings:0.24,
  vat_suspension_note:'Προσωρινή αναστολή ΦΠΑ για ορισμένα — ελέγξτε με νομικό',
  interest_deduction:false,
  interest_deduction_note:'Η έκπτωση τόκων καταργήθηκε — ισχύει μόνο για δάνεια πριν 2013',
}

export const LOAN_TYPES: Record<LoanType,{label:string;desc:string;typical_rate:string;typical_ltv:number;notes:string;docs:string[];tax_note:string}> = {
  purchase:     {label:'Αγορά κατοικίας',       desc:'Αγορά παλαιάς ή νέας κατοικίας',        typical_rate:'2.60-3.80%', typical_ltv:80, notes:'Πιο διαδεδομένος τύπος', docs:['Ταυτότητα','Εκκαθαριστικό 2χρ','Μισθοδοτικές 3μ','Ε9','Συμβόλαιο/Προσύμφωνο','ΑΤΑΚ'], tax_note:'ΦΜΑ 3% — απαλλαγή πρώτης κατοικίας εάν πληρούνται οι όροι'},
  first_home:   {label:'Πρώτη κατοικία',        desc:'Σπίτι μου ΙΙ — πολύ χαμηλό επιτόκιο',  typical_rate:'1.00-2.00%', typical_ltv:90, notes:'Ηλικία 25-50, deadline 31/08/2026', docs:['Ταυτότητα','Εκκαθαριστικό 2χρ','Μισθοδοτικές','Υπ. Δήλωση πρώτης κατοικίας','Ε9 μηδενικό'], tax_note:'Απαλλαγή ΦΜΑ: άγαμος έως 200.000€ / έγγαμος έως 250.000€ (ΑΑΔΕ 2026)'},
  renovation:   {label:'Ανακαίνιση',            desc:'Χρηματοδότηση ανακαίνισης',             typical_rate:'3.00-4.50%', typical_ltv:70, notes:'Χωρίς εγγύηση σε μικρά ποσά', docs:['Ταυτότητα','Εκκαθαριστικό','Τίτλος','Προσφορές εργολάβων','Άδεια εφόσον απαιτείται'], tax_note:'Δαπάνες ανακαίνισης με e-πληρωμές μειώνουν φορολογητέο εισόδημα'},
  energy:       {label:'Ενεργειακή αναβάθμιση', desc:'Πράσινα δάνεια — spread από 1.25%',     typical_rate:'2.40-3.50%', typical_ltv:80, notes:'Έκπτωση -0.10-0.25% για κλάση Α/Α+', docs:['ΠΕΑ πριν','Ταυτότητα','Φορολογικά','Τίτλος','Προσφορά αναδόχου'], tax_note:'Επιλέξιμο Εξοικονομώ 2025 (deadline 30/06/2026) & Αναβαθμίζω (31/08/2026)'},
  investment:   {label:'Επενδυτικό ακίνητο',    desc:'Αγορά για εκμετάλλευση/ενοικίαση',     typical_rate:'3.00-4.50%', typical_ltv:70, notes:'Εισόδημα ενοικίου προσμετράται', docs:['Ταυτότητα','Φορολογικά 3χρ','Ε2','Τίτλοι'], tax_note:'Ενοίκια: 15%/25%/35% (2026) — 5% αυτόματη έκπτωση — τόκοι ΔΕΝ εκπίπτουν'},
  auction:      {label:'Πλειστηριασμός',         desc:'Αγορά σε ηλεκτρονικό πλειστηριασμό',   typical_rate:'2.80-4.00%', typical_ltv:70, notes:'Ελέγξτε βάρη — γρήγορη εκταμίευση', docs:['Ταυτότητα','Φορολογικά','Απόσπασμα πλειστηριασμού','Νομικός έλεγχος'], tax_note:'ΦΜΑ 3% — ελέγξτε βάρη και δεσμεύσεις ακινήτου (ktimatologio.gr)'},
  construction: {label:'Ανέγερση κατοικίας',    desc:'Χρηματοδότηση κατασκευής',             typical_rate:'3.00-4.50%', typical_ltv:75, notes:'Εκταμίευση σε φάσεις', docs:['Άδεια δόμησης','Σχέδια','Σύμβαση εργολάβου','Ταυτότητα','Τίτλος οικοπέδου'], tax_note:'ΦΠΑ 24% για νεόδμητα (άδεια μετά 2006) — αντί ΦΜΑ'},
  commercial:   {label:'Επαγγελματικό ακίνητο', desc:'Γραφεία, καταστήματα, αποθήκες',       typical_rate:'3.50-5.00%', typical_ltv:65, notes:'Φορολογικά εκπιπτόμενο', docs:['Καταστατικό/Ταυτότητα','Ισολογισμοί 3χρ','ΔΟΥ','Τίτλος'], tax_note:'Τέλη χαρτοσήμου 3.6% για επαγγελματικές μισθώσεις'},
  land:         {label:'Αγορά οικοπέδου',        desc:'Αγορά οικοπέδου ή αγροτεμαχίου',      typical_rate:'3.50-5.00%', typical_ltv:60, notes:'Χαμηλότερο LTV', docs:['Ταυτότητα','Φορολογικά','Τοπογραφικό','Αποδεικτικό αρτιότητας'], tax_note:'ΦΜΑ 3% — ελέγξτε χρήση γης και εκτός σχεδίου διατάξεις'},
  refinance:    {label:'Αναχρηματοδότηση',       desc:'Μεταφορά δανείου σε άλλη τράπεζα',     typical_rate:'2.60-3.80%', typical_ltv:80, notes:'Εξοικονόμηση από χαμηλότερο επιτόκιο', docs:['Ταυτότητα','Φορολογικά','Πίνακας αποπληρωμής','Τίτλος'], tax_note:'Κόστος μεταφοράς + ποινή πρόωρης αποπληρωμής σε σταθερά'},
}

export const BORROWER_PROFILES: Record<BorrowerType,{label:string;income_ratio:number;notes:string;special:string;tax_benefits:string}> = {
  individual:  {label:'Μισθωτός',              income_ratio:0.35, notes:'Δόση ≤35% εισοδήματος', special:'', tax_benefits:'Απαλλαγή ΦΜΑ εάν πρώτη κατοικία'},
  professional:{label:'Ελεύθ. Επαγγελματίας', income_ratio:0.40, notes:'2 χρόνια φορολογικά', special:'Μέση 2ετίας', tax_benefits:'Δαπάνες επαγγελματικού εκπιπτόμενες'},
  company:     {label:'Εταιρεία',              income_ratio:0.40, notes:'Ισολογισμοί + ΔΣ', special:'Εγγύηση φυσ. προσώπου', tax_benefits:'Πλήρης έκπτωση δαπανών δανείου'},
  young:       {label:'Νέος 25-40 ετών',       income_ratio:0.35, notes:'Σπίτι μου ΙΙ — πολύ χαμηλό', special:'Ηλικία 25-50', tax_benefits:'Απαλλαγή ΦΜΑ + Σπίτι μου ΙΙ'},
  family:      {label:'Οικογένεια/Πολύτεκνη', income_ratio:0.40, notes:'Συν-δανειολήπτες', special:'Τρίτεκνοι: +50%', tax_benefits:'Υψηλότερα όρια απαλλαγής ΦΜΑ'},
  senior:      {label:'50+ ετών',              income_ratio:0.30, notes:'Max ηλικία 75', special:'Ηλικία+χρόνια ≤75', tax_benefits:'Κανονικοί συντελεστές'},
  military:    {label:'Ένοπλες Δυνάμεις',      income_ratio:0.40, notes:'ΤΑΠ-ΟΙΚ ειδικά', special:'Ταμείο Αλληλοβοηθείας', tax_benefits:'Ειδικές απαλλαγές ΤΑΠ'},
  abroad:      {label:'Κάτοικος Εξωτερικού',   income_ratio:0.35, notes:'Επιπλέον έγγραφα', special:'LTV ≤70%', tax_benefits:'Εξαρτάται από χώρα — ΣΑΔΦ'},
}

export const PROCESS_STEPS = [
  {step:'1', title:'Προέλεγχος & Τειρεσίας',  time:'1-2 ημέρες', desc:'Έλεγξε Τειρεσία. Ζήτα αρχική εκτίμηση από e-stegastiko.gr ή τράπεζα. Υπολόγισε DTI Ratio.'},
  {step:'2', title:'Επιλογή Ακινήτου',         time:'—',          desc:'Τίτλοι ιδιοκτησίας, ΑΤΑΚ, έλεγχος βαρών στο ktimatologio.gr.'},
  {step:'3', title:'Αίτηση σε 2-3 Τράπεζες',  time:'1 ημέρα',    desc:'Υποβολή σε πολλές τράπεζες ταυτόχρονα — σύγκριση προσφορών.'},
  {step:'4', title:'Αξιολόγηση & Έγκριση',    time:'5-15 ημέρες',desc:'Τεχνικός + νομικός έλεγχος ακινήτου. Έλεγχος πιστοληπτικής ικανότητας.'},
  {step:'5', title:'Υπογραφή Σύμβασης',        time:'1 ημέρα',    desc:'Υπογραφή (gov.gr ή τράπεζα). Εγγραφή υποθήκης. Πληρωμή ΦΜΑ ή δήλωση απαλλαγής.'},
  {step:'6', title:'Εκταμίευση',               time:'1-5 ημέρες', desc:'Ποσό πιστώνεται. Ολοκλήρωση αγοράς με συμβολαιογράφο.'},
]

export const GLOSSARY = [
  {term:'LTV',              def:'Loan-to-Value — ποσοστό δανείου επί αξίας. LTV 80% = 80% δάνειο, 20% ίδια.'},
  {term:'Euribor',          def:'Euro Interbank Offered Rate — βασικό επιτόκιο αναφοράς ευρωζώνης. Κυμαινόμενα = Euribor + spread.'},
  {term:'Spread',           def:'Περιθώριο κέρδους τράπεζας — σταθερό για όλη τη διάρκεια.'},
  {term:'ΠΕΑ',              def:'Πιστοποιητικό Ενεργειακής Απόδοσης — κλάσεις Α+ (καλύτερο) έως G.'},
  {term:'DTI Ratio',        def:'Debt-to-Income — δόση/εισόδημα. Τράπεζες: συνήθως ≤35-40%.'},
  {term:'ΦΜΑ',              def:'Φόρος Μεταβίβασης Ακινήτων — 3% επί αξίας. Απαλλαγή για πρώτη κατοικία.'},
  {term:'ΑΤΑΚ',             def:'Αριθμός Ταυτότητας Ακινήτου — μοναδικός κωδικός Κτηματολογίου.'},
  {term:'Τειρεσίας',        def:'Σύστημα αθετήσεων πληρωμής — ελέγχεται από κάθε τράπεζα.'},
  {term:'Τοκοχρεολύσιο',   def:'Μηνιαία δόση = κεφάλαιο + τόκος. Κεφάλαιο αυξάνεται, τόκος μειώνεται.'},
  {term:'Break-even',       def:'Μήνες για να αποσβεστούν τα έξοδα αναχρηματοδότησης από τη μηνιαία εξοικονόμηση.'},
  {term:'Περίοδος χάριτος', def:'Πληρώνεις μόνο τόκους — χωρίς αποπληρωμή κεφαλαίου (1-2 χρόνια).'},
  {term:'ΣΑΔΦ',             def:'Σύμβαση Αποφυγής Διπλής Φορολογίας — ισχύει για κατοίκους εξωτερικού.'},
]

// ─── Calc helpers ─────────────────────────────────────────────────────────────
export function calcMonthly(amount:number,annualRate:number,years:number):number {
  if(amount<=0||years<=0)return 0
  if(annualRate===0)return amount/(years*12)
  const r=annualRate/100/12,n=years*12
  return amount*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1)
}

export function calcAmortization(amount:number,annualRate:number,years:number):AmortRow[] {
  const rows:AmortRow[]=[],r=annualRate/100/12,monthly=calcMonthly(amount,annualRate,years)
  let balance=amount,totalInterest=0
  for(let i=1;i<=years*12;i++){
    const interest=balance*r,principal=monthly-interest
    totalInterest+=interest;balance=Math.max(0,balance-principal)
    rows.push({month:i,payment:monthly,principal,interest,balance,totalInterestPaid:totalInterest})
  }
  return rows
}

export function calcFmaExemption(maritalStatus:'single'|'married',children:number):number {
  let limit=maritalStatus==='single'?TAX_DATA.fma_exemption.single:TAX_DATA.fma_exemption.married
  if(children>=1)limit+=TAX_DATA.fma_exemption.child1
  if(children>=2)limit+=TAX_DATA.fma_exemption.child2
  if(children>=3)limit+=TAX_DATA.fma_exemption.child3*(children-2)
  return limit
}

export function calcRentalTax(annualRental:number):number {
  let tax=0,remaining=annualRental
  for(const band of TAX_DATA.rental_tax){
    if(remaining<=0)break
    const taxable=Math.min(remaining,band.to===Infinity?remaining:band.to)-band.from
    if(taxable>0){tax+=Math.max(0,taxable)*band.rate;remaining-=taxable}
  }
  return tax
}

export const fmtEur=(n:number)=>n.toLocaleString('el-GR',{style:'currency',currency:'EUR',maximumFractionDigits:0})
export const fmtPct=(n:number)=>`${n.toFixed(2)}%`
export const fmtPct1=(n:number)=>`${n.toFixed(1)}%`
