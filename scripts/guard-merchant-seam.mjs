#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Ο ΕΜΠΟΡΟΣ ΜΠΑΙΝΕΙ ΜΟΝΟ ΑΠΟ ΤΗ ΘΥΡΑ
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΧΡΕΙΑΖΕΤΑΙ ΦΥΛΑΚΑΣ ΚΑΙ ΔΕΝ ΑΡΚΕΙ Η ΠΡΟΘΕΣΗ. Μια στρώση αφαίρεσης που
// κανείς δεν επιβάλλει διαρρέει μέσα σε εβδομάδες: ο επόμενος που θα γράψει
// διαδρομή θα εισάγει κατευθείαν το «lemonCheckout», γιατί είναι πιο σύντομο
// και δουλεύει. Οταν έρθει η στιγμή της αλλαγής παρόχου, η στρώση θα υπάρχει
// στο όνομα και όχι στην πράξη, δηλαδή θα έχει κοστίσει χωρίς να αποδώσει.
//
// ΤΟ ΣΥΓΚΕΚΡΙΜΕΝΟ ΚΟΣΤΟΣ. Επτά αρχεία εισήγαγαν τα «lemon*» πριν μπει η θύρα:
// τέσσερις διαδρομές API, ένα component και δύο νομικά κείμενα. Καθένα ήξερε
// ονόματα μεταβλητών ενός παρόχου, τι είναι παραλλαγή και ποιο γεγονός
// κουβαλά συνδρομή.
//
// Ο ΚΑΝΟΝΑΣ. Τα αρθρώματα του παρόχου τα εισάγει ΜΟΝΟ ο φάκελος
// «lib/billing/merchant/» και οι σουίτες τους. Ο,τι άλλο περνά από
// «merchant()».
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { projectFiles } from './lib/git-files.mjs';

/** Τα αρθρώματα που ξέρουν τον πάροχο ονομαστικά. */
const PROVIDER = /from\s+['"](?:@\/lib\/billing\/|\.\/|\.\.\/)(lemon[A-Za-z]*)['"]/g;

/** Ποιος επιτρέπεται να τα βλέπει. */
const ALLOWED = (f) =>
  f.startsWith('lib/billing/merchant/')   // η ίδια η θύρα
  || /^lib\/billing\/lemon[A-Za-z]*\.ts$/.test(f)  // μεταξύ τους
  || f.endsWith('.test.ts');              // οι σουίτες τους

const files = projectFiles("'app/**' 'components/**' 'lib/**'")
  .filter(f => /\.(tsx?)$/.test(f) && !ALLOWED(f));

const hits = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  if (!src.includes('lemon')) continue;
  PROVIDER.lastIndex = 0;
  for (const m of src.matchAll(PROVIDER)) {
    hits.push({ f, line: src.slice(0, m.index).split('\n').length, mod: m[1] });
  }
}

if (hits.length) {
  console.error(`\n✗ ${hits.length} εισαγωγές αρθρώματος παρόχου έξω από τη θύρα:\n`);
  for (const h of hits) console.error(`   ${h.f}:${h.line}  ${h.mod}`);
  console.error(`
   Ο έμπορος μπαίνει από το lib/billing/merchant/:

       import { merchant } from '@/lib/billing/merchant';
       const mor = merchant();
       await mor.openCheckout({ plan, cycle, buyer, … }, process.env);

   Ο,τι είναι ΔΙΚΟΣ ΜΑΣ κανόνας (καταστάσεις, δικαιώματα, αναβάθμιση) ζει
   στο lib/billing/subscription.ts και δεν περνά από τη θύρα.
`);
  process.exit(1);
}
console.log(`✓ ${files.length} αρχεία, κανένα δεν παρακάμπτει τη θύρα του εμπόρου`);
