// ═══════════════════════════════════════════════════════════════════════════
// Ο ΚΑΤΑΛΟΓΟΣ ΤΙΜΟΛΟΓΙΩΝ ΦΥΣΙΚΟΥ ΑΕΡΙΟΥ, ΑΠΟ ΤΗ ΡΑΑΕΥ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΑΝΤΙΚΑΤΕΣΤΗΣΕ, ΚΑΙ ΓΙΑΤΙ ΗΤΑΝ ΕΠΕΙΓΟΝ. Ο προηγούμενος κατάλογος ζούσε
// μέσα στο `BillsGas.tsx` με 23 τιμολόγια. Μετρήθηκε γραμμή προς γραμμή απέναντι
// στον επίσημο πίνακα της ΡΑΑΕΥ και βρέθηκαν τρία διαφορετικά σφάλματα:
//
//   1. ΤΙΜΕΣ 30 ΕΩΣ 40% ΧΑΜΗΛΟΤΕΡΕΣ. «Αέριο Οικιακό Πλήρες» 0,0420 έναντι
//      0,06879 €/kWh, «Κουζίνα» 0,0450 έναντι 0,06879. Σε 1.200 kWh τον μήνα η
//      οθόνη υποσχόταν λογαριασμό μικρότερο κατά 32 € από τον πραγματικό.
//   2. ΟΝΟΜΑΤΑ ΠΡΟΪΟΝΤΩΝ ΠΟΥ ΔΕΝ ΥΠΑΡΧΟΥΝ. «ΗΡΩΝ Gas Σταθερό», «myHome Φυσικό
//      αέριο», «Gas Home Flex»: κανένα δεν βρίσκεται στον κατάλογο της Αρχής.
//      Ο ιδιοκτήτης θα ζητούσε από τον πάροχο τιμολόγιο με ανύπαρκτο όνομα.
//   3. ΨΕΥΔΗΣ ΣΗΜΑΝΣΗ ΕΠΑΛΗΘΕΥΣΗΣ. Το `fae_extra` έφερε `priceStatus: 'verified'`
//      ενώ απείχε 40% από την πραγματική τιμή. Η σήμανση αξιοπιστίας έλεγε ψέματα
//      ακριβώς εκεί που ο χρήστης την κοιτούσε για να εμπιστευτεί τον αριθμό.
//
// Η ΠΗΓΗ. Το εργαλείο σύγκρισης τιμών της ΡΑΑΕΥ (energycost.gr), κατάσταση
// Αυγούστου 2026, οικιακά και επαγγελματικά τιμολόγια αερίου. Η ίδια η Αρχή
// δηλώνει: «Ολες οι αναρτημένες τιμές έχουν ελεγχθεί από τη ΡΑΑΕΥ».
//
// ΤΙ ΑΚΡΙΒΩΣ ΕΙΝΑΙ Ο ΑΡΙΘΜΟΣ ΠΟΥ ΑΠΟΘΗΚΕΥΕΤΑΙ. Μόνο η ΧΡΕΩΣΗ ΠΡΟΜΗΘΕΙΑΣ, το
// ανταγωνιστικό σκέλος. Μετρήθηκε: η στήλη «Τελική Μηνιαία Χρέωση» της ΡΑΑΕΥ
// ισούται ακριβώς με `πάγιο + τιμή × kWh` σε 38 από 38 οικιακά τιμολόγια και σε
// 14 από 14 επαγγελματικά. Αρα δεν περιέχει ούτε ρυθμιζόμενες χρεώσεις δικτύου,
// ούτε ΕΦΚ, ούτε ΦΠΑ 6%: ο πραγματικός λογαριασμός βγαίνει αισθητά υψηλότερος
// και η οθόνη το λέει ρητά.
//
// ΤΟ `raaey100` ΕΙΝΑΙ Η ΑΠΟΔΕΙΞΗ ΤΗΣ ΜΕΤΑΓΡΑΦΗΣ. Κάθε γραμμή κουβαλά το σύνολο
// που δημοσιεύει η ΡΑΑΕΥ για 100 kWh. Το `gas.test.ts` ξαναφτιάχνει τον αριθμό
// από το πάγιο και την τιμή: ένα λάθος ψηφίο σε οποιαδήποτε από τις 57 γραμμές
// ρίχνει τον έλεγχο αμέσως, αντί να ζήσει σιωπηλά στην οθόνη ενός ιδιοκτήτη.
//
// ΓΙΑΤΙ ΕΦΥΓΕ Η ΣΗΜΑΝΣΗ ΑΞΙΟΠΙΣΤΙΑΣ ΑΝΑ ΤΙΜΗ. Και οι 57 γραμμές προέρχονται από
// την ίδια λήψη της ίδιας ημέρας. Τρεις διαφορετικές ετικέτες πάνω σε ταυτόσημης
// προέλευσης δεδομένα δεν πρόσθεταν πληροφορία, πρόσθεταν θόρυβο. Η ημερομηνία
// λέγεται μία φορά, στην κεφαλίδα της οθόνης.
//
// ΓΙΑΤΙ ΕΦΥΓΕ Ο ΤΥΠΟΣ TTF. Τρία τιμολόγια nrg υπολογίζονταν από
// `πολλαπλασιαστής × TTF + περιθώριο`, με προεπιλεγμένο TTF 33 €/MWh. Η ΡΑΑΕΥ
// δημοσιεύει την πραγματική τιμή του μήνα για τα ίδια ακριβώς τιμολόγια: το
// 0,06707 €/kWh του `nrg on time GAS` αντιστοιχεί σε TTF περίπου 49,5 €/MWh.
// Με την προεπιλογή των 33 η οθόνη έβγαζε 0,0489, δηλαδή 27% χαμηλότερα·
// κατέτασσε το τιμολόγιο ψηλότερα από όσο του αναλογεί. Ενας υπολογισμός που
// διαφωνεί με τη δημοσιευμένη τιμή του ίδιου προϊόντος δεν είναι διαφάνεια.
// ═══════════════════════════════════════════════════════════════════════════

