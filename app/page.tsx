import BrandMark from '@/components/BrandMark';
import Link from 'next/link';
import { PLANS, PLAN_ORDER, EXTRA_PROPERTY_PRICE, TRIAL_DAYS } from '@/lib/billing/plans';
import { fe } from '@/lib/core/format';
import { createClient } from '@/lib/supabase/server';
import LandingShowcase from './LandingShowcase';
import ScrollStory from './ScrollStory';
import LandingCalculator from './LandingCalculator';
import Spotlight from './Spotlight';
import { T } from '@/components/tokens';

// ═══════════════════════════════════════════════════════════════════════════
// Landing. Χτισμένη γύρω από τα δύο μοναδικά μας: (1) μία φωτογραφία → αυτόματη
// καταχώρηση παντού, (2) βοηθός με φωνή που ξέρει το ακίνητό σου. Ήρεμο βάθος,
// ζωντανό product-showcase (καμία εικόνα), πλήρως ρευστή και theme-aware,
// FAQ με native <details> (χωρίς JS). Server component (auth-aware).
// Αισθητική: μονόχρωμη, ένα γαλάζιο, καθαρή· καμία διακοσμητική «κονκάρδα».
// ═══════════════════════════════════════════════════════════════════════════

const OG_TITLE = 'Property OS · Διαχείριση ακινήτων με μία φωτογραφία';
const OG_DESC = 'Σάρωσε λογαριασμό, μισθωτήριο ή ασφαλιστήριο και καταχωρείται αυτόματα εκεί που πρέπει. Ρώτα τον βοηθό με τη φωνή σου. Αποδόσεις, δαπάνες, φορολογία 2026 και σύγκριση παρόχων ενέργειας, σε μία οθόνη.';

export const metadata = {
  metadataBase: new URL('https://propertyos.gr'),
  title: OG_TITLE,
  description: OG_DESC,
  openGraph: { title: OG_TITLE, description: OG_DESC, type: 'website', locale: 'el_GR', siteName: 'Property OS' },
  twitter: { card: 'summary_large_image', title: OG_TITLE, description: OG_DESC },
};

const ACCENT = 'var(--accent)';
const BG = 'var(--bg-base)';
const PANEL = 'var(--bg-surface)';
const TEXT = 'var(--text-primary)';
const MUTED = 'var(--text-secondary)';
const FAINT = 'var(--text-tertiary)';
const LINE = 'var(--border-subtle)';

const FEATURES = [
  // Ο βοηθός ΔΕΝ είχε κάρτα εδώ: έξι δυνατότητες και καμία για το μοναδικό
  // πράγμα που δεν έχει κανένας ανταγωνιστής στη ζώνη τιμής μας. Μπαίνει
  // πρώτος, γιατί είναι ο λόγος που κάποιος διαλέγει εμάς και όχι ένα φύλλο
  // Excel — τα υπόλοιπα, με αρκετό κόπο, γίνονται και αλλού.
  { t: 'Βοηθός στα ελληνικά', d: 'Συγκρίνει και προτείνει με βάση τα δικά σου ενοίκια και δαπάνες, όχι γενικότητες. Με φωνή, αν θέλεις.', i: 'M21 12a8 8 0 0 1-8 8H8l-5 3 1.4-4.2A8 8 0 1 1 21 12M8.5 12h.01M12 12h.01M15.5 12h.01' },
  { t: 'Πάροχοι και ασφάλιση', d: 'Τιμολόγια 11 παρόχων ρεύματος και 16 ασφαλιστικών εταιρειών, από στοιχεία που επαληθεύονται τακτικά.', i: 'M3 12h4l3 8 4-16 3 8h4' },
  { t: 'Δάνειο χωρίς εκπλήξεις', d: 'Δόσεις, επιτόκια και έξοδα μεταβίβασης στα δικά σου στοιχεία, και έλεγχος αν δικαιούσαι το «Σπίτι μου ΙΙ».', i: 'M3 21h18M5 21V7l8-4v18M19 21V11l-6-4' },
  { t: 'Αποδόσεις και σενάρια μίσθωσης', d: 'Καθαρή απόδοση μετά τον φόρο, και η βραχυχρόνια μίσθωση δίπλα στη μακροχρόνια στα δικά σου δεδομένα.', i: 'M12 2v20M17 7H9.5a2.5 2.5 0 0 0 0 5h5a2.5 2.5 0 0 1 0 5H7' },
  { t: 'Φορολογία 2026', d: 'Υποχρεώσεις, προθεσμίες και κλίμακα ενοικίων που ακολουθούν το έτος της δήλωσης, όχι το τρέχον ημερολόγιο.', i: 'M9 7h6M9 11h6M9 15h4M5 3h14v18l-3-2-2 2-2-2-2 2-3-2z' },
  { t: 'Έγγραφα και προθεσμίες', d: 'Συμβόλαια, λογαριασμοί και πιστοποιητικά σε ένα αρχείο, με ημερολόγιο που θυμάται τις λήξεις.', i: 'M4 4h6l2 2h8v12H4zM4 10h16' },
];

// Ο ΤΙΜΟΚΑΤΑΛΟΓΟΣ ΓΡΑΦΕΤΑΙ ΜΙΑ ΦΟΡΑ, ΚΑΙ ΦΑΙΝΕΤΑΙ ΜΙΑ ΦΟΡΑ.
// Εδώ ζούσε το `PAID_PLANS_TEXT`, που παρήγαγε μια πρόταση με ΟΛΑ τα πλάνα επί
// πληρωμή, τις μηνιαίες τιμές, τις ετήσιες και τα όρια ακινήτων — και την
// τύπωνε στην απάντηση «Πόσο κοστίζει;», δύο ενότητες κάτω από τον ίδιο τον
// τιμοκατάλογο. Ο αναγνώστης διάβαζε τα ίδια πέντε πλάνα δεύτερη φορά, σε μορφή
// παραγράφου. Η απάντηση λέει πλέον μόνο ό,τι ΔΕΝ φαίνεται στις κάρτες.

const FAQ = [
  // ΜΕΤΡΟ: 131 ΧΑΡΑΚΤΗΡΕΣ ΑΝΑ ΓΡΑΜΜΗ, ΜΕΤΡΗΜΕΝΟ ΣΤΟΝ ΠΕΡΙΗΓΗΤΗ (1044px / Inter 15px).
  // Άρα δύο γεμάτες γραμμές είναι περίπου 250-260 χαρακτήρες. Οι απαντήσεις
  // γράφονται σε ΑΥΤΟ το μέτρο: πλήρεις, κατατοπιστικές, να φτάνουν πέρα-πέρα.
  //
  // Πριν ίσχυαν δύο λάθη μαζί. Το κείμενο ήταν 300-600 χαρακτήρες ΚΑΙ το μέτρο
  // κλειδωμένο στα 680px μέσα σε δοχείο 1044px — πέντε και έξι κοντές σειρές.
  // Η πρώτη διόρθωση έκοψε το κείμενο σε μία γραμμή, που το έκανε ελλιπές: η
  // απάντηση «Παντού» δεν λέει τίποτα. Σωστό είναι το ΠΛΗΡΕΣ κείμενο στο ΠΛΗΡΕΣ
  // πλάτος — δύο γραμμές που τελειώνουν όπου τελειώνει η σκέψη.
  { q: 'Πώς δουλεύει η σάρωση με φωτογραφία;', a: 'Φωτογραφίζεις λογαριασμό, μισθωτήριο, ασφαλιστήριο ή ειδοποίηση ΕΝΦΙΑ και ο βοηθός αναγνωρίζει ποσό, πάροχο και προθεσμία, και τα καταχωρεί στο σωστό ακίνητο. Βλέπεις τι κατάλαβε και το διορθώνεις με ένα άγγιγμα: τίποτα δεν αποθηκεύεται χωρίς την έγκρισή σου.' },
  { q: 'Ο βοηθός καταλαβαίνει και μιλάει ελληνικά;', a: 'Γράφει και καταλαβαίνει φυσικά ελληνικά, και σε Chrome ή Safari μπορείς να του μιλάς και να σου διαβάζει τις απαντήσεις. Έχει μπροστά του τα δικά σου ακίνητα, δαπάνες και προθεσμίες· για νομικά και λογιστικά ζητήματα σε παραπέμπει στον κατάλληλο επαγγελματία.' },
  { q: 'Σε ποιους απευθύνεται;', a: 'Σε κάθε ιδιοκτήτη ακινήτου στην Ελλάδα, από τον ιδιώτη με ένα διαμέρισμα ως το μεσιτικό γραφείο που διαχειρίζεται χαρτοφυλάκιο τρίτων. Καλύπτει κατοικίες, επαγγελματικούς χώρους, αποθήκες και οικόπεδα, σε μακροχρόνια ή βραχυχρόνια μίσθωση.' },
  { q: 'Αντικαθιστά τον λογιστή ή τον φοροτεχνικό μου;', a: 'Όχι, και δεν το επιδιώκει. Κρατά τις υποχρεώσεις και τις προθεσμίες σου ενήμερες όλον τον χρόνο, ώστε να φτάνεις στον λογιστή σου με τα στοιχεία έτοιμα για εξαγωγή αντί να τα ψάχνεις τον Ιούνιο. Οι υπολογισμοί είναι υποστηρικτικοί, όχι δεσμευτικοί.' },
  { q: 'Πόσο κοστίζει;', a: `Τέσσερα πακέτα, από ${fe(PLANS.solo.priceMonthly)} τον μήνα για ένα ακίνητο με όλα τα φορολογικά ως ${fe(PLANS.office.priceMonthly)} για απεριόριστα, και ${EXTRA_PROPERTY_PRICE} € για κάθε επιπλέον ακίνητο. Κάθε λογαριασμός ξεκινά με ${TRIAL_DAYS} ημέρες δοκιμή χωρίς κάρτα, και μετά συνεχίζεις δωρεάν με ένα ακίνητο.` },
  { q: 'Είναι ασφαλή τα δεδομένα μου;', a: 'Η σύνδεση είναι πάντα κρυπτογραφημένη και κάθε λογαριασμός απομονώνεται σε επίπεδο βάσης: βλέπεις τα δικά σου δεδομένα και μόνο όσα εσύ μοιράζεσαι. Δεν εκπαιδεύουμε μοντέλα με τα έγγραφά σου. Η βάση και τα αρχεία βρίσκονται στην ΕΕ· αναλυτικά στο «Ποιοι είμαστε».' },
  { q: 'Τι γίνεται με τα δεδομένα μου αν σταματήσω;', a: 'Παραμένουν δικά σου. Τα εξάγεις όποτε θέλεις μέσα από την εφαρμογή και διαγράφεις τον λογαριασμό με ένα κουμπί, χωρίς να ζητήσεις τίποτα από κανέναν. Η οριστική διαγραφή ολοκληρώνεται μέσα σε 30 ημέρες, εκτός από όσα ο νόμος επιβάλλει να τηρηθούν.' },
  { q: 'Δουλεύει στο κινητό;', a: 'Παντού: η εφαρμογή προσαρμόζεται σε κινητό, tablet και υπολογιστή, και η σάρωση δουλεύει καλύτερα με την κάμερα του κινητού. Φωτογραφίζεις τον λογαριασμό εκεί που τον παραλαμβάνεις και έχει ήδη καταχωρηθεί πριν φτάσεις σπίτι.' },
  { q: 'Πόσο γρήγορα ξεκινάω;', a: 'Η εγγραφή θέλει λιγότερο από ένα λεπτό, με Google ή με email. Προσθέτεις το πρώτο ακίνητο με λίγα βασικά στοιχεία και η εικόνα του συμπληρώνεται με κάθε έγγραφο που περνάς. Αν θέλεις να δεις πρώτα πώς λειτουργεί, υπάρχουν έτοιμα δεδομένα επίδειξης.' },
];

