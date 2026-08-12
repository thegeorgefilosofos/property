#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΝΕΑ ΕΚΔΟΣΗ ΑΠΟ ΤΗΝ ΑΑΔΕ, ΤΗΝ ΩΡΑ ΠΟΥ ΒΓΑΙΝΕΙ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΔΕΝ ΚΑΝΕΙ ΘΟΡΥΒΟ. Οι Συνδυασμοί Χαρακτηρισμών είναι
// αντιγραμμένοι στον κώδικα από την έκδοση v1.0.4: 320 ζεύγη τύπου και
// χαρακτηρισμού, 1.307 κωδικοί Ε3. Όταν η ΑΑΔΕ δημοσιεύσει v1.0.5, τίποτα δεν
// σπάει — το build περνά, τα 25.000 τεστ περνούν, και ο λογιστής παίρνει
// απόρριψη διαβίβασης μήνες αργότερα, για συνδυασμό που εμείς τον λέγαμε
// επιτρεπτό. Το μαθαίνουμε από παράπονο πελάτη.
//
// ΤΙ ΚΑΝΕΙ. Κατεβάζει τη σελίδα τεχνικών προδιαγραφών της ΑΑΔΕ και βγάζει από
// αυτήν ΚΑΘΕ αριθμό έκδοσης που αναφέρει. Τους συγκρίνει με την έκδοση στην
// οποία είναι κλειδωμένος ο κώδικας. Οτιδήποτε νεότερο, το λέει ονομαστικά.
//
// ΓΙΑΤΙ ΔΕΝ ΚΑΤΕΒΑΖΕΙ ΤΟ ΑΡΧΕΙΟ ΚΑΙ ΔΕΝ ΤΟ ΔΙΑΒΑΖΕΙ ΜΟΝΟ ΤΟΥ. Ένας πίνακας
// 1.307 κωδικών που ενημερώνεται αυτόματα από σελίδα τρίτου είναι ακριβώς ο
// τρόπος να μπει λάθος κωδικός σε φορολογική δήλωση με το κύρος του
// αυτοματισμού. Ο έλεγχος ΕΙΔΟΠΟΙΕΙ· την αντιγραφή τη κάνει άνθρωπος που
// ανοίγει το αρχείο, όπως έγινε και την πρώτη φορά.
//
// ΓΙΑΤΙ ΔΕΝ ΤΡΕΧΕΙ ΣΤΟ CI. Χρειάζεται δίκτυο προς την ΑΑΔΕ. Τρέχει σε
// προγραμματισμένο workflow, που ανοίγει issue όταν βρει κάτι.
//
//     node scripts/check-aade-editions.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../data/accounting-sources.json', import.meta.url), 'utf8'));
const watched = Object.entries(data).filter(([k, s]) => !k.startsWith('_') && s.watch);

if (!watched.length) {
  console.log('Καμία πηγή δεν έχει σελίδα παρακολούθησης.');
  process.exit(0);
}

/** «v1.0.4» → [1, 0, 4], για σύγκριση που ξέρει ότι το 10 είναι μετά το 9. */
const parse = v => String(v).replace(/^v/i, '').split('.').map(Number);
const newer = (a, b) => {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d > 0;
  }
  return false;
};

const findings = [];
let failed = 0;

for (const [key, s] of watched) {
  let html;
  try {
    const res = await fetch(s.watch, {
      headers: { 'user-agent': 'PropertyOS-edition-watch/1.0' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (e) {
    failed++;
    findings.push(`⚠ ${s.title}\n  Η σελίδα δεν διαβάστηκε: ${e.message}\n  ${s.watch}`);
    continue;
  }

  // Κάθε «v1.2.3» ή «έκδοση 1.2.3» της σελίδας. Η μορφή είναι αυτή που
  // χρησιμοποιεί η ΑΑΔΕ στα ονόματα των αρχείων της.
  const found = new Set();
  for (const m of html.matchAll(/\bv?(\d+\.\d+\.\d+)\b/g)) found.add(m[1]);

  if (!found.size) {
    failed++;
    findings.push(`⚠ ${s.title}\n  Η σελίδα διαβάστηκε αλλά δεν βρέθηκε κανένας αριθμός έκδοσης.\n  Πιθανή αλλαγή δομής: χρειάζεται ανθρώπινο μάτι.\n  ${s.watch}`);
    continue;
  }

  const ahead = [...found].filter(v => newer(v, s.pinned)).sort((a, b) => (newer(a, b) ? 1 : -1));
  if (ahead.length) {
    findings.push(
      `✗ ${s.title}\n` +
      `  Είμαστε κλειδωμένοι στην ${s.pinned}. Η σελίδα αναφέρει: ${ahead.join(', ')}.\n` +
      `  Εξαρτώνται: ${(s.uses ?? []).join(', ')}\n` +
      `  ${s.watch}`);
  } else {
    console.log(`✓ ${s.title}: ${s.pinned} είναι η νεότερη που αναφέρει η σελίδα`);
  }
}

if (findings.length) {
  console.error('');
  for (const f of findings) console.error(f + '\n');
  console.error('Η αντιγραφή γίνεται από άνθρωπο: άνοιξε το αρχείο, ενημέρωσε τους πίνακες,');
  console.error('και ανέβασε την έκδοση ΚΑΙ στο data/accounting-sources.json ΚΑΙ στον κώδικα.');
  console.error('Ο φύλακας guard-accounting-sources δεν αφήνει το ένα να πάει χωρίς το άλλο.');
  process.exit(1);
}

console.log(`\n✓ ${watched.length} παρακολουθούμενες πηγές, καμία νεότερη έκδοση${failed ? ` (${failed} δεν διαβάστηκαν)` : ''}`);
