// npx tsx app/dashboard/components/exportXlsx.test.ts
//
// ΤΟ ΑΡΧΕΙΟ ΠΟΥ ΦΤΑΝΕΙ ΣΤΟΝ ΛΟΓΙΣΤΗ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΓΕΝΝΗΣΕ ΑΥΤΕΣ ΤΙΣ ΔΟΚΙΜΕΣ. Η προεπιλεγμένη εξαγωγή έγραφε τα
// ποσά ως ΚΕΙΜΕΝΟ, «1.234,56 €». Το φύλλο φαινόταν άψογο· επιλέγοντας όμως τη
// στήλη, το Excel έδειχνε «Άθροισμα: 0» και σημάδευε κάθε κελί με «αριθμός
// αποθηκευμένος ως κείμενο». Καμία δοκιμή δεν το έπιανε, γιατί καμία δοκιμή δεν
// άνοιγε ποτέ το παραγόμενο αρχείο.
//
// Εδώ το βιβλίο παράγεται ΠΡΑΓΜΑΤΙΚΑ και ξανα-ανοίγεται από τα byte του. Ό,τι
// ελέγχεται είναι ό,τι θα δει ο παραλήπτης.
import { downloadXlsx } from './exportXlsx'
import { downloadTableXlsx } from './exportCsv'
import { XLSX } from './xlsxStyle'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }
const eq = (n: string, got: unknown, want: unknown) => ok(`${n} (${JSON.stringify(got)} ≠ ${JSON.stringify(want)})`, JSON.stringify(got) === JSON.stringify(want))

// ── Πλαστό έγγραφο: κρατά όνομα και byte του αρχείου που «κατέβηκε» ────────
const caught: { name: string; bytes: Uint8Array }[] = []
{
  let pending: Uint8Array | null = null
  const g = globalThis as Record<string, unknown>
  g.URL = { createObjectURL: (b: { __bytes: Uint8Array }) => { pending = b.__bytes; return 'blob:test' }, revokeObjectURL: () => {} }
  g.Blob = class { __bytes: Uint8Array; constructor(parts: ArrayBuffer[]) { this.__bytes = new Uint8Array(parts[0]) } }
  const el = { href: '', download: '', style: {} as Record<string, string>, click() { caught.push({ name: this.download, bytes: pending! }) }, remove() {} }
  g.document = { createElement: () => el, body: { appendChild: () => {} } }
  const realTimeout = globalThis.setTimeout
  g.setTimeout = ((fn: () => void, ms: number) => realTimeout(fn, ms).unref?.() ?? realTimeout(fn, ms)) as typeof setTimeout
}
const last = () => caught[caught.length - 1]
// `cellNF` ώστε να επιστραφεί η ΜΟΡΦΗ του κελιού, όχι μόνο η τιμή του.
const lastBook = () => XLSX.read(last().bytes, { type: 'array', cellNF: true })
const cell = (ws: XLSX.WorkSheet, a: string) => ws[a] as { v?: unknown; t?: string; z?: string; f?: string } | undefined

// ═══ ΤΑ ΠΟΣΑ ΕΙΝΑΙ ΑΡΙΘΜΟΙ, ΟΧΙ ΚΕΙΜΕΝΟ ══════════════════════════════════
{
  downloadTableXlsx('Εισπράξεις δοκιμής', {
    title: 'Εισπράξεις ενοικίου', subject: 'Ερμού 12',
    headers: ['Περίοδος', 'Ποσό (€)', 'Κατάσταση'],
    rows: [['Ιανουάριος', 800, 'Πληρώθηκε'], ['Φεβρουάριος', 750.5, 'Πληρώθηκε']],
  })
  const ws = lastBook().Sheets['Εισπράξεις ενοικίου']
  ok('το φύλλο υπάρχει με το όνομα του περιεχομένου', !!ws)

  // Γραμμές: 0 τίτλος, 1 υπότιτλος, 2 κενή, 3 επικεφαλίδες, 4-5 δεδομένα, 6 σύνολο.
  eq('το ποσό είναι αριθμητικό κελί', cell(ws, 'B5')?.t, 'n')
  eq('και κρατά την ακριβή τιμή', cell(ws, 'B5')?.v, 800)
  eq('τα δεκαδικά δεν χάνονται', cell(ws, 'B6')?.v, 750.5)
  ok('φέρει ελληνική μορφή νομίσματος', /\[\$-408\]/.test(String(cell(ws, 'B5')?.z)))
  ok('το κείμενο μένει κείμενο', cell(ws, 'A5')?.t === 's')

  // ΤΟ ΣΥΝΟΛΟ ΕΙΝΑΙ ΖΩΝΤΑΝΟ, ΚΑΙ ΣΩΣΤΟ. Πριν έβγαινε «0,00 €» κάτω από στήλη
  // γεμάτη ποσά, γιατί άθροιζε συμβολοσειρές.
  eq('η γραμμή ΣΥΝΟΛΟ υπάρχει', cell(ws, 'A7')?.v, 'ΣΥΝΟΛΟ')
  eq('με τύπο SUM', cell(ws, 'B7')?.f, 'SUM(B5:B6)')
  eq('και με σωστή αποθηκευμένη τιμή', cell(ws, 'B7')?.v, 1550.5)
}

