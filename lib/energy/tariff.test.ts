// npx tsx lib/energy/tariff.test.ts
import { ALL_TARIFFS, COMPARABLE_TARIFFS, FLAT_WITHOUT_ALLOWANCE } from './catalogue';
import {
  monthlyCost, compareTariffs, estimateUsage, waterMonthly, waterMonthlyText,
  ETMEAR, type Tariff, type Usage,
} from './tariff';

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; } else { fail++; console.error(`✗ ${name}\n   got  ${g}\n   want ${w}`); }
}
function near(name: string, got: number, want: number, tol = 0.011) {
  if (Math.abs(got - want) <= tol) { pass++; } else { fail++; console.error(`✗ ${name}\n   got  ${got}\n   want ${want} (±${tol})`); }
}
function ok(name: string, cond: boolean) {
  if (cond) { pass++; } else { fail++; console.error(`✗ ${name}`); }
}

// ΟΧΙ «use»: ο linter το περνά για το React hook `use` και μπλοκάρει το αρχείο.
const consumes = (kwhMonthly: number, extra: Partial<Usage> = {}): Usage =>
  ({ kwhMonthly, nightPct: 30, ebill: false, ...extra });

// ── ΑΠΛΟ ΣΤΑΘΕΡΟ ───────────────────────────────────────────────────────────
const simple: Tariff = {
  id: 'simple', name: 'Απλό', badge: 'ΜΠΛΕ', type: 'fixed',
  kwh_day: 0.145, fixed: 5, vat: 6, segment: 'residential',
};
{
  const c = monthlyCost(simple, consumes(300));
  near('ενέργεια + πάγιο', c.supply, 5 + 300 * 0.145);
  // ΗΤΑΝ `300 * (ERT + ETMEAR)`: ο έλεγχος ξαναέγραφε τον τύπο αντί να πει το
  // αποτέλεσμα, οπότε θα έμενε πράσινος με οποιονδήποτε συντελεστή — ακόμη και
  // με τον επινοημένο που έφυγε. Τώρα λέει το ποσό.
  // 300 × 0,017 = 5,10 — ακριβώς το νούμερο που δίνουν οι δημοσιευμένοι οδηγοί
  // για νοικοκυριό 300 kWh τον μήνα. Ο έλεγχος λέει το ΠΟΣΟ, όχι τον τύπο:
  // ξαναγράφοντας τον τύπο θα έμενε πράσινος με οποιονδήποτε συντελεστή.
  near('ρυθμιζόμενα: 300 kWh επί το ΕΤΜΕΑΡ', c.regulated, 5.10);
  near('ΦΠΑ 6%', c.vat, (c.supply + c.regulated) * 0.06);
  near('σύνολο', c.total, c.supply + c.regulated + c.vat);
  eq('δεν είναι χειροκίνητο', c.manual, false);
}
{
  // ═══ Ο ΕΛΕΓΧΟΣ ΠΟΥ ΚΡΑΤΟΥΣΕ ΤΟ ΣΦΑΛΜΑ ΖΩΝΤΑΝΟ ════════════════════════════
  // Εδώ έγραφε «Ο ΦΠΑ ΔΙΑΦΕΡΕΙ: 24% στα επαγγελματικά» και το επιβεβαίωνε με
  // δικό του τιμολόγιο στα 24. Δηλαδή ο έλεγχος ΔΕΝ επαλήθευε τον κανόνα, τον
  // ΔΗΛΩΝΕ — και μάλιστα λάθος. Ο υπερμειωμένος συντελεστής της ενέργειας
  // κρίνεται από το ΑΓΑΘΟ, όχι από τον πελάτη: 6% σε ρεύμα και αέριο, οικιακά
  // και επαγγελματικά, βάσει του Κώδικα ΦΠΑ. Η επιχείρηση δεν πληρώνει
  // άλλον συντελεστή· απλώς εκπίπτει τον φόρο ως εισροή.
  //
  // Ο κατάλογος αυτοαναιρούνταν: τα επαγγελματικά της ΔΕΗ έγραφαν 6, όλων των
  // άλλων 24· κανένας έλεγχος δεν το έπιασε επειδή κανείς δεν ρώτησε αν οι
  // δύο μερίδες συμφωνούν.
  let mismatched = '';
  for (const t of ALL_TARIFFS()) if (t.vat !== 6) mismatched = `${t.id}: ${t.vat}`;
  eq('κανένα τιμολόγιο εκτός του 6%', mismatched, '');

  const biz: Tariff = { ...simple, id: 'biz', segment: 'business' };
  const c = monthlyCost(biz, consumes(300));
  near('ο ΦΠΑ βγαίνει στο 6%', c.vat, (c.supply + c.regulated) * 0.06);
  near('και είναι ο ίδιος με το ίδιο οικιακό', c.total, monthlyCost(simple, consumes(300)).total);
}

