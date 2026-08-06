// npx tsx lib/calendar/series.test.ts
//
// ΤΙ ΦΥΛΑΕΙ ΑΥΤΗ Η ΣΟΥΙΤΑ
// Το μάζεμα σειρών κρύβει γραμμές από την οθόνη. Αυτό είναι επικίνδυνο με τον
// τρόπο που δεν φαίνεται: αν μαζέψει κάτι που δεν είναι σειρά, ο χρήστης χάνει
// ένα γεγονός και δεν το μαθαίνει ποτέ. Γι' αυτό ελέγχονται ΚΑΙ ΟΙ ΔΥΟ φορές:
// τι μαζεύεται ΚΑΙ τι δεν επιτρέπεται να μαζευτεί — και ότι το άθροισμα των
// γραμμών ισούται πάντα με το πλήθος της εισόδου, ό,τι κι αν συμβεί.
import { groupSeries, detectCadence, rowCount, MIN_SERIES, type SeriesLike } from './series'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }
const eq = (n: string, got: unknown, want: unknown) =>
  ok(`${n} (${JSON.stringify(got)} = ${JSON.stringify(want)})`, JSON.stringify(got) === JSON.stringify(want))

const ev = (o: Partial<SeriesLike> & { event_date: string }): SeriesLike =>
  ({ id: o.event_date + (o.title || ''), title: 'Δόση δανείου', amount: 751.43, source: 'loan_schedule:πειραιώς', ...o })

// ── Ο ΡΥΘΜΟΣ ─────────────────────────────────────────────────────────────
eq('μηνιαίο', detectCadence(['2026-08-21', '2026-09-21', '2026-10-21']), 'κάθε μήνα')
eq('τριμηνιαίο', detectCadence(['2026-01-15', '2026-04-15', '2026-07-15']), 'κάθε τρίμηνο')
eq('ετήσιο', detectCadence(['2024-03-31', '2025-03-31', '2026-03-31']), 'κάθε χρόνο')
eq('εβδομαδιαίο', detectCadence(['2026-08-03', '2026-08-10', '2026-08-17']), 'κάθε εβδομάδα')
eq('ανακατεμένες ημερομηνίες ταξινομούνται πρώτα',
   detectCadence(['2026-10-21', '2026-08-21', '2026-09-21']), 'κάθε μήνα')

// Η ΜΗΝΙΑΙΑ ΔΟΣΗ ΜΕΤΡΙΕΤΑΙ ΣΕ ΜΗΝΕΣ, ΟΧΙ ΣΕ ΗΜΕΡΕΣ. 31/01 → 28/02 είναι 28
// ημέρες, 28/02 → 31/03 είναι 31. Μετρημένο σε ημέρες, ένα απολύτως κανονικό
// πρόγραμμα δεν φαίνεται ποτέ κανονικό και η σειρά δεν μαζεύεται ποτέ.
eq('τέλος μήνα με κοντό Φεβρουάριο μένει μηνιαίο',
   detectCadence(['2026-01-31', '2026-02-28', '2026-03-31']), 'κάθε μήνα')
eq('άτακτες ημερομηνίες δεν έχουν ρυθμό',
   detectCadence(['2026-08-03', '2026-08-19', '2026-09-02']), null)
eq('μία ημερομηνία δεν είναι ρυθμός', detectCadence(['2026-08-03']), null)
eq('κενή λίστα', detectCadence([]), null)
eq('σκουπίδια δεν σπάνε τίποτα', detectCadence(['', 'χθες', '2026-08-03']), null)
eq('ίδια ημερομηνία δύο φορές δεν είναι ρυθμός', detectCadence(['2026-08-03', '2026-08-03']), null)

// ── ΤΙ ΜΑΖΕΥΕΤΑΙ ─────────────────────────────────────────────────────────
{
  const many = Array.from({ length: 119 }, (_, i) =>
    ev({ event_date: `${2026 + Math.floor((7 + i) / 12)}-${String(((7 + i) % 12) + 1).padStart(2, '0')}-21` }))
  const rows = groupSeries(many)
  eq('εκατόν δεκαεννέα δόσεις γίνονται μία γραμμή', rows.length, 1)
  ok('η γραμμή είναι σειρά', rows[0].kind === 'series')
  if (rows[0].kind === 'series') {
    eq('με το σωστό πλήθος', rows[0].count, 119)
    eq('και τον ρυθμό της', rows[0].cadence, 'κάθε μήνα')
    eq('πρώτη εμφάνιση η πρώτη που δόθηκε', rows[0].lead.event_date, '2026-08-21')
    eq('κρυμμένες οι υπόλοιπες', rows[0].rest.length, 118)
    ok('άθροισμα ποσών χωρίς σφάλμα κινητής υποδιαστολής',
       rows[0].totalAmount === Math.round(119 * 751.43 * 100) / 100)
  }
  eq('καμία εγγραφή δεν χάνεται', rows.reduce((s, r) => s + rowCount(r), 0), 119)
}

