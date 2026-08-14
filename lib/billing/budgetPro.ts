import { cents } from '@/lib/core/money'
// lib/billing/budgetPro.ts
// Καθαρές, ελεγχόμενες συναρτήσεις προϋπολογισμού. Χωρίς I/O — η UI τροφοδοτεί
// πραγματικά ποσά.
//
// ΤΙ ΑΦΑΙΡΕΘΗΚΕ ΚΑΙ ΓΙΑΤΙ: οι «κουμπαράδες» (reservePlan, savingsSchedule,
// recommendedReserves, safeToDistribute, allocate). Ήταν εργαλεία ΑΠΟΤΑΜΙΕΥΣΗΣ
// σε προϊόν διαχείρισης ακινήτου. Ο ιδιοκτήτης δεν ήρθε εδώ για κουμπαρά· ήρθε
// για δαπάνες, φόρους, ενοίκια και λογιστική. Κάθε λειτουργία που δεν απαντά σε
// αυτά είναι μια επιπλέον οθόνη που πρέπει να μάθει και να αγνοήσει.

const r0 = (n: number) => Math.round(n)



// ── B4 · Rollover: αδιάθετο μεταφέρεται μπροστά· υπέρβαση μειώνει την επόμενη ──
export interface Rollover { available: number; carryOut: number }
export function rolloverNext(budget: number, actual: number, carryIn = 0): Rollover {
  const available = (budget || 0) + (carryIn || 0)
  return { available: r0(available), carryOut: r0(available - (actual || 0)) }
}

// ── B1 · Waterfall εσόδου βραχυχρόνιας μίσθωσης (μεικτό → καθαρό) ─────────────
export interface StrWaterfallInput {
  gross: number
  platformFeePct: number      // προμήθεια πλατφόρμας (~15%)
  nights: number
  climateFeePerNight: number   // τέλος ανθεκτικότητας ανά διανυκτέρευση
  cleaningFee: number
  managementPct: number        // αμοιβή co-host/διαχείρισης επί μεικτού
  incomeTaxPct: number         // οριακός συντελεστής για κράτηση φόρου
}
export interface StrWaterfall {
  gross: number; platformFee: number; climateFee: number; cleaning: number
  management: number; taxReserve: number; net: number; netPerNight: number; marginPct: number
}
/**
 * Το μέρος του ακαθάριστου που φορολογείται: τεκμαρτή έκπτωση 5% (άρθρο 39 §4).
 * Ίδια παραδοχή με το lib/tax/shortTermTax.ts, ώστε οι δύο οθόνες να μη
 * διαφωνούν — εκεί ζει και η εξαίρεση για είσπραξη με μετρητά.
 */
const TAXABLE_SHARE_OF_GROSS = 0.95

export function strWaterfall(i: StrWaterfallInput): StrWaterfall {
  const gross = Math.max(0, i.gross || 0)
  const platformFee = r0(gross * (i.platformFeePct || 0) / 100)
  const climateFee = r0((i.climateFeePerNight || 0) * (i.nights || 0))
  const management = r0(gross * (i.managementPct || 0) / 100)
  const cleaning = r0(Math.max(0, i.cleaningFee || 0))
  // ── Η ΠΡΟΜΗΘΕΙΑ ΤΗΣ ΠΛΑΤΦΟΡΜΑΣ ΔΕΝ ΜΕΙΩΝΕΙ ΤΟ ΔΗΛΩΤΕΟ ΕΙΣΟΔΗΜΑ ───────────
  // Εδώ γραφόταν `gross − platformFee − management` και μετά επίπεδος
  // συντελεστής. Η μηχανή της βραχυχρόνιας (lib/tax/shortTermTax.ts) φορολογεί
  // το ΑΚΑΘΑΡΙΣΤΟ με την τεκμαρτή έκπτωση 5%, και το γράφει ρητά στην κορυφή
  // της: «φόρος στα ακαθάριστα, δεν αφαιρούνται πρώτα τα έξοδα». Η προμήθεια
  // είναι δαπάνη, όχι μείωση εσόδου.
  //
  // Σε ακαθάριστα 20.000 € με προμήθεια 15%, η παλιά βάση έβγαζε κράτηση φόρου
  // 2.550 € αντί για 3.550 €: ο ιδιοκτήτης έβαζε στην άκρη χίλια ευρώ λιγότερα
  // από όσα θα χρειαστεί, και το «καθαρό» του waterfall ήταν ισόποσα αισιόδοξο.
  //
  // Το τεστ κατοχύρωνε τον λάθος τύπο· άλλαξε μαζί του.
  const taxableBase = Math.max(0, gross * TAXABLE_SHARE_OF_GROSS)
  const taxReserve = r0(taxableBase * (i.incomeTaxPct || 0) / 100)
  const net = r0(gross - platformFee - climateFee - cleaning - management - taxReserve)
  const netPerNight = (i.nights || 0) > 0 ? r0(net / i.nights) : net
  const marginPct = gross > 0 ? Math.round((net / gross) * 100) : 0
  return { gross, platformFee, climateFee, cleaning, management, taxReserve, net, netPerNight, marginPct }
}

