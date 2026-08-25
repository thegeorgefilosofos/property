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
import { captureDownloads } from '@/lib/core/downloadCapture.testkit'
import { unzipSync } from 'fflate'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }
const eq = (n: string, got: unknown, want: unknown) => ok(`${n} (${JSON.stringify(got)} ≠ ${JSON.stringify(want)})`, JSON.stringify(got) === JSON.stringify(want))

// Το πλαστό έγγραφο ζει στο lib/core/downloadCapture.testkit.ts: ήταν γραμμένο δύο
// φορές και το ένα αντίγραφο κρατούσε το σφάλμα που έριχνε το CI.
const caught = captureDownloads()
const last = () => caught[caught.length - 1]
// `cellNF` ώστε να επιστραφεί η ΜΟΡΦΗ του κελιού, όχι μόνο η τιμή του.
const lastBook = () => XLSX.read(last().bytes, { type: 'array', cellNF: true })
const cell = (ws: XLSX.WorkSheet, a: string) => ws[a] as { v?: unknown; t?: string; z?: string; f?: string } | undefined

// Το κατέβασμα φορτώνει τη βιβλιοθήκη με δυναμική εισαγωγή. Οι έλεγχοι τρέχουν
// μέσα σε async ώστε κάθε αρχείο να έχει προλάβει να «κατέβει» πριν διαβαστεί.
void (async () => {

  // ═══ ΤΑ ΠΟΣΑ ΕΙΝΑΙ ΑΡΙΘΜΟΙ, ΟΧΙ ΚΕΙΜΕΝΟ ══════════════════════════════════
  {
    await downloadTableXlsx('Εισπράξεις δοκιμής', {
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
  // «xartofylakio»), αγγλικά («checklist», «E2_<επωνυμία>») και ελληνικά.
  {
    ok('κρατά τα ελληνικά και βάζει την κατάληξη', last().name === 'Εισπράξεις δοκιμής.xlsx')
    await downloadTableXlsx('Κατάσταση Αθήνα / Κολωνάκι 2026', { title: 'Κατάσταση', headers: ['Α'], rows: [['x']] })
    ok('η κάθετος του ονόματος ακινήτου δεν σπάει το αρχείο', !last().name.includes('/'))
    ok('και τα ελληνικά επιβιώνουν', last().name.startsWith('Κατάσταση Αθήνα'))
  }

  // ═══ ΤΟ ΜΗΔΕΝ ΕΙΝΑΙ ΜΗΔΕΝ, ΤΟ ΑΓΝΩΣΤΟ ΕΙΝΑΙ ΚΕΝΟ ═════════════════════════
  {
    await downloadTableXlsx('Μηδενικά', {
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
    await downloadTableXlsx('Με επιφύλαξη', {
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

  // ═══ ΤΟ ΣΗΜΑ ΕΙΝΑΙ ΜΕΣΑ ΣΤΟ ΑΡΧΕΙΟ, ΟΧΙ ΜΟΝΟ ΣΤΗΝ ΠΡΟΘΕΣΗ ═══════════════
  // Η δωρεάν έκδοση της βιβλιοθήκης δεν γράφει εικόνες: τις προσθέτει το
  // `workbookBytes` πειράζοντας το ZIP. Πέντε μέρη πρέπει να υπάρχουν ΟΛΑ
  // μαζί και η ετικέτα στο φύλλο πρέπει να είναι στη ΣΩΣΤΗ ΣΕΙΡΑ: το
  // `<drawing>` έρχεται μετά το `ignoredErrors` στο πρότυπο και ένα
  // εικονοστοιχείο νωρίτερα σημαίνει αρχείο που δεν ανοίγει καθόλου.
  {
    await downloadTableXlsx('Με σήμα', {
      title: 'Δοκιμή σήματος', subject: 'Ερμού 12',
      headers: ['Α', 'Β'], rows: [['ένα', 1]],
    })
    const zip = unzipSync(last().bytes)
    const names = Object.keys(zip)
    ok('το PNG του σήματος μπήκε στο αρχείο', names.includes('xl/media/properwise-mark.png'))
    ok('και είναι όντως PNG', (() => {
      const b = zip['xl/media/properwise-mark.png']
      return !!b && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
    })())
    // ΚΑΙ ΕΧΕΙ ΤΟ ΣΩΣΤΟ ΣΧΗΜΑ. Το πλάτος και το ύψος ζουν στις ψηφίδες 16 ώς
    // 23 του PNG (IHDR). Δύο ιδιότητες, καμία μαγική σταθερά:
    //   · τετράγωνο, γιατί το σχέδιο ζητά ίσο cx και cy· ένα μη τετράγωνο
    //     σήμα θα παραμορφωνόταν αντί να κοπεί και θα φαινόταν μόνο σε
    //     τυπωμένη σελίδα·
    //   · τουλάχιστον διπλάσιο από τα 40 σημεία που δείχνει, ώστε να μένει
    //     καθαρό στην εκτύπωση αντί για θολό.
    const ihdr = (() => {
      const b = zip['xl/media/properwise-mark.png']!
      const n = (o: number) => (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]
      return { w: n(16), h: n(20) }
    })()
    eq('το σήμα είναι τετράγωνο', ihdr.w, ihdr.h)
    ok(`το σήμα είναι αρκετά πυκνό για εκτύπωση (${ihdr.w})`, ihdr.w >= 80)
    ok('υπάρχει σχέδιο', names.includes('xl/drawings/drawing1.xml'))
    ok('το σχέδιο δείχνει στην εικόνα', names.includes('xl/drawings/_rels/drawing1.xml.rels'))
    const sheetRels = names.find(n => /^xl\/worksheets\/_rels\/.*\.rels$/.test(n))
    ok('το φύλλο δείχνει στο σχέδιο', !!sheetRels
      && new TextDecoder().decode(zip[sheetRels!]).includes('../drawings/drawing1.xml'))

    const ct = new TextDecoder().decode(zip['[Content_Types].xml'])
    ok('το png δηλώνεται ως τύπος', ct.includes('Extension="png"'))
    ok('το σχέδιο δηλώνεται ως τύπος', ct.includes('/xl/drawings/drawing1.xml'))

    const sheetPath = names.find(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))!
    const sheetXml = new TextDecoder().decode(zip[sheetPath])
    ok('το φύλλο κρεμά το σχέδιο', /<drawing r:id="rId\d+"\/>/.test(sheetXml))
    // Η ΣΕΙΡΑ ΕΙΝΑΙ ΤΟ ΚΡΙΣΙΜΟ: μετά από ό,τι άλλο, πριν το κλείσιμο.
    ok('και το κρεμά ΤΕΛΕΥΤΑΙΟ, όπως ζητά το πρότυπο',
      sheetXml.indexOf('<drawing ') > sheetXml.indexOf('<pageMargins')
      && sheetXml.endsWith('</worksheet>'))
  }

  console.log(fail === 0 ? `✓ exportXlsx: ${pass} έλεγχοι πέρασαν` : `✗ exportXlsx: ${fail} απέτυχαν από ${pass + fail}`)
  if (fail > 0) process.exit(1)

})()
