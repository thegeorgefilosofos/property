#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΤΥΠΟΙ ΤΩΝ ΓΡΑΜΜΩΝ ΓΡΑΦΟΝΤΑΙ ΑΠΟ ΤΟ ΣΧΗΜΑ, ΟΧΙ ΣΤΟ ΧΕΡΙ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΠΡΟΒΛΗΜΑ. Ο πελάτης του Supabase, χωρίς τύπους σχήματος, επιστρέφει
// γραμμές ως `any`. Η εφαρμογή είχε 361 `any` και τα περισσότερα ήταν
// ακριβώς αυτό: `(rows || []).map((r: any) => …)`. Το `any` δεν είναι απλώς
// χαλαρό — καταπίνει κάθε ορθογραφικό λάθος σε όνομα στήλης, ακριβώς το
// σφάλμα που γέννησε τον φύλακα schema-drift (`tenants.created_at`, στήλη
// που δεν υπήρξε ποτέ, σε επτά σημεία).
//
// ΓΙΑΤΙ ΓΕΝΝΗΤΡΙΑ ΚΑΙ ΟΧΙ ΑΡΧΕΙΟ ΓΡΑΜΜΕΝΟ ΣΤΟ ΧΕΡΙ. Ένα χειρόγραφο αρχείο
// τύπων είναι το σχήμα γραμμένο δεύτερη φορά. Θα απέκλινε στο πρώτο
// migration που κανείς δεν θυμήθηκε να αντιγράψει και η απόκλιση θα έλεγε
// ψέματα με τη σιγουριά του TypeScript.
//
// ΤΡΕΧΕΙ ΜΕ:  npm run db-types          (γράφει το αρχείο)
//             npm run db-types -- --check   (αποτυγχάνει αν δεν είναι φρέσκο)
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { readSchema } from './lib/pg-schema.mjs';

const OUT = 'lib/supabase/tables.ts';

// ── Η αντιστοίχιση τύπων ──────────────────────────────────────────────────
// `numeric` → number: το PostgREST το επιστρέφει ως αριθμό στο JSON. Τα
// `date`/`timestamptz` μένουν string, γιατί string φτάνουν και string
// συγκρίνει όλη η εφαρμογή (ISO, ταξινομήσιμο ως κείμενο).
function tsType(sql) {
  const t = sql.toLowerCase();
  if (/^(numeric|integer|bigint|bigserial|smallint|real|double)/.test(t)) return 'number';
  if (t === 'boolean') return 'boolean';
  if (t === 'jsonb' || t === 'json') return 'unknown';
  if (t.endsWith('[]')) return `${tsType(t.slice(0, -2))}[]`;
  return 'string';
}

const pascal = (s) => s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');

const schema = readSchema();
const tables = [...schema.keys()].sort();

const lines = [
  '// ═══════════════════════════════════════════════════════════════════════════',
  '// ΠΑΡΑΓΟΜΕΝΟ ΑΡΧΕΙΟ — ΜΗΝ ΤΟ ΓΡΑΨΕΙΣ ΣΤΟ ΧΕΡΙ',
  '//',
  '// Γεννιέται από τα ίδια τα migrations με `npm run db-types`. Κάθε αλλαγή που',
  '// γράφεται εδώ χάνεται στην επόμενη γέννηση και το `npm run db-types --check`',
  '// (μέρος του ελέγχου) την πιάνει αμέσως.',
  '//',
  '// ΤΙ ΕΙΝΑΙ. Το σχήμα των γραμμών όπως τις επιστρέφει το PostgREST. Χωρίς',
  '// αυτό, κάθε `select` γυρίζει `any` και ένα ορθογραφικό λάθος σε όνομα',
  '// στήλης περνά μέχρι την οθόνη του χρήστη.',
  '//',
  '// ΤΙ ΔΕΝ ΕΙΝΑΙ. Δεν αντικαθιστά τον φύλακα schema-drift: εκείνος ελέγχει τα',
  '// ονόματα στηλών ΜΕΣΑ στα strings του `select(…)`, που ο TypeScript δεν',
  '// βλέπει. Οι δύο πιάνουν διαφορετικά μισά του ίδιου λάθους.',
  '// ═══════════════════════════════════════════════════════════════════════════',
  '',
  '/** Τιμή στήλης `jsonb`: υπάρχει, αλλά το σχήμα της δεν ζει στη βάση. */',
  'export type Json = unknown;',
  '',
];

for (const table of tables) {
  const cols = schema.get(table);
  if (!cols.size) continue;
  lines.push(`export interface ${pascal(table)}Row {`);
  for (const [name, def] of cols) {
    const t = def.sql.toLowerCase() === 'jsonb' || def.sql.toLowerCase() === 'json' ? 'Json' : tsType(def.sql);
    lines.push(`  ${name}: ${t}${def.notNull ? '' : ' | null'};`);
  }
  lines.push('}', '');
}

lines.push('/** Όνομα πίνακα → τύπος γραμμής, για γενικούς βοηθούς. */');
lines.push('export interface Tables {');
for (const table of tables) if (schema.get(table).size) lines.push(`  ${table}: ${pascal(table)}Row;`);
lines.push('}', '');

const text = lines.join('\n');

if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(OUT, 'utf8'); } catch { /* λείπει εντελώς */ }
  if (current !== text) {
    console.error(`\n✗ Το ${OUT} δεν συμφωνεί με τα migrations.`);
    console.error('  Κάποιο migration άλλαξε το σχήμα και οι τύποι έμειναν πίσω.');
    console.error('  Τρέξε: npm run db-types\n');
    process.exit(1);
  }
  console.log(`✅ Οι τύποι γραμμών συμφωνούν με τα migrations (${tables.length} πίνακες).`);
} else {
  writeFileSync(OUT, text);
  console.log(`✅ Γράφτηκε το ${OUT} — ${tables.length} πίνακες από τα migrations.`);
}
