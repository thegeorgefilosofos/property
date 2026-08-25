// TabLoanData.tsx — κοινές σταθερές, τύποι και βοηθοί του Δανείου
// Sources: vresdaneio.gr, greece20.gov.gr, ypen.gov.gr, ΑΑΔΕ, bankofgreece.gr, ECB

import { rentalIncomeTax, RENTAL_TAX_SUMMARY_2026 } from '@/lib/billing/greekTax'
import { presumptiveDeductionRate } from '@/lib/billing/consolidate'
import { fe, fp } from '@/components/tokens';

export type LoanType = 'purchase'|'first_home'|'renovation'|'energy'|'investment'|'auction'|'construction'|'commercial'|'land'|'refinance'
export type RateType = 'fixed'|'variable'|'mixed'
export type BorrowerType = 'individual'|'professional'|'company'|'young'|'family'|'senior'|'military'|'abroad'
export interface MarketRates { euribor_3m:number; euribor_1m:number; ecb_rate:number; updated_at:string }
export interface SavedLoan { id:string; property_id:string; user_id:string; bank:string; loan_type:LoanType; amount:number; property_value:number; rate:number; rate_type:RateType; years:number; start_date:string; status:string; notes:string }
export interface LoanScenario { id:string; label:string; amount:number; rate:number; years:number; rateType:RateType }
export interface AmortRow { month:number; payment:number; principal:number; interest:number; balance:number; totalInterestPaid:number }

export const EURIBOR_HISTORY = [
  {date:'2020-01',val:-0.37},{date:'2020-04',val:-0.25},{date:'2020-07',val:-0.42},{date:'2020-10',val:-0.49},
  {date:'2021-01',val:-0.54},{date:'2021-04',val:-0.54},{date:'2021-07',val:-0.55},{date:'2021-10',val:-0.55},
  {date:'2022-01',val:-0.55},{date:'2022-04',val:-0.50},{date:'2022-07',val:0.28},{date:'2022-10',val:1.71},
  {date:'2023-01',val:2.59},{date:'2023-04',val:3.27},{date:'2023-07',val:3.71},{date:'2023-10',val:3.97},
  {date:'2024-01',val:3.89},{date:'2024-04',val:3.88},{date:'2024-07',val:3.57},{date:'2024-10',val:3.08},
  {date:'2025-01',val:2.66},{date:'2025-04',val:2.40},{date:'2025-07',val:2.25},{date:'2025-10',val:2.20},
  {date:'2026-01',val:2.30},{date:'2026-04',val:2.29},{date:'2026-06',val:2.32},
]

// Εφεδρικές τιμές όταν ο πίνακας market_rates είναι κενός. Δείχνονται ΠΑΝΤΑ με
// ημερομηνία επιβεβαίωσης, ποτέ ως «σημερινές». Πηγή: euribor-rates.eu (Euribor 3μ 30/06/2026).
export const MARKET_FALLBACK: MarketRates = {
  euribor_3m:2.324, euribor_1m:2.28, ecb_rate:2.15,
  updated_at:'2026-06-30T00:00:00Z',
}

export const BANKS = [
  { id:'eurobank', name:'Eurobank', color:'#1565C0', fixed3:'2.40-2.90', fixed5:'3.40-3.50', fixed10:'3.80-3.90', fixed15:'4.10-4.20', fixed20:'4.10-4.20', variable_spread_min:1.45, variable_spread_max:2.45, fixed_min:2.40, max_ltv:90, max_years:35, max_amount:500000, max_age:75, min_amount:20000, green_discount:0.20, spiti_mou:true, features:['Spread από 1.45%','Χωρίς έξοδα έγκρισης','Νομικός και τεχνικός έλεγχος δωρεάν','Προέγκριση 48 ώρες','Υπογραφή μέσω gov.gr','Εκταμίευση 10 εργάσιμες'], programs:['Σπίτι μου ΙΙ','Αναβαθμίζω','Εξοικονομώ'], fees:'Χωρίς έξοδα εξέτασης', note:'Ανταγωνιστικοί όροι', url:'https://www.eurobank.gr/el/retail/proionta-upiresies/proionta/daneia/stegastika' },
  { id:'ethniki', name:'Εθνική Τράπεζα', color:'#26A69A', fixed3:'2.50-3.20', fixed5:'3.50', fixed10:'3.70', fixed15:'4.20', fixed20:'4.20', variable_spread_min:1.60, variable_spread_max:2.85, fixed_min:2.50, max_ltv:90, max_years:35, max_amount:500000, max_age:75, min_amount:30000, green_discount:0.25, spiti_mou:true, features:['Έως 90% δάνειο προς αξία','Σταθερό 3–30 χρόνια','Χωρίς έξοδα αίτησης','Ενεργ. -0.25%','Τρίτεκνοι: +50%'], programs:['Σπίτι μου ΙΙ','Αναβαθμίζω','Εξοικονομώ 2025'], fees:'Χωρίς έξοδα εξέτασης', note:'Υψηλότερο δάνειο προς αξία 90%', url:'https://www.nbg.gr/el/idiwtes/daneia/stegastika-daneia' },
  { id:'alpha', name:'Alpha Bank', color:'#E53935', fixed3:'2.70', fixed5:'3.40', fixed10:'3.80', fixed15:'4.10', fixed20:'4.20', variable_spread_min:1.80, variable_spread_max:2.20, fixed_min:2.50, max_ltv:90, max_years:35, max_amount:300000, max_age:75, min_amount:25000, green_discount:0.10, spiti_mou:true, features:['2.50% για νέους (3ετία)','90% δάνειο προς αξία','Χάρις 2 χρόνια','Χωρίς έξοδα','Estia Ανακαίνιση'], programs:['Σπίτι μου ΙΙ','Alpha Πρώτη Κατοικία','Estia Ανακαίνιση'], fees:'Χωρίς έξοδα εξέτασης', note:'Πρόγραμμα νέων 2,50%', url:'https://www.alpha.gr/el/idiotika/daneia/stegastika-daneia' },
  { id:'piraeus', name:'Τράπεζα Πειραιώς', color:'#FFB300', fixed3:'2.40', fixed5:'3.30', fixed10:'3.80', fixed15:'4.10', fixed20:'4.20', variable_spread_min:1.40, variable_spread_max:2.45, fixed_min:2.40, max_ltv:90, max_years:35, max_amount:500000, max_age:75, min_amount:20000, green_discount:0.15, spiti_mou:true, features:['Πράσινα spread 1.25%','Euribor 1M βάση','Online εκτίμηση','Ψηφιακή διαδικασία'], programs:['Σπίτι μου ΙΙ','Αναβαθμίζω','Εξοικονομώ'], fees:'Έξοδα φακέλου από 300 €', note:'Καλύτερο για πράσινα', url:'https://www.piraeusbank.gr/el/idiwtes/proionta-upiresies/stegastika-daneia' },
  { id:'optima', name:'Optima Bank', color:'#7B1FA2', fixed3:'3.90', fixed5:'3.50-4.00', fixed10:'3.40-3.90', fixed15:'4.30-4.80', fixed20:'4.30-4.80', variable_spread_min:2.00, variable_spread_max:3.00, fixed_min:2.90, max_ltv:75, max_years:30, max_amount:300000, max_age:75, min_amount:20000, green_discount:0.10, spiti_mou:false, features:['Γρήγορη έγκριση','Προνομιακή εξυπηρέτηση','Σταθερό+κυμαινόμενο','Αναχρηματοδότηση'], programs:['Ανακαινίζω','Εξοικονομώ'], fees:'Τιμολόγιο κατά περίπτωση', note:'Προνομιακή εξυπηρέτηση', url:'https://www.optimabank.gr/individuals/daneia/stegastiko-daneio/' },
  { id:'credia', name:'CrediaBank', color:'#009688', fixed3:'3.00-3.30', fixed5:'3.60-3.90', fixed10:'4.00-4.20', fixed15:'4.30-4.60', fixed20:'4.50-4.70', variable_spread_min:1.60, variable_spread_max:2.70, fixed_min:2.60, max_ltv:80, max_years:30, max_amount:250000, max_age:70, min_amount:15000, green_discount:0.10, spiti_mou:true, features:['Μικρά ποσά','Ευέλικτοι όροι','Γρήγορη εξέταση','Σπίτι μου ΙΙ'], programs:['Σπίτι μου ΙΙ','Εξοικονομώ'], fees:'Κατά περίπτωση', note:'Ευελιξία και μικρά ποσά', url:'https://www.crediabank.gr' },
  { id:'attica', name:'Attica Bank', color:'#1E88E5', fixed3:'3.20-3.60', fixed5:'3.70-4.00', fixed10:'4.00-4.30', fixed15:'4.40-4.70', fixed20:'4.50-4.80', variable_spread_min:1.80, variable_spread_max:2.90, fixed_min:3.00, max_ltv:75, max_years:30, max_amount:200000, max_age:70, min_amount:15000, green_discount:0.10, spiti_mou:false, features:['Ευέλικτοι όροι','Γρήγορη εξέταση'], programs:['Εξοικονομώ'], fees:'Κατά περίπτωση', note:'Ευέλικτοι όροι', url:'https://www.atticabank.gr' },
]

