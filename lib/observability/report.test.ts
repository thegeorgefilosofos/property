// ═══════════════════════════════════════════════════════════════════════════
// Η ΑΝΑΦΟΡΑ ΣΦΑΛΜΑΤΟΣ ΔΕΝ ΕΠΙΤΡΕΠΕΤΑΙ ΝΑ ΣΠΑΣΕΙ ΤΙΠΟΤΑ, ΚΑΙ ΝΑ ΜΗ ΔΙΑΡΡΕΥΣΕΙ
// ─────────────────────────────────────────────────────────────────────────
// Καλείται από τα τρία όρια σφάλματος της εφαρμογής — δηλαδή ακριβώς τη στιγμή
// που κάτι έχει ΗΔΗ πάει στραβά. Μια εξαίρεση μέσα στον αναφορέα θα έκρυβε το
// αρχικό σφάλμα πίσω από ένα δεύτερο και ο χρήστης θα έβλεπε λευκή οθόνη.
//
// ΚΑΙ ΤΟ ΔΕΥΤΕΡΟ: ΤΙ ΤΑΞΙΔΕΥΕΙ. Ο φάκελος φεύγει σε τρίτο (Sentry). Ό,τι μοιάζει
// με προσωπικό δεδομένο σβήνεται ΠΡΙΝ φύγει, γιατί μια αναφορά σφάλματος με ΑΦΜ
// και τηλέφωνο μέσα είναι διαρροή, όχι παρατηρησιμότητα.
//
// ΧΩΡΙΣ DSN ΔΕΝ ΦΕΥΓΕΙ ΤΙΠΟΤΑ. Έτσι είναι σήμερα η παραγωγή: η εφαρμογή τρέχει
// ακριβώς το ίδιο και η μόνη διαφορά όταν μπει το DSN είναι ότι κάποιος
// μαθαίνει τα σφάλματα χωρίς να τηλεφωνήσει ο πελάτης.
// ═══════════════════════════════════════════════════════════════════════════
import { captureError, worthReporting } from './report'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }

/** Κρατά ό,τι θα έφευγε στο δίκτυο, χωρίς να φύγει. */
function withCapture(dsn: string | undefined, fn: () => void): { url: string; body: string }[] {
  const sent: { url: string; body: string }[] = []
  const realFetch = globalThis.fetch
  const realDsn = process.env.NEXT_PUBLIC_SENTRY_DSN
  const realLog = console.error
  if (dsn) process.env.NEXT_PUBLIC_SENTRY_DSN = dsn
  else delete process.env.NEXT_PUBLIC_SENTRY_DSN
  globalThis.fetch = ((url: string, init: { body: string }) => {
    sent.push({ url: String(url), body: String(init?.body ?? '') })
    return Promise.resolve(new Response(''))
  }) as unknown as typeof fetch
  console.error = () => {}
  try { fn() } finally {
    globalThis.fetch = realFetch
    console.error = realLog
    if (realDsn === undefined) delete process.env.NEXT_PUBLIC_SENTRY_DSN
    else process.env.NEXT_PUBLIC_SENTRY_DSN = realDsn
  }
  return sent
}

const DSN = 'https://abc123@o1.ingest.sentry.io/456'
/** Το γεγονός μέσα στον φάκελο: τρεις γραμμές JSON, το γεγονός είναι η τρίτη. */
const event = (body: string) => JSON.parse(body.split('\n')[2]) as Record<string, unknown>

// ── ΧΩΡΙΣ DSN, ΚΑΜΙΑ ΚΙΝΗΣΗ ───────────────────────────────────────────────
{
  const sent = withCapture(undefined, () => captureError(new Error('κάτι έσπασε')))
  ok('χωρίς DSN δεν φεύγει τίποτα', sent.length === 0)
}

// ── ΜΕ DSN: ΠΟΥ ΠΑΕΙ ΚΑΙ ΤΙ ΓΡΑΦΕΙ ────────────────────────────────────────
{
  const sent = withCapture(DSN, () => captureError(new TypeError('χάλασε το x')))
  ok('φεύγει ακριβώς ένας φάκελος', sent.length === 1)
  ok('στο endpoint του έργου', sent[0].url.startsWith('https://o1.ingest.sentry.io/api/456/envelope/'))
  ok('με το δημόσιο κλειδί του DSN', sent[0].url.includes('sentry_key=abc123'))

  const ev = event(sent[0].body) as { exception: { values: { type: string; value: string }[] }; level: string; extra: Record<string, unknown> }
  ok('ο τύπος του σφάλματος διατηρείται', ev.exception.values[0].type === 'TypeError')
  ok('το μήνυμα διατηρείται', ev.exception.values[0].value === 'χάλασε το x')
  ok('επίπεδο error', ev.level === 'error')
  ok('η στοίβα ταξιδεύει', typeof ev.extra.stack === 'string')
}

