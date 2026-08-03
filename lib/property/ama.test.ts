// Δοκιμές συμμόρφωσης ΑΜΑ. Τρέξε: npx tsx lib/property/ama.test.ts
import {
  amaState, amaRequired, amaNeedsAttention, amaSummary, isValidAmaFormat,
  amaLengthLooksUnusual, cleanAma, AMA_COPY,
} from './ama';
import { writeStatus, STATUSES } from './status';

let passed = 0, failed = 0; const fails: string[] = [];
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; fails.push(name); } };

const AMA = '12345678901';

// ═══ Ο ΕΛΕΓΧΟΣ ΟΔΗΓΕΙΤΑΙ ΑΠΟ ΤΟ readStatus, ΟΧΙ ΑΠΟ ΔΙΑΚΟΠΤΗ ═══════════════
// Ήταν το δομικό λάθος: ο ΑΜΑ κρυβόταν πίσω από τρίτο ανεξάρτητο διακόπτη
// «Βραχυχρόνια μίσθωση» στο OccupancyPanel, ενώ το readStatus ήδη ήξερε.
// Εδώ ελέγχεται ότι ΚΑΘΕ τρόπος με τον οποίο η βάση λέει «βραχυχρόνια»
// πυροδοτεί τον έλεγχο, και ότι κανένα πεδίο-διακόπτης δεν συμμετέχει.
ok('rental_mode short_term → ζητείται ΑΜΑ', amaState({ rental_mode: 'short_term' }) === 'missing');
ok('status_detail seasonal (παλιά δεδομένα) → ζητείται ΑΜΑ', amaState({ status_detail: 'seasonal' }) === 'missing');
ok('writeStatus(rent_short) → ζητείται ΑΜΑ', amaState(writeStatus('rent_short')) === 'missing');
ok('μακροχρόνια → ΔΕΝ ζητείται', amaState(writeStatus('rent_long')) === 'not_required');
ok('κενό → ΔΕΝ ζητείται', amaState(writeStatus('vacant')) === 'not_required');
ok('ιδιοχρησία → ΔΕΝ ζητείται', amaState(writeStatus('own_use')) === 'not_required');
ok('null row → ΔΕΝ ζητείται', amaState(null) === 'not_required' && amaState(undefined) === 'not_required');
ok('καμία άλλη κατάσταση δεν ζητά ΑΜΑ', STATUSES
  .filter(s => s.key !== 'rent_short')
  .every(s => amaState({ ...writeStatus(s.key), ama: null }) === 'not_required'));
// Κανένας «διακόπτης»: ένα πεδίο shortTerm στη γραμμή δεν αλλάζει τίποτα.
ok('πλασματικός διακόπτης shortTerm δεν ενεργοποιεί τίποτα',
  amaState({ status_detail: 'rented', rental_mode: 'long_term', ...({ shortTerm: true } as object) }) === 'not_required');
ok('πλασματικός διακόπτης shortTerm=false δεν απενεργοποιεί τίποτα',
  amaState({ rental_mode: 'short_term', ...({ shortTerm: false } as object) }) === 'missing');

// ═══ ΟΙ ΤΡΕΙΣ ΚΑΤΑΣΤΑΣΕΙΣ ═══════════════════════════════════════════════════
const short = writeStatus('rent_short');
ok('(α) δεν δηλώθηκε', amaState({ ...short }) === 'missing');
ok('(β) δηλώθηκε αλλά δεν επιβεβαιώθηκε στην αγγελία', amaState({ ...short, ama: AMA }) === 'unconfirmed');
ok('(γ) εντάξει', amaState({ ...short, ama: AMA, ama_listed_confirmed_at: '2026-07-01T10:00:00Z' }) === 'ok');
ok('κενό string επιβεβαίωσης δεν μετράει', amaState({ ...short, ama: AMA, ama_listed_confirmed_at: '   ' }) === 'unconfirmed');
ok('άκυρη μορφή ΑΜΑ = σαν να λείπει', amaState({ ...short, ama: 'ΑΜΑ-1234' }) === 'missing');
ok('η επιβεβαίωση χωρίς ΑΜΑ δεν σώζει τίποτα', amaState({ ...short, ama: '', ama_listed_confirmed_at: '2026-07-01' }) === 'missing');

