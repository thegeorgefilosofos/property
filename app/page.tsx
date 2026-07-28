import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import LandingShowcase from './LandingShowcase';
import ScrollStory from './ScrollStory';
import LandingCalculator from './LandingCalculator';
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
  { t: 'Σύγκριση ρεύματος και ασφάλειας', d: 'Συγκρίνεις τιμολόγια 11 παρόχων ρεύματος και 16 ασφαλιστικών εταιρειών, από στοιχεία που επαληθεύουμε και ενημερώνουμε τακτικά, για να λάβεις την καλύτερη απόφαση για την περιουσία σου.', i: 'M3 12h4l3 8 4-16 3 8h4' },
  { t: 'Χρηματοδότηση χωρίς εκπλήξεις', d: 'Ανάλυση στεγαστικού, δόσεις, επιτόκια και έξοδα μεταβίβασης, ώστε να επιλέγεις την πιο αποδοτική λύση για κάθε τύπο ακινήτου.', i: 'M3 21h18M5 21V7l8-4v18M19 21V11l-6-4' },
  { t: 'Προϋπολογισμός και αποδόσεις', d: 'Καταγράφεις δαπάνες, ορίζεις στόχους και βλέπεις τις αποδόσεις κάθε ακινήτου σε πραγματικό χρόνο.', i: 'M12 2v20M17 7H9.5a2.5 2.5 0 0 0 0 5h5a2.5 2.5 0 0 1 0 5H7' },
  { t: 'Μίσθωση με σιγουριά', d: 'Συγκρίνεις βραχυχρόνια και μακροχρόνια μίσθωση με τα δικά σου δεδομένα, είτε ξεκινάς τώρα είτε εκμισθώνεις ήδη.', i: 'M3 21h18M5 21V7l8-4v18M13 9h6v12M9 9h.01M9 13h.01M9 17h.01' },
  { t: 'Φορολογία 2026', d: 'Γνωρίζεις έγκαιρα τις υποχρεώσεις και τις ευκαιρίες σου με βάση την ισχύουσα φορολογία. Δεν αντικαθιστά τον λογιστή σου, σε κρατά όμως πάντα ενήμερο και προετοιμασμένο.', i: 'M9 7h6M9 11h6M9 15h4M5 3h14v18l-3-2-2 2-2-2-2 2-3-2z' },
  { t: 'Όλα σε ένα σημείο', d: 'Έγγραφα, ημερολόγιο, υπενθυμίσεις και αρχείο, οργανωμένα σε ένα σημείο, με κρυπτογραφημένη μεταφορά και πρόσβαση μόνο για τον λογαριασμό σου. Τέλος στους σκόρπιους φακέλους.', i: 'M4 4h6l2 2h8v12H4zM4 10h16' },
];