// ΓΙΑΤΙ ΕΦΥΓΕ Η ΤΑΙΝΙΑ ΔΥΝΑΤΟΤΗΤΩΝ: εννέα ετικέτες κεφαλαία που κυλούσαν στο κάτω
// άκρο του hero, και οι εννέα έλεγαν κάτι που η σελίδα λέει ήδη πιο κάτω με
// ολοκληρωμένη πρόταση. Ήταν το πιο «σούπερ μάρκετ» στοιχείο της σελίδας: πολλά
// σήματα, μηδέν νέα πληροφορία, ακριβώς στο σημείο όπου ο επισκέπτης πρέπει να
// κοιτάξει το προϊόν. Η πρώτη οθόνη κερδίζει και ησυχία και ύψος.

// ΓΙΑΤΙ ΤΕΣΣΕΡΑ ΝΟΥΜΕΡΑ ΚΑΙ ΟΧΙ ΛΕΞΕΙΣ: η προηγούμενη εκδοχή έβαζε στη θέση του
// μεγάλου αριθμού τις λέξεις «Δάνεια» και «ΕΕ». Μια ζώνη μετρήσεων που δεν μετρά
// τίποτα ακυρώνει τον ίδιο της τον σκοπό: ο επισκέπτης μαθαίνει να την προσπερνά.
// Τώρα και τα τέσσερα είναι ελέγξιμα μεγέθη, με τη μονάδα δίπλα στο νούμερο.
// Η δήλωση για ΕΕ και GDPR έφυγε από εδώ: λεγόταν ήδη πέντε φορές στη σελίδα και
// έχει τη θέση της στην ενότητα Ασφάλεια, όπου συνοδεύεται από απόδειξη.
const STATS = [
  { n: '7', u: 'είδη εγγράφων', l: 'από λογαριασμό και μισθωτήριο μέχρι ασφαλιστήριο και ΕΝΦΙΑ, με μία φωτογραφία' },
  { n: '11', u: 'πάροχοι', l: 'εταιρείες ρεύματος με τα κύρια τιμολόγιά τους σε σύγκριση, επαληθευμένα τον Ιούλιο 2026' },
  { n: '16', u: 'ασφαλιστικές', l: 'προγράμματα κατοικίας και επαγγελματικού χώρου, με τις καλύψεις αντικριστά' },
  { n: '2026', u: 'φορολογία', l: 'κλίμακα ενοικίων, τεκμαρτές εκπτώσεις και προθεσμίες στην ισχύουσα νομοθεσία' },
];

// ═══ ΓΙΑ ΠΟΙΟΝ ΕΙΝΑΙ ═══════════════════════════════════════════════════════
// Η σελίδα μιλούσε σε έναν μέσο «ιδιοκτήτη» που δεν υπάρχει. Απευθυνόμαστε σε
// τρεις ανθρώπους με εντελώς διαφορετικό πόνο: αυτόν που έχει ένα σπίτι και
// πνίγεται στις προθεσμίες, αυτόν που διαχειρίζεται ξένα ακίνητα και χρειάζεται
// ρόλους και αναφορές, και τον λογιστή που θέλει σωστά αρχεία στην ώρα τους.
// Όποιος δεν αναγνωρίσει τον εαυτό του μέσα στα πρώτα δέκα δευτερόλεπτα φεύγει,
// ακόμη κι αν το προϊόν είναι ακριβώς αυτό που χρειάζεται. Τρεις στήλες, ένα
// βλέμμα: «αυτός είμαι εγώ».
const AUDIENCE = [
  // Μία γραμμή περιγραφή, τρία σημεία των τεσσάρων-πέντε λέξεων. Οι περιγραφές
  // ήταν προτάσεις δύο σειρών και τα σημεία έσπαγαν σε δύο και τρεις γραμμές το
  // καθένα — τρεις στήλες κειμένου δίπλα-δίπλα, που δεν σαρώνονται.
  {
    tag: 'Ιδιοκτήτης',
    t: 'Ένα ή δύο ακίνητα',
    d: 'Θέλεις να ξέρεις τι πληρώνεις, τι εισπράττεις και τι λήγει, χωρίς να το κρατάς στο μυαλό σου.',
    k: ['Λογαριασμοί και έγγραφα σε ένα σημείο', 'Ειδοποίηση πριν από κάθε προθεσμία', 'Απόδοση μετά τον φόρο, όχι μικτή'],
  },
  {
    tag: 'Επαγγελματίας',
    t: 'Χαρτοφυλάκιο και ομάδα',
    d: 'Διαχειρίζεσαι ακίνητα τρίτων και χρειάζεσαι ρόλους, επώνυμες αναφορές και έναν τόπο για όλα.',
    k: ['Χρήστες με ρόλους και δικαιώματα', 'Αναφορές με το σήμα σου', 'Συνιδιοκτήτες και αμοιβή διαχείρισης'],
  },
  {
    tag: 'Λογιστής',
    t: 'Πελάτες με ακίνητα',
    d: 'Κάθε Ιούνιο κυνηγάς στοιχεία που έπρεπε να υπάρχουν από τον Ιανουάριο. Εδώ υπάρχουν ήδη.',
    k: ['Ε2 με αντιστοίχιση κωδικών', 'Ημερολόγιο για SoftOne, Epsilon, Xero', 'Έλεγχος πληρότητας πριν την υποβολή'],
  },
];

// ΣΥΜΒΑΤΟΤΗΤΑ. Ένας ιδιοκτήτης δεν αλλάζει εργαλείο επειδή είναι όμορφο· το
// αλλάζει όταν πειστεί ότι δεν θα χάσει όσα ήδη δουλεύουν. Κάθε όνομα εδώ
// αντιστοιχεί σε πραγματική λειτουργία που υπάρχει στον κώδικα, όχι σε πρόθεση.
// Οκτώ κελιά και όχι δέκα: τα τέσσερα λογιστικά προγράμματα είχαν λέξη προς λέξη
// την ίδια περιγραφή, τέσσερις φορές στη σειρά. Η επανάληψη δεν διαβάζεται ως
// εύρος, διαβάζεται ως γέμισμα. Ζευγαρωμένα, το μάτι πιάνει και τα τέσσερα
// ονόματα και τη μία υπόσχεση που τα ενώνει.
const WORKS_WITH = [
  { t: 'myAADE', d: 'Δήλωση μίσθωσης με έλεγχο πληρότητας πριν την υποβολή' },
  { t: 'Έντυπο Ε2', d: 'εξαγωγή με αντιστοίχιση κωδικών, έτοιμη για τον λογιστή' },
  { t: 'SoftOne, Epsilon', d: 'λογιστικό ημερολόγιο εγγραφών, έτοιμο για εισαγωγή' },
  { t: 'QuickBooks, Xero', d: 'λογιστικό ημερολόγιο εγγραφών, έτοιμο για εισαγωγή' },
  { t: 'Airbnb, Booking.com', d: 'συγχρονισμός κρατήσεων μέσω iCal' },
  { t: 'Κινήσεις τράπεζας', d: 'εισαγωγή CSV και αυτόματη αντιστοίχιση με τα ενοίκια' },
  { t: 'Excel', d: 'εξαγωγή κάθε πίνακα, χωρίς κλείδωμα των δεδομένων σου' },
  { t: 'Λογαριασμός Google', d: 'σύνδεση χωρίς νέο κωδικό, αν το προτιμάς' },
];

