// ═══════════════════════════════════════════════════════════════════════════
// Ο ΚΑΤΑΛΟΓΟΣ ΤΙΜΟΛΟΓΙΩΝ ΡΕΥΜΑΤΟΣ — ΔΕΔΟΜΕΝΑ, ΟΧΙ ΟΘΟΝΗ
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΕΦΥΓΕ ΑΠΟ ΤΟ COMPONENT. Ήταν 194 γραμμές μέσα σε αρχείο 950 γραμμών —
// το 21% μιας οθόνης ήταν πίνακας δεδομένων. Κάθε φορά που κάποιος διόρθωνε μια
// τιμή, ο διαφορικός έδειχνε αλλαγή σε React component· κάθε φορά που κάποιος
// άλλαζε την απόδοση, έπρεπε να προσπεράσει εκατό τιμολόγια.
//
// ΓΙΑΤΙ ΔΕΝ ΕΓΙΝΕ ΝΩΡΙΤΕΡΑ, ΚΑΙ ΤΙ ΕΠΡΕΠΕ ΝΑ ΔΙΟΡΘΩΘΕΙ ΠΡΩΤΑ. Το
// `lib/energy/tariff.test.ts` φύλαγε τον κατάλογο διαβάζοντας το ΑΡΧΕΙΟ ως
// κείμενο, με regex ανά γραμμή: απαιτούσε κάθε τιμολόγιο να είναι σε μία γραμμή
// ΚΑΙ μέσα στο `BillsElectricity.tsx`. Μετακίνηση του καταλόγου θα ακύρωνε τον
// φρουρό ΣΙΩΠΗΛΑ — θα περνούσε με μηδέν ευρήματα, δηλαδή θα έδειχνε πράσινο
// ακριβώς επειδή δεν έβρισκε τίποτα να ελέγξει. Ο έλεγχος ξαναγράφτηκε πρώτα,
// πάνω στα ΑΝΤΙΚΕΙΜΕΝΑ: τώρα δεν τον νοιάζει πού ζουν ούτε πώς είναι γραμμένα.
//
// Ο ΤΥΠΟΣ ΜΕΝΕΙ ΔΗΛΩΜΕΝΟΣ. Ένα τιμολόγιο με λάθος όνομα πεδίου (`kwh_tier_2`
// αντί `kwh_tier2`) ή με ξεχασμένο `vat` θα περνούσε τη μεταγλώττιση και θα
// έβγαζε λάθος σύγκριση κόστους στην οθόνη του ιδιοκτήτη.
// ═══════════════════════════════════════════════════════════════════════════
import type { Tariff } from './tariff';

export type { PriceStatus } from './tariff';

export interface LocalTariff extends Tariff {
  desc: string;
  contract_months?: number;
  no_fixed?: boolean;
  smart_meter?: boolean;
  /**
   * Τιμολόγιο με ΠΕΡΙΟΡΙΣΜΟ ΔΙΚΑΙΩΜΑΤΟΣ: απαιτεί φοιτητική ιδιότητα.
   *
   * ΗΤΑΝ ΚΑΙ ΔΙΑΓΡΑΦΗΚΕ ΩΣ «ΝΕΚΡΟ», ΚΑΙ ΗΤΑΝ ΛΑΘΟΣ. Το πεδίο υπήρχε, καμία
   * γραμμή δεν το διάβαζε και η διαγραφή του φάνηκε καθαρή. Το ότι δεν το
   * διάβαζε κανείς ΗΤΑΝ το σφάλμα: τέσσερα φοιτητικά τιμολόγια έμπαιναν στη
   * σύγκριση όλων και δύο από αυτά έβγαιναν ΠΡΩΤΑ, με τιμή που ο ιδιοκτήτης δεν
   * δικαιούται. Θα άλλαζε πάροχο και θα απορριπτόταν στην αίτηση.
   */
  studentOnly?: boolean;

  /**
   * ΤΟ ΜΗΝΙΑΙΟ ΠΟΣΟ ΕΙΝΑΙ ΕΝΑΝΤΙ, ΟΧΙ ΤΙΜΗ: ΕΚΚΑΘΑΡΙΖΕΤΑΙ ΑΡΓΟΤΕΡΑ.
   *
   * Το «myHome Plan» της ΔΕΗ χρεώνει 60 € κάθε μήνα και εκκαθαρίζει την
   * πραγματική κατανάλωση δύο φορές τον χρόνο, στον έκτο και στον δωδέκατο
   * μήνα της σύμβασης, με τις καταμετρήσεις του ΔΕΔΔΗΕ. Ο κατάλογος το κρατούσε
   * ως `flat_monthly: 60` χωρίς κανένα όριο κιλοβατωρών, δηλαδή η εφαρμογή
   * υποστήριζε ότι 60 € αγοράζουν ΟΣΗ ενέργεια θέλει κανείς. Σε 600 kWh τον
   * μήνα το τιμολόγιο έβγαινε πρώτο στην κατάταξη με ποσό που η εκκαθάριση
   * ακυρώνει· η οθόνη θα το πρότεινε σε δωδεκάμηνη δέσμευση.
   *
   * Η ΑΡΧΗ ΥΠΑΡΧΕΙ ΗΔΗ ΣΤΟ ΕΡΓΟ, ΔΥΟ ΦΟΡΕΣ: τα δυναμικά και όσα κλείνουν
   * αναδρομικά με ΜΔΚΑ δεν υπολογίζονται, γιατί εκτίμηση με ύφος υπολογισμού
   * είναι μαντεψιά. Εδώ ισχύει το ίδιο, με μια διαφορά: το τιμολόγιο μένει
   * επιλέξιμο ως ΤΡΕΧΟΝ, ώστε όποιος το έχει να το δηλώσει, αλλά δεν μπαίνει σε
   * κατάταξη ώσπου να καταγραφούν το πάγιο και η τιμή του με πηγή.
   */
  settled?: boolean;

}

export interface ProviderGroup { value: string; label: string; url: string; tariffs: LocalTariff[] }

/**
 * Πακέτα σταθερού μηνιαίου που ΔΕΝ δημοσιεύουν όριο κιλοβατωρών σε αριθμό.
 *
 * ΓΙΑΤΙ ΚΑΤΑΓΡΑΦΟΝΤΑΙ ΑΝΤΙ ΝΑ ΣΥΜΠΛΗΡΩΘΟΥΝ. Το «myHome Plan» γράφει στην
 * περιγραφή του «ιδανικό για 2.500-4.500 kWh/έτος» — εύρος, όχι όριο. Το να
 * βάλουμε εμείς έναν αριθμό θα ήταν εφεύρεση δεδομένου που κρίνει αν ο χρήστης
 * θα χρεωθεί υπέρβαση. Καταγράφεται ρητά, η οθόνη το λέει και ο έλεγχος
 * απαγορεύει στη λίστα να μεγαλώσει.
 */
