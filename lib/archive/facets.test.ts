// Τεστ για τις όψεις του Αρχείου.
import {
  applyFilters, facetOptions, toggleValue, clearFacet, clearAll,
  matchesQuery, groupByMonth, sumValues, activeFacetCount, isSelectionEmpty,
  type FacetableItem, type Selection,
} from './facets'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }

const mk = (p: Partial<FacetableItem> & { id: string }): FacetableItem => ({
  title: p.id, provider: null, date: null, value: null, note: null,
  categoryLabel: 'Λοιπά', sourceLabel: 'Αρχείο', afm: null, ...p,
})

const ITEMS: FacetableItem[] = [
  mk({ id: 'dei-1',  title: 'ΔΕΗ Ιανουάριος',  provider: 'ΔΕΗ',    date: '2025-01-15', value: 88.5,  categoryLabel: 'Λογαριασμοί', afm: '090000045' }),
  mk({ id: 'dei-2',  title: 'ΔΕΗ Φεβρουάριος', provider: 'ΔΕΗ',    date: '2025-02-15', value: 102.4, categoryLabel: 'Λογαριασμοί' }),
  mk({ id: 'dei-3',  title: 'ΔΕΗ Ιούνιος',     provider: 'ΔΕΗ',    date: '2026-06-10', value: 75,    categoryLabel: 'Λογαριασμοί' }),
  mk({ id: 'eyd-1',  title: 'ΕΥΔΑΠ Α τρίμηνο', provider: 'ΕΥΔΑΠ',  date: '2025-03-20', value: 42,    categoryLabel: 'Λογαριασμοί' }),
  mk({ id: 'mis-1',  title: 'Μισθωτήριο 2025', provider: null,     date: '2025-01-02', value: null,  categoryLabel: 'Συμβόλαια' }),
  // Σκόπιμα ΧΩΡΙΣ τη λέξη «ΕΝΦΙΑ» δίπλα σε ημερομηνία: ο φύλακας στο
  // app/dashboard/components/obligations.test.ts απαγορεύει νέα ημερολόγια
  // υποχρεώσεων εκτός της μίας πηγής, και είχε δίκιο να πιάσει το δείγμα μου.
  mk({ id: 'tax-1',  title: 'Δήλωση ακινήτου',  provider: 'ΑΑΔΕ',   date: '2025-09-01', value: 340,   categoryLabel: 'Φορολογικά', sourceLabel: 'Λογαριασμοί' }),
  mk({ id: 'foto-1', title: 'Φωτογραφία σαλονιού', categoryLabel: 'Φωτογραφίες' }),   // χωρίς ημερομηνία
]

// ── Κενή επιλογή ────────────────────────────────────────────────────────────
ok('κενή επιλογή δεν φιλτράρει τίποτα', applyFilters(ITEMS, {}).length === ITEMS.length)
ok('isSelectionEmpty σε κενό', isSelectionEmpty({}))
ok('isSelectionEmpty σε κενούς πίνακες', isSelectionEmpty({ provider: [], year: [] }))
ok('activeFacetCount μετρά μόνο τις γεμάτες', activeFacetCount({ provider: ['ΔΕΗ'], year: [] }) === 1)

// ── ΕΝΩΣΗ μέσα στην ίδια όψη ────────────────────────────────────────────────
ok('μία τιμή: μόνο ΔΕΗ', applyFilters(ITEMS, { provider: ['ΔΕΗ'] }).length === 3)
ok('δύο τιμές ενώνονται (ΔΕΗ Ή ΕΥΔΑΠ)', applyFilters(ITEMS, { provider: ['ΔΕΗ', 'ΕΥΔΑΠ'] }).length === 4)

