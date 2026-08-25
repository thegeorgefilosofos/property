'use client';
// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΘΕ ΚΑΡΤΕΛΑ ΚΑΤΕΒΑΙΝΕΙ ΟΤΑΝ ΑΝΟΙΞΕΙ, ΟΧΙ ΟΤΑΝ ΜΠΕΙ ΚΑΝΕΙΣ ΣΤΟΝ ΠΙΝΑΚΑ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΠΡΟΒΛΗΜΑ, ΜΕΤΡΗΜΕΝΟ. Το πρώτο φόρτωμα του πίνακα ελέγχου ήταν 3,25 MB
// JavaScript, από τα οποία τα 2,43 MB ήταν δικός μας κώδικας: δεκαεπτά
// καρτέλες που εισάγονταν ΣΤΑΤΙΚΑ στο app/dashboard/page.tsx και αποδίδονταν
// υπό συνθήκη (`{nav==='loan' && <TabLoan/>}`). Η συνθήκη γλιτώνει την ΑΠΟΔΟΣΗ,
// όχι το ΚΑΤΕΒΑΣΜΑ: ο περιηγητής κατέβαζε και μετέγλωττιζε και τις δεκαεπτά
// πριν δείξει την Επισκόπηση.
//
// Μόνο το TabCalendar είναι 205 kB πηγαίου κώδικα, το TabContacts 192 kB, το
// TabAccounting 178 kB. Ενας ιδιοκτήτης με ένα ακίνητο που μπαίνει να δει τι
// χρωστάει, κατέβαζε το λογιστικό ημερολόγιο, το πελατολόγιο και τον
// υπολογιστή δανείου.
//
// ── ΓΙΑΤΙ ΕΔΩ ΚΑΙ ΟΧΙ ΜΕΣΑ ΣΤΟ page.tsx ─────────────────────────────────
// Το `dynamic()` θέλει σταθερή ταυτότητα τύπου: γραμμένο μέσα στο σώμα ενός
// component, θα ξαναδημιουργούσε τον τύπο σε κάθε απόδοση και το React θα
// αποσυναρμολογούσε την καρτέλα σε κάθε πληκτρολόγηση. Σε δικό του module,
// οι τύποι γεννιούνται μία φορά.
//
// ── ΤΙ ΔΕΝ ΑΛΛΑΖΕΙ ─────────────────────────────────────────────────────
// Οι υπογραφές. Κάθε εξαγωγή εδώ έχει ΑΚΡΙΒΩΣ τον τύπο της αντίστοιχης
// καρτέλας (`typeof import(...)['default']`), οπότε ο μεταγλωττιστής
// εξακολουθεί να ελέγχει κάθε prop στα σημεία κλήσης. Αλλάζει μόνο η
// διαδρομή της εισαγωγής στο page.tsx.
//
// ── ΓΙΑΤΙ `ssr: false` ─────────────────────────────────────────────────
// Ο πίνακας είναι πίσω από σύνδεση και η σελίδα είναι ήδη `'use client'`.
// Απόδοση στον διακομιστή δεν προσφέρει τίποτα στον χρήστη εδώ και θα
// κρατούσε τον ίδιο κώδικα και στο πακέτο του διακομιστή.
// ═══════════════════════════════════════════════════════════════════════════
import dynamic from 'next/dynamic';
import { T } from '@/components/tokens';

/**
 * Ο χώρος που κρατά η καρτέλα όσο κατεβαίνει.
 *
 * ΔΕΝ ΓΡΑΦΕΙ «ΦΟΡΤΩΝΕΙ». Σε γρήγορη σύνδεση η λέξη θα αναβόσβηνε για ένα
 * δέκατο του δευτερολέπτου, που είναι πιο ενοχλητικό από το τίποτα. Κρατά
 * ύψος ώστε να μην αναπηδήσει η σελίδα και δανείζεται τη λάμψη που ήδη
 * χρησιμοποιεί η εφαρμογή για κάθε άλλη αναμονή (`.skeleton`).
 */
