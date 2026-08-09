// ═══════════════════════════════════════════════════════════════════════════
// ΜΙΑ ΥΠΟΧΡΕΩΣΗ, ΜΙΑ ΗΜΕΡΟΜΗΝΙΑ — σε όλο το app.
//
// Το τεστ που κλειδώνει τη διόρθωση. Πριν, ο ίδιος χρήστης έβλεπε:
//   ΕΝΦΙΑ 1η δόση → «τέλος Μαρτίου» (Ημερολόγιο), «31 Μαΐου» (Επισκόπηση),
//                    «1 Σεπτεμβρίου» (Εκκρεμότητες)
//   Ε1/Ε2         → «15 Ιουλίου», «30 Ιουνίου», «Ιανουάριος»
// και, πατώντας τα δύο κουμπιά «πρόσθεσε στο ημερολόγιο», αποκτούσε ΔΥΟ «ΕΝΦΙΑ»
// δύο μήνες μακριά, γιατί κάθε πλευρά έσβηνε μόνο τα δικά της.
//
// Εδώ αποδεικνύεται ότι:
//   1. Η Επισκόπηση δεν ορίζει καμία θεσμική ημερομηνία — τις διαβάζει.
//   2. Η ίδια υποχρέωση έχει ΤΟ ΙΔΙΟ κλειδί και ΤΗΝ ΙΔΙΑ ημερομηνία από όποια
//      οθόνη κι αν γραφτεί, άρα το δεύτερο πάτημα αντικαθιστά.
//   3. Κανένα άλλο αρχείο του κώδικα δεν ορίζει δική του φορολογική προθεσμία.
//
// Τρέξε: npx tsx app/dashboard/components/obligations.test.ts
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { computeObligations, calendarWritable, oblToCalendarCategory, type Obligation } from './obligations'
import { taxObligationsHorizon, taxObligationToEvent, taxEventSource, taxKindOfEventSource, taxObligationNotes, lastWorkingDayOfMonth, nextWorkingDay, TAX_EVENT_CATEGORY, CONFIDENCE_HINT } from '@/lib/tax/greekTaxCalendar'
import { declarationDeadline } from '@/lib/tax/leaseDeclaration'
import { WHO_LABEL } from '@/lib/accounting/dossier'
import { AADE_DESTINATIONS, destinationForKind } from '@/lib/tax/aade'

let passed = 0, failed = 0
const fails: string[] = []
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; if (fails.length < 80) fails.push(name) } }

// 30 Ιουλίου 2026 — η μέρα που γράφτηκε ο έλεγχος του Ιουλίου.
const NOW = new Date(2026, 6, 30)
const TODAY = '2026-07-30'

const prop = {
  enfia: 480, insurance_expiry: '2026-09-15', insurance_company: 'Ασφαλιστική',
  status_detail: 'rented', rental_mode: 'long_term',
}
const tenant = { id: 't-1', lease_start: '2026-07-10', lease_end: '2027-07-09', monthly_rent: 550 }
const maint = [{ task: 'Service λέβητα', item_name: 'Λέβητας', next_due: '2026-08-20', est_cost: null }]

const obls = computeObligations(prop, tenant, maint, NOW, 'long_term')
const taxObls = obls.filter(o => o.category === 'tax')

// ── 1. Η Επισκόπηση ΔΕΝ ορίζει θεσμικές ημερομηνίες ─────────────────────────
ok('έφυγε το δικό του «enfia»', !obls.some(o => o.id === 'enfia'))
ok('έφυγε το δικό του «e1»', !obls.some(o => o.id === 'e1'))
ok('υπάρχουν θεσμικές προθεσμίες', taxObls.length > 0)

const horizon = taxObligationsHorizon(TODAY, 'long_term')
const horizonById = new Map(horizon.map(o => [o.id, o]))
ok('κάθε θεσμική προέρχεται από τον ορίζοντα', taxObls.every(o => horizonById.has(o.id)))
ok('ίδια ημερομηνία με τον ορίζοντα', taxObls.every(o => horizonById.get(o.id)!.date === o.date))
ok('ίδιο κείμενο με τη μηχανή', taxObls.every(o => o.note.startsWith(taxObligationNotes(horizonById.get(o.id)!))))

// ── 2. ΤΟ ΙΔΙΟ ΚΛΕΙΔΙ, Η ΙΔΙΑ ΗΜΕΡΟΜΗΝΙΑ, ΑΠΟ ΤΙΣ ΔΥΟ ΟΘΟΝΕΣ ───────────────
// Πλευρά Α: η κάρτα «Υποχρεώσεις & Προθεσμίες» της Επισκόπησης.
const panelRows = calendarWritable(obls).map(o => ({
  source: o.source, event_date: o.date, category: oblToCalendarCategory(o.category),
}))
// Πλευρά Β: το κουμπί «Φορολογικά (ΑΑΔΕ)» του Ημερολογίου.
const calendarRows = horizon.map(o => taxObligationToEvent(o))

