// npx tsx lib/energy/tariff.test.ts
import { readFileSync } from 'node:fs';
import {
  monthlyCost, compareTariffs, estimateUsage, ERT, ETMEAR, type Tariff, type Usage,
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
  near('ρυθμιζόμενα', c.regulated, 300 * (ERT + ETMEAR));
  near('ΦΠΑ 6%', c.vat, (c.supply + c.regulated) * 0.06);
  near('σύνολο', c.total, c.supply + c.regulated + c.vat);
  eq('δεν είναι χειροκίνητο', c.manual, false);
}
{
  // Ο ΦΠΑ ΔΙΑΦΕΡΕΙ: 24% στα επαγγελματικά. Αν έμενε έξω, η επαγγελματική
  // εκτίμηση θα ήταν 18% χαμηλότερη από τον πραγματικό λογαριασμό.
  const biz: Tariff = { ...simple, id: 'biz', vat: 24, segment: 'business' };
  const c = monthlyCost(biz, consumes(300));
  near('ΦΠΑ 24%', c.vat, (c.supply + c.regulated) * 0.24);
  ok('το επαγγελματικό βγαίνει ακριβότερο από το ίδιο οικιακό',
    c.total > monthlyCost(simple, consumes(300)).total);
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
// Κανένα τιμολόγιο δεν έχει ΚΑΙ κλίμακες ΚΑΙ νυχτερινή ζώνη. Αν προστεθεί,
// αυτός ο έλεγχος σπάει και κάποιος πρέπει να αποφασίσει συνειδητά πώς
// συνδυάζονται, αντί να βγάλει σιωπηλά λάθος νούμερο ο κώδικας.
{
  const src = readFileSync('app/dashboard/components/BillsElectricity.tsx', 'utf8');
  const both = src.split('\n').filter(l => /\{ id: '/.test(l))
    .filter(l => /kwh_night: 0\.\d/.test(l) && /kwh_tier2: 0\.\d/.test(l));
  eq('κανένα τιμολόγιο με κλίμακες ΚΑΙ νυχτερινή ζώνη', both.length, 0);
}

console.log(fail === 0 ? `✓ tariff: ${pass} έλεγχοι πέρασαν` : `✗ tariff: ${fail} απέτυχαν από ${pass + fail}`);
if (fail > 0) process.exit(1);
