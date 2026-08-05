// npx tsx lib/home/agenda.test.ts
//
// ΤΟ ΙΔΙΟ ΠΡΑΓΜΑ, ΜΙΑ ΦΟΡΑ.
// Η λήξη της μίσθωσης εμφανιζόταν τέσσερις φορές στην αρχική οθόνη, η ασφάλεια
// δύο, τα ελλιπή στοιχεία δύο. Αυτό το αρχείο κρατά τη συγχώνευση ειλικρινή: αν
// κάποιος προσθέσει πηγή χωρίς να δηλώσει θέμα, τα διπλότυπα επιστρέφουν σιωπηλά.
import {
  buildAgenda, obligationSubject, insightSubject, overdueCount, dueLabel,
  type InsightLike, type ObligationLike, type SetupLike,
} from './agenda'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }

const TODAY = '2026-08-05'
const ins = (o: Partial<InsightLike> = {}): InsightLike =>
  ({ id: 'x', kind: 'attention', title: 'τ', detail: 'λ', ...o })
const obl = (o: Partial<ObligationLike> = {}): ObligationLike =>
  ({ id: 'x', title: 'Τ', note: 'Ν', date: '2026-08-20', daysUntil: 15, priority: 'medium', ...o })
const setup = (o: Partial<SetupLike> = {}): SetupLike =>
  ({ key: 'k', label: 'Λ', hint: 'Η', done: false, nav: 'settings', ...o })

// ── ΤΑ ΘΕΜΑΤΑ ─────────────────────────────────────────────────────────────
ok('ασφάλιση: υποχρέωση και insight δείχνουν το ίδιο θέμα',
   obligationSubject('insurance') === insightSubject('insurance-soon'))
ok('και το ληγμένο insight στο ίδιο θέμα',
   insightSubject('insurance-expired') === 'insurance')
ok('μίσθωση: ίδιο θέμα', obligationSubject('lease_end') === insightSubject('lease-soon'))
ok('η δήλωση μίσθωσης ΔΕΝ είναι η λήξη μίσθωσης',
   obligationSubject('lease_decl') !== obligationSubject('lease_end'))
ok('τα ελλιπή στοιχεία είναι το βήμα ρύθμισης', insightSubject('profile-incomplete') === 'setup:details')
ok('η πρώτη δαπάνη είναι το βήμα ρύθμισης', insightSubject('no-expenses') === 'setup:expense')
ok('κάθε συντήρηση κρατά τη δική της ταυτότητα',
   obligationSubject('maint_0') !== obligationSubject('maint_1'))
ok('οι φορολογικές ομαδοποιούνται ανά id', obligationSubject('enfia_1') === 'tax:enfia_1')
ok('άγνωστο insight δεν συγχωνεύεται με τίποτα', insightSubject('κάτι-νέο') === 'insight:κάτι-νέο')

// ── Η ΑΣΦΑΛΕΙΑ ΜΙΑ ΦΟΡΑ, ΜΕ ΤΑ ΚΑΛΥΤΕΡΑ ΚΑΙ ΤΩΝ ΔΥΟ ──────────────────────
{
  const a = buildAgenda({
    today: TODAY,
    obligations: [obl({ id: 'insurance', title: 'Λήξη ασφάλισης, Interamerican', date: '2026-08-20', daysUntil: 15, who: 'owner' })],
    insights: [ins({ id: 'insurance-soon', title: 'Λήγει σύντομα η ασφάλεια', action: { label: 'Ασφάλεια', tab: 'finances' } })],
  })
  ok('μία γραμμή, όχι δύο', a.length === 1)
  ok('κρατά τον συγκεκριμένο τίτλο της υποχρέωσης', a[0].title === 'Λήξη ασφάλισης, Interamerican')
  ok('κρατά την πραγματική ημερομηνία', a[0].due === '2026-08-20' && a[0].daysLeft === 15)
  ok('ΚΑΙ την ενέργεια του insight', a[0].action?.tab === 'finances')
  ok('και το ποιος το κάνει', a[0].who === 'owner')
}

// ── Η ΜΙΣΘΩΣΗ ΜΙΑ ΦΟΡΑ, ΑΠΟ ΤΡΕΙΣ ΠΗΓΕΣ ──────────────────────────────────
{
  const a = buildAgenda({
    today: TODAY,
    obligations: [obl({ id: 'lease_end', title: 'Λήξη σύμβασης μίσθωσης', date: '2026-09-30', daysUntil: 56 })],
    insights: [ins({ id: 'lease-soon', title: 'Πλησιάζει η λήξη της μίσθωσης', action: { label: 'Ενοικιαστής', tab: 'tenant' } })],
    setup: [setup({ key: 'lease', due: '2026-09-30' })],
  })
  ok('η μίσθωση δεν επαναλαμβάνεται', a.filter(x => x.key === 'lease').length === 1)
  ok('το βήμα ρύθμισης με άλλο κλειδί μένει χωριστά', a.length === 2)
}

// ── ΤΟ ΒΗΜΑ ΡΥΘΜΙΣΗΣ ΔΕΝ ΞΑΝΑΛΕΓΕΤΑΙ ΩΣ INSIGHT ──────────────────────────
{
  const a = buildAgenda({
    today: TODAY,
    insights: [ins({ id: 'profile-incomplete', title: 'Λείπουν στοιχεία του ακινήτου', action: { label: 'Επεξεργασία', tab: 'settings' } })],
    setup: [setup({ key: 'details', label: 'Συμπλήρωσε αξία & ενοίκιο', weight: 10 })],
  })
  ok('ένα μήνυμα για τα ελλιπή στοιχεία', a.length === 1)
  ok('νικά η διατύπωση του insight (πιο πλούσια από το βήμα)', a[0].title === 'Λείπουν στοιχεία του ακινήτου')
  ok('κρατά τη βαρύτητα του βήματος', a[0].weight === 10)
}

