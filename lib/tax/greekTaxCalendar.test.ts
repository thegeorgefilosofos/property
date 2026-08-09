// Αυστηρά τεστ για το φορολογικό ημερολόγιο ακινήτων (greekTaxCalendar.ts).
// Τρέξε: npx tsx lib/tax/greekTaxCalendar.test.ts
import { greekPropertyTaxObligations, taxObligationToEvent, taxObligationNotes, nextWorkingDay, lastWorkingDayOfMonth, taxObligationsHorizon, taxProfileOf, taxEventSource, taxKindOfEventSource, taxKindMeta, isTaxEventSource, TAX_KINDS, TAX_EVENT_CATEGORY, CONFIDENCE_HINT, type TaxObligation } from './greekTaxCalendar'
import { isNonWorkingDay } from '../calendar/greekHolidays'
import { AADE_DESTINATIONS, destinationForKind } from './aade'
import { requirementsFor, WHO_LABEL, type Who } from '../accounting/dossier'

let passed = 0, failed = 0
const fails: string[] = []
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; if (fails.length < 80) fails.push(name) } }

// ── nextWorkingDay / lastWorkingDayOfMonth ───────────────────────────────────
// 2026-03-31 είναι Τρίτη (εργάσιμη) → μένει.
ok('εργάσιμη μένει', nextWorkingDay('2026-03-31') === '2026-03-31')
// 2026-08-15 (Δεκαπενταύγουστος, Σάββατο) → μεταθετέα στην επόμενη εργάσιμη.
ok('αργία μετατίθεται', (() => { const d = nextWorkingDay('2026-08-15'); return d > '2026-08-15' && !isNonWorkingDay(d) })())
// nextWorkingDay πάντα επιστρέφει εργάσιμη
for (const s of ['2026-01-01', '2026-05-01', '2026-12-25', '2026-06-28']) ok(`working(${s})`, !isNonWorkingDay(nextWorkingDay(s)))
// τελευταία εργάσιμη Φεβρουαρίου 2027 (28/2/2027 = Κυριακή) → 26/2 Παρασκευή
ok('last working Feb 2027', (() => { const d = lastWorkingDayOfMonth(2027, 1); return !isNonWorkingDay(d) && d.startsWith('2027-02') })())
ok('last working ≤ τέλος μήνα', lastWorkingDayOfMonth(2026, 4) <= '2026-05-31')

// ── owner profile ────────────────────────────────────────────────────────────
const owner = greekPropertyTaxObligations(2026, 'owner')
const ids = owner.map(o => o.id)
ok('owner έχει ΕΝΦΙΑ έκδοση', ids.some(i => i.startsWith('enfia-issue')))
ok('owner έχει ΕΝΦΙΑ 1η δόση', ids.some(i => i.startsWith('enfia-first')))
ok('owner έχει ΕΝΦΙΑ τελευταία', ids.some(i => i.startsWith('enfia-last')))
ok('owner έχει Ε9', ids.some(i => i.startsWith('e9-')))
ok('owner έχει δήλωση εισοδήματος', ids.some(i => i.startsWith('income-decl')))
ok('owner ΔΕΝ έχει βραχυχρόνια', !ids.some(i => i.startsWith('str-')))
ok('owner ταξινομημένα κατά ημερομηνία', owner.every((o, i) => i === 0 || owner[i - 1].date <= o.date))
ok('όλες οι ημερομηνίες εργάσιμες', owner.every(o => !isNonWorkingDay(o.date)))
ok('όλα category tax', owner.every(o => o.category === 'tax'))
// Ο έλεγχος έψαχνε τη συμβολοσειρά «aade.gr» — δηλαδή έλεγχε ΤΟΝ ΤΟΜΕΑ, όχι
// τον προορισμό, και έσπασε τη στιγμή που η πύλη διορθώθηκε σε myaade.gov.gr.
// Το πραγματικό αμετάβλητο είναι ότι κάθε υποχρέωση δείχνει εκεί που ορίζει το
// μητρώο για το ΕΙΔΟΣ της.
ok('κάθε υποχρέωση δείχνει στον προορισμό του είδους της',
  owner.every(o => o.official_url === AADE_DESTINATIONS[destinationForKind(o.kind)].url))
