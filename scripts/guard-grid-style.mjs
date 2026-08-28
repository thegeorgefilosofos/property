#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ `style` ΔΕΝ ΣΒΗΝΕΙ ΤΙΣ ΜΕΤΑΒΛΗΤΕΣ ΤΟΥ ΠΛΕΓΜΑΤΟΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΕΣΠΑΣΕ, ΚΑΙ ΓΙΑΤΙ ΔΕΝ ΤΟ ΕΙΔΕ ΚΑΝΕΙΣ. Οι βοηθοί διάταξης (`fixedCols`,
// `formGrid`, `fieldRow`, `tileGrid`, `tileRow`) επιστρέφουν ΚΑΙ `className`
// ΚΑΙ `style`: μέσα στο `style` ζουν οι μεταβλητές που λένε πόσες στήλες θέλει
// το πλέγμα σε κάθε πλάτος (`--fc`, `--fc-md`, `--fc-sm`, `--fc-gap`).
//
// Γραμμένο έτσι:
//
//     <div {...fixedCols(4, 10)} style={{ marginTop: 16 }}>
//
// το JSX κρατά ΜΟΝΟ το δεύτερο `style`. Οι μεταβλητές χάνονται σιωπηλά: η
// κλάση `.fixed-cols` μένει, οπότε το στοιχείο ΕΙΝΑΙ πλέγμα και μοιάζει
// σωστό — αλλά το `repeat(var(--fc-sm), …)` δεν έχει τιμή και ο περιηγητής
// κρατά ό,τι βρει. Μετρημένο στη σύνοψη προϋπολογισμού στα 430: πέντε
// πλακίδια σε δύο στήλες, δηλαδή 2+2+1 με το πέμπτο μισό και τρύπα δεξιά του.
//
// Ο μεταγλωττιστής ΔΕΝ το πιάνει (και τα δύο είναι έγκυρα), ο ελεγκτής ούτε,
// και η οθόνη δείχνει απλώς «λίγο πιο στριμωγμένη». Δεκατρία σημεία της
// εφαρμογής το γράφουν σωστά, με άπλωμα του ίδιου βοηθού μέσα στο `style`·
// ένα το είχε ξεχάσει.
//
// Ο ΚΑΝΟΝΑΣ: όποιο στοιχείο απλώνει βοηθό διάταξης και έχει και δικό του
// `style`, το `style` οφείλει να ξεκινά με άπλωμα (`...`). Ετσι ό,τι δίνει ο
// βοηθός επιβιώνει και ό,τι προσθέτει ο καλών μπαίνει από πάνω.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { projectFiles } from './lib/git-files.mjs';

const SELF = 'scripts/guard-grid-style.mjs';
const HELPERS = ['fixedCols', 'formGrid', 'fieldRow', 'tileGrid', 'tileRow'];

// Το άνοιγμα ετικέτας που απλώνει βοηθό. Το `[^>]*?` σταματά πριν από το
// πρώτο `>`, δηλαδή μέσα στην ίδια ετικέτα: ένα `style` της επόμενης δεν
// μετράει.
const TAG = new RegExp(String.raw`\{\.\.\.\s*(?:${HELPERS.join('|')})\s*\([^}]*?\)\s*\}([^>]*?)>`, 'g');

let hits = 0;
const lines = [];

for (const f of projectFiles()) {
  if (!f.endsWith('.tsx') || f === SELF) continue;
  const src = readFileSync(f, 'utf8');
  if (!HELPERS.some(h => src.includes(h))) continue;
  for (const m of src.matchAll(TAG)) {
    const rest = m[1];
    const style = rest.match(/style=\{\{([\s\S]*?)\}\}/);
    if (!style) continue;
    if (style[1].trimStart().startsWith('...')) continue;
    hits++;
    const line = src.slice(0, m.index).split('\n').length;
    lines.push(`  ${f}:${line}\n     …${m[0].replace(/\s+/g, ' ').slice(0, 96)}…`);
  }
}

if (hits === 0) {
  console.log('✓ κάθε πλέγμα κρατά τις μεταβλητές του: κανένα `style` δεν σβήνει βοηθό διάταξης');
  process.exit(0);
}
console.log(`✗ ${hits} ${hits === 1 ? 'πλέγμα χάνει' : 'πλέγματα χάνουν'} τις μεταβλητές στηλών του:\n`);
console.log(lines.join('\n'));
console.log('\n  Γράψε: style={{ ...fixedCols(n, gap).style, … }} — το άπλωμα πρώτο.');
process.exit(1);