ok('όλες οι θεσμικές έχουν κλειδί tax:<id>', taxObls.every(o => o.source === taxEventSource(o.id)))
const calBySource = new Map(calendarRows.map(r => [r.source, r]))
ok('κάθε θεσμική βρίσκεται στο ημερολόγιο με το ίδιο κλειδί', taxObls.every(o => calBySource.has(o.source as string)))
ok('ΚΑΙ με την ίδια ημερομηνία', taxObls.every(o => calBySource.get(o.source as string)!.event_date === o.date))

// Το κρίσιμο: ένα κλειδί δεν μπορεί να έχει δύο ημερομηνίες — όσες φορές και να
// πατηθούν τα δύο κουμπιά, με οποιαδήποτε σειρά.
const dateByKey = new Map<string, string>()
const conflicts: string[] = []
for (const r of [...panelRows, ...calendarRows, ...panelRows]) {
  const prev = dateByKey.get(r.source as string)
  if (prev && prev !== r.event_date) conflicts.push(`${r.source}: ${prev} ≠ ${r.event_date}`)
  dateByKey.set(r.source as string, r.event_date)
}
ok('κανένα κλειδί με δύο ημερομηνίες: ' + conflicts.join(' | '), conflicts.length === 0)
ok('κανένα διπλό κλειδί στην ίδια εγγραφή', new Set(panelRows.map(r => r.source)).size === panelRows.length)

// ── 3. Η κατηγορία είναι «Φορολογικά», όχι «Συμβόλαιο» ─────────────────────
ok('oblToCalendarCategory(tax) = tax', oblToCalendarCategory('tax') === TAX_EVENT_CATEGORY)
ok('οι θεσμικές γράφονται ως tax', panelRows.filter(r => taxKindOfEventSource(r.source)).every(r => r.category === TAX_EVENT_CATEGORY))
ok('καμία θεσμική ως contract', !panelRows.some(r => taxKindOfEventSource(r.source) && r.category === 'contract'))

// ── 4. Οι συγκεκριμένες ημερομηνίες που αντιφάσκαν ─────────────────────────
const enfiaFirst = taxObls.find(o => o.id.startsWith('enfia-first'))
ok('υπάρχει ΕΝΦΙΑ 1η δόση', !!enfiaFirst)
ok('ΕΝΦΙΑ 1η δόση = τελευταία εργάσιμη Μαρτίου 2027', enfiaFirst!.date === lastWorkingDayOfMonth(2027, 2))
ok('ΕΝΦΙΑ 1η δόση ΟΧΙ 31 Μαΐου', !enfiaFirst!.date.endsWith('-05-31'))
ok('ΕΝΦΙΑ 1η δόση ΟΧΙ Σεπτέμβριος', !enfiaFirst!.date.includes('-09-'))
ok('ΕΝΦΙΑ 1η δόση μία και μόνη', taxObls.filter(o => o.id.startsWith('enfia-first')).length === 1)

const income = taxObls.find(o => o.id.startsWith('income-decl'))
ok('υπάρχει η δήλωση εισοδήματος', !!income)
ok('Ε1/Ε2 = 15 Ιουλίου (ή επόμενη εργάσιμη)', income!.date === nextWorkingDay('2026-07-15'))
ok('Ε1/Ε2 ΟΧΙ 30 Ιουνίου', !income!.date.endsWith('-06-30'))
ok('Ε1/Ε2 ΟΧΙ Ιανουάριος', !income!.date.includes('-01-'))

// ── 5. Μία γραμμή ανά ΕΙΔΟΣ, ακόμη και στη βραχυχρόνια ────────────────────
const shortObls = computeObligations({ ...prop, rental_mode: 'short_term', status_detail: 'seasonal' }, tenant, [], NOW, 'short_term')
const shortTax = shortObls.filter(o => o.category === 'tax')
const kinds = shortTax.map(o => taxKindOfEventSource(o.source))
ok('καμία επανάληψη είδους', new Set(kinds).size === kinds.length)
ok('η βραχυχρόνια βλέπει τη δήλωση διαμονής', kinds.includes('str-registry'))
ok('η βραχυχρόνια βλέπει και τον ΕΝΦΙΑ', kinds.includes('enfia-first') || kinds.includes('enfia-issue') || kinds.includes('enfia-last'))
ok('η μακροχρόνια ΔΕΝ βλέπει βραχυχρόνιες', !obls.some(o => (o.source || '').includes('str-')))