// ── ΗΛΕΚΤΡΟΝΙΚΟΣ ΛΟΓΑΡΙΑΣΜΟΣ ───────────────────────────────────────────────
// Η σύγκριση έπαιρνε ΠΑΝΤΑ την εκπτωτική τιμή, ακόμη κι όταν ο χρήστης είχε
// δηλώσει ότι δεν έχει e-bill: υποσχόταν έκπτωση που δεν δικαιούται.
{
  const t: Tariff = { ...simple, id: 'eb', fixed: 9, fixed_ebill: 3.5 };
  const withEbill = monthlyCost(t, consumes(300, { ebill: true }));
  const without = monthlyCost(t, consumes(300, { ebill: false }));
  near('χωρίς e-bill πληρώνει το κανονικό πάγιο', without.supply, 9 + 300 * 0.145);
  near('με e-bill πληρώνει το εκπτωτικό', withEbill.supply, 3.5 + 300 * 0.145);
  ok('το e-bill είναι φθηνότερο', withEbill.total < without.total);
}
{
  // Χωρίς εκπτωτικό πάγιο, η δήλωση e-bill δεν αλλάζει τίποτα.
  const t: Tariff = { ...simple, id: 'nb', fixed: 7, fixed_ebill: null };
  eq('χωρίς εκπτωτικό πάγιο το e-bill δεν αλλάζει τιμή',
    monthlyCost(t, consumes(300, { ebill: true })).total,
    monthlyCost(t, consumes(300, { ebill: false })).total);
}

// ── ΚΛΙΜΑΚΩΤΑ: ΤΟ ΣΦΑΛΜΑ ΤΗΣ ΔΙΠΛΗΣ ΧΡΕΩΣΗΣ ───────────────────────────────
// Ο παλιός τύπος χρέωνε ΟΛΕΣ τις κιλοβατώρες με την πρώτη κλίμακα και ΜΕΤΑ
// πρόσθετε ξανά όσες ξεπερνούσαν το όριο με τη δεύτερη.
{
  const tier: Tariff = {
    id: 'tier', name: 'Κλιμακωτό', badge: 'ΜΠΛΕ', type: 'fixed',
    kwh_day: 0.141, kwh_tier2: 0.129, tier2_threshold: 600, fixed: 5, vat: 6,
  };
  const c = monthlyCost(tier, consumes(800));
  near('600 στην πρώτη, 200 στη δεύτερη', c.supply, 5 + 600 * 0.141 + 200 * 0.129);
  const wrong = 5 + 800 * 0.141 + 200 * 0.129;
  ok('δεν χρεώνει δύο φορές τις πάνω από το όριο', Math.abs(c.supply - wrong) > 20);

  // Κάτω από το όριο, καμία δεύτερη κλίμακα.
  near('κάτω από το όριο μόνο η πρώτη', monthlyCost(tier, consumes(400)).supply, 5 + 400 * 0.141);
  // Ακριβώς στο όριο.
  near('ακριβώς στο όριο', monthlyCost(tier, consumes(600)).supply, 5 + 600 * 0.141);
}
{
  // Ανάποδη κλίμακα (η δεύτερη ΑΚΡΙΒΟΤΕΡΗ), όπως στα «4All».
  const t: Tariff = {
    id: 'up', name: 'Ανάποδο', badge: 'ΚΙΤΡΙΝΟ', type: 'variable',
    kwh_day: 0.137, kwh_tier2: 0.187, tier2_threshold: 500, fixed: 5, vat: 6,
  };
  near('ακριβότερη δεύτερη κλίμακα', monthlyCost(t, consumes(700)).supply, 5 + 500 * 0.137 + 200 * 0.187);
}

