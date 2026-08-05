// ═══════════════════════════════════════════════════════════════════════════
// ΑΡΧΕΙΟ — ΟΨΕΙΣ ΑΝΤΙ ΓΙΑ ΦΑΚΕΛΟΥΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΠΡΟΒΛΗΜΑ ΜΕ ΤΟΥΣ ΦΑΚΕΛΟΥΣ
// Ο φάκελος αναγκάζει κάθε χαρτί να διαλέξει ΕΝΑ σπίτι. Ένα μισθωτήριο όμως
// είναι ταυτόχρονα συμβόλαιο, φορολογικό έγγραφο και χαρτί του ενοικιαστή· ένας
// λογαριασμός ΔΕΗ είναι λογαριασμός, έξοδο του 2026, και χαρτί της ΔΕΗ. Όποιο
// δέντρο κι αν φτιάξεις, οι μισές ερωτήσεις πέφτουν έξω από αυτό:
//
//   «όλα του 2025 για τον λογιστή»          → κόβει κάθετα σε ΟΛΟΥΣ τους φακέλους
//   «όλα της ΔΕΗ, να δω πώς ανέβηκε»        → κόβει κάθετα
//   «όλα τα τιμολόγια πάνω από 200 €»       → κόβει κάθετα
//
// Με φακέλους, καθεμία από αυτές θέλει άνοιγμα-κλείσιμο σε δέκα σημεία. Γι' αυτό
// ο κόσμος καταλήγει να κατεβάζει τα πάντα και να ψάχνει στον υπολογιστή του.
//
// Η ΠΡΟΣΕΓΓΙΣΗ ΕΔΩ
// Κανένα δέντρο. Κάθε αρχείο έχει ΙΔΙΟΤΗΤΕΣ (κατηγορία, πάροχος, χρονιά, πηγή)
// και ο χρήστης συνδυάζει όσες θέλει. Μέσα σε μία όψη οι επιλογές ενώνονται με Ή
// («ΔΕΗ Ή ΕΥΔΑΠ»), ανάμεσα σε όψεις με ΚΑΙ («ΔΕΗ Ή ΕΥΔΑΠ» ΚΑΙ «2025»). Αυτός
// είναι ο κανόνας που περιμένει κάθε άνθρωπος που έχει φιλτράρει ποτέ κάτι.
//
// ΓΙΑΤΙ ΟΙ ΜΕΤΡΗΤΕΣ ΑΓΝΟΟΥΝ ΤΗ ΔΙΚΗ ΤΟΥΣ ΟΨΗ
// Δίπλα σε κάθε επιλογή δείχνουμε πόσα αρχεία θα μείνουν αν την πατήσεις. Ο
// μετρητής της «ΔΕΗ» υπολογίζεται με ΟΛΑ τα άλλα φίλτρα ενεργά αλλά αγνοώντας
// τις επιλογές της ΙΔΙΑΣ όψης — αλλιώς, μόλις διάλεγες «ΔΕΗ», όλοι οι άλλοι
// πάροχοι θα έδειχναν 0 και δεν θα μπορούσες ποτέ να προσθέσεις δεύτερο.
// Είναι το ίδιο που κάνει κάθε σοβαρό φίλτρο καταστήματος, και ο λόγος που εκεί
// μπορείς να διαλέξεις δύο μεγέθη μαζί.
//
// Καθαρή λογική: καμία εξάρτηση από React ή Supabase, ώστε να ελέγχεται.
// ═══════════════════════════════════════════════════════════════════════════

/** Οι όψεις. Προσθήκη νέας: ένα κλειδί εδώ και μία γραμμή στο FACET_OF. */
export type FacetKey = 'category' | 'provider' | 'year' | 'source'

/** Ό,τι χρειάζεται μια γραμμή αρχείου για να φιλτραριστεί. Δομικός τύπος: το
 *  component περνά το δικό του Item χωρίς μετατροπή. */
export interface FacetableItem {
  id: string
  title: string
  provider: string | null
  /** ISO ημερομηνία· από εδώ βγαίνει η χρονιά. */
  date: string | null
  value: number | null
  note: string | null
  /** Ετικέτα κατηγορίας, ήδη σε ελληνικά. */
  categoryLabel: string
  /** Από πού ήρθε: ανεβασμένο αρχείο, έξοδο, λογαριασμός, απογραφή. */
  sourceLabel: string
  /** ΑΦΜ παρόχου, αν το διαβάσαμε — η αναζήτηση το βλέπει. */
  afm?: string | null
}