// Ημερομηνία τελευταίας επιβεβαίωσης των στατικών επιτοκίων τραπεζών (ενδεικτικά,
// επιβεβαίωσε με την τράπεζα). Πηγές: vresdaneio.gr, daneiocalculator.gr, ΤτΕ/ΕΚΤ.
// ── ΤΙ ΕΠΑΛΗΘΕΥΤΗΚΕ, ΠΟΤΕ, ΚΑΙ ΤΙ ΟΧΙ ──────────────────────────────────────
// 8 Αυγούστου 2026, από δημοσιευμένες συγκρίσεις αγοράς: τα ΤΡΙΕΤΗ σταθερά
// είχαν υποχωρήσει και ο πίνακας τα έδειχνε ψηλότερα απ' όσο ήταν —
//
//     Πειραιώς   2,90 → 2,40   (2,25 στα πράσινα)
//     Eurobank   2,50 → 2,40   (έκπτωση 40 μονάδων βάσης, πρώτη κατοικία)
//     Εθνική     2,90 → 2,50
//     Alpha      2,80 → 2,70
//
// Η ημερομηνία επαλήθευσης ΔΕΝ μετακινήθηκε στο σήμερα. Επαληθεύτηκε η στήλη
// της τριετίας, όχι όλος ο πίνακας· μετακινώντας την, οι υπόλοιπες διάρκειες θα
// δήλωναν φρεσκάδα που δεν έχουν και ο μηχανισμός παλαιότητας (45 ημέρες,
// TabLoan) θα σιωπούσε άδικα. Καλύτερα να προειδοποιεί νωρίτερα παρά αργότερα.
export const BANKS_VERIFIED = '2026-07-08'
export const RATES_DISCLAIMER = 'Ενδεικτικά επιτόκια, επιβεβαίωσε τους ακριβείς όρους με την τράπεζα.'

// ── ΕΝΑ ΣΧΗΜΑ ΤΡΑΠΕΖΑΣ, ΟΧΙ ΔΥΟ ──────────────────────────────────────────
// Τα στατικά δεδομένα χρησιμοποιούν `fixed3`, ο πίνακας `bank_rates` (ζωντανά)
// χρησιμοποιεί `fixed_3yr`. Ο `normBank` γεφυρώνει τα δύο ώστε ο συγκριτικός
// πίνακας να μη δείχνει «—» στην εφεδρική κατάσταση.
//
// Η γέφυρα υπήρχε ήδη· αυτό που έλειπε ήταν το ΟΝΟΜΑ του αποτελέσματος. Χωρίς
// αυτό, ο τύπος ήταν `Record<string, any>` και η οθόνη διάβαζε κάθε στήλη με
// `(bank as any)[k]` — δηλαδή ένα λάθος όνομα πεδίου έβγαινε ως κενό κελί.
export interface ComparisonBank {
  id: string;
  name: string;
  color: string;
  fixed_3yr: string; fixed_5yr: string; fixed_10yr: string; fixed_15yr: string; fixed_20yr: string;
  variable_spread_min: number; variable_spread_max: number; fixed_min: number;
  max_ltv: number; max_years: number; max_amount: number; min_amount: number;
  green_discount: number; spiti_mou: boolean;
  features: string[]; programs: string[];
  fees: string; note: string; url: string; verified_at: string;
}

/** Ό,τι μπορεί να δώσει είτε ο στατικός πίνακας είτε η βάση. */
export interface RawBank {
  id?: string; bank_id?: string; name?: string; bank_name?: string; color?: string;
  fixed3?: string; fixed5?: string; fixed10?: string; fixed15?: string; fixed20?: string;
  fixed_3yr?: string; fixed_5yr?: string; fixed_10yr?: string; fixed_15yr?: string; fixed_20yr?: string;
  variable_spread_min?: number; variable_spread_max?: number; fixed_min?: number;
  max_ltv?: number; max_years?: number; max_amount?: number; min_amount?: number;
  green_discount?: number; spiti_mou?: boolean;
  features?: string[]; programs?: string[];
  fees?: string; note?: string; url?: string; verified_at?: string;
}

export function normBank(b: RawBank): ComparisonBank {
  return {
    id:   b.id   ?? b.bank_id   ?? '',
    name: b.name ?? b.bank_name ?? '',
    color: b.color ?? 'var(--accent)',
    fixed_3yr:  b.fixed_3yr  ?? b.fixed3  ?? '',
    fixed_5yr:  b.fixed_5yr  ?? b.fixed5  ?? '',
    fixed_10yr: b.fixed_10yr ?? b.fixed10 ?? '',
    fixed_15yr: b.fixed_15yr ?? b.fixed15 ?? '',
    fixed_20yr: b.fixed_20yr ?? b.fixed20 ?? '',
    variable_spread_min: b.variable_spread_min ?? 0,
    variable_spread_max: b.variable_spread_max ?? 0,
    fixed_min: b.fixed_min ?? 0,
    max_ltv: b.max_ltv ?? 0, max_years: b.max_years ?? 0,
    max_amount: b.max_amount ?? 0, min_amount: b.min_amount ?? 0,
    green_discount: b.green_discount ?? 0, spiti_mou: !!b.spiti_mou,
    features: b.features ?? [], programs: b.programs ?? [],
    fees: b.fees ?? '', note: b.note ?? '', url: b.url ?? '',
    verified_at: b.verified_at ?? BANKS_VERIFIED,
  }
}
export const BANKS_NORM: ComparisonBank[] = BANKS.map(normBank)