ok('amaRequired μόνο στη βραχυχρόνια', amaRequired(short) && !amaRequired(writeStatus('rent_long')));
ok('amaNeedsAttention: missing & unconfirmed', amaNeedsAttention({ ...short }) && amaNeedsAttention({ ...short, ama: AMA }));
ok('amaNeedsAttention: όχι στο ok', !amaNeedsAttention({ ...short, ama: AMA, ama_listed_confirmed_at: 'x' }));
ok('amaNeedsAttention: όχι σε μη βραχυχρόνια', !amaNeedsAttention(writeStatus('vacant')));

// ═══ ΜΟΡΦΗ ═════════════════════════════════════════════════════════════════
ok('μόνο ψηφία είναι έγκυρα', isValidAmaFormat('123') && !isValidAmaFormat('12a3') && !isValidAmaFormat('') && !isValidAmaFormat(null));
ok('κενά γύρω γύρω αγνοούνται', isValidAmaFormat('  12345678901  '));
ok('cleanAma κρατά μόνο ψηφία', cleanAma(' 123-456 789 ') === '123456789');
ok('ασυνήθιστο μήκος προειδοποιεί, δεν απορρίπτει', amaLengthLooksUnusual('123') && isValidAmaFormat('123'));
ok('τυπικό μήκος δεν προειδοποιεί', !amaLengthLooksUnusual(AMA));
ok('άκυρη μορφή δεν δίνει προειδοποίηση μήκους (δίνει άκυρο)', !amaLengthLooksUnusual('abc'));

// ═══ ΣΥΝΟΨΗ ΧΑΡΤΟΦΥΛΑΚΙΟΥ ══════════════════════════════════════════════════
const portfolio = [
  { id: 'a', ...writeStatus('rent_short') },                                                        // missing
  { id: 'b', ...writeStatus('rent_short'), ama: AMA },                                              // unconfirmed
  { id: 'c', ...writeStatus('rent_short'), ama: AMA, ama_listed_confirmed_at: '2026-07-01' },        // ok
  { id: 'd', ...writeStatus('rent_long') },                                                          // not_required
];
const sum = amaSummary(portfolio);
ok('σύνοψη: 1 missing / 1 unconfirmed / 1 ok', sum.missing.length === 1 && sum.unconfirmed.length === 1 && sum.ok.length === 1);
ok('σύνοψη: 3 ακίνητα βραχυχρόνιας', sum.shortTermCount === 3);
ok('σύνοψη: χειρότερη κατάσταση = missing', sum.worst === 'missing');
ok('σύνοψη: χωρίς missing → unconfirmed', amaSummary(portfolio.filter(p => p.id !== 'a')).worst === 'unconfirmed');
ok('σύνοψη: όλα εντάξει → ok', amaSummary([portfolio[2]]).worst === 'ok');
ok('σύνοψη: καμία βραχυχρόνια → not_required', amaSummary([portfolio[3]]).worst === 'not_required');
ok('σύνοψη: κενό χαρτοφυλάκιο', (() => { const s = amaSummary([]); return s.worst === 'not_required' && s.shortTermCount === 0; })());

// ═══ ΚΕΙΜΕΝΟ ═══════════════════════════════════════════════════════════════
ok('κείμενο για τις τρεις καταστάσεις', (['missing', 'unconfirmed', 'ok'] as const).every(k => AMA_COPY[k].title.length > 5 && AMA_COPY[k].body.length > 20));
ok('το missing αναφέρει το πραγματικό μέγεθος (12.145)', AMA_COPY.missing.body.includes('12.145'));
ok('το unconfirmed μιλά για την ΑΓΓΕΛΙΑ', AMA_COPY.unconfirmed.body.includes('καταχώριση') || AMA_COPY.unconfirmed.body.includes('αγγελία'));
ok('τόνοι σημασιολογικοί', AMA_COPY.missing.tone === 'negative' && AMA_COPY.unconfirmed.tone === 'warning' && AMA_COPY.ok.tone === 'positive');

console.log(`\nama — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`);
if (failed) { console.log('FAILED:\n' + fails.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
console.log('όλα πέρασαν');
