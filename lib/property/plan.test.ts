// npx tsx lib/property/plan.test.ts
//
// Τα tests δεν ελέγχουν μόνο ότι ο κώδικας τρέχει. Ελέγχουν ΤΙ ΥΠΟΣΧΕΘΗΚΕ ΤΟ
// ΠΕΡΙΕΧΟΜΕΝΟ: ότι η σειρά στα αμφισβητούμενα δεν αντιστρέφεται, ότι το «άφησέ
// το κενό» εμφανίζεται με το κόστος του, ότι κανένα ποσοστό επιδότησης δεν
// καρφώνεται και ότι ο φόρος υπεραξίας δεν δηλώνεται κατηγορηματικά προς
// καμία κατεύθυνση. Αυτά είναι τα σημεία όπου μια «βελτίωση» μπορεί να κάνει
// ζημιά σιωπηλά.

import {
  planFor, nextStep, progressOf, groupSteps, vacancyCost, renovationLoan, saleEstimate,
  isPlanStatus, PLAN_STATUSES, PLAN_DISCLAIMER, DISPUTE_KINDS, ACTOR_LABEL,
  EFFORT_LABEL, RISK_LABEL, FUNDING_KIND_LABEL, RENO_GROUPS,
  type Plan, type Step, type PlanStatus, type DisputeKind,
} from './plan';
import type { PropertyStatus } from './status';

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; } else { fail++; console.error(`✗ ${name}\n   got  ${g}\n   want ${w}`); }
}
function ok(name: string, cond: boolean) { if (cond) { pass++; } else { fail++; console.error(`✗ ${name}`); } }

const plan = (status: PropertyStatus, over: Partial<Parameters<typeof planFor>[0]> = {}): Plan => {
  const p = planFor({ status, ...over });
  if (!p) throw new Error(`κανένα σχέδιο για ${status}`);
  return p;
};
const idx = (steps: readonly Step[], id: string): number => steps.findIndex(s => s.id === id);
const allText = (p: Plan): string => JSON.stringify(p);
// Το ΠΕΡΙΕΧΟΜΕΝΟ χωρίς τις διευθύνσεις: οι επίσημες πηγές έχουν χρονολογία μέσα
// στο URL τους (π.χ. σελίδα κύκλου προγράμματος) και αυτό είναι σωστό. Ο
// φρουρός των «καρφωμένων» στοιχείων κοιτάζει τα κείμενα, όχι τους συνδέσμους.
const prose = (p: Plan): string =>
  JSON.stringify(p, (k, v) => (k === 'href' ? undefined : v));

// ═══ ΠΟΙΕΣ ΚΑΤΑΣΤΑΣΕΙΣ ΕΧΟΥΝ ΣΧΕΔΙΟ ══════════════════════════════════════
// Οι καταστάσεις που αποδίδουν έχουν ήδη τις καρτέλες τους. Ένα δεύτερο
// «σχέδιο» εκεί θα ήταν θόρυβος, όχι βοήθεια.
eq('τέσσερις καταστάσεις με σχέδιο', [...PLAN_STATUSES].sort(), ['disputed', 'for_sale', 'renovation', 'vacant']);
ok('η μίσθωση δεν έχει σχέδιο', planFor({ status: 'rent_long' }) === null);
ok('η βραχυχρόνια δεν έχει σχέδιο', planFor({ status: 'rent_short' }) === null);
ok('η ιδιοχρησία δεν έχει σχέδιο', planFor({ status: 'own_use' }) === null);
ok('isPlanStatus διακρίνει', isPlanStatus('vacant') && !isPlanStatus('own_use'));

// ═══ ΤΟ ΕΝΑ ΕΠΟΜΕΝΟ ΒΗΜΑ ══════════════════════════════════════════════════
// Η οθόνη απαντά σε ΜΙΑ ερώτηση. Άρα υπάρχει ΕΝΑ βήμα στην κορυφή, ποτέ δέκα
// ισοδύναμα.
for (const s of PLAN_STATUSES) {
  const p = plan(s);
  ok(`${s}: υπάρχει επόμενο βήμα`, p.next !== null);
  eq(`${s}: το επόμενο είναι το πρώτο ατελείωτο`, p.next?.id, p.steps[0].id);
  ok(`${s}: υπάρχει ακολουθία βημάτων`, p.steps.length >= 4);
  ok(`${s}: τίτλος και εισαγωγή`, p.headline.length > 20 && p.lede.length > 40);
  ok(`${s}: κάθε βήμα έχει ρήμα, εξήγηση και υπεύθυνο`,
    p.steps.every(x => x.title.length > 5 && x.detail.length > 20 && x.who in ACTOR_LABEL));
  ok(`${s}: μοναδικά id βημάτων`, new Set(p.steps.map(x => x.id)).size === p.steps.length);
  ok(`${s}: υπάρχουν κανόνες που κοστίζουν χρήματα`, p.rules.length >= 3);
  ok(`${s}: κάθε «προς επιβεβαίωση» λέει τι, πού και γιατί`,
    p.verify.length > 0 && p.verify.every(v => v.what.length > 20 && v.where.length > 5 && v.why.length > 20));
}

