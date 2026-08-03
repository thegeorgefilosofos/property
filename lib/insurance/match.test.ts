// npx tsx lib/insurance/match.test.ts
import {
  assessNeeds, matchPlans, planCovers, explain, NEED_LABEL,
  type Plan, type Need, type PropertyRisk,
} from './match';

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; } else { fail++; console.error(`✗ ${name}\n   got  ${g}\n   want ${w}`); }
}
function ok(name: string, cond: boolean) {
  if (cond) { pass++; } else { fail++; console.error(`✗ ${name}`); }
}

const weightOf = (p: PropertyRisk, need: Need) =>
  assessNeeds(p).find(n => n.need === need)?.weight;

// ── ΣΕΙΣΜΟΣ ────────────────────────────────────────────────────────────────
// Με δάνειο, η τράπεζα ορίζει τις ελάχιστες καλύψεις. Δεν είναι επιλογή.
eq('με δάνειο ο σεισμός είναι απαραίτητος', weightOf({ hasLoan: true }, 'earthquake'), 'required');
eq('κτίριο του 1972 χωρίς σύγχρονο κανονισμό', weightOf({ buildYear: 1972 }, 'earthquake'), 'required');
eq('κτίριο του 2015', weightOf({ buildYear: 2015 }, 'earthquake'), 'important');
// Άγνωστο έτος ΔΕΝ γίνεται επείγον: δεν φτιάχνουμε ανάγκη από άγνοια.
eq('άγνωστο έτος χωρίς δάνειο', weightOf({}, 'earthquake'), 'important');
ok('ο σεισμός δεν είναι ποτέ άσχετος στην Ελλάδα',
  [{}, { buildYear: 2024 }, { floor: 'mid' as const }].every(p => weightOf(p, 'earthquake') !== 'irrelevant'));

// ── ΠΛΗΜΜΥΡΑ: ΤΟΝ ΚΙΝΔΥΝΟ ΤΟΝ ΟΡΙΖΕΙ Ο ΟΡΟΦΟΣ ────────────────────────────
eq('υπόγειο', weightOf({ floor: 'basement' }, 'flood'), 'required');
eq('ισόγειο', weightOf({ floor: 'ground' }, 'flood'), 'important');
eq('τελευταίος όροφος, κίνδυνος από τη στέγη', weightOf({ floor: 'top' }, 'flood'), 'important');
eq('ενδιάμεσος όροφος', weightOf({ floor: 'mid' }, 'flood'), 'nice');

// ── ΚΛΟΠΗ: ΧΩΡΙΣ ΠΕΡΙΕΧΟΜΕΝΟ ΔΕΝ ΥΠΑΡΧΕΙ ΑΝΑΓΚΗ ──────────────────────────
eq('βραχυχρόνια', weightOf({ rentalMode: 'short_term' }, 'theft'), 'required');
eq('ακριβό περιεχόμενο', weightOf({ contentsValue: 25000 }, 'theft'), 'required');
eq('επιπλωμένο', weightOf({ furnished: true }, 'theft'), 'important');
eq('άδειο ακίνητο', weightOf({}, 'theft'), 'irrelevant');

// ── ΑΣΤΙΚΗ ΕΥΘΥΝΗ ──────────────────────────────────────────────────────────
eq('βραχυχρόνια', weightOf({ rentalMode: 'short_term' }, 'liability'), 'required');
eq('μακροχρόνια', weightOf({ rentalMode: 'long_term' }, 'liability'), 'required');
eq('ιδιοκατοίκηση', weightOf({}, 'liability'), 'important');

// ── ΚΑΘΕ ΚΡΙΣΗ ΕΧΕΙ ΛΟΓΟ ───────────────────────────────────────────────────
// Χωρίς λόγο, η κατάταξη είναι μαύρο κουτί και ο χρήστης δεν μπορεί να διαφωνήσει.
ok('κάθε ανάγκη συνοδεύεται από αιτιολογία',
  assessNeeds({ hasLoan: true, floor: 'basement', rentalMode: 'short_term' })
    .every(n => n.reason.trim().length > 15));
ok('η αιτιολογία του δανείου αναφέρει την τράπεζα',
  /τράπεζ/i.test(assessNeeds({ hasLoan: true }).find(n => n.need === 'earthquake')!.reason));
ok('η αιτιολογία της παλαιότητας αναφέρει το έτος',
  assessNeeds({ buildYear: 1972 }).find(n => n.need === 'earthquake')!.reason.includes('1972'));

// ── ΤΙ ΚΑΛΥΠΤΕΙ ΕΝΑ ΠΡΟΓΡΑΜΜΑ ─────────────────────────────────────────────
const mk = (id: string, monthly: number, covers: string[], extra: Partial<Plan> = {}): Plan =>
  ({ id, name: id, company: 'x', companyLabel: 'X', monthly, covers, ...extra });