// ── 6. Ποιος το κάνει, και πόσο σίγουρη είναι η ημερομηνία ────────────────
ok('κάθε υποχρέωση λέει ποιον αφορά', obls.every(o => !!WHO_LABEL[o.who]))
ok('οι θεσμικές φέρουν confidence', taxObls.every(o => o.confidence === 'statutory' || o.confidence === 'announced'))
// Όχι «περιέχει aade.gr» — αυτό ελέγχει τομέα, όχι προορισμό, και έσπασε μόλις
// η πύλη διορθώθηκε σε myaade.gov.gr. Ο προορισμός βγαίνει από το ΕΙΔΟΣ.
ok('κάθε θεσμική δείχνει στον προορισμό του είδους της', taxObls.every(o => {
  const kind = taxKindOfEventSource(o.source)
  return !!kind && o.officialUrl === AADE_DESTINATIONS[destinationForKind(kind)].url
}))
ok('το confidence φαίνεται στο κείμενο', taxObls.every(o => o.note.includes(CONFIDENCE_HINT[o.confidence!])))
ok('η ΕΝΦΙΑ 1η δόση είναι «announced»', enfiaFirst!.confidence === 'announced')
ok('η δήλωση διαμονής είναι «statutory»', shortTax.find(o => taxKindOfEventSource(o.source) === 'str-registry')!.confidence === 'statutory')
ok('ΕΝΦΙΑ: ο ιδιοκτήτης', enfiaFirst!.who === 'owner')
ok('Ε9: ο λογιστής', taxObls.find(o => o.id.startsWith('e9-'))?.who === 'accountant')
// Το ΔΙΚΟ ΤΟΥ νούμερο μπαίνει, καμία εκτίμηση: ο ΕΝΦΙΑ που καταχώρισε ο χρήστης.
ok('ο ΕΝΦΙΑ του χρήστη μπαίνει στο κείμενο', enfiaFirst!.note.includes('480'))
ok('χωρίς καταχωρισμένο ΕΝΦΙΑ, κανένα νούμερο', (() => {
  const o = computeObligations({ ...prop, enfia: null }, tenant, [], NOW, 'long_term').find(x => x.id.startsWith('enfia-first'))!
  return !/\d+ € τον χρόνο/.test(o.note)
})())

// ── 7. Ό,τι είναι ΔΙΚΗ ΤΟΥ ημερομηνία μένει — και φτάνει στο ημερολόγιο ───
const decl = obls.find(o => o.id === 'lease_decl')
ok('η Δήλωση μίσθωσης υπάρχει', !!decl)
ok('με την ημερομηνία της μηχανής της δήλωσης', decl!.date === declarationDeadline('2026-07-10'))
ok('και γράφεται στο ημερολόγιο', decl!.source === 'obligations:lease_decl')

// ── 8. Ό,τι γράφει ΑΛΛΗ καρτέλα δεν ξαναγράφεται εδώ ─────────────────────
const ins = obls.find(o => o.id === 'insurance')
ok('η ασφάλιση εμφανίζεται', !!ins)
ok('η ασφάλιση ΔΕΝ διπλογράφεται', ins!.source === null)
ok('η συντήρηση ΔΕΝ διπλογράφεται', obls.filter(o => o.id.startsWith('maint_')).every(o => o.source === null))
const leaseEnd = obls.find(o => o.id === 'lease_end')
ok('η λήξη μίσθωσης χρησιμοποιεί το κλειδί της μίσθωσης', leaseEnd!.source === 'tenant:t-1:lease_end')
ok('calendarWritable = μόνο όσα έχουν κλειδί', calendarWritable(obls).length === obls.filter(o => !!o.source).length)
ok('χωρίς ενοικιαστή, χωρίς κλειδί μίσθωσης',
  computeObligations(prop, { lease_end: '2027-01-31' }, [], NOW, 'long_term').find(o => o.id === 'lease_end')!.source === null)

// ── 9. Ταξινόμηση και παράθυρο ────────────────────────────────────────────
ok('ταξινομημένα κατά ημερομηνία', obls.every((o, i) => i === 0 || obls[i - 1].date <= o.date))
ok('τίποτα παλαιότερο από 45 ημέρες', obls.every(o => o.daysUntil >= -45))
ok('κάθε γραμμή έχει προτεραιότητα', obls.every((o: Obligation) => ['low', 'medium', 'high'].includes(o.priority)))