// Όταν τσεκάρεις το πρώτο, το επόμενο προχωράει. Όταν τελειώσουν όλα, δεν
// επινοείται ένατο βήμα για να γεμίσει η οθόνη.
{
  const p0 = plan('vacant');
  const p1 = plan('vacant', { done: [p0.steps[0].id] });
  eq('το επόμενο προχωράει', p1.next?.id, p0.steps[1].id);
  eq('η πρόοδος μετράει', p1.progress.done, 1);
  const all = plan('vacant', { done: p0.steps.map(s => s.id) });
  ok('όταν τελειώσουν όλα, δεν υπάρχει επόμενο', all.next === null);
  eq('100%', all.progress.pct, 100);
  eq('άγνωστα id αγνοούνται', plan('vacant', { done: ['ανύπαρκτο'] }).progress.done, 0);
  eq('κενή λίστα βημάτων δεν σκάει', progressOf([], []), { done: 0, total: 0, pct: 0 });
  ok('nextStep σε κενό', nextStep([], []) === null);
}

// ═══ ΚΕΝΟ: Η ΣΥΓΚΡΙΣΗ ΜΕ ΠΡΑΓΜΑΤΙΚΟ ΚΡΙΤΗΡΙΟ ═════════════════════════════
// Ο φοιτητής με το εξοχικό νομίζει ότι το κενό είναι δωρεάν. Η σύγκριση πρέπει
// να απαντά σε τέσσερα πράγματα ΓΙΑ ΚΑΘΕ επιλογή: τι βγάζει, τι κόπο θέλει, τι
// ρίσκο έχει, πόσο γρήγορα — και τι πληρώνεις γι' αυτήν.
{
  const p = plan('vacant');
  const ids = p.options.map(o => o.id);
  ok('πέντε δρόμοι συν το να μην κάνεις τίποτα', p.options.length === 6);
  ok('μακροχρόνια, βραχυχρόνια, ανακαίνιση, παραχώρηση, πώληση',
    ['long_lease', 'short_lease', 'renovate_then_let', 'family_use', 'sell'].every(x => ids.includes(x)));

  // ΤΟ ΣΗΜΑΝΤΙΚΟΤΕΡΟ TEST ΤΗΣ ΟΘΟΝΗΣ: το «άφησέ το κενό» είναι έγκυρη επιλογή
  // και εμφανίζεται — αλλά ΜΕ το κόστος της.
  const keep = p.options.find(o => o.id === 'keep_vacant');
  ok('το «το αφήνω όπως είναι» υπάρχει', !!keep);
  ok('...και δεν υπόσχεται τίποτα', !!keep && /Τίποτα/.test(keep.payoff));
  ok('...με ΕΝΦΙΑ στο κόστος', !!keep && keep.cost.includes('ΕΝΦΙΑ'));
  ok('...με τεκμήρια στο κόστος', !!keep && keep.cost.includes('τεκμήρια'));
  ok('...με φθορά στο κόστος', !!keep && /υγρασία|χαλάει/.test(keep.cost));
  ok('...και λέει πότε είναι σωστή', !!keep && keep.fits.length > 40);

  ok('κάθε επιλογή έχει κόστος', p.options.every(o => o.cost.length > 30));
  ok('κάθε επιλογή έχει και τους τέσσερις άξονες',
    p.options.every(o => o.payoff.length > 30 && o.speed.length > 3 && o.fits.length > 20
      && o.effort in EFFORT_LABEL && o.risk in RISK_LABEL));
  // Οι άξονες ΔΙΑΦΕΡΟΥΝ. Αν όλα ήταν «χαμηλό ρίσκο, λίγος κόπος», η σύγκριση
  // θα ήταν διαφημιστική.
  ok('ο κόπος διαφέρει ανά επιλογή', new Set(p.options.map(o => o.effort)).size >= 3);
  ok('το ρίσκο διαφέρει ανά επιλογή', new Set(p.options.map(o => o.risk)).size >= 3);

  // Η βραχυχρόνια δεν προτείνεται χωρίς τον ΑΜΑ: είναι η παγίδα του αρχάριου.
  const short = p.options.find(o => o.id === 'short_lease');
  ok('η βραχυχρόνια προειδοποιεί για τον Αριθμό Μητρώου', !!short && short.cost.includes('Μητρώου'));
  // Η μακροχρόνια λέει ότι τα μετρητά κοστίζουν.
  const long = p.options.find(o => o.id === 'long_lease');
  ok('η μακροχρόνια λέει για τραπεζική είσπραξη', !!long && /τραπεζικ/.test(long.cost));

  // Το κενό δηλώνεται. Είναι το πράγμα που ο 25χρονος δεν ξέρει.
  ok('βήμα δήλωσης κενού στο Ε2', idx(p.steps, 'vacant-declare') >= 0);
  ok('και βήμα απόδειξης του κενού', idx(p.steps, 'vacant-proof') >= 0);
  ok('πρώτο βήμα: το νούμερο του μήνα', p.steps[0].id === 'vacant-cost');
}

