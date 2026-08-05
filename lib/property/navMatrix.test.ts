// npx tsx lib/property/navMatrix.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΜΙΑ ΚΕΝΗ ΠΛΟΗΓΗΣΗ, ΣΕ ΚΑΝΕΝΑΝ ΣΥΝΔΥΑΣΜΟ.
//
// Η ορατότητα καρτελών είναι η καρδιά της εφαρμογής: μια αστοχία εδώ δεν ρίχνει
// τίποτα και δεν βγάζει σφάλμα — απλώς κρύβει από τον χρήστη κάτι που χρειάζεται,
// και κανείς δεν το μαθαίνει μέχρι να τηλεφωνήσει. Οι έλεγχοι μονάδας του
// visibility.ts κοιτούν μία απόφαση τη φορά· εδώ κοιτάμε το ΑΠΟΤΕΛΕΣΜΑ, σε κάθε
// συνδυασμό που μπορεί να έχει πραγματικός πελάτης:
//   7 καταστάσεις × 2 νομικές μορφές × {1, 2, 3, 15} ακίνητα = 56 μενού.
// Σε κανένα δεν επιτρέπεται να λείπουν τα βασικά ή να αδειάσει το μενού.
//
// Ο ΚΑΤΑΛΟΓΟΣ ΔΙΑΒΑΖΕΤΑΙ ΑΠΟ ΤΗΝ ΠΗΓΗ. Τα NAV_ITEMS ζουν μέσα στο page.tsx (ένα
// React page component δεν εξάγει καταλόγους), οπότε τα διαβάζουμε από το ίδιο το
// αρχείο. Μια αντιγραφή τους εδώ θα σήμαινε ότι ο έλεγχος περνά ενώ η εφαρμογή
// έχει προχωρήσει — δηλαδή ένας έλεγχος που φυλάει τον εαυτό του.
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { visibleTabs, type OwnerContext, type PropertyLike, type LegalForm } from './visibility';
import { STATUSES, writeStatus, type PropertyStatus } from './status';

let pass = 0, fail = 0;
function ok(name: string, cond: boolean) { if (cond) { pass++; } else { fail++; console.error(`✗ ${name}`); } }

// ── Ο πραγματικός κατάλογος καρτελών, από το page.tsx ──────────────────────
const PAGE = join(process.cwd(), 'app', 'dashboard', 'page.tsx');
const src = readFileSync(PAGE, 'utf8');
const block = src.match(/const NAV_ITEMS = \[([\s\S]*?)\n\];/);
ok('βρέθηκε ο κατάλογος NAV_ITEMS στο page.tsx', !!block);
const NAV_IDS = [...(block?.[1] ?? '').matchAll(/id:\s*'([a-z_]+)'/g)].map(m => m[1]);
ok(`διαβάστηκαν οι καρτέλες (${NAV_IDS.length})`, NAV_IDS.length >= 13);

// ── ΤΕΣΣΕΡΙΣ ΚΑΡΤΕΛΕΣ ΣΥΓΧΩΝΕΥΤΗΚΑΝ. ΤΟ ΠΕΡΙΕΧΟΜΕΝΟ ΤΟΥΣ ΔΕΝ ΧΑΘΗΚΕ. ───────
// Σχέδιο, Σύγκριση, Τιμολόγηση και Επαφές δεν είναι πια προορισμοί του μενού —
// είναι ενότητες μέσα στην Απόδοση, στον Πελάτη και στο Αρχείο. Ο έλεγχος εδώ
// φυλάει ακριβώς αυτό: ότι έφυγαν από το μενού ΚΑΙ ότι εξακολουθούν να
// αποδίδονται. Μια συγχώνευση που ξεχνά το δεύτερο είναι διαγραφή.
const MERGED: [string, RegExp][] = [
  ['plan',       /<TabPlan propertyId=\{selected\.id\} userId=\{user\.id\} status=\{readStatus\(selected\)\} property=\{selected\}\/>/],
  ['comparison', /<TabComparison properties=\{properties\} userId=\{user\.id\}\/>/],
  ['pricing',    /<TabPricing propertyId=\{selected\.id\}/],
  ['contacts',   /<TabContacts propertyId=\{selected\.id\}/],
];
for (const [id, render] of MERGED) {
  ok(`η «${id}» δεν είναι πια ξεχωριστή καρτέλα`, !NAV_IDS.includes(id));
  ok(`αλλά το περιεχόμενό της αποδίδεται`, render.test(src));
}
ok('η Απόδοση κρατά το κλείδωμα πλάνου της Σύγκρισης', /isTabAllowed\(ent,'comparison'\)/.test(src));
ok('το Σχέδιο εμφανίζεται μόνο στις τέσσερις καταστάσεις', /PLAN_STATUSES\.has\(readStatus\(selected\)\)/.test(src));
ok('η Σύγκριση εμφανίζεται μόνο με δεύτερο ακίνητο', /properties\.length > 1/.test(src));

