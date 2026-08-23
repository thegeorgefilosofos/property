#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Η ΑΝΤΙΘΕΣΗ ΜΕΤΡΙΕΤΑΙ, ΔΕΝ ΔΗΛΩΝΕΤΑΙ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΠΡΟΒΛΗΜΑ, ΒΡΕΘΗΚΕ ΤΟΝ ΑΥΓΟΥΣΤΟ 2026. Το `--logo-mark-text` ήταν λευκό και
// στα δύο θέματα, με γραμμένη αιτιολογία δίπλα του: «στο σκοτεινό θέμα το
// πλακίδιο είναι ανοιχτό παστέλ, οπότε το σκούρο γράμμα έβγαινε θαμπό». Η
// αιτιολογία ήταν ανάποδη. Λευκό πάνω στο #8ab4f8 δίνει 2,11:1· σκούρο μελάνι
// δίνει 9,00:1. Θαμπό ήταν το λευκό, και το σήμα είναι το πρώτο πράγμα που
// βλέπει κάθε καινούριος επισκέπτης — η εφαρμογή ανοίγει σκοτεινή.
//
// ΓΙΑΤΙ ΔΕΝ ΤΟ ΕΠΙΑΝΕ ΤΙΠΟΤΑ: η αντίθεση ελεγχόταν με το χέρι, και το χέρι
// έγραφε το αποτέλεσμα σε σχόλιο. Ενα σχόλιο δεν ξαναϋπολογίζεται όταν αλλάξει
// το χρώμα δίπλα του, και δεν αμφισβητείται από κανέναν όταν ακούγεται λογικό.
// Το ίδιο το αρχείο έλεγε τρεις γραμμές πιο πάνω «ΠΟΤΕ δεν γράφουμε #fff πάνω
// σε γέμισμα» και αμέσως μετά έγραφε #fff πάνω σε γέμισμα.
//
// ΤΙ ΚΑΝΕΙ. Διαβάζει τα ΠΡΑΓΜΑΤΙΚΑ token του app/globals.css ανά θέμα, λύνει
// τα var(), και υπολογίζει τον λόγο αντίθεσης WCAG 2.1 για τα ζεύγη που
// δηλώνονται εδώ. Κάθε ζεύγος έχει όριο και λόγο.
//
// ΤΙ ΔΕΝ ΚΑΝΕΙ. Δεν αγγίζει τιμές `color-mix()`: δεν λύνονται χωρίς μηχανή
// χρωμάτων του περιηγητή, και ένας φύλακας που μαντεύει είναι χειρότερος από
// φύλακα που δηλώνει τι δεν κοίταξε. Οσα παραλείπονται τυπώνονται ονομαστικά.
//
// Τρέξε: node scripts/guard-contrast.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'

const CSS = new URL('../app/globals.css', import.meta.url).pathname

// ── ΤΑ ΖΕΥΓΗ ΠΟΥ ΕΛΕΓΧΟΝΤΑΙ ───────────────────────────────────────────────
// `min` κατά WCAG 2.1: 4,5 για κείμενο, 3,0 για μεγάλο κείμενο και για
// γραφικά στοιχεία (1.4.11). Το σήμα είναι γραφικό, αλλά κουβαλά γράμμα σε
// 22px — κρίνεται ως κείμενο.
const PAIRS = [
  { ink: '--text-primary',   on: '--bg-base',    min: 4.5, why: 'κύριο κείμενο στο βάθος της σελίδας' },
  { ink: '--text-primary',   on: '--bg-surface', min: 4.5, why: 'κύριο κείμενο μέσα σε κάρτα' },
  { ink: '--text-primary',   on: '--bg-elevated',min: 4.5, why: 'κύριο κείμενο σε ανυψωμένη επιφάνεια' },
  { ink: '--text-secondary', on: '--bg-base',    min: 4.5, why: 'δευτερεύον κείμενο στο βάθος' },
  { ink: '--text-secondary', on: '--bg-surface', min: 4.5, why: 'δευτερεύον κείμενο σε κάρτα' },
  { ink: '--text-tertiary',  on: '--bg-base',    min: 4.5, why: 'τριτεύον κείμενο στο βάθος' },
  { ink: '--text-tertiary',  on: '--bg-surface', min: 4.5, why: 'τριτεύον κείμενο σε κάρτα' },
  { ink: '--on-tone',        on: '--accent',     min: 4.5, why: 'κείμενο σε κουμπί δράσης' },
  { ink: '--on-tone',        on: '--positive',   min: 4.5, why: 'κείμενο σε θετικό γέμισμα' },
  { ink: '--on-tone',        on: '--negative',   min: 4.5, why: 'κείμενο σε αρνητικό γέμισμα' },
  { ink: '--on-tone',        on: '--warning',    min: 4.5, why: 'κείμενο σε γέμισμα προσοχής' },
  { ink: '--on-tone',        on: '--info',       min: 4.5, why: 'κείμενο σε ενημερωτικό γέμισμα' },
  { ink: '--logo-mark-text', on: '--accent',     min: 4.5, why: 'το «P» του σήματος, σε 22 ώς 34px' },
  { ink: '--accent',         on: '--bg-base',    min: 3.0, why: 'σύνδεσμος και εικονίδιο στο βάθος' },
  { ink: '--accent',         on: '--bg-surface', min: 3.0, why: 'σύνδεσμος και εικονίδιο σε κάρτα' },
]