export const FLAT_WITHOUT_ALLOWANCE = new Set([
  // Το «myHome Plan» έφυγε από εδώ: το θέμα του δεν είναι αδημοσίευτο όριο
  // κιλοβατωρών αλλά εκκαθάριση δύο φορές τον χρόνο. Φέρει `settled` και δική
  // του εξήγηση, γιατί μια προειδοποίηση για «υπέρβαση ορίου» θα έστελνε τον
  // ιδιοκτήτη να ρωτήσει τον πάροχο λάθος ερώτηση.
  'zen_zenergy_s',   // η ίδια η περιγραφή λέει «ακριβές όριο: δες zenith.gr»
  'zen_zenergy_m',
  'zen_zenergy_l',
]);

/**
 * Κάθε τιμολόγιο του καταλόγου, ισοπεδωμένο. Για ΕΛΕΓΧΟ του καταλόγου.
 *
 * Μαζί με την ετικέτα του παρόχου έρχεται και η σελίδα του. Ο λόγος είναι η
 * τελευταία γραμμή της σύγκρισης, που ζητά από τον χρήστη να επιβεβαιώσει την
 * τιμή στον πάροχο πριν υπογράψει: μια οδηγία χωρίς σύνδεσμο είναι οδηγία που
 * δεν εκτελείται. Η διεύθυνση υπήρχε ήδη στο `ProviderGroup`, απλώς σταματούσε
 * εδώ και δεν έφτανε ποτέ στη γραμμή του τιμολογίου.
 */
export const ALL_TARIFFS = (): (LocalTariff & { providerLabel: string; providerUrl: string })[] =>
  PROVIDERS.flatMap(p => p.tariffs.map(t => ({ ...t, providerLabel: p.label, providerUrl: p.url })));

/**
 * Όσα μπορεί πράγματι να επιλέξει ο ιδιοκτήτης. ΑΥΤΑ συγκρίνονται.
 *
 * Τα φοιτητικά μένουν στον κατάλογο — υπάρχουν και ένας ιδιοκτήτης που ΕΙΝΑΙ
 * φοιτητής μπορεί να τα δηλώσει ως τρέχον τιμολόγιό του. Δεν προτείνονται όμως
 * ποτέ ως «καλύτερη επιλογή»: μια σύσταση που θα απορριφθεί στην αίτηση δεν
 * είναι σύσταση, είναι χαμένος χρόνος και χαμένη εμπιστοσύνη.
 */
export const COMPARABLE_TARIFFS = (): (LocalTariff & { providerLabel: string; providerUrl: string })[] =>
  ALL_TARIFFS().filter(t => !t.studentOnly && !t.settled);