// ── ΝΥΧΤΕΡΙΝΗ ΖΩΝΗ ─────────────────────────────────────────────────────────
{
  const night: Tariff = {
    id: 'night', name: 'Νυχτερινό', badge: 'ΜΠΛΕ', type: 'fixed',
    kwh_day: 0.145, kwh_night: 0.095, fixed: 9, vat: 6,
  };
  const c = monthlyCost(night, consumes(400, { nightPct: 30 }));
  near('280 μέρα, 120 νύχτα', c.supply, 9 + 280 * 0.145 + 120 * 0.095);
  // Στο 0% νύχτα, ταυτίζεται με απλό ημερήσιο.
  near('χωρίς νυχτερινή χρήση', monthlyCost(night, consumes(400, { nightPct: 0 })).supply, 9 + 400 * 0.145);
  // Στο 100%, όλα με τη νυχτερινή.
  near('όλα τη νύχτα', monthlyCost(night, consumes(400, { nightPct: 100 })).supply, 9 + 400 * 0.095);
  ok('η νυχτερινή ζώνη συμφέρει όσο μεγαλώνει το νυχτερινό ποσοστό',
    monthlyCost(night, consumes(400, { nightPct: 60 })).total < monthlyCost(night, consumes(400, { nightPct: 10 })).total);
}
{
  // Τιμολόγιο χωρίς νυχτερινή τιμή: όλες οι κιλοβατώρες με την ημερήσια,
  // ό,τι κι αν δηλώσει ο χρήστης για νυχτερινή χρήση.
  eq('χωρίς νυχτερινή τιμή το ποσοστό δεν μετράει',
    monthlyCost(simple, consumes(400, { nightPct: 80 })).supply,
    monthlyCost(simple, consumes(400, { nightPct: 0 })).supply);
}

// ── ΠΑΚΕΤΑ «ΟΛΑ ΜΕΣΑ» ──────────────────────────────────────────────────────
{
  const flat: Tariff = {
    id: 'flat', name: 'Πακέτο', badge: 'ΜΠΛΕ', type: 'fixed_monthly',
    kwh_day: 0, flat_monthly: 60, flat_annual_kwh: 3600, flat_overage_rate: 0.15,
    fixed: 0, vat: 6,
  };
  eq('μέσα στο όριο, σκέτο το πακέτο', monthlyCost(flat, consumes(280)).overage, 0);
  eq('η ανοχή 5% δεν χρεώνεται', monthlyCost(flat, consumes(315)).overage, 0);   // 3780 < 3780
  {
    const c = monthlyCost(flat, consumes(400));                                   // 4800 ετησίως
    near('υπέρβαση πάνω από την ανοχή', c.overage, ((4800 - 3780) * 0.15) / 12);
    ok('η υπέρβαση μπαίνει στο σύνολο', c.total > 60);
  }
  ok('πακέτο χωρίς όριο δεν χρεώνει ποτέ υπέρβαση',
    monthlyCost({ ...flat, flat_annual_kwh: undefined }, consumes(900)).overage === 0);
}

// ── ΔΥΝΑΜΙΚΑ: ΔΕΝ ΜΑΝΤΕΥΟΥΜΕ ───────────────────────────────────────────────
// Η τιμή ακολουθεί τη χονδρεμπορική ανά ώρα. Εκτίμηση με τύπο θα ήταν μαντεψιά
// με το ύφος υπολογισμού.
{
  const dyn: Tariff = { id: 'dyn', name: 'Δυναμικό', badge: 'ΔΥΝΑΜΙΚΟ', type: 'dynamic', kwh_day: 0, fixed: 5, vat: 6 };
  const c = monthlyCost(dyn, consumes(400));
  eq('χωρίς δήλωση, μηδέν και σημαδεμένο', c.total, 0);
  eq('σημαδεμένο ως χειροκίνητο', c.manual, true);
  eq('με δήλωση χρήστη', monthlyCost(dyn, consumes(400, { manualMonthly: 72 })).total, 72);
}

