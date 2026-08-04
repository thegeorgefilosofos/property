#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΣΤΑΝΙΑ: ΓΡΑΨΙΜΑΤΑ ΣΤΗ ΒΑΣΗ ΧΩΡΙΣ ΕΛΕΓΧΟ ΣΦΑΛΜΑΤΟΣ
//
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ
// Ο πελάτης του Supabase ΔΕΝ πετάει εξαίρεση όταν αποτύχει μια εγγραφή —
// επιστρέφει `{ data, error }`. Άρα αυτό:
//
//     try { await supabase.from('expenses').insert({ … }); πες «Αποθηκεύτηκε» }
//     catch { πες «κάτι πήγε στραβά» }
//
// δεν λέει ΠΟΤΕ «κάτι πήγε στραβά». Το λάθος μοιάζει σωστό, γι' αυτό γράφτηκε
// ξανά και ξανά από την αρχή σε δεκάδες σημεία — και κάθε φορά το αποτέλεσμα
// ήταν το ίδιο: ο χρήστης διαβάζει επιτυχία, τα δεδομένα δεν υπάρχουν.
//
// ΤΙ ΜΕΤΡΑΕΙ
// Κλήσεις insert/update/upsert/delete όπου δεν υπάρχει, κοντά τους, ούτε
// `must(…)`, ούτε `error`, ούτε ρητό `throw`. Δεν είναι απόδειξη σφάλματος —
// είναι σημείο που κανείς δεν κοίταξε αν πέτυχε.
//
// ΓΙΑΤΙ ΚΑΣΤΑΝΙΑ ΚΑΙ ΟΧΙ ΑΠΑΓΟΡΕΥΣΗ
// Τα υπάρχοντα σημεία δεν διορθώνονται με μαζική αντικατάσταση: το καθένα θέλει
// κρίση για το τι σημαίνει αποτυχία εκεί. Άλλα χάνουν δεδομένα, άλλα είναι
// σκόπιμα «στείλ' το και ξέχνα το». Η καστάνια εγγυάται το μόνο που μετράει
// άμεσα: ότι ο αριθμός ΜΟΝΟ πέφτει.
//
// ΟΤΑΝ ΚΑΤΕΒΕΙ, ΚΑΤΕΒΑΣΕ ΚΑΙ ΤΟ ΟΡΙΟ. Αλλιώς η καστάνια δεν σφίγγει.
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// Το όριο κατεβαίνει καθώς διορθώνονται σημεία. ΠΟΤΕ δεν ανεβαίνει.
const LIMIT = 182;

// Το γράψιμο αναγνωρίζεται ΜΟΝΟ ως κρίκος αλυσίδας που ξεκινά από `.from('πίνακας')`.
// Χωρίς αυτό, ένα `new Set(...).delete(x)` μετριόταν ως εγγραφή στη βάση.
const FROM = /\.from\(\s*['"`]/g;
const WRITE_AFTER_FROM = /\.(insert|update|upsert|delete)\s*\(/;
const LOOKBACK = 3;   // γραμμές πριν, όπου μπορεί να ζει ο έλεγχος
const MAX_CHAIN = 1200; // χαρακτήρες αλυσίδας που εξετάζονται μετά το .from(

function files() {
  const out = execSync(
    `grep -rl "from('" --include=*.ts --include=*.tsx app lib components 2>/dev/null || true`,
    { encoding: 'utf8' },
  ).trim();
  return out ? out.split('\n').filter(Boolean) : [];
}

const hits = [];
let total = 0;

for (const f of files()) {
  if (/\.test\.tsx?$/.test(f)) continue;   // τα τεστ δεν γράφουν σε πραγματική βάση
  const src = readFileSync(f, 'utf8');
  const lines = src.split('\n');

  // Θέση χαρακτήρα → αριθμός γραμμής, για αναφορά.
  const lineAt = (pos) => src.slice(0, pos).split('\n').length;

  FROM.lastIndex = 0;
  let m;
  while ((m = FROM.exec(src)) !== null) {
    // Η αλυσίδα σταματά στο πρώτο `;` ή σε κενή γραμμή — ό,τι έρχεται μετά είναι
    // άλλη πρόταση και ο δικός της έλεγχος δεν μετράει για αυτήν εδώ.
    const rest = src.slice(m.index, m.index + MAX_CHAIN);
    const stop = rest.search(/;|\n\s*\n/);
    const chain = stop === -1 ? rest : rest.slice(0, stop);
    if (!WRITE_AFTER_FROM.test(chain)) continue;

    total++;
    const ln = lineAt(m.index);
    const before = lines.slice(Math.max(0, ln - 1 - LOOKBACK), ln).join('\n');
    const scope = before + '\n' + chain;
    const checked = /must\s*\(/.test(scope) || /\berror\b/.test(scope) || /\bthrow\b/.test(scope);
    if (!checked) hits.push(`${f}:${ln}  ${(lines[ln - 1] || '').trim().slice(0, 100)}`);
  }
}

const n = hits.length;
if (n > LIMIT) {
  console.error(`\n✗ Καστάνια γραψιμάτων: ${n} χωρίς έλεγχο σφάλματος — πάνω από το όριο ${LIMIT}.`);
  console.error(`  Κάθε νέο γράψιμο πρέπει να ελέγχει το \`error\`, ή να περνά από must() (lib/supabase/must.ts).\n`);
  hits.slice(0, 40).forEach(h => console.error('  ' + h));
  if (n > 40) console.error(`  … και άλλα ${n - 40}`);
  process.exit(1);
}

console.log(`✅ Καστάνια γραψιμάτων πέρασε — ${n} χωρίς έλεγχο ≤ όριο ${LIMIT} (από ${total} συνολικά).`);
if (n < LIMIT) console.log(`   Κατέβηκε κατά ${LIMIT - n}. Κατέβασε το LIMIT σε ${n} στο scripts/unchecked-writes.mjs.`);
