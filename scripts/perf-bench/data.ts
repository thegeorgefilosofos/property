// ═══════════════════════════════════════════════════════════════════════════
// ΕΝΑ ΧΑΡΤΟΦΥΛΑΚΙΟ ΠΟΥ ΔΕΝ ΥΠΑΡΧΕΙ, ΣΕ ΜΕΓΕΘΟΣ ΠΟΥ ΘΑ ΥΠΑΡΞΕΙ
// ─────────────────────────────────────────────────────────────────────────
// Η μεγαλύτερη δοκιμή μέχρι σήμερα είχε λίγα ακίνητα, όσα χωρούσαν σε ένα
// σενάριο γραμμένο με το χέρι. Ο επαγγελματίας πελάτης, όμως, είναι ακριβώς
// αυτός που φέρνει διακόσια — και είναι ο μόνος που πληρώνει το ακριβό πακέτο.
//
// ΤΑ ΝΟΥΜΕΡΑ ΕΙΝΑΙ ΑΝΑΛΟΓΑ, ΟΧΙ ΣΤΡΟΓΓΥΛΑ. Ενα χαρτοφυλάκιο 200 ακινήτων δεν
// έχει 200 γραμμές: έχει 2.400 δόσεις ενοικίου τον χρόνο, χιλιάδες διαμονές,
// χιλιάδες λογαριασμούς. Αν ο πάγκος έδινε 200 γραμμές σε κάθε πίνακα, θα
// μετρούσε κάτι που δεν συμβαίνει ποτέ.
//
// ΚΑΜΙΑ ΤΥΧΑΙΟΤΗΤΑ. Οι τιμές παράγονται από τον δείκτη, ώστε δύο εκτελέσεις να
// δίνουν ΤΑ ΙΔΙΑ δεδομένα. Ενας πάγκος που αλλάζει είσοδο σε κάθε τρέξιμο δεν
// μετράει τον κώδικα· μετράει τον θόρυβο.
// ═══════════════════════════════════════════════════════════════════════════

/** Το έτος του σεναρίου. Σταθερό, ώστε ο πάγκος να μη γερνά με το ρολόι. */
export const YEAR = 2026;

const TYPES = ['apartment', 'maisonette', 'studio', 'shop', 'office'];
const STATUSES = ['rented', 'vacant', 'renovation', 'own_use'];

export interface Bench {
  properties: Array<{ id: string; name: string; prop_type: string; address: string; target_rent: number; value: number }>;
  rows: Record<string, unknown[]>;
}

/**
 * Χτίζει χαρτοφυλάκιο `n` ακινήτων με ό,τι κρέμεται από αυτά.
 *
 * Η αναλογία βραχυχρόνιας προς μακροχρόνια είναι 1 προς 3, όπως στην αγορά:
 * η βραχυχρόνια παράγει τις περισσότερες γραμμές ανά ακίνητο, οπότε ένα
 * χαρτοφυλάκιο αποκλειστικά βραχυχρόνιας θα φούσκωνε τεχνητά τον πάγκο.
 */
