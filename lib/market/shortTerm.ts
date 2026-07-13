// ═══════════════════════════════════════════════════════════════════════════
// ΕΚΤΙΜΗΤΗΣ ΒΡΑΧΥΧΡΟΝΙΑΣ (Airbnb) — πληρότητα × τιμή/νύχτα − κόστη − ΤΑΚΚ −
// τέλος παρεπιδημούντων. Καθαρές συναρτήσεις· επαναχρησιμοποιεί τις πηγές αλήθειας
// για ΤΑΚΚ και τέλος παρεπιδημούντων (lib/billing/greekTax).
// ═══════════════════════════════════════════════════════════════════════════
import { CLIMATE_LEVY_STR_2025, municipalAccommodationTax } from '@/lib/billing/greekTax'

const num = (n: number): number => (Number.isFinite(n) ? n : 0)
const max0 = (n: number): number => Math.max(0, num(n))
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, num(n)))
const round2 = (n: number): number => Math.round(num(n) * 100) / 100

export interface ShortTermInput {
  occupancyPct: number       // ετήσια πληρότητα (0–100)
  adr: number                // μέση τιμή ανά νύχτα (€)
  avgNightsPerStay?: number  // μέση διάρκεια διαμονής (default 4)
  cleaningPerStay?: number   // κόστος καθαρισμού ανά διαμονή (€)
  platformFeePct?: number    // προμήθεια πλατφόρμας % (default 15)
  sqm?: number | null
  isHouse?: boolean
  propertyCount?: number     // αριθμός ακινήτων (για εξαίρεση παρεπιδημούντων)
  individual?: boolean       // φυσικό πρόσωπο;
  highSeasonShare?: number   // ποσοστό νυχτών σε υψηλή περίοδο (default 0.6)
}
export interface ShortTermResult {
  nights: number
  grossRevenue: number
  platformFees: number
  cleaning: number
  climateLevy: number        // ΤΑΚΚ
  municipalTax: number       // τέλος παρεπιδημούντων
  netRevenue: number         // πριν τον φόρο εισοδήματος
  netPerNight: number
}

/** Ετήσια εκτίμηση εσόδων/καθαρών βραχυχρόνιας από πληρότητα & τιμή/νύχτα. */
export function shortTermEstimate(i: ShortTermInput): ShortTermResult {
  const occ = clamp(i.occupancyPct, 0, 100) / 100
  const nights = Math.round(365 * occ)
  const adr = max0(i.adr)
  const grossRevenue = nights * adr
  const platformFees = grossRevenue * clamp(i.platformFeePct ?? 15, 0, 100) / 100
  const avgN = (i.avgNightsPerStay && i.avgNightsPerStay > 0) ? i.avgNightsPerStay : 4
  const stays = avgN > 0 ? nights / avgN : 0
  const cleaning = stays * max0(i.cleaningPerStay ?? 0)
  // ΤΑΚΚ: υψηλή/χαμηλή περίοδος, ανά τύπο (μονοκατοικία >80τ.μ. στο υψηλό κλιμάκιο).
  const rate = (i.isHouse && (i.sqm ?? 0) > 80) ? CLIMATE_LEVY_STR_2025.large : CLIMATE_LEVY_STR_2025.small
  const hs = clamp(i.highSeasonShare ?? 0.6, 0, 1)
  const climateLevy = nights * hs * rate.high + nights * (1 - hs) * rate.low
  const municipalTax = municipalAccommodationTax(grossRevenue, { sqm: i.sqm, isHouse: i.isHouse, propertyCount: i.propertyCount, individual: i.individual })
  const netRevenue = grossRevenue - platformFees - cleaning - climateLevy - municipalTax
  return {
    nights, grossRevenue: round2(grossRevenue), platformFees: round2(platformFees), cleaning: round2(cleaning),
    climateLevy: round2(climateLevy), municipalTax: round2(municipalTax), netRevenue: round2(netRevenue),
    netPerNight: nights > 0 ? round2(netRevenue / nights) : 0,
  }
}

// ── Ρεαλιστική μέση τιμή/νύχτα ανά μέγεθος & τύπο ────────────────────────────
// Το ADR κλιμακώνεται ΥΠΟΓΡΑΜΜΙΚΑ με το μέγεθος (μεγαλύτερο ακίνητο δεν σημαίνει
// ανάλογα υψηλότερη τιμή/νύχτα), ώστε η μεικτή απόδοση να μένει ρεαλιστική αντί να
// «εκτοξεύεται» όταν ένα μικρό/φθηνό ακίνητο πάρει την τυπική τιμή της ζώνης.
// Βαθμονομημένο ώστε ένα διαμέρισμα στα REF_SQM=55 τ.μ. να δίνει ακριβώς το ADR
// αναφοράς της περιοχής (που αναπαράγει το πραγματικό ετήσιο έσοδο).
const REF_SQM = 55
const ADR_SIZE_EXP = 0.9
const TYPE_MULT: Record<string, number> = {
  studio: 0.9, apartment: 1, maisonette: 1.1, house: 1.15, villa: 1.35, other: 1,
}
/** Άνω κατώφλι μεικτής βραχυχρόνιας απόδοσης: πάνω από αυτό, η αξία ή η τιμή/νύχτα
 *  είναι πιθανότατα μη ρεαλιστική. Οι ισχυρές τουριστικές αγορές (Κρήτη, Ρόδος) μπορεί
 *  όντως να ξεπερνούν το 15%· πάνω από 18% η ένδειξη είναι σχεδόν πάντα σφάλμα εισαγωγής. */
export const MAX_ST_GROSS_YIELD_WARN = 18

/** Ρεαλιστική μέση τιμή/νύχτα για ακίνητο δεδομένου μεγέθους/τύπου, με βάση το ADR
 *  αναφοράς της ζώνης. Κουμπώνει το αποτέλεσμα σε [0,5×, 2,2×] του τυπικού. */
export function adrReference(typicalAdr: number, sqm?: number | null, propType?: string | null): number {
  const base = max0(typicalAdr)
  if (base <= 0) return 0
  const s = (sqm && sqm > 0) ? sqm : REF_SQM
  const sizeFactor = clamp(Math.pow(s / REF_SQM, ADR_SIZE_EXP), 0.5, 2.2)
  const mult = TYPE_MULT[(propType || 'apartment').toLowerCase()] ?? 1
  return Math.round(base * sizeFactor * mult)
}

/**
 * Πληρότητα (%) στην οποία τα ΚΑΘΑΡΑ έσοδα βραχυχρόνιας ισοφαρίζουν έναν στόχο
 * (π.χ. τα καθαρά της μακροχρόνιας). Επιστρέφει 0–100 (ή >100 αν ανέφικτο).
 */
export function breakEvenOccupancy(targetNetAnnual: number, params: Omit<ShortTermInput, 'occupancyPct'>): number {
  // Το καθαρό ανά νύχτα είναι ~σταθερό ως προς την πληρότητα → γραμμική λύση.
  const probe = shortTermEstimate({ ...params, occupancyPct: 70 })
  const netPerNight = probe.netPerNight
  if (netPerNight <= 0) return Infinity
  const neededNights = max0(targetNetAnnual) / netPerNight
  return round2((neededNights / 365) * 100)
}