// ── ΤΑ ΠΡΟΣΩΠΙΚΑ ΔΕΔΟΜΕΝΑ ΔΕΝ ΤΑΞΙΔΕΥΟΥΝ ──────────────────────────────────
// Ο κανόνας πιάνει το ΟΝΟΜΑ του κλειδιού, όχι το περιεχόμενο: το περιεχόμενο
// δεν αναγνωρίζεται με σιγουριά, το όνομα ναι.
{
  const sent = withCapture(DSN, () => captureError(new Error('x'), {
    email: 'a@b.gr', phone: '6900000000', afm: '123456789', full_name: 'Γιώργος',
    iban: 'GR16', token: 'secret', address: 'Πατησίων 46',
    propertyId: 'p-1', tab: 'inventory',
  }))
  const ev = event(sent[0].body) as { extra: Record<string, unknown> }
  const hidden = ['email', 'phone', 'afm', 'full_name', 'iban', 'token', 'address']
  ok('κάθε προσωπικό πεδίο σβήνεται', hidden.every(k => ev.extra[k] === '[redacted]'))
  ok('…και καμία τιμή τους δεν επιβιώνει στο σώμα',
     !/a@b\.gr|6900000000|123456789|Γιώργος|Πατησίων/.test(sent[0].body))
  ok('τα τεχνικά πεδία περνούν ακέραια', ev.extra.propertyId === 'p-1' && ev.extra.tab === 'inventory')
}

// ── ΠΟΙΑ ΕΚΔΟΣΗ ΕΣΠΑΣΕ ────────────────────────────────────────────────────
{
  const real = process.env.NEXT_PUBLIC_BUILD_SHA
  process.env.NEXT_PUBLIC_BUILD_SHA = 'a1b2c3d'
  const sent = withCapture(DSN, () => captureError(new Error('x')))
  const ev = event(sent[0].body) as { release?: string }
  ok('ο φάκελος φέρει την έκδοση του build', ev.release === 'a1b2c3d')
  if (real === undefined) delete process.env.NEXT_PUBLIC_BUILD_SHA
  else process.env.NEXT_PUBLIC_BUILD_SHA = real
}

// ── Ο ΑΝΑΦΟΡΕΑΣ ΔΕΝ ΠΕΤΑΕΙ ΠΟΤΕ ───────────────────────────────────────────
// Καλείται μέσα σε όριο σφάλματος: μια εξαίρεση εδώ κρύβει το αρχικό σφάλμα.
{
  let threw = false
  try {
    withCapture('όχι-έγκυρο-dsn', () => captureError(new Error('x')))
    withCapture(DSN, () => captureError('σκέτο κείμενο'))
    withCapture(DSN, () => captureError(null))
    withCapture(DSN, () => captureError({ κάτι: 'αντικείμενο' }))
    const circular: Record<string, unknown> = {}
    circular.self = circular
    withCapture(DSN, () => captureError(circular))
  } catch { threw = true }
  ok('άκυρο DSN, κενό σφάλμα, κείμενο και κυκλικό αντικείμενο δεν πετούν', !threw)

  const bad = withCapture('όχι-έγκυρο-dsn', () => captureError(new Error('x')))
  ok('με άκυρο DSN δεν φεύγει τίποτα', bad.length === 0)
}

// ── ΠΟΙΑ ΣΦΑΛΜΑΤΑ ΑΞΙΖΕΙ ΝΑ ΤΑΞΙΔΕΨΟΥΝ ────────────────────────────────────
// Ο καθολικός ακροατής ακούει ΚΑΘΕ σφάλμα της σελίδας και οι επεκτάσεις του
// περιηγητή πετούν πολλά. Μια λίστα σφαλμάτων γεμάτη θόρυβο δεν διαβάζεται —
// και τότε δεν διαβάζονται ούτε τα αληθινά.
{
  ok('κανονικό σφάλμα ταξιδεύει', worthReporting(new Error('χάλασε η αποθήκευση')))
  ok('σφάλμα με στοίβα αλλά χωρίς μήνυμα ταξιδεύει', worthReporting(Object.assign(new Error(''), { stack: 'at x' })))
  ok('κείμενο ταξιδεύει', worthReporting('κάτι έσπασε'))
  ok('αντικείμενο ταξιδεύει', worthReporting({ code: 500 }))

  // Το «Script error.» είναι ό,τι δίνει ο περιηγητής για σφάλμα άλλης
  // προέλευσης: χωρίς μήνυμα, χωρίς στοίβα, χωρίς καμία πληροφορία.
  ok('σφάλμα άλλης προέλευσης δεν ταξιδεύει', !worthReporting(new Error('Script error.')))
  ok('…ούτε ως σκέτο κείμενο', !worthReporting('Script error'))
  ok('σφάλμα χωρίς μήνυμα και χωρίς στοίβα δεν ταξιδεύει',
     !worthReporting(Object.assign(new Error(''), { stack: '' })))
  ok('κενό κείμενο δεν ταξιδεύει', !worthReporting('   '))
  ok('κενή απόρριψη promise δεν ταξιδεύει', !worthReporting(null) && !worthReporting(undefined))
}

console.log(`observability/report.test.ts: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
