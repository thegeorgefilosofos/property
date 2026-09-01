#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΠΛΑΚΙΔΙΟ ΚΑΙ Η ΓΡΑΜΜΗ ΣΤΟΙΧΕΙΩΝ ΓΡΑΦΟΝΤΑΙ ΜΙΑ ΦΟΡΑ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΠΛΑΚΙΔΙΟ ΗΤΑΝ ΤΕΣΣΕΡΑ. `KPIGrid` στο Theme, `KPI` στο Δάνειο, ένα δεύτερο
// `KPI` μέσα στην Αξιοποίηση και το `MetricTile` δίπλα του. Τέσσερα κουτιά που
// έδειχναν ίδια στην οθόνη και απέκλιναν στον κώδικα: άλλη γωνία, άλλο
// περιθώριο, άλλο ταβάνι μεγέθους, άλλη θέση για τη σημείωση· και η ανύψωση
// άλλοτε από το φύλλο στυλ και άλλοτε από κατάσταση React με ακροατές
// ποντικιού. Η γραμμή στοιχείων ήταν τρία.
//
// ΓΙΑΤΙ ΧΡΕΙΑΖΕΤΑΙ ΦΥΛΑΚΑΣ. Καμία από τις επτά γραφές δεν μπήκε από αμέλεια:
// κάθε μία ήταν, τη μέρα της, δέκα γραμμές που φαίνονταν πιο γρήγορες από μια
// εισαγωγή. Ενα βιβλίο συστατικών που δεν φυλάσσεται ξαναγράφεται.
//
// ΤΙ ΨΑΧΝΕΙ: αρχείο εκτός του βιβλίου που ζωγραφίζει το κουτί του πλακιδίου
// (`kpi-card`) ή στήνει μόνο του τη γραμμή στοιχείων (`kpi-plain` μαζί με
// `kpi-label`). Και τα δύο τα δίνουν έτοιμα το `Tile` και το `Stat`.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { projectFiles } from './lib/git-files.mjs';

const HOME = 'components/Theme.tsx';
const SELF = 'scripts/guard-tile-copies.mjs';

/** Το κουτί του πλακιδίου, γραμμένο σε className ή σε συμβολοσειρά. */
const CARD = /className=\{?['"`][^'"`]*\bkpi-card\b/;
/** Η γραμμή στοιχείων: δοχείο χωρίς πλακίδιο ΜΑΖΙ με ετικέτα πλακιδίου. */
const PLAIN = /className=\{?['"`][^'"`]*\bkpi-plain\b/;
const LABEL = /className=\{?['"`][^'"`]*\bkpi-label\b/;

const hits = [];
for (const f of projectFiles()) {
  if (!f.endsWith('.tsx') || f === HOME || f === SELF) continue;
  const src = readFileSync(f, 'utf8');
  const lines = src.split('\n');
  const plain = lines.some(l => PLAIN.test(l));
  const label = lines.some(l => LABEL.test(l));
  lines.forEach((l, i) => {
    if (CARD.test(l)) hits.push([f, i + 1, l, 'πλακίδιο: <Tile>']);
    else if (PLAIN.test(l) && plain && label) hits.push([f, i + 1, l, 'γραμμή στοιχείων: <Stat>']);
  });
}

if (hits.length) {
  console.error(`✗ ${hits.length} χειρόγραφα πλακίδια, εκτός του βιβλίου συστατικών:\n`);
  for (const [f, n, l, want] of hits) console.error(`  ${f}:${n}  → ${want}\n     ${l.trim().slice(0, 88)}`);
  console.error('\n  Το πλακίδιο ζει ως <Tile> και η γραμμή στοιχείων ως <Stat>, στο');
  console.error('  components/Theme.tsx: ένα κουτί, ένα κενό, ένα ταβάνι μεγέθους, μία');
  console.error('  θέση για τη σημείωση, ανύψωση από το φύλλο στυλ. Το <KPIGrid> τα');
  console.error('  βάζει σε σειρά όταν χρειάζεσαι σειρά.\n');
  process.exit(1);
}
console.log('✓ το πλακίδιο και η γραμμή στοιχείων γράφονται μία φορά, στο βιβλίο συστατικών');