const SECURITY = [
  { t: 'Κρυπτογραφημένη σύνδεση', d: 'Η επικοινωνία με το Property OS γίνεται πάντα μέσω TLS.', i: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4' },
  { t: 'Απομόνωση ανά χρήστη', d: 'Βλέπεις τα δικά σου δεδομένα. Πρόσβαση έχουν μόνο όσοι εσύ επιλέγεις: τα μέλη της ομάδας σου και όποιος έχει σύνδεσμο που εσύ έφτιαξες.', i: 'M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z' },
  { t: 'Καμία εκπαίδευση μοντέλων', d: 'Εμείς δεν χρησιμοποιούμε τα έγγραφα και τα δεδομένα σου για εκπαίδευση μοντέλων.', i: 'M12 2v4M12 18v4M2 12h4M18 12h4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
  { t: 'Βάση δεδομένων στην ΕΕ', d: 'Η βάση, η ταυτοποίηση και τα αρχεία σου φιλοξενούνται στην ΕΕ (Φρανκφούρτη). Σχεδιασμένο σύμφωνα με τον Κανονισμό GDPR· οι συμβάσεις με τους παρόχους εκτός ΕΕ ολοκληρώνονται πριν την εμπορική κυκλοφορία.', i: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M2 12h20M12 2c3 3 3 17 0 20M12 2c-3 3-3 17 0 20' },
];

// Δύο προγράμματα σύστασης: ιδιώτης (πρόσκληση) και επαγγελματίας (συνεργάτης).
const REFERRAL = [
  // ΔΥΟ ΓΡΑΜΜΕΣ ΑΝΑ ΣΗΜΕΙΟ, ΟΧΙ ΤΕΣΣΕΡΙΣ. Οι όροι ήταν γραμμένοι σαν συμβόλαιο
  // μέσα σε bullet: παρενθέσεις, εξαιρέσεις και προϋποθέσεις στην ίδια πρόταση.
  // Ό,τι είναι όρος και όχι υπόσχεση πάει στη γραμμή των ψιλών γραμμάτων.
  {
    tag: 'Ιδιώτες', t: 'Πρόγραμμα Πρόσκλησης',
    i: 'M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7S9 2 6.5 4.5 12 7 12 7zM12 7s3-5 5.5-2.5S12 7 12 7z',
    d: 'Με κάθε φίλο που ξεκινά, κερδίζετε και οι δύο.',
    items: ['Ο φίλος σου παίρνει έναν μήνα δώρο στο πλάνο που διαλέγει', 'Εσύ κερδίζεις ένα επιπλέον ακίνητο για έναν μήνα'],
  },
  {
    tag: 'Επαγγελματίες', t: 'Πρόγραμμα Συνεργατών',
    i: 'M3 7h18v13H3zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18',
    d: 'Για λογιστές, μεσίτες και διαχειριστές ακινήτων.',
    // ΟΧΙ ΠΡΟΜΗΘΕΙΑ ΣΕ ΜΕΤΡΗΤΑ. Η γραμμή έλεγε «20% επαναλαμβανόμενη προμήθεια»
    // ενώ πίσω της δεν υπάρχει ούτε ledger ούτε payout: ο πίνακας ανταμοιβών
    // δέχεται μόνο μήνες ή θέση ακινήτου, και η στρατηγική αποκλείει ρητά την
    // επεξεργασία πληρωμών. Υπόσχεση χρημάτων που δεν πληρώνεται, σε προϊόν που
    // πουλάει ακρίβεια, κοστίζει ακριβώς αυτό που πουλάει.
    items: ['5 συνδρομητές τον μήνα, 2 δωρεάν μήνες', 'Ως Συνεργάτης, κάθε μήνας που πιάνει τον στόχο κάνει τον επόμενο δωρεάν'],
  },
];

// ΤΑ ΠΑΚΕΤΑ ΤΗΣ ΑΡΧΙΚΗΣ: μόνο όσα αγοράζονται. Το δωρεάν είναι κατάσταση, όχι
// προϊόν, και ζει στα ψιλά γράμματα κάτω από τον πίνακα.
const LANDING_PLANS = PLAN_ORDER.filter(id => PLANS[id].priceMonthly > 0);
// Το προτεινόμενο είναι το «Ιδιοκτήτης»: εκεί υπάρχει περιθώριο να μεγαλώσει το
// χαρτοφυλάκιο (τρία ακίνητα και +2 € το καθένα), ενώ το «Ένα ακίνητο» είναι
// τελικός σταθμός. Ο μέσος αγοραστής δεν οδηγείται στο φθηνότερο, οδηγείται σε
// αυτό που δεν θα χρειαστεί να αλλάξει σε έξι μήνες.
const FEATURED_PLAN = 'owner';

const GAP = 'clamp(30px, 4.2vw, 56px)';
const GAP_ACT = 'clamp(48px, 6.5vw, 88px)';

const wrap: React.CSSProperties = { maxWidth: 1140, margin: '0 auto', padding: '0 clamp(20px, 5vw, 48px)' };
const ic = (d: string) => <svg width={21} height={21} viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{d.split('M').filter(Boolean).map((p, i) => <path key={i} d={'M' + p} />)}</svg>;
const check = <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M20 6 9 17l-5-5" /></svg>;

export default async function Landing() {
  // Η συνεδρία χρησιμοποιείται ΜΟΝΟ για να γράφει το κουμπί «Πίνακας» αντί για
  // «Σύνδεση». Είναι καλλωπισμός — και δεν επιτρέπεται να ρίχνει τη δημόσια
  // αρχική σελίδα. Χωρίς αυτό το try, μια στιγμιαία αστοχία του Supabase (ή μια
  // λάθος μεταβλητή περιβάλλοντος στο build) εμφανίζει «Κάτι πήγε στραβά» σε
  // κάθε επισκέπτη, τη στιγμή που τους δείχνουμε το προϊόν για πρώτη φορά.
  let loggedIn = false;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    loggedIn = !!user;
  } catch { /* ο επισκέπτης βλέπει απλώς «Σύνδεση» */ }

  return (
    <div className="lp-root" style={{ color: TEXT, minHeight: '100vh', fontFamily: T.font.sans, overflowX: 'clip', position: 'relative' }}>

      <style>{`
        /* Η ΒΙΤΡΙΝΑ ΕΙΝΑΙ ΞΕΧΩΡΙΣΤΟ ΘΕΜΑ, ΚΑΙ ΠΛΕΟΝ ΤΟ ΛΕΕΙ.
           Εδώ δεν ορίζεται κανένα χρώμα: γίνεται ΑΝΤΙΣΤΟΙΧΙΣΗ των tokens της
           εφαρμογής στην παλέτα --mkt-*, που ζει δηλωμένη στο app/globals.css
           δίπλα στα θέματα του προϊόντος. Πριν, αυτό το μπλοκ ξανάγραφε τα ίδια
           ονόματα με ΑΛΛΕΣ τιμές — δύο χρωματικά συστήματα με την ίδια ταμπέλα,
           αόρατα σε κάθε φύλακα ακριβώς επειδή τα ονόματα ταίριαζαν.
           Το scripts/guard-landing-theme.mjs απαγορεύει ωμό χρώμα εδώ. */
        .lp-root {
          --bg-base: var(--mkt-bg-base);
          --bg-surface: var(--mkt-bg-surface);
          --bg-elevated: var(--mkt-bg-elevated);
          --text-primary: var(--mkt-text-primary);
          --text-secondary: var(--mkt-text-secondary);
          --text-tertiary: var(--mkt-text-tertiary);
          --border-subtle: var(--mkt-border-subtle);
          --border-default: var(--mkt-border-default);
          --border-strong: var(--mkt-border-strong);
          --accent: var(--mkt-accent);
          --accent-text: var(--mkt-accent-text);
          --positive: var(--mkt-positive);
          --negative: var(--mkt-negative);
          /* Ένα συνεχόμενο, κινηματογραφικό μπλε-μαύρο «διάστημα» από πάνω μέχρι
             κάτω. Οι απαλές γαλάζιες κηλίδες μένουν καρφωμένες στην οθόνη
             (background-attachment: fixed), οπότε καθώς κυλάς νιώθεις ότι
             ταξιδεύεις μέσα σε έναν χώρο, όχι ότι σκρολάρεις μια σελίδα. */
          background:
            radial-gradient(1100px 760px at 50% -2%, var(--accent-border), transparent 60%),
            radial-gradient(900px 720px at 92% 20%, var(--accent-soft), transparent 55%),
            radial-gradient(820px 640px at 6% 74%, color-mix(in srgb, var(--mkt-accent) 6%, transparent), transparent 60%),
            linear-gradient(180deg, var(--mkt-space-top) 0%, var(--mkt-space-mid) 52%, var(--mkt-space-bottom) 100%);
          background-attachment: fixed;
          background-repeat: no-repeat;
        }
        .lp-skip { position: absolute; left: -9999px; top: 10px; z-index: 100; padding: 10px 16px; border-radius: 12px; background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border-subtle); font-size: 14px; font-weight: 600; text-decoration: none; }
        .lp-skip:focus { left: 12px; outline: 2px solid var(--accent); outline-offset: 2px; }
        .lp-card { position: relative; transition: transform .22s cubic-bezier(.2,0,0,1), box-shadow .22s cubic-bezier(.2,0,0,1), border-color .22s; }
        .lp-card:hover { transform: translateY(-3px); box-shadow: 0 20px 44px -20px rgba(0,0,0,.6); border-color: color-mix(in srgb, var(--accent) 40%, transparent); }

        /* Ο φωτισμός που ακολουθεί τον δείκτη. Οι συντεταγμένες γράφονται από το
           app/Spotlight.tsx, μία φορά ανά καρέ. Η αρχική τιμή είναι το πάνω μέσο
           της κάρτας, ώστε αν το JS δεν φορτώσει ποτέ, η κάρτα να δείχνει απλώς
           μια ήρεμη λάμψη από πάνω αντί για φως κολλημένο σε γωνία.
           Το ::after δεν πιάνει δείκτη, δεν έχει περιεχόμενο και δεν διαβάζεται
           από αναγνώστη οθόνης: είναι καθαρά φως. */
        .lp-card::after {
          content: ''; position: absolute; inset: 0; border-radius: inherit;
          pointer-events: none; opacity: 0; transition: opacity .3s ease;
          background: radial-gradient(320px circle at var(--sx, 50%) var(--sy, 0px),
            color-mix(in srgb, var(--accent) 12%, transparent) 0%, transparent 64%);
        }
        /* Μόνο σε συσκευή με πραγματικό δείκτη. Σε οθόνη αφής το φως θα έμενε
           καρφωμένο εκεί που ακούμπησε το δάχτυλο, δηλαδή θα ήταν λεκές. */
        @media (hover: hover) and (pointer: fine) {
          .lp-card:hover::after { opacity: 1; }
        }
        .lp-cta { transition: transform .15s, filter .15s; }
        .lp-cta:hover { transform: translateY(-1px); filter: brightness(1.05); }
        /* Μία κύρια ενέργεια, μία όψη: γεμάτο accent με σκούρο κείμενο. Ορίζεται
           ΜΟΝΟ εδώ. Κανένα inline background σε CTA, ώστε να μην μπορεί να
           ξαναδιαφοροποιηθεί κατά λάθος. Η ιεραρχία βγαίνει από την αντίθεση
           γεμάτου εναντίον περιγράμματος (.lp-ghost), όχι από δεύτερη απόχρωση. */
        .lp-primary { background: var(--accent); color: var(--accent-text); }
        .lp-ghost { transition: border-color .15s, background .15s, color .15s; }
        .lp-ghost:hover { border-color: color-mix(in srgb, var(--accent) 40%, transparent); background: color-mix(in srgb, var(--accent) 5%, transparent); color: var(--accent); }
        .lp-link { transition: color .15s; }
        .lp-link:hover { color: var(--accent) !important; }
        details.lp-faq summary { transition: color .18s; }
        details.lp-faq summary:hover { color: var(--accent); }
        details.lp-faq[open] summary { color: var(--accent); }
        details.lp-faq summary::-webkit-details-marker { display: none; }
        details.lp-faq[open] summary .lp-plus { transform: rotate(45deg); }
        /* Κινηματογραφικό hero: πάντα σκοτεινό, ανεξάρτητα από το θέμα της σελίδας.
           Το προϊόν φωτίζεται πάνω του σαν έκθεμα· η υπόλοιπη σελίδα μένει καθαρή. */
        /* Το hero δεν έχει δικό του φόντο πια: μοιράζεται το ενιαίο μπλε-μαύρο
           της σελίδας, ώστε να μην υπάρχει καμία ραφή από πάνω μέχρι κάτω. */
        .lp-hero { background: transparent; color: var(--text-primary); border-bottom: none; }
        .lp-hero .lp-aurora::before { opacity: .22; }
        .lp-hero .lp-aurora::after { opacity: .15; }
        .lp-hero .lp-rotor { color: var(--accent); }
        /* Ticker: αδιάκοπη οριζόντια ροή δυνατοτήτων, παύση στο πέρασμα του κέρσορα. */
        /* ═══ ΑΤΜΟΣΦΑΙΡΑ ═══════════════════════════════════════════════════════
           ΓΙΑΤΙ ΑΛΛΑΞΕ: το φόντο ήταν δύο θολές κηλίδες πάνω σε επίπεδο σκούρο
           μπλε. Διαβαζόταν ως «σκούρο θέμα», όχι ως σχεδιασμένη επιφάνεια — και
           η διαφορά ανάμεσα σε ένα καλό και σε ένα κορυφαίο dark site είναι
           ακριβώς αυτή: ΒΑΘΟΣ (πολλά επίπεδα σε διαφορετικές ταχύτητες), ΥΦΗ
           (κόκκος, που σπάει τα banding του gradient) και ΕΣΤΙΑΣΗ (βινιέτα).

           Τέσσερα επίπεδα, όλα σε ΕΝΑ σταθερό στρώμα ώστε να μην υπάρχει ραφή
           ανάμεσα στις ενότητες καθώς κυλά η σελίδα:
             1. πλέγμα προοπτικής, με μάσκα ώστε να σβήνει — το «2050» σήμα
             2. τρεις αύρες σε τρία βάθη και τρεις ταχύτητες → παράλλαξη
             3. κόκκος (SVG feTurbulence, inline) → υφή, όχι πλαστικό
             4. βινιέτα → το βλέμμα πηγαίνει στο κέντρο, όχι στις άκρες
           Κάθε επίπεδο είναι σκόπιμα ΜΟΛΙΣ ορατό. Το «premium» δεν είναι τα
           εφέ· είναι ότι δεν καταλαβαίνεις γιατί φαίνεται ακριβό. */
        .lp-atmos { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
        /* 1. Πλέγμα: 72px κελί, σβήνει με ακτινική μάσκα ώστε να μη μοιάζει με
              λογιστικό φύλλο. Φαίνεται μόνο στο πάνω μέρος, πίσω από τον τίτλο. */
        .lp-atmos::before {
          content: ''; position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(138,180,248,.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(138,180,248,.06) 1px, transparent 1px);
          background-size: 72px 72px;
          -webkit-mask-image: radial-gradient(ellipse 76% 52% at 50% 0%, #000 0%, transparent 72%);
          mask-image: radial-gradient(ellipse 76% 52% at 50% 0%, #000 0%, transparent 72%);
        }
        /* 3+4. Κόκκος και βινιέτα στο ίδιο επίπεδο. Ο κόκκος μπαίνει με
                mix-blend-mode ώστε να ΔΙΑΜΟΡΦΩΝΕΙ τα από κάτω χρώματα αντί να
                κάθεται σαν γκρίζο πέπλο πάνω τους. */
        .lp-atmos::after {
          content: ''; position: absolute; inset: -50%;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          opacity: .05; mix-blend-mode: overlay;
          animation: lpGrain 8s steps(1) infinite;
        }
        /* Ο κόκκος «ζει»: μετατοπίζεται σε οκτώ θέσεις. Ακίνητος κόκκος φαίνεται
           σαν λερωμένη οθόνη· κόκκος που αναπνέει φαίνεται σαν φιλμ. */
        @keyframes lpGrain {
          0%,100% { transform: translate(0,0); }      12.5% { transform: translate(-4%,-3%); }
          25% { transform: translate(3%,-5%); }        37.5% { transform: translate(-2%,4%); }
          50% { transform: translate(4%,2%); }         62.5% { transform: translate(-5%,1%); }
          75% { transform: translate(2%,-4%); }        87.5% { transform: translate(-3%,3%); }
        }
        /* 2. Οι αύρες. Τρεις, σε τρεις αποχρώσεις της ΙΔΙΑΣ οικογένειας (γαλάζιο,
              μία απόχρωση, το accent): το βάθος βγαίνει από μέγεθος, θολούρα και
              διαφάνεια — όχι από δεύτερο και τρίτο χρώμα εκτός παλέτας. */
        .lp-aurora { position: absolute; inset: -14% -18% auto; height: 118%; z-index: 0; pointer-events: none; }
        .lp-aurora::before, .lp-aurora::after,
        .lp-atmos .lp-orb { content: ''; position: absolute; border-radius: 50%; will-change: transform; }
        .lp-aurora::before { content: ''; width: min(56vw, 720px); aspect-ratio: 1; top: -8%; left: -8%; opacity: .15; filter: blur(100px); background: radial-gradient(circle, var(--accent), transparent 64%); animation: lpDrift 34s ease-in-out infinite alternate; }
        .lp-aurora::after  { content: ''; width: min(44vw, 560px); aspect-ratio: 1; top: 12%; right: -8%; opacity: .11; filter: blur(80px);  background: radial-gradient(circle, var(--accent), transparent 66%); animation: lpDrift 46s ease-in-out -12s infinite alternate-reverse; }
        .lp-atmos .lp-orb { width: min(70vw, 900px); aspect-ratio: 1; left: 50%; top: 34%; margin-left: -35vw; opacity: .085; filter: blur(130px); background: radial-gradient(circle, var(--accent), transparent 62%); animation: lpDrift 62s ease-in-out -25s infinite alternate; }
        @keyframes lpDrift { from { transform: translate3d(0, 0, 0) scale(1); } to { transform: translate3d(5vw, 4vh, 0) scale(1.16); } }

        /* ═══ Η ΕΝΑΛΛΑΣΣΟΜΕΝΗ ΛΕΞΗ ════════════════════════════════════════════
           ΓΙΑΤΙ ΑΛΛΑΞΕ: η εναλλαγή περνούσε απαρατήρητη. Η κίνηση ήταν 16px και
           ο χρόνος 3s ανά λέξη — αρκετά αργή ώστε ο επισκέπτης να προλάβει να
           κοιτάξει αλλού, και αρκετά διακριτική ώστε να μη διαβάζεται ως πρόθεση.
           Τώρα: η λέξη μπαίνει από κάτω ΜΕ ΘΟΛΩΜΑ (κίνηση με motion blur — αυτό
           ακριβώς διαβάζεται ως ακριβό) και από κάτω της τρέχει μια γραμμή που
           ξαναγράφεται σε κάθε αλλαγή. Η γραμμή είναι το σήμα «αυτό αλλάζει»:
           χωρίς αυτήν, κάθε εναλλαγή έμοιαζε με τυχαία ανανέωση της σελίδας. */
        /* justify-items: start και ΟΧΙ center. Και οι τέσσερις λέξεις μοιράζονται
           ΕΝΑ κελί με το πλάτος της μακρύτερης («το ασφαλιστήριο.»), οπότε με
           κεντράρισμα κάθε κοντύτερη λέξη άφηνε κενό ΚΑΙ στις δύο πλευρές — μια
           ορατή τρύπα στη μέση της πρότασης, αμέσως μετά το «Φωτογραφίζεις».
           Με start η λέξη κολλάει στο ρήμα και το περίσσευμα πέφτει στο τέλος της
           γραμμής, όπου το κενό είναι αόρατο. */
        .lp-rotor { display: inline-grid; justify-items: start; color: var(--accent); }
        .lp-rotor > span { grid-area: 1 / 1; position: relative; opacity: 0; white-space: nowrap; animation: lpRotor 11.2s cubic-bezier(.16,1,.3,1) infinite; }
        .lp-rotor > span:nth-child(2) { animation-delay: 2.8s; }
        .lp-rotor > span:nth-child(3) { animation-delay: 5.6s; }
        .lp-rotor > span:nth-child(4) { animation-delay: 8.4s; }
        @keyframes lpRotor {
          0%   { opacity: 0; transform: translateY(.34em) scale(.97); filter: blur(6px); }
          5%   { opacity: 1; transform: none; filter: blur(0); }
          21%  { opacity: 1; transform: none; filter: blur(0); }
          26%  { opacity: 0; transform: translateY(-.28em) scale(.99); filter: blur(5px); }
          100% { opacity: 0; }
        }
        /* Η γραμμή ανήκει στην ΚΑΘΕ ΛΕΞΗ, όχι στο κοινό κελί: αλλιώς είχε πάντα
           το πλάτος της μακρύτερης και ξεπερνούσε ορατά τις κοντύτερες. Κληρονομεί
           το animation-delay της λέξης της, οπότε γράφεται ακριβώς όταν εκείνη
           εμφανίζεται — και σβήνει μαζί της, αφού το opacity του γονέα την παρασύρει. */
        /* ΧΩΡΙΣ ΥΠΟΓΡΑΜΜΙΣΗ. Η λέξη εναλλάσσεται ήδη και είναι ήδη σε άλλο χρώμα:
           δύο σήματα για το ίδιο πράγμα. Η γραμμή από κάτω πρόσθετε ένα τρίτο,
           κινούμενο, που τραβούσε το βλέμμα σε ένα διακοσμητικό στοιχείο αντί για
           τη λέξη. Ο τίτλος διαβάζεται πιο καθαρά χωρίς αυτήν. */
        @keyframes lpUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .lp-rise { animation: lpUp .6s cubic-bezier(.2,0,0,1) both; }
        .lp-rise-2 { animation: lpUp .6s cubic-bezier(.2,0,0,1) .06s both; }
        .lp-rise-3 { animation: lpUp .6s cubic-bezier(.2,0,0,1) .12s both; }
        .lp-rise-4 { animation: lpUp .6s cubic-bezier(.2,0,0,1) .18s both; }
        @keyframes lpReveal { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
        @supports (animation-timeline: view()) {
          @media (prefers-reduced-motion: no-preference) {
            .lp-reveal { animation: lpReveal linear both; animation-timeline: view(); animation-range: entry 3% cover 18%; }
          }
        }
        /* ═══ ΔΙΑΤΑΞΗ ΤΑΜΠΛΕΤΑΣ ΚΑΙ ΚΙΝΗΤΟΥ ═══════════════════════════════════
           ΓΙΑΤΙ ΧΤΙΣΤΗΚΕ ΞΕΧΩΡΙΣΤΑ: η σελίδα δεν είχε διάταξη για μικρές οθόνες
           — είχε ΑΠΟΥΣΙΑ διάταξης. Όλα τα πλέγματα ήταν auto-fit minmax(), που
           σημαίνει ότι κάτω από ένα πλάτος καταρρέουν σε ΜΙΑ στήλη και η σελίδα
           γίνεται μια ατέλειωτη στοίβα: 12.207px στα 390px πλάτος, δηλαδή 14
           οθόνες κύλισης. Κανείς δεν φτάνει στο τέλος.

           Η λύση ΔΕΝ είναι μικρότερα περιθώρια. Είναι διαφορετική ΜΟΡΦΗ ανά
           μέγεθος: ό,τι σε desktop είναι πλέγμα καρτών, σε κινητό γίνεται είτε
           συμπαγής λίστα είτε οριζόντιο καρουζέλ με snap. Το καρουζέλ είναι το
           μοτίβο που χρησιμοποιεί κάθε κορυφαίο προϊόν στο κινητό, ακριβώς
           επειδή μετατρέπει ύψος (που κοστίζει κύλιση) σε πλάτος (που δεν
           κοστίζει τίποτα).

           Τρία σκαλιά: ταμπλέτα 861-1024, μικρή ταμπλέτα 601-860, κινητό ≤600. */

        /* ── ΤΑΜΠΛΕΤΑ ────────────────────────────────────────────────────── */
        /* ── ΚΕΦΑΛΙΔΕΣ ΕΝΟΤΗΤΩΝ ────────────────────────────────────────────
           ΓΙΑΤΙ ΕΦΥΓΕ ΤΟ ΚΕΝΤΡΑΡΙΣΜΑ: κάθε ενότητα είχε τίτλο και υπότιτλο
           κεντραρισμένα σε στήλη 540px. Επτά φορές την ίδια στοίχιση, την ίδια
           στοίβα, το ίδιο πλάτος. Είναι η προεπιλογή κάθε προτύπου, και ο
           επισκέπτης τη διαβάζει ακριβώς έτσι: ως πρότυπο. Το ανθρώπινο μάτι
           επιστρέφει σε σταθερό αριστερό άξονα όταν διαβάζει· το κέντρο το
           αναγκάζει να ψάχνει την αρχή κάθε γραμμής από την αρχή.

           Τώρα ο τίτλος κρατά τον αριστερό άξονα και ο υπότιτλος πάει δίπλα
           του, με τις βάσεις των δύο ευθυγραμμισμένες. Κερδίζουμε και ύψος:
           η στοιβαγμένη κεφαλίδα ήταν περίπου 140px, η ζυγισμένη είναι 90px.
           Επί έξι ενότητες, 300px λιγότερη κύλιση χωρίς να λείψει λέξη. */
        /* ── ΓΡΑΜΜΗ ΠΡΟΟΔΟΥ ΑΝΑΓΝΩΣΗΣ ───────────────────────────────────────
           Δύο εικονοστοιχεία στην κορυφή που γεμίζουν όσο κατεβαίνει η σελίδα.
           Σε σελίδα εννέα χιλιάδων εικονοστοιχείων, ο επισκέπτης δεν έχει καμία
           αίσθηση του πόσο απομένει· η μπάρα του τη δίνει χωρίς να ζητήσει
           τίποτα και χωρίς να καταλάβει χώρο.

           ΧΩΡΙΣ ΚΑΘΟΛΟΥ JAVASCRIPT: το animation-timeline: scroll() δένει την
           κίνηση απευθείας στη θέση κύλισης, οπότε δεν υπάρχει ακροατής, δεν
           υπάρχει επανασχεδίαση ανά καρέ και δεν υπάρχει καθυστέρηση.

           ΓΙΑΤΙ ΜΕΣΑ ΣΕ @supports: όπου δεν υποστηρίζεται, το animation-timeline
           αγνοείται ΑΛΛΑ η κίνηση παραμένει. Με μηδενική διάρκεια θα πήγαινε
           κατευθείαν στο τελικό καρέ, δηλαδή μια μόνιμα γεμάτη μπάρα που δεν
           σημαίνει τίποτα. Έτσι, όπου δεν υπάρχει η δυνατότητα, δεν υπάρχει και
           το στοιχείο. */
        /* ΚΑΝΟΝΑΣ ΟΝΟΜΑΤΩΝ: το πρόθεμα lp- ανήκει αποκλειστικά σε ΑΥΤΟ το αρχείο.
           Κάθε component γράφει δικές του κλάσεις με δικό του πρόθεμα (ls- για το
           showcase, story- για το scrollytelling, calc- για τον υπολογιστή).
           Η γραμμή ανάγνωσης λεγόταν .lp-progress και το showcase όριζε κι εκείνο
           .lp-progress για τη μπάρα των καρτελών του: δύο καθολικά <style> με την
           ίδια κλάση, όπου το ένα ακύρωνε το άλλο. Το όνομα είναι πλέον ρητό. */
        .lp-readbar { display: none; }
        @supports (animation-timeline: scroll()) {
          .lp-readbar {
            display: block; position: fixed; inset: 0 0 auto 0; height: 2px;
            z-index: 60; pointer-events: none; transform-origin: 0 50%;
            background: var(--accent);
            animation: lpProgress linear both;
            animation-timeline: scroll(root block);
          }
        }
        @keyframes lpProgress { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @media (prefers-reduced-motion: reduce) { .lp-readbar { display: none; } }

        .lp-hair {
          height: 1px; border: 0; margin: 0 0 clamp(18px, 2.4vw, 28px);
          background: linear-gradient(90deg,
            var(--border-default) 0%, var(--border-subtle) 42%, transparent 100%);
        }
        /* Block-level (και όχι inline-flex): τα κάθετα περιθώρια ενός inline
           κουτιού δεν μετακινούν τη γραμμή από κάτω, οπότε το margin-bottom
           απλώς δεν θα ίσχυε και ο τίτλος θα κολλούσε στην ετικέτα. */
        .lp-eyebrow {
          display: flex; width: fit-content; align-items: center; gap: 9px;
          font-size: 12px; font-weight: 700; letter-spacing: 0.13em;
          text-transform: uppercase; color: var(--text-tertiary);
          margin-bottom: 13px;
        }
        .lp-eyebrow::before {
          content: ''; width: 5px; height: 5px; border-radius: 50%;
          background: var(--accent); flex-shrink: 0;
        }

        /* Για ποιον είναι: τρεις ισοδύναμες στήλες. Καμία δεν είναι «η κύρια»,
           γιατί κανείς από τους τρεις δεν είναι δευτερεύων πελάτης. */
        .lp-aud { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; align-items: stretch; }

        /* Συμβατότητα: πυκνό πλέγμα ονομάτων. Το κελί δεν έχει δικό του πλαίσιο,
           μόνο τις εσωτερικές γραμμές του πλέγματος, ώστε να διαβάζεται ως ΕΝΑΣ
           πίνακας και όχι ως δέκα κάρτες που ζητούν χωριστά την προσοχή. */
        .lp-works {
          display: grid; grid-template-columns: repeat(4, 1fr);
          gap: 1px; background: var(--border-subtle);
          border: 1px solid var(--border-subtle); border-radius: 14px; overflow: hidden;
        }
        .lp-works > div { background: var(--bg-surface); padding: 18px 18px 17px; }

        @media (max-width: 1024px) {
          /* Δύο στήλες αντί για τρεις: τρεις κάρτες στα 1024 αφήνουν 300px η
             καθεμία, όπου ο ελληνικός τίτλος σπάει σε τρεις γραμμές. */
          .lp-feat { grid-template-columns: repeat(2, 1fr) !important; }
          .lp-stats { grid-template-columns: repeat(2, 1fr) !important; }
          .lp-works { grid-template-columns: repeat(3, 1fr); }
        }

        /* ── ΚΙΝΗΤΟ ΚΑΙ ΜΙΚΡΗ ΤΑΜΠΛΕΤΑ ──────────────────────────────────── */
        @media (max-width: 860px) {
          /* ΠΛΑΝΑ ΣΕ ΚΑΡΟΥΖΕΛ. Τρεις κάρτες τιμολόγησης στοιβαγμένες είναι
             1.950px — το 16% ολόκληρης της σελίδας για κάτι που ο επισκέπτης
             θέλει να ΣΥΓΚΡΙΝΕΙ, και η σύγκριση είναι αδύνατη όταν δεν βλέπεις
             δύο μαζί. Οριζόντια, με snap, βλέπει τη μία και μισή και σέρνει. */
          .lp-plans, .lp-duo, .lp-aud {
            display: flex !important; gap: 12px;
            overflow-x: auto; overflow-y: hidden;
            scroll-snap-type: x mandatory;
            scroll-padding-inline: 20px;
            /* Αρνητικά περιθώρια ώστε το καρουζέλ να «βγαίνει» ως την άκρη της
               οθόνης: μια κάρτα που κόβεται στο χείλος λέει «υπάρχουν κι άλλες»
               χωρίς να χρειάζεται βελάκι ή κουκκίδες. */
            margin-inline: calc(-1 * clamp(20px, 5vw, 48px));
            padding-inline: clamp(20px, 5vw, 48px);
            padding-bottom: 6px;
            scrollbar-width: none;
          }
          .lp-plans::-webkit-scrollbar, .lp-duo::-webkit-scrollbar,
          .lp-aud::-webkit-scrollbar { display: none; }
          .lp-plans > *, .lp-duo > *, .lp-aud > * {
            flex: 0 0 min(84vw, 320px); scroll-snap-align: center;
          }

          /* ΔΥΝΑΤΟΤΗΤΕΣ ΣΕ ΛΙΣΤΑ. Επτά κάρτες με εικονίδιο ΠΑΝΩ από τον τίτλο
             είναι 1.652px. Το ίδιο περιεχόμενο σε σειρές — εικονίδιο αριστερά,
             κείμενο δεξιά — είναι κάτω από τις μισές, και διαβάζεται πιο γρήγορα
             γιατί το μάτι σαρώνει κάθετα μια στήλη τίτλων αντί να πηδά. */
          .lp-feat { grid-template-columns: 1fr !important; gap: 10px !important; }
          .lp-feat > .lp-card {
            display: grid; grid-template-columns: 40px 1fr; column-gap: 14px;
            align-items: start; padding: 16px 18px !important;
          }
          .lp-feat > .lp-card > div:first-child {
            width: 40px !important; height: 40px !important; margin-bottom: 0 !important;
            grid-row: 1 / span 2; border-radius: 11px !important;
          }
          .lp-feat > .lp-card > h3 { margin: 2px 0 4px !important; font-size: 16px !important; }
          /* Τρεις γραμμές και όχι επτά. Οι περιγραφές γράφτηκαν για κάρτα πλάτους
             300px σε desktop· στο κινητό η ίδια πρόταση γίνεται επτάγραμμη και η
             κάρτα 212px. Ο επισκέπτης σε κινητό ΣΑΡΩΝΕΙ — θέλει να καταλάβει σε
             δύο δευτερόλεπτα αν τον αφορά, όχι να διαβάσει παράγραφο. Το πλήρες
             κείμενο μένει ακέραιο στο DOM (άρα και για τις μηχανές αναζήτησης
             και για τους αναγνώστες οθόνης)· κόβεται μόνο οπτικά. */
          .lp-feat > .lp-card > p {
            font-size: 14px !important; line-height: 1.55 !important;
            display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
            overflow: hidden;
          }
        }

        @media (max-width: 860px) {
          .lp-works { grid-template-columns: repeat(2, 1fr); }
        }

        @media (max-width: 600px) {
          /* Οι μετρήσεις σε 2×2: τέσσερα νούμερα σε στήλη είναι τέσσερις οθόνες
             για τέσσερα νούμερα. Σε τετράγωνο διαβάζονται με μια ματιά. */
          .lp-stats { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 760px) { .lp-split { grid-template-columns: 1fr !important; } }
        .lp-only-xs { display: none; }
        @media (max-width: 520px) { .lp-hide-xs { display: none !important; } .lp-only-xs { display: inline !important; } }
        @media (prefers-reduced-motion: reduce) {
          .lp-rise, .lp-rise-2, .lp-rise-3, .lp-rise-4, .lp-reveal { animation: none !important; }
          .lp-aurora::before, .lp-aurora::after, .lp-atmos .lp-orb { animation: none !important; }
          .lp-atmos::after { animation: none !important; }
          .lp-rotor > span { animation: none !important; }
          .lp-rotor > span:first-child { opacity: 1; }
        }
      `}</style>

      <a href="#main" className="lp-skip">Μετάβαση στο περιεχόμενο</a>

      <div className="lp-readbar" aria-hidden="true" />

      {/* Το σταθερό στρώμα ατμόσφαιρας: πλέγμα, τρίτη αύρα, κόκκος, βινιέτα.
          Είναι `fixed` ώστε να μην υπάρχει ραφή ανάμεσα στις ενότητες καθώς
          κυλά η σελίδα — αν ήταν ανά ενότητα, κάθε όριο θα φαινόταν. */}
      <div className="lp-atmos" aria-hidden="true"><div className="lp-orb" /></div>

      {/* ── Nav ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'color-mix(in srgb, var(--bg-base) 78%, transparent)', backdropFilter: 'saturate(180%) blur(14px)', WebkitBackdropFilter: 'saturate(180%) blur(14px)', borderBottom: `1px solid ${LINE}` }}>
        <nav style={{ ...wrap, height: 64, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <BrandMark />
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>Property OS</span>
          </div>
          {loggedIn ? (
            <Link href="/dashboard" className="lp-cta lp-primary" style={{ textDecoration: 'none', fontSize: 14, fontWeight: 700, padding: '9px 18px', borderRadius: 100 }}>Ο πίνακάς σου</Link>
          ) : (<>
            {/* ΧΩΡΙΣ lp-hide-xs: κάτω από 520px το «Σύνδεση» εξαφανιζόταν εντελώς και
                ο επιστρέφων χρήστης έβλεπε ΜΟΝΟ «Ξεκίνα δωρεάν» — δηλαδή του
                προτείναμε να φτιάξει δεύτερο λογαριασμό. Στο κινητό το κείμενο
                κονταίνει σε «Είσοδος», δεν σβήνει. */}
            <Link href="/login" className="lp-link" style={{ color: MUTED, textDecoration: 'none', fontSize: 14, fontWeight: 600, padding: '8px 10px', whiteSpace: 'nowrap' }}>
              <span className="lp-hide-xs">Σύνδεση</span><span className="lp-only-xs">Είσοδος</span>
            </Link>
            {/* Μόλις μπήκε το «Είσοδος» στο κινητό, τα τρία στοιχεία δεν χωρούσαν σε
                390px και ΚΑΙ η μάρκα ΚΑΙ το κουμπί έσπαγαν σε δύο γραμμές. Στις πολύ
                στενές οθόνες το κουμπί λέει σκέτο «Δωρεάν» — η υπόσχεση μένει ίδια,
                χάνεται μόνο η λέξη που ο χρήστης έχει ήδη διαβάσει στον τίτλο. */}
            <Link href="/signup" className="lp-cta lp-primary" style={{ textDecoration: 'none', fontSize: 14, fontWeight: 700, padding: '9px 16px', borderRadius: 100, whiteSpace: 'nowrap' }}>
              <span className="lp-hide-xs">Ξεκίνα δωρεάν</span><span className="lp-only-xs">Δωρεάν</span>
            </Link>
          </>)}
        </nav>
      </header>

      <main id="main">
      {/* Ένας ακροατής για όλες τις κάρτες της σελίδας. Δεν προσθέτει κουτί στη
          διάταξη (display: contents), οπότε τα sticky και τα πλέγματα από μέσα
          μένουν ακριβώς όπως ήταν. */}
      <Spotlight>

      {/* ── Hero: κινηματογραφικό, πάντα σκοτεινό, με το προϊόν φωτισμένο σαν έκθεμα ── */}
      <section className="lp-hero" style={{ position: 'relative', overflow: 'hidden' }}>
        <div className="lp-aurora" aria-hidden="true" />
        {/* ΓΙΑΤΙ ΤΟΣΟ ΣΦΙΧΤΟ: το hero κατανάλωνε ΟΛΟ το πρώτο viewport (112px πάνω,
            τίτλος έως 78px, 84px κάτω) και το προϊόν ξεκινούσε στα ~1080px — δηλαδή
            ο επισκέπτης έβλεπε μόνο κείμενο και έπρεπε να κυλήσει για να δει τι
            αγοράζει. Κάθε κορυφαίο προϊόν δείχνει το προϊόν ΜΕΣΑ στην πρώτη οθόνη. */}
        <div style={{ ...wrap, position: 'relative', zIndex: 1, paddingTop: 'clamp(40px, 5.5vw, 68px)', paddingBottom: GAP, textAlign: 'center' }}>
          {/* ΤΟ ΧΕΙΡΟΤΕΡΟ ΣΦΑΛΜΑ ΠΟΥ ΔΙΟΡΘΩΘΗΚΕ ΕΔΩ: η δεύτερη σειρά — αυτή που
              περιέχει το ΟΝΟΜΑ ΤΟΥ ΠΡΟΪΟΝΤΟΣ — ήταν rgba(255,255,255,.52), δηλαδή
              το πιο αχνό στοιχείο ολόκληρης της σελίδας. Δεν διαβαζόταν ως
              σχεδιαστική ιεράρχηση· διαβαζόταν ως απενεργοποιημένο κείμενο.
              Η ιεράρχηση προκύπτει τώρα από το ΧΡΩΜΑ ΤΟΥ ΤΟΝΟΥ (το εναλλασσόμενο
              αντικείμενο σε accent) και όχι από ξεθώριασμα του brand.
              Και το μέγεθος έπεσε από 78px σε 60px: στα 78 ο τίτλος έσπαγε σε
              τέσσερις γραμμές με κακά σημεία κοπής («…κάνει τα / υπόλοιπα»). */}
          <h1 className="lp-rise" style={{ fontSize: 'clamp(32px, 5.2vw, 60px)', fontWeight: 680, letterSpacing: '-0.035em', lineHeight: 1.1, margin: '0 auto 20px', maxWidth: 1000, color: 'var(--text-primary)', textWrap: 'balance' }}>
            Φωτογραφίζεις{' '}
            <span className="lp-rotor">
              <span>τον λογαριασμό.</span>
              <span aria-hidden="true">το μισθωτήριο.</span>
              <span aria-hidden="true">το ασφαλιστήριο.</span>
              <span aria-hidden="true">τον ΕΝΦΙΑ.</span>
            </span>
            <br />
            {/* nowrap ώστε να μη μένει ποτέ το «υπόλοιπα.» μόνο του σε τρίτη γραμμή:
                ένα ορφανό στο τέλος τίτλου διαβάζεται ως τυπογραφικό ατύχημα. Σε
                στενές οθόνες το clamp ρίχνει το μέγεθος, οπότε χωράει ούτως ή άλλως. */}
            <span style={{ whiteSpace: 'nowrap' }}>Το Property OS</span> κάνει τα υπόλοιπα.
          </h1>
          {/* ── Ο ΥΠΟΤΙΤΛΟΣ: δύο προτάσεις, δύο δουλειές ──────────────────────────
              Η πρώτη λέει το ΕΥΡΟΣ. Τέσσερα ουσιαστικά χωρίς συνδέσμους (ασύνδετο
              σχήμα) — το «και» πριν από το τελευταίο θα κόστιζε ρυθμό χωρίς να
              προσθέτει νόημα, και ο ρυθμός είναι το μισό «premium» σε ένα hero.
              Έφυγαν οι «δαπάνες»: επικαλύπτονται με τους λογαριασμούς και η λίστα
              στα πέντε στοιχεία παύει να διαβάζεται με μια ματιά.

              Η δεύτερη λέει το ΜΟΝΑΔΙΚΟ. Δεν λέει «έχει AI» — αυτό το λένε όλοι.
              Λέει δύο πράγματα που κανείς άλλος δεν μπορεί να πει: ότι σκέφτεται
              ΣΤΑ ΕΛΛΗΝΙΚΑ, και ότι απαντά για ΤΑ ΔΙΚΑ ΣΟΥ δεδομένα — δηλαδή δεν
              είναι συνομιλία με εγκυκλοπαίδεια, είναι με το ακίνητό σου.

              ΓΙΑΤΙ ΟΧΙ ΤΑ ΤΡΙΑ ΡΗΜΑΤΑ («προγραμματίζει, ενημερώνει, συμβουλεύει»):
              είναι καλή τριάδα, αλλά σε hero τρεις προτάσεις γίνονται παράγραφος
              και η παράγραφος δεν διαβάζεται. Ζουν πιο κάτω, εκεί που ο επισκέπτης
              έχει ήδη αποφασίσει ότι τον ενδιαφέρει και θέλει λεπτομέρεια. */}
          {/* ΠΛΑΤΟΣ 880: ΜΙΑ γραμμή σε οθόνη υπολογιστή. Μετρημένο — στη μέγιστη
              γραμματοσειρά (18.5px) η πρόταση θέλει 824px· το όριο ήταν 760 και
              την έσπαγε πάντα στα δύο. Τα 880 αφήνουν περιθώριο για διαφορές
              απόδοσης γραμματοσειράς χωρίς να επιτρέπουν τρίτη γραμμή.
              Μία γραμμή διαβάζεται ως δήλωση· δύο, ως παράγραφος.

              Σε κινητό και tablet η πρόταση αναδιπλώνεται φυσιολογικά: η
              γραμματοσειρά μικραίνει με clamp() και το textWrap: balance μοιράζει
              τις γραμμές σε ίσο μήκος, ώστε να μη μένει η τελευταία με τρεις
              λέξεις. Δεν χρησιμοποιείται nowrap: θα έβγαζε το κείμενο εκτός
              οθόνης στα στενά πλάτη. */}
          <p className="lp-rise-2" style={{ fontSize: 'clamp(15px, 1.75vw, 17.5px)', color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: '100%', margin: '0 auto 28px', textWrap: 'balance' }}>
            Ενοίκια, λογαριασμοί, δάνεια και φόροι σε ένα σημείο. Ρωτάς στα ελληνικά
            και ο βοηθός απαντά με{' '}
            <em style={{ fontStyle: 'normal', color: 'var(--text-primary)', fontWeight: 600 }}>τα δικά σου</em> δεδομένα και αριθμούς.
          </p>
          <div className="lp-rise-3" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {loggedIn ? (
              <Link href="/dashboard" className="lp-cta lp-primary" style={{ textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '14px 28px', borderRadius: 100 }}>Άνοιξε τον πίνακά σου</Link>
            ) : (<>
              <Link href="/signup" className="lp-cta lp-primary" style={{ textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '14px 28px', borderRadius: 100 }}>Ξεκίνα δωρεάν</Link>
              <Link href="/login" style={{ background: 'transparent', color: 'var(--text-primary)', textDecoration: 'none', fontSize: 15, fontWeight: 600, padding: '14px 28px', borderRadius: 100, border: '1px solid var(--border-strong)', transition: 'border-color .15s, background .15s' }}>Έχω λογαριασμό</Link>
            </>)}
          </div>
          <div className="lp-rise-4" style={{ marginTop: 18, fontSize: 13, color: 'var(--text-tertiary)' }}>Το πρώτο ακίνητο δωρεάν για πάντα · Έτοιμο σε ένα λεπτό · Επιβεβαιώνεις εσύ κάθε καταχώρηση</div>

          <LandingShowcase />
        </div>

      </section>

      {/* ── Proof band: μετρήσιμα, πραγματικά (χωρίς ψεύτικα «νούμερα χρηστών») ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingBottom: GAP_ACT }}>
        {/* Ρητά τέσσερις στήλες, όχι auto-fit: με minmax(200px) στα 1440 ο browser
            χωρούσε ΠΕΝΤΕ κολόνες για τέσσερα στοιχεία, οπότε η ζώνη τελείωνε με
            ένα άδειο κελί που έδειχνε μόνο το χρώμα του πλέγματος. Οι μετρήσεις
            είναι τέσσερις εξ ορισμού· το πλέγμα οφείλει να το ξέρει. */}
        <div className="lp-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 1, background: LINE, border: `1px solid ${LINE}`, borderRadius: 14, overflow: 'hidden' }}>
          {STATS.map((s, i) => (
            <div key={i} style={{ padding: 'clamp(20px, 3vw, 26px) 22px', background: PANEL }}>
              {/* Το νούμερο και η μονάδα του σε κοινή βάση. Ένας αριθμός χωρίς
                  μονάδα δεν είναι μέτρηση, είναι διακόσμηση. */}
              {/* flexWrap: στα 390px το κελί έχει 165px και το ζεύγος «2026 φορολογία»
                  δεν χωρά σε μία γραμμή. Χωρίς αυτό, η ζώνη αποκτούσε οριζόντια
                  κύλιση μέσα σε σελίδα που αλλού δεν έχει καμία. */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 9, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 'clamp(26px, 3.2vw, 34px)', fontWeight: 680, letterSpacing: '-0.035em', color: TEXT, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{s.n}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: ACCENT }}>{s.u}</span>
              </div>
              <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.5 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Για ποιον είναι: ο επισκέπτης βρίσκει τον εαυτό του πριν διαβάσει ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingBottom: GAP }}>
        <SectionHead over="Για ποιον είναι" title="Τρεις άνθρωποι, τρεις διαφορετικές ανάγκες" sub="Ίδια βάση δεδομένων και εργαλεία που προσαρμόζονται στις ανάγκες και τις απαιτήσεις σου." />
        <div className="lp-aud">
          {AUDIENCE.map((a, i) => (
            <div key={i} className="lp-card" style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 14, padding: 'clamp(22px, 2.6vw, 28px)', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: ACCENT, marginBottom: 12 }}>{a.tag}</span>
              <h3 style={{ fontSize: 16, fontWeight: 680, margin: '0 0 8px', letterSpacing: '-0.02em', textWrap: 'balance' }}>{a.t}</h3>
              {/* minHeight τριών γραμμών: οι τρεις περιγραφές πιάνουν τρεις γραμμές
                  η καθεμία, αλλά όχι πάντα. Χωρίς κατώφλι, οι τρεις λίστες από
                  κάτω ξεκινούσαν σε τρία διαφορετικά ύψη και το μάτι το έπιανε
                  αμέσως, επειδή τα σημάδια ελέγχου είναι επαναλαμβανόμενο σχήμα
                  και κάθε απόκλιση σε επαναλαμβανόμενο σχήμα φαίνεται. */}
              <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, margin: '0 0 18px', minHeight: 72, textWrap: 'pretty' }}>{a.d}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 'auto' }}>
                {a.k.map((t, j) => (
                  <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>{check}<span style={{ fontSize: 15, color: TEXT, lineHeight: 1.5 }}>{t}</span></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Scrollytelling: το προϊόν μένει sticky και αλλάζει πράξη όσο διαβάζεις.
             ΠΡΟΣΟΧΗ: χωρίς lp-reveal εδώ (transform στον πρόγονο σπάει το sticky). */}
      <section style={{ ...wrap, position: 'relative', zIndex: 1, paddingBottom: GAP_ACT }}>
        <SectionHead over="Πώς δουλεύει" title="Τρεις κινήσεις, και το ακίνητο μπαίνει σε τάξη" sub="Φωτογραφίζεις, ρωτάς, αποφασίζεις. Ό,τι μεσολαβεί το αναλαμβάνει η εφαρμογή." />
        <ScrollStory />
      </section>

      {/* ── Capabilities ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingBottom: GAP }}>
        {/* Ο τίτλος λέει τώρα το ΜΟΝΟ πράγμα που δεν μπορεί να αντιγράψει κανένα
            διεθνές εργαλείο διαχείρισης: ότι ξέρει την ελληνική πραγματικότητα.
            Το «Ό,τι χρειάζεται το ακίνητό σου» ήταν αληθές και εντελώς άχρωμο,
            γιατί το ίδιο ακριβώς θα έγραφε και ο κάθε ανταγωνιστής. */}
        <SectionHead over="Δυνατότητες" title="Σχεδιασμένο για την ελληνική αγορά ακινήτων" sub="ΕΝΦΙΑ, κοινόχρηστα, Δήλωση μίσθωσης, κλίμακα ενοικίων 2026. Ένα διεθνές εργαλείο δεν τα ξέρει." />
        {/* ΡΗΤΑ ΤΡΕΙΣ ΣΤΗΛΕΣ ΓΙΑ ΕΞΙ ΚΑΡΤΕΣ. Με επτά κάρτες και auto-fit, η έβδομη
            έμενε ΜΟΝΗ ΤΗΣ σε τρίτη σειρά, με δύο κενά δίπλα της. Ένα ορφανό κελί
            είναι το πιο ορατό λάθος διάταξης που υπάρχει: δεν χρειάζεται να ξέρεις
            τίποτα από σχεδιασμό για να το προσέξεις. Έξι κάρτες κλείνουν σε τέλειο
            3×2 και η ενότητα διαβάζεται ως ένα σχήμα, όχι ως λίστα που ξέμεινε. */}
        <div className="lp-feat" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          {FEATURES.map((f, i) => (
            <div key={i} className="lp-card" style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 14, padding: 'clamp(20px, 2.2vw, 24px)' }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 15 }}>{ic(f.i)}</div>
              <h3 style={{ fontSize: 16, fontWeight: 680, margin: '0 0 7px', letterSpacing: '-0.02em', textWrap: 'balance' }}>{f.t}</h3>
              <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, margin: 0, textWrap: 'pretty' }}>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Συμβατότητα ────────────────────────────────────────────────────────
             ΓΙΑΤΙ ΜΠΑΙΝΕΙ ΑΥΤΗ Η ΕΝΟΤΗΤΑ: η σελίδα εξηγούσε τι κάνει το προϊόν,
             ποτέ όμως τι ΔΕΝ θα χρειαστεί να εγκαταλείψει ο ιδιοκτήτης για να το
             χρησιμοποιήσει. Αυτή είναι η πραγματική αντίρρηση: «έχω ήδη λογιστή,
             έχω ήδη Excel, έχω ήδη τις κρατήσεις μου κάπου». Δέκα ονόματα που
             μπορεί να ελέγξει απαντούν καλύτερα από δέκα επίθετα.

             Καμία λέξη εδώ δεν είναι πρόθεση: κάθε γραμμή αντιστοιχεί σε
             λειτουργία που ήδη υπάρχει στον κώδικα. Ένα ψεύτικο όνομα σε τέτοιο
             πλέγμα δεν είναι μάρκετινγκ, είναι λόγος ακύρωσης συνδρομής. */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingBottom: GAP }}>
        <SectionHead over="Συμβατότητα" title="Δεν αφήνεις πίσω τίποτα από όσα ήδη δουλεύουν" sub="Τα δεδομένα σου βγαίνουν όποτε θέλεις, στη μορφή που περιμένει ο λογιστής σου." />
        <div className="lp-works">
          {WORKS_WITH.map((w, i) => (
            <div key={i}>
              <div style={{ fontSize: 15, fontWeight: 680, color: TEXT, letterSpacing: '-0.01em', marginBottom: 5 }}>{w.t}</div>
              <div style={{ fontSize: 14, color: FAINT, lineHeight: 1.5 }}>{w.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Ζωντανό εργαλείο απόδοσης: αξία επιτόπου, με τον αληθινό μας μηχανισμό ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingBottom: GAP }}>
        <SectionHead over="Δες το μόνος σου" title="Πόσο σου αποδίδει πραγματικά;" sub="Ενδεικτική καθαρή απόδοση, με την ίδια φορολογική κλίμακα ενοικίων 2026 που τρέχει και μέσα στην εφαρμογή." />
        <LandingCalculator />
      </section>

      {/* ── Security & trust ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingBottom: GAP }}>
        <div className="lp-split" style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 14, padding: 'clamp(24px, 3vw, 38px)', display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 'clamp(24px, 3vw, 40px)', alignItems: 'center' }}>
          <div>
            <div className="lp-eyebrow">Ασφάλεια</div>
            <h2 style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 680, letterSpacing: '-0.03em', lineHeight: 1.1, margin: '0 0 12px', textWrap: 'balance' }}>Τα δεδομένα σου είναι δικά σου</h2>
            <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, margin: 0, textWrap: 'pretty' }}>
              Οι λογαριασμοί, τα συμβόλαια και τα δεδομένα σου είναι από τα πιο ευαίσθητα που έχεις, και προστατεύονται ανάλογα.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 14 }}>
            {SECURITY.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 34, height: 34, borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{s.i.split('M').filter(Boolean).map((p, j) => <path key={j} d={'M' + p} />)}</svg>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 680, color: TEXT, marginBottom: 3, letterSpacing: '-0.01em' }}>{s.t}</div>
                  <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.5 }}>{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Γιατί υπάρχει ───────────────────────────────────────────────────
             ΓΙΑΤΙ ΜΠΑΙΝΕΙ ΕΔΩ, ΑΚΡΙΒΩΣ ΠΡΙΝ ΤΗΝ ΤΙΜΗ: μέχρι αυτό το σημείο η
             σελίδα έχει αποδείξει ΤΙ κάνει. Δεν έχει πει ποτέ ΓΙΑΤΙ. Ένας
             επισκέπτης που θα δει τιμή σε δέκα δευτερόλεπτα θέλει πρώτα να
             καταλάβει ότι απέναντί του υπάρχει κάποιος που ξέρει το πρόβλημα.

             ΓΙΑΤΙ ΧΩΡΙΣ ΚΑΡΤΑ ΚΑΙ ΧΩΡΙΣ ΠΛΑΙΣΙΟ: όλη η σελίδα είναι κάρτες και
             πλέγματα. Μια φωνή μέσα σε κάρτα γίνεται άλλη μια δυνατότητα. Γυμνό
             κείμενο, σε μεγαλύτερο μέγεθος και με αέρα γύρω του, διαβάζεται ως
             κάποιος που μιλάει.

             ΤΙ ΔΕΝ ΛΕΕΙ: δεν επικαλείται βιογραφία, ιδρυτές ή ιστορίες που δεν
             μπορεί να επαληθεύσει ο αναγνώστης. Περιγράφει ένα πρόβλημα που
             αναγνωρίζει όποιος έχει ακίνητο στην Ελλάδα, και σταματά εκεί. */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingBottom: GAP_ACT }}>
        <hr className="lp-hair" />
        <div style={{ maxWidth: 900 }}>
          <div className="lp-eyebrow">Γιατί υπάρχει</div>
          <p style={{ fontSize: 'clamp(17px, 2.1vw, 21px)', lineHeight: 1.55, color: 'var(--text-primary)', margin: '0 0 14px', letterSpacing: '-0.01em', fontWeight: 450, textWrap: 'balance' }}>
            Ένα διαμέρισμα αρκεί για να χαθείς: ο λογαριασμός σε ένα συρτάρι, το μισθωτήριο
            σε ένα email, η προθεσμία στο μυαλό σου.
          </p>
          <p style={{ fontSize: 15, lineHeight: 1.65, color: MUTED, margin: '0 0 18px', maxWidth: 820, textWrap: 'pretty' }}>
            Τα φύλλα Excel και οι εφαρμογές σημειώσεων δεν φταίνε: απλώς δεν ξέρουν τι είναι τα κοινόχρηστα,
            το Ε2 ή η Δήλωση μίσθωσης, και δεν πρόκειται να μάθουν. Από εκεί ακριβώς ξεκίνησε το Property OS.
          </p>
          <Link href="/trust" className="lp-link" style={{ color: ACCENT, textDecoration: 'none', fontSize: 15, fontWeight: 600 }}>
            Ποιοι είμαστε και πού βρίσκονται τα δεδομένα σου
          </Link>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingBottom: GAP }}>
        <SectionHead over="Τιμολόγηση" title="Διάλεξε πόσο μεγάλο είναι το χαρτοφυλάκιό σου" sub="Κάθε πακέτο περιλαμβάνει ό,τι έχει το προηγούμενο. Τριάντα ημέρες δοκιμή, χωρίς κάρτα." />
        {/* ΜΙΑ ΠΗΓΗ ΓΙΑ ΤΙΣ ΤΙΜΕΣ ΚΑΙ ΤΑ ΧΑΡΑΚΤΗΡΙΣΤΙΚΑ.
            Οι κάρτες ήταν γραμμένες με το χέρι: τιμές, ετήσιες τιμές και λίστες
            χαρακτηριστικά αντιγραμμένα από το lib/billing/plans.ts. Είχαν ήδη
            αποκλίνει — η σελίδα δεν ανέφερε πουθενά τα +2 € ανά επιπλέον
            ακίνητο (το πιο δυνατό επιχείρημα του τιμοκαταλόγου) και ΔΕΝ έδειχνε
            καθόλου το πλάνο «Γραφείο», που υπάρχει και χρεώνεται κανονικά.
            Τώρα παράγονται από το PLANS: μία αλλαγή τιμής, παντού σωστή. */}
        {/* ΟΛΑ ΤΑ ΠΛΑΝΑ ΣΕ ΜΙΑ ΓΡΑΜΜΗ. Το `auto-fit` με ελάχιστο 250px τύλιγε το
            πέμπτο πλάνο σε δεύτερη σειρά, οπότε ο τιμοκατάλογος διαβαζόταν ως
            «τέσσερα και κάτι ακόμη» αντί για μία σκάλα. Ρητές πέντε στήλες πάνω
            από 1000px, δύο στο tablet, μία στο κινητό (globals.css). */}
        {/* ΤΕΣΣΕΡΑ ΠΑΚΕΤΑ, ΟΧΙ ΠΕΝΤΕ. Η κάρτα «Δωρεάν 0 €» δεν είναι πακέτο: είναι
            εκεί που καταλήγεις όταν δεν αγοράζεις. Ως πέμπτη στήλη με τιμή «0 €»
            έμπαινε στην ίδια σύγκριση με τα υπόλοιπα και έσπαγε τη σκάλα στην
            αρχή της. Λέγεται μία φορά, στα ψιλά γράμματα από κάτω.

            Η ΣΚΑΛΑ ΕΙΝΑΙ ΡΗΤΗ. Κάθε πακέτο λέει «Περιλαμβάνει ό,τι έχει το
            προηγούμενο, και:» — και η κληρονομιά ΔΕΝ ξαναγράφεται μέσα στα
            χαρακτηριστικά, όπου πριν εμφανιζόταν άτακτα σε δύο από τα τέσσερα. */}
        <div className="lp-plans" style={{ display: 'grid', gridTemplateColumns: `repeat(${LANDING_PLANS.length}, minmax(0, 1fr))`, gap: 12, alignItems: 'stretch' }}>
          {LANDING_PLANS.map((id, i) => {
            const plan = PLANS[id];
            const prev = i > 0 ? PLANS[LANDING_PLANS[i - 1]] : null;
            return (
              <PlanCard
                key={id}
                name={plan.name}
                nameColor={id === FEATURED_PLAN ? ACCENT : TEXT}
                sub={plan.tagline}
                price={fe(plan.priceMonthly)}
                per="τον μήνα"
                note={<>ή <strong style={{ color: TEXT }}>{plan.priceAnnual} € τον χρόνο</strong></>}
                discount="2 μήνες δωρεάν"
                inherits={prev ? `Ό,τι έχει το «${prev.name}», και:` : 'Περιλαμβάνει:'}
                // Το «30 ημέρες δωρεάν δοκιμή» ήταν ΚΑΙ τελευταία γραμμή χαρακτηριστικών
                // ΚΑΙ το ίδιο το κουμπί από κάτω. Μία περιττή γραμμή σε κάθε κάρτα.
                items={plan.features.filter(f => !f.includes('δωρεάν δοκιμή'))}
                cta={`${plan.trialDays} ημέρες δωρεάν`}
                ctaGhost={id !== FEATURED_PLAN}
                featured={id === FEATURED_PLAN}
              />
            );
          })}
        </div>
        <p style={{ fontSize: 13, color: FAINT, margin: '22px 0 0', maxWidth: 620, lineHeight: 1.6, textWrap: 'pretty' }}>