// ── ΜΗΔΕΝΙΚΗ ΚΑΙ ΑΚΥΡΗ ΚΑΤΑΝΑΛΩΣΗ ──────────────────────────────────────────
{
  const c = monthlyCost(simple, consumes(0));
  near('μηδέν κατανάλωση, μόνο πάγιο', c.supply, 5);
  eq('χωρίς ρυθμιζόμενα', c.regulated, 0);
  near('αρνητική κατανάλωση σαν μηδέν', monthlyCost(simple, consumes(-50)).supply, 5);
}

// ── ΚΑΤΑΤΑΞΗ ───────────────────────────────────────────────────────────────
{
  const list: Tariff[] = [
    { id: 'a', name: 'Α', badge: 'ΜΠΛΕ', type: 'fixed', kwh_day: 0.150, fixed: 5, vat: 6 },
    { id: 'b', name: 'Β', badge: 'ΜΠΛΕ', type: 'fixed', kwh_day: 0.130, fixed: 5, vat: 6 },
    { id: 'c', name: 'Γ', badge: 'ΜΠΛΕ', type: 'fixed', kwh_day: 0.140, fixed: 5, vat: 6 },
    { id: 'd', name: 'Δ', badge: 'ΔΥΝΑΜΙΚΟ', type: 'dynamic', kwh_day: 0, fixed: 0, vat: 6 },
  ];
  const cur = monthlyCost(list[0], consumes(300)).total;
  const ranked = compareTariffs(list, consumes(300), 'a', cur);
  eq('τα δυναμικά μένουν έξω από την κατάταξη', ranked.length, 3);
  eq('φθηνότερο πρώτο', ranked[0].tariff.id, 'b');
  eq('ακριβότερο τελευταίο', ranked[2].tariff.id, 'a');
  eq('το τρέχον σημαδεύεται', ranked[2].isCurrent, true);
  eq('το τρέχον έχει μηδενική διαφορά', ranked[2].diff, 0);
  ok('η διαφορά του φθηνότερου είναι αρνητική', ranked[0].diff < 0);
  ok('τα δυναμικά δεν εμφανίζονται ως δωρεάν πρώτα',
    !ranked.some(r => r.tariff.type === 'dynamic'));
}

// ── Η ΚΑΤΑΝΑΛΩΣΗ ΠΡΕΠΕΙ ΝΑ ΕΙΝΑΙ ΤΟΥ ΧΡΗΣΤΗ ───────────────────────────────
// Το παλιό «250 kWh» ήταν προεπιλογή που έφτανε ως το τέλος: ο χρήστης έβλεπε
// «κερδίζεις 14 ευρώ» πάνω σε κατανάλωση που δεν ήταν η δική του.
{
  const e = estimateUsage(['300', '320', '280', '400'], undefined, 250);
  eq('το ιστορικό νικά το χειροκίνητο', e.source, 'history');
  eq('μέσος όρος', e.kwhMonthly, 325);
  eq('μήνες', e.months, 4);
  eq('αξιόπιστο', e.reliable, true);
}
{
  const e = estimateUsage(['', '', ''], [310, 290], 250);
  eq('κενό ιστορικό, πέφτουμε στους λογαριασμούς', e.source, 'bills');
  eq('μέσος όρος λογαριασμών', e.kwhMonthly, 300);
  eq('δύο μήνες δεν φτάνουν για βεβαιότητα', e.reliable, false);
}
{
  const e = estimateUsage(undefined, undefined, 250);
  eq('μόνο χειροκίνητο', e.source, 'manual');
  eq('τιμή', e.kwhMonthly, 250);
}
{
  const e = estimateUsage(undefined, undefined, undefined);
  eq('τίποτα σημαίνει άγνωστο', e.source, 'unknown');
  eq('όχι σιωπηλή προεπιλογή 250', e.kwhMonthly, 0);
  eq('μη αξιόπιστο', e.reliable, false);
}
{
  eq('τα μηδενικά και τα σκουπίδια αγνοούνται',
    estimateUsage(['0', 'abc', '-5', '300'], undefined, null).kwhMonthly, 300);
}

