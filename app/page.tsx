import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import LandingShowcase from './LandingShowcase';
import ScrollStory from './ScrollStory';
import LandingCalculator from './LandingCalculator';

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
  metadataBase: new URL('https://property-os.gr'),
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
  { t: 'Σύγκριση ρεύματος και ασφάλειας', d: 'Συγκρίνεις τα τιμολόγια όλων των παρόχων και τις ασφάλειες ακινήτου, και βλέπεις πόσα γλιτώνεις πριν αποφασίσεις.', i: 'M3 12h4l3 8 4-16 3 8h4' },
  { t: 'Χρηματοδότηση χωρίς εκπλήξεις', d: 'Ανάλυση στεγαστικού, δόσεις, επιτόκια και έξοδα μεταβίβασης, ώστε να επιλέγεις την πιο αποδοτική λύση για κάθε τύπο ακινήτου.', i: 'M3 21h18M5 21V7l8-4v18M19 21V11l-6-4' },
  { t: 'Προϋπολογισμός και αποδόσεις', d: 'Καταγράφεις δαπάνες, ορίζεις στόχους και βλέπεις σε πραγματικό χρόνο τι σου αποδίδει καθαρά κάθε ακίνητο.', i: 'M12 2v20M17 7H9.5a2.5 2.5 0 0 0 0 5h5a2.5 2.5 0 0 1 0 5H7' },
  { t: 'Μίσθωση με σιγουριά', d: 'Καθοδήγηση για βραχυχρόνια ή μακροχρόνια μίσθωση, με πραγματικά νούμερα, είτε σκέφτεσαι να εκμισθώσεις είτε το κάνεις ήδη.', i: 'M3 21h18M5 21V7l8-4v18M13 9h6v12M9 9h.01M9 13h.01M9 17h.01' },
  { t: 'Φορολογική ενημέρωση', d: 'Γνωρίζεις ανά πάσα στιγμή τις υποχρεώσεις και τις ευκαιρίες σου με τη φορολογία του 2026. Δεν αντικαθιστά τον λογιστή σου, σε κρατά όμως πάντα ενημερωμένο.', i: 'M9 7h6M9 11h6M9 15h4M5 3h14v18l-3-2-2 2-2-2-2 2-3-2z' },
  { t: 'Όλα σε ένα σημείο', d: 'Έγγραφα, ημερολόγιο, υπενθυμίσεις και αρχείο, οργανωμένα και κρυπτογραφημένα. Χωρίς άγχος, χωρίς σκόρπιους φακέλους.', i: 'M4 4h6l2 2h8v12H4zM4 10h16' },
];

