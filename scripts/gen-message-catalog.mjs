#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΘΕ ΜΗΝΥΜΑ ΠΟΥ ΜΠΟΡΕΙ ΝΑ ΦΥΓΕΙ, ΣΕ ΜΙΑ ΣΕΛΙΔΑ
// ─────────────────────────────────────────────────────────────────────────
// Η ΕΡΩΤΗΣΗ ΠΟΥ ΑΠΑΝΤΑ. «Πώς θα έχω πρόσβαση στα μηνύματα κάθε στιγμή, για να
// βλέπω ότι είναι ρυθμισμένα, ενημερωμένα και σύγχρονα;» Μέχρι σήμερα η
// απάντηση ήταν «διάβασε 2.000 γραμμές TypeScript», που δεν είναι απάντηση.
//
// ΤΙ ΠΑΡΑΓΕΙ. Το `docs/KATALOGOS-MINYMATON.md`: κάθε μήνυμα με το πρόγραμμά του,
// το αναγνωριστικό του, το ΘΕΜΑ που θα δει ο παραλήπτης και το πού πυροδοτείται.
//
// ΓΙΑΤΙ ΠΑΡΑΓΕΤΑΙ ΚΑΙ ΔΕΝ ΓΡΑΦΕΤΑΙ. Ενα χειρόγραφο ευρετήριο γερνά την πρώτη
// φορά που κάποιος προσθέτει μήνυμα και δεν το ενημερώνει. Ακριβώς αυτό είχε
// συμβεί: το σχόλιο του emailCopy.ts έλεγε «106 emails» ενώ ήταν 116.
//
// ΤΟ ΘΕΜΑ ΒΓΑΙΝΕΙ ΜΕ ΑΝΑΓΝΩΣΗ ΚΕΙΜΕΝΟΥ, ΟΧΙ ΜΕ ΕΚΤΕΛΕΣΗ. Οι συναρτήσεις θέλουν
// πλαίσιο παραλήπτη (όνομα, πλάνο, ποσά) για να τρέξουν· εδώ θέλουμε το ΚΑΛΟΥΠΙ,
// όχι ένα παράδειγμα. Οσα θέματα είναι δυναμικά σημειώνονται ως τέτοια, με το
// κείμενό τους όπως γράφεται.
//
//     node scripts/gen-message-catalog.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { MANUAL } from './guard-email-senders.mjs'

const COPY = 'supabase/functions/_shared/emailCopy.ts'
const OUT = 'docs/KATALOGOS-MINYMATON.md'

/** Τι κάνει το κάθε πρόγραμμα, στα ελληνικά. Χωρίς αυτό ο κατάλογος είναι λίστα κωδικών. */
const PROGRAMS = {
  ONBOARDING: 'Πρώτες ημέρες: από την εγγραφή ώς το πρώτο ακίνητο και την πρώτη αναφορά',
  ENGAGEMENT: 'Τακτική επαφή: μηνιαία κατάσταση, επιτόκια, φορολογικές προθεσμίες, ενοίκια',
  UPSELL: 'Αναβάθμιση πακέτου, όταν η χρήση το δικαιολογεί',
  SEASONAL: 'Εποχικά: σεζόν βραχυχρόνιας, χειμώνας, κλείσιμο χρονιάς',
  REFERRAL: 'Πρόγραμμα πρόσκλησης',
  LIFECYCLE: 'Δοκιμή, λήξη δοκιμής, επιστροφή',
  WINBACK: 'Επανάκτηση χρήστη που σταμάτησε',
  OPERATIONS: 'Λειτουργικά: ενοίκια, λογαριασμοί, συμβόλαια, συντηρήσεις',
  SHORTTERM: 'Βραχυχρόνια μίσθωση: κρατήσεις, ΤΑΚΚ, μητρώο',
  PRODUCT: 'Τι καινούριο υπάρχει στο προϊόν',
  CONVERSION: 'Από δωρεάν σε συνδρομή',
  COMPLIANCE: 'Νομικά και συμμόρφωση',
  BILLING: 'Χρεώσεις και πληρωμές',
  RELATIONSHIP: 'Σχέση με τον χρήστη: επέτειοι, ευχαριστίες',
  VALUE: 'Απόδειξη αξίας με τα δικά του νούμερα',
  NEWS: 'Ενημερωτικό δελτίο',
  DIGESTS: 'Συνόψεις αγοράς και χαρτοφυλακίου',
}

const src = readFileSync(COPY, 'utf8')

/** Ολα τα αρχεία του αποθετηρίου, για να βρεθεί πού πυροδοτείται το καθένα. */
const files = []
const walk = d => {
  for (const e of readdirSync(d)) {
    if (e === 'node_modules' || e === '.next' || e === '.git' || e.startsWith('.perf')) continue
    const p = join(d, e)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(ts|tsx|sql|mjs|yml)$/.test(p) && p !== COPY) files.push(p)
  }
}
for (const root of ['app', 'lib', 'supabase', 'scripts', '.github']) { try { walk(root) } catch {} }
const haystack = files.map(f => ({ f, s: readFileSync(f, 'utf8') }))

/** Το σώμα μιας ομάδας, από το `export const NAME` ώς το ταιριαστό άγκιστρο. */
function groupBody(name) {
  const m = new RegExp(`export const ${name}: Record<string, CopyFn> = \\{`).exec(src)
  if (!m) return null
  let d = 0
  for (let i = src.indexOf('{', m.index); i < src.length; i++) {
    if (src[i] === '{') d++
    else if (src[i] === '}') { d--; if (!d) return src.slice(src.indexOf('{', m.index) + 1, i) }
  }
  return null
}

