// ═══════════════════════════════════════════════════════════════════════════
// Ο ΚΑΤΑΛΟΓΟΣ ΣΥΝΔΡΟΜΩΝ, ΚΑΙ ΤΟ ΜΗΝΙΑΙΟ ΤΟΥΣ ΚΟΣΤΟΣ
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΕΦΥΓΕ ΑΠΟ ΤΗΝ ΟΘΟΝΗ. Ο κατάλογος ζούσε μέσα στο BillsInsurance.tsx, που
// είναι component με 'use client'. Δηλαδή το ΜΟΝΟ μέρος που ήξερε πόσο κοστίζουν
// οι συνδρομές ήταν η οθόνη που τις εμφανίζει — και ο Προϋπολογισμός, που ρωτά
// ακριβώς αυτό, δεν μπορούσε να τον διαβάσει.
//
// ΤΟ ΜΕΤΡΗΜΕΝΟ ΑΠΟΤΕΛΕΣΜΑ: ο χρήστης δήλωνε δώδεκα συνδρομές, η καρτέλα έγραφε
// σωστά το σύνολό τους και ο Προϋπολογισμός έδειχνε μηδέν. Η κατηγορία
// «Ασφάλεια και συνδρομές» τροφοδοτούνταν ΜΟΝΟ από το ασφάλιστρο κατοικίας
// (`insCustomPrice`): οι συνδρομές δεν μετριόνταν πουθενά, σε καμία οθόνη
// συνόλων. Ένα κόστος που καταγράφεται και δεν αθροίζεται είναι χειρότερο από
// κόστος που δεν καταγράφηκε ποτέ, γιατί ο χρήστης νομίζει ότι το παρακολουθεί.
//
// ΕΔΩ ΜΕΣΑ ΔΕΝ ΥΠΑΡΧΕΙ ΤΙΠΟΤΑ ΑΠΟ REACT. Καθαρά δεδομένα και καθαρές
// συναρτήσεις, ώστε να δοκιμάζονται χωρίς περιηγητή και να τα διαβάζει όποια
// οθόνη τα χρειάζεται.
// ═══════════════════════════════════════════════════════════════════════════

import { fe } from '../core/format';

/**
 * ΕΝΑ ΠΑΚΕΤΟ ΣΥΝΔΡΟΜΗΣ, ΚΑΙ ΤΟ ΠΟΣΟ ΤΟΥ ΜΙΑ ΦΟΡΑ.
 *
 * ΤΟ ΟΝΟΜΑ ΕΙΝΑΙ ΣΚΕΤΟ ΟΝΟΜΑ. Ήταν «Pro · από 103,00 €», δηλαδή το ποσό γραμμένο
 * μέσα στο κείμενο και ένα regex το έκοβε πριν το δείξει ο επιλογέας. Το regex
 * περίμενε την τιμή στο τέλος· με το «από» μπροστά δεν έπιανε και ο επιλογέας
 * έγραφε «Pro · από 103» — μισό ποσό, χωρίς νόμισμα. Η τιμή ζει σε δικό της
 * πεδίο και τη μορφοποιεί η οθόνη, μία φορά, όπως κάθε άλλο ποσό.
 *
 * ΤΟ ΕΤΗΣΙΟ ΤΟ ΔΙΑΙΡΟΥΜΕ ΕΜΕΙΣ. Το `upfront` είναι το ποσό που χρεώνεται εφάπαξ
 * και το `months` οι μήνες που καλύπτει: 99,99 € για δώδεκα μήνες κάνουν 8,33 €
 * τον μήνα και η στήλη αθροίζει μηνιαία έξοδα. Ο χρήστης δηλώνει αυτό που
 * πλήρωσε· τη διαίρεση δεν τη χρωστά σε κανέναν.
 *
 * ΤΟ `note` ΓΡΑΦΕΤΑΙ ΚΑΤΩ ΑΠΟ ΤΗ ΓΡΑΜΜΗ, όταν το ποσό χρειάζεται μια πρόταση για
 * να μην παραπλανά — «ξεκινά από» ή «ανεβαίνει με τη χρήση».
 *
 * ΤΟ `tier` ΔΕΝΕΙ ΤΗΝ ΠΡΟΠΛΗΡΩΜΗ ΜΕ ΤΗ ΒΑΘΜΙΔΑ ΤΗΣ. Το «Access Ετήσια» δεν είναι
 * άλλο πακέτο από το «Access», είναι ο ίδιος λογαριασμός πληρωμένος μπροστά —
 * και δείχνει προς αυτό.
 */
