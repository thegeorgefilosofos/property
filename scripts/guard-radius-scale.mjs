#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΔΕΚΑΟΚΤΩ ΑΚΤΙΝΕΣ ΓΙΑ ΜΙΑ ΓΩΝΙΑ
// ─────────────────────────────────────────────────────────────────────────
// Η κλίμακα ορίζει ΕΞΙ τιμές: card 14, inner 10, btn 10, modal 18, pill 100,
// badge 100. Ο κώδικας γράφει δεκαοκτώ, εφτακόσιες δεκαεπτά φορές, ωμά:
// 3, 5, 6, 7, 11, 16, 20, 50 και τα υπόλοιπα. Καμία δεν είναι λάθος από μόνη
// της· μαζί όμως σημαίνουν ότι δύο κουτιά δίπλα δίπλα στρογγυλεύουν αλλιώς,
// και ο χρήστης το βλέπει χωρίς να μπορεί να πει τι φταίει.
//
// ΤΟ ΚΟΣΤΟΣ ΕΙΝΑΙ ΣΤΗΝ ΑΛΛΑΓΗ. Οταν αποφασιστεί ότι οι κάρτες θέλουν 16 αντί
// για 14, η αλλαγή είναι μία γραμμή στα tokens — ή εξήντα αναζητήσεις με το
// χέρι, και σε πέντε από αυτές θα ξεχαστεί.
//
// ΚΑΣΤΑΝΙΑ, ΟΧΙ ΑΠΑΓΟΡΕΥΣΗ. Υπάρχουν γωνίες που ανήκουν στο περιεχόμενο και
// όχι στο θέμα: ένα στρογγυλό άβαταρ, μια λεπτή μπάρα δύο εικονοστοιχείων.
// Ο κανόνας είναι «ούτε μία παραπάνω», και το όριο κατεβαίνει σε κάθε πέρασμα.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { projectFiles } from './lib/git-files.mjs';

const BASELINE = JSON.parse(readFileSync('scripts/radius-baseline.json', 'utf8'));

/** `borderRadius: 12` ή `borderRadius: '12px'` — ωμός αριθμός, όχι token. */
const RAW = /borderRadius:\s*'?[0-9]+(?:px)?'?/g;

const hits = [];
for (const file of projectFiles("'app/**/*.tsx' 'app/**/*.ts' 'components/**/*.tsx' 'components/**/*.ts'")) {
  if (file.includes('.test.')) continue;
  const found = readFileSync(file, 'utf8').match(RAW);
  if (found) hits.push({ file, count: found.length });
}
const total = hits.reduce((n, h) => n + h.count, 0);

if (total > BASELINE.max) {
  console.error(`✗ ${total} ωμές ακτίνες, πάνω από το όριο ${BASELINE.max}:\n`);
  hits.sort((a, b) => b.count - a.count).slice(0, 8).forEach(h => console.error(`   ${h.count}× ${h.file}`));
  console.error(`
  Η κλίμακα ζει στο components/tokens.ts: \`T.radius.card\` (14),
  \`T.radius.inner\` (10), \`T.radius.btn\` (10), \`T.radius.modal\` (18),
  \`T.radius.pill\` (100). Μια γωνία που δεν ταιριάζει σε καμία από αυτές
  θέλει αιτιολόγηση, όχι νέο αριθμό.`);
  process.exit(1);
}

const better = BASELINE.max - total;
console.log(`✓ ακτίνες: ${total} ωμές ≤ όριο ${BASELINE.max}`);
if (better > 0) console.log(`   ↓ Βελτίωση κατά ${better}. Κατέβασε το "max" στο scripts/radius-baseline.json στο ${total}.`);