// ═══ ΑΜΦΙΣΒΗΤΟΥΜΕΝΟ: Η ΣΕΙΡΑ ΕΙΝΑΙ ΤΟ ΠΡΟΪΟΝ ═════════════════════════════
// Η δικαστική ενέργεια ΠΡΕΠΕΙ να προηγείται της δήλωσης. Αντεστραμμένη σειρά
// σημαίνει φόρος για ενοίκια που δεν εισπράχθηκαν. Αυτό το test φυλάει
// ακριβώς αυτό.
{
  const p = plan('disputed', { disputeKind: 'unpaid_rent' });
  const iDemand = idx(p.steps, 'dis-rent-demand');
  const iLegal = idx(p.steps, 'dis-rent-legal');
  const iDeclare = idx(p.steps, 'dis-rent-declare');
  const iFile = idx(p.steps, 'dis-rent-file');
  ok('ο φάκελος πρώτος', iFile === 0);
  ok('η όχληση πριν τη δικαστική ενέργεια', iDemand < iLegal);
  ok('η δικαστική ενέργεια ΠΡΙΝ τη δήλωση', iLegal < iDeclare);
  const legal = p.steps[iLegal];
  ok('...και το λέει ρητά στο «πότε»', /ΠΡΙΝ/.test(legal.when ?? ''));
  ok('...και εξηγεί τι κοστίζει η αντιστροφή', /φορολογούνται|φόρο/.test(legal.cost ?? ''));
  const declare = p.steps[iDeclare];
  ok('η δήλωση λέει «ποτέ πριν»', /ποτέ πριν/.test(declare.when ?? ''));
  ok('τα ανείσπρακτα έχουν δική τους στήλη', /στήλη/.test(declare.detail));
  ok('η νομική ενέργεια δεν είναι δουλειά του χρήστη', legal.who === 'lawyer');
}

// Κάθε είδος εκκρεμότητας έχει ΔΙΚΗ ΤΟΥ σειρά. Μια κληρονομιά δεν λύνεται με
// εξώδικο σε μισθωτή.
{
  for (const k of DISPUTE_KINDS) {
    const p = plan('disputed', { disputeKind: k.key });
    ok(`${k.key}: έχει δική του ακολουθία`, p.steps.length >= 5);
    ok(`${k.key}: κλείνει με τα τιμολόγια και την αλλαγή κατάστασης`,
      idx(p.steps, 'dis-fees') >= 0 && idx(p.steps, 'dis-close') === p.steps.length - 1);
  }
  eq('προεπιλογή: δεν ξέρουμε ακόμη', plan('disputed').steps[0].id, 'dis-unk-write');

  // Ο 25χρονος που κληρονόμησε: το πρώτο πράγμα είναι να ΜΗΝ κάνει κάτι.
  const inh = plan('disputed', { disputeKind: 'inheritance' });
  eq('πρώτο βήμα κληρονομιάς: μην αγγίξεις τίποτα', inh.steps[0].id, 'dis-inh-freeze');
  ok('...γιατί η σιωπηρή αποδοχή κλείνει την αποποίηση', /σιωπηρή αποδοχή/.test(inh.steps[0].cost ?? ''));
  ok('η προθεσμία αποποίησης είναι το δεύτερο βήμα', inh.steps[1].id === 'dis-inh-deadline');
  ok('...χωρίς να επινοείται αριθμός μηνών', !/\d+\s*(μήν|έτ)/.test(inh.steps[1].detail));
  ok('η αποποίηση μπαίνει στα «προς επιβεβαίωση»', inh.verify.some(v => v.id === 'v-dis-renounce'));
  ok('το Ε9 δεν ξεχνιέται', idx(inh.steps, 'dis-inh-e9') >= 0);

  // Συνιδιοκτησία: ο καθένας δηλώνει το ποσοστό του και η δικαστική οδός είναι
  // η τελευταία επιλογή — όχι η πρώτη.
  const co = plan('disputed', { disputeKind: 'co_ownership' });
  ok('τα ποσοστά από τους τίτλους πρώτα', co.steps[0].id === 'dis-co-shares');
  ok('η εξαγορά πριν το δικαστήριο', idx(co.steps, 'dis-co-buyout') < idx(co.steps, 'dis-co-court'));

  // Οφειλή: οι προθεσμίες μετριούνται σε ημέρες.
  const debt = plan('disputed', { disputeKind: 'debt' });
  ok('τα βάρη πρώτα', debt.steps[0].id === 'dis-debt-encumbrance');
  ok('προειδοποίηση για ανατρεπτικές προθεσμίες',
    debt.steps.some(s => /ανατρεπτικές|ημέρες/.test(s.cost ?? '')));

  // Η οθόνη δηλώνει ότι δεν είναι δικηγόρος. Σε νομικά, αυτό δεν είναι
  // διακοσμητικό.
  ok('δηλώνει ότι δεν είναι δικηγόρος', plan('disputed').rules.some(r => /δικηγόρος/.test(r.title)));
  ok('...και ότι οι φορολογικές προθεσμίες δεν περιμένουν',
    plan('disputed').rules.some(r => /προθεσμίες/.test(r.title)));
}