export interface SubPlan { id: string; name: string; price?: number; upfront?: number; months?: number; note?: string; tier?: string }
export interface SubService { value: string; label: string; url: string; plans: SubPlan[] }

/** Το μηνιαίο κόστος ενός πακέτου, όποια κι αν είναι η περίοδος χρέωσης. */
export function planMonthly(p: SubPlan): number {
  if (p.price !== undefined) return p.price;
  return p.upfront && p.months ? p.upfront / p.months : 0;
}

/**
 * Η ΤΙΜΗ ΕΙΣΟΔΟΥ ΕΙΝΑΙ ΜΗΝΙΑΙΑ ΧΡΕΩΣΗ, ΟΧΙ ΠΡΟΠΛΗΡΩΜΗ ΕΤΟΥΣ.
 *
 * Με τα πακέτα ταξινομημένα από το φθηνότερο, το πρώτο του F1 TV ήταν το ετήσιο
 * και το πλακίδιο έγραφε «F1 TV, 2,50 €». Ισχύει μόνο αν δώσεις 29,99 € μπροστά·
 * όποιος πληρώνει κάθε μήνα δίνει 3,49 €. Το ίδιο έκανε το Disney+ (9,16 αντί
 * για 10,99) και το Skroutz Plus (2,08 αντί για 4,00): ο κατάλογος έδειχνε την
 * προπληρωμή ως τιμή της υπηρεσίας.
 *
 * Το πλακίδιο και η προεπιλογή δείχνουν πλέον το φθηνότερο πακέτο με ΜΗΝΙΑΙΑ
 * χρέωση. Οι προπληρωμές μένουν στον επιλογέα, με την πράξη τους γραμμένη.
 */
export function entryPlan(svc: SubService): SubPlan {
  return svc.plans.find(p => p.price !== undefined) ?? svc.plans[0];
}

/** Το ίδιο πακέτο, όταν ξέρουμε μόνο το αναγνωριστικό της υπηρεσίας. */
export function entryPlanId(catalog: SubService[], value: string): string {
  const svc = catalog.find(x => x.value === value);
  return svc ? entryPlan(svc).id : '';
}

/**
 * ΤΑΞΗ ΣΤΟΝ ΚΑΤΑΛΟΓΟ, ΧΩΡΙΣ ΝΑ ΤΗ ΘΥΜΑΤΑΙ ΚΑΝΕΙΣ.
 *
 * Οι υπηρεσίες μπήκαν με τη σειρά που τις βρήκαμε και φαινόταν: το Netflix
 * δίπλα στο Disney+, το ANT1+ στο τέλος επειδή προστέθηκε τελευταίο. Τα πακέτα
 * το ίδιο — το φοιτητικό του YouTube ήταν κάτω από το οικογενειακό.
 *
 * Οι υπηρεσίες αλφαβητικά, γιατί ο χρήστης ΨΑΧΝΕΙ μια συγκεκριμένη. Τα πακέτα
 * από το φθηνότερο στο ακριβότερο, γιατί εκεί ΔΙΑΛΕΓΕΙ — και έτσι το πρώτο
 * πακέτο είναι η τιμή εισόδου που δείχνει το πλακίδιο.
 *
 * ΤΟ ΣΚΕΤΟ «ΦΘΗΝΟΤΕΡΟ ΠΡΩΤΑ» ΟΜΩΣ ΔΙΕΛΥΕ ΤΙΣ ΒΑΘΜΙΔΕΣ. Το F1 TV έβγαινε «Access
 * ετήσια, Access, Pro ετήσια, Pro, Premium ετήσια, Premium»: σωστό ως αριθμοί,
 * ακατανόητο ως επιλογή, γιατί το πρώτο πράγμα που διαλέγει κανείς είναι ΒΑΘΜΙΔΑ
 * και μετά τρόπο πληρωμής. Οι βαθμίδες μπαίνουν στη σειρά με τη μηνιαία τους
 * τιμή και κάθε προπληρωμή κάθεται ΑΜΕΣΩΣ κάτω από τη δική της.
 */
