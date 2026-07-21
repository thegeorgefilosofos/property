// ─────────────────────────────────────────────────────────────────────────────
// gender — infer the likely gender of a first name so email copy can address the
// reader correctly: to a woman if she is Ελένη, to a man if he is Γιάννης, and
// neutrally (σε φίλο/φίλη) when we are not sure. Never guess wrong on purpose —
// an unknown name gets the neutral form, which is always safe.
//
// Strategy: a curated database of Greek names (female + male) and common English
// names, matched accent-insensitively, with light morphology for the vocative and
// genitive (Γιάννη → Γιάννης, Μαρίας → Μαρία), then a suffix heuristic for the long
// tail. Pure and unit-tested (verify-gender.ts).
// ─────────────────────────────────────────────────────────────────────────────

export type Gender = 'male' | 'female' | 'unknown';

// Accent/diacritic-insensitive, lowercase, final-sigma-normalized key.
export const nameKey = (s: string): string =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ς/g, 'σ').trim();

const FEMALE_EL = [
  'Μαρία', 'Ελένη', 'Κατερίνα', 'Αικατερίνη', 'Σοφία', 'Δήμητρα', 'Βασιλική', 'Γεωργία', 'Αναστασία',
  'Ιωάννα', 'Παναγιώτα', 'Χριστίνα', 'Ευαγγελία', 'Αγγελική', 'Δέσποινα', 'Ειρήνη', 'Στυλιανή', 'Θεοδώρα',
  'Παρασκευή', 'Φωτεινή', 'Ζωή', 'Άννα', 'Χρυσούλα', 'Αντωνία', 'Ασπασία', 'Ολυμπία', 'Πηνελόπη', 'Καλλιόπη',
  'Ουρανία', 'Αργυρώ', 'Μαγδαληνή', 'Πελαγία', 'Χαρίκλεια', 'Κυριακή', 'Μαρίνα', 'Νικολέτα', 'Ελευθερία',
  'Ευθυμία', 'Σταυρούλα', 'Βαρβάρα', 'Ελισάβετ', 'Ισμήνη', 'Ιφιγένεια', 'Λαμπρινή', 'Μελπομένη', 'Ξένια',
  'Ραφαέλα', 'Στέλλα', 'Φανή', 'Χαρά', 'Αθηνά', 'Αρετή', 'Βικτωρία', 'Δάφνη', 'Έφη', 'Θάλεια', 'Κωνσταντίνα',
  'Λυδία', 'Ματίνα', 'Νεφέλη', 'Ξανθή', 'Όλγα', 'Ροδάνθη', 'Σμαράγδα', 'Τζένη', 'Φρειδερίκη', 'Χλόη',
  'Άρτεμις', 'Άρτεμη', 'Βάια', 'Γωγώ', 'Δώρα', 'Ζέτα', 'Ηλέκτρα', 'Θεανώ', 'Κική', 'Λίτσα', 'Μυρτώ',
  'Ναταλία', 'Πωλίνα', 'Ρένα', 'Σαββίνα', 'Τούλα', 'Φιλιώ', 'Χρυσάνθη', 'Δανάη', 'Εύα', 'Θέκλα', 'Λένα',
  'Μάρθα', 'Νίκη', 'Χριστιάνα', 'Ραφαηλία', 'Σπυριδούλα', 'Ασημίνα', 'Ευδοκία', 'Καλομοίρα', 'Μαριάνθη',
  'Ναυσικά', 'Ραλλού', 'Στεργιανή', 'Χρυσαυγή', 'Δόμνα', 'Θεοδοσία', 'Κλειώ', 'Ρωξάνη', 'Σουλτάνα', 'Φλώρα',
  'Χάιδω', 'Μελίνα', 'Τζωρτζίνα', 'Εμμανουέλα', 'Νικολέτα', 'Παυλίνα', 'Ρωξάνη', 'Θάλεια', 'Ζαχαρούλα',
  'Αναστασία', 'Κορνηλία', 'Πολυξένη', 'Ερμιόνη', 'Γαλάτεια', 'Ανθή', 'Βασιλεία', 'Ευγενία', 'Ζηνοβία',
  'Θεοπούλα', 'Ιουλία', 'Κασσιανή', 'Λεμονιά', 'Μαρίτσα', 'Νταϊάνα', 'Ξανθίππη', 'Παρθένα', 'Ρηγούλα',
  'Σεβαστή', 'Τερψιθέα', 'Υβόννη', 'Φωφώ', 'Χρύσα', 'Αγάπη', 'Ζωίτσα', 'Μυρσίνη', 'Θεοφανία', 'Καλλιρρόη',
];