function TabWait() {
  return (
    <div aria-busy="true" aria-live="polite" style={{ display: 'grid', gap: 12, padding: '4px 0' }}>
      <span className="skeleton" style={{ height: 78, borderRadius: T.radius.card }}/>
      <span className="skeleton" style={{ height: 190, borderRadius: T.radius.card }}/>
      <span className="skeleton" style={{ height: 120, borderRadius: T.radius.card }}/>
    </div>
  );
}

// ΤΑ ΟΡΙΣΜΑΤΑ ΓΡΑΦΟΝΤΑΙ ΟΛΟΚΛΗΡΑ ΣΕ ΚΑΘΕ ΚΛΗΣΗ, ΚΑΙ ΔΕΝ ΕΙΝΑΙ ΕΠΑΝΑΛΗΨΗ.
// Μια κοινή σταθερά `{ loading, ssr: false }` περασμένη ως μεταβλητή έριξε το
// build με είκοσι σφάλματα: ο Turbopack διαβάζει το `ssr: false` ΣΤΑΤΙΚΑ, για
// να ξέρει τι να αφήσει έξω από το πακέτο του διακομιστή και μια μεταβλητή
// δεν διαβάζεται στη μεταγλώττιση. Το αντίγραφο είναι απαίτηση του εργαλείου.

export const TabFinances = dynamic(() => import('./TabFinances'), { loading: TabWait, ssr: false });
export const TabCalendar = dynamic(() => import('./TabCalendar'), { loading: TabWait, ssr: false });
export const TabRentROI = dynamic(() => import('./TabRentROI'), { loading: TabWait, ssr: false });
export const TabPricing = dynamic(() => import('./TabPricing'), { loading: TabWait, ssr: false });
export const TabSettings = dynamic(() => import('./TabSettings'), { loading: TabWait, ssr: false });
export const TabReferral = dynamic(() => import('./TabReferral'), { loading: TabWait, ssr: false });
export const TabTenant = dynamic(() => import('./TabTenant'), { loading: TabWait, ssr: false });
export const TabLoan = dynamic(() => import('./TabLoan'), { loading: TabWait, ssr: false });
export const TabAccounting = dynamic(() => import('./TabAccounting'), { loading: TabWait, ssr: false });
export const TabInventory = dynamic(() => import('./TabInventory'), { loading: TabWait, ssr: false });
export const TabContacts = dynamic(() => import('./TabContacts'), { loading: TabWait, ssr: false });
export const TabChecklist = dynamic(() => import('./TabChecklist'), { loading: TabWait, ssr: false });
export const TabDocuments = dynamic(() => import('./TabDocuments'), { loading: TabWait, ssr: false });
export const TabComparison = dynamic(() => import('./TabComparison'), { loading: TabWait, ssr: false });
export const TabPlan = dynamic(() => import('./TabPlan'), { loading: TabWait, ssr: false });
export const TabClients = dynamic(() => import('./TabClients'), { loading: TabWait, ssr: false });
export const PortfolioTab = dynamic(() => import('./PortfolioTab'), { loading: TabWait, ssr: false });

// ── ΚΑΙ ΤΑ ΤΡΙΑ ΠΑΡΑΘΥΡΑ ────────────────────────────────────────────────
// Ο οδηγός προσθήκης ακινήτου, η σάρωση εγγράφου και το καλωσόρισμα ανοίγουν
// με πάτημα και κλείνουν. Δεν υπάρχει λόγος να ταξιδεύουν με το πρώτο
// φόρτωμα — και το καλωσόρισμα το βλέπει κανείς ΜΙΑ φορά στη ζωή του
// λογαριασμού του.
//
// ΧΩΡΙΣ ΣΧΗΜΑ ΑΝΑΜΟΝΗΣ, ΕΠΙΤΗΔΕΣ. Ενα σκελετό μέσα σε παράθυρο που δεν έχει
// ακόμη πλαίσιο θα ζωγράφιζε τρεις γκρίζες μπάρες στη μέση της οθόνης.
export const AddPropertyWizard = dynamic(() => import('./AddPropertyWizard'), { ssr: false });
export const DocumentScan = dynamic(() => import('./DocumentScan'), { ssr: false });
export const WelcomeOnboarding = dynamic(() => import('./WelcomeOnboarding'), { ssr: false });
