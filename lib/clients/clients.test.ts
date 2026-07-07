// Αυστηρά τεστ για τη λογική του Πελατολογίου (clients.ts).
// Τρέξε: npx tsx lib/clients/clients.test.ts
import {
  isValidAfm, pipelineValue, dueActions,
  CLIENT_TYPES, CLIENT_TYPE_LABELS, PIPELINE_STAGES, STAGE_LABELS, STAGE_ORDER,
} from './clients';

let passed = 0, failed = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; if (fails.length < 60) fails.push(name); } };

// ── isValidAfm: ελληνικό ΑΦΜ mod-11 ─────────────────────────────────────────
ok('valid public-sector afm', isValidAfm('090000045') === true);
ok('wrong check digit', isValidAfm('090000046') === false);
ok('too short', isValidAfm('12345') === false);
ok('non-numeric', isValidAfm('12345678x') === false);
ok('all zeros rejected', isValidAfm('000000000') === false);
ok('10 digits rejected', isValidAfm('0900000455') === false);
ok('empty rejected', isValidAfm('') === false);

// ── pipelineValue: αθροίζει μόνο ανοιχτά στάδια, αγνοεί null ─────────────────
ok('pipeline sums open stages only', pipelineValue([
  { stage: 'offer', deal_value: 1000 },
  { stage: 'closed', deal_value: 5000 },
  { stage: 'lead', deal_value: null },
]) === 1000);
ok('pipeline empty = 0', pipelineValue([]) === 0);
ok('pipeline all closed = 0', pipelineValue([{ stage: 'closed', deal_value: 999 }]) === 0);
ok('pipeline multiple open', pipelineValue([
  { stage: 'lead', deal_value: 200 }, { stage: 'viewing', deal_value: 300 }, { stage: 'offer', deal_value: 500 },
]) === 1000);

// ── dueActions: εκπρόθεσμα/σήμερα, μη κλεισμένα ──────────────────────────────
{
  const now = new Date('2026-07-07T12:00:00Z');
  const n = dueActions([
    { stage: 'lead', next_date: '2026-07-01' },     // εκπρόθεσμο → μετρά
    { stage: 'closed', next_date: '2026-07-01' },   // κλεισμένο → όχι
    { stage: 'viewing', next_date: '2026-08-01' },  // μελλοντικό → όχι
    { stage: 'lead', next_date: null },             // χωρίς ημερομηνία → όχι
  ], now);
  ok('dueActions counts only overdue open', n === 1);
  ok('dueActions today counts', dueActions([{ stage: 'lead', next_date: '2026-07-07' }], now) === 1);
  ok('dueActions empty = 0', dueActions([], now) === 0);
}

// ── Πληρότητα ετικετών ───────────────────────────────────────────────────────
ok('every stage has label', PIPELINE_STAGES.every(s => typeof STAGE_LABELS[s] === 'string' && STAGE_LABELS[s].length > 0));
ok('every stage has order', PIPELINE_STAGES.every(s => typeof STAGE_ORDER[s] === 'number'));
ok('every type has label', CLIENT_TYPES.every(t => typeof CLIENT_TYPE_LABELS[t] === 'string' && CLIENT_TYPE_LABELS[t].length > 0));

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\nclients.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`);
if (failed) { console.log('FAILED:\n' + fails.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
console.log('όλα πέρασαν');
