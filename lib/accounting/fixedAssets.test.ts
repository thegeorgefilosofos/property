// npx tsx lib/accounting/fixedAssets.test.ts
import {
  ELP_ASSETS, elpAsset, depreciableBase, monthsInFirstYear, depreciationSchedule,
  chargeForYear, closingValue, missingFor, sortAssets, totalsByAccount,
  RENTED_PROPERTY_ACCOUNT, EQUIPMENT_ACCOUNT, buildRegister, type FixedAsset,
} from './fixedAssets';

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++; else { fail++; console.error(`✗ ${name}\n   got  ${g}\n   want ${w}`); }
};
const ok = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error(`✗ ${name}`); } };

const asset = (over: Partial<FixedAsset> = {}): FixedAsset => ({
  name: 'Διαμέρισμα', elp: '16', cost: 100000, acquired: '2020-01-15', land: 40000, rate: 0.04,
  source: 'Ακίνητο', ...over,
});

// ── ΟΙ ΛΟΓΑΡΙΑΣΜΟΙ ΕΙΝΑΙ ΤΟΥ ΝΟΜΟΥ ─────────────────────────────────────────
// Αντιγραμμένοι από το Παράρτημα Γ του ν.4308/2014. Ένα λάθος εδώ ταξιδεύει
// αυτούσιο στο πρόγραμμα του λογιστή.
eq('πέντε λογαριασμοί παγίων', ELP_ASSETS.length, 5);
eq('η γη', elpAsset('10')?.name, 'Γη');
eq('τα κτήρια, με την ορθογραφία του νόμου', elpAsset('12')?.name, 'Κτήρια - τεχνικά έργα');
eq('ο λοιπός εξοπλισμός', elpAsset('15')?.name, 'Λοιπός εξοπλισμός');
eq('οι επενδύσεις σε ακίνητα', elpAsset('16')?.name, 'Επενδύσεις σε ακίνητα');
eq('άγνωστος κωδικός, κανένα συμπέρασμα', elpAsset('99'), null);

// ══ Η ΓΗ ΔΕΝ ΑΠΟΣΒΕΝΕΤΑΙ, ΚΑΙ Ο ΝΟΜΟΣ ΤΟ ΓΡΑΦΕΙ ΣΤΗ ΔΟΜΗ ΤΟΥ ═══════════════
// Ο 10 έχει 10.01 μικτή αξία και 10.02 σωρευμένες ΑΠΟΜΕΙΩΣΕΙΣ. Δεν υπάρχει
// λογαριασμός σωρευμένων αποσβέσεων γης, γιατί δεν υπάρχουν αποσβέσεις γης.
eq('η γη δεν έχει λογαριασμό αποσβέσεων', elpAsset('10')?.depreciation, null);
eq('έχει όμως απομειώσεις', elpAsset('10')?.impairment, '10.02');
eq('και κανένα έξοδο απόσβεσης', elpAsset('10')?.expense, null);
ok('κάθε άλλο πάγιο έχει και τα τρία',
  ELP_ASSETS.filter(a => a.code !== '10').every(a => a.gross && a.depreciation && a.impairment && a.expense));
// Οι υποδιαιρέσεις ξεκινούν από τον κωδικό τους: το 16.02 δεν μπορεί να ανήκει στο 15.
ok('κάθε υποδιαίρεση ανήκει στον λογαριασμό της',
  ELP_ASSETS.every(a => [a.gross, a.depreciation, a.impairment].filter(Boolean)
    .every(s => String(s).startsWith(`${a.code}.`))));
eq('η απόσβεση των επενδύσεων σε ακίνητα', elpAsset('16')?.expense, '66.06');
eq('και του λοιπού εξοπλισμού', elpAsset('15')?.expense, '66.05');
eq('το εκμισθωμένο ακίνητο είναι επένδυση', RENTED_PROPERTY_ACCOUNT, '16');
eq('ο εξοπλισμός', EQUIPMENT_ACCOUNT, '15');