/** Ημέρα λήψης του καταλόγου από τη ΡΑΑΕΥ. Ζευγάρι με το data/price-sources.json. */
export const GAS_VERIFIED = '2026-08-31';
/** Πώς λέγεται η ίδια ημέρα στην οθόνη. */
export const GAS_LABEL = 'Αύγουστος 2026';
/** Κατώφλι παλαιότητας: τα τιμολόγια αερίου ανακοινώνονται μηνιαία. */
export const GAS_MAX_AGE_DAYS = 40;

export interface GasTariff {
  id: string;
  name: string;
  /** ΜΠΛΕ: σταθερή τιμή για τη διάρκεια. ΚΙΤΡΙΝΟ: κυμαινόμενη, αναθεωρείται μηνιαία. */
  badge: 'ΜΠΛΕ' | 'ΚΙΤΡΙΝΟ';
  type: 'fixed' | 'variable';
  segment: 'residential' | 'business';
  /** Χρέωση προμήθειας €/kWh, όπως τη δημοσιεύει η ΡΑΑΕΥ. */
  kwh: number;
  /** Μηνιαίο πάγιο €. */
  fixed: number;
  /** Διάρκεια δέσμευσης σε μήνες, όπου ορίζεται. */
  contract_months?: number;
  /** Το σύνολο της ΡΑΑΕΥ στις 100 kWh. Υπάρχει για να ελέγχεται η μεταγραφή. */
  raaey100: number;
  /**
   * Η σημείωση της ΡΑΑΕΥ για το τιμολόγιο, αυτούσια.
   *
   * ΠΡΟΑΙΡΕΤΙΚΗ ΕΠΙΤΗΔΕΣ. Εξι από τα 57 τιμολόγια δεν φέρουν σημείωση στον
   * πίνακα της Αρχής. Η πρώτη εκδοχή απαιτούσε πεδίο πάντα, οπότε θα έπρεπε να
   * γραφτεί κείμενο που δεν υπάρχει σε καμία πηγή. Η οθόνη δείχνει τη γραμμή
   * μόνο όταν υπάρχει κάτι να ειπωθεί.
   */
  desc?: string;
}

export interface GasProvider {
  value: string;
  label: string;
  url: string;
  tariffs: GasTariff[];
}

