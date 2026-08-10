// ═══════════════════════════════════════════════════════════════════════════
// Κόστος ΑΓΟΡΑΣ & ΠΩΛΗΣΗΣ ακινήτου στην Ελλάδα, δομημένη εκτίμηση (όχι επίσημη).
// Καθαρές συναρτήσεις. Τα ποσοστά είναι ΕΝΔΕΙΚΤΙΚΑ (ισχύον πλαίσιο) και τα ακριβή
// ποσά ορίζονται από συμβολαιογράφο/δικηγόρο/ΑΑΔΕ, το UI το δηλώνει ρητά.
//
// ΑΓΟΡΑ: φόρος μεταβίβασης 3,09% (3% + 3% υπέρ δήμου) επί της ΜΕΓΑΛΥΤΕΡΗΣ αξίας
//   (τίμημα ή αντικειμενική)· για ΝΕΟΔΜΗΤΑ από κατασκευαστή με άδεια από 1/1/2006
//   οφείλεται ΦΠΑ 24% αντί ΦΜΑ, σε ΑΝΑΣΤΟΛΗ (οπότε 3,09% ΦΜΑ). Πρώτη κατοικία:
//   απαλλαγή ΦΜΑ έως όριο αξίας. Επιπλέον: συμβολαιογραφικά, δικηγόρος (προαιρετικός),
//   μεσιτική αμοιβή, τέλη Κτηματολογίου, πιστοποιητικά.
// ΠΩΛΗΣΗ: μεσιτική αμοιβή, ΠΕΑ, ταυτότητα κτιρίου (μηχανικός), φόρος υπεραξίας 15%
//   (σε ΑΝΑΣΤΟΛΗ), και καθαρό τίμημα μετά τα κόστη.
// ═══════════════════════════════════════════════════════════════════════════

import { fe } from '../core/format';

const round2 = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
const pos = (n: number): number => Math.max(0, round2(n))
const VAT = 0.24 // ΦΠΑ υπηρεσιών (συμβολαιογράφος/μεσίτης/δικηγόρος)

// ── Συντελεστές (ενδεικτικοί, ισχύον πλαίσιο) ──────────────────────────────
export const TRANSFER_TAX_RATE = 0.0309       // ΦΜΑ 3% + 3% υπέρ δήμου
export const NEW_BUILD_VAT_RATE = 0.24        // ΦΠΑ νεόδμητων (σε αναστολή)
export const CADASTRE_RATE = 0.005            // αναλογικό τέλος Κτηματολογίου 5‰ (ΚΥΑ ΦΕΚ Β'64/13-1-2026)· +1‰ σε περιοχές με ενεργό κτηματολογικό βιβλίο
export const CADASTRE_FIXED = 20              // πάγιο τέλος εγγραφής (ενδεικτικό)
export const AGENT_RATE_DEFAULT = 0.02        // μεσιτική αμοιβή (ανά πλευρά)
export const CAPITAL_GAINS_RATE = 0.15        // φόρος υπεραξίας (σε αναστολή)
// Απαλλαγή πρώτης κατοικίας (όρια αντικειμενικής αξίας, αγορά κατοικίας, ν.1078/1980).
export const FIRST_HOME_EXEMPTION_SINGLE = 200000
export const FIRST_HOME_EXEMPTION_MARRIED = 250000
export const FIRST_HOME_EXEMPTION_CHILD_FIRST_TWO = 25000  // +25.000 € για καθένα από τα 2 πρώτα τέκνα
export const FIRST_HOME_EXEMPTION_CHILD_THIRD_PLUS = 30000 // +30.000 € για το 3ο και κάθε επόμενο
// Πάγια κόστη πιστοποιητικών/τεχνικών (ενδεικτικά).
export const PEA_COST = 150                    // Πιστοποιητικό Ενεργειακής Απόδοσης
export const BUILDING_ID_COST = 400            // ταυτότητα κτιρίου / βεβαιώσεις μηχανικού
export const CERTS_COST = 400                  // λοιπά πιστοποιητικά/παράβολα

