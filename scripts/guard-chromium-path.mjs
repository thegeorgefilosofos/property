#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΝΕΝΑ ΣΕΝΑΡΙΟ ΔΕΝ ΜΑΝΤΕΥΕΙ ΠΟΥ ΕΙΝΑΙ Ο CHROMIUM
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΕΓΙΝΕ. Δεκαεπτά σενάρια έγραφαν καρφωτά τη διαδρομή του Chromium μέσα στο
// container της ανάπτυξης. Ο δρομέας του CI δεν την έχει, οπότε το πρώτο βήμα
// περιηγητή έσκαγε — και επειδή το job σταματά στο πρώτο σφάλμα, ΟΛΑ τα
// επόμενα βήματα δεν εκτελέστηκαν ποτέ. Το CI ήταν κόκκινο σε κάθε εκτέλεση
// και τα μισά «blocking» βήματα ήταν διακοσμητικά.
//
// ΔΥΟ ΚΑΝΟΝΕΣ, ΚΑΙ ΟΙ ΔΥΟ ΑΠΟ ΤΟ ΙΔΙΟ ΜΑΘΗΜΑ:
//
//   1. Η διαδρομή ρωτιέται (`scripts/lib/chrome.mjs`), δεν γράφεται. Μόνο ο
//      ίδιος ο εντοπιστής επιτρέπεται να ξέρει διαδρομές.
//   2. Η έκδοση που εγκαθιστά το CI δένεται με το playwright-core του
//      package.json. Αν αποκλίνουν, ο δρομέας κατεβάζει build που το
//      playwright-core δεν ψάχνει, και είμαστε πάλι στο ίδιο σημείο.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { projectFiles } from './lib/git-files.mjs';

const RESOLVER = 'scripts/lib/chrome.mjs';
const CI = '.github/workflows/ci.yml';
const problems = [];

// ── 1. Καμία καρφωτή διαδρομή περιηγητή έξω από τον εντοπιστή ──
// Ο ίδιος ο εντοπιστής, και ο ίδιος ο φύλακας, ΓΡΑΦΟΥΝ διαδρομές: ο πρώτος
// γιατί είναι η δουλειά του, ο δεύτερος γιατί τις ψάχνει.
const SELF = 'scripts/guard-chromium-path.mjs';
const scripts = projectFiles("'scripts/**'")
  .filter(f => /\.(mjs|ts)$/.test(f) && f !== RESOLVER && f !== SELF);
const PATH_RE = /['"`][^'"`\n]*(pw-browsers|chrome-linux|Google Chrome\.app|chromium-\d+)[^'"`\n]*['"`]/;
for (const f of scripts) {
  let src; try { src = readFileSync(f, 'utf8'); } catch { continue; }
  const m = PATH_RE.exec(src);
  if (m) problems.push(`${f} γράφει διαδρομή περιηγητή: ${m[0].slice(0, 66)}`);
}

// ── 2. Η έκδοση του CI ταιριάζει με το playwright-core ──
let want = '';
try { want = JSON.parse(readFileSync('node_modules/playwright-core/package.json', 'utf8')).version; }
catch { /* χωρίς εγκατάσταση: ο έλεγχος έκδοσης παραλείπεται */ }
if (want) {
  const ci = readFileSync(CI, 'utf8');
  const pin = /playwright@([0-9][^\s]*) install/.exec(ci)?.[1];
  if (!pin) problems.push(`το ${CI} δεν εγκαθιστά Chromium· οι σουίτες περιηγητή θα σκάσουν στον δρομέα`);
  else if (pin !== want) problems.push(`το ${CI} εγκαθιστά playwright@${pin} ενώ το playwright-core είναι ${want}`);
}

if (problems.length) {
  console.error(`✗ ${problems.length} ${problems.length === 1 ? 'πρόβλημα' : 'προβλήματα'} με τον εντοπισμό του Chromium:\n`);
  for (const p of problems) console.error(`  · ${p}`);
  console.error(`
  Η διαδρομή έρχεται από το ${RESOLVER}:
      import { chromePath } from './lib/chrome.mjs'
      chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] })
`);
  process.exit(1);
}
console.log(`✓ ${scripts.length} σενάρια ρωτούν τον εντοπιστή, και το CI εγκαθιστά playwright@${want || '—'}`);