// ── ΟΛΟΚΛΗΡΩΜΕΝΑ ΒΗΜΑΤΑ ΔΕΝ ΕΙΝΑΙ ΕΚΚΡΕΜΟΤΗΤΕΣ ───────────────────────────
ok('το ολοκληρωμένο βήμα δεν μπαίνει', buildAgenda({ today: TODAY, setup: [setup({ done: true })] }).length === 0)

// ── ΤΑ ΚΟΜΠΛΙΜΕΝΤΑ ΔΕΝ ΕΙΝΑΙ ΔΟΥΛΕΙΑ ─────────────────────────────────────
{
  const a = buildAgenda({ today: TODAY, insights: [
    ins({ id: 'yield-strong', kind: 'positive', title: 'Δυνατή απόδοση' }),
    ins({ id: 'bills-overdue', kind: 'urgent', title: 'Ληξιπρόθεσμος λογαριασμός' }),
  ]})
  ok('το «positive» δεν σπρώχνει κάτω ό,τι χρειάζεται', a.length === 1 && a[0].title === 'Ληξιπρόθεσμος λογαριασμός')
}

// ── ΣΕΙΡΑ ΠΙΕΣΗΣ ─────────────────────────────────────────────────────────
{
  const a = buildAgenda({ today: TODAY,
    obligations: [
      obl({ id: 'a', title: 'ληξιπρόθεσμη', date: '2026-07-20', daysUntil: -16 }),
      obl({ id: 'b', title: 'σε-3-ημέρες',  date: '2026-08-08', daysUntil: 3 }),
      obl({ id: 'c', title: 'τον-Δεκέμβρη', date: '2026-12-31', daysUntil: 148, priority: 'high' }),
    ],
    insights: [ins({ id: 'z', kind: 'urgent', title: 'επείγον-χωρίς-ημερομηνία' })],
  }).map(x => x.title)
  ok('πρώτο το ληξιπρόθεσμο', a[0] === 'ληξιπρόθεσμη')
  ok('μετά η κοντινή προθεσμία', a[1] === 'σε-3-ημέρες')
  ok('το επείγον χωρίς ημερομηνία προσπερνά τη μακρινή προθεσμία', a[2] === 'επείγον-χωρίς-ημερομηνία')
  ok('τελευταία η μακρινή προθεσμία', a[3] === 'τον-Δεκέμβρη')
}

// ── Η ΣΕΙΡΑ ΕΙΝΑΙ ΣΤΑΘΕΡΗ ────────────────────────────────────────────────
{
  const items: ObligationLike[] = [
    obl({ id: 'γ', date: '2026-09-01', daysUntil: 27 }),
    obl({ id: 'α', date: '2026-09-01', daysUntil: 27 }),
    obl({ id: 'β', date: '2026-09-01', daysUntil: 27 }),
  ]
  const one = buildAgenda({ today: TODAY, obligations: items }).map(x => x.key).join()
  const two = buildAgenda({ today: TODAY, obligations: [...items].reverse() }).map(x => x.key).join()
  ok('ίδιο αποτέλεσμα ανεξάρτητα από τη σειρά εισόδου', one === two)
}
{
  const items = [setup({ key: 'α', weight: 5 }), setup({ key: 'β', weight: 5 })]
  buildAgenda({ today: TODAY, setup: items })
  ok('δεν αλλοιώνει τον πίνακα εισόδου', items.map(s => s.key).join() === 'α,β')
}

// ── ΟΡΙΟ ─────────────────────────────────────────────────────────────────
{
  const many = Array.from({ length: 9 }, (_, i) => obl({ id: `t${i}`, daysUntil: i }))
  ok('το όριο κόβει', buildAgenda({ today: TODAY, obligations: many, limit: 4 }).length === 4)
  ok('χωρίς όριο, όλα', buildAgenda({ today: TODAY, obligations: many }).length === 9)
  ok('όριο 0 = όλα', buildAgenda({ today: TODAY, obligations: many, limit: 0 }).length === 9)
}

// ── ΜΕΤΡΗΤΗΣ ΚΑΙ ΕΤΙΚΕΤΕΣ ────────────────────────────────────────────────
{
  const a = buildAgenda({ today: TODAY, obligations: [
    obl({ id: 'a', daysUntil: -3 }), obl({ id: 'b', daysUntil: -1 }), obl({ id: 'c', daysUntil: 5 }),
  ]})
  ok('μετρά μόνο τα ληξιπρόθεσμα', overdueCount(a) === 2)
}
ok('ποτέ «σε −3 ημέρες»', dueLabel(-3) === '3 ημέρες πίσω')
ok('ενικός στο ληξιπρόθεσμο', dueLabel(-1) === '1 ημέρα πίσω')
ok('σήμερα', dueLabel(0) === 'σήμερα')
ok('αύριο, όχι «σε 1 ημέρες»', dueLabel(1) === 'αύριο')
ok('σε ημέρες', dueLabel(9) === 'σε 9 ημέρες')
ok('χωρίς προθεσμία, καμία ετικέτα', dueLabel(null) === null)

// ── ΚΕΝΗ ΕΙΣΟΔΟΣ ─────────────────────────────────────────────────────────
ok('τίποτα μέσα, τίποτα έξω', buildAgenda({ today: TODAY }).length === 0)
ok('και ο μετρητής δεν σκάει', overdueCount([]) === 0)

console.log(fail === 0 ? `✓ agenda: ${pass} έλεγχοι πέρασαν` : `✗ agenda: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