{
  const p = mk('a', 10, ['Πυρκαγιά', 'Κλοπή', 'Αστική Ευθύνη'], { earthquake: false, flood: true });
  eq('δομημένο πεδίο για σεισμό', planCovers(p, 'earthquake'), false);
  eq('δομημένο πεδίο για πλημμύρα', planCovers(p, 'flood'), true);
  eq('πυρκαγιά από το κείμενο', planCovers(p, 'fire'), true);
  eq('κλοπή από το κείμενο', planCovers(p, 'theft'), true);
  eq('αστική ευθύνη από το κείμενο', planCovers(p, 'liability'), true);
  eq('μεταστέγαση που δεν αναφέρεται', planCovers(p, 'relocation'), false);
}
{
  // ΤΟ ΛΑΘΟΣ ΓΕΡΝΕΙ ΠΡΟΣ ΤΑ ΚΑΤΩ: «Πλήρης Κάλυψη» ΔΕΝ σημαίνει σεισμός. Αν το
  // πρόγραμμα κάλυπτε σεισμό, θα τον διαφήμιζε ονομαστικά.
  const p = mk('vague', 20, ['Πλήρης Κάλυψη']);
  eq('«πλήρης κάλυψη» δεν υπόσχεται σεισμό', planCovers(p, 'earthquake'), false);
  eq('«πλήρης κάλυψη» πιάνει την πυρκαγιά', planCovers(p, 'fire'), true);
}
{
  const p = mk('eq', 30, ['Σεισμός'], { earthquake: true });
  eq('ρητή κάλυψη σεισμού', planCovers(p, 'earthquake'), true);
}

// ── ΤΟ ΚΕΝΤΡΙΚΟ: Η ΦΘΗΝΟΤΕΡΗ ΔΕΝ ΕΙΝΑΙ Η ΚΑΛΥΤΕΡΗ ────────────────────────
{
  const plans: Plan[] = [
    mk('φθηνό_χωρίς_σεισμό', 8,  ['Πυρκαγιά', 'Αστική Ευθύνη'], { earthquake: false, flood: false }),
    mk('μεσαίο_χωρίς_σεισμό', 14, ['Πυρκαγιά', 'Κλοπή', 'Αστική Ευθύνη', 'Πλημμύρα'], { earthquake: false, flood: true }),
    mk('ακριβό_με_σεισμό',   26, ['Πυρκαγιά', 'Κλοπή', 'Αστική Ευθύνη', 'Σεισμός', 'Πλημμύρα', 'Δαπάνες Μεταστέγασης'], { earthquake: true, flood: true }),
  ];
  // Ακίνητο με δάνειο: ο σεισμός είναι απαραίτητος.
  const needs = assessNeeds({ hasLoan: true, floor: 'mid', contentsValue: 20000, rentalMode: 'long_term', monthlyRent: 600 });
  const ranked = matchPlans(plans, needs);

  eq('πρώτο βγαίνει το ΚΑΤΑΛΛΗΛΟ, όχι το φθηνό', ranked[0].plan.id, 'ακριβό_με_σεισμό');
  eq('το φθηνότερο σημειώνεται ως ακατάλληλο', ranked.find(r => r.plan.id === 'φθηνό_χωρίς_σεισμό')!.suitable, false);
  ok('το ακατάλληλο δεν εξαφανίζεται από τη λίστα', ranked.length === 3);
  ok('το φθηνό λείπει ο σεισμός',
    ranked.find(r => r.plan.id === 'φθηνό_χωρίς_σεισμό')!.missingRequired.includes('earthquake'));

  // Η αιτιολόγηση λέει την αλήθεια για τα φθηνότερα.
  const why = explain(ranked[0], ranked, needs);
  ok('η αιτιολόγηση αναγνωρίζει ότι υπάρχουν φθηνότερα', /φθηνότερα/.test(why));
  ok('η αιτιολόγηση λέει γιατί δεν κάνουν', /δεν τα καλύπτ/.test(why));

  const whyBad = explain(ranked[2], ranked, needs);
  ok('το ακατάλληλο εξηγεί τι του λείπει', /Δεν καλύπτει/.test(whyBad));
}

