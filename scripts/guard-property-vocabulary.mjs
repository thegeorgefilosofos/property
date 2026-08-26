#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΛΕΞΙΛΟΓΙΟ ΤΟΥ ΑΚΙΝΗΤΟΥ ΓΡΑΦΕΤΑΙ ΜΙΑ ΦΟΡΑ
// ─────────────────────────────────────────────────────────────────────────
// ΔΥΟ ΚΑΝΟΝΕΣ, ΚΑΙ ΟΙ ΔΥΟ ΑΠΟ ΜΕΤΡΗΜΕΝΗ ΖΗΜΙΑ.
//
// 1. ΟΙ ΕΤΙΚΕΤΕΣ. Το ίδιο λεξιλόγιο ζούσε σε τέσσερα αντίγραφα. Η θέση
//    στάθμευσης λεγόταν «Parking» στον οδηγό προσθήκης, «Θέση στάθμευσης» στο
//    χαρτοφυλάκιο και «Θέσεις parking» στη σύγκριση. Δύο από τα τέσσερα δεν
//    είχαν καν κλειδί για τη βίλα και την αποθήκη πολυκατοικίας, οπότε εκεί ο
//    χρήστης έβλεπε το αγγλικό κλειδί της βάσης.
//
// 2. ΤΟ «ΕΙΝΑΙ ΜΟΝΟΚΑΤΟΙΚΙΑ;». Ο ίδιος νόμος απαντιόταν με τρεις εκφράσεις.
//    Ο προϋπολογισμός δεχόταν και τη μεζονέτα, η Τιμολόγηση και ο λογιστής όχι:
//    ίδιο ακίνητο, άλλο τέλος ανθεκτικότητας σε κάθε οθόνη.
//
// ΠΗΓΕΣ: lib/property/types.ts για τα ονόματα, lib/tax/shortTermTax.ts για τον
// νόμο. Οι δύο πηγές είναι και οι μόνες εξαιρέσεις εδώ.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { projectFiles } from './lib/git-files.mjs';

const SELF = 'scripts/guard-property-vocabulary.mjs';

/** Οι πηγές, τα δοκίμιά τους και ο ίδιος ο φύλακας γράφουν τον κανόνα. */
const SOURCES = new Set([
  SELF,
  'lib/property/types.ts', 'lib/property/types.test.ts',
  'lib/tax/shortTermTax.ts', 'lib/tax/shortTermTax.test.ts',
  // Το Ε2 έχει το λεξιλόγιο της ΑΑΔΕ, όχι το δικό μας: η βίλα γράφεται
  // «Μονοκατοικία» επειδή το έντυπο δεν έχει άλλο κουτί.
  'lib/billing/e2.ts', 'lib/billing/e2.test.ts',
]);

const CODE = /\.(ts|tsx)$/;
const files = projectFiles().filter(f => CODE.test(f) && !SOURCES.has(f));

// ── 1. Δεύτερος πίνακας ετικετών ────────────────────────────────────────
// Πίνακας που αντιστοιχίζει κλειδί τύπου σε ελληνικό λεκτικό. Το ζητούμενο
// είναι δύο τουλάχιστον κλειδιά με ελληνικά δίπλα τους στην ίδια δήλωση.
const LABEL_MAP = /\b(apartment|maisonette|warehouse|storage)\s*:\s*'[Α-Ωα-ωΆ-Ώά-ώ]/g;

// ── 2. Δεύτερη απάντηση στο «είναι μονοκατοικία;» ───────────────────────
// ΜΟΝΟ ΛΟΓΙΚΟΣ ΕΛΕΓΧΟΣ, ΟΧΙ ΚΑΘΕ ΑΝΑΦΟΡΑ. Η πρώτη γραφή έπιανε και τους
// πίνακες συντελεστών της αγοράς (`house: 1.03, villa: 1.25`), που απλώς
// ονομάζουν τους τύπους χωρίς να κρίνουν τίποτα. Το ζητούμενο είναι η
// έκφραση που ΑΠΑΝΤΑ: λίστα με `includes(` ή κανονική έκφραση με `.test(`.
// Και η σύγκριση με `===` δοκιμάστηκε, αλλά έπιανε δύο δοκίμια που απλώς
// ελέγχουν τι επιστρέφει μια συνάρτηση για ένα ακίνητο τύπου βίλας.
const HOUSE_TEST = new RegExp([
  "\\[[^\\n\\]]*'(house|villa)'[^\\n\\]]*\\]\\s*\\.\\s*includes",
  "\\/[^\\n\\/]*μονοκατοικ[^\\n\\/]*\\/[gimsuy]*\\s*\\.\\s*test",
].join('|'), 'g');

const hits = [];
for (const f of files) {
  let src;
  try { src = readFileSync(f, 'utf8'); } catch { continue; }
  const labels = [...src.matchAll(LABEL_MAP)];
  if (labels.length >= 2) {
    const line = src.slice(0, labels[0].index).split('\n').length;
    hits.push({ f, line, why: `δεύτερος πίνακας ετικετών τύπου (${labels.length} κλειδιά)`, fix: 'propertyTypeLabel / propertyTypePlural από το lib/property/types.ts' });
  }
  for (const m of src.matchAll(HOUSE_TEST)) {
    const line = src.slice(0, m.index).split('\n').length;
    hits.push({ f, line, why: `δεύτερη απάντηση στο «είναι μονοκατοικία;»: …${m[0].replace(/\s+/g, ' ').trim()}…`, fix: 'isHouseType από το lib/tax/shortTermTax.ts' });
  }
}

if (hits.length) {
  console.error(`✗ ${hits.length} αντίγραφα του λεξιλογίου του ακινήτου:\n`);
  for (const h of hits.slice(0, 12)) console.error(`  ${h.f}:${h.line}\n     ${h.why}\n     → ${h.fix}`);
  if (hits.length > 12) console.error(`  … και ${hits.length - 12} ακόμη`);
  console.error('');
  process.exit(1);
}
console.log(`✓ ένα λεξιλόγιο ακινήτου σε ${files.length} αρχεία`);
