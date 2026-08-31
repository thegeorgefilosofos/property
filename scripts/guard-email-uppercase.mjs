#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΤΑ ΚΕΦΑΛΑΙΑ ΤΩΝ EMAIL ΔΕΝ ΚΡΑΤΟΥΝ ΤΟΝΟ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΕΒΛΕΠΕ Ο ΧΡΗΣΤΗΣ. Το send-reminders τρέχει με cron «0 6 * * *», δηλαδή
// κάθε πρωί. Ο ιδιοκτήτης άνοιγε την υπενθύμιση και η ταμπέλα πάνω από τον
// τίτλο έγραφε «ΛΗΞΙΠΡΌΘΕΣΜΟ ΕΝΟΊΚΙΟ». Το ίδιο κάθε Δευτέρα στις 07:00 με το
// «ΔΕΔΟΜΈΝΑ ΑΓΟΡΆΣ» και την 1η κάθε μήνα με το «ΜΗΝΙΑΊΑ ΚΑΤΆΣΤΑΣΗ».
//
// ΓΙΑΤΙ ΔΕΝ ΤΟ ΕΠΙΑΝΕ Ο ΥΠΑΡΧΩΝ ΦΥΛΑΚΑΣ. Ο guard-uppercase-tonos ψάχνει ΚΕΙΜΕΝΟ
// γραμμένο σε κεφαλαία μέσα στον κώδικα. Εδώ ο κώδικας γράφει πεζά· τα κεφαλαία
// τα φτιάχνει το `text-transform:uppercase` του CSS τη στιγμή της ανάγνωσης,
// κρατώντας τον τόνο. Το λεκτικό στην πηγή είναι άψογο· λάθος βγαίνει μόνο στο
// μάτι του παραλήπτη.
//
// Η λύση υπήρχε ήδη: το `grUp()` του _shared/emailTemplates.ts βγάζει τον τόνο
// κρατώντας τα διαλυτικά· το `eyebrow()` το εφαρμόζει. Εννέα edge functions
// έγραφαν δική τους ετικέτα και δεν περνούσαν από κει.
//
// ── ΤΙ ΕΛΕΓΧΕΙ ─────────────────────────────────────────────────────────────
// Σε κάθε αρχείο των edge functions, όποια γραμμή έχει
// `text-transform:uppercase` πρέπει να περνά το λεκτικό της από `grUp(` ή από
// `eyebrow(`. Ελληνικό κείμενο κάτω από `uppercase` χωρίς αυτά είναι τόνος σε
// κεφαλαίο, με βεβαιότητα.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'supabase/functions';
const files = [];
(function walk(dir) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full);
    else if (e.endsWith('.ts')) files.push(full);
  }
})(ROOT);

const GREEK = /[α-ωά-ώΑ-ΩΆ-Ώ]/;
const findings = [];
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  src.split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;   // τα σχόλια εξηγούν το σφάλμα, δεν το κάνουν
    if (!/text-transform:\s*uppercase/.test(line)) return;
    if (/\bgrUp\s*\(|\beyebrow\s*\(/.test(line)) return;
    if (!GREEK.test(line)) return;   // λατινικά κεφαλαία δεν έχουν τόνο
    findings.push(`${file}:${i + 1}  ${line.trim().slice(0, 96)}`);
  });
}

if (findings.length) {
  console.error(`\n✗ ${findings.length} ελληνικές ετικέτες email γίνονται κεφαλαία με τον τόνο τους:\n`);
  for (const f of findings) console.error('  ' + f);
  console.error(`
  Περασε το λεκτικό από \`grUp()\` του ${ROOT}/_shared/emailTemplates.ts, ή
  χρησιμοποίησε το \`eyebrow(text, color?)\` που το κάνει ήδη. Το CSS δεν βγάζει
  τον τόνο: το «Ληξιπρόθεσμο» γίνεται «ΛΗΞΙΠΡΌΘΕΣΜΟ» στο κινητό του παραλήπτη.`);
  process.exit(1);
}

console.log(`✓ καμία ελληνική ετικέτα email δεν κρατά τόνο στα κεφαλαία (${files.length} αρχεία)`);