// ── REAL TARIFFS, SOURCE: bestenergydeals.gr / pricefox.gr / Selectra (June–July 2026) ──
// Τα πεδία που χρειάζεται ο ΥΠΟΛΟΓΙΣΜΟΣ ζουν στο lib/energy/tariff.ts. Εδώ
// προστίθενται μόνο όσα χρειάζεται η ΟΘΟΝΗ. Έτσι, όποιος αλλάξει τον τρόπο
// χρέωσης το κάνει σε ένα αρχείο που έχει tests, όχι μέσα σε ένα component.
// ΤΟ `as unknown as LocalTariff[]` ΗΤΑΝ ΓΡΑΜΜΕΝΟ ΕΝΤΕΚΑ ΦΟΡΕΣ, μία ανά πάροχο.
// Ο κανόνας του έργου το απαγορεύει και εδώ δεν έκρυβε καν λάθος δεδομένα:
// έκρυβε ότι ο κατάλογος ΔΕΝ ελεγχόταν καθόλου. Ένα τιμολόγιο με λάθος όνομα
// πεδίου (`kwh_tier_2` αντί `kwh_tier2`) ή με ξεχασμένο `vat` θα περνούσε τη
// μεταγλώττιση και θα έβγαζε λάθος σύγκριση κόστους στην οθόνη του ιδιοκτήτη.
// Με δηλωμένο τύπο στο ίδιο το PROVIDERS, κάθε ένα από τα εκατόν είκοσι
// τιμολόγια ελέγχεται πεδίο προς πεδίο.
export const PROVIDERS: ProviderGroup[] = [
  {
    value: 'dei', label: 'ΔΕΗ', url: 'https://www.dei.gr',
    tariffs: [
      // ══ Η ΠΕΡΙΓΡΑΦΗ ΕΛΕΓΕ ΑΛΛΟ ΠΑΓΙΟ ΑΠΟ ΑΥΤΟ ΠΟΥ ΥΠΟΛΟΓΙΖΟΤΑΝ ════════════
      // Το κείμενο έγραφε «Πάγιο 7,50 €», το πεδίο κρατούσε 7,35 και η οθόνη
      // τυπώνει το πεδίο. Ο ιδιοκτήτης διάβαζε δύο νούμερα για το ίδιο πράγμα,
      // δύο γραμμές το ένα από το άλλο. Το 7,35 είναι η τιμή του Αυγούστου από
      // τη ΡΑΑΕΥ, όπως και όλος ο υπόλοιπος κατάλογος· το 7,50 ήταν υπόλειμμα
      // παλιότερης διόρθωσης που έμεινε μόνο μέσα στην πρόταση.
      //
      // ΚΑΙ Ο ΚΑΝΟΝΑΣ ΕΓΙΝΕ ΕΛΕΓΧΟΣ. Η περιγραφή δεν επαναλαμβάνει αριθμό που
      // η οθόνη δείχνει ήδη από το πεδίο: το πάγιο τυπώνεται μόνο του, οι δύο
      // κλίμακες επίσης. Το `tariff.test.ts` απαγορεύει πλέον σε περιγραφή να
      // αναφέρει τιμή ή πάγιο που δεν υπάρχει ως πεδίο.
      { id: 'dei_enter',        name: 'myHome Enter',           badge: 'ΜΠΛΕ',    type: 'fixed',         kwh_day: 0.1421, kwh_night: null,   fixed: 7.35, fixed_ebill: 3.50, contract_months: 12, vat: 6, segment: 'residential', desc: 'Σταθερό 12 μήνες. Το πάγιο πέφτει με ηλεκτρονικό λογαριασμό και πάγια εντολή.' },
      // FIX: πάγιο myHome EnterTwo αναπροσαρμόστηκε → 9,00 € (επιβεβαιωμένο, Ιούλιος 2026)
      { id: 'dei_entertwo',     name: 'myHome EnterTwo',        badge: 'ΜΠΛΕ',    type: 'fixed',         kwh_day: 0.1421, kwh_night: 0.1029, fixed: 8.82, fixed_ebill: 3.50, contract_months: 24, vat: 6, segment: 'residential', desc: 'Σταθερό 24 μήνες με νυχτερινή ζώνη, από τις 23:00 έως τις 07:00. Ιδανικό για πλυντήρια, θερμοσίφωνα.' },
      { id: 'dei_online', priceStatus: 'verified',       name: 'myHome Online',          badge: 'ΜΠΛΕ',    type: 'fixed',         kwh_day: 0.1420, kwh_night: null,   fixed: 3.50, fixed_ebill: 3.50, contract_months: 12, vat: 6, segment: 'residential', desc: 'Σταθερό online-only 12 μήνες. Χαμηλότερη τιμή με e-bill + πάγια εντολή.' },
      // FIX: κλιμάκια myHome Maxima αναπροσαρμόστηκαν 0.132/0.122 → 0.141/0.129 (επιβεβαιωμένο, Ιούλιος 2026)
      { id: 'dei_maxima',       name: 'myHome Maxima',          badge: 'ΜΠΛΕ',    type: 'fixed',         kwh_day: 0.13818, kwh_night: null,   kwh_tier2: 0.12642, tier2_threshold: 600, fixed: 13.23, fixed_ebill: 3.50, contract_months: 18, vat: 6, segment: 'residential', desc: 'Κλιμακωτό: 0,141 € έως τις 600 kWh και 0,129 € πάνω από αυτές. Συμφέρει για υψηλή κατανάλωση.' },
      { id: 'dei_plan', settled: true,         name: 'myHome Plan',            badge: 'ΜΠΛΕ',    type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 60.00, fixed: 0, contract_months: 12, vat: 6, segment: 'residential', desc: 'Πληρώνεις 60 € τον μήνα έναντι και η ΔΕΗ εκκαθαρίζει την πραγματική κατανάλωση δύο φορές τον χρόνο, στον έκτο και στον δωδέκατο μήνα. Το μηνιαίο ποσό δεν είναι το κόστος σου και το τιμολόγιο δεν μπαίνει στη σύγκριση.' },
      { id: 'dei_4all',         name: 'myHome 4All',            badge: 'ΚΙΤΡΙΝΟ', type: 'variable',      kwh_day: 0.15135, kwh_night: null,   kwh_tier2: 0.19482, tier2_threshold: 500, fixed: 4.90, fixed_ebill: 3.50, contract_months: 12, vat: 6, segment: 'residential', desc: 'Κυμαινόμενο κλιμακωτό: χαμηλότερη τιμή έως τις 500 kWh τον μήνα, υψηλότερη πάνω από αυτές. Χωρίς δέσμευση.' },
      { id: 'dei_4students', studentOnly: true,    name: 'myHome 4Students',       badge: 'ΚΙΤΡΙΝΟ', type: 'variable',      kwh_day: 0.11155, kwh_night: null,   kwh_tier2: 0.1850, tier2_threshold: 150, fixed: 2.91, fixed_ebill: 0, contract_months: 12, vat: 6, segment: 'residential', desc: 'Φοιτητικό κλιμακωτό, με όριο τις 150 kWh τον μήνα. Bonus καλοκαίρι. Απαιτείται φοιτητική ιδιότητα.' },
      { id: 'dei_prasino',      name: 'Γ1 Πράσινο',            badge: 'ΠΡΑΣΙΝΟ', type: 'variable',      kwh_day: 0.1440, kwh_night: null,   fixed: 5.00, fixed_ebill: 3.50, contract_months: 0, vat: 6, segment: 'residential', desc: 'Ειδικό Οικιακό (Γ1), κυμαινόμενο. Ανακοινώνεται κάθε 1η του μήνα.' },
      { id: 'dei_prasino_n',    name: 'Γ1Ν Πράσινο Νυχτερινό', badge: 'ΠΡΑΣΙΝΟ', type: 'variable',      kwh_day: 0.1440, kwh_night: 0.1160, fixed: 5.00, fixed_ebill: 3.50, contract_months: 0, vat: 6, segment: 'residential', desc: 'Ειδικό με νυχτερινή ζώνη. Ανακοινώνεται κάθε 1η του μήνα.' },
      { id: 'dei_dynamic',      name: 'myHome Dynamic',         badge: 'ΔΥΝΑΜΙΚΟ',type: 'dynamic',       kwh_day: 0, kwh_night: null, fixed: 5.00, smart_meter: true, contract_months: 0, vat: 6, segment: 'residential', desc: 'Ωριαία τιμολόγηση βάσει χονδρεμπορικής (HEnEx). Απαιτεί έξυπνο μετρητή ΔΕΔΔΗΕ.' },
      // ── Επαγγελματικά (Γ21/Γ22) ────────────────────────────────────────
      { id: 'dei_biz_4all', priceStatus: 'verified', name: 'MyBussiness4ALL', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.16863, kwh_night: null, flat_monthly: null, fixed: 4.9, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'business', desc: 'Η τιμή και το πάγιο ισχύουν με πάγια εντολή πληρωμής.' },
      { id: 'dei_biz_g21', priceStatus: 'verified', name: 'Ειδικό Γ21', badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.172, kwh_night: null, flat_monthly: null, fixed: 5.0, fixed_ebill: null, contract_months: 0, no_fixed: false, vat: 6, segment: 'business', desc: 'Το ειδικό τιμολόγιο επαγγελματικής παροχής, χωρίς δέσμευση.' },
    ],
  },
    {
    value: 'heron', label: 'Ήρων', url: 'https://www.heron.gr',
    tariffs: [
      // ── Σταθερά (Μπλε) ────────────────────────────────────────────────────
      { id: 'heron_blue_smart', priceStatus: 'verified',   name: 'Blue Smart Home',              badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1380, kwh_night: null, flat_monthly: null, fixed: 7.95,  fixed_ebill: 7.95, contract_months: 12, no_fixed: false, vat: 6, segment: 'residential', desc: 'Πάγιο 7,95 € έως τις 150 kWh / 15,90 € πάνω από τις 150 kWh. Έκπτωση Συνέπειας.' },
      { id: 'heron_blue_gen_max', priceStatus: 'verified', name: 'Blue Generous Max Home',       badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1440, kwh_night: null, flat_monthly: null, fixed: 11.90, fixed_ebill: null, contract_months: 18, no_fixed: false, vat: 6, segment: 'residential', desc: 'Best Seller. Πάγιο 11,90 €. Έκπτωση Συνέπειας. 18 μήνες.' },
      { id: 'heron_blue_gen', priceStatus: 'verified',     name: 'Blue Generous Home',           badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1530, kwh_night: null, flat_monthly: null, fixed: 10.90, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'residential', desc: 'Πάγιο 10,90 €. Έκπτωση Συνέπειας.' },
      { id: 'heron_blue_simple', priceStatus: 'verified',  name: 'Blue Simple Home',             badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1580, kwh_night: null, flat_monthly: null, fixed: 15.90, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'residential', desc: 'Χωρίς προϋπόθεση συνέπειας. Πάγιο 15,90 €.' },
      // ── Κυμαινόμενα (Κίτρινα) ─────────────────────────────────────────────
      { id: 'heron_yellow_one',     name: 'Yellow One Home',            badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.17798, kwh_night: null, flat_monthly: null, fixed: 5.00,  fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'residential', desc: 'Κυμαινόμενο. Έκπτωση Συνέπειας. Συμβατό με ΚΟΤ.' },
      { id: 'heron_yellow_free', priceStatus: 'retro',    name: 'Yellow Free Home',           badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.0840,  kwh_night: null, flat_monthly: null, fixed: 0,     fixed_ebill: null, contract_months: 12, no_fixed: true,  vat: 6, segment: 'residential', desc: 'Χωρίς πάγιο. Τιμή συν ΜΔΚΑ. Απαιτείται πάγια εντολή.' },
      { id: 'heron_yellow_student', priceStatus: 'retro', studentOnly: true, name: 'Yellow Free Student',        badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.0840,  kwh_night: null, flat_monthly: null, fixed: 0,     fixed_ebill: null, contract_months: 12, no_fixed: true,  vat: 6, segment: 'residential', desc: 'Φοιτητικό. Χωρίς πάγιο. Δώρο 20 €. Απαιτείται φοιτητική ταυτότητα ή ΑΜΚΑ.' },
      { id: 'heron_protect', priceStatus: 'retro',        name: 'Protect Home',               badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.0825,  kwh_night: null, flat_monthly: null, fixed: 5.50,  fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'residential', desc: 'Νέο τιμολόγιο. Τιμή 0,0825 € συν ΜΔΚΑ. Πάγιο 5,50 €.' },
      { id: 'heron_happy_hour', priceStatus: 'retro',     name: 'Happy Hour Home',            badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.0825,  kwh_night: null, flat_monthly: null, fixed: 5.50,  fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'residential', desc: 'Νέο. 3 ώρες δωρεάν ρεύμα ημερησίως. Πάγιο 7 €.' },
      // ── Πράσινο (Γ1 Ειδικό) ───────────────────────────────────────────────
      { id: 'heron_basic',          name: 'Basic Home (Γ1 Πράσινο)',    badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1476,  kwh_night: null, flat_monthly: null, fixed: 5.00,  fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'residential', desc: 'Ειδικό τιμολόγιο Γ1. Ανακοινώνεται κάθε 1η μήνα. Έκπτωση συνέπειας 7 λεπτά ανά kWh.' },
      { id: 'heron_ena',            name: 'Ε.ΝΑ (Virtual Net Metering)', badge: 'VNM',   type: 'vnm',      kwh_day: 0.1290,  kwh_night: null, flat_monthly: null, fixed: 7.00,  fixed_ebill: null, contract_months: 0, no_fixed: false, vat: 6, segment: 'residential', desc: 'Εικονική Καθαρή Μέτρηση. Συμμετοχή σε κοινό φωτοβολταϊκό. Χωρίς δέσμευση.' },
      // ── Επαγγελματικά ──────────────────────────────────────────────────
      { id: 'heron_blue_smart_biz', priceStatus: 'verified', name: 'Blue Smart BUSINESS 2', badge: 'ΜΠΛΕ', type: 'fixed', kwh_day: 0.158, kwh_night: null, flat_monthly: null, fixed: 7.95, fixed_ebill: null, fixed_tier2: 15.9, fixed_tier2_threshold: 150, contract_months: 12, no_fixed: false, vat: 6, segment: 'business', desc: 'Πάγιο 7,95 € έως τις 150 kWh τον μήνα, 15,90 € πάνω από αυτές. Η τιμή ισχύει με συνέπεια στην πληρωμή.' },
      { id: 'heron_blue_gen_max_biz', priceStatus: 'verified', name: 'Blue Generous Max BUSINESS 4', badge: 'ΜΠΛΕ', type: 'fixed', kwh_day: 0.165, kwh_night: null, flat_monthly: null, fixed: 13.9, fixed_ebill: null, contract_months: 18, no_fixed: false, vat: 6, segment: 'business', desc: 'Δεκαοκτάμηνη δέσμευση. Η τιμή ισχύει με συνέπεια στην πληρωμή.' },
      { id: 'heron_protect_biz_s', priceStatus: 'retro', name: 'PROTECT 4 BUSINESS S', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0, kwh_night: null, flat_monthly: null, fixed: 5.5, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'business', desc: 'Η ΡΑΑΕΥ γράφει ότι η τελική τιμή του Αυγούστου 2026 ανακοινώνεται τον Σεπτέμβριο. Γράψε τον λογαριασμό σου για να μπει στη σύγκριση.' },
      { id: 'heron_yellow_one_biz', priceStatus: 'verified', name: 'Yellow One Business S 2', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.19558, kwh_night: null, flat_monthly: null, fixed: 5.0, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'business', desc: 'Κυμαινόμενο. Η τιμή ισχύει με συνέπεια στην πληρωμή.' },
      { id: 'heron_basic_biz_s', priceStatus: 'verified', name: 'BASIC BUSINESS S', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.1778, kwh_night: null, flat_monthly: null, fixed: 3.0, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'business', desc: 'Η τιμή ισχύει με συνέπεια στην πληρωμή.' },
    ],
  },

  {
    value: 'protergia', label: 'Protergia', url: 'https://www.protergia.gr',
    tariffs: [
      { id: 'prot_flow',        name: 'Value Flow',             badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.13767, kwh_night: null,  fixed: 5.00, contract_months: 0,  vat: 6, segment: 'residential', desc: 'Κυμαινόμενο, φθηνότερο της Protergia. Χωρίς δέσμευση.' },
      { id: 'prot_sure_18',     name: 'Value Sure 18M 2.0',     badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1450, kwh_night: null,  fixed: 5.00, contract_months: 18, vat: 6, segment: 'residential', desc: 'Σταθερό 18 μήνες. Κλειδωμένη τιμή μακροπρόθεσμα.' },
      { id: 'prot_sure_12',     name: 'Value Sure 12M',         badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1520, kwh_night: null,  fixed: 5.00, contract_months: 12, vat: 6, segment: 'residential', desc: 'Σταθερό 12 μήνες.' },
      { id: 'prot_standard',    name: 'Value Standard',         badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1590, kwh_night: null,  fixed: 5.00, contract_months: 0,  vat: 6, segment: 'residential', desc: 'Κυμαινόμενο ειδικό. Ανακοινώνεται κάθε 1η μήνα.' },
      { id: 'prot_lite2',       name: 'Value Lite 2.0',         badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.16267, kwh_night: null, fixed: 0,    no_fixed: true, contract_months: 0, vat: 6, segment: 'residential', desc: 'Χωρίς πάγιο. Ιδανικό για σπάνια χρήση ή εξοχικά.' },
      { id: 'prot_dynamic',     name: 'Dynamic One Home',       badge: 'ΔΥΝΑΜΙΚΟ',type: 'dynamic',  kwh_day: 0,      kwh_night: null, fixed: 0,    smart_meter: true, contract_months: 0, vat: 6, segment: 'residential', desc: 'Ωριαία δυναμική τιμολόγηση. Ενεργοποιήθηκε Ιούνιο 2026.' },
      // ── Picasso 2.0, ΟΛΑ τα 9 πακέτα + Φοιτητικό ────────────────────────
      // FIX: πριν υπήρχαν μόνο 3/9 πακέτα, με λάθος segment:'business' (το Picasso
      // είναι οικιακό προϊόν) και type:'flat' που δεν υπολογιζόταν καθόλου σωστά.
      // Επιβεβαιωμένο: Protergia Picasso, Προϊόν Χρονιάς 2026, μπλε/σταθερό,
      // 12μηνη σύμβαση, 5% δωρεάν ανοχή υπέρβασης, υπέρβαση 0,169 €/kWh,
      // ετήσια εκκαθάριση μέσω ΔΕΔΔΗΕ. (Πηγή: Selectra, protergia.gr, επιβεβαιωμένο screenshot)
      { id: 'prot_picasso_s1', name: 'Picasso Small, 1.325 kWh/έτος',  badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 39.90,  flat_annual_kwh: 1325,  flat_overage_rate: 0.169, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'residential', desc: 'All-in σταθερό μηνιαίο. Για ένα ή δύο άτομα, χαμηλές ανάγκες. Δώρο 5% επιπλέον kWh.' },
      { id: 'prot_picasso_s2', name: 'Picasso Small, 1.875 kWh/έτος',  badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 49.90,  flat_annual_kwh: 1875,  flat_overage_rate: 0.169, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'residential', desc: 'All-in σταθερό μηνιαίο. Για ένα ή δύο άτομα, χαμηλές ανάγκες. Δώρο 5% επιπλέον kWh.' },
      { id: 'prot_picasso_s3', name: 'Picasso Small, 2.700 kWh/έτος',  badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 64.90,  flat_annual_kwh: 2700,  flat_overage_rate: 0.169, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'residential', desc: 'All-in σταθερό μηνιαίο. Για ένα ή δύο άτομα, χαμηλές ανάγκες. Δώρο 5% επιπλέον kWh.' },
      { id: 'prot_picasso_m1', name: 'Picasso Medium, 3.550 kWh/έτος', badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 82.90,  flat_annual_kwh: 3550,  flat_overage_rate: 0.169, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'residential', desc: 'All-in σταθερό μηνιαίο. Για οικογένειες μέσου όρου κατανάλωσης. Δώρο 5% επιπλέον kWh.' },
      { id: 'prot_picasso_m2', name: 'Picasso Medium, 4.600 kWh/έτος', badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 102.90, flat_annual_kwh: 4600,  flat_overage_rate: 0.169, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'residential', desc: 'All-in σταθερό μηνιαίο. Για οικογένειες μέσου όρου κατανάλωσης. Δώρο 5% επιπλέον kWh.' },
      { id: 'prot_picasso_m3', name: 'Picasso Medium, 6.000 kWh/έτος', badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 134.90, flat_annual_kwh: 6000,  flat_overage_rate: 0.169, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'residential', desc: 'All-in σταθερό μηνιαίο. Για οικογένειες μέσου όρου κατανάλωσης. Δώρο 5% επιπλέον kWh.' },
      { id: 'prot_picasso_l1', name: 'Picasso Large, 11.000 kWh/έτος', badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 259.90, flat_annual_kwh: 11000, flat_overage_rate: 0.169, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'residential', desc: 'All-in σταθερό μηνιαίο. Για μεγάλες οικογένειες με αυξημένες ανάγκες. Δώρο 5% επιπλέον kWh.' },
      { id: 'prot_picasso_l2', name: 'Picasso Large, 15.300 kWh/έτος', badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 359.90, flat_annual_kwh: 15300, flat_overage_rate: 0.169, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'residential', desc: 'All-in σταθερό μηνιαίο. Για μεγάλες οικογένειες με αυξημένες ανάγκες. Δώρο 5% επιπλέον kWh.' },
      { id: 'prot_picasso_l3', name: 'Picasso Large, 20.200 kWh/έτος', badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 479.90, flat_annual_kwh: 20200, flat_overage_rate: 0.169, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'residential', desc: 'All-in σταθερό μηνιαίο. Για μεγάλες οικογένειες με αυξημένες ανάγκες. Δώρο 5% επιπλέον kWh.' },
      { id: 'prot_picasso_student', studentOnly: true, name: 'Picasso Student', badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 39.90, flat_annual_kwh: 1325, flat_overage_rate: 0.169, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'residential', desc: 'Ίδιο πακέτο με Picasso Small, αποκλειστικά για φοιτητές. Απαιτείται φοιτητική ταυτότητα.' },
      // ── Επαγγελματικά ──────────────────────────────────────────────────
      { id: 'prot_simple_biz1', priceStatus: 'verified', name: 'Επαγγελματικό 1 Value Simple 2.0', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.17804, kwh_night: null, flat_monthly: null, fixed: 5.0, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'business', desc: 'Χωρίς προϋπόθεση συνέπειας.' },
      { id: 'prot_sure_biz1', priceStatus: 'verified', name: 'Επαγγελματικό 1 Value Sure 12Μ 3.0', badge: 'ΜΠΛΕ', type: 'fixed', kwh_day: 0.1699, kwh_night: null, flat_monthly: null, fixed: 13.9, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'business', desc: 'Χαμηλότερη τιμή εισαγωγής τους τρεις πρώτους μήνες, μετά η τιμή του καταλόγου. Η κατάταξη τρέχει με την τιμή που ισχύει τους εννέα από τους δώδεκα μήνες. Η έκπτωση αποδίδεται στους εκκαθαριστικούς λογαριασμούς.' },
      { id: 'prot_sure_biz2', priceStatus: 'verified', name: 'Επαγγελματικό 2 και 3 Value Sure 12Μ 2.0', badge: 'ΜΠΛΕ', type: 'fixed', kwh_day: 0.1999, kwh_night: null, flat_monthly: null, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: true, vat: 6, segment: 'business', desc: 'Χωρίς πάγιο. Η τιμή ισχύει με εμπρόθεσμη πληρωμή.' },
    ],
  },
  {
    value: 'nrg', label: 'NRG', url: 'https://www.nrg.gr',
    tariffs: [
      { id: 'nrg_now',          name: 'NRG Now Οικιακό',        badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1595, kwh_night: null, fixed: 6.90, contract_months: 0,  vat: 6, segment: 'residential', desc: 'Κυμαινόμενο. Χωρίς δέσμευση.' },
      { id: 'nrg_adjust',       name: 'NRG adjust 1.0',         badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1580, kwh_night: null, fixed: 9.90, contract_months: 12, vat: 6, segment: 'residential', desc: 'Σταθερό 12 μήνες. Τελευταία γνωστή τιμή, η NRG έχει ανανεώσει τη γκάμα προγραμμάτων, χρειάζεται νέα επιβεβαίωση.' },
      // ── Επαγγελματικά ──────────────────────────────────────────────────
      { id: 'nrg_adjust_biz', priceStatus: 'verified', name: 'nrg adjust 1.0 BUSINESS promo', badge: 'ΜΠΛΕ', type: 'fixed', kwh_day: 0.149, kwh_night: null, flat_monthly: null, fixed: 7.95, fixed_ebill: null, fixed_tier2: 15.9, fixed_tier2_threshold: 150, contract_months: 12, no_fixed: false, vat: 6, segment: 'business', desc: 'Πάγιο 7,95 € έως τις 150 kWh τον μήνα, 15,90 € πάνω από αυτές. Η τιμή ισχύει με εμπρόθεσμη πληρωμή.' },
      { id: 'nrg_simple_biz', priceStatus: 'verified', name: 'nrg simple 1.0 BUSINESS1', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.199, kwh_night: null, flat_monthly: null, fixed: 9.9, fixed_ebill: null, contract_months: 0, no_fixed: false, vat: 6, segment: 'business', desc: 'Χωρίς δέσμευση.' },
    ],
  },
  {
    value: 'zenith', label: 'Zenith', url: 'https://www.zenith.gr',
    tariffs: [
      // ── Οικιακά ────────────────────────────────────────────────────────
      { id: 'zen_fixed_1y',  name: 'Power Home Fixed 1Y',     badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1290, kwh_night: null, flat_monthly: null, fixed: 11.90, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'residential', desc: 'Σταθερό 12 μηνών. Έκπτωση Συνέπειας από τον 1ο λογαριασμό. Δώρο κάρτα υγείας Ευ Ζην 150 €.' },
      { id: 'zen_fixed_24',  name: 'Power Home Fixed 24',     badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1350, kwh_night: null, flat_monthly: null, fixed: 11.90, fixed_ebill: null, contract_months: 24, no_fixed: false, vat: 6, segment: 'residential', desc: 'Σταθερό 24 μηνών, κλειδωμένη τιμή 2 χρόνια. Δώρο κάρτα υγείας Ευ Ζην 150 €.' },
      { id: 'zen_pair',      name: 'Power Home Pair',         badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1380, kwh_night: null, flat_monthly: null, fixed: 11.90, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'residential', desc: 'Dual fuel, ρεύμα και φυσικό αέριο μαζί. Έκπτωση παγίου.' },
      { id: 'zen_sure_plus', name: 'Power Home Sure Plus',    badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1450, kwh_night: null, flat_monthly: null, fixed: 9.90,  fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'residential', desc: 'Σταθερό πρόγραμμα ασφαλείας.' },
      { id: 'zen_select',    name: 'Power Home Select',       badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.1490, kwh_night: null, flat_monthly: null, fixed: 5.00,  fixed_ebill: null, contract_months: 0,  no_fixed: false, vat: 6, segment: 'residential', desc: 'Κίτρινο κυμαινόμενο. Χωρίς δέσμευση.' },
      { id: 'zen_save30',    name: 'Power Home Save 3.0',     badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.1530, kwh_night: null, flat_monthly: null, fixed: 4.00,  fixed_ebill: null, contract_months: 0,  no_fixed: false, vat: 6, segment: 'residential', desc: 'Κίτρινο κυμαινόμενο χαμηλό πάγιο.' },
      { id: 'zen_light',     name: 'Power Home Light',        badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.1560, kwh_night: null, flat_monthly: null, fixed: 0,     fixed_ebill: null, contract_months: 0,  no_fixed: true,  vat: 6, segment: 'residential', desc: 'Χαμηλό πάγιο. Ιδανικό χαμηλή κατανάλωση.' },
      // FIX: τιμή αναπροσαρμόστηκε 0.1450 → 0.095 (επιβεβαιωμένο, Ιούνιος 2026), ισχύει για τις πρώτες 200 kWh/μήνα
      { id: 'zen_student', studentOnly: true,   name: 'Power Home Student',      badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.0950, kwh_night: null, flat_monthly: null, fixed: 0,     fixed_ebill: null, contract_months: 0,  no_fixed: true,  vat: 6, segment: 'residential', desc: 'Φοιτητικό. Τιμή 0,095 € ανά kWh για τις πρώτες 200 kWh τον μήνα, πάνω από αυτό ισχύει διαφορετική τιμή, επιβεβαίωσε στο zenith.gr πριν την ένταξη. Απαιτείται φοιτητική ταυτότητα.' },
      { id: 'zen_start',     name: 'Power Home Start (Ειδικό)', badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1988, kwh_night: null, flat_monthly: null, fixed: 6.80, fixed_ebill: null, contract_months: 0, no_fixed: false, vat: 6, segment: 'residential', desc: 'Ειδικό Γ1. Ανακοινώνεται κάθε 1η του μήνα.' },
      // ── ZeΝergy, all-in πακέτα, ΟΛΑ τα 5 μεγέθη ─────────────────────────
      // FIX: πριν υπήρχε μόνο 1 πακέτο (49 €). Επιβεβαιωμένο 5μελές σύστημα.
      // Ακριβή όρια kWh επιβεβαιωμένα μόνο για XS και XL, για S/M/L δες zenith.gr.
      { id: 'zen_zenergy_xs', name: 'ZeΝergy XS, έως 2.000 kWh/έτος', badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 49.00,  flat_annual_kwh: 2000, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'residential', desc: 'All-in σταθερό μηνιαίο. Μικρό μέγεθος κατανάλωσης.' },
      { id: 'zen_zenergy_s',  name: 'ZeΝergy S',                       badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 69.00,  fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'residential', desc: 'All-in σταθερό μηνιαίο. Ακριβές όριο κατανάλωσης: δες zenith.gr.' },
      { id: 'zen_zenergy_m',  name: 'ZeΝergy M',                       badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 90.00,  fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'residential', desc: 'All-in σταθερό μηνιαίο. Ακριβές όριο κατανάλωσης: δες zenith.gr.' },
      { id: 'zen_zenergy_l',  name: 'ZeΝergy L',                       badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 137.00, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'residential', desc: 'All-in σταθερό μηνιαίο. Ακριβές όριο κατανάλωσης: δες zenith.gr.' },
      { id: 'zen_zenergy_xl', name: 'ZeΝergy XL, έως 12.000 kWh/έτος',badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 262.00, flat_annual_kwh: 12000, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'residential', desc: 'All-in σταθερό μηνιαίο. Μεγάλο μέγεθος κατανάλωσης.' },
      // ── Επαγγελματικά ──────────────────────────────────────────────────
      { id: 'zen_biz_start', priceStatus: 'verified', name: 'Power Business Direct', badge: 'ΜΠΛΕ', type: 'fixed', kwh_day: 0.208, kwh_night: null, flat_monthly: null, fixed: 1.0, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'business', desc: 'Σταθερό δωδεκάμηνο για μη οικιακούς πελάτες έως 25 kVA.' },
    ],
  },
  {
    value: 'elin', label: 'Elin', url: 'https://energy.elin.gr',
    tariffs: [
      // ── Οικιακά ────────────────────────────────────────────────────────
      { id: 'elin_power_green', name: 'Power On! Home Green',  badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1640, kwh_night: null, flat_monthly: null, fixed: 7.10, fixed_ebill: null, contract_months: 0, no_fixed: false, vat: 6, segment: 'residential', desc: 'Ειδικό Γ1. Δημοσιεύεται την 1η κάθε μήνα.' },
      { id: 'elin_blue',        name: 'Home Blue Fixed',       badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1480, kwh_night: null, flat_monthly: null, fixed: 9.90, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'residential', desc: 'Σταθερό 12μηνο.' },
      // ── Επαγγελματικά ──────────────────────────────────────────────────
    ],
  },
  {
    value: 'volton', label: 'Volton', url: 'https://volton.gr',
    tariffs: [
      // ── Οικιακά ────────────────────────────────────────────────────────
      { id: 'volton_green',    name: 'Volton Green Ειδικό',   badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1861, kwh_night: null, flat_monthly: null, fixed: 0,    fixed_ebill: null, contract_months: 0,  no_fixed: true,  vat: 6, segment: 'residential', desc: 'Ειδικό Γ1. Μηδενική εγγύηση. Ανακοινώνεται 1η μήνα.' },
      { id: 'volton_blue',     name: 'Volton Blue Flat 18M',  badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1520, kwh_night: null, flat_monthly: null, fixed: 9.90, fixed_ebill: null, contract_months: 18, no_fixed: false, vat: 6, segment: 'residential', desc: 'Σταθερό 18 μηνών με έκπτωση συνέπειας. Καλοκαιρινή προσφορά από Ιούνιο έως Αύγουστο, με έκπτωση 15% πάνω στην τιμή. Επιβεβαίωσε την τρέχουσα εποχιακή τιμή στο volton.gr.' },
      // ── Επαγγελματικά ──────────────────────────────────────────────────
      { id: 'volton_yellow_biz', priceStatus: 'retro', name: 'Volton Yellow Simple Business 21 v3', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0, kwh_night: null, flat_monthly: null, fixed: 6.9, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'business', desc: 'Η ΡΑΑΕΥ γράφει ότι η τελική τιμή του Αυγούστου 2026 ανακοινώνεται τον Σεπτέμβριο. Γράψε τον λογαριασμό σου για να μπει στη σύγκριση.' },
      { id: 'volton_blue_biz', priceStatus: 'verified', name: 'Volton Blue Flat 18M Business 21 v2', badge: 'ΜΠΛΕ', type: 'fixed', kwh_day: 0.15902, kwh_night: null, flat_monthly: null, fixed: 9.9, fixed_ebill: null, contract_months: 18, no_fixed: false, vat: 6, segment: 'business', desc: 'Δωρεάν πάγια τους τρεις πρώτους μήνες εκπροσώπησης, για νέους πελάτες. Η τιμή ισχύει με συνέπεια.' },
      { id: 'volton_green_biz', priceStatus: 'verified', name: 'Ειδικό Business', badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.19979, kwh_night: null, flat_monthly: null, fixed: 4.9, fixed_ebill: null, contract_months: 0, no_fixed: false, vat: 6, segment: 'business', desc: 'Το ειδικό τιμολόγιο, με αρχική έκπτωση και έκπτωση συνέπειας.' },
    ],
  },
  {
    value: 'enerwave', label: 'Enerwave', url: 'https://www.enerwave.gr',
    tariffs: [
      // ── Οικιακά ────────────────────────────────────────────────────────
      { id: 'enrw_saver',       name: 'Reward Saver',           badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1290, kwh_night: null, flat_monthly: null, fixed: 0,     fixed_ebill: null, contract_months: 0,  no_fixed: true,  vat: 6, segment: 'residential', desc: 'Φθηνότερο κυμαινόμενο χωρίς πάγιο.' },
      { id: 'enrw_stable_max',  name: 'Reward Stable Max',      badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1390, kwh_night: null, flat_monthly: null, fixed: 12.90, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'residential', desc: 'Φθηνότερο σταθερό 12 μηνών.' },
      { id: 'enrw_stable',      name: 'Reward Stable',          badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1690, kwh_night: null, flat_monthly: null, fixed: 12.90, fixed_ebill: null, contract_months: 18, no_fixed: false, vat: 6, segment: 'residential', desc: 'Σταθερό 18 μηνών.' },
      { id: 'enrw_stable_zero', name: 'Reward Stable Zero 12M', badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1890, kwh_night: null, flat_monthly: null, fixed: 0,     fixed_ebill: null, contract_months: 12, no_fixed: true,  vat: 6, segment: 'residential', desc: 'Σταθερό χωρίς πάγιο, 12 μήνες.' },
      { id: 'enrw_smart',       name: 'Smart',                  badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.14504, kwh_night: null, flat_monthly: null, fixed: 5.00, fixed_ebill: null, contract_months: 0,  no_fixed: false, vat: 6, segment: 'residential', desc: 'Κυμαινόμενο smart πρόγραμμα.' },
      { id: 'enrw_smart_zero',  name: 'Smart Zero',             badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.15914, kwh_night: null, flat_monthly: null, fixed: 0,    fixed_ebill: null, contract_months: 0,  no_fixed: true,  vat: 6, segment: 'residential', desc: 'Κυμαινόμενο χωρίς πάγιο.' },
      { id: 'enrw_night',       name: 'Reward Night Saver',     badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.1400, kwh_night: 0.0650, flat_monthly: null, fixed: 5.00, fixed_ebill: null, contract_months: 0, no_fixed: false, vat: 6, segment: 'residential', desc: 'Νέο διζωνικό κυμαινόμενο. Ιδανικό θερμοσίφωνα/πλυντήρια το βράδυ.' },
      { id: 'enrw_special',     name: 'Ειδικό Οικιακό',         badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1590, kwh_night: null, flat_monthly: null, fixed: 5.00, fixed_ebill: null, contract_months: 0,  no_fixed: false, vat: 6, segment: 'residential', kwh_tier2: 0.21550, tier2_threshold: 100, desc: 'Ειδικό Γ1. 0,159 € πρώτες 100 kWh, 0,2155 € άνω.' },
      // ── Επαγγελματικά ──────────────────────────────────────────────────
      { id: 'enrw_saver_biz', priceStatus: 'verified', name: 'Reward Saver for Business', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.179, kwh_night: null, flat_monthly: null, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: true, vat: 6, segment: 'business', desc: 'Χωρίς πάγιο. Περιλαμβάνει έκπτωση χωρίς προϋποθέσεις για τις καταναλώσεις του μήνα, καθώς και έκπτωση συνέπειας.' },
      { id: 'enrw_stable_biz', priceStatus: 'verified', name: 'Reward Stable 2.0 for Business Γ21', badge: 'ΜΠΛΕ', type: 'fixed', kwh_day: 0.149, kwh_night: null, flat_monthly: null, fixed: 14.9, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'business', desc: 'Η τιμή περιλαμβάνει έκπτωση συνέπειας, που ισχύει σε όλη τη διάρκεια της σύμβασης.' },
      { id: 'enrw_special_biz', priceStatus: 'verified', name: 'Ειδικό Γ21', badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.159, kwh_night: null, kwh_tier2: 0.27021, tier2_threshold: 100, flat_monthly: null, fixed: 5.0, fixed_ebill: null, contract_months: 0, no_fixed: false, vat: 6, segment: 'business', desc: 'Κλιμακωτό: η τιμή ανεβαίνει πάνω από τις 100 kWh τον μήνα.' },
      // ── My Wave Daily Business, ΟΛΑ τα 5 μεγέθη ─────────────────────────
      // FIX: πριν υπήρχε μόνο 1 μη-ρεαλιστικό πακέτο (65 €, καμία αντιστοιχία).
      // Επιβεβαιωμένο πλήρες σύστημα 5 μεγεθών με ημερήσια χρέωση, ετήσιο όριο kWh
      // και ακριβή τιμή υπέρβασης ανά μέγεθος. Μηνιαίο = ημερήσια τιμή × 30.
      { id: 'enrw_wave_1',   name: 'My Wave Daily 1 €/ημέρα, έως 1.920 kWh/έτος', badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 30.00, flat_annual_kwh: 1920,  flat_overage_rate: 0.239, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'business', desc: 'Συνδρομητικό 1 € την ημέρα, περίπου 30 € τον μήνα. Υπέρβαση 0,239 € ανά kWh.' },
      { id: 'enrw_wave_15',  name: 'My Wave Daily 1,5 €/ημέρα, έως 3.000 kWh/έτος', badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 45.00, flat_annual_kwh: 3000,  flat_overage_rate: 0.229, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'business', desc: 'Συνδρομητικό 1,5 € την ημέρα, περίπου 45 € τον μήνα. Υπέρβαση 0,229 € ανά kWh.' },
      { id: 'enrw_wave_2',   name: 'My Wave Daily 2 €/ημέρα, έως 4.200 kWh/έτος', badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 60.00, flat_annual_kwh: 4200,  flat_overage_rate: 0.219, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'business', desc: 'Συνδρομητικό 2 € την ημέρα, περίπου 60 € τον μήνα. Υπέρβαση 0,219 € ανά kWh.' },
      { id: 'enrw_wave_25',  name: 'My Wave Daily 2,5 €/ημέρα, έως 5.400 kWh/έτος', badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 75.00, flat_annual_kwh: 5400,  flat_overage_rate: 0.209, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'business', desc: 'Συνδρομητικό 2,5 € την ημέρα, περίπου 75 € τον μήνα. Υπέρβαση 0,209 € ανά kWh.' },
      { id: 'enrw_wave_3',   name: 'My Wave Daily 3 €/ημέρα, έως 6.600 kWh/έτος', badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 90.00, flat_annual_kwh: 6600,  flat_overage_rate: 0.199, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'business', desc: 'Συνδρομητικό 3 € την ημέρα, περίπου 90 € τον μήνα. Υπέρβαση 0,199 € ανά kWh.' },
    ],
  },
  {
    value: 'wattvolt', label: 'Watt+Volt (πλέον Protergia)', url: 'https://www.protergia.gr',
    tariffs: [
      // ── Οικιακά ────────────────────────────────────────────────────────
      { id: 'wv_home_standard', priceStatus: 'retro', name: 'Home Standard',          badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.1480, kwh_night: null, flat_monthly: null, fixed: 5.00,  fixed_ebill: null, contract_months: 0,  no_fixed: false, vat: 6, segment: 'residential', desc: 'Κυμαινόμενο βασικό, συν ΜΔΚΑ. Χωρίς δέσμευση. Επιβεβαίωσε τρέχουσα τιμή στο watt-volt.gr.' },
      { id: 'wv_home_blue',     name: 'Home Blue Σταθερό 12M',  badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1450, kwh_night: null, flat_monthly: null, fixed: 9.90,  fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'residential', desc: 'Σταθερό 12μηνο. Τελευταία γνωστή ένδειξη, επιβεβαίωσε τρέχουσα τιμή/όρους.' },
      { id: 'wv_home_special',  name: 'Home Ειδικό (Γ1)',       badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1650, kwh_night: null, flat_monthly: null, fixed: 5.00,  fixed_ebill: null, contract_months: 0,  no_fixed: false, vat: 6, segment: 'residential', desc: 'Ειδικό Γ1. Ανακοινώνεται κάθε 1η του μήνα.' },
      // ── Επαγγελματικά ──────────────────────────────────────────────────
    ],
  },
  {
    value: 'eunice', label: 'Eunice Power', url: 'https://eunice-power.gr',
    tariffs: [
      // ── Οικιακά (100% καθαρή ενέργεια από ΑΠΕ) ─────────────────────────
      { id: 'eun_home_core', priceStatus: 'retro',    name: 'Home Core',              badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.0980, kwh_night: null, flat_monthly: null, fixed: 7.00,  fixed_ebill: null, contract_months: 0,  no_fixed: false, vat: 6, segment: 'residential', desc: '100% καθαρή ενέργεια. Τιμή 0,098 € ανά kWh (+ ΜΔΚΑ) με έκπτωση συνέπειας. Πάγιο 7 €.' },
      { id: 'eun_home_special', name: 'Ειδικό Τιμολόγιο Home',  badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1600, kwh_night: null, flat_monthly: null, fixed: 5.00,  fixed_ebill: null, contract_months: 0,  no_fixed: false, vat: 6, segment: 'residential', desc: 'Ειδικό Γ1. Ανακοινώνεται κάθε 1η του μήνα.' },
      // ── Επαγγελματικά ──────────────────────────────────────────────────
      { id: 'eun_biz_secure', priceStatus: 'verified', name: 'Small Business Secure', badge: 'ΜΠΛΕ', type: 'fixed', kwh_day: 0.165, kwh_night: null, flat_monthly: null, fixed: 4.0, fixed_ebill: null, contract_months: 12, no_fixed: false, vat: 6, segment: 'business', desc: 'Η τιμή ισχύει με έκπτωση συνέπειας.' },
    ],
  },
  {
    value: 'fysiko_aerio', label: 'Φυσικό αέριο Ελλάδος', url: 'https://www.fysikoaerioellados.gr',
    tariffs: [
      { id: 'fa_oikia',         name: 'Oikia Green',            badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.14265, kwh_night: null, fixed: 5.00, contract_months: 0, vat: 6, segment: 'residential', desc: 'Κυμαινόμενο. Ανακοινώνεται κάθε 1η μήνα.' },
    ],
  },
];