/** Ποιες τιμές δίνει κάθε όψη για ένα αρχείο. Κενό ⇒ το αρχείο δεν συμμετέχει
 *  σε αυτή την όψη (π.χ. χαρτί χωρίς ημερομηνία δεν έχει χρονιά). */
export const FACET_OF: Record<FacetKey, (i: FacetableItem) => string[]> = {
  category: i => (i.categoryLabel ? [i.categoryLabel] : []),
  provider: i => (i.provider ? [i.provider] : []),
  year:     i => (i.date && i.date.length >= 4 ? [i.date.slice(0, 4)] : []),
  source:   i => (i.sourceLabel ? [i.sourceLabel] : []),
}

export const FACET_LABEL: Record<FacetKey, string> = {
  category: 'Κατηγορία',
  provider: 'Πάροχος',
  year:     'Χρονιά',
  source:   'Προέλευση',
}

/** Επιλεγμένες τιμές ανά όψη. Απούσα ή κενή ⇒ η όψη δεν φιλτράρει. */
export type Selection = Partial<Record<FacetKey, readonly string[]>>

export const FACET_KEYS: readonly FacetKey[] = ['category', 'provider', 'year', 'source']

/** Πόσες όψεις φιλτράρουν αυτή τη στιγμή. */
export const activeFacetCount = (sel: Selection): number =>
  FACET_KEYS.reduce((n, k) => n + ((sel[k]?.length ?? 0) > 0 ? 1 : 0), 0)

export const isSelectionEmpty = (sel: Selection): boolean => activeFacetCount(sel) === 0

/** Ένα αρχείο περνά μια όψη όταν ΚΑΜΙΑ τιμή δεν είναι επιλεγμένη, ή όταν έχει
 *  έστω μία από τις επιλεγμένες (Ή μέσα στην όψη). */
function passesFacet(item: FacetableItem, key: FacetKey, sel: Selection): boolean {
  const chosen = sel[key]
  if (!chosen || chosen.length === 0) return true
  const values = FACET_OF[key](item)
  return values.some(v => chosen.includes(v))
}

/**
 * Ελεύθερη αναζήτηση. Βλέπει ΚΑΙ το ποσό και το ΑΦΜ, γιατί ο ιδιοκτήτης συχνά
 * θυμάται μόνο αυτά: «ο λογαριασμός των 88,50».
 *
 * Το ποσό ταιριάζει είτε γραμμένο με κόμμα είτε με τελεία — ο χρήστης γράφει
 * «88,50» όπως το βλέπει στην οθόνη, ενώ ο αριθμός στη βάση είναι 88.5.
 */
export function matchesQuery(item: FacetableItem, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return true

  const inText = [item.title, item.provider, item.categoryLabel, item.note, item.sourceLabel]
    .some(t => (t || '').toLowerCase().includes(q))
  if (inText) return true

  const qDigits = q.replace(/\D/g, '')
  if (qDigits.length >= 6 && (item.afm || '').includes(qDigits)) return true

  if (item.value != null) {
    const num = q.replace(',', '.').replace(/[^\d.]/g, '')
    if (num && num !== '.') {
      const asText = String(item.value)
      const fixed = item.value.toFixed(2)
      if (asText.includes(num) || fixed.includes(num) || fixed.replace('.', ',').includes(q)) return true
    }
  }
  return false
}

/** Το τελικό σύνολο: αναζήτηση ΚΑΙ κάθε ενεργή όψη. */
export function applyFilters<T extends FacetableItem>(
  items: readonly T[], sel: Selection, query = '',
): T[] {
  return items.filter(i =>
    matchesQuery(i, query) && FACET_KEYS.every(k => passesFacet(i, k, sel)))
}

export interface FacetOption {
  value: string
  /** Πόσα αρχεία μένουν αν αυτή η τιμή είναι επιλεγμένη. */
  count: number
  selected: boolean
}

/**
 * Οι επιλογές μιας όψης με τους μετρητές τους.
 *
 * Ο μετρητής υπολογίζεται με την αναζήτηση και ΟΛΕΣ τις άλλες όψεις ενεργές,
 * αλλά αγνοώντας τις επιλογές αυτής της ίδιας όψης. Αλλιώς, μόλις διάλεγες
 * «ΔΕΗ», κάθε άλλος πάροχος θα έδειχνε 0 και το φίλτρο θα ήταν παγίδα ενός
 * δρόμου: δεν θα μπορούσες ποτέ να δεις «ΔΕΗ και ΕΥΔΑΠ μαζί».
 *
 * Ταξινόμηση: πρώτα οι επιλεγμένες (να μη χάνονται όταν η λίστα είναι μακριά),
 * μετά κατά πλήθος φθίνουσα, και με ίσο πλήθος αλφαβητικά στα ελληνικά ώστε η
 * σειρά να είναι σταθερή και προβλέψιμη.
 */
