// npx tsx lib/billing/e2Reconcile.test.ts
//
// Το ερώτημα που ελέγχουμε δεν είναι «αφαιρεί σωστά» — είναι «λέει ψέματα;».
// Μια εξήγηση που ακούγεται σαν διάγνωση αλλά δεν στηρίζεται σε νούμερο είναι
// χειρότερη από τη σιωπή, γιατί ο χρήστης θα την επαναλάβει στον λογιστή του.
import { reconcileE2, TOLERANCE, type DeclaredRow, type OurEvidence } from './e2Reconcile';
import type { E2Row } from './e2';

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++; else { fail++; console.error(`✗ ${name}\n   got  ${g}\n   want ${w}`); }
}
function ok(name: string, cond: boolean) { if (cond) pass++; else { fail++; console.error(`✗ ${name}`); } }

const row = (o: Partial<E2Row> = {}): E2Row => ({
  atak: '11111111111', address: 'Οδός 1, 11111', ownerAfm: '123456789',
  ownershipPct: 100, leaseKind: 'Εκμίσθωση', months: 12,
  incomeCategory: 'Κατοικία', grossIncome: 7200, incomeSource: 'rent', flags: [], ...o,
});
const dec = (o: Partial<DeclaredRow> = {}): DeclaredRow => ({ atak: '11111111111', gross: 7200, ...o });
const ev = (o: Partial<OurEvidence> = {}): OurEvidence => ({ atak: '11111111111', ...o });

const codes = (l: { reasons: { code: string }[] }) => l.reasons.map(r => r.code);

// ═══ ΣΥΜΦΩΝΙΑ ════════════════════════════════════════════════════════════
{
  const r = reconcileE2([row()], [dec()]);
  eq('ίδια νούμερα → match', r.lines[0].verdict, 'match');
  eq('καμία εξήγηση όταν δεν υπάρχει διαφορά', r.lines[0].reasons.length, 0);
  eq('σύνολα', [r.totalOurs, r.totalTheirs, r.totalDiff], [7200, 7200, 0]);
  eq('τίποτα δεν χρειάζεται προσοχή', r.needsAttention, 0);
  ok('η επικεφαλίδα λέει ότι συμφωνούν', /συμφωνεί/.test(r.headline || ''));
}
{
  // Στρογγυλοποίηση ενός ευρώ ΔΕΝ είναι διαφορά — το buildE2Row στρογγυλοποιεί.
  const r = reconcileE2([row({ grossIncome: 7201 })], [dec({ gross: 7200 })]);
  eq('διαφορά εντός ανοχής → match', r.lines[0].verdict, 'match');
  const r2 = reconcileE2([row({ grossIncome: 7202 })], [dec({ gross: 7200 })]);
  ok('ένα ευρώ πάνω από την ανοχή ΦΑΙΝΕΤΑΙ', r2.lines[0].verdict !== 'match');
  eq('η ανοχή είναι δηλωμένη', TOLERANCE, 1);
}

// ═══ Η ΚΕΝΤΡΙΚΗ ΦΡΑΣΗ ════════════════════════════════════════════════════
{
  const r = reconcileE2([row({ grossIncome: 6900 })], [dec({ gross: 7200 })]);
  ok('η επικεφαλίδα δίνει και τα δύο νούμερα',
    /7\.200/.test(r.headline || '') && /6\.900/.test(r.headline || ''));
  ok('και τη διαφορά', /300/.test(r.headline || ''));
  eq('η ΑΑΔΕ δείχνει περισσότερα', r.lines[0].verdict, 'theirs_higher');
}

// ═══ ΜΗΝΕΣ — η συχνότερη πραγματική αιτία ════════════════════════════════
{
  const r = reconcileE2([row({ grossIncome: 6600, months: 11 })], [dec({ gross: 7200, months: 12 })]);
  const l = r.lines[0];
  ok('εξηγεί με τους μήνες', codes(l).includes('months'));
  ok('λέει και τα δύο πλήθη', /11/.test(l.reasons[0].text) && /12/.test(l.reasons[0].text));
  // 6600/11 = 600 ανά μήνα × (11−12) = −600, όσο ακριβώς η διαφορά.
  eq('η εξήγηση καλύπτει τη διαφορά', l.unexplained, 0);
  ok('και λέει ότι μπορεί να προχωρήσει', /εξηγείται πλήρως/.test(l.action));
}
{
  // Ίδιοι μήνες → ΔΕΝ επιτρέπεται να επικαλεστεί μήνες.
  const r = reconcileE2([row({ grossIncome: 6900 })], [dec({ gross: 7200, months: 12 })]);
  ok('ίδιοι μήνες: κανένας λόγος «μήνες»', !codes(r.lines[0]).includes('months'));
}
{
  // Το έντυπο δεν δείχνει μήνες → δεν εφευρίσκουμε σύγκριση μηνών.
  const r = reconcileE2([row({ grossIncome: 6900, months: 11 })], [dec({ gross: 7200 })]);
  ok('χωρίς μήνες στο έντυπο, κανένας λόγος «μήνες»', !codes(r.lines[0]).includes('months'));
}

