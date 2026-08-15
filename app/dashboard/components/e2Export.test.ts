// npx tsx app/dashboard/components/e2Export.test.ts
//
// ΠΑΡΑΓΕΙ ΟΝΤΩΣ ΑΡΧΕΙΟ Η ΕΞΑΓΩΓΗ Ε2;
// ─────────────────────────────────────────────────────────────────────────
// Η `runE2Export` έμεινε μήνες χωρίς κανέναν καλούντα: μεταγλωττιζόταν καθαρά,
// περνούσε κάθε έλεγχο τύπων, και δεν είχε παραγάγει ποτέ αρχείο. Ένα
// χαρακτηριστικό που πουλιέται με συνδρομή δεν επιτρέπεται να στηρίζεται στο ότι
// «ο κώδικας φαίνεται σωστός».
//
// Εδώ καλείται η ΠΡΑΓΜΑΤΙΚΗ συνάρτηση με πλαστό πελάτη Supabase, ΚΑΙ με πλαστό
// έγγραφο: η εξαγωγή περνά πια από το `lib/core/download.ts`, τη μία υλοποίηση
// λήψης της εφαρμογής, αντί να γράφει μόνη της στον δίσκο. Το πλαστό έγγραφο
// πιάνει τα ίδια τα byte του αρχείου, οπότε ελέγχεται ό,τι θα κατέβαινε στον
// χρήστη — και επιπλέον ότι το κατέβασμα ΟΝΤΩΣ ενεργοποιήθηκε και με ποιο όνομα.
// Αδοκίμαστος μένει μόνο ο διάλογος αποθήκευσης του περιηγητή.
//
// ΤΙ ΕΠΙΑΣΕ ΗΔΗ: με `status_detail: 'rent_long'` το ακαθάριστο έβγαινε κενό και η
// γραμμή ΣΥΝΟΛΟ μηδενική. Το «rent_long» είναι ΠΑΡΑΓΟΜΕΝΗ κατάσταση
// (`readStatus`), όχι αποθηκευμένη τιμή — αλλά η αποτυχία έδειξε ότι το έντυπο
// διάβαζε το `status_detail` ωμό, αγνοώντας το `rental_mode`, και ένα ακίνητο
// «rented» + «short_term» έπαιρνε κωδικό «1 · Εκμίσθωση» αντί «60 · Βραχυχρόνια»
// με τις διαμονές του να μη μετριούνται καθόλου.
import { runE2Export } from './e2Export'
import { XLSX } from './xlsxStyle'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }

const YEAR = 2025
const PID = '11111111-1111-1111-1111-111111111111'

// ── Πλαστό έγγραφο: κρατά τα byte και το όνομα του αρχείου που «κατέβηκε» ──
const caught: { name: string; bytes: Uint8Array }[] = []
{
  let pending: Uint8Array | null = null
  const g = globalThis as Record<string, unknown>
  g.URL = {
    createObjectURL: (b: { __bytes: Uint8Array }) => { pending = b.__bytes; return 'blob:test' },
    revokeObjectURL: () => {},
  }
  g.Blob = class { __bytes: Uint8Array; constructor(parts: ArrayBuffer[]) { this.__bytes = new Uint8Array(parts[0]) } }
  const el = { href: '', download: '', style: {} as Record<string, string>, click() { caught.push({ name: this.download, bytes: pending! }) }, remove() {} }
  g.document = { createElement: () => el, body: { appendChild: () => {} } }
  // Ο χρονοδιακόπτης της ανάκλησης δεν πρέπει να κρατά ζωντανή τη διεργασία.
  const realTimeout = globalThis.setTimeout
  g.setTimeout = ((fn: () => void, ms: number) => realTimeout(fn, ms).unref?.() ?? realTimeout(fn, ms)) as typeof setTimeout
}

/** Το τελευταίο αρχείο που κατέβηκε, ανοιγμένο ως βιβλίο. */
const lastWorkbook = () => XLSX.read(caught[caught.length - 1].bytes, { type: 'array' })

/** Πλαστός πελάτης: κάθε φίλτρο επιστρέφει τον εαυτό του, το await δίνει τα δεδομένα. */
function clientWith(data: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const rows = data[table] ?? []
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'is', 'order', 'not', 'limit', 'gte', 'lte']) chain[m] = () => chain
      ;(chain as { then: unknown }).then = (res: (v: unknown) => void) => res({ data: rows, error: null })
      return chain
    },
  } as never
}

