#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΠΛΑΙΣΙΟ ΕΠΙΛΟΓΗΣ ΤΟ ΖΩΓΡΑΦΙΖΕΙ ΕΝΑ ΑΡΧΕΙΟ
// ─────────────────────────────────────────────────────────────────────────
// ΗΤΑΝ ΓΡΑΜΜΕΝΟ ΠΕΝΤΕ ΦΟΡΕΣ, ΜΕ ΠΕΝΤΕ ΣΧΗΜΑΤΑ (Αύγουστος 2026):
//
//   PortfolioTab.tsx        18px, ακτίνα 6, περίγραμμα 2px, διάφανο
//   TabDocuments.tsx        18px, ακτίνα 6, περίγραμμα 1,5px, ανασηκωμένο
//   TabContacts.tsx         19px, ακτίνα 6, περίγραμμα 1,5px, δαχτυλίδι
//   inventory/Bits.tsx      18px, ακτίνα 3, περίγραμμα 2px σε χρώμα κειμένου
//   AccountantDossier.tsx   18px, ακτίνα 6, περίγραμμα 1,5px, επιφάνεια
//
// ΚΑΙ Η ΔΙΑΦΟΡΑ ΔΕΝ ΗΤΑΝ ΜΟΝΟ ΑΙΣΘΗΤΙΚΗ. Δύο ήταν <span role="checkbox">: το
// δάπεδο αφής των 44 πιάνει μόνο <button>, <select> και <input>, οπότε εκείνα
// έμεναν στόχος 18 εικονοστοιχείων. Ενα τρίτο ήταν <button> ΧΩΡΙΣ την κλάση
// `po-box`, δηλαδή έπεφτε μέσα στο δάπεδο και τεντωνόταν σε 18 × 44.
//
// ΤΙ ΖΗΤΑ Ο ΚΑΝΟΝΑΣ. Κανένα αρχείο εκτός από τον ιδιοκτήτη δεν ορίζει δικό του
// `SelectBox`· ο ιδιοκτήτης φοράει την κλάση που δίνει την περιοχή αφής.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import { projectFiles } from './lib/git-files.mjs'

const OWNER = 'components/Theme.tsx'
/** Η κλάση που κρατά το σχήμα στα 18 και την περιοχή αφής στα 44. */
const TAP_CLASS = 'po-box'

/** Ορισμός, όχι χρήση: `function SelectBox(` ή `const SelectBox = (`. */
const DEFINES = /(?:function\s+SelectBox\s*[({]|const\s+SelectBox\s*(?::[^=]+)?=\s*(?:\(|function))/

const strays = []
for (const file of projectFiles()) {
  if (!/\.tsx?$/.test(file) || file === OWNER) continue
  let src
  try { src = readFileSync(file, 'utf8') } catch { continue }
  if (DEFINES.test(src)) strays.push(file)
}

const owner = readFileSync(OWNER, 'utf8')
const ownerHas = DEFINES.test(owner)
// Το κοινό πλαίσιο ΟΦΕΙΛΕΙ να φοράει την κλάση της περιοχής αφής. Χωρίς αυτήν,
// ο κανόνας θα εγγυόταν ομοιομορφία σε κάτι που δεν πιάνεται με το δάχτυλο.
const box = owner.slice(owner.search(DEFINES))
const ownerTaps = box.slice(0, 1200).includes(`className="${TAP_CLASS}"`)

const bad = strays.length || !ownerHas || !ownerTaps
if (bad) {
  console.error('✗ το πλαίσιο επιλογής δεν είναι ένα:\n')
  for (const f of strays) console.error(`  ${f}  ορίζει δικό του SelectBox`)
  if (!ownerHas) console.error(`  ${OWNER}  δεν ορίζει καθόλου SelectBox`)
  else if (!ownerTaps) console.error(`  ${OWNER}  το SelectBox δεν φοράει className="${TAP_CLASS}"`)
  console.error(`
  Το πλαίσιο επιλογής ζει στο ${OWNER}:

    <SelectBox checked={…} indeterminate={…} onChange={…} label="Επιλογή …" />

  Η κλάση ${TAP_CLASS} κρατά το σχήμα στα 18 × 18 και απλώνει την περιοχή αφής
  στα 44 × 44 με αόρατο ψευδοστοιχείο (app/globals.css). Ενα χειρόγραφο
  αντίγραφο είναι είτε αστόχευτο με το δάχτυλο είτε τεντωμένο σε 18 × 44.
`)
  process.exit(1)
}
console.log('✓ ένα πλαίσιο επιλογής, στο ' + OWNER + ', με περιοχή αφής 44')
