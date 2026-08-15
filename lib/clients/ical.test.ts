// npx tsx lib/clients/ical.test.ts
//
// ΓΙΑΤΙ ΓΡΑΦΤΗΚΕ. Από εδώ περνούν ΟΛΕΣ οι κρατήσεις που έρχονται μόνες τους από
// Airbnb και Booking. Ό,τι διαβάσει λάθος αυτό το αρχείο γίνεται διαμονή στη
// βάση: λάθος ημερομηνίες, διπλοεγγραφή, ή κράτηση που δεν υπάρχει. Και το
// αποτέλεσμα καταλήγει στο Ε2 και στη Δήλωση Βραχυχρόνιας Διαμονής της ΑΑΔΕ.
// Εκατόν δεκατέσσερις γραμμές ανάλυσης κειμένου, ΧΩΡΙΣ έναν έλεγχο.
import { parseICal, guessChannel, isBlocked, icalToStayDrafts, stayKey } from './ical'

let pass = 0, fail = 0
function ok(name: string, cond: boolean) { if (cond) pass++; else { fail++; console.error('✗ ' + name) } }
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) pass++; else { fail++; console.error(`✗ ${name}\n   got  ${g}\n   want ${w}`) }
}

const ICS = (body: string) =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Airbnb//EN\r\n${body}\r\nEND:VCALENDAR\r\n`

// ═══ ΤΟ ΣΥΝΗΘΕΣ ΑΡΧΕΙΟ ΤΟΥ AIRBNB ═════════════════════════════════════════
{
  const ev = parseICal(ICS(
    'BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20260714\r\nDTEND;VALUE=DATE:20260721\r\n' +
    'UID:abc123@airbnb.com\r\nSUMMARY:Reserved\r\nEND:VEVENT'))
  eq('ένα γεγονός', ev.length, 1)
  eq('ημερομηνία άφιξης', ev[0].start, '2026-07-14')
  eq('ημερομηνία αναχώρησης', ev[0].end, '2026-07-21')
  eq('το αναγνωριστικό κρατιέται', ev[0].uid, 'abc123@airbnb.com')
  eq('η περιγραφή κρατιέται', ev[0].summary, 'Reserved')
}

// ═══ ΓΡΑΜΜΕΣ ΜΕ CRLF, LF ΚΑΙ ΣΚΕΤΟ CR ════════════════════════════════════
// Τα τρία τα βγάζουν διαφορετικοί εξυπηρετητές. Ένα αρχείο που δεν διαβάζεται
// σημαίνει «καμία κράτηση», σιωπηλά.
{
  const body = 'BEGIN:VEVENT\nDTSTART:20260101\nDTEND:20260105\nUID:u1\nSUMMARY:Χ\nEND:VEVENT'
  eq('LF μόνο', parseICal(body).length, 1)
  eq('CR μόνο', parseICal(body.replace(/\n/g, '\r')).length, 1)
  eq('CRLF', parseICal(body.replace(/\n/g, '\r\n')).length, 1)
}

// ═══ ΔΙΠΛΩΜΕΝΕΣ ΓΡΑΜΜΕΣ (RFC 5545) ═══════════════════════════════════════
// Το πρότυπο κόβει στους 75 χαρακτήρες και συνεχίζει με κενό. Χωρίς ξεδίπλωμα,
// μια μακριά περιγραφή έσπαγε το γεγονός στα δύο.
{
  const ev = parseICal(ICS(
    'BEGIN:VEVENT\r\nDTSTART:20260301\r\nDTEND:20260305\r\nUID:u2\r\n' +
    'SUMMARY:Κράτηση από τον Γιώρ\r\n γο Παπαδόπουλο\r\nEND:VEVENT'))
  eq('η διπλωμένη γραμμή ενώνεται', ev[0].summary, 'Κράτηση από τον Γιώργο Παπαδόπουλο')
}

// ═══ ΤΑ ΜΗ ΕΓΚΥΡΑ ΓΕΓΟΝΟΤΑ ΠΕΤΙΟΥΝΤΑΙ ════════════════════════════════════
{
  eq('χωρίς αναχώρηση → πετιέται',
    parseICal(ICS('BEGIN:VEVENT\r\nDTSTART:20260101\r\nUID:u\r\nEND:VEVENT')).length, 0)
  eq('χωρίς άφιξη → πετιέται',
    parseICal(ICS('BEGIN:VEVENT\r\nDTEND:20260101\r\nUID:u\r\nEND:VEVENT')).length, 0)
  eq('αναχώρηση πριν την άφιξη → πετιέται',
    parseICal(ICS('BEGIN:VEVENT\r\nDTSTART:20260110\r\nDTEND:20260105\r\nUID:u\r\nEND:VEVENT')).length, 0)
  eq('ίδια μέρα άφιξης και αναχώρησης → πετιέται',
    parseICal(ICS('BEGIN:VEVENT\r\nDTSTART:20260110\r\nDTEND:20260110\r\nUID:u\r\nEND:VEVENT')).length, 0)
  eq('κενό κείμενο → κανένα γεγονός', parseICal('').length, 0)
  eq('σκουπίδια → κανένα γεγονός', parseICal('δεν είναι ημερολόγιο').length, 0)
}