function tidy(list: SubService[]): SubService[] {
  return [...list]
    .map(s => {
      /** Η τιμή που τοποθετεί το πακέτο: η δική του, ή της βαθμίδας που ανήκει. */
      const anchor = (p: SubPlan) => planMonthly(s.plans.find(x => x.id === p.tier) ?? p);
      return { ...s, plans: [...s.plans].sort((a, b) =>
        anchor(a) - anchor(b)                        // πρώτα η βαθμίδα, με τη μηνιαία της τιμή
        || (a.months ?? 1) - (b.months ?? 1)) };     // μέσα της, κατά διάρκεια: 1, 3, 12
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'el'));
}

export const STREAMING = tidy([
  { value: 'netflix',   label: 'Netflix',            url: 'https://www.netflix.com/gr', plans: [
    { id: 'n_basic',    name: 'Βασικό',      price: 8.99 },
    { id: 'n_standard', name: 'Standard',    price: 12.49 },
    { id: 'n_premium',  name: 'Premium 4K',  price: 15.99 },
  ] },
  { value: 'disney',    label: 'Disney+',            url: 'https://www.disneyplus.com/el-gr', plans: [
    { id: 'd_standard',      name: 'Standard',           price: 10.99 },
    { id: 'd_standard_year', name: 'Standard Ετήσια',    upfront: 109.90, months: 12, tier: 'd_standard' },
    { id: 'd_premium',       name: 'Premium',            price: 15.99 },
    { id: 'd_premium_year',  name: 'Premium Ετήσια',     upfront: 159.90, months: 12, tier: 'd_premium' },
  ] },
  { value: 'apple_tv',  label: 'Apple TV+',          url: 'https://www.apple.com/gr/apple-tv-plus', plans: [
    { id: 'a_std', name: 'Apple TV+', price: 9.99 },
  ] },
  { value: 'amazon',    label: 'Prime Video',        url: 'https://www.primevideo.com', plans: [
    { id: 'am_std', name: 'Prime Video', price: 5.99 },
  ] },
  { value: 'max',       label: 'Max (HBO)',          url: 'https://www.max.com/gr/el', plans: [
    { id: 'max_std',        name: 'Standard',            price: 10.99 },
    { id: 'max_std_sport',  name: 'Standard και Sports', price: 13.99 },
    { id: 'max_prem',       name: 'Premium 4K',          price: 15.99 },
    { id: 'max_prem_sport', name: 'Premium και Sports',  price: 18.99 },
  ] },
  { value: 'spotify',   label: 'Spotify',            url: 'https://www.spotify.com/gr', plans: [
    { id: 's_student',    name: 'Φοιτητικό',    price: 4.99 },
    { id: 's_individual', name: 'Ατομικό',      price: 8.99 },
    { id: 's_duo',        name: 'Duo',          price: 11.99 },
    { id: 's_family',     name: 'Οικογενειακό', price: 14.99 },
  ] },
  { value: 'youtube',   label: 'YouTube Premium',    url: 'https://www.youtube.com/premium', plans: [
    { id: 'y_student',    name: 'Φοιτητικό',    price: 6.49 },
    { id: 'y_individual', name: 'Ατομικό',      price: 9.99 },
    { id: 'y_family',     name: 'Οικογενειακό', price: 17.99 },
  ] },
  // ΟΙ ΤΡΕΙΣ ΣΥΝΔΡΟΜΕΣ ΠΑΡΑΔΟΣΗΣ, ΜΕ ΤΙΜΕΣ ΑΠΟ ΤΙΣ ΕΠΙΣΗΜΕΣ ΣΕΛΙΔΕΣ. Ήταν
  // «Εκκρεμεί», επειδή ένα επινοημένο νούμερο σε πλακίδιο που ο ιδιοκτήτης θα
  // συγκρίνει με την κάρτα του δεν είναι προσέγγιση, είναι λάθος.
  { value: 'skroutz_plus', label: 'Skroutz Plus', url: 'https://www.skroutz.gr/plus', plans: [
    { id: 'sk_month', name: 'Μηνιαία', price: 4 },
    { id: 'sk_year',  name: 'Ετήσια',  upfront: 25, months: 12, tier: 'sk_month' },
  ] },
  { value: 'wolt_plus',    label: 'Wolt+',        url: 'https://wolt.com/el', plans: [
    { id: 'wp_std', name: 'Wolt+', price: 3.99 },
  ] },
  { value: 'efood_pro',    label: 'Efood Pro',    url: 'https://www.e-food.gr', plans: [
    { id: 'ef_month', name: 'Μηνιαία', price: 3.99 },
    { id: 'ef_year',  name: 'Ετήσια',  upfront: 34.90, months: 12, tier: 'ef_month' },
  ] },
  // ΤΟ PLAYSTATION PLUS: ΤΡΕΙΣ ΒΑΘΜΙΔΕΣ ΕΠΙ ΤΡΕΙΣ ΔΙΑΡΚΕΙΕΣ, ΕΝΝΕΑ ΠΑΚΕΤΑ.
  //
  // Η δομή του είναι ακριβώς αυτή που περιγράφει το `tier`: το «Essential 12
  // μήνες» δεν είναι τέταρτη βαθμίδα, είναι το Essential πληρωμένο μπροστά. Έτσι
  // ο επιλογέας βγαίνει Essential, Essential 3 μήνες, Essential 12 μήνες, μετά
  // Extra, μετά Premium — βαθμίδα πρώτα, διάρκεια μέσα της.
  //
  // ΑΠΟ ΤΟ ΦΘΗΝΟΤΕΡΟ, ΟΠΩΣ ΚΑΙ ΟΙ ΥΠΟΛΟΙΠΕΣ ΕΝΝΕΑ ΥΠΗΡΕΣΙΕΣ ΤΟΥ ΚΑΤΑΛΟΓΟΥ. Μία
  // λίστα που τρέχει ανάποδα από τις άλλες δεν είναι ιεραρχία, είναι εξαίρεση
  // που ο χρήστης θα πρέπει να προσέξει.
  { value: 'psplus',       label: 'PlayStation Plus', url: 'https://www.playstation.com/el-gr/ps-plus', plans: [
    { id: 'ps_ess',       name: 'Essential',          price: 9.99 },
    { id: 'ps_ess_3',     name: 'Essential 3 μήνες',  upfront: 27.99,  months: 3,  tier: 'ps_ess' },
    { id: 'ps_ess_12',    name: 'Essential 12 μήνες', upfront: 71.99,  months: 12, tier: 'ps_ess' },
    { id: 'ps_extra',     name: 'Extra',              price: 15.99 },
    { id: 'ps_extra_3',   name: 'Extra 3 μήνες',      upfront: 43.99,  months: 3,  tier: 'ps_extra' },
    { id: 'ps_extra_12',  name: 'Extra 12 μήνες',     upfront: 125.99, months: 12, tier: 'ps_extra' },
    { id: 'ps_prem',      name: 'Premium',            price: 18.99 },
    { id: 'ps_prem_3',    name: 'Premium 3 μήνες',    upfront: 54.99,  months: 3,  tier: 'ps_prem' },
    { id: 'ps_prem_12',   name: 'Premium 12 μήνες',   upfront: 151.99, months: 12, tier: 'ps_prem' },
  ] },
  // ΤΟ ANT1+ ΗΤΑΝ ΓΡΑΜΜΕΝΟ 2,99 €, ΤΕΣΣΕΡΙΣ ΦΟΡΕΣ ΚΑΤΩ ΑΠΟ ΤΗΝ ΠΡΑΓΜΑΤΙΚΗ ΤΙΜΗ.
  // Η εννεάμηνη προπληρωμή δεν είναι ούτε μηνιαία ούτε ετήσια: 67,99 € για εννέα
  // μήνες και το μηνιαίο βγαίνει από τη διαίρεση όπως παντού αλλού.
  { value: 'ant1plus',     label: 'ANT1+',        url: 'https://www.antennaplus.gr', plans: [
    { id: 'ant_family',        name: 'Family',                    price: 10.99 },
    { id: 'ant_family_sports', name: 'Family και Sports',         price: 13.49 },
    { id: 'ant_family_9m',     name: 'Family 9 μήνες',            upfront: 67.99, months: 9, tier: 'ant_family' },
    { id: 'ant_sports_9m',     name: 'Family και Sports 9 μήνες', upfront: 79.99, months: 9, tier: 'ant_family_sports' },
  ] },
]);

// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΑΘΛΗΤΙΚΕΣ ΣΥΝΔΡΟΜΕΣ, ΧΩΡΙΣΤΑ ΑΠΟ ΤΗΝ ΨΥΧΑΓΩΓΙΑ
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΔΙΚΗ ΤΟΥΣ ΕΝΟΤΗΤΑ. Τα αθλητικά ήταν ένας διακόπτης ναι/όχι δίπλα στο
// πακέτο συνδρομητικής τηλεόρασης — δηλαδή η οθόνη υπέθετε ότι ο αθλητικός
// αγώνας έρχεται πάντα από τον πάροχο. Δεν έρχεται: το NBA, η EuroLeague και η
// Formula 1 πουλάνε απευθείας, με χρέωση που δεν περνά από κανέναν πάροχο και
// δεν φαινόταν πουθενά στην καρτέλα.
//
//
// ΤΟ ΗΜΕΡΗΣΙΟ ΕΙΣΙΤΗΡΙΟ ΤΗΣ EUROLEAGUE (8,99 € για είκοσι τέσσερις ώρες) ΔΕΝ
// ΜΠΑΙΝΕΙ. Δεν είναι πάγιο: μια αγορά μιας ημέρας γραμμένη σε στήλη μηνιαίων
// εξόδων θα χρεωνόταν δώδεκα φορές τον χρόνο για έναν αγώνα που είδε μία.
// ═══════════════════════════════════════════════════════════════════════════
export const SPORTS = tidy([
  { value: 'nba',        label: 'NBA',           url: 'https://www.nba.com/watch/league-pass-purchase', plans: [
    { id: 'nba_lp',   name: 'League Pass',         price: 12.99 },
    { id: 'nba_prem', name: 'League Pass Premium', price: 16.99 },
  ] },
  { value: 'euroleague', label: 'EuroLeague TV',  url: 'https://www.euroleague.tv', plans: [
    { id: 'el_month', name: 'Monthly Pass', price: 15.99 },
    { id: 'el_year',  name: 'Annual Pass',  upfront: 99.99, months: 12, tier: 'el_month' },
  ] },
  { value: 'f1tv',       label: 'F1 TV',          url: 'https://f1tv.formula1.com', plans: [
    { id: 'f1_access',      name: 'Access',           price: 3.49 },
    { id: 'f1_pro',         name: 'Pro',              price: 7.49 },
    { id: 'f1_premium',     name: 'Premium',          price: 11.99 },
    { id: 'f1_access_year', name: 'Access Ετήσια',    upfront: 29.99, months: 12, tier: 'f1_access' },
    { id: 'f1_pro_year',    name: 'Pro Ετήσια',       upfront: 59.99, months: 12, tier: 'f1_pro' },
    { id: 'f1_prem_year',   name: 'Premium Ετήσια',   upfront: 89.99, months: 12, tier: 'f1_premium' },
  ] },
]);

