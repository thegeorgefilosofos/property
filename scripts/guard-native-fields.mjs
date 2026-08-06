#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΜΙΑ ΠΑΛΕΤΑ. ΤΟ ΛΕΙΤΟΥΡΓΙΚΟ ΔΕΝ ΣΧΕΔΙΑΖΕΙ ΜΑΖΙ ΜΑΣ.
//
// Είκοσι έξι ντόπια <select> ήταν σκορπισμένα σε έντεκα οθόνες, δίπλα σε πεδία
// που ακολουθούν το σύστημα της εφαρμογής. Το <select> δεν στυλάρεται: το
// άνοιγμά του το ζωγραφίζει ο browser και το λειτουργικό, με δικά τους χρώματα,
// δική τους γραμματοσειρά, δική τους γωνία. Στο σκούρο θέμα το αποτέλεσμα ήταν
// λευκή λίστα πάνω σε σκούρα σελίδα· σε ένα ακόμη σημείο το βελάκι ήταν
// καρφωμένο γκρι (#9aa0a6) που δεν άλλαζε ποτέ με το θέμα.
//
// Το CustomSelect κάνει ό,τι χρειάζεται και κρατά την παλέτα: portal ώστε να
// μη κόβεται από modal, πληκτρολόγιο, focus ring, ίδια γεωμετρία με τα
// υπόλοιπα πεδία.
//
// ΕΞΑΙΡΕΣΗ: κανένα. Αν χρειαστεί πραγματικά ντόπιο πεδίο κάποια στιγμή,
// η συζήτηση γίνεται εδώ, στον φύλακα, όχι σιωπηλά σε μία οθόνη.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, globSync } from 'node:fs';

const FILES = globSync(['app/**/*.tsx', 'components/**/*.tsx'])
  .filter(f => !f.includes('/node_modules/'));

const hits = [];
for (const file of FILES) {
  const src = readFileSync(file, 'utf8');
  src.split('\n').forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('{/*')) return;
    if (/<select[\s>]/.test(line)) hits.push(`${file}:${i + 1}  ${t.slice(0, 90)}`);
  });
}

if (hits.length) {
  console.error(`✗ ${hits.length} ντόπια <select>. Χρησιμοποίησε το CustomSelect του './UIComponents'.\n`);
  for (const h of hits) console.error('   ' + h);
  console.error('');
  process.exit(1);
}
console.log('✅ Πεδία επιλογής: κανένα ντόπιο <select> — μία παλέτα σε όλες τις οθόνες.');