export const STATE_PROGRAMS = [
  { id:'spiti_mou_2', name:'Σπίτι μου ΙΙ',  type:'Κρατικό, άτοκο 50% (+ επιδότηση επιτοκίου για πολύτεκνους)', desc:'Χρηματοδότηση έως 190.000 € για πρώτη και κύρια κατοικία. Το 50% του δανείου είναι άτοκο (πόροι Ταμείου Ανάκαμψης), το υπόλοιπο 50% με επιτόκιο τράπεζας.', max_amount:190000, max_prop_value:250000, max_ltv:90, max_sqm:150, age_min:25, age_max:50, duration:'3–30 χρόνια (χωρίς περίοδο χάριτος)', application_deadline:'31/05/2026', deadline:'31/08/2026',  verified_at:'2026-07-08', total_budget:'2 δισ. ευρώ (50% Ταμείο Ανάκαμψης + 50% τράπεζες)', criteria:['Ηλικία 25–50 ετών (γεννηθέντες 1976–2001 για αιτήσεις 2026)','Πρώτη και κύρια κατοικία','Εισόδημα: ενδεικτικά έγγαμοι 35.000 € +5.000 €/παιδί, μονογονεϊκές 39.000 € (επιβεβαίωσε στην πύλη)','Αξία συμβολαίου ≤ 250.000 €','Έως 150 τ.μ.','Έτος κατασκευής ακινήτου έως και 2007 (για ΑμεΑ ≥67% έως και 31/12/2020)'], how_it_works:'50% του δανείου άτοκο (Ταμείο Ανάκαμψης) · 50% έντοκο (τράπεζα), για όλους. Τρίτεκνοι/πολύτεκνοι: επιπλέον επιδότηση 50% του επιτοκίου στο τραπεζικό 50% (το άτοκο κεφάλαιο παραμένει 50%)', extra:'Τρίτεκνοι/Πολύτεκνοι: επιδοτείται κατά 50% το επιτόκιο του τραπεζικού μισού, δεν γίνεται άτοκο το 75% του κεφαλαίου. Προθεσμία αίτησης 31/05/2026, σύναψη σύμβασης έως 31/08/2026', savings_example:'Δάνειο 150.000 € × 25 έτη με 50% άτοκο δίνει εξοικονόμηση δεκάδων χιλιάδων € σε τόκους έναντι κανονικού δανείου', url:'https://stegasi.gov.gr/programs/spiti-mou-ii/', banks:['Εθνική','Alpha','Eurobank','Πειραιώς','Optima','CrediaBank'] },
  { id:'anavathmizo', name:'Αναβαθμίζω το Σπίτι μου',  type:'Κρατικό, Δάνειο ενεργειακής αναβάθμισης', desc:'Δάνειο 5.000 € έως 25.000 €, άτοκο για τον δανειολήπτη: το 75% από το Ταμείο Ανάκαμψης χωρίς τόκο και το 25% από την τράπεζα με πλήρη επιδότηση των τόκων από το Δημόσιο', max_amount:25000, max_prop_value:null, max_ltv:null, max_sqm:null, age_min:18, age_max:null, duration:'3–7 χρόνια', application_deadline:'31/05/2026', deadline:'31/08/2026',  total_budget:'80 εκ. ευρώ', criteria:['ΠΕΑ πριν και μετά','Αναβάθμιση ≥3 ενεργειακές κατηγορίες','Εξοικονόμηση >30%'], how_it_works:'Δάνειο για ενεργειακές παρεμβάσεις, ένα ακίνητο ανά ΑΦΜ, χωρίς εισοδηματικά κριτήρια', extra:'Αυξημένη επιδότηση για ΑμεΑ, τρίτεκνους και πολύτεκνους. Οι αιτήσεις υπαγωγής έκλεισαν στις 31/05/2026· η 31/08/2026 αφορά μόνο την υπογραφή σύμβασης για όσους έχουν ήδη έγκριση', savings_example:'Μηδενικό κόστος δανεισμού και χαμηλότεροι λογαριασμοί ενέργειας', url:'https://greece20.gov.gr/home-loans/', banks:['Εθνική','Alpha','Eurobank','Πειραιώς','CrediaBank'] },
  { id:'exoikonomo_2025', name:'Εξοικονομώ 2025',  type:'Επιδότηση ενεργειακής αναβάθμισης', desc:'Η αρχική προθεσμία (30/06/2026) παρήλθε, εκκρεμεί ανακοίνωση παράτασης, επιβεβαίωσε στο exoikonomo2025.gov.gr', max_amount:null, max_prop_value:null, max_ltv:null, max_sqm:null, age_min:18, age_max:null, duration:'Εφάπαξ', deadline:'Έληξε 30/06/2026, εκκρεμεί παράταση',  verified_at:'2026-07-08', total_budget:'Ταμείο Ανάκαμψης ΕΕ', criteria:['Εξοικονόμηση >30%','Αναβάθμιση ≥3 κατηγορίες','ΠΕΑ πριν και μετά'], how_it_works:'Επιδότηση κουφωμάτων, μόνωσης, θέρμανσης, φωτοβολταϊκών', extra:'Ειδικά κίνητρα για ΑμεΑ, τρίτεκνους, πολύτεκνους, νέους', savings_example:'Μείωση λογαριασμών + επιδότηση κόστους', url:'https://exoikonomo2025.gov.gr/', banks:['Εθνική','Alpha','Eurobank','Πειραιώς'] },
  { id:'exoikonomo_2026', name:'Εξοικονομώ 2026', status:'upcoming', type:'Επερχόμενο, 2ο εξάμηνο 2026', desc:'Νέος κύκλος 1,2 δισ. €, επιδότηση έως 80%, 62.000 κατοικίες', max_amount:null, max_prop_value:null, max_ltv:null, max_sqm:null, age_min:18, age_max:null, duration:'Αναμένεται', deadline:'2ο εξάμηνο 2026',  total_budget:'1,2 δισ. ευρώ', criteria:['Χωρίς εισοδηματικό κριτήριο','Ιδιοκτήτες / Ενοικιαστές ≥7 ετών'], how_it_works:'Επιδότηση έως 80%, λεπτομέρειες αναμένονται', extra:'Μη δεσμευτείς ακόμη, παρακολούθα exoikonomo2025.gov.gr', savings_example:'Επιδότηση έως 80% κόστους αναβάθμισης', url:'https://selectra.gr/energeia/energeia-epidomata/exoikonomo', banks:['Αναμένεται'] },
  { id:'anakainizo_noikazo', name:'Ανακαινίζω και Νοικιάζω',  type:'Επιδότηση ανακαίνισης + εγγυημένο ενοίκιο ΟΠΕΚΑ', desc:'40% επιδότηση + εγγυημένο ενοίκιο 5 χρόνια', max_amount:15000, max_prop_value:null, max_ltv:null, max_sqm:null, age_min:18, age_max:null, duration:'5 χρόνια', deadline:'Τρέχον',  total_budget:'Τρέχον', criteria:['Κενό ακίνητο ≥3 χρόνια','€5.000–€40.000','Μίσθωση ΟΠΕΚΑ','Δέσμευση 5ετίας'], how_it_works:'40% επιδότηση ανακαίνισης + ενοίκιο αγοράς από ΟΠΕΚΑ για 5 χρόνια', extra:'Εγγυημένο εισόδημα, ιδανικό για επενδυτές', savings_example:'Κενό ακίνητο: ανακαίνιση + εγγυημένο εισόδημα', url:'https://www.opeka.gr', banks:['Εθνική','Πειραιώς','Eurobank'] },
  { id:'gefyra_3', name:'Γέφυρα 3',  type:'Πρωτοβουλία τραπεζών, ευάλωτοι δανειολήπτες', desc:'Κάλυψη του 50% της αύξησης της δόσης που προήλθε από την άνοδο των επιτοκίων της ΕΚΤ. Δεν είναι κρατική επιδότηση: είναι εθελοντική πρωτοβουλία των τραπεζών-μελών της Ελληνικής Ενωσης Τραπεζών (ανακοίνωση 15/12/2022)', max_amount:null, max_prop_value:null, max_ltv:null, max_sqm:null, age_min:18, age_max:null, duration:'12 μήνες', deadline:'Τρέχον, έλεγξε dovaluegreece.gr',  total_budget:'Χρηματοδοτείται από τις ίδιες τις τράπεζες', criteria:['Βεβαίωση ευάλωτου οφειλέτη','Κυμαινόμενο δάνειο','Εξασφάλιση πρώτης κατοικίας'], how_it_works:'Καλύπτει το 50% της αύξησης της μηνιαίας δόσης έναντι της 30/06/2022, για δώδεκα μήνες, σε δάνεια κυμαινόμενου επιτοκίου με εξασφάλιση σε πρώτη κατοικία', extra:'Για ανέργους, χαμηλά εισοδήματα, συνταξιούχους', savings_example:'Αύξηση 80 €/μήνα, επιδότηση 40 € × 12 = 480 €/χρόνο', url:'https://dovaluegreece.gr/programma-epidotisis-dosis-logo-ayxisis-epitokion-gefyra-3', banks:['Όλες οι τράπεζες'] },
]