/**
 * ΥΠΗΡΕΣΙΕΣ ΠΟΥ ΠΕΡΙΕΧΟΥΝ ΑΛΛΕΣ.
 *
 * ΓΙΑΤΙ ΥΠΑΡΧΕΙ: το Skroutz Plus δίνει το Wolt+ δώρο όσο διαρκεί η συνδρομή. Ο
 * ιδιοκτήτης που έχει και τα δύο πληρώνει δύο φορές το ίδιο πράγμα και δεν το
 * ξέρει, γιατί οι δύο χρεώσεις έρχονται από διαφορετικές εταιρείες σε
 * διαφορετικές ημερομηνίες. Ακριβώς αυτό υπόσχεται η καρτέλα: να δει ο χρήστης
 * τι πληρώνει, όχι απλώς να το καταγράψει.
 *
 * Ο πίνακας είναι δηλωτικός. Όποιος βρει άλλο τέτοιο ζευγάρι, προσθέτει γραμμή.
 */
export const SUB_INCLUDES: { holder: string; included: string; note: string }[] = [
  { holder: 'skroutz_plus', included: 'wolt_plus',
    note: 'Το Skroutz Plus περιλαμβάνει το Wolt+ όσο διαρκεί η συνδρομή. Πληρώνεις δύο φορές το ίδιο.' },
];

