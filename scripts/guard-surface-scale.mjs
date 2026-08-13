#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΣΤΑΝΙΑ ΕΠΙΦΑΝΕΙΑΣ — ΤΑ ΥΨΗ ΚΑΙ ΤΑ ΧΡΩΜΑΤΑ ΜΟΝΟ ΝΑ ΜΕΙΩΝΟΝΤΑΙ
// ─────────────────────────────────────────────────────────────────────────
// ΑΔΕΛΦΟΣ ΤΗΣ ΚΑΣΤΑΝΙΑΣ ΤΥΠΟΓΡΑΦΙΑΣ, ΓΙΑ ΤΑ ΑΛΛΑ ΔΥΟ ΠΟΥ ΔΙΑΡΡΕΟΥΝ.
//
// ── ΠΡΩΤΟ: ΤΑ ΥΨΗ ────────────────────────────────────────────────────────
// Η κλίμακα ζει στο `T.h` (components/tokens.ts) και έχει ΤΡΙΑ σκαλιά:
//
//     sm  var(--h-sm)   chips και μικρά κουμπιά
//     md  var(--h-md)   κανονικά πεδία
//     lg  var(--h-lg)   κύρια πεδία
//
// Είναι ΜΕΤΑΒΛΗΤΕΣ CSS, όχι αριθμοί, και αυτό είναι όλο το νόημα: σε συσκευή
// αφής ανεβαίνουν στα 44 εικονοστοιχεία, που είναι το ελάχιστο μέγεθος στόχου
// για δάχτυλο. Ένα γραμμένο `height: 40` ΔΕΝ ανεβαίνει ποτέ — μένει 40 στο
// κινητό, δηλαδή αστοχεί το πάτημα.
//
// ΜΕΤΡΗΜΕΝΟ (Αύγουστος 2026): 107 ωμά ύψη σε δέκα διαφορετικές τιμές (30, 32,
// 34, 36, 38, 40, 42, 44, 46, 48) για τρία σκαλιά. Δεν είναι κλίμακα· είναι
// απόφαση της στιγμής, εκατόν εφτά φορές.
//
// ── ΔΕΥΤΕΡΟ: ΤΑ ΧΡΩΜΑΤΑ ──────────────────────────────────────────────────
// Κάθε χρώμα της εφαρμογής είναι μεταβλητή θέματος, ώστε το σκούρο και το
// φωτεινό να αλλάζουν μαζί. Ένα γραμμένο `rgba(0,0,0,.4)` δεν αλλάζει με το
// θέμα: στο φωτεινό είναι διακριτική σκιά, στο σκούρο μαύρη κηλίδα. Ο φύλακας
// θεμάτων (guard-theme-tokens) φυλάει ότι κάθε μεταβλητή ΥΠΑΡΧΕΙ και στα δύο
// θέματα· αυτός εδώ φυλάει ότι δεν την παρακάμπτει κανείς.
//
// ── ΓΙΑΤΙ ΚΑΣΤΑΝΙΑ ΚΑΙ ΟΧΙ ΑΠΑΓΟΡΕΥΣΗ ────────────────────────────────────
// Μια μαζική αλλαγή 107 υψών και 72 χρωμάτων είναι ακριβώς το είδος που σπάει
// οθόνες χωρίς να το δει κανείς — και τα μισά από αυτά τα «ύψη» δεν είναι καν
// χειριστήρια (εικονίδια, πλακίδια, άβαταρ). Το υπάρχον χρέος επιτρέπεται, το
// ΝΕΟ όχι. Όταν καθαρίζεις, κατέβασε τα όρια στο scripts/surface-baseline.json.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const BASELINE = 'scripts/surface-baseline.json';

const files = execSync(
  "git ls-files 'app/**/*.tsx' 'app/**/*.ts' 'components/**/*.tsx' 'components/**/*.ts'",
  { encoding: 'utf8' },
).split('\n').filter(Boolean);

