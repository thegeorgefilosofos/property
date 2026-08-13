// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΕΥΡΩΠΑΪΚΟ ΜΗΤΡΩΟ ΕΝΕΡΓΕΙΑΚΩΝ ΕΤΙΚΕΤΩΝ (EPREL) ΣΥΜΠΛΗΡΩΝΕΙ ΤΗΝ ΚΑΡΤΕΛΑ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΕΙΝΑΙ ΤΟ EPREL. Δημόσιο μητρώο της Ευρωπαϊκής Επιτροπής όπου ΚΑΘΕ συσκευή
// που πουλιέται στην ΕΕ είναι υποχρεωμένη να είναι καταχωρισμένη από τον ίδιο
// τον κατασκευαστή, με τα νούμερα της ενεργειακής της ετικέτας. Κάθε ετικέτα
// φέρει QR που οδηγεί στη σελίδα της συσκευής:
//
//     https://eprel.ec.europa.eu/screen/product/washingmachines2019/2516037
//
// ── ΓΙΑΤΙ ΑΞΙΖΕΙ ─────────────────────────────────────────────────────────
// Η κατανάλωση σε kWh ανά 100 κύκλους δεν είναι νούμερο που θυμάται κανείς και
// δεν γράφεται στο ταμπελάκι του σασί: γράφεται στην ενεργειακή ετικέτα, που
// συνήθως έχει πεταχτεί μαζί με το κουτί. Με τον κωδικό ή τον σύνδεσμο του QR,
// έρχεται από την πηγή — και είναι Η πηγή, όχι εκτίμηση.
//
// ── Ο ΚΑΝΟΝΑΣ ΠΟΥ ΔΕΝ ΠΑΡΑΒΙΑΖΕΤΑΙ ───────────────────────────────────────
// Ό,τι δεν το λέει ο κατασκευαστής, δεν συμπληρώνεται. Καμία «τυπική τιμή
// κατηγορίας», κανένας μέσος όρος: ένα πεδίο που γέμισε με εικασία φαίνεται
// ακριβώς ίδιο με ένα πεδίο που γέμισε από το μητρώο, και ο χρήστης δεν έχει
// τρόπο να τα ξεχωρίσει.
//
// ── ΤΙ ΕΙΝΑΙ ΕΠΑΛΗΘΕΥΜΕΝΟ ΚΑΙ ΤΙ ΟΧΙ ─────────────────────────────────────
// Η απάντηση του μητρώου έχει ελεγχθεί σε ΠΡΑΓΜΑΤΙΚΗ συσκευή της ομάδας
// `washingmachines2019` (πλυντήριο Amica, μητρώο 2516037). Τα ονόματα πεδίων
// που διαβάζονται από εκείνη είναι σίγουρα. Οι υπόλοιπες ομάδες προϊόντων
// (ψυγεία, πλυντήρια πιάτων) έχουν δικά τους ονόματα για την κατανάλωση, και
// ΔΕΝ τα έχουμε δει: γι' αυτό ο αναγνώστης δοκιμάζει μια λίστα υποψηφίων και,
// αν δεν βρει, αφήνει το πεδίο κενό. Άδειο πεδίο είναι σωστό· λάθος νούμερο όχι.
// ═══════════════════════════════════════════════════════════════════════════
import type { EnergyMode } from './energy';
import { addMonths } from '../loans/progress';

/** Η ταυτότητα μιας καταχώρησης: ομάδα προϊόντος και αριθμός μητρώου. */
export interface EprelRef {
  productGroup: string;
  registrationId: string;
}

export const eprelPageUrl = (r: EprelRef) =>
  `https://eprel.ec.europa.eu/screen/product/${r.productGroup}/${r.registrationId}`;

export const eprelApiUrl = (r: EprelRef) =>
  `https://eprel.ec.europa.eu/api/products/${r.productGroup}/${r.registrationId}`;

/**
 * Η ταυτότητα από ό,τι κι αν επικολλήσει ο χρήστης.
 *
 * Δέχεται τον σύνδεσμο του QR, τον σύνδεσμο του API, ή τα δύο κομμάτια χωρισμένα
 * με κάθετο. ΔΕΝ δέχεται σκέτο αριθμό: ο ίδιος αριθμός υπάρχει σε πολλές ομάδες
 * προϊόντων, οπότε χωρίς την ομάδα θα φέρναμε άλλη συσκευή με σιγουριά.
 */