export const CLOUD = tidy([
  { value: 'icloud',       label: 'iCloud+',       url: 'https://www.icloud.com', plans: [
    { id: 'ic_50',  name: '50 GB',  price: 0.99 },
    { id: 'ic_200', name: '200 GB', price: 2.99 },
    { id: 'ic_2t',  name: '2 TB',   price: 9.99 },
  ] },
  { value: 'google_one',   label: 'Google One',    url: 'https://one.google.com', plans: [
    { id: 'g_100', name: '100 GB', price: 1.99 },
    { id: 'g_200', name: '200 GB', price: 2.99 },
    { id: 'g_2t',  name: '2 TB',   price: 9.99 },
  ] },
  { value: 'microsoft365', label: 'Microsoft 365', url: 'https://www.microsoft.com/el-gr', plans: [
    { id: 'ms_pers', name: 'Personal', price: 6.99 },
    { id: 'ms_fam',  name: 'Family',   price: 9.99 },
  ] },
  { value: 'dropbox',      label: 'Dropbox',       url: 'https://www.dropbox.com', plans: [
    { id: 'db_plus', name: 'Plus 2 TB', price: 9.99 },
  ] },
  { value: 'adobe',        label: 'Adobe CC',      url: 'https://www.adobe.com/gr', plans: [
    { id: 'ad_photo', name: 'Photography', price: 12.29 },
  ] },
  // ═══════════════════════════════════════════════════════════════════════
  // ΟΙ ΣΥΝΔΡΟΜΕΣ ΤΕΧΝΗΤΗΣ ΝΟΗΜΟΣΥΝΗΣ, ΚΑΙ ΤΟ ΖΗΤΗΜΑ ΤΟΥ ΦΠΑ
  // ─────────────────────────────────────────────────────────────────────
  // Το Claude τιμολογείται «+ VAT»: η σελίδα γράφει 18 € και η κάρτα χρεώνεται
  // 18 × 1,24 = 22,32 €, με τον ελληνικό συντελεστή 24%. Κάθε άλλη γραμμή αυτής
  // της λίστας είναι τιμή λιανικής με τον φόρο μέσα, οπότε αν γράφαμε 18 θα
  // ήταν η ΜΟΝΗ γραμμή που δεν ταιριάζει με το εκκαθαριστικό της κάρτας — και ο
  // ιδιοκτήτης θα έψαχνε πού πήγαν τα 4,32 €. Γράφουμε το ποσό που χρεώνεται.
  //
  // ΤΟ ΕΤΗΣΙΟ ΤΟΥ CLAUDE: 180 € τον χρόνο προ φόρου, δηλαδή 223,20 € με τον φόρο.
  // ═══════════════════════════════════════════════════════════════════════
  { value: 'claude',  label: 'Claude',  url: 'https://claude.ai/upgrade', plans: [
    { id: 'cl_pro',      name: 'Pro',           price: 22.32 },
    { id: 'cl_pro_year', name: 'Pro Ετήσια',    upfront: 223.20, months: 12, tier: 'cl_pro' },
    { id: 'cl_max',      name: 'Max',           price: 111.60,
      note: 'Το Max ξεκινά από αυτό το ποσό και ανεβαίνει με τη χρήση.' },
  ] },
  { value: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com/pricing', plans: [
    { id: 'gpt_go',   name: 'Go',   price: 8 },
    { id: 'gpt_plus', name: 'Plus', price: 23 },
    { id: 'gpt_pro',  name: 'Pro',  price: 103,
      note: 'Το Pro ξεκινά από αυτό το ποσό και ανεβαίνει με τη χρήση.' },
  ] },
  // ΤΟ GEMINI ΓΡΑΦΕΤΑΙ ΟΠΩΣ ΤΟ ΔΕΙΧΝΕΙ Η ΣΕΛΙΔΑ ΤΟΥ, ΧΩΡΙΣ ΝΑ ΠΡΟΣΘΕΣΟΥΜΕ ΦΠΑ.
  // Το Claude δηλώνει ρητά «+ VAT» και «θα χρεωθείς 24%», οπότε εκεί γράφουμε το
  // ποσό που χρεώνεται. Εδώ η πηγή λέει μόνο «χωρίς τυχόν φόρους», που δεν είναι
  // βεβαιότητα: μια προσαύξηση 24% πάνω σε επιφύλαξη θα ήταν επινόηση. Αν η
  // κάρτα δείξει άλλο ποσό, ο χρήστης γράφει το δικό του — το πεδίο υπάρχει.
  { value: 'gemini',  label: 'Gemini',  url: 'https://gemini.google.com/subscriptions', plans: [
    { id: 'gem_plus', name: 'AI Plus', price: 4.99 },
    { id: 'gem_pro',  name: 'AI Pro',  price: 22.99 },
  ] },
]);