// ── ΑΝΑΓΝΩΣΗ ΤΩΝ TOKEN ΑΝΑ ΘΕΜΑ ───────────────────────────────────────────
// Ο επιλογέας `:root, [data-mode="dark"]` δίνει ΚΑΙ τη βάση ΚΑΙ το σκοτεινό:
// η εφαρμογή ανοίγει σκοτεινή, και το φωτεινό είναι η εξαίρεση που γράφεται
// στο `:root[data-mode="light"]`. Τα δύο θέματα χτίζονται με αυτή τη σειρά.
// ΤΑ ΣΧΟΛΙΑ ΦΕΥΓΟΥΝ ΠΡΩΤΑ, ΚΑΙ ΑΥΤΟ ΔΕΝ ΕΙΝΑΙ ΚΑΛΛΩΠΙΣΜΟΣ. Η πρώτη εκδοχή
// τα αφαιρούσε μόνο από τον επιλογέα, και το μπλοκ του φωτεινού θέματος
// χανόταν ολόκληρο: μέσα του υπάρχει σχόλιο με άγκιστρα, που έσπαγε το
// ταίριασμα του σώματος. Ο φύλακας τύπωνε «περνούν» έχοντας μετρήσει ΜΟΝΟ το
// σκοτεινό. Γι' αυτό υπάρχει και ο έλεγχος ότι μετρήθηκαν ΚΑΙ ΤΑ ΔΥΟ θέματα.
const css = readFileSync(CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/**
 * Ολα τα μπλοκ, με τον επιλογέα τους.
 *
 * ΤΟ ΑΓΚΙΣΤΡΟ ΚΛΕΙΣΙΜΑΤΟΣ ΔΕΝ ΚΑΤΑΝΑΛΩΝΕΤΑΙ. Η πρώτη εκδοχή ξεκινούσε το
 * ταίριασμα με `(^|\})`, δηλαδή έτρωγε το `}` του προηγούμενου μπλοκ — και
 * επειδή το επόμενο ταίριασμα ζητούσε πάλι `}` από μπροστά, ο φύλακας
 * διάβαζε ΕΝΑ ΜΠΛΟΚ ΣΤΑ ΔΥΟ. Το μπλοκ του φωτεινού θέματος έπεφτε ακριβώς
 * σε παράλειψη, οπότε το «φωτεινό» μετριόταν με τα χρώματα του σκοτεινού και
 * ο φύλακας τύπωνε ✅ έχοντας ελέγξει δύο φορές το ίδιο πράγμα.
 * Ο επιλογέας δεν περιέχει ποτέ άγκιστρο, οπότε δεν χρειάζεται πρόθεμα.
 */
function blocks(text) {
  const out = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m
  while ((m = re.exec(text))) {
    const selector = m[1].trim()
    if (selector) out.push({ selector, body: m[2] })
  }
  return out
}

function declarations(body) {
  const out = new Map()
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g
  let m
  while ((m = re.exec(body))) out.set(m[1], m[2].trim())
  return out
}

// Η ΒΑΣΗ ΕΙΝΑΙ ΤΟ ΣΚΟΤΕΙΝΟ, ΚΑΙ ΤΟ ΦΩΤΕΙΝΟ ΕΙΝΑΙ Η ΕΞΑΙΡΕΣΗ.
// Ο επιλογέας `:root, [data-mode="dark"]` κάνει δύο δουλειές ταυτόχρονα:
// ορίζει το σκοτεινό ΚΑΙ γίνεται η προεπιλογή κάθε νέου επισκέπτη. Το φωτεινό
// θέμα ΔΕΝ ξαναγράφει τα πάντα — γράφει μόνο όσα αλλάζουν. Αρα το φωτεινό
// χτίζεται πάνω στην ίδια βάση, αλλιώς ο φύλακας μετρά ελλιπή παλέτα.
const all = blocks(css)
const base = new Map()
const overrides = { light: new Map(), dark: new Map() }
for (const b of all) {
  const hitsRoot = /(^|,)\s*:root\s*(,|$)/.test(b.selector)
  const dark = b.selector.includes('[data-mode="dark"]')
  const light = b.selector.includes('[data-mode="light"]')
  if (!hitsRoot && !dark && !light) continue
  for (const [k, v] of declarations(b.body)) {
    if (hitsRoot) base.set(k, v)
    if (dark) overrides.dark.set(k, v)
    if (light) overrides.light.set(k, v)
  }
}
const theme = {
  light: new Map([...base, ...overrides.light]),
  dark: new Map([...base, ...overrides.dark]),
}

/** Λύνει var(--x) όσο χρειάζεται. Επιστρέφει null για ό,τι δεν είναι hex. */
function resolve(map, name, depth = 0) {
  if (depth > 8) return null
  const raw = map.get(name)
  if (!raw) return null
  const v = raw.trim()
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(v)) return ('#' + v.slice(1).split('').map(c => c + c).join('')).toLowerCase()
  const ref = v.match(/^var\(\s*(--[\w-]+)\s*\)$/)
  if (ref) return resolve(map, ref[1], depth + 1)
  return null
}