ok('notes παραπέμπουν σε επιβεβαίωση', owner.every(o => /myAADE|taxheaven/i.test(o.notes)))

// ΕΝΦΙΑ τελευταία δόση → Φεβρουάριος ΕΠΟΜΕΝΟΥ έτους
const last = owner.find(o => o.id.startsWith('enfia-last'))!
ok('ΕΝΦΙΑ τελευταία = Φεβ 2027', last.date.startsWith('2027-02'))
// Ε9 → υπενθύμιση ελέγχου πριν την έκδοση ΕΝΦΙΑ (~τέλος Φεβρουαρίου)
ok('Ε9 Φεβ/Μαρ', owner.find(o => o.id.startsWith('e9-'))!.date >= '2026-02-27')
// Εισόδημα → 15 Ιουλίου 2026 (ή επόμενη εργάσιμη)
ok('εισόδημα ~Ιούλιος', owner.find(o => o.id.startsWith('income-decl'))!.date >= '2026-07-15')

// confidence: όλα «announced» (οι ημερομηνίες ανακοινώνονται/μετακινούνται ετησίως)
ok('Ε9 announced', owner.find(o => o.id.startsWith('e9-'))!.confidence === 'announced')
ok('ΕΝΦΙΑ announced', owner.find(o => o.id.startsWith('enfia-first'))!.confidence === 'announced')

// ── long_term ────────────────────────────────────────────────────────────────
const lt = greekPropertyTaxObligations(2026, 'long_term')
ok('long_term έχει owner-υποχρεώσεις', lt.some(o => o.id.startsWith('enfia-first')) && lt.some(o => o.id.startsWith('income-decl')))
ok('long_term ΔΕΝ έχει βραχυχρόνια', !lt.some(o => o.id.startsWith('str-')))

// ── short_term ───────────────────────────────────────────────────────────────
const st = greekPropertyTaxObligations(2026, 'short_term')
ok('short_term έχει owner-υποχρεώσεις', st.some(o => o.id.startsWith('enfia-first')))
ok('short_term έχει μητρώο ΑΑΔΕ ×12', st.filter(o => o.id.startsWith('str-registry')).length === 12)
ok('short_term έχει τέλος ×12', st.filter(o => o.id.startsWith('str-climate-fee')).length === 12)
ok('short_term ταξινομημένα', st.every((o, i) => i === 0 || st[i - 1].date <= o.date))
ok('short_term ημερομηνίες εργάσιμες', st.every(o => !isNonWorkingDay(o.date)))
// μητρώο ~20ή κάθε μήνα (ή επόμενη εργάσιμη)
ok('μητρώο κοντά στην 20ή', st.filter(o => o.id.startsWith('str-registry')).every(o => +o.date.slice(8, 10) >= 20 && +o.date.slice(8, 10) <= 24))

// ── μοναδικότητα id ──────────────────────────────────────────────────────────
ok('μοναδικά ids (short_term)', new Set(st.map(o => o.id)).size === st.length)