const FAQ = [
  { q: 'Πώς δουλεύει η σάρωση με φωτογραφία;', a: 'Βγάζεις φωτογραφία ή ανεβάζεις ένα PDF: λογαριασμό, μισθωτήριο, ασφαλιστήριο, ΕΝΦΙΑ. Το σύστημα το διαβάζει, καταλαβαίνει τι είναι και το καταχωρεί αυτόματα στο σωστό σημείο: λογαριασμοί, δαπάνες, ημερολόγιο, ενοικιαστής, αρχείο. Εσύ βλέπεις τι κατάλαβε, επιβεβαιώνεις και διορθώνεις οτιδήποτε με ένα άγγιγμα. Τίποτα δεν καταχωρείται οριστικά χωρίς τον έλεγχό σου.' },
  { q: 'Ο βοηθός καταλαβαίνει και μιλάει ελληνικά;', a: 'Ναι. Μιλάει φυσικά ελληνικά, με κείμενο ή με τη φωνή σου, και σου απαντά με ανθρώπινη φωνή. Του δίνεις όνομα και φωνή όπως θέλεις. Απαντά πάντα με βάση τα δικά σου δεδομένα: τα ακίνητα, τις δαπάνες, τις μισθώσεις και τις προθεσμίες σου. Για ό,τι χρειάζεται νομική ή λογιστική γνώμη, σε παραπέμπει στον κατάλληλο επαγγελματία.' },
  { q: 'Σε ποιους απευθύνεται;', a: 'Σε κάθε ιδιοκτήτη ακινήτου στην Ελλάδα που θέλει να έχει τον έλεγχο όπως ένας επαγγελματίας: από τον ιδιώτη με ένα διαμέρισμα μέχρι τον επαγγελματία με ολόκληρο χαρτοφυλάκιο, μεσιτικά γραφεία και διαχειριστές. Καλύπτει κάθε τύπο ακινήτου: κατοικία, επαγγελματικό χώρο, αποθήκη, οικόπεδο.' },
  { q: 'Αντικαθιστά τον λογιστή ή τον φοροτεχνικό μου;', a: 'Όχι, και δεν το επιδιώκει. Σε κρατά διαρκώς ενημερωμένο για τις υποχρεώσεις, τις προθεσμίες και τις ευκαιρίες σου, ώστε να πηγαίνεις στον λογιστή σου προετοιμασμένος, με τα στοιχεία έτοιμα για εξαγωγή. Οι υπολογισμοί είναι υποστηρικτικοί: για δεσμευτικές αποφάσεις συμβουλεύσου πάντα έναν επαγγελματία σύμβουλο.' },
  { q: 'Πόσο κοστίζει;', a: 'Το πρώτο ακίνητο δεν σου κοστίζει ποτέ τίποτα: όλες οι δυνατότητες, χωρίς κάρτα. Για περισσότερα ακίνητα, το πλάνο Ιδιοκτήτης κοστίζει 6,90 € τον μήνα (ή 59 € τον χρόνο) για έως 15 ακίνητα. Το πλάνο Επαγγελματίας κοστίζει 19 € τον μήνα (ή 190 € τον χρόνο) με απεριόριστα ακίνητα και ομάδα. Αλλάζεις ή ακυρώνεις όποτε θέλεις· οι τιμές περιλαμβάνουν ΦΠΑ.' },
  { q: 'Είναι ασφαλή τα δεδομένα μου;', a: 'Το παίρνουμε πιο σοβαρά από οτιδήποτε άλλο. Κάθε μεταφορά γίνεται μέσα από κρυπτογραφημένη σύνδεση και κάθε χρήστης βλέπει αποκλειστικά τα δικά του δεδομένα, με απομόνωση σε επίπεδο βάσης. Τα έγγραφα και τα νούμερά σου δεν χρησιμοποιούνται ποτέ για εκπαίδευση μοντέλων. Τα δεδομένα αποθηκεύονται σε ευρωπαϊκά κέντρα δεδομένων, σύμφωνα με τον GDPR και τον ελληνικό νόμο 4624/2019. Στην Πολιτική Απορρήτου θα βρεις αναλυτικά τι συλλέγουμε, γιατί και ποια δικαιώματα έχεις.' },
  { q: 'Τι γίνεται με τα δεδομένα μου αν σταματήσω;', a: 'Παραμένουν δικά σου. Μπορείς να τα εξάγεις ανά πάσα στιγμή μέσα από την εφαρμογή και να διαγράψεις τον λογαριασμό σου όποτε θέλεις. Μετά τη διαγραφή, τα δεδομένα σου διαγράφονται οριστικά μέσα σε 30 ημέρες, εκτός από όσα οφείλουμε να τηρήσουμε βάσει νόμου, όπως τα φορολογικά παραστατικά.' },
  { q: 'Δουλεύει στο κινητό;', a: 'Παντού. Η εφαρμογή προσαρμόζεται πλήρως σε κινητό, tablet και υπολογιστή. Η σάρωση δουλεύει ιδανικά με την κάμερα του κινητού σου: φωτογραφίζεις τον λογαριασμό εκεί που τον παραλαμβάνεις και έχει ήδη καταχωρηθεί πριν φτάσεις σπίτι.' },
  { q: 'Πόσο γρήγορα ξεκινάω;', a: 'Η εγγραφή θέλει λιγότερο από ένα λεπτό, με Google ή με email. Προσθέτεις το πρώτο σου ακίνητο με λίγα βασικά στοιχεία και η εικόνα του συμπληρώνεται σιγά σιγά, με κάθε έγγραφο που περνάς μέσα. Αν θέλεις να δεις πρώτα πώς λειτουργεί, υπάρχουν έτοιμα δεδομένα επίδειξης για να εξερευνήσεις ελεύθερα, πριν βάλεις τα δικά σου.' },
];