// ═══ ΠΡΟΣ ΠΩΛΗΣΗ: ΤΑ ΧΑΡΤΙΑ ΠΡΙΝ ΤΗΝ ΑΓΓΕΛΙΑ ═════════════════════════════
{
  const p = plan('for_sale');
  ok('ο τίτλος ελέγχεται πρώτος', p.steps[0].id === 'sale-title');
  ok('βεβαίωση μηχανικού πριν την αγγελία', /αγγελία/.test(p.steps[idx(p.steps, 'sale-engineer')].when ?? ''));
  ok('αυθαίρετα: τακτοποίηση πριν', /αυθαίρετ/.test(p.steps[idx(p.steps, 'sale-engineer')].detail));
  ok('ΠΕΑ', idx(p.steps, 'sale-pea') >= 0);
  ok('πιστοποιητικά πριν το ραντεβού υπογραφής', idx(p.steps, 'sale-certs') >= 0);
  ok('κόστος κτήσης και βελτιώσεις χωριστά', /βελτίωση|βελτίωσης/.test(p.steps[idx(p.steps, 'sale-basis')].cost ?? ''));
  ok('το Ε9 μετά την πώληση', /Ε9/.test(p.steps[idx(p.steps, 'sale-after')].detail));
  ok('ο μηχανικός πριν την τιμή', idx(p.steps, 'sale-engineer') < idx(p.steps, 'sale-price'));

  // ΦΟΡΟΣ ΥΠΕΡΑΞΙΑΣ: ούτε «ισχύει» ούτε «δεν ισχύει». Ρητή σήμανση.
  const cgt = p.verify.find(v => v.id === 'v-sale-cgt');
  ok('ο φόρος υπεραξίας είναι «προς επιβεβαίωση»', !!cgt);
  ok('...και λέει ρητά ότι δεν θεωρείται δεδομένος προς καμία κατεύθυνση',
    !!cgt && /καμία κατεύθυνση/.test(cgt.why));
  ok('...και ότι η αναστολή ανανεώνεται', !!cgt && /ανανεώνεται/.test(cgt.why));
  ok('πουθενά κατηγορηματικό «δεν επιβαρύνει»', !/δεν επιβαρύνει/.test(allText(p)));

  // Ιδέες πώλησης, συγκρίσιμες όπως και στο κενό.
  const ids = p.options.map(o => o.id);
  ok('με μεσίτη ή μόνος σου', ids.includes('with_agent') && ids.includes('by_owner'));
  ok('πώληση με ενοικιαστή μέσα', ids.includes('sell_with_tenant'));
  ok('και η επιλογή «μην πουλήσεις τώρα»', ids.includes('rent_instead'));
  ok('κάθε ιδέα έχει κόστος', p.options.every(o => o.cost.length > 30));
  ok('η αποκλειστικότητα αόριστου χρόνου προειδοποιείται',
    p.options.some(o => /αόριστ/.test(o.cost)));
}

