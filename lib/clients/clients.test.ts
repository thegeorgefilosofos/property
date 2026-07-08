// Αυστηρά τεστ για τη λογική του Πελατολογίου (clients.ts).
// Τρέξε: npx tsx lib/clients/clients.test.ts
import {
  isValidAfm, pipelineValue, dueActions,
  CLIENT_TYPES, CLIENT_TYPE_LABELS, PIPELINE_STAGES, STAGE_LABELS, STAGE_ORDER,
  stayNights, stayTotal, clientStats, normalizePhone, clientMatches,
  STAY_CHANNELS, STAY_CHANNEL_LABELS, NOTE_KINDS, NOTE_KIND_LABELS,
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

// ── stayNights ────────────────────────────────────────────────────────────────
ok('nights basic', stayNights('2026-07-01', '2026-07-05') === 4);
ok('nights same day = 0', stayNights('2026-07-01', '2026-07-01') === 0);
ok('nights reversed = 0', stayNights('2026-07-05', '2026-07-01') === 0);
ok('nights missing = 0', stayNights(null, '2026-07-05') === 0);

// ── stayTotal: total όταν δίνεται, αλλιώς nights × rate ───────────────────────
ok('stayTotal explicit', stayTotal({ total: 500 }) === 500);
ok('stayTotal computed', stayTotal({ check_in: '2026-07-01', check_out: '2026-07-05', nightly_rate: 80 }) === 320);
ok('stayTotal nights field', stayTotal({ nights: 3, nightly_rate: 100 }) === 300);
ok('stayTotal empty = 0', stayTotal({}) === 0);

// ── clientStats: συγκεντρωτικά ──────────────────────────────────────────────
{
  const st = clientStats([
    { check_in: '2026-01-01', check_out: '2026-01-06', nightly_rate: 100, rating: 5 },              // 5 νύχτες, 500€
    { check_in: '2026-03-01', check_out: '2026-03-04', total: 450, rating: 3, damages: true, damage_cost: 120 }, // 3 νύχτες, 450€, φθορά 120
  ]);
  ok('stats revenue', st.revenue === 950);
  ok('stats nights', st.nights === 8);
  ok('stats count', st.stayCount === 2);
  ok('stats avgRating', st.avgRating === 4);
  ok('stats lastVisit', st.lastVisit === '2026-03-04');
  ok('stats hasDamage', st.hasDamage === true);
  ok('stats damageTotal', st.damageTotal === 120);
  ok('stats adr', st.adr === Math.round(950 / 8));
  const empty = clientStats([]);
  ok('stats empty revenue', empty.revenue === 0 && empty.avgRating === null && empty.lastVisit === null && empty.adr === 0);
}

// ── normalizePhone / clientMatches ──────────────────────────────────────────
ok('normalizePhone strips symbols', normalizePhone('+30 694-1234567') === '6941234567');
ok('normalizePhone plain', normalizePhone('2101234567') === '2101234567');
ok('match by name', clientMatches({ full_name: 'Γιώργος Παπαδόπουλος' }, 'παπα') === true);
ok('match by phone digits', clientMatches({ phone: '+30 694 1234567' }, '6941234567') === true);
ok('match by afm', clientMatches({ afm: '090000045' }, '090000045') === true);
ok('no match', clientMatches({ full_name: 'Άννα' }, 'ζζζ') === false);
ok('empty query matches', clientMatches({ full_name: 'Άννα' }, '') === true);

// ── ετικέτες πληρότητα ──
ok('every channel has label', STAY_CHANNELS.every(c => typeof STAY_CHANNEL_LABELS[c] === 'string' && STAY_CHANNEL_LABELS[c].length > 0));
ok('every note kind has label', NOTE_KINDS.every(k => typeof NOTE_KIND_LABELS[k] === 'string' && NOTE_KIND_LABELS[k].length > 0));

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\nclients.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`);
if (failed) { console.log('FAILED:\n' + fails.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
console.log('όλα πέρασαν');
