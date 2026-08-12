// ═══════════════════════════════════════════════════════════════════════════
// ΜΗΤΡΩΟ ΠΑΓΙΩΝ ΚΑΙ ΠΙΝΑΚΑΣ ΑΠΟΣΒΕΣΕΩΝ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΕΛΕΙΠΕ. Το βιβλίο της εφαρμογής είναι ΤΑΜΕΙΑΚΟ: γράφει τι πληρώθηκε και
// πότε. Μια ανακαίνιση 12.000 € φαινόταν ως δαπάνη 12.000 € μέσα σε έναν μήνα,
// που είναι σωστό ως ταμείο και λάθος ως αποτέλεσμα: το πάγιο δεν είναι έξοδο
// της χρονιάς, είναι περιουσιακό στοιχείο που αποσβένεται σε βάθος ετών. Ο
// λογιστής το ήξερε και το διόρθωνε στο χέρι, με δικό του πρόχειρο μητρώο.
//
// ΤΡΕΙΣ ΑΛΗΘΕΙΕΣ ΠΟΥ ΚΡΑΤΑΕΙ ΑΥΤΟ ΤΟ ΑΡΧΕΙΟ, ΚΑΙ ΚΑΜΙΑ ΤΕΤΑΡΤΗ
//
//   Η ΓΗ ΔΕΝ ΑΠΟΣΒΕΝΕΤΑΙ. Ο ίδιος ο νόμος το γράφει στη δομή των λογαριασμών
//   του: ο 10 «Γη» έχει 10.01 μικτή αξία και 10.02 σωρευμένες ΑΠΟΜΕΙΩΣΕΙΣ —
//   δεν υπάρχει λογαριασμός σωρευμένων αποσβέσεων γης, γιατί δεν υπάρχουν.
//   Κάθε άλλο πάγιο έχει και τα τρία (.01 μικτή, .02 αποσβέσεις, .03
//   απομειώσεις). Ένα διαμέρισμα που αποσβένεται ΟΛΟΚΛΗΡΟ, με το οικόπεδό του
//   μέσα, δίνει κάθε χρόνο απόσβεση μεγαλύτερη από τη νόμιμη.
//
//   Ο ΣΥΝΤΕΛΕΣΤΗΣ ΕΙΝΑΙ ΤΟΥ ΝΟΜΟΥ, ΚΑΙ ΟΠΟΥ ΔΕΝ ΤΟΝ ΞΕΡΟΥΜΕ ΜΕΝΕΙ ΚΕΝΟΣ. Οι
//   συντελεστές ορίζονται στο άρθρο 24 του ν.4172/2013. Εδώ γράφεται ΜΟΝΟ
//   όποιος υπάρχει ήδη δηλωμένος στην εφαρμογή με την πηγή του: το 4% των
//   κτιρίων. Για τον λοιπό εξοπλισμό ο συντελεστής ΔΕΝ μαντεύεται — μπαίνει
//   από τον λογιστή, και ώς τότε η γραμμή λέει ότι τον περιμένει. Ένα «10%»
//   γραμμένο από μνήμη είναι νούμερο που μπαίνει σε δήλωση.
//
//   Η ΑΠΟΣΒΕΣΗ ΑΡΧΙΖΕΙ ΑΠΟ ΤΟΝ ΕΠΟΜΕΝΟ ΜΗΝΑ (άρθρο 24 §2). Ένα πλυντήριο που
//   αγοράστηκε τον Δεκέμβριο δεν αποσβένεται ολόκληρη τη χρονιά: αποσβένεται
//   μηδέν μήνες. Το «ένα δωδέκατο ανά μήνα» δεν είναι λεπτομέρεια — στην πρώτη
//   χρήση κάθε παγίου αλλάζει το αποτέλεσμα.
//
// ΤΙ ΔΕΝ ΚΑΝΕΙ. Δεν αποφασίζει αν κάτι κεφαλαιοποιείται. Η διάκριση «επισκευή
// ή βελτίωση» είναι κρίση, όχι κανόνας: το ίδιο τιμολόγιο υδραυλικού μπορεί να
// είναι συντήρηση ή μέρος ανακαίνισης. Η εφαρμογή δείχνει ΤΙ ΕΙΝΑΙ ΥΠΟΨΗΦΙΟ
// και ο λογιστής κρίνει.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ΟΙ ΛΟΓΑΡΙΑΣΜΟΙ ΠΑΓΙΩΝ ΤΩΝ ΕΛΠ, ΑΝΤΙΓΡΑΜΜΕΝΟΙ ΑΠΟ ΤΟ ΠΑΡΑΡΤΗΜΑ Γ.
 *
 * Ονόματα και υποδιαιρέσεις αυτούσια από τον ν.4308/2014 — μαζί με την
 * ορθογραφία του νόμου («Κτήρια»), γιατί ο λογιστής τα αναζητά έτσι ακριβώς
 * στο πρόγραμμά του. Ο λογαριασμός εξόδου (66.x) έρχεται από τον οδηγό
 * συμπλήρωσης του Ε3 της ΑΑΔΕ, που απαριθμεί τι περιλαμβάνει ο 66.
 */
