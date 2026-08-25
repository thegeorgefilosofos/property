// Αυστηροί έλεγχοι για τον ΕΝΟΠΟΙΗΜΕΝΟ φόρο ενοικίων (lib/billing/consolidate.ts).
// Τρέξε: npx tsx lib/billing/consolidate.test.ts
//
// Ο κεντρικός έλεγχος: για τρία ακίνητα με 8.000 € έκαστο, ο συνολικός φόρος
// ΔΕΝ ισούται με 3× τον φόρο των 8.000 €. Αυτό ακριβώς έδειχνε το app πριν.
import {
  consolidateRentTax, taxShareOf, consolidationSummary,
  presumptiveDeductionRate, presumptiveDeductionRateForYear, bankReceiptMatters,
  PRESUMPTIVE_RULE_2026, CONSOLIDATION_NOTE,
} from './consolidate';
import { rentalIncomeTax } from './greekTax';

let pass = 0, fail = 0;
function ok(name: string, cond: boolean) { if (cond) { pass++; } else { fail++; console.error(`✗ ${name}`); } }
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; } else { fail++; console.error(`✗ ${name}\n   got  ${g}\n   want ${w}`); }
}
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;

const src = (id: string, annualRent: number, over: Record<string, unknown> = {}) =>
  ({ id, annualRent, ...over });

// ═══ ΤΟ ΚΕΝΤΡΙΚΟ ΕΥΡΗΜΑ: ΤΡΙΑ ΑΚΙΝΗΤΑ × 8.000 € ══════════════════════════════
// Φορολογητέο ανά ακίνητο: 8.000 − 5% = 7.600 €. Σύνολο 22.800 €.
// Ένας φόρος: 12.000×15% + 10.800×25% = 1.800 + 2.700 = 4.500 €.
// Ανά ακίνητο: 7.600×15% = 1.140 € × 3 = 3.420 €. Διαφορά 1.080 €.
{
  const r = consolidateRentTax([src('a', 8000), src('b', 8000), src('c', 8000)]);
  const wrong = 3 * rentalIncomeTax(8000 * 0.95);

  ok('τρία ακίνητα μπήκαν στην κλίμακα', r.count === 3);
  ok('σύνολο ενοικίων 24.000 €', near(r.totalAnnualRent, 24000));
  ok('συνολικό φορολογητέο 22.800 €', near(r.totalTaxable, 22800));
  ok('ΕΝΑΣ φόρος 4.500 €', near(r.totalTax, 4500));

  // Η απόδειξη που ζητήθηκε ρητά.
  ok('ο συνολικός φόρος ΔΕΝ ισούται με 3× τον φόρο των 8.000',
    !near(r.totalTax, wrong, 1) && r.totalTax > wrong);
  ok('η ανά-ακίνητο μέθοδος έδειχνε 3.420 €', near(r.sumOfStandaloneTax, 3420));
  ok('υποεκτίμηση 1.080 €', near(r.understatement, 1080));
  ok('η υποεκτίμηση είναι ~24% του σωστού φόρου', r.understatement / r.totalTax > 0.2);

  // Ίσα εισοδήματα → ίσα μερίδια και το άθροισμα των μεριδίων = ο ένας φόρος.
  ok('ίσα μερίδια 1.500 € έκαστο', r.perProperty.every(p => near(p.taxShare, 1500)));
  ok('άθροισμα μεριδίων = συνολικός φόρος',
    near(r.perProperty.reduce((s, p) => s + p.taxShare, 0), r.totalTax));
  ok('taxShareOf βρίσκει το μερίδιο', near(taxShareOf(r, 'b'), 1500));
  ok('taxShareOf σε ανύπαρκτο id → 0', taxShareOf(r, 'zzz') === 0);
}

// ═══ ΕΝΑ ΑΚΙΝΗΤΟ: ΚΑΜΙΑ ΔΙΑΦΟΡΑ (η ενοποίηση δεν χαλάει την απλή περίπτωση) ══
{
  const r = consolidateRentTax([src('solo', 9600)]);
  ok('ένα ακίνητο: φόρος = ανά-ακίνητο φόρος', near(r.totalTax, r.sumOfStandaloneTax));
  ok('ένα ακίνητο: μηδενική υποεκτίμηση', r.understatement === 0);
  ok('ένα ακίνητο: το μερίδιο είναι όλος ο φόρος', near(taxShareOf(r, 'solo'), r.totalTax));
  ok('χωρίς επεξήγηση με ένα ακίνητο', consolidationSummary(r, n => `${n} €`) === null);
}