const MALE_EL = [
  'Γιώργος', 'Γεώργιος', 'Δημήτρης', 'Δημήτριος', 'Κώστας', 'Κωνσταντίνος', 'Γιάννης', 'Ιωάννης', 'Νίκος',
  'Νικόλαος', 'Παναγιώτης', 'Βασίλης', 'Βασίλειος', 'Χρήστος', 'Αθανάσιος', 'Θανάσης', 'Απόστολος', 'Αντώνης',
  'Αντώνιος', 'Σπύρος', 'Σπυρίδων', 'Θεόδωρος', 'Θοδωρής', 'Στέλιος', 'Στυλιανός', 'Μιχάλης', 'Μιχαήλ',
  'Ευάγγελος', 'Βαγγέλης', 'Εμμανουήλ', 'Μανώλης', 'Παύλος', 'Πέτρος', 'Στέφανος', 'Αλέξανδρος', 'Αλέξης',
  'Ανδρέας', 'Άγγελος', 'Χαράλαμπος', 'Μπάμπης', 'Ηλίας', 'Λάμπρος', 'Φώτης', 'Φώτιος', 'Αριστείδης', 'Άρης',
  'Θωμάς', 'Ιάκωβος', 'Κυριάκος', 'Λεωνίδας', 'Μάριος', 'Ναπολέων', 'Ξενοφών', 'Οδυσσέας', 'Πολυχρόνης',
  'Ραφαήλ', 'Σωτήρης', 'Σωτήριος', 'Τάσος', 'Αναστάσιος', 'Φίλιππος', 'Χάρης', 'Αβραάμ', 'Γρηγόρης',
  'Γρηγόριος', 'Δανιήλ', 'Ζαχαρίας', 'Ηρακλής', 'Θεοφάνης', 'Ισίδωρος', 'Κλεάνθης', 'Λουκάς', 'Μαρίνος',
  'Νεκτάριος', 'Ορέστης', 'Πρόδρομος', 'Σεραφείμ', 'Τηλέμαχος', 'Φοίβος', 'Χρυσόστομος', 'Αλκιβιάδης',
  'Γεράσιμος', 'Διονύσης', 'Διονύσιος', 'Ζήσης', 'Θεμιστοκλής', 'Ιγνάτιος', 'Κοσμάς', 'Μενέλαος', 'Παντελής',
  'Ρωμανός', 'Σίμος', 'Τρύφων', 'Χριστόφορος', 'Άκης', 'Μάκης', 'Τάκης', 'Λάκης', 'Χαρίλαος', 'Επαμεινώνδας',
  'Βαρδής', 'Δήμος', 'Ευστάθιος', 'Στάθης', 'Ζαφείρης', 'Θεοχάρης', 'Ιωακείμ', 'Κίμων', 'Λυκούργος',
  'Μάρκος', 'Νόννος', 'Ξάνθος', 'Περικλής', 'Ρήγας', 'Σάββας', 'Τιμολέων', 'Φώτιος', 'Χρυσοβαλάντης',
  'Αριστοτέλης', 'Βίκτωρ', 'Γαβριήλ', 'Δαμιανός', 'Ευθύμιος', 'Θύμιος', 'Ζώης', 'Ιπποκράτης', 'Κλήμης',
  'Μελέτιος', 'Νικηφόρος', 'Ξηρός', 'Πολύβιος', 'Σωκράτης', 'Τσαμπίκος', 'Φειδίας', 'Χρήστος', 'Αχιλλέας',
  'Βλάσης', 'Γερμανός', 'Δούκας', 'Ερμής', 'Θράσος', 'Κανέλλος', 'Μηνάς', 'Πλάτων', 'Στέργιος', 'Φραγκίσκος',
];