export interface ElpAssetAccount {
  code: string;
  name: string;
  /** Μικτή αξία (κόστος ή αναπροσαρμοσμένη). */
  gross: string;
  /** Σωρευμένες αποσβέσεις. `null` στη γη, που δεν αποσβένεται. */
  depreciation: string | null;
  /** Σωρευμένες απομειώσεις. Υπάρχουν παντού, και στη γη. */
  impairment: string;
  /** Ο λογαριασμός εξόδου της απόσβεσης (66.x), όπου υπάρχει απόσβεση. */
  expense: string | null;
  /** Το όνομα του λογαριασμού εξόδου, όπως το γράφει ο οδηγός του Ε3. */
  expenseName: string | null;
}

export const ELP_ASSETS: readonly ElpAssetAccount[] = [
  { code: '10', name: 'Γη', gross: '10.01', depreciation: null, impairment: '10.02', expense: null, expenseName: null },
  { code: '11', name: 'Διαμορφώσεις γης υποκείμενες σε απόσβεση', gross: '11.01', depreciation: '11.02', impairment: '11.03', expense: '66.01', expenseName: 'Αποσβέσεις διαμορφώσεων γης' },
  { code: '12', name: 'Κτήρια - τεχνικά έργα', gross: '12.01', depreciation: '12.02', impairment: '12.03', expense: '66.02', expenseName: 'Αποσβέσεις κτιρίων – τεχνικών έργων' },
  { code: '15', name: 'Λοιπός εξοπλισμός', gross: '15.01', depreciation: '15.02', impairment: '15.03', expense: '66.05', expenseName: 'Αποσβέσεις λοιπού εξοπλισμού' },
  { code: '16', name: 'Επενδύσεις σε ακίνητα', gross: '16.01', depreciation: '16.02', impairment: '16.03', expense: '66.06', expenseName: 'Αποσβέσεις επενδύσεων σε ακίνητα' },
];

export const elpAsset = (code: string): ElpAssetAccount | null =>
  ELP_ASSETS.find(a => a.code === code) ?? null;

/**
 * ΓΙΑΤΙ ΤΟ ΕΚΜΙΣΘΩΜΕΝΟ ΑΚΙΝΗΤΟ ΠΑΕΙ ΣΤΟΝ 16 ΚΑΙ ΟΧΙ ΣΤΟΝ 12.
 *
 * Ο 12 «Κτήρια» είναι το ακίνητο που ΧΡΗΣΙΜΟΠΟΙΕΙ η οντότητα για τη
 * δραστηριότητά της· ο 16 «Επενδύσεις σε ακίνητα» είναι το ακίνητο που
 * κατέχεται για να αποφέρει ΜΙΣΘΩΜΑΤΑ ή υπεραξία. Ένα διαμέρισμα που
 * νοικιάζεται είναι το δεύτερο, με τα ίδια λόγια του νόμου. Η διάκριση δεν
 * είναι φιλολογική: αλλάζει και τη γραμμή του ισολογισμού και τον λογαριασμό
 * της απόσβεσης (66.06 αντί 66.02).
 */
export const RENTED_PROPERTY_ACCOUNT = '16';
export const OWN_USE_PROPERTY_ACCOUNT = '12';
export const EQUIPMENT_ACCOUNT = '15';

