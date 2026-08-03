// Τεστ για messages/reports/ical. Τρέξε: npx tsx lib/clients/crmFeatures.test.ts
import { MSG_TEMPLATES, buildMessage, whatsappLink, viberLink } from './messages';
import { revenueByChannel, revenueByMonth, yearOccupancy, nightsByMonth, nightsInRange, totals } from './reports';
import { parseICal, guessChannel, isBlocked, nightsBetween, icalToStayDrafts, stayKey } from './ical';

let passed = 0, failed = 0; const fails: string[] = [];
const ok = (n: string, c: boolean) => { c ? passed++ : (failed++, fails.length < 60 && fails.push(n)); };

// ── messages ──────────────────────────────────────────────────────────────
const ctx = { clientName: 'Γιώργος Παπαδόπουλος', propertyName: 'Το Σπίτι μου', address: 'Αρύββου 45', checkIn: '2026-07-15' };
for (const t of MSG_TEMPLATES) {
  const body = t.build(ctx);
  ok(`msg ${t.id} non-empty`, body.length > 10);
  ok(`msg ${t.id} uses first name`, body.includes('Γιώργος'));
  ok(`msg ${t.id} uses property`, body.includes('Το Σπίτι μου'));
  ok(`msg ${t.id} no leftover placeholder`, !/\{[a-z]+\}/i.test(body));
  ok(`msg ${t.id} no em-dash`, !body.includes('—'));
}
ok('buildMessage welcome', buildMessage('welcome', ctx).includes('Καλωσόρισες') || buildMessage('welcome', ctx).length > 0);
ok('buildMessage unknown → empty', buildMessage('nope' as any, ctx) === '');
ok('welcome without name still works', buildMessage('welcome', { propertyName: 'Βίλα' }).length > 5);
ok('whatsappLink encodes text', whatsappLink('306941234567', 'Γεια σου!').startsWith('https://wa.me/306941234567?text=') && whatsappLink('306941234567', 'Γεια σου!').includes('%'));
ok('viberLink forward', viberLink('Γεια').startsWith('viber://forward?text='));

// ── reports ─────────────────────────────────────────────────────────────────
const stays = [
  { channel: 'airbnb', check_in: '2026-01-01', check_out: '2026-01-06', nightly_rate: 100 },   // 5 νύχτες, 500
  { channel: 'airbnb', check_in: '2026-02-10', check_out: '2026-02-12', total: 300 },           // 2 νύχτες, 300
  { channel: 'booking', check_in: '2026-01-20', check_out: '2026-01-23', nightly_rate: 80 },     // 3 νύχτες, 240
  { channel: 'direct', check_in: '2026-03-01', check_out: '2026-03-02', total: 120 },            // 1 νύχτα, 120
];
const byCh = revenueByChannel(stays);
ok('channels sorted by revenue', byCh[0].channel === 'airbnb' && byCh[0].revenue === 800);
ok('channel airbnb nights', byCh.find(r => r.channel === 'airbnb')!.nights === 7);
ok('channel booking count', byCh.find(r => r.channel === 'booking')!.count === 1);
ok('channel labels', byCh.every(r => typeof r.label === 'string' && r.label.length > 0));
const byM = revenueByMonth(stays, 2026);
ok('month jan revenue', byM[0] === 740);   // 500 + 240
ok('month feb revenue', byM[1] === 300);
ok('month mar revenue', byM[2] === 120);
ok('month array length 12', byM.length === 12);
ok('other year zero', revenueByMonth(stays, 2025).every(v => v === 0));
ok('nightsInRange full', nightsInRange({ check_in: '2026-01-01', check_out: '2026-01-06' }, '2026-01-01', '2026-02-01') === 5);
ok('nightsInRange clipped', nightsInRange({ check_in: '2026-01-30', check_out: '2026-02-05' }, '2026-01-01', '2026-02-01') === 2);
ok('nightsInRange outside', nightsInRange({ check_in: '2026-05-01', check_out: '2026-05-03' }, '2026-01-01', '2026-02-01') === 0);
// ── πληρότητα: παρονομαστής = ΔΙΑΘΕΣΙΜΕΣ ημέρες, όχι 365 ─────────────────────
// Το εποχιακό εξοχικό έβγαζε «16%» επειδή διαιρούσε με 365 ημέρες. Παρονομαστής
// είναι πλέον το μετρημένο παράθυρο λειτουργίας: από τον πρώτο έως τον τελευταίο
// μήνα με κράτηση, ολόκληροι μήνες.
ok('nightsByMonth 12 τιμές', nightsByMonth(stays, 2026).length === 12);
ok('nightsByMonth Ιαν 8, Φεβ 2, Μαρ 1', (() => { const n = nightsByMonth(stays, 2026); return n[0] === 8 && n[1] === 2 && n[2] === 1; })());
const occ = yearOccupancy(stays, 2026);
ok('παράθυρο λειτουργίας = Ιαν..Μαρ', occ.openFromMonth === 0 && occ.openToMonth === 2);
ok('διαθέσιμες ημέρες = 31+28+31, ΟΧΙ 365', occ.availableDays === 90);
ok('πληρότητα = 11/90, όχι 11/365', occ.pct === Math.round((11 / 90) * 1000) / 10);
ok('πληρότητα πάνω από τον παλιό λάθος αριθμό', occ.pct > Math.round((11 / 365) * 1000) / 10);
ok('πληρότητα υψηλής περιόδου (2ο νούμερο)', occ.peak != null && occ.peak.fromMonth === 0 && occ.peak.toMonth === 2 && occ.peak.bookedNights === 11);
// Εποχιακό εξοχικό: γεμάτο καλοκαίρι, κλειστό τον χειμώνα.
const seasonal = yearOccupancy([
  { check_in: '2026-07-01', check_out: '2026-07-25' },
  { check_in: '2026-08-01', check_out: '2026-08-28' },
], 2026);
ok('εποχιακό: παράθυρο Ιουλ..Αυγ (62 ημέρες)', seasonal.openFromMonth === 6 && seasonal.openToMonth === 7 && seasonal.availableDays === 62);
ok('εποχιακό: 51/62 = 82,3%, όχι 14%', seasonal.pct === Math.round((51 / 62) * 1000) / 10 && seasonal.pct > 80);
ok('εποχιακό: παράθυρο < 3 μήνες → υψηλή περίοδος = όλο το παράθυρο', seasonal.peak != null && seasonal.peak.days === 62);
ok('χωρίς κρατήσεις → 0 και κανένα παράθυρο', (() => { const o = yearOccupancy([], 2026); return o.pct === 0 && o.availableDays === 0 && o.openFromMonth === null && o.peak === null; })());
const tot = totals(stays);
ok('totals revenue', tot.revenue === 1160 && tot.nights === 11 && tot.count === 4);
// Κάθε συγκεντρωτικό λέει ΚΑΙ πόσες γραμμές είναι απροσδιόριστες (ακαθάριστο ή payout;)
ok('totals: 4 απροσδιόριστες γραμμές', tot.unresolved === 4);
ok('totals: 4 αδήλωτες διαμονές', tot.undeclared === 4);
ok('channel unresolved', byCh.every(r => r.unresolved === r.count));
// Με ρητή ανάλυση: τα έσοδα είναι το ΑΚΑΘΑΡΙΣΤΟ (χωρίς το τέλος), όχι το payout.
const explicit = totals([{ channel: 'airbnb', check_in: '2026-07-01', check_out: '2026-07-05', total: 818, amount_basis: 'gross', gross_guest_paid: 1000, climate_levy: 32, platform_fee: 150, declared_at: '2026-07-06T09:00:00Z' }]);
ok('ρητή ανάλυση → έσοδα 968 (1000 − 32 τέλος)', explicit.revenue === 968);
ok('ρητή ανάλυση → 0 απροσδιόριστες, 0 αδήλωτες', explicit.unresolved === 0 && explicit.undeclared === 0);
ok('ρητή ανάλυση → προμήθεια & τέλος χωριστά', explicit.platformFees === 150 && explicit.climateLevy === 32);