export interface TransferInput {
  side: 'buy' | 'sell'
  /** Τίμημα συναλλαγής. */
  price: number
  /** Αντικειμενική αξία (βάση φόρου), default = τίμημα. Ο φόρος στη μεγαλύτερη. */
  objectiveValue?: number
  /** Νεόδμητο από κατασκευαστή (ΦΠΑ αντί ΦΜΑ). */
  newBuild?: boolean
  /** Ισχύει η αναστολή ΦΠΑ νεόδμητων; default true (τότε επιβάλλεται ΦΜΑ). */
  vatSuspended?: boolean
  /** Πρώτη κατοικία (απαλλαγή ΦΜΑ έως όριο). */
  firstHome?: boolean
  /** Έγγαμος (μεγαλύτερο όριο απαλλαγής). */
  married?: boolean
  /** Προστατευόμενα τέκνα (προσαύξηση ορίου απαλλαγής). */
  children?: number
  /** Χρήση μεσίτη (αμοιβή + ΦΠΑ). */
  useAgent?: boolean
  agentRatePct?: number
  /** Χρήση δικηγόρου (προαιρετικός πλέον). */
  useLawyer?: boolean
  lawyerRatePct?: number
  // ── Μόνο για ΠΩΛΗΣΗ (υπεραξία) ──
  /** Κόστος κτήσης (για υπεραξία). */
  acquisitionCost?: number
  /** Ενεργός φόρος υπεραξίας; default false (σε αναστολή). */
  capitalGainsActive?: boolean
}

export interface CostLine {
  key: string
  label: string
  amount: number
  note?: string
}

export interface TransferResult {
  side: 'buy' | 'sell'
  price: number
  lines: CostLine[]
  /** Σύνολο εξόδων/φόρων (εκτός τιμήματος). */
  totalCosts: number
  /** Ποσοστό εξόδων επί τιμήματος. */
  costPct: number
  /** Αγορά: συνολική εκταμίευση (τίμημα + κόστη)· Πώληση: καθαρό έσοδο (τίμημα − κόστη). */
  cashOut?: number
  netProceeds?: number
}

function firstHomeExemption(input: TransferInput): number {
  const base = input.married ? FIRST_HOME_EXEMPTION_MARRIED : FIRST_HOME_EXEMPTION_SINGLE
  const kids = Math.max(0, Math.floor(input.children ?? 0))
  // +25.000 € για καθένα από τα δύο πρώτα τέκνα, +30.000 € για το τρίτο και κάθε επόμενο.
  const firstTwo = Math.min(kids, 2) * FIRST_HOME_EXEMPTION_CHILD_FIRST_TWO
  const rest = Math.max(0, kids - 2) * FIRST_HOME_EXEMPTION_CHILD_THIRD_PLUS
  return base + firstTwo + rest
}