// ═══ ΤΟ ΑΘΡΟΙΣΜΑ ΤΩΝ ΓΡΑΜΜΩΝ ΙΣΟΥΤΑΙ ΜΕ ΤΟ ΣΥΝΟΛΟ (το CSV του λογιστή) ══════
// Άνισα ποσά, πολλά ακίνητα, ώστε να μη «κρύβεται» σφάλμα επιμερισμού.
{
  const r = consolidateRentTax([
    src('p1', 3600), src('p2', 7200), src('p3', 12000), src('p4', 18000), src('p5', 450),
  ]);
  const sumShares = r.perProperty.reduce((s, p) => s + p.taxShare, 0);
  ok('πέντε γραμμές αθροίζουν ακριβώς στο ΣΥΝΟΛΟ', near(sumShares, r.totalTax, 0.05));
  ok('το σύνολο περνά στο 4ο κλιμάκιο', r.totalTaxable > 35000);
  ok('οριακός συντελεστής 45%', near(r.marginalRate, 0.45, 1e-9));
  ok('μέσος συντελεστής μικρότερος του οριακού', r.effectiveRate < r.marginalRate);
  ok('μεγαλύτερο ενοίκιο → μεγαλύτερο μερίδιο',
    r.perProperty[3].taxShare > r.perProperty[2].taxShare
    && r.perProperty[2].taxShare > r.perProperty[1].taxShare);
  ok('υπάρχει επεξήγηση με 2+ ακίνητα', (consolidationSummary(r, n => `${n} €`) || '').includes('επιμερισμένος'));
}

// ═══ ΑΚΙΝΗΤΑ ΧΩΡΙΣ ΕΙΣΟΔΗΜΑ: ΔΕΝ ΑΛΛΟΙΩΝΟΥΝ, ΔΕΝ ΕΞΑΦΑΝΙΖΟΝΤΑΙ ══════════════
{
  const r = consolidateRentTax([src('rented', 12000), src('vacant', 0), src('own_use', -50)]);
  eq('μένουν και οι τρεις γραμμές', r.perProperty.length, 3);
  ok('μόνο ένα με εισόδημα', r.count === 1);
  ok('το κενό έχει μηδενικό μερίδιο', taxShareOf(r, 'vacant') === 0);
  ok('το αρνητικό δεν μειώνει τη βάση', near(r.totalAnnualRent, 12000));
}

// ═══ ΤΡΑΠΕΖΙΚΗ ΕΙΣΠΡΑΞΗ: Ο ΚΑΝΟΝΑΣ ΤΟΥ 2026, ΕΝΑ ΣΗΜΕΙΟ ════════════════════
{
  eq('με τράπεζα → 5%', presumptiveDeductionRate(true), 0.05);
  eq('με μετρητά → 0%', presumptiveDeductionRate(false), 0);
  eq('χωρίς όρισμα → 5% (default)', presumptiveDeductionRate(), 0.05);

  // ── Ο ΤΡΟΠΟΣ ΕΙΣΠΡΑΞΗΣ ΜΕΤΡΑΕΙ ΜΟΝΟ ΑΠΟ ΤΟ 2026 ────────────────────────
  // Η προϋπόθεση της τράπεζας μπήκε με τον ν.5246/2025 και ισχύει από 1/1/2026.
  // Ο δημόσιος υπολογιστής τη σύγκριση την έκανε, η καρτέλα του λογιστή όχι:
  // μία είσπραξη σε μετρητά μέσα στο 2025 αφαιρούσε έκπτωση που ο νόμος έδινε.
  eq('2025: ο τρόπος είσπραξης δεν μετράει', bankReceiptMatters(2025), false);
  eq('2026: μετράει', bankReceiptMatters(2026), true);
  eq('2027: μετράει', bankReceiptMatters(2027), true);
  eq('χωρίς έτος μετράει, γιατί «τώρα»', bankReceiptMatters(null), true);

  eq('2025 με μετρητά κρατά την έκπτωση', presumptiveDeductionRateForYear(2025, false), 0.05);
  eq('2025 με τράπεζα το ίδιο', presumptiveDeductionRateForYear(2025, true), 0.05);
  eq('2026 με μετρητά τη χάνει', presumptiveDeductionRateForYear(2026, false), 0);
  eq('2026 με τράπεζα την κρατά', presumptiveDeductionRateForYear(2026, true), 0.05);

  // ΚΑΙ ΤΟ ΝΟΥΜΕΡΟ ΠΟΥ ΕΦΤΑΝΕ ΣΤΟΝ ΛΟΓΙΣΤΗ. Ενοίκια 20.000,00 € στη χρήση
  // 2025, εισπραγμένα με μετρητά: φορολογητέο 19.000,00 € και όχι 20.000,00 €.
  eq('χρήση 2025, 20.000 € με μετρητά → φορολογητέο 19.000 €',
    Math.round(20000 * (1 - presumptiveDeductionRateForYear(2025, false))), 19000);

  const bank = consolidateRentTax([src('a', 10000), src('b', 10000)]);
  const cash = consolidateRentTax([src('a', 10000, { rentsPaidViaBank: false }), src('b', 10000, { rentsPaidViaBank: false })]);
  ok('μετρητά → μεγαλύτερο φορολογητέο', cash.totalTaxable > bank.totalTaxable);
  ok('μετρητά → φορολογητέο = 100% των μεικτών', near(cash.totalTaxable, 20000));
  ok('τράπεζα → φορολογητέο = 95% των μεικτών', near(bank.totalTaxable, 19000));
  ok('μετρητά → μεγαλύτερος φόρος', cash.totalTax > bank.totalTax);

  // Μεικτή περίπτωση: ένα με τράπεζα, ένα με μετρητά — μία κλίμακα, δύο βάσεις.
  const mix = consolidateRentTax([src('a', 10000), src('b', 10000, { rentsPaidViaBank: false })]);
  ok('μεικτή: φορολογητέο 19.500 €', near(mix.totalTaxable, 19500));
  ok('μεικτή: το μετρητοίς πληρώνει μεγαλύτερο μερίδιο', taxShareOf(mix, 'b') > taxShareOf(mix, 'a'));
  ok('μεικτή: άθροισμα μεριδίων = σύνολο',
    near(mix.perProperty.reduce((s, p) => s + p.taxShare, 0), mix.totalTax, 0.02));
}

