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
//
// ΤΟ ΣΧΟΛΙΟ ΜΕΤΡΟΥΣΕ ΩΣ ΧΡΗΣΗ, ΚΑΙ ΕΚΕΙ ΚΡΥΦΤΗΚΑΝ ΔΥΟ ΟΛΟΚΛΗΡΑ COMPONENTS.
//
// Ο έλεγχος «εμφανίζεται και στο δικό του αρχείο» μετρούσε το ΩΜΟ κείμενο. Το
// ιδίωμα αυτού του αποθετηρίου είναι να έχει κάθε εξαγωγή επικεφαλίδα με το
// όνομά της («═══ StatRow, γραμμή ετικέτα … ποσό ═══»), οπότε ΚΑΘΕ σχολιασμένη
// εξαγωγή αυτοεπιβεβαιωνόταν. Το `StatRow` και το `TotalRow` του Theme.tsx —
// δύο components που δεν απέδιδε καμία οθόνη — περνούσαν πράσινα επειδή τα
// ανέφερε το δικό τους σχόλιο.
//
// Τα σχόλια σβήνονται πριν από κάθε μέτρηση και στο δικό του αρχείο και στα
// ξένα: αναφορά σε σχόλιο δεν είναι καταναλωτής, είναι περιγραφή.
//
// ΔΕΝ ΤΟΝ ΕΤΡΕΧΕ ΚΑΝΕΝΑ WORKFLOW. Ο φύλακας ήταν γραμμένος και δηλωμένος στο
// package.json και κανένα workflow δεν τον καλούσε. Ενας φύλακας που δεν
// τρέχει δεν φυλάει τίποτα, απλώς δίνει την εντύπωση ότι φυλάει. Στην ίδια
// κατάσταση βρέθηκαν τρεις φύλακες μαζί και το ίδιο είχε συμβεί με τη σουίτα
// του confirmBus, που ήταν γραμμένη και δεν την έβρισκε ο εκτελεστής.
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

/**
 * Σβήνει σχόλια, κρατώντας τις αλλαγές γραμμής ώστε οι αριθμοί να μένουν σωστοί.
 *
 * ΤΟ `//` ΜΕΤΡΑΕΙ ΜΟΝΟ ΣΤΗΝ ΑΡΧΗ ΓΡΑΜΜΗΣ. Μέσα σε συμβολοσειρά υπάρχουν
 * διαδρομές («https://…», «app/api/…») και ένα άπληστο σβήσιμο θα έτρωγε
 * κώδικα. Οι επικεφαλίδες αυτού του αποθετηρίου είναι πάντα σε δική τους
 * γραμμή, που είναι ακριβώς η περίπτωση που μας ενδιαφέρει.
 */
const noComments = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/^[ \t]*\/\/.*$/gm, m => m.replace(/[^\n]/g, ' '));

const src = new Map(files.map(f => [f, noComments(readFileSync(f, 'utf8'))]));

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

// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΤΥΦΛΟ ΣΗΜΕΙΟ: ΤΟ ΤΕΣΤ ΜΕΤΡΟΥΣΕ ΩΣ ΚΑΤΑΝΑΛΩΤΗΣ
// ─────────────────────────────────────────────────────────────────────────
// Το glob παραπάνω πιάνει και τα `*.test.ts`. Αρα μια εξαγωγή που την καλεί
// ΜΟΝΟ το δικό της τεστ μετρούσε ως «χρησιμοποιείται» — και ο φύλακας έλεγε
// πράσινο. Το τεστ όμως δεν είναι χρήση: είναι απόδειξη ότι κάτι δουλεύει, όχι
// ότι κάποιος το χρειάζεται. Η μέτρηση βρήκε 81 τέτοιες, με πυκνότερα σημεία
// τη μηχανή τιμολόγησης (τέσσερις) που δεν εκδίδει κανένα παραστατικό.
//
// ΓΙΑΤΙ ΚΑΣΤΑΝΙΑ ΚΑΙ ΟΧΙ ΑΠΑΓΟΡΕΥΣΗ. Οι 81 ΔΕΝ είναι 81 νεκρές: πολλές είναι
// καθαρές συναρτήσεις σπασμένες σκόπιμα σε δοκιμάσιμα κομμάτια και η διαγραφή
// τους μαζικά θα έσπαγε λογική για χάρη ενός αριθμού. Ο κανόνας που έχει νόημα
// είναι «ούτε μία παραπάνω»: κάθε νέα εξαγωγή αποκτά είτε καταναλωτή είτε
// λόγο ύπαρξης. Οταν καθαρίζεις, κατέβασε το `maxTestOnly`.
// ═══════════════════════════════════════════════════════════════════════════
const BASELINE = JSON.parse(readFileSync('scripts/dead-exports-baseline.json', 'utf8'));
const isTest = f => f.includes('.test.');
const testOnly = [];
for (const [file, s] of src) {
  if (isTest(file)) continue;
  for (const m of s.matchAll(/^export (?:async )?function (\w+)|^export const (\w+)\s*[:=]/gm)) {
    const name = m[1] || m[2];
    if (FRAMEWORK.has(name) || KEPT.has(name)) continue;
    const re = new RegExp(`\\b${name}\\b`, 'g');
    let inProd = 0, inTest = 0;
    for (const [other, t] of src) {
      if (other === file) continue;
      const n = (t.match(re) || []).length;
      if (isTest(other)) inTest += n; else inProd += n;
    }
    if (inProd === 0 && inTest > 0 && (s.match(re) || []).length - 1 === 0) {
      testOnly.push(`${file}  ${name}`);
    }
  }
}
if (testOnly.length > BASELINE.maxTestOnly) {
  console.error(`✗ ${testOnly.length} εξαγωγές που τις καλεί ΜΟΝΟ το τεστ τους, πάνω από το όριο ${BASELINE.maxTestOnly}:\n`);
  for (const x of testOnly) console.error('   ' + x);
  console.error('\n   Το τεστ δεν είναι χρήση. Δώσε στην εξαγωγή καταναλωτή, ή σβήσ’ την.\n');
  process.exit(1);
}
if (testOnly.length < BASELINE.maxTestOnly) {
  console.log(`   (${testOnly.length} εξαγωγές μόνο με τεστ, όριο ${BASELINE.maxTestOnly} — κατέβασέ το στο scripts/dead-exports-baseline.json)`);
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