// ── taxObligationToEvent ─────────────────────────────────────────────────────
const ev = taxObligationToEvent(owner[0], 'prop1', 'user1')
ok('event property/user', ev.property_id === 'prop1' && ev.user_id === 'user1')
ok('event source tax:*', ev.source.startsWith('tax:'))
ok('event source = taxEventSource(id)', ev.source === taxEventSource(owner[0].id))
// Η κατηγορία ΔΕΝ είναι 'contract': αλλιώς το φίλτρο του ημερολογίου δεν μπορούσε
// ΠΟΤΕ να απομονώσει τις φορολογικές προθεσμίες.
ok('event category = tax', ev.category === TAX_EVENT_CATEGORY)
ok('event category ΟΧΙ contract', (ev.category as string) !== 'contract')
ok('event pending', ev.status === 'pending')
ok('event date = obligation date', ev.event_date === owner[0].date)
ok('event notes περιέχουν το κείμενο της υποχρέωσης', ev.notes.startsWith(owner[0].notes))
ok('event notes = taxObligationNotes', ev.notes === taxObligationNotes(owner[0]))
// Το confidence δεν πετάγεται: ταξιδεύει ως priority (και ως κείμενο στις σημειώσεις).
ok('statutory → priority high', greekPropertyTaxObligations(2026, 'short_term')
  .filter(o => o.confidence === 'statutory')
  .every(o => taxObligationToEvent(o, 'p', 'u').priority === 'high'))
ok('announced → priority medium', owner
  .filter(o => o.confidence === 'announced')
  .every(o => taxObligationToEvent(o, 'p', 'u').priority === 'medium'))
ok('notes λένε ποιος το κάνει', owner.every(o => taxObligationNotes(o).includes(WHO_LABEL[o.who])))
ok('notes λένε πόσο σίγουρη είναι η ημερομηνία, με την πλήρη εξήγηση',
   owner.every(o => taxObligationNotes(o).includes(CONFIDENCE_HINT[o.confidence])))

// ── διαφορετικό έτος μετακινεί σωστά ─────────────────────────────────────────
const y2027 = greekPropertyTaxObligations(2027, 'owner')
ok('2027 Ε9 στο 2027', y2027.find(o => o.id.startsWith('e9-'))!.date.startsWith('2027-0'))
ok('2027 ΕΝΦΙΑ τελευταία στο 2028', y2027.find(o => o.id.startsWith('enfia-last'))!.date.startsWith('2028-02'))

// ── ΕΙΔΟΣ ΥΠΟΧΡΕΩΣΗΣ (kind) — η αναλλοίωτη σχέση id ↔ kind ────────────────────
const everything: TaxObligation[] = [
  ...greekPropertyTaxObligations(2026, 'short_term'),
  ...greekPropertyTaxObligations(2027, 'short_term'),
]
ok('κάθε id ξεκινά από το kind', everything.every(o => o.id.startsWith(o.kind + '-')))
ok('kind από το κλειδί γεγονότος', everything.every(o => taxKindOfEventSource(taxEventSource(o.id)) === o.kind))
ok('όλα τα kinds είναι δηλωμένα', everything.every(o => TAX_KINDS.includes(o.kind)))
ok('isTaxEventSource μόνο για tax:', isTaxEventSource('tax:enfia-first-2026') && !isTaxEventSource('obligations:lease_decl') && !isTaxEventSource(null))
ok('kind άγνωστου κλειδιού = null', taxKindOfEventSource('tenant:abc:lease_end') === null && taxKindOfEventSource('tax:κάτι-άλλο-2026') === null)
const meta = taxKindMeta(2026)
ok('meta ανά kind, πλήρες', TAX_KINDS.every(k => !!meta[k] && meta[k].kind === k))
ok('meta ανεξάρτητο από έτος', TAX_KINDS.every(k => {
  const m2 = taxKindMeta(2031)[k]
  return m2.who === meta[k].who && m2.confidence === meta[k].confidence && m2.title === meta[k].title
}))

