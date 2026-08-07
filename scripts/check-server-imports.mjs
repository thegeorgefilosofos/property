#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Έλεγχος: κανένα Server Component δεν εισάγει από module `'use client'`.
//
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ — ΜΙΑ ΠΡΑΓΜΑΤΙΚΗ ΔΙΑΚΟΠΗ ΠΑΡΑΓΩΓΗΣ:
// Η αρχική σελίδα, το «Ποιοι είμαστε», το Απόρρητο, οι Όροι και η σελίδα
// «χωρίς σύνδεση» έγραφαν `import { T } from '@/components/Theme'`. Το Theme
// είναι `'use client'`. Όταν Server Component εισάγει από module πελάτη, ο
// Next ΔΕΝ δίνει την πραγματική τιμή αλλά αναφορά πελάτη: το `T` έφτανε ως
// `undefined` και το `T.font.sans` έριχνε στο SSR
//     TypeError: Cannot read properties of undefined (reading 'sans')
// Όλο το δημόσιο μέρος του site έδειχνε «Κάτι πήγε στραβά».
//
// ΓΙΑΤΙ ΔΕΝ ΤΟ ΕΠΙΑΣΕ ΤΙΠΟΤΑ: το `npm run build` περνά καθαρά — το σφάλμα
// συμβαίνει στην απόδοση, όχι στη μεταγλώττιση. Ο TypeScript επίσης δεν το
// βλέπει: ο τύπος είναι σωστός, η τιμή στον χρόνο εκτέλεσης δεν είναι.
// Άρα χρειάζεται ΑΥΤΟΣ ο έλεγχος, στατικά, πριν το merge.
//
// ΤΙ ΕΛΕΓΧΕΙ: για κάθε αρχείο κάτω από app/ που ΔΕΝ έχει 'use client', κάθε
// τοπική εισαγωγή που καταλήγει σε module με 'use client' και ΔΕΝ φέρνει
// component (δηλαδή φέρνει τιμές — πεζό αρχικό ή γνωστό token) είναι σφάλμα.
//
// ΓΙΑΤΙ ΕΠΙΤΡΕΠΟΝΤΑΙ ΤΑ COMPONENTS: ένα Server Component ΜΠΟΡΕΙ να αποδώσει
// component πελάτη — αυτός είναι ο κανονικός τρόπος. Απαγορευμένο είναι μόνο
// να διαβάσει ΤΙΜΗ από module πελάτη.
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const ROOT = process.cwd();
const EXT = ['.tsx', '.ts', '.jsx', '.js'];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXT.some(e => name.endsWith(e))) out.push(full);
  }
  return out;
}

const isClientModule = (file) => {
  const head = readFileSync(file, 'utf8').slice(0, 400);
  return /^\s*['"]use client['"]/m.test(head);
};

// Ανάλυση σχετικής ή alias διαδρομής σε πραγματικό αρχείο.
function resolveImport(spec, fromFile) {
  let base;
  if (spec.startsWith('@/')) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null; // πακέτο npm
  for (const cand of [base, ...EXT.map(e => base + e), ...EXT.map(e => join(base, 'index' + e))]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

// Ένα όνομα θεωρείται component αν αρχίζει με κεφαλαίο ΚΑΙ δεν είναι γνωστό
// token. Τα δύο tokens που ξεκινούν με κεφαλαίο (`T`, `TT`) είναι ακριβώς αυτά
// που προκάλεσαν τη διακοπή, οπότε ονομάζονται ρητά.
const VALUE_TOKENS = new Set(['T', 'TT', 'PRINT_FONT_STACK', 'PRINT_MONO_STACK']);
const isValueImport = (name) => {
  const n = name.replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
  if (!n) return false;
  if (name.trim().startsWith('type ')) return false;   // μόνο τύπος: σβήνεται στη μεταγλώττιση
  return VALUE_TOKENS.has(n) || /^[a-z_]/.test(n);
};

const IMPORT_RE = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;

const problems = [];
for (const file of walk(join(ROOT, 'app'))) {
  // Ένα τεστ ΔΕΝ είναι Server Component. Τρέχει στο Node μέσω tsx, όπου το
  // 'use client' δεν σημαίνει τίποτα και η εισαγωγή δίνει την πραγματική τιμή —
  // γι' αυτό ακριβώς μπορεί ένα τεστ να ελέγξει συνάρτηση από module πελάτη.
  // Χωρίς αυτή την εξαίρεση ο φύλακας κοκκίνιζε για το e2Export.test.ts, που
  // εισάγει το `runE2Export`: αληθινό τεστ, ανύπαρκτο πρόβλημα.
  if (/\.test\.[jt]sx?$/.test(file)) continue;
  if (isClientModule(file)) continue;
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(IMPORT_RE)) {
    if (m[0].trim().startsWith('import type')) continue;
    const target = resolveImport(m[2], file);
    if (!target || !isClientModule(target)) continue;
    const values = m[1].split(',').map(s => s.trim()).filter(isValueImport);
    if (values.length) {
      problems.push(`${file.replace(ROOT + '/', '')}  →  ${m[2]}   [${values.join(', ')}]`);
    }
  }
}

if (problems.length) {
  console.error('❌ Server Component διαβάζει ΤΙΜΗ από module πελάτη — θα είναι undefined στο SSR:\n');
  for (const p of problems) console.error('   ' + p);
  console.error('\n   Διόρθωση: μετακίνησε την τιμή σε module ΧΩΡΙΣ \'use client\'');
  console.error('   (π.χ. components/tokens.ts) και εισήγαγέ την από εκεί.\n');
  process.exit(1);
}
console.log('✅ Server components: καμία εισαγωγή τιμής από module πελάτη.');
