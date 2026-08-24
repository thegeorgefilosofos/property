#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ security.txt ΛΕΕΙ ΤΗΝ ΙΔΙΑ ΔΙΕΥΘΥΝΣΗ ΜΕ ΤΗΝ ΕΦΑΡΜΟΓΗ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΕΙΝΑΙ ΤΟ ΑΡΧΕΙΟ. Δημόσιο, στο /.well-known/security.txt, και το διαβάζει
// ερευνητής ασφαλείας που μόλις βρήκε ευπάθεια. Λέει πού να τη στείλει.
//
// ΓΙΑΤΙ ΧΡΕΙΑΖΕΤΑΙ ΦΥΛΑΚΑΣ. Είναι στατικό κείμενο: δεν εισάγει τίποτα, δεν
// μεταγλωττίζεται, κανένας τύπος δεν το ελέγχει. Οταν αλλάξει η διεύθυνση
// αλληλογραφίας στο lib/legal/identity.ts, αυτό μένει πίσω σιωπηλά, και η
// αναφορά ευπάθειας φεύγει σε παλιά ή ξένη διεύθυνση. Το χειρότερο είδος
// απόκλισης: φαίνεται μόνο τη στιγμή που κάποιος προσπαθεί να μας βοηθήσει.
//
// ΤΙ ΕΛΕΓΧΕΙ. Οτι το `Contact:` του αρχείου συμφωνεί με το `securityEmail` της
// ταυτότητας, ότι κάθε άλλη διεύθυνση μέσα του είναι στον ίδιο τομέα, και ότι
// το `Expires:` υπάρχει και δεν έχει περάσει.
//
// ΓΙΑΤΙ ΚΑΙ ΤΟ `Expires`. Το RFC 9116 το κάνει ΥΠΟΧΡΕΩΤΙΚΟ, και ορίζει ότι ένα
// αρχείο με περασμένη ημερομηνία ΔΕΝ ισχύει: τα εργαλεία των ερευνητών το
// απορρίπτουν ολόκληρο, μαζί με τον ασφαλή λιμένα που υπόσχεται. Δηλαδή ένα
// πεδίο που κανείς δεν κοιτά ακυρώνει σιωπηλά ενενήντα γραμμές πολιτικής.
// Ο έλεγχος κοκκινίζει ΜΟΝΟ όταν η ημερομηνία περάσει, όχι νωρίτερα· από τις
// σαράντα πέντε ημέρες πριν τυπώνει προειδοποίηση, ώστε η ανανέωση να γίνει
// με την ησυχία της και να μη βρει κλειστό δρόμο μια άσχετη αλλαγή.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'

const FILE = 'public/.well-known/security.txt'
const IDENT = 'lib/legal/identity.ts'

const ident = readFileSync(IDENT, 'utf8')
const domain = /export const MAIL_DOMAIN = '([^']+)'/.exec(ident)?.[1]
if (!domain) {
  console.error(`✗ Δεν βρέθηκε το MAIL_DOMAIN στο ${IDENT}`)
  process.exit(1)
}
const expected = `security@${domain}`

const txt = readFileSync(FILE, 'utf8')
const contact = /^Contact:\s*mailto:(\S+)/m.exec(txt)?.[1]

const problems = []
if (!contact) problems.push('λείπει γραμμή «Contact: mailto:…»')
else if (contact !== expected)
  problems.push(`το «Contact» λέει «${contact}», η ταυτότητα λέει «${expected}»`)

// Η λήξη. Υποχρεωτικό πεδίο του RFC 9116 και το μόνο που ακυρώνει το αρχείο
// χωρίς να το αγγίξει κανείς: περνά μόνο του, με τον χρόνο.
const expires = /^Expires:\s*(\S+)/m.exec(txt)?.[1]
const at = expires ? new Date(expires) : null
const DAY = 86400000
if (!expires) problems.push('λείπει γραμμή «Expires:» — υποχρεωτική κατά RFC 9116')
else if (!at || Number.isNaN(at.getTime()))
  problems.push(`το «Expires» δεν διαβάζεται ως ημερομηνία: «${expires}»`)
else if (at.getTime() <= Date.now())
  problems.push(`το «Expires» έληξε στις ${at.toISOString().slice(0, 10)}: το αρχείο δεν ισχύει πια`)
else if (at.getTime() - Date.now() < 45 * DAY)
  console.warn(`⚠ το security.txt λήγει σε ${Math.ceil((at.getTime() - Date.now()) / DAY)} ημέρες (${at.toISOString().slice(0, 10)}). Ανανέωσε το «Expires».`)

// Καμία διεύθυνση σε ΑΛΛΟΝ τομέα: μια ξεχασμένη παλιά θα δεχόταν αναφορές που
// δεν φτάνουν πουθενά.
for (const m of txt.matchAll(/[a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.[a-z]{2,})/g))
  if (m[1] !== domain) problems.push(`διεύθυνση σε ξένο τομέα: «${m[0]}»`)

if (problems.length) {
  console.error(`✗ το ${FILE} δεν συμφωνεί με την ταυτότητα:\n`)
  for (const p of problems) console.error('  ' + p)
  console.error(`
  Η διεύθυνση αλληλογραφίας ζει στο ${IDENT} (MAIL_DOMAIN). Το στατικό αρχείο
  δεν την εισάγει, οπότε ενημερώνεται με το χέρι και ελέγχεται από εδώ. Το
  «Expires» ανανεώνεται στο ίδιο αρχείο, με ορίζοντα κάτω του έτους.
`)
  process.exit(1)
}
console.log(`✓ το security.txt δείχνει στο ${expected} και ισχύει έως ${at.toISOString().slice(0, 10)}`)