/** Ένα πάγιο, όπως μπαίνει στο μητρώο. */
export interface FixedAsset {
  /** Τι είναι, με τα λόγια του χρήστη. */
  name: string;
  /** Ο λογαριασμός ΕΛΠ («16», «15», «12»). */
  elp: string;
  /** Η αξία κτήσης, ολόκληρη. */
  cost: number;
  /** Πότε τέθηκε σε χρήση (YYYY-MM-DD). `null` όταν δεν είναι γνωστό. */
  acquired: string | null;
  /**
   * Το τμήμα της αξίας που ΔΕΝ αποσβένεται — στα ακίνητα, το οικόπεδο.
   * Μηδέν σε ό,τι αποσβένεται ολόκληρο.
   */
  land?: number;
  /** Ο ετήσιος συντελεστής (0,04 για 4%). `null` όσο δεν έχει δηλωθεί. */
  rate: number | null;
  /** Από πού ήρθε η γραμμή: «Ακίνητο», «Απογραφή», «Δαπάνη». */
  source: string;
  /** Υποψήφιο για κεφαλαιοποίηση, δηλαδή δεν έχει κριθεί ακόμη. */
  candidate?: boolean;
}

/** Μία χρονιά του πίνακα αποσβέσεων. */
export interface DepreciationRow {
  year: number;
  /** Αναπόσβεστη αξία στην αρχή της χρονιάς. */
  opening: number;
  /** Πόσοι μήνες αποσβένονται μέσα στη χρονιά — δώδεκα, εκτός πρώτης. */
  months: number;
  /** Η απόσβεση της χρονιάς. */
  charge: number;
  /** Σωρευμένες αποσβέσεις στο τέλος της χρονιάς. */
  accumulated: number;
  /** Αναπόσβεστη αξία στο τέλος της χρονιάς. */
  closing: number;
}

const cents = (n: number): number => Math.round(n * 100) / 100;

/** Η αξία που αποσβένεται: το κόστος μείον το οικόπεδο. Ποτέ αρνητική. */
export const depreciableBase = (a: FixedAsset): number =>
  cents(Math.max(0, (Number(a.cost) || 0) - (Number(a.land) || 0)));

/**
 * ΟΙ ΜΗΝΕΣ ΤΗΣ ΠΡΩΤΗΣ ΧΡΗΣΗΣ, ΚΑΤΑ ΤΟ ΑΡΘΡΟ 24 §2.
 *
 * Η απόσβεση αρχίζει από τον ΕΠΟΜΕΝΟ μήνα από αυτόν που το πάγιο τέθηκε σε
 * χρήση. Αγορά τον Ιανουάριο δίνει έντεκα μήνες, όχι δώδεκα· αγορά τον
 * Δεκέμβριο δίνει μηδέν, και η απόσβεση αρχίζει την επόμενη χρονιά.
 */
export function monthsInFirstYear(acquired: string): number {
  const m = Number(String(acquired).slice(5, 7));
  if (!Number.isFinite(m) || m < 1 || m > 12) return 0;
  return 12 - m;
}

/**
 * Ο πίνακας αποσβέσεων ενός παγίου, από την κτήση ώς το `throughYear`.
 *
 * Κενός όταν λείπει ημερομηνία, συντελεστής ή αξία: ο πίνακας δεν
 * συμπληρώνεται με μηδενικά που μοιάζουν με απάντηση.
 */
export function depreciationSchedule(a: FixedAsset, throughYear: number): DepreciationRow[] {
  const base = depreciableBase(a);
  const rate = Number(a.rate);
  if (!a.acquired || !base || !Number.isFinite(rate) || rate <= 0) return [];
  const start = Number(String(a.acquired).slice(0, 4));
  if (!Number.isFinite(start) || start > throughYear) return [];

  const rows: DepreciationRow[] = [];
  let accumulated = 0;
  for (let year = start; year <= throughYear; year++) {
    const opening = cents(base - accumulated);
    if (opening <= 0) break;
    const months = year === start ? monthsInFirstYear(a.acquired) : 12;
    // Η τελευταία χρονιά κόβεται στο υπόλοιπο: ένα πάγιο δεν αποσβένεται κάτω
    // από το μηδέν, και ένας συντελεστής που δεν διαιρεί ακριβώς το 100 θα
    // άφηνε λεπτά να τρέχουν για πάντα.
    const charge = cents(Math.min(opening, base * rate * (months / 12)));
    accumulated = cents(accumulated + charge);
    rows.push({ year, opening, months, charge, accumulated, closing: cents(base - accumulated) });
  }
  return rows;
}

/** Η απόσβεση μιας συγκεκριμένης χρήσης. Μηδέν όταν δεν αποσβένεται. */
export function chargeForYear(a: FixedAsset, year: number): number {
  return depreciationSchedule(a, year).find(r => r.year === year)?.charge ?? 0;
}

/** Η αναπόσβεστη αξία στο τέλος μιας χρήσης, όσο ξέρουμε. */
export function closingValue(a: FixedAsset, year: number): number {
  const rows = depreciationSchedule(a, year);
  return rows.length ? rows[rows.length - 1].closing : depreciableBase(a);
}