export function facetOptions<T extends FacetableItem>(
  items: readonly T[], key: FacetKey, sel: Selection, query = '',
): FacetOption[] {
  const others: Selection = { ...sel, [key]: [] }
  const pool = applyFilters(items, others, query)

  const counts = new Map<string, number>()
  for (const i of pool) for (const v of FACET_OF[key](i)) counts.set(v, (counts.get(v) ?? 0) + 1)

  // Μια επιλεγμένη τιμή που δεν εμφανίζεται πια στο pool πρέπει να παραμείνει
  // ορατή με 0 — αλλιώς ο χρήστης βλέπει άδεια λίστα χωρίς τρόπο να καταλάβει
  // ποιο φίλτρο φταίει, ούτε πώς να το σβήσει.
  const chosen = sel[key] ?? []
  for (const v of chosen) if (!counts.has(v)) counts.set(v, 0)

  return [...counts.entries()]
    .map(([value, count]) => ({ value, count, selected: chosen.includes(value) }))
    .sort((a, b) =>
      (Number(b.selected) - Number(a.selected)) ||
      (b.count - a.count) ||
      a.value.localeCompare(b.value, 'el'))
}

/** Πάτημα σε τιμή: μπαίνει αν λείπει, βγαίνει αν υπάρχει. */
export function toggleValue(sel: Selection, key: FacetKey, value: string): Selection {
  const cur = sel[key] ?? []
  const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value]
  return { ...sel, [key]: next }
}

export const clearFacet = (sel: Selection, key: FacetKey): Selection => ({ ...sel, [key]: [] })
export const clearAll = (): Selection => ({})

/* ── Ομαδοποίηση στον χρόνο ─────────────────────────────────────────────────
   Αντικαθιστά τους φακέλους ως τρόπο να «ανασαίνει» μια μακριά λίστα. Ο χρόνος
   είναι ο μόνος άξονας που ο ιδιοκτήτης έχει πάντα στο μυαλό του: ξέρει περίπου
   πότε ήρθε ένα χαρτί, ακόμη κι όταν δεν θυμάται πώς το είχε πει.               */

const GREEK_MONTHS = [
  'Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος',
  'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος',
]

export interface TimeGroup<T> { key: string; label: string; items: T[] }

/**
 * Ομάδες ανά μήνα, νεότερη πρώτη. Τα χαρτιά χωρίς ημερομηνία πάνε σε δική τους
 * ομάδα στο ΤΕΛΟΣ — δεν τα κρύβουμε και δεν τους δίνουμε ψεύτικη ημερομηνία.
 *
 * Το `now` περνιέται ως όρισμα ώστε το «Αυτόν τον μήνα» να είναι ελέγξιμο.
 */
export function groupByMonth<T extends FacetableItem>(items: readonly T[], now: Date): TimeGroup<T>[] {
  const dated = items.filter(i => i.date)
  const undated = items.filter(i => !i.date)

  const buckets = new Map<string, T[]>()
  for (const i of dated) {
    const key = i.date!.slice(0, 7)         // YYYY-MM
    const arr = buckets.get(key); if (arr) arr.push(i); else buckets.set(key, [i])
  }

  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`

  const groups = [...buckets.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, arr]) => {
      const [y, m] = key.split('-')
      const label = key === thisMonth ? 'Αυτόν τον μήνα'
        : key === lastMonth ? 'Τον προηγούμενο μήνα'
        : `${GREEK_MONTHS[Number(m) - 1]} ${y}`
      return {
        key, label,
        items: arr.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')),
      }
    })

  if (undated.length) {
    groups.push({
      key: 'no-date',
      label: 'Χωρίς ημερομηνία',
      items: undated.slice().sort((a, b) => a.title.localeCompare(b.title, 'el')),
    })
  }
  return groups
}

/** Άθροισμα ποσών — αυτό που ρωτά ο λογιστής για ένα φιλτραρισμένο σύνολο. */
export const sumValues = (items: readonly FacetableItem[]): number =>
  items.reduce((s, i) => s + (i.value ?? 0), 0)