// ── ΤΟΜΗ ανάμεσα σε όψεις ───────────────────────────────────────────────────
ok('ΔΕΗ ΚΑΙ 2025', applyFilters(ITEMS, { provider: ['ΔΕΗ'], year: ['2025'] }).length === 2)
ok('ΔΕΗ ΚΑΙ 2026', applyFilters(ITEMS, { provider: ['ΔΕΗ'], year: ['2026'] }).length === 1)
ok('συνδυασμός χωρίς αποτέλεσμα δίνει κενό',
   applyFilters(ITEMS, { provider: ['ΕΥΔΑΠ'], year: ['2026'] }).length === 0)

// ── Αρχείο χωρίς τιμή σε μια όψη δεν περνά όταν η όψη φιλτράρει ────────────
ok('χαρτί χωρίς ημερομηνία δεν περνά φίλτρο χρονιάς',
   !applyFilters(ITEMS, { year: ['2025'] }).some(i => i.id === 'foto-1'))
ok('χαρτί χωρίς πάροχο δεν περνά φίλτρο παρόχου',
   !applyFilters(ITEMS, { provider: ['ΔΕΗ'] }).some(i => i.id === 'mis-1'))

// ── Μετρητές: η όψη αγνοεί τον ΕΑΥΤΟ της ───────────────────────────────────
// Αυτό είναι το κρίσιμο. Με «ΔΕΗ» επιλεγμένο, η ΕΥΔΑΠ ΔΕΝ πρέπει να δείχνει 0,
// αλλιώς δεν μπορείς ποτέ να προσθέσεις δεύτερο πάροχο.
{
  const sel: Selection = { provider: ['ΔΕΗ'] }
  const opts = facetOptions(ITEMS, 'provider', sel)
  const eyd = opts.find(o => o.value === 'ΕΥΔΑΠ')
  const dei = opts.find(o => o.value === 'ΔΕΗ')
  ok('με ΔΕΗ επιλεγμένη, η ΕΥΔΑΠ δείχνει το δικό της πλήθος (όχι 0)', eyd?.count === 1)
  ok('η ίδια η ΔΕΗ δείχνει το πλήθος της', dei?.count === 3)
  ok('η ΔΕΗ σημειώνεται ως επιλεγμένη', dei?.selected === true)
  ok('οι επιλεγμένες μπαίνουν πρώτες', opts[0].value === 'ΔΕΗ')
}

// ── Μετρητές: ΑΛΛΗ όψη περιορίζει κανονικά ─────────────────────────────────
{
  const opts = facetOptions(ITEMS, 'provider', { year: ['2026'] })
  ok('με χρονιά 2026, η ΔΕΗ δείχνει 1', opts.find(o => o.value === 'ΔΕΗ')?.count === 1)
  ok('με χρονιά 2026, η ΕΥΔΑΠ δεν εμφανίζεται', !opts.some(o => o.value === 'ΕΥΔΑΠ'))
}

// ── Επιλεγμένη τιμή που έμεινε χωρίς αποτελέσματα μένει ορατή με 0 ─────────
{
  const sel: Selection = { provider: ['ΕΥΔΑΠ'], year: ['2026'] }
  const opts = facetOptions(ITEMS, 'provider', sel)
  const eyd = opts.find(o => o.value === 'ΕΥΔΑΠ')
  ok('επιλεγμένη τιμή χωρίς αποτελέσματα παραμένει ορατή', eyd !== undefined)
  ok('…και δείχνει 0, ώστε να φαίνεται ποιο φίλτρο φταίει', eyd?.count === 0)
}

// ── Εναλλαγή ───────────────────────────────────────────────────────────────
{
  let s: Selection = {}
  s = toggleValue(s, 'provider', 'ΔΕΗ');   ok('πάτημα προσθέτει', s.provider?.length === 1)
  s = toggleValue(s, 'provider', 'ΕΥΔΑΠ'); ok('δεύτερο πάτημα προσθέτει', s.provider?.length === 2)
  s = toggleValue(s, 'provider', 'ΔΕΗ');   ok('ξαναπάτημα αφαιρεί', s.provider?.join() === 'ΕΥΔΑΠ')
  s = clearFacet(s, 'provider');           ok('καθάρισμα όψης', (s.provider ?? []).length === 0)
  ok('καθάρισμα όλων', isSelectionEmpty(clearAll()))
}

