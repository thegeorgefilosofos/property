// npx tsx lib/calendar/feed.test.ts
import { buildCalendarFeed, DEFAULT_TTL_HOURS, type FeedItem } from './feed';
import { escapeIcsText, foldIcsLine, compactDay, nextDayCompact, icsStamp, MAX_OCTETS } from './ics';

let p = 0, f = 0;
const ok = (c: boolean, m: string) => { if (c) p++; else { f++; console.error('✗', m); } };
const eq = (a: unknown, b: unknown, m: string) => ok(a === b, `${m}\n   πήρα:    ${JSON.stringify(a)}\n   περίμενα: ${JSON.stringify(b)}`);

const NOW = new Date('2026-08-21T09:30:00Z');
const bytes = (s: string) => new TextEncoder().encode(s).length;

// ── Η διαφυγή ──────────────────────────────────────────────────────────────
eq(escapeIcsText('Συντήρηση, καυστήρας'), 'Συντήρηση\\, καυστήρας', 'το κόμμα διαφεύγει');
eq(escapeIcsText('α;β'), 'α\\;β', 'το ερωτηματικό διαφεύγει');
eq(escapeIcsText('α\\β'), 'α\\\\β', 'η ανάστροφη κάθετος διαφεύγει');
eq(escapeIcsText('α\nβ'), 'α\\nβ', 'η αλλαγή γραμμής γίνεται \\n');
eq(escapeIcsText('α\r\nβ'), 'α\\nβ', 'και το CRLF');

// ── Το τύλιγμα ─────────────────────────────────────────────────────────────
const long = 'SUMMARY:' + 'Λ'.repeat(120);
const folded = foldIcsLine(long);
ok(folded.includes('\r\n '), 'η μεγάλη γραμμή σπάει με κενό στη συνέχεια');
for (const seg of folded.split('\r\n')) {
  ok(bytes(seg) <= MAX_OCTETS, `ΚΑΘΕ ΚΟΜΜΑΤΙ ΜΕΝΕΙ ΣΤΙΣ ${MAX_OCTETS} ΟΚΤΑΔΕΣ, όχι χαρακτήρες (${bytes(seg)})`);
}
eq(folded.split('\r\n ').join(''), long, 'το ξετύλιγμα δίνει πίσω το ίδιο κείμενο');
ok(!/�/.test(Buffer.from(folded, 'utf8').toString('utf8')), 'ΚΑΝΕΝΑΣ ΧΑΡΑΚΤΗΡΑΣ ΔΕΝ ΚΟΠΗΚΕ ΣΤΗ ΜΕΣΗ');
eq(foldIcsLine('σύντομη'), 'σύντομη', 'η μικρή γραμμή μένει ακέραιη');

// ── Οι ημερομηνίες ─────────────────────────────────────────────────────────
eq(compactDay('2026-09-05'), '20260905', 'συμπαγής ημέρα');
eq(compactDay(''), '', 'κενή ημέρα');
eq(compactDay('όχι ημερομηνία'), '', 'σκουπίδι δεν γίνεται ημερομηνία');
eq(nextDayCompact('2026-09-05'), '20260906', 'η επόμενη ημέρα');
eq(nextDayCompact('2026-08-31'), '20260901', 'αλλαγή μήνα');
eq(nextDayCompact('2026-12-31'), '20270101', 'αλλαγή χρονιάς');
eq(nextDayCompact('2028-02-28'), '20280229', 'δίσεκτο έτος');
eq(icsStamp(NOW), '20260821T093000Z', 'η στιγμή έκδοσης σε UTC');

// ── Το ημερολόγιο ──────────────────────────────────────────────────────────
const items: FeedItem[] = [
  { uid: 'bill-1@propertyos', date: '2026-09-05', title: 'ΔΕΗ, λογαριασμός', note: 'Ποσό 87,45 €' },
  { uid: 'rent-1@propertyos', date: '2026-09-01', title: 'Ενοίκιο Σεπτεμβρίου' },
];
const ics = buildCalendarFeed(items, { name: 'PROPERWISE · Προθεσμίες', now: NOW });

