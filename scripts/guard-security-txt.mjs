#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ security.txt ΔΕΝ ΕΠΙΤΡΕΠΕΤΑΙ ΝΑ ΛΗΞΕΙ ΣΙΩΠΗΛΑ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΒΡΕΘΗΚΕ. Το αρχείο δήλωνε ότι ακολουθεί το RFC 9116 και δεν
// είχε το πεδίο `Expires`, που το RFC ορίζει ΥΠΟΧΡΕΩΤΙΚΟ (§2.5.5). Δηλαδή
// έγραφε «είμαι έγκυρο κατά το πρότυπο» ενώ κάθε εργαλείο που το διαβάζει
// μηχανικά το απορρίπτει. Μια πολιτική ασφαλείας που δεν περνά τον έλεγχο του
// ίδιου προτύπου που επικαλείται είναι χειρότερη από το να μην υπάρχει.
//
// ΓΙΑΤΙ ΦΥΛΑΚΑΣ ΚΑΙ ΟΧΙ ΑΠΛΩΣ ΔΙΟΡΘΩΣΗ. Το `Expires` είναι ημερομηνία γραμμένη
// με το χέρι, το πολύ έναν χρόνο μπροστά. Δηλαδή είναι ΕΓΓΥΗΜΕΝΟ ότι κάποια
// στιγμή θα λήξει, και τη μέρα που θα λήξει κανείς δεν θα το κοιτάζει: ο
// ερευνητής που βρήκε κενό θα δει ληγμένη πολιτική και θα υποθέσει, εύλογα,
// ότι δεν ισχύει η υπόσχεση περί ασφαλούς λιμένα. Ο φύλακας χτυπά ΠΡΙΝ λήξει,
// όσο υπάρχει χρόνος να ανανεωθεί χωρίς βιασύνη.
//
// ΤΙ ΕΛΕΓΧΕΙ
//   1. Υπάρχουν τα υποχρεωτικά πεδία `Contact` και `Expires`.
//   2. Το `Expires` είναι έγκυρη ημερομηνία ISO 8601, στο μέλλον, και όχι
//      πάνω από έναν χρόνο μπροστά (§2.5.5: «less than a year»).
//   3. Απομένουν τουλάχιστον 60 ημέρες. Κάτω από αυτό το όριο η CI κοκκινίζει
//      ως υπενθύμιση, όχι ως καταστροφή.
//   4. Το `Policy` δείχνει στη σελίδα που όντως περιγράφει την πολιτική, και
//      το `Canonical` στο ίδιο το αρχείο. Λάθος εδώ σημαίνει ότι ο ερευνητής
//      καταλήγει σε 404 τη στιγμή που μας κάνει χάρη.
//   5. Το `Preferred-Languages` γράφεται ΜΙΑ φορά (§2.5.8).
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'

const FILE = 'public/.well-known/security.txt'
const POLICY = 'https://propertyos.gr/trust'
const CANONICAL = 'https://propertyos.gr/.well-known/security.txt'
const MIN_DAYS = 60
const DAY = 86_400_000

const text = readFileSync(FILE, 'utf8')
const fields = new Map()
for (const raw of text.split('\n')) {
  const line = raw.trim()
  if (!line || line.startsWith('#')) continue
  const i = line.indexOf(':')
  if (i < 0) continue
  const name = line.slice(0, i).trim()
  const value = line.slice(i + 1).trim()
  fields.set(name, [...(fields.get(name) || []), value])
}

const errors = []
const push = (msg, fix) => errors.push({ msg, fix })

for (const required of ['Contact', 'Expires']) {
  if (!fields.has(required)) push(`Λείπει το υποχρεωτικό πεδίο «${required}» (RFC 9116).`, `Πρόσθεσέ το στο ${FILE}.`)
}

const expires = fields.get('Expires')?.[0]
if (expires) {
  if (fields.get('Expires').length > 1) push('Το «Expires» γράφεται μία μόνο φορά.', 'Κράτα την πιο μακρινή ημερομηνία.')
  const when = Date.parse(expires)
  if (Number.isNaN(when)) {
    push(`Το «Expires» δεν είναι έγκυρη ημερομηνία: ${expires}`, 'Μορφή ISO 8601, π.χ. 2027-08-01T00:00:00.000Z')
  } else {
    const days = Math.floor((when - Date.now()) / DAY)
    if (days < 0) push(`Το «Expires» έχει ΛΗΞΕΙ εδώ και ${-days} ημέρες.`, 'Ανανέωσέ το και επιβεβαίωσε ότι η πολιτική ισχύει ακόμη.')
    else if (days < MIN_DAYS) push(`Το «Expires» λήγει σε ${days} ημέρες.`, `Ανανέωσέ το πριν πέσει κάτω από τις ${MIN_DAYS}.`)
    if (days > 366) push(`Το «Expires» είναι ${days} ημέρες μπροστά.`, 'Το RFC 9116 ζητά λιγότερο από έναν χρόνο.')
  }
}

if (fields.get('Policy')?.[0] !== POLICY) push(`Το «Policy» πρέπει να δείχνει στο ${POLICY}.`, 'Εκεί ζει η σελίδα «Ποιοι είμαστε».')
if (fields.get('Canonical')?.[0] !== CANONICAL) push(`Το «Canonical» πρέπει να δείχνει στο ${CANONICAL}.`, 'Είναι η διεύθυνση του ίδιου του αρχείου.')
if ((fields.get('Preferred-Languages') || []).length > 1) push('Το «Preferred-Languages» γράφεται μία μόνο φορά (RFC 9116 §2.5.8).', 'Ένωσέ τα σε μία γραμμή με κόμμα.')

if (errors.length) {
  console.error(`\n✗ ${errors.length} πρόβλημα(τα) στο ${FILE}:\n`)
  for (const e of errors) console.error(`  ${e.msg}\n    → ${e.fix}`)
  console.error('')
  process.exit(1)
}

const left = Math.floor((Date.parse(fields.get('Expires')[0]) - Date.now()) / DAY)
console.log(`✅ security.txt: έγκυρο κατά RFC 9116, ισχύει για ${left} ημέρες ακόμη.`)