// ── 10. ΚΑΝΕΝΑ ΑΛΛΟ ΑΡΧΕΙΟ ΔΕΝ ΟΡΙΖΕΙ ΦΟΡΟΛΟΓΙΚΗ ΠΡΟΘΕΣΜΙΑ ───────────────
// Καστάνια, στο πνεύμα του scripts/lint-ratchet.mjs: σαρώνει τον κώδικα για
// γραμμές που ονομάζουν φορολογική υποχρέωση ΚΑΙ ημερομηνία/μήνα μαζί. Η μόνη
// επιτρεπτή τοποθεσία είναι η μηχανή. Νέο αρχείο με δική του «1η Σεπτεμβρίου»
// σπάει αυτό το τεστ.
const ALLOWED = new Set<string>([
  // Η ΜΙΑ πηγή, και τα τεστ της.
  'lib/tax/greekTaxCalendar.ts',
  'lib/tax/greekTaxCalendar.test.ts',
  'app/dashboard/components/obligations.ts',
  'app/dashboard/components/obligations.test.ts',
  'lib/checklist/obligationTasks.ts',
  'lib/checklist/obligationTasks.test.ts',
  // Τεστ συνδέσμων: δείγμα τίτλου+ημερομηνίας, δεν ορίζει προθεσμία.
  'lib/calendar/externalLinks.test.ts',
  'lib/calendar/invite.test.ts',
  // ── ΕΚΚΡΕΜΟΥΝ ΣΕ ΞΕΝΑ ΑΡΧΕΙΑ ─────────────────────────────────────────────
  // Κάθε γραμμή εδώ είναι χρέος, όχι άδεια. Όταν το αρχείο διορθωθεί, βγαίνει.
  //
  // TabChecklist.tsx: ο πίνακας `AADE_CALENDAR` («ΕΝΦΙΑ 1η δόση» στον μήνα 9,
  // «Ε2» στον μήνα 1) πρέπει να σβηστεί — η καρτέλα να διαβάζει από το
  // `lib/checklist/obligationTasks.ts`, που ήδη καταναλώνει τη μηχανή.
  'app/dashboard/components/TabChecklist.tsx',
  // TabTenant.tsx: ο σύνδεσμος του Ε2 λέει «Έως 30 Ιουνίου κάθε έτους» — τρίτη
  // ημερομηνία για την ίδια δήλωση. Να αντικατασταθεί από τη μηχανή.
  'app/dashboard/components/TabTenant.tsx',
  // BillsBudget.tsx / assistantPersona.ts: ενημερωτικό κείμενο
  // με ρητή παραπομπή στην πηγή, όχι υπολογισμός προθεσμίας. Θα ήταν καλύτερα να
  // παίρνουν τη διατύπωση από τη μηχανή, δεν αντιφάσκουν όμως με αυτήν.
  'app/dashboard/components/BillsBudget.tsx',
  'app/dashboard/components/assistantPersona.ts',
])
// Το «\b» είναι ASCII: τα /\bΕ1\b/ και /\bΕ2\b/ δεν ταίριαζαν ΠΟΤΕ, οπότε ο
// έλεγχος βασιζόταν σιωπηλά μόνο στο «ΕΝΦΙΑ».
const NAMES = /ΕΝΦΙΑ|(?<![\p{L}\p{N}])Ε[12](?![\p{L}\p{N}])|βραχυχρόνιας διαμονής/u
const DATES = /month:\s*\d|nextAnnual\(|Μαΐου|Σεπτεμβρίου|Ιουνίου|Ιουλίου|Μαρτίου|Φεβρουαρίου|-0[1-9]-\d\d/
function walk(dir: string, out: string[]) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(full)
  }
}
const files: string[] = []
for (const root of ['app', 'lib', 'components']) walk(root, files)
const offenders: string[] = []
for (const f of files) {
  const rel = f.split('\\').join('/')
  if (ALLOWED.has(rel)) continue
  const src = readFileSync(f, 'utf8')
  for (const line of src.split('\n')) {
    const code = line.trim()
    if (code.startsWith('//') || code.startsWith('*')) continue   // σχόλια ιστορικού
    if (NAMES.test(code) && DATES.test(code)) { offenders.push(`${rel}: ${code.slice(0, 80)}`); break }
  }
}
ok('κανένα νέο ημερολόγιο υποχρεώσεων: ' + offenders.join(' | '), offenders.length === 0)
ok('η καστάνια σαρώνει πραγματικά αρχεία', files.length > 100)

console.log(`\nobligations.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed) { console.log('FAILED:\n' + fails.map(f => '  ✗ ' + f).join('\n')); process.exit(1) }
console.log('όλα πέρασαν')