// Ταινία δυνατοτήτων στο κάτω άκρο του hero: διαρκής, ήρεμη κίνηση (παύση στο hover).
const TICKER = [
  'Σάρωση εγγράφων', 'Σύγκριση 11+ παρόχων ρεύματος', 'Φορολογία 2026', '«Σπίτι μου ΙΙ»',
  '«Ανακαινίζω-Νοικιάζω»', 'Βοηθός με ελληνική φωνή', 'Αποδόσεις σε πραγματικό χρόνο',
  'Ε2 έτοιμο για τον λογιστή', 'Δεδομένα σε EU · GDPR',
];

const STATS = [
  { n: '11+', l: 'πάροχοι ρεύματος, με όλα τα τιμολόγιά τους σε ζωντανή σύγκριση' },
  { n: '2026', l: 'φορολογία και νομοθεσία, πάντα στην ισχύουσα έκδοση' },
  { n: 'Δάνεια', l: 'τράπεζες, επιτόκια και προγράμματα όπως «Σπίτι μου ΙΙ» και «Ανακαινίζω-Νοικιάζω»' },
  { n: 'EU', l: 'δεδομένα κρυπτογραφημένα, συμβατά με τον GDPR' },
];

const SECURITY = [
  { t: 'Κρυπτογραφημένη σύνδεση', d: 'Τίποτα δεν ταξιδεύει χωρίς κρυπτογράφηση, ούτε για μια στιγμή.', i: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4' },
  { t: 'Απομόνωση ανά χρήστη', d: 'Βλέπεις μόνο τα δικά σου δεδομένα. Κανείς άλλος δεν έχει πρόσβαση.', i: 'M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z' },
  { t: 'Καμία εκπαίδευση μοντέλων', d: 'Τα έγγραφα και τα νούμερά σου δεν τροφοδοτούν κανένα μοντέλο.', i: 'M12 2v4M12 18v4M2 12h4M18 12h4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
  { t: 'Δεδομένα σε EU · GDPR', d: 'Αποθήκευση σε ευρωπαϊκά κέντρα δεδομένων, πλήρως συμβατή με τον GDPR.', i: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M2 12h20M12 2c3 3 3 17 0 20M12 2c-3 3-3 17 0 20' },
];

const wrap: React.CSSProperties = { maxWidth: 1140, margin: '0 auto', padding: '0 clamp(20px, 5vw, 48px)' };
const ic = (d: string) => <svg width={21} height={21} viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{d.split('M').filter(Boolean).map((p, i) => <path key={i} d={'M' + p} />)}</svg>;
const check = <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M20 6 9 17l-5-5" /></svg>;

export default async function Landing() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const loggedIn = !!user;

  return (
    <div className="lp-root" style={{ color: TEXT, minHeight: '100vh', fontFamily: "'Inter',-apple-system,sans-serif", overflowX: 'clip', position: 'relative' }}>

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
        @media (max-width: 860px) { .lp-faq-grid { grid-template-columns: 1fr !important; } }
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
        @media (max-width: 520px) { .lp-hide-xs { display: none !important; } }
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
            <div style={{ width: 28, height: 28, borderRadius: 8, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-text)', fontWeight: 800, fontSize: 15 }}>P</div>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>Property OS</span>
          </div>
          {loggedIn ? (
            <Link href="/dashboard" className="lp-cta lp-primary" style={{ textDecoration: 'none', fontSize: 14, fontWeight: 700, padding: '9px 18px', borderRadius: 100 }}>Ο πίνακάς μου →</Link>
          ) : (<>
            <Link href="/login" className="lp-link lp-hide-xs" style={{ color: MUTED, textDecoration: 'none', fontSize: 14, fontWeight: 600, padding: '8px 12px' }}>Σύνδεση</Link>
            <Link href="/signup" className="lp-cta lp-primary" style={{ textDecoration: 'none', fontSize: 14, fontWeight: 700, padding: '9px 18px', borderRadius: 100 }}>Ξεκίνα δωρεάν</Link>
          </>)}
        </nav>
      </header>

      <main id="main">

      {/* ── Hero: κινηματογραφικό, πάντα σκοτεινό, με το προϊόν φωτισμένο σαν έκθεμα ── */}
      <section className="lp-hero" style={{ position: 'relative', overflow: 'hidden' }}>
        <div className="lp-aurora" aria-hidden="true" />
        <div style={{ ...wrap, position: 'relative', zIndex: 1, paddingTop: 'clamp(64px, 9vw, 112px)', paddingBottom: 'clamp(48px, 7vw, 84px)', textAlign: 'center' }}>
          <h1 className="lp-rise" style={{ fontSize: 'clamp(38px, 7.2vw, 78px)', fontWeight: 680, letterSpacing: '-0.04em', lineHeight: 1.05, margin: '0 auto 24px', maxWidth: 1000, color: '#fff' }}>
            Φωτογραφίζεις{' '}
            <span className="lp-rotor">
              <span>τον λογαριασμό.</span>
              <span>το μισθωτήριο.</span>
              <span>το ασφαλιστήριο.</span>
              <span>τον ΕΝΦΙΑ.</span>
            </span>
            <br />
            <span style={{ color: 'rgba(255,255,255,.52)' }}>Το Property OS κάνει τα υπόλοιπα.</span>
          </h1>
          <p className="lp-rise-2" style={{ fontSize: 'clamp(15px, 2vw, 19px)', color: 'rgba(255,255,255,.66)', lineHeight: 1.6, maxWidth: 620, margin: '0 auto 32px' }}>
            Καταχωρεί, υπολογίζει, συγκρίνει τα δικά σου δεδομένα. Απαντά στα ελληνικά. Αποφασίζεις εσύ.
          </p>
          <div className="lp-rise-3" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {loggedIn ? (
              <Link href="/dashboard" className="lp-cta" style={{ background: '#1a73e8', color: '#fff', textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '14px 28px', borderRadius: 100 }}>Άνοιξε τον πίνακά σου →</Link>
            ) : (<>
              <Link href="/signup" className="lp-cta" style={{ background: '#1a73e8', color: '#fff', textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '14px 28px', borderRadius: 100 }}>Ξεκίνα δωρεάν →</Link>
              <Link href="/login" style={{ background: 'transparent', color: '#fff', textDecoration: 'none', fontSize: 15, fontWeight: 600, padding: '14px 28px', borderRadius: 100, border: '1px solid rgba(255,255,255,.22)', transition: 'border-color .15s, background .15s' }}>Έχω λογαριασμό</Link>
            </>)}
          </div>
          <div className="lp-rise-4" style={{ marginTop: 18, fontSize: 12.5, color: 'rgba(255,255,255,.45)' }}>Χωρίς κάρτα · Το πρώτο ακίνητο πάντα δωρεάν · Συμβατό με τον GDPR</div>

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 1, background: LINE, border: `1px solid ${LINE}`, borderRadius: 18, overflow: 'hidden' }}>
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
        <SectionHead over="Δυνατότητες" title="Ό,τι χρειάζεται το ακίνητό σου" sub="Από τον λογαριασμό ρεύματος μέχρι τη φορολογική δήλωση, όλα με τη σειρά που τα χρειάζεσαι." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
          {FEATURES.map((f, i) => (
            <div key={i} className="lp-card" style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 18, padding: 'clamp(22px, 2.6vw, 28px)' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>{ic(f.i)}</div>
              <h3 style={{ fontSize: 16.5, fontWeight: 680, margin: '0 0 8px', letterSpacing: '-0.015em' }}>{f.t}</h3>
              <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.6, margin: 0 }}>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Ζωντανό εργαλείο απόδοσης: αξία επιτόπου, με τον αληθινό μας μηχανισμό ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingBottom: 'clamp(44px, 7vw, 84px)' }}>
        <SectionHead over="Δες το μόνος σου" title="Πόσο σου αποδίδει πραγματικά;" sub="Βάλε τα νούμερα του ακινήτου σου. Τρέχει ο ίδιος μηχανισμός με την εφαρμογή, με τη φορολογία ενοικίων του 2026, εδώ και τώρα." />
        <LandingCalculator />
      </section>

      {/* ── Security & trust ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingBottom: 'clamp(44px, 7vw, 84px)' }}>
        <div className="lp-split" style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 18, padding: 'clamp(24px, 3vw, 38px)', display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 'clamp(24px, 3vw, 40px)', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: FAINT, marginBottom: 12 }}>Ασφάλεια</div>
            <h3 style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 680, letterSpacing: '-0.03em', lineHeight: 1.15, margin: '0 0 12px' }}>Τα δεδομένα σου είναι δικά σου</h3>
            <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, margin: 0 }}>
              Οι λογαριασμοί, τα συμβόλαια και τα νούμερά σου είναι από τα πιο ευαίσθητα δεδομένα που έχεις. Τα αντιμετωπίζουμε ανάλογα.
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
        <SectionHead over="Τιμολόγηση" title="Ξεκίνα δωρεάν. Πλήρωσε μόνο όταν αξίζει." sub="Μια συνδρομή που τη βγάζουν όσα γλιτώνεις από τις συγκρίσεις." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 16, maxWidth: 1040, margin: '0 auto', alignItems: 'stretch' }}>

          {/* Δωρεάν */}
          <PlanCard
            name="Δωρεάν" nameColor={TEXT} sub="Για τον ιδιοκτήτη με ένα ακίνητο"
            price="0 €" per="για πάντα" note="Χωρίς κάρτα, χωρίς λήξη"
            items={['1 ακίνητο, οποιουδήποτε τύπου', 'Σάρωση με φωτογραφία και βοηθός με φωνή', 'Αποδόσεις, δαπάνες, ενέργεια, φορολογία', 'Υπενθυμίσεις πριν από κάθε προθεσμία']}
            cta="Ξεκίνα δωρεάν" ctaGhost featured={false}
          />

          {/* Ιδιοκτήτης */}
          <PlanCard
            name="Ιδιοκτήτης" nameColor={ACCENT} sub="Για χαρτοφυλάκιο, ενοικιαστές και βραχυχρόνια"
            price="6,90 €" per="τον μήνα" note={<>ή <strong style={{ color: TEXT }}>59 € τον χρόνο</strong>, έκπτωση 29%</>}
            items={['Έως 15 ακίνητα, όλων των τύπων', 'Όλα όσα έχει το δωρεάν πλάνο, χωρίς όρια', 'Συγκρίσεις μεταξύ των ακινήτων σου', 'Εξαγωγή φορολογικών στοιχείων για τον λογιστή', 'Προτεραιότητα στη σάρωση και στον βοηθό']}
            cta="Ξεκίνα δωρεάν →" featured
          />

          {/* Επαγγελματίας */}
          <PlanCard
            name="Επαγγελματίας" nameColor={TEXT} sub="Για μεσιτικά, διαχειριστές και λογιστές"
            price="19 €" per="τον μήνα" note={<>ή <strong style={{ color: TEXT }}>190 € τον χρόνο</strong>, δύο μήνες δώρο</>}
            items={['Απεριόριστα ακίνητα', 'Πολλοί χρήστες στην ίδια ομάδα', 'Αναφορές με τη δική σου επωνυμία', 'Υποστήριξη κατά προτεραιότητα']}
            cta="Ξεκίνα δωρεάν →" ctaGhost featured={false}
          />
        </div>
        <p style={{ textAlign: 'center', fontSize: 12.5, color: FAINT, margin: '22px auto 0', maxWidth: 540, lineHeight: 1.6 }}>
          Αλλάζεις πλάνο όποτε θέλεις, χωρίς δέσμευση. Οι τιμές περιλαμβάνουν ΦΠΑ.
        </p>
      </section>

      {/* ── FAQ: δίστηλο, λιτή λίστα με λεπτές διαχωριστικές γραμμές ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingBottom: 'clamp(48px, 7vw, 92px)' }}>
        <div className="lp-faq-grid" style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.4fr', gap: 'clamp(24px, 5vw, 72px)', alignItems: 'start' }}>
          <div>
            <h2 style={{ fontSize: 'clamp(24px, 3.8vw, 37px)', fontWeight: 680, letterSpacing: '-0.03em', lineHeight: 1.13, margin: '0 0 14px' }}>Συχνές ερωτήσεις</h2>
            <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, margin: 0, maxWidth: 340 }}>Ό,τι ρωτούν οι ιδιοκτήτες πριν ξεκινήσουν, με ειλικρινείς απαντήσεις.</p>
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
          <h2 style={{ fontSize: 'clamp(28px, 4.6vw, 46px)', fontWeight: 680, letterSpacing: '-0.035em', lineHeight: 1.08, margin: '0 auto 16px', maxWidth: 720, color: '#fff' }}>Το ακίνητό σου, υπό έλεγχο.</h2>
          <p style={{ fontSize: 'clamp(14px, 1.8vw, 17px)', color: 'rgba(255,255,255,.62)', lineHeight: 1.6, maxWidth: 480, margin: '0 auto 30px' }}>Φωτογράφισε το πρώτο έγγραφο και δες το να μπαίνει σε τάξη. Δωρεάν, χωρίς δέσμευση.</p>
          <Link href={loggedIn ? '/dashboard' : '/signup'} className="lp-cta" style={{ display: 'inline-block', background: '#1a73e8', color: '#fff', textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '14px 30px', borderRadius: 100 }}>{loggedIn ? 'Άνοιξε τον πίνακά σου →' : 'Ξεκίνα δωρεάν →'}</Link>
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
                <div style={{ width: 24, height: 24, borderRadius: 8, background: ACCENT, color: 'var(--accent-text)', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>P</div>
                <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>Property OS</span>
              </div>
              <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, margin: 0 }}>Το λειτουργικό σύστημα του ελληνικού ακινήτου. Φτιαγμένο εδώ, για ιδιοκτήτες και επαγγελματίες.</p>
            </div>
            <div style={{ display: 'flex', gap: 'clamp(28px, 6vw, 64px)', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: FAINT, marginBottom: 2 }}>Προϊόν</span>
                <Link href="/signup" className="lp-link" style={{ color: MUTED, textDecoration: 'none', fontSize: 13.5 }}>Ξεκίνα δωρεάν</Link>
                <Link href="/login" className="lp-link" style={{ color: MUTED, textDecoration: 'none', fontSize: 13.5 }}>Σύνδεση</Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: FAINT, marginBottom: 2 }}>Νομικά</span>
                <Link href="/privacy" className="lp-link" style={{ color: MUTED, textDecoration: 'none', fontSize: 13.5 }}>Απόρρητο</Link>
                <Link href="/terms" className="lp-link" style={{ color: MUTED, textDecoration: 'none', fontSize: 13.5 }}>Όροι Χρήσης</Link>
              </div>
            </div>
          </div>
          <div style={{ paddingTop: 20, borderTop: `1px solid ${LINE}`, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 12.5, color: FAINT }}>
            <span>© {new Date().getFullYear()} Property OS</span>
            <span>Δεδομένα σε EU · Συμβατό με τον GDPR</span>
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

function PlanCard({ name, nameColor, sub, price, per, note, items, cta, ctaGhost, featured }: {
  name: string; nameColor: string; sub: string; price: string; per: string; note: React.ReactNode; items: string[]; cta: string; ctaGhost?: boolean; featured: boolean;
}) {
  return (
    <div className="lp-card" style={{ background: PANEL, border: featured ? `1.5px solid color-mix(in srgb, var(--accent) 50%, transparent)` : `1px solid ${LINE}`, borderRadius: 18, padding: 'clamp(22px, 2.6vw, 30px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: nameColor, marginBottom: 4 }}>{name}</div>
      <div style={{ fontSize: 12, color: FAINT, marginBottom: 18, minHeight: 32 }}>{sub}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 'clamp(32px, 4.4vw, 40px)', fontWeight: 680, letterSpacing: '-0.03em', color: TEXT }}>{price}</span>
        <span style={{ fontSize: 15, color: MUTED }}>{per}</span>
      </div>
      <div style={{ fontSize: 13, color: FAINT, minHeight: 20 }}>{note}</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left', margin: '22px 0 24px' }}>
        {items.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>{check}<span style={{ fontSize: 14, color: TEXT, lineHeight: 1.4 }}>{t}</span></div>
        ))}
      </div>
      <Link href="/signup" className={ctaGhost ? 'lp-ghost' : 'lp-cta lp-primary'} style={{ display: 'block', textAlign: 'center', background: ctaGhost ? 'transparent' : '#1a73e8', color: ctaGhost ? TEXT : '#fff', textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '13px', borderRadius: 100, border: ctaGhost ? `1px solid ${LINE}` : 'none' }}>{cta}</Link>
    </div>
  );
}