// ── Αναζήτηση ──────────────────────────────────────────────────────────────
ok('κενή αναζήτηση περνά τα πάντα', ITEMS.every(i => matchesQuery(i, '')))
ok('βρίσκει σε τίτλο', matchesQuery(ITEMS[0], 'ιανουάριος'))
ok('βρίσκει σε πάροχο', matchesQuery(ITEMS[0], 'δεη'))
ok('βρίσκει σε κατηγορία', matchesQuery(ITEMS[4], 'συμβόλαια'))
ok('βρίσκει ποσό με τελεία', matchesQuery(ITEMS[0], '88.5'))
ok('βρίσκει ποσό με κόμμα, όπως το βλέπει ο χρήστης', matchesQuery(ITEMS[0], '88,50'))
ok('βρίσκει με ΑΦΜ', matchesQuery(ITEMS[0], '090000045'))
ok('δεν ταιριάζει άσχετο', !matchesQuery(ITEMS[0], 'πισίνα'))
// Σύντομος αριθμός δεν πρέπει να «πιάνει» ΑΦΜ κατά λάθος
ok('δύο ψηφία δεν ψάχνουν σε ΑΦΜ', !matchesQuery(mk({ id: 'x', afm: '090000045' }), '09'))

// ── Αναζήτηση ΚΑΙ όψεις μαζί ───────────────────────────────────────────────
ok('αναζήτηση συνδυάζεται με όψη',
   applyFilters(ITEMS, { year: ['2025'] }, 'δεη').length === 2)
{
  const opts = facetOptions(ITEMS, 'year', {}, 'δεη')
  ok('οι μετρητές σέβονται την αναζήτηση', opts.find(o => o.value === '2025')?.count === 2)
}

// ── Ομαδοποίηση στον χρόνο ─────────────────────────────────────────────────
{
  const now = new Date('2026-06-15T12:00:00Z')
  const g = groupByMonth(ITEMS, now)
  ok('ο τρέχων μήνας ονομάζεται «Αυτόν τον μήνα»', g[0].label === 'Αυτόν τον μήνα')
  ok('ο τρέχων μήνας είναι πρώτος', g[0].items[0].id === 'dei-3')
  ok('οι ομάδες είναι φθίνουσες', g[1].key === '2025-09')
  ok('ελληνικό όνομα μήνα', g[1].label === 'Σεπτέμβριος 2025')
  ok('τα αχρονολόγητα πάνε τελευταία', g[g.length - 1].key === 'no-date')
  ok('…και δεν χάνονται', g[g.length - 1].items.some(i => i.id === 'foto-1'))
  ok('κανένα αρχείο δεν χάθηκε', g.reduce((n, x) => n + x.items.length, 0) === ITEMS.length)
}
{
  // «Τον προηγούμενο μήνα» με αλλαγή χρονιάς: Ιανουάριος → Δεκέμβριος πέρσι
  const jan = new Date('2026-01-10T00:00:00Z')
  const g = groupByMonth([mk({ id: 'd', date: '2025-12-05' })], jan)
  ok('ο προηγούμενος μήνας περνά σωστά την αλλαγή χρονιάς', g[0].label === 'Τον προηγούμενο μήνα')
}

// ── Άθροισμα ───────────────────────────────────────────────────────────────
ok('άθροισμα αγνοεί τα κενά', sumValues(ITEMS) === 88.5 + 102.4 + 75 + 42 + 340)
ok('άθροισμα φιλτραρισμένου συνόλου',
   sumValues(applyFilters(ITEMS, { provider: ['ΔΕΗ'], year: ['2025'] })) === 190.9)

console.log(`archive/facets.test.ts: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