// ═══ ΑΝΑΚΑΙΝΙΣΗ: ΙΕΡΑΡΧΗΣΗ, ΟΧΙ ΛΙΣΤΑ ΕΠΙΘΥΜΙΩΝ ══════════════════════════
{
  const p = plan('renovation');
  const iWater = idx(p.steps, 'reno-water');
  const iElec = idx(p.steps, 'reno-electric');
  const iHeat = idx(p.steps, 'reno-heating');
  const iKitchen = idx(p.steps, 'reno-kitchen-bath');
  const iCosmetic = idx(p.steps, 'reno-cosmetic');
  ok('η στεγανότητα πριν τα αισθητικά', iWater < iCosmetic);
  ok('τα ηλεκτρολογικά πριν τα αισθητικά', iElec < iCosmetic);
  ok('η θέρμανση πριν τα αισθητικά', iHeat < iCosmetic);
  ok('η κουζίνα/μπάνιο πριν τα χρώματα', iKitchen < iCosmetic);
  ok('η ενεργειακή αναβάθμιση πριν τα χρώματα', idx(p.steps, 'reno-energy') < iCosmetic);
  ok('τα χρώματα είναι στην τελευταία ομάδα', p.steps[iCosmetic].group === RENO_GROUPS.cosmetic);
  ok('ο έλεγχος επιδοτήσεων πριν το πρώτο συνεργείο', idx(p.steps, 'reno-funding') < iWater);
  ok('η στεγανότητα εξηγεί γιατί είναι πρώτη', /δύο φορές/.test(p.steps[iWater].cost ?? ''));

  // Οι ομάδες βγαίνουν με σειρά και δεν σπάνε.
  const groups = groupSteps(p.steps);
  eq('τέσσερις ομάδες προτεραιότητας', groups.map(g => g.group),
    [RENO_GROUPS.before, RENO_GROUPS.blocking, RENO_GROUPS.value, RENO_GROUPS.cosmetic]);
  eq('κανένα βήμα δεν χάνεται στην ομαδοποίηση',
    groups.reduce((s, g) => s + g.items.length, 0), p.steps.length);
  eq('βήματα χωρίς ομάδα μένουν χωρίς ομάδα', groupSteps(plan('vacant').steps).map(g => g.group), [null]);

  // ΤΑ ΜΕΤΡΗΤΑ ΔΕΝ ΕΚΠΙΠΤΟΥΝ. Ρητά, με κεφαλαία στον κανόνα.
  const cash = p.rules.find(r => r.id === 'reno-rule-cash');
  ok('κανόνας: τα μετρητά δεν εκπίπτουν', !!cash && /μετρητά/.test(cash.title));
  ok('...και ζητά τιμολόγιο στο ΑΦΜ', !!cash && /ΑΦΜ/.test(cash.body));
  ok('κανόνας: βελτίωση ≠ συντήρηση', p.rules.some(r => r.id === 'reno-rule-classify'));
  ok('κανόνας: μη ξεκινάς πριν την έγκριση', p.rules.some(r => r.id === 'reno-rule-order'));

  // ΚΡΑΤΙΚΑ ΠΡΟΓΡΑΜΜΑΤΑ ΚΑΙ ΔΑΝΕΙΑ ΕΠΙΣΚΕΥΗΣ.
  const fids = p.funding.map(f => f.id);
  ok('Εξοικονομώ', fids.includes('exoikonomo'));
  ok('Ανακαινίζω–Νοικιάζω', fids.includes('anakainizo'));
  ok('έκπτωση φόρου', fids.includes('tax-credit'));
  ok('επισκευαστικό δάνειο', fids.includes('repair-loan'));
  ok('και η διόρθωση ότι το «Σπίτι μου ΙΙ» ΔΕΝ είναι ανακαίνιση',
    p.funding.some(f => f.id === 'not-spiti-mou' && /ΑΓΟΡΑ/.test(f.what)));
  ok('κάθε χρηματοδότηση έχει ρητό «τι να επιβεβαιώσεις»',
    p.funding.every(f => f.confirm.length > 40 && f.kind in FUNDING_KIND_LABEL));
  ok('τα προγράμματα παραπέμπουν σε επίσημη πηγή',
    p.funding.filter(f => f.kind === 'grant').every(f => (f.href ?? '').startsWith('https://')));
}