// ── ΦΡΟΥΡΟΣ ΓΙΑ ΤΟΝ ΚΑΤΑΛΟΓΟ ───────────────────────────────────────────────
// ΗΤΑΝ ΓΡΑΜΜΕΝΟΣ ΠΑΝΩ ΣΕ ΚΕΙΜΕΝΟ, ΚΑΙ ΓΙ' ΑΥΤΟ ΗΤΑΝ ΠΑΓΙΔΑ. Διάβαζε το
// `BillsElectricity.tsx` ως συμβολοσειρά και φιλτράριζε ΑΝΑ ΓΡΑΜΜΗ με regex,
// απαιτώντας κάθε τιμολόγιο να είναι σε μία γραμμή ΚΑΙ μέσα σε εκείνο ακριβώς το
// αρχείο. Τρεις τρόποι να περάσει ψεύτικα:
//   · αναδίπλωση ενός τιμολογίου σε δύο γραμμές  → δεν το έβλεπε
//   · μετακίνηση του καταλόγου σε άλλο module    → μηδέν ευρήματα, πράσινο
//   · μετονομασία του αρχείου                    → σφάλμα ή σιωπή
// Δηλαδή ο φρουρός θα έδειχνε επιτυχία ΑΚΡΙΒΩΣ επειδή δεν έβρισκε τίποτα να
// ελέγξει. Τώρα διαβάζει τα ΑΝΤΙΚΕΙΜΕΝΑ: δεν τον νοιάζει πού ζουν ούτε πώς
// είναι γραμμένα και ελέγχει ό,τι δεν μπορούσε να ελέγξει με regex.
{
  const all = ALL_TARIFFS();
  ok('ο κατάλογος δεν είναι κενός', all.length > 50);

  // Ο ΑΡΧΙΚΟΣ ΚΑΝΟΝΑΣ: κανένα τιμολόγιο με κλίμακες ΚΑΙ νυχτερινή ζώνη. Ο
  // υπολογισμός δεν ορίζει πώς συνδυάζονται, οπότε θα έβγαζε σιωπηλά λάθος ποσό.
  const both = all.filter(t => (t.kwh_night ?? 0) > 0 && (t.kwh_tier2 ?? 0) > 0);
  eq('κανένα τιμολόγιο με κλίμακες ΚΑΙ νυχτερινή ζώνη', both.map(t => t.id), []);

  // ΤΑ ΕΠΟΜΕΝΑ ΔΕΝ ΜΠΟΡΟΥΣΑΝ ΝΑ ΓΡΑΦΤΟΥΝ ΜΕ REGEX ΑΝΑ ΓΡΑΜΜΗ.
  const ids = all.map(t => t.id);
  eq('κανένα διπλότυπο αναγνωριστικό', ids.filter((id, i) => ids.indexOf(id) !== i), []);

  eq('κάθε κλίμακα έχει και κατώφλι',
    all.filter(t => t.kwh_tier2 != null && !(t.tier2_threshold! > 0)).map(t => t.id), []);
  eq('και κάθε κατώφλι έχει και κλίμακα',
    all.filter(t => t.tier2_threshold != null && t.kwh_tier2 == null).map(t => t.id), []);

  // ΠΑΚΕΤΟ ΜΕ ΣΤΑΘΕΡΟ ΜΗΝΙΑΙΟ ΧΩΡΙΣ ΟΡΙΟ ΔΕΝ ΜΠΟΡΕΙ ΝΑ ΠΡΟΕΙΔΟΠΟΙΗΣΕΙ ΠΟΤΕ ΓΙΑ
  // ΥΠΕΡΒΑΣΗ — ο χρήστης χρεώνεται και δεν το μαθαίνει. Ο παλιός φρουρός δεν
  // μπορούσε να το δει: ένας έλεγχος regex δεν διασταυρώνει πεδία μεταξύ τους.
  // Όσα δεν δημοσιεύουν όριο σε αριθμό καταγράφονται ρητά και η λίστα δεν
  // μεγαλώνει· δεν συμπληρώνουμε εμείς νούμερο που κρίνει χρέωση.
  // Το `settled` είναι η ΤΡΙΤΗ απάντηση στο ίδιο ερώτημα: το πακέτο δεν έχει
  // όριο επειδή το μηνιαίο ποσό δεν είναι καν τιμή, εκκαθαρίζεται αργότερα.
  eq('κάθε πακέτο flat δηλώνει όριο, ή είναι καταγεγραμμένη εξαίρεση, ή εκκαθαρίζεται',
    all.filter(t => t.type === 'fixed_monthly' && !t.flat_annual_kwh && !t.settled && !FLAT_WITHOUT_ALLOWANCE.has(t.id)).map(t => t.id), []);
  eq('και καμία εξαίρεση δεν είναι φάντασμα',
    [...FLAT_WITHOUT_ALLOWANCE].filter(id => !ids.includes(id)), []);

  // ══ ΟΣΑ ΕΚΚΑΘΑΡΙΖΟΝΤΑΙ ΔΕΝ ΚΑΤΑΤΑΣΣΟΝΤΑΙ ═════════════════════════════════
  // Το «myHome Plan» χρεώνει 60 € τον μήνα έναντι και η ΔΕΗ εκκαθαρίζει την
  // πραγματική κατανάλωση στον έκτο και στον δωδέκατο μήνα. Ο κατάλογος το
  // κρατούσε ως σταθερό μηνιαίο ΧΩΡΙΣ κανένα όριο κιλοβατωρών: σε 600 kWh τον
  // μήνα έβγαινε πρώτο, με ποσό που η εκκαθάριση ακυρώνει.
  const settled = all.filter(t => t.settled);
  ok('υπάρχει τουλάχιστον ένα τιμολόγιο με εκκαθάριση', settled.length > 0);
  eq('κανένα δεν μπαίνει στη σύγκριση',
    COMPARABLE_TARIFFS().filter(t => t.settled).map(t => t.id), []);
  eq('και όλα μένουν επιλέξιμα ως τρέχον τιμολόγιο',
    settled.filter(t => !ids.includes(t.id)).map(t => t.id), []);
  eq('και όλα το εξηγούν στην περιγραφή τους',
    settled.filter(t => !/εκκαθαρ/i.test(t.desc ?? '')).map(t => t.id), []);

  eq('κάθε τιμολόγιο δηλώνει ΦΠΑ 6 ή 24', all.filter(t => t.vat !== 6 && t.vat !== 24).map(t => t.id), []);
  eq('καμία αρνητική τιμή',
    all.filter(t => t.kwh_day < 0 || t.fixed < 0 || (t.kwh_night ?? 0) < 0).map(t => t.id), []);
  // Το «χωρίς πάγιο» πρέπει να συμφωνεί με το ποσό, αλλιώς η στήλη λέει άλλα.
  eq('το «χωρίς πάγιο» σημαίνει πάγιο μηδέν',
    all.filter(t => t.no_fixed && t.fixed > 0).map(t => t.id), []);

  // ── ΤΙΜΟΛΟΓΙΟ ΜΕ ΠΕΡΙΟΡΙΣΜΟ ΔΙΚΑΙΩΜΑΤΟΣ ΔΕΝ ΠΡΟΤΕΙΝΕΤΑΙ ────────────────
  // Τέσσερα φοιτητικά έμπαιναν στη σύγκριση όλων και δύο έβγαιναν ΠΡΩΤΑ, με
  // τιμή που ο ιδιοκτήτης δεν δικαιούται: θα άλλαζε πάροχο και θα απορριπτόταν.
  // Το πεδίο υπήρχε, κανείς δεν το διάβαζε και διαγράφηκε ως «νεκρό» — το ότι
  // δεν το διάβαζε κανείς ΗΤΑΝ το σφάλμα.
  const restricted = all.filter(t => t.studentOnly).map(t => t.id);
  ok('ο κατάλογος σημαδεύει τα φοιτητικά', restricted.length >= 4);
  eq('και κανένα δεν μπαίνει στη σύγκριση',
    COMPARABLE_TARIFFS().filter(t => t.studentOnly).map(t => t.id), []);
  // Κάθε τιμολόγιο με «φοιτητ» στο όνομα ή στην περιγραφή ΠΡΕΠΕΙ να είναι
  // σημαδεμένο — αλλιώς το επόμενο που θα προστεθεί θα ξαναγλιστρήσει.
  eq('κανένα φοιτητικό δεν ξέφυγε από τη σήμανση',
    all.filter(t => /student|φοιτητ/i.test(`${t.name} ${t.desc}`) && !t.studentOnly).map(t => t.id), []);
}