// ── Διαχειριστές δικτύου ανά περιοχή ─────────────────────────────────────────
// Το δίκτυο δεν αλλάζει με τον πάροχο: μπαίνει εδώ γιατί είναι σταθερό δεδομένο
// της χώρας, όχι επιλογή της οθόνης.
export const NETWORK_OPERATORS = [
  { value: 'eda_attikis', label: 'ΕΔΑ Αττικής', region: 'Αττική', url: 'https://www.edaattikis.gr' },
  { value: 'eda_thess',   label: 'ΕΔΑ ΘΕΣΣ',    region: 'Θεσσαλονίκη / Θεσσαλία', url: 'https://www.edathess.gr' },
  { value: 'deda',        label: 'ΔΕΔΑ',        region: 'Λοιπή Ελλάδα', url: 'https://deda.gr' },
];

export const GAS_PROVIDERS: GasProvider[] = [
  {
    value: 'nrg', label: 'nrg (Motor Oil)', url: 'https://www.nrg.gr',
    tariffs: [
      { id: 'nrg_ontime', name: 'nrg on time GAS', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', segment: 'residential',
        kwh: 0.06707, fixed: 1.8, raaey100: 8.51,
        desc: 'Πάγιο 1,80 € με ebill και πάγια εντολή. Έκπτωση συνέπειας και συνδυασμού με ρεύμα nrg.' },
      { id: 'nrg_adapt', name: 'nrg adapt GAS', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', segment: 'residential',
        kwh: 0.06837, fixed: 1.8, raaey100: 8.64,
        desc: 'Οριζόντια έκπτωση και έκπτωση συνδυασμού με ρεύμα nrg.' },
      { id: 'nrg_prime', name: 'nrg prime GAS', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', segment: 'residential',
        kwh: 0.06767, fixed: 2.5, raaey100: 9.27,
        desc: 'Πάγιο 2,50 € με ebill και πάγια εντολή.' },
      { id: 'nrg_ontime_biz', name: 'nrg on time GAS 4BUSINESS', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', segment: 'business',
        kwh: 0.06527, fixed: 0, raaey100: 6.53,
        desc: 'Μηδενικό πάγιο με ebill και πάγια εντολή.' },
      { id: 'nrg_adapt_biz', name: 'nrg adapt GAS 4BUSINESS', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', segment: 'business',
        kwh: 0.06617, fixed: 0, raaey100: 6.62,
        desc: 'Μηδενικό πάγιο με ebill και πάγια εντολή.' },
      { id: 'nrg_prime_biz', name: 'nrg prime GAS 4BUSINESS', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', segment: 'business',
        kwh: 0.06767, fixed: 4.0, raaey100: 10.77,
        desc: 'Πάγιο 4,00 € με ebill και πάγια εντολή.' },
    ],
  },
  {
    value: 'zenith', label: 'ZeniΘ', url: 'https://zenith.gr/el/for-the-home/gas/',
    tariffs: [
      { id: 'zen_central_easy', name: 'Gas Central Easy', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.06928, fixed: 0, contract_months: 24, raaey100: 6.93,
        desc: 'Κεντρική θέρμανση πολυκατοικίας. Χωρίς πάγιο.' },
      { id: 'zen_central_save', name: 'Gas Central Save', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.0798, fixed: 0, contract_months: 12, raaey100: 7.98,
        desc: 'Κεντρική θέρμανση πολυκατοικίας. Χωρίς πάγιο.' },
      { id: 'zen_home_now', name: 'Gas Home Now', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.06872, fixed: 4.0, contract_months: 12, raaey100: 10.87,
        desc: 'Πάγιο 4,00 € με Dual Energy.' },
      { id: 'zen_home_pulse', name: 'Gas Home Pulse', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.07315, fixed: 4.5, contract_months: 12, raaey100: 11.82,
        desc: 'Αυτόνομη θέρμανση.' },
      { id: 'zen_home_save', name: 'Gas Home Save', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.0798, fixed: 4.5, contract_months: 12, raaey100: 12.48,
        desc: 'Αυτόνομη θέρμανση.' },
      { id: 'zen_home_pair', name: 'Gas Home Pair', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.049, fixed: 9.9, contract_months: 12, raaey100: 14.8,
        desc: 'Έκπτωση Dual Energy με παράλληλη σύνδεση ρεύματος. Δώρο τρία πάγια.' },
      { id: 'zen_biz_easy2', name: 'Gas Business Easy 2', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'business',
        kwh: 0.06928, fixed: 0, contract_months: 24, raaey100: 6.93,
        desc: 'Χωρίς πάγιο.' },
      { id: 'zen_biz_save_p', name: 'Gas Business Save +', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'business',
        kwh: 0.0798, fixed: 0, contract_months: 12, raaey100: 7.98,
        desc: 'Χωρίς πάγιο.' },
      { id: 'zen_biz_easy1', name: 'Gas Business Easy 1', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'business',
        kwh: 0.06676, fixed: 5.0, contract_months: 24, raaey100: 11.68 },
      { id: 'zen_biz_save', name: 'Gas Business Save', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'business',
        kwh: 0.0798, fixed: 4.5, contract_months: 12, raaey100: 12.48 },
    ],
  },
  {
    value: 'elin', label: 'ελίν (ΕΛΙΝΟΙΛ)', url: 'https://energy.elin.gr',
    tariffs: [
      { id: 'elin_home_easy', name: 'Gas On! Home Easy', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.05634, fixed: 4.5, contract_months: 12, raaey100: 10.13,
        desc: 'Αυτόνομη θέρμανση.' },
      { id: 'elin_koin_easy', name: 'Gas On! Κοινόχρηστο Easy', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.05634, fixed: 5.0, contract_months: 12, raaey100: 10.63,
        desc: 'Κεντρική θέρμανση πολυκατοικίας.' },
      { id: 'elin_f12_dual', name: 'Gas On! Fixed 12M Αυτόνομη Θέρμανση Dual', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.0589, fixed: 4.9, contract_months: 12, raaey100: 10.79,
        desc: 'Συνδυαστικό με ρεύμα.' },
      { id: 'elin_relax', name: 'Gas On! Relax', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.05734, fixed: 6.0, contract_months: 12, raaey100: 11.73 },
      { id: 'elin_f12', name: 'Gas On! Fixed 12M Αυτόνομη Θέρμανση', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.0589, fixed: 9.9, contract_months: 12, raaey100: 15.79 },
      { id: 'elin_biz_easy', name: 'Gas On! Business Easy', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'business',
        kwh: 0.05634, fixed: 5.0, contract_months: 12, raaey100: 10.63 },
    ],
  },
  {
    value: 'fysiko_aerio', label: 'Φυσικό αέριο ΕΕΕ (ΔΕΠΑ)', url: 'https://fysikoaerioellados.gr',
    tariffs: [
      { id: 'fae_pliris', name: 'Αέριο Οικιακό Πλήρες', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.06879, fixed: 0, contract_months: 12, raaey100: 6.88,
        desc: 'Χωρίς πάγιο.' },
      { id: 'fae_kouzina', name: 'Αέριο Οικιακό Κουζίνα', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.06879, fixed: 0, contract_months: 12, raaey100: 6.88,
        desc: 'Χωρίς πάγιο. Για χρήση κουζίνας και ζεστού νερού.' },
      { id: 'fae_extra', name: 'Αέριο Οικιακό Πλήρες Extra', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.06279, fixed: 4.5, contract_months: 24, raaey100: 10.78,
        desc: 'Πολιτική ορθής χρήσης: έως 13 MWh ανά δωδεκάμηνο.' },
      { id: 'fae_biz', name: 'Αέριο Επαγγελματικό', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'business',
        kwh: 0.06579, fixed: 0, contract_months: 12, raaey100: 6.58,
        desc: 'Χωρίς πάγιο.' },
    ],
  },
  {
    value: 'dei', label: 'ΔΕΗ', url: 'https://www.dei.gr',
    tariffs: [
      { id: 'dei_gas_bld_benefit', name: 'myBuildingGasBenefit', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.06294, fixed: 0, contract_months: 24, raaey100: 6.29,
        desc: 'Κεντρική θέρμανση πολυκατοικίας. Χωρίς πάγιο.' },
      { id: 'dei_gas_bld_control', name: 'myΒuildingGasControl', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.049, fixed: 5.0, contract_months: 12, raaey100: 9.9,
        desc: 'Κεντρική θέρμανση πολυκατοικίας.' },
      { id: 'dei_gas_benefit', name: 'myHomeGasBenefit', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.05894, fixed: 5.0, contract_months: 24, raaey100: 10.89,
        desc: 'Αυτόνομη θέρμανση.' },
      { id: 'dei_gas_control', name: 'myHomeGasControl', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.042, fixed: 7.0, contract_months: 12, raaey100: 11.2,
        desc: 'Αυτόνομη θέρμανση. Η χαμηλότερη τιμή ενέργειας του καταλόγου, με υψηλότερο πάγιο.' },
      { id: 'dei_gas_biz', name: 'myBusinessGasBenefit', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'business',
        kwh: 0.06387, fixed: 5.0, contract_months: 24, raaey100: 11.39 },
    ],
  },
  {
    value: 'protergia', label: 'Protergia (Metlen)', url: 'https://www.protergia.gr',
    tariffs: [
      { id: 'prot_auton_plus', name: 'Οικιακό Αυτόνομο Plus', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.06334, fixed: 1.0, contract_months: 24, raaey100: 7.33,
        desc: 'Δώρο τα τρία πρώτα πάγια.' },
      { id: 'prot_koin_plus', name: 'Οικιακό Κοινόχρηστο Plus', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.06334, fixed: 1.0, contract_months: 24, raaey100: 7.33,
        desc: 'Κεντρική θέρμανση. Δώρο τα τρία πρώτα πάγια.' },
      { id: 'prot_auton_double', name: 'Οικιακό Αυτόνομο Double Value', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.05634, fixed: 5.0, contract_months: 24, raaey100: 10.63,
        desc: 'Έκπτωση Value 0,007 €/kWh. Δώρο τα τρία πρώτα πάγια.' },
      { id: 'prot_auton_single', name: 'Οικιακό Αυτόνομο Single Value', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.05834, fixed: 5.0, contract_months: 24, raaey100: 10.83,
        desc: 'Έκπτωση Value 0,005 €/kWh. Δώρο τα τρία πρώτα πάγια.' },
      { id: 'prot_gas_sure', name: 'Οικιακό Αυτόνομο Value Gas Sure', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.0399, fixed: 9.9, contract_months: 12, raaey100: 13.89,
        desc: 'Έκπτωση Power και Gas. Δωρεάν πάγιο Ιούνιο, Ιούλιο και Αύγουστο.' },
      { id: 'prot_biz_plus', name: 'Εμπορικό Plus', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'business',
        kwh: 0.06334, fixed: 1.0, contract_months: 24, raaey100: 7.33,
        desc: 'Δώρο τα τρία πρώτα πάγια.' },
      { id: 'prot_biz_double', name: 'Εμπορικό Double Reward', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'business',
        kwh: 0.05634, fixed: 5.0, contract_months: 24, raaey100: 10.63,
        desc: 'Έκπτωση συνέπειας 0,007 €/kWh.' },
    ],
  },
  {
    value: 'heron', label: 'ΗΡΩΝ', url: 'https://www.heron.gr',
    tariffs: [
      { id: 'heron_gas_share', name: 'GAS MAX SHARE', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.04571, fixed: 0, raaey100: 4.57,
        desc: 'Κεντρική θέρμανση πολυκατοικίας. Χωρίς πάγιο. Επιπλέον 5% δώρο παραμονής.' },
      { id: 'heron_gas_pass', name: 'GAS PASS', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.04718, fixed: 3.4, raaey100: 8.12,
        desc: 'Δώρο τα πάγια τους καλοκαιρινούς μήνες. Επιπλέον 5% δώρο παραμονής.' },
      { id: 'heron_gas_max_home', name: 'GAS MAX HOME 2', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.0401, fixed: 4.3, raaey100: 8.31,
        desc: 'Η χαμηλότερη τιμή ενέργειας για αυτόνομη θέρμανση. Δώρο τα πάγια τους καλοκαιρινούς μήνες.' },
      { id: 'heron_gas_blue_max', name: 'GAS BLUE MAX HOME', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.0398, fixed: 7.4, contract_months: 18, raaey100: 11.38,
        desc: 'Δεκαοκτάμηνη ισχύς σύμβασης.' },
      { id: 'heron_gas_biz', name: 'GAS MAX BUSINESS', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'business',
        kwh: 0.05311, fixed: 0, raaey100: 5.31,
        desc: 'Χωρίς πάγιο. Επιπλέον 5% δώρο παραμονής.' },
    ],
  },
  {
    value: 'enerwave', label: 'enerwave (πρώην Elpedison)', url: 'https://www.enerwave.gr',
    tariffs: [
      { id: 'enw_bld_win', name: 'GasBuilding Win', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.06367, fixed: 0, contract_months: 24, raaey100: 6.37,
        desc: 'Κεντρική θέρμανση πολυκατοικίας. Χωρίς πάγιο.' },
      { id: 'enw_home_win', name: 'GasHome Win', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.06007, fixed: 4.9, contract_months: 24, raaey100: 10.91,
        desc: 'Έκπτωση Double Energy 10%.' },
      { id: 'enw_bright_up', name: 'GasHome Bright Up', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.0449, fixed: 9.9, contract_months: 12, raaey100: 14.39,
        desc: 'Έκπτωση Double Energy 10%.' },
      { id: 'enw_biz_win', name: 'GasBusiness Win', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'business',
        kwh: 0.06367, fixed: 0, contract_months: 24, raaey100: 6.37,
        desc: 'Έκπτωση Double Energy 10%. Χωρίς πάγιο.' },
    ],
  },
  {
    value: 'efa', label: 'EFA ENERGY', url: 'https://www.efaenergy.gr',
    tariffs: [
      { id: 'efa_go_central', name: 'GO GAS EXTRA CENTRAL', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.0609, fixed: 0, contract_months: 24, raaey100: 6.09,
        desc: 'Οικιακές κοινόχρηστες συνδέσεις. Εγγύηση 0 € με πάγια εντολή.' },
      { id: 'efa_plus_central', name: 'PLUS GAS EXTRA CENTRAL', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', segment: 'residential',
        kwh: 0.07289, fixed: 0, contract_months: 24, raaey100: 7.29,
        desc: 'Οικιακές κοινόχρηστες. Περιλαμβάνει αναπροσαρμογή TTF. Έκπτωση συνέπειας 40%.' },
      { id: 'efa_go_home', name: 'GO GAS EXTRA HOME', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.0599, fixed: 4.96, contract_months: 24, raaey100: 10.95,
        desc: 'Οικιακές αυτόνομες συνδέσεις. Εγγύηση 0 € με πάγια εντολή.' },
      { id: 'efa_plus_home', name: 'PLUS GAS EXTRA HOME', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', segment: 'residential',
        kwh: 0.06809, fixed: 5.0, contract_months: 24, raaey100: 11.81,
        desc: 'Οικιακές αυτόνομες. Περιλαμβάνει αναπροσαρμογή TTF. Έκπτωση συνέπειας 40%.' },
      { id: 'efa_my_gas', name: 'MY GAS HOME', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.0539, fixed: 8.33, contract_months: 12, raaey100: 13.72,
        desc: 'Το πάγιο είναι ο μηνιαίος επιμερισμός ετήσιας συνδρομής 100 €.' },
      { id: 'efa_go_biz', name: 'GO GAS EXTRA BUSINESS', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'business',
        kwh: 0.0599, fixed: 0, contract_months: 24, raaey100: 5.99,
        desc: 'Επαγγελματικές παροχές. Χωρίς πάγιο.' },
      { id: 'efa_plus_biz', name: 'PLUS GAS EXTRA BUSINESS', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', segment: 'business',
        kwh: 0.07289, fixed: 0, contract_months: 24, raaey100: 7.29,
        desc: 'Περιλαμβάνει αναπροσαρμογή TTF. Έκπτωση συνέπειας 40%.' },
    ],
  },
  {
    value: 'volton', label: 'Volton', url: 'https://volton.gr',
    tariffs: [
      { id: 'vol_stay_home', name: 'Volton Stay & Win v2 | Αυτόνομες', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.08699, fixed: 6.9, contract_months: 24, raaey100: 15.6,
        desc: 'Έκπτωση συνέπειας στο περιθώριο εμπορίας. Τμηματική πίστωση 100 € τον πρώτο χρόνο.' },
      { id: 'vol_stay_koin', name: 'Volton Stay & Win v2 | Κοινόχρηστες', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential',
        kwh: 0.08699, fixed: 8.9, contract_months: 24, raaey100: 17.6,
        desc: 'Κεντρική θέρμανση. Τμηματική πίστωση 150 € τον πρώτο χρόνο.' },
      { id: 'vol_stay_biz', name: 'Volton Stay & Win v2 | Επαγγελματικές', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'business',
        kwh: 0.08699, fixed: 6.9, contract_months: 24, raaey100: 15.6,
        desc: 'Έκπτωση συνέπειας 40% στο περιθώριο εμπορίας.' },
    ],
  },
];
