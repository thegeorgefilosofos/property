#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΚΩΔΙΚΑΣ ΠΟΥ ΔΕΝ ΤΟΝ ΤΡΕΧΕΙ ΚΑΝΕΙΣ ΔΕΝ ΕΙΝΑΙ ΟΥΔΕΤΕΡΟΣ.
//
// Δεκαέξι εξαγόμενες τιμές δεν τις καλούσε κανείς — ούτε το ίδιο τους το
// αρχείο. Το πρόβλημα δεν ήταν το μέγεθος· ήταν ότι διαβάζονταν ως αυθεντία:
//
//   ALWAYS          «Πάντα ορατές»                  → η ορατότητα κρινόταν αλλού
//   GATED_TABS      «Ο πλήρης κατάλογος»            → κανείς δεν τον ρωτούσε
//   E2_HEADERS      9 στήλες που έμοιαζαν ΤΟ έντυπο → το έντυπο έχει 19
//   CURRENCIES      έξι νομίσματα                   → η εφαρμογή είναι σε ευρώ
//   formatDate      δεύτερος μορφοποιητής           → με άλλη μορφή από τον ένα
//   MIN_LEASE_MONTHS ελάχιστη διάρκεια μίσθωσης     → κανόνας που δεν ίσχυε
//
// Όποιος τα πείραζε δεν θα άλλαζε τίποτα. Όποιος τα χρησιμοποιούσε θα έπαιρνε
// λάθος αποτέλεσμα. Και τα δύο είναι χειρότερα από το να μην υπάρχουν.
//
// ΤΙ ΕΛΕΓΧΕΤΑΙ: εξαγόμενες ΤΙΜΕΣ (const / function) που δεν εμφανίζονται σε
// κανένα άλλο αρχείο ΚΑΙ ούτε στο δικό τους. Οι τύποι και τα interfaces
// εξαιρούνται: είναι η δημόσια επιφάνεια ενός module, όχι νεκρός κώδικας.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, globSync } from 'node:fs';

/** Ονόματα που τα καλεί το πλαίσιο, όχι δικός μας κώδικας. */
const FRAMEWORK = new Set([
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD',
  'metadata', 'viewport', 'generateMetadata', 'generateStaticParams',
  'dynamic', 'revalidate', 'runtime', 'preferredRegion', 'fetchCache', 'maxDuration',
  'config', 'middleware',
]);

/** Δεδομένα αναφοράς που κρατιούνται σκόπιμα, με τεκμηρίωση στο ίδιο τους το αρχείο. */
const KEPT = new Set([
  'PROXIMITY_EFFECTS', 'SEASONALITY_ISLAND', 'SEASONALITY_CITY',  // πίνακες αγοράς
  'VAT_RATES_SNAPSHOT_DATE',                                       // σφραγίδα προέλευσης
]);

const files = globSync(['app/**/*.{ts,tsx}', 'lib/**/*.ts', 'components/**/*.{ts,tsx}'])
  .filter(f => !f.includes('node_modules'));
const src = new Map(files.map(f => [f, readFileSync(f, 'utf8')]));

const dead = [];
for (const [file, s] of src) {
  for (const m of s.matchAll(/^export (?:async )?function (\w+)|^export const (\w+)\s*[:=]/gm)) {
    const name = m[1] || m[2];
    if (FRAMEWORK.has(name) || KEPT.has(name)) continue;
    const re = new RegExp(`\\b${name}\\b`, 'g');
    let outside = 0;
    for (const [other, t] of src) { if (other === file) continue; outside += (t.match(re) || []).length; }
    if (outside > 0) continue;
    if ((s.match(re) || []).length - 1 > 0) continue;
    const ln = s.slice(0, m.index).split('\n').length;
    dead.push(`${file}:${ln}  ${name}`);
  }
}

if (dead.length) {
  console.error(`✗ ${dead.length} εξαγόμενες τιμές που δεν τις χρησιμοποιεί κανείς.\n`);
  console.error('   Σβήσ’ τες, ή χρησιμοποίησέ τες. Μια τιμή που κάθεται εξαγόμενη και');
  console.error('   άχρηστη διαβάζεται ως κανόνας της εφαρμογής — και δεν είναι.\n');
  for (const d of dead) console.error('   ' + d);
  console.error('');
  process.exit(1);
}
console.log('✅ Νεκρός κώδικας: καμία εξαγόμενη τιμή χωρίς καταναλωτή.');
