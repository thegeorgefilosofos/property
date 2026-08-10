// npx tsx lib/home/cash.test.ts
//
// Ο ΜΕΤΡΗΤΗΣ ΠΟΥ ΛΕΕΙ ΨΕΜΑΤΑ ΜΙΑ ΦΟΡΑ ΔΕΝ ΞΑΝΑΔΙΑΒΑΖΕΤΑΙ.
// Το «μου χρωστάνε» είναι ο λόγος που ο ιδιοκτήτης ανοίγει την εφαρμογή. Αν
// μετρήσει μέσα το ενοίκιο του επόμενου μήνα, ή αν χρεώσει δαπάνη που δεν ξέρει
// αν πληρώθηκε, ο αριθμός γίνεται διακοσμητικός.
import { cashPosition, cashSideNote, daysFromToday, type RentPeriod, type Payable } from './cash'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }

const TODAY = '2026-08-05'
const rent = (o: Partial<RentPeriod> = {}): RentPeriod =>
  ({ amount: 700, due_date: '2026-07-05', paid: false, period_year: 2026, period_month: 7, ...o })
const pay = (o: Partial<Payable> = {}): Payable =>
  ({ amount: 120, due: '2026-08-20', paid: false, label: 'ΔΕΗ', ...o })

const empty = { rent: [], payables: [], today: TODAY }

// ── Ημέρες ────────────────────────────────────────────────────────────────
ok('σήμερα = 0', daysFromToday(TODAY, TODAY) === 0)
ok('αύριο = 1', daysFromToday('2026-08-06', TODAY) === 1)
ok('χθες = −1', daysFromToday('2026-08-04', TODAY) === -1)
ok('χωρίς ημερομηνία = null', daysFromToday(null, TODAY) === null)
ok('σκουπίδια = null, όχι NaN', daysFromToday('αύριο', TODAY) === null)
// Αλλαγή θερινής ώρας: 29/3/2026 η Ελλάδα πάει UTC+3. Με τοπική ώρα αντί για
// UTC στο parse, η διαφορά έβγαινε 0,958 ημέρες και το Math.round τη σώζει —
// αλλά σε άλλα ζεύγη όχι. Εδώ ελέγχεται ότι το πέρασμα δεν χάνει ημέρα.
ok('πέρασμα θερινής ώρας: 28/3 → 30/3 = 2 ημέρες', daysFromToday('2026-03-30', '2026-03-28') === 2)

// ── ΜΟΥ ΧΡΩΣΤΑΝΕ: μόνο ό,τι έχει ΗΔΗ λήξει ────────────────────────────────
{
  const r = cashPosition({ ...empty, rent: [
    rent({ due_date: '2026-07-05', period_month: 7 }),        // πέρασε
    rent({ due_date: '2026-09-05', period_month: 9 }),        // ΜΕΛΛΟΝ — δεν είναι οφειλή
  ]})
  ok('το ενοίκιο του επόμενου μήνα ΔΕΝ είναι οφειλή', r.owedToMe.total === 700 && r.owedToMe.count === 1)
}
{
  const r = cashPosition({ ...empty, rent: [rent({ paid: true })] })
  ok('πληρωμένο ενοίκιο δεν μετράει', r.owedToMe.total === 0)
}
{
  const r = cashPosition({ ...empty, rent: [rent({ due_date: TODAY })] })
  ok('ενοίκιο που λήγει ΣΗΜΕΡΑ δεν είναι ακόμη σε καθυστέρηση', r.owedToMe.count === 0)
}
{
  const r = cashPosition({ ...empty, rent: [rent({ due_date: null })] })
  ok('χωρίς προθεσμία δεν συμπεραίνουμε καθυστέρηση', r.owedToMe.count === 0)
}
{
  const r = cashPosition({ ...empty, rent: [rent({ amount: 0 }), rent({ amount: null })] })
  ok('μηδενικά/κενά ποσά αγνοούνται', r.owedToMe.count === 0)
}
{
  const r = cashPosition({ ...empty, rent: [rent({ amount: '850.50' as unknown as number })] })
  ok('numeric της Postgres έρχεται string και διαβάζεται σωστά', r.owedToMe.total === 850.5)
}