// ── Το πλέγμα ──────────────────────────────────────────────────────────────
/** Τα ελάχιστα που πρέπει να βλέπει ΚΑΘΕ ιδιοκτήτης, ό,τι κι αν ισχύει γι' αυτόν. */
const ESSENTIAL = ['overview', 'settings'];
/** Ό,τι δεν εξαρτάται από τίποτα: κάθε ακίνητο έχει έξοδα, χαρτιά και προθεσμίες. */
const UNCONDITIONAL = ['overview', 'finances', 'documents', 'calendar', 'checklist', 'settings', 'referral', 'accounting', 'loan'];

const COUNTS = [1, 2, 3, 15];
const FORMS: LegalForm[] = ['individual', 'company'];

const propAt = (i: number, status: PropertyStatus): PropertyLike => ({
  id: `p${i}`, prop_type: 'apartment', sqm: 80, year_built: 2005, postal_code: '11524',
  ...writeStatus(status),
});

let combos = 0;
for (const { key: status } of STATUSES) {
  for (const legalForm of FORMS) {
    for (const n of COUNTS) {
      combos++;
      const props = Array.from({ length: n }, (_, i) => propAt(i, status));
      const ctx: OwnerContext = { legalForm, properties: props };
      const v = visibleTabs(NAV_IDS, ctx, props[0]);
      const label = `${status}/${legalForm}/${n}`;

      ok(`${label}: το μενού δεν είναι κενό`, v.length > 0);
      for (const t of ESSENTIAL) ok(`${label}: υπάρχει «${t}»`, v.includes(t));
      for (const t of UNCONDITIONAL) ok(`${label}: μένει «${t}»`, v.includes(t));
      ok(`${label}: καμία άγνωστη καρτέλα`, v.every(id => NAV_IDS.includes(id)));

      ok(`${label}: το Χαρτοφυλάκιο θέλει τρία`, v.includes('portfolio') === (n >= 3));
      // Οι συγχωνευμένες δεν επανεμφανίζονται από πίσω πόρτα.
      for (const [id] of MERGED) ok(`${label}: καμία «${id}» στο μενού`, !v.includes(id));
    }
  }
}
ok('ελέγχθηκαν 56 συνδυασμοί', combos === 56);

// Χωρίς επιλεγμένο ακίνητο (νέος λογαριασμός): το μενού πάλι δεν αδειάζει.
{
  const v = visibleTabs(NAV_IDS, { legalForm: 'individual', properties: [] }, null);
  ok('χωρίς ακίνητα: το μενού στέκει', v.length > 0);
  for (const t of ESSENTIAL) ok(`χωρίς ακίνητα: υπάρχει «${t}»`, v.includes(t));
}

console.log(fail === 0 ? `✓ navMatrix: ${pass} έλεγχοι πέρασαν` : `✗ navMatrix: ${fail} απέτυχαν από ${pass + fail}`);
if (fail > 0) process.exit(1);