// ── ΤΙ ΔΕΝ ΜΑΖΕΥΕΤΑΙ ─────────────────────────────────────────────────────
{
  const two = [ev({ event_date: '2026-08-21' }), ev({ event_date: '2026-09-21' })]
  eq('δύο εγγραφές δεν είναι σειρά', groupSeries(two).length, 2)
  ok('το ελάχιστο είναι τρία', MIN_SERIES === 3)
}
{
  // Ίδιος τίτλος, ίδιο ποσό, ΧΩΡΙΣ πηγή και ΧΩΡΙΣ ρυθμό: τρία άσχετα ραντεβού
  // που έτυχε να λέγονται ίδια. Αν μαζεύονταν, δύο θα εξαφανίζονταν.
  const loose = [
    ev({ event_date: '2026-08-03', source: '', title: 'Συνάντηση' }),
    ev({ event_date: '2026-08-19', source: '', title: 'Συνάντηση' }),
    ev({ event_date: '2026-09-02', source: '', title: 'Συνάντηση' }),
  ]
  eq('χωρίς πηγή και χωρίς ρυθμό δεν μαζεύονται', groupSeries(loose).length, 3)
}
{
  // Χωρίς πηγή αλλά ΜΕ ρυθμό: αυτό είναι σειρά που έφτιαξε ο χρήστης στο χέρι.
  const manual = ['2026-08-01', '2026-09-01', '2026-10-01'].map(d =>
    ev({ event_date: d, source: '', title: 'Κοινόχρηστα', amount: 45 }))
  const rows = groupSeries(manual)
  eq('χωρίς πηγή αλλά με ρυθμό, μαζεύονται', rows.length, 1)
  eq('χωρίς να χαθεί καμία', rows.reduce((s, r) => s + rowCount(r), 0), 3)
}
{
  // Ίδιος τίτλος, ΔΙΑΦΟΡΕΤΙΚΟ ποσό, χωρίς πηγή: δεν είναι η ίδια υποχρέωση.
  const mixed = [
    ev({ event_date: '2026-08-01', source: '', title: 'ΔΕΗ', amount: 40 }),
    ev({ event_date: '2026-09-01', source: '', title: 'ΔΕΗ', amount: 62 }),
    ev({ event_date: '2026-10-01', source: '', title: 'ΔΕΗ', amount: 51 }),
  ]
  eq('ίδιος τίτλος με άλλα ποσά μένει αναλυτικός', groupSeries(mixed).length, 3)
}
{
  // Δύο δάνεια, δύο πηγές: δύο σειρές, όχι μία.
  const a = ['2026-08-21', '2026-09-21', '2026-10-21'].map(d => ev({ event_date: d }))
  const b = ['2026-08-15', '2026-09-15', '2026-10-15'].map(d =>
    ev({ event_date: d, source: 'loan_schedule:εθνική', title: 'Δόση δανείου, Εθνική' }))
  const rows = groupSeries([...a, ...b])
  eq('δύο πηγές, δύο σειρές', rows.length, 2)
  eq('και οι έξι εγγραφές μετριούνται', rows.reduce((s, r) => s + rowCount(r), 0), 6)
}

// ── Η ΣΕΙΡΑ ΤΗΣ ΟΘΟΝΗΣ ΔΙΑΤΗΡΕΙΤΑΙ ───────────────────────────────────────
{
  // Η ομάδα κάθεται εκεί που κάθεται η ΠΡΩΤΗ της εγγραφή. Αλλιώς μια σειρά που
  // ξεκινά τον Δεκέμβριο θα πηδούσε πάνω από ένα γεγονός του Αυγούστου.
  const mix: SeriesLike[] = [
    { id: 'x', title: 'Λήξη μίσθωσης', event_date: '2026-08-10', amount: null, source: '' },
    ...['2026-08-21', '2026-09-21', '2026-10-21'].map(d => ev({ event_date: d })),
    { id: 'y', title: 'Έλεγχος λέβητα', event_date: '2026-11-02', amount: null, source: '' },
  ]
  const rows = groupSeries(mix)
  eq('τρεις γραμμές', rows.length, 3)
  ok('πρώτο ό,τι ήταν πρώτο', rows[0].kind === 'single' && rows[0].event.title === 'Λήξη μίσθωσης')
  ok('η σειρά στη θέση της πρώτης της δόσης', rows[1].kind === 'series')
  ok('τελευταίο ό,τι ήταν τελευταίο', rows[2].kind === 'single' && rows[2].event.title === 'Έλεγχος λέβητα')
  eq('όλα μετρημένα', rows.reduce((s, r) => s + rowCount(r), 0), 5)
}

// ── ΑΚΡΑ ─────────────────────────────────────────────────────────────────
eq('κενή είσοδος', groupSeries([]).length, 0)
{
  const noAmounts = ['2026-08-21', '2026-09-21', '2026-10-21'].map(d => ev({ event_date: d, amount: null }))
  const rows = groupSeries(noAmounts)
  ok('σειρά χωρίς ποσά δεν επινοεί άθροισμα',
     rows[0].kind === 'series' && rows[0].totalAmount === null)
}
{
  const rows = groupSeries(['2026-08-21', '2026-09-21', '2026-10-21'].map(d => ev({ event_date: d })), 10)
  eq('το ελάχιστο μέγεθος είναι παράμετρος', rows.length, 3)
}

console.log(fail === 0 ? `✓ series: ${pass} έλεγχοι πέρασαν` : `✗ series: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
