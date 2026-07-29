// ═══════════════════════════════════════════════════════════════════════════
// ΤΑΙΡΙΑΣΜΑ ΑΣΦΑΛΕΙΑΣ ΜΕ ΤΙΣ ΑΝΑΓΚΕΣ ΤΟΥ ΑΚΙΝΗΤΟΥ.
//
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΛΥΝΕΙ:
// Η παλιά «σύγκριση» πολλαπλασίαζε ΚΑΘΕ πρόγραμμα με τον ΙΔΙΟ συντελεστή, που
// προέκυπτε από τετραγωνικά, αξία, όροφο και παλαιότητα. Ένας κοινός
// πολλαπλασιαστής δεν αλλάζει ποτέ σειρά: το φθηνότερο πρόγραμμα για ένα
// διαμέρισμα 45 τ.μ. στον τέταρτο ήταν το ίδιο με το φθηνότερο για μονοκατοικία
// 200 τ.μ. με υπόγειο. Τα δεδομένα του χρήστη έμπαιναν στην οθόνη και δεν
// άλλαζαν τίποτα στην πρόταση. Ήταν σύγκριση τιμών με πρόσχημα εξατομίκευσης.
//
// Η ΑΡΧΗ: Η ΦΘΗΝΟΤΕΡΗ ΔΕΝ ΕΙΝΑΙ Η ΚΑΛΥΤΕΡΗ.
// Ένα πρόγραμμα που δεν καλύπτει σεισμό, σε ακίνητο με ενυπόθηκο δάνειο, δεν
// είναι φθηνό. Είναι άχρηστο, γιατί η τράπεζα δεν το δέχεται. Γι' αυτό η
// κατάταξη γίνεται ΠΡΩΤΑ σε επάρκεια καλύψεων και ΜΕΤΑ σε τιμή. Όποιο δεν
// καλύπτει τα απαραίτητα δεν κρύβεται: εμφανίζεται πιο κάτω, με γραμμένο το τι
// του λείπει.
//
// ΧΩΡΙΣ ΜΕΡΟΛΗΨΙΑ, ΓΡΑΜΜΕΝΟ ΣΕ ΚΩΔΙΚΑ:
// καμία αμοιβή, καμία συνεργασία και καμία εταιρεία δεν επηρεάζει τη σειρά. Οι
// μόνες είσοδοι είναι τα χαρακτηριστικά του ακινήτου και οι καλύψεις του
// προγράμματος. Κάθε θέση συνοδεύεται από τον λόγο της, ώστε ο χρήστης να
// μπορεί να διαφωνήσει τεκμηριωμένα.
//
// ΔΕΝ ΜΑΝΤΕΥΟΥΜΕ ΣΕΙΣΜΙΚΗ ΖΩΝΗ ΑΠΟ ΤΟ ΟΝΟΜΑ ΠΟΛΗΣ.
// Η παλιά έκδοση κοίταζε αν το κείμενο περιείχε «Αθήν» και έβαζε +5%. Η ζώνη
// ορίζεται από τον χάρτη του κανονισμού και όχι από αλφαριθμητικά. Ο σεισμός
// αφορά ΟΛΗ την Ελλάδα, οπότε η προτεραιότητα βγαίνει από όσα ξέρουμε με
// βεβαιότητα για το συγκεκριμένο ακίνητο: έτος κατασκευής και ύπαρξη δανείου.
// ═══════════════════════════════════════════════════════════════════════════

/** Οι ανάγκες που κρίνουν αν ένα πρόγραμμα κάνει για το ακίνητο. */
export type Need =
  | 'earthquake'   // σεισμός
  | 'flood'        // πλημμύρα και νερά
  | 'theft'        // κλοπή περιεχομένου
  | 'liability'    // αστική ευθύνη προς τρίτους
  | 'fire'         // πυρκαγιά, η βάση κάθε συμβολαίου
  | 'relocation';  // δαπάνες μεταστέγασης / απώλεια ενοικίου

export const NEED_LABEL: Record<Need, string> = {
  earthquake: 'Σεισμός',
  flood: 'Πλημμύρα',
  theft: 'Κλοπή',
  liability: 'Αστική ευθύνη',
  fire: 'Πυρκαγιά',
  relocation: 'Μεταστέγαση',
};

/** Πόσο βαραίνει μια ανάγκη για ΑΥΤΟ το ακίνητο. */
export type Weight = 'required' | 'important' | 'nice' | 'irrelevant';

