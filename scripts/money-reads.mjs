#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΘΕ ΕΥΡΩ, ΜΙΑ ΦΟΡΑ, ΑΠΟ ΕΝΑ ΣΗΜΕΙΟ.
//
// ΤΟ ΠΡΟΒΛΗΜΑ ΠΟΥ ΛΥΝΕΙ
// Τα χρήματα ζουν σε δύο πίνακες: `bills` (το πρόγραμμα πληρωμής) και
// `expenses` (το γεγονός). Όταν πληρώνεται λογαριασμός, γράφονται ΚΑΙ τα δύο,
// με `bill_id` που δείχνει πίσω. Σωστό μοντέλο. Το πρόβλημα ήταν ότι ΚΑΘΕ οθόνη
// έλυνε μόνη της τη διπλομέτρηση, με διαφορετικό τρόπο, ή δεν την έλυνε καθόλου.
//
// Τι βρέθηκε στην πράξη, σε τρεις μόνο οθόνες:
//   • Προϋπολογισμός: έκρυβε τις συνδεδεμένες δαπάνες, αλλά μετρούσε τον
//     λογαριασμό με το ποσό του και όχι με ό,τι πληρώθηκε, και φιλτράριζε με
//     created_at αντί για την ημερομηνία που μετράει.
//   • Δαπάνες: άθροιζε ΚΑΘΕ λογαριασμό όλων των ετών ως «μηνιαίο», ενώ
//     παράλληλα μετρούσε ξανά τις ίδιες γραμμές μέσα από τις δαπάνες.
//   • Ενιαία λίστα: δεν υπήρχε.
//
// Τρεις οθόνες, τρία διαφορετικά σύνολα για το ίδιο ακίνητο. Ο ιδιοκτήτης που
// θα εντόπιζε ΕΝΑ λάθος νούμερο θα σταματούσε να εμπιστεύεται όλα τα υπόλοιπα,
// και δίκαια.
//
// ΤΙ ΚΑΝΕΙ ΑΥΤΟΣ Ο ΕΛΕΓΧΟΣ
// Μετρά πόσα αρχεία διαβάζουν χρήματα από τη βάση ΚΑΙ τα αθροίζουν, χωρίς να
// περνούν από το lib/expenses/ledger.ts. Ο αριθμός επιτρέπεται μόνο να ΠΕΦΤΕΙ.
// Είναι ratchet και όχι απαγόρευση: μια μαζική μετατροπή 23 αρχείων σε βάση
// χωρίς αντίγραφα ασφαλείας θα ήταν πιο επικίνδυνη από το ίδιο το πρόβλημα.
// Έτσι το χρέος δεν μπορεί να μεγαλώσει, και μικραίνει με ρυθμό που ελέγχεται.
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const baseline = JSON.parse(readFileSync(new URL('./money-reads-baseline.json', import.meta.url), 'utf8'));

/** Διαβάζει χρήματα από τη βάση. */
const READS_MONEY = /from\(['"](?:expenses|bills)['"]\)/;

/** Τα αθροίζει, δηλαδή παράγει νούμερο που βλέπει ο χρήστης. */
const AGGREGATES = /\.reduce\s*\(|\+=\s*[A-Za-z_(]|Number\([^)]*amount/;

/** Περνά από τον κοινό πυρήνα. */
const USES_LEDGER = /mergeLedger|ledgerTotal|groupByMonth/;

/**
 * Αρχεία που ΓΡΑΦΟΥΝ χρήματα χωρίς να παράγουν σύνολα, ή που αθροίζουν κάτι
 * άσχετο (π.χ. αξία εξοπλισμού). Η εξαίρεση θέλει λόγο, γραμμένο εδώ.
 */
const EXEMPT = {
  'app/dashboard/components/BillsDashboard.tsx': 'Γράφει λογαριασμούς και τις συνδεδεμένες δαπάνες. Δεν παράγει διασταυρούμενο σύνολο.',
  'app/dashboard/components/DocumentScan.tsx': 'Καταχωρεί μία δαπάνη από σάρωση.',
  'app/dashboard/components/BankImport.tsx': 'Εισάγει κινήσεις τράπεζας, δεν αθροίζει.',
  'app/dashboard/components/BudgetImport.tsx': 'Εισάγει γραμμές, δεν αθροίζει.',
  'app/dashboard/components/TabInventory.tsx': 'Αθροίζει αξία εξοπλισμού, όχι δαπάνες.',
};

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !name.includes('.test.')) out.push(p);
  }
  return out;
};

const root = new URL('..', import.meta.url).pathname;
const files = [...walk(join(root, 'app')), ...walk(join(root, 'lib'))];

const offenders = [];
for (const abs of files) {
  const rel = abs.replace(root, '');
  if (EXEMPT[rel]) continue;
  if (rel.startsWith('lib/expenses/')) continue;   // ο ίδιος ο πυρήνας
  const src = readFileSync(abs, 'utf8');
  if (!READS_MONEY.test(src)) continue;
  if (!AGGREGATES.test(src)) continue;
  if (USES_LEDGER.test(src)) continue;
  offenders.push(rel);
}

offenders.sort();
const cap = baseline.maxBypasses;

console.log(`Αρχεία που αθροίζουν χρήματα χωρίς τον κοινό πυρήνα: ${offenders.length} (όριο ${cap})`);
for (const f of offenders) console.log(`   ${f}`);

if (offenders.length > cap) {
  console.error('');
  console.error(`🔴 ΑΠΕΤΥΧΕ — ${offenders.length} > ${cap} (+${offenders.length - cap}).`);
  console.error('   Νέο σημείο που αθροίζει χρήματα μόνο του. Δύο ή περισσότερες οθόνες');
  console.error('   που μετράνε αλλιώς το ίδιο ακίνητο είναι το πιο ακριβό είδος σφάλματος:');
  console.error('   δεν κρασάρει, απλώς κάνει τον χρήστη να πάψει να μας πιστεύει.');
  console.error('   Χρησιμοποίησε mergeLedger από το lib/expenses/ledger.ts.');
  process.exit(1);
}

if (offenders.length < cap) {
  console.log('');
  console.log(`✅ Βελτίωση κατά ${cap - offenders.length}. Κατέβασε το maxBypasses στο ${offenders.length}`);
  console.log('   μέσα στο scripts/money-reads-baseline.json για να κλειδώσει.');
} else {
  console.log('✅ Χωρίς νέα σημεία.');
}