// ── ΝΕΡΟ: Ο ΛΟΓΑΡΙΑΣΜΟΣ ΔΕΝ ΕΙΝΑΙ ΜΗΝΙΑΙΟΣ ─────────────────────────────────
// Η ΕΥΔΑΠ χρεώνει ανά δίμηνο, άλλες ΔΕΥΑ ανά τρίμηνο ή τετράμηνο. Ο ίδιος
// λογαριασμός των 84 € σημαίνει 42 € τον μήνα ή 21 €, ανάλογα με τη συχνότητα.
{
  near('δίμηνος λογαριασμός γίνεται μισός', waterMonthly({ waterBiMonthly: '84', waterPeriodMonths: '2' }), 42);
  near('τετράμηνος γίνεται τέταρτος', waterMonthly({ waterBiMonthly: '84', waterPeriodMonths: '4' }), 21);
  near('χωρίς συχνότητα, το δίμηνο είναι η προεπιλογή', waterMonthly({ waterBiMonthly: '84' }), 42);
  near('συχνότητα μηδέν δεν διαιρεί με το μηδέν', waterMonthly({ waterBiMonthly: '84', waterPeriodMonths: '0' }), 42);
  // Ο παλιός τρόπος: αποθηκευμένος μηνιαίος χωρίς λογαριασμό. Δεν χάνεται.
  near('χωρίς λογαριασμό μετρά ο αποθηκευμένος μηνιαίος', waterMonthly({ waterMonthly: '30' }), 30);
  near('χωρίς τίποτα, μηδέν', waterMonthly({}), 0);
  // Ο λογαριασμός ΥΠΕΡΙΣΧΥΕΙ: το πεδίο «Μηνιαία αναγωγή» άφηνε τιμή που δεν
  // συμφωνούσε με τον λογαριασμό και ο υπολογισμός την αγνοούσε ήδη.
  near('ο λογαριασμός υπερισχύει του αποθηκευμένου μηνιαίου',
    waterMonthly({ waterBiMonthly: '84', waterPeriodMonths: '2', waterMonthly: '999' }), 42);
  eq('η μορφή αποθήκευσης έχει δύο δεκαδικά', waterMonthlyText('84.31', '2'), '42.16');
  eq('χωρίς λογαριασμό δεν αποθηκεύεται τίποτα', waterMonthlyText('', '2'), '');
}