ok(ics.startsWith('BEGIN:VCALENDAR\r\n'), 'ξεκινά όπως ορίζει το πρότυπο');
ok(ics.endsWith('END:VCALENDAR\r\n'), 'και κλείνει, με τελική αλλαγή γραμμής');
ok(!/[^\r]\n/.test(ics), 'ΟΛΕΣ ΟΙ ΓΡΑΜΜΕΣ ΤΕΛΕΙΩΝΟΥΝ ΜΕ CRLF — σκέτο \\n το απορρίπτουν αναγνώστες');
ok(ics.includes('X-WR-CALNAME:PROPERWISE · Προθεσμίες'), 'το όνομα του ημερολογίου');
ok(ics.includes('X-WR-TIMEZONE:Europe/Athens'), 'η ζώνη ώρας');
ok(ics.includes(`REFRESH-INTERVAL;VALUE=DURATION:PT${DEFAULT_TTL_HOURS}H`), 'ο ρυθμός ανανέωσης του προτύπου');
ok(ics.includes(`X-PUBLISHED-TTL:PT${DEFAULT_TTL_HOURS}H`), 'και εκείνος που διαβάζουν Google και Outlook');
eq((ics.match(/BEGIN:VEVENT/g) || []).length, 2, 'δύο γεγονότα');
ok(ics.includes('DTSTART;VALUE=DATE:20260905'), 'ολοήμερο, με ημερομηνία και όχι ώρα');
ok(ics.includes('DTEND;VALUE=DATE:20260906'), 'ΤΟ ΤΕΛΟΣ ΕΙΝΑΙ Η ΕΠΟΜΕΝΗ ΜΕΡΑ — αλλιώς το γεγονός δεν φαίνεται');
ok(ics.includes('SUMMARY:ΔΕΗ\\, λογαριασμός'), 'ο τίτλος διαφεύγει μέσα στο ημερολόγιο');
ok(ics.includes('UID:bill-1@propertyos'), 'το uid μένει ακέραιο');
ok(ics.includes(`DTSTAMP:${icsStamp(NOW)}`), 'η στιγμή έκδοσης');
ok(ics.includes('DESCRIPTION:Ποσό 87\\,45'), 'η περιγραφή, με διαφυγή στο κόμμα του ποσού');
ok(!ics.includes('DESCRIPTION:\r\n'), 'γεγονός χωρίς σημείωση δεν παίρνει κενή περιγραφή');

// ── Το σταθερό uid ─────────────────────────────────────────────────────────
const again = buildCalendarFeed(items, { name: 'PROPERWISE · Προθεσμίες', now: new Date('2026-08-22T09:30:00Z') });
const uids = (s: string) => (s.match(/UID:[^\r]+/g) || []).join('|');
eq(uids(again), uids(ics), 'ΤΟ UID ΔΕΝ ΑΛΛΑΖΕΙ ΜΕ ΤΗΝ ΑΝΑΝΕΩΣΗ — αλλιώς κάθε συγχρονισμός σβήνει και ξαναγράφει');

// ── Ο,τι δεν είναι γεγονός δεν μπαίνει ─────────────────────────────────────
const messy = buildCalendarFeed([
  { uid: 'a@x', date: '', title: 'Χωρίς ημερομηνία' },
  { uid: 'b@x', date: '2026-09-05', title: '   ' },
  { uid: '', date: '2026-09-05', title: 'Χωρίς uid' },
  { uid: 'c@x', date: '2026-09-05', title: 'Καλό' },
  { uid: 'c@x', date: '2026-09-06', title: 'Διπλό uid' },
], { name: 'Δοκιμή', now: NOW });
eq((messy.match(/BEGIN:VEVENT/g) || []).length, 1, 'μένει μόνο το γεγονός που είναι γεγονός');
ok(messy.includes('SUMMARY:Καλό'), 'και είναι το σωστό');

// ── Το άδειο ημερολόγιο είναι έγκυρο ημερολόγιο ────────────────────────────
const empty = buildCalendarFeed([], { name: 'Δοκιμή', now: NOW });
ok(empty.startsWith('BEGIN:VCALENDAR') && empty.endsWith('END:VCALENDAR\r\n'), 'άδειο, αλλά έγκυρο');
eq((empty.match(/BEGIN:VEVENT/g) || []).length, 0, 'χωρίς γεγονότα');

// ── Κάθε γραμμή του παραγόμενου μένει στο όριο ─────────────────────────────
const wordy = buildCalendarFeed([{
  uid: 'long@propertyos', date: '2026-09-05',
  title: 'Ασφαλιστήριο κατοικίας με πολύ μεγάλο όνομα παρόχου και επιπλέον διευκρινίσεις',
  note: 'Σημείωση με πολλά ελληνικά γράμματα, όπου κάθε γράμμα πιάνει δύο οκτάδες και το όριο των εβδομήντα πέντε φτάνει γρήγορα.',
}], { name: 'Δοκιμή', now: NOW });
for (const l of wordy.split('\r\n')) ok(bytes(l) <= MAX_OCTETS, `γραμμή εντός ορίου: ${bytes(l)}`);

console.log(`\ncalendar/feed.ts — ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
console.log('όλα πέρασαν');
