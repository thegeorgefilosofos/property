// ═══════════════════════════════════════════════════════════════════════════
// ΕΝΟΠΟΙΗΜΕΝΟΣ ΦΟΡΟΣ ΕΝΟΙΚΙΩΝ — σε επίπεδο ΦΟΡΟΛΟΓΟΥΜΕΝΟΥ, όχι ανά ακίνητο.
// ---------------------------------------------------------------------------
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ ΑΥΤΟ ΤΟ ΑΡΧΕΙΟ. Η κλίμακα του άρθρου 40 ΚΦΕ (15/25/35/45) είναι
// ΠΡΟΟΔΕΥΤΙΚΗ ΣΤΟ ΣΥΝΟΛΟ των ενοικίων που δηλώνει ο φορολογούμενος στο Ε1 — δεν
// υπάρχει «φόρος ακινήτου». Ο ιδιοκτήτης τριών διαμερισμάτων με 8.000 € έκαστο
// ΔΕΝ πληρώνει τρεις φορές τον φόρο των 8.000 €: πληρώνει έναν φόρο στα 24.000 €.
// Η ανά-ακίνητο πρόσθεση υποεκτιμά τον φόρο, και μάλιστα σιωπηλά, γιατί κάθε
// ακίνητο ξαναρχίζει από το πρώτο κλιμάκιο του 15%.
//
// Η σωστή λογική ζούσε σε ΜΙΑ οθόνη (Λογιστική). Εδώ εξάγεται ώστε να τη
// μοιράζονται ΟΛΕΣ (Επισκόπηση, Αποδόσεις, Σύγκριση, Δάνειο) — χωρίς αντίγραφο:
// τα σύνολα και ο επιμερισμός προέρχονται από το `consolidateIndividual` του
// lib/accounting/statement.ts, που με τη σειρά του καλεί το lib/billing/greekTax.
//
// ΜΙΑ πηγή αλήθειας και για τον κανόνα της τεκμαρτής έκπτωσης 5%: από 1/1/2026
// (ν.5246/2025) προϋποθέτει είσπραξη μέσω τραπέζης. Το ποσοστό και το κείμενο
// ζουν εδώ, ώστε καμία καρτέλα να μη λέει πια «αυτόματη έκπτωση».
// ═══════════════════════════════════════════════════════════════════════════

import { rentalIncomeTax, marginalRate, type TaxBracket } from './greekTax'
import {
  consolidateIndividual, PRESUMPTIVE_DEDUCTION_RATE,
  type StatementInput, type TaxRegime,
} from '@/lib/accounting/statement'
import { centsOr0 } from '@/lib/core/money'



/** Τεκμαρτή έκπτωση φυσικού προσώπου: 5% ΜΟΝΟ με τραπεζική είσπραξη (από 1/1/2026). */
export function presumptiveDeductionRate(rentsPaidViaBank = true): number {
  return rentsPaidViaBank ? PRESUMPTIVE_DEDUCTION_RATE : 0
}

/** Το κείμενο του κανόνα, ίδιο σε κάθε οθόνη. ΔΕΝ είναι «αυτόματη» έκπτωση. */
export const PRESUMPTIVE_RULE_2026 =
  'Τεκμαρτή έκπτωση 5% για επισκευές/συντήρηση, χωρίς παραστατικά. Από 1/1/2026 (ν.5246/2025) προϋποθέτει είσπραξη του ενοικίου μέσω τραπέζης· με μετρητά χάνεται και ο φόρος υπολογίζεται στο 100% του ενοικίου.'

/** Γιατί ο φόρος δεν είναι «ανά ακίνητο» — το ίδιο λεκτικό σε κάθε οθόνη. */
export const CONSOLIDATION_NOTE =
  'Ο φόρος εισοδήματος από ενοίκια είναι προοδευτικός στο ΣΥΝΟΛΟ των ακινήτων σου (Ε1), όχι ανά ακίνητο. Υπολογίζεται μία φορά στο άθροισμα και επιμερίζεται εδώ κατ’ αναλογία του φορολογητέου κάθε ακινήτου.'

/** Ένα ακίνητο ως πηγή εισοδήματος για την ενοποίηση. */
export interface RentSource {
  id: string
  /** Ετήσιο ΜΕΙΚΤΟ ενοίκιο (δεδουλευμένο) ή μεικτά έσοδα βραχυχρόνιας. */
  annualRent: number
  /** Βραχυχρόνια μίσθωση; (ίδια κλίμακα, διαφορετικά τέλη — δες statement.ts). */
  shortTerm?: boolean
  /** Εισπράττεται μέσω τραπέζης; Default true. */
  rentsPaidViaBank?: boolean
}

export interface ConsolidatedShare {
  id: string
  annualRent: number
  /** Φορολογητέο του ακινήτου (μεικτά μείον τεκμαρτή έκπτωση). */
  taxableIncome: number
  /** Το μερίδιό του από τον ΕΝΑ φόρο του φορολογούμενου. */
  taxShare: number
  /** Τι θα έδειχνε ο ΛΑΘΟΣ ανά-ακίνητο υπολογισμός (μόνο για σύγκριση/επεξήγηση). */
  standaloneTax: number
}