const FAQ = [
  { q: 'Πώς δουλεύει η σάρωση με φωτογραφία;', a: 'Βγάζεις φωτογραφία ή ανεβάζεις ένα PDF: λογαριασμό, μισθωτήριο, ασφαλιστήριο, ΕΝΦΙΑ. Ο βοηθός το διαβάζει, καταλαβαίνει τι είναι και το καταχωρεί αυτόματα στο σωστό σημείο: λογαριασμοί, δαπάνες, ημερολόγιο, ενοικιαστής, αρχείο. Εσύ βλέπεις τι κατάλαβε, επιβεβαιώνεις και διορθώνεις οτιδήποτε με ένα άγγιγμα. Τίποτα δεν καταχωρείται οριστικά χωρίς τον έλεγχό σου.' },
  { q: 'Ο βοηθός καταλαβαίνει και μιλάει ελληνικά;', a: 'Ναι. Καταλαβαίνει και γράφει φυσικά ελληνικά. Σε browsers που το υποστηρίζουν (π.χ. Chrome, Safari) μπορείς και να του μιλάς και να σου διαβάζει τις απαντήσεις, με τις ελληνικές φωνές της συσκευής σου. Του δίνεις το όνομα που θέλεις και επιλέγεις αν θα ακούγεται αντρικός, γυναικείος ή ουδέτερος. Έχει μπροστά του τα δικά σου δεδομένα — ακίνητα, δαπάνες, μισθώσεις, προθεσμίες — και απαντά με βάση αυτά, ενώ για τα γενικά ερωτήματα ακινήτων στην Ελλάδα απαντά από τη γενική του γνώση. Για ό,τι χρειάζεται νομική ή λογιστική γνώμη, σε παραπέμπει στον κατάλληλο επαγγελματία.' },
  { q: 'Σε ποιους απευθύνεται;', a: 'Σε κάθε ιδιοκτήτη ακινήτου στην Ελλάδα που θέλει να έχει τον έλεγχο στα χέρια του: από τον ιδιώτη με ένα διαμέρισμα μέχρι τον επαγγελματία με ολόκληρο χαρτοφυλάκιο, αλλά και σε μεσιτικά γραφεία και διαχειριστές. Καλύπτει κάθε τύπο ακινήτου: κατοικία, επαγγελματικό χώρο, αποθήκη, οικόπεδο.' },
  { q: 'Αντικαθιστά τον λογιστή ή τον φοροτεχνικό μου;', a: 'Όχι, και δεν το επιδιώκει. Σε κρατά διαρκώς ενημερωμένο για τις υποχρεώσεις, τις προθεσμίες και τις ευκαιρίες σου, ώστε να πηγαίνεις στον λογιστή σου προετοιμασμένος, με τα στοιχεία έτοιμα για εξαγωγή. Οι υπολογισμοί είναι υποστηρικτικοί: για δεσμευτικές αποφάσεις συμβουλεύσου πάντα έναν επαγγελματία σύμβουλο.' },
  { q: 'Πόσο κοστίζει;', a: 'Το πρώτο ακίνητο δεν σου κοστίζει ποτέ τίποτα, χωρίς κάρτα: σάρωση εγγράφων, βοηθός, αποδόσεις, δαπάνες, ενέργεια, φορολογία 2026 και υπενθυμίσεις. Οι δυνατότητες για ενοικιαστές, Ε2 και λογιστικό ημερολόγιο ανήκουν στα πλάνα επί πληρωμή. Κάθε νέος λογαριασμός ξεκινά με 30 ημέρες δωρεάν δοκιμή του πλάνου Ιδιοκτήτης, χωρίς κάρτα και χωρίς αυτόματη χρέωση — όταν λήξει, συνεχίζεις κανονικά στο Δωρεάν. Για περισσότερα ακίνητα, το πλάνο Ιδιοκτήτης κοστίζει 9,90 € τον μήνα (ή 99 € τον χρόνο, δύο μήνες δώρο) για έως 3 ακίνητα. Το πλάνο Επαγγελματίας κοστίζει 24,90 € τον μήνα (ή 249 € τον χρόνο, δύο μήνες δώρο) για έως 15 ακίνητα, με ομαδική διαχείριση. Οι τιμές αφορούν πελάτες στην Ελλάδα και περιλαμβάνουν τον αναλογούντα ΦΠΑ. Η πληρωμή με κάρτα δεν έχει ενεργοποιηθεί ακόμη· μέχρι τότε χρησιμοποιείς το Δωρεάν πλάνο και τη δοκιμή, και όταν ενεργοποιηθεί θα αλλάζεις ή θα ακυρώνεις όποτε θέλεις, χωρίς δέσμευση.' },
  { q: 'Είναι ασφαλή τα δεδομένα μου;', a: 'Το παίρνουμε πιο σοβαρά από οτιδήποτε άλλο. Η σύνδεσή σου με το Property OS γίνεται πάντα κρυπτογραφημένα (TLS) — μόνη εξαίρεση, αν εσύ συνδέσεις εξωτερική ροή ημερολογίου που δίνεται σε http. Κάθε λογαριασμός είναι απομονωμένος σε επίπεδο βάσης (Row Level Security): βλέπεις τα δικά σου δεδομένα και μόνο όσα εσύ μοιράζεσαι, με τα μέλη της ομάδας σου ή μέσω συνδέσμου προς ενοικιαστή. Εμείς δεν χρησιμοποιούμε τα έγγραφα και τα νούμερά σου για εκπαίδευση μοντέλων. Η βάση δεδομένων, η ταυτοποίηση και τα αρχεία σου βρίσκονται στην Ευρωπαϊκή Ένωση (Φρανκφούρτη)· ορισμένοι πάροχοι επεξεργάζονται δεδομένα στις ΗΠΑ — η φιλοξενία της εφαρμογής, τα κρυπτογραφημένα αντίγραφα ασφαλείας, τα ερωτήματα προς τον βοηθό και η αποστολή email. Τα αναλυτικά είναι στη σελίδα «Ποιοι είμαστε» και στην Πολιτική Απορρήτου.' },
  { q: 'Τι γίνεται με τα δεδομένα μου αν σταματήσω;', a: 'Παραμένουν δικά σου. Μπορείς να τα εξάγεις ανά πάσα στιγμή μέσα από την εφαρμογή και να διαγράψεις τον λογαριασμό σου όποτε θέλεις. Μετά τη διαγραφή, τα δεδομένα σου διαγράφονται οριστικά μέσα σε 30 ημέρες, εκτός από όσα οφείλουμε να τηρήσουμε βάσει νόμου, όπως τα φορολογικά παραστατικά.' },
  { q: 'Δουλεύει στο κινητό;', a: 'Παντού. Η εφαρμογή προσαρμόζεται πλήρως σε κινητό, tablet και υπολογιστή. Η σάρωση δουλεύει ιδανικά με την κάμερα του κινητού σου: φωτογραφίζεις τον λογαριασμό εκεί που τον παραλαμβάνεις και έχει ήδη καταχωρηθεί πριν φτάσεις σπίτι.' },
  { q: 'Πόσο γρήγορα ξεκινάω;', a: 'Η εγγραφή θέλει λιγότερο από ένα λεπτό, με Google ή με email. Προσθέτεις το πρώτο σου ακίνητο με λίγα βασικά στοιχεία και η εικόνα του συμπληρώνεται σιγά σιγά, με κάθε έγγραφο που περνάς μέσα. Αν θέλεις να δεις πρώτα πώς λειτουργεί, υπάρχουν έτοιμα δεδομένα επίδειξης για να εξερευνήσεις ελεύθερα, πριν βάλεις τα δικά σου.' },
];

// Ταινία δυνατοτήτων στο κάτω άκρο του hero: διαρκής, ήρεμη κίνηση (παύση στο hover).
const TICKER = [
  'Σάρωση εγγράφων', 'Σύγκριση 11 παρόχων ρεύματος', 'Φορολογία 2026', '«Σπίτι μου II»',
  '«Ανακαινίζω-Νοικιάζω»', 'Βοηθός με ελληνική φωνή', 'Αποδόσεις σε πραγματικό χρόνο',
  'Ε2 έτοιμο για τον λογιστή', 'Βάση δεδομένων στην ΕΕ · Σχεδιασμένο για GDPR',
];

const STATS = [
  { n: '11', l: 'πάροχοι ρεύματος, με τα κύρια τιμολόγιά τους σε σύγκριση — επαληθευμένα τον Ιούλιο 2026' },
  { n: '2026', l: 'φορολογία και προθεσμίες, ενημερωμένες στην τρέχουσα νομοθεσία' },
  { n: 'Δάνεια', l: 'τράπεζες, επιτόκια και προγράμματα όπως «Σπίτι μου II» και «Ανακαινίζω-Νοικιάζω»' },
  { n: 'ΕΕ', l: 'η βάση σου στη Φρανκφούρτη, κρυπτογραφημένη μεταφορά, σχεδιασμένο για GDPR' },
];

