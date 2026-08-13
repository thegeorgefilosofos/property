// ═══════════════════════════════════════════════════════════════════════════
// Ο ΣΥΝΔΕΣΜΟΣ ΠΟΥ ΣΤΕΛΝΕΙ Ο ΕΠΙΣΚΕΠΤΗΣ ΠΡΕΠΕΙ ΝΑ ΔΕΙΧΝΕΙ ΤΟ ΙΔΙΟ ΑΠΟΤΕΛΕΣΜΑ
// ─────────────────────────────────────────────────────────────────────────
// Αν ο κύκλος «γράφω → αντιγράφω → ανοίγω» δεν κλείνει ακριβώς, ο παραλήπτης
// βλέπει ΑΛΛΟΝ αριθμό από αυτόν που του έστειλαν. Δεν είναι σφάλμα οθόνης:
// είναι δύο άνθρωποι που συζητούν πάνω σε διαφορετικά νούμερα νομίζοντας ότι
// κοιτούν το ίδιο. Εδώ κλειδώνει ότι κλείνει.
// ═══════════════════════════════════════════════════════════════════════════
import { readTool, toolQuery, toolLink } from './permalink'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }

/** Οι προεπιλογές του υπολογιστή ενοικίων, όπως τις έχει η σελίδα. */
const RENT = { enoikio: '600', mines: '12', trapeza: '1' } as const
const P = (s: string) => new URLSearchParams(s)

// ── ΑΝΑΓΝΩΣΗ ──────────────────────────────────────────────────────────────
{
  ok('χωρίς παραμέτρους μένουν οι προεπιλογές',
     JSON.stringify(readTool(RENT, null)) === JSON.stringify(RENT))
  ok('κενή διεύθυνση μένει στις προεπιλογές',
     JSON.stringify(readTool(RENT, P(''))) === JSON.stringify(RENT))

  const r = readTool(RENT, P('enoikio=850'))
  ok('μία παράμετρος αλλάζει μόνο το δικό της πεδίο', r.enoikio === '850')
  ok('…και τα υπόλοιπα μένουν στις προεπιλογές', r.mines === '12' && r.trapeza === '1')

  ok('όλα μαζί', JSON.stringify(readTool(RENT, P('enoikio=850&mines=7&trapeza=0')))
     === JSON.stringify({ enoikio: '850', mines: '7', trapeza: '0' }))
}

// ── Ο ΜΙΣΟΠΛΗΚΤΡΟΛΟΓΗΜΕΝΟΣ ΣΥΝΔΕΣΜΟΣ ──────────────────────────────────────
// Ένας σύνδεσμος σπάει σε chat, σε email, σε SMS. Ό,τι φτάνει κομμένο δεν
// επιτρέπεται να ΑΔΕΙΑΣΕΙ τη φόρμα: κενό πεδίο δείχνει μηδενικά, και ο
// παραλήπτης νομίζει ότι ο αποστολέας του έστειλε μηδέν φόρο.
{
  ok('κενή τιμή αγνοείται', readTool(RENT, P('enoikio=')).enoikio === '600')
  ok('τιμή μόνο με κενά αγνοείται', readTool(RENT, P('enoikio=%20%20')).enoikio === '600')
  ok('τα κενά γύρω από την τιμή κόβονται', readTool(RENT, P('enoikio=%20850%20')).enoikio === '850')
  ok('άγνωστη παράμετρος δεν μπαίνει στο αποτέλεσμα',
     Object.keys(readTool(RENT, P('foros=999'))).join() === Object.keys(RENT).join())
  ok('…και δεν αλλάζει τίποτα',
     JSON.stringify(readTool(RENT, P('foros=999'))) === JSON.stringify(RENT))
  // Δεν επικυρώνουμε ΕΔΩ την τιμή: το πεδίο τη δέχεται όπως θα τη δεχόταν από
  // πληκτρολόγιο, και ο υπολογισμός την περνά από parseAmount. Ένας φύλακας που
  // πετούσε τα σκουπίδια εδώ θα έκρυβε από τον χρήστη ό,τι στάλθηκε.
  ok('σκουπίδια περνούν αυτούσια στο πεδίο', readTool(RENT, P('enoikio=abc')).enoikio === 'abc')
}