// ── ical ─────────────────────────────────────────────────────────────────────
const ics = [
  'BEGIN:VCALENDAR', 'VERSION:2.0',
  'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20260701', 'DTEND;VALUE=DATE:20260705', 'SUMMARY:Reserved', 'UID:abc@airbnb.com', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART:20260810T140000Z', 'DTEND:20260812T110000Z', 'SUMMARY:Guest stay', 'UID:def', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20260901', 'DTEND;VALUE=DATE:20260901', 'SUMMARY:Bad', 'UID:zero', 'END:VEVENT', // μηδενική διάρκεια → αγνοείται
  'END:VCALENDAR',
].join('\r\n');
const evs = parseICal(ics);
ok('ical parses 2 valid events', evs.length === 2);
ok('ical dates', evs[0].start === '2026-07-01' && evs[0].end === '2026-07-05');
ok('ical datetime form', evs[1].start === '2026-08-10' && evs[1].end === '2026-08-12');
ok('ical uid', evs[0].uid === 'abc@airbnb.com');
ok('ical summary', evs[0].summary === 'Reserved');
ok('ical empty text → []', parseICal('').length === 0);
ok('ical folded line', parseICal('BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20260701\r\nDTEND;VALUE=DATE:20260703\r\nSUMMARY:Long\r\n  name here\r\nUID:x\r\nEND:VEVENT')[0].summary === 'Long name here');
ok('guessChannel airbnb', guessChannel('https://calendar.airbnb.com/x.ics') === 'airbnb');
ok('guessChannel booking', guessChannel('admin.booking.com/ical') === 'booking');
ok('guessChannel other', guessChannel('example.com') === 'other');
ok('isBlocked true', isBlocked('Airbnb (Not available)') === true);
ok('isBlocked false', isBlocked('Reserved') === false);
ok('nightsBetween', nightsBetween('2026-07-01', '2026-07-05') === 4);

// ── icalToStayDrafts / stayKey ─────────────────────────────────────────────
const drafts = icalToStayDrafts(evs, { propertyId: 'p1', channel: 'airbnb' });
ok('drafts count', drafts.length === 2);
ok('draft nights', drafts[0].nights === 4 && drafts[0].check_in === '2026-07-01' && drafts[0].check_out === '2026-07-05');
ok('draft channel + property', drafts[0].channel === 'airbnb' && drafts[0].property_id === 'p1');
ok('draft blocked flag', drafts[0].blocked === false);
ok('draft blocked true', icalToStayDrafts(parseICal(['BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20260701', 'DTEND;VALUE=DATE:20260703', 'SUMMARY:Airbnb (Not available)', 'UID:b', 'END:VEVENT'].join('\r\n')), { propertyId: 'p1', channel: 'airbnb' })[0].blocked === true);
ok('stayKey format', stayKey('p1', '2026-07-01', '2026-07-05') === 'p1|2026-07-01|2026-07-05');
ok('stayKey dedup detects existing', (() => {
  const existing = new Set([stayKey('p1', '2026-07-01', '2026-07-05')]);
  const fresh = drafts.filter(d => !existing.has(stayKey(d.property_id, d.check_in, d.check_out)));
  return fresh.length === 1 && fresh[0].check_in === '2026-08-10';
})());

console.log(`\ncrmFeatures — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`);
if (failed) { console.log('FAILED:\n' + fails.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
console.log('όλα πέρασαν');