export interface PropertyRisk {
  sqm?: number | null;
  /** Έτος κατασκευής. Καθορίζει αν το κτίριο έχει αντισεισμικό κανονισμό. */
  buildYear?: number | null;
  floor?: 'basement' | 'ground' | 'mid' | 'top' | '' | null;
  /** Ενεργό ενυπόθηκο δάνειο. Η τράπεζα ορίζει τις ελάχιστες καλύψεις. */
  hasLoan?: boolean;
  rentalMode?: 'long_term' | 'short_term' | '' | null;
  furnished?: boolean;
  /** Αξία περιεχομένου σε ευρώ, όπως τη δήλωσε ο χρήστης. */
  contentsValue?: number | null;
  monthlyRent?: number | null;
}

export interface NeedAssessment {
  need: Need;
  weight: Weight;
  /** Γιατί. Εμφανίζεται στον χρήστη αυτούσιο. */
  reason: string;
}

/**
 * Το έτος από το οποίο θεωρούμε ότι το κτίριο έχει σύγχρονη αντισεισμική
 * μελέτη. Ο Νέος Ελληνικός Αντισεισμικός Κανονισμός εφαρμόζεται από το 1985 και
 * ο επόμενος από το 2000. Κτίρια πριν το 1985 σχεδιάστηκαν με τον κανονισμό του
 * 1959 και έχουν ουσιωδώς διαφορετική συμπεριφορά.
 */
const MODERN_SEISMIC_CODE = 1985;

/**
 * Τι χρειάζεται ΑΥΤΟ το ακίνητο, με τον λόγο δίπλα.
 *
 * Κάθε κρίση εδώ στηρίζεται σε δεδομένο που ο χρήστης έχει ήδη καταχωρήσει.
 * Όπου το δεδομένο λείπει, η ανάγκη ΔΕΝ ανεβαίνει σε «απαραίτητη»: δεν
 * φτιάχνουμε επείγον από άγνοια.
 */