// ═══ ΤΟ ΟΝΟΜΑ ΤΟΥ ΑΡΧΕΙΟΥ ════════════════════════════════════════════════
// Τα ονόματα ήταν γραμμένα σε τρεις γλώσσες: greeklish («enoikio», «atzenta»,
// «xartofylakio»), αγγλικά («checklist», «E2_property-os») και ελληνικά.
{
  ok('κρατά τα ελληνικά και βάζει την κατάληξη', last().name === 'Εισπράξεις δοκιμής.xlsx')
  downloadTableXlsx('Κατάσταση Αθήνα / Κολωνάκι 2026', { title: 'Κατάσταση', headers: ['Α'], rows: [['x']] })
  ok('η κάθετος του ονόματος ακινήτου δεν σπάει το αρχείο', !last().name.includes('/'))
  ok('και τα ελληνικά επιβιώνουν', last().name.startsWith('Κατάσταση Αθήνα'))
}

// ═══ ΤΟ ΜΗΔΕΝ ΕΙΝΑΙ ΜΗΔΕΝ, ΤΟ ΑΓΝΩΣΤΟ ΕΙΝΑΙ ΚΕΝΟ ═════════════════════════
{
  downloadTableXlsx('Μηδενικά', {
    title: 'Μηδενικά', headers: ['Ακίνητο', 'Ποσό (€)'],
    rows: [['Χωρίς είσπραξη', 0], ['Άγνωστο', '']],
  })
  const ws = lastBook().Sheets['Μηδενικά']
  eq('το πραγματικό μηδέν γράφεται μηδέν', cell(ws, 'B5')?.v, 0)
  eq('και μένει αριθμός', cell(ws, 'B5')?.t, 'n')
  ok('το άγνωστο μένει κενό, δεν γίνεται μηδέν', (cell(ws, 'B6')?.v ?? '') === '')
}

// ═══ ΟΙ ΕΠΙΦΥΛΑΞΕΙΣ ΕΞΩ ΑΠΟ ΤΟΝ ΠΙΝΑΚΑ ═══════════════════════════════════
// Το TabComparison τις έσπρωχνε μέσα στα δεδομένα: έμπαιναν στο φίλτρο και,
// ταξινομώντας, προσγειώνονταν στη μέση του πίνακα.
{
  downloadTableXlsx('Με επιφύλαξη', {
    title: 'Με επιφύλαξη', headers: ['Ακίνητο', 'Ποσό (€)'],
    rows: [['Α', 100]], notes: ['Η σύγκριση αφορά μόνο όσα εμφανίζονται.', ''],
  })
  const ws = lastBook().Sheets['Με επιφύλαξη']
  const filter = (ws['!autofilter'] as { ref: string } | undefined)?.ref
  eq('το φίλτρο σταματά στην τελευταία γραμμή δεδομένων', filter, 'A4:B5')
  ok('η επιφύλαξη γράφτηκε κάτω από το σύνολο', String(cell(ws, 'A8')?.v || '').startsWith('Η σύγκριση'))
  ok('η κενή επιφύλαξη δεν αφήνει κενή γραμμή', !cell(ws, 'A9'))
}

// ═══ ΤΟ ΦΥΛΛΟ ΤΥΠΩΝΕΤΑΙ ══════════════════════════════════════════════════
{
  downloadXlsx('Πολλά φύλλα', [
    { name: 'Πρώτο', title: 'Πρώτο', columns: [{ header: 'Α' }], rows: [['x']] },
    { name: 'Πρώτο', title: 'Δεύτερο με το ίδιο όνομα', columns: [{ header: 'Α' }], rows: [['y']] },
  ])
  const wb = lastBook()
  eq('τα διπλότυπα ονόματα φύλλων ξεχωρίζουν', wb.SheetNames, ['Πρώτο', 'Πρώτο 2'])
  ok('κάθε φύλλο έχει περιθώρια εκτύπωσης', wb.SheetNames.every(n => !!wb.Sheets[n]['!margins']))
  const names = (wb.Workbook?.Names || []) as { Name: string }[]
  eq('η γραμμή επικεφαλίδων επαναλαμβάνεται σε κάθε σελίδα', names.filter(n => n.Name === '_xlnm.Print_Titles').length, 2)
}

// ═══ ΤΟ ΟΝΟΜΑ ΦΥΛΛΟΥ ΔΕΝ ΧΑΛΑΕΙ ΤΟ ΑΡΧΕΙΟ ═══════════════════════════════
// Πάνω από 31 χαρακτήρες ή με \ / ? * [ ] : το Excel αρνείται να ανοίξει το
// βιβλίο ΟΛΟΚΛΗΡΟ — όχι το φύλλο, το αρχείο.
{
  downloadXlsx('Μακρύ όνομα', [{
    name: 'Ένα υπερβολικά μακρύ όνομα φύλλου: με άκυρους/χαρακτήρες [μέσα]',
    title: 'Τ', columns: [{ header: 'Α' }], rows: [['x']],
  }])
  const n = lastBook().SheetNames[0]
  ok('κόβεται στα 31', n.length <= 31)
  ok('χωρίς άκυρους χαρακτήρες', !/[\\/?*[\]:]/.test(n))
}

console.log(fail === 0 ? `✓ exportXlsx: ${pass} έλεγχοι πέρασαν` : `✗ exportXlsx: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