Κάθε πακέτο ξεκινά με 30 ημέρες δοκιμή χωρίς κάρτα. Όταν λήξει, συνεχίζεις δωρεάν με ένα ακίνητο και τα δεδομένα σου ανέπαφα. Χωρίς δέσμευση και χωρίς κρυφές χρεώσεις· οι τιμές περιλαμβάνουν ΦΠΑ.
        </p>
      </section>

      {/* ── Σύσταση: δύο διακριτά προγράμματα, ιδιώτη και επαγγελματία ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingBottom: GAP }}>
        <SectionHead over="Σύσταση" title="Κάθε σύσταση ανταμείβει και τους δύο" sub="Ο φίλος σου παίρνει δώρο, εσύ ανταμείβεσαι. Για επαγγελματίες, δωρεάν μήνες που ανανεώνονται." />
        <div className="lp-duo" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 16 }}>
          {REFERRAL.map((r, i) => (
            <div key={i} className="lp-card" style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 14, padding: 'clamp(22px, 2.6vw, 30px)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{ic(r.i)}</div>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: ACCENT }}>{r.tag}</span>
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 680, margin: '0 0 8px', letterSpacing: '-0.02em', textWrap: 'balance' }}>{r.t}</h3>
              <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, margin: '0 0 18px', textWrap: 'pretty' }}>{r.d}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {r.items.map((t, j) => (
                  <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>{check}<span style={{ fontSize: 15, color: TEXT, lineHeight: 1.5 }}>{t}</span></div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 13, color: FAINT, margin: '22px 0 0', maxWidth: 620, lineHeight: 1.6, textWrap: 'pretty' }}>
          Ο φίλος σου διαλέγει στην αρχή πλάνο, Ιδιοκτήτης ή Επαγγελματίας, ανάλογα με τα ακίνητά του, και ο πρώτος
          μήνας είναι δωρεάν. Η ανταμοιβή κλειδώνει όταν προσθέσει ακίνητο και σαρώσει ένα έγγραφο. Οι ανταμοιβές
          είναι αξία προϊόντος, δωρεάν μήνες και θέσεις ακινήτων, και δεν εξαργυρώνονται σε μετρητά. Η ιδιότητα
          Συνεργάτη ενεργοποιείται με 5 συνδρομητές για 3 συνεχόμενους μήνες, μαζί με τη χρέωση με κάρτα.
        </p>
      </section>

      {/* ── FAQ: ίδια κεφαλίδα με κάθε άλλη ενότητα, ερωτήσεις σε όλο το πλάτος ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingBottom: 0 }}>
        <SectionHead over="Συχνές ερωτήσεις" title="Ό,τι ρωτούν οι ιδιοκτήτες πριν ξεκινήσουν" sub="Ειλικρινείς απαντήσεις, χωρίς αστερίσκους." />
        <div style={{ borderBottom: `1px solid ${LINE}` }}>
          {FAQ.map((f, i) => (
            <details key={i} className="lp-faq" style={{ borderTop: `1px solid ${LINE}` }}>
              <summary style={{ cursor: 'pointer', listStyle: 'none', padding: '19px 0', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                {f.q}<span className="lp-plus" style={{ color: ACCENT, fontSize: 20, fontWeight: 450, lineHeight: 1, transition: 'transform .2s', flexShrink: 0 }}>+</span>
              </summary>
              {/* ΠΕΡΑ-ΠΕΡΑ, ΓΙΑΤΙ ΕΙΝΑΙ ΔΥΟ ΓΡΑΜΜΕΣ.
                  Το μέτρο των 680px υπήρχε για να μη χάνει το μάτι τη σειρά του σε
                  παράγραφο δώδεκα γραμμών. Με απαντήσεις δύο γραμμών ο κίνδυνος δεν
                  υπάρχει — και το στενό μέτρο έκανε τις ίδιες απαντήσεις πέντε και
                  έξι σειρές, που είναι ο πραγματικός λόγος που δεν διαβάζονταν. */}
              <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.65, margin: '0 0 20px', textWrap: 'pretty' }}>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Final CTA: σκοτεινό κλείσιμο, καθρέφτης του hero ── */}
      <section className="lp-hero lp-reveal" style={{ position: 'relative', overflow: 'hidden', borderBottom: 'none' }}>
        <div className="lp-aurora" aria-hidden="true" />
        <div style={{ ...wrap, position: 'relative', zIndex: 1, textAlign: 'center', paddingTop: GAP_ACT, paddingBottom: GAP_ACT }}>
          <h2 style={{ fontSize: 'clamp(28px, 4.6vw, 46px)', fontWeight: 680, letterSpacing: '-0.035em', lineHeight: 1.1, margin: '0 auto 16px', maxWidth: 720, color: 'var(--text-primary)', textWrap: 'balance' }}>Το ακίνητό σου, υπό έλεγχο.</h2>
          <p style={{ fontSize: 'clamp(14px, 1.8vw, 17px)', color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 620, margin: '0 auto 30px', textWrap: 'pretty' }}>Φωτογράφισε το πρώτο έγγραφο. Δωρεάν, χωρίς δέσμευση.</p>
          <Link href={loggedIn ? '/dashboard' : '/signup'} className="lp-cta lp-primary" style={{ display: 'inline-block', textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '14px 30px', borderRadius: 100 }}>{loggedIn ? 'Άνοιξε τον πίνακά σου' : 'Ξεκίνα δωρεάν'}</Link>
        </div>
      </section>

      </Spotlight>
      </main>

      {/* Δομημένα δεδομένα FAQ για τις μηχανές αναζήτησης (rich results) */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org', '@type': 'FAQPage',
        mainEntity: FAQ.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      }) }} />

      {/* ── Footer ── */}
      <footer style={{ borderTop: `1px solid ${LINE}`, position: 'relative', zIndex: 1 }}>
        <div style={{ ...wrap, padding: 'clamp(32px, 5vw, 48px) clamp(20px, 5vw, 48px)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', marginBottom: 28 }}>
            <div style={{ maxWidth: 320 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <BrandMark size={24} />
                <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>Property OS</span>
              </div>
              <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.6, margin: 0, textWrap: 'pretty' }}>Το λειτουργικό σύστημα του ελληνικού ακινήτου. Για ιδιοκτήτες και επαγγελματίες στην Ελλάδα.</p>
            </div>
            <div style={{ display: 'flex', gap: 'clamp(28px, 6vw, 64px)', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: FAINT, marginBottom: 2 }}>Προϊόν</span>
                <Link href="/signup" className="lp-link" style={{ color: MUTED, textDecoration: 'none', fontSize: 14 }}>Ξεκίνα δωρεάν</Link>
                <Link href="/login" className="lp-link" style={{ color: MUTED, textDecoration: 'none', fontSize: 14 }}>Σύνδεση</Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: FAINT, marginBottom: 2 }}>Εμπιστοσύνη</span>
                <Link href="/trust" className="lp-link" style={{ color: MUTED, textDecoration: 'none', fontSize: 14 }}>Ποιοι είμαστε</Link>
                <Link href="/privacy" className="lp-link" style={{ color: MUTED, textDecoration: 'none', fontSize: 14 }}>Απόρρητο</Link>
                <Link href="/terms" className="lp-link" style={{ color: MUTED, textDecoration: 'none', fontSize: 14 }}>Όροι χρήσης</Link>
              </div>
            </div>
          </div>
          <div style={{ paddingTop: 20, borderTop: `1px solid ${LINE}`, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 13, color: FAINT }}>
            <span>© {new Date().getFullYear()} Property OS</span>
            <span>Βάση δεδομένων στην ΕΕ · Σχεδιασμένο για GDPR</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Η κεφαλίδα κάθε ενότητας: λεπτή γραμμή που δηλώνει την τομή, ετικέτα με κουκκίδα,
