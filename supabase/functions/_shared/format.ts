// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΕΝΑ ΣΗΜΕΙΟ ΜΟΡΦΟΠΟΙΗΣΗΣ ΤΗΣ ΠΛΕΥΡΑΣ DENO
// ─────────────────────────────────────────────────────────────────────────
// Οι συναρτήσεις edge τρέχουν σε Deno και ΔΕΝ μπορούν να εισάγουν το
// lib/core/format.ts της εφαρμογής (άλλο runtime, άλλα aliases). Οπότε κάθε
// μία είχε γράψει τη δική της: πέντε αντίγραφα, με τέσσερις διαφορές.
//
//   send-monthly-statements   «450,00 €»   με απλό κενό
//   send-reminders            «450,00 €»   μέσω style:'currency', σε τρία σημεία
//   send-market-digest        «3,50%»      και «—» όταν λείπει τιμή
//   _shared/emailCopy         «450,00 €»   με απλό κενό
//
// Το ίδιο ποσό έφευγε σε τρία email με τρεις διαδρομές. Εδώ γράφεται μία φορά,
// με τους ΙΔΙΟΥΣ κανόνες με την οθόνη: δύο δεκαδικά πάντα και ΑΔΙΑΣΠΑΣΤΟ κενό
// πριν το ευρώ ώστε το σύμβολο να μην πέφτει μόνο του σε άλλη γραμμή — που στο
// email, με τα στενά πλάτη των πελατών αλληλογραφίας, συμβαίνει συχνά.
// ═══════════════════════════════════════════════════════════════════════════
const LOCALE = 'el-GR'
const TWO = { minimumFractionDigits: 2, maximumFractionDigits: 2 } as const
const num = (n: unknown): number => (typeof n === 'number' && isFinite(n) ? n : Number(n) || 0)

/** `eur(1234.5)` → «1.234,50 €», με αδιάσπαστο κενό. */
export const eur = (n: unknown): string => `${num(n).toLocaleString(LOCALE, TWO)} €`

/** `pct(3.5)` → «3,50%». */
export const pct = (n: unknown): string => `${num(n).toLocaleString(LOCALE, TWO)}%`

/** Πλήθος με ελληνικούς χωριστές χιλιάδων, χωρίς δεκαδικά. */
export const cnt = (n: unknown): string => Math.round(num(n)).toLocaleString(LOCALE)