// ═══ ΣΥΝΙΔΙΟΚΤΗΣΙΑ ═══════════════════════════════════════════════════════
{
  // Το έντυπο δείχνει ολόκληρο, εμείς το 50%.
  const r = reconcileE2([row({ grossIncome: 3600, ownershipPct: 50 })], [dec({ gross: 7200 })]);
  const l = r.lines[0];
  ok('εξηγεί με τη συνιδιοκτησία', codes(l).includes('ownership'));
  ok('λέει το ποσοστό', /50%/.test(l.reasons[0].text));
  eq('εξηγεί όλη τη διαφορά', l.unexplained, 0);
}
{
  // 50% αλλά τα νούμερα ΔΕΝ πέφτουν στην αναλογία → δεν το επικαλούμαστε.
  const r = reconcileE2([row({ grossIncome: 3000, ownershipPct: 50 })], [dec({ gross: 7200 })]);
  ok('αναλογία που δεν ταιριάζει: κανένας λόγος συνιδιοκτησίας',
    !codes(r.lines[0]).includes('ownership'));
  ok('και μένει ανεξήγητο', Math.abs(r.lines[0].unexplained!) > TOLERANCE);
}
{
  // 100% ιδιοκτησία → η εξήγηση δεν έχει νόημα ποτέ.
  const r = reconcileE2([row({ grossIncome: 3600 })], [dec({ gross: 7200 })]);
  ok('πλήρης ιδιοκτησία: κανένας λόγος συνιδιοκτησίας', !codes(r.lines[0]).includes('ownership'));
}

// ═══ ΒΡΑΧΥΧΡΟΝΙΑ: ΠΡΟΜΗΘΕΙΑ ΚΑΙ ΤΕΛΟΣ ═══════════════════════════════════
{
  // Ο χρήστης κατέγραψε payout· η πλατφόρμα δήλωσε ακαθάριστα.
  const r = reconcileE2(
    [row({ grossIncome: 8500 })], [dec({ gross: 10000 })],
    [ev({ shortTerm: true, platformFees: 1500 })],
  );
  const l = r.lines[0];
  ok('εξηγεί με την προμήθεια', codes(l).includes('platform_fee'));
  ok('λέει ότι είναι δαπάνη, όχι μείωση εσόδου', /δαπάνη σου, όχι μείωση/.test(l.reasons[0].text));
  eq('εξηγεί τη διαφορά', l.unexplained, 0);
}
{
  // ΙΔΙΑ δεδομένα αλλά ΜΑΚΡΟΧΡΟΝΙΑ → η προμήθεια δεν υπάρχει ως έννοια.
  const r = reconcileE2(
    [row({ grossIncome: 8500 })], [dec({ gross: 10000 })],
    [ev({ shortTerm: false, platformFees: 1500 })],
  );
  ok('μακροχρόνια: καμία επίκληση προμήθειας', !codes(r.lines[0]).includes('platform_fee'));
}
{
  // Η προμήθεια δεν ταιριάζει στο μέγεθος της διαφοράς → δεν την επικαλούμαστε.
  const r = reconcileE2(
    [row({ grossIncome: 8500 })], [dec({ gross: 10000 })],
    [ev({ shortTerm: true, platformFees: 200 })],
  );
  ok('προμήθεια εκτός μεγέθους: δεν μπαίνει', !codes(r.lines[0]).includes('platform_fee'));
}
{
  const r = reconcileE2(
    [row({ grossIncome: 9700 })], [dec({ gross: 10000 })],
    [ev({ shortTerm: true, climateLevy: 300 })],
  );
  ok('εξηγεί με το τέλος ανθεκτικότητας', codes(r.lines[0]).includes('climate_levy'));
  ok('και λέει ότι δεν είναι έσοδό σου', /Δεν είναι έσοδό σου/.test(r.lines[0].reasons[0].text));
}

