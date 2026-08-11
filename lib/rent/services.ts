// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΓΡΑΜΜΕΣ ΥΠΗΡΕΣΙΩΝ ΤΗΣ ΜΙΣΘΩΣΗΣ — ΜΟΝΟ ΛΟΓΙΚΗ, ΚΑΜΙΑ ΟΘΟΝΗ
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΕΦΥΓΑΝ ΑΠΟ ΤΟ TabTenantHelpers. Εκείνο το αρχείο ξεκινά με 'use client'
// και περιέχει επεξεργαστές, πεδία και εικονίδια. Το TabTenantTypes.ts όμως
// —που είναι καθαρά σχήματα και κανόνες— εισήγαγε ΤΙΜΕΣ από εκεί. Ο φύλακας
// scripts/check-server-imports.mjs το κατήγγειλε σωστά: αν αυτά τα σχήματα
// χρειαστούν ποτέ σε Server Component, οι τιμές θα φτάσουν `undefined` στο SSR,
// χωρίς σφάλμα και χωρίς ίχνος — απλώς μηδενικά κόστη σε μια οθόνη μίσθωσης.
//
// Εδώ δεν υπάρχει τίποτα που να χρειάζεται περιηγητή: μια μετατροπή παλιών
// δεδομένων και δύο αθροίσματα. Ζουν στο lib/, όπως κάθε άλλος κανόνας.
// ═══════════════════════════════════════════════════════════════════════════

/** Ποιος πληρώνει μια υπηρεσία. `split` σημαίνει μισά-μισά. */
export type ServiceBy = 'owner' | 'tenant' | 'split';

/**
 * Μία γραμμή υπηρεσίας της μίσθωσης.
 *
 * ΓΙΑΤΙ ΔΕΝ ΥΠΑΡΧΕΙ «ΑΠΟΤΕΛΕΣΜΑ»: ο παλιός διαμορφωτής έβγαζε «Αποτέλεσμα/μήνα»
 * σε πράσινο, δηλαδή περιθώριο κέρδους από τη μετακύλιση υπηρεσιών στον μισθωτή.
 * Εδώ υπάρχει κόστος και υπάρχει ποιος το πληρώνει. Τίποτε άλλο.
 */
export interface ServiceLine {
  /** Τι είναι, με τα λόγια του χρήστη. */
  name: string;
  /** Μηνιαίο κόστος σε ευρώ. */
  cost: number;
  /** Ποιος το πληρώνει. */
  payer: ServiceBy;
}

interface LegacyStreamRow { name?: unknown; cost_owner?: unknown; charged_tenant?: unknown; included?: unknown; cost?: unknown; payer?: unknown }
interface LegacyCleaning { total_owner?: unknown; total_tenant?: unknown }

const num = (v: unknown): number => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '')); return Number.isFinite(n) && n > 0 ? n : 0; };

/**
 * Διαβάζει τις γραμμές υπηρεσιών, ΚΑΙ από τα παλιά δεδομένα.
 *
 * ΓΙΑΤΙ ΜΕΤΑΤΡΟΠΗ ΚΑΙ ΟΧΙ ΝΕΑ ΣΤΗΛΗ: τα υπάρχοντα δεδομένα ζουν στις στήλες
 * `streaming` (πίνακας υπηρεσιών) και `cleaning` (μία ρύθμιση καθαρισμού). Καμία
 * μετάπτωση σε βάση χωρίς αντίγραφα: η παλιά μορφή διαβάζεται και αποδίδει
 * γραμμές, η νέα γράφεται από πάνω. Ένας ιδιοκτήτης που είχε συμπληρώσει
 * Netflix 13,99 € χρεωμένο στον μισθωτή βλέπει «Netflix · 13,99 € · Ενοικιαστής».
 */
export function serviceLinesFrom(rawServices: unknown, rawCleaning: unknown): ServiceLine[] {
  const out: ServiceLine[] = [];
  if (Array.isArray(rawServices)) {
    for (const r of rawServices as LegacyStreamRow[]) {
      const name = String(r?.name ?? '').trim();
      if (!name) continue;
      // Νέα μορφή: έχει `cost` + `payer`.
      if (r?.cost !== undefined || r?.payer !== undefined) {
        const payer = r.payer === 'tenant' || r.payer === 'split' ? r.payer : 'owner';
        out.push({ name, cost: num(r.cost), payer });
        continue;
      }
      // Παλιά μορφή: κόστος ιδιοκτήτη + χρέωση ενοικιαστή + «included».
      if (r?.included === false) continue;   // δεν παρεχόταν καθόλου
      const own = num(r.cost_owner), ten = num(r.charged_tenant);
      out.push({ name, cost: Math.max(own, ten), payer: ten > 0 && own > 0 ? 'split' : ten > 0 ? 'tenant' : 'owner' });
    }
  }
  const cl = rawCleaning as LegacyCleaning | null | undefined;
  if (cl && (num(cl.total_owner) > 0 || num(cl.total_tenant) > 0)) {
    const own = num(cl.total_owner), ten = num(cl.total_tenant);
    out.push({ name: 'Καθαρισμός', cost: Math.max(own, ten), payer: ten > 0 && own > 0 ? 'split' : ten > 0 ? 'tenant' : 'owner' });
  }
  return out;
}

/** Πόσο επιβαρύνεται ο ΕΝΟΙΚΙΑΣΤΗΣ τον μήνα από τις γραμμές υπηρεσιών. */
export const servicesTenantCharge = (lines: readonly ServiceLine[] | null | undefined): number =>
  (lines || []).reduce((a, l) => a + (l.payer === 'tenant' ? num(l.cost) : l.payer === 'split' ? num(l.cost) / 2 : 0), 0);

/** Πόσο επιβαρύνεται ο ΙΔΙΟΚΤΗΤΗΣ τον μήνα. */
export const servicesOwnerCost = (lines: readonly ServiceLine[] | null | undefined): number =>
  (lines || []).reduce((a, l) => a + (l.payer === 'owner' ? num(l.cost) : l.payer === 'split' ? num(l.cost) / 2 : 0), 0);