// ── ΠΟΙΟΣ ΤΟ ΚΑΝΕΙ — κληρονομείται από τον φάκελο του λογιστή ────────────────
// Ο κανόνας ζει στο lib/accounting/dossier.ts. Εδώ ελέγχεται ΜΟΝΟ ότι δεν
// διαφωνούμε μαζί του: όπου η υποχρέωση δείχνει σε παραστατικό του φακέλου, το
// `who` πρέπει να είναι το ΙΔΙΟ πρόσωπο.
const dossierWho: Record<string, Who> = {}
for (const r of requirementsFor({
  form: 'individual', books: 'none',
  statuses: ['own_use', 'rent_long', 'rent_short', 'vacant'],
  hasRenovation: true, hasLoan: true, ownershipChanged: true,
})) dossierWho[r.id] = r.who
ok('όλα έχουν who', everything.every(o => o.who === 'owner' || o.who === 'app' || o.who === 'accountant'))
ok('who συμφωνεί με τον φάκελο', everything.every(o => !o.dossier || dossierWho[o.dossier] === o.who))
ok('κάθε dossier id υπάρχει στον φάκελο', everything.every(o => !o.dossier || o.dossier in dossierWho))
ok('ΕΝΦΙΑ → ο ιδιοκτήτης', meta['enfia-first'].who === 'owner' && meta['enfia-first'].dossier === 'enfia')
ok('Ε9 → ο λογιστής', meta.e9.who === 'accountant' && meta.e9.dossier === 'e9')
ok('βραχυχρόνια → ο ιδιοκτήτης', meta['str-registry'].who === 'owner' && meta['str-climate-fee'].who === 'owner')

// ── Ο ΚΥΛΙΟΜΕΝΟΣ ΟΡΙΖΟΝΤΑΣ ──────────────────────────────────────────────────
const hz = taxObligationsHorizon('2026-12-20', 'long_term')
ok('ορίζοντας ταξινομημένος', hz.every((o, i) => i === 0 || hz[i - 1].date <= o.date))
ok('ορίζοντας: μοναδικά ids', new Set(hz.map(o => o.id)).size === hz.length)
// Ο χρήστης του Δεκεμβρίου ΠΡΕΠΕΙ να βλέπει την τελευταία δόση του Φεβρουαρίου.
ok('ορίζοντας φτάνει στον Φεβρουάριο 2027', hz.some(o => o.kind === 'enfia-last' && o.date.startsWith('2027-02')))
ok('ορίζοντας φτάνει στη 1η δόση 2027', hz.some(o => o.kind === 'enfia-first' && o.date.startsWith('2027-03')))
ok('ορίζοντας ΔΕΝ φτάνει στο 2028', hz.every(o => o.date < '2027-04-01'))
ok('ορίζοντας ΔΕΝ γυρίζει πριν την 1η Ιανουαρίου', hz.every(o => o.date >= '2026-01-01'))
// Ο χρήστης του Ιανουαρίου: η τελευταία δόση της ΠΕΡΣΙΝΗΣ εκκαθάρισης πέφτει μέσα
// σε αυτόν τον Φεβρουάριο. Πριν εξαφανιζόταν, γιατί ανήκει στο περσινό έτος.
const jan = taxObligationsHorizon('2027-01-08', 'owner')
ok('ο Ιανουάριος βλέπει την τελευταία δόση του Φεβρουαρίου', jan.some(o => o.id === 'enfia-last-2026' && o.date.startsWith('2027-02')))
ok('ορίζοντας Ιανουαρίου ξεκινά από 1/1', jan.every(o => o.date >= '2027-01-01'))
ok('ορίζοντας Ιανουαρίου: μοναδικά ids', new Set(jan.map(o => o.id)).size === jan.length)
ok('ορίζοντας short_term έχει και τις μηνιαίες', taxObligationsHorizon('2026-07-30', 'short_term').some(o => o.kind === 'str-registry'))
ok('ορίζοντας χωρίς έτος = κενός', taxObligationsHorizon('χωρίς-ημερομηνία', 'owner').length === 0)

// ── ΠΡΟΦΙΛ ΑΠΟ ΤΗΝ ΜΙΑ ΚΑΤΑΣΤΑΣΗ ΤΟΥ ΑΚΙΝΗΤΟΥ ───────────────────────────────
ok('short_term από rental_mode', taxProfileOf({ rental_mode: 'short_term' }) === 'short_term')
ok('short_term από status_detail seasonal', taxProfileOf({ status_detail: 'seasonal' }) === 'short_term')
ok('long_term από rented', taxProfileOf({ status_detail: 'rented' }) === 'long_term')
ok('κενό/ιδιοχρησία → owner', taxProfileOf({ status_detail: 'own_use' }) === 'owner' && taxProfileOf(null) === 'owner')