// ── ΕΝΑ ΣΧΗΜΑ ΠΡΟΓΡΑΜΜΑΤΟΣ, ΟΧΙ ΔΥΟ ──────────────────────────────────────
// Ο στατικός πίνακας λέει `desc`, `duration`, `extra`, `banks`. Ο πίνακας
// `loan_programs` της βάσης λέει `description`, `duration_label`, `extra_info`,
// `participating_banks`. Η οθόνη τα διάβαζε και τα δύο με `||` και με
// `as any` — και ό,τι υπήρχε μόνο στη μία πλευρά (τετραγωνικά, ηλικία, «πώς
// λειτουργεί») εμφανιζόταν ή εξαφανιζόταν ανάλογα με το αν είχε φορτώσει η βάση,
// χωρίς κανείς να το βλέπει σαν πρόβλημα.
export interface ComparisonProgram {
  id: string;
  name: string;
  /**
   * ΜΟΝΟ το «upcoming» έχει νόημα γραμμένο: ό,τι δεν άνοιξε ακόμη δεν
   * προκύπτει από ημερομηνία. Κάθε άλλη κατάσταση την κρίνει η `programStatus`
   * συγκρίνοντας με το σήμερα — το `status:'active'` ήταν χειρόγραφη σημαία που
   * έμενε αληθινή μόνο μέχρι να περάσει η προθεσμία δίπλα της.
   */
  status: string;
  type: string;
  desc: string;
  howItWorks: string;
  extra: string;
  savingsExample: string;
  maxAmount: number | null;
  maxLtv: number | null;
  maxSqm: number | null;
  ageMin: number | null;
  ageMax: number | null;
  duration: string;
  /**
   * Καταληκτική ημερομηνία ΑΙΤΗΣΗΣ. Υπήρχε στα δεδομένα και ΔΕΝ περνούσε από τη
   * `normProgram`: η οθόνη έβλεπε μόνο τη `deadline`, που στα κρατικά
   * προγράμματα είναι η προθεσμία ΥΠΟΓΡΑΦΗΣ — μεταγενέστερη. Έτσι το «Σπίτι μου
   * ΙΙ» έδειχνε «Προθεσμία 31/08/2026» δέκα εβδομάδες αφότου οι αιτήσεις είχαν
   * κλείσει στις 31/05 και ο χρήστης νόμιζε ότι προλαβαίνει.
   */
  applicationDeadline: string;
  deadline: string;
  totalBudget: string;
  criteria: string[];
  banks: string[];
  url: string;
}

/** Ό,τι μπορεί να δώσει είτε ο στατικός πίνακας είτε η βάση. */
export interface RawProgram {
  id?: string; program_id?: string; name?: string; status?: string;
  type?: string; type_label?: string;
  desc?: string; description?: string;
  how_it_works?: string;
  extra?: string; extra_info?: string;
  savings_example?: string;
  max_amount?: number | null; max_ltv?: number | null; max_sqm?: number | null;
  age_min?: number | null; age_max?: number | null;
  duration?: string; duration_label?: string;
  application_deadline?: string | null;
  deadline?: string | null; deadline_label?: string;
  total_budget?: string;
  criteria?: string[];
  banks?: string[]; participating_banks?: string[];
  url?: string;
}

// Το «null» ως ΚΕΙΜΕΝΟ έφτανε από τη βάση σε πεδία που δεν συμπληρώθηκαν και
// τυπωνόταν αυτούσιο στην οθόνη. Καθαρίζεται εδώ, μία φορά, αντί για τρεις
// ελέγχους `!== 'null'` σκορπισμένους στην απόδοση.
const txt = (v?: string | null): string => (!v || v === 'null' || v === '-' ? '' : v)

export function normProgram(p: RawProgram): ComparisonProgram {
  return {
    id: p.id ?? p.program_id ?? '',
    name: p.name ?? '',
    status: p.status ?? 'active',
    type: txt(p.type ?? p.type_label),
    desc: txt(p.desc ?? p.description),
    howItWorks: txt(p.how_it_works),
    extra: txt(p.extra ?? p.extra_info),
    savingsExample: txt(p.savings_example),
    maxAmount: p.max_amount ?? null,
    maxLtv: p.max_ltv ?? null,
    maxSqm: p.max_sqm ?? null,
    ageMin: p.age_min ?? null,
    ageMax: p.age_max ?? null,
    duration: txt(p.duration ?? p.duration_label),
    applicationDeadline: txt(p.application_deadline),
    deadline: txt(p.deadline ?? p.deadline_label),
    totalBudget: txt(p.total_budget),
    criteria: p.criteria ?? [],
    banks: p.participating_banks ?? p.banks ?? [],
    url: p.url ?? '',
  }
}
export const PROGRAMS_NORM: ComparisonProgram[] = STATE_PROGRAMS.map(normProgram)

