// npx tsx lib/home/agenda.test.ts
//
// ΤΟ ΙΔΙΟ ΠΡΑΓΜΑ, ΜΙΑ ΦΟΡΑ.
// Η λήξη της μίσθωσης εμφανιζόταν τέσσερις φορές στην αρχική οθόνη, η ασφάλεια
// δύο, τα ελλιπή στοιχεία δύο. Αυτό το αρχείο κρατά τη συγχώνευση ειλικρινή: αν
// κάποιος προσθέσει πηγή χωρίς να δηλώσει θέμα, τα διπλότυπα επιστρέφουν σιωπηλά.
import {
  buildAgenda, obligationSubject, insightSubject, overdueCount, dueLabel, dueParts, shortNote,
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
    setup: [setup({ key: 'details', label: 'Συμπλήρωσε αξία και ενοίκιο', weight: 10 })],
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
  // Ρητός, φαρδύς ορίζοντας: ΕΔΩ ελέγχεται η ΣΕΙΡΑ, όχι το πόσο μακριά βλέπει η
  // λίστα. Χωρίς αυτό, η προθεσμία των 148 ημερών θα φιλτραριζόταν από την
  // προεπιλογή των 100 και ο έλεγχος ταξινόμησης δεν θα είχε τι να ταξινομήσει.
  const a = buildAgenda({ today: TODAY, horizonDays: 400,
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

// ── Η προθεσμία σε στήλη ───────────────────────────────────────────────────
// Ο αριθμός πρέπει να βγαίνει ΧΩΡΙΣΤΑ από τη μονάδα, αλλιώς η στήλη δεν
// στοιχίζεται. Και το πρόσημο δεν χάνεται: το «πίσω» είναι στη μονάδα.
{
  const past = dueParts(-22);
  ok('εκπρόθεσμο: θετικός αριθμός', past.value === 22);
  ok('εκπρόθεσμο: η μονάδα λέει «πίσω»', past.unit === 'ημέρες πίσω');
  ok('εκπρόθεσμο: σημαδεύεται', past.overdue === true);
  const one = dueParts(-1);
  ok('μία ημέρα πίσω, ενικός', one.unit === 'ημέρα πίσω');
  const soon = dueParts(204);
  ok('μελλοντικό: σκέτος αριθμός', soon.value === 204 && soon.unit === 'ημέρες');
  ok('μελλοντικό: δεν είναι εκπρόθεσμο', soon.overdue === false);
  ok('σήμερα: λέξη αντί για μηδέν', dueParts(0).word === 'σήμερα' && dueParts(0).value === null);
  ok('αύριο: λέξη αντί για ένα', dueParts(1).word === 'αύριο' && dueParts(1).value === null);
  ok('χωρίς προθεσμία: τίποτα', dueParts(null).value === null && dueParts(null).word === null);
}

// ── Η σημείωση της αρχικής: μία πρόταση, χωρίς διευθύνσεις ────────────────
{
  const full = 'Καταληκτική υποβολή δήλωσης φορολογίας εισοδήματος (Ε1). Το εισόδημα δηλώνεται στο Ε2. '
             + 'Επιβεβαίωσε στο myAADE (https://www.aade.gr/eforologiko-imerologio) και στο https://www.taxheaven.gr/calendar. '
             + 'Ποιος το κάνει: Το κάνει ο λογιστής.'
  const short = shortNote(full)
  ok('κρατά μόνο την πρώτη πρόταση', short === 'Καταληκτική υποβολή δήλωσης φορολογίας εισοδήματος (Ε1).')
  ok('καμία διεύθυνση δεν επιβιώνει', !/https?:/.test(short))
  ok('χωράει σε δύο γραμμές', short.length <= 150)
  ok('κενό μένει κενό', shortNote('') === '' && shortNote(null) === '')
  ok('μικρό κείμενο περνά ατόφιο', shortNote('Δύο λέξεις.') === 'Δύο λέξεις.')
  // Δεν σπάει σε συντομογραφία ούτε σε δεκαδικό.
  ok('δεν κόβει στο «τ.μ.»', shortNote('Ακίνητο 85 τ.μ. στο κέντρο. Δεύτερη πρόταση.') === 'Ακίνητο 85 τ.μ. στο κέντρο.')
  const long = shortNote('Α'.repeat(400))
  ok('πολύ μεγάλη πρόταση κόβεται με αποσιωπητικά', long.length <= 151 && long.endsWith('…'))
}

// ── Ο ορίζοντας: τι μπαίνει στην πρώτη οθόνη ──────────────────────────────
{
  const obl = (id: string, daysUntil: number): ObligationLike =>
    ({ id, title: id, note: '', date: '2026-12-31', daysUntil, priority: 'medium' } as ObligationLike)
  const items = buildAgenda({
    obligations: [obl('κοντινό', 30), obl('στο όριο', 100), obl('μακρινό', 101), obl('πολύ μακρινό', 222), obl('εκπρόθεσμο', -22)],
    today: '2026-08-06',
  })
  const keys = items.map(i => i.title)
  ok('το κοντινό μπαίνει', keys.includes('κοντινό'))
  ok('το όριο των 100 μπαίνει', keys.includes('στο όριο'))
  ok('το 101 ΔΕΝ μπαίνει', !keys.includes('μακρινό'))
  ok('το 222 ΔΕΝ μπαίνει', !keys.includes('πολύ μακρινό'))
  // ΤΟ ΕΚΠΡΟΘΕΣΜΟ ΔΕΝ ΚΟΒΕΤΑΙ ΠΟΤΕ. Όριο που κρύβει καθυστέρηση είναι επικίνδυνο.
  ok('το εκπρόθεσμο μπαίνει πάντα', keys.includes('εκπρόθεσμο'))
  ok('και είναι πρώτο', items[0].title === 'εκπρόθεσμο')

  const wide = buildAgenda({ obligations: [obl('μακρινό', 222)], today: '2026-08-06', horizonDays: 365 })
  ok('με μεγαλύτερο ορίζοντα φαίνεται', wide.map(i => i.title).includes('μακρινό'))
  const narrow = buildAgenda({ obligations: [obl('κοντινό', 30)], today: '2026-08-06', horizonDays: 7 })
  ok('με μικρότερο ορίζοντα κόβεται', !narrow.map(i => i.title).includes('κοντινό'))
  ok('άκυρος ορίζοντας πέφτει στην προεπιλογή',
     buildAgenda({ obligations: [obl('κοντινό', 30)], today: '2026-08-06', horizonDays: 0 }).length === 1)
}

// ── ΤΟ ΚΡΙΣΙΜΟ ΕΙΝΑΙ ΠΑΝΩ ΑΠΟ ΤΟ ΜΕΣΑΙΟ ──────────────────────────────────
// Ο πίνακας βαρών είχε high/medium/low. Το «critical» δεν υπήρχε, οπότε έπεφτε
// στο εφεδρικό 5 — κάτω από το medium (6). Μια κρίσιμη υποχρέωση χωρίς κοντινή
// προθεσμία καθόταν χαμηλότερα από μια μεσαία ΕΠΕΙΔΗ ήταν κρίσιμη.
{
  const list = buildAgenda({
    obligations: [
      obl({ id: 'a', title: 'Μεσαία', date: '', daysUntil: Number.NaN, priority: 'medium' }),
      obl({ id: 'b', title: 'Κρίσιμη', date: '', daysUntil: Number.NaN, priority: 'critical' }),
    ],
    today: TODAY,
  })
  ok('χωρίς προθεσμία, το κρίσιμο προηγείται του μεσαίου', list[0]?.title === 'Κρίσιμη')
  ok('και τα δύο μένουν στη λίστα', list.length === 2)
}

// ── ΟΙ ΕΡΓΑΣΙΕΣ ΣΥΝΤΗΡΗΣΗΣ ΜΠΑΙΝΟΥΝ ΣΤΗΝ ΙΔΙΑ ΣΕΙΡΑ ─────────────────────
// Η Επισκόπηση περνά τις εργασίες του `maintenance_tasks` ως υποχρεώσεις με
// `daysUntil: NaN`, ώστε τις ημέρες να τις μετρήσει η ίδια η ατζέντα από την
// ημερομηνία — με ημερολόγιο Αθήνας, όχι με δεύτερη δική της μέτρηση.
{
  const list = buildAgenda({
    obligations: [
      obl({ id: 'lease_end', title: 'Λήξη μίσθωσης', date: '2026-09-30', daysUntil: 56 }),
      obl({ id: 'task:1', title: 'Έλεγχος λέβητα', date: '2026-08-07', daysUntil: Number.NaN }),
    ],
    today: TODAY,
  })
  ok('η εργασία με NaN παίρνει ημέρες από την ημερομηνία',
     list.find(i => i.title === 'Έλεγχος λέβητα')?.daysLeft === 2)
  ok('και μπαίνει ΠΡΙΝ από ό,τι λήγει αργότερα', list[0]?.title === 'Έλεγχος λέβητα')
}

// Εργασία εκτός ορίζοντα δεν είναι «τώρα»· εκπρόθεσμη είναι πάντα.
{
  const far = buildAgenda({
    obligations: [obl({ id: 'task:2', title: 'Μακρινή', date: '2027-06-01', daysUntil: Number.NaN })],
    today: TODAY, horizonDays: 100,
  })
  ok('εργασία πέρα από τον ορίζοντα δεν εμφανίζεται', far.length === 0)
  const late = buildAgenda({
    obligations: [obl({ id: 'task:3', title: 'Ξεχασμένη', date: '2026-05-01', daysUntil: Number.NaN })],
    today: TODAY, horizonDays: 100,
  })
  ok('εκπρόθεσμη εργασία μένει πάντα', late.length === 1 && (late[0].daysLeft ?? 0) < 0)
}

// ═══ ΣΕ ΙΣΟΠΑΛΙΑ ΑΠΟΦΑΣΙΖΟΥΝ ΤΑ ΧΡΗΜΑΤΑ ═══════════════════════════════════
// Πριν, δύο γραμμές με ίδια προθεσμία τις ξεχώριζε το αλφάβητο του κλειδιού:
// ένας λογαριασμός 18 € μπορούσε να κάθεται πάνω από έναν 640 €. Οι έλεγχοι
// κλειδώνουν και τα τρία σκέλη του κανόνα, γιατί το τρίτο είναι το λεπτό.
{
  const a = buildAgenda({
    today: TODAY,
    obligations: [],
    insights: [
      ins({ id: 'aaa-small', kind: 'urgent', title: 'Μικρό', stake: 18 }),
      ins({ id: 'zzz-big', kind: 'urgent', title: 'Μεγάλο', stake: 640 }),
    ],
  })
  ok('ισοβαρή: πρώτο ό,τι κοστίζει περισσότερο', a[0].title === 'Μεγάλο' && a[1].title === 'Μικρό')
}
{
  // Το ποσό ΔΕΝ προσπερνά την προθεσμία: μια κοντινή προθεσμία με 5 € μένει
  // πάνω από ένα μακρινό με 5.000 €. Το χρήμα σπάει ισοπαλίες, δεν τις φτιάχνει.
  const a = buildAgenda({
    today: TODAY,
    obligations: [
      obl({ id: 'near', title: 'Κοντινό', date: '2026-08-08', daysUntil: 3 }),
      obl({ id: 'far', title: 'Μακρινό', date: '2027-02-01', daysUntil: 180 }),
    ],
    insights: [ins({ id: 'far-money', kind: 'urgent', title: 'Ακριβό μακρινό', stake: 5000 })],
  })
  ok('η προθεσμία μένει πάνω από το ποσό', a[0].title === 'Κοντινό')
}
{
  // Οσα δεν έχουν ποσό δεν είναι «μηδέν ευρώ», είναι αμέτρητα σε ευρώ. Σε
  // ισοβαρή προηγείται το μετρημένο, γιατί γι' αυτό ξέρουμε τι να πούμε.
  const a = buildAgenda({
    today: TODAY,
    obligations: [],
    insights: [
      ins({ id: 'aaa-none', kind: 'urgent', title: 'Χωρίς ποσό' }),
      ins({ id: 'zzz-some', kind: 'urgent', title: 'Με ποσό', stake: 1 }),
    ],
  })
  ok('το μετρημένο προηγείται του αμέτρητου', a[0].title === 'Με ποσό')
}

console.log(fail === 0 ? `✓ agenda: ${pass} έλεγχοι πέρασαν` : `✗ agenda: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