// Οι δύο εγγραφές συνδρομής ήταν λέξη προς λέξη ίδιες. Η μία περιγραφή αρκεί:
// αν αύριο προστεθεί πεδίο στη μία, δεν υπάρχει δεύτερη να ξεχαστεί.
export interface SubscriptionEntry { service: string; planId: string; customPrice: string; splitPeople: number; splitActive: boolean; renewalDate: string; }
interface OtherSub       { name: string; price: string; renewalDate: string; }

/**
 * Η ΠΡΟΤΑΣΗ ΠΟΥ ΧΡΩΣΤΑΕΙ Η ΟΘΟΝΗ ΟΤΑΝ ΤΟ ΠΟΣΟ ΔΕΝ ΕΙΝΑΙ ΑΥΤΟ ΠΟΥ ΠΛΗΡΩΣΕ.
 *
 * Ο επιλογέας δείχνει σκέτο όνομα πακέτου και η γραμμή δείχνει ΜΗΝΙΑΙΟ ποσό.
 * Όποιος διάλεξε «Ετήσια» πλήρωσε 99,99 € μία φορά και βλέπει 8,33 €: χωρίς
 * αυτή τη γραμμή θα νόμιζε ότι κάτι μετρήθηκε λάθος. Η διαίρεση γράφεται, ώστε
 * να συμφωνεί η οθόνη με την κάρτα του.
 */