// ── B7 · NOI / ταμειακή ροή / αποδόσεις (ο πίνακας του επενδυτή) ──────────────
// Το κεφάλαιο του δανείου ΔΕΝ είναι δαπάνη (μεταφορά ισολογισμού) — μόνο ο τόκος.
export interface InvestmentInput {
  annualIncome: number
  annualOpEx: number            // λειτουργικά (χωρίς δόση δανείου)
  annualLoanPayment: number     // συνολική δόση (κεφάλαιο + τόκος)
  purchasePrice: number
  equityInvested: number        // ίδια κεφάλαια (προκαταβολή + έξοδα)
}
export interface InvestmentReturns { noi: number; preTaxCashFlow: number; capRatePct: number; cashOnCashPct: number }
export function investmentReturns(i: InvestmentInput): InvestmentReturns {
  const noi = r0((i.annualIncome || 0) - (i.annualOpEx || 0))
  const preTaxCashFlow = r0(noi - (i.annualLoanPayment || 0))
  const capRatePct = (i.purchasePrice || 0) > 0 ? cents((noi / i.purchasePrice) * 100) : 0
  const cashOnCashPct = (i.equityInvested || 0) > 0 ? cents((preTaxCashFlow / i.equityInvested) * 100) : 0
  return { noi, preTaxCashFlow, capRatePct, cashOnCashPct }
}

// ── B3 · Συστάσεις αποθεματικών (κανόνες βέλτιστης πρακτικής) ─────────────────
// CapEx 8% νέο / 10% 15+ ετών / 15% 30+ ετών του ετήσιου ενοικίου (ή 1% της αξίας).

// ── ΑΦΑΙΡΕΘΗΚΕ: climateFeePerNight ─────────────────────────────────────────
// Επέστρεφε 1,50 €/νύχτα στην υψηλή περίοδο και 0,50 € στη χαμηλή. Η πηγή
// αλήθειας του τέλους ανθεκτικότητας είναι το lib/billing/greekTax.ts
// (CLIMATE_LEVY_STR_2025 / climateLevyRates): 8 € και 2 € για διαμέρισμα,
// 15 € και 4 € για μονοκατοικία άνω των 80 τ.μ.
//
// Δηλαδή αυτή η συνάρτηση υπολόγιζε το ΙΔΙΟ νόμιμο τέλος πέντε ως δέκα φορές
// μικρότερο. Το BillsBudget την καλούσε και τύπωνε «Τέλος ανθεκτικότητας» δίπλα
// στη Λογιστική που τύπωνε «Τέλος ανθεκτικότητας (ΤΑΚΚ)» από τη σωστή πηγή:
// 20 διανυκτερεύσεις τον Ιούλιο έδιναν 30 € στη μία οθόνη και 160 € στην άλλη.
//
// Δεν αντικαταστάθηκε με wrapper: το strWaterfall δέχεται ήδη τον συντελεστή ως
// όρισμα, οπότε ο καλών περνά climateLevyRates(sqm, isHouse) και δεν υπάρχει
// δεύτερο σημείο να ξαναδιαφωνήσει.

// ── Κατανομή εσόδου σε δεσμεύσεις/αποθεματικά/διαθέσιμο (για γράφημα «assign») ─