// ── Η ΑΥΤΟΜΑΤΗ ΟΡΙΣΤΙΚΟΠΟΙΗΣΗ — Η ΠΡΟΘΕΣΜΙΑ ΠΟΥ ΕΛΕΙΠΕ ──────────────────────
//
// Το ημερολόγιο ήξερε μόνο την 15η Ιουλίου. Από το 2026 όμως, όσες δηλώσεις
// είναι προσυμπληρωμένες και δεν πειραχτούν, οριστικοποιούνται ΑΥΤΟΜΑΤΑ στις
// 16 Απριλίου — τρεις μήνες νωρίτερα. Η εφαρμογή έλεγε στον ιδιοκτήτη ότι έχει
// χρόνο ως τον Ιούλιο, ενώ η δήλωσή του μπορεί να είχε ήδη κλείσει.
//
// Οι ημερομηνίες ελέγχονται ΡΗΤΑ, γιατί σε φορολογικό εργαλείο μια λάθος
// ημερομηνία είναι χειρότερη από καμία: ο χρήστης θα την εμπιστευτεί.
{
  const y = greekPropertyTaxObligations(2026, 'long_term')
  const auto = y.find(o => o.kind === 'income-autofile')
  const decl = y.find(o => o.kind === 'income-decl')
  ok('η αυτόματη οριστικοποίηση υπάρχει', !!auto)
  ok('ημερομηνία δράσης 15 Απριλίου, όχι 16', auto!.date === '2026-04-15')
  ok('ΠΡΙΝ την καταληκτική του Ιουλίου', auto!.date < decl!.date)
  ok('αφορά και τα τρία προφίλ ιδιοκτήτη',
    (['owner', 'long_term', 'short_term'] as const).every(p => auto!.profiles.includes(p)))
  // Την ενέργεια την κάνει ο ΙΔΙΟΚΤΗΤΗΣ: είναι έλεγχος πριν κλειδώσει κάτι στο
  // όνομά του. Ο λογιστής υποβάλλει· εδώ δεν υποβάλλει κανείς — ελέγχεις.
  ok('ο έλεγχος είναι δουλειά του ιδιοκτήτη', auto!.who === 'owner')
  ok('το κείμενο λέει ΠΟΤΕ γίνεται αυτόματα', /16 Απριλίου/.test(auto!.notes))
  ok('και ότι μετά υπάρχει τροποποιητική χωρίς κυρώσεις',
    /τροποποιητικ/.test(auto!.notes) && /χωρίς κυρώσεις/.test(auto!.notes))
  // ΔΕΝ ΥΠΟΣΧΕΤΑΙ ΟΤΙ ΞΕΡΕΙ ΤΗ ΦΟΡΟΛΟΓΙΚΗ ΕΙΚΟΝΑ ΤΟΥ ΧΡΗΣΤΗ. Η αυτόματη
  // οριστικοποίηση αφορά κυρίως μισθωτούς και συνταξιούχους· ιδιοκτήτης με Ε2
  // συνήθως δεν είναι μέσα. Το «συνήθως» πρέπει να λέγεται, αλλιώς το εργαλείο
  // ή τρομάζει άδικα ή καθησυχάζει άδικα.
  ok('λέει ότι αφορά κυρίως μισθωτούς και συνταξιούχους',
    /μισθωτ/.test(auto!.notes) && /συνταξιούχ/.test(auto!.notes))
  const y2027 = greekPropertyTaxObligations(2027, 'owner').find(o => o.kind === 'income-autofile')
  ok('ακολουθεί το έτος', y2027!.date === '2027-04-15')
}

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\ngreekTaxCalendar.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed) { console.log('FAILED:\n' + fails.map((f) => '  ✗ ' + f).join('\n')); process.exit(1) }
console.log('όλα πέρασαν')
