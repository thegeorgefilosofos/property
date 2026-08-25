#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΝΕΝΑ ΕΛΛΗΝΙΚΟ ΚΕΦΑΛΑΙΟ ΜΕ ΤΟΝΟ, ΕΚΕΙ ΠΟΥ ΔΕΝ ΤΟ ΔΙΟΡΘΩΝΕΙ Ο ΠΕΡΙΗΓΗΤΗΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΜΕΤΡΗΘΗΚΕ ΠΡΙΝ ΓΡΑΦΤΕΙ ΑΥΤΟ. Σε πραγματικό Chromium, με `lang="el"` στο
// <html> (που το έχει η εφαρμογή), το `text-transform: uppercase` αφαιρεί ΜΟΝΟ
// ΤΟΥ τον τόνο και κρατά τα διαλυτικά:
//
//     lang="el"  «Χαρτοφυλάκιό μου» → ΧΑΡΤΟΦΥΛΑΚΙΟ ΜΟΥ   «αϋπνία» → ΑΫΠΝΙΑ
//     lang="en"  «Χαρτοφυλάκιό μου» → ΧΑΡΤΟΦΥΛΆΚΙΌ ΜΟΥ
//
// Δηλαδή οι πενήντα εφτά οθόνες με `textTransform: 'uppercase'` είναι ΣΩΣΤΕΣ,
// και μια «διόρθωση» εκεί θα ήταν πενήντα εφτά αρχεία αλλαγμένα για το τίποτα.
//
// ΤΟ ΠΡΑΓΜΑΤΙΚΟ ΣΦΑΛΜΑ ΕΙΝΑΙ ΟΠΟΥ ΔΕΝ ΤΡΕΧΕΙ CSS. Στο PDF τα κεφαλαία τα
// φτιάχνει η JavaScript και το `String.prototype.toUpperCase()` ΚΡΑΤΑΕΙ τον
// τόνο — κάθε εκτυπωμένη αναφορά έγραφε «ΣΤΟΙΧΕΊΑ ΑΚΙΝΉΤΟΥ». Το ίδιο ισχύει
// για ό,τι φτιάχνεται εκτός περιηγητή: Excel, email, εκτυπώσιμα.
//
// Ο φύλακας ελέγχει ακριβώς αυτά τα δύο και τίποτα άλλο:
//
//   1. Καμία συμβολοσειρά γραμμένη ΟΛΟΚΛΗΡΗ με ελληνικά κεφαλαία δεν κρατά
//      τόνο — αυτό δεν το σώζει κανένας περιηγητής, γιατί είναι ήδη κεφαλαία.
//   2. Καμία `.toUpperCase()` στις διαδρομές που παράγουν αρχεία. Εκεί περνάς
//      από `grUpper()` (lib/core/format.ts).
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { projectFiles } from './lib/git-files.mjs'
import { execSync } from 'node:child_process';

const files = projectFiles("'app/**/*.tsx' 'app/**/*.ts' 'components/**/*.tsx' 'components/**/*.ts' 'lib/**/*.ts'");

// Κεφαλαία ελληνικά με τόνο. Τα διαλυτικά (Ϊ Ϋ) ΔΕΝ είναι τόνος.
const ACCENTED = /[ΆΈΉΊΌΎΏ]/;
// Λέξη ολόκληρη σε ελληνικά κεφαλαία, μήκους ≥ 2.
const ALL_CAPS_WORD = /(?<![\p{L}])[Α-ΩΆΈΉΊΌΎΏΪΫ]{2,}(?![\p{Ll}])/gu;

/** Οι διαδρομές που παράγουν ΑΡΧΕΙΟ, όχι DOM: εκεί δεν υπάρχει CSS να σώσει. */
const NO_CSS = [/^lib\/pdf\//, /^lib\/print\//, /^lib\/dataExport\.ts$/,
                /Export\.ts$/, /[Xx]lsx\.ts$/, /^lib\/documents\//];

/** Τα σχόλια γράφονται σε κεφαλαία επίτηδες ως τίτλοι· δεν τα βλέπει χρήστης. */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const tonos = [];
const rawUpper = [];

for (const file of files) {
  if (/\.test\.tsx?$/.test(file)) continue;
  const code = stripComments(readFileSync(file, 'utf8'));

  code.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(ALL_CAPS_WORD)) {
      if (ACCENTED.test(m[0])) tonos.push(`${file}:${i + 1}  «${m[0]}»`);
    }
    // Οι μετατροπές βάσης (`toString(36).toUpperCase()`) φτιάχνουν κωδικούς
    // από ψηφία και γράμματα ASCII: δεν έχουν ελληνικό να χάσει τόνο.
    if (NO_CSS.some(re => re.test(file))
        && /\.toUpperCase\(\)/.test(line)
        && !/toString\(\s*\d+\s*\)\s*\.toUpperCase\(\)/.test(line)) {
      rawUpper.push(`${file}:${i + 1}  ${line.trim().slice(0, 90)}`);
    }
  });
}

const red = (s) => `\x1b[31m${s}\x1b[0m`;
let bad = false;

if (tonos.length) {
  bad = true;
  console.log(red(`\n✗ ${tonos.length} λέξεις σε ελληνικά κεφαλαία κρατούν τόνο:\n`));
  for (const t of tonos.slice(0, 30)) console.log('  ' + t);
  if (tonos.length > 30) console.log(`  … και άλλες ${tonos.length - 30}`);
  console.log('\n  Στα κεφαλαία δεν μπαίνει τόνος. Γράψε τη λέξη πεζή και άσε τα');
  console.log('  κεφαλαία στο CSS (ή στο grUpper), ή σβήσε τον τόνο.');
}

if (rawUpper.length) {
  bad = true;
  console.log(red(`\n✗ ${rawUpper.length} toUpperCase() σε διαδρομή που παράγει αρχείο:\n`));
  for (const t of rawUpper) console.log('  ' + t);
  console.log('\n  Εκεί δεν τρέχει CSS και το toUpperCase() της JavaScript ΚΡΑΤΑΕΙ τον');
  console.log('  τόνο. Χρησιμοποίησε το grUpper() από το lib/core/format.ts.');
}

if (bad) process.exit(1);
console.log(`✓ κανένα ελληνικό κεφαλαίο με τόνο σε ${files.length} αρχεία και καμία ωμή toUpperCase() σε PDF/Excel`);
