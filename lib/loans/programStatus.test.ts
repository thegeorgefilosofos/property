// npx tsx lib/loans/programStatus.test.ts
//
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΚΛΕΙΝΕΙ. Στις 8 Αυγούστου 2026 η οθόνη των δανείων έγραφε για
// το «Σπίτι μου ΙΙ»: «Ενεργό · Λήγει σύντομα · Προθεσμία 31/08/2026». Οι
// αιτήσεις είχαν κλείσει στις 31/05/2026, δέκα εβδομάδες πριν. Η 31η Αυγούστου
// ήταν η προθεσμία ΥΠΟΓΡΑΦΗΣ για όσους είχαν ήδη έγκριση.
//
// Το `status` και το `deadline_urgent` ήταν χειρόγραφες σημαίες: την ημέρα που
// γράφτηκαν έλεγαν την αλήθεια. Καμία επιμέλεια δεν τις κρατά αληθινές, γιατί
// αυτό που αλλάζει δεν είναι τα δεδομένα — είναι η ημερομηνία.
import { programStatus, parseProgramDate, programDateLabel, PROGRAM_ORDER } from './programStatus'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }
const eq = (n: string, got: unknown, want: unknown) =>
  ok(`${n}\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want))

const day = (s: string) => new Date(`${s}T00:00:00`)

// ═══ ΤΟ ΑΚΡΙΒΕΣ ΣΕΝΑΡΙΟ ΤΟΥ ΣΦΑΛΜΑΤΟΣ ════════════════════════════════════
const SPITI_MOU = { applicationDeadline: '31/05/2026', deadline: '31/08/2026', status: 'active' }
{
  const s = programStatus(SPITI_MOU, day('2026-08-08'))
  eq('8 Αυγούστου: οι αιτήσεις έχουν κλείσει', s.state, 'applications-closed')
  eq('και το σήμα δεν λέει «Ενεργό»', s.badge, 'Έκλεισαν οι αιτήσεις')
  ok('ΔΕΝ δέχεται αίτηση', !s.acceptsApplications)
  ok('η εξήγηση αναφέρει ΚΑΙ τις δύο ημερομηνίες',
    s.note.includes('31/05/2026') && s.note.includes('31/08/2026'))
  ok('και λέει σε ποιον αφορά η δεύτερη', /ήδη έγκριση/.test(s.note))
  eq('μένουν 23 μέρες ως την υπογραφή', s.daysLeft, 23)
}

// ═══ Η ΙΔΙΑ ΕΓΓΡΑΦΗ, ΣΕ ΚΑΘΕ ΦΑΣΗ ΤΟΥ ΧΡΟΝΟΥ ═════════════════════════════
{
  eq('τον Ιανουάριο ήταν ανοιχτό', programStatus(SPITI_MOU, day('2026-01-15')).state, 'open')
  eq('και το σήμα έλεγε «Ενεργό»', programStatus(SPITI_MOU, day('2026-01-15')).badge, 'Ενεργό')
  ok('χωρίς περιττή εξήγηση όσο υπάρχει χρόνος', programStatus(SPITI_MOU, day('2026-01-15')).note === '')

  eq('στις 10 Μαΐου λήγει σύντομα', programStatus(SPITI_MOU, day('2026-05-10')).state, 'closing')
  ok('και το λέει σε μέρες', /21 μέρες/.test(programStatus(SPITI_MOU, day('2026-05-10')).note))

  // ΤΟ ΟΡΙΟ. Η τελευταία μέρα είναι ΜΕΣΑ: μια αίτηση στις 31/05 είναι έγκυρη.
  eq('η τελευταία μέρα δέχεται ακόμη αίτηση', programStatus(SPITI_MOU, day('2026-05-31')).acceptsApplications, true)
  eq('η επομένη όχι', programStatus(SPITI_MOU, day('2026-06-01')).acceptsApplications, false)

  eq('μετά την υπογραφή, έκλεισε', programStatus(SPITI_MOU, day('2026-09-01')).state, 'closed')
  ok('και δεν υπόσχεται τίποτα', /ανακοινώνεται από τον φορέα/.test(programStatus(SPITI_MOU, day('2026-09-01')).note))
}

// ═══ ΜΙΑ ΜΟΝΟ ΠΡΟΘΕΣΜΙΑ ══════════════════════════════════════════════════
// Τα περισσότερα προγράμματα έχουν μία. Τότε παίζει και τους δύο ρόλους και
// ΔΕΝ πρέπει να παραχθεί ενδιάμεση κατάσταση «έκλεισαν οι αιτήσεις».
{
  const one = { deadline: '31/08/2026', status: 'active' }
  eq('ανοιχτό πριν', programStatus(one, day('2026-06-01')).state, 'open')
  eq('λήγει σύντομα κοντά στη λήξη', programStatus(one, day('2026-08-08')).state, 'closing')
  eq('κλειστό μετά, χωρίς ενδιάμεσο', programStatus(one, day('2026-09-01')).state, 'closed')
}

// ═══ ΧΩΡΙΣ ΗΜΕΡΟΜΗΝΙΑ, ΚΑΙ ΕΠΕΡΧΟΜΕΝΟ ════════════════════════════════════
{
  // «Τρέχον», «Έληξε 30/06/2026, εκκρεμεί παράταση» — κείμενο, όχι ημερομηνία.
  const free = programStatus({ deadline: 'Τρέχον', status: 'active' }, day('2026-08-08'))
  eq('κείμενο χωρίς ημερομηνία δεν παράγει ψεύτικη λήξη', free.state, 'open-ended')
  ok('και δέχεται αίτηση', free.acceptsApplications)

  const up = programStatus({ deadline: '2ο εξάμηνο 2026', status: 'upcoming' }, day('2026-08-08'))
  eq('το επερχόμενο μένει επερχόμενο', up.state, 'upcoming')
  ok('και ΔΕΝ δέχεται αίτηση', !up.acceptsApplications)
}

// ═══ Η ΑΝΑΓΝΩΣΗ ΤΗΣ ΗΜΕΡΟΜΗΝΙΑΣ ══════════════════════════════════════════
// Το `new Date('2026-05-31')` είναι μεσάνυχτα UTC. Σε ζώνη με αρνητική
// απόκλιση, η σύγκριση με το σήμερα βγάζει μία μέρα λάθος — δηλαδή ένα
// πρόγραμμα κλείνει μία μέρα νωρίτερα απ' ό,τι λέει ο νόμος.
{
  const d = parseProgramDate('31/05/2026')!
  eq('η μέρα μένει 31', d.getDate(), 31)
  eq('ο μήνας μένει Μάιος', d.getMonth(), 4)
  eq('δέχεται και τη γραφή ISO', parseProgramDate('2026-05-31')!.getTime(), d.getTime())
  eq('δέχεται και μονοψήφια', programDateLabel('1/5/2026'), '01/05/2026')
  eq('κείμενο επιστρέφεται όπως είναι', programDateLabel('Τρέχον'), 'Τρέχον')
  eq('το κενό δεν σπάει', parseProgramDate(''), null)
}

// ═══ Η ΣΕΙΡΑ ═════════════════════════════════════════════════════════════
// Πριν, η ταξινόμηση ξεκινούσε από το χειρόγραφο `deadline_urgent`: ένα
// κλειστό πρόγραμμα με ξεχασμένη σημαία καθόταν πρώτο στη λίστα.
{
  ok('ό,τι λήγει σύντομα πάει πρώτο', PROGRAM_ORDER.closing < PROGRAM_ORDER.open)
  ok('τα ανοιχτά πριν τα επερχόμενα', PROGRAM_ORDER.open < PROGRAM_ORDER.upcoming)
  ok('τα κλειστά τελευταία', PROGRAM_ORDER.closed > PROGRAM_ORDER.upcoming)
  ok('και το «έκλεισαν οι αιτήσεις» κάτω από κάθε ανοιχτό',
    PROGRAM_ORDER['applications-closed'] > PROGRAM_ORDER['open-ended'])
}

// ══ Η ΤΕΛΕΙΑ ΠΟΥ ΚΡΕΜΟΤΑΝ ══════════════════════════════════════════════════
// Ο κανονικοποιητής γράφει κενή συμβολοσειρά σε πρόγραμμα χωρίς προθεσμία
// αίτησης· και το `??` δεν πέφτει στο επόμενο όταν το πρώτο είναι κενό: η
// πρόταση έβγαινε «Εκλεισε . Τυχόν νέος κύκλος…». Μετρημένο στο «Εξοικονομώ
// 2025», που έχει μόνο ημερομηνία λήξης.
{
  const closed = programStatus({ applicationDeadline: '', deadline: '30/06/2026' }, day('2026-08-31'))
  ok('η ημερομηνία λήξης χρησιμοποιείται όταν λείπει η προθεσμία αίτησης',
    closed.note.includes('30/06/2026'))
  ok('καμία τελεία δεν κρέμεται', !/\s\./.test(closed.note))

  // Χωρίς ΚΑΜΙΑ ημερομηνία το πρόγραμμα δεν φτάνει καν εδώ: κρίνεται «ανοιχτό
  // χωρίς λήξη», που είναι σωστό. Το γράφουμε ώστε να μη ζητηθεί ξανά ο έλεγχος
  // μιας κατάστασης που δεν υπάρχει.
  ok('χωρίς ημερομηνίες το πρόγραμμα δεν λογίζεται κλειστό',
    programStatus({ applicationDeadline: '', deadline: '' }, day('2026-08-31')).acceptsApplications)
}

console.log(fail === 0 ? `✓ programStatus: ${pass} έλεγχοι πέρασαν` : `✗ programStatus: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