/** Τα μηνύματα μιας ομάδας: αναγνωριστικό και θέμα, στη σειρά που γράφτηκαν. */
function messages(body) {
  const out = []
  let d = 0
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (c === '{' || c === '(' || c === '[') d++
    else if (c === '}' || c === ')' || c === ']') d--
    else if (d === 0) {
      const m = /^\n\s*([a-z0-9_]+):/.exec(body.slice(i, i + 60))
      if (m) {
        // Το σώμα της καταχώρησης: ώς το επόμενο κλειδί πρώτου επιπέδου.
        let j = i + m[0].length, dd = 0, end = body.length
        for (; j < body.length; j++) {
          const cc = body[j]
          if (cc === '{' || cc === '(' || cc === '[') dd++
          else if (cc === '}' || cc === ')' || cc === ']') { dd--; if (dd < 0) { end = j; break } }
          else if (dd === 0 && /^\n\s*[a-z0-9_]+:/.test(body.slice(j, j + 60))) { end = j; break }
        }
        const entry = body.slice(i, end)
        const sm = /subject:\s*(`[^`]*`|'[^']*'|"[^"]*")/.exec(entry)
        let subject = sm ? sm[1].slice(1, -1) : ''
        const dynamic = !!sm && (sm[1][0] === '`' && subject.includes('${')) || /subject:\s*[a-zA-Z]/.test(entry)
        if (!sm) {
          const tern = /subject:\s*([^\n]+)/.exec(entry)
          subject = tern ? tern[1].trim().replace(/,$/, '') : '(δυναμικό)'
        }
        out.push({ id: m[1], subject, dynamic })
        i = end - 1
      }
    }
  }
  return out
}

/** Πού αναφέρεται το αναγνωριστικό έξω από το emailCopy. */
function triggers(id) {
  const hits = haystack.filter(h => new RegExp(`['"\`]${id}['"\`]`).test(h.s)).map(h => h.f)
  return [...new Set(hits)]
}

const lines = []
lines.push('# Ο κατάλογος των μηνυμάτων')
lines.push('')
lines.push('**ΠΑΡΑΓΕΤΑΙ ΑΠΟ ΤΟΝ ΚΩΔΙΚΑ. Μην τον γράψεις με το χέρι.**')
lines.push('')
lines.push('```')
lines.push('npm run katalogos')
lines.push('```')
lines.push('')
lines.push('Κάθε μήνυμα που μπορεί να φύγει από το PROPERWISE, με το θέμα που βλέπει ο')
lines.push('παραλήπτης και το αρχείο που το πυροδοτεί. Οσα θέματα αλλάζουν ανά παραλήπτη')
lines.push('γράφονται με το καλούπι τους, όπως `Το «${c.propertyName}» είναι έτοιμο`.')
lines.push('')

let total = 0
const summary = []
for (const [name, what] of Object.entries(PROGRAMS)) {
  const body = groupBody(name)
  if (!body) continue
  const msgs = messages(body)
  total += msgs.length
  summary.push([name, msgs.length, what])
}

lines.push('## Σύνοψη')
lines.push('')
lines.push('| Πρόγραμμα | Μηνύματα | Τι κάνει |')
lines.push('|---|---:|---|')
for (const [name, n, what] of summary) lines.push(`| ${name} | ${n} | ${what} |`)
lines.push(`| **ΣΥΝΟΛΟ** | **${total}** | |`)
lines.push('')

for (const [name, what] of Object.entries(PROGRAMS)) {
  const body = groupBody(name)
  if (!body) continue
  const msgs = messages(body)
  lines.push(`## ${name}`)
  lines.push('')
  lines.push(what + '.')
  lines.push('')
  lines.push('| Αναγνωριστικό | Θέμα | Πυροδοτείται από |')
  lines.push('|---|---|---|')
  for (const m of msgs) {
    const t = triggers(m.id)
    // ΤΟ «ΠΟΥΘΕΝΑ» ΘΑ ΗΤΑΝ ΨΕΜΑ ΓΙΑ ΤΑ ΔΩΔΕΚΑ ΧΕΙΡΟΚΙΝΗΤΑ. Ο φύλακας
    // email-senders τα δηλώνει ένα προς ένα με τον λόγο τους: στέλνονται από
    // άνθρωπο, γιατί το περιεχόμενό τους είναι γεγονός που δεν μαντεύεται.
    // Ο κατάλογος διαβάζει ΤΟΝ ΙΔΙΟ κατάλογο, όχι δικό του αντίγραφο.
    const where = t.length
      ? t.slice(0, 2).map(x => `\`${x}\``).join(', ') + (t.length > 2 ? ` (+${t.length - 2})` : '')
      : (MANUAL[m.id] ? `**με το χέρι** · ${MANUAL[m.id]}` : '**πουθενά**')
    lines.push(`| \`${m.id}\` | ${m.subject.replace(/\|/g, '\\|')} | ${where} |`)
  }
  lines.push('')
}

writeFileSync(OUT, lines.join('\n') + '\n')
console.log(`✓ ${OUT}: ${total} μηνύματα σε ${summary.length} προγράμματα`)