// ── Η ΠΡΟΤΑΣΗ ΑΛΛΑΖΕΙ ΜΕ ΤΟ ΑΚΙΝΗΤΟ ───────────────────────────────────────
// ΑΥΤΟ ΕΙΝΑΙ ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΛΥΝΕΙ ΟΛΟ ΤΟ ΑΡΧΕΙΟ: παλιά ο ίδιος κοινός
// πολλαπλασιαστής έβγαζε ΤΗΝ ΙΔΙΑ σειρά για κάθε ακίνητο.
{
  const plans: Plan[] = [
    mk('βασικό',    9,  ['Πυρκαγιά', 'Αστική Ευθύνη'], { earthquake: false, flood: false }),
    mk('με_νερά',   13, ['Πυρκαγιά', 'Αστική Ευθύνη', 'Πλημμύρα'], { earthquake: false, flood: true }),
    mk('με_κλοπή',  15, ['Πυρκαγιά', 'Αστική Ευθύνη', 'Κλοπή'], { earthquake: false, flood: false }),
  ];
  const basement = matchPlans(plans, assessNeeds({ floor: 'basement', buildYear: 2010 }));
  const furnished = matchPlans(plans, assessNeeds({ rentalMode: 'short_term', buildYear: 2010, floor: 'mid' }));

  eq('στο υπόγειο κερδίζει η πλημμύρα', basement[0].plan.id, 'με_νερά');
  eq('στη βραχυχρόνια κερδίζει η κλοπή', furnished[0].plan.id, 'με_κλοπή');
  ok('δύο διαφορετικά ακίνητα δίνουν διαφορετική πρώτη πρόταση',
    basement[0].plan.id !== furnished[0].plan.id);
}

// ── ΙΣΟΠΑΛΙΑ: ΤΟΤΕ ΚΑΙ ΜΟΝΟ ΤΟΤΕ ΑΠΟΦΑΣΙΖΕΙ Η ΤΙΜΗ ───────────────────────
{
  const covers = ['Πυρκαγιά', 'Κλοπή', 'Αστική Ευθύνη', 'Πλημμύρα', 'Σεισμός', 'Δαπάνες Μεταστέγασης'];
  const plans: Plan[] = [
    mk('ακριβό', 40, covers, { earthquake: true, flood: true }),
    mk('φθηνό',  22, covers, { earthquake: true, flood: true }),
    mk('μεσαίο', 31, covers, { earthquake: true, flood: true }),
  ];
  const ranked = matchPlans(plans, assessNeeds({ hasLoan: true, contentsValue: 20000 }));
  eq('με ίδιες καλύψεις κερδίζει η τιμή', ranked.map(r => r.plan.id), ['φθηνό', 'μεσαίο', 'ακριβό']);
  ok('όλα κατάλληλα', ranked.every(r => r.suitable));
  ok('η αιτιολόγηση του πρώτου λέει ότι είναι και το φθηνότερο',
    /φθηνότερο/.test(explain(ranked[0], ranked, assessNeeds({ hasLoan: true, contentsValue: 20000 }))));
}

// ── ΚΑΜΙΑ ΕΤΑΙΡΕΙΑ ΔΕΝ ΕΥΝΟΕΙΤΑΙ ──────────────────────────────────────────
// Η σειρά πρέπει να εξαρτάται ΜΟΝΟ από καλύψεις και τιμή. Ίδιο πρόγραμμα με
// άλλο όνομα εταιρείας οφείλει να πάρει την ίδια θέση.
{
  const covers = ['Πυρκαγιά', 'Αστική Ευθύνη'];
  const a: Plan = { id: 'p1', name: 'p1', company: 'alpha', companyLabel: 'Alpha', monthly: 12, covers };
  const b: Plan = { id: 'p2', name: 'p2', company: 'omega', companyLabel: 'Omega', monthly: 12, covers };
  const needs = assessNeeds({ buildYear: 2015, floor: 'mid' });
  eq('ίδιες καλύψεις, ίδιο σκορ',
    matchPlans([a, b], needs)[0].score, matchPlans([b, a], needs)[0].score);
  eq('η σειρά εισόδου δεν αλλάζει τα σκορ',
    matchPlans([a, b], needs).map(r => r.score),
    matchPlans([b, a], needs).map(r => r.score));
}

// ── ΑΚΡΑΙΑ ─────────────────────────────────────────────────────────────────
eq('χωρίς προγράμματα, κενή λίστα', matchPlans([], assessNeeds({})).length, 0);
ok('κάθε ανάγκη έχει ελληνική ετικέτα',
  (['earthquake', 'flood', 'theft', 'liability', 'fire', 'relocation'] as Need[])
    .every(n => (NEED_LABEL[n] ?? '').length > 3));
{
  // Πρόγραμμα που δεν καλύπτει ΤΙΠΟΤΑ δεν σπάει τη μηχανή, απλώς πέφτει τελευταίο.
  const empty = mk('κενό', 1, []);
  const full = mk('γεμάτο', 99, ['Πυρκαγιά', 'Κλοπή', 'Αστική Ευθύνη', 'Σεισμός', 'Πλημμύρα'], { earthquake: true, flood: true });
  const ranked = matchPlans([empty, full], assessNeeds({ hasLoan: true, contentsValue: 30000 }));
  eq('το κενό πέφτει τελευταίο παρότι κοστίζει 1 ευρώ', ranked[1].plan.id, 'κενό');
}

console.log(fail === 0 ? `✓ insurance: ${pass} έλεγχοι πέρασαν` : `✗ insurance: ${fail} απέτυχαν από ${pass + fail}`);
if (fail > 0) process.exit(1);
