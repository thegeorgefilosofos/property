#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΜΗΤΡΩΟ ΠΗΓΩΝ ΔΕΝ ΕΠΙΤΡΕΠΕΤΑΙ ΝΑ ΓΙΝΕΙ ΔΙΑΚΟΣΜΗΤΙΚΟ
// ─────────────────────────────────────────────────────────────────────────
// Η λογιστική στηρίζεται σε εικοσιοκτώ δημοσιευμένα κείμενα τρίτων, νόμους
// και εγκυκλίους, που ώς πρόσφατα ζούσαν μόνο ως σχόλια μέσα στον κώδικα.
// Τώρα είναι μητρώο και ένα αρχείο JSON που λέει «είμαστε κλειδωμένοι στην
// v1.0.4» δεν αξίζει τίποτα αν κανείς δεν το συγκρίνει με τον κώδικα. Θα
// μείνει να λέει v1.0.4 για πάντα, ενώ ο κώδικας θα έχει πάει αλλού — και θα
// είναι χειρότερο από το να μην υπήρχε, γιατί θα το πιστεύει ο επόμενος.
//
// ΤΡΕΙΣ ΕΛΕΓΧΟΙ, ΟΛΟΙ ΧΩΡΙΣ ΔΙΚΤΥΟ:
//
//   ΤΟ ΣΗΜΑΔΙ ΥΠΑΡΧΕΙ. Κάθε αρχείο του `uses` πρέπει να αναφέρει όντως κάποια
//   από τις παραπομπές του `covers`. Αν κάποιος αναβαθμίσει τον κώδικα σε
//   v1.0.5 και ξεχάσει το μητρώο, ή το αντίστροφο, κοκκινίζει.
//
//   ΤΑ ΑΡΧΕΙΑ ΥΠΑΡΧΟΥΝ. Ένα `uses` που δείχνει σε αρχείο που μετονομάστηκε
//   είναι σιωπηλά νεκρή αναφορά.
//
//   ΚΑΜΙΑ ΠΗΓΗ ΔΕΝ ΛΕΙΠΕΙ. Ο κώδικας σαρώνεται για αναφορές σε νόμους και
//   εγκυκλίους· ό,τι αναφέρεται και δεν είναι στο μητρώο, το λέει. Έτσι μια
//   καινούρια εξάρτηση δεν μπορεί να μπει κρυφά.
//
// Η ΦΡΕΣΚΑΔΑ ΕΛΕΓΧΕΤΑΙ ΜΕ `--strict`, όπως στο price-freshness: στο CI είναι
// προειδοποίηση, στο προγραμματισμένο workflow είναι κόκκινο που ανοίγει issue.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync } from 'node:fs';
import { findSources } from './lib/find-tests.mjs';

const data = JSON.parse(readFileSync(new URL('../data/accounting-sources.json', import.meta.url), 'utf8'));
const strict = process.argv.includes('--strict');
const entries = Object.entries(data).filter(([k]) => !k.startsWith('_'));

const problems = [];
const stale = [];

// ── 1. Το σημάδι υπάρχει και τα αρχεία επίσης ─────────────────────────────
/** Οι παραπομπές που καλύπτει μια εγγραφή, χωρίς κενά για σταθερή σύγκριση. */
const coversOf = s => (s.covers?.length ? s.covers : [s.marker]).filter(Boolean).map(c => c.replace(/\s+/g, ''));

for (const [key, s] of entries) {
  const covers = coversOf(s);
  if (!covers.length) problems.push(`${key}: καμία παραπομπή στο covers`);
  for (const f of s.uses ?? []) {
    if (!existsSync(f)) { problems.push(`${key}: το «${f}» δεν υπάρχει`); continue; }
    const src = readFileSync(f, 'utf8').replace(/\s+/g, '');
    if (covers.length && !covers.some(c => src.includes(c))) {
      problems.push(`${key}: το «${f}» δεν αναφέρει καμία από [${covers.join(', ')}] — το μητρώο και ο κώδικας απέκλιναν`);
    }
  }
  if (!s.title || !s.why || !s.pinned) problems.push(`${key}: λείπει τίτλος, αιτιολογία ή έκδοση`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s.checkedAt))) problems.push(`${key}: το checkedAt δεν είναι ημερομηνία`);
  if (!['accounting', 'legal', 'technical'].includes(s.domain)) problems.push(`${key}: άγνωστο domain «${s.domain}»`);
}

// ── 2. Καμία πηγή του κώδικα δεν λείπει από το μητρώο ──────────────────────
// Ό,τι μοιάζει με παραπομπή σε νόμο ή εγκύκλιο. Το εύρος είναι σκόπιμα στενό:
// ψάχνει μορφές που ΜΟΝΟ νομοθεσία έχει, ώστε να μη βγάζει θόρυβο.
// ΧΩΡΙΣ `\b`. Το όριο λέξης της JavaScript ορίζεται πάνω σε ASCII: πριν από
// ελληνικό «ν» δεν υπάρχει ποτέ όριο, οπότε το μοτίβο δεν ταίριαζε ΠΟΤΕ και ο
// έλεγχος περνούσε πάντα με μηδέν ευρήματα. Μετρήθηκε: 0 παραπομπές σε
// αποθετήριο που έχει δεκάδες.
const CITE = /(?:ν\.\s?\d{4}\/\d{4}|ΠΟΛ\.\s?\d{4}\/\d{4}|Α\.\s?\d{4}\/\d{4}|Ε\.\s?\d{4}\/\d{4})/gu;
const known = new Set(entries.flatMap(([, s]) => coversOf(s)));
const seen = new Map();
for (const f of findSources()) {
  if (f.includes('.test.') || f.startsWith('scripts/')) continue;
  const src = readFileSync(f, 'utf8');
  for (const m of src.match(CITE) ?? []) {
    const cite = m.replace(/\s+/g, '');
    if (known.has(cite)) continue;
    if (!seen.has(cite)) seen.set(cite, f);
  }
}
for (const [cite, f] of seen) {
  problems.push(`αναφορά χωρίς εγγραφή στο μητρώο: «${cite}» στο ${f}`);
}

// ── 3. Φρεσκάδα ────────────────────────────────────────────────────────────
const today = Date.now();
const ageOf = iso => Math.floor((today - new Date(`${iso}T00:00:00Z`).getTime()) / 86400000);
for (const [key, s] of entries) {
  const age = ageOf(s.checkedAt);
  if (Number.isFinite(age) && age > (s.maxAgeDays ?? 365)) {
    stale.push(`  · ${s.title}\n    Ελέγχθηκε πριν από ${age} ημέρες (όριο ${s.maxAgeDays}).${s.watch ? `\n    ${s.watch}` : ''}`);
  }
}

if (problems.length) {
  console.error(`✗ ${problems.length} προβλήματα στο μητρώο λογιστικών πηγών:\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error('\n  Το μητρώο ζει στο data/accounting-sources.json και πρέπει να συμφωνεί');
  console.error('  με τον κώδικα. Αν αναβαθμίστηκε πηγή, αναβαθμίζονται και τα δύο.');
  process.exit(1);
}

if (stale.length) {
  console.error(`${strict ? '✗' : '⚠'} ${stale.length} λογιστικές πηγές θέλουν ανθρώπινο μάτι:\n`);
  for (const s of stale) console.error(s);
  console.error('\n  Άνοιξε την πηγή, δες αν άλλαξε και ενημέρωσε το checkedAt.');
  if (strict) process.exit(1);
} else {
  console.log(`✓ ${entries.length} λογιστικές πηγές, όλες δηλωμένες και συμφωνούν με τον κώδικα`);
}