// ── ΓΡΑΨΙΜΟ: ΜΟΝΟ ΟΣΑ ΑΛΛΑΞΑΝ ─────────────────────────────────────────────
{
  ok('όλα στις προεπιλογές δίνουν κενή διεύθυνση', toolQuery(RENT, RENT) === '')
  ok('ένα αλλαγμένο πεδίο γράφει ένα ζευγάρι',
     toolQuery(RENT, { ...RENT, enoikio: '850' }) === '?enoikio=850')
  ok('δύο αλλαγμένα, με τη σειρά της προδιαγραφής',
     toolQuery(RENT, { ...RENT, mines: '7', enoikio: '850' }) === '?enoikio=850&mines=7')
  ok('η επιστροφή στην προεπιλογή καθαρίζει τη διεύθυνση',
     toolQuery(RENT, { ...RENT, enoikio: '600' }) === '')
  ok('κενό πεδίο δεν γράφεται', toolQuery(RENT, { ...RENT, enoikio: '' }) === '')
  ok('πεδίο εκτός προδιαγραφής δεν γράφεται',
     toolQuery(RENT, { ...RENT, kryfo: 'ναι' }) === '')
  ok('τιμή με κενά γύρω γράφεται κομμένη',
     toolQuery(RENT, { ...RENT, enoikio: ' 850 ' }) === '?enoikio=850')
  ok('η ελληνική γραφή ποσού κωδικοποιείται',
     toolQuery(RENT, { ...RENT, enoikio: '1.250,50' }) === '?enoikio=1.250%2C50')
}

// ── Ο ΚΥΚΛΟΣ ΚΛΕΙΝΕΙ: ΓΡΑΦΩ → ΔΙΑΒΑΖΩ → ΤΟ ΙΔΙΟ ──────────────────────────
// Το μοναδικό αμετάβλητο που έχει σημασία για τον χρήστη.
{
  const cases = [
    RENT,
    { enoikio: '850', mines: '12', trapeza: '1' },
    { enoikio: '1.250,50', mines: '7', trapeza: '0' },
    { enoikio: '0', mines: '0', trapeza: '1' },
    { enoikio: '600', mines: '12', trapeza: '0' },
  ]
  let closed = true
  for (const c of cases) {
    const back = readTool(RENT, P(toolQuery(RENT, c).replace(/^\?/, '')))
    if (JSON.stringify(back) !== JSON.stringify(c)) { closed = false; console.log('    ↯ ' + JSON.stringify(c)) }
  }
  ok('ό,τι γράφεται ξαναδιαβάζεται απαράλλαχτο', closed)
}

// ── Ο ΠΛΗΡΗΣ ΣΥΝΔΕΣΜΟΣ ────────────────────────────────────────────────────
{
  const path = '/ypologismos-forou-enoikion'
  ok('προεπιλογές: σκέτη η διεύθυνση της σελίδας, χωρίς ερωτηματικό',
     toolLink('https://propertyos.gr', path, RENT, RENT) === 'https://propertyos.gr' + path)
  ok('με αλλαγή, η παράμετρος στο τέλος',
     toolLink('https://propertyos.gr', path, RENT, { ...RENT, mines: '7' })
     === 'https://propertyos.gr' + path + '?mines=7')
  // Το origin έρχεται από το window και μπορεί να έχει καταλήξει με κάθετο.
  ok('διπλή κάθετος δεν δημιουργείται ποτέ',
     toolLink('https://propertyos.gr/', path, RENT, RENT) === 'https://propertyos.gr' + path)
  ok('τοπική εκτέλεση με θύρα',
     toolLink('http://localhost:3000', path, RENT, { ...RENT, enoikio: '850' })
     === 'http://localhost:3000' + path + '?enoikio=850')
}

console.log(`tools/permalink.test.ts: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