const FEMALE_EN = [
  'Mary', 'Maria', 'Elena', 'Helen', 'Sofia', 'Sophia', 'Anna', 'Anne', 'Emma', 'Olivia', 'Isabella', 'Emily',
  'Julia', 'Kate', 'Katherine', 'Catherine', 'Laura', 'Sarah', 'Jessica', 'Jennifer', 'Lisa', 'Nancy', 'Karen',
  'Susan', 'Amanda', 'Rachel', 'Diana', 'Christina', 'Victoria', 'Natalie', 'Nicole', 'Michelle', 'Melissa',
  'Stephanie', 'Rebecca', 'Hannah', 'Grace', 'Chloe', 'Zoe', 'Ella', 'Mia', 'Amelia', 'Lily', 'Anastasia',
  'Elizabeth', 'Alexandra', 'Angela', 'Barbara', 'Caroline', 'Daphne', 'Eleanor', 'Fiona', 'Georgia', 'Irene',
];
const MALE_EN = [
  'John', 'George', 'Nick', 'Nicholas', 'Chris', 'Christopher', 'Michael', 'David', 'James', 'Robert',
  'Alexander', 'Andrew', 'Daniel', 'Thomas', 'Peter', 'Paul', 'Mark', 'Steve', 'Steven', 'Tom', 'Jim',
  'Jack', 'William', 'Richard', 'Charles', 'Joseph', 'Frank', 'Kevin', 'Brian', 'Jason', 'Ryan', 'Eric',
  'Adam', 'Sam', 'Ben', 'Max', 'Leo', 'Oliver', 'Harry', 'Jacob', 'Ethan', 'Noah', 'Liam', 'Lucas', 'Henry',
  'Anthony', 'Angelo', 'Constantine', 'Dean', 'Spiros', 'Yannis', 'Kostas', 'Dimitris',
];

const FEMALE = new Set([...FEMALE_EL, ...FEMALE_EN].map(nameKey));
const MALE = new Set([...MALE_EL, ...MALE_EN].map(nameKey));

const firstToken = (name?: string) => String(name || '').trim().split(/\s+/)[0] || '';

/** Infer gender from a first name; 'unknown' when unsure (always safe to fall back). */
export function guessGender(fullName?: string): Gender {
  const k = nameKey(firstToken(fullName));
  if (!k || k.length < 2) return 'unknown';

  if (FEMALE.has(k)) return 'female';
  if (MALE.has(k)) return 'male';

  // Vocative male (Γιάννη → Γιάννης, Κώστα → Κώστας, Νίκο → Νίκος).
  if (MALE.has(k + 'σ')) return 'male';
  if (k.endsWith('ο') && MALE.has(k.slice(0, -1) + 'οσ')) return 'male';

  // Genitive (Μαρίας → Μαρία, Ελένης → Ελένη, Γιάννη vocative handled above).
  if (k.endsWith('σ')) {
    const base = k.slice(0, -1);
    if (FEMALE.has(base)) return 'female';
    if (MALE.has(base)) return 'male';
  }

  // Suffix heuristic for the long tail (Greek). Male endings first.
  if (/(οσ|ησ|ασ|υσ|ων|ευσ)$/.test(k)) return 'male';
  if (/(α|η|ω|ου|ϊνα|ιτσα)$/.test(k)) return 'female';

  return 'unknown';
}

/** Pick the right form for a known gender; falls back to the neutral one. */
export function gendered(g: Gender, forms: { m: string; f: string; n: string }): string {
  return g === 'male' ? forms.m : g === 'female' ? forms.f : forms.n;
}
