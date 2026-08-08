#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΘΕ ΕΞΩΤΕΡΙΚΟ FETCH ΔΗΛΩΜΕΝΟ ΣΤΗΝ CSP — ΑΛΛΙΩΣ ΣΠΑΕΙ ΜΟΝΟ ΣΤΗΝ ΠΑΡΑΓΩΓΗ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΓΕΝΝΗΣΕ ΤΟΝ ΦΥΛΑΚΑ — ΔΥΟ ΦΟΡΕΣ ΤΗΝ ΙΔΙΑ ΜΕΡΑ:
//
//   1. Ο έλεγχος διαρρευσάντων κωδικών καλεί το `api.pwnedpasswords.com`.
//   2. Η αναφορά σφαλμάτων στέλνει στο `*.ingest.sentry.io`.
//
// Καμία από τις δύο δεν ήταν στο `connect-src` του `proxy.ts`. Και οι δύο
// «αποτυγχάνουν ήσυχα» εκ σχεδιασμού — ο έλεγχος κωδικού για να μην κλειδώσει
// έξω πελάτη, ο reporter επειδή «δεν επιτρέπεται να σπάσει τον καλούντα».
//
// ΤΟ ΣΥΝΔΥΑΣΜΕΝΟ ΑΠΟΤΕΛΕΣΜΑ ΕΙΝΑΙ ΤΟ ΧΕΙΡΟΤΕΡΟ ΕΙΔΟΣ ΣΦΑΛΜΑΤΟΣ:
//
//   • Η CSP μπαίνει ΜΟΝΟ στην παραγωγή (`isProd` στο proxy.ts).
//   • Τοπικά δουλεύουν και οι δύο τέλεια. Σε κάθε δοκιμή, πράσινο.
//   • Στην παραγωγή ο περιηγητής τις μπλοκάρει.
//   • Και οι δύο καταπίνουν το σφάλμα, οπότε δεν το λέει κανείς.
//
// Δηλαδή: η προστασία κωδικών δεν θα προστάτευε ποτέ κανέναν, και η αναφορά
// σφαλμάτων δεν θα ανέφερε ποτέ ούτε ένα σφάλμα — ακριβώς εκεί που τη χρειάζεσαι.
// Και τα δύο θα έδειχναν ρυθμισμένα.
//
// ΤΙ ΕΛΕΓΧΕΤΑΙ, ΚΑΙ ΓΙΑΤΙ ΟΧΙ ΜΕ REGEX ΠΑΝΩ ΣΤΟ `fetch(`. Η πρώτη εκδοχή του
// φύλακα έψαχνε κυριολεκτικό URL μέσα στην κλήση και ΔΕΝ έπιασε καμία από τις
// δύο πραγματικές περιπτώσεις: και οι δύο γράφουν `fetch(ENDPOINT + prefix)` ή
// συναρμολογούν τη διεύθυνση από σταθερά. Ένας φύλακας που περνά ενώ το σφάλμα
// υπάρχει είναι χειρότερος από κανέναν — πιστοποιεί το λάθος.
//
// Ελέγχονται τώρα ΟΛΕΣ οι κυριολεξίες `https://host` σε αρχείο που καλεί fetch,
// μέσω του αναλυτή του TypeScript ώστε να μη μετρούν σχόλια. Εξαιρούνται όσες
// είναι τιμή σε `href`/`src`/`action` (σύνδεσμος ή εικόνα, όχι κλήση) και τα
// route handlers (`app/api/`) και οι edge functions, που τρέχουν στον
// διακομιστή όπου δεν υπάρχει CSP.
//
// ΤΙ ΔΕΝ ΜΠΟΡΕΙ ΝΑ ΠΙΑΣΕΙ, ΓΡΑΜΜΕΝΟ ΡΗΤΑ. Διεύθυνση που προκύπτει στον χρόνο
// εκτέλεσης δεν υπάρχει στον πηγαίο κώδικα και δεν φαίνεται από εδώ. Ακριβώς
// αυτό ισχύει για τη δεύτερη από τις δύο περιπτώσεις: το
// `lib/observability/report.ts` χτίζει το endpoint από το DSN του Sentry, που
// είναι μεταβλητή περιβάλλοντος — ο φύλακας το προσπερνά και η άδεια στην CSP
// μπήκε με το χέρι.
//
// Ένας φύλακας που υπονοεί ότι καλύπτει περισσότερα από όσα καλύπτει κάνει
// ΑΚΡΙΒΩΣ το σφάλμα που κυνηγά: δίνει την εντύπωση ελέγχου εκεί που δεν υπάρχει.
// Κανόνας: κάθε νέα διεύθυνση από μεταβλητή περιβάλλοντος μπαίνει στην CSP τη
// στιγμή που γράφεται ο κώδικας που τη διαβάζει, με σχόλιο για το γιατί.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { findSources } from './lib/find-tests.mjs'

