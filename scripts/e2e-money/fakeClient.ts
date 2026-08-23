// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΨΕΥΤΙΚΟ `@/lib/supabase/client`
// ─────────────────────────────────────────────────────────────────────────
// Ο ΔΙΠΛΟΣ ΦΤΙΑΧΝΕΤΑΙ ΕΔΩ, ΟΧΙ ΣΤΟΝ ΠΑΓΚΟ, ΚΑΙ ΑΥΤΟ ΕΧΕΙ ΛΟΓΟ. Υπάρχουν
// modules της εφαρμογής που καλούν `createClient()` σε επίπεδο module —
// π.χ. το BillsSettings.tsx κρατά ένα singleton για όλο το hook. Οι εισαγωγές
// εκτελούνται ΠΡΙΝ από κάθε γραμμή του πάγκου, οπότε όσο ο διπλός στηνόταν
// μέσα στο harness, τέτοιο module έσκαγε στην εισαγωγή του με «Δεν στήθηκε
// διπλός βάσης» — και έριχνε ΟΛΑ τα σενάρια, όχι μόνο το δικό του.
//
// Τώρα ο διπλός υπάρχει από τη στιγμή που φορτώνεται αυτό το αρχείο. Ο πάγκος
// δηλώνει μόνο ΠΩΣ απαντά, σε `window.__respond`, και οι απαντήσεις
// χρειάζονται μόνο όταν τρέξουν τα effects — δηλαδή μετά την απόδοση.
import { makeFakeDb, type DbCall, type Answer } from './fakeDb';

type Fake = ReturnType<typeof makeFakeDb>;
declare global {
  interface Window {
    __fake?: Fake;
    __respond?: (call: DbCall) => Answer;
  }
}

const fake = makeFakeDb(call => window.__respond?.(call));
window.__fake = fake;

export const createClient = () => fake.db as never;
export const createBrowserClient = createClient;
export default createClient;

/** Ο διπλός, για όποιον χρειάζεται τις καταγραφές του. */
export const theFake = fake;
