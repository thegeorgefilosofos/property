// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΝΕΝΑ ΑΡΧΕΙΟ ΔΕΝ ΑΝΤΙΚΑΘΙΣΤΑ ΤΟΝ ΚΑΤΑΣΚΕΥΑΣΤΗ URL
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ, ΜΕΤΡΗΜΕΝΟ ΣΤΟΝ ΔΡΟΜΕΑ. Δύο σουίτες εξαγωγής έγραφαν
//
//     globalThis.URL = { createObjectURL, revokeObjectURL }
//
// για να πιάσουν το κατέβασμα. Ο κώδικας του κατεβάσματος δεν καλεί «new URL»,
// οπότε τοπικά όλα ήταν πράσινα. Ο μεταγλωττιστής tsx όμως λύνει ΚΑΘΕ δυναμική
// εισαγωγή με «new URL», και από τον Node 22.23 τα άγκιστρά του τρέχουν στο ίδιο
// πεδίο με τη δοκιμή. Το CI έσκαγε με
//
//     TypeError: URL is not a constructor
//
// σε σουίτα που περνούσε τοπικά. Ιδιος κώδικας, δύο εκδόσεις Node, μία πράσινη.
//
// Ο ΚΑΝΟΝΑΣ. Οι μέθοδοι μπαίνουν ΠΑΝΩ στον αληθινό κατασκευαστή, δεν τον
// αντικαθιστούν. Το lib/core/downloadCapture.testkit.ts το κάνει σε ένα σημείο.
//
// ΚΑΙ ΤΟ «delete». Το «delete globalThis.URL» δεν επαναφέρει τίποτα: σβήνει την
// ιδιότητα και αφήνει το URL ανύπαρκτο για ό,τι τρέξει μετά.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { projectFiles } from './lib/git-files.mjs'

// Οι καθολικές τιμές που ο φορτωτής των μονάδων χρειάζεται ζωντανές.
const PROTECTED = new Set(['URL'])

const files = projectFiles("'app/**' 'components/**' 'lib/**' 'supabase/**' 'scripts/**'")
  .filter(f => /\.(tsx?|mjs)$/.test(f))

const hits = []
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  if (!/\bURL\b/.test(src)) continue
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true,
    /\.tsx$/.test(f) ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const line = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1

  // Το όνομα της ιδιότητας, είτε γράφτηκε «a.URL» είτε «a['URL']».
  const propName = (n) => {
    if (ts.isPropertyAccessExpression(n)) return n.name.getText(sf)
    if (ts.isElementAccessExpression(n) && ts.isStringLiteralLike(n.argumentExpression))
      return n.argumentExpression.text
    return ''
  }

  const walk = (n) => {
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && PROTECTED.has(propName(n.left)))
      hits.push({ f, line: line(n), what: 'ανάθεση' })
    if (ts.isDeleteExpression(n) && PROTECTED.has(propName(n.expression)))
      hits.push({ f, line: line(n), what: 'delete' })
    ts.forEachChild(n, walk)
  }
  walk(sf)
}

if (hits.length) {
  console.error(`\n✗ ${hits.length} σημεία αντικαθιστούν καθολική τιμή που χρειάζεται ο φορτωτής:\n`)
  for (const h of hits) console.error(`   ${h.f}:${h.line}  ${h.what} σε URL`)
  console.error('\n   Οι μέθοδοι μπαίνουν ΠΑΝΩ στον αληθινό κατασκευαστή.')
  console.error('   Χρησιμοποίησε το stubObjectUrl από το lib/core/downloadCapture.testkit.ts.\n')
  process.exit(1)
}
console.log(`✓ ο κατασκευαστής URL μένει ακέραιος σε ${files.length} αρχεία`)