const PROXY = 'proxy.ts'

// Διαδρομές που ΔΕΝ εκτελούνται στον περιηγητή.
const SERVER_ONLY = [/^app\/api\//, /^supabase\/functions\//, /^scripts\//]

/** Ιδιότητες JSX όπου μια διεύθυνση είναι σύνδεσμος, όχι κλήση. */
const LINK_ATTR = new Set(['href', 'src', 'action', 'poster', 'cite'])

const csp = readFileSync(PROXY, 'utf8')
const connectSrc = (csp.match(/"connect-src([^"]*)"/) || [, ''])[1]

/** Ταιριάζει ο host με κάποια εγγραφή του connect-src (με wildcard); */
function allowed(host) {
  return connectSrc.split(/\s+/).filter(Boolean).some(entry => {
    const e = entry.replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (!e || e.startsWith("'")) return false
    if (e === host) return true
    if (e.startsWith('*.')) {
      const suffix = e.slice(1)                 // «.ingest.sentry.io»
      return host.endsWith(suffix) || host === e
    }
    return false
  })
}

const problems = []
for (const f of findSources()) {
  if (SERVER_ONLY.some(re => re.test(f))) continue
  if (f.endsWith('.test.ts')) continue
  const src = readFileSync(f, 'utf8')
  if (!/\bfetch\s*\(/.test(src)) continue          // δεν καλεί δίκτυο· δεν αφορά

  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

  // ΤΟ ΚΛΕΙΔΙ: μετράει μόνο ό,τι φτάνει σε fetch. Ένα «https://www.aade.gr» που
  // ανοίγει σε καρτέλα με window.open ΔΕΝ περνά από connect-src — η πρώτη
  // εκδοχή το κατήγγειλε και θα οδηγούσε σε άσκοπη χαλάρωση της CSP.
  const urlNodes = []                      // κυριολεξίες κατευθείαν μέσα σε fetch
  const fetchIdents = new Set()            // ονόματα που εμφανίζονται στο όρισμα
  const constUrls = new Map()              // όνομα → κόμβος με https διεύθυνση

  const collect = node => {
    if (ts.isCallExpression(node) &&
        (node.expression.getText(sf) === 'fetch' || node.expression.getText(sf).endsWith('.fetch')) &&
        node.arguments.length) {
      const arg = node.arguments[0]
      const walkArg = n => {
        if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n)) &&
            n.text.startsWith('https://')) urlNodes.push(n)
        if (ts.isIdentifier(n)) fetchIdents.add(n.text)
        ts.forEachChild(n, walkArg)
      }
      walkArg(arg)
    }
    // const NAME = 'https://…'
    if (ts.isVariableDeclaration(node) && node.name && ts.isIdentifier(node.name) && node.initializer) {
      const init = node.initializer
      if ((ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) &&
          init.text.startsWith('https://')) constUrls.set(node.name.text, init)
    }
    ts.forEachChild(node, collect)
  }
  collect(sf)

  for (const [name, node] of constUrls) if (fetchIdents.has(name)) urlNodes.push(node)

  for (const node of urlNodes) {
    const parentAttr = node.parent && ts.isJsxAttribute(node.parent)
      ? String(node.parent.name?.getText?.(sf) ?? '') : ''
    if (LINK_ATTR.has(parentAttr)) continue
    const host = node.text.slice('https://'.length).split('/')[0]
    if (!host || allowed(host) || problems.some(x => x.host === host)) continue
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
    problems.push({ file: f, line: line + 1, host })
  }
}

if (problems.length) {
  console.error(`✗ ${problems.length} ${problems.length === 1 ? 'διεύθυνση καλείται' : 'διευθύνσεις καλούνται'} από τον περιηγητή χωρίς άδεια στην CSP.\n`)
  console.error('  Η CSP μπαίνει ΜΟΝΟ στην παραγωγή: τοπικά όλα δουλεύουν, εκεί μπλοκάρονται.')
  console.error('  Αν η κλήση «αποτυγχάνει ήσυχα», το χαρακτηριστικό δεν δουλεύει ΠΟΤΕ και')
  console.error('  δεν το λέει κανείς — ενώ φαίνεται ρυθμισμένο.\n')
  for (const p of problems) console.error(`  ${p.file}:${p.line}\n     ${p.host}`)
  console.error(`\n  ΔΙΟΡΘΩΣΗ: πρόσθεσε τον host στο "connect-src" του ${PROXY}, με σχόλιο για το γιατί.`)
  console.error('  Αν ο κώδικας τρέχει ΜΟΝΟ στον διακομιστή, μετακίνησέ τον σε app/api/.')
  process.exit(1)
}
console.log('✅ CSP: κάθε εξωτερική κλήση του περιηγητή είναι δηλωμένη στο connect-src.')