export function assessNeeds(p: PropertyRisk): NeedAssessment[] {
  const out: NeedAssessment[] = [];
  const rented = p.rentalMode === 'long_term' || p.rentalMode === 'short_term';

  // ── Πυρκαγιά: πάντα. Είναι ο πυρήνας κάθε ασφαλιστηρίου κατοικίας.
  out.push({ need: 'fire', weight: 'required', reason: 'Η βάση κάθε ασφαλιστηρίου κατοικίας.' });

  // ── Σεισμός
  if (p.hasLoan) {
    out.push({
      need: 'earthquake', weight: 'required',
      reason: 'Το ακίνητο έχει ενεργό δάνειο. Οι τράπεζες ζητούν κάλυψη πυρός και σεισμού για όσο διαρκεί η υποθήκη.',
    });
  } else if (p.buildYear && p.buildYear < MODERN_SEISMIC_CODE) {
    out.push({
      need: 'earthquake', weight: 'required',
      reason: `Κατασκευή ${p.buildYear}, πριν τον αντισεισμικό κανονισμό του ${MODERN_SEISMIC_CODE}.`,
    });
  } else {
    out.push({
      need: 'earthquake', weight: 'important',
      reason: 'Η χώρα είναι σεισμογενής στο σύνολό της. Είναι η κάλυψη με το μεγαλύτερο δυνητικό κόστος αν λείψει.',
    });
  }

  // ── Πλημμύρα: ο όροφος είναι το κρίσιμο, όχι η πόλη.
  if (p.floor === 'basement') {
    out.push({ need: 'flood', weight: 'required', reason: 'Υπόγειο. Τα νερά καταλήγουν στο χαμηλότερο σημείο του κτιρίου.' });
  } else if (p.floor === 'ground') {
    out.push({ need: 'flood', weight: 'important', reason: 'Ισόγειο. Εκτεθειμένο σε πλημμύρα δρόμου και σε διαρροές του κτιρίου.' });
  } else if (p.floor === 'top') {
    out.push({ need: 'flood', weight: 'important', reason: 'Τελευταίος όροφος. Ο κίνδυνος έρχεται από τη στέγη και το δώμα.' });
  } else {
    out.push({ need: 'flood', weight: 'nice', reason: 'Ενδιάμεσος όροφος. Ο κίνδυνος περιορίζεται σε διαρροές σωληνώσεων.' });
  }

  // ── Κλοπή: αφορά το περιεχόμενο. Χωρίς περιεχόμενο, δεν υπάρχει ανάγκη.
  const contents = p.contentsValue ?? 0;
  if (p.rentalMode === 'short_term') {
    out.push({
      need: 'theft', weight: 'required',
      reason: 'Βραχυχρόνια μίσθωση. Το σπίτι είναι επιπλωμένο και περνούν από μέσα άγνωστοι κάθε λίγες μέρες.',
    });
  } else if (contents >= 15000) {
    out.push({ need: 'theft', weight: 'required', reason: `Δηλωμένο περιεχόμενο ${contents.toLocaleString('el-GR')} ευρώ.` });
  } else if (contents > 0 || p.furnished) {
    out.push({ need: 'theft', weight: 'important', reason: 'Το ακίνητο είναι επιπλωμένο.' });
  } else {
    out.push({ need: 'theft', weight: 'irrelevant', reason: 'Χωρίς δηλωμένο περιεχόμενο, η κάλυψη κλοπής δεν έχει τι να προστατεύσει.' });
  }

  // ── Αστική ευθύνη: μόλις μπει τρίτος στο σπίτι, μπαίνει και η ευθύνη.
  if (p.rentalMode === 'short_term') {
    out.push({ need: 'liability', weight: 'required', reason: 'Βραχυχρόνια μίσθωση. Ευθύνεσαι για ζημιά σε επισκέπτες και σε γείτονες.' });
  } else if (rented) {
    out.push({ need: 'liability', weight: 'required', reason: 'Το ακίνητο εκμισθώνεται. Ζημιά σε διπλανό διαμέρισμα βαραίνει τον ιδιοκτήτη.' });
  } else {
    out.push({ need: 'liability', weight: 'important', reason: 'Καλύπτει ζημιά που θα προκαλέσεις σε τρίτους, τυπικά σε διπλανό διαμέρισμα.' });
  }

  // ── Μεταστέγαση και απώλεια ενοικίου
  if (p.rentalMode === 'long_term' && (p.monthlyRent ?? 0) > 0) {
    out.push({
      need: 'relocation', weight: 'important',
      reason: `Σε σοβαρή ζημιά χάνεις ${Math.round(p.monthlyRent ?? 0)} ευρώ ενοίκιο τον μήνα μέχρι την αποκατάσταση.`,
    });
  } else if (!rented) {
    out.push({ need: 'relocation', weight: 'important', reason: 'Καλύπτει τη στέγασή σου όσο το σπίτι είναι μη κατοικήσιμο.' });
  } else {
    out.push({ need: 'relocation', weight: 'nice', reason: 'Καλύπτει το κενό μέχρι να αποκατασταθεί η ζημιά.' });
  }

  return out;
}

/** Ένα πρόγραμμα, όπως το περιγράφει ο κατάλογος. */
export interface Plan {
  id: string;
  name: string;
  company: string;
  companyLabel: string;
  /** Ενδεικτικό μηνιαίο, ΠΟΤΕ πραγματική προσφορά. */
  monthly: number;
  annual?: number;
  earthquake?: boolean;
  flood?: boolean;
  natural?: boolean;
  covers?: string[];
  url?: string;
}

/**
 * Ποιες ανάγκες καλύπτει ένα πρόγραμμα.
 *
 * Τα δομημένα πεδία (earthquake, flood) υπερισχύουν του κειμένου: είναι ρητή
 * δήλωση, ενώ η λίστα καλύψεων είναι ελεύθερο κείμενο μάρκετινγκ. Όπου δεν
 * υπάρχει δομημένο πεδίο, ψάχνουμε λέξεις κλειδιά, και «Πλήρης Κάλυψη» ΔΕΝ
 * θεωρείται ότι περιλαμβάνει σεισμό: αν το πρόγραμμα κάλυπτε σεισμό, θα το
 * διαφήμιζε ονομαστικά. Το λάθος γέρνει προς τα κάτω επίτηδες, γιατί να πούμε
 * «καλύπτεσαι» για κάτι που δεν καλύπτεται κοστίζει στον χρήστη το σπίτι του.
 */
export function planCovers(plan: Plan, need: Need): boolean {
  const text = (plan.covers ?? []).join(' ').toLowerCase();
  const has = (...words: string[]) => words.some(w => text.includes(w));

  switch (need) {
    case 'earthquake': return plan.earthquake === true;
    case 'flood':      return plan.flood === true || has('πλημμύρα', 'πλημμυρα');
    case 'fire':       return has('πυρκαγιά', 'πυρκαγια', 'παντός κινδύνου', 'πλήρης κάλυψη');
    case 'theft':      return has('κλοπή', 'κλοπη', 'παντός κινδύνου');
    case 'liability':  return has('αστική ευθύνη', 'αστικη ευθυνη', 'νομική προστασία');
    case 'relocation': return has('μεταστέγασ', 'μεταστεγασ', 'απώλεια ενοικίου');
  }
}