/** Δομημένη εκτίμηση κόστους αγοράς ή πώλησης. */
export function transferCosts(input: TransferInput): TransferResult {
  const price = pos(input.price)
  const taxBase = Math.max(price, pos(input.objectiveValue ?? price))
  const lines: CostLine[] = []

  if (input.side === 'buy') {
    // Φόρος μεταβίβασης ή ΦΠΑ νεόδμητου.
    const vatApplies = !!input.newBuild && input.vatSuspended === false
    if (vatApplies) {
      lines.push({ key: 'vat', label: 'ΦΠΑ νεόδμητου (24%)', amount: round2(taxBase * NEW_BUILD_VAT_RATE), note: 'Αντί φόρου μεταβίβασης, για νεόδμητα από κατασκευαστή.' })
    } else {
      const exemption = input.firstHome ? firstHomeExemption(input) : 0
      const taxable = Math.max(0, taxBase - exemption)
      lines.push({ key: 'transferTax', label: 'Φόρος μεταβίβασης (3,09%)', amount: round2(taxable * TRANSFER_TAX_RATE),
        note: input.firstHome ? `Μετά απαλλαγή πρώτης κατοικίας έως ${fe(Math.round(exemption))}.` : 'Επί της μεγαλύτερης μεταξύ τιμήματος και αντικειμενικής.' })
    }
    // Συμβολαιογραφικά (κλιμακωτά ~0,8% + ΦΠΑ), δικηγόρος, μεσίτης, Κτηματολόγιο, πιστοποιητικά.
    lines.push({ key: 'notary', label: 'Συμβολαιογραφικά', amount: round2(taxBase * 0.008 * (1 + VAT)), note: 'Ενδεικτικά ~0,8% + ΦΠΑ (κλιμακωτά).' })
    if (input.useLawyer) lines.push({ key: 'lawyer', label: 'Δικηγόρος', amount: round2(taxBase * ((input.lawyerRatePct ?? 0.5) / 100) * (1 + VAT)), note: 'Προαιρετικός, έλεγχος τίτλων/βαρών.' })
    if (input.useAgent) lines.push({ key: 'agent', label: 'Μεσιτική αμοιβή', amount: round2(price * ((input.agentRatePct ?? AGENT_RATE_DEFAULT * 100) / 100) * (1 + VAT)), note: 'Ενδεικτικά 2% + ΦΠΑ.' })
    lines.push({ key: 'cadastre', label: 'Τέλη Κτηματολογίου', amount: round2(taxBase * CADASTRE_RATE + CADASTRE_FIXED), note: 'Αναλογικό 5‰ + πάγιο (ΦΕΚ Β\'64/2026). Σε περιοχές με ενεργό κτηματολόγιο ~6‰.' })
    lines.push({ key: 'certs', label: 'Πιστοποιητικά και παράβολα', amount: CERTS_COST, note: 'Ενδεικτικό πάγιο.' })

    const totalCosts = round2(lines.reduce((s, l) => s + l.amount, 0))
    return { side: 'buy', price, lines, totalCosts, costPct: price > 0 ? totalCosts / price : 0, cashOut: round2(price + totalCosts) }
  }

  // ── Πώληση ──
  if (input.useAgent) lines.push({ key: 'agent', label: 'Μεσιτική αμοιβή', amount: round2(price * ((input.agentRatePct ?? AGENT_RATE_DEFAULT * 100) / 100) * (1 + VAT)), note: 'Ενδεικτικά 2% + ΦΠΑ.' })
  lines.push({ key: 'pea', label: 'Πιστοποιητικό ενεργειακής απόδοσης (ΠΕΑ)', amount: PEA_COST, note: 'Υποχρεωτικό στην πώληση.' })
  lines.push({ key: 'buildingId', label: 'Ταυτότητα κτιρίου / βεβαιώσεις μηχανικού', amount: BUILDING_ID_COST, note: 'Ενδεικτικό, από μηχανικό.' })
  if (input.useLawyer) lines.push({ key: 'lawyer', label: 'Δικηγόρος', amount: round2(price * ((input.lawyerRatePct ?? 0.5) / 100) * (1 + VAT)), note: 'Προαιρετικός.' })
  // Φόρος υπεραξίας 15%, σε αναστολή (default 0, με σημείωση).
  const gain = Math.max(0, price - pos(input.acquisitionCost ?? 0))
  const cgtActive = !!input.capitalGainsActive
  lines.push({ key: 'capitalGains', label: 'Φόρος υπεραξίας (15%)', amount: cgtActive ? round2(gain * CAPITAL_GAINS_RATE) : 0,
    note: cgtActive ? `Επί υπεραξίας ${fe(Math.round(gain))}.` : 'Σε αναστολή, δεν επιβαρύνει επί του παρόντος.' })

  const totalCosts = round2(lines.reduce((s, l) => s + l.amount, 0))
  return { side: 'sell', price, lines, totalCosts, costPct: price > 0 ? totalCosts / price : 0, netProceeds: round2(price - totalCosts) }
}