// τίτλος, υπότιτλος. Και τα τέσσερα ξεκινούν από το ΙΔΙΟ αριστερό σημείο.
//
// ΓΙΑΤΙ ΟΧΙ ΔΙΠΛΑ: ο υπότιτλος σε δεύτερη στήλη έδινε πυκνότητα, αλλά έσπαγε τον
// άξονα. Όταν ο τίτλος έπιανε δύο γραμμές, ο υπότιτλος έπρεπε να ευθυγραμμιστεί με
// κάτι: με την κορυφή του τίτλου, με τη βάση του ή με το κέντρο. Καμία επιλογή δεν
// ήταν σωστή σε ΟΛΕΣ τις ενότητες, γιατί οι τίτλοι δεν έχουν ίδιο ύψος. Το
// αποτέλεσμα ήταν έξι ενότητες με έξι ελαφρώς διαφορετικές ισορροπίες.
//
// Από κάτω, υπάρχει ένας άξονας και μόνο ένας: ετικέτα, τίτλος, υπότιτλος, κάρτες.
// Κάθε γραμμή της σελίδας ξεκινά στο ίδιο x. Αυτή είναι η στοίχιση που διαβάζεται
// ως προσοχή στη λεπτομέρεια, και είναι και η μόνη που δεν σπάει ποτέ.
function SectionHead({ over, title, sub }: { over: string; title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 'clamp(24px, 3.4vw, 40px)' }}>
      <hr className="lp-hair" />
      <div className="lp-eyebrow">{over}</div>
      <h2 style={{ fontSize: 'clamp(25px, 3.4vw, 40px)', fontWeight: 680, letterSpacing: '-0.03em', lineHeight: 1.1, margin: 0, textWrap: 'balance' }}>{title}</h2>
      {/* Ο υπότιτλος παίρνει όλο το πλάτος της στήλης και ΚΑΘΕ κείμενο κόπηκε ώστε
          να χωρά σε μία γραμμή. Δύο γραμμές υπότιτλου κάτω από μονόγραμμο τίτλο
          δίνουν βαρύ, ασύμμετρο μπλοκ· μία και μία διαβάζονται ως ζευγάρι. */}
      {sub && <p style={{ fontSize: 16, color: MUTED, lineHeight: 1.55, margin: '13px 0 0', textWrap: 'pretty' }}>{sub}</p>}
    </div>
  );
}