// Η ετικέτα λέει ΠΟΙΟΝ μήνα — αλλιώς τρία «Ενοίκιο» στη σειρά δεν ξεχωρίζουν.
{
  const r = cashPosition({ ...empty, rent: [rent({ period_month: 7, period_year: 2026 })] })
  ok('η γραμμή ονομάζει τον μήνα', r.owedToMe.lines[0].label === 'Ενοίκιο Ιούλιος 2026')
}
{
  const r = cashPosition({ ...empty, rent: [rent({ period_month: null, period_year: null })] })
  ok('χωρίς περίοδο, σκέτο «Ενοίκιο» — όχι «Ενοίκιο undefined»', r.owedToMe.lines[0].label === 'Ενοίκιο')
}
{
  const r = cashPosition({ ...empty, rent: [rent({ period_month: 13 })] })
  ok('άκυρος μήνας δεν βγάζει σκουπίδια', r.owedToMe.lines[0].label === 'Ενοίκιο')
}

// ── ΧΡΩΣΤΑΩ: κάθε απλήρωτο, με ξεχωριστό το ληξιπρόθεσμο ──────────────────
{
  const r = cashPosition({ ...empty,
    payables: [
      pay({ amount: 120, due: '2026-07-20', label: 'ΔΕΗ' }),           // πέρασε
      pay({ amount: 300, due: '2026-09-15', label: 'Κοινόχρηστα' }),   // έρχεται
    ],
  })
  ok('το σύνολο περιλαμβάνει και τα μελλοντικά', r.owedByMe.total === 420 && r.owedByMe.count === 2)
  ok('το ληξιπρόθεσμο μετριέται χωριστά', r.owedByMe.overdue === 120 && r.owedByMe.overdueCount === 1)
}
{
  const r = cashPosition({ ...empty, payables: [pay({ paid: true }), pay({ paid: null })] })
  ok('πληρωμένο δεν χρεώνεται· άγνωστο ΟΥΤΕ (δεν μαντεύουμε)', r.owedByMe.count === 0)
}

// ── ΕΝΑ ΕΥΡΩ, ΜΙΑ ΦΟΡΑ ────────────────────────────────────────────────────
// Η υπογραφή δεχόταν `bills` ΚΑΙ `expenses` και τα πρόσθετε. Η σάρωση
// παραστατικού γράφει ΚΑΙ λογαριασμό ΚΑΙ δαπάνη με `bill_id`, και οι δύο
// απλήρωτες: ένας λογαριασμός 84,50 € διαβαζόταν 169,00 €. Με μία λίστα, η
// διπλομέτρηση δεν εκφράζεται πια — ο καλών περνά το ημερολόγιο, που έχει ήδη
// ενώσει τον λογαριασμό με τη δαπάνη του.
{
  const r = cashPosition({ ...empty, payables: [pay({ amount: 84.5, label: 'ΔΕΗ', due: '2026-08-20' })] })
  ok('ο σαρωμένος λογαριασμός μετριέται μία φορά', r.owedByMe.total === 84.5 && r.owedByMe.count === 1)
}

// ── ΤΑ ΔΥΟ ΣΚΕΛΗ ΔΕΝ ΣΥΜΨΗΦΙΖΟΝΤΑΙ ────────────────────────────────────────
// Το ενοίκιο του Ιουλίου δεν πληρώνει τον ΕΝΦΙΑ. Αν κάποιος προσθέσει «καθαρή
// θέση = μου χρωστάνε − χρωστάω», θα δείχνει μηδέν σε ακίνητο με δύο ανοιχτά
// μέτωπα — γι' αυτό οι δύο πλευρές μένουν χωριστές παντού.
{
  const r = cashPosition({ ...empty, rent: [rent({ amount: 500 })], payables: [pay({ amount: 500, due: '2026-07-01' })] })
  ok('οι δύο πλευρές μένουν χωριστές', r.owedToMe.total === 500 && r.owedByMe.total === 500)
}