const LONG_TERM = {
  user_properties: [{
    id: PID, atak: '12345678901', address: 'Ερμού 12, Αθήνα', postal_code: '10563',
    ownership: '100', prop_type: 'apartment',
    // ΟΙ ΑΠΟΘΗΚΕΥΜΕΝΕΣ τιμές, όχι οι παραγόμενες.
    status_detail: 'rented', rental_mode: 'long_term',
    target_rent: 800, sqm: 78, floor: '2',
  }],
  tenants: [{ property_id: PID, afm: '123456789', full_name: 'Μαρία Ιωάννου', monthly_rent: 800,
    lease_start: '2025-01-01', lease_end: '2027-12-31', lease_type: 'residential', created_at: '2025-01-01' }],
  rent_payments: Array.from({ length: 12 }, (_, i) => ({ property_id: PID, amount: 800, period_year: YEAR, period_month: i + 1 })),
  property_settings: [{ property_id: PID, owner_afm: '987654321' }],
  client_stays: [],
}

async function main() {
  const n = await runE2Export(clientWith(LONG_TERM), 'user-1', YEAR)
  ok('επιστρέφει το πλήθος των ακινήτων', n === 1)
  ok('ΤΟ ΑΡΧΕΙΟ ΚΑΤΕΒΗΚΕ', caught.length === 1 && caught[0].bytes.length > 0)
  // Το όνομα ήταν «E2_2025_property-os.xlsx»: λατινικά και το όνομα του
  // προμηθευτή, σε αρχείο που ο χρήστης ψάχνει στις λήψεις του ως «Ε2».
  ok('το όνομα είναι ελληνικό και λέει τι είναι', caught[0].name === `Έντυπο Ε2 ${YEAR}.xlsx`)

  const wb = lastWorkbook()
  ok('έχει το κύριο φύλλο του έτους', wb.SheetNames.includes(`Ε2 ${YEAR}`))
  ok('έχει οδηγίες συμπλήρωσης', wb.SheetNames.some(s => s.includes('Οδηγίες')))
  ok('έχει σύνοψη Ε1', wb.SheetNames.some(s => s.includes('Ε1')))

  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[`Ε2 ${YEAR}`], { header: 1, defval: '' }) as unknown[][]
  const flat = aoa.flat().map(String)
  ok('περιέχει τη διεύθυνση', flat.some(c => c.includes('Ερμού 12')))
  ok('περιέχει το ΑΦΜ του ιδιοκτήτη', flat.includes('987654321'))
  ok('περιέχει το ΑΦΜ του μισθωτή', flat.includes('123456789'))
  ok('περιέχει τον μισθωτή', flat.some(c => c.includes('Μαρία Ιωάννου')))

  // ΤΟ ΝΟΥΜΕΡΟ ΤΟΥ ΕΝΤΥΠΟΥ: 12 × 800 = 9.600, και στη γραμμή και στο σύνολο.
  const nums = aoa.flat().filter(v => typeof v === 'number') as number[]
  ok('το ετήσιο ακαθάριστο είναι 9.600', nums.includes(9600))
  const totalRow = aoa.find(r => String(r[0]) === 'ΣΥΝΟΛΟ')
  ok('υπάρχει γραμμή ΣΥΝΟΛΟ', !!totalRow)
  ok('το ΣΥΝΟΛΟ δεν είναι μηδενικό', !!totalRow && (totalRow as unknown[]).some(v => Number(v) === 9600))

  // Το είδος μίσθωσης βγαίνει από την ΚΟΙΝΗ ανάγνωση κατάστασης.
  ok('κωδικός είδους μίσθωσης «1 · Εκμίσθωση»', flat.some(c => c.startsWith('1 · Εκμίσθωση')))

  // ── Το ίδιο ακίνητο, αποθηκευμένο ως «rented» ΑΛΛΑ με short_term ──────────
  // Πριν, το `rental_mode` αγνοούνταν: κωδικός 1 αντί 60 σε στήλη του εντύπου.
  const short = JSON.parse(JSON.stringify(LONG_TERM))
  short.user_properties[0].rental_mode = 'short_term'
  await runE2Export(clientWith(short), 'user-1', YEAR)
  const aoa2 = XLSX.utils.sheet_to_json(lastWorkbook().Sheets[`Ε2 ${YEAR}`], { header: 1, defval: '' }) as unknown[][]
  const flat2 = aoa2.flat().map(String)
  ok('βραχυχρόνια → κωδικός «60 · Βραχυχρόνια μίσθωση»', flat2.some(c => c.startsWith('60 ·')))
  ok('ΔΕΝ γράφεται πια «1 · Εκμίσθωση» σε βραχυχρόνιο', !flat2.some(c => c.startsWith('1 · Εκμίσθωση')))

  console.log(fail === 0 ? `✓ e2Export: ${pass} έλεγχοι πέρασαν` : `✗ e2Export: ${fail} απέτυχαν από ${pass + fail}`)
  if (fail > 0) process.exit(1)
}
main()