// ΑΦΑΙΡΕΘΗΚΑΝ το `rental_tax` και το `rental_expense_deduction`.
// Ήταν ΤΡΙΤΟ αντίγραφο της φορολογικής κλίμακας ενοικίων και ΤΕΤΑΡΤΟ της τεκμαρτής
// έκπτωσης 5% και χρησιμοποιούνταν για ΕΜΦΑΝΙΣΗ στην ίδια κάρτα όπου ο
// ΥΠΟΛΟΓΙΣΜΟΣ έρχεται από το lib/billing/greekTax. Με την πρώτη αλλαγή του νόμου,
// ο πίνακας θα έδειχνε τα παλιά κλιμάκια και το ποσό δίπλα του τα νέα — σιωπηλά,
// χωρίς κανένα σφάλμα. Η κλίμακα για εμφάνιση ζει στο RENTAL_TAX_ROWS_2026 και η
// έκπτωση στο presumptiveDeductionRate (lib/billing/consolidate).
// ΚΑΙ ΤΟ `fma_rate:0.03` ΕΦΥΓΕ, ΓΙΑΤΙ ΗΤΑΝ ΔΕΥΤΕΡΟ ΚΑΙ ΛΑΘΟΣ ΑΝΤΙΓΡΑΦΟ.
// Ο φόρος μεταβίβασης είναι 3,09% (3% συν 3% υπέρ ΟΤΑ επί του φόρου) και ζει
// στο `TRANSFER_TAX_RATE` του lib/accounting/transfer.ts, που τον υπολογίζει
// σωστά. Εδώ καθόταν ένα 0,03 που δεν το διάβαζε κανείς: την ημέρα που θα το
// διάβαζε κάποιος, θα έβγαζε φόρο μικρότερο κατά 3%.
//
// Μαζί έφυγαν ο ΦΠΑ νεόδμητων, η σημείωση αναστολής και τα δύο πεδία για την
// έκπτωση τόκων: γραμμένα, εξαγόμενα, ποτέ διαβασμένα. Μένει η απαλλαγή
// πρώτης κατοικίας, που τη διαβάζει η συνάρτηση από κάτω.
export const TAX_DATA = {
  fma_exemption:{single:200000,married:250000,child1:25000,child2:25000,child3:30000,max_sqm:120},
}