// ═══ ΤΙ ΔΕΝ ΕΠΙΝΟΕΙΤΑΙ ════════════════════════════════════════════════════
// Ο φρουρός αυτής της οθόνης: ΚΑΝΕΝΑ ποσοστό επιδότησης, κανένα εισοδηματικό
// όριο, καμία ημερομηνία κύκλου. Αυτά αλλάζουν και ένα λάθος νούμερο εδώ
// κοστίζει πραγματικά λεφτά σε άνθρωπο που το πίστεψε.
{
  // Ο ΦΡΟΥΡΟΣ ΗΤΑΝ ΑΠΟΛΥΤΟΣ, ΚΑΙ Ο ΑΠΟΛΥΤΟΣ ΦΡΟΥΡΟΣ ΠΑΡΑΚΑΜΠΤΕΤΑΙ.
  //
  // Απαγόρευε ΚΑΘΕ ποσοστό, ποσό και χρονολογία σε ολόκληρο το σχέδιο, χωρίς να
  // ρωτά από πού προέρχεται. Ο σκοπός ήταν σωστός — «κανένα νούμερο που δεν
  // ξέρουμε» — αλλά η διατύπωση έλεγε «κανένα νούμερο» και έτσι απέκλειε και τα
  // ΤΕΚΜΗΡΙΩΜΕΝΑ: το άρθρο 47Α ΚΦΔ και την απόφαση Α.1158/2026 (ΦΕΚ Β΄ 4719),
  // δηλαδή ακριβώς την πληροφορία που κανένας ανταγωνιστής δεν δίνει και που
  // αλλάζει το αν ένα κατασχεμένο ακίνητο μπορεί να πουληθεί.
  //
  // Ένας κανόνας που εμποδίζει τη σωστή δουλειά δεν τηρείται· χαλαρώνει. Οπότε
  // δεν χαλαρώνει: γίνεται ΑΚΡΙΒΕΣΤΕΡΟΣ. Αριθμός επιτρέπεται μόνο όταν η ΙΔΙΑ
  // καταχώρηση λέει και από πού προκύπτει — ΦΕΚ, αριθμός απόφασης, ή άρθρο
  // νόμου. Ο έλεγχος γίνεται ανά καταχώρηση, όχι σε συνενωμένο κείμενο, ώστε μια
  // παραπομπή σε ένα σημείο να μη νομιμοποιεί νούμερο σε άλλο.
  const CITED = /ΦΕΚ|Α\.\d{3,4}\/\d{4}|άρθρο\s+\d+Α?\s+(του\s+)?(Κώδικα Φορολογικής Διαδικασίας|Κ\.?Φ\.?Δ\.?)/;
  const NUMERIC: { name: string; re: RegExp }[] = [
    { name: 'ποσοστό',     re: /\d+\s*%/ },
    { name: 'ποσό σε ευρώ', re: /\d+([.,]\d+)?\s*(€|ευρώ)/ },
    { name: 'χρονολογία',  re: /\b(19|20)\d{2}\b/ },
  ];
  const cells = (p: Plan): { id: string; text: string }[] => [
    ...p.steps.map(x => ({ id: x.id, text: [x.title, x.detail, x.when, x.cost].filter(Boolean).join(' ') })),
    ...p.options.map(x => ({ id: x.id, text: [x.title, x.payoff, x.speed, x.fits, x.cost].join(' ') })),
    ...p.rules.map(x => ({ id: x.id, text: `${x.title} ${x.body}` })),
    ...p.funding.map(x => ({ id: x.id, text: `${x.title} ${x.what} ${x.confirm}` })),
    ...p.verify.map(x => ({ id: x.id, text: `${x.what} ${x.where} ${x.why}` })),
  ];

  for (const s of PLAN_STATUSES) {
    for (const c of cells(plan(s))) {
      for (const n of NUMERIC) {
        if (!n.re.test(c.text)) continue;
        ok(`${c.id}: ${n.name} μόνο με παραπομπή σε ΦΕΚ, απόφαση ή άρθρο νόμου`, CITED.test(c.text));
      }
    }
    ok(`${s}: χωρίς emoji`, !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(prose(plan(s))));
  }
  // Και η τεκμηρίωση δεν είναι διακοσμητική: η νέα διαδρομή του 47Α πρέπει να
  // λέει ΚΑΙ τον δρόμο (πού υποβάλλεται) ΚΑΙ την παγίδα (πόσο ισχύει).
  {
    const d = planFor({ status: 'disputed', disputeKind: 'debt' })!;
    const step = d.steps.find(x => x.id === 'dis-debt-47a');
    ok('η διαδρομή του 47Α υπάρχει στα βήματα', !!step);
    ok('...και λέει πού υποβάλλεται η αίτηση', !!step && /myAADE/.test(step.detail));
    ok('...και ότι η άρση ισχύει έναν μήνα', !!step && /έναν μήνα/.test(step.cost ?? ''));
    const v = d.verify.find(x => x.id === 'v-dis-debt-47a');
    ok('το ποσοστό ζει στο «προς επιβεβαίωση», με ΦΕΚ', !!v && /ΦΕΚ/.test(v.where) && /25\s*%/.test(v.what));
    ok('...και δηλώνεται ως δάπεδο, όχι ως απάντηση', !!v && /δάπεδο/.test(v.why));
    ok('ο ίδιος δρόμος υπάρχει και στην πώληση',
      plan('for_sale').rules.some(r => r.id === 'sale-rule-47a'));
  }
  // Το «Σπίτι μου ΙΙ» επιτρέπεται ονομαστικά και τα ηλικιακά όρια έρχονται από
  // τη ΜΙΑ πηγή (lib/loans/recommend), δεν ξαναγράφονται εδώ.
  const f = plan('renovation').funding.find(x => x.id === 'not-spiti-mou');
  ok('τα ηλικιακά όρια έρχονται από το lib/loans', !!f && /25–50/.test(f.what));
  ok('...και οι κύκλοι/προθεσμίες μένουν προς επιβεβαίωση', !!f && /κύκλοι/.test(f.confirm));
  ok('υπάρχει καθολική δήλωση ότι δεν υποκαθιστά επαγγελματία',
    /δικηγόρο|λογιστή/.test(PLAN_DISCLAIMER) && PLAN_DISCLAIMER.length > 80);
}