export function parseEprelRef(input: string): EprelRef | null {
  const m = /([a-z][a-z0-9]{3,})\/(\d{3,})(?:[/?#]|$)/i.exec(String(input).trim());
  if (!m) return null;
  return { productGroup: m[1].toLowerCase(), registrationId: m[2] };
}

/** Ό,τι μπορεί να συμπληρωθεί από το μητρώο. Κάθε πεδίο προαιρετικό. */
export interface EprelFill {
  brand?: string;
  model?: string;
  energy_class?: string;
  energy_mode?: EnergyMode;
  kwh_per_100_cycles?: number;
  annual_kwh?: number;
  /** Μήνες εγγύησης, όπως τους δηλώνει ο κατασκευαστής. */
  guarantee_months?: number;
}

export type EprelResult =
  | { ok: true; fill: EprelFill; ref: EprelRef }
  | { ok: false; reason: string };

const text = (v: unknown): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  return s.length ? s : undefined;
};
const positive = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Το πρώτο κλειδί που υπάρχει και δίνει θετικό αριθμό. */
function firstNumber(o: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const k of keys) {
    const n = positive(o[k]);
    if (n !== undefined) return n;
  }
  return undefined;
}

/** Επαληθευμένο σε πλυντήριο· ισχύει και για πλυντήρια πιάτων και στεγνωτήρια. */
const PER_100_CYCLES = ['energyConsPer100Cycle', 'energyConsumptionPer100Cycles'] as const;
/** Ανεπαλήθευτα ονόματα για την ετήσια κατανάλωση. Αν κανένα δεν υπάρχει, μένει κενό. */
const PER_YEAR = ['energyConsAnnual', 'annualEnergyConsumption', 'energyConsumptionAnnual'] as const;

/**
 * Τα πεδία της καρτέλας, από την απάντηση του μητρώου.
 *
 * @param json  το σώμα της απάντησης, όπως ήρθε
 */
export function readEprel(json: unknown): EprelResult {
  if (!json || typeof json !== 'object') return { ok: false, reason: 'η απάντηση του μητρώου δεν διαβάζεται' };
  const o = json as Record<string, unknown>;

  const productGroup = text(o.productGroup);
  const registrationId = text(o.eprelRegistrationNumber);
  if (!productGroup || !registrationId) {
    return { ok: false, reason: 'η απάντηση δεν φέρει ομάδα προϊόντος και αριθμό μητρώου' };
  }

  const fill: EprelFill = {};
  const brand = text(o.supplierOrTrademark);
  const model = text(o.modelIdentifier);
  const cls = text(o.energyClass);
  if (brand) fill.brand = brand;
  if (model) fill.model = model;
  if (cls) fill.energy_class = cls;

  const guarantee = positive(o.guaranteeDuration);
  if (guarantee !== undefined) fill.guarantee_months = Math.round(guarantee);

  // Ο τρόπος κατανάλωσης ΔΕΝ επιλέγεται από την κατηγορία που έβαλε ο χρήστης,
  // αλλά από το τι δηλώνει η ίδια η ετικέτα: αυτή είναι η αυθεντία.
  const per100 = firstNumber(o, PER_100_CYCLES);
  const perYear = firstNumber(o, PER_YEAR);
  if (per100 !== undefined) {
    fill.energy_mode = 'cycles';
    fill.kwh_per_100_cycles = per100;
  } else if (perYear !== undefined) {
    fill.energy_mode = 'annual';
    fill.annual_kwh = perYear;
  }

  if (Object.keys(fill).length === 0) {
    return { ok: false, reason: 'η καταχώρηση δεν έχει κανένα από τα στοιχεία που κρατά η απογραφή' };
  }
  return { ok: true, fill, ref: { productGroup, registrationId } };
}

/**
 * Η λήξη της εγγύησης, από την ημερομηνία αγοράς και τους μήνες του κατασκευαστή.
 *
 * Χωρίς ημερομηνία αγοράς δεν υπάρχει λήξη: η εγγύηση μετριέται από εκείνη, και
 * μια ημερομηνία μετρημένη από το σήμερα θα ήταν επινοημένη.
 */
export function warrantyExpiry(purchaseDate: string | null | undefined, months: number | undefined): string | null {
  // Η πρόσθεση μηνών —μαζί με τον κανόνα ότι η 31η Ιανουαρίου συν έναν μήνα δεν
  // είναι 31 Φεβρουαρίου— είναι ήδη γραμμένη και δοκιμασμένη μία φορά. Ένα
  // δεύτερο αντίγραφο εδώ θα απέκλινε στην πρώτη διόρθωση.
  return months && months > 0 ? addMonths(purchaseDate, months) : null;
}