function PlanCard({ name, nameColor, sub, price, per, note, discount, inherits, items, cta, ctaGhost, featured }: {
  name: string; nameColor: string; sub: string; price: string; per: string; note: React.ReactNode; discount?: string; inherits?: string; items: string[]; cta: string; ctaGhost?: boolean; featured: boolean;
}) {
  return (
    <div className="lp-card" style={{ position: 'relative', background: PANEL, border: featured ? `1.5px solid color-mix(in srgb, var(--accent) 50%, transparent)` : `1px solid ${LINE}`, borderRadius: 14, padding: 'clamp(16px, 1.6vw, 20px)', display: 'flex', flexDirection: 'column', boxShadow: featured ? '0 24px 60px -30px color-mix(in srgb, var(--accent) 60%, transparent)' : 'none' }}>
      {featured && <span style={{ position: 'absolute', top: -9, left: 16, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', background: PANEL, border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', borderRadius: 100, padding: '2px 9px', whiteSpace: 'nowrap' }}>Προτεινόμενο</span>}
      <div style={{ fontSize: 14, fontWeight: 700, color: nameColor, marginBottom: 3 }}>{name}</div>
      <div style={{ fontSize: 12, color: FAINT, marginBottom: 14, minHeight: 32, lineHeight: 1.35 }}>{sub}</div>
      {/* ΤΟ ΠΟΣΟ ΚΑΙ Η ΠΕΡΙΟΔΟΣ ΕΙΝΑΙ ΕΝΑ ΠΡΑΓΜΑ: «3,90 € τον μήνα» διαβάζεται
          σαν φράση, όχι σαν αριθμός με λεζάντα από κάτω. Το `baseline` τα
          στοιχίζει στη γραμμή γραφής, οπότε το μικρό «τον μήνα» κάθεται πάνω
          στη βάση του μεγάλου ποσού αντί να αιωρείται στο κέντρο του.

          Το `nowrap` είναι απαραίτητο, όχι διακοσμητικό: χωρίς αυτό το «τον
          μήνα» έπεφτε κάτω από το «24,90 €» και «79,90 €» —τα δύο μεγαλύτερα
          ποσά— και οι λίστες ξεκινούσαν σε διαφορετικό ύψος σε κάθε κάρτα. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 'clamp(24px, 2.4vw, 29px)', fontWeight: 680, letterSpacing: '-0.03em', color: TEXT, lineHeight: 1.1 }}>{price}</span>
        <span style={{ fontSize: 13, color: MUTED }}>{per}</span>
      </div>
      <div style={{ fontSize: 12, color: FAINT, marginTop: 5 }}>{note}</div>
      {/* ΤΟ ΔΩΡΟ ΣΕ ΔΙΚΟ ΤΟΥ ΠΛΑΙΣΙΟ. Ήταν κολλημένο στο τέλος της ίδιας μικρής,
          ξεθωριασμένης γραμμής με την ετήσια τιμή, μετά από μια τελεία: το πιο
          δυνατό επιχείρημα της ετήσιας συνδρομής, γραμμένο σαν υποσημείωση
          υποσημείωσης. Το πλαίσιο είναι ΟΥΔΕΤΕΡΟ — περίγραμμα και φόντο από τα
          tokens της επιφάνειας, όχι πράσινη κονκάρδα «έκπτωσης»: ξεχωρίζει με
          σχήμα, όχι με χρώμα-ετυμηγορία. */}
      <div style={{ minHeight: 30, marginTop: 8 }}>
        {discount && (
          <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 100,
            border: `1px solid ${LINE}`, background: 'var(--bg-elevated)', padding: '3px 10px',
            fontSize: 11, fontWeight: 700, color: TEXT, letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>{discount}</span>
        )}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left', margin: '14px 0 16px' }}>
        {inherits && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.01em', marginBottom: 1 }}>{inherits}</div>}
        {items.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>{check}<span style={{ fontSize: 12, color: TEXT, lineHeight: 1.4 }}>{t}</span></div>
        ))}
      </div>
      <Link href="/signup" className={ctaGhost ? 'lp-ghost' : 'lp-cta lp-primary'} style={{ display: 'block', textAlign: 'center', background: ctaGhost ? 'transparent' : undefined, color: ctaGhost ? TEXT : undefined, textDecoration: 'none', fontSize: 13, fontWeight: 700, padding: '10px', borderRadius: 100, border: ctaGhost ? `1px solid ${LINE}` : 'none' }}>{cta}</Link>
    </div>
  );
}