// ── Η ΒΑΣΗ ΤΗΣ ΑΠΟΣΒΕΣΗΣ ───────────────────────────────────────────────────
eq('το οικόπεδο βγαίνει από τη βάση', depreciableBase(asset()), 60000);
eq('χωρίς οικόπεδο, όλο το κόστος', depreciableBase(asset({ land: 0 })), 100000);
eq('οικόπεδο μεγαλύτερο από το κόστος, μηδέν και όχι αρνητικό',
  depreciableBase(asset({ cost: 10000, land: 50000 })), 0);

// ══ Η ΑΠΟΣΒΕΣΗ ΑΡΧΙΖΕΙ ΑΠΟ ΤΟΝ ΕΠΟΜΕΝΟ ΜΗΝΑ (άρθρο 24 §2) ═══════════════════
eq('αγορά Ιανουαρίου, έντεκα μήνες', monthsInFirstYear('2026-01-31'), 11);
eq('αγορά Ιουνίου, έξι μήνες', monthsInFirstYear('2026-06-01'), 6);
// Ο Δεκέμβριος είναι η περίπτωση που θα περνούσε απαρατήρητη: μηδέν μήνες, όχι
// ένας και σίγουρα όχι δώδεκα.
eq('αγορά Δεκεμβρίου, κανένας μήνας', monthsInFirstYear('2026-12-20'), 0);
eq('άκυρη ημερομηνία, κανένας μήνας', monthsInFirstYear('χθες'), 0);

// ── Ο ΠΙΝΑΚΑΣ ─────────────────────────────────────────────────────────────
{
  const rows = depreciationSchedule(asset({ acquired: '2024-06-10' }), 2026);
  eq('τρεις χρονιές ώς το 2026', rows.map(r => r.year), [2024, 2025, 2026]);
  // 60.000 × 4% = 2.400 τον χρόνο. Το 2024 έξι μήνες: 1.200.
  eq('η πρώτη χρονιά κατά μήνες', rows[0].charge, 1200);
  eq('η δεύτερη ολόκληρη', rows[1].charge, 2400);
  eq('η σωρευμένη αθροίζει', rows[2].accumulated, 6000);
  eq('και η αναπόσβεστη μειώνεται', rows[2].closing, 54000);
  eq('η αρχή της δεύτερης είναι το τέλος της πρώτης', rows[1].opening, rows[0].closing);
  ok('κάθε χρονιά ισοσκελίζει',
    rows.every(r => Math.abs(r.opening - r.charge - r.closing) < 0.005));
}
{
  // ΤΟ ΤΕΛΟΣ ΤΗΣ ΖΩΗΣ ΚΟΒΕΤΑΙ ΣΤΟ ΥΠΟΛΟΙΠΟ, ΚΑΙ Ο ΠΙΝΑΚΑΣ ΣΤΑΜΑΤΑΕΙ ΕΚΕΙ.
  // 1.000 € με 40%: 366,67 τον πρώτο χρόνο (έντεκα μήνες), 400 τον δεύτερο,
  // και ό,τι απομένει τον τρίτο. Καμία τέταρτη γραμμή με μηδενικά.
  const rows = depreciationSchedule(asset({ acquired: '2000-01-15', cost: 1000, land: 0, rate: 0.4 }), 2010);
  eq('σταματά όταν αποσβεστεί', rows.length, 3);
  eq('η πρώτη χρονιά, έντεκα μήνες', rows[0].charge, 366.67);
  eq('η τελευταία χρονιά κόβεται στο υπόλοιπο', rows[2].charge, 233.33);
  eq('και κλείνει στο μηδέν', rows[2].closing, 0);
  ok('καμία αρνητική αξία', rows.every(r => r.closing >= 0));
}
{
  // ΧΩΡΙΣ ΣΥΝΤΕΛΕΣΤΗ ΔΕΝ ΥΠΑΡΧΕΙ ΠΙΝΑΚΑΣ, ΚΑΙ ΔΕΝ ΓΡΑΦΕΤΑΙ ΜΗΔΕΝ. Το μηδέν
  // μοιάζει με απάντηση («δεν αποσβένεται») ενώ η αλήθεια είναι ερώτηση.
  eq('χωρίς συντελεστή', depreciationSchedule(asset({ rate: null }), 2026).length, 0);
  eq('χωρίς ημερομηνία', depreciationSchedule(asset({ acquired: null }), 2026).length, 0);
  eq('χωρίς αξία', depreciationSchedule(asset({ cost: 0 }), 2026).length, 0);
  eq('κτήση μετά τη χρήση', depreciationSchedule(asset({ acquired: '2030-01-01' }), 2026).length, 0);
  eq('και η αναπόσβεστη μένει η βάση', closingValue(asset({ rate: null }), 2026), 60000);
}
{
  eq('η απόσβεση της χρονιάς', chargeForYear(asset({ acquired: '2024-06-10' }), 2025), 2400);
  eq('πριν από την κτήση, μηδέν', chargeForYear(asset({ acquired: '2024-06-10' }), 2023), 0);
  eq('γη ολόκληρη, καμία απόσβεση', chargeForYear(asset({ cost: 40000, land: 40000 }), 2026), 0);
}