// ═══ ΤΙΜΗ ΠΟΥ ΚΛΕΙΝΕΙ ΑΝΑΔΡΟΜΙΚΑ ΔΕΝ ΜΠΑΙΝΕΙ ΣΤΗΝ ΚΑΤΑΤΑΞΗ ═════════════════
// ΤΟ ΣΦΑΛΜΑ: τρία τιμολόγια γράφουν στην ΙΔΙΑ ΤΟΥΣ ΤΗΝ ΠΕΡΙΓΡΑΦΗ «Τιμή συν
// ΜΔΚΑ» και ο υπολογισμός δεν πρόσθετε τίποτα γι' αυτό. Ενα ελλιπές νούμερο
// έμπαινε στην ίδια κατάταξη με πλήρη και έβγαινε πρώτο.
{
  const retro: Tariff = { ...simple, id: 'retro', priceStatus: 'retro' };
  const c = monthlyCost(retro, consumes(300));
  ok('δεν παράγει σύνολο από ελλιπή τιμή', c.manual);
  eq('και δεν δείχνει νούμερο που δεν ξέρει', c.total, 0);

  // Με δηλωμένο ποσό από τον χρήστη, δείχνει ΤΟ ΔΙΚΟ ΤΟΥ — όπως τα δυναμικά.
  const told = monthlyCost(retro, { ...consumes(300), manualMonthly: 47.5 });
  eq('το ποσό του χρήστη περνά αυτούσιο', told.total, 47.5);
}
{
  // ΚΑΘΕ τιμολόγιο του καταλόγου που λέει «συν ΜΔΚΑ» ΠΡΕΠΕΙ να είναι σημειωμένο.
  // Αλλιώς η περιγραφή προειδοποιεί και ο υπολογισμός αγνοεί.
  let unmarked = '';
  for (const t of ALL_TARIFFS()) {
    // Το «ΜΔΚΑ» περιέχει το «ΔΚΑ», οπότε ένας έλεγχος φτάνει. Χωρίς `\\b`: το
    // όριο λέξης της JavaScript ορίζεται σε ASCII και δεν πιάνει ελληνικά.
    if (t.desc.includes('ΔΚΑ') && t.priceStatus !== 'retro') unmarked = t.id;
  }
  eq('κανένα «συν ΜΔΚΑ» χωρίς σήμανση', unmarked, '');
}