/** Ύψος γραμμένο ως αριθμός, στη ζώνη των χειριστηρίων (28 ώς 48). */
const RAW_HEIGHT = /\bheight:\s*(2[89]|3\d|4[0-8])\b/g;
/** Χρώμα γραμμένο ωμά. Το `color-mix` πάνω σε μεταβλητή θέματος επιτρέπεται. */
const RAW_RGBA = /\brgba?\(/g;

/**
 * ΤΟ ΕΝΑ ΣΗΜΕΙΟ ΟΠΟΥ ΤΑ ΩΜΑ ΧΡΩΜΑΤΑ ΕΙΝΑΙ ΣΩΣΤΑ: εκεί που ΟΡΙΖΟΝΤΑΙ. Το
 * `tokens.ts` και το `ink.ts` είναι η πηγή· αν τους απαγορεύαμε το rgba, δεν θα
 * υπήρχε πουθενά να γραφτεί το χρώμα. Το `pdfReport` τυπώνει σε χαρτί, όπου δεν
 * υπάρχει θέμα να ακολουθήσει.
 */
const COLOR_HOMES = [
  /^components\/tokens\.ts$/,
  /^lib\/print\/ink\.ts$/,
  /^lib\/pdf\//,
];

const heights = [];
const colors = [];

for (const file of files) {
  if (/\.test\.tsx?$/.test(file)) continue;
  const src = readFileSync(file, 'utf8');
  const homeForColor = COLOR_HOMES.some(re => re.test(file));
  src.split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;              // σχόλιο, όχι κώδικας
    for (const m of line.matchAll(RAW_HEIGHT)) heights.push({ file, line: i + 1, v: m[1] });
    if (!homeForColor) for (const m of line.matchAll(RAW_RGBA)) { void m; colors.push({ file, line: i + 1 }); }
  });
}

const found = { rawHeights: heights.length, rawColors: colors.length };
const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;

if (!base) {
  writeFileSync(BASELINE, JSON.stringify({ ...found, σημείωση: 'Πρώτη μέτρηση.' }, null, 2) + '\n');
  console.log(`✅ Καστάνια επιφάνειας: πρώτη μέτρηση γράφτηκε (${found.rawHeights} ύψη, ${found.rawColors} χρώματα).`);
  process.exit(0);
}

const fail = [];
if (found.rawHeights > base.rawHeights) {
  const byVal = {};
  for (const h of heights) (byVal[h.v] ||= []).push(h);
  fail.push(`ύψη γραμμένα ως αριθμός: ${found.rawHeights} > όριο ${base.rawHeights}`);
  for (const v of Object.keys(byVal).sort((a, b) => byVal[b].length - byVal[a].length).slice(0, 4)) {
    fail.push(`    height ${v} — ${byVal[v].length}×, π.χ. ${byVal[v][0].file}:${byVal[v][0].line}`);
  }
  fail.push('    Χρησιμοποίησε T.h.sm / T.h.md / T.h.lg: ανεβαίνουν στα 44 για το δάχτυλο.');
}
if (found.rawColors > base.rawColors) {
  fail.push(`χρώματα γραμμένα ωμά: ${found.rawColors} > όριο ${base.rawColors}`);
  fail.push(`    π.χ. ${colors[colors.length - 1].file}:${colors[colors.length - 1].line}`);
  fail.push('    Χρησιμοποίησε μεταβλητή θέματος: var(--…) ή color-mix πάνω σε αυτήν.');
}

if (fail.length) {
  console.error('🔴 Καστάνια επιφάνειας ΑΠΕΤΥΧΕ.\n');
  for (const f of fail) console.error('   ' + f);
  process.exit(1);
}

console.log(`✅ Καστάνια επιφάνειας πέρασε — ${found.rawHeights} ύψη ≤ ${base.rawHeights}, ${found.rawColors} χρώματα ≤ ${base.rawColors}.`);
for (const [k, label] of [['rawHeights', 'ύψη'], ['rawColors', 'χρώματα']]) {
  if (found[k] < base[k]) console.log(`   ↓ Βελτίωση κατά ${base[k] - found[k]} στα ${label}. Κατέβασε το "${k}" στο ${BASELINE} στο ${found[k]}.`);
}