// ── ΤΙ ΛΕΙΠΕΙ, ΓΡΑΜΜΕΝΟ ΩΣ ΕΡΩΤΗΣΗ ─────────────────────────────────────────
eq('πλήρες πάγιο, τίποτα', missingFor(asset()), '');
eq('χωρίς αξία', missingFor(asset({ cost: 0 })), 'Λείπει η αξία κτήσης');
eq('χωρίς ημερομηνία', missingFor(asset({ acquired: null })), 'Λείπει η ημερομηνία κτήσης');
eq('χωρίς συντελεστή', missingFor(asset({ rate: null })), 'Λείπει ο συντελεστής απόσβεσης');
eq('σκέτο οικόπεδο', missingFor(asset({ cost: 40000, land: 40000 })), 'Δεν αποσβένεται');

// ── Η ΣΕΙΡΑ ΚΑΙ ΤΑ ΣΥΝΟΛΑ ──────────────────────────────────────────────────
{
  const list: FixedAsset[] = [
    asset({ name: 'Ψυγείο', elp: '15', cost: 600, land: 0, acquired: '2026-03-01', rate: null, source: 'Απογραφή' }),
    asset({ name: 'Διαμέρισμα', elp: '16', acquired: '2024-06-10' }),
    asset({ name: 'Ανακαίνιση', elp: '16', cost: 12000, land: 0, acquired: '2026-02-01', source: 'Δαπάνη' }),
  ];
  const sorted = sortAssets(list);
  eq('πρώτα ο 15, μετά ο 16', sorted.map(a => a.elp), ['15', '16', '16']);
  eq('και μέσα στον λογαριασμό, χρονολογικά', sorted.map(a => a.name), ['Ψυγείο', 'Διαμέρισμα', 'Ανακαίνιση']);
  // Η σειρά δεν επιτρέπεται να εξαρτάται από τη σειρά εισαγωγής.
  eq('ίδια δεδομένα, ίδια σειρά',
    sortAssets([...list].reverse()).map(a => a.name).join(','), sorted.map(a => a.name).join(','));

  const tot = totalsByAccount(list, 2026);
  eq('δύο λογαριασμοί', tot.map(t => t.code), ['15', '16']);
  eq('με τα ονόματα του νόμου', tot[1].name, 'Επενδύσεις σε ακίνητα');
  eq('δύο πάγια στον 16', tot[1].count, 2);
  eq('με άθροισμα αξίας κτήσης', tot[1].cost, 112000);
  // Το ψυγείο δεν έχει συντελεστή: μετράει στο κόστος, όχι στην απόσβεση.
  eq('ο εξοπλισμός χωρίς συντελεστή δεν αποσβένεται', tot[0].charge, 0);
  eq('αλλά η αξία του φαίνεται', tot[0].cost, 600);
  // 2026: διαμέρισμα 2.400 + ανακαίνιση 12.000 × 4% × 10/12 = 400.
  eq('η απόσβεση του 2026', tot[1].charge, 2800);
}