// ══ Η ΠΕΡΙΓΡΑΦΗ ΔΕΝ ΛΕΕΙ ΑΛΛΟΝ ΑΡΙΘΜΟ ΑΠΟ ΑΥΤΟΝ ΠΟΥ ΥΠΟΛΟΓΙΖΕΤΑΙ ═══════════
// Η οθόνη τυπώνει το πάγιο και τις κλίμακες από τα ΠΕΔΙΑ. Οταν η περιγραφή
// επαναλαμβάνει τα ίδια νούμερα, είτε λέει το ίδιο δύο φορές είτε, χειρότερα,
// λέει κάτι άλλο. Και τα δύο βρέθηκαν, σε τέσσερα τιμολόγια:
//
//   myHome Enter      «Πάγιο 7,50 €» ενώ το πεδίο κρατά 7,35
//   myHome 4All       «0,137 € έως τις 500 kWh» ενώ ο υπολογισμός τρέχει 0,15135
//   myHome 4Students  «0,129 €» ενώ ο υπολογισμός τρέχει 0,11155
//   Volton Blue       «περίπου στα 0,129 €» ενώ ο υπολογισμός τρέχει 0,152
//
// Οι τρεις τελευταίες είναι διαφημιστικές τιμές, με έκπτωση συνέπειας ή εποχιακή
// προσφορά μέσα τους. Ο ιδιοκτήτης διάβαζε τη φθηνή και κατατασσόταν με την
// ακριβή. Ο έλεγχος δεν κρίνει ποια είναι σωστή: απαιτεί ό,τι λέγεται σε ευρώ
// μέσα στην πρόταση να υπάρχει και ως πεδίο.
{
  const num = (x: string) => parseFloat(x.replace(',', '.'));
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.0051;
  const clashes: string[] = [];
  for (const t of ALL_TARIFFS()) {
    const d = t.desc ?? '';
    const fixedFields = [t.fixed, t.fixed_ebill].filter((x): x is number => x != null);
    for (const m of d.matchAll(/πάγιο[^0-9]{0,12}([0-9]+,[0-9]{2})\s*€/gi))
      if (!fixedFields.some(f => near(f, num(m[1])))) clashes.push(`${t.id}: πάγιο ${m[1]}`);

    const rateFields = [t.kwh_day, t.kwh_night, t.kwh_tier2, t.flat_overage_rate]
      .filter((x): x is number => x != null && x > 0);
    for (const m of d.matchAll(/([0-9],[0-9]{3,5})\s*€/g)) {
      const v = num(m[1]);
      if (v > 0.5) continue;                       // ποσά, όχι τιμές κιλοβατώρας
      if (!rateFields.some(f => near(f, v))) clashes.push(`${t.id}: τιμή ${m[1]}`);
    }
  }
  eq('κανένας αριθμός της περιγραφής δεν διαφωνεί με τα πεδία', clashes, []);
}

console.log(fail === 0 ? `✓ tariff: ${pass} έλεγχοι πέρασαν` : `✗ tariff: ${fail} απέτυχαν από ${pass + fail}`);
if (fail > 0) process.exit(1);