const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
const lum = h => 0.2126 * lin(parseInt(h.slice(1, 3), 16))
  + 0.7152 * lin(parseInt(h.slice(3, 5), 16))
  + 0.0722 * lin(parseInt(h.slice(5, 7), 16))
const ratio = (a, b) => {
  const x = lum(a), y = lum(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
const gr = n => n.toFixed(2).replace('.', ',')

const fails = []
const skipped = []
let checked = 0

for (const mode of ['light', 'dark']) {
  const map = theme[mode]
  for (const p of PAIRS) {
    const ink = resolve(map, p.ink)
    const on = resolve(map, p.on)
    if (!ink || !on) {
      skipped.push(`${mode} · ${p.ink} πάνω σε ${p.on} — ${!ink ? p.ink : p.on} δεν λύνεται σε hex`)
      continue
    }
    checked++
    const r = ratio(ink, on)
    if (r < p.min) fails.push({ mode, ...p, ink2: ink, on2: on, r })
  }
}

// ── ΟΤΙ Ο ΦΥΛΑΚΑΣ ΔΙΑΒΑΣΕ ΔΥΟ ΔΙΑΦΟΡΕΤΙΚΑ ΘΕΜΑΤΑ ────────────────────────────
// Δεν αρκεί «βρήκα token». Αν το ένα θέμα δεν διαβαστεί, ο φύλακας μετρά δύο
// φορές το άλλο και τυπώνει ✅ χωρίς να έχει ελέγξει τίποτα. Το `--accent`
// είναι ΕΞ ΟΡΙΣΜΟΥ διαφορετικό στα δύο θέματα: αν βγει ίδιο, η ανάγνωση είναι
// χαλασμένη, όχι η παλέτα.
for (const mode of ['light', 'dark']) {
  if (theme[mode].size < 20) {
    console.error(`✗ Το ${mode === 'light' ? 'φωτεινό' : 'σκοτεινό'} θέμα διάβασε μόλις ${theme[mode].size} token.`)
    console.error('  Ο φύλακας δεν βλέπει το μπλοκ του, άρα δεν ελέγχει τίποτα εκεί.')
    process.exit(1)
  }
}
if (resolve(theme.light, '--accent') === resolve(theme.dark, '--accent')) {
  console.error('✗ Τα δύο θέματα δίνουν το ίδιο --accent. Ο φύλακας διαβάζει το ένα δύο φορές.')
  console.error('  Δες τη συνάρτηση blocks(): κάποιο μπλοκ δεν φτάνει ώς εδώ.')
  process.exit(1)
}
if (!checked) {
  console.error('✗ Κανένα ζεύγος δεν μετρήθηκε. Ο φύλακας δεν διαβάζει τα token — δες τον επιλογέα.')
  process.exit(1)
}

for (const s of skipped) console.log(`  ⋯ ${s}`)

if (fails.length) {
  console.error(`✗ ${fails.length} ${fails.length === 1 ? 'ζεύγος' : 'ζεύγη'} κάτω από το όριο αντίθεσης:\n`)
  for (const f of fails) {
    console.error(`  ${f.mode} · ${f.why}`)
    console.error(`    ${f.ink} (${f.ink2}) πάνω σε ${f.on} (${f.on2})`)
    console.error(`    ${gr(f.r)}:1, όριο ${gr(f.min)}:1\n`)
  }
  console.error('  Το χρώμα αλλάζει στο app/globals.css. Αν το ζεύγος δεν συνυπάρχει')
  console.error('  ποτέ στην οθόνη, βγάλ\' το από το PAIRS εδώ, με γραμμένο τον λόγο.')
  process.exit(1)
}

console.log(`✅ Αντίθεση: ${checked} ζεύγη σε δύο θέματα περνούν τα όριά τους${skipped.length ? `, ${skipped.length} εκτός μέτρησης` : ''}.`)