// ── ΣΕΙΡΑ ΠΙΕΣΗΣ ──────────────────────────────────────────────────────────
{
  const r = cashPosition({ ...empty, payables: [
    pay({ label: 'χωρίς-προθεσμία', due: null, amount: 900 }),
    pay({ label: 'σε-10-ημέρες',    due: '2026-08-15', amount: 50 }),
    pay({ label: 'πριν-30-ημέρες',  due: '2026-07-06', amount: 10 }),
    pay({ label: 'πριν-2-ημέρες',   due: '2026-08-03', amount: 80 }),
  ]})
  const order = r.owedByMe.lines.map(l => l.label)
  ok('πρώτο το βαθύτερα ληξιπρόθεσμο', order[0] === 'πριν-30-ημέρες')
  ok('μετά το πρόσφατα ληξιπρόθεσμο', order[1] === 'πριν-2-ημέρες')
  ok('μετά η επερχόμενη προθεσμία', order[2] === 'σε-10-ημέρες')
  ok('τελευταίο ό,τι δεν έχει προθεσμία, όσο μεγάλο κι αν είναι', order[3] === 'χωρίς-προθεσμία')
}
{
  // Ίδια ημέρα → μεγαλύτερο ποσό πρώτο. Σταθερή σειρά, όχι σειρά της βάσης.
  const mk = (label: string, amount: number) => pay({ label, amount, due: '2026-07-01' })
  const a = cashPosition({ ...empty, payables: [mk('μικρό', 10), mk('μεγάλο', 90)] }).owedByMe.lines.map(l => l.label)
  const b = cashPosition({ ...empty, payables: [mk('μεγάλο', 90), mk('μικρό', 10)] }).owedByMe.lines.map(l => l.label)
  ok('ίδια σειρά ανεξάρτητα από τη σειρά εισόδου', a.join() === b.join() && a[0] === 'μεγάλο')
}

// ── ΤΟ ΚΕΝΟ ΑΚΙΝΗΤΟ ΔΕΝ ΕΙΝΑΙ ΣΦΑΛΜΑ ──────────────────────────────────────
{
  const r = cashPosition(empty)
  ok('όλα μηδέν χωρίς εξαίρεση', r.owedToMe.total === 0 && r.owedByMe.total === 0)
  ok('και το λέει με λέξεις', cashSideNote(r.owedToMe, 'in') === 'Τίποτα σε καθυστέρηση')
  ok('χωρίς εκκρεμείς πληρωμές', cashSideNote(r.owedByMe, 'out') === 'Τίποτα σε εκκρεμότητα')
}

// ── Η ΦΡΑΣΗ ΚΑΤΩ ΑΠΟ ΤΟΝ ΑΡΙΘΜΟ ───────────────────────────────────────────
// Είναι η θέση όπου αλλού θα έμπαινε χρώμα. Πρέπει να λέει κάτι μετρήσιμο.
{
  const one = cashPosition({ ...empty, rent: [rent({ due_date: '2026-08-04' })] })
  ok('ενικός στη μία εκκρεμότητα', cashSideNote(one.owedToMe, 'in') === '1 εκκρεμότητα · η παλαιότερη 1 ημέρα πίσω')
  const two = cashPosition({ ...empty, rent: [rent({ due_date: '2026-07-05', period_month: 7 }), rent({ due_date: '2026-08-01', period_month: 8 })] })
  ok('πληθυντικός και σωστό «παλαιότερη»', cashSideNote(two.owedToMe, 'in') === '2 εκκρεμότητες · η παλαιότερη 31 ημέρες πίσω')
  const today = cashPosition({ ...empty, payables: [pay({ due: TODAY })] })
  ok('«λήγει σήμερα», όχι «σε 0 ημέρες»', cashSideNote(today.owedByMe, 'out') === '1 εκκρεμότητα · η πρώτη λήγει σήμερα')
  const soon = cashPosition({ ...empty, payables: [pay({ due: '2026-08-06' })] })
  ok('ενικός και στην επερχόμενη', cashSideNote(soon.owedByMe, 'out') === '1 εκκρεμότητα · η πρώτη σε 1 ημέρα')
  const noDue = cashPosition({ ...empty, payables: [pay({ due: null })] })
  ok('χωρίς προθεσμία, χωρίς εφευρημένη ημερομηνία', cashSideNote(noDue.owedByMe, 'out') === '1 εκκρεμότητα')
}

// ── Ο ΠΙΝΑΚΑΣ ΕΙΣΟΔΟΥ ΔΕΝ ΑΛΛΟΙΩΝΕΤΑΙ ─────────────────────────────────────
{
  const bills = [pay({ label: 'β' }), pay({ label: 'α' })]
  cashPosition({ ...empty, payables: bills })
  ok('καμία παρενέργεια στα δεδομένα', bills.map(b => b.label).join() === 'β,α')
}

console.log(fail === 0 ? `✓ cash: ${pass} έλεγχοι πέρασαν` : `✗ cash: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