// ═══ ΤΟ ΝΟΥΜΕΡΟ ΤΟΥ ΚΕΝΟΥ ═════════════════════════════════════════════════
{
  const c = vacancyCost({ enfiaYear: 480, commonMonthly: 35, utilitiesMonthly: 15, insuranceYear: 120 });
  eq('ΕΝΦΙΑ διά δώδεκα', c.parts[0].monthly, 40);
  eq('μηνιαίο σύνολο', c.monthly, 100);
  eq('ετήσιο σύνολο', c.yearly, 1200);
  eq('τέσσερα σκέλη', c.parts.length, 4);
  const empty = vacancyCost({});
  eq('χωρίς δεδομένα, μηδέν και καμία γραμμή', [empty.monthly, empty.parts.length], [0, 0]);
  eq('τα αρνητικά αγνοούνται', vacancyCost({ commonMonthly: -50 }).monthly, 0);
  eq('τα σκουπίδια αγνοούνται', vacancyCost({ enfiaYear: NaN }).monthly, 0);
  ok('μόνο ό,τι δόθηκε εμφανίζεται', vacancyCost({ commonMonthly: 30 }).parts.length === 1);
}

// ═══ ΔΑΝΕΙΟ ΕΠΙΣΚΕΥΗΣ — ΜΙΑ ΠΗΓΗ ΑΛΗΘΕΙΑΣ ════════════════════════════════
{
  const l = renovationLoan(20000, 6, 7);
  ok('υπάρχει δόση', !!l && l.monthly > 0);
  ok('η δόση είναι λογική για 20.000 σε 7 έτη', !!l && l.monthly > 250 && l.monthly < 350);
  ok('το σύνολο είναι κεφάλαιο συν τόκοι', !!l && l.total === 20000 + l.interest);
  const zero = renovationLoan(12000, 0, 5);
  eq('άτοκο: κεφάλαιο διά μήνες', zero?.monthly, 200);
  eq('άτοκο: μηδέν τόκοι', zero?.interest, 0);
  ok('χωρίς ποσό, κανένας υπολογισμός', renovationLoan(0, 5, 5) === null);
  ok('χωρίς διάρκεια, κανένας υπολογισμός', renovationLoan(10000, 5, 0) === null);
}

// ═══ ΚΑΘΑΡΟ ΕΣΟΔΟ ΠΩΛΗΣΗΣ — ΧΩΡΙΣ ΨΕΥΔΗ ΒΕΒΑΙΟΤΗΤΑ ══════════════════════
{
  const e = saleEstimate(200000);
  ok('υπάρχει εκτίμηση', !!e);
  ok('το καθαρό είναι μικρότερο από το τίμημα', !!e && e.net < e.price && e.net > 0);
  ok('τα κόστη αθροίζουν', !!e && Math.abs(e.costs - e.lines.reduce((s, l) => s + l.amount, 0)) < 0.01);
  // Ο φόρος υπεραξίας ΔΕΝ μπαίνει ως γραμμή με μηδέν: το «0 €» διαβάζεται ως
  // «δεν υπάρχει», που είναι βεβαιότητα που δεν επιτρέπεται να δώσουμε.
  ok('καμία γραμμή υπεραξίας', !!e && !e.lines.some(l => /υπεραξ/.test(l.label)));
  ok('...και ρητή σημείωση γιατί λείπει', !!e && /αναστολή/.test(e.note) && /επιβεβαίωσε/.test(e.note));
  ok('ΠΕΑ και μηχανικός στα κόστη', !!e && e.lines.some(l => /ΠΕΑ/.test(l.label)) && e.lines.some(l => /μηχανικ/.test(l.label)));
  ok('χωρίς μεσίτη, λιγότερα κόστη',
    (saleEstimate(200000, { useAgent: false })?.costs ?? 0) < (e?.costs ?? 0));
  ok('χωρίς τίμημα, καμία εκτίμηση', saleEstimate(0) === null);
}

