#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΘΕ ΜΕΤΑΒΛΗΤΗ ΠΟΥ ΧΡΗΣΙΜΟΠΟΙΕΙΤΑΙ, ΠΡΕΠΕΙ ΝΑ ΥΠΑΡΧΕΙ ΚΑΙ ΣΤΑ ΔΥΟ ΘΕΜΑΤΑ
//
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΦΥΛΑΕΙ. Οι δέκα σημασιολογικοί τόνοι (--accent-soft,
// --negative-border και τα υπόλοιπα) ήταν δηλωμένοι ΜΟΝΟ μέσα στο
// `:root[data-mode="light"]`. Το σκούρο όμως είναι η ΒΑΣΗ, όχι παραλλαγή —
// άρα στο προεπιλεγμένο θέμα ήταν ανύπαρκτοι, σε τετρακόσιες δέκα χρήσεις.
//
// Τι έβλεπε ο χρήστης: κάθε `background: var(--accent-soft)` έπεφτε σε διάφανο,
// και κάθε `border: 1px solid var(--negative-border)` γινόταν ΟΛΟΚΛΗΡΟ άκυρο —
// δηλαδή `border-style: none`, το περίγραμμα εξαφανιζόταν. Πλακίδια χωρίς
// γέμισμα και χωρίς πλαίσιο, σε πενήντα πέντε αρχεία.
//
// ΓΙΑΤΙ ΔΕΝ ΤΟ ΕΠΙΑΣΕ ΤΙΠΟΤΑ. Καμία μεταγλώττιση δεν αποτυγχάνει, κανένα
// μήνυμα δεν τυπώνεται: μια ακαθόριστη μεταβλητή CSS είναι σιωπηλή. Το
// φωτεινό θέμα δούλευε τέλεια, οπότε όποιος δοκίμαζε εκεί δεν έβλεπε τίποτα.
//
// ΤΙ ΕΛΕΓΧΕΙ. Μαζεύει κάθε `var(--κάτι)` που χρησιμοποιεί η εφαρμογή, και
// κάθε δήλωση ανά μπλοκ θέματος. Ό,τι χρησιμοποιείται πρέπει να δηλώνεται είτε
// στη ΒΑΣΗ (που ισχύει και στα δύο) είτε ΚΑΙ ΣΤΑ ΔΥΟ μπλοκ χωριστά.
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const CSS = 'app/globals.css';
const css = readFileSync(CSS, 'utf8');

// ── Τα τρία μπλοκ που μας αφορούν ────────────────────────────────────────
// Βάση: `:root, [data-mode="dark"]` — ισχύει πάντα, άρα καλύπτει και τα δύο.
// Φωτεινό: `:root[data-mode="light"]` — μεγαλύτερη ειδικότητα, κατισχύει.
const blockAfter = (startRe) => {
  const m = startRe.exec(css);
  if (!m) return '';
  const from = m.index + m[0].length;
  const end = css.indexOf('\n}', from);
  return css.slice(from, end === -1 ? css.length : end);
};

const base  = blockAfter(/:root,\s*\n\[data-mode="dark"\]\s*\{/);
const light = blockAfter(/:root\[data-mode="light"\]\s*\{/);

if (!base || !light) {
  console.error('✗ Δεν βρέθηκαν τα μπλοκ θέματος στο ' + CSS + '.');
  console.error('  Αν άλλαξαν οι επιλογείς, ενημέρωσε αυτόν τον φύλακα — μην τον σβήσεις.');
  process.exit(1);
}

const declared = (block) => new Set(
  [...block.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map(m => m[1]),
);
const inBase = declared(base);
const inLight = declared(light);

// ── Ποιες χρησιμοποιεί η εφαρμογή ────────────────────────────────────────
const files = execSync(
  `grep -rl "var(--" --include=*.ts --include=*.tsx --include=*.css app components lib 2>/dev/null || true`,
  { encoding: 'utf8' },
).trim().split('\n').filter(Boolean);

// Πόσες φορές χρησιμοποιείται η καθεμία — για να λέει ο φύλακας το μέγεθος.
const uses = new Map();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
    const v = m[1];
    if (!uses.has(v)) uses.set(v, { count: 0, files: new Set() });
    const rec = uses.get(v);
    rec.count++; rec.files.add(f);
  }
}

// ── Ο έλεγχος ────────────────────────────────────────────────────────────
// Μια μεταβλητή είναι εντάξει αν δηλώνεται στη ΒΑΣΗ (καλύπτει και τα δύο),
// ή ρητά και στα δύο μπλοκ. Αγνοούνται όσες ορίζονται τοπικά σε component
// ή έρχονται από άλλο αρχείο CSS — γι' αυτό ελέγχουμε ΜΟΝΟ όσες εμφανίζονται
// σε ένα από τα δύο μπλοκ θέματος: αν καμία από τις δύο δεν την ξέρει, δεν
// είναι μεταβλητή θέματος και δεν μας αφορά εδώ.
const broken = [];
for (const [v, rec] of uses) {
  const known = inBase.has(v) || inLight.has(v);
  if (!known) continue;                 // δεν είναι μεταβλητή θέματος
  if (inBase.has(v)) continue;          // η βάση καλύπτει και τα δύο
  if (inLight.has(v) && !inBase.has(v)) {
    broken.push({ v, count: rec.count, files: rec.files.size });
  }
}

broken.sort((a, b) => b.count - a.count);

if (broken.length) {
  const total = broken.reduce((s, b) => s + b.count, 0);
  console.error(`\n✗ ${broken.length} ${broken.length === 1 ? 'μεταβλητή' : 'μεταβλητές'} υπάρχουν ΜΟΝΟ στο φωτεινό θέμα.`);
  console.error('  Στο σκούρο —που είναι η ΒΑΣΗ— είναι ακαθόριστες: το φόντο πέφτει σε');
  console.error('  διάφανο και το περίγραμμα γίνεται ΟΛΟΚΛΗΡΟ άκυρο, δηλαδή εξαφανίζεται.');
  console.error(`  Επηρεάζονται ${total} χρήσεις.\n`);
  for (const b of broken) {
    console.error(`  ${b.v}  —  ${b.count} χρήσεις σε ${b.files} αρχεία`);
  }
  console.error('\n  ΔΙΟΡΘΩΣΗ: μετακίνησε τη δήλωση στο μπλοκ βάσης «:root, [data-mode="dark"]».');
  console.error('  ΟΧΙ αντίγραφο στα δύο μπλοκ: το color-mix ξαναϋπολογίζεται ανά θέμα');
  console.error('  μέσω του var() που περιέχει, οπότε μία δήλωση αρκεί για τα δύο.\n');
  process.exit(1);
}

console.log(`✅ Και οι ${inBase.size} μεταβλητές θέματος υπάρχουν στη βάση, άρα και στα δύο θέματα.`);