export interface Match {
  plan: Plan;
  /** Απαραίτητες ανάγκες που ΔΕΝ καλύπτονται. Άδειο σημαίνει κατάλληλο. */
  missingRequired: Need[];
  /** Σημαντικές που δεν καλύπτονται. Δεν αποκλείουν, μειώνουν. */
  missingImportant: Need[];
  covered: Need[];
  /** Όσο μεγαλύτερο, τόσο καταλληλότερο. Μόνο για ταξινόμηση. */
  score: number;
  /** Κατάλληλο για το ακίνητο, δηλαδή καλύπτει όλα τα απαραίτητα. */
  suitable: boolean;
}

const WEIGHT_POINTS: Record<Weight, number> = {
  required: 100, important: 20, nice: 5, irrelevant: 0,
};

/**
 * Κατάταξη προγραμμάτων για συγκεκριμένο ακίνητο.
 *
 * ΣΕΙΡΑ: πρώτα όσα καλύπτουν ΟΛΑ τα απαραίτητα, και μέσα σε αυτά πρώτα το
 * φθηνότερο. Μετά τα υπόλοιπα, με λιγότερα κενά πρώτα. Έτσι το φθηνότερο
 * ακατάλληλο δεν εμφανίζεται ποτέ πάνω από το ακριβότερο κατάλληλο, που είναι
 * ακριβώς το λάθος που κάνουν οι συγκρίσεις τιμών.
 */
export function matchPlans(plans: Plan[], needs: NeedAssessment[]): Match[] {
  const byNeed = new Map<Need, Weight>(needs.map(n => [n.need, n.weight]));

  const matches: Match[] = plans.map(plan => {
    const covered: Need[] = [];
    const missingRequired: Need[] = [];
    const missingImportant: Need[] = [];
    let score = 0;

    for (const [need, weight] of byNeed) {
      if (weight === 'irrelevant') continue;
      if (planCovers(plan, need)) {
        covered.push(need);
        score += WEIGHT_POINTS[weight];
      } else if (weight === 'required') {
        missingRequired.push(need);
      } else if (weight === 'important') {
        missingImportant.push(need);
      }
    }

    return { plan, covered, missingRequired, missingImportant, score, suitable: missingRequired.length === 0 };
  });

  return matches.sort((a, b) => {
    if (a.suitable !== b.suitable) return a.suitable ? -1 : 1;
    if (a.missingRequired.length !== b.missingRequired.length) return a.missingRequired.length - b.missingRequired.length;
    if (a.score !== b.score) return b.score - a.score;
    return a.plan.monthly - b.plan.monthly;
  });
}

/**
 * Γιατί αυτό το πρόγραμμα βγήκε πρώτο, σε μία πρόταση.
 *
 * Χωρίς αυτό, η κατάταξη είναι μαύρο κουτί και ο χρήστης δεν έχει τρόπο να
 * διαφωνήσει. Η απόφαση παραμένει δική του και οφείλει να έχει τα στοιχεία της.
 */
export function explain(m: Match, all: Match[], needs: NeedAssessment[]): string {
  const required = needs.filter(n => n.weight === 'required').map(n => n.need);
  const cheaperUnsuitable = all.filter(x => !x.suitable && x.plan.monthly < m.plan.monthly);

  if (!m.suitable) {
    const list = m.missingRequired.map(n => NEED_LABEL[n].toLowerCase()).join(' και ');
    return `Δεν καλύπτει ${list}, που το ακίνητό σου το χρειάζεται.`;
  }

  const coveredRequired = required.filter(n => m.covered.includes(n)).map(n => NEED_LABEL[n].toLowerCase());
  const base = coveredRequired.length
    ? `Καλύπτει ${coveredRequired.join(', ')}.`
    : 'Καλύπτει όσα χρειάζεται το ακίνητό σου.';

  if (cheaperUnsuitable.length) {
    return `${base} Υπάρχουν ${cheaperUnsuitable.length} φθηνότερα προγράμματα, αλλά κανένα τους δεν τα καλύπτει όλα.`;
  }
  return `${base} Είναι και το φθηνότερο από όσα τα καλύπτουν.`;
}