// ═══ ΠΡΟΣΑΡΜΟΓΗ ΣΤΟ ΣΥΓΚΕΚΡΙΜΕΝΟ ΑΚΙΝΗΤΟ ════════════════════════════════
// Προσαρμογή ΜΟΝΟ όπου υπάρχει πραγματικό δεδομένο. Χωρίς έτος κατασκευής,
// κανένα συμπέρασμα δεν μαντεύεται.
{
  const old = plan('renovation', { yearBuilt: 1972 });
  const elec = old.steps[idx(old.steps, 'reno-electric')];
  ok('παλιό ακίνητο: αναφέρεται η γείωση', /γείωση/.test(elec.detail));
  ok('...με το έτος του χρήστη', /1972/.test(elec.detail));
  const energy = old.steps[idx(old.steps, 'reno-energy')];
  ok('παλιό ακίνητο: αναφέρεται η θερμομόνωση', /θερμομόνωση/.test(energy.detail));

  const modern = plan('renovation', { yearBuilt: 2015 });
  ok('νεότερο ακίνητο: καμία υπόθεση για την εγκατάσταση',
    !/δεν έχει ούτε γείωση/.test(modern.steps[idx(modern.steps, 'reno-electric')].detail));
  const bare = plan('renovation');
  ok('χωρίς έτος: κανένα συμπέρασμα',
    !/δεν έχει ούτε γείωση|θερμομόνωση είναι/.test(allText(bare)));
  ok('χωρίς έτος: κανένας αριθμός έτους στα βήματα',
    !/\b(19|20)\d{2}\b/.test(JSON.stringify(bare.steps)));
  eq('η προσαρμογή δεν αλλάζει τον αριθμό βημάτων', old.steps.length, bare.steps.length);
}

// ═══ ΓΛΩΣΣΑ ΚΑΙ ΑΝΤΟΧΗ ════════════════════════════════════════════════════
{
  const statuses: PlanStatus[] = [...PLAN_STATUSES];
  ok('όλα τα κείμενα είναι στα ελληνικά',
    statuses.every(s => /[Α-Ωα-ωά-ώ]/.test(plan(s).headline)));
  ok('κάθε κατάσταση έχει ετικέτα', statuses.every(s => plan(s).label.length > 3));
  ok('οι επιλογές υπάρχουν όπου υπάρχει απόφαση',
    plan('vacant').options.length > 0 && plan('for_sale').options.length > 0);
  ok('και λείπουν όπου δεν υπάρχει',
    plan('disputed').options.length === 0 && plan('renovation').options.length === 0);
  ok('η χρηματοδότηση εμφανίζεται μόνο στην ανακαίνιση',
    plan('renovation').funding.length > 0 &&
    statuses.filter(s => s !== 'renovation').every(s => plan(s).funding.length === 0));
  ok('τίτλος σύγκρισης όπου υπάρχουν επιλογές',
    plan('vacant').optionsTitle.length > 5 && plan('disputed').optionsTitle === '');
  // Ο ΥΠΟΤΙΤΛΟΣ ΣΥΓΚΡΙΣΗΣ ΔΕΝ ΕΛΕΓΧΕΤΑΙ ΠΙΑ, ΓΙΑΤΙ ΔΕΝ ΥΠΑΡΧΕΙ. Περιέγραφε τους
  // άξονες με λόγια· τώρα οι άξονες είναι στήλες με κεφαλίδα και ονομάζονται
  // μία φορά. Ό,τι έλεγε για το «να μην κάνεις τίποτα» το λέει η ίδια η γραμμή
  // «Το αφήνω όπως είναι», που ελέγχεται παραπάνω με το κόστος της.
  ok('κάθε επιλογή δίνει και τους τρεις άξονες, χωρίς πρόταση από πάνω',
    statuses.every(s => plan(s).options.every(o => o.effort && o.risk && o.speed.length > 3)));
  // Άγνωστο είδος εκκρεμότητας δεν ρίχνει την οθόνη.
  const weird = planFor({ status: 'disputed', disputeKind: 'unknown' as DisputeKind, done: [] });
  ok('άγνωστο είδος: πλήρες σχέδιο', !!weird && weird.steps.length >= 5);
  ok('έξι είδη εκκρεμότητας, με ετικέτα και εξήγηση',
    DISPUTE_KINDS.length === 6 && DISPUTE_KINDS.every(k => k.label.length > 5 && k.hint.length > 15));
}

console.log(fail === 0 ? `✓ plan: ${pass} έλεγχοι πέρασαν` : `✗ plan: ${fail} απέτυχαν από ${pass + fail}`);
if (fail > 0) process.exit(1);