export type LoanDoc = { name: string; where?: string }
export const LOAN_TYPES: Record<LoanType,{label:string;desc:string;rate_from:number;rate_to:number;typical_ltv:number;notes:string;docs:LoanDoc[];tax_note:string}> = {
  purchase:     {label:'Αγορά κατοικίας',       desc:'Αγορά παλαιάς ή νέας κατοικίας',        rate_from:2.40, rate_to:4.90, typical_ltv:80, notes:'Πιο διαδεδομένος τύπος', docs:[
    {name:'Δελτίο ταυτότητας ή διαβατήριο'},
    {name:'Εκκαθαριστικά σημειώματα δύο τελευταίων ετών', where:'ΑΑΔΕ, myAADE'},
    {name:'Αποδείξεις μισθοδοσίας τριών τελευταίων μηνών', where:'Εργοδότης'},
    {name:'Δήλωση στοιχείων ακινήτων (Ε9)', where:'ΑΑΔΕ'},
    {name:'Συμβόλαιο ή προσύμφωνο αγοραπωλησίας', where:'Συμβολαιογράφος'},
    {name:'Αριθμός Ταυτότητας Ακινήτου (ΑΤΑΚ)', where:'ΑΑΔΕ, Ε9'},
  ], tax_note:'Φόρος μεταβίβασης 3% συν 3% υπέρ ΟΤΑ επί του φόρου, δηλαδή 3,09% συνολικά, επί της μεγαλύτερης μεταξύ τιμήματος και αντικειμενικής αξίας. Απαλλαγή πρώτης κατοικίας εφόσον πληρούνται οι όροι'},
  first_home:   {label:'Πρώτη κατοικία',        desc:'Σπίτι μου ΙΙ, πολύ χαμηλό επιτόκιο',  rate_from:1.00, rate_to:2.00, typical_ltv:90, notes:'Το «Σπίτι μου ΙΙ» έκλεισε για νέες αιτήσεις στις 31/05/2026', docs:[
    {name:'Δελτίο ταυτότητας ή διαβατήριο'},
    {name:'Εκκαθαριστικά σημειώματα δύο τελευταίων ετών', where:'ΑΑΔΕ'},
    {name:'Αποδεικτικά εισοδήματος ή μισθοδοσίας', where:'Εργοδότης, ΑΑΔΕ'},
    {name:'Υπεύθυνη δήλωση πρώτης κατοικίας', where:'gov.gr'},
    {name:'Μηδενική δήλωση ακινήτων (Ε9): αποδεικνύει μη κατοχή κατοικίας', where:'ΑΑΔΕ'},
  ], tax_note:'Απαλλαγή φόρου μεταβίβασης: άγαμος έως 200.000 € και έγγαμος έως 250.000 € (ΑΑΔΕ 2026)'},
  renovation:   {label:'Ανακαίνιση',            desc:'Χρηματοδότηση ανακαίνισης',             rate_from:3.00, rate_to:4.50, typical_ltv:70, notes:'Χωρίς εγγύηση σε μικρά ποσά', docs:[
    {name:'Δελτίο ταυτότητας ή διαβατήριο'},
    {name:'Εκκαθαριστικό σημείωμα', where:'ΑΑΔΕ'},
    {name:'Τίτλος ιδιοκτησίας', where:'Συμβολαιογράφος, Κτηματολόγιο'},
    {name:'Προσφορές αναδόχων ή εργολάβων'},
    {name:'Οικοδομική άδεια, εφόσον απαιτείται', where:'Πολεοδομία'},
  ], tax_note:'Δαπάνες ανακαίνισης με ηλεκτρονικές πληρωμές μειώνουν το φορολογητέο εισόδημα'},
  energy:       {label:'Ενεργειακή αναβάθμιση', desc:'Πράσινα δάνεια, περιθώριο από 1,25%',   rate_from:2.40, rate_to:3.50, typical_ltv:80, notes:'Εκπτωση περιθωρίου 0,15% έως 0,80% για κλάση Α+, Α ή Β+, ανάλογα με την τράπεζα', docs:[
    {name:'Πιστοποιητικό Ενεργειακής Απόδοσης (πριν την αναβάθμιση)', where:'Ενεργειακός επιθεωρητής'},
    {name:'Δελτίο ταυτότητας ή διαβατήριο'},
    {name:'Φορολογικά στοιχεία εισοδήματος', where:'ΑΑΔΕ'},
    {name:'Τίτλος ιδιοκτησίας', where:'Κτηματολόγιο'},
    {name:'Προσφορά αναδόχου έργου'},
  ], tax_note:'Επιλέξιμο για Εξοικονομώ 2025 (προθεσμία 30/06/2026) και Αναβαθμίζω (31/08/2026)'},
  investment:   {label:'Επενδυτικό ακίνητο',    desc:'Αγορά για εκμετάλλευση ή ενοικίαση',   rate_from:3.00, rate_to:4.50, typical_ltv:70, notes:'Το εισόδημα ενοικίου προσμετράται', docs:[
    {name:'Δελτίο ταυτότητας ή διαβατήριο'},
    {name:'Φορολογικές δηλώσεις τριών τελευταίων ετών', where:'ΑΑΔΕ'},
    {name:'Αναλυτική κατάσταση μισθωμάτων (Ε2)', where:'ΑΑΔΕ'},
    {name:'Τίτλοι ιδιοκτησίας', where:'Κτηματολόγιο'},
    // Η κλίμακα δεν γράφεται ξανά εδώ: έρχεται από τη μοναδική πηγή (greekTax).
    // Και η έκπτωση 5% ΔΕΝ είναι «αυτόματη» — από 1/1/2026 θέλει τραπεζική είσπραξη.
  ], tax_note:`${RENTAL_TAX_SUMMARY_2026} Τεκμαρτή έκπτωση 5% μόνο με είσπραξη μέσω τραπέζης (από 1/1/2026). Οι τόκοι δανείου δεν εκπίπτουν για φυσικό πρόσωπο.`},
  auction:      {label:'Πλειστηριασμός',         desc:'Αγορά σε ηλεκτρονικό πλειστηριασμό',   rate_from:2.80, rate_to:4.00, typical_ltv:70, notes:'Έλεγξε βάρη, γρήγορη εκταμίευση', docs:[
    {name:'Δελτίο ταυτότητας ή διαβατήριο'},
    {name:'Φορολογικά στοιχεία εισοδήματος', where:'ΑΑΔΕ'},
    {name:'Απόσπασμα κατασχετήριας έκθεσης πλειστηριασμού', where:'eauction.gr'},
    {name:'Νομικός έλεγχος τίτλων και βαρών', where:'Δικηγόρος'},
  ], tax_note:'Φόρος μεταβίβασης 3,09% (3% συν 3% υπέρ ΟΤΑ επί του φόρου). Ελεγξε βάρη και δεσμεύσεις στο Κτηματολόγιο'},
  construction: {label:'Ανέγερση κατοικίας',    desc:'Χρηματοδότηση κατασκευής',             rate_from:3.00, rate_to:4.50, typical_ltv:75, notes:'Εκταμίευση σε φάσεις', docs:[
    {name:'Οικοδομική άδεια (άδεια δόμησης)', where:'Πολεοδομία'},
    {name:'Εγκεκριμένα αρχιτεκτονικά σχέδια', where:'Μηχανικός'},
    {name:'Σύμβαση με εργολάβο ή ανάδοχο'},
    {name:'Δελτίο ταυτότητας ή διαβατήριο'},
    {name:'Τίτλος ιδιοκτησίας οικοπέδου', where:'Κτηματολόγιο'},
  ], tax_note:'ΦΠΑ 24% για νεόδμητα (άδεια μετά το 2006), αντί για φόρο μεταβίβασης'},
  commercial:   {label:'Επαγγελματικό ακίνητο', desc:'Γραφεία, καταστήματα, αποθήκες',       rate_from:3.50, rate_to:5.00, typical_ltv:65, notes:'Οι τόκοι εκπίπτουν φορολογικά', docs:[
    {name:'Καταστατικό εταιρείας ή δελτίο ταυτότητας'},
    {name:'Ισολογισμοί τριών τελευταίων ετών', where:'Λογιστήριο'},
    {name:'Φορολογική και ασφαλιστική ενημερότητα', where:'ΑΑΔΕ, ΕΦΚΑ'},
    {name:'Τίτλος ιδιοκτησίας', where:'Κτηματολόγιο'},
  ], tax_note:'Τέλη χαρτοσήμου 3,6% για επαγγελματικές μισθώσεις'},
  land:         {label:'Αγορά οικοπέδου',        desc:'Αγορά οικοπέδου ή αγροτεμαχίου',      rate_from:3.50, rate_to:5.00, typical_ltv:60, notes:'Χαμηλότερο δάνειο προς αξία', docs:[
    {name:'Δελτίο ταυτότητας ή διαβατήριο'},
    {name:'Φορολογικά στοιχεία εισοδήματος', where:'ΑΑΔΕ'},
    {name:'Τοπογραφικό διάγραμμα', where:'Μηχανικός'},
    {name:'Βεβαίωση αρτιότητας και οικοδομησιμότητας', where:'Πολεοδομία'},
  ], tax_note:'Φόρος μεταβίβασης 3,09% (3% συν 3% υπέρ ΟΤΑ επί του φόρου). Ελεγξε τη χρήση γης και τις εκτός σχεδίου διατάξεις'},
  refinance:    {label:'Αναχρηματοδότηση',       desc:'Μεταφορά δανείου σε άλλη τράπεζα',     rate_from:2.40, rate_to:4.90, typical_ltv:80, notes:'Εξοικονόμηση από χαμηλότερο επιτόκιο', docs:[
    {name:'Δελτίο ταυτότητας ή διαβατήριο'},
    {name:'Φορολογικά στοιχεία εισοδήματος', where:'ΑΑΔΕ'},
    {name:'Πίνακας αποπληρωμής τρέχοντος δανείου', where:'Τράπεζα'},
    {name:'Τίτλος ιδιοκτησίας', where:'Κτηματολόγιο'},
  ], tax_note:'Υπολόγισε το κόστος μεταφοράς και την ποινή πρόωρης αποπληρωμής στα σταθερά'},
}

// Το τυπικό εύρος επιτοκίου ενός τύπου δανείου, ως κείμενο.
//
// Ήταν χειρόγραφη συμβολοσειρά μέσα στα δεδομένα («2,60–3,80%»): δεύτερη πηγή
// μορφοποίησης, με δικό της κόμμα και δική της παύλα, δίπλα στον ΕΝΑ
// μορφοποιητή ποσοστού της εφαρμογής. Τώρα οι δύο άκρες είναι αριθμοί και το
// κείμενο βγαίνει από το fp(). Και γράφεται «από … έως …», όχι με παύλα: η
// παύλα σε θέση τιμής σημαίνει «δεν υπάρχει τιμή», όχι «εύρος».
export const rateRange = (t:{rate_from:number;rate_to:number}) => `${fp(t.rate_from)} έως ${fp(t.rate_to)}`