export function portfolio(n: number): Bench {
  const properties = [];
  const stays: unknown[] = [];
  const bills: unknown[] = [];
  const expenses: unknown[] = [];
  const tenants: unknown[] = [];
  const checklist: unknown[] = [];
  const rentPays: unknown[] = [];
  const clients: unknown[] = [];
  const propOwners: unknown[] = [];
  const rentCfg: unknown[] = [];
  const inventory: unknown[] = [];
  const calendar: unknown[] = [];
  const contacts: unknown[] = [];
  const loans: unknown[] = [];
  const billsSettings: unknown[] = [];
  const documents: unknown[] = [];
  const repairs: unknown[] = [];
  const handovers: unknown[] = [];

  for (let i = 0; i < n; i++) {
    const id = `p${i}`;
    const short = i % 4 === 0;
    const rent = 400 + (i % 17) * 50;
    properties.push({
      id,
      name: `Ακίνητο ${i + 1}`,
      prop_type: TYPES[i % TYPES.length],
      address: `Οδός ${i + 1}, Αθήνα`,
      target_rent: rent,
      value: 90_000 + (i % 23) * 7_500,
    });
    // ΤΟ ΑΚΙΝΗΤΟ ΤΟΥ ΠΑΓΚΟΥ ΕΙΧΕ ΜΟΝΟ ΤΑΥΤΟΤΗΤΑ ΚΑΙ ΙΔΙΟΚΤΗΤΗ. Καμία οθόνη που
    // διαβάζει αξία, μίσθωμα, τετραγωνικά ή τύπο δεν έφτανε ποτέ στη γεμάτη της
    // κατάσταση: η Απόδοση, για παράδειγμα, έμενε αιώνια στο «Συμπλήρωσε αξία
    // ακινήτου και μηνιαίο μίσθωμα» και όλα τα από κάτω δεν μετρήθηκαν ποτέ.
    propOwners.push({
      id, client_id: i % 5 === 0 ? `c${i % 40}` : null,
      name: `Ακίνητο ${i + 1}`, prop_type: TYPES[i % TYPES.length],
      value: 90_000 + (i % 23) * 7_500, target_rent: rent,
      sqm: 42 + (i % 9) * 8, postal_code: '11742',
      rental_mode: short ? 'short' : 'long', status_detail: null,
    });
    rentCfg.push({ property_id: id, actual_rent: rent, target_rent: rent });

    if (short) {
      // Βραχυχρόνια: 18 διαμονές τον χρόνο, μέση διάρκεια 4 νύχτες.
      for (let s = 0; s < 18; s++) {
        const month = (s % 12) + 1;
        const day = ((s * 7) % 25) + 1;
        stays.push({
          id: `${id}-s${s}`, property_id: id, client_id: `c${s % 40}`,
          check_in: `${YEAR}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          check_out: `${YEAR}-${String(month).padStart(2, '0')}-${String(Math.min(day + 4, 28)).padStart(2, '0')}`,
          total: 220 + (s % 9) * 35, guests: 2 + (s % 3), status: 'confirmed',
          gross_amount: 240 + (s % 9) * 38, payout_amount: 220 + (s % 9) * 35, platform: s % 2 ? 'airbnb' : 'booking',
        });
      }
    } else {
      // Μακροχρόνια: ένας μισθωτής και δώδεκα δόσεις.
      tenants.push({
        id: `t${i}`, property_id: id, full_name: `Μισθωτής ${i + 1}`,
        monthly_rent: rent, active: true, e_payment: i % 3 !== 0, updated_at: `${YEAR}-01-0${(i % 9) + 1}`,
      });
      for (let m = 1; m <= 12; m++) {
        rentPays.push({
          id: `r${i}-${m}`, property_id: id, tenant_id: `t${i}`, amount: rent,
          paid: m <= 8, period_year: YEAR, period_month: m,
          due_date: `${YEAR}-${String(m).padStart(2, '0')}-05`,
        });
      }
    }

    // Λογαριασμοί: ρεύμα ανά δίμηνο και νερό ανά τρίμηνο.
    for (let b = 0; b < 10; b++) {
      bills.push({
        id: `${id}-b${b}`, property_id: id, user_id: 'u1',
        category: b % 2 ? 'electricity' : 'water', amount: 45 + (b % 7) * 12,
        issue_date: `${YEAR}-${String((b % 12) + 1).padStart(2, '0')}-14`,
        due_date: `${YEAR}-${String((b % 12) + 1).padStart(2, '0')}-28`, paid: b < 8,
      });
    }

    // ═══ ΟΙ ΔΑΠΑΝΕΣ ΕΓΡΑΦΑΝ ΣΤΗΛΕΣ ΠΟΥ ΔΕΝ ΥΠΑΡΧΟΥΝ ══════════════════════
    // Ο πίνακας `expenses` έχει `date` και `description` (lib/data/expenses.ts),
    // ενώ ο πάγκος έγραφε `expense_date` και καμία περιγραφή. Αποτέλεσμα, ορατό
    // στην απόδοση: κάθε γραμμή του Καθολικού έγραφε «Χωρίς ημερομηνία» και
    // «Χωρίς περιγραφή», όλες μαζεύονταν σε ομάδα «ΑΓΝΩΣΤΟ» και έμεναν έξω από
    // τα σύνολα μήνα και έτους. Δηλαδή η οθόνη μετριόταν σε κατάσταση που δεν
    // συμβαίνει σε κανέναν χρήστη.
    const EXP_TITLES = ['Λογαριασμός ΔΕΗ', 'Υδραυλικός', 'Ασφάλιστρα', 'Κοινόχρηστα',
      'Συντήρηση καυστήρα', 'Ελαιοχρωματισμοί', 'Απεντόμωση', 'Καθαρισμός'];
    for (let e = 0; e < 8; e++) {
      expenses.push({
        id: `${id}-e${e}`, property_id: id, user_id: 'u1',
        amount: 60 + (e % 11) * 24, category: e % 3 ? 'maintenance' : 'insurance',
        description: EXP_TITLES[e % EXP_TITLES.length],
        date: `${YEAR}-${String((e % 12) + 1).padStart(2, '0')}-09`,
        paid: e % 4 !== 0, paid_by: 'owner', deductible: true,
      });
    }

    // Εκκρεμότητες: μία στα τρία ακίνητα έχει ανοιχτή.
    if (i % 3 === 0) {
      checklist.push({
        id: `${id}-k`, property_id: id, title: `Εργασία ${i}`, done: false,
        due_date: `${YEAR}-${String((i % 12) + 1).padStart(2, '0')}-20`, priority: 'normal',
      });
    }
  }

  // ═══ ΤΕΣΣΕΡΙΣ ΠΙΝΑΚΕΣ ΠΟΥ ΓΥΡΝΟΥΣΑΝ ΠΑΝΤΑ ΑΔΕΙΟΙ ══════════════════════════
  // Μετρήθηκε με τύλιγμα του `window.__respond`: ο κάθε ένας ζητιόταν από δύο ώς
  // εφτά οθόνες και ΚΑΜΙΑ κλήση δεν έπαιρνε γραμμή. Το Ημερολόγιο μετριόταν
  // πάντα άδειο, οι Επαφές πάντα άδειες, η Αποδοση χωρίς δάνειο και όλες οι
  // ρυθμίσεις των Λογαριασμών ανύπαρκτες.

  // Ημερολόγιο: γεγονότα σε όλες τις κατηγορίες, μοιρασμένα στον χρόνο ώστε να
  // πέφτουν και στους τρεις κάδους της Ατζέντας, εκπρόθεσμα, εβδομάδα, αργότερα.
  const CAL = [
    { t: 'Δήλωση Ε2', c: 'tax', d: 3 }, { t: 'ΕΝΦΙΑ, δόση', c: 'tax', d: 21 },
    { t: 'Λογαριασμός ΔΕΗ', c: 'bills', d: -4 }, { t: 'Λογαριασμός ΕΥΔΑΠ', c: 'bills', d: 12 },
    { t: 'Συντήρηση καυστήρα', c: 'maintenance', d: 45 }, { t: 'Απεντόμωση', c: 'maintenance', d: 90 },
    { t: 'Λήξη μίσθωσης', c: 'contract', d: 58 }, { t: 'Ανανέωση ασφαλιστηρίου', c: 'contract', d: 120 },
    { t: 'Είσπραξη ενοικίου', c: 'financial', d: 1 }, { t: 'Δόση δανείου', c: 'financial', d: 6 },
    { t: 'Παράδοση κλειδιών', c: 'tenant', d: 2 }, { t: 'Ελεγχος υγρασίας', c: 'reminder', d: 30 },
  ];
  const dayOf = (offset: number): string => {
    const dt = new Date(Date.UTC(YEAR, 7, 27 + offset));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  };
  CAL.forEach((e, k) => calendar.push({
    id: `cal${k}`, property_id: 'p0', user_id: 'u1',
    title: e.t, category: e.c, event_date: dayOf(e.d),
    amount: k % 3 === 0 ? 120 + k * 35 : null,
    priority: k % 4 === 0 ? 'high' : 'medium',
    status: e.d < 0 ? 'pending' : 'pending',
    recurring: false, notes: null, source: 'manual', event_time: k % 5 === 0 ? '10:00' : null,
    created_at: dayOf(-30),
  }));

  // Επαφές: οι ρόλοι που ξέρει η οθόνη, ένας ανά ρόλο συν διπλοί σε δύο.
  const ROLES = ['plumber', 'electrician', 'accountant', 'lawyer', 'cleaner', 'technician', 'manager', 'other'];
  ROLES.forEach((r, k) => contacts.push({
    id: `ct${k}`, property_id: k % 3 === 0 ? null : 'p0', user_id: 'u1',
    role: r, full_name: `Επαφή ${k + 1}`,
    phone: `21055500${String(k).padStart(2, '0')}`,
    email: k % 2 ? `epafi${k}@example.gr` : null,
    notes: k === 0 ? 'Δουλεύει και Σαββατοκύριακα.' : null,
    created_at: dayOf(-200),
  }));

  // Ενα δάνειο στο πρώτο ακίνητο: η Αποδοση δείχνει μόχλευση μόνο όταν υπάρχει.
  loans.push({
    id: 'ln0', property_id: 'p0', user_id: 'u1', bank: 'Τράπεζα Πειραιώς',
    loan_amount: 120_000, down_payment: 40_000, rate_type: 'floating',
    fixed_rate: null, euribor: 2.6, spread: 1.8, years: 25,
    start_date: `${YEAR - 4}-03-01`, status: 'active', loan_type: 'mortgage',
    property_value: 190_000, notes: null, created_at: `${YEAR - 4}-03-01`,
  });

  // Ρυθμίσεις λογαριασμών: τα κλειδιά που διαβάζουν οι οθόνες των Λογαριασμών
  // και ο ΕΝΦΙΑ. Τιμές που ΥΠΑΡΧΟΥΝ, ώστε να αποδίδονται οι γεμάτες καταστάσεις.
  billsSettings.push(
    { id: 'bs0', property_id: 'p0', user_id: 'u1', section: 'services',
      data: { enfiaLastAnnual: '428', enfiaLastCount: '12', enfiaSqm: '42', enfiaZone: '1501_2500',
              enfiaOwnership: '100', hasCleaning: true, cleaningCostPerVisit: '45', cleaningFreq: 'monthly' },
      updated_at: dayOf(-10) },
    { id: 'bs1', property_id: 'p0', user_id: 'u1', section: 'electricity',
      data: { provider: 'ΔΕΗ', lastBillTotal: '96', lastBillDimotika: '18' }, updated_at: dayOf(-10) },
    { id: 'bs2', property_id: 'p0', user_id: 'u1', section: 'insurance',
      data: { insCustomEarthquake: true, insCustomFlood: false }, updated_at: dayOf(-10) },
  );

  // ═══ ΕΞΟΠΛΙΣΜΟΣ ΣΤΟ ΠΡΩΤΟ ΑΚΙΝΗΤΟ, ΜΕ ΚΑΙ ΧΩΡΙΣ ΣΤΟΙΧΕΙΑ ══════════════════
  // Ο πίνακας `inventory_items` δεν σπερνόταν καθόλου, οπότε η καρτέλα «Επιπλα
  // και εξοπλισμός» δεν είχε μετρηθεί ΠΟΤΕ σε καμία συσκευή.
  //
  // Τα δεκατρία αντικείμενα δεν είναι όλα ίδια ΣΚΟΠΙΜΑ: εννιά έχουν τιμή και
  // ημερομηνία αγοράς, δύο έχουν τιμή χωρίς ημερομηνία και δύο δεν έχουν τίποτα.
  // Ετσι η μέτρηση βλέπει ΚΑΙ ΤΙΣ ΤΡΕΙΣ καταστάσεις της κάρτας, δηλαδή και εκείνη
  // που έδειχνε «0,00 €» και «100%» για αντικείμενο χωρίς κανένα στοιχείο.
  const INV = [
    { name: 'Απορροφητήρας', cat: 'Ηλεκτρικές Συσκευές', room: 'Κουζίνα' },
    { name: 'Θερμοσίφωνας', cat: 'Θέρμανση & Ψύξη', room: 'Μπάνιο' },
    { name: 'Καναπές', cat: 'Έπιπλα', room: 'Σαλόνι' },
    { name: 'Καρέκλες (σετ)', cat: 'Έπιπλα', room: 'Σαλόνι' },
    { name: 'Κλιματιστικό', cat: 'Θέρμανση & Ψύξη', room: 'Σαλόνι' },
    { name: 'Κουζίνα (εστίες και φούρνος)', cat: 'Ηλεκτρικές Συσκευές', room: 'Κουζίνα' },
    { name: 'Κρεβάτι διπλό', cat: 'Έπιπλα', room: 'Κύριο Υπνοδωμάτιο' },
    { name: 'Ντουλάπα', cat: 'Έπιπλα', room: 'Κύριο Υπνοδωμάτιο' },
    { name: 'Πλυντήριο ρούχων', cat: 'Ηλεκτρικές Συσκευές', room: 'Μπάνιο' },
    { name: 'Ψυγείο', cat: 'Ηλεκτρικές Συσκευές', room: 'Κουζίνα' },
    { name: 'Τηλεόραση', cat: 'Ηλεκτρονικά', room: 'Σαλόνι' },
    { name: 'Τραπέζι', cat: 'Έπιπλα', room: 'Σαλόνι' },
    { name: 'Φωτιστικό δαπέδου', cat: 'Έπιπλα', room: 'Σαλόνι' },
  ];
  INV.forEach((it, k) => {
    const withValue = k < 11;
    const withDate = k < 9;
    inventory.push({
      id: `inv${k}`, property_id: 'p0', user_id: 'u1',
      name: it.name, category: it.cat, room: it.room,
      brand: k % 3 === 0 ? 'Bosch' : '', model: '', serial_number: '',
      purchase_value: withValue ? 180 + (k % 7) * 145 : 0,
      current_value: 0,
      purchase_date: withDate ? `${YEAR - 3 - (k % 6)}-0${(k % 8) + 1}-12` : '',
      warranty_expiry: k % 4 === 0 ? `${YEAR + 1}-03-01` : '',
      condition: 'Καλή', notes: '', photo_url: '', photos: [],
      energy_class: k % 3 === 0 ? 'A' : '', power_watts: 0, daily_hours_use: 0,
      energy_mode: null, kwh_per_100_cycles: 0, cycles_per_month: 0, annual_kwh: 0,
      replacement_cost: k % 5 === 0 ? 320 : 0,
      created_at: `${YEAR}-01-01`, updated_at: `${YEAR}-01-01`,
    });
  });

  // Το στιγμιότυπο του πρωτοκόλλου βγαίνει από τα ΙΔΙΑ αντικείμενα, ώστε τα δύο
  // να μη διαφωνούν όπως θα διαφωνούσαν δύο χειρόγραφοι κατάλογοι.
  const INV_SNAPSHOT = INV.slice(0, 6).map((it, k) => ({
    item_id: `inv${k}`, name: it.name, condition_at_handover: k === 2 ? 'Μέτρια' : 'Καλή',
  }));

  // Αρχείο ακινήτου: έγγραφα σε διαφορετικές κατηγορίες και μεγέθη, ώστε να
  // αποδοθούν οι γραμμές με ποσό, με προμηθευτή και χωρίς τίποτα από τα δύο.
  const DOCS = [
    { k: 'contract', t: 'Μισθωτήριο 2026', a: null, sup: null },
    { k: 'invoice', t: 'Τιμολόγιο υδραυλικού', a: 180, sup: 'Υδραυλικές Εργασίες ΑΕ' },
    { k: 'bill', t: 'Λογαριασμός ΔΕΗ Ιουλίου', a: 96.4, sup: 'ΔΕΗ' },
    { k: 'tax', t: 'Εκκαθαριστικό ΕΝΦΙΑ', a: 428, sup: null },
    { k: 'insurance', t: 'Ασφαλιστήριο κατοικίας', a: 240, sup: 'Ασφάλειες Ελλάς' },
    { k: 'other', t: 'Πιστοποιητικό ενεργειακής απόδοσης', a: null, sup: null },
  ];
  DOCS.forEach((d, k) => documents.push({
    id: `doc${k}`, property_id: 'p0', user_id: 'u1',
    kind: d.k, category: d.k, title: d.t, notes: null,
    doc_date: dayOf(-20 - k * 15), file_path: `u1/p0/doc${k}.pdf`,
    file_name: `${d.t}.pdf`, mime: 'application/pdf', size_bytes: 180_000 + k * 42_000,
    created_at: dayOf(-20 - k * 15), supplier: d.sup, amount: d.a, provider_afm: d.sup ? '099123456' : null,
  }));

  // Επισκευές και πρωτόκολλα: οι δύο υποσελίδες του εξοπλισμού που δεν είχαν
  // αποδοθεί ποτέ με περιεχόμενο.
  repairs.push(
    { id: 'rep0', item_id: 'inv8', user_id: 'u1', repair_date: dayOf(-120), cost: 85, technician: 'Τεχνικός Α', description: 'Αντικατάσταση αντλίας', created_at: dayOf(-120) },
    { id: 'rep1', item_id: 'inv4', user_id: 'u1', repair_date: dayOf(-40), cost: 140, technician: 'Ψυκτικός Β', description: 'Πλήρωση ψυκτικού', created_at: dayOf(-40) },
  );
  handovers.push({
    id: 'ho0', property_id: 'p0', user_id: 'u1', handover_type: 'check_in',
    tenant_name: 'Μισθωτής 1', tenant_phone: '2105550000', handover_date: dayOf(-300),
    notes: null, items_snapshot: INV_SNAPSHOT, created_at: dayOf(-300),
  });

  for (let c = 0; c < 40; c++) clients.push({ id: `c${c}`, full_name: `Πελάτης ${c + 1}` });

  return {
    properties,
    rows: {
      client_stays: stays,
      bills,
      expenses,
      tenants,
      checklist_items: checklist,
      rent_payments: rentPays,
      clients,
      // ═══ ΤΟ ΚΛΕΙΔΙ ΗΤΑΝ «properties» ΚΑΙ Ο ΠΙΝΑΚΑΣ ΛΕΓΕΤΑΙ «user_properties» ═══
      // Μία λέξη· κάθε οθόνη που ρωτούσε για ακίνητα έπαιρνε άδειο. Το
      // lib/data/properties.ts γράφει ρητά `const TABLE = 'user_properties'`.
      // Μετρήθηκε: ο πίνακας ζητήθηκε 19 φορές σε σχεδόν κάθε σκηνή του πάγκου
      // και ΚΑΜΙΑ δεν πήρε γραμμή. Δηλαδή ο σαρωτής διάταξης έβγαινε καθαρός
      // πάνω σε κελύφη, όχι πάνω στην εφαρμογή.
      user_properties: propOwners,
      inventory_items: inventory,
      calendar_events: calendar,
      contacts,
      loans,
      bills_settings: billsSettings,
      property_documents: documents,
      inventory_repairs: repairs,
      inventory_handovers: handovers,
      report_branding: [{ user_id: 'u1', enabled: true, company_name: 'Διαχείριση Ακινήτων ΑΕ', logo_url: null, accent_color: null, phone: '2105550100', email: 'info@example.gr', updated_at: `${YEAR}-01-01` }],
      property_settings: [{ id: 'ps0', property_id: 'p0', user_id: 'u1', owner_name: 'Ιδιοκτήτης Δοκιμών', owner_afm: '099123456', electricity_provider: 'ΔΕΗ', water_provider: 'ΕΥΔΑΠ' }],
      billing_profiles: [{ user_id: 'u1', plan: 'agency', subscription_status: 'active', profile_type: 'professional', legal_form: 'company', full_name: 'Λογαριασμός δοκιμών' }],
      rent_config: rentCfg,
    },
  };
}