// ═══ ΧΩΡΙΣ UID: ΤΟ ΚΛΕΙΔΙ ΒΓΑΙΝΕΙ ΑΠΟ ΤΙΣ ΗΜΕΡΟΜΗΝΙΕΣ ════════════════════
// Χωρίς αυτό, δύο εισαγωγές του ίδιου αρχείου θα έφτιαχναν δύο διαμονές.
{
  const ev = parseICal(ICS('BEGIN:VEVENT\r\nDTSTART:20260601\r\nDTEND:20260608\r\nEND:VEVENT'))
  eq('υπάρχει αναγνωριστικό', ev[0].uid, '2026-06-01_2026-06-08')
  const again = parseICal(ICS('BEGIN:VEVENT\r\nDTSTART:20260601\r\nDTEND:20260608\r\nEND:VEVENT'))
  eq('και είναι σταθερό ανάμεσα σε δύο αναγνώσεις', again[0].uid, ev[0].uid)
}

// ═══ ΠΟΛΛΑ ΓΕΓΟΝΟΤΑ ΣΤΟ ΙΔΙΟ ΑΡΧΕΙΟ ══════════════════════════════════════
{
  const ev = parseICal(ICS(
    'BEGIN:VEVENT\r\nDTSTART:20260601\r\nDTEND:20260605\r\nUID:a\r\nEND:VEVENT\r\n' +
    'BEGIN:VEVENT\r\nDTSTART:20260610\r\nDTEND:20260615\r\nUID:b\r\nEND:VEVENT'))
  eq('δύο γεγονότα', ev.length, 2)
  eq('με τη σειρά του αρχείου', ev.map(e => e.uid), ['a', 'b'])
}

// ═══ Η ΩΡΑ ΔΕΝ ΑΛΛΑΖΕΙ ΤΗΝ ΗΜΕΡΑ ══════════════════════════════════════════
// Το Booking στέλνει DTSTART με ώρα και ζώνη. Η ημέρα άφιξης πρέπει να μείνει
// αυτή που γράφει το αρχείο — καμία μετατροπή ζώνης.
{
  const ev = parseICal(ICS(
    'BEGIN:VEVENT\r\nDTSTART;TZID=Europe/Athens:20260714T150000\r\n' +
    'DTEND;TZID=Europe/Athens:20260721T110000\r\nUID:tz\r\nEND:VEVENT'))
  eq('η ώρα αγνοείται, η ημέρα μένει', [ev[0].start, ev[0].end], ['2026-07-14', '2026-07-21'])
}

// ═══ ΚΑΝΑΛΙ ═══════════════════════════════════════════════════════════════
eq('airbnb από URL', guessChannel('https://www.airbnb.com/calendar/ical/123.ics'), 'airbnb')
eq('booking από URL', guessChannel('https://admin.booking.com/hotel/ical.ics'), 'booking')
eq('κεφαλαία δεν εμποδίζουν', guessChannel('HTTPS://AIRBNB.COM/X'), 'airbnb')
eq('άγνωστο → other', guessChannel('https://vrbo.com/x.ics'), 'other')
eq('κενό → other', guessChannel(''), 'other')

// ═══ ΜΠΛΟΚΑΡΙΣΜΑ ΕΝΑΝΤΙ ΚΡΑΤΗΣΗΣ ═════════════════════════════════════════
// Ένα «μη διαθέσιμο» ΔΕΝ είναι έσοδο. Αν περνούσε ως κράτηση, θα φούσκωνε την
// πληρότητα και θα εμφανιζόταν ως αδήλωτη διαμονή στην ΑΑΔΕ.
ok('«Not available» είναι μπλοκάρισμα', isBlocked('Airbnb (Not available)'))
ok('«Blocked» επίσης', isBlocked('Blocked'))
ok('«Unavailable» επίσης', isBlocked('Unavailable'))
ok('και στα ελληνικά', isBlocked('Μη διαθέσιμο'))
ok('η κράτηση ΔΕΝ είναι μπλοκάρισμα', !isBlocked('Reserved'))
ok('ούτε ένα όνομα', !isBlocked('Γιώργος Παπαδόπουλος'))
ok('κενό δεν είναι μπλοκάρισμα', !isBlocked(''))