/**
 * ΤΙ ΛΕΙΠΕΙ ΓΙΑ ΝΑ ΒΓΕΙ Ο ΠΙΝΑΚΑΣ, ΓΡΑΜΜΕΝΟ ΩΣ ΕΡΩΤΗΣΗ.
 *
 * Κενό σημαίνει «όλα καλά». Ο λογιστής που ανοίγει το μητρώο δεν πρέπει να
 * ψάχνει γιατί μια γραμμή δεν έχει πίνακα: ο λόγος γράφεται δίπλα της.
 */
export function missingFor(a: FixedAsset): string {
  if (!(Number(a.cost) > 0)) return 'Λείπει η αξία κτήσης';
  if (!a.acquired) return 'Λείπει η ημερομηνία κτήσης';
  if (!(Number(a.rate) > 0)) return 'Λείπει ο συντελεστής απόσβεσης';
  if (depreciableBase(a) <= 0) return 'Δεν αποσβένεται';
  return '';
}

/**
 * Η ΣΕΙΡΑ ΤΟΥ ΜΗΤΡΩΟΥ: ΛΟΓΑΡΙΑΣΜΟΣ, ΜΕΤΑ ΧΡΟΝΟΣ.
 *
 * Ο λογιστής διαβάζει ανά λογαριασμό, γιατί έτσι τα καταχωρεί· μέσα στον
 * λογαριασμό, χρονολογικά, όπως και το βιβλίο. Τα αχρονολόγητα στο τέλος, και
 * οι ισοπαλίες αλφαβητικά, ώστε δύο εξαγωγές να δίνουν το ίδιο αρχείο.
 */
export function sortAssets(assets: readonly FixedAsset[]): FixedAsset[] {
  return [...assets].sort((x, y) =>
    x.elp.localeCompare(y.elp, 'en', { numeric: true })
    || (x.acquired || '9999-12-31').localeCompare(y.acquired || '9999-12-31')
    || x.name.localeCompare(y.name, 'el'));
}