// ── ΤΟ ΜΗΤΡΩΟ ΒΓΑΙΝΕΙ ΜΟΝΟ ΤΟΥ ─────────────────────────────────────────────
// Ο χρήστης δεν συμπληρώνει μητρώο παγίων· καταχωρεί ένα ακίνητο, ανεβάζει τα
// έπιπλά του και γράφει μια ανακαίνιση ως δαπάνη.
{
  const reg = buildRegister({
    property: { name: 'Διαμέρισμα Αθήνα', purchasePrice: 150000, purchaseDate: '2019-04-20', rented: true },
    buildingFraction: 0.6, buildingRate: 0.04,
    inventory: [
      { name: 'Πλυντήριο', category: 'Ηλεκτρικές Συσκευές', purchase_value: 480, purchase_date: '2026-05-10' },
      { name: 'Χωρίς αξία', purchase_value: 0, purchase_date: '2026-01-01' },
    ],
    expenses: [
      { date: '2026-02-01', category: 'Ανακαίνιση', description: 'Μπάνιο', amount: 8000 },
      { date: '2026-03-01', category: 'Ρεύμα', description: 'ΔΕΗ', amount: 90 },
    ],
    capitalisable: { 'Ανακαίνιση': '16', 'Έπιπλα': '15' },
  });
  eq('τρία πάγια, όχι η ΔΕΗ', reg.length, 3);
  eq('ταξινομημένα ανά λογαριασμό', reg.map(a => a.elp), ['15', '16', '16']);

  const flat = reg.find(a => a.elp === '16' && a.source === 'Ακίνητο')!;
  eq('το εκμισθωμένο ακίνητο στον 16', flat.elp, '16');
  eq('με την ΤΙΜΗ ΚΤΗΣΗΣ και όχι εκτίμηση', flat.cost, 150000);
  // Το οικόπεδο δεν αποσβένεται: 40% της τιμής κτήσης μένει έξω από τη βάση.
  eq('το οικόπεδο ξεχωρίζει', flat.land, 60000);
  eq('και αποσβένεται μόνο το κτίσμα', chargeForYear(flat, 2026), 3600);

  const wm = reg.find(a => a.source === 'Απογραφή')!;
  eq('το πλυντήριο στον λοιπό εξοπλισμό', wm.elp, '15');
  // ΤΟ ΚΡΙΣΙΜΟ: ο συντελεστής του εξοπλισμού ΔΕΝ μαντεύεται.
  eq('χωρίς συντελεστή, γιατί δεν τον ξέρουμε', wm.rate, null);
  eq('και το λέει', missingFor(wm), 'Λείπει ο συντελεστής απόσβεσης');

  const ren = reg.find(a => a.source === 'Δαπάνη')!;
  eq('η ανακαίνιση είναι υποψήφια, όχι κριμένη', ren.candidate, true);
  eq('ακολουθεί τον συντελεστή του κτίσματος', ren.rate, 0.04);
  eq('και δεν έχει οικόπεδο μέσα της', ren.land, 0);

  // ΧΩΡΙΣ ΤΙΜΗ ΚΤΗΣΗΣ ΤΟ ΑΚΙΝΗΤΟ ΔΕΝ ΜΠΑΙΝΕΙ ΜΕ ΜΗΔΕΝΙΚΑ. Μια γραμμή «0,00 €»
  // σε μητρώο παγίων διαβάζεται ως «δεν αξίζει τίποτα», όχι ως «δεν ξέρουμε».
  const noPrice = buildRegister({
    property: { name: 'Χωρίς συμβόλαιο', purchasePrice: null, purchaseDate: null, rented: true },
    buildingFraction: 0.6, buildingRate: 0.04, capitalisable: {},
  });
  eq('χωρίς τιμή κτήσης, καμία γραμμή ακινήτου', noPrice.length, 0);

  // Ιδιοχρησιμοποιούμενο: 12 «Κτήρια», όχι 16 «Επενδύσεις σε ακίνητα».
  const own = buildRegister({
    property: { name: 'Κατοικία', purchasePrice: 100000, purchaseDate: '2020-01-01', rented: false },
    buildingFraction: 0.6, buildingRate: 0.04, capitalisable: {},
  });
  eq('το ιδιοχρησιμοποιούμενο στον 12', own[0].elp, '12');
}

console.log(fail === 0 ? `✓ fixedAssets: ${pass} έλεγχοι πέρασαν` : `✗ fixedAssets: ${fail} απέτυχαν από ${pass + fail}`);
if (fail > 0) process.exit(1);
