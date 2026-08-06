// npx tsx app/dashboard/components/e2Export.test.ts
//
// ΠΑΡΑΓΕΙ ΟΝΤΩΣ ΑΡΧΕΙΟ Η ΕΞΑΓΩΓΗ Ε2;
// ─────────────────────────────────────────────────────────────────────────
// Η `runE2Export` έμεινε μήνες χωρίς κανέναν καλούντα: μεταγλωττιζόταν καθαρά,
// περνούσε κάθε έλεγχο τύπων, και δεν είχε παραγάγει ποτέ αρχείο. Ένα
// χαρακτηριστικό που πουλιέται με συνδρομή δεν επιτρέπεται να στηρίζεται στο ότι
// «ο κώδικας φαίνεται σωστός».
//
// Εδώ καλείται η ΠΡΑΓΜΑΤΙΚΗ συνάρτηση με πλαστό πελάτη Supabase. Το
// `XLSX.writeFile` σε Node γράφει στον δίσκο αντί να κατεβάσει, οπότε το βιβλίο
// ξανα-ανοίγεται και ελέγχεται κελί-κελί. Αδοκίμαστος μένει μόνο ο διάλογος
// αποθήκευσης του περιηγητή — δηλαδή κώδικας της βιβλιοθήκης, όχι δικός μας.
//
// ΤΙ ΕΠΙΑΣΕ ΗΔΗ: με `status_detail: 'rent_long'` το ακαθάριστο έβγαινε κενό και η
// γραμμή ΣΥΝΟΛΟ μηδενική. Το «rent_long» είναι ΠΑΡΑΓΟΜΕΝΗ κατάσταση
// (`readStatus`), όχι αποθηκευμένη τιμή — αλλά η αποτυχία έδειξε ότι το έντυπο
// διάβαζε το `status_detail` ωμό, αγνοώντας το `rental_mode`, και ένα ακίνητο
// «rented» + «short_term» έπαιρνε κωδικό «1 · Εκμίσθωση» αντί «60 · Βραχυχρόνια»
// με τις διαμονές του να μη μετριούνται καθόλου.
import { runE2Export } from './e2Export'
import { XLSX } from './xlsxStyle'
import { unlinkSync, existsSync } from 'node:fs'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }

const YEAR = 2025
const PID = '11111111-1111-1111-1111-111111111111'
const FILE = `E2_${YEAR}_property-os.xlsx`

/** Πλαστός πελάτης: κάθε φίλτρο επιστρέφει τον εαυτό του, το await δίνει τα δεδομένα. */
function clientWith(data: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const rows = data[table] ?? []
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'order', 'not', 'limit', 'gte', 'lte']) chain[m] = () => chain
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
  if (existsSync(FILE)) unlinkSync(FILE)

  const n = await runE2Export(clientWith(LONG_TERM), 'user-1', YEAR)
  ok('επιστρέφει το πλήθος των ακινήτων', n === 1)
  ok('ΤΟ ΑΡΧΕΙΟ ΥΠΑΡΧΕΙ', existsSync(FILE))

  const wb = XLSX.readFile(FILE)
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
  if (existsSync(FILE)) unlinkSync(FILE)
  await runE2Export(clientWith(short), 'user-1', YEAR)
  const aoa2 = XLSX.utils.sheet_to_json(XLSX.readFile(FILE).Sheets[`Ε2 ${YEAR}`], { header: 1, defval: '' }) as unknown[][]
  const flat2 = aoa2.flat().map(String)
  ok('βραχυχρόνια → κωδικός «60 · Βραχυχρόνια μίσθωση»', flat2.some(c => c.startsWith('60 ·')))
  ok('ΔΕΝ γράφεται πια «1 · Εκμίσθωση» σε βραχυχρόνιο', !flat2.some(c => c.startsWith('1 · Εκμίσθωση')))

  if (existsSync(FILE)) unlinkSync(FILE)
  console.log(fail === 0 ? `✓ e2Export: ${pass} έλεγχοι πέρασαν` : `✗ e2Export: ${fail} απέτυχαν από ${pass + fail}`)
  if (fail > 0) process.exit(1)
}
main()