// ═══ ΒΡΑΧΥΧΡΟΝΙΑ: ΙΔΙΑ ΚΛΙΜΑΚΑ, ΙΔΙΟ ΑΘΡΟΙΣΜΑ ══════════════════════════════
{
  const r = consolidateRentTax([src('long', 9000), src('short', 9000, { shortTerm: true })]);
  ok('βραχυχρόνια + μακροχρόνια αθροίζονται στην ίδια κλίμακα', near(r.totalTaxable, 17100));
  ok('ίδιο μεικτό → ίδιο μερίδιο', near(taxShareOf(r, 'long'), taxShareOf(r, 'short')));
}

// ═══ ΚΑΝΕΝΑ ΑΚΙΝΗΤΟ / ΚΕΝΗ ΛΙΣΤΑ ═══════════════════════════════════════════
{
  const r = consolidateRentTax([]);
  eq('κενή λίστα → μηδενικά', [r.count, r.totalTax, r.understatement], [0, 0, 0]);
  eq('κενή λίστα → καμία γραμμή', r.perProperty.length, 0);
}

// ═══ ΣΥΜΦΩΝΙΑ ΜΕ ΤΗ ΜΟΝΑΔΙΚΗ ΠΗΓΗ ΤΗΣ ΚΛΙΜΑΚΑΣ ════════════════════════════
// Ό,τι λέει το greekTax για το άθροισμα, το ίδιο λέει και η ενοποίηση.
{
  for (const rents of [[5000, 5000], [12000, 12000], [20000, 15000, 9000], [40000, 1000]]) {
    const r = consolidateRentTax(rents.map((v, i) => src(`x${i}`, v)));
    const direct = rentalIncomeTax(rents.reduce((s, v) => s + v * 0.95, 0));
    ok(`συμφωνία με greekTax για [${rents.join(', ')}]`, near(r.totalTax, direct, 0.02));
  }
}

// ═══ ΤΑ ΚΕΙΜΕΝΑ ΥΠΑΡΧΟΥΝ ΚΑΙ ΛΕΝΕ ΤΟ ΣΩΣΤΟ ════════════════════════════════
{
  ok('ο κανόνας 2026 αναφέρει την τράπεζα', PRESUMPTIVE_RULE_2026.includes('τραπέζης'));
  ok('ο κανόνας 2026 ΔΕΝ λέει «αυτόματη»', !PRESUMPTIVE_RULE_2026.includes('υτόματη'));
  ok('η επεξήγηση ενοποίησης μιλά για το σύνολο', CONSOLIDATION_NOTE.includes('ΣΥΝΟΛΟ'));
}

console.log(fail === 0 ? `✓ consolidate: ${pass} έλεγχοι πέρασαν` : `✗ consolidate: ${fail} απέτυχαν από ${pass + fail}`);
if (fail > 0) process.exit(1);
