// npx tsx lib/tax/aade.test.ts
//
// ΓΙΑΤΙ ΓΡΑΦΤΗΚΕ. Πριν από αυτό το αρχείο υπήρχαν δεκατρείς διευθύνσεις ΑΑΔΕ σε
// δεκατρία σημεία, και ΠΕΝΤΕ από αυτές για το ίδιο πράγμα — τα μισθωτήρια. Το
// πολύ μία ήταν σωστή. Ένας σύνδεσμος που πέφτει σε 404 μέσα σε φορολογικό
// εργαλείο δεν χαλάει μόνο τον εαυτό του: ο χρήστης παύει να εμπιστεύεται και
// τα νούμερα δίπλα του.
//
// Οι έλεγχοι εδώ ΔΕΝ χτυπούν το δίκτυο — μια δοκιμή που εξαρτάται από το site
// της ΑΑΔΕ θα έσπαγε κάθε φορά που πέφτει ή αλλάζει. Ελέγχουν ό,τι μπορεί να
// ελεγχθεί ντετερμινιστικά: ότι κάθε ενέργεια έχει προορισμό, ότι οι διευθύνσεις
// είναι ΡΙΖΕΣ και όχι εύθραυστοι βαθείς σύνδεσμοι, και ότι η διαδρομή σε λέξεις
// υπάρχει παντού — γιατί αυτή είναι που επιβιώνει τις αναδιοργανώσεις.
import {
  AADE_DESTINATIONS, aadePath, destinationForKind, MYAADE, AADE_HOME, AADE_CALENDAR,
  type AadeAction,
} from './aade'
import { TAX_KINDS, greekPropertyTaxObligations, taxObligationNotes } from './greekTaxCalendar'

let pass = 0, fail = 0
function ok(name: string, cond: boolean) { if (cond) pass++; else { fail++; console.error('✗ ' + name) } }
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) pass++; else { fail++; console.error(`✗ ${name}\n   got  ${g}\n   want ${w}`) }
}

const ALL = Object.keys(AADE_DESTINATIONS) as AadeAction[]