const SECURITY = [
  { t: 'Κρυπτογραφημένη σύνδεση', d: 'Η επικοινωνία με το Property OS γίνεται πάντα μέσω TLS.', i: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4' },
  { t: 'Απομόνωση ανά χρήστη', d: 'Βλέπεις τα δικά σου δεδομένα. Πρόσβαση έχουν μόνο όσοι εσύ επιλέγεις: τα μέλη της ομάδας σου και όποιος έχει σύνδεσμο που εσύ έφτιαξες.', i: 'M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z' },
  { t: 'Καμία εκπαίδευση μοντέλων', d: 'Εμείς δεν χρησιμοποιούμε τα έγγραφα και τα νούμερά σου για εκπαίδευση μοντέλων.', i: 'M12 2v4M12 18v4M2 12h4M18 12h4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
  { t: 'Βάση δεδομένων στην ΕΕ', d: 'Η βάση, η ταυτοποίηση και τα αρχεία σου φιλοξενούνται στην ΕΕ (Φρανκφούρτη). Σχεδιασμένο σύμφωνα με τον Κανονισμό GDPR· οι συμβάσεις με τους παρόχους εκτός ΕΕ ολοκληρώνονται πριν την εμπορική κυκλοφορία.', i: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M2 12h20M12 2c3 3 3 17 0 20M12 2c-3 3-3 17 0 20' },
];

// Δύο προγράμματα σύστασης: ιδιώτης (πρόσκληση) και επαγγελματίας (συνεργάτης).
const REFERRAL = [
  {
    tag: 'Ιδιώτες', t: 'Πρόγραμμα Πρόσκλησης',
    i: 'M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7S9 2 6.5 4.5 12 7 12 7zM12 7s3-5 5.5-2.5S12 7 12 7z',
    d: 'Δείξε σε έναν ιδιοκτήτη πώς να βάλει το ακίνητό του σε τάξη. Με κάθε φίλο που ξεκινά, κερδίζετε και οι δύο.',
    items: ['Ο νέος ιδιοκτήτης κερδίζει δύο μήνες δώρο (έναν μήνα αν ξεκινήσει απευθείας στο πλάνο Επαγγελματίας)', 'Εσύ κερδίζεις δωρεάν μήνες στη συνδρομή σου — και αν είσαι στο Δωρεάν, μια επιπλέον θέση ακινήτου. Η ανταμοιβή κλειδώνει όταν ο φίλος σου προσθέσει ακίνητο και σαρώσει ένα έγγραφο'],
  },
  {
    tag: 'Επαγγελματίες', t: 'Πρόγραμμα Συνεργατών',
    i: 'M3 7h18v13H3zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18',
    d: 'Για λογιστές, μεσίτες και διαχειριστές ακινήτων. Προσκάλεσε τους πελάτες-ιδιοκτήτες σου και χτίσε μια σταθερή πηγή εισοδήματος.',
    items: ['Δωρεάν μήνες μόλις πιάσεις τον μηνιαίο στόχο: 5 συνδρομητές → 2 μήνες, ή 10 δωρεάν χρήστες → 1 μήνας', 'Ιδιότητα Συνεργάτη με 20% επαναλαμβανόμενη προμήθεια, όταν διατηρήσεις 5 συνδρομητές για 3 συνεχόμενους μήνες (ενεργοποιείται μαζί με τη χρέωση με κάρτα)'],
  },
];

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
        /* Η landing είναι πάντα σκοτεινή, ανεξάρτητα από το θέμα της εφαρμογής:
           μία κινηματογραφική, ενιαία παλέτα από βαθύ ναυτικό μπλε. Ξαναγράφουμε
           τα design tokens μόνο σε αυτό το υποδέντρο, ώστε κάθε ενότητα, κάρτα και
           πάνελ να ακολουθεί χωρίς να αγγίξουμε το καθένα χωριστά. Τα διαδραστικά
           χρώματα (accent, θετικό, κείμενο πάνω σε accent) κρατούν τις τιμές του
           σκοτεινού θέματος της εφαρμογής, για απόλυτη συνέπεια με το προϊόν. */
        .lp-root {
          --bg-base: #070b12;
          --bg-surface: #0e1622;
          --bg-elevated: #16202f;
          --text-primary: #eef2f7;
          --text-secondary: #a7b2c2;
          --text-tertiary: #7c899b;
          --border-subtle: rgba(255,255,255,.07);
          --border-default: rgba(255,255,255,.12);
          --border-strong: rgba(255,255,255,.24);
          --accent: #8ab4f8;
          --accent-text: #0a2647;
          --positive: #52c79e;
          --negative: #e58c84;
          /* Ένα συνεχόμενο, κινηματογραφικό μπλε-μαύρο «διάστημα» από πάνω μέχρι
             κάτω. Οι απαλές γαλάζιες κηλίδες μένουν καρφωμένες στην οθόνη
             (background-attachment: fixed), οπότε καθώς κυλάς νιώθεις ότι
             ταξιδεύεις μέσα σε έναν χώρο, όχι ότι σκρολάρεις μια σελίδα. */
          background:
            radial-gradient(1100px 760px at 50% -2%, rgba(26,115,232,.13), transparent 60%),
            radial-gradient(900px 720px at 92% 20%, rgba(26,115,232,.07), transparent 55%),
            radial-gradient(820px 640px at 6% 74%, rgba(138,180,248,.06), transparent 60%),
            linear-gradient(180deg, #080d16 0%, #0a1120 52%, #070b12 100%);
          background-attachment: fixed;
          background-repeat: no-repeat;
        }
        .lp-skip { position: absolute; left: -9999px; top: 10px; z-index: 100; padding: 10px 16px; border-radius: 12px; background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border-subtle); font-size: 14px; font-weight: 600; text-decoration: none; }
        .lp-skip:focus { left: 12px; outline: 2px solid var(--accent); outline-offset: 2px; }
        .lp-card { transition: transform .22s cubic-bezier(.2,0,0,1), box-shadow .22s cubic-bezier(.2,0,0,1), border-color .22s; }
        .lp-card:hover { transform: translateY(-3px); box-shadow: 0 20px 44px -20px rgba(0,0,0,.6); border-color: color-mix(in srgb, var(--accent) 40%, transparent); }
        .lp-cta { transition: transform .15s, filter .15s; }
        .lp-cta:hover { transform: translateY(-1px); filter: brightness(1.05); }
        /* Ενιαία κύρια ενέργεια σε όλη τη σελίδα: το ζωντανό γαλάζιο της μάρκας
           (#1a73e8) με λευκό κείμενο. Το ανοιχτό accent (#8ab4f8) μένει μόνο για
           τονισμούς, συνδέσμους και ενεργές καταστάσεις. Δύο ρόλοι, δύο αποχρώσεις. */
        .lp-primary { background: #1a73e8 !important; color: #fff !important; }
        .lp-ghost { transition: border-color .15s, background .15s, color .15s; }
        .lp-ghost:hover { border-color: color-mix(in srgb, var(--accent) 40%, transparent); background: color-mix(in srgb, var(--accent) 5%, transparent); color: var(--accent); }
        .lp-link { transition: color .15s; }
        .lp-link:hover { color: var(--accent) !important; }
        details.lp-faq summary { transition: color .18s; }
        details.lp-faq summary:hover { color: var(--accent); }
        details.lp-faq[open] summary { color: var(--accent); }
        details.lp-faq summary::-webkit-details-marker { display: none; }
        details.lp-faq[open] summary .lp-plus { transform: rotate(45deg); }
        @media (max-width: 860px) { .lp-faq-grid { grid-template-columns: 1fr !important; align-items: start !important; } }
        /* Κινηματογραφικό hero: πάντα σκοτεινό, ανεξάρτητα από το θέμα της σελίδας.
           Το προϊόν φωτίζεται πάνω του σαν έκθεμα· η υπόλοιπη σελίδα μένει καθαρή. */
        /* Το hero δεν έχει δικό του φόντο πια: μοιράζεται το ενιαίο μπλε-μαύρο
           της σελίδας, ώστε να μην υπάρχει καμία ραφή από πάνω μέχρι κάτω. */
        .lp-hero { background: transparent; color: #fff; border-bottom: none; }
        .lp-hero .lp-aurora::before { opacity: .22; }
        .lp-hero .lp-aurora::after { opacity: .15; }
        .lp-hero .lp-rotor { color: #8ab4f8; }
        .lp-hero button[role="tab"] { color: rgba(255,255,255,.62) !important; border-color: rgba(255,255,255,.16) !important; }
        .lp-hero button[role="tab"][aria-selected="true"] { color: #8ab4f8 !important; border-color: rgba(138,180,248,.5) !important; background: rgba(138,180,248,.1) !important; }
        /* Ticker: αδιάκοπη οριζόντια ροή δυνατοτήτων, παύση στο πέρασμα του κέρσορα. */
        .lp-ticker { overflow: hidden; border-top: 1px solid rgba(255,255,255,.07); padding: 15px 0; position: relative; z-index: 1; }
        .lp-ticker-track { display: inline-flex; white-space: nowrap; animation: lpTicker 38s linear infinite; will-change: transform; }
        .lp-ticker-track > span { display: inline-flex; align-items: center; font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,.38); }
        .lp-ticker-track .lp-dot { margin: 0 22px; color: rgba(255,255,255,.2); }
        .lp-ticker:hover .lp-ticker-track { animation-play-state: paused; }
        @keyframes lpTicker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        /* Αύρα βάθους στο hero: δύο μεγάλες, θολές κηλίδες στο γαλάζιο της παλέτας
           που μετακινούνται αργά. Δίνει ζωή και βάθος χωρίς θόρυβο· μία απόχρωση μόνο. */
        .lp-aurora { position: absolute; inset: -14% -18% auto; height: 115%; z-index: 0; pointer-events: none; }
        .lp-aurora::before, .lp-aurora::after { content: ''; position: absolute; width: min(58vw, 760px); aspect-ratio: 1; border-radius: 50%; filter: blur(90px); background: radial-gradient(circle, var(--accent), transparent 64%); }
        .lp-aurora::before { top: -6%; left: -6%; opacity: .13; animation: lpDrift 28s ease-in-out infinite alternate; }
        .lp-aurora::after { top: 10%; right: -10%; opacity: .09; animation: lpDrift 36s ease-in-out -9s infinite alternate-reverse; }
        @keyframes lpDrift { from { transform: translate3d(0, 0, 0) scale(1); } to { transform: translate3d(5vw, 4vh, 0) scale(1.14); } }
        /* Εναλλασσόμενη λέξη στον τίτλο: μία κάθε τρία δευτερόλεπτα, απαλή άνοδος. */
        .lp-rotor { display: inline-grid; justify-items: center; color: var(--accent); }
        .lp-rotor > span { grid-area: 1 / 1; opacity: 0; white-space: nowrap; animation: lpRotor 12s cubic-bezier(.2, 0, 0, 1) infinite; }
        .lp-rotor > span:nth-child(2) { animation-delay: 3s; }
        .lp-rotor > span:nth-child(3) { animation-delay: 6s; }
        .lp-rotor > span:nth-child(4) { animation-delay: 9s; }
        @keyframes lpRotor { 0% { opacity: 0; transform: translateY(16px); } 4% { opacity: 1; transform: none; } 23% { opacity: 1; transform: none; } 27% { opacity: 0; transform: translateY(-16px); } 100% { opacity: 0; } }
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
        @media (max-width: 760px) { .lp-split { grid-template-columns: 1fr !important; } }
        .lp-only-xs { display: none; }
        @media (max-width: 520px) { .lp-hide-xs { display: none !important; } .lp-only-xs { display: inline !important; } }
        @media (prefers-reduced-motion: reduce) {
          .lp-rise, .lp-rise-2, .lp-rise-3, .lp-rise-4, .lp-reveal { animation: none !important; }
          .lp-aurora::before, .lp-aurora::after { animation: none !important; }
          .lp-rotor > span { animation: none !important; }
          .lp-rotor > span:first-child { opacity: 1; }
          .lp-ticker-track { animation: none !important; }
        }
      `}</style>

      <a href="#main" className="lp-skip">Μετάβαση στο περιεχόμενο</a>

      {/* ── Nav ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'color-mix(in srgb, var(--bg-base) 78%, transparent)', backdropFilter: 'saturate(180%) blur(14px)', WebkitBackdropFilter: 'saturate(180%) blur(14px)', borderBottom: `1px solid ${LINE}` }}>
        <nav style={{ ...wrap, height: 64, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15 }}>P</div>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>Property OS</span>
          </div>
          {loggedIn ? (
            <Link href="/dashboard" className="lp-cta lp-primary" style={{ textDecoration: 'none', fontSize: 14, fontWeight: 700, padding: '9px 18px', borderRadius: 100 }}>Ο πίνακάς σου →</Link>
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

      {/* ── Hero: κινηματογραφικό, πάντα σκοτεινό, με το προϊόν φωτισμένο σαν έκθεμα ── */}
      <section className="lp-hero" style={{ position: 'relative', overflow: 'hidden' }}>
        <div className="lp-aurora" aria-hidden="true" />
        {/* ΓΙΑΤΙ ΤΟΣΟ ΣΦΙΧΤΟ: το hero κατανάλωνε ΟΛΟ το πρώτο viewport (112px πάνω,
            τίτλος έως 78px, 84px κάτω) και το προϊόν ξεκινούσε στα ~1080px — δηλαδή
            ο επισκέπτης έβλεπε μόνο κείμενο και έπρεπε να κυλήσει για να δει τι
            αγοράζει. Κάθε κορυφαίο προϊόν δείχνει το προϊόν ΜΕΣΑ στην πρώτη οθόνη. */}
        <div style={{ ...wrap, position: 'relative', zIndex: 1, paddingTop: 'clamp(40px, 5.5vw, 68px)', paddingBottom: 'clamp(28px, 4vw, 44px)', textAlign: 'center' }}>
          {/* ΤΟ ΧΕΙΡΟΤΕΡΟ ΣΦΑΛΜΑ ΠΟΥ ΔΙΟΡΘΩΘΗΚΕ ΕΔΩ: η δεύτερη σειρά — αυτή που
              περιέχει το ΟΝΟΜΑ ΤΟΥ ΠΡΟΪΟΝΤΟΣ — ήταν rgba(255,255,255,.52), δηλαδή
              το πιο αχνό στοιχείο ολόκληρης της σελίδας. Δεν διαβαζόταν ως
              σχεδιαστική ιεράρχηση· διαβαζόταν ως απενεργοποιημένο κείμενο.
              Η ιεράρχηση προκύπτει τώρα από το ΧΡΩΜΑ ΤΟΥ ΤΟΝΟΥ (το εναλλασσόμενο
              αντικείμενο σε accent) και όχι από ξεθώριασμα του brand.
              Και το μέγεθος έπεσε από 78px σε 60px: στα 78 ο τίτλος έσπαγε σε
              τέσσερις γραμμές με κακά σημεία κοπής («…κάνει τα / υπόλοιπα»). */}
          <h1 className="lp-rise" style={{ fontSize: 'clamp(32px, 5.2vw, 60px)', fontWeight: 680, letterSpacing: '-0.035em', lineHeight: 1.08, margin: '0 auto 20px', maxWidth: 1000, color: 'var(--text-primary)' }}>
            Φωτογραφίζεις{' '}
            <span className="lp-rotor">
              <span>τον λογαριασμό.</span>
              <span>το μισθωτήριο.</span>
              <span>το ασφαλιστήριο.</span>
              <span>τον ΕΝΦΙΑ.</span>
            </span>
            <br />
            {/* nowrap ώστε να μη μένει ποτέ το «υπόλοιπα.» μόνο του σε τρίτη γραμμή:
                ένα ορφανό στο τέλος τίτλου διαβάζεται ως τυπογραφικό ατύχημα. Σε
                στενές οθόνες το clamp ρίχνει το μέγεθος, οπότε χωράει ούτως ή άλλως. */}
            <span style={{ whiteSpace: 'nowrap' }}>Το Property OS</span> κάνει τα υπόλοιπα.
          </h1>
          {/* Ο υπότιτλος έλεγε ΡΗΜΑΤΑ («καταχωρεί, υπολογίζει, συγκρίνει») — δηλαδή
              τι κάνει το λογισμικό, όχι τι κερδίζει ο άνθρωπος. Λέει τώρα το όφελος
              με νούμερα που ο ιδιοκτήτης αναγνωρίζει αμέσως ως δικά του. */}
          <p className="lp-rise-2" style={{ fontSize: 'clamp(15px, 1.8vw, 18.5px)', color: 'rgba(255,255,255,.72)', lineHeight: 1.6, maxWidth: 600, margin: '0 auto 26px', textWrap: 'balance' }}>
            Ενοίκια, δαπάνες, λογαριασμοί, δάνειο και φόρος σε ένα μέρος — με το Ε2 έτοιμο
            τον Ιούνιο και έναν βοηθό που απαντά για <em style={{ fontStyle: 'normal', color: '#fff', fontWeight: 600 }}>τα δικά σου</em> νούμερα.
          </p>
          <div className="lp-rise-3" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {loggedIn ? (
              <Link href="/dashboard" className="lp-cta" style={{ background: 'var(--accent)', color: 'var(--accent-text)', textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '14px 28px', borderRadius: 100 }}>Άνοιξε τον πίνακά σου →</Link>
            ) : (<>
              <Link href="/signup" className="lp-cta" style={{ background: 'var(--accent)', color: 'var(--accent-text)', textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '14px 28px', borderRadius: 100 }}>Ξεκίνα δωρεάν →</Link>
              <Link href="/login" style={{ background: 'transparent', color: '#fff', textDecoration: 'none', fontSize: 15, fontWeight: 600, padding: '14px 28px', borderRadius: 100, border: '1px solid rgba(255,255,255,.22)', transition: 'border-color .15s, background .15s' }}>Έχω λογαριασμό</Link>
            </>)}
          </div>
          <div className="lp-rise-4" style={{ marginTop: 18, fontSize: 12.5, color: 'rgba(255,255,255,.45)' }}>Χωρίς κάρτα · Το πρώτο ακίνητο πάντα δωρεάν · Βάση δεδομένων στην ΕΕ, σχεδιασμένο για GDPR</div>

          <LandingShowcase />
        </div>

        {/* Ταινία δυνατοτήτων: το κάτω άκρο του hero ρέει διαρκώς, ήρεμα */}
        <div className="lp-ticker" aria-hidden="true">
          <div className="lp-ticker-track">
            {[...TICKER, ...TICKER].map((t, i) => (
              <span key={i}>{t}<span className="lp-dot">•</span></span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Proof band: μετρήσιμα, πραγματικά (χωρίς ψεύτικα «νούμερα χρηστών») ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingTop: 'clamp(20px, 3vw, 34px)', paddingBottom: 'clamp(28px, 4vw, 48px)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 1, background: LINE, border: `1px solid ${LINE}`, borderRadius: 14, overflow: 'hidden' }}>
          {STATS.map((s, i) => (
            <div key={i} style={{ padding: 'clamp(20px, 3vw, 26px) 22px', textAlign: 'center', background: PANEL }}>
              <div style={{ fontSize: 'clamp(24px, 3vw, 30px)', fontWeight: 680, letterSpacing: '-0.03em', color: TEXT, lineHeight: 1, marginBottom: 8, fontVariantNumeric: 'tabular-nums' }}>{s.n}</div>
              <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.45 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Scrollytelling: το προϊόν μένει sticky και αλλάζει πράξη όσο διαβάζεις.
             ΠΡΟΣΟΧΗ: χωρίς lp-reveal εδώ (transform στον πρόγονο σπάει το sticky). */}
      <section style={{ ...wrap, position: 'relative', zIndex: 1, paddingTop: 'clamp(36px, 5vw, 64px)', paddingBottom: 'clamp(24px, 4vw, 44px)' }}>
        <SectionHead over="Πώς δουλεύει" title="Τρεις κινήσεις. Πλήρης έλεγχος." />
        <ScrollStory />
      </section>

      {/* ── Capabilities ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingBottom: 'clamp(44px, 7vw, 84px)' }}>
        <SectionHead over="Δυνατότητες" title="Ό,τι χρειάζεται το ακίνητό σου" sub="Από τον λογαριασμό ρεύματος μέχρι τη φορολογική δήλωση, με τη σειρά που προκύπτουν." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
          {FEATURES.map((f, i) => (
            <div key={i} className="lp-card" style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 14, padding: 'clamp(22px, 2.6vw, 28px)' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>{ic(f.i)}</div>
              <h3 style={{ fontSize: 16.5, fontWeight: 680, margin: '0 0 8px', letterSpacing: '-0.015em' }}>{f.t}</h3>
              <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.6, margin: 0 }}>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Ζωντανό εργαλείο απόδοσης: αξία επιτόπου, με τον αληθινό μας μηχανισμό ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingBottom: 'clamp(44px, 7vw, 84px)' }}>
        <SectionHead over="Δες το μόνος σου" title="Πόσο σου αποδίδει πραγματικά;" sub="Βάλε τα δεδομένα του ακινήτου σου. Ο υπολογιστής σού δίνει ενδεικτική καθαρή απόδοση, με την ίδια φορολογική κλίμακα ενοικίων 2026 που χρησιμοποιεί και η εφαρμογή." />
        <LandingCalculator />
      </section>

      {/* ── Security & trust ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingBottom: 'clamp(44px, 7vw, 84px)' }}>
        <div className="lp-split" style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 14, padding: 'clamp(24px, 3vw, 38px)', display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 'clamp(24px, 3vw, 40px)', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: FAINT, marginBottom: 12 }}>Ασφάλεια</div>
            <h3 style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 680, letterSpacing: '-0.03em', lineHeight: 1.15, margin: '0 0 12px' }}>Τα δεδομένα σου είναι δικά σου</h3>
            <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, margin: 0 }}>
              Οι λογαριασμοί, τα συμβόλαια και τα νούμερά σου είναι από τα πιο ευαίσθητα δεδομένα που έχεις. Τα προστατεύουμε ανάλογα.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 14 }}>
            {SECURITY.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 34, height: 34, borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{s.i.split('M').filter(Boolean).map((p, j) => <path key={j} d={'M' + p} />)}</svg>
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 680, color: TEXT, marginBottom: 3, letterSpacing: '-0.01em' }}>{s.t}</div>
                  <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, padding: 'clamp(20px, 3vw, 32px) clamp(20px, 5vw, 48px) clamp(44px, 7vw, 84px)' }}>
        <SectionHead over="Τιμολόγηση" title="Ξεκίνα δωρεάν. Μείνε επειδή αξίζει." sub="Το πρώτο ακίνητο δωρεάν, για πάντα — και 30 ημέρες δοκιμή του Ιδιοκτήτη, χωρίς κάρτα. Αναβαθμίζεις μόνο όταν μεγαλώνει το χαρτοφυλάκιό σου." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 16, maxWidth: 1040, margin: '0 auto', alignItems: 'stretch' }}>

          {/* Δωρεάν */}
          <PlanCard
            name="Δωρεάν" nameColor={TEXT} sub="Για τον ιδιοκτήτη με το πρώτο του ακίνητο"
            price="0 €" per="για πάντα" note="Χωρίς κάρτα, χωρίς λήξη"
            items={['1 ακίνητο, οποιουδήποτε τύπου', 'Σάρωση με φωτογραφία και βοηθός με φωνή', 'Αποδόσεις, δαπάνες, ενέργεια και φορολογία 2026', 'Υπενθυμίσεις πριν από κάθε προθεσμία']}
            cta="Ξεκίνα δωρεάν" ctaGhost featured={false}
          />

          {/* Ιδιοκτήτης */}
          <PlanCard
            name="Ιδιοκτήτης" nameColor={ACCENT} sub="Για τον ιδιοκτήτη που νοικιάζει και θέλει να είναι εντάξει με την εφορία"
            price="9,90 €" per="τον μήνα" note={<>ή <strong style={{ color: TEXT }}>99 € τον χρόνο</strong></>} discount="2 μήνες δώρο"
            inherits="Όλα του Δωρεάν, και επιπλέον:"
            items={['Έως 3 ακίνητα, όλων των τύπων', 'Δήλωση Μίσθωσης: έλεγχος πληρότητας πριν την υποβολή στο myAADE', 'Εξαγωγή φορολογικών στοιχείων (Ε2) για τον λογιστή', 'Λογιστικό ημερολόγιο για SoftOne, Epsilon, QuickBooks, Xero', 'Διαχείριση ενοικιαστών, εισπράξεων και οφειλών']}
            cta="30 ημέρες δωρεάν →" featured
          />

          {/* Επαγγελματίας */}
          <PlanCard
            name="Επαγγελματίας" nameColor={TEXT} sub="Για διαχειριστές ακινήτων και μεσιτικά γραφεία με ομάδα"
            price="24,90 €" per="τον μήνα" note={<>ή <strong style={{ color: TEXT }}>249 € τον χρόνο</strong></>} discount="2 μήνες δώρο"
            inherits="Όλα του Ιδιοκτήτη, και επιπλέον:"
            items={['Έως 15 ακίνητα', 'Ομαδική διαχείριση: πολλοί χρήστες, ρόλοι και δικαιώματα', 'Αναφορές και έγγραφα με τη δική σου επωνυμία', 'Πελατολόγιο και υποψήφιοι πελάτες (CRM)', 'Κατανομή σε συνιδιοκτήτες και διαχειριστική αμοιβή']}
            cta="30 ημέρες δωρεάν →" ctaGhost featured={false}
          />
        </div>
        <p style={{ textAlign: 'center', fontSize: 12.5, color: FAINT, margin: '22px auto 0', maxWidth: 540, lineHeight: 1.6 }}>
          Η δοκιμή δεν ζητά κάρτα και δεν μετατρέπεται μόνη της σε συνδρομή: όταν λήξει, συνεχίζεις στο Δωρεάν με τα δεδομένα σου ανέπαφα. Χωρίς δέσμευση, χωρίς κρυφές χρεώσεις. Οι τιμές περιλαμβάνουν ΦΠΑ.
        </p>
      </section>

      {/* ── Σύσταση: δύο διακριτά προγράμματα, ιδιώτη και επαγγελματία ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingBottom: 'clamp(44px, 7vw, 84px)' }}>
        <SectionHead over="Σύσταση" title="Μοιράσου το. Κερδίστε και οι δύο." sub="Κάθε ιδιοκτήτης που ξεκινά με τη σύστασή σου παίρνει δώρο, κι εσύ ανταμείβεσαι. Για τους επαγγελματίες, γίνεται σταθερή πηγή εισοδήματος." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 16, maxWidth: 900, margin: '0 auto' }}>
          {REFERRAL.map((r, i) => (
            <div key={i} className="lp-card" style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 14, padding: 'clamp(22px, 2.6vw, 30px)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{ic(r.i)}</div>
                <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: ACCENT }}>{r.tag}</span>
              </div>
              <h3 style={{ fontSize: 16.5, fontWeight: 680, margin: '0 0 8px', letterSpacing: '-0.015em' }}>{r.t}</h3>
              <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.6, margin: '0 0 18px' }}>{r.d}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {r.items.map((t, j) => (
                  <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>{check}<span style={{ fontSize: 13.5, color: TEXT, lineHeight: 1.45 }}>{t}</span></div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p style={{ textAlign: 'center', fontSize: 12.5, color: FAINT, margin: '22px auto 0', maxWidth: 560, lineHeight: 1.6 }}>
          Το πρώτο ακίνητο μένει πάντα δωρεάν. Οι δωρεάν μήνες αφορούν τη συνδρομή, για ένα ή παραπάνω ακίνητα.
        </p>
      </section>

      {/* ── FAQ: κεφαλίδα στο πλάι, κάθετα κεντραρισμένη στη μέση των ερωτήσεων ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingBottom: 'clamp(48px, 7vw, 92px)' }}>
        <div className="lp-faq-grid" style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.4fr', gap: 'clamp(24px, 5vw, 72px)', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: FAINT, marginBottom: 12 }}>Συχνές ερωτήσεις</div>
            <h2 style={{ fontSize: 'clamp(24px, 3.8vw, 37px)', fontWeight: 680, letterSpacing: '-0.03em', lineHeight: 1.13, margin: '0 0 14px' }}>Ό,τι ρωτούν οι ιδιοκτήτες πριν ξεκινήσουν</h2>
            <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, margin: 0, maxWidth: 340 }}>Ειλικρινείς απαντήσεις στις πιο συχνές απορίες.</p>
          </div>
          <div style={{ borderBottom: `1px solid ${LINE}` }}>
            {FAQ.map((f, i) => (
              <details key={i} className="lp-faq" style={{ borderTop: `1px solid ${LINE}` }}>
                <summary style={{ cursor: 'pointer', listStyle: 'none', padding: '19px 0', fontSize: 15.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                  {f.q}<span className="lp-plus" style={{ color: ACCENT, fontSize: 22, fontWeight: 400, lineHeight: 1, transition: 'transform .2s', flexShrink: 0 }}>+</span>
                </summary>
                <p style={{ fontSize: 14.5, color: MUTED, lineHeight: 1.7, margin: '0 0 22px', maxWidth: 620 }}>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA: σκοτεινό κλείσιμο, καθρέφτης του hero ── */}
      <section className="lp-hero lp-reveal" style={{ position: 'relative', overflow: 'hidden', borderBottom: 'none' }}>
        <div className="lp-aurora" aria-hidden="true" />
        <div style={{ ...wrap, position: 'relative', zIndex: 1, textAlign: 'center', paddingTop: 'clamp(56px, 8vw, 100px)', paddingBottom: 'clamp(56px, 8vw, 100px)' }}>
          <h2 style={{ fontSize: 'clamp(28px, 4.6vw, 46px)', fontWeight: 680, letterSpacing: '-0.035em', lineHeight: 1.08, margin: '0 auto 16px', maxWidth: 720, color: 'var(--text-primary)' }}>Το ακίνητό σου, υπό έλεγχο.</h2>
          <p style={{ fontSize: 'clamp(14px, 1.8vw, 17px)', color: 'rgba(255,255,255,.62)', lineHeight: 1.6, maxWidth: 480, margin: '0 auto 30px' }}>Φωτογράφισε το πρώτο έγγραφο και δες το να μπαίνει σε τάξη. Δωρεάν, χωρίς δέσμευση.</p>
          <Link href={loggedIn ? '/dashboard' : '/signup'} className="lp-cta" style={{ display: 'inline-block', background: 'var(--accent)', color: 'var(--accent-text)', textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '14px 30px', borderRadius: 100 }}>{loggedIn ? 'Άνοιξε τον πίνακά σου →' : 'Ξεκίνα δωρεάν →'}</Link>
        </div>
      </section>

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
                <div style={{ width: 24, height: 24, borderRadius: 8, background: ACCENT, color: '#fff', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>P</div>
                <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>Property OS</span>
              </div>
              <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, margin: 0 }}>Το λειτουργικό σύστημα του ελληνικού ακινήτου. Για ιδιοκτήτες και επαγγελματίες στην Ελλάδα.</p>
            </div>
            <div style={{ display: 'flex', gap: 'clamp(28px, 6vw, 64px)', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: FAINT, marginBottom: 2 }}>Προϊόν</span>
                <Link href="/signup" className="lp-link" style={{ color: MUTED, textDecoration: 'none', fontSize: 13.5 }}>Ξεκίνα δωρεάν</Link>
                <Link href="/login" className="lp-link" style={{ color: MUTED, textDecoration: 'none', fontSize: 13.5 }}>Σύνδεση</Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: FAINT, marginBottom: 2 }}>Εμπιστοσύνη</span>
                <Link href="/trust" className="lp-link" style={{ color: MUTED, textDecoration: 'none', fontSize: 13.5 }}>Ποιοι είμαστε</Link>
                <Link href="/privacy" className="lp-link" style={{ color: MUTED, textDecoration: 'none', fontSize: 13.5 }}>Απόρρητο</Link>
                <Link href="/terms" className="lp-link" style={{ color: MUTED, textDecoration: 'none', fontSize: 13.5 }}>Όροι Χρήσης</Link>
              </div>
            </div>
          </div>
          <div style={{ paddingTop: 20, borderTop: `1px solid ${LINE}`, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 12.5, color: FAINT }}>
            <span>© {new Date().getFullYear()} Property OS</span>
            <span>Βάση δεδομένων στην ΕΕ · Σχεδιασμένο για GDPR</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionHead({ over, title, sub }: { over: string; title: string; sub?: string }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 'clamp(28px, 4vw, 44px)' }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: FAINT, marginBottom: 12 }}>{over}</div>
      <h2 style={{ fontSize: 'clamp(24px, 3.8vw, 37px)', fontWeight: 680, letterSpacing: '-0.03em', lineHeight: 1.13, margin: 0, maxWidth: 760, marginInline: 'auto' }}>{title}</h2>
      {sub && <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, maxWidth: 540, margin: '14px auto 0' }}>{sub}</p>}
    </div>
  );
}

function PlanCard({ name, nameColor, sub, price, per, note, discount, inherits, items, cta, ctaGhost, featured }: {
  name: string; nameColor: string; sub: string; price: string; per: string; note: React.ReactNode; discount?: string; inherits?: string; items: string[]; cta: string; ctaGhost?: boolean; featured: boolean;
}) {
  return (
    <div className="lp-card" style={{ position: 'relative', background: PANEL, border: featured ? `1.5px solid color-mix(in srgb, var(--accent) 50%, transparent)` : `1px solid ${LINE}`, borderRadius: 14, padding: 'clamp(22px, 2.6vw, 30px)', display: 'flex', flexDirection: 'column', boxShadow: featured ? '0 24px 60px -30px color-mix(in srgb, var(--accent) 60%, transparent)' : 'none' }}>
      {featured && <span style={{ position: 'absolute', top: 18, right: 18, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', borderRadius: 100, padding: '4px 10px' }}>Προτεινόμενο</span>}
      <div style={{ fontSize: 13, fontWeight: 700, color: nameColor, marginBottom: 4 }}>{name}</div>
      <div style={{ fontSize: 12, color: FAINT, marginBottom: 18, minHeight: 32 }}>{sub}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 'clamp(32px, 4.4vw, 40px)', fontWeight: 680, letterSpacing: '-0.03em', color: TEXT }}>{price}</span>
        <span style={{ fontSize: 15, color: MUTED }}>{per}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 22, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: FAINT }}>{note}</span>
        {discount && <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--positive)', background: 'color-mix(in srgb, var(--positive) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--positive) 32%, transparent)', borderRadius: 100, padding: '2px 9px', fontVariantNumeric: 'tabular-nums' }}>{discount}</span>}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left', margin: '20px 0 24px' }}>
        {inherits && <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.01em', marginBottom: 2 }}>{inherits}</div>}
        {items.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>{check}<span style={{ fontSize: 14, color: TEXT, lineHeight: 1.4 }}>{t}</span></div>
        ))}
      </div>
      <Link href="/signup" className={ctaGhost ? 'lp-ghost' : 'lp-cta lp-primary'} style={{ display: 'block', textAlign: 'center', background: ctaGhost ? 'transparent' : '#1a73e8', color: ctaGhost ? TEXT : '#fff', textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '13px', borderRadius: 100, border: ctaGhost ? `1px solid ${LINE}` : 'none' }}>{cta}</Link>
    </div>
  );
}