// ═══ ΑΝΕΙΣΠΡΑΚΤΑ: ΠΡΟΕΙΔΟΠΟΙΗΣΗ, ΟΧΙ ΕΞΗΓΗΣΗ ════════════════════════════
{
  const r = reconcileE2(
    [row({ grossIncome: 6000 })], [dec({ gross: 7200 })],
    [ev({ unpaid: 1200 })],
  );
  const l = r.lines[0];
  ok('αναφέρει τα ανείσπρακτα', codes(l).includes('unpaid'));
  const unpaidReason = l.reasons.find(x => x.code === 'unpaid')!;
  // ΤΟ ΚΡΙΣΙΜΟ: τα ανείσπρακτα ΔΕΝ δικαιολογούν μικρότερο ποσό. Το Ε2 δηλώνει
  // δεδουλευμένα. Αν τους αποδίδαμε ποσό, θα λέγαμε στον χρήστη «είσαι εντάξει»
  // ενώ υποδηλώνει.
  eq('ΔΕΝ αποδίδεται ποσό στα ανείσπρακτα', unpaidReason.amount, null);
  ok('και το λέει ρητά', /ΔΕΔΟΥΛΕΥΜΕΝΑ/.test(unpaidReason.text));
  ok('η διαφορά μένει ανεξήγητη', Math.abs(l.unexplained!) > TOLERANCE);
  ok('και στέλνει στον λογιστή', /λογιστή/.test(l.action));
}

// ═══ ΟΤΑΝ ΔΕΝ ΞΕΡΟΥΜΕ, ΤΟ ΛΕΜΕ ══════════════════════════════════════════
{
  const r = reconcileE2(
    [row({ grossIncome: 6900 })], [dec({ gross: 7200 })],
    [ev({ unresolvedAmounts: 900 })],
  );
  const l = r.lines[0];
  ok('λέει ότι η βάση των ποσών είναι απροσδιόριστη', codes(l).includes('unresolved_basis'));
  eq('χωρίς να αποδίδει ποσό', l.reasons.find(x => x.code === 'unresolved_basis')!.amount, null);
  ok('και ότι η σύγκριση δεν είναι ασφαλής', /δεν είναι ασφαλής/.test(l.reasons.find(x => x.code === 'unresolved_basis')!.text));
}
{
  const r = reconcileE2([row({ grossIncome: 6900, flags: ['Ακαθάριστο εισόδημα: εκτίμηση (μηνιαίο × μήνες)'] })], [dec({ gross: 7200 })]);
  ok('παραδέχεται ότι το δικό μας είναι εκτίμηση', codes(r.lines[0]).includes('ours_estimated'));
  eq('χωρίς ποσό', r.lines[0].reasons.find(x => x.code === 'ours_estimated')!.amount, null);
}
{
  // Καμία απόδειξη → ΚΑΜΙΑ εξήγηση. Αυτό είναι το σημαντικότερο τεστ του αρχείου.
  const r = reconcileE2([row({ grossIncome: 6900 })], [dec({ gross: 7200 })]);
  eq('χωρίς στοιχεία, καμία εφευρεμένη εξήγηση', r.lines[0].reasons.length, 0);
  eq('και όλη η διαφορά μένει ανεξήγητη', r.lines[0].unexplained, -300);
  ok('η ενέργεια το λέει καθαρά', /δεν εξηγούνται|χωρίς εξήγηση/.test(r.lines[0].action));
}

// ═══ ΤΑΥΤΙΣΗ ΜΟΝΟ ΜΕ ΑΤΑΚ ════════════════════════════════════════════════
{
  const r = reconcileE2([row({ atak: '' })], [dec()]);
  eq('χωρίς ΑΤΑΚ δεν γίνεται σύγκριση', r.lines[0].verdict, 'only_ours');
  ok('και εξηγεί γιατί', codes(r.lines[0]).includes('no_atak'));
  ok('η γραμμή του εντύπου εμφανίζεται χωριστά', r.lines.some(l => l.verdict === 'only_theirs'));
}
{
  // Κενά και πεζά/κεφαλαία δεν πρέπει να χαλάνε την ταύτιση.
  const r = reconcileE2([row({ atak: ' 111 111 11111 ' })], [dec({ atak: '11111111111' })]);
  eq('ο ΑΤΑΚ κανονικοποιείται', r.lines[0].verdict, 'match');
}
{
  // Το πιο επικίνδυνο: το κράτος ξέρει εισόδημα που εμείς δεν έχουμε.
  const r = reconcileE2([], [dec({ gross: 4800 })]);
  eq('γραμμή εντύπου χωρίς δικό μας ακίνητο', r.lines[0].verdict, 'only_theirs');
  ok('και λέει τι να κάνει', /Πρόσθεσέ το|διόρθωση/.test(r.lines[0].action));
  eq('μετράει στα σύνολα του εντύπου', r.totalTheirs, 4800);
}