export const BORROWER_PROFILES: Record<BorrowerType,{label:string;income_ratio:number;notes:string;special:string;tax_benefits:string}> = {
  individual:  {label:'Μισθωτός',              income_ratio:0.35, notes:'Δόση ≤35% εισοδήματος', special:'', tax_benefits:'Απαλλαγή ΦΜΑ εάν πρώτη κατοικία'},
  professional:{label:'Ελεύθερος επαγγελματίας', income_ratio:0.40, notes:'2 χρόνια φορολογικά', special:'Μέση 2ετίας', tax_benefits:'Εκπιπτόμενες επαγγελματικές δαπάνες'},
  company:     {label:'Εταιρεία',              income_ratio:0.40, notes:'Ισολογισμοί και απόφαση διοικητικού συμβουλίου', special:'Εγγύηση φυσικού προσώπου', tax_benefits:'Πλήρης έκπτωση δαπανών δανείου'},
  young:       {label:'Νέος 25–40 ετών',       income_ratio:0.35, notes:'Σπίτι μου ΙΙ, πολύ χαμηλό', special:'Ηλικία 25–50', tax_benefits:'Απαλλαγή ΦΜΑ + Σπίτι μου ΙΙ'},
  family:      {label:'Οικογένεια/Πολύτεκνη', income_ratio:0.40, notes:'Συν-δανειολήπτες', special:'Τρίτεκνοι: επιδότηση επιτοκίου', tax_benefits:'Υψηλότερα όρια απαλλαγής ΦΜΑ'},
  senior:      {label:'50+ ετών',              income_ratio:0.30, notes:'Μέγιστη ηλικία 75', special:'Ηλικία+χρόνια ≤75', tax_benefits:'Κανονικοί συντελεστές'},
  military:    {label:'Ένοπλες Δυνάμεις',      income_ratio:0.40, notes:'Σταθερό εισόδημα, ευνοϊκή αξιολόγηση', special:'ΑΟΟΑ και Ταμείο Παρακαταθηκών και Δανείων', tax_benefits:'Ελεγξε τα προγράμματα του ΑΟΟΑ πριν την τράπεζα'},
  abroad:      {label:'Κάτοικος Εξωτερικού',   income_ratio:0.35, notes:'Επιπλέον έγγραφα', special:'Δάνειο προς αξία ≤70%', tax_benefits:'Εξαρτάται από χώρα'},
}

// Γλωσσάρι σε σωστά ελληνικά — ο ελληνικός όρος πρώτα, η διεθνής ονομασία μόνο
// σε παρένθεση όπου είναι ο επίσημος όρος. Το πεδίο level διαχωρίζει τους
// βασικούς όρους (για κάθε ιδιώτη) από τους προχωρημένους (για επαγγελματίες).
export const GLOSSARY: {term:string;def:string;level:'basic'|'advanced'}[] = [
  {term:'Δάνειο προς αξία',                       def:'Το ποσοστό του δανείου ως προς την αξία του ακινήτου. Παράδειγμα: 80% σημαίνει δάνειο 80% και ίδια κεφάλαια 20%. Χαμηλότερο ποσοστό οδηγεί σε καλύτερο επιτόκιο.', level:'basic'},
  {term:'Δείκτης δόσης προς εισόδημα',            def:'Το ποσοστό του μηνιαίου εισοδήματος που καλύπτει τη δόση. Ορια της Τράπεζας της Ελλάδος από 1/1/2025: έως 50% για όσους δανείζονται για πρώτη φορά, έως 40% για τους υπόλοιπους. Οι τράπεζες συχνά ζητούν χαμηλότερο.', level:'basic'},
  {term:'Τοκοχρεολύσιο',                          def:'Η μηνιαία δόση, που περιλαμβάνει κεφάλαιο και τόκο. Στην αρχή υπερισχύει ο τόκος· σταδιακά μεγαλώνει το μέρος του κεφαλαίου.', level:'basic'},
  {term:'Περιθώριο τράπεζας',                     def:'Το σταθερό ποσοστό που προσθέτει η τράπεζα πάνω από το Euribor στα κυμαινόμενα δάνεια, για όλη τη διάρκεια.', level:'basic'},
  {term:'Euribor',                                def:'Το βασικό διατραπεζικό επιτόκιο αναφοράς της ευρωζώνης. Στα κυμαινόμενα δάνεια το επιτόκιο διαμορφώνεται ως Euribor συν το περιθώριο της τράπεζας.', level:'basic'},
  {term:'Πιστοποιητικό Ενεργειακής Απόδοσης',     def:'Κατατάσσει ενεργειακά το ακίνητο, από Α+ (καλύτερο) έως Η. Απαιτείται για τη μεταβίβαση και για τα ενεργειακά προγράμματα.', level:'basic'},
  {term:'Φόρος Μεταβίβασης Ακινήτων',             def:'Φόρος 3% συν 3% υπέρ ΟΤΑ επί του φόρου, δηλαδή 3,09% συνολικά, επί της μεγαλύτερης μεταξύ τιμήματος και αντικειμενικής αξίας. Βαρύνει τον αγοραστή. Προβλέπεται απαλλαγή πρώτης κατοικίας εντός ορίων.', level:'basic'},
  {term:'Τειρεσίας',                              def:'Το σύστημα καταγραφής αθετήσεων πληρωμών. Οι τράπεζες τον ελέγχουν πριν εγκρίνουν το δάνειο.', level:'basic'},
  {term:'Αριθμός Ταυτότητας Ακινήτου',            def:'Ο μοναδικός κωδικός κάθε ακινήτου στο Κτηματολόγιο και την ΑΑΔΕ.', level:'advanced'},
  {term:'Σημείο απόσβεσης',                       def:'Οι μήνες που χρειάζονται ώστε η μηνιαία εξοικονόμηση από μια αναχρηματοδότηση να καλύψει τα έξοδα μεταφοράς του δανείου.', level:'advanced'},
  {term:'Περίοδος χάριτος',                       def:'Διάστημα, συνήθως 1 έως 2 έτη, όπου πληρώνεις μόνο τόκους χωρίς αποπληρωμή κεφαλαίου.', level:'advanced'},
  {term:'Σύμβαση Αποφυγής Διπλής Φορολογίας',     def:'Διακρατική σύμβαση ώστε το ίδιο εισόδημα να μη φορολογείται σε δύο χώρες. Αφορά κυρίως κατοίκους εξωτερικού.', level:'advanced'},
]

