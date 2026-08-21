// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΕΞΑΓΩΓΕΣ ΦΟΡΤΩΝΟΝΤΑΙ ΟΤΑΝ ΠΑΤΗΘΟΥΝ, ΟΧΙ ΟΤΑΝ ΑΝΟΙΞΕΙ Ο ΠΙΝΑΚΑΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΜΕΤΡΗΘΗΚΕ. Η αρχική φόρτωση του πίνακα ήταν 4,21 MB JavaScript, από τα
// οποία 3,0 MB ένα και μόνο κομμάτι: η βιβλιοθήκη που γράφει αρχεία Excel.
// Ερχόταν επειδή έντεκα οθόνες εισήγαγαν ΣΤΑΤΙΚΑ τη συνάρτηση εξαγωγής τους —
// για ένα κουμπί «Εξαγωγή» που οι περισσότεροι χρήστες δεν πατούν ποτέ.
//
// Σε ελληνικό 4G αυτό είναι δευτερόλεπτα λευκής οθόνης, σε κάθε επίσκεψη, για
// κάθε χρήστη. Και δεν φαίνεται πουθενά: η εφαρμογή δουλεύει μια χαρά σε
// γρήγορο δίκτυο, οπότε το βάρος δεν το συναντά ποτέ όποιος το γράφει.
//
// ── ΓΙΑΤΙ ΠΡΟΣΟΨΗ ΚΑΙ ΟΧΙ ΔΥΝΑΜΙΚΟ import ΣΕ ΚΑΘΕ ΟΘΟΝΗ ─────────────────
// Το `await import('./exportXlsx')` μέσα σε κάθε χειριστή θα ήταν έντεκα
// αντίγραφα του ίδιου μοτίβου, και το δωδέκατο θα ξεχνιόταν. Εδώ η υπογραφή
// μένει ΙΔΙΑ με την πραγματική συνάρτηση (`Parameters<typeof import(...)>`,
// που σβήνεται στη μεταγλώττιση και δεν φέρνει τίποτα), οπότε η οθόνη αλλάζει
// ΜΟΝΟ τη διαδρομή του import. Καμία λογική δεν μετακινείται.
//
// ── ΤΟ ΑΠΟΤΕΛΕΣΜΑ ΕΙΝΑΙ ΥΠΟΣΧΕΣΗ, ΚΑΙ ΑΥΤΟ ΕΧΕΙ ΣΥΝΕΠΕΙΑ ────────────────
// Οι κλήσεις που αγνοούσαν το αποτέλεσμα συνεχίζουν να δουλεύουν αυτούσιες.
// Οσες το χρησιμοποιούσαν το περίμεναν ήδη με `await`. Καμία δεν χρειάστηκε να
// αλλάξει σειρά βημάτων — και αν κάποτε χρειαστεί, ο μεταγλωττιστής το λέει.
// ═══════════════════════════════════════════════════════════════════════════

type Args<T extends (...a: never[]) => unknown> = Parameters<T>;

/** Φύλλα εργασίας γενικής χρήσης (ατζέντα, δάνεια, καταστάσεις). */
export const downloadXlsx = async (
  ...a: Args<typeof import('./exportXlsx')['downloadXlsx']>
) => (await import('./exportXlsx')).downloadXlsx(...a);

/** Κατέβασμα έτοιμου βιβλίου εργασίας. */
export const downloadWorkbook = async (
  ...a: Args<typeof import('./xlsxStyle')['downloadWorkbook']>
) => (await import('./xlsxStyle')).downloadWorkbook(...a);

/** Ο φάκελος του λογιστή, ως ένα βιβλίο εργασίας. */
export const exportAccountantBundle = async (
  ...a: Args<typeof import('./accountantExport')['exportAccountantBundle']>
) => (await import('./accountantExport')).exportAccountantBundle(...a);

/** Ο ίδιος φάκελος με τα παραστατικά, ως συμπιεσμένο αρχείο. */
export const exportAccountantDossier = async (
  ...a: Args<typeof import('./accountantExport')['exportAccountantDossier']>
) => (await import('./accountantExport')).exportAccountantDossier(...a);

/** Λογιστικό ημερολόγιο (διπλογραφικό). */
export const downloadJournalWorkbook = async (
  ...a: Args<typeof import('./journalXlsx')['downloadJournalWorkbook']>
) => (await import('./journalXlsx')).downloadJournalWorkbook(...a);

/** Σύγκριση χαρτοφυλακίου. */
export const downloadPortfolioComparison = async (
  ...a: Args<typeof import('./portfolioXlsx')['downloadPortfolioComparison']>
) => (await import('./portfolioXlsx')).downloadPortfolioComparison(...a);

/** Δυναμική τιμολόγηση βραχυχρόνιας. */
export const exportPricingWorkbook = async (
  ...a: Args<typeof import('./pricingExport')['exportPricingWorkbook']>
) => (await import('./pricingExport')).exportPricingWorkbook(...a);

/** Το έντυπο Ε2: ανάγνωση γραμμών και εξαγωγή. */
export const loadE2Rows = async (
  ...a: Args<typeof import('./e2Export')['loadE2Rows']>
) => (await import('./e2Export')).loadE2Rows(...a);

export const runE2Export = async (
  ...a: Args<typeof import('./e2Export')['runE2Export']>
) => (await import('./e2Export')).runE2Export(...a);