// ═══ ΧΑΡΤΟΦΥΛΑΚΙΟ ════════════════════════════════════════════════════════
{
  const r = reconcileE2(
    [row({ atak: 'A1', grossIncome: 7200 }), row({ atak: 'A2', grossIncome: 4800 })],
    [dec({ atak: 'A1', gross: 7200 }), dec({ atak: 'A2', gross: 5400 })],
  );
  eq('σύνολα χαρτοφυλακίου', [r.totalOurs, r.totalTheirs], [12000, 12600]);
  eq('μία γραμμή χρειάζεται προσοχή', r.needsAttention, 1);
  eq('η πρώτη συμφωνεί', r.lines[0].verdict, 'match');
}
{
  // Τα σύνολα συμφωνούν αλλά οι γραμμές όχι — παγίδα που περνά απαρατήρητη.
  const r = reconcileE2(
    [row({ atak: 'A1', grossIncome: 8000 }), row({ atak: 'A2', grossIncome: 4000 })],
    [dec({ atak: 'A1', gross: 7000 }), dec({ atak: 'A2', gross: 5000 })],
  );
  eq('συνολική διαφορά μηδέν', r.totalDiff, 0);
  eq('αλλά δύο γραμμές διαφέρουν', r.needsAttention, 2);
  ok('και η επικεφαλίδα το λέει', /σύνολα συμφωνούν/.test(r.headline || ''));
}

// ═══ ΑΝΤΟΧΗ ══════════════════════════════════════════════════════════════
{
  const r = reconcileE2([], []);
  eq('κενή είσοδος δεν σκάει', r.lines.length, 0);
  eq('χωρίς επικεφαλίδα όταν δεν υπάρχει τι να πει', r.headline, null);
  eq('μηδενικά σύνολα', [r.totalOurs, r.totalTheirs, r.totalDiff], [0, 0, 0]);
}
{
  const r = reconcileE2([row({ grossIncome: 0 })], [dec({ gross: 0 })]);
  eq('μηδενικά και στις δύο πλευρές → match', r.lines[0].verdict, 'match');
}
{
  // Κανένας λόγος δεν επιτρέπεται να είναι κενός ή χωρίς κωδικό.
  const r = reconcileE2(
    [row({ grossIncome: 6000, months: 10, ownershipPct: 50, flags: ['Ακαθάριστο εισόδημα: εκτίμηση'] })],
    [dec({ gross: 7200, months: 12 })],
    [ev({ shortTerm: true, platformFees: 1200, unpaid: 300, unresolvedAmounts: 100 })],
  );
  const l = r.lines[0];
  ok('κάθε λόγος έχει κωδικό', l.reasons.every(x => x.code.length > 0));
  ok('κάθε λόγος έχει κείμενο με ουσία', l.reasons.every(x => x.text.length > 25));
  ok('κανένας διπλός κωδικός', new Set(l.reasons.map(x => x.code)).size === l.reasons.length);
  // Οι ποσοτικοί λόγοι μπαίνουν πριν τους ποιοτικούς.
  const firstQualitative = l.reasons.findIndex(x => x.amount == null);
  const lastQuantitative = l.reasons.map(x => x.amount).lastIndexOf(l.reasons.filter(x => x.amount != null).slice(-1)[0]?.amount ?? null);
  ok('πρώτα όσα εξηγούν ευρώ', firstQualitative === -1 || firstQualitative >= lastQuantitative);
}

console.log(fail === 0 ? `✓ e2Reconcile: ${pass} έλεγχοι πέρασαν` : `✗ e2Reconcile: ${fail} απέτυχαν από ${pass + fail}`);
if (fail > 0) process.exit(1);