export interface ConsolidatedRentTax {
  /** Πόσα ακίνητα έχουν πραγματικό εισόδημα (μόνο αυτά μπαίνουν στην κλίμακα). */
  count: number
  totalAnnualRent: number
  totalTaxable: number
  /** Ο ΕΝΑΣ προοδευτικός φόρος του φορολογούμενου. */
  totalTax: number
  /** Μέσος συντελεστής επί των μεικτών. */
  effectiveRate: number
  /** Οριακός συντελεστής στο συνολικό φορολογητέο (τι κοστίζει το επόμενο ευρώ). */
  marginalRate: number
  perProperty: ConsolidatedShare[]
  /** Άθροισμα των ανά-ακίνητο φόρων — η μέθοδος που καταργείται. */
  sumOfStandaloneTax: number
  /** Πόσο υποεκτιμούσε η ανά-ακίνητο μέθοδος (≥ 0). */
  understatement: number
}

const regimeOf = (s: RentSource): TaxRegime =>
  s.shortTerm ? 'individual_shortterm' : 'individual_longterm'

/**
 * Ο φόρος του φορολογούμενου από ΟΛΑ τα ακίνητα, με επιμερισμό ανά ακίνητο.
 * Τα ακίνητα χωρίς εισόδημα επιστρέφονται με μηδενικό μερίδιο (δεν αλλοιώνουν
 * την κλίμακα, αλλά ούτε εξαφανίζονται από την οθόνη που τα εμφανίζει).
 */
export function consolidateRentTax(items: RentSource[], brackets?: TaxBracket[]): ConsolidatedRentTax {
  const earning = items.filter(i => (Number(i.annualRent) || 0) > 0)
  const empty: ConsolidatedRentTax = {
    count: 0, totalAnnualRent: 0, totalTaxable: 0, totalTax: 0,
    effectiveRate: 0, marginalRate: 0,
    perProperty: items.map(i => ({ id: i.id, annualRent: 0, taxableIncome: 0, taxShare: 0, standaloneTax: 0 })),
    sumOfStandaloneTax: 0, understatement: 0,
  }
  if (!earning.length) return empty

  // ΔΕΝ ξαναγράφουμε την ενοποίηση: τη ζητάμε από τη μηχανή της Λογιστικής.
  const con = consolidateIndividual(earning.map(i => ({
    id: i.id,
    input: {
      regime: regimeOf(i),
      grossIncome: Number(i.annualRent) || 0,
      rentsPaidViaBank: i.rentsPaidViaBank !== false,
    } satisfies StatementInput,
  })), brackets)

  const byId = new Map(con.perProperty.map(p => [p.id, p]))
  const perProperty: ConsolidatedShare[] = items.map(i => {
    const hit = byId.get(i.id)
    if (!hit) return { id: i.id, annualRent: 0, taxableIncome: 0, taxShare: 0, standaloneTax: 0 }
    return {
      id: i.id,
      annualRent: hit.statement.grossIncome,
      taxableIncome: hit.statement.taxableIncome,
      taxShare: hit.taxShare,
      standaloneTax: centsOr0(rentalIncomeTax(hit.statement.taxableIncome, brackets)),
    }
  })

  const sumOfStandaloneTax = centsOr0(perProperty.reduce((s, p) => s + p.standaloneTax, 0))
  return {
    count: earning.length,
    totalAnnualRent: con.grossIncome,
    totalTaxable: con.taxableIncome,
    totalTax: con.incomeTax,
    effectiveRate: con.effectiveRate,
    marginalRate: marginalRate(con.taxableIncome, brackets),
    perProperty,
    sumOfStandaloneTax,
    understatement: centsOr0(Math.max(0, con.incomeTax - sumOfStandaloneTax)),
  }
}

/** Το μερίδιο φόρου ενός ακινήτου μέσα στο χαρτοφυλάκιο (0 αν δεν έχει εισόδημα). */
export function taxShareOf(result: ConsolidatedRentTax, id: string): number {
  return result.perProperty.find(p => p.id === id)?.taxShare ?? 0
}

/**
 * Σύντομη, ειλικρινής εξήγηση για κάτω από τον αριθμό: πόσα ακίνητα, πόσο το
 * σύνολο, πόσος ο ένας φόρος. Με ένα ακίνητο δεν υπάρχει τίποτα να εξηγηθεί.
 */
export function consolidationSummary(result: ConsolidatedRentTax, fmtEur: (n: number) => string): string | null {
  if (result.count < 2) return null
  return `Υπολογισμένος στο σύνολο ${result.count} ακινήτων (${fmtEur(Math.round(result.totalAnnualRent))} ενοίκια, φόρος ${fmtEur(Math.round(result.totalTax))}) και επιμερισμένος κατ’ αναλογία. Η πρόσθεση ανά ακίνητο θα έδειχνε ${fmtEur(Math.round(result.sumOfStandaloneTax))}, δηλαδή ${fmtEur(Math.round(result.understatement))} λιγότερα.`
}