// ═══════════════════════════════════════════════════════════════════════════
// Διαχειριστές δανείων (servicers) & κόκκινα δάνεια — έντιμη, τεκμηριωμένη
// πληροφόρηση (όχι νομική/χρηματοοικονομική συμβουλή). Στοιχεία: Ιούλιος 2026.
// Πηγές: Υπ. Εθνικής Οικονομίας, ΕΓΔΙΧ (keyd.gov.gr), Τράπεζα Ελλάδος, ΕΕΔΑΔΠ.
// ═══════════════════════════════════════════════════════════════════════════
export const SERVICERS_GUIDE = {
  intro: 'Αν το δάνειό σου μεταβιβάστηκε σε εταιρεία απόκτησης απαιτήσεων (fund) και το διαχειρίζεται εταιρεία διαχείρισης (servicer), η νομική σου θέση δεν επιτρέπεται να χειροτερέψει από τη μεταβίβαση. Ο servicer πρέπει να είναι αδειοδοτημένος από την Τράπεζα Ελλάδος και δεσμεύεται από τον Κώδικα Δεοντολογίας: υποχρεώσεις διαφάνειας, ενημέρωσης και πρόταση βιώσιμης ρύθμισης πριν από κάθε αναγκαστική εκτέλεση.',
  rights: [
    { t: 'Η θέση σου δεν χειροτερεύει', d: 'Με τη μεταβίβαση της απαίτησης δεν επιτρέπεται μονομερής μεταβολή του επιτοκίου ή των όρων της σύμβασης εις βάρος σου. Ισχύουν τα ίδια δικαιώματα και ενστάσεις που είχες έναντι της τράπεζας.' },
    { t: 'Δικαίωμα σε βιώσιμη πρόταση ρύθμισης', d: 'Ο Κώδικας Δεοντολογίας της Τράπεζας Ελλάδος υποχρεώνει τον servicer να σου προτείνει κατάλληλη ρύθμιση βάσει της πραγματικής σου ικανότητας αποπληρωμής, πριν προχωρήσει σε πλειστηριασμό.' },
    { t: 'Πλήρης ενημέρωση και ανάλυση οφειλής', d: 'Δικαιούσαι αναλυτική κατάσταση κεφαλαίου, τόκων, εξόδων και του τρόπου υπολογισμού. Ζήτησέ την εγγράφως και έλεγξε παραγραφές και καταχρηστικές χρεώσεις.' },
    { t: 'Καταγγελία και εξωτερική προσφυγή', d: 'Αν ο servicer δεν τηρεί τις υποχρεώσεις του, υποβάλλεις καταγγελία πρώτα σε αυτόν και στη συνέχεια στην Τράπεζα Ελλάδος ή στον Συνήγορο του Καταναλωτή.' },
  ],
  tools: [
    { name: 'Εξωδικαστικός Μηχανισμός Ρύθμισης Οφειλών', d: 'Ηλεκτρονική πλατφόρμα (ΕΓΔΙΧ) που ρυθμίζει συνολικά οφειλές σε Δημόσιο, ΕΦΚΑ, τράπεζες και servicers. Δυνατότητα διαγραφής (κουρέματος) μέρους της οφειλής και αναστολή πλειστηριασμών/κατασχέσεων όσο τηρείται η ρύθμιση.', facts: ['Έως 240 δόσεις σε Δημόσιο/ΕΦΚΑ', 'Έως 420 δόσεις σε τράπεζες/servicers για φυσικά πρόσωπα με εμπράγματες εξασφαλίσεις', '240 δόσεις χωρίς ειδικά προνόμια · 180 για νομικά πρόσωπα'], url: 'https://www.keyd.gov.gr/ryumish_ofeilvn_ejvdik/' },
    { name: 'Ευάλωτοι οφειλέτες: υποχρεωτική αποδοχή', d: 'Για πιστοποιημένους ευάλωτους οφειλέτες (και ευάλωτους ΑμεΑ), η πρόταση αναδιάρθρωσης που παράγει η πλατφόρμα γίνεται υποχρεωτικά αποδεκτή από τράπεζες και Δημόσιο. Το πρόγραμμα «Κρατάμε το σπίτι μας» προβλέπει επιπλέον κούρεμα χρέους.', facts: ['Αυτόματη/υποχρεωτική αποδοχή για ευάλωτους', 'Πρόσθετο κούρεμα έως ~28% στο «Κρατάμε το σπίτι μας»'], url: 'https://minfin.gov.gr/diacheirisi-idiotikou-xreous/rythmisi-ofeilon/exodikastikos-michanismos-rythmisis-ofeilon/' },
    { name: 'Φορέας Απόκτησης και Επαναμίσθωσης Ακινήτων', d: 'Για ευάλωτους οφειλέτες που κινδυνεύουν να χάσουν την πρώτη κατοικία: ο Φορέας αποκτά το ακίνητο και το επαναμισθώνει υποχρεωτικά στον οφειλέτη για 12 έτη, με δικαίωμα επαναγοράς στην τρέχουσα εμπορική αξία.', facts: ['Έναρξη λειτουργίας: φθινόπωρο 2026', 'Επαναμίσθωση 12 ετών · δικαίωμα επαναγοράς', 'Στοχεύει ~15.000 νοικοκυριά'], url: 'https://minfin.gov.gr/diacheirisi-idiotikou-xreous/' },
  ],
  redFlags: [
    'Πληρωμή «έναντι» χωρίς έγγραφη ρύθμιση: ζήτησε πάντα την πλήρη σύμβαση ρύθμισης πριν πληρώσεις.',
    'Παραίτηση από ενστάσεις ή αναγνώριση οφειλής: μη υπογράφεις δήλωση που παραιτείται από παραγραφές ή δικαιώματα χωρίς νομικό έλεγχο.',
    'Ρύθμιση με χαμηλή αρχική δόση αλλά «μπαλόνι» στο τέλος (balloon): έλεγξε το συνολικό κόστος, όχι μόνο την πρώτη δόση.',
    'Πίεση για γρήγορη υπογραφή: έχεις δικαίωμα χρόνου μελέτης και εξωτερικής συμβουλής.',
  ],
  sources: [
    { label: 'ΕΓΔΙΧ: Εξωδικαστικός μηχανισμός', sub: 'Ειδική Γραμματεία Διαχείρισης Ιδιωτικού Χρέους', url: 'https://www.keyd.gov.gr/ryumish_ofeilvn_ejvdik/' },
    { label: 'Υπ. Εθνικής Οικονομίας: Ρύθμιση οφειλών', sub: 'Επίσημο πλαίσιο, δόσεις, κριτήρια', url: 'https://minfin.gov.gr/diacheirisi-idiotikou-xreous/rythmisi-ofeilon/exodikastikos-michanismos-rythmisis-ofeilon/' },
    { label: 'Μητρώο διαχειριστών: Τράπεζα Ελλάδος', sub: 'Κατάλογος αδειοδοτημένων εταιρειών διαχείρισης και Κώδικας Δεοντολογίας', url: 'https://www.bankofgreece.gr/kyria-themata/epopteia/epopteuomena-idrymata/etaireies-diaxeirisis-apaitiseon' },
    { label: 'Ένωση Εταιρειών Διαχείρισης (ΕΕΔΑΔΠ)', sub: 'Πληροφορίες κλάδου servicers', url: 'https://eedadp.com/' },
    { label: 'Συνήγορος του Καταναλωτή', sub: 'Ανεξάρτητη αρχή, εξωδικαστική επίλυση διαφορών', url: 'https://www.synigoroskatanaloti.gr' },
  ],
}

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

// Κοινή πηγή αλήθειας (lib/billing/greekTax), ώστε ο φόρος να μη διαφέρει ανά καρτέλα.
export function calcRentalTax(annualRental:number):number {
  return rentalIncomeTax(annualRental)
}

/** Φορολογητέο ενοίκιο μετά την τεκμαρτή έκπτωση — ΜΙΑ πηγή για το 5% και τον όρο του. */
export function taxableRental(annualRental:number, rentsPaidViaBank=true):number {
  return Math.max(0, annualRental) * (1 - presumptiveDeductionRate(rentsPaidViaBank))
}

export const fmtEur=(n:number)=>fe(n)
export const fmtPct=(n:number)=>`${fp(n)}`
export const fmtPct1=(n:number)=>`${fp(n)}`