// ═══ ΚΑΘΕ ΠΡΟΟΡΙΣΜΟΣ ΕΙΝΑΙ ΠΛΗΡΗΣ ═════════════════════════════════════════
{
  let bad = ''
  for (const a of ALL) {
    const d = AADE_DESTINATIONS[a]
    if (!d.label.trim()) bad += `${a}: χωρίς ετικέτα `
    if (!/^https:\/\//.test(d.url)) bad += `${a}: μη ασφαλής διεύθυνση `
    if (!d.portal.trim()) bad += `${a}: χωρίς όνομα πύλης `
    if (d.steps.length === 0) bad += `${a}: χωρίς βήματα `
    if (d.steps.some(s => !s.trim())) bad += `${a}: κενό βήμα `
  }
  eq('κάθε προορισμός έχει ετικέτα, διεύθυνση, πύλη και βήματα', bad, '')
}

// ═══ ΡΙΖΕΣ, ΟΧΙ ΕΥΘΡΑΥΣΤΟΙ ΒΑΘΕΙΣ ΣΥΝΔΕΣΜΟΙ ══════════════════════════════
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΚΛΕΙΝΕΙ: πέντε διαφορετικά «/polites/…/misthotiria…» που δεν
// μπορούν να είναι όλα σωστά. Ένας βαθύς σύνδεσμος σαπίζει σιωπηλά· μια ρίζα με
// βήματα δεν σαπίζει. Το όριο βάθους είναι ο κανόνας, γραμμένος ως έλεγχος.
{
  let deep = ''
  for (const a of ALL) {
    const path = new URL(AADE_DESTINATIONS[a].url).pathname.replace(/\/+$/, '')
    const depth = path.split('/').filter(Boolean).length
    if (depth > 3) deep += `${a} (${depth} επίπεδα) `
  }
  eq('καμία διεύθυνση δεν είναι βαθύτερη από τρία επίπεδα', deep, '')
}

// ═══ ΟΠΟΥ ΧΡΕΙΑΖΕΤΑΙ ΥΠΟΒΟΛΗ, ΠΑΕΙ ΣΤΗΝ ΕΦΑΡΜΟΓΗ ═════════════════════════
// Οι πληροφοριακές σελίδες δεν υποβάλλουν τίποτα. Ό,τι είναι ΕΝΕΡΓΕΙΑ πρέπει να
// ανοίγει το myAADE, αλλιώς ο χρήστης διαβάζει και μετά ψάχνει από την αρχή.
{
  const submits: AadeAction[] = ['lease', 'income', 'enfia', 'e9', 'str-registry', 'str-declaration', 'climate-fee', 'messages']
  let bad = ''
  for (const a of submits) {
    if (AADE_DESTINATIONS[a].url !== MYAADE) bad += `${a} `
    if (!AADE_DESTINATIONS[a].login) bad += `${a}(χωρίς δήλωση σύνδεσης) `
  }
  eq('κάθε υποβολή ανοίγει το myAADE και το λέει ότι θέλει κωδικούς', bad, '')
  ok('οι πληροφοριακές ΔΕΝ ζητούν κωδικούς',
    !AADE_DESTINATIONS.calendar.login && !AADE_DESTINATIONS['objective-values'].login)
}

// ═══ ΚΑΘΕ ΦΟΡΟΛΟΓΙΚΗ ΥΠΟΧΡΕΩΣΗ ΞΕΡΕΙ ΠΟΥ ΣΤΕΛΝΕΙ ═════════════════════════
// Πριν, ΚΑΙ ΟΙ ΟΚΤΩ έδειχναν στο ίδιο γενικό ημερολόγιο — δηλαδή σε καμία
// περίπτωση δεν απαντούσαμε «πού πάω για ΑΥΤΟ».
{
  let generic = ''
  for (const kind of TAX_KINDS) {
    const dest = destinationForKind(kind)
    if (dest === 'calendar') generic += kind + ' '
    if (!AADE_DESTINATIONS[dest]) generic += `${kind}(άγνωστος προορισμός) `
  }
  eq('καμία υποχρέωση δεν καταλήγει στο γενικό ημερολόγιο', generic, '')
  eq('η αυτόματη οριστικοποίηση πάει στη δήλωση εισοδήματος', destinationForKind('income-autofile'), 'income')
  eq('ο ΕΝΦΙΑ σε κάθε φάση πάει στον ΕΝΦΙΑ',
    ['enfia-issue', 'enfia-first', 'enfia-last'].map(destinationForKind), ['enfia', 'enfia', 'enfia'])
  eq('άγνωστο είδος πέφτει στο ημερολόγιο, όχι σε λάθος εφαρμογή', destinationForKind('κάτι-άλλο'), 'calendar')
}

// ═══ Ο ΠΡΟΟΡΙΣΜΟΣ ΦΤΑΝΕΙ ΩΣ ΤΟΝ ΧΡΗΣΤΗ ════════════════════════════════════
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΚΛΕΙΝΕΙ: το `official_url` περνούσε από το ημερολόγιο στις
// Εκκρεμότητες και εμφανιζόταν ως «Επίσημη πηγή» — δείχνοντας, και στις οκτώ
// υποχρεώσεις, το ημερολόγιο ΟΛΩΝ των φόρων της χώρας. Ο χρήστης πατούσε πάνω
// στη δόση του ΕΝΦΙΑ και έπρεπε να ψάξει από την αρχή.
{
  const year = 2026
  const all = greekPropertyTaxObligations(year, 'short_term')
  ok('υπάρχουν υποχρεώσεις να ελεγχθούν', all.length >= 8)
  let bad = ''
  for (const o of all) {
    const want = AADE_DESTINATIONS[destinationForKind(o.kind)]
    if (o.official_url !== want.url) bad += `${o.kind} `
    if (!taxObligationNotes(o).includes(aadePath(destinationForKind(o.kind)))) bad += `${o.kind}(χωρίς διαδρομή) `
  }
  eq('κάθε υποχρέωση φέρει τον δικό ΤΗΣ προορισμό και τη διαδρομή του', bad, '')
  ok('η δόση του ΕΝΦΙΑ δεν στέλνει πια στο γενικό ημερολόγιο',
    all.filter(o => o.kind.startsWith('enfia')).every(o => o.official_url !== AADE_CALENDAR))
}

// ═══ Η ΔΙΑΔΡΟΜΗ ΣΕ ΛΕΞΕΙΣ ═════════════════════════════════════════════════
{
  ok('η διαδρομή ξεκινά από την πύλη', aadePath('lease').startsWith('myAADE →'))
  ok('και περιέχει το όνομα της υπηρεσίας', /Δήλωση Πληροφοριακών Στοιχείων Μίσθωσης/.test(aadePath('lease')))
  let bad = ''
  for (const a of ALL) if (!aadePath(a).includes('→')) bad += a + ' '
  eq('κάθε διαδρομή έχει τουλάχιστον ένα βήμα μετά την πύλη', bad, '')
}

// ═══ ΚΑΜΙΑ ΠΡΟΘΕΣΜΙΑ ΕΔΩ ══════════════════════════════════════════════════
// Οι ημερομηνίες ζουν ΜΟΝΟ στο greekTaxCalendar.ts. Το TabTenant.tsx έγραφε
// «Έως 30 Ιουνίου κάθε έτους» για το Ε2 δίπλα σε σύνδεσμο, τη στιγμή που το
// ημερολόγιο λέει 15 Ιουλίου. Τρίτη ημερομηνία, καρφωμένη, και λάθος.
{
  const text = ALL.map(a => AADE_DESTINATIONS[a].label + ' ' + AADE_DESTINATIONS[a].steps.join(' ')).join(' ')
  ok('κανένας μήνας δεν αναφέρεται σε προορισμό',
    !/Ιανουαρίου|Φεβρουαρίου|Μαρτίου|Απριλίου|Μαΐου|Ιουνίου|Ιουλίου|Αυγούστου|Σεπτεμβρίου|Οκτωβρίου|Νοεμβρίου|Δεκεμβρίου/.test(text))
  ok('καμία ημερομηνία σε αριθμούς', !/\b\d{1,2}\/\d{1,2}\b|\b20\d\d\b/.test(text))
}

// ═══ ΤΟ ΟΝΟΜΑ ΤΗΣ ΑΡΧΗΣ ΓΡΑΦΕΤΑΙ ΣΩΣΤΑ ═══════════════════════════════════
// Το TabTenant.tsx έγραφε «ΑΑΑΔΕ» με τρία άλφα, δύο φορές, στην οθόνη.
{
  const text = JSON.stringify(AADE_DESTINATIONS) + AADE_HOME
  ok('πουθενά «ΑΑΑΔΕ»', !/ΑΑΑΔΕ/.test(text))
}

console.log(fail === 0 ? `✓ aade: ${pass} έλεγχοι πέρασαν` : `✗ aade: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