// ═══ ΠΡΟΣΧΕΔΙΑ ΔΙΑΜΟΝΩΝ ═══════════════════════════════════════════════════
{
  const ev = parseICal(ICS(
    'BEGIN:VEVENT\r\nDTSTART:20260714\r\nDTEND:20260721\r\nUID:x\r\nSUMMARY:Reserved\r\nEND:VEVENT\r\n' +
    'BEGIN:VEVENT\r\nDTSTART:20260801\r\nDTEND:20260803\r\nUID:y\r\nSUMMARY:Blocked\r\nEND:VEVENT'))
  const d = icalToStayDrafts(ev, { propertyId: 'p1', channel: 'airbnb' })
  eq('δύο προσχέδια', d.length, 2)
  eq('επτά νύχτες', d[0].nights, 7)
  eq('δύο νύχτες', d[1].nights, 2)
  ok('η κράτηση δεν είναι μπλοκάρισμα', !d[0].blocked)
  ok('το μπλοκάρισμα σημαίνεται', d[1].blocked)
  eq('το ακίνητο περνά', d[0].property_id, 'p1')
  eq('το κανάλι περνά', d[0].channel, 'airbnb')
}

// ═══ ΤΟ ΚΛΕΙΔΙ ΑΠΟΦΥΓΗΣ ΔΙΠΛΟΤΥΠΩΝ ═══════════════════════════════════════
// Αν δύο διαφορετικές διαμονές έδιναν το ίδιο κλειδί, η δεύτερη εισαγωγή θα
// έσβηνε σιωπηλά την πρώτη.
{
  eq('ίδια στοιχεία → ίδιο κλειδί',
    stayKey('p1', '2026-07-14', '2026-07-21'), stayKey('p1', '2026-07-14', '2026-07-21'))
  ok('άλλο ακίνητο → άλλο κλειδί',
    stayKey('p1', '2026-07-14', '2026-07-21') !== stayKey('p2', '2026-07-14', '2026-07-21'))
  ok('άλλη άφιξη → άλλο κλειδί',
    stayKey('p1', '2026-07-14', '2026-07-21') !== stayKey('p1', '2026-07-15', '2026-07-21'))
  ok('άλλη αναχώρηση → άλλο κλειδί',
    stayKey('p1', '2026-07-14', '2026-07-21') !== stayKey('p1', '2026-07-14', '2026-07-22'))
}

// ═══ ΞΕΦΕΥΓΜΑΤΑ ΣΤΗΝ ΠΕΡΙΓΡΑΦΗ ═══════════════════════════════════════════
// Το πρότυπο ξεφεύγει το κόμμα και τη νέα γραμμή. Χωρίς αποξέφευγμα, το όνομα
// του επισκέπτη εμφανιζόταν με ανάστροφες καθέτους.
{
  const ev = parseICal(ICS(
    'BEGIN:VEVENT\r\nDTSTART:20260901\r\nDTEND:20260903\r\nUID:e\r\n' +
    'SUMMARY:Παπαδόπουλος\\, Γιώργος\\nΔύο άτομα\r\nEND:VEVENT'))
  eq('το κόμμα και η νέα γραμμή αποξεφεύγονται', ev[0].summary, 'Παπαδόπουλος, Γιώργος Δύο άτομα')
}

// ═══ Η ΑΚΥΡΩΣΗ, ΟΠΩΣ ΤΗ ΓΡΑΦΕΙ ΤΟ ΠΡΟΤΥΠΟ ════════════════════════════════
// Airbnb και Booking απλώς ΣΒΗΝΟΥΝ το γεγονός — αυτό το πιάνει η αντιπαραβολή
// του συγχρονισμού. Οσα ημερολόγια στέλνουν `STATUS:CANCELLED` (Google, iCloud,
// ξενοδοχειακά PMS) μας γλιτώνουν έναν ολόκληρο γύρο αναμονής, μέσα στον οποίο
// οι μέρες θα έμεναν πιασμένες.
{
  const ev = parseICal(ICS(
    'BEGIN:VEVENT\r\nDTSTART:20260701\r\nDTEND:20260705\r\nUID:a\r\nSTATUS:CONFIRMED\r\nEND:VEVENT\r\n' +
    'BEGIN:VEVENT\r\nDTSTART:20260710\r\nDTEND:20260714\r\nUID:b\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\n' +
    'BEGIN:VEVENT\r\nDTSTART:20260720\r\nDTEND:20260724\r\nUID:c\r\nEND:VEVENT'))
  eq('και τα τρία γεγονότα διαβάζονται', ev.length, 3)
  ok('το επιβεβαιωμένο δεν είναι ακυρωμένο', ev[0].cancelled === false)
  ok('το ακυρωμένο σημαίνεται', ev[1].cancelled === true)
  // Χωρίς `STATUS` δεν σημαίνει «ακυρωμένο». Το αντίθετο θα έσβηνε ΟΛΕΣ τις
  // κρατήσεις του Airbnb, που δεν στέλνει ποτέ τη γραμμή αυτή.
  ok('η απουσία STATUS δεν είναι ακύρωση', ev[2].cancelled === false)

  const lower = parseICal(ICS('BEGIN:VEVENT\r\nDTSTART:20260801\r\nDTEND:20260803\r\nUID:d\r\nSTATUS:cancelled\r\nEND:VEVENT'))
  ok('πεζά ή κεφαλαία, το ίδιο', lower[0].cancelled === true)
}

console.log(fail === 0 ? `✓ ical: ${pass} έλεγχοι πέρασαν` : `✗ ical: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
