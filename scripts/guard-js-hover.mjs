#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Η ΑΙΩΡΗΣΗ ΕΙΝΑΙ ΔΟΥΛΕΙΑ ΤΟΥ CSS, ΟΧΙ ΤΗΣ JAVASCRIPT
// ─────────────────────────────────────────────────────────────────────────
// Τριακόσιοι είκοσι ένας χειριστές `onMouseEnter/onMouseLeave` που γράφουν
// `e.currentTarget.style.background`. Το ίδιο πράγμα, γραμμένο από την αρχή σε
// σαράντα πέντε αρχεία, με άλλο χρώμα κάθε φορά.
//
// ΔΕΝ ΕΙΝΑΙ ΘΕΜΑ ΚΟΜΨΟΤΗΤΑΣ. Η αιώρηση σε JavaScript:
//
//   · ΔΕΝ ΞΕΡΕΙ ΤΟ ΠΛΗΚΤΡΟΛΟΓΙΟ. Το `:focus-visible` δεν πυροδοτεί
//     `onMouseEnter`, οπότε όποιος πλοηγείται με Tab δεν βλέπει ΤΙΠΟΤΑ.
//   · ΚΟΛΛΑΕΙ ΣΤΗΝ ΑΦΗ. Μετά το πάτημα σε κινητό το στοιχείο μένει
//     «αναμμένο» ώσπου να αγγίξει ο χρήστης αλλού· το `@media (hover: hover)`
//     του CST το λύνει, ο χειριστής όχι.
//   · ΓΡΑΦΕΙ ΣΤΟ DOM ΠΙΣΩ ΑΠΟ ΤΗΝ ΠΛΑΤΗ ΤΗΣ REACT, οπότε η επόμενη απόδοση
//     μπορεί να το σβήσει ή να το κλειδώσει.
//
// ΚΑΣΤΑΝΙΑ, ΟΧΙ ΑΠΑΓΟΡΕΥΣΗ. Τα 321 σημεία δεν ξαναγράφονται σε μία κίνηση —
// αυτό θα ήταν ακριβώς η βιασύνη που παράγει σφάλματα. Ο κανόνας είναι «ούτε
// ένα παραπάνω»: κάθε νέος χειριστής κοκκινίζει, και το όριο κατεβαίνει όποτε
// μια οθόνη περνά σε κλάση CSS.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { projectFiles } from './lib/git-files.mjs';

const BASELINE = JSON.parse(readFileSync('scripts/js-hover-baseline.json', 'utf8'));

const HANDLER = /onMouse(?:Enter|Leave|Over|Out)=/g;

const hits = [];
for (const file of projectFiles("'app/**/*.tsx' 'components/**/*.tsx'")) {
  const src = readFileSync(file, 'utf8');
  const found = src.match(HANDLER);
  if (found) hits.push({ file, count: found.length });
}
const total = hits.reduce((n, h) => n + h.count, 0);

if (total > BASELINE.max) {
  console.error(`✗ ${total} χειριστές αιώρησης σε JavaScript, πάνω από το όριο ${BASELINE.max}:\n`);
  hits.sort((a, b) => b.count - a.count).slice(0, 8).forEach(h => console.error(`   ${h.count}× ${h.file}`));
  console.error(`
  Η αιώρηση γράφεται σε CSS: μια κλάση με \`:hover\`, \`:active\` και
  \`:focus-visible\`, μέσα σε \`@media (hover: hover)\`. Δες το \`.po-btn\`
  στο app/globals.css — μία δήλωση, τρεις καταστάσεις, και δουλεύει και για
  όποιον πλοηγείται με πληκτρολόγιο.`);
  process.exit(1);
}

const better = BASELINE.max - total;
console.log(`✓ αιώρηση σε JavaScript: ${total} ≤ όριο ${BASELINE.max}`);
if (better > 0) console.log(`   ↓ Βελτίωση κατά ${better}. Κατέβασε το "max" στο scripts/js-hover-baseline.json στο ${total}.`);
