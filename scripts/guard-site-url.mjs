#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΕΝΑ ΠΡΟΪΟΝ, ΜΙΑ ΔΙΕΥΘΥΝΣΗ
// ─────────────────────────────────────────────────────────────────────────
// ΤΡΕΙΣ ΔΙΕΥΘΥΝΣΕΙΣ ΣΥΝΥΠΗΡΧΑΝ, ΚΑΙ Η ΜΙΑ ΔΕΝ ΑΠΑΝΤΟΥΣΕ ΚΑΝ:
//
//   `https://propertyos.gr`             — domain που ΔΕΝ έχει αγοραστεί, σε
//     canonical, sitemap, δομημένα δεδομένα και σε έξι συναρτήσεις email.
//   `https://propertyos-psi.vercel.app` — άλλη διεύθυνση Vercel, σε τρεις.
//   και η πραγματική διεύθυνση παραγωγής, σε καμία.
//
// Ενας ιδιοκτήτης που πατούσε «Άνοιγμα PROPERWISE» σε υπενθύμιση κατέληγε
// αλλού από έναν που πατούσε πρόσκληση ομάδας, και οι μηχανές αναζήτησης
// έβλεπαν κανονική διεύθυνση που δεν υπάρχει.
//
// Ο ΚΑΝΟΝΑΣ: η απόλυτη διεύθυνση της εφαρμογής γράφεται ΜΟΝΟ στα δύο αρχεία
// που τη διαβάζουν από το περιβάλλον. Οπουδήποτε αλλού είναι δεύτερη πηγή που
// θα μείνει πίσω.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { projectFiles } from './lib/git-files.mjs';

/** Τα δύο σημεία που ΕΠΙΤΡΕΠΕΤΑΙ να ξέρουν τη διεύθυνση. */
const OWNERS = new Set(['lib/core/site.ts', 'supabase/functions/_shared/site.ts']);

/** Διευθύνσεις που ανήκουν σε ΕΜΑΣ. Ξένες (aade.gr, resend.dev) δεν αφορούν. */
const OURS = /https:\/\/(?:[a-z0-9-]+\.)*(?:propertyos\.gr|property-tan-gamma\.vercel\.app|propertyos-psi\.vercel\.app)/;

/**
 * Κόβει το σχόλιο, ΟΧΙ τη διεύθυνση.
 *
 * Το αφελές `line.replace(/\/\/.*$/, '')` κόβει από την ΠΡΩΤΗ διπλή κάθετο —
 * που μέσα σε μια γραμμή με `https://…` είναι η κάθετος του πρωτοκόλλου. Ολη η
 * διεύθυνση εξαφανιζόταν πριν καν ελεγχθεί, και ο φύλακας περνούσε πάντα.
 * Επαληθεύτηκε με μετάλλαξη: καρφωμένη διεύθυνση σε δύο αρχεία, καμία ένδειξη.
 */
const stripComment = (line) => line.replace(/(^|[^:])\/\/.*$/, '$1');

const problems = [];
for (const file of projectFiles("'app/**' 'lib/**' 'components/**' 'supabase/functions/**'")) {
  if (OWNERS.has(file)) continue;
  // Τα σενάρια επαλήθευσης και οι σουίτες γράφουν διευθύνσεις ως δεδομένα
  // ελέγχου — εκεί η κυριολεξία είναι το νόημα.
  if (file.includes('.test.') || file.includes('/verify-')) continue;
  if (!/\.(ts|tsx|js|mjs)$/.test(file)) continue;

  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
    if (OURS.test(stripComment(line))) {
      problems.push(`${file}:${i + 1}: γράφει τη διεύθυνση της εφαρμογής με το χέρι.`);
    }
  });
}

if (problems.length) {
  console.error(`✗ ${problems.length} διευθύνσεις εκτός της μίας πηγής:\n`);
  problems.forEach(p => console.error('  ' + p));
  console.error(`
  Η διεύθυνση ζει στο lib/core/site.ts (\`SITE\`, \`siteUrl\`) για την εφαρμογή
  και στο supabase/functions/_shared/site.ts (\`APP_URL\`, \`appUrl\`) για τα
  email. Και τα δύο τη διαβάζουν από το περιβάλλον, ώστε η αλλαγή domain να
  είναι μία τιμή και όχι είκοσι αναζητήσεις.`);
  process.exit(1);
}
console.log('✓ διεύθυνση: μία πηγή για την εφαρμογή, μία για τα email');