/** Σύνολα ανά λογαριασμό ΕΛΠ, για τη γραμμή που κλείνει κάθε ομάδα. */
export interface AccountTotal {
  code: string;
  name: string;
  count: number;
  cost: number;
  land: number;
  charge: number;
  closing: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// ΑΠΟ ΤΑ ΔΕΔΟΜΕΝΑ ΤΗΣ ΕΦΑΡΜΟΓΗΣ ΣΤΟ ΜΗΤΡΩΟ
// ─────────────────────────────────────────────────────────────────────────
// Ο χρήστης δεν συμπληρώνει μητρώο παγίων και δεν πρόκειται να συμπληρώσει.
// Καταχωρεί ένα ακίνητο με τιμή κτήσης, ανεβάζει τα έπιπλά του στην Απογραφή
// και γράφει μια ανακαίνιση ως δαπάνη. Και τα τρία ΕΙΝΑΙ πάγια· απλώς κανείς
// δεν τα είχε βάλει ποτέ στον ίδιο πίνακα.
// ═══════════════════════════════════════════════════════════════════════════

/** Πόσο του ακινήτου δεν αποσβένεται, ως αναλογία που αφορά το οικόπεδο. */
export interface RegisterInput {
  property?: {
    name?: string | null;
    /** Τιμή κτήσης από το συμβόλαιο. Η βάση της απόσβεσης, όταν υπάρχει. */
    purchasePrice?: number | null;
    purchaseDate?: string | null;
    /** Εκμισθωμένο; Κρίνει αν πάει στον 16 ή στον 12. */
    rented: boolean;
  } | null;
  /** Η αναλογία της αξίας που αφορά το ΚΤΙΣΜΑ (το υπόλοιπο είναι οικόπεδο). */
  buildingFraction: number;
  /** Ο συντελεστής απόσβεσης κτιρίων, κατά το άρθρο 24. */
  buildingRate: number;
  inventory?: readonly {
    name?: string | null; category?: string | null;
    purchase_value?: number | null; purchase_date?: string | null;
  }[];
  /** Οι δαπάνες της χρήσης· κρατούνται μόνο όσες είναι υποψήφιες για πάγιο. */
  expenses?: readonly {
    date: string; category?: string | null; description?: string | null; amount?: number | null;
  }[];
  /** Ποιες κατηγορίες δαπανών είναι υποψήφιες, και σε ποιον λογαριασμό. */
  capitalisable: Readonly<Record<string, string>>;
}

/**
 * Το μητρώο, από ό,τι ήδη ξέρει η εφαρμογή.
 *
 * ΤΟ ΑΚΙΝΗΤΟ ΜΠΑΙΝΕΙ ΜΕ ΤΗΝ ΤΙΜΗ ΚΤΗΣΗΣ ΤΟΥ, ΟΧΙ ΜΕ ΤΗΝ ΕΚΤΙΜΗΣΗ ΑΞΙΑΣ. Το
 * μητρώο παγίων γράφει ΚΟΣΤΟΣ. Η «αξία» της εφαρμογής είναι εκτίμηση αγοράς
 * που αλλάζει κάθε χρόνο — μπαίνοντας εκεί, η απόσβεση θα άλλαζε κι αυτή κάθε
 * χρόνο, που δεν συμβαίνει σε κανένα βιβλίο.
 *
 * ΟΙ ΔΑΠΑΝΕΣ ΜΠΑΙΝΟΥΝ ΩΣ ΥΠΟΨΗΦΙΕΣ. Το αν μια ανακαίνιση κεφαλαιοποιείται ή
 * είναι συντήρηση δεν κρίνεται από την κατηγορία: το ίδιο τιμολόγιο μπορεί να
 * είναι και τα δύο. Σημαδεύονται και ο λογιστής αποφασίζει.
 */
export function buildRegister(inp: RegisterInput): FixedAsset[] {
  const out: FixedAsset[] = [];
  const p = inp.property;
  const price = Number(p?.purchasePrice) || 0;
  if (p && price > 0) {
    const land = cents(price * (1 - inp.buildingFraction));
    out.push({
      name: p.name || 'Ακίνητο',
      elp: p.rented ? RENTED_PROPERTY_ACCOUNT : OWN_USE_PROPERTY_ACCOUNT,
      cost: cents(price),
      acquired: p.purchaseDate || null,
      land,
      rate: inp.buildingRate,
      source: 'Ακίνητο',
    });
  }
  for (const it of inp.inventory ?? []) {
    const cost = Number(it.purchase_value) || 0;
    if (cost <= 0) continue;
    out.push({
      name: it.name || it.category || 'Εξοπλισμός',
      elp: EQUIPMENT_ACCOUNT,
      cost: cents(cost),
      acquired: it.purchase_date || null,
      land: 0,
      // Ο συντελεστής του λοιπού εξοπλισμού δεν είναι δηλωμένος στην εφαρμογή
      // και δεν μαντεύεται: ορίζεται στο άρθρο 24 και τον βάζει ο λογιστής.
      rate: null,
      source: 'Απογραφή',
    });
  }
  for (const e of inp.expenses ?? []) {
    const account = inp.capitalisable[String(e.category || '')];
    const cost = Number(e.amount) || 0;
    if (!account || cost <= 0) continue;
    out.push({
      name: [e.category, e.description].filter(Boolean).join(', ') || 'Δαπάνη',
      elp: account,
      cost: cents(cost),
      acquired: e.date || null,
      land: 0,
      // Η ΒΕΛΤΙΩΣΗ ΑΚΟΛΟΥΘΕΙ ΤΟ ΚΤΙΣΜΑ. Μια ανακαίνιση προσαυξάνει το ακίνητο
      // και αποσβένεται με τον συντελεστή του, όχι με δικό της. Ο εξοπλισμός
      // δεν έχει δηλωμένο συντελεστή, όπως και στην Απογραφή.
      rate: account === EQUIPMENT_ACCOUNT ? null : inp.buildingRate,
      source: 'Δαπάνη',
      candidate: true,
    });
  }
  return sortAssets(out);
}

export function totalsByAccount(assets: readonly FixedAsset[], year: number): AccountTotal[] {
  const by = new Map<string, AccountTotal>();
  for (const a of sortAssets(assets)) {
    const acct = elpAsset(a.elp);
    const cur = by.get(a.elp) ?? {
      code: a.elp, name: acct?.name || a.elp, count: 0, cost: 0, land: 0, charge: 0, closing: 0,
    };
    cur.count += 1;
    cur.cost = cents(cur.cost + (Number(a.cost) || 0));
    cur.land = cents(cur.land + (Number(a.land) || 0));
    cur.charge = cents(cur.charge + chargeForYear(a, year));
    cur.closing = cents(cur.closing + closingValue(a, year));
    by.set(a.elp, cur);
  }
  return [...by.values()].sort((x, y) => x.code.localeCompare(y.code, 'en', { numeric: true }));
}
