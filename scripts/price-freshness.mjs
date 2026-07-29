#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΤΙΜΕΣ ΓΕΡΝΑΝΕ ΣΙΩΠΗΛΑ.
//
// Η οθόνη γράφει «Τελευταίος έλεγχος: Ιούλιος 2026» και ο χρήστης το διαβάζει
// ως εγγύηση. Αν κανείς δεν ξανακοιτάξει, η ίδια πρόταση θα λέει το ίδιο τον
// Δεκέμβριο και θα είναι ψέμα, χωρίς να έχει σπάσει τίποτα και χωρίς να το
// δείξει κανένα test. Είναι η χειρότερη κατηγορία σφάλματος: αυτή που δεν
// κάνει θόρυβο.
//
// Ο έλεγχος τρέχει και στο CI (προειδοποιητικά) και σε προγραμματισμένο
// workflow που ανοίγει issue. Το issue είναι ΚΑΤΑΣΤΑΣΗ, όχι μήνυμα: μένει
// ανοιχτό μέχρι κάποιος να κάνει τη δουλειά.
//
// ΔΕΝ ΚΑΤΕΒΑΖΕΙ ΤΙΠΟΤΑ. Οι τιμές ενημερώνονται από άνθρωπο που διαβάζει τις
// δημοσιευμένες πηγές. Η αυτόματη άντληση από ιστοσελίδες τρίτων παραβιάζει
// τους όρους χρήσης τους και σπάει με κάθε αλλαγή σελίδας, δηλαδή θα έδινε
// λάθος τιμές με το κύρος του αυτοματισμού.
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../data/price-sources.json', import.meta.url), 'utf8'));
const today = new Date();
const strict = process.argv.includes('--strict');

const daysSince = (iso) => {
  const t = new Date(`${iso}T00:00:00Z`).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return Math.floor((today.getTime() - t) / 86400000);
};

const GREEK = { electricity: 'Ρεύμα', gas: 'Φυσικό αέριο', insurance: 'Ασφάλειες' };

const stale = [];
const fresh = [];

for (const [key, section] of Object.entries(data)) {
  if (key.startsWith('_') || typeof section !== 'object' || !section.checkedAt) continue;
  const age = daysSince(section.checkedAt);
  const max = section.maxAgeDays ?? 40;
  const row = { key, label: GREEK[key] ?? key, age, max, section };
  (age > max ? stale : fresh).push(row);
}

for (const r of fresh) {
  console.log(`✅ ${r.label}: ελέγχθηκε πριν ${r.age} ημέρες (όριο ${r.max}).`);
}

if (!stale.length) {
  console.log('✅ Όλες οι τιμές είναι εντός ορίου φρεσκάδας.');
  process.exit(0);
}

console.log('');
for (const r of stale) {
  console.log(`🔴 ${r.label}: ελέγχθηκε πριν ${r.age} ημέρες, όριο ${r.max}.`);
  console.log('   Πηγές προς έλεγχο:');
  for (const s of r.section.sources ?? []) console.log(`     • ${s.name} — ${s.url}`);
  console.log(`   Μετά τον έλεγχο, ενημέρωσε το data/price-sources.json: checkedAt και label.`);
  console.log('');
}

console.log('Γιατί έχει σημασία: η οθόνη δείχνει αυτή την ημερομηνία στον χρήστη ως');
console.log('ένδειξη αξιοπιστίας. Παλιά ημερομηνία με φρέσκια εμφάνιση είναι ψέμα.');

// Στο CI περνά με προειδοποίηση: παλιές τιμές δεν πρέπει να μπλοκάρουν μια
// άσχετη διόρθωση. Το προγραμματισμένο workflow τρέχει με --strict και ανοίγει
// issue, που είναι το σωστό σημείο για να επιμείνει.
process.exit(strict ? 1 : 0);