export function planNote(p: SubPlan | undefined): string {
  if (!p) return '';
  if (p.note) return p.note;
  if (!p.upfront || !p.months) return '';
  const period = p.months === 12 ? 'Ετήσια χρέωση' : `Χρέωση ${p.months} μηνών`;
  return `${period} ${fe(p.upfront)}, δηλαδή ${fe(p.upfront / p.months)} τον μήνα.`;
}

/** Το ποσό που βαρύνει τον χρήστη: πακέτο ή δική του τιμή, διά τα άτομα. */
export function subShare(svc: SubService | undefined, a: SubscriptionEntry): number {
  const plan = svc?.plans.find(p => p.id === a.planId);
  const base = parseFloat(a.customPrice) || (plan ? planMonthly(plan) : 0);
  const n = a.splitActive && a.splitPeople > 1 ? a.splitPeople : 1;
  return base / n;
}

/**
 * ΟΙ ΤΡΕΙΣ ΟΜΑΔΕΣ ΣΥΝΔΡΟΜΩΝ, ΔΗΛΩΜΕΝΕΣ ΜΙΑ ΦΟΡΑ.
 *
 * Κάθε ομάδα είχε δικό της αντίγραφο από τα ίδια τέσσερα πράγματα: κλειδί στην
 * κατάσταση, άθροισμα, εναλλαγή, ενημέρωση πεδίου. Δύο ομάδες σήμαινε δύο
 * αντίγραφα — και οι ειδοποιήσεις ανανέωσης έτρεχαν μόνο στο ένα, οπότε το
 * πεδίο «ημερομηνία ανανέωσης» των υπηρεσιών cloud δεν ειδοποιούσε ποτέ.
 *
 * Με τον πίνακα, μια τρίτη ομάδα είναι μια γραμμή εδώ και τίποτα άλλο.
 *
 * Το `short` είναι το όνομα μέσα στη γραμμή του συνόλου, όπου χωρούν τρεις
 * λέξεις συνολικά.
 */
export type SubKey = 'activeStreaming' | 'activeSports' | 'activeCloud';
export const SUB_GROUPS: { key: SubKey; label: string; short: string; catalog: SubService[] }[] = [
  { key: 'activeStreaming', label: 'Συνδρομές ψυχαγωγίας και υπηρεσιών', short: 'Ψυχαγωγία', catalog: STREAMING },
  { key: 'activeSports',    label: 'Αθλητικές συνδρομές',                short: 'Αθλητικά',   catalog: SPORTS    },
  { key: 'activeCloud',     label: 'Cloud και λογισμικό',                short: 'Cloud',      catalog: CLOUD     },
];

/**
 * ΤΟ ΜΗΝΙΑΙΟ ΚΟΣΤΟΣ ΟΛΩΝ ΤΩΝ ΣΥΝΔΡΟΜΩΝ ΕΝΟΣ ΑΚΙΝΗΤΟΥ.
 *
 * Διαβάζει ό,τι ακριβώς γράφει η καρτέλα Συνδρομές στις ρυθμίσεις: τις τρεις
 * ομάδες του `SUB_GROUPS` και τις ελεύθερες «άλλες πάγιες». Άγνωστο σχήμα
 * επιστρέφει μηδέν αντί να σκάσει — οι ρυθμίσεις είναι JSON από τη βάση και
 * μια παλιά εγγραφή δεν επιτρέπεται να ρίξει τον Προϋπολογισμό.
 */
export function subscriptionsMonthly(section: unknown): number {
  if (!section || typeof section !== 'object') return 0;
  const s = section as Record<string, unknown>;

  const groups = SUB_GROUPS.reduce((sum, g) => {
    const list = Array.isArray(s[g.key]) ? (s[g.key] as SubscriptionEntry[]) : [];
    return sum + list.reduce((t, a) => t + subShare(g.catalog.find(x => x.value === a.service), a), 0);
  }, 0);

  const others = Array.isArray(s.otherSubs) ? (s.otherSubs as { price?: unknown }[]) : [];
  return groups + others.reduce((t, o) => t + (parseFloat(String(o.price ?? '')) || 0), 0);
}